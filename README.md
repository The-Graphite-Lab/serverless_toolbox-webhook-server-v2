# Toolbox Webhook Server V2

[![Repository](https://img.shields.io/badge/GitHub-The--Graphite--Lab-blue)](https://github.com/The-Graphite-Lab/serverless_toolbox-webhook-server-v2)

Serverless Framework deployment of the Toolbox Webhook Server, providing HTML template rendering with multi-tenant support.

## Overview

This project provides a Lambda function that serves HTML templates from DynamoDB, allowing clients to create webhook instances with unique URLs that render custom HTML pages.

- **V1**: Currently deployed on AWS Amplify at `webhooks.thegraphitelab.com`
- **V2**: Serverless Framework deployment (this project) for `web.thegraphitelab.com`

## Prerequisites

- Node.js 20.x or later
- AWS CLI configured with appropriate credentials
- AWS Account: `843563127054`
- Region: `us-east-2`

## Installation

```bash
# Install dependencies
npm install

# Install Serverless Framework globally (optional)
npm install -g serverless
```

## Configuration

### Environment Variables

The `serverless.yml` file configures environment variables that are automatically set during deployment. These include:

- DynamoDB table names
- S3 bucket configuration
- Cognito User Pool ID
- Region and stage settings

### AWS Resources

This project uses existing AWS resources:

- **DynamoDB Tables**: WebhookInstances, WebhookInstanceEvents, Webhooks, Subscriptions, Clients
- **S3 Bucket**: `tgltoolboxuserfiles210135-staging`
- **Secrets Manager**: Client secrets stored as `Client_{clientId}_EncodingSecret`
- **Cognito User Pool**: `us-east-2_QUpKtOof0`

## Development

### Local Testing

```bash
# Run serverless offline for local development
npm run offline
# or
serverless offline --stage dev

# The API will be available at http://localhost:3000
```

### Testing with AWS Resources

To test against real AWS resources locally:

```bash
# Set AWS credentials
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-2

# Run serverless offline
serverless offline --stage dev
```

## Deployment

### Deploy to Dev Environment

```bash
npm run deploy:dev
# or
serverless deploy --stage dev
```

### Deploy to Production

```bash
npm run deploy:prod
# or
serverless deploy --stage prod
```

### Deploy Function Only (Faster)

```bash
npm run deploy:function -- --stage prod
# or
serverless deploy function -f webhookServer --stage prod
```

### View Logs

```bash
# Tail logs
npm run logs -- --stage prod
# or
serverless logs -f webhookServer --stage prod --tail

# View recent logs
serverless logs -f webhookServer --stage prod
```

## Project Structure

```
webpages/
├── serverless.yml                 # Serverless Framework configuration
├── package.json                   # Project dependencies and scripts
├── README.md                      # This file
├── AGENTS.md                     # High-level development guide
├── .cursor/rules/                # Cursor IDE rules for development
│   ├── aws-resources.mdc
│   ├── authentication.mdc
│   ├── serverless-framework.mdc
│   ├── code-patterns.mdc
│   ├── backward-compatibility.mdc
│   └── debugging.mdc
└── src/                          # Lambda function code
    ├── index.mjs                 # Lambda handler entry point
    ├── handlers/                 # HTTP request handlers
    ├── services/                 # Business logic layer
    ├── auth/                     # Authentication logic
    ├── config/                   # AWS client configuration
    ├── utils/                    # Utility functions
    └── helperToken/              # Token utilities
```

## Features

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
- Client branding: Logo, colors, address information

### File Uploads

- Multipart form data support
- S3 file storage with presigned URLs
- File metadata stored in event records

## Migration from V1

This V2 deployment maintains 100% API compatibility with V1:

- ✅ Path parameter handling (greedy matching)
- ✅ Query token authentication (legacy)
- ✅ Cookie authentication format
- ✅ Password protection flow
- ✅ HTML rendering behavior
- ✅ POST form submission handling

See `.cursor/rules/backward-compatibility.mdc` for detailed requirements.

## DNS Configuration

After deployment, configure DNS to point `web.thegraphitelab.com` to the new API Gateway:

1. Get API Gateway domain from deployment output
2. Create CNAME record: `web.thegraphitelab.com` → `<api-id>.execute-api.us-east-2.amazonaws.com`
3. Wait for DNS propagation (5-60 minutes)

## Troubleshooting

See `.cursor/rules/debugging.mdc` for detailed troubleshooting guide.

Common issues:
- **Authentication failures**: Check cookie format, token version, expiration
- **DynamoDB errors**: Verify table names, IAM permissions, index names
- **S3 errors**: Check bucket permissions, file key format
- **Secrets errors**: Verify secret name format, IAM permissions

## Development Guidelines

- See `.cursor/rules/` for detailed development guidelines
- See `AGENTS.md` for project overview and architecture
- All secrets must be stored in AWS Secrets Manager (never in code)
- Never hardcode table names (use environment variables)
- Maintain backward compatibility with V1

## License

Proprietary - The Graphite Lab

