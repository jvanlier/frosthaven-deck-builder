import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  createAppDataController,
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
