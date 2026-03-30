import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function createSessionTempDirectory(baseRoot: string): Promise<string> {
  await ensureDirectory(baseRoot);
  return await mkdtemp(join(baseRoot, "session-"));
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function removePath(path: string): Promise<void> {
  await rm(path, {
    force: true,
    recursive: true
  });
}

export function defaultTempRoot(): string {
  return join(tmpdir(), ".adobe-desktop-mcp");
}
