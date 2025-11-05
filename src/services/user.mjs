// services/user.mjs - User operations

import { docClient, TABLES } from "../config/aws.mjs";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Load a user from DynamoDB by ID
 * @param {string} userId - User ID (matches Cognito 'sub' claim)
 * @returns {Promise<Object|null>} User object or null if not found
 */
export async function loadUser(userId) {
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLES.USERS,
        Key: { id: userId },
      })
    );
    return res.Item || null;
  } catch (error) {
    console.error("Error loading user:", error);
    return null;
  }
}
