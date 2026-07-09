/**
 * azure_proxy.js - njs handler for Azure AU and Azure US custom endpoints.
 *
 * LibreChat's `custom` endpoint type sends requests in plain OpenAI format:
 *   POST /azure-au/chat/completions
 *   Body: { "model": "gpt-4o-mini", ... }
 *
 * The LLM Gateway requires Azure OpenAI path format:
 *   POST /openai/deployments/{model}/chat/completions?api-version=2025-01-01-preview
 *
 * This handler:
 *   1. Buffers and parses the request body to extract the model name.
 *   2. Constructs the correct upstream URL with the Azure deployment path.
 *   3. Injects the x-sa-token authentication header.
 *   4. Streams the response back to LibreChat (preserving SSE for token streaming).
 */

var AZURE_API_VERSION = "2025-01-01-preview";

async function azureProxy(r) {
  // --- Validate token ---
  var token = r.variables["token_proxy_token"] || "";
  if (!token) {
    r.return(503, "token unavailable\n");
    return;
  }

  // --- Validate and parse request body ---
  var body = r.requestBody;
  if (!body) {
    r.headersOut["Content-Type"] = "application/json";
    r.return(400, JSON.stringify({ error: { message: "empty request body", type: "invalid_request_error" } }));
    return;
  }

  var model = "";
  try {
    var parsed = JSON.parse(body);
    model = parsed.model || "";
  } catch (e) {
    r.headersOut["Content-Type"] = "application/json";
    r.return(400, JSON.stringify({ error: { message: "request body is not valid JSON", type: "invalid_request_error" } }));
    return;
  }

  if (!model) {
    r.headersOut["Content-Type"] = "application/json";
    r.return(400, JSON.stringify({ error: { message: "missing 'model' field in request body", type: "invalid_request_error" } }));
    return;
  }

  // --- Resolve upstream base URL from nginx variable ---
  var upstreamBase = r.uri.startsWith("/azure-au/")
    ? r.variables["token_proxy_azure_au_url"]
    : r.variables["token_proxy_azure_us_url"];

  if (!upstreamBase) {
    r.return(500, "upstream URL not configured\n");
    return;
  }

  // Strip any trailing slash from the upstream base URL
  upstreamBase = upstreamBase.replace(/\/$/, "");

  // --- Build the Azure-format upstream URL ---
  // Preserve the requested OpenAI-style endpoint path (e.g. /v1/embeddings, /v1/chat/completions)
  // but strip the provider prefix (/azure-au or /azure-us) and optional /v1 prefix.
  var path = r.uri.replace(/^\/azure-(?:au|us)(?:\/|$)/, "/").replace(/^\/v1\//, "/");
  if (path === "/" || path === "") {
    path = "/chat/completions";
  }

  var query = "api-version=" + AZURE_API_VERSION + (r.args ? "&" + r.args : "");
  var upstreamURL = upstreamBase + "/openai/deployments/" + encodeURIComponent(model) + path + "?" + query;

  // --- Forward headers, injecting x-sa-token and dropping hop-by-hop headers ---
  var headers = {};
  var skipHeaders = { "host": true, "content-length": true, "transfer-encoding": true, "connection": true, "x-sa-token": true };
  for (var h in r.headersIn) {
    if (!skipHeaders[h.toLowerCase()]) {
      headers[h] = r.headersIn[h];
    }
  }
  headers["x-sa-token"] = token;
  // Ensure Content-Type is set for JSON bodies
  if (!headers["content-type"] && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // --- Fetch from upstream and stream the response back ---
  var res;
  try {
    res = await ngx.fetch(upstreamURL, {
      method: r.method,
      headers: headers,
      body: body,
    });
  } catch (e) {
    r.headersOut["Content-Type"] = "application/json";
    r.return(502, JSON.stringify({ error: { message: "upstream connection failed: " + e.message, type: "api_error" } }));
    return;
  }

  // Copy response headers back to the client.
  // Strip hop-by-hop headers and Content-Length: the upstream may send a length
  // reflecting the full body, but we stream chunks via r.send() so the byte count
  // forwarded to the client would be incorrect (particularly for SSE responses).
  var skipRespHeaders = { "transfer-encoding": true, "connection": true, "content-length": true };
  res.headers.forEach(function(value, name) {
    if (!skipRespHeaders[name.toLowerCase()]) {
      r.headersOut[name] = value;
    }
  });

  r.status = res.status;
  r.sendHeader();

  // Stream response body chunk-by-chunk to preserve SSE token streaming
  if (!res.body) {
    r.finish();
    return;
  }

  var reader = res.body.getReader();
  while (true) {
    var chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    r.send(chunk.value);
  }
  r.finish();
}

export default { azureProxy };
