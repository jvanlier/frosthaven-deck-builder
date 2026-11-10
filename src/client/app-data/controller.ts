import { appDataSchema, type AppData } from "../../shared/schema/index.js";
import { downloadDocument, parseImportData } from "./backup-files";
import {
  ConflictError,
  createFetchTransport,
  type AppDataTransport,
} from "./transport";

export type AppDataStatus =
  "loading" | "saved" | "saving" | "error" | "conflict";

export class PendingChangesError extends Error {
  constructor() {
    super("Pending changes must be resolved before reloading");
    this.name = "PendingChangesError";
  }
}

export interface AppDataSnapshot {
  data: AppData | null;
  status: AppDataStatus;
  canMutate: boolean;
  hasPendingChanges: boolean;
  error: Error | null;
}

export interface AppDataController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppDataSnapshot;
  load(): Promise<void>;
  updateData(updater: (data: AppData) => AppData): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  reload(options?: { discardPending?: boolean }): Promise<void>;
  replaceData(candidate: AppData): Promise<void>;
  getPendingData(): AppData | null;
  downloadData(): Promise<void>;
  downloadPendingData(): void;
}

interface ControllerOptions {
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 1000;

export function createAppDataController(
  transport: AppDataTransport = createFetchTransport(),
  options: ControllerOptions = {},
): AppDataController {
  const listeners = new Set<() => void>();
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let currentData: AppData | null = null;
  let acknowledgedRevision = 0;
  let dirty = false;
  let replacement: AppData | null = null;
  let stagedReplacement: AppData | null = null;
  let status: AppDataStatus = "loading";
  let error: Error | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loading: Promise<void> | undefined;
  let inFlight: Promise<void> | undefined;
  let replacementOperation: Promise<void> | undefined;
  let mutationPaused = false;
  let snapshot: AppDataSnapshot = makeSnapshot();

  function makeSnapshot(): AppDataSnapshot {
    const pending =
      replacement !== null ||
      stagedReplacement !== null ||
      dirty ||
      replacementOperation !== undefined;
    return {
      data: currentData,
      status,
      canMutate:
        currentData !== null &&
        status !== "loading" &&
        status !== "error" &&
        status !== "conflict" &&
        replacement === null &&
        stagedReplacement === null &&
        !mutationPaused,
      hasPendingChanges: pending,
      error,
    };
  }

  function publish(
    nextStatus: AppDataStatus = status,
    nextError = error,
  ): void {
    status = nextStatus;
    error = nextError;
    snapshot = makeSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function schedule(delay = debounceMs): void {
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void saveNow().catch(() => undefined);
    }, delay);
  }

  async function saveNow(): Promise<void> {
    if (
      inFlight ||
      isPausedStatus(status) ||
      (!dirty && replacement === null) ||
      currentData === null
    ) {
      return inFlight ?? Promise.resolve();
    }

    const candidate = replacement ?? currentData;
    const sentData = candidate;
    const sentReplacement = replacement;
    const baseRevision = acknowledgedRevision;
    publish("saving", null);

    const request = transport
      .put(baseRevision, candidate)
      .then((result) => {
        acknowledgedRevision = result.revision;
        if (sentReplacement !== null) {
          if (replacement === sentReplacement) {
            replacement = null;
            currentData = { ...sentData, revision: result.revision };
            dirty = false;
          }
        } else if (currentData === sentData) {
          currentData = { ...sentData, revision: result.revision };
          dirty = false;
        }
        publish("saved", null);
        if (dirty || replacement !== null) {
          schedule(0);
        }
      })
      .catch((cause: unknown) => {
        clearTimer();
        const failure = asError(cause);
        publish(
          failure instanceof ConflictError ? "conflict" : "error",
          failure,
        );
        throw failure;
      });

    inFlight = request;
    try {
      await request;
    } finally {
      if (inFlight === request) {
        inFlight = undefined;
      }
    }
  }

