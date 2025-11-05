// auth/password.mjs - Password page and authentication handling

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  deriveSigningKey,
  verifyCompactToken,
  createJwtHs256,
  verifyJwtHs256,
  deriveCookieSigningKey,
  nowSec,
} from "../helperToken/token.mjs";
import { getClientSecret } from "../helperToken/clientSecret.mjs";
import { getCookieMap, cookieNameFor } from "./cookie.mjs";
import { verifyCognitoAuthAndAuthorization } from "./cognito.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PASSWORD_PAGE_HTML = readFileSync(
  join(__dirname, "../pages/password.html"),
  "utf8"
);
export const COGNITO_LOGIN_PAGE_HTML = readFileSync(
  join(__dirname, "../pages/cognito-login.html"),
  "utf8"
);
export const ACCESS_DENIED_PAGE_HTML = readFileSync(
  join(__dirname, "../pages/access-denied.html"),
  "utf8"
);

// Verify access via query token or JWT cookie, or return password page
export async function verifyAccessOrPasswordPage(instance, webhook, event) {
  // NEW: Check for Cognito user authentication first
  if (webhook?.authenticationType === "user") {
    const cognitoResult = await verifyCognitoAuthAndAuthorization(
      event,
      instance,
      webhook
    );

    if (cognitoResult.authenticated && cognitoResult.authorized) {
      // User is authenticated and authorized - return success with tokens if refreshed
      return {
        ok: true,
        cognitoTokens: cognitoResult.tokens,
        user: cognitoResult.user,
      };
    }

    if (cognitoResult.authenticated && !cognitoResult.authorized) {
      // User is authenticated but not authorized - show access denied page
      return {
        ok: false,
        html: ACCESS_DENIED_PAGE_HTML,
        reason: "unauthorized",
      };
    }

    // Not authenticated - show Cognito login page
    return {
      ok: false,
      html: COGNITO_LOGIN_PAGE_HTML,
      reason: "not_authenticated",
    };
  }

  // Legacy password protection flow
  if (!webhook?.passwordProtected) return { ok: true };

  const qsToken = event.queryStringParameters?.token;
  // API Gateway v2 sends cookies as an array in event.cookies
  const cookieSource = event.cookies
    ? event.cookies.join("; ")
    : event.headers?.cookie || event.headers?.Cookie || "";
  const cookieMap = getCookieMap(cookieSource);
  const cookieToken = cookieMap?.[cookieNameFor(instance.id)];

  // 1) If qs token present AND instance.authKey exists, try compact verify (legacy)
  if (qsToken && instance?.authKey) {
    try {
      const clientSecret = await getClientSecret(webhook.ClientID);
      const legacyKey = deriveSigningKey(clientSecret, instance.authKey);
      const res = verifyCompactToken({
        token: qsToken,
        signingKey: legacyKey,
        instanceId: instance.id,
        tokenVersion: instance.tokenVersion >>> 0,
        nowSec: nowSec(),
      });

      if (res.ok) return { ok: true };
    } catch (e) {
      // verifyAccess (?token legacy) error
    }
    // If qs token provided but invalid, show password page immediately
    return { ok: false, html: PASSWORD_PAGE_HTML };
  }

  // 2) Else, try JWT cookie (does NOT require instance.authKey)
  if (cookieToken) {
    try {
      const clientSecret = await getClientSecret(webhook.ClientID);
      const cookieKey = deriveCookieSigningKey(clientSecret, instance.id); // per-instance key
      const aud = `wi:${instance.id}`;
      const v = verifyJwtHs256({
        token: cookieToken,
        key: cookieKey,
        iss: "tgl",
        aud,
        now: nowSec(),
        clockSkewSec: 60,
      });
      if (!v.ok) {
        console.warn("JWT cookie verify failed:", v.reason);
        return { ok: false, html: PASSWORD_PAGE_HTML };
      }
      const p = v.payload || {};
      if (p.iid !== instance.id) return { ok: false, html: PASSWORD_PAGE_HTML };
      if (p.tv >>> 0 !== instance.tokenVersion >>> 0) {
        return { ok: false, html: PASSWORD_PAGE_HTML }; // revoked
      }
      return { ok: true };
    } catch (e) {
      // verifyAccess (cookie) error
      return { ok: false, html: PASSWORD_PAGE_HTML };
    }
  }

  // Neither present → show password page
  return { ok: false, html: PASSWORD_PAGE_HTML };
}
