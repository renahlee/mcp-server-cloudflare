---
'sql-api-mcp-server': major
---

Launch the hosted SQL API MCP server at `https://sql.mcp.cloudflare.com/mcp`. It exposes `sql_query`, which runs SQL against Cloudflare analytics datasets, and `sql_datasets`, which lists the datasets and columns your account can query. Sign in with Cloudflare OAuth, or send a Cloudflare API token as `Authorization: Bearer <token>`. The token needs Account Analytics Read, access to the account through `GET /accounts`, and any product permissions the queried dataset requires.
