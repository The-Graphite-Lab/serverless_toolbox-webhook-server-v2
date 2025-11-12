// index.mjs — toolbox_webhook_server (refactored)
// Main entry point for the Lambda function

import { handleGetRequest } from "./handlers/get.mjs";
import { handlePostRequest } from "./handlers/post.mjs";
import { PASSWORD_PAGE_HTML } from "./auth/password.mjs";
import {
  buildCookieDeletionCookie,
  COGNITO_ID_TOKEN_COOKIE,
  COGNITO_REFRESH_TOKEN_COOKIE,
} from "./auth/cookie.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Normalize HTTP API event to REST API format for backward compatibility
// ─────────────────────────────────────────────────────────────────────────────
function normalizeEvent(event) {
  // HTTP API format detection
  const isHttpApi = event.requestContext?.http?.method !== undefined;

  if (isHttpApi) {
    // HTTP API pathParameters uses {proxy+} key, extract it
    let proxyPath =
      event.pathParameters?.proxy || event.pathParameters?.instanceID;

    // Strip /instance/ prefix if present (common path prefix)
    if (proxyPath && proxyPath.startsWith("instance/")) {
      proxyPath = proxyPath.substring("instance/".length);
    }

    // HTTP API doesn't auto-decode base64 bodies like REST API does
    // Decode it here to maintain compatibility
    let body = event.body || "";
    const isBase64Encoded = event.isBase64Encoded || false;
    if (isBase64Encoded && body) {
      body = Buffer.from(body, "base64").toString("utf-8");
    }

    // Normalize HTTP API event to REST API format
    return {
      ...event,
      httpMethod: event.requestContext.http.method,
      path:
        event.rawPath || event.requestContext.http.path || event.path || "/",
      // Normalize pathParameters - HTTP API uses 'proxy' for {proxy+}
      pathParameters: proxyPath
        ? {
            instanceID: proxyPath,
            proxy: proxyPath, // Keep both for compatibility
          }
        : event.pathParameters || {},
      queryStringParameters: event.queryStringParameters || {},
      // HTTP API headers are often lowercase, normalize them
      headers: normalizeHeaders(event.headers || {}),
      body: body, // Use decoded body
      isBase64Encoded: false, // Mark as decoded
      requestContext: {
        ...event.requestContext,
        identity: {
          sourceIp:
            event.requestContext.http.sourceIp ||
            event.requestContext.identity?.sourceIp ||
            "0.0.0.0",
        },
      },
      rawPath:
        event.rawPath || event.requestContext.http.path || event.path || "/",
    };
  }

  // Already REST API format or unknown format - return as-is
  return event;
}

// Normalize headers to handle HTTP API lowercase headers
function normalizeHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    // HTTP API often sends headers in lowercase
    const normalizedKey = key.toLowerCase();
    normalized[normalizedKey] = value;
    // Also keep original case for compatibility
    normalized[key] = value;
  }
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lambda Handler
// ─────────────────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  let headers = { "Content-Type": "text/html" };
  let statusCode = "200";
  let body;

  // Normalize event format (HTTP API -> REST API)
  const normalizedEvent = normalizeEvent(event);

  // Get origin from request headers for CORS
  const requestOrigin =
    normalizedEvent.headers?.origin || normalizedEvent.headers?.Origin || "*";

  try {
    switch (normalizedEvent.httpMethod) {
      case "GET": {
        const response = await handleGetRequest(normalizedEvent);
        // Add CORS headers to response
        return addCorsHeaders(response, requestOrigin);
      }

      case "POST": {
        // Handle logout endpoint
        const path = normalizedEvent.path || normalizedEvent.rawPath || "";
        if (path.endsWith("/logout") || path === "/logout") {
          const cookies = [
            buildCookieDeletionCookie(COGNITO_ID_TOKEN_COOKIE),
            buildCookieDeletionCookie(COGNITO_REFRESH_TOKEN_COOKIE),
          ];
          return {
            statusCode: "200",
            headers: {
              "Content-Type": "application/json",
            },
            cookies: cookies, // API Gateway v2 uses cookies array
            body: JSON.stringify({ ok: true }),
          };
        }

        const response = await handlePostRequest(normalizedEvent);
        // Add CORS headers to response
        return addCorsHeaders(response, requestOrigin);
      }

      default: {
        statusCode = "405";
        body =
          "Method Not Allowed. This service only supports GET and POST requests.";
      }
    }
  } catch (err) {
    // Error handling
    console.error("Handler error:", err);
    statusCode = "400";
    const path = normalizedEvent.path || normalizedEvent.rawPath || "";
    if (path.includes("/webhooks/instances/")) {
      headers = { "Content-Type": "text/html" };
      body = PASSWORD_PAGE_HTML;
    } else {
      body = "Internal Server Error";
    }
  }

  return addCorsHeaders({ statusCode, body, headers }, requestOrigin);
};

// Add CORS headers to response
function addCorsHeaders(response, origin) {
  // Allow both web.thegraphitelab.com and webhooks.thegraphitelab.com
  const allowedOrigins = [
    "https://web.thegraphitelab.com",
    "https://webhooks.thegraphitelab.com",
  ];

  const isAllowedOrigin = origin && allowedOrigins.includes(origin);
  const corsOrigin = isAllowedOrigin ? origin : origin === "*" ? "*" : origin;

  const corsHeaders = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Cookie, Accept",
    "Access-Control-Allow-Credentials": isAllowedOrigin ? "true" : "false",
    "Access-Control-Max-Age": "86400",
  };

  return {
    ...response,
    headers: {
      ...response.headers,
      ...corsHeaders,
    },
    // Preserve cookies array if present (API Gateway v2 format)
    cookies: response.cookies,
  };
}
