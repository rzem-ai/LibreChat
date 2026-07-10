/**
 * azure_proxy.js - njs handler for Azure AU and Azure US custom endpoints.
 *
 * LibreChat's `custom` endpoint type sends requests in plain OpenAI format:
 *   POST /azure-au/chat/completions
 *   Body: { "model": "gpt-4o-mini", ... }
 *
 * The LLM Gateway requires Azure OpenAI deployment path format:
 *   POST /openai/deployments/{model}/chat/completions?api-version=2025-01-01-preview
 *
 * This handler:
 *   1. Buffers and parses the request body to extract the model name.
 *   2. Constructs the correct upstream URL with the Azure deployment path.
 *   3. Injects the x-sa-token authentication header.
 *   4. Streams the response back to LibreChat (preserving SSE for token streaming).
 */

var AZURE_API_VERSION = "2025-01-01-preview";

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------


function logInfo(r, msg) {
  r.log("[azure_proxy] " + msg);
}

function logError(r, msg) {
  r.error("[azure_proxy] " + msg);
}


/**
 * Summarise the headers object as a single-line string for logging.
 * Redacts the x-sa-token value to avoid leaking the service-account JWT
 * while still confirming it is present.
 */
function headersToStr(headers) {
  var parts = [];
  for (var k in headers) {
    var v = headers[k];
    var kl = k.toLowerCase();
    if (kl === "x-sa-token" || kl === "authorization" || kl === "proxy-authorization" || kl === "cookie" || kl === "x-api-key" || kl === "api-key" || kl.indexOf("token") !== -1 || kl.indexOf("key") !== -1 || kl.indexOf("secret") !== -1 || kl.indexOf("session") !== -1) {
      v = v ? "[REDACTED len=" + String(v).length + "]" : "[EMPTY]";
    }
    parts.push(k + ": " + v);
  }
  return "{ " + parts.join(" | ") + " }";
}

/**
 * Summarise the incoming request headers (r.headersIn).
 * njs exposes headersIn as an object-like map; iterate with for-in.
 */
function incomingHeadersToStr(r) {
  var parts = [];
  for (var k in r.headersIn) {
    var v = r.headersIn[k];
    var kl = k.toLowerCase();
    if (kl === "authorization" || kl === "proxy-authorization" || kl === "cookie" || kl === "x-api-key" || kl === "x-sa-token" || kl === "api-key" || kl.indexOf("token") !== -1 || kl.indexOf("key") !== -1 || kl.indexOf("secret") !== -1 || kl.indexOf("session") !== -1) {
      v = v ? "[REDACTED len=" + String(v).length + "]" : "[EMPTY]";
    }
    parts.push(k + ": " + v);
  }
  return "{ " + parts.join(" | ") + " }";
}

/**
 * Summarise the upstream response headers.
 * res.headers in njs is a Headers object; iterate with forEach.
 */
