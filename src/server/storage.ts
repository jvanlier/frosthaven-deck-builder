import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getCharacter } from "../shared/data/characters/index.js";
import { appDataSchema, type AppData } from "../shared/schema/index.js";

export interface DataStoreFileSystem {
  mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<string | undefined>;
  readFile(path: string): Promise<Buffer>;
  copyFile?(sourcePath: string, destinationPath: string): Promise<void>;
  writeFile(
    path: string,
    data: string | Uint8Array,
    options?: { flag?: string; mode?: number },
  ): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  open(path: string, flags: string): Promise<FileHandle>;
}

export interface DataStoreOptions {
  dataDir: string;
  fs?: DataStoreFileSystem;
  now?: () => Date;
}

export interface DataStore {
  get(): Promise<AppData>;
  put(baseRevision: number, data: AppData): Promise<{ revision: number }>;
}

export class StorageError extends Error {
  readonly uncertain: boolean;

  constructor(
    message: string,
    options?: { cause?: unknown; uncertain?: boolean },
  ) {
    super(message, options);
    this.name = "StorageError";
    this.uncertain = options?.uncertain ?? false;
  }
}

export class RevisionConflictError extends Error {
  readonly revision: number;

  constructor(revision: number) {
    super("The stored data has a newer revision");
    this.name = "RevisionConflictError";
    this.revision = revision;
  }
}

const EMPTY_DATA: AppData = {
  schemaVersion: 1,
  revision: 0,
  builds: [],
};
const BACKUP_PATTERN = /^appdata-(.+)-r(\d+)(?:-\d+)?\.json$/;
const MAX_BACKUPS = 20;
const dataStoreQueues = new Map<string, Promise<void>>();

export function createDataStore(options: DataStoreOptions): DataStore {
  return new FileDataStore(options);
}

class FileDataStore implements DataStore {
  private readonly dataDir: string;
  private readonly backupsDir: string;
  private readonly fileSystem: DataStoreFileSystem;
  private readonly now: () => Date;
  private readonly queueKey: string;

  constructor(options: DataStoreOptions) {
    this.dataDir = options.dataDir;
    this.queueKey = resolve(options.dataDir);
    this.backupsDir = join(options.dataDir, "backups");
    this.fileSystem = options.fs ?? nodeFs;
    this.now = options.now ?? (() => new Date());
  }

  get(): Promise<AppData> {
    return this.serialized(async () => (await this.readCurrent()).data);
  }

  put(baseRevision: number, data: AppData): Promise<{ revision: number }> {
    return this.serialized(() => this.writeRevision(baseRevision, data));
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = dataStoreQueues.get(this.queueKey) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    dataStoreQueues.set(this.queueKey, settled);
    void settled.then(() => {
      if (dataStoreQueues.get(this.queueKey) === settled) {
        dataStoreQueues.delete(this.queueKey);
      }
    });
    return result;
  }

  private async writeRevision(
    baseRevision: number,
    candidate: AppData,
  ): Promise<{ revision: number }> {
    const current = await this.readCurrent();
    if (baseRevision !== current.data.revision) {
      throw new RevisionConflictError(current.data.revision);
    }

    const parsedCandidate = appDataSchema.safeParse(candidate);
    if (
      !parsedCandidate.success ||
      !hasSupportedCharacters(parsedCandidate.data)
    ) {
      throw new StorageError("The data document is invalid");
    }

    const revision = current.data.revision + 1;
    if (!Number.isSafeInteger(revision)) {
      throw new StorageError("The data revision cannot be incremented safely");
    }
    const nextData = appDataSchema.parse({
      ...parsedCandidate.data,
      revision,
    });
    const serialized = Buffer.from(JSON.stringify(nextData));

    try {
      await this.fileSystem.mkdir(this.dataDir, { recursive: true });
      if (current.exists) {
        await this.createBackup(current.raw);
      }
      await this.pruneBackups();
      await this.replaceCurrent(serialized);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError("Unable to save application data", {
        cause: error,
      });
    }

    return { revision };
  }

  private async readCurrent(): Promise<{
    data: AppData;
    raw: Buffer;
    exists: boolean;
  }> {
    const path = join(this.dataDir, "appdata.json");
    let raw: Buffer;
    try {
      raw = await this.fileSystem.readFile(path);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        return { data: cloneEmptyData(), raw: Buffer.alloc(0), exists: false };
      }
      throw new StorageError("Stored data is unavailable", { cause: error });
    }

