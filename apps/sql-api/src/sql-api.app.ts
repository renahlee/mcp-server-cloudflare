import { createAuthenticatedMcpApp } from '@repo/mcp-common/src/mcp-app'
import { RequiredScopes } from '@repo/mcp-common/src/scopes'

import { registerSqlApiTools } from './tools/sql-api.tools'

import type { Env } from './sql-api.context'

const SqlApiScopes = {
	...RequiredScopes,
	'account:read': 'See your account details and memberships.',
	'account-analytics.read': 'Read account analytics datasets through the SQL API.',
} as const

const app = createAuthenticatedMcpApp<Env>({
	serverId: 'sql-api',
	serviceHostnames: [],
	scopes: SqlApiScopes,
	register: registerSqlApiTools,
})

export const mcpHandler = app.mcpHandler

export default app.worker
