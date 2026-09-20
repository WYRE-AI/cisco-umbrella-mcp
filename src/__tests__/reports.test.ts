import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleReportTool } from '../tools/reports.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ENV_KEYS = ['CISCOUMBRELLA_API_KEY', 'CISCOUMBRELLA_API_SECRET'] as const;

describe('handleReportTool', () => {
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

  it('umbrella_top_destinations requires from/to', async () => {
    const result = await handleReportTool('umbrella_top_destinations', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/from and to/);
  });

  it('umbrella_top_destinations calls GET /reports/v2/top-destinations with epoch-ms from/to', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_top_destinations', { from: 1000, to: 2000, limit: 5 });

    const [url] = fetchMock.mock.calls[1];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/reports/v2/top-destinations');
    expect(parsed.searchParams.get('from')).toBe('1000');
    expect(parsed.searchParams.get('to')).toBe('2000');
    expect(parsed.searchParams.get('limit')).toBe('5');
  });

  it('umbrella_top_destinations appends the trafficType path suffix when given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_top_destinations', { from: 1000, to: 2000, trafficType: 'dns' });

    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/reports/v2/top-destinations/dns');
  });

  it('umbrella_total_requests calls GET /reports/v2/total-requests', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_total_requests', { from: 1000, to: 2000, trafficType: 'firewall' });

    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/reports/v2/total-requests/firewall');
  });

  it('umbrella_top_categories calls GET /reports/v2/top-categories', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_top_categories', { from: 1000, to: 2000 });

    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/reports/v2/top-categories');
  });

  it('umbrella_activity calls GET /reports/v2/activity/proxy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_activity', { from: 1000, to: 2000, trafficType: 'proxy' });

    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/reports/v2/activity/proxy');
  });

  it('umbrella_identities requires a non-empty identityTypes array', async () => {
    const result = await handleReportTool('umbrella_identities', { identityTypes: [] });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/identityTypes is required/);
  });

  it('umbrella_identities joins identityTypes with a comma into identitytypes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_identities', { identityTypes: ['mobile_device', 'android'] });

    const [url] = fetchMock.mock.calls[1];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/reports/v2/identities');
    expect(parsed.searchParams.get('identitytypes')).toBe('mobile_device,android');
  });

  it('umbrella_appdiscovery_applications calls GET /reports/v2/appDiscovery/applications', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_appdiscovery_applications', {});

    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/reports/v2/appDiscovery/applications');
  });

  it('umbrella_appdiscovery_app_identities requires appId', async () => {
    const result = await handleReportTool('umbrella_appdiscovery_app_identities', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/appId is required/);
  });

  it('umbrella_appdiscovery_app_identities calls GET /reports/v2/appDiscovery/applications/{appId}/identities', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_appdiscovery_app_identities', { appId: 'APP1' });

    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/reports/v2/appDiscovery/applications/APP1/identities');
  });

  it('umbrella_appdiscovery_app_risk calls GET /reports/v2/appDiscovery/applications/{appId}/risk', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await handleReportTool('umbrella_appdiscovery_app_risk', { appId: 'APP1' });

    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/reports/v2/appDiscovery/applications/APP1/risk');
  });

  const apiUsageEndpoints: Array<{ tool: string; path: string }> = [
    { tool: 'umbrella_api_usage_summary', path: '/reports/v2/apiUsage/summary' },
    { tool: 'umbrella_api_usage_requests', path: '/reports/v2/apiUsage/requests' },
    { tool: 'umbrella_api_usage_responses', path: '/reports/v2/apiUsage/responses' },
    { tool: 'umbrella_api_usage_keys', path: '/reports/v2/apiUsage/keys' },
  ];

  for (const { tool, path } of apiUsageEndpoints) {
    it(`${tool} requires from/to and calls GET ${path} with YYYY-MM-DD dates`, async () => {
      const missing = await handleReportTool(tool, {});
      expect(missing.isError).toBe(true);
      expect(textOf(missing)).toMatch(/from and to/);

      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse({ data: [] }));
      await handleReportTool(tool, { from: '2026-09-01', to: '2026-09-20' });

      const [url] = fetchMock.mock.calls[1];
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe(path);
      expect(parsed.searchParams.get('from')).toBe('2026-09-01');
      expect(parsed.searchParams.get('to')).toBe('2026-09-20');
    });
  }
});
