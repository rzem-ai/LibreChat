// Deloitte Custom Change: sets Strict-Transport-Security on every response so
// browsers enforce HTTPS for this origin, closing the app-wide gap flagged by
// Checkmarx (no HSTS header was set anywhere in the app previously).
// `includeSubDomains` is intentionally omitted: it would extend enforcement to
// every subdomain of the host, including ones that may not be HTTPS-ready, which
// is outside this fix's scope.
const hsts = (req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000');
  next();
};

module.exports = hsts;
