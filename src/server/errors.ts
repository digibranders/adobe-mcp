export class AdobeMcpError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AdobeMcpError";
  }
}

export class UnsupportedAppError extends AdobeMcpError {
  public constructor(appId: string) {
    super(`Unsupported Adobe app: ${appId}`);
    this.name = "UnsupportedAppError";
  }
}

export class BridgeNotReadyError extends AdobeMcpError {
  public constructor(appId: string) {
    super(`Bridge implementation is not ready for ${appId}`);
    this.name = "BridgeNotReadyError";
  }
}