    try {
      const parsed = appDataSchema.parse(JSON.parse(raw.toString("utf8")));
      if (!hasSupportedCharacters(parsed)) {
        throw new Error("Unsupported character");
      }
      return { data: parsed, raw, exists: true };
    } catch (error) {
      throw new StorageError("Stored data is unavailable", { cause: error });
    }
  }

  private async createBackup(raw: Buffer): Promise<void> {
    try {
      await this.fileSystem.mkdir(this.backupsDir, { recursive: true });
      const baseName = `appdata-${backupTimestamp(this.now())}`;
      const backupPath = await this.availableBackupPath(baseName, raw);
      if (backupPath.reused) {
        return;
      }

      const temporaryPath = join(
        this.backupsDir,
        `.${backupPath.name}.${randomUUID()}.tmp`,
      );
      let renamed = false;
      try {
        if (this.fileSystem.copyFile) {
          await this.fileSystem.copyFile(
            join(this.dataDir, "appdata.json"),
            temporaryPath,
          );
        } else {
          await this.fileSystem.writeFile(temporaryPath, raw, {
            flag: "wx",
            mode: 0o600,
          });
        }
        await syncFile(this.fileSystem, temporaryPath);
        await this.fileSystem.rename(temporaryPath, backupPath.path);
        renamed = true;
        await syncDirectory(this.fileSystem, this.backupsDir);
      } catch (error) {
        if (!renamed) {
          await removeIfPresent(this.fileSystem, temporaryPath);
        }
        throw new StorageError("Unable to create the data backup", {
          cause: error,
        });
      }
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError("Unable to create the data backup", {
        cause: error,
      });
    }
  }

  private async availableBackupPath(
    baseName: string,
    raw: Buffer,
  ): Promise<{ name: string; path: string; reused: boolean }> {
    for (let suffix = 0; ; suffix += 1) {
      const name = `${baseName}-r${this.currentRevisionFromRaw(raw)}${suffix ? `-${suffix}` : ""}.json`;
      const path = join(this.backupsDir, name);
      try {
        const existing = await this.fileSystem.readFile(path);
        if (existing.equals(raw)) {
          return { name, path, reused: true };
        }
      } catch (error) {
        if (!isNodeError(error, "ENOENT")) {
          throw new StorageError("Unable to inspect the data backup", {
            cause: error,
          });
        }
        return { name, path, reused: false };
      }
    }
  }

  private currentRevisionFromRaw(raw: Buffer): number {
    try {
      const parsed = JSON.parse(raw.toString("utf8")) as { revision?: unknown };
      return typeof parsed.revision === "number" &&
        Number.isSafeInteger(parsed.revision)
        ? parsed.revision
        : 0;
    } catch {
      return 0;
    }
  }

  private async pruneBackups(): Promise<void> {
    let names: string[];
    try {
      names = await this.fileSystem.readdir(this.backupsDir);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        return;
      }
      throw new StorageError("Unable to inspect data backups", {
        cause: error,
      });
    }

    const backups = names
      .map((name) => {
        const match = BACKUP_PATTERN.exec(name);
        if (!match) {
          return undefined;
        }
        return {
          name,
          timestamp: match[1]!,
          revision: Number(match[2]),
        };
      })
      .filter(
        (
          backup,
        ): backup is { name: string; timestamp: string; revision: number } =>
          backup !== undefined,
      )
      .sort(
        (left, right) =>
          left.revision - right.revision ||
          left.timestamp.localeCompare(right.timestamp) ||
          left.name.localeCompare(right.name),
      );

    const stale = backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS));
    try {
      await Promise.all(
        stale.map((backup) =>
          this.fileSystem.unlink(join(this.backupsDir, backup.name)),
        ),
      );
      if (stale.length > 0) {
        await syncDirectory(this.fileSystem, this.backupsDir);
      }
    } catch (error) {
      throw new StorageError("Unable to prune data backups", { cause: error });
    }
  }

  private async replaceCurrent(serialized: Buffer): Promise<void> {
    const path = join(this.dataDir, "appdata.json");
    const temporaryPath = join(
      this.dataDir,
      `.appdata.json.${randomUUID()}.tmp`,
    );
    let renamed = false;
    try {
      await this.fileSystem.writeFile(temporaryPath, serialized, {
        flag: "wx",
        mode: 0o600,
      });
      await syncFile(this.fileSystem, temporaryPath);
      await this.fileSystem.rename(temporaryPath, path);
      renamed = true;
      try {
        await syncDirectory(this.fileSystem, this.dataDir);
      } catch (error) {
        throw new StorageError("Data save durability is uncertain", {
          cause: error,
          uncertain: true,
        });
      }
    } catch (error) {
      if (!renamed) {
        await removeIfPresent(this.fileSystem, temporaryPath);
      }
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError("Unable to save application data", {
        cause: error,
      });
    }
  }
}

function cloneEmptyData(): AppData {
  return { ...EMPTY_DATA, builds: [] };
}

function hasSupportedCharacters(data: AppData): boolean {
  return data.builds.every(
    (build) => getCharacter(build.characterId) !== undefined,
  );
}

function backupTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function syncFile(
  fileSystem: DataStoreFileSystem,
  path: string,
): Promise<void> {
  await withFileHandle(fileSystem, path, async (handle) => {
    await handle.sync();
  });
}

async function syncDirectory(
  fileSystem: DataStoreFileSystem,
  path: string,
): Promise<void> {
  try {
    await withFileHandle(fileSystem, path, async (handle) => {
      await handle.sync();
    });
  } catch (error) {
    if (
      isNodeError(error, "EINVAL") ||
      isNodeError(error, "ENOTSUP") ||
      isNodeError(error, "EOPNOTSUPP")
    ) {
      return;
    }
    throw error;
  }
}

async function withFileHandle<T>(
  fileSystem: DataStoreFileSystem,
  path: string,
  operation: (handle: FileHandle) => Promise<T>,
): Promise<T> {
  const handle = await fileSystem.open(path, "r");
  let result: T | undefined;
  let failure: unknown;
  try {
    result = await operation(handle);
  } catch (error) {
    failure = error;
  }
  try {
    await handle.close();
  } catch (error) {
    failure ??= error;
  }
  if (failure !== undefined) {
    throw failure;
  }
  return result as T;
}

async function removeIfPresent(
  fileSystem: DataStoreFileSystem,
  path: string,
): Promise<void> {
  try {
    await fileSystem.unlink(path);
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) {
      throw error;
    }
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
