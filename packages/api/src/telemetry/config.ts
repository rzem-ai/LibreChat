const DEFAULT_SERVICE_NAME = 'librechat';
export const DEFAULT_HEALTH_PATH = '/health';

export type TelemetryStatus = 'disabled' | 'failed' | 'started' | 'starting' | 'stopped';

export interface TelemetryConfig {
  enabled: boolean;
  healthPath: string;
  sdkDisabled: boolean;
  serviceName: string;
  serviceVersion?: string;
  /** Azure Monitor OTLP ingestion endpoint (e.g. https://<workspace>.ingest.monitor.azure.com/...) */
  azureMonitorEndpoint?: string;
  /** Client ID of the user-assigned managed identity used to authenticate with Azure Monitor */
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
