import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAdminTool } from '../tools/admin.js';
import { textOf } from './test-helpers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ENV_KEYS = ['CISCOUMBRELLA_API_KEY', 'CISCOUMBRELLA_API_SECRET'] as const;

describe('handleAdminTool', () => {
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

  it('umbrella_list_roles calls GET /admin/v2/roles', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse([{ roleId: 1 }]));

    const result = await handleAdminTool('umbrella_list_roles', {});

    expect(JSON.parse(textOf(result))).toEqual([{ roleId: 1 }]);
    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/admin/v2/roles');
  });

  it('umbrella_list_users calls GET /admin/v2/users with paging', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse([]));

    await handleAdminTool('umbrella_list_users', { limit: 25, offset: 0 });

    const [url] = fetchMock.mock.calls[1];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/admin/v2/users');
    expect(parsed.searchParams.get('limit')).toBe('25');
  });

  it('umbrella_get_user requires userId', async () => {
    const result = await handleAdminTool('umbrella_get_user', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/userId is required/);
  });

  it('umbrella_get_user calls GET /admin/v2/users/{userId}', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ userId: 'U1', email: 'a@example.com' }));

    const result = await handleAdminTool('umbrella_get_user', { userId: 'U1' });

    expect(JSON.parse(textOf(result)).email).toBe('a@example.com');
    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/admin/v2/users/U1');
  });

  it('umbrella_list_api_keys calls GET /admin/v2/apiKeys', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 })).mockResolvedValueOnce(jsonResponse([{ keyId: 'k1' }]));

    const result = await handleAdminTool('umbrella_list_api_keys', {});

    expect(JSON.parse(textOf(result))).toEqual([{ keyId: 'k1' }]);
    const [url] = fetchMock.mock.calls[1];
    expect(new URL(url as string).pathname).toBe('/admin/v2/apiKeys');
  });
});
