// auth/jwt.mjs - JWT verification utilities for API endpoints

import {
  verifyJwtHs256,
  deriveCookieSigningKey,
  nowSec,
} from "../helperToken/token.mjs";
import { getClientSecret } from "../helperToken/clientSecret.mjs";
import { getCookieMap, cookieNameFor } from "./cookie.mjs";
import { loadInstance } from "../services/instance.mjs";
import { loadWebhook } from "../services/webhook.mjs";

/**
 * Verify JWT from cookie header for API endpoints
 * This mirrors the logic from the authorizer lambda
 *
 * @param {Object} event - Lambda event object
 * @param {string} instanceId - Instance ID from path
 * @returns {Object} { ok: boolean, error?: string, instance?: Object, webhook?: Object }
 */
export async function verifyJWTForAPI(event, instanceId) {
  try {
    // Load instance from DynamoDB
    const instance = await loadInstance(instanceId);
    if (!instance) {
      return { ok: false, error: "Instance not found" };
    }

    // Load webhook from DynamoDB
    const webhook = await loadWebhook(instance.WebhookID);
    if (!webhook) {
      return { ok: false, error: "Webhook not found" };
    }

    // Get client secret
    const clientSecret = await getClientSecret(webhook.ClientID);
    if (!clientSecret) {
      return { ok: false, error: "Client configuration error" };
    }

    // Derive cookie signing key (matching authorizer logic)
    const cookieKey = deriveCookieSigningKey(clientSecret, instanceId);

    // Extract JWT from cookie
    const cookieMap = getCookieMap(
      event.headers?.cookie || event.headers?.Cookie || ""
    );

    const cookieName = cookieNameFor(instanceId);
    const token = cookieMap[cookieName];

    // Authentication debugging removed

    if (!token) {
      return { ok: false, error: "Authentication required" };
    }

    // Verify JWT with same parameters as authorizer
    const aud = `wi:${instanceId}`;
    const result = verifyJwtHs256({
      token,
      key: cookieKey,
      iss: "tgl",
      aud,
      now: nowSec(),
      clockSkewSec: 60, // Allow 60 seconds clock skew
    });
    // JWT verification result logging removed

    if (!result.ok) {
      return { ok: false, error: "Invalid authentication token" };
    }

    const payload = result.payload || {};

    // Payload debugging removed

    // Verify claims (matching authorizer logic)
    if (payload.iid !== instanceId) {
      return { ok: false, error: "Instance ID mismatch" };
    }

    // Verify token version
    const payloadVersion = parseInt(payload.tv);
    const expectedVersion = parseInt(instance.tokenVersion || 0);

    // Version debugging removed
    if (payloadVersion !== expectedVersion) {
      return { ok: false, error: "Token has been revoked" };
    }

    // Check expiration (already checked in verifyJwtHs256, but being explicit)
    // Expiration debugging removed
    if (payload.exp && payload.exp < nowSec()) {
      return { ok: false, error: "Token expired" };
    }

    return {
      ok: true,
      instance,
      webhook,
      jwtPayload: payload,
    };
  } catch (error) {
    // JWT verification error
    return { ok: false, error: "Internal error" };
  }
}

/**
 * Validate CSRF headers if configured
 * Mirrors the authorizer's CSRF validation logic
 *
 * @param {Object} headers - Request headers
 * @param {Array<string>} allowedOrigins - Allowed origins list
 * @param {boolean} requireXRW - Whether to require X-Requested-With header
 * @returns {Object} { ok: boolean, error?: string }
 */
export function validateCSRFHeaders(
  headers,
  allowedOrigins = [],
  requireXRW = false
) {
  // Normalize headers (API Gateway may lowercase them)
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  // Check Origin/Referer if required
  if (allowedOrigins.length > 0) {
    const origin = normalizedHeaders.origin || normalizedHeaders.referer;

    if (!origin) {
      return { ok: false, error: "Missing Origin/Referer header" };
    }

    try {
      // Check if origin matches any allowed origin
      const originUrl = new URL(origin);
      const originBase = `${originUrl.protocol}//${originUrl.host}`;

      if (!allowedOrigins.some((allowed) => originBase.startsWith(allowed))) {
        return { ok: false, error: "Origin not allowed" };
      }
    } catch (e) {
      return { ok: false, error: "Invalid Origin header" };
    }
  }

  // Check X-Requested-With if required
  if (requireXRW) {
    const xrw = normalizedHeaders["x-requested-with"];
    if (xrw !== "XMLHttpRequest") {
      return { ok: false, error: "Missing or invalid X-Requested-With header" };
    }
  }

  return { ok: true };
}
