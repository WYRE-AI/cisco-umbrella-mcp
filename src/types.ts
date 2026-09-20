/**
 * Long-lived credentials issued out-of-band by Cisco Umbrella (Admin > API
 * Keys, or Console Settings > API Keys on a Multi-org/MSP console). This
 * pair is exchanged for a short-lived Bearer access token at
 * POST /auth/v2/token (HTTP Basic auth of apiKey:apiSecret). The secret is
 * shown only once at creation and cannot be retrieved later - see client.ts.
 */
export interface UmbrellaCredentials {
  apiKey: string;
  apiSecret: string;
}

/** Response body of POST /auth/v2/token. */
export interface UmbrellaTokenResponse {
  token_type?: string;
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * Cisco's documented traffic-type breakdown, available as a path suffix on
 * several Reports v2 endpoints (top-destinations, total-requests, activity).
 * Omitting it returns the all-traffic-types view.
 */
export type UmbrellaTrafficType = 'dns' | 'proxy' | 'firewall';

/** Common paging query params accepted by most Reports v2 list endpoints. */
export interface PagingOptions {
  limit?: number;
  offset?: number;
}

/** Common time-range query params required by most Reports v2 endpoints. Epoch milliseconds, per Cisco's documented Reports API. */
export interface TimeRangeOptions {
  from: number;
  to: number;
}

/**
 * Escape hatch for any documented Cisco query parameter this client does not
 * model explicitly (e.g. `categories`, `identityids`, `verdict`, `domains`
 * on Reports v2 endpoints). Passed through verbatim rather than guessed at,
 * since Cisco's own Postman collection does not enumerate the full filter
 * set for every endpoint.
 */
export interface AdditionalParams {
  additionalParams?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------
// Deployments (deployments/v2)
// ---------------------------------------------------------------------

export interface UmbrellaNetwork {
  originId?: number;
  name?: string;
  ipAddress?: string;
  prefixLength?: number;
  isDynamic?: boolean;
  status?: string;
  siteId?: number;
  siteName?: string;
  [key: string]: unknown;
}

export interface UmbrellaInternalNetwork {
  id?: number;
  name?: string;
  ipAddress?: string;
  prefixLength?: number;
  tags?: Record<string, unknown>[];
  siteId?: number;
  [key: string]: unknown;
}

export interface UmbrellaSite {
  siteId?: number;
  siteName?: string;
  isDefault?: boolean;
  internalNetworkCount?: number;
  [key: string]: unknown;
}

export interface UmbrellaVirtualAppliance {
  vaId?: number;
  originId?: number;
  name?: string;
  siteId?: number;
  siteName?: string;
  swVersion?: string;
  status?: string;
  [key: string]: unknown;
}

export interface UmbrellaRoamingComputer {
  originId?: number;
  originLabel?: string;
  status?: string;
  osVersionName?: string;
  clientVersion?: string;
  lastSyncStatus?: string;
  [key: string]: unknown;
}

export interface UmbrellaInternalDomain {
  id?: number;
  domain?: string;
  siteId?: number;
  siteName?: string;
  comment?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Admin (admin/v2)
// ---------------------------------------------------------------------

export interface UmbrellaRole {
  roleId?: number;
  roleName?: string;
  description?: string;
  [key: string]: unknown;
}

export interface UmbrellaUser {
  userId?: number;
  email?: string;
  firstname?: string;
  lastname?: string;
  role?: Record<string, unknown>;
  status?: string;
  twoFactorAuthEnabled?: boolean;
  [key: string]: unknown;
}

export interface UmbrellaApiKeyRecord {
  keyId?: string;
  keyName?: string;
  keyType?: string;
  createdAt?: string;
  scopes?: unknown[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Policies (policies/v2)
// ---------------------------------------------------------------------

export interface UmbrellaDestinationList {
  id?: number;
  name?: string;
  isGlobal?: boolean;
  access?: string;
  destinationCount?: number;
  [key: string]: unknown;
}

export interface UmbrellaDestination {
  id?: number;
  destination?: string;
  type?: string;
  comment?: string;
  createdAt?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Reports (reports/v2)
// ---------------------------------------------------------------------

/** Envelope every Reports v2 list endpoint returns: a `data` array plus a `meta` block describing paging/warnings. Cisco's exact meta shape varies slightly by endpoint, so it's kept loose here. */
export interface UmbrellaReportResponse<T = Record<string, unknown>> {
  data?: T[];
  meta?: { warnings?: unknown[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface UmbrellaIdentitySummary {
  id?: string;
  label?: string;
  type?: { type?: string };
  requests?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Investigate (investigate/v2)
// ---------------------------------------------------------------------

export interface UmbrellaDomainCategorization {
  [domainOrStatus: string]: unknown;
}

export interface UmbrellaDomainRiskScore {
  riskscore?: number;
  [key: string]: unknown;
}

export interface UmbrellaDomainSecurityScore {
  dga_score?: number;
  perplexity?: number;
  entropy?: number;
  securerank2?: number;
  [key: string]: unknown;
}

export interface UmbrellaSamplesResponse {
  samples?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface UmbrellaDomainVolume {
  [key: string]: unknown;
}

export interface UmbrellaResourceRecords {
  rrs?: Record<string, unknown>[];
  features?: Record<string, unknown>;
  [key: string]: unknown;
}
