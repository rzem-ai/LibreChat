/**
 * azure_proxy.js - njs handler for Azure AU, Azure US, Azure Global, and Azure Foundry AU custom endpoints.
 *
 * LibreChat's `custom` endpoint type sends requests in plain OpenAI format:
 *   POST /azure-au/chat/completions
 *   Body: { "model": "gpt-4o-mini", ... }
 *
 * The LLM Gateway requires Azure OpenAI deployment path format:
 *   POST /openai/deployments/{model}/chat/completions?api-version=2025-01-01-preview
 *
 * This handler buffers and parses the request body to extract the model name,
 * constructs the correct upstream URL, then internally redirects to nginx's
 * native proxying path so SSE responses stream correctly.
 */

var AZURE_API_VERSION = '2025-01-01-preview';

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function logInfo(r, msg) {
  r.log('[azure_proxy] ' + msg);
}

function logError(r, msg) {
  r.error('[azure_proxy] ' + msg);
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
    if (
      kl === 'authorization' ||
      kl === 'proxy-authorization' ||
      kl === 'cookie' ||
      kl === 'x-api-key' ||
      kl === 'x-sa-token' ||
      kl === 'api-key' ||
      kl.indexOf('token') !== -1 ||
      kl.indexOf('key') !== -1 ||
      kl.indexOf('secret') !== -1 ||
      kl.indexOf('session') !== -1
    ) {
      v = v ? '[REDACTED len=' + String(v).length + ']' : '[EMPTY]';
    }
    parts.push(k + ': ' + v);
  }
  return '{ ' + parts.join(' | ') + ' }';
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function azureProxy(r) {
  var reqId =
    r.headersIn['x-request-id'] ||
    r.variables['request_id'] ||
    '-' + Math.random().toString(36).slice(2, 8);
  logInfo(r, '=== REQUEST START [' + reqId + '] ===');

  // --- Log incoming request details ---
  logInfo(
    r,
    '[' +
      reqId +
      '] Incoming request:' +
      ' method=' +
      r.method +
      ' uri=' +
      r.uri +
      ' args_len=' +
      (r.argsString ? r.argsString.length : 0) +
      ' remoteAddr=' +
      r.remoteAddress +
      ' httpVersion=' +
      r.httpVersion,
  );

  logInfo(r, '[' + reqId + '] Incoming headers: ' + incomingHeadersToStr(r));

  var idToken = r.headersIn['x-id-token'] || '';
  if (idToken) {
    logInfo(r, '[' + reqId + '] x-id-token: PRESENT (len=' + idToken.length + ')');
  } else {
    logInfo(r, '[' + reqId + '] x-id-token: NOT present in incoming request');
  }

  // --- Validate token ---
  var token = r.variables['token_proxy_token'] || '';
  if (!token) {
    logError(
      r,
      '[' +
        reqId +
        '] ABORT: service account token is empty — x-sa-token will NOT be injected - returning 503',
    );
    r.return(503, 'token unavailable\n');
    return;
  }
  logInfo(
    r,
    '[' + reqId + '] x-sa-token: will be injected into upstream request (len=' + token.length + ')',
  );

  // --- Validate and parse request body ---
  // In this njs build (nginx/1.30.x), r.requestText is a string property that
  // contains the buffered request body. It is NOT a function — do not call it.
  // r.requestBody and r.text() are not available in js_content handlers.
  // client_body_in_single_buffer on (proxy.conf) helps keep the body in a single
  // buffer (in memory up to client_body_buffer_size; larger bodies may spill to a temp file).
  var body = r.requestText;
  if (!body) {
    logError(r, '[' + reqId + '] ABORT: request body is empty - returning 400');
    r.headersOut['Content-Type'] = 'application/json';
    r.return(
      400,
      JSON.stringify({ error: { message: 'empty request body', type: 'invalid_request_error' } }),
    );
    return;
  }
  logInfo(r, '[' + reqId + '] Request body length=' + body.length);

  var model = '';
  var parsed;
  try {
    parsed = JSON.parse(body);
    model = parsed.model || '';
  } catch (e) {
    logError(r, '[' + reqId + '] ABORT: JSON parse error: ' + e + ' - returning 400');
    r.headersOut['Content-Type'] = 'application/json';
    r.return(
      400,
      JSON.stringify({
        error: { message: 'request body is not valid JSON', type: 'invalid_request_error' },
      }),
    );
    return;
  }

  logInfo(
    r,
    '[' +
      reqId +
      '] Parsed body fields:' +
      ' model=' +
      (parsed.model || '(none)') +
      ' stream=' +
      (parsed.stream !== undefined ? parsed.stream : '(not set)') +
      ' max_tokens=' +
      (parsed.max_tokens || parsed.max_completion_tokens || '(not set)') +
      ' temperature=' +
      (parsed.temperature !== undefined ? parsed.temperature : '(not set)') +
      ' messages_count=' +
      (parsed.messages ? parsed.messages.length : '(no messages array)'),
  );

  if (!model) {
    logError(r, '[' + reqId + "] ABORT: 'model' field missing from request body - returning 400");
    r.headersOut['Content-Type'] = 'application/json';
    r.return(
      400,
      JSON.stringify({
        error: { message: "missing 'model' field in request body", type: 'invalid_request_error' },
      }),
    );
    return;
  }
  logInfo(r, '[' + reqId + '] Extracted model name: ' + model);

  // --- Resolve upstream base URL from nginx variable ---
  var region = /^\/azure-au(?:\/|$)/.test(r.uri)
    ? 'azure-au'
    : /^\/azure-global(?:\/|$)/.test(r.uri)
      ? 'azure-global'
      : /^\/azure-foundry-au(?:\/|$)/.test(r.uri)
        ? 'azure-foundry-au'
        : 'azure-us';
  var upstreamBase =
    region === 'azure-au'
      ? r.variables['token_proxy_azure_au_url']
      : region === 'azure-global'
        ? r.variables['token_proxy_azure_global_url']
        : region === 'azure-foundry-au'
          ? r.variables['token_proxy_azure_foundry_au_url']
        : r.variables['token_proxy_azure_us_url'];

  logInfo(
    r,
    '[' +
      reqId +
      '] Resolved region: ' +
      region +
      ' upstreamBase=' +
      (upstreamBase || '(empty - NOT CONFIGURED)'),
  );

  if (!upstreamBase) {
    logError(
      r,
      '[' +
        reqId +
        '] ABORT: upstream URL not configured for region=' +
        region +
        ' - returning 500',
    );
    r.return(500, 'upstream URL not configured\n');
    return;
  }

  // Strip any trailing slash from the upstream base URL
  upstreamBase = upstreamBase.replace(/\/$/, '');

  // --- Build the Azure-format upstream URL ---
  // Preserve the requested OpenAI-style endpoint path (e.g. /v1/embeddings, /v1/chat/completions)
  // but strip the provider prefix and optional /v1 prefix.
  var rawPath = r.uri;
  var path = r.uri.replace(/^\/azure-(?:au|us|global|foundry-au)(?:\/|$)/, '/').replace(/^\/v1\//, '/');
  if (path === '/' || path === '') {
    path = '/chat/completions';
  }

  logInfo(r, '[' + reqId + '] Path rewriting: rawUri=' + rawPath + ' -> stripped path=' + path);

  // r.args in njs is a key/value object, not a string. Prefer r.argsString when
  // available; fall back to nginx's $args variable for compatibility across njs builds.
  // Strip any api-version param passed by the client so our own AZURE_API_VERSION
  // value is always used.
  var args = r.argsString !== undefined ? r.argsString : r.variables['args'] || '';
  var argsOriginal = args;
  if (args) {
    args = args
      .split('&')
      .filter(function (p) {
        return p.indexOf('api-version=') !== 0;
      })
      .join('&');
  }
  var query = 'api-version=' + AZURE_API_VERSION + (args ? '&' + args : '');
  var queryForLog = 'api-version=' + AZURE_API_VERSION + (args ? '&(redacted)' : '');
  var upstreamURL =
    upstreamBase + '/openai/deployments/' + encodeURIComponent(model) + path + '?' + query;
  var upstreamURLForLog =
    upstreamBase + '/openai/deployments/' + encodeURIComponent(model) + path + '?' + queryForLog;

  logInfo(
    r,
    '[' +
      reqId +
      '] URL construction:' +
      ' originalArgsLen=' +
      (argsOriginal ? argsOriginal.length : 0) +
      ' filteredArgsLen=' +
      (args ? args.length : 0) +
      ' finalQuery=' +
      queryForLog,
  );
  logInfo(r, '[' + reqId + '] Upstream URL: ' + upstreamURLForLog);

  r.variables.azure_proxy_upstream_url = upstreamURL;
  logInfo(r, '[' + reqId + '] Internal redirect to nginx streaming proxy location.');
  r.internalRedirect('@azure_openai_upstream');
}

export default { azureProxy };
