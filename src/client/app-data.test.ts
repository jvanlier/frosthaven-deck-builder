import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  ImportDataError,
  PendingChangesError,
  createAppDataController,
  parseImportFile,
  preventUnloadIfPending,
  type AppDataTransport,
} from "./app-data";
import { createBuild } from "../shared/builds";
import { MAX_DOCUMENT_BYTES, type AppData } from "../shared/schema";

const buildA = createBuild(
  { characterId: "SD", name: "Freeze control", startLevel: 1 },
  {
    id: () => "123e4567-e89b-42d3-a456-426614174000",
    now: () => "2024-01-02T03:04:05.000Z",
  },
);
const buildB = { ...buildA, name: "Cold control" };
const emptyData: AppData = {
  schemaVersion: 1,
  revision: 0,
  builds: [],
};

function transportWith(
  overrides: Partial<AppDataTransport> = {},
): AppDataTransport {
  return {
    get: vi.fn(async () => emptyData),
    put: vi.fn(async () => ({ revision: 1 })),
    ...overrides,
  };
}

describe("app data save controller", () => {
  it("reports an initial-load failure and retries it explicitly", async () => {
    const transport = transportWith({
      get: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue(emptyData),
    });
    const controller = createAppDataController(transport);

    await expect(controller.load()).rejects.toThrow("offline");
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      canMutate: false,
      data: null,
    });
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({
      status: "saved",
      canMutate: true,
      data: emptyData,
    });
  });

  it("debounces changes and saves the latest immutable snapshot", async () => {
    vi.useFakeTimers();
    const transport = transportWith();
    const controller = createAppDataController(transport, {
      debounceMs: 1000,
    });

    await controller.load();
    controller.updateData((data) => data);
    expect(transport.put).not.toHaveBeenCalled();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));
    expect(transport.put).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(transport.put).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(transport.put).toHaveBeenCalledTimes(1));
    expect(transport.put).toHaveBeenCalledWith(0, {
      ...emptyData,
      builds: [buildA],
    });
    expect(controller.getSnapshot().status).toBe("saved");
    vi.useRealTimers();
  });

  it("queues edits made while a request is in flight using the acknowledged revision", async () => {
    vi.useFakeTimers();
    const deferred: Array<(value: { revision: number }) => void> = [];
    const transport = transportWith({
      put: vi.fn(
        () =>
          new Promise<{ revision: number }>((resolve) => {
            deferred.push(resolve);
          }),
      ),
    });
    const controller = createAppDataController(transport, {
      debounceMs: 1000,
    });
    await controller.load();

    controller.updateData((data) => ({ ...data, builds: [buildA] }));
    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(transport.put).toHaveBeenCalledTimes(1));

    controller.updateData((data) => ({ ...data, builds: [buildB] }));
    deferred[0]!({ revision: 1 });
    await vi.waitFor(() => expect(transport.put).toHaveBeenCalledTimes(2));
    expect(controller.getSnapshot().status).toBe("saving");
    expect(transport.put).toHaveBeenLastCalledWith(1, {
      ...emptyData,
      revision: 0,
      builds: [buildB],
    });
    deferred[1]!({ revision: 2 });
    await vi.waitFor(() =>
      expect(controller.getSnapshot().status).toBe("saved"),
    );
    vi.useRealTimers();
  });

  it("does not retry a queued timer after an in-flight save fails", async () => {
    vi.useFakeTimers();
    const deferred: Array<{
      reject: (cause: Error) => void;
    }> = [];
    const transport = transportWith({
      put: vi.fn(
        () =>
          new Promise<{ revision: number }>((_, reject) => {
            deferred.push({ reject });
          }),
      ),
    });
    const controller = createAppDataController(transport, {
      debounceMs: 1000,
    });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));
    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(transport.put).toHaveBeenCalledTimes(1));
    controller.updateData((data) => ({ ...data, builds: [buildB] }));

    deferred[0]!.reject(new Error("offline"));
    await expect(controller.flush()).rejects.toThrow("offline");
    vi.advanceTimersByTime(1000);
    expect(transport.put).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("pauses mutation after a failed save and retries without discarding pending data", async () => {
    const failure = new Error("offline");
    const transport = transportWith({
      put: vi
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValue({ revision: 1 }),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();

    controller.updateData((data) => ({ ...data, builds: [buildA] }));
    await controller.flush().catch(() => undefined);
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      canMutate: false,
      hasPendingChanges: true,
    });

    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({
      status: "saved",
      canMutate: true,
      hasPendingChanges: false,
    });
  });

  it("keeps an unacknowledged save pending until stale retry reaches conflict", async () => {
    const transport = transportWith({
      put: vi
        .fn()
        .mockRejectedValueOnce(new Error("response lost"))
        .mockRejectedValueOnce(new ConflictError(1)),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));

    await expect(controller.flush()).rejects.toThrow("response lost");
    await expect(controller.retry()).rejects.toBeInstanceOf(ConflictError);
    expect(controller.getSnapshot()).toMatchObject({
      status: "conflict",
      canMutate: false,
      hasPendingChanges: true,
    });
    expect(transport.put).toHaveBeenCalledTimes(2);
  });

  it("keeps the visible document while a replacement is pending and recovers on retry", async () => {
    const imported = { ...emptyData, revision: 99, builds: [buildA] };
    const transport = transportWith({
      put: vi
        .fn()
        .mockRejectedValueOnce(new Error("disk unavailable"))
        .mockResolvedValueOnce({ revision: 1 }),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();

    await expect(controller.replaceData(imported)).rejects.toThrow(
      "disk unavailable",
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      data: emptyData,
      hasPendingChanges: true,
      canMutate: false,
    });
    expect(controller.getPendingData()).toEqual(imported);

    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({
      status: "saved",
      data: { revision: 1, builds: [buildA] },
      hasPendingChanges: false,
    });
  });

  it("warns only when the browser has pending data", () => {
    const preventDefault = vi.fn();
    const event = {
      preventDefault,
      returnValue: "",
    } as unknown as BeforeUnloadEvent;
    preventUnloadIfPending(event, false);
    expect(preventDefault).not.toHaveBeenCalled();
    preventUnloadIfPending(event, true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");
  });

  it("downloads the current pending document without changing it", async () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const link = { click, href: "", download: "" };
    const createObjectURL = vi.fn(() => "blob:pending");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", { createElement: () => link });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const transport = transportWith();
    const controller = createAppDataController(transport, {
      debounceMs: 60_000,
    });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));

    controller.downloadPendingData();
    expect(link).toMatchObject({
      href: "blob:pending",
      download: "frosthaven-deck-builder-pending.json",
    });
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pending");
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("flushes pending changes before downloading an official export", async () => {
    const click = vi.fn();
    const link = { click, href: "", download: "" };
    const createObjectURL = vi.fn(() => "blob:export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", { createElement: () => link });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const transport = transportWith({
      put: vi.fn(async () => ({ revision: 8 })),
    });
    const controller = createAppDataController(transport, {
      debounceMs: 60_000,
    });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));

    await controller.downloadData();

    expect(transport.put).toHaveBeenCalledWith(0, {
      ...emptyData,
      builds: [buildA],
    });
    expect(link).toMatchObject({
      href: "blob:export",
      download: "frosthaven-deck-builder-backup.json",
    });
    const exported = (
      createObjectURL.mock.calls as unknown as Array<[Blob]>
    )[0]?.[0];
    expect(exported).toBeDefined();
    expect(await exported!.text()).toMatch(/\"revision\": 8/);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
    vi.unstubAllGlobals();
  });

  it("does not download an export when pending data cannot be saved", async () => {
    const createObjectURL = vi.fn(() => "blob:export");
    vi.stubGlobal("document", { createElement: vi.fn() });
    vi.stubGlobal("URL", { createObjectURL });
    const transport = transportWith({
      put: vi.fn().mockRejectedValue(new Error("disk unavailable")),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));

    await expect(controller.downloadData()).rejects.toThrow("disk unavailable");
    expect(createObjectURL).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("uses the acknowledged server revision when replacing imported data", async () => {
    const transport = transportWith({
      get: vi.fn(async () => ({ ...emptyData, revision: 7 })),
      put: vi.fn(async () => ({ revision: 8 })),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();
    const imported = { ...emptyData, revision: 999, builds: [buildA] };

    await controller.replaceData(imported);

    expect(transport.put).toHaveBeenCalledWith(7, imported);
    expect(controller.getSnapshot().data).toMatchObject({
      revision: 8,
      builds: [buildA],
    });
  });

  it("keeps a staged import for retry when an earlier pending save fails", async () => {
    const imported = { ...emptyData, revision: 99, builds: [buildB] };
    const transport = transportWith({
      put: vi
        .fn()
        .mockRejectedValueOnce(new Error("disk unavailable"))
        .mockResolvedValueOnce({ revision: 1 })
        .mockResolvedValueOnce({ revision: 2 }),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));

    await expect(controller.replaceData(imported)).rejects.toThrow(
      "disk unavailable",
    );
    expect(controller.getSnapshot().data).toMatchObject({ builds: [buildA] });
    expect(controller.getPendingData()).toMatchObject({
      revision: 99,
      builds: [buildB],
    });

    await controller.retry();
    expect(transport.put).toHaveBeenNthCalledWith(2, 0, {
      ...emptyData,
      builds: [buildA],
    });
    expect(transport.put).toHaveBeenNthCalledWith(3, 1, imported);
    expect(controller.getSnapshot()).toMatchObject({
      status: "saved",
      data: { revision: 2, builds: [buildB] },
      hasPendingChanges: false,
    });
  });

  it("validates imports before replacement, including size and supported characters", async () => {
    await expect(
      parseImportFile(new Blob(["not json"])),
    ).rejects.toBeInstanceOf(ImportDataError);
    await expect(
      parseImportFile(
        new Blob([
          JSON.stringify({
            ...emptyData,
            builds: [{ ...buildA, characterId: "unsupported" }],
          }),
        ]),
      ),
    ).rejects.toThrow(/unsupported character/i);
    const oversized = {
      size: MAX_DOCUMENT_BYTES + 1,
      arrayBuffer: vi.fn(),
    } as unknown as Blob;
    await expect(parseImportFile(oversized)).rejects.toThrow(/1 MiB/i);
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();

    await expect(
      parseImportFile(
        new Blob([JSON.stringify({ ...emptyData, revision: 44 })]),
      ),
    ).resolves.toMatchObject({ revision: 44 });
  });

  it("does not let load discard pending changes after a conflict", async () => {
    const transport = transportWith({
      put: vi.fn().mockRejectedValue(new ConflictError(4)),
      get: vi.fn(async () => ({ ...emptyData, revision: 4 })),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));
    await expect(controller.flush()).rejects.toBeInstanceOf(ConflictError);

    await expect(controller.load()).rejects.toBeInstanceOf(PendingChangesError);
    expect(controller.getPendingData()).toMatchObject({ builds: [buildA] });
    expect(transport.get).toHaveBeenCalledOnce();
  });

  it("waits for an active save before explicitly reloading", async () => {
    const deferred: Array<(value: { revision: number }) => void> = [];
    const transport = transportWith({
      get: vi
        .fn()
        .mockResolvedValueOnce(emptyData)
        .mockResolvedValueOnce({ ...emptyData, revision: 1, builds: [buildA] }),
      put: vi.fn(
        () =>
          new Promise<{ revision: number }>((resolve) => {
            deferred.push(resolve);
          }),
      ),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));
    const save = controller.flush();
    await vi.waitFor(() => expect(transport.put).toHaveBeenCalledOnce());

    const reload = controller.reload({ discardPending: true });
    await Promise.resolve();
    expect(transport.get).toHaveBeenCalledOnce();

    deferred[0]!({ revision: 1 });
    await expect(save).resolves.toBeUndefined();
    await expect(reload).resolves.toBeUndefined();
    expect(transport.get).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().data).toMatchObject({
      revision: 1,
      builds: [buildA],
    });
  });

  it("rejects concurrent replacements and pauses edits while flushing", async () => {
    const deferred: Array<(value: { revision: number }) => void> = [];
    const transport = transportWith({
      put: vi.fn(
        () =>
          new Promise<{ revision: number }>((resolve) => {
            deferred.push(resolve);
          }),
      ),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();
    controller.updateData((data) => ({ ...data, builds: [buildA] }));

    const first = controller.replaceData({ ...emptyData, builds: [buildB] });
    const second = controller.replaceData({ ...emptyData, builds: [buildA] });
    expect(controller.getSnapshot().canMutate).toBe(false);
    controller.updateData((data) => ({
      ...data,
      builds: [{ ...buildA, name: "Ignored edit" }],
    }));
    expect(controller.getPendingData()).toMatchObject({ builds: [buildB] });
    await expect(second).rejects.toThrow(/replacement/i);

    await vi.waitFor(() => expect(transport.put).toHaveBeenCalledOnce());
    deferred[0]!({ revision: 1 });
    await vi.waitFor(() => expect(transport.put).toHaveBeenCalledTimes(2));
    deferred[1]!({ revision: 2 });
    await expect(first).resolves.toBeUndefined();
    expect(controller.getSnapshot().data).toMatchObject({
      revision: 2,
      builds: [buildB],
    });
  });

  it("surfaces conflicts and requires explicit reload", async () => {
    const transport = transportWith({
      put: vi.fn().mockRejectedValue(new ConflictError(4)),
      get: vi.fn(async () => ({ ...emptyData, revision: 4 })),
    });
    const controller = createAppDataController(transport, { debounceMs: 0 });
    await controller.load();
    controller.updateData((data) => ({ ...data, revision: 0 }));
    await expect(controller.flush()).rejects.toBeInstanceOf(ConflictError);
    expect(controller.getSnapshot()).toMatchObject({
      status: "conflict",
      canMutate: false,
      hasPendingChanges: true,
    });
    await expect(controller.reload()).rejects.toThrow(/pending/i);
    await controller.reload({ discardPending: true });
    expect(controller.getSnapshot()).toMatchObject({
      status: "saved",
      canMutate: true,
      hasPendingChanges: false,
      data: { revision: 4 },
    });
  });
});
