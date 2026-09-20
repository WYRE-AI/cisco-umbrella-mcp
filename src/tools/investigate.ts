import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  domainCategorization,
  domainResourceRecords,
  domainRiskScore,
  domainSecurityScore,
  domainVolume,
  getCredentials,
  getSamples,
  topMostSeenDomains,
} from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const INVESTIGATE_TOOLS: Tool[] = [
  {
    name: 'umbrella_domain_categorization',
    description: 'Get the content/security categorization for a domain.',
    inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] },
  },
  {
    name: 'umbrella_domain_risk_score',
    description: "Get Cisco's risk score for a domain (higher = riskier).",
    inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] },
  },
  {
    name: 'umbrella_domain_security_score',
    description: 'Get detailed security scoring signals for a domain (DGA score, perplexity, entropy, Secure Rank, etc).',
    inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] },
  },
  {
    name: 'umbrella_top_most_seen_domains',
    description: "Get Cisco's list of the top million most globally-popular domains.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'umbrella_get_samples',
    description: 'Get malware/file samples associated with a domain, IP, or URL.',
    inputSchema: { type: 'object', properties: { domainIpOrUrl: { type: 'string' } }, required: ['domainIpOrUrl'] },
  },
  {
    name: 'umbrella_domain_volume',
    description: 'Get DNS query volume over time for a domain.',
    inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] },
  },
  {
    name: 'umbrella_domain_resource_records',
    description: 'Get passive DNS resource records (historical DNS resolutions) for a domain.',
    inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] },
  },
];

export async function handleInvestigateTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'umbrella_domain_categorization') {
      const domain = args.domain as string;
      if (!domain) return errorResult('domain is required.');
      return textResult(await domainCategorization(creds!, domain));
    }

    if (name === 'umbrella_domain_risk_score') {
      const domain = args.domain as string;
      if (!domain) return errorResult('domain is required.');
      return textResult(await domainRiskScore(creds!, domain));
    }

    if (name === 'umbrella_domain_security_score') {
      const domain = args.domain as string;
      if (!domain) return errorResult('domain is required.');
      return textResult(await domainSecurityScore(creds!, domain));
    }

    if (name === 'umbrella_top_most_seen_domains') return textResult(await topMostSeenDomains(creds!));

    if (name === 'umbrella_get_samples') {
      const domainIpOrUrl = args.domainIpOrUrl as string;
      if (!domainIpOrUrl) return errorResult('domainIpOrUrl is required.');
      return textResult(await getSamples(creds!, domainIpOrUrl));
    }

    if (name === 'umbrella_domain_volume') {
      const domain = args.domain as string;
      if (!domain) return errorResult('domain is required.');
      return textResult(await domainVolume(creds!, domain));
    }

    if (name === 'umbrella_domain_resource_records') {
      const domain = args.domain as string;
      if (!domain) return errorResult('domain is required.');
      return textResult(await domainResourceRecords(creds!, domain));
    }

    return errorResult(`Unknown investigate tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
