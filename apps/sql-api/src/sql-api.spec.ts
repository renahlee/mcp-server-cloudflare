import { createExecutionContext, env } from 'cloudflare:test'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { server } from '@repo/mcp-common/src/test/msw-server'
import { testStatelessMcpApp } from '@repo/mcp-common/src/test/stateless-app'

import worker, { mcpHandler } from './sql-api.app'

import type { Env } from './sql-api.context'

const MCP_URL = 'http://localhost:8987/mcp'
const SQL_URL = 'https://api.cloudflare.com/client/v4/analytics/sql'
const ACCOUNT = 'a'.repeat(32)
const ZONE = 'b'.repeat(32)
const START = '2026-11-17T00:00:00Z'
type Secret =
	| 'MCP_COOKIE_ENCRYPTION_KEY'
	| 'DEV_DISABLE_OAUTH'
	| 'DEV_CLOUDFLARE_API_TOKEN'
	| 'DEV_CLOUDFLARE_EMAIL'

// `env` is typed as an empty Cloudflare.Env: the generated worker-configuration.d.ts conflicts
// with @cloudflare/workers-types, so its bindings never merge. Assert only the wrangler.jsonc
// bindings and supply the secrets it does not define.
const testEnv: Env = {
	...(env as Omit<Env, Secret>),
	MCP_COOKIE_ENCRYPTION_KEY: 'test-cookie-key',
	DEV_DISABLE_OAUTH: 'false',
	DEV_CLOUDFLARE_API_TOKEN: '',
	DEV_CLOUDFLARE_EMAIL: '',
}

const toolResponseSchema = z.object({
	result: z.object({
		content: z.array(z.object({ text: z.string() })),
		isError: z.boolean().optional(),
	}),
})
type ToolResult = z.infer<typeof toolResponseSchema>['result']

function toolCall(
	name: string,
	args: Record<string, unknown>,
	token?: string,
	url: string = MCP_URL
) {
	return new Request(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			...(token && { Authorization: `Bearer ${token}` }),
			'MCP-Protocol-Version': '2026-07-28',
			'Mcp-Method': 'tools/call',
			'Mcp-Name': name,
			Host: new URL(url).hostname,
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 'sql-call',
			method: 'tools/call',
			params: {
				name,
				arguments: args,
				_meta: {
					'io.modelcontextprotocol/protocolVersion': '2026-07-28',
					'io.modelcontextprotocol/clientInfo': { name: 'sql-test', version: '1.0.0' },
					'io.modelcontextprotocol/clientCapabilities': {},
				},
			},
		}),
	})
}

