import type { UmbrellaCredentials } from '../types.js';
import type { CallToolResult } from './types.js';

export function textResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Returns an error CallToolResult if credentials are missing, else null. */
export function requireCredentials(creds: UmbrellaCredentials | null): CallToolResult | null {
  if (!creds) {
    return errorResult('No Cisco Umbrella credentials configured. Set CISCOUMBRELLA_API_KEY and CISCOUMBRELLA_API_SECRET.');
  }
  return null;
}

/** Shared JSON-Schema fragment for the additionalParams escape hatch (see types.ts). */
export const ADDITIONAL_PARAMS_SCHEMA = {
  type: 'object',
  description:
    'Escape hatch for any documented Cisco Reports/Investigate query parameter not modeled explicitly above (e.g. categories, identityids, verdict, domains), passed through verbatim as query string key/value pairs.',
  additionalProperties: { type: ['string', 'number', 'boolean'] },
} as const;

/** Shared JSON-Schema fragment for limit/offset paging params. */
export const PAGING_SCHEMA = {
  limit: { type: 'number', description: 'Maximum number of records to return.' },
  offset: { type: 'number', description: 'Number of records to skip, for paging.' },
} as const;
