import { getTelemetryConfig } from './config';

describe('getTelemetryConfig', () => {
  it('defaults tracing off', () => {
    const config = getTelemetryConfig({});

    expect(config.enabled).toBe(false);
    expect(config.sdkDisabled).toBe(false);
    expect(config.serviceName).toBe('librechat');
    expect(config.healthPath).toBe('/health');
  });

  it('enables tracing only when OTEL_TRACING_ENABLED is true', () => {
    expect(getTelemetryConfig({ OTEL_TRACING_ENABLED: 'true' }).enabled).toBe(true);
    expect(getTelemetryConfig({ OTEL_TRACING_ENABLED: 'TRUE' }).enabled).toBe(true);
    expect(getTelemetryConfig({ OTEL_TRACING_ENABLED: 'false' }).enabled).toBe(false);
  });

  it('lets OTEL_SDK_DISABLED override tracing enablement', () => {
    const config = getTelemetryConfig({
      OTEL_SDK_DISABLED: 'true',
      OTEL_TRACING_ENABLED: 'true',
    });

    expect(config.enabled).toBe(false);
    expect(config.sdkDisabled).toBe(true);
  });

  it('uses standard service env vars when provided', () => {
    const config = getTelemetryConfig({
      OTEL_SERVICE_NAME: ' librechat-api ',
      OTEL_SERVICE_VERSION: ' 1.2.3 ',
    });

    expect(config.serviceName).toBe('librechat-api');
    expect(config.serviceVersion).toBe('1.2.3');
  });

  it('falls back to npm package version when service version is absent', () => {
    const config = getTelemetryConfig({
      npm_package_version: '0.8.5',
    });

    expect(config.serviceVersion).toBe('0.8.5');
  });

  it('returns undefined Azure Monitor fields when env vars are absent', () => {
    const config = getTelemetryConfig({});

    expect(config.azureMonitorEndpoint).toBeUndefined();
    expect(config.azureMonitorClientId).toBeUndefined();
  });

  it('reads AZURE_MONITOR_OTLP_ENDPOINT and AZURE_CLIENT_ID when set', () => {
    const config = getTelemetryConfig({
      AZURE_MONITOR_OTLP_ENDPOINT:
        'https://managed-app-insight.australiaeast-1.ingest.monitor.azure.com/dataCollectionRules/dcr-abc/streams/Microsoft-OTLP-Traces/otlp/v1/traces',
      AZURE_CLIENT_ID: '9058562c-9eeb-4608-8613-51bec6324181',
    });

    expect(config.azureMonitorEndpoint).toBe(
      'https://managed-app-insight.australiaeast-1.ingest.monitor.azure.com/dataCollectionRules/dcr-abc/streams/Microsoft-OTLP-Traces/otlp/v1/traces',
    );
    expect(config.azureMonitorClientId).toBe('9058562c-9eeb-4608-8613-51bec6324181');
  });

  it('trims whitespace from Azure Monitor env vars', () => {
    const config = getTelemetryConfig({
      AZURE_MONITOR_OTLP_ENDPOINT: '  https://example.ingest.monitor.azure.com/  ',
      AZURE_CLIENT_ID: '  my-client-id  ',
    });

    expect(config.azureMonitorEndpoint).toBe('https://example.ingest.monitor.azure.com/');
    expect(config.azureMonitorClientId).toBe('my-client-id');
  });

  it('returns undefined for Azure Monitor fields when env vars are blank strings', () => {
    const config = getTelemetryConfig({
      AZURE_MONITOR_OTLP_ENDPOINT: '   ',
      AZURE_CLIENT_ID: '',
    });

    expect(config.azureMonitorEndpoint).toBeUndefined();
    expect(config.azureMonitorClientId).toBeUndefined();
  });
});
