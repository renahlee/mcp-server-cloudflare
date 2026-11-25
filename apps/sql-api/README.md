# Cloudflare SQL API MCP Server

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server that supports remote MCP connections, with Cloudflare OAuth built in. It integrates tools powered by the [Cloudflare SQL API](https://developers.cloudflare.com/analytics/sql-api) so you can query Cloudflare analytics datasets with read-only SQL.

The `/mcp` URL uses a stateless SDK v2 handler that creates a fresh server with request-scoped auth and account context for every request. The retired `/sse` URL returns `410 Gone` pointing at `/mcp`. OAuth remains durable security state; the server retains no MCP protocol session or protocol Durable Object.

## Available tools

| **Category**          | **Tool**       | **Description**                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQL Query**         | `sql_query`    | Run one read-only `SELECT` statement over a schema-qualified dataset. The query needs an account or zone scope and a lower time bound, provided either inline in the SQL or through the `scope` (`accountTag` or `zoneTag`) and `time_range` (`start`, optional `end`) arguments, not both. Accepts positional (`$1`) or named (`$name`) `params`. Returns the API response verbatim as JSON, NDJSON, or TSV. |
| **Dataset Discovery** | `sql_datasets` | List SQL API datasets available to the selected account, or inspect one dataset by `dataset_name` with `include_columns` and `include_attributes` (attribute keys from the past seven days). Set `include_wae` to include Workers Analytics Engine datasets and `include_lex` to include Log Explorer datasets.                                                                                               |

Use `sql_datasets` to discover dataset and column names before calling `sql_query`, and use `LIMIT` to bound results. Dataset availability may depend on product permissions and plan.

### Prompt examples

- `Which SQL API datasets are available for my account?`
- `Show me the columns of the HTTP requests dataset`
- `Count HTTP requests per status code for example.com over the last 24 hours`
- `What were the top 10 paths by request count on my zone yesterday?`

## Connect to the MCP server

Connect your MCP client directly to `https://sql.mcp.cloudflare.com/mcp`. If prompted, complete the Cloudflare OAuth flow in your browser. The tools become available after authorization.

Alternatively, send a Cloudflare API token as `Authorization: Bearer <token>`. The token needs:

- Account Analytics Read
- Visibility of the account through `GET /accounts`
- Any dataset-specific product permissions

Zone-scoped queries need Zone Analytics Read for that zone, or Account Analytics Read on the account that owns it. See [Get started with the SQL API](https://developers.cloudflare.com/analytics/sql-api/get-started/) for details on permissions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup.
