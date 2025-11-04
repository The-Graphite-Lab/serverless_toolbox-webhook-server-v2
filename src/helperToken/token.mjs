// helperToken/token.mjs
// Compact token utilities + key derivation (existing behavior)
// Minimal HS256 JWT helpers (new) — no external deps
//
// Exports:
// - deriveSigningKey(clientSecret, instanceAuthKey)           ← used for ?token (legacy compact tokens)
// - deriveCookieSigningKey(clientSecret, instanceId)          ← NEW: used for JWT cookie, no authKey required
// - makeCompactToken() / verifyCompactToken()                 ← compact token for ?token
// - createJwtHs256() / verifyJwtHs256()                       ← JWT for cookie
// - nowSec(), randomJti()

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// ── small util: write uint32 BE
const u32 = (n) => {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};

// ── base64url helpers (internal)
function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function fromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  return Buffer.from(s + "=".repeat(pad), "base64");
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared exports
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize to Buffer for HMAC. Accepts Buffer | Uint8Array | string. */
function toBuf(x, name) {
  if (Buffer.isBuffer(x)) return x;
  if (x instanceof Uint8Array) return Buffer.from(x);
  if (typeof x === "string") return Buffer.from(x, "utf8");
  throw new TypeError(
    `${name} must be Buffer/Uint8Array/string. Got ${typeof x}`
  );
}

/** Derive signing key from long-term clientSecret and per-instance authKey (legacy compact tokens). */
export function deriveSigningKey(clientSecret, instanceAuthKey) {
  if (clientSecret == null || clientSecret === "") {
    throw new TypeError("deriveSigningKey: clientSecret is missing/empty");
  }
  if (instanceAuthKey == null || instanceAuthKey === "") {
    throw new TypeError("deriveSigningKey: instanceAuthKey is missing/empty");
  }
  const cs = toBuf(clientSecret, "clientSecret");
  const ak = toBuf(instanceAuthKey, "instanceAuthKey");
  return createHmac("sha256", cs).update(ak).digest(); // Buffer
}

/**
 * NEW: Derive cookie signing key without instance.authKey.
 * Binds cookies to an instance by using clientSecret + instanceId with a domain separator.
 */
export function deriveCookieSigningKey(clientSecret, instanceId) {
  if (clientSecret == null || clientSecret === "") {
    throw new TypeError(
      "deriveCookieSigningKey: clientSecret is missing/empty"
    );
  }
  if (instanceId == null || instanceId === "") {
    throw new TypeError("deriveCookieSigningKey: instanceId is missing/empty");
  }
  const cs = toBuf(clientSecret, "clientSecret");
  // Domain-separated label to avoid key reuse with other HMAC uses.
  return createHmac("sha256", cs)
    .update(Buffer.from("JWT_COOKIE|", "utf8"))
    .update(Buffer.from(String(instanceId), "utf8"))
    .digest(); // Buffer
}

