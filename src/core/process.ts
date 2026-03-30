import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { platform } from "node:os";

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runProcess(
  command: string,
  args: readonly string[],
  timeoutMs: number
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Process timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({
        exitCode: exitCode ?? -1,
        stdout,
        stderr
      });
    });
  });
}

export async function commandExists(command: string): Promise<boolean> {
  const lookupCommand = platform() === "win32" ? "where" : "which";
  try {
    const result = await runProcess(lookupCommand, [command], 5_000);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
