import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getCredentials,
  getInternalDomains,
  listInternalNetworks,
  listNetworks,
  listRoamingComputers,
  listSites,
  listVirtualAppliances,
} from '../client.js';
import type { CallToolResult } from './types.js';
import { ADDITIONAL_PARAMS_SCHEMA, PAGING_SCHEMA, errorResult, requireCredentials, textResult } from './shared.js';

export const DEPLOYMENT_TOOLS: Tool[] = [
  {
    name: 'umbrella_list_networks',
    description: 'List Cisco Umbrella networks (public IP identities) registered to this organization.',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
  {
    name: 'umbrella_list_internal_networks',
    description: 'List internal (RFC1918) networks registered for internal-network identities.',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
  {
    name: 'umbrella_list_sites',
    description: 'List Umbrella sites (logical groupings of virtual appliances/internal networks).',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
  {
    name: 'umbrella_list_virtual_appliances',
    description: 'List all Umbrella virtual appliances (on-prem DNS forwarders) and their status.',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
  {
    name: 'umbrella_list_roaming_computers',
    description: 'List all roaming computers enrolled via the Umbrella roaming client.',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
  {
    name: 'umbrella_get_internal_domains',
    description: 'Get all internal domains configured to bypass Umbrella DNS resolution.',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
];

export async function handleDeploymentTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  const opts = {
    limit: args.limit as number | undefined,
    offset: args.offset as number | undefined,
    additionalParams: args.additionalParams as Record<string, string | number | boolean> | undefined,
  };

  try {
    if (name === 'umbrella_list_networks') return textResult(await listNetworks(creds!, opts));
    if (name === 'umbrella_list_internal_networks') return textResult(await listInternalNetworks(creds!, opts));
    if (name === 'umbrella_list_sites') return textResult(await listSites(creds!, opts));
    if (name === 'umbrella_list_virtual_appliances') return textResult(await listVirtualAppliances(creds!, opts));
    if (name === 'umbrella_list_roaming_computers') return textResult(await listRoamingComputers(creds!, opts));
    if (name === 'umbrella_get_internal_domains') return textResult(await getInternalDomains(creds!, opts));

    return errorResult(`Unknown deployment tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
