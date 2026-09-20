import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getUser, listApiKeys, listRoles, listUsers } from '../client.js';
import type { CallToolResult } from './types.js';
import { ADDITIONAL_PARAMS_SCHEMA, PAGING_SCHEMA, errorResult, requireCredentials, textResult } from './shared.js';

export const ADMIN_TOOLS: Tool[] = [
  {
    name: 'umbrella_list_roles',
    description: 'List all administrative roles available in this Umbrella organization.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'umbrella_list_users',
    description: 'List all admin console users for this Umbrella organization.',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
  {
    name: 'umbrella_get_user',
    description: 'Get a specific Umbrella admin console user by user ID.',
    inputSchema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'Umbrella user ID.' } },
      required: ['userId'],
    },
  },
  {
    name: 'umbrella_list_api_keys',
    description: 'List all API keys configured for this Umbrella organization.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function handleAdminTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'umbrella_list_roles') return textResult(await listRoles(creds!));

    if (name === 'umbrella_list_users') {
      return textResult(
        await listUsers(creds!, {
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined,
          additionalParams: args.additionalParams as Record<string, string | number | boolean> | undefined,
        })
      );
    }

    if (name === 'umbrella_get_user') {
      const userId = args.userId as string;
      if (!userId) return errorResult('userId is required.');
      return textResult(await getUser(creds!, userId));
    }

    if (name === 'umbrella_list_api_keys') return textResult(await listApiKeys(creds!));

    return errorResult(`Unknown admin tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
