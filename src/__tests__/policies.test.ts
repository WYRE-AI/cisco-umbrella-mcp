import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePolicyTool } from '../tools/policies.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ENV_KEYS = ['CISCOUMBRELLA_API_KEY', 'CISCOUMBRELLA_API_SECRET'] as const;

describe('handlePolicyTool', () => {
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

  it('umbrella_list_destination_lists calls GET /policies/v2/destinationlists', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, name: 'Block List' }] }));

    const result = await handlePolicyTool('umbrella_list_destination_lists', {});

    expect(JSON.parse(textOf(result)).data[0].name).toBe('Block List');
    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/policies/v2/destinationlists');
  });

  it('umbrella_list_destinations requires destinationListId', async () => {
    const result = await handlePolicyTool('umbrella_list_destinations', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/destinationListId is required/);
  });

  it('umbrella_list_destinations calls GET /policies/v2/destinationlists/{id}/destinations', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, destination: 'evil.example.com' }] }));

    const result = await handlePolicyTool('umbrella_list_destinations', { destinationListId: 'DL1' });

    expect(JSON.parse(textOf(result)).data[0].destination).toBe('evil.example.com');
    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/policies/v2/destinationlists/DL1/destinations');
  });
});
