# Setup

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` in this directory.

   Cloudflare employees can use OAuth credentials:

   ```text
   CLOUDFLARE_CLIENT_ID=your_development_cloudflare_client_id
   CLOUDFLARE_CLIENT_SECRET=your_development_cloudflare_client_secret
   ```

   External contributors can use a development API token with Account Analytics Read, account visibility through `GET /accounts`, and any dataset-specific permissions:

   ```text
   DEV_DISABLE_OAUTH=true
   DEV_CLOUDFLARE_API_TOKEN=your_development_api_token
   ```

2. Start the local development server:

   ```bash
   pnpm --filter sql-api-mcp-server dev
   ```

3. Open the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) and connect to `http://localhost:8987/mcp`.

## Tests

```bash
pnpm --filter sql-api-mcp-server test
```

## Deploying the Worker (Cloudflare employees only)

Set secrets with Wrangler:

```bash
npx wrangler secret put CLOUDFLARE_CLIENT_ID -e <ENVIRONMENT>
npx wrangler secret put CLOUDFLARE_CLIENT_SECRET -e <ENVIRONMENT>
npx wrangler secret put MCP_COOKIE_ENCRYPTION_KEY -e <ENVIRONMENT>
```

Staging deploys automatically from `main`. Production deploys on release through changesets.

To deploy manually:

```bash
npx wrangler deploy -e <ENVIRONMENT>
```
