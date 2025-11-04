// services/webhook.mjs - Webhook-related operations

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "../config/aws.mjs";

export async function loadWebhook(webhookID) {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLES.WEBHOOKS,
      Key: { id: webhookID },
    })
  );
  if (!res.Item) throw new Error("Webhook not found");
  return res.Item;
}
