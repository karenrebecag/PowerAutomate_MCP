# Security notes

This is a **personal, local** MCP server. It never opens a network listener for
clients: the MCP host talks to it over **stdio**. All calls to Microsoft APIs
use **your** delegated identity.

## What is stored on disk

| Artifact | Location | Contents |
|----------|----------|----------|
| Refresh token | `.pa-token` (or `PA_TOKEN_FILE`) | Long-lived OAuth refresh token only |
| Probe samples | `scratch/*.json` | Live API responses from `pnpm probe` |

- `.pa-token` is created with mode `0600` and is **gitignored**.
- Access tokens are kept **in memory** for the process lifetime and refreshed
  about 60 seconds before expiry.
- On refresh, Azure AD often returns a new refresh token; the file is updated so
  the sliding window keeps moving (~90 days of inactivity before re-login).

Never commit `.pa-token`, `scratch/`, or any copied response that includes
secrets, connection strings, or personal data from flow definitions.

## What the token can do

The token is **delegated**: it can do what **you** can do in the Power Automate
portal for that account — nothing more. There is no separate service principal.

Write tools can change or create flows and start/stop them. Defaults are
conservative:

- `create_or_update_flow` → **dry-run unless** `dryRun: false`
- `set_flow_state` → **preview unless** `confirm: true`

Treat an MCP host with this server enabled as equivalent to leaving the Power
Automate portal open under your account.

## What this project does not do

- No client secret, no certificate, no multi-tenant app registration
- No telemetry, no third-party relay of tokens
- No delete-flow tool in v1
- No support for desktop (pad) flows or tenant-wide admin APIs

## If a token may be exposed

1. Delete `.pa-token` locally.
2. In your Microsoft account / Entra, revoke the session or sign out other
   devices as your org policy requires.
3. Run `pnpm login` again on a trusted machine.

## Unsupported API risk (availability, not confidentiality)

Tools call `api.flow.microsoft.com`, which is **undocumented**. Microsoft can
change or remove routes without notice. That is a reliability risk for you as
the operator; it is not an extra data-sharing channel beyond Microsoft’s own
service.

## Organizational policy

Using a public first-party client ID and device code is a common pattern for
interactive tooling, but **your tenant’s policies still apply**. Some tenants
block even this path (admin consent required). If login fails with consent
errors, IT is the only path — this project cannot bypass that.
