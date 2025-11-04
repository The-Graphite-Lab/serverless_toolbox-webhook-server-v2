// handlers/get.mjs - GET request handler

import {
  resolveInstanceId,
  loadInstance,
  updateWebhookInstance,
} from "../services/instance.mjs";
import { loadWebhook } from "../services/webhook.mjs";
import { getMostRecentSubmitEvent } from "../services/event.mjs";
import {
  verifyAccessOrPasswordPage,
  PASSWORD_PAGE_HTML,
} from "../auth/password.mjs";
import {
  replaceHtmlVariables,
  replaceHtmlWithEvent,
  buildHtmlDocument,
} from "../utils/html.mjs";
import { getSignedUrlsForFiles } from "../utils/s3.mjs";
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
import { loadClient } from "../services/client.mjs";

export async function handleGetRequest(event) {
  const accept = event?.headers?.accept;
  if (!accept?.includes("text/html")) throw new Error("webpage not accessible");

  let greedy = event.pathParameters?.instanceID;
  if (typeof greedy === "string") {
    try {
      greedy = decodeURIComponent(greedy);
    } catch {}
  }
  const instanceID = await resolveInstanceId(greedy);
  const instance = await loadInstance(instanceID);
  const webhook = await loadWebhook(instance.WebhookID);

  // Load client data if available
  const client = await loadClient(webhook.ClientID);

  const gate = await verifyAccessOrPasswordPage(instance, webhook, event);

  if (!gate.ok) {
    return {
      statusCode: "200",
      headers: { "Content-Type": "text/html" },
      body: PASSWORD_PAGE_HTML,
    };
  }

  // NEW: Mint/refresh robust session cookie for this instance
  let headers = { "Content-Type": "text/html" };
  try {
    const clientSecret = await getClientSecret(webhook.ClientID);
    const cookieKey = deriveCookieSigningKey(clientSecret, instance.id);
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
    headers = { ...headers, "Set-Cookie": setCookie };
  } catch (e) {
    // cookie mint (GET) failed
    // Do not break the page; gating already passed
  }

  await updateWebhookInstance(instanceID);

  const inputs = JSON.parse(instance.inputs || "{}");
  const recentSubmitEvent = await getMostRecentSubmitEvent(instanceID);
  let postEvent = {};
  if (recentSubmitEvent) {
    postEvent = JSON.parse(recentSubmitEvent.body);
    if (postEvent.files?.length)
      postEvent.files = await getSignedUrlsForFiles(postEvent.files);
  }

  let htmlString = webhook.html;
  const cssString = webhook.style;
  const title = webhook.title;
  const favicon = webhook?.favicon;

  // Merge inputs with client data for variable replacement
  const templateData = {
    ...inputs,
    client: client || {},
  };

  htmlString = replaceHtmlVariables(htmlString, templateData);
  if (postEvent) htmlString = await replaceHtmlWithEvent(htmlString, postEvent);

  const body = buildHtmlDocument({
    title,
    favicon,
    cssString,
    htmlString,
    instanceId: instance.id,
    webhookId: instance.WebhookID,
    client,
  });

  return {
    statusCode: "200",
    headers,
    body,
  };
}
