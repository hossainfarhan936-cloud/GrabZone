/**
 * GrabZone CORS policy.
 *
 * Replaces the previous behaviour of echoing whatever Origin the caller sent
 * (which, combined with Access-Control-Allow-Credentials, let any website read
 * API responses). Only origins in this allow-list receive CORS headers; every
 * other origin gets no CORS headers at all, so the browser blocks the read.
 *
 * The list is intentionally explicit. To add an origin without a code change,
 * set the CORS_ALLOWED_ORIGINS environment variable (comma separated) on the
 * Worker, e.g. "https://preview.example.com,https://staging.example.com".
 */
export const GZ_ALLOWED_ORIGINS = [
  'https://grabzone.tech',
  'https://www.grabzone.tech',
  'https://grabzone.nemesiseditzx984.workers.dev',
  'https://vendor-system-dev-grabzone.nemesiseditzx984.workers.dev',
  'http://localhost:8899',
  'http://127.0.0.1:8899',
];

/** True when this exact origin may receive CORS headers (with credentials). */
export function gzOriginAllowed(origin, env) {
  const o = String(origin || '').trim();
  if (!o) return false;
  const extra = String((env && env.CORS_ALLOWED_ORIGINS) || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  // localhost on any port is a developer machine, never a public website.
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  return GZ_ALLOWED_ORIGINS.includes(o) || extra.includes(o);
}

/**
 * Apply the CORS policy to a response.
 * allowed  -> echo the origin, allow credentials, Vary: Origin
 * not allowed / no origin -> no CORS headers (same-origin callers need none)
 */
export function gzApplyCors(res, req, env) {
  const h = new Headers(res.headers);
  const origin = (req && req.headers && req.headers.get('Origin')) || '';
  h.append('Vary', 'Origin');
  if (origin && gzOriginAllowed(origin, env)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Credentials', 'true');
    h.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-GrabZone-Token,Cache-Control');
    h.set('Access-Control-Max-Age', '86400');
  } else {
    h.delete('Access-Control-Allow-Origin');
    h.delete('Access-Control-Allow-Credentials');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

/** Preflight response: 204 with CORS headers only for an allowed origin. */
export function gzPreflight(req, env) {
  return gzApplyCors(new Response(null, { status: 204 }), req, env);
}
