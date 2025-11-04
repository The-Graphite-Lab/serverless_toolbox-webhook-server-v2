// index.mjs — toolbox_webhook_server (refactored)
// Main entry point for the Lambda function

import { handleGetRequest } from "./handlers/get.mjs";
import { handlePostRequest } from "./handlers/post.mjs";
import { PASSWORD_PAGE_HTML } from "./auth/password.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Lambda Handler
// ─────────────────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  let headers = { "Content-Type": "text/html" };
  let statusCode = "200";
  let body;
  console.log("event", JSON.stringify(event, null, 2));
  console.log("event.httpMethod", event.httpMethod);
  console.log("event.path", event.path);
  console.log("event.body", event.body);
  console.log("event.headers", event.headers);
  console.log("event.queryStringParameters", event.queryStringParameters);
  console.log("event.pathParameters", event.pathParameters);
  console.log("event.requestContext", event.requestContext);
  console.log("event.stageVariables", event.stageVariables);
  console.log("event.isBase64Encoded", event.isBase64Encoded);

  try {
    switch (event.httpMethod) {
      case "GET": {
        return await handleGetRequest(event);
      }

      case "POST": {
        return await handlePostRequest(event);
      }

      default: {
        statusCode = "405";
        body =
          "Method Not Allowed. This service only supports GET and POST requests.";
      }
    }
  } catch (err) {
    // Error handling
    statusCode = "400";
    if ((event.path || "").includes("/webhooks/instances/")) {
      headers = { "Content-Type": "text/html" };
      body = PASSWORD_PAGE_HTML;
    } else {
      body = "Internal Server Error";
    }
  }

  return { statusCode, body, headers };
};
