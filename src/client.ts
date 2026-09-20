import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './utils/logger.js';
import type {
  AdditionalParams,
  PagingOptions,
  TimeRangeOptions,
  UmbrellaApiKeyRecord,
  UmbrellaCredentials,
  UmbrellaDestination,
  UmbrellaDestinationList,
  UmbrellaDomainCategorization,
  UmbrellaDomainRiskScore,
  UmbrellaDomainSecurityScore,
  UmbrellaDomainVolume,
  UmbrellaIdentitySummary,
  UmbrellaInternalDomain,
  UmbrellaInternalNetwork,
  UmbrellaNetwork,
  UmbrellaReportResponse,
  UmbrellaResourceRecords,
  UmbrellaRoamingComputer,
  UmbrellaRole,
  UmbrellaSamplesResponse,
  UmbrellaSite,
  UmbrellaTokenResponse,
  UmbrellaTrafficType,
  UmbrellaUser,
  UmbrellaVirtualAppliance,
} from './types.js';

/** Every Umbrella NextGen API call - auth, admin, deployments, policies, reports, investigate - goes through this single host. */
const BASE_URL = 'https://api.umbrella.com';

// Refresh the Bearer access token this far ahead of its documented 1-hour
// expiry so a slow downstream call never races a token that expires
// mid-request.
const REFRESH_SKEW_MS = 60_000;

// Conservative fallback TTL if a token response is missing/has an
// unparseable `expires_in` - well under the documented 1-hour lifetime.
const FALLBACK_TOKEN_TTL_MS = 10 * 60_000;

// Request-scoped credential store. In gateway mode the HTTP layer runs each
// request inside runWithCredentials({apiKey, apiSecret}); getCredentials()
// reads from it. Falls back to process.env for stdio/single-tenant mode.
const credStore = new AsyncLocalStorage<UmbrellaCredentials>();

export function runWithCredentials<T>(creds: UmbrellaCredentials, fn: () => T): T {
  return credStore.run(creds, fn);
}

export function getCredentials(): UmbrellaCredentials | null {
  const scoped = credStore.getStore();
  if (scoped?.apiKey && scoped?.apiSecret) return scoped;
  const apiKey = process.env.CISCOUMBRELLA_API_KEY;
  const apiSecret = process.env.CISCOUMBRELLA_API_SECRET;
  if (!apiKey || !apiSecret) {
    logger.warn('Missing credentials', { hasApiKey: !!apiKey, hasApiSecret: !!apiSecret });
    return null;
  }
  return { apiKey, apiSecret };
}

/** Thrown on HTTP 401/403 - invalid or expired credentials. Triggers exactly one refresh-and-retry in withAccessToken(). */
export class UmbrellaAuthError extends Error {}

/** Thrown on HTTP 429 - the caller is being rate-limited. Kept distinct from UmbrellaAuthError so callers/tools can tell "try again later" apart from "fix your credentials". */
export class UmbrellaRateLimitError extends Error {
  constructor(message: string, readonly retryAfter?: string) {
    super(message);
  }
}

/** Thrown for any other non-2xx / unexpected vendor response. */
export class UmbrellaApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

interface TokenState {
  accessToken: string;
  expireAt: number; // epoch ms
}

// Keyed by the FULL credential set (apiKey, apiSecret) so multiple tenants
// sharing one gateway process (AsyncLocalStorage swaps credentials per
// request) never cross-pollinate cached access tokens. JSON.stringify (not
// a delimiter-joined string) so a delimiter character inside either
// credential value can never collapse two distinct tenants onto the same
// cache key - Cisco's docs don't constrain the charset of the API key/secret,
// so that's a live possibility on a secret cache shared across tenants.
const tokenCache = new Map<string, TokenState>();

function cacheKeyFor(creds: UmbrellaCredentials): string {
  return JSON.stringify([creds.apiKey, creds.apiSecret]);
}

/**
 * Exchange the long-lived API Key/Secret for a short-lived Bearer access
 * token via POST /auth/v2/token (HTTP Basic auth of apiKey:apiSecret,
 * grant_type=client_credentials form body) per Cisco's own "Getting
 * Started" and "Quickstart" DevNet docs, both independently consistent on
 * this shape.
 *
 * NOTE ON A REAL DISCREPANCY: Cisco's own published Postman collection
 * (Umbrella/PostmanExamples/umbrella-external-postman-collection.json,
 * "1. Auth - Start Here" > "Get Access Token") encodes this same call as a
 * bare GET with no body. This client follows the DevNet prose docs' POST +
 * grant_type=client_credentials shape rather than the Postman collection's
 * GET, because it is corroborated independently by both the "Getting
 * Started" and "Quickstart" pages and matches the standard OAuth2
 * client_credentials flow Cisco's docs explicitly name - not verified live
 * against a real credential pair, since none was available at
 * implementation time. If this 401s against a real account, try GET with
 * no body first (see the Postman collection) before assuming the
 * credentials themselves are bad.
 */
