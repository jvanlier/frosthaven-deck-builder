import { appDataSchema, type AppData } from "../../shared/schema/index.js";

export interface AppDataTransport {
  get(): Promise<AppData>;
  put(baseRevision: number, data: AppData): Promise<{ revision: number }>;
}

export class ConflictError extends Error {
  readonly revision: number;

  constructor(revision: number) {
    super("Application data changed on another device");
    this.name = "ConflictError";
    this.revision = revision;
  }
}

export function createFetchTransport(
  fetchImplementation: typeof fetch = fetch,
): AppDataTransport {
  return {
    async get() {
      const response = await fetchImplementation("/api/data", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Unable to load application data (${response.status})`);
      }
      return appDataSchema.parse(await response.json());
    },
    async put(baseRevision, data) {
      const response = await fetchImplementation("/api/data", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision, data }),
      });
      if (response.status === 409) {
        const body = await response.json().catch(() => undefined);
        if (isRevisionResponse(body)) {
          throw new ConflictError(body.revision);
        }
        throw new ConflictError(baseRevision + 1);
      }
      if (!response.ok) {
        throw new Error(`Unable to save application data (${response.status})`);
      }
      const body: unknown = await response.json();
      if (!isRevisionResponse(body)) {
        throw new Error("The server returned an invalid save response");
      }
      return body;
    },
  };
}

function isRevisionResponse(value: unknown): value is { revision: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "revision" in value &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0
  );
}
