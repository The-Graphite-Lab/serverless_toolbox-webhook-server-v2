// config/aws.mjs - AWS service client configurations

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

// Get region from environment variable or default to us-east-2
const region = process.env.AWS_REGION || process.env.REGION || "us-east-2";

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region });
export const docClient = DynamoDBDocumentClient.from(dynamoClient);
export const s3Client = new S3Client({ region });

// Table names from environment variables
export const TABLES = {
  WEBHOOK_INSTANCES: process.env.WEBHOOK_INSTANCES_TABLE || "WebhookInstances-bm44urfj6bcajm63ohamnsj4au-staging",
  WEBHOOK_INSTANCE_EVENTS:
    process.env.WEBHOOK_INSTANCE_EVENTS_TABLE || "WebhookInstanceEvents-bm44urfj6bcajm63ohamnsj4au-staging",
  WEBHOOKS: process.env.WEBHOOKS_TABLE || "Webhooks-bm44urfj6bcajm63ohamnsj4au-staging",
  SUBSCRIPTIONS: process.env.SUBSCRIPTIONS_TABLE || "Toolbox_Webhook_Subscriptions",
  CLIENTS: process.env.CLIENTS_TABLE || "Clients-bm44urfj6bcajm63ohamnsj4au-staging",
};

// S3 configuration from environment variables
export const S3_CONFIG = {
  BUCKET: process.env.S3_BUCKET || "tgltoolboxuserfiles210135-staging",
  FILE_PREFIX: process.env.S3_FILE_PREFIX || "public/clientWebhookInstanceFiles",
  PRESIGNED_URL_EXPIRY: parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || "10800", 10), // 3 hours default
};
