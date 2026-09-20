import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  activity,
  apiUsageKeys,
  apiUsageRequests,
  apiUsageResponses,
  apiUsageSummary,
  appDiscoveryAppIdentities,
  appDiscoveryAppRisk,
  appDiscoveryApplications,
  getCredentials,
  identities,
  topCategories,
  topDestinations,
  totalRequests,
} from '../client.js';
import type { CallToolResult } from './types.js';
import { ADDITIONAL_PARAMS_SCHEMA, PAGING_SCHEMA, errorResult, requireCredentials, textResult } from './shared.js';

const TRAFFIC_TYPE_SCHEMA = {
  type: 'string',
  enum: ['dns', 'proxy', 'firewall'],
  description: 'Optional traffic-type breakdown. Omit for the all-traffic-types view.',
} as const;

const TIME_RANGE_SCHEMA = {
  from: { type: 'number', description: 'Range start, epoch milliseconds.' },
  to: { type: 'number', description: 'Range end, epoch milliseconds.' },
} as const;

const DATE_RANGE_SCHEMA = {
  from: { type: 'string', description: 'Range start, YYYY-MM-DD.' },
  to: { type: 'string', description: 'Range end, YYYY-MM-DD.' },
} as const;

export const REPORT_TOOLS: Tool[] = [
  {
    name: 'umbrella_top_destinations',
    description: 'Report of the most-requested destinations (domains) over a time range, optionally broken down by traffic type.',
    inputSchema: {
      type: 'object',
      properties: { ...TIME_RANGE_SCHEMA, ...PAGING_SCHEMA, trafficType: TRAFFIC_TYPE_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA },
      required: ['from', 'to'],
    },
  },
  {
    name: 'umbrella_total_requests',
    description: 'Total DNS/proxy/firewall request counts over a time range, optionally broken down by traffic type.',
    inputSchema: {
      type: 'object',
      properties: { ...TIME_RANGE_SCHEMA, ...PAGING_SCHEMA, trafficType: TRAFFIC_TYPE_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA },
      required: ['from', 'to'],
    },
  },
  {
    name: 'umbrella_top_categories',
    description: 'Report of the most-requested content/security categories over a time range.',
    inputSchema: {
      type: 'object',
      properties: { ...TIME_RANGE_SCHEMA, ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA },
      required: ['from', 'to'],
    },
  },
  {
    name: 'umbrella_activity',
    description: 'Raw activity (request-level) log over a time range, optionally broken down by traffic type.',
    inputSchema: {
      type: 'object',
      properties: { ...TIME_RANGE_SCHEMA, ...PAGING_SCHEMA, trafficType: TRAFFIC_TYPE_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA },
      required: ['from', 'to'],
    },
  },
  {
    name: 'umbrella_identities',
    description:
      'List identities (roaming computers, networks, mobile devices, AD users) with traffic summaries, filtered by one or more identity types.',
    inputSchema: {
      type: 'object',
      properties: {
        identityTypes: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Identity type(s) to filter by, e.g. ['roaming'], ['network'], ['mobile_device','android'], ['directory_user'] - per Cisco's documented identitytypes values.",
        },
        ...PAGING_SCHEMA,
        additionalParams: ADDITIONAL_PARAMS_SCHEMA,
      },
      required: ['identityTypes'],
    },
  },
  {
    name: 'umbrella_appdiscovery_applications',
    description: 'List cloud applications discovered in this organization\'s traffic (App Discovery).',
    inputSchema: { type: 'object', properties: { ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA } },
  },
  {
    name: 'umbrella_appdiscovery_app_identities',
    description: 'List the identities (users/devices) observed using a specific discovered application.',
    inputSchema: {
      type: 'object',
      properties: { appId: { type: 'string', description: 'Discovered application ID.' }, ...PAGING_SCHEMA, additionalParams: ADDITIONAL_PARAMS_SCHEMA },
      required: ['appId'],
    },
  },
  {
    name: 'umbrella_appdiscovery_app_risk',
    description:
      "Get risk details for a specific discovered application. Cisco's own Postman collection lists this endpoint under both \"App Details\" and \"App Risk Details\" - they are the same URL.",
    inputSchema: {
      type: 'object',
      properties: { appId: { type: 'string', description: 'Discovered application ID.' } },
      required: ['appId'],
    },
  },
  {
    name: 'umbrella_api_usage_summary',
    description: "Summary of this organization's Umbrella API usage over a date range.",
    inputSchema: { type: 'object', properties: { ...DATE_RANGE_SCHEMA }, required: ['from', 'to'] },
  },
  {
    name: 'umbrella_api_usage_requests',
    description: 'Detailed API request log over a date range.',
    inputSchema: { type: 'object', properties: { ...DATE_RANGE_SCHEMA }, required: ['from', 'to'] },
  },
  {
    name: 'umbrella_api_usage_responses',
    description: 'Detailed API response log over a date range.',
    inputSchema: { type: 'object', properties: { ...DATE_RANGE_SCHEMA }, required: ['from', 'to'] },
  },
  {
    name: 'umbrella_api_usage_keys',
    description: 'API usage broken down by API key over a date range.',
    inputSchema: { type: 'object', properties: { ...DATE_RANGE_SCHEMA }, required: ['from', 'to'] },
  },
];

