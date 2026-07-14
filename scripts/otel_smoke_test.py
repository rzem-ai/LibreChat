#!/usr/bin/env python3
"""
Sends dummy OpenTelemetry spans to Azure Monitor (App Insights) via OTLP/HTTP+protobuf.

Usage:
    pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http azure-identity requests
    az login
    python otel_smoke_test.py

After running, check App Insights in ~2-5 minutes:
    AppRequests    | where AppRoleName == "sanchit-smoketest" | order by TimeGenerated desc
    AppDependencies | where AppRoleName == "sanchit-smoketest" | order by TimeGenerated desc
"""

import sys
import time

# ---------------------------------------------------------------------------
# Intercept ALL requests.Session HTTP calls so we can see exactly what the
# OTLPSpanExporter sends and what Azure Monitor replies — including status
# code and response body on real span exports.
# Must be applied before OTel packages are imported.
# ---------------------------------------------------------------------------
try:
    import requests as _requests

    _orig_send = _requests.Session.send

    def _debug_send(self, prepared_request, **kwargs):
        print(
            f"\n  [HTTP →] {prepared_request.method} {prepared_request.url}\n"
            f"           Content-Type: {prepared_request.headers.get('Content-Type', '(none)')}\n"
            f"           Content-Length: {prepared_request.headers.get('Content-Length', '(none)')}"
        )
        response = _orig_send(self, prepared_request, **kwargs)
        body_preview = response.text[:600] if response.text else "(empty)"
        print(
            f"  [HTTP ←] {response.status_code} {response.reason}\n"
            f"           x-ms-error-code: {response.headers.get('x-ms-error-code', '(none)')}\n"
            f"           Body: {body_preview}"
        )
        return response

    _requests.Session.send = _debug_send
    print("[debug] requests.Session patched — all HTTP traffic will be logged")
except ImportError:
    print("[warn] `requests` not installed — install it to see HTTP response details")

# ---------------------------------------------------------------------------

ENDPOINT = (
    # Copy the Traces endpoint from App Insights → Overview → OTLP Connection Info
    "https://managed-ai-ctspoke-npd-dce-95rn.australiaeast-1.ingest.monitor.azure.com/dataCollectionRules/dcr-3991725585f24a5eabd0d6aa283d0e18/streams/Microsoft-OTLP-Traces/otlp/v1/traces"
)
AZURE_MONITOR_SCOPE = "https://monitor.azure.com/.default"
SERVICE_NAME = "sanchit-smoketest"


def section(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def get_auth_headers() -> dict[str, str]:
    section("Step 1: Acquire Azure Monitor token")
    try:
        from azure.identity import DefaultAzureCredential
    except ImportError:
        print("ERROR: run  pip install azure-identity")
        sys.exit(1)

    credential = DefaultAzureCredential()
    token = credential.get_token(AZURE_MONITOR_SCOPE)
    print(f"OK  Token acquired (expires in {int(token.expires_on - time.time())}s)")
    return {"Authorization": f"Bearer {token.token}"}


def build_provider(headers: dict[str, str]):
    section("Step 2: Build OTel TracerProvider")
    try:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter, SpanExportResult
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.semconv.resource import ResourceAttributes
    except ImportError:
        print("ERROR: run  pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http")
        sys.exit(1)

    print(f"Endpoint : {ENDPOINT}")
    print(f"Service  : {SERVICE_NAME}")

    inner_exporter = OTLPSpanExporter(endpoint=ENDPOINT, headers=headers)

    # Wrap the exporter to print the SpanExportResult (SUCCESS / FAILURE).
    class LoggingExporter(SpanExporter):
        def export(self, spans):
            print(f"\n  [exporter] Exporting {len(spans)} span(s) ...")
            result: SpanExportResult = inner_exporter.export(spans)
            status = "SUCCESS ✓" if result == SpanExportResult.SUCCESS else "FAILURE ✗"
            print(f"  [exporter] Result: {status}")
            return result

        def shutdown(self):
            inner_exporter.shutdown()

        def force_flush(self, timeout_millis: int = 30_000) -> bool:
            return inner_exporter.force_flush(timeout_millis)

    resource = Resource(
        attributes={
            ResourceAttributes.SERVICE_NAME: SERVICE_NAME,
            ResourceAttributes.SERVICE_VERSION: "0.0.1-smoketest",
        }
    )
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(SimpleSpanProcessor(LoggingExporter()))
    print("OK  Provider ready")
    return provider


def emit_spans(provider) -> None:
    section("Step 3: Emit spans")
    from opentelemetry import trace
    from opentelemetry.trace import SpanKind, StatusCode

    trace.set_tracer_provider(provider)
    tracer = trace.get_tracer("librechat.smoketest")

    print("Creating SERVER span (→ AppRequests) ...")
    with tracer.start_as_current_span(
        "GET /api/test",
        kind=SpanKind.SERVER,
        attributes={
            "http.method": "GET",
            "http.route": "/api/test",
            "http.url": "http://localhost:3080/api/test",
            "http.response.status_code": 200,
        },
    ) as server_span:
        server_span.set_status(StatusCode.OK)
        time.sleep(0.05)

        print("Creating CLIENT span (→ AppDependencies) ...")
        with tracer.start_as_current_span(
            "mongodb.find messages",
            kind=SpanKind.CLIENT,
            attributes={
                "db.system": "mongodb",
                "db.name": "librechat",
                "db.operation": "find",
                "db.mongodb.collection": "messages",
            },
        ) as dep_span:
            dep_span.set_status(StatusCode.OK)
            time.sleep(0.02)

    section("Step 4: Shutdown")
    provider.shutdown()
    print(
        "\nKusto queries (run in Log Analytics in ~2-5 min):\n"
        f"  AppRequests    | where AppRoleName == '{SERVICE_NAME}' | order by TimeGenerated desc\n"
        f"  AppDependencies | where AppRoleName == '{SERVICE_NAME}' | order by TimeGenerated desc\n"
        "\nIf still empty, broaden the search:\n"
        "  AppRequests | order by TimeGenerated desc | take 10"
    )


if __name__ == "__main__":
    headers = get_auth_headers()
    provider = build_provider(headers)
    emit_spans(provider)
