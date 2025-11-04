// handlers/uploadUrl.mjs - Generate authenticated S3 upload URLs

import { verifyJWTForAPI, validateCSRFHeaders } from "../auth/jwt.mjs";
import { S3_CONFIG, s3Client } from "../config/aws.mjs";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";

// Environment variables for CSRF protection (optional)
const ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || [];
const ENFORCE_ORIGIN = process.env.ENFORCE_ORIGIN === "1";
const REQUIRE_XRW = process.env.REQUIRE_XRW === "1";

/**
 * Handle POST request to generate S3 upload URL
 * Expected path: /instances/{instanceId}/upload-url
 *
 * Request body:
 * {
 *   "filename": "recording.mp4",
 *   "contentType": "video/mp4",
 *   "contentLength": 123456 (optional, for size validation)
 * }
 *
 * Response:
 * {
 *   "uploadUrl": "https://s3.amazonaws.com/...",
 *   "fileKey": "webhooks/files/{instanceId}/{timestamp}-{random}/recording.mp4",
 *   "expiresAt": "2024-01-01T00:00:00Z"
 * }
 */
export async function handleUploadUrlRequest(event) {
  try {
    // Extract instanceId from path
    const pathMatch = event.path?.match(/^\/instance\/([^\/]+)\/upload-url/);
    if (!pathMatch || !pathMatch[1]) {
      return {
        statusCode: "400",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid path" }),
      };
    }

    const instanceId = pathMatch[1];

    // Validate CSRF headers if configured
    if (ENFORCE_ORIGIN || REQUIRE_XRW) {
      const csrfResult = validateCSRFHeaders(
        event.headers,
        ALLOWED_ORIGINS,
        REQUIRE_XRW
      );
      if (!csrfResult.ok) {
        return {
          statusCode: "403",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: csrfResult.error }),
        };
      }
    }

    // Verify JWT authentication
    const authResult = await verifyJWTForAPI(event, instanceId);
    if (!authResult.ok) {
      return {
        statusCode: "401",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: authResult.error }),
      };
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: "400",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid request body" }),
      };
    }

    const { filename, contentType, contentLength } = requestBody;

    // Validate required fields
    if (!filename || typeof filename !== "string") {
      return {
        statusCode: "400",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing or invalid filename" }),
      };
    }

    // Sanitize filename (remove path traversal attempts)
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Default content type if not provided
    const finalContentType = contentType || "application/octet-stream";

    // Optional: Validate content length if provided
    if (contentLength !== undefined) {
      const maxSize = parseInt(process.env.MAX_UPLOAD_SIZE || "104857600"); // 100MB default
      if (
        typeof contentLength !== "number" ||
        contentLength <= 0 ||
        contentLength > maxSize
      ) {
        return {
          statusCode: "400",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Invalid content length",
            maxSize: maxSize,
          }),
        };
      }
    }

    // Generate unique S3 key
    const timestamp = Date.now();
    const randomId = randomBytes(8).toString("hex");
    const s3Key = `${S3_CONFIG.FILE_PREFIX}/${instanceId}/${timestamp}-${randomId}/${sanitizedFilename}`;

    // Create presigned PUT URL
    const putCommand = new PutObjectCommand({
      Bucket: S3_CONFIG.BUCKET,
      Key: s3Key,
      ContentType: finalContentType,
      // Optional: Add metadata
      Metadata: {
        instanceId: instanceId,
        uploadedAt: new Date().toISOString(),
        originalFilename: filename,
      },
      // Optional: Add server-side encryption
      ServerSideEncryption: "AES256",
    });

    // Generate presigned URL (default 15 minutes expiry)
    const uploadUrlExpiry = parseInt(process.env.UPLOAD_URL_EXPIRY || "900");
    const uploadUrl = await getSignedUrl(s3Client, putCommand, {
      expiresIn: uploadUrlExpiry,
    });

    // Calculate expiration time
    const expiresAt = new Date(
      Date.now() + uploadUrlExpiry * 1000
    ).toISOString();

    // Upload request auditing removed

    return {
      statusCode: "200",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store", // Prevent caching of presigned URLs
      },
      body: JSON.stringify({
        uploadUrl,
        fileKey: s3Key,
        bucket: S3_CONFIG.BUCKET,
        expiresAt,
        // Include helpful information for client
        method: "PUT",
        headers: {
          "Content-Type": finalContentType, // must match
          "x-amz-server-side-encryption": "AES256", // required
          "x-amz-meta-instanceid": instanceId, // required
          "x-amz-meta-uploadedat": new Date().toISOString(), // required
          "x-amz-meta-originalfilename": filename, // required
        },
      }),
    };
  } catch (error) {
    // Upload URL generation error
    return {
      statusCode: "500",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}

/**
 * Optional: Handle POST request to confirm file upload completion
 * This can be used to track successful uploads in DynamoDB
 *
 * Expected path: /instances/{instanceId}/upload-complete
 * Request body:
 * {
 *   "fileKey": "webhooks/files/...",
 *   "size": 123456
 * }
 */
export async function handleUploadCompleteRequest(event) {
  try {
    // Extract instanceId from path
    const pathMatch = event.path?.match(
      /^\/instance\/([^\/]+)\/upload-complete/
    );
    if (!pathMatch || !pathMatch[1]) {
      return {
        statusCode: "400",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid path" }),
      };
    }

    const instanceId = pathMatch[1];

    // Verify JWT authentication
    const authResult = await verifyJWTForAPI(event, instanceId);
    if (!authResult.ok) {
      return {
        statusCode: "401",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: authResult.error }),
      };
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: "400",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid request body" }),
      };
    }

    const { fileKey, size } = requestBody;

    if (!fileKey || typeof fileKey !== "string") {
      return {
        statusCode: "400",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing or invalid fileKey" }),
      };
    }

    // Verify the fileKey belongs to this instance
    const expectedPrefix = `${S3_CONFIG.FILE_PREFIX}/${instanceId}/`;
    if (!fileKey.startsWith(expectedPrefix)) {
      return {
        statusCode: "403",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid fileKey for this instance" }),
      };
    }

    // TODO: Here you could:
    // 1. Create an event in DynamoDB to track the upload
    // 2. Send notifications via subscriptions
    // 3. Trigger any post-processing workflows

    // Upload confirmation logging removed

    return {
      statusCode: "200",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        fileKey,
        s3Url: `s3://${S3_CONFIG.BUCKET}/${fileKey}`,
      }),
    };
  } catch (error) {
    // Upload complete error
    return {
      statusCode: "500",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}
