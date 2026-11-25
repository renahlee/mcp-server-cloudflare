import { z } from 'zod'

import { requireRequestProps } from '@repo/mcp-common/src/request-context'
import { cloudflareFetch } from '@repo/mcp-common/src/user-agent'

import type { McpRegistrationContext } from '@repo/mcp-common/src/registration-context'
import type { Env } from '../sql-api.context'

const SQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/analytics/sql'
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const tag = z.string().regex(/^[0-9a-f]{32}$/, 'Expected a 32-character lowercase hexadecimal tag')

const queryInput = z.object({
	query: z.string().min(1).describe('One SELECT statement over a schema-qualified dataset.'),
	params: z
		.union([z.array(scalar), z.record(z.string(), scalar)])
		.optional()
		.describe('Positional ($1) or named ($name) parameter values.'),
	scope: z
		.union([z.object({ accountTag: tag }).strict(), z.object({ zoneTag: tag }).strict()])
		.optional()
		.describe(
			'Account or zone scope. Omit when the SQL statement already contains a tenancy predicate.'
		),
	time_range: z
		.object({ start: z.string().min(1), end: z.string().min(1).optional() })
		.strict()
		.optional()
		.describe(
			'Inclusive time bounds. Omit when the SQL statement already contains a lower timestamp bound.'
		),
})

const introspectionInput = z.object({
	dataset_name: z.string().min(1).optional().describe('Exact, case-sensitive dataset name.'),
	include_columns: z
		.boolean()
		.optional()
		.describe('Include column names, descriptions, and types.'),
	include_attributes: z
		.boolean()
		.optional()
		.describe('Discover attribute keys from the past seven days; requires dataset_name.'),
	include_wae: z.boolean().optional().describe('Include Workers Analytics Engine datasets.'),
	include_lex: z.boolean().optional().describe('Include Log Explorer datasets.'),
})

async function fetchSqlApi(
	accessToken: string,
	url: string | URL,
	init: { method?: 'POST'; headers?: Record<string, string>; body?: string } = {}
) {
	const response = await cloudflareFetch(url, {
		...init,
		headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
	})
	const body = await response.text()
	return {
		content: [
			{
				type: 'text' as const,
				text: response.ok ? body : `Cloudflare SQL API returned HTTP ${response.status}: ${body}`,
			},
		],
		isError: !response.ok,
	}
}

/** Keys come from the schema, not the input: accountTool may add an `account_id` arg. */
function introspectionUrl(accountId: string, input: z.output<typeof introspectionInput>): URL {
	const url = new URL(`${SQL_ENDPOINT}/introspection`)
	url.searchParams.set('account_tag', accountId)
	for (const name of introspectionInput.keyof().options) {
		const value = input[name]
		if (value !== undefined) url.searchParams.set(name, String(value))
	}
	return url
}

export function registerSqlApiTools(context: McpRegistrationContext<Env>) {
	context.registerTool(
		'sql_query',
		{
			description:
				'Run one read-only SELECT against the Cloudflare SQL API. Provide an account or zone scope and a lower time bound, either in the SQL or in scope/time_range (not both). Discover datasets and columns with sql_datasets first. Use LIMIT to bound results. Returns JSON, NDJSON, or TSV exactly as the API sends it.',
			inputSchema: queryInput,
			annotations: { readOnlyHint: true },
		},
		async (input) => {
			const { accessToken } = requireRequestProps(context)
			return fetchSqlApi(accessToken, SQL_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input),
			})
		}
	)

	context.accountTool(
		'sql_datasets',
		{
			description:
				'List SQL API datasets available to the selected account, or inspect one dataset and its columns or attributes. Dataset availability may also depend on product permissions and plan.',
			inputSchema: introspectionInput,
			annotations: { readOnlyHint: true },
		},
		async (input, accountId) => {
			const { accessToken } = requireRequestProps(context)
			return fetchSqlApi(accessToken, introspectionUrl(accountId, input))
		}
	)
}
