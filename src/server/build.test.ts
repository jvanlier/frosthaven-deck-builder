import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ServerTsConfig = {
  compilerOptions?: {
    outDir?: string;
    rootDir?: string;
  };
};

describe("server build layout", () => {
  it("keeps shared source compilable beside the server entrypoint", async () => {
    const config = JSON.parse(
      await readFile(resolve(process.cwd(), "tsconfig.server.json"), "utf8"),
    ) as ServerTsConfig;

    expect(config.compilerOptions).toMatchObject({
      outDir: "dist",
      rootDir: "src",
    });
  });
});
