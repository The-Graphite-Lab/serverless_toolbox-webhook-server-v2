# Authenticated S3 Upload URLs

This document explains how the authenticated S3 upload URL feature works in the webhook server.

## Overview

The webhook server now supports generating authenticated presigned S3 URLs that allow clients to upload large files directly to S3 without passing through the Lambda function. This is particularly useful for:

- Large file uploads (recordings, videos, images)
- Reducing Lambda execution time and costs
- Avoiding API Gateway payload size limits (10MB)
- Better upload performance and reliability

## Architecture

### Authentication Flow

1. **JWT Cookie Verification**: The endpoint verifies the JWT cookie using the same logic as your authorizer Lambda:

   - Extracts `instanceId` from the request path
   - Loads instance and webhook data from DynamoDB
   - Retrieves client secret from Secrets Manager
   - Derives cookie signing key: `HMAC-SHA256(clientSecret, "JWT_COOKIE|" + instanceId)`
   - Verifies JWT signature and claims (issuer, audience, expiration, token version)

2. **CSRF Protection** (optional): If configured via environment variables:
   - Validates Origin/Referer headers against allowed origins
   - Checks X-Requested-With header if required

### API Endpoints

#### 1. Generate Upload URL

```
POST /instances/{instanceId}/upload-url
```

**Request Headers:**

- `Cookie`: Must contain valid JWT token in `tgl_wi_auth.{instanceId}` cookie
- `Content-Type`: application/json
- `X-Requested-With`: XMLHttpRequest (if CSRF protection enabled)

**Request Body:**

```json
{
  "filename": "recording.mp4",
  "contentType": "video/mp4",
  "contentLength": 123456 // Optional, for size validation
}
```

**Response:**

```json
{
  "uploadUrl": "https://s3.amazonaws.com/...",
  "fileKey": "webhooks/files/{instanceId}/{timestamp}-{random}/recording.mp4",
  "bucket": "your-bucket-name",
  "expiresAt": "2024-01-01T00:00:00Z",
  "method": "PUT",
  "headers": {
    "Content-Type": "video/mp4"
  }
}
```

#### 2. Confirm Upload (Optional)

```
POST /instances/{instanceId}/upload-complete
```

**Request Body:**

```json
{
  "fileKey": "webhooks/files/{instanceId}/...",
  "size": 123456
}
```

**Response:**

```json
{
  "ok": true,
  "fileKey": "webhooks/files/{instanceId}/...",
  "s3Url": "s3://bucket/webhooks/files/{instanceId}/..."
}
```

## Security Features

1. **Instance Isolation**: Each instance can only generate URLs for its own S3 prefix
2. **JWT Verification**: Same security as your authorizer Lambda
3. **Token Version Check**: Revoked tokens are rejected
4. **Filename Sanitization**: Prevents path traversal attacks
5. **Time-Limited URLs**: Presigned URLs expire after 15 minutes (configurable)
6. **Server-Side Encryption**: Files are encrypted at rest in S3

## Environment Variables

```bash
# S3 Configuration (existing)
S3_BUCKET=your-bucket-name
S3_FILE_PREFIX=webhooks/files
S3_PRESIGNED_URL_EXPIRY=900  # 15 minutes

# Upload Configuration
UPLOAD_URL_EXPIRY=900        # Presigned URL expiry in seconds
MAX_UPLOAD_SIZE=104857600    # Maximum file size in bytes (100MB default)

# CSRF Protection (optional)
ENFORCE_ORIGIN=1
ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
REQUIRE_XRW=1
```

## Client Implementation

### Basic Upload Flow

```javascript
// 1. Get authenticated upload URL
const response = await fetch(`/instances/${instanceId}/upload-url`, {
  method: "POST",
  credentials: "include", // Include cookies
  headers: {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
  body: JSON.stringify({
    filename: "recording.mp4",
    contentType: "video/mp4",
  }),
});

const { uploadUrl, fileKey } = await response.json();

// 2. Upload directly to S3
await fetch(uploadUrl, {
  method: "PUT",
  headers: {
    "Content-Type": "video/mp4",
  },
  body: fileBlob,
});

// 3. (Optional) Confirm upload
await fetch(`/instances/${instanceId}/upload-complete`, {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fileKey: fileKey,
    size: fileBlob.size,
  }),
});
```

## Key Differences from Authorizer Lambda

While the JWT verification logic is identical, there are some implementation differences:

1. **Synchronous vs Asynchronous**: The webhook server performs JWT verification within the request handler rather than as a separate authorizer
2. **Cookie Key Derivation**: Uses a domain-separated approach to avoid key reuse
3. **Error Responses**: Returns JSON error responses instead of IAM policies

## Benefits

1. **Performance**: Large files upload directly to S3, bypassing Lambda
2. **Cost**: Reduced Lambda execution time and data transfer costs
3. **Reliability**: S3's multipart upload support for large files
4. **Scalability**: No Lambda timeout constraints (15 minutes max)
5. **Security**: Same authentication as your existing system

## Future Enhancements

Consider adding:

1. Multipart upload support for very large files
2. Upload progress webhooks
3. Automatic virus scanning integration
4. File type validation
5. Quota management per instance
