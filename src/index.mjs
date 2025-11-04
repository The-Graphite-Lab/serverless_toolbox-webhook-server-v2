// index.mjs — toolbox_webhook_server (refactored)
// Main entry point for the Lambda function

import { handleGetRequest } from "./handlers/get.mjs";
import { handlePostRequest } from "./handlers/post.mjs";
import { PASSWORD_PAGE_HTML } from "./auth/password.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Normalize HTTP API event to REST API format for backward compatibility
// ─────────────────────────────────────────────────────────────────────────────
function normalizeEvent(event) {
  // HTTP API format detection
  const isHttpApi = event.requestContext?.http?.method !== undefined;

  if (isHttpApi) {
    // HTTP API pathParameters uses {proxy+} key, extract it
    let proxyPath = event.pathParameters?.proxy || event.pathParameters?.instanceID;
    
    // Strip /instance/ prefix if present (common path prefix)
    if (proxyPath && proxyPath.startsWith("instance/")) {
      proxyPath = proxyPath.substring("instance/".length);
      console.log("Stripped /instance/ prefix, proxyPath now:", proxyPath);
    }
    
    // Normalize HTTP API event to REST API format
    return {
      ...event,
      httpMethod: event.requestContext.http.method,
      path: event.rawPath || event.requestContext.http.path || event.path || "/",
      // Normalize pathParameters - HTTP API uses 'proxy' for {proxy+}
      pathParameters: proxyPath ? {
        instanceID: proxyPath,
        proxy: proxyPath, // Keep both for compatibility
      } : event.pathParameters || {},
      queryStringParameters: event.queryStringParameters || {},
      // HTTP API headers are often lowercase, normalize them
      headers: normalizeHeaders(event.headers || {}),
      body: event.body || "",
      isBase64Encoded: event.isBase64Encoded || false,
      requestContext: {
        ...event.requestContext,
        identity: {
          sourceIp: event.requestContext.http.sourceIp || event.requestContext.identity?.sourceIp || "0.0.0.0",
        },
      },
      rawPath: event.rawPath || event.requestContext.http.path || event.path || "/",
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

  // Log raw event for debugging
  console.log("=== RAW EVENT ===");
  console.log(JSON.stringify(event, null, 2));

  // Normalize event format (HTTP API -> REST API)
  const normalizedEvent = normalizeEvent(event);

  // Log normalized event for debugging
  console.log("=== NORMALIZED EVENT ===");
  console.log(JSON.stringify(normalizedEvent, null, 2));
  console.log("=== EVENT DETAILS ===");
  console.log("httpMethod:", normalizedEvent.httpMethod);
  console.log("path:", normalizedEvent.path);
  console.log("rawPath:", normalizedEvent.rawPath);
  console.log("pathParameters:", JSON.stringify(normalizedEvent.pathParameters));
  console.log("queryStringParameters:", JSON.stringify(normalizedEvent.queryStringParameters));
  console.log("headers:", JSON.stringify(normalizedEvent.headers));

  // Get origin from request headers for CORS
  const requestOrigin = normalizedEvent.headers?.origin || normalizedEvent.headers?.Origin || "*";

  try {
    switch (normalizedEvent.httpMethod) {
      case "GET": {
        const response = await handleGetRequest(normalizedEvent);
        // Add CORS headers to response
        return addCorsHeaders(response, requestOrigin);
      }

      case "POST": {
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
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin === "*" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, Accept",
    "Access-Control-Allow-Credentials": origin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400",
  };

  return {
    ...response,
    headers: {
      ...response.headers,
      ...corsHeaders,
    },
  };
}
