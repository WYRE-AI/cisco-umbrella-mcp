import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listDestinationLists, listDestinations } from '../client.js';
import type { CallToolResult } from './types.js';
import { ADDITIONAL_PARAMS_SCHEMA, PAGING_SCHEMA, errorResult, requireCredentials, textResult } from './shared.js';

export const POLICY_TOOLS: Tool[] = [
  {
    name: 'umbrella_list_destination_lists',
    description: 'List all destination lists (allow/block lists) configured for this Umbrella organization.',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
  {
    name: 'umbrella_list_destinations',
    description: 'List the destinations (domains/URLs/IPs) contained in a specific destination list.',
    inputSchema: {
      type: 'object',
      properties: {
        destinationListId: { type: 'string', description: 'ID of the destination list.' },
        ...PAGING_SCHEMA,
        additionalParams: ADDITIONAL_PARAMS_SCHEMA,
      },
      required: ['destinationListId'],
    },
  },
];

export async function handlePolicyTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  const opts = {
    limit: args.limit as number | undefined,
    offset: args.offset as number | undefined,
    additionalParams: args.additionalParams as Record<string, string | number | boolean> | undefined,
  };

  try {
    if (name === 'umbrella_list_destination_lists') return textResult(await listDestinationLists(creds!, opts));

    if (name === 'umbrella_list_destinations') {
      const destinationListId = args.destinationListId as string;
      if (!destinationListId) return errorResult('destinationListId is required.');
      return textResult(await listDestinations(creds!, destinationListId, opts));
    }

    return errorResult(`Unknown policy tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
