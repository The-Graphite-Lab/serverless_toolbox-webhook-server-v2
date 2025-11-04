// services/instance.mjs - Instance-related operations

import { GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "../config/aws.mjs";

export async function resolveInstanceId(greedy) {
  if (!greedy) throw new Error("instanceID not found in path parameters");

  if (greedy.endsWith("/auth")) {
    greedy = greedy.slice(0, greedy.length - "/auth".length);
  }

  if (greedy.includes("/")) {
    const [webhookID, externalID] = greedy.split("/");
    const q = await docClient.send(
      new QueryCommand({
        TableName: TABLES.WEBHOOK_INSTANCES,
        IndexName: "byWebhookByExternalID",
        KeyConditionExpression:
          "WebhookID = :webhookID and externalID = :externalID",
        ExpressionAttributeValues: {
          ":webhookID": webhookID,
          ":externalID": externalID,
        },
        Limit: 1,
      })
    );
    const id = q.Items?.[0]?.id;
    if (!id) throw new Error("Instance not found");
    return id;
  }
  return greedy;
}

export async function loadInstance(instanceID) {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLES.WEBHOOK_INSTANCES,
      Key: { id: instanceID },
    })
  );
  if (!res.Item) throw new Error("Instance not found");
  return res.Item;
}

export async function updateWebhookInstance(webhookID) {
  return await docClient.send(
    new UpdateCommand({
      TableName: TABLES.WEBHOOK_INSTANCES,
      Key: { id: webhookID },
      UpdateExpression:
        "SET lastPingedAt = :now, numberOfVisits = if_not_exists(numberOfVisits, :start) + :inc",
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
        ":start": 0,
        ":inc": 1,
      },
      ReturnValues: "UPDATED_NEW",
    })
  );
}