export async function requestAccessToken(creds: UmbrellaCredentials): Promise<TokenState> {
  const basic = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
  const res = await fetch(`${BASE_URL}/auth/v2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new UmbrellaAuthError(`Cisco Umbrella rejected the API Key/Secret (HTTP ${res.status})`);
    }
    if (res.status === 429) {
      throw new UmbrellaRateLimitError(
        'Cisco Umbrella rate-limited the token request (HTTP 429)',
        res.headers.get('retry-after') ?? undefined
      );
    }
    throw new UmbrellaApiError(`Cisco Umbrella auth/v2/token failed: HTTP ${res.status}`, res.status);
  }

  const data = (await res.json()) as UmbrellaTokenResponse;
  if (!data.access_token) {
    throw new UmbrellaAuthError(
      `Cisco Umbrella rejected credentials: ${data.error_description || data.error || 'no access_token returned'}`
    );
  }

  const ttlMs = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in * 1000 : NaN;
  return {
    accessToken: data.access_token,
    expireAt: Number.isFinite(ttlMs) ? Date.now() + ttlMs : Date.now() + FALLBACK_TOKEN_TTL_MS,
  };
}

async function getAccessToken(creds: UmbrellaCredentials, forceRefresh = false): Promise<string> {
  const key = cacheKeyFor(creds);
  const cached = tokenCache.get(key);
  if (!forceRefresh && cached && cached.expireAt - REFRESH_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }
  const fresh = await requestAccessToken(creds);
  tokenCache.set(key, fresh);
  return fresh.accessToken;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Runs `fn` with a fresh/cached access token, and retries it exactly once
 * with a forced refresh if `fn` throws UmbrellaAuthError (Cisco rejected the
 * token as expired/invalid mid-call). Every real API call in this file goes
 * through this wrapper so the refresh logic lives in one place.
 */
async function withAccessToken<T>(
  creds: UmbrellaCredentials,
  fn: (headers: Record<string, string>) => Promise<T>
): Promise<T> {
  const token = await getAccessToken(creds);
  try {
    return await fn(authHeaders(token));
  } catch (err) {
    if (err instanceof UmbrellaAuthError) {
      logger.warn('Access token rejected mid-call, refreshing and retrying once');
      const refreshed = await getAccessToken(creds, true);
      return await fn(authHeaders(refreshed));
    }
    throw err;
  }
}

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function request<T>(path: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { ...headers, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new UmbrellaAuthError(`Cisco Umbrella rejected the access token (HTTP ${res.status})`);
  }
  if (res.status === 429) {
    throw new UmbrellaRateLimitError(
      `Cisco Umbrella rate-limited GET ${path} (HTTP 429)`,
      res.headers.get('retry-after') ?? undefined
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new UmbrellaApiError(`Cisco Umbrella GET ${path} failed: HTTP ${res.status}${text ? ` - ${text.slice(0, 300)}` : ''}`, res.status);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return (await res.json()) as T;
}

function withAdditional(base: Record<string, unknown>, opts?: AdditionalParams): Record<string, unknown> {
  return opts?.additionalParams ? { ...base, ...opts.additionalParams } : base;
}

// ---------------------------------------------------------------------
// Deployments (deployments/v2)
// ---------------------------------------------------------------------

export async function listNetworks(creds: UmbrellaCredentials, opts: PagingOptions & AdditionalParams = {}): Promise<UmbrellaNetwork[]> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaNetwork[]>(`/deployments/v2/networks${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`, headers)
  );
}

export async function listInternalNetworks(
  creds: UmbrellaCredentials,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaInternalNetwork[]> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaInternalNetwork[]>(
      `/deployments/v2/internalnetworks${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`,
      headers
    )
  );
}

export async function listSites(creds: UmbrellaCredentials, opts: PagingOptions & AdditionalParams = {}): Promise<UmbrellaSite[]> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaSite[]>(`/deployments/v2/sites${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`, headers)
  );
}

export async function listVirtualAppliances(
  creds: UmbrellaCredentials,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaVirtualAppliance[]> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaVirtualAppliance[]>(
      `/deployments/v2/virtualappliances${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`,
      headers
    )
  );
}

export async function listRoamingComputers(
  creds: UmbrellaCredentials,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaRoamingComputer[]> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaRoamingComputer[]>(
      `/deployments/v2/roamingcomputers${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`,
      headers
    )
  );
}

export async function getInternalDomains(
  creds: UmbrellaCredentials,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaInternalDomain[]> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaInternalDomain[]>(
      `/deployments/v2/internaldomains${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`,
      headers
    )
  );
}

// ---------------------------------------------------------------------
// Admin (admin/v2)
// ---------------------------------------------------------------------

export async function listRoles(creds: UmbrellaCredentials): Promise<UmbrellaRole[]> {
  return withAccessToken(creds, (headers) => request<UmbrellaRole[]>('/admin/v2/roles', headers));
}

export async function listUsers(creds: UmbrellaCredentials, opts: PagingOptions & AdditionalParams = {}): Promise<UmbrellaUser[]> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaUser[]>(`/admin/v2/users${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`, headers)
  );
}

export async function getUser(creds: UmbrellaCredentials, userId: string): Promise<UmbrellaUser> {
  return withAccessToken(creds, (headers) => request<UmbrellaUser>(`/admin/v2/users/${encodeURIComponent(userId)}`, headers));
}

export async function listApiKeys(creds: UmbrellaCredentials): Promise<UmbrellaApiKeyRecord[]> {
  return withAccessToken(creds, (headers) => request<UmbrellaApiKeyRecord[]>('/admin/v2/apiKeys', headers));
}

// ---------------------------------------------------------------------
// Policies (policies/v2)
// ---------------------------------------------------------------------

export async function listDestinationLists(
  creds: UmbrellaCredentials,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaReportResponse<UmbrellaDestinationList>> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse<UmbrellaDestinationList>>(
      `/policies/v2/destinationlists${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`,
      headers
    )
  );
}

export async function listDestinations(
  creds: UmbrellaCredentials,
  destinationListId: string,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaReportResponse<UmbrellaDestination>> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse<UmbrellaDestination>>(
      `/policies/v2/destinationlists/${encodeURIComponent(destinationListId)}/destinations${buildQuery(
        withAdditional({ limit: opts.limit, offset: opts.offset }, opts)
      )}`,
      headers
    )
  );
}

// ---------------------------------------------------------------------
// Reports (reports/v2)
// ---------------------------------------------------------------------

function trafficSuffix(trafficType?: UmbrellaTrafficType): string {
  return trafficType ? `/${trafficType}` : '';
}

export async function topDestinations(
  creds: UmbrellaCredentials,
  range: TimeRangeOptions,
  opts: PagingOptions & AdditionalParams & { trafficType?: UmbrellaTrafficType } = {}
): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(
      `/reports/v2/top-destinations${trafficSuffix(opts.trafficType)}${buildQuery(
        withAdditional({ from: range.from, to: range.to, limit: opts.limit, offset: opts.offset }, opts)
      )}`,
      headers
    )
  );
}

export async function totalRequests(
  creds: UmbrellaCredentials,
  range: TimeRangeOptions,
  opts: PagingOptions & AdditionalParams & { trafficType?: UmbrellaTrafficType } = {}
): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(
      `/reports/v2/total-requests${trafficSuffix(opts.trafficType)}${buildQuery(
        withAdditional({ from: range.from, to: range.to, limit: opts.limit, offset: opts.offset }, opts)
      )}`,
      headers
    )
  );
}

export async function topCategories(
  creds: UmbrellaCredentials,
  range: TimeRangeOptions,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(
      `/reports/v2/top-categories${buildQuery(withAdditional({ from: range.from, to: range.to, limit: opts.limit, offset: opts.offset }, opts))}`,
      headers
    )
  );
}

export async function activity(
  creds: UmbrellaCredentials,
  range: TimeRangeOptions,
  opts: PagingOptions & AdditionalParams & { trafficType?: UmbrellaTrafficType } = {}
): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(
      `/reports/v2/activity${trafficSuffix(opts.trafficType)}${buildQuery(
        withAdditional({ from: range.from, to: range.to, limit: opts.limit, offset: opts.offset }, opts)
      )}`,
      headers
    )
  );
}

/**
 * GET /reports/v2/identities - `identityTypes` maps to Cisco's documented
 * `identitytypes` query param, a comma-joined list (e.g. roaming, network,
 * mobile_device, android, directory_user - Cisco's own Postman examples
 * combine mobile_device+android as a single comma-joined value).
 */
export async function identities(
  creds: UmbrellaCredentials,
  identityTypes: string[],
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaReportResponse<UmbrellaIdentitySummary>> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse<UmbrellaIdentitySummary>>(
      `/reports/v2/identities${buildQuery(
        withAdditional({ identitytypes: identityTypes.join(','), limit: opts.limit ?? 100, offset: opts.offset ?? 0 }, opts)
      )}`,
      headers
    )
  );
}

export async function appDiscoveryApplications(
  creds: UmbrellaCredentials,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(
      `/reports/v2/appDiscovery/applications${buildQuery(withAdditional({ limit: opts.limit, offset: opts.offset }, opts))}`,
      headers
    )
  );
}

export async function appDiscoveryAppIdentities(
  creds: UmbrellaCredentials,
  appId: string,
  opts: PagingOptions & AdditionalParams = {}
): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(
      `/reports/v2/appDiscovery/applications/${encodeURIComponent(appId)}/identities${buildQuery(
        withAdditional({ limit: opts.limit, offset: opts.offset }, opts)
      )}`,
      headers
    )
  );
}

/**
 * GET /reports/v2/appDiscovery/applications/{appId}/risk - covers both "App
 * Details" and "App Risk Details" as named in Cisco's own Postman
 * collection, which points both entries at this identical URL. Modeled as
 * one function rather than two identical duplicates.
 */
export async function appDiscoveryAppRisk(creds: UmbrellaCredentials, appId: string): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(`/reports/v2/appDiscovery/applications/${encodeURIComponent(appId)}/risk`, headers)
  );
}

/** API Usage endpoints use YYYY-MM-DD date strings, unlike every other Reports v2 endpoint's epoch-ms from/to. */
export interface DateRangeOptions {
  from: string;
  to: string;
}

export async function apiUsageSummary(creds: UmbrellaCredentials, range: DateRangeOptions): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(`/reports/v2/apiUsage/summary${buildQuery({ from: range.from, to: range.to })}`, headers)
  );
}

export async function apiUsageRequests(creds: UmbrellaCredentials, range: DateRangeOptions): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(`/reports/v2/apiUsage/requests${buildQuery({ from: range.from, to: range.to })}`, headers)
  );
}

export async function apiUsageResponses(creds: UmbrellaCredentials, range: DateRangeOptions): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(`/reports/v2/apiUsage/responses${buildQuery({ from: range.from, to: range.to })}`, headers)
  );
}

export async function apiUsageKeys(creds: UmbrellaCredentials, range: DateRangeOptions): Promise<UmbrellaReportResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaReportResponse>(`/reports/v2/apiUsage/keys${buildQuery({ from: range.from, to: range.to })}`, headers)
  );
}

// ---------------------------------------------------------------------
// Investigate (investigate/v2)
// ---------------------------------------------------------------------

export async function domainCategorization(creds: UmbrellaCredentials, domain: string): Promise<UmbrellaDomainCategorization> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaDomainCategorization>(`/investigate/v2/domains/categorization/${encodeURIComponent(domain)}`, headers)
  );
}

export async function domainRiskScore(creds: UmbrellaCredentials, domain: string): Promise<UmbrellaDomainRiskScore> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaDomainRiskScore>(`/investigate/v2/domains/risk-score/${encodeURIComponent(domain)}`, headers)
  );
}

export async function domainSecurityScore(creds: UmbrellaCredentials, domain: string): Promise<UmbrellaDomainSecurityScore> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaDomainSecurityScore>(`/investigate/v2/security/name/${encodeURIComponent(domain)}`, headers)
  );
}

export async function topMostSeenDomains(creds: UmbrellaCredentials): Promise<unknown> {
  return withAccessToken(creds, (headers) => request<unknown>('/investigate/v2/topmillion', headers));
}

export async function getSamples(creds: UmbrellaCredentials, domainIpOrUrl: string): Promise<UmbrellaSamplesResponse> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaSamplesResponse>(`/investigate/v2/samples/${encodeURIComponent(domainIpOrUrl)}`, headers)
  );
}

export async function domainVolume(creds: UmbrellaCredentials, domain: string): Promise<UmbrellaDomainVolume> {
  return withAccessToken(creds, (headers) => request<UmbrellaDomainVolume>(`/investigate/v2/domains/volume/${encodeURIComponent(domain)}`, headers));
}

export async function domainResourceRecords(creds: UmbrellaCredentials, domain: string): Promise<UmbrellaResourceRecords> {
  return withAccessToken(creds, (headers) =>
    request<UmbrellaResourceRecords>(`/investigate/v2/pdns/name/${encodeURIComponent(domain)}`, headers)
  );
}
