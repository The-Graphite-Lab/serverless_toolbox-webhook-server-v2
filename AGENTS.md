# Webhook Server V2 - Development Guide

## Project Overview

This is a Serverless Framework project for the Toolbox Webhook Server V2. It provides a Lambda function that serves HTML templates from DynamoDB, allowing clients to create webhook instances with unique URLs that render custom HTML pages.

### Current Status

- **V1**: Currently deployed on AWS Amplify at `webhooks.thegraphitelab.com`
- **V2**: Being developed as separate Serverless Framework deployment
- **Migration Goal**: Deploy V2 to `web.thegraphitelab.com` maintaining 100% API compatibility

## Architecture

### Core Concepts

1. **Webhooks**: HTML templates with styling, stored in DynamoDB
2. **Instances**: Unique URLs created from webhooks, stored in DynamoDB
3. **Clients**: Multi-tenant organization unit, scoped by ClientID
4. **Events**: Form submissions and interactions, stored in DynamoDB
5. **Subscriptions**: Webhook URLs that receive instance data on events

### Request Flow

```
API Gateway → Lambda Handler → Route Handler (GET/POST)
                                   ↓
                            Service Layer (DynamoDB/S3)
                                   ↓
                            Authentication Layer
                                   ↓
                            HTML Rendering
                                   ↓
                            Response
```

### Key Components

- **Handlers**: `handlers/get.mjs`, `handlers/post.mjs` - HTTP request handling
- **Services**: `services/*.mjs` - Business logic and data access
- **Auth**: `auth/*.mjs` - Authentication and authorization
- **Utils**: `utils/*.mjs` - Utility functions (HTML, S3, parsing)
- **Config**: `config/aws.mjs` - AWS client configuration

## Key Features

### Authentication Types

1. **None**: Public access (no authentication)
2. **Password**: Password-protected instances
3. **Query Token**: Legacy signed URL authentication
4. **JWT Cookie**: Cookie-based session authentication
5. **Cognito User** (New): Cognito-based user authentication

### HTML Template System

- Variable replacement: `{{variableName}}`
- Nested properties: `{{client.name}}`
- Event data: `{{postEvent}}` (JSON-escaped)
- Client data: Logo, colors, address information
- Custom CSS and favicon support

### File Uploads

- Multipart form data support
- S3 file storage: `public/clientWebhookInstanceFiles/{instanceID}/{filename}`
- Presigned URLs for file access (3-hour expiry)
- File metadata stored in event records

## Development Workflow

### Setup

1. Install dependencies: `npm install`
2. Configure AWS credentials: `aws configure`
3. Set environment variables (via serverless.yml or SSM)
4. Deploy to dev: `serverless deploy --stage dev`

### Development Process

1. Make code changes in local files
2. Test locally: `serverless offline --stage dev`
3. Deploy to dev: `serverless deploy --stage dev`
4. Test endpoints: Verify functionality matches V1
5. Deploy to prod: `serverless deploy --stage prod`

### Testing Strategy

1. **Local Testing**: Use serverless-offline for local development
2. **Integration Testing**: Test against real AWS resources (dev environment)
3. **Compatibility Testing**: Verify V2 matches V1 behavior exactly
4. **Production Testing**: Monitor CloudWatch Logs after deployment

## Migration Strategy

### Phase 1: Deploy V2 (Current)

- Create Serverless Framework project
- Copy V1 Lambda code to V2
- Configure serverless.yml with AWS resources
- Deploy to dev environment
- Test compatibility with V1

### Phase 2: DNS Cutover

- Deploy V2 to production
- Point `web.thegraphitelab.com` to new API Gateway
- Keep V1 running as backup
- Monitor for issues

### Phase 3: New Features

- Add `authenticationType: "user"` support
- Implement Cognito token validation
- Maintain backward compatibility
- Test new features thoroughly

### Phase 4: Deprecate V1

- Once V2 is stable, migrate all traffic
- Remove V1 infrastructure
- Archive V1 codebase

## AWS Resources

### DynamoDB Tables

- **WebhookInstances**: Instance records
- **WebhookInstanceEvents**: Event history
- **Webhooks**: Webhook templates
- **Subscriptions**: Webhook subscription URLs
- **Clients**: Client/organization data

### S3 Buckets

- **tgltoolboxuserfiles210135-staging**: User file storage
  - Path: `public/clientWebhookInstanceFiles/{instanceID}/{filename}`
  - Presigned URLs: 3-hour expiry

### Secrets Manager

- **Client Secrets**: `Client_{clientId}_EncodingSecret`
  - Used for JWT signing and cookie authentication
  - Format: `{ "value": "<secret-string>" }`

### Cognito

