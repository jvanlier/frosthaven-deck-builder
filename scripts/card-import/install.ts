import { dirname, join } from "node:path";
import { createOutputFiles } from "./outputs";
import type { ImportFileSystem, ImportPlan, SourceManifest } from "./types";

interface InstalledFileState {
  target: string;
  backup: string;
  hadPreviousFile: boolean;
  installed: boolean;
}

export async function commitOutputs(
  projectRoot: string,
  plan: ImportPlan,
  manifest: SourceManifest,
  assetBytes: ReadonlyMap<string, Uint8Array>,
  iconBytes: Uint8Array,
  fileSystem: ImportFileSystem,
): Promise<void> {
  const generatedFiles = createOutputFiles(
    plan,
    manifest,
    assetBytes,
    iconBytes,
  );

  const stagingDirectory = await fileSystem.mkdtemp(
    join(projectRoot, ".import-cards-"),
  );
  const fileStates: InstalledFileState[] = [];
  let committed = false;
  try {
    for (const [index, file] of generatedFiles.entries()) {
      const stagedPath = join(stagingDirectory, file.relativePath);
      await fileSystem.mkdir(dirname(stagedPath), { recursive: true });
      await fileSystem.writeFile(stagedPath, file.contents);

      const target = join(projectRoot, file.relativePath);
      await fileSystem.mkdir(dirname(target), { recursive: true });
      const backup = join(stagingDirectory, ".backups", `${index}.bak`);
      const state: InstalledFileState = {
        target,
        backup,
        hadPreviousFile: false,
        installed: false,
      };
      fileStates.push(state);
      try {
        await fileSystem.mkdir(dirname(backup), { recursive: true });
        await fileSystem.rename(target, backup);
        state.hadPreviousFile = true;
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }

      await fileSystem.rename(stagedPath, target);
      state.installed = true;
    }
    committed = true;
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const state of [...fileStates].reverse()) {
      if (state.installed) {
        try {
          await fileSystem.rm(state.target, { force: true });
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (state.hadPreviousFile) {
        try {
          await fileSystem.rename(state.backup, state.target);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `Import failed and rollback incomplete; staging directory retained at ${stagingDirectory}. ${rollbackErrors.map(formatError).join("; ")}`,
        { cause: error },
      );
    }
    try {
      await fileSystem.rm(stagingDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new Error(
        `Import failed; rollback completed but staging directory retained at ${stagingDirectory}: ${formatError(cleanupError)}`,
        { cause: error },
      );
    }
    throw error;
  }

  if (committed) {
    await fileSystem.rm(stagingDirectory, { recursive: true, force: true });
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