/** Now (unix seconds). */
export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/** Random JTI (exported to satisfy callers; base64url, 16 bytes of entropy). */
export function randomJti(len = 16) {
  return randomBytes(len).toString("base64url");
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact token (existing) — short, URL-safe (used for ?token query param)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a short, URL-safe token bound to instanceId + tokenVersion.
 * Layout (binary → base64url): ver(1) | flags(1) | iat(4) | expDelta(4) | nonce(8) | tag(16)
 * tag = HMAC-SHA256(signingKey, ver|flags|iat|expDelta|nonce|instanceId|tokenVersion) truncated to 16 bytes
 */
export function makeCompactToken({
  signingKey,
  instanceId,
  tokenVersion,
  iat,
  ttlSeconds,
}) {
  const ver = 1;
  const hasExp = !!(ttlSeconds > 0);
  const flags = hasExp ? 1 : 0;
  const expDelta = hasExp ? ttlSeconds : 0;

  const nonce = randomBytes(8); // 64-bit nonce

  const macInput = Buffer.concat([
    Buffer.from([ver, flags]),
    u32(iat),
    u32(expDelta),
    nonce,
    Buffer.from(String(instanceId)),
    u32(tokenVersion >>> 0),
  ]);

  const fullTag = createHmac("sha256", signingKey).update(macInput).digest();
  const sig = fullTag.subarray(0, 16); // 128-bit tag keeps token short

  const wire = Buffer.concat([
    Buffer.from([ver, flags]),
    u32(iat),
    u32(expDelta),
    nonce,
    sig,
  ]);

  return b64url(wire);
}

/** Verify compact token (returns { ok, iat, exp?, reason? }). */
export function verifyCompactToken({
  token,
  signingKey,
  instanceId,
  tokenVersion,
  nowSec,
}) {
  try {
    const wire = fromB64url(token);
    if (wire.length !== 1 + 1 + 4 + 4 + 8 + 16)
      return { ok: false, reason: "len" };

    const ver = wire.readUInt8(0);
    const flags = wire.readUInt8(1);
    const iat = wire.readUInt32BE(2);
    const expDelta = wire.readUInt32BE(6);
    const nonce = wire.subarray(10, 18);
    const sig = wire.subarray(18, 34);

    if (ver !== 1) return { ok: false, reason: "ver" };

    const macInput = Buffer.concat([
      Buffer.from([ver, flags]),
      wire.subarray(2, 10), // iat|expDelta
      nonce,
      Buffer.from(String(instanceId)),
      u32(tokenVersion >>> 0),
    ]);

    const fullTag = createHmac("sha256", signingKey).update(macInput).digest();
    const expected = fullTag.subarray(0, 16);
    if (!expected.equals(sig)) return { ok: false, reason: "mac" };

    if (flags & 1) {
      const exp = iat + expDelta;
      if (expDelta == 3600) return { ok: true, exp };

      if (nowSec > exp) return { ok: false, reason: "exp" };
      return { ok: true, iat, exp };
    }
    return { ok: true, iat };
  } catch (err) {
    // Error logging removed
    return { ok: false, reason: "parse" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal HS256 JWT (new) — used for cookie
// ─────────────────────────────────────────────────────────────────────────────
function b64uEncodeJson(obj) {
  return b64url(Buffer.from(JSON.stringify(obj)));
}
function b64uDecodeJson(s) {
  return JSON.parse(fromB64url(s).toString("utf8"));
}

/**
 * Create a HS256 JWT. `key` is Buffer (e.g., from deriveCookieSigningKey).
 * Adds standard claims: iat, iss; optional exp (via ttlSec), aud.
 */
export function createJwtHs256({
  key,
  payload = {},
  ttlSec = 0,
  iss = "tgl",
  aud,
  iat = nowSec(),
}) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat, iss };
  if (aud) body.aud = aud;
  if (ttlSec > 0) body.exp = iat + ttlSec;

  const encodedHeader = b64uEncodeJson(header);
  const encodedPayload = b64uEncodeJson(body);
  const data = `${encodedHeader}.${encodedPayload}`;

  const sig = createHmac("sha256", key).update(data).digest();
  const encodedSig = b64url(sig);
  return `${data}.${encodedSig}`;
}

/**
 * Verify HS256 JWT and basic claims.
 * Returns { ok, payload?, reason? }
 */
export function verifyJwtHs256({
  token,
  key,
  iss = "tgl",
  aud,
  now = nowSec(),
  clockSkewSec = 0,
}) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "format" };
    const [h, p, s] = parts;

    const header = b64uDecodeJson(h);
    if (header?.alg !== "HS256" || header?.typ !== "JWT") {
      return { ok: false, reason: "header" };
    }

    // Verify signature (constant-time)
    const data = `${h}.${p}`;
    const expectedSig = createHmac("sha256", key).update(data).digest();
    const gotSig = fromB64url(s);
    if (
      expectedSig.length !== gotSig.length ||
      !timingSafeEqual(expectedSig, gotSig)
    ) {
      return { ok: false, reason: "sig" };
    }

    const payload = b64uDecodeJson(p);

    if (iss && payload.iss !== iss) return { ok: false, reason: "iss" };
    if (aud) {
      const a = payload.aud;
      const audOk =
        typeof a === "string"
          ? a === aud
          : Array.isArray(a)
          ? a.includes(aud)
          : false;
      if (!audOk) return { ok: false, reason: "aud" };
    }

    if (typeof payload.nbf === "number" && now + clockSkewSec < payload.nbf) {
      return { ok: false, reason: "nbf" };
    }
    if (typeof payload.exp === "number" && now - clockSkewSec >= payload.exp) {
      return { ok: false, reason: "exp" };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "parse" };
  }
}
