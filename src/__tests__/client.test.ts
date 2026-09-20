import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UmbrellaApiError,
  UmbrellaAuthError,
  UmbrellaRateLimitError,
  listNetworks,
  requestAccessToken,
} from '../client.js';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('requestAccessToken', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs grant_type=client_credentials with HTTP Basic apiKey:apiSecret and returns the access token + parsed expiry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token_type: 'bearer', access_token: 'tok-123', expires_in: 3600 }));

    const result = await requestAccessToken({ apiKey: 'KEY1', apiSecret: 'SECRET1' });

    expect(result.accessToken).toBe('tok-123');
    expect(result.expireAt).toBeGreaterThan(Date.now());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.umbrella.com/auth/v2/token');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toBe('grant_type=client_credentials');
    const expectedBasic = Buffer.from('KEY1:SECRET1').toString('base64');
    expect(init.headers['Authorization']).toBe(`Basic ${expectedBasic}`);
  });

  it('throws UmbrellaAuthError when the vendor returns 2xx with no access_token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_client', error_description: 'Bad credentials' }));

    await expect(requestAccessToken({ apiKey: 'bad', apiSecret: 'bad' })).rejects.toThrow(/Bad credentials/);
  });

  it('throws an instance of UmbrellaAuthError (not just a matching message) when the vendor returns 2xx with no access_token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_client', error_description: 'Bad credentials' }));

    await expect(requestAccessToken({ apiKey: 'bad', apiSecret: 'bad' })).rejects.toThrow(UmbrellaAuthError);
  });

  it('throws UmbrellaAuthError on a 401 response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(requestAccessToken({ apiKey: 'KEY1', apiSecret: 'SECRET1' })).rejects.toThrow(UmbrellaAuthError);
  });

  it('throws UmbrellaRateLimitError (distinct from UmbrellaAuthError) on a 429 response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '30' }));
    await expect(requestAccessToken({ apiKey: 'KEY1', apiSecret: 'SECRET1' })).rejects.toThrow(UmbrellaRateLimitError);
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '30' }));
    await expect(requestAccessToken({ apiKey: 'KEY1', apiSecret: 'SECRET1' })).rejects.not.toThrow(UmbrellaAuthError);
  });

  it('throws a generic UmbrellaApiError (not UmbrellaAuthError) on a 500 response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(requestAccessToken({ apiKey: 'KEY1', apiSecret: 'SECRET1' })).rejects.toThrow(UmbrellaApiError);
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(requestAccessToken({ apiKey: 'KEY1', apiSecret: 'SECRET1' })).rejects.not.toThrow(UmbrellaAuthError);
  });

  it('falls back to a conservative TTL when expires_in is missing', async () => {
    const before = Date.now();
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok-no-ttl' }));
    const result = await requestAccessToken({ apiKey: 'KEY1', apiSecret: 'SECRET1' });
    expect(result.expireAt).toBeGreaterThan(before);
    expect(result.expireAt).toBeLessThan(before + 11 * 60_000);
  });
});

describe('listNetworks - access token caching, refresh, and cache-key isolation', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges an access token once, sends it as a Bearer header, and reuses the cached token on a second call', async () => {
    const creds = { apiKey: 'KEY-CACHE', apiSecret: 'SECRET-CACHE' };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-cache-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse([{ originId: 1, name: 'Net A' }]));

    const result = await listNetworks(creds);

    expect(result).toEqual([{ originId: 1, name: 'Net A' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [networksUrl, networksInit] = fetchMock.mock.calls[1];
    expect(networksUrl).toBe('https://api.umbrella.com/deployments/v2/networks');
    expect(networksInit.headers['Authorization']).toBe('Bearer tok-cache-1');

    // A second call with the same credentials must reuse the cached token
    // rather than re-exchanging it.
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await listNetworks(creds);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never shares a cached access token between two credential sets that would collide under a naive colon-join', async () => {
    // apiKey="A:B"/apiSecret="C" and apiKey="A"/apiSecret="B:C" both
    // concatenate to "A:B:C" under a plain `${a}:${b}` join - this guards
    // the actual cache-key encoding (JSON.stringify) against that collision.
    const tenantOne = { apiKey: 'A:B', apiSecret: 'C' };
    const tenantTwo = { apiKey: 'A', apiSecret: 'B:C' };

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-tenant-one', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse([]));
    await listNetworks(tenantOne);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-tenant-two', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse([]));
    await listNetworks(tenantTwo);

    // 4 total fetches (exchange+request per tenant) means tenant two did its
    // own token exchange rather than reusing tenant one's cached token - a
    // colon-join collision would collapse this to 3.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, tenantTwoInit] = fetchMock.mock.calls[3];
    expect(tenantTwoInit.headers['Authorization']).toBe('Bearer tok-tenant-two');
  });

  it('refreshes the access token exactly once when the vendor rejects it mid-call (401), then retries', async () => {
    const creds = { apiKey: 'KEY-REFRESH', apiSecret: 'SECRET-REFRESH' };
    fetchMock
      // Initial exchange
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-stale', expires_in: 3600 }))
      // First call: vendor says the token is invalid (HTTP 401)
      .mockResolvedValueOnce(jsonResponse({}, 401))
      // Forced re-exchange
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-fresh', expires_in: 3600 }))
      // Retried call succeeds
      .mockResolvedValueOnce(jsonResponse([{ originId: 1 }]));

    const result = await listNetworks(creds);

    expect(result).toEqual([{ originId: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [, retriedInit] = fetchMock.mock.calls[3];
    expect(retriedInit.headers['Authorization']).toBe('Bearer tok-fresh');
  });

  it('propagates UmbrellaRateLimitError from a data call without retrying (rate limiting is not an auth failure)', async () => {
    const creds = { apiKey: 'KEY-429', apiSecret: 'SECRET-429' };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '10' }));

    await expect(listNetworks(creds)).rejects.toThrow(UmbrellaRateLimitError);
    // No forced re-exchange should have happened for a 429 (unlike 401).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
