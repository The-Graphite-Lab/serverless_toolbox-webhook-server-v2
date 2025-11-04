// services/subscription.mjs - Subscription handling

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import axios from "axios";
import { docClient, TABLES } from "../config/aws.mjs";

export async function querySubscriptions(webhookID) {
  const subscriptions = [];
  let lastEvaluatedKey;
  do {
    const queryParams = {
      TableName: TABLES.SUBSCRIPTIONS,
      IndexName: "webhookID-index",
      KeyConditionExpression: "webhookID = :webhookID",
      ExpressionAttributeValues: { ":webhookID": webhookID },
    };
    if (lastEvaluatedKey) queryParams.ExclusiveStartKey = lastEvaluatedKey;
    const response = await docClient.send(new QueryCommand(queryParams));
    subscriptions.push(...response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return subscriptions;
}

export async function sendInstanceData(url, instanceData) {
  try {
    await axios.post(url, instanceData);
  } catch (error) {
    // Error sending data to webhook URL
  }
}
