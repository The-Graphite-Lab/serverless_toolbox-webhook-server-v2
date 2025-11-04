# Implementation Notes: Authenticated S3 Upload URLs

## Key Implementation Details

### 1. Cookie Signing Key Derivation

The JWT cookie signing key is derived using:

```javascript
createHmac("sha256", clientSecret)
  .update(Buffer.from("JWT_COOKIE|", "utf8"))
  .update(Buffer.from(String(instanceId), "utf8"))
  .digest();
```

This uses a domain-separated approach. The key points:

- Uses `"JWT_COOKIE|"` prefix to avoid key reuse with other HMAC operations
- Explicit string conversion and UTF-8 encoding for consistency
- No `authKey` required (unlike compact tokens)
- Each instance has its own unique signing key

### 2. Secret Naming Convention

The webhook server uses the pattern:

```javascript
const name = `Client_${clientId}_EncodingSecret`;
```

This differs from the example authorizer's `webhook-secrets/${clientId}` pattern. Ensure your Secrets Manager uses the correct naming convention for your environment.

### 3. JWT Cookie Structure

The JWT cookies created by the webhook server contain:

```javascript
{
  iid: instance.id,      // Instance ID
  tv: instance.tokenVersion, // Token version (for revocation)
  iat: timestamp,        // Issued at
  exp: timestamp,        // Expiration
  iss: "tgl",           // Issuer
  aud: `wi:${instance.id}` // Audience
}
```

### 4. Authentication Flow

1. **Password Authentication** → JWT Cookie:

   - POST to `/instances/{instanceId}/auth` with password
   - Server validates password
   - Server creates JWT and sets HttpOnly cookie
   - Cookie name: `tgl_wi_auth.{instanceId}`

2. **Upload URL Request** → JWT Verification:
   - POST to `/instances/{instanceId}/upload-url` with cookie
   - Server extracts and verifies JWT
   - Validates token version hasn't changed
   - Returns presigned S3 PUT URL

### 5. S3 Key Structure

Uploaded files are stored with the pattern:

```
public/clientWebhookInstanceFiles/{instanceId}/{timestamp}-{randomId}/{filename}
```

This ensures:

- Instance isolation (each instance has its own prefix)
- No filename collisions (timestamp + random ID)
- Original filename preservation

### 6. Security Considerations

1. **Token Revocation**: The `tokenVersion` field in the instance allows invalidating all existing tokens
2. **Instance Isolation**: JWT verification ensures users can only generate URLs for their authenticated instance
3. **Time-Limited URLs**: Presigned URLs expire after 15 minutes by default
4. **CSRF Protection**: Optional Origin and X-Requested-With header validation

### 7. Environment Variables

Required:

```bash
# AWS Configuration
AWS_REGION=us-east-2

# S3 Configuration
S3_BUCKET=tgltoolboxuserfiles210135-staging
S3_FILE_PREFIX=public/clientWebhookInstanceFiles
S3_PRESIGNED_URL_EXPIRY=900

# Optional Security
ENFORCE_ORIGIN=0
ALLOWED_ORIGINS=
REQUIRE_XRW=0
MAX_UPLOAD_SIZE=104857600
UPLOAD_URL_EXPIRY=900
```

### 8. Error Handling

The implementation provides specific error messages:

- `"Instance not found"` - Invalid instance ID
- `"Authentication required"` - Missing JWT cookie
- `"Token has been revoked"` - Token version mismatch
- `"Token expired"` - JWT past expiration
- `"Invalid content length"` - File too large

### 9. Testing Checklist

Before deploying, verify:

- [ ] JWT cookies from password auth work with upload URL endpoint
- [ ] Token version changes properly revoke access
- [ ] S3 bucket permissions allow Lambda to generate presigned URLs
- [ ] File size limits are enforced if configured
- [ ] CORS headers are properly configured on your API Gateway
- [ ] Presigned URLs successfully upload to S3

### 10. Common Issues

1. **Cookie Not Sent**: Ensure `credentials: 'include'` in fetch requests
2. **CORS Errors**: API Gateway must allow credentials and proper origins
3. **S3 Permissions**: Lambda role needs `s3:PutObject` and `s3:PutObjectAcl`
4. **Clock Skew**: 60-second tolerance built in for JWT verification
