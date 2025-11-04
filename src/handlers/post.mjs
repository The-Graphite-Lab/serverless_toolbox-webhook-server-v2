// handlers/post.mjs - POST request handler

import { resolveInstanceId, loadInstance } from "../services/instance.mjs";
import { loadWebhook } from "../services/webhook.mjs";
import { createInstanceEvent } from "../services/event.mjs";
import {
  querySubscriptions,
  sendInstanceData,
} from "../services/subscription.mjs";
import {
  verifyAccessOrPasswordPage,
  PASSWORD_PAGE_HTML,
} from "../auth/password.mjs";
import { parseFormData } from "../utils/parser.mjs";
import { uploadFileToS3, generatePresignedUrl } from "../utils/s3.mjs";
import { S3_CONFIG } from "../config/aws.mjs";
import {
  buildAuthCookie,
  cookieNameFor,
  COOKIE_TTL_SEC,
} from "../auth/cookie.mjs";
import {
  createJwtHs256,
  deriveCookieSigningKey,
  nowSec,
} from "../helperToken/token.mjs";
import { getClientSecret } from "../helperToken/clientSecret.mjs";
import {
  handleUploadUrlRequest,
  handleUploadCompleteRequest,
} from "./uploadUrl.mjs";

export async function handlePostRequest(event) {
  // Check if this is an upload URL request
  if (event.path?.includes("/upload-url")) {
    return await handleUploadUrlRequest(event);
  }

  // Check if this is an upload complete notification
  if (event.path?.includes("/upload-complete")) {
    return await handleUploadCompleteRequest(event);
  }
  const rawPath = event.path || "";
  const isAuthExchange =
    rawPath.endsWith("/auth") || event.queryStringParameters?.auth === "1";

  let greedy = event.pathParameters?.instanceID;
  if (typeof greedy === "string") {
    try {
      greedy = decodeURIComponent(greedy);
    } catch {}
  }
  const instanceID = await resolveInstanceId(greedy);
  const instance = await loadInstance(instanceID);
  const webhook = await loadWebhook(instance.WebhookID);

  // Handle authentication exchange
  if (isAuthExchange && webhook.passwordProtected) {
    const payload = event.body ? JSON.parse(event.body) : {};
    const provided = payload?.password || "";
    const expected = instance?.password || "";

    if (!provided || provided !== expected) {
      return {
        statusCode: "401",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid password" }),
      };
    }

    // Derive cookie key (NO authKey required)
    const clientSecret = await getClientSecret(webhook.ClientID);
    const cookieKey = deriveCookieSigningKey(clientSecret, instance.id);

    // Issue JWT cookie bound to instance
    const jwtCookie = createJwtHs256({
      key: cookieKey,
      payload: { iid: instance.id, tv: instance.tokenVersion >>> 0 },
      ttlSec: COOKIE_TTL_SEC,
      iss: "tgl",
      aud: `wi:${instance.id}`,
      iat: nowSec(),
    });

    const setCookie = buildAuthCookie({
      name: cookieNameFor(instance.id),
      token: jwtCookie,
      maxAgeSec: COOKIE_TTL_SEC,
      path: "/instance/",
    });

    return {
      statusCode: "200",
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setCookie,
      },
      body: JSON.stringify({ ok: true }),
    };
  }

  // Normal submit (auth enforced if protected)
  if (webhook.passwordProtected) {
    const gate = await verifyAccessOrPasswordPage(instance, webhook, event);
    if (!gate.ok) {
      return {
        statusCode: "401",
        headers: { "Content-Type": "text/html" },
        body: PASSWORD_PAGE_HTML,
      };
    }
  }

  let data = parseFormData(event.body);
  let instanceEventResponse;

  if (data.files?.length) {
    for (let i = 0; i < data.files.length; i++) {
      const file = data.files[i];
      const s3Key = `${S3_CONFIG.FILE_PREFIX}/${instanceID}/${file.filename}`;

      await uploadFileToS3(S3_CONFIG.BUCKET, s3Key, file);

      const s3FilePath = `s3://${S3_CONFIG.BUCKET}/${s3Key}`;
      file.filePath = s3FilePath;

      const presignedUrl = await generatePresignedUrl(S3_CONFIG.BUCKET, s3Key);
      file.fileUrl = presignedUrl;

      delete file.filename;
      delete file.content;
      delete file.contentType;
    }

    instanceEventResponse = await createInstanceEvent(
      instance.UserID,
      instanceID,
      "submit",
      JSON.stringify(data),
      event.requestContext.identity.sourceIp,
      JSON.stringify(event.queryStringParameters),
      JSON.stringify(event.headers),
      null // s3FilePath is handled within the file objects
    );
  } else {
    instanceEventResponse = await createInstanceEvent(
      instance.UserID,
      instanceID,
      "submit",
      JSON.stringify(data),
      event.requestContext.identity.sourceIp,
      JSON.stringify(event.queryStringParameters),
      JSON.stringify(event.headers),
      null
    );
  }

  const subscriptions = await querySubscriptions(instance.WebhookID);
  for (const subscription of subscriptions) {
    if (subscription.type === "submit") {
      await sendInstanceData(subscription.url, {
        ...instanceEventResponse.Item,
        instance,
        fileUrl: data.fileUrl,
      });
    }
  }

  return {
    statusCode: "200",
    headers: { "Content-Type": "text/html" },
    body: "success",
  };
}