  async function load(): Promise<void> {
    if (
      replacement !== null ||
      stagedReplacement !== null ||
      dirty ||
      replacementOperation !== undefined
    ) {
      throw new PendingChangesError();
    }
    if (currentData !== null && status !== "error" && status !== "conflict") {
      return;
    }
    if (loading) {
      return loading;
    }

    clearTimer();
    publish("loading", null);
    loading = transport
      .get()
      .then((loaded) => {
        currentData = parseData(loaded);
        acknowledgedRevision = currentData.revision;
        dirty = false;
        replacement = null;
        publish("saved", null);
      })
      .catch((cause: unknown) => {
        const failure = asError(cause);
        publish("error", failure);
        throw failure;
      })
      .finally(() => {
        loading = undefined;
      });
    return loading;
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (isPausedStatus(status)) {
      throw error ?? new Error("Application data cannot be saved");
    }
    if (currentData === null) {
      await load();
    }

    while (true) {
      if (inFlight) {
        await inFlight;
      }
      if (isPausedStatus(status)) {
        throw error ?? new Error("Application data cannot be saved");
      }
      if (!dirty && replacement === null) {
        return;
      }
      await saveNow();
    }
  }

  async function promoteStagedReplacement(): Promise<void> {
    if (stagedReplacement === null) {
      return;
    }
    replacement = stagedReplacement;
    stagedReplacement = null;
    publish("saving", null);
    await saveNow();
  }

  async function retry(): Promise<void> {
    if (status === "conflict") {
      throw error ?? new ConflictError(acknowledgedRevision);
    }
    if (status !== "error") {
      return;
    }
    error = null;
    publish("saved", null);
    await flush();
    await promoteStagedReplacement();
  }

  async function reload(
    options: { discardPending?: boolean } = {},
  ): Promise<void> {
    if (snapshot.hasPendingChanges && !options.discardPending) {
      throw new PendingChangesError();
    }

    clearTimer();
    mutationPaused = true;
    publish("loading", null);
    const activeOperation = replacementOperation;
    if (activeOperation) {
      try {
        await activeOperation;
      } catch (cause) {
        if (!options.discardPending) {
          mutationPaused = false;
          publish(status, error);
          throw cause;
        }
      }
      mutationPaused = true;
      publish("loading", null);
    }
    const activeRequest = inFlight;
    if (activeRequest) {
      try {
        await activeRequest;
      } catch (cause) {
        if (!options.discardPending) {
          mutationPaused = false;
          publish(status, error);
          throw cause;
        }
      }
    }

    dirty = false;
    replacement = null;
    stagedReplacement = null;
    currentData = null;
    try {
      await load();
    } finally {
      mutationPaused = false;
      publish(status, error);
    }
  }

  async function replaceData(candidate: AppData): Promise<void> {
    const parsed = parseImportData(candidate);
    if (
      replacementOperation ||
      replacement !== null ||
      stagedReplacement !== null
    ) {
      throw new Error("A data replacement is already in progress");
    }
    if (isPausedStatus(status)) {
      throw error ?? new Error("Application data cannot be saved");
    }
    if (currentData === null) {
      await load();
    }

    mutationPaused = true;
    publish(status, null);
    const operation = (async () => {
      stagedReplacement = parsed;
      publish(status, null);
      await flush();
      if (currentData === null) {
        throw new Error("Application data has not loaded");
      }
      await promoteStagedReplacement();
    })();
    replacementOperation = operation;
    try {
      await operation;
    } finally {
      if (replacementOperation === operation) {
        replacementOperation = undefined;
        mutationPaused = false;
        publish(status, error);
      }
    }
  }

  function updateData(updater: (data: AppData) => AppData): void {
    if (!snapshot.canMutate || currentData === null) {
      return;
    }
    const next = parseData(updater(currentData));
    if (
      next === currentData ||
      JSON.stringify(next) === JSON.stringify(currentData)
    ) {
      return;
    }
    currentData = next;
    dirty = true;
    publish(status, null);
    schedule();
  }

  function getPendingData(): AppData | null {
    return replacement ?? stagedReplacement ?? (dirty ? currentData : null);
  }

  async function downloadData(): Promise<void> {
    await flush();
    if (currentData === null) {
      throw new Error("Application data has not loaded");
    }
    downloadDocument(currentData, "frosthaven-deck-builder-backup.json");
  }

  function downloadPendingData(): void {
    const data = getPendingData();
    if (data === null) {
      return;
    }
    downloadDocument(data, "frosthaven-deck-builder-pending.json");
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    load,
    updateData,
    flush,
    retry,
    reload,
    replaceData,
    getPendingData,
    downloadData,
    downloadPendingData,
  };
}

function parseData(value: unknown): AppData {
  return appDataSchema.parse(value);
}

function isPausedStatus(value: AppDataStatus): value is "error" | "conflict" {
  return value === "error" || value === "conflict";
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
