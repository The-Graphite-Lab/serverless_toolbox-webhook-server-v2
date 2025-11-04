// services/event.mjs - Event creation and management

import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient, TABLES } from "../config/aws.mjs";

export async function createInstanceEvent(
  UserID,
  webhookInstanceID,
  type,
  body,
  ipAddress,
  queryParams,
  headers,
  s3FilePath
) {
  const createParams = {
    TableName: TABLES.WEBHOOK_INSTANCE_EVENTS,
    Item: {
      id: uuidv4(),
      UserID,
      WebhookInstanceID: webhookInstanceID,
      type,
      body,
      s3FilePath,
      ipAddress,
      queryParams,
      headers,
      __typename: "WebhookInstanceEvent",
      _lastChangedAt: Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _version: 1,
    },
  };
  await docClient.send(new PutCommand(createParams));
  return createParams;
}

export async function getMostRecentSubmitEvent(webhookInstanceID) {
  const queryParams = {
    TableName: TABLES.WEBHOOK_INSTANCE_EVENTS,
    IndexName: "byWebhookInstance",
    KeyConditionExpression: "WebhookInstanceID = :webhookInstanceID",
    FilterExpression: "#type = :type",
    ExpressionAttributeValues: {
      ":webhookInstanceID": webhookInstanceID,
      ":type": "submit",
    },
    ExpressionAttributeNames: { "#type": "type" },
    ScanIndexForward: false,
  };
  const response = await docClient.send(new QueryCommand(queryParams));
  return response.Items?.[0];
}
