const DEFAULT_SERVICE_NAME = 'librechat';
export const DEFAULT_HEALTH_PATH = '/health';

export type TelemetryStatus = 'disabled' | 'failed' | 'started' | 'starting' | 'stopped';

export interface TelemetryConfig {
  enabled: boolean;
  healthPath: string;
  sdkDisabled: boolean;
  serviceName: string;
  serviceVersion?: string;
  /**
   * Azure Monitor DCR OTLP traces ingestion URL (from `AZURE_MONITOR_OTLP_ENDPOINT`).
   * Example: `https://<dce>.<region>.ingest.monitor.azure.com/dataCollectionRules/<dcr-id>/streams/Microsoft-OTLP-Traces/otlp/v1/traces`
   * Requires a bearer token per request; not an App Insights connection string.
   */
  azureMonitorEndpoint?: string;
  /** Managed identity client ID (from `AZURE_CLIENT_ID`) used to obtain the bearer token. */
  azureMonitorClientId?: string;
}

function isTruthy(value?: string | boolean | null): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

function normalizeEnvValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getTelemetryConfig(env: NodeJS.ProcessEnv = process.env): TelemetryConfig {
  const sdkDisabled = isTruthy(env.OTEL_SDK_DISABLED);
  const enabled = isTruthy(env.OTEL_TRACING_ENABLED) && !sdkDisabled;
  const serviceName = normalizeEnvValue(env.OTEL_SERVICE_NAME) ?? DEFAULT_SERVICE_NAME;
  const serviceVersion =
    normalizeEnvValue(env.OTEL_SERVICE_VERSION) ?? normalizeEnvValue(env.npm_package_version);

  return {
    enabled,
    serviceName,
    sdkDisabled,
    serviceVersion,
    healthPath: DEFAULT_HEALTH_PATH,
    azureMonitorEndpoint: normalizeEnvValue(env.AZURE_MONITOR_OTLP_ENDPOINT),
    azureMonitorClientId: normalizeEnvValue(env.AZURE_CLIENT_ID),
  };
}
