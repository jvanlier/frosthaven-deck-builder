import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createBuild } from "../shared/builds.js";

it.each([false, true])(
  "npm run dev persists builds with a DATA_DIR override: %s",
  async (override) => {
    const directory = await mkdtemp(join(tmpdir(), "frosthaven-dev-"));
    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    const port = address.port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port) };
    delete env.DATA_DIR;
    if (override) env.DATA_DIR = join(directory, 'custom "data"');
    for (const path of [
      "package.json",
      "node_modules",
      "src",
      "vite.config.ts",
      "index.html",
      "tsconfig.json",
      "public",
    ]) {
      await symlink(join(process.cwd(), path), join(directory, path));
    }
    const child = spawn("npm", ["run", "dev"], {
      cwd: directory,
      env,
      detached: true,
      stdio: "ignore",
    });
    try {
      const url = `http://127.0.0.1:${port}/api/data`;
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          ready = (await fetch(url)).ok;
        } catch {
          // Wait for the disposable server to start.
        }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(ready).toBe(true);
      const initial = await (await fetch(url)).json();
      expect(initial).toEqual({ schemaVersion: 2, revision: 0, builds: [] });
      const data = {
        ...initial,
        builds: [
          createBuild({ characterId: "SD", name: "Dev smoke", startLevel: 1 }),
        ],
      };
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision: 0, data }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ revision: 1 });
      expect(await (await fetch(url)).json()).toEqual({ ...data, revision: 1 });
      const stored = JSON.parse(
        await readFile(
          join(directory, override ? 'custom "data"' : "data", "appdata.json"),
          "utf8",
        ),
      );
      expect(stored).toEqual({ ...data, revision: 1 });
    } finally {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
      await new Promise<void>((resolve) =>
        child.once("close", () => resolve()),
      );
      await rm(directory, { recursive: true, force: true });
    }
  },
  20_000,
);