export async function handleReportTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  const additionalParams = args.additionalParams as Record<string, string | number | boolean> | undefined;
  const trafficType = args.trafficType as 'dns' | 'proxy' | 'firewall' | undefined;
  const paging = { limit: args.limit as number | undefined, offset: args.offset as number | undefined };

  try {
    if (['umbrella_top_destinations', 'umbrella_total_requests', 'umbrella_top_categories', 'umbrella_activity'].includes(name)) {
      const from = args.from as number;
      const to = args.to as number;
      if (from === undefined || to === undefined) return errorResult('from and to (epoch milliseconds) are required.');
      const range = { from, to };

      if (name === 'umbrella_top_destinations') return textResult(await topDestinations(creds!, range, { ...paging, trafficType, additionalParams }));
      if (name === 'umbrella_total_requests') return textResult(await totalRequests(creds!, range, { ...paging, trafficType, additionalParams }));
      if (name === 'umbrella_top_categories') return textResult(await topCategories(creds!, range, { ...paging, additionalParams }));
      if (name === 'umbrella_activity') return textResult(await activity(creds!, range, { ...paging, trafficType, additionalParams }));
    }

    if (name === 'umbrella_identities') {
      const identityTypes = args.identityTypes as string[];
      if (!identityTypes || identityTypes.length === 0) return errorResult('identityTypes is required and must be non-empty.');
      return textResult(await identities(creds!, identityTypes, { ...paging, additionalParams }));
    }

    if (name === 'umbrella_appdiscovery_applications') return textResult(await appDiscoveryApplications(creds!, { ...paging, additionalParams }));

    if (name === 'umbrella_appdiscovery_app_identities') {
      const appId = args.appId as string;
      if (!appId) return errorResult('appId is required.');
      return textResult(await appDiscoveryAppIdentities(creds!, appId, { ...paging, additionalParams }));
    }

    if (name === 'umbrella_appdiscovery_app_risk') {
      const appId = args.appId as string;
      if (!appId) return errorResult('appId is required.');
      return textResult(await appDiscoveryAppRisk(creds!, appId));
    }

    if (['umbrella_api_usage_summary', 'umbrella_api_usage_requests', 'umbrella_api_usage_responses', 'umbrella_api_usage_keys'].includes(name)) {
      const from = args.from as string;
      const to = args.to as string;
      if (!from || !to) return errorResult('from and to (YYYY-MM-DD) are required.');
      const range = { from, to };
      if (name === 'umbrella_api_usage_summary') return textResult(await apiUsageSummary(creds!, range));
      if (name === 'umbrella_api_usage_requests') return textResult(await apiUsageRequests(creds!, range));
      if (name === 'umbrella_api_usage_responses') return textResult(await apiUsageResponses(creds!, range));
      if (name === 'umbrella_api_usage_keys') return textResult(await apiUsageKeys(creds!, range));
    }

    return errorResult(`Unknown report tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
