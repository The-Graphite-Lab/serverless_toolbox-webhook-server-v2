# Authorizer Lambda Changes Required

The webhook server uses a domain-separated key derivation approach for JWT cookies to avoid key reuse with other HMAC operations. The authorizer lambda needs to be updated to match this pattern.

## Required Change

In your authorizer lambda, locate this section:

```javascript
// Current (incorrect) implementation:
const cookieKey = createHmac("sha256", clientSecret)
  .update(Buffer.from(instanceId))
  .digest();
```

Replace it with:

```javascript
// Updated (correct) implementation:
const cookieKey = createHmac("sha256", clientSecret)
  .update(Buffer.from("JWT_COOKIE|", "utf8"))
  .update(Buffer.from(String(instanceId), "utf8"))
  .digest();
```

## Complete Updated Function

Here's the complete `deriveCookieSigningKey` function that should be added to your authorizer:

```javascript
/**
 * Derive cookie signing key
 * Uses domain separation to avoid key reuse with other HMAC operations
 */
function deriveCookieSigningKey(clientSecret, instanceId) {
  return createHmac("sha256", clientSecret)
    .update(Buffer.from("JWT_COOKIE|", "utf8"))
    .update(Buffer.from(String(instanceId), "utf8"))
    .digest();
}
```

Then update the key derivation call:

```javascript
// Replace this:
const cookieKey = createHmac("sha256", clientSecret)
  .update(Buffer.from(instanceId))
  .digest();

// With this:
const cookieKey = deriveCookieSigningKey(clientSecret, instanceId);
```

## Why This Pattern?

1. **Domain Separation**: The `"JWT_COOKIE|"` prefix ensures these keys are cryptographically isolated from other HMAC operations in your system
2. **Explicit String Conversion**: `String(instanceId)` ensures consistent encoding regardless of input type
3. **UTF-8 Encoding**: Explicit UTF-8 encoding for all string inputs ensures consistency

## Other Considerations

### Secret Name Pattern

The authorizer example uses:

```javascript
const secretName = `webhook-secrets/${clientId}`;
```

But the webhook server uses:

```javascript
const name = `Client_${clientId}_EncodingSecret`;
```

Make sure your authorizer uses the correct secret naming pattern for your environment.

### Complete Authorizer Update Example

Here's the relevant section of your authorizer that needs updating:

```javascript
// Get tenant secret from Secrets Manager
const clientSecret = await getClientSecret(webhook.ClientID);
if (!clientSecret) {
  console.error("Client secret not found for:", webhook.ClientID);
  return generatePolicy("webhook-session", "Deny", event.methodArn, {
    reason: "Client configuration error",
  });
}

// Derive cookie signing key with domain separation
const cookieKey = createHmac("sha256", clientSecret)
  .update(Buffer.from("JWT_COOKIE|", "utf8"))
  .update(Buffer.from(String(instanceId), "utf8"))
  .digest();

// Extract and verify JWT from cookie
const cookieName = `tgl_wi_auth.${instanceId}`;
const token = extractTokenFromCookie(event.headers, cookieName);
```

## Testing the Change

After updating the authorizer:

1. Generate a new JWT cookie through the webhook server's password authentication
2. Make a request to an endpoint protected by the authorizer
3. Verify the authorizer correctly validates the JWT cookie

The key derivation must match exactly between the webhook server and authorizer for authentication to work.
