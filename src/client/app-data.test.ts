import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  createAppDataController,
  preventUnloadIfPending,
  type AppDataTransport,
} from "./app-data";
import { createBuild } from "../shared/builds";
import type { AppData } from "../shared/schema";

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