function mockAccount(token: string) {
	server.use(
		http.get('https://api.cloudflare.com/client/v4/accounts', ({ request }) => {
			expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`)
			return HttpResponse.json({
				success: true,
				result: [{ id: ACCOUNT, name: 'SQL test account' }],
				errors: [],
				messages: [],
			})
		})
	)
}

async function dispatch(request: Request, workerEnv: Env = testEnv): Promise<ToolResult> {
	const response = await worker.fetch(request, workerEnv, createExecutionContext())
	expect(response.status).toBe(200)
	return toolResponseSchema.parse(await response.json()).result
}

testStatelessMcpApp<Env>({
	name: 'SQL API',
	handler: mcpHandler,
	env: testEnv,
	url: 'http://localhost:8987',
	authenticated: true,
	authenticatedWorker: worker,
	expectedTools: ['sql_query', 'sql_datasets'],
	requiredToolInputs: { sql_query: ['query'] },
})

const examples = [
	{
		backend: 'ClickHouse HTTP analytics',
		query: `SELECT edgeResponseStatus AS status, COUNT(*) AS requests FROM events.httpRequests
			WHERE accountTag = '${ACCOUNT}' AND timestamp >= NOW() - INTERVAL '1' HOUR
			GROUP BY edgeResponseStatus ORDER BY requests DESC LIMIT 5`,
		body: {
			data: [{ status: 200, requests: 10 }],
			rows: 1,
			statistics: { elapsed_ms: 3, rows_read: 100, bytes_read: 4096 },
		},
	},
	{
		backend: 'Workers Analytics Engine',
		query: `SELECT timestamp, index1, blob1, double1 FROM events.analyticsEngine."example-dataset"
			WHERE accountTag = '${ACCOUNT}' AND timestamp >= NOW() - INTERVAL '1' HOUR
			ORDER BY timestamp DESC LIMIT 10`,
		body: {
			data: [{ timestamp: START, index1: 'event', blob1: 'value', double1: 4 }],
			rows: 1,
			statistics: { elapsed_ms: 3, rows_read: 100, bytes_read: 4096 },
		},
	},
	{
		backend: 'Workers Observability',
		query: `SELECT timestamp, scriptName, logType FROM logs.workersLogs
			WHERE accountTag = '${ACCOUNT}' AND timestamp >= NOW() - INTERVAL '15' MINUTE
			ORDER BY timestamp DESC LIMIT 10`,
		body: {
			data: [{ timestamp: START, scriptName: 'api-worker', logType: 'custom' }],
			rows: 1,
			statistics: { elapsed_ms: 3, rows_read: 100, bytes_read: 4096 },
		},
	},
	{
		backend: 'Loghouse Log Explorer',
		query: `SELECT timestamp, edgeResponseStatus FROM logs.httpRequests
			WHERE zoneTag = '${ZONE}' AND timestamp >= NOW() - INTERVAL '1' HOUR
			ORDER BY timestamp DESC LIMIT 10`,
		body: { data: [{ timestamp: START, edgeResponseStatus: 200 }], rows: 1 },
	},
]

describe('authenticated SQL API access', () => {
	it.each(examples)(
		'forwards one $backend query through the MCP Worker',
		async ({ query, body }) => {
			const token = 'cfat_sql-api-test'
			mockAccount(token)
			const input = { query }
			server.use(
				http.post(SQL_URL, async ({ request }) => {
					expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`)
					expect(request.headers.get('Content-Type')).toBe('application/json')
					expect(await request.json()).toEqual(input)
					return HttpResponse.json(body)
				})
			)

			const result = await dispatch(toolCall('sql_query', input, token))
			expect(result.isError).toBe(false)
			expect(JSON.parse(result.content[0].text)).toEqual(body)
		}
	)

	it('discovers datasets for the authenticated account', async () => {
		const token = 'cfat_sql-api-datasets'
		mockAccount(token)
		const datasets = {
			datasets: [{ name: 'events.httpRequests', columns: [{ name: 'timestamp' }] }],
		}
		server.use(
			http.get(`${SQL_URL}/introspection`, ({ request }) => {
				expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`)
				expect([...new URL(request.url).searchParams.entries()]).toEqual([
					['account_tag', ACCOUNT],
					['dataset_name', 'events.httpRequests'],
					['include_columns', 'true'],
				])
				return HttpResponse.json(datasets)
			})
		)

		const result = await dispatch(
			toolCall(
				'sql_datasets',
				{ dataset_name: 'events.httpRequests', include_columns: true },
				token
			)
		)
		expect(JSON.parse(result.content[0].text)).toEqual(datasets)
	})

	it('serves bearer-token queries on the production hostname', async () => {
		const token = 'cfat_sql-api-production'
		mockAccount(token)
		const input = { query: 'SELECT 1' }
		const body = { data: [{ '1': 1 }], rows: 1 }
		server.use(
			http.post(SQL_URL, async ({ request }) => {
				expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`)
				expect(await request.json()).toEqual(input)
				return HttpResponse.json(body)
			})
		)

		const result = await dispatch(
			toolCall('sql_query', input, token, 'https://sql.mcp.cloudflare.com/mcp')
		)
		expect(result.isError).toBe(false)
		expect(JSON.parse(result.content[0].text)).toEqual(body)
	})

	it('connects locally using the configured token without a client bearer', async () => {
		const token = 'cfat_sql-api-local'
		mockAccount(token)
		server.use(
			http.get(`${SQL_URL}/introspection`, ({ request }) => {
				expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`)
				return HttpResponse.json({ datasets: [] })
			})
		)
		const result = await dispatch(toolCall('sql_datasets', {}), {
			...testEnv,
			DEV_DISABLE_OAUTH: 'true',
			DEV_CLOUDFLARE_API_TOKEN: token,
		})
		expect(result.isError).toBe(false)
		expect(JSON.parse(result.content[0].text)).toEqual({ datasets: [] })
	})
})
