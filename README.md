# Cisco Umbrella MCP Server

MCP server for [Cisco Umbrella](https://umbrella.cisco.com/)'s NextGen REST API - deployment inventory, admin, policy, reporting, and investigate visibility - for AI assistants and the WYRE Conduit gateway.

## Authentication

Create an API Key in the Umbrella admin console (**Admin > API Keys**, or **Console Settings > API Keys** on a Multi-org/MSP console) to receive an **API Key** and **API Secret** pair.

The secret is shown only once at creation time and cannot be retrieved later - store it somewhere safe immediately.

This server exchanges that pair for a short-lived (1-hour) Bearer access token via `POST /auth/v2/token` (`grant_type=client_credentials`, HTTP Basic auth), and handles the exchange and its refresh on expiry internally. Callers only ever need to supply the long-lived API Key/Secret below.

**A note on a real discrepancy in Cisco's own documentation:** Cisco's published Postman collection ([`CiscoDevNet/cloud-security`](https://github.com/CiscoDevNet/cloud-security), `Umbrella/PostmanExamples/umbrella-external-postman-collection.json`) encodes the token request as a bare `GET` with no body, while Cisco's DevNet "Getting Started" and "Quickstart" prose docs both independently specify `POST` with a `grant_type=client_credentials` form body. This server follows the prose docs (`POST`), since two independent doc pages agree and it matches the standard OAuth2 client_credentials flow Cisco names explicitly - but this was not verified against a live credential pair. If token exchange 401s against a real account, try a bare `GET` with no body before assuming the credentials are bad.

## Configuration

Copy [`.env.example`](.env.example) and set the variables below. The stdio transport reads `CISCOUMBRELLA_*` and does not use `CONDUIT_S2S_SECRET`.

| Env var | Description |
|---|---|
| `CISCOUMBRELLA_API_KEY` | API Key from the Umbrella admin console. Required for stdio and `AUTH_MODE=env`. Not read in gateway mode. |
| `CISCOUMBRELLA_API_SECRET` | API Secret paired with the API Key. Shown only once at creation. Required for stdio and `AUTH_MODE=env`. Not read in gateway mode. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the vars above) or `gateway` (Docker image and Compose default). Gateway mode requires `X-CiscoUmbrella-Api-Key` and `X-CiscoUmbrella-Api-Secret` on each `/mcp` request and never falls back to `CISCOUMBRELLA_*`. |
| `CONDUIT_S2S_SECRET` | Required for HTTP. HMAC secret checked against `X-Gateway-S2S` on `/mcp`. Generate with `openssl rand -hex 32`. If empty or a known placeholder, the HTTP server logs an error and exits non-zero. The value is never logged. |
| `MCP_ALLOW_INSECURE_DEV` | Set to exactly `1` to start HTTP without `CONDUIT_S2S_SECRET`. Logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` refuses to start. A known placeholder secret is still refused. Local development only. |
| `MCP_HTTP_HOST` | Bind address when `MCP_TRANSPORT=http`. Defaults to `127.0.0.1`. A configured `CONDUIT_S2S_SECRET` honors this value. The container image sets `0.0.0.0`. |
| `MCP_HTTP_PORT` | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

`/health` and `/healthz` stay unauthenticated and do not read credentials.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The check is `verifyS2sHeader` in [`src/s2s-verify.ts`](src/s2s-verify.ts): the header value is `t=<unix seconds>,v1=<hex>`, where the hex is HMAC-SHA256 of the literal string `t=<unix seconds>` keyed with `CONDUIT_S2S_SECRET` (64 lowercase hex characters). The timestamp must be within 300 seconds of the server clock. A missing or invalid header is HTTP 401, before vendor credentials are read. An empty secret refuses to start unless `MCP_ALLOW_INSECURE_DEV=1`. A known placeholder (`replace-with-a-real-secret`, `your-s2s-secret`, `changeme`, `change-me`, `placeholder`, `secret`, `example`, `replace-me`, `s2s-secret`, any case) refuses to start even with that flag, so a copied example cannot forge the header.

```bash
TS=$(date +%s)
SIG=$(printf 't=%s' "$TS" | openssl dgst -sha256 -hmac "$CONDUIT_S2S_SECRET" -hex | awk '{print $NF}')
curl -sS http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "X-Gateway-S2S: t=${TS},v1=${SIG}" \
  -H "X-CiscoUmbrella-Api-Key: $CISCOUMBRELLA_API_KEY" \
  -H "X-CiscoUmbrella-Api-Secret: $CISCOUMBRELLA_API_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

In `AUTH_MODE=gateway`, `/mcp` also requires both `X-CiscoUmbrella-Api-Key` and `X-CiscoUmbrella-Api-Secret`. Those headers are the only credential source for that request. A request missing either one returns 401 and does not fall back to `CISCOUMBRELLA_*` in the process environment.

`AUTH_MODE=env` still requires a valid `X-Gateway-S2S` header, then uses `CISCOUMBRELLA_API_KEY` and `CISCOUMBRELLA_API_SECRET` from the environment.

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

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Startup still refuses to run without a real `CONDUIT_S2S_SECRET`. Publish the port on loopback. In gateway mode, Umbrella credentials arrive on each request as headers; they are not read from the environment.

```bash
docker build -t cisco-umbrella-mcp .
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -p 127.0.0.1:8080:8080 \
  cisco-umbrella-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset, defaults `AUTH_MODE` to `gateway`, publishes `127.0.0.1:8080:8080`, and does not set `CISCOUMBRELLA_API_KEY`, `CISCOUMBRELLA_API_SECRET`, or `env_file`:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `CISCOUMBRELLA_API_KEY` and `CISCOUMBRELLA_API_SECRET`. It is separate from the gateway Compose service above.

```bash
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTH_MODE=env \
  -e CISCOUMBRELLA_API_KEY=... \
  -e CISCOUMBRELLA_API_SECRET=... \
  -p 127.0.0.1:8080:8080 \
  cisco-umbrella-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` (including when `MCP_HTTP_HOST` is `localhost` or `::1`) and logs a warning. A non-loopback `MCP_HTTP_HOST` makes startup exit. The container image sets `MCP_HTTP_HOST=0.0.0.0`, so the bypass inside Docker also needs `-e MCP_HTTP_HOST=127.0.0.1`. Do not publish that port off loopback.

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```