function responseHeadersToStr(res) {
  var parts = [];
  res.headers.forEach(function(value, name) {
    var nl = name.toLowerCase();
    if (nl === "set-cookie" || nl === "authorization" || nl === "proxy-authorization" || nl.indexOf("token") !== -1 || nl.indexOf("key") !== -1 || nl.indexOf("secret") !== -1 || nl.indexOf("session") !== -1) {
      parts.push(name + ": [REDACTED]");
      return;
    }
    parts.push(name + ": " + value);
  });
  return "{ " + parts.join(" | ") + " }";
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function azureProxy(r) {
  var reqId = r.headersIn["x-request-id"] || r.variables["request_id"] || ("-" + Math.random().toString(36).slice(2, 8));
  logInfo(r, "=== REQUEST START [" + reqId + "] ===");

  // --- Log incoming request details ---
  logInfo(r, "[" + reqId + "] Incoming request:"
    + " method=" + r.method
    + " uri=" + r.uri
    + " args_len=" + (r.argsString ? r.argsString.length : 0)
    + " remoteAddr=" + r.remoteAddress
    + " httpVersion=" + r.httpVersion);

  logInfo(r, "[" + reqId + "] Incoming headers: " + incomingHeadersToStr(r));

  // --- Validate token ---
  var token = r.variables["token_proxy_token"] || "";
  if (!token) {
    logError(r, "[" + reqId + "] ABORT: service account token is empty - returning 503");
    r.return(503, "token unavailable\n");
    return;
  }
  logInfo(r, "[" + reqId + "] Service account token present (length=" + token.length + ")");

  // --- Validate and parse request body ---
  // In this njs build (nginx/1.30.x), r.requestText is a string property that
  // contains the buffered request body. It is NOT a function — do not call it.
  // r.requestBody and r.text() are not available in js_content handlers.
  // client_body_in_single_buffer on (proxy.conf) helps keep the body in a single
  // buffer (in memory up to client_body_buffer_size; larger bodies may spill to a temp file).
  var body = r.requestText;
  if (!body) {
    logError(r, "[" + reqId + "] ABORT: request body is empty - returning 400");
    r.headersOut["Content-Type"] = "application/json";
    r.return(400, JSON.stringify({ error: { message: "empty request body", type: "invalid_request_error" } }));
    return;
  }
  logInfo(r, "[" + reqId + "] Request body length=" + body.length);

  var model = "";
  var parsed;
  try {
    parsed = JSON.parse(body);
    model = parsed.model || "";
  } catch (e) {
    logError(r, "[" + reqId + "] ABORT: JSON parse error: " + e + " - returning 400");
    r.headersOut["Content-Type"] = "application/json";
    r.return(400, JSON.stringify({ error: { message: "request body is not valid JSON", type: "invalid_request_error" } }));
    return;
  }

  logInfo(r, "[" + reqId + "] Parsed body fields:"
    + " model=" + (parsed.model || "(none)")
    + " stream=" + (parsed.stream !== undefined ? parsed.stream : "(not set)")
    + " max_tokens=" + (parsed.max_tokens || parsed.max_completion_tokens || "(not set)")
    + " temperature=" + (parsed.temperature !== undefined ? parsed.temperature : "(not set)")
    + " messages_count=" + (parsed.messages ? parsed.messages.length : "(no messages array)"));

  if (!model) {
    logError(r, "[" + reqId + "] ABORT: 'model' field missing from request body - returning 400");
    r.headersOut["Content-Type"] = "application/json";
    r.return(400, JSON.stringify({ error: { message: "missing 'model' field in request body", type: "invalid_request_error" } }));
    return;
  }
  logInfo(r, "[" + reqId + "] Extracted model name: " + model);

  // --- Resolve upstream base URL from nginx variable ---
  var region = /^\/azure-au(?:\/|$)/.test(r.uri) ? "azure-au" : "azure-us";
  var upstreamBase = region === "azure-au"
    ? r.variables["token_proxy_azure_au_url"]
    : r.variables["token_proxy_azure_us_url"];

  logInfo(r, "[" + reqId + "] Resolved region: " + region
    + " upstreamBase=" + (upstreamBase || "(empty - NOT CONFIGURED)"));

  if (!upstreamBase) {
    logError(r, "[" + reqId + "] ABORT: upstream URL not configured for region=" + region + " - returning 500");
    r.return(500, "upstream URL not configured\n");
    return;
  }

  // Strip any trailing slash from the upstream base URL
  upstreamBase = upstreamBase.replace(/\/$/, "");

  // --- Build the Azure-format upstream URL ---
  // Preserve the requested OpenAI-style endpoint path (e.g. /v1/embeddings, /v1/chat/completions)
  // but strip the provider prefix (/azure-au or /azure-us) and optional /v1 prefix.
  var rawPath = r.uri;
  var path = r.uri.replace(/^\/azure-(?:au|us)(?:\/|$)/, "/").replace(/^\/v1\//, "/");
  if (path === "/" || path === "") {
    path = "/chat/completions";
  }

  logInfo(r, "[" + reqId + "] Path rewriting: rawUri=" + rawPath + " -> stripped path=" + path);

  // r.args in njs is a key/value object, not a string. Prefer r.argsString when
  // available; fall back to nginx's $args variable for compatibility across njs builds.
  // Strip any api-version param passed by the client so our own AZURE_API_VERSION
  // value is always used.
  var args = (r.argsString !== undefined ? r.argsString : (r.variables["args"] || ""));
  var argsOriginal = args;
  if (args) {
    args = args.split("&").filter(function(p) { return p.indexOf("api-version=") !== 0; }).join("&");
  }
  var query = "api-version=" + AZURE_API_VERSION + (args ? "&" + args : "");
  var queryForLog = "api-version=" + AZURE_API_VERSION + (args ? "&(redacted)" : "");
  var upstreamURL = upstreamBase + "/openai/deployments/" + encodeURIComponent(model) + path + "?" + query;
  var upstreamURLForLog = upstreamBase + "/openai/deployments/" + encodeURIComponent(model) + path + "?" + queryForLog;

  logInfo(r, "[" + reqId + "] URL construction:"
    + " originalArgsLen=" + (argsOriginal ? argsOriginal.length : 0)
    + " filteredArgsLen=" + (args ? args.length : 0)
    + " finalQuery=" + queryForLog);
  logInfo(r, "[" + reqId + "] Upstream URL: " + upstreamURLForLog);

  // --- Forward headers, injecting x-sa-token and dropping hop-by-hop headers ---
  var headers = Object.create(null);
  var skipHeaders = Object.create(null);
  skipHeaders["host"] = true;
  skipHeaders["content-length"] = true;
  skipHeaders["transfer-encoding"] = true;
  skipHeaders["connection"] = true;
  skipHeaders["x-sa-token"] = true;
  var droppedHeaders = [];
  var forwardedHeaders = [];
  for (var h in r.headersIn) {
    if (!Object.prototype.hasOwnProperty.call(r.headersIn, h)) {
      continue;
    }
    if (!skipHeaders[h.toLowerCase()]) {
      headers[h] = r.headersIn[h];
      forwardedHeaders.push(h);
    } else {
      droppedHeaders.push(h);
    }
  }
  headers["x-sa-token"] = token;

  // Ensure Content-Type is set for JSON bodies
  var hasContentType = false;
  for (var hk in headers) {
    if (hk.toLowerCase() === "content-type") {
      hasContentType = true;
      break;
    }
  }
  if (!hasContentType) {
    headers["Content-Type"] = "application/json";
    logInfo(r, "[" + reqId + "] Content-Type was missing - defaulted to application/json");
  }

  logInfo(r, "[" + reqId + "] Header forwarding:"
    + " forwarded=[" + forwardedHeaders.join(", ") + "]"
    + " dropped=[" + droppedHeaders.join(", ") + "]"
    + " injected=x-sa-token");
  logInfo(r, "[" + reqId + "] Outbound headers to upstream: " + headersToStr(headers));

  // --- Fetch from upstream and stream the response back ---
  logInfo(r, "[" + reqId + "] Sending " + r.method + " request to upstream...");
  var fetchStart = Date.now();
  var res;
  try {
    res = await ngx.fetch(upstreamURL, {
      method: r.method,
      headers: headers,
      body: body,
    });
  } catch (e) {
    var fetchDuration = Date.now() - fetchStart;
    logError(r, "[" + reqId + "] Upstream fetch FAILED after " + fetchDuration + "ms: " + e);
    r.headersOut["Content-Type"] = "application/json";
    r.return(502, JSON.stringify({ error: { message: "upstream connection failed", type: "api_error" } }));
    return;
  }
  var fetchDuration = Date.now() - fetchStart;

  logInfo(r, "[" + reqId + "] Upstream responded in " + fetchDuration + "ms:"
    + " status=" + res.status
    + " statusText=" + res.statusText);
  logInfo(r, "[" + reqId + "] Upstream response headers: " + responseHeadersToStr(res));

  // Copy response headers back to the client.
  // Strip hop-by-hop headers and Content-Length: the upstream may send a length
  // reflecting the full body, but we stream chunks via r.send() so the byte count
  // forwarded to the client would be incorrect (particularly for SSE responses).
  var skipRespHeaders = { "transfer-encoding": true, "connection": true, "content-length": true };
  var forwardedRespHeaders = [];
  var droppedRespHeaders = [];
  res.headers.forEach(function(value, name) {
    if (!skipRespHeaders[name.toLowerCase()]) {
      r.headersOut[name] = value;
      forwardedRespHeaders.push(name);
    } else {
      droppedRespHeaders.push(name);
    }
  });

  logInfo(r, "[" + reqId + "] Response header forwarding:"
    + " forwarded=[" + forwardedRespHeaders.join(", ") + "]"
    + " dropped=[" + droppedRespHeaders.join(", ") + "]");

  r.status = res.status;
  r.sendHeader();

  logInfo(r, "[" + reqId + "] Sent response status " + res.status + " to client; beginning body stream...");

  // Stream response body chunk-by-chunk to preserve SSE token streaming
  if (!res.body) {
    logInfo(r, "[" + reqId + "] Response has no body; finishing immediately.");
    r.finish();
    return;
  }

  var reader = res.body.getReader();
  var chunkCount = 0;
  var totalBytes = 0;
  while (true) {
    var chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    chunkCount++;
    totalBytes += chunk.value.length;

    // Log the first few chunks (length only) to aid diagnostics without leaking content
    if (chunkCount <= 3) {
      logInfo(r, "[" + reqId + "] Chunk #" + chunkCount + " length=" + chunk.value.length);
    }

    r.send(chunk.value);
  }

  logInfo(r, "[" + reqId + "] Stream complete: totalChunks=" + chunkCount + " totalBytes=" + totalBytes);
  logInfo(r, "=== REQUEST END [" + reqId + "] status=" + res.status + " ===");
  r.finish();
}

export default { azureProxy };
