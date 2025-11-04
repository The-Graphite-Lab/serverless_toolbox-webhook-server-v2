// auth/cookie.mjs - Cookie-based authentication utilities

export const COOKIE_NAME = "tgl_wi_auth";
export const COOKIE_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

export const cookieNameFor = (instanceId) => `${COOKIE_NAME}.${instanceId}`;

// Compute a cookie Path from the incoming request (minus trailing /auth)
export function cookiePathFromEvent(event) {
  const p = (event.rawPath || event.path || "/").replace(/\/auth$/, "");
  return p || "/";
}

// Parse cookie header into a map
export function getCookieMap(cookieHeader = "") {
  const map = {};
  cookieHeader.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) map[k] = decodeURIComponent(v);
  });
  return map;
}

// Build an HTTP cookie string with security settings
export function buildAuthCookie({
  name,
  token,
  maxAgeSec = COOKIE_TTL_SEC,
  path = "/instance/",
}) {
  return [
    `${name}=${encodeURIComponent(token)}`,
    `Max-Age=${maxAgeSec}`,
    `Path=${path}`,
    `Domain=.thegraphitelab.com`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Strict`,
  ].join("; ");
}
