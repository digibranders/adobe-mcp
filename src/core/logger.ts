import type { LogLevel, Logger } from "./types.js";

const LOG_PRIORITIES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class StderrLogger implements Logger {
  public constructor(private readonly minLevel: LogLevel) {}

  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.write("debug", message, metadata);
  }

  public info(message: string, metadata?: Record<string, unknown>): void {
    this.write("info", message, metadata);
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.write("warn", message, metadata);
  }

  public error(message: string, metadata?: Record<string, unknown>): void {
    this.write("error", message, metadata);
  }

  private write(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (LOG_PRIORITIES[level] < LOG_PRIORITIES[this.minLevel]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(metadata === undefined ? {} : { metadata })
    };

    process.stderr.write(`${JSON.stringify(payload)}\n`);
  }
}