- **User Pool**: `us-east-2_QUpKtOof0`
  - Used for new `authenticationType: "user"` feature
  - ARN: `arn:aws:cognito-idp:us-east-2:843563127054:userpool/us-east-2_QUpKtOof0`

## Code Patterns

### ES Modules

- All files use `.mjs` extension
- Use `import`/`export` statements
- `package.json` has `"type": "module"`

### Handler Pattern

```javascript
export async function handleGetRequest(event) {
  // 1. Extract input
  // 2. Load data
  // 3. Authenticate
  // 4. Process
  // 5. Return response
}
```

### Service Pattern

```javascript
export async function loadInstance(instanceID) {
  const res = await docClient.send(new GetCommand({...}));
  if (!res.Item) throw new Error("Instance not found");
  return res.Item;
}
```

### Error Handling

- Services throw errors
- Handlers catch and return appropriate HTTP responses
- Never log sensitive data (passwords, tokens)

## Backward Compatibility

### Critical Requirements

V2 must maintain 100% API compatibility with V1:

- ✅ Path parameter handling (greedy matching)
- ✅ Query token authentication (legacy)
- ✅ Cookie authentication format
- ✅ Password protection flow
- ✅ HTML rendering behavior
- ✅ POST form submission handling
- ✅ Error response formats

See `.cursor/rules/backward-compatibility.mdc` for detailed requirements.

## Authentication Flows

### GET Request Authentication

1. Check if `webhook.passwordProtected === false` → Allow
2. Check query token (`?token=...`) if `instance.authKey` exists → Verify
3. Check JWT cookie → Verify
4. Check Cognito token if `authenticationType === "user"` → Verify
5. Otherwise → Show password page

### POST Request Authentication

- Auth exchange (`/auth`): Validate password → Issue JWT cookie
- Form submit: Verify authentication → Process form → Return success

## Debugging

### CloudWatch Logs

```bash
serverless logs -f webhookServer --stage prod --tail
```

### Common Issues

- **Authentication failures**: Check cookie format, token version, expiration
- **DynamoDB errors**: Verify table names, IAM permissions, index names
- **S3 errors**: Check bucket permissions, file key format
- **Secrets errors**: Verify secret name format, IAM permissions

See `.cursor/rules/debugging.mdc` for detailed debugging guide.

## Deployment

### Deployment Commands

```bash
# Deploy to dev
serverless deploy --stage dev

# Deploy to prod
serverless deploy --stage prod

# Deploy function only (faster)
serverless deploy function -f webhookServer --stage prod

# View logs
serverless logs -f webhookServer --stage prod --tail
```

### Environment Variables

All secrets must be in AWS Secrets Manager. Environment variables used for:
- DynamoDB table names (from SSM parameters)
- S3 bucket names
- Cognito User Pool ID
- Stage configuration

## Cursor Rules

This project uses Cursor rules for development guidance:

- `.cursor/rules/aws-resources.mdc` - AWS resource configuration
- `.cursor/rules/authentication.mdc` - Authentication patterns
- `.cursor/rules/serverless-framework.mdc` - Serverless Framework config
- `.cursor/rules/code-patterns.mdc` - Code structure and patterns
- `.cursor/rules/backward-compatibility.mdc` - Compatibility requirements
- `.cursor/rules/debugging.mdc` - Debugging strategies

## Best Practices

1. **Never hardcode table names** - Use environment variables
2. **Never use local env vars for secrets** - Always use Secrets Manager
3. **Test in dev first** - Always deploy to dev before prod
4. **Monitor CloudWatch Logs** - Check logs after deployment
5. **Maintain compatibility** - V2 must match V1 behavior
6. **Use ES modules** - Always `.mjs` and `import`/`export`
7. **Handle errors gracefully** - Services throw, handlers catch
8. **Never log secrets** - Remove passwords, tokens from logs

## References

### Existing Codebase

- Lambda function: `src/` directory
- Handlers: `src/handlers/get.mjs`, `src/handlers/post.mjs`
- Services: `src/services/*.mjs`
- Auth: `src/auth/*.mjs`

### AWS Resources

- Region: `us-east-2`
- Account ID: `843563127054`
- Cognito User Pool: `us-east-2_QUpKtOof0`

### Domains

- V1 (Amplify): `webhooks.thegraphitelab.com`
- V2 (Serverless): `web.thegraphitelab.com`

## Next Steps

1. Review and understand existing V1 codebase
2. Set up Serverless Framework project structure
3. Configure serverless.yml with AWS resources
4. Copy V1 Lambda code to V2
5. Deploy to dev and test compatibility
6. Add new features (Cognito authentication)
7. Deploy to prod and cutover DNS

