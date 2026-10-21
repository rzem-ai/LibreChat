// Deloitte Custom Change: MCP Gateway toolset metadata for connector tooltips.

/** An operational toolsets failure carrying the safe HTTP status and message to report to the client. */
export class GatewayToolsetsError extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GatewayToolsetsError';
    this.status = status;
  }
}
