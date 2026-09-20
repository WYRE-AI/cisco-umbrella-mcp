import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleInvestigateTool } from '../tools/investigate.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ENV_KEYS = ['CISCOUMBRELLA_API_KEY', 'CISCOUMBRELLA_API_SECRET'] as const;

describe('handleInvestigateTool', () => {
  const fetchMock = vi.fn();
  let credCounter = 0;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    credCounter += 1;
    process.env.CISCOUMBRELLA_API_KEY = `KEY-${credCounter}`;
    process.env.CISCOUMBRELLA_API_SECRET = 'SECRET1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  const domainEndpoints: Array<{ tool: string; path: string }> = [
    { tool: 'umbrella_domain_categorization', path: '/investigate/v2/domains/categorization/example.com' },
    { tool: 'umbrella_domain_risk_score', path: '/investigate/v2/domains/risk-score/example.com' },
    { tool: 'umbrella_domain_security_score', path: '/investigate/v2/security/name/example.com' },
    { tool: 'umbrella_domain_volume', path: '/investigate/v2/domains/volume/example.com' },
    { tool: 'umbrella_domain_resource_records', path: '/investigate/v2/pdns/name/example.com' },
  ];

  for (const { tool, path } of domainEndpoints) {
    it(`${tool} requires domain`, async () => {
      const result = await handleInvestigateTool(tool, {});
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/domain is required/);
    });

    it(`${tool} calls GET ${path}`, async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ ok: true }));

      const result = await handleInvestigateTool(tool, { domain: 'example.com' });

      expect(JSON.parse(textOf(result))).toEqual({ ok: true });
      const [url] = fetchMock.mock.calls[1];
      expect(new URL(url as string).pathname).toBe(path);
    });
  }

  it('umbrella_top_most_seen_domains calls GET /investigate/v2/topmillion', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse(['example.com']));

    const result = await handleInvestigateTool('umbrella_top_most_seen_domains', {});

    expect(JSON.parse(textOf(result))).toEqual(['example.com']);
    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/investigate/v2/topmillion');
  });

  it('umbrella_get_samples requires domainIpOrUrl', async () => {
    const result = await handleInvestigateTool('umbrella_get_samples', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/domainIpOrUrl is required/);
  });

  it('umbrella_get_samples calls GET /investigate/v2/samples/{value}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ samples: [] }));

    const result = await handleInvestigateTool('umbrella_get_samples', { domainIpOrUrl: 'example.com' });

    expect(JSON.parse(textOf(result))).toEqual({ samples: [] });
    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/investigate/v2/samples/example.com');
  });
});
