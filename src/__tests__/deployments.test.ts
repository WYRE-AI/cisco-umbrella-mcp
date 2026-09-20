import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleDeploymentTool } from '../tools/deployments.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ENV_KEYS = ['CISCOUMBRELLA_API_KEY', 'CISCOUMBRELLA_API_SECRET'] as const;

describe('handleDeploymentTool', () => {
  const fetchMock = vi.fn();
  let credCounter = 0;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    // A unique apiKey per test keeps client.ts's module-scoped access-token
    // cache from bleeding between tests.
    credCounter += 1;
    process.env.CISCOUMBRELLA_API_KEY = `KEY-${credCounter}`;
    process.env.CISCOUMBRELLA_API_SECRET = 'SECRET1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('errors when credentials are missing', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const result = await handleDeploymentTool('umbrella_list_networks', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No Cisco Umbrella credentials/);
  });

  const endpoints: Array<{ tool: string; path: string }> = [
    { tool: 'umbrella_list_networks', path: '/deployments/v2/networks' },
    { tool: 'umbrella_list_internal_networks', path: '/deployments/v2/internalnetworks' },
    { tool: 'umbrella_list_sites', path: '/deployments/v2/sites' },
    { tool: 'umbrella_list_virtual_appliances', path: '/deployments/v2/virtualappliances' },
    { tool: 'umbrella_list_roaming_computers', path: '/deployments/v2/roamingcomputers' },
    { tool: 'umbrella_get_internal_domains', path: '/deployments/v2/internaldomains' },
  ];

  for (const { tool, path } of endpoints) {
    it(`${tool} calls GET ${path} and returns the result`, async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse([{ id: 1 }]));

      const result = await handleDeploymentTool(tool, { limit: 10, offset: 0 });

      expect(JSON.parse(textOf(result))).toEqual([{ id: 1 }]);
      const [url] = fetchMock.mock.calls[1];
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe(path);
      expect(parsed.searchParams.get('limit')).toBe('10');
      expect(parsed.searchParams.get('offset')).toBe('0');
    });
  }

  it('passes additionalParams through as extra query string entries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse([]));

    await handleDeploymentTool('umbrella_list_networks', { additionalParams: { foo: 'bar' } });

    const [url] = fetchMock.mock.calls[1];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('foo')).toBe('bar');
  });
});
