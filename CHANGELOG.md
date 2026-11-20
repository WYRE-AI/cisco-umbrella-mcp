# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The HTTP transport no longer exits on a malformed request (WYREAI-741).** The request
  target was parsed against the client-supplied `Host` header, and a value that does not parse
  (or a target such as `//`) threw inside the request listener before authentication. The
  target is now parsed against a fixed base, so `Host` is no longer consulted, and a target
  that still cannot be parsed gets a `400` JSON response while the server keeps running.

### Added
- Initial release: MCP server for Cisco Umbrella's NextGen REST API.
- Deployment tools: `umbrella_list_networks`, `umbrella_list_internal_networks`, `umbrella_list_sites`, `umbrella_list_virtual_appliances`, `umbrella_list_roaming_computers`, `umbrella_get_internal_domains`.
- Admin tools: `umbrella_list_roles`, `umbrella_list_users`, `umbrella_get_user`, `umbrella_list_api_keys`.
- Policy tools: `umbrella_list_destination_lists`, `umbrella_list_destinations`.
- Report tools: `umbrella_top_destinations`, `umbrella_total_requests`, `umbrella_top_categories`, `umbrella_activity`, `umbrella_identities`, `umbrella_appdiscovery_applications`, `umbrella_appdiscovery_app_identities`, `umbrella_appdiscovery_app_risk`, `umbrella_api_usage_summary`, `umbrella_api_usage_requests`, `umbrella_api_usage_responses`, `umbrella_api_usage_keys`.
- Investigate tools: `umbrella_domain_categorization`, `umbrella_domain_risk_score`, `umbrella_domain_security_score`, `umbrella_top_most_seen_domains`, `umbrella_get_samples`, `umbrella_domain_volume`, `umbrella_domain_resource_records`.
- Transparent OAuth2 client_credentials token exchange and refresh (`POST /auth/v2/token`) wrapping every tool call.
- Distinct error classes for invalid credentials (401/403) vs. rate limiting (429) vs. other API errors.
