import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { Context } from "hono";
import { extname, join, resolve } from "node:path";
import { getCharacter } from "../shared/data/characters/index.js";
import {
  MAX_DOCUMENT_BYTES,
  putDataRequestSchema,
  type AppData,
} from "../shared/schema/index.js";
import {
  createDataStore,
  RevisionConflictError,
  StorageError,
  type DataStore,
} from "./storage.js";

export interface CreateAppOptions {
  dataDir?: string;
  staticDir?: string;
  store?: DataStore;
}

class RequestTooLargeError extends Error {}

export function createApp(options: CreateAppOptions = {}) {
  const store =
    options.store ??
    createDataStore({
      dataDir: options.dataDir ?? process.env.DATA_DIR ?? "/data",
    });
  const staticDir =
    options.staticDir ??
    resolve(fileURLToPath(new URL(".", import.meta.url)), "../../dist/client");
  const app = new Hono();

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.get("/api/data", async (context) => {
    context.header("Cache-Control", "no-store");
    try {
      const data = await store.get();
      return context.json(data);
    } catch (error) {
      return storageErrorResponse(context, error);
    }
  });

  app.put("/api/data", async (context) => {
    let request: ReturnType<typeof putDataRequestSchema.parse>;
    try {
      const body = await readJsonBody(context.req.raw);
      const parsed = putDataRequestSchema.safeParse(body);
      if (!parsed.success || !hasSupportedCharacters(parsed.data.data)) {
        return context.json({ error: "Invalid data document" }, 400);
      }
      request = parsed.data;
    } catch (error) {
      if (error instanceof RequestTooLargeError) {
        return context.json({ error: "Request body is too large" }, 413);
      }
      return context.json({ error: "Invalid JSON request" }, 400);
    }

    try {
      const result = await store.put(request.baseRevision, request.data);
      return context.json(result);
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        return context.json({ revision: error.revision }, 409);
      }
      return storageErrorResponse(context, error);
    }
  });

  app.use("*", async (context, next) => {
    if (isApiPath(context.req.path)) {
      return context.json({ error: "Not found" }, 404);
    }
    await next();
  });
  app.use("*", serveStatic({ root: staticDir }));

  app.get("*", async (context) => {
    if (isApiPath(context.req.path)) {
      return context.json({ error: "Not found" }, 404);
    }
    if (
      extname(context.req.path) !== "" ||
      isStaticAssetPath(context.req.path)
    ) {
      return context.text("Not found", 404);
    }

    try {
      const index = await readFile(join(staticDir, "index.html"), "utf8");
      return context.html(index);
    } catch {
      return context.text("Not found", 404);
    }
  });

  app.notFound((context) => {
    if (isApiPath(context.req.path)) {
      return context.json({ error: "Not found" }, 404);
    }
    return context.text("Not found", 404);
  });

  return app;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      Number.isSafeInteger(parsedLength) &&
      parsedLength > MAX_DOCUMENT_BYTES
    ) {
      throw new RequestTooLargeError();
    }
  }

  if (request.body === null) {
    return undefined;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      length += result.value.byteLength;
      if (length > MAX_DOCUMENT_BYTES) {
        await reader.cancel();
        throw new RequestTooLargeError();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Invalid JSON");
  }
}

function hasSupportedCharacters(data: AppData): boolean {
  return data.builds.every(
    (build) => getCharacter(build.characterId) !== undefined,
  );
}

function isApiPath(path: string): boolean {
  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return (
      path === "/api" || path.startsWith("/api/") || path.startsWith("/api%")
    );
  }
  return decodedPath === "/api" || decodedPath.startsWith("/api/");
}

function isStaticAssetPath(path: string): boolean {
  return ["/assets/", "/cards/", "/icons/"].some((prefix) =>
    path.startsWith(prefix),
  );
}

function storageErrorResponse(context: Context, error: unknown) {
  if (error instanceof StorageError && error.uncertain) {
    console.error("Application data save durability is uncertain", error);
  }
  return context.json({ error: "Stored data is unavailable" }, 500);
}
