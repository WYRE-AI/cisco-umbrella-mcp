# Cisco Umbrella MCP Server

MCP server for [Cisco Umbrella](https://umbrella.cisco.com/)'s NextGen REST API - deployment inventory, admin, policy, reporting, and investigate visibility - for AI assistants and the WYRE Conduit gateway.

## Authentication

Create an API Key in the Umbrella admin console (**Admin > API Keys**, or **Console Settings > API Keys** on a Multi-org/MSP console) to receive an **API Key** and **API Secret** pair.

The secret is shown only once at creation time and cannot be retrieved later - store it somewhere safe immediately.

This server exchanges that pair for a short-lived (1-hour) Bearer access token via `POST /auth/v2/token` (`grant_type=client_credentials`, HTTP Basic auth), and handles the exchange and its refresh on expiry internally. Callers only ever need to supply the long-lived API Key/Secret below.

**A note on a real discrepancy in Cisco's own documentation:** Cisco's published Postman collection ([`CiscoDevNet/cloud-security`](https://github.com/CiscoDevNet/cloud-security), `Umbrella/PostmanExamples/umbrella-external-postman-collection.json`) encodes the token request as a bare `GET` with no body, while Cisco's DevNet "Getting Started" and "Quickstart" prose docs both independently specify `POST` with a `grant_type=client_credentials` form body. This server follows the prose docs (`POST`), since two independent doc pages agree and it matches the standard OAuth2 client_credentials flow Cisco names explicitly - but this was not verified against a live credential pair. If token exchange 401s against a real account, try a bare `GET` with no body before assuming the credentials are bad.

## Configuration

| Env var | Description |
|---|---|
| `CISCOUMBRELLA_API_KEY` | API Key from the Umbrella admin console. |
| `CISCOUMBRELLA_API_SECRET` | API Secret paired with the API Key. Shown only once at creation. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the vars above) or `gateway` (credentials arrive per-request via `X-CiscoUmbrella-*` headers, injected by the Conduit gateway). |
| `CONDUIT_S2S_SECRET` | When set, the HTTP transport requires a valid `X-Gateway-S2S` header (Conduit sidecar auth) on every `/mcp` request. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

## Tools

### Deployments
- `umbrella_list_networks` - list registered public-IP network identities.
- `umbrella_list_internal_networks` - list internal (RFC1918) network identities.
- `umbrella_list_sites` - list Umbrella sites.
- `umbrella_list_virtual_appliances` - list virtual appliances and their status.
- `umbrella_list_roaming_computers` - list roaming-client-enrolled computers.
- `umbrella_get_internal_domains` - get all internal domains configured to bypass Umbrella DNS.

### Admin
- `umbrella_list_roles` - list administrative roles.
- `umbrella_list_users` - list admin console users.
- `umbrella_get_user` - get a specific admin console user.
- `umbrella_list_api_keys` - list configured API keys.

### Policies
- `umbrella_list_destination_lists` - list destination (allow/block) lists.
- `umbrella_list_destinations` - list destinations within a specific destination list.

### Reports
- `umbrella_top_destinations` - most-requested destinations, optionally by traffic type (dns/proxy/firewall).
- `umbrella_total_requests` - total request counts, optionally by traffic type.
- `umbrella_top_categories` - most-requested content/security categories.
- `umbrella_activity` - raw activity log, optionally by traffic type.
- `umbrella_identities` - identities (roaming/network/mobile/AD users) with traffic summaries.
- `umbrella_appdiscovery_applications` - discovered cloud applications.
- `umbrella_appdiscovery_app_identities` - identities observed using a discovered application.
- `umbrella_appdiscovery_app_risk` - risk details for a discovered application.
- `umbrella_api_usage_summary` / `umbrella_api_usage_requests` / `umbrella_api_usage_responses` / `umbrella_api_usage_keys` - API usage reporting.

### Investigate
- `umbrella_domain_categorization` - content/security categorization for a domain.
- `umbrella_domain_risk_score` - Cisco's risk score for a domain.
- `umbrella_domain_security_score` - detailed security scoring signals for a domain.
- `umbrella_top_most_seen_domains` - the top million most globally-popular domains.
- `umbrella_get_samples` - malware/file samples for a domain, IP, or URL.
- `umbrella_domain_volume` - DNS query volume over time for a domain.
- `umbrella_domain_resource_records` - passive DNS resource records for a domain.

Every Reports/Investigate/Deployments/Admin/Policies list tool that Cisco's docs don't fully enumerate the filter set for accepts an optional `additionalParams` object, passed through verbatim as extra query-string parameters (e.g. `categories`, `identityids`, `verdict`, `domains` on Reports endpoints) - documented Cisco filters this client doesn't model as first-class arguments.

## Scope

This is a v1, **read-only** surface: this server only implements `GET` endpoints across Deployments, Admin, Policies, Reports, and Investigate. Explicitly deferred, all real endpoints in Cisco's own Postman collection, out of scope for now:

- Add/remove internal domains (`POST`/`DELETE /deployments/v2/internaldomains`)
- Add/remove tunnels (`POST`/`DELETE /deployments/v2/tunnels`)
- Add tags and tag/untag devices (`POST /deployments/v2/tags*`)
- Create/delete users (`POST`/`DELETE /admin/v2/users`)
- Create API keys (`POST /admin/v2/apiKeys`)
- Add/remove destinations on a destination list (`POST`/`DELETE /policies/v2/destinationlists/{id}/destinations`)
- Update an App Discovery application's label (`PATCH /reports/v2/appDiscovery/applications/{id}`)

These are provisioning/mutation actions, out of scope for a read-only monitoring connector - consistent with how other connectors in this wave (Printix, WatchGuard Cloud) deferred provisioning-heavy writes. They can be added as a follow-up if a write-capable v2 is ever needed.

Also explicitly out of scope: the **Legacy** Umbrella Reporting v1/v2 APIs (different auth, different host - `investigate.api.umbrella.com` / `management.api.umbrella.com`) and any Multi-org/MSP child-organization switching via the `X-Umbrella-OrgId` header - real, documented Cisco behavior, but not covered in enough concrete request/response detail (whether it applies to the token request, every subsequent request, or both) to implement with confidence without a live credential pair to verify against.

## Development

```bash
npm install
npm run build
npm test
npm run lint   # tsc --noEmit
```

## Docker

```bash
docker build -t cisco-umbrella-mcp .
docker run -p 8080:8080 \
  -e CISCOUMBRELLA_API_KEY=... \
  -e CISCOUMBRELLA_API_SECRET=... \
  cisco-umbrella-mcp
```
