// services/instance.mjs - Instance-related operations

import { GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "../config/aws.mjs";

export async function resolveInstanceId(greedy) {
  console.log("resolveInstanceId called with greedy:", greedy);
  if (!greedy) throw new Error("instanceID not found in path parameters");

  if (greedy.endsWith("/auth")) {
    greedy = greedy.slice(0, greedy.length - "/auth".length);
    console.log("Removed /auth suffix, greedy now:", greedy);
  }

  if (greedy.includes("/")) {
    const [webhookID, externalID] = greedy.split("/");
    console.log("Composite ID detected - webhookID:", webhookID, "externalID:", externalID);
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
    console.log("Query result items count:", q.Items?.length || 0);
    const id = q.Items?.[0]?.id;
    if (!id) throw new Error("Instance not found");
    console.log("Resolved composite ID to instanceID:", id);
    return id;
  }
  console.log("Using greedy as direct instanceID:", greedy);
  return greedy;
}

export async function loadInstance(instanceID) {
  console.log("loadInstance called with instanceID:", instanceID);
  console.log("Table name:", TABLES.WEBHOOK_INSTANCES);
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLES.WEBHOOK_INSTANCES,
      Key: { id: instanceID },
    })
  );
  console.log("DynamoDB GetItem result - Item found:", !!res.Item);
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
