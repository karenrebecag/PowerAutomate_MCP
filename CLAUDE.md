# CLAUDE.md — Power Automate MCP

Local stdio MCP server for **personal** Power Automate cloud flows. Personal
reverse-engineering project. Read `README.md` for the full backstory.

## The one thing to never forget

This rides `api.flow.microsoft.com` — **undocumented and unsupported**. Route
templates are not in Microsoft's reference docs; they come from observed
behaviour. Therefore: **never write a tool against a guessed endpoint shape.**
Run `pnpm probe` first, read the real response from `scratch/`, then type the
tool against that. A route that 404s in the probe is dropped, not shipped.

## Auth model

- Public first-party client `51f81489-12ee-4a9e-aaae-a2591f45987d`, device-code
  delegated grant. No app registration, no admin consent.
- Scope audience has a deliberate double slash:
  `https://service.flow.microsoft.com//user_impersonation`. Do not "fix" it.
- Refresh token in `.pa-token` (0600, gitignored). Access tokens minted on
  demand, cached in-process, refreshed 60s early.
- `pnpm login` re-runs the device flow (new machine / expired token / switch
  account).

## Two-API design

`src/client/flow-api.ts` holds both `FLOW_SERVICE_BASE` (used) and
`POWER_PLATFORM_BASE` (dormant, official). Personal flows are invisible to the
official API — it needs Dataverse solution flows. Keep tool request shapes
routed through `flowRequest` so retargeting is a base-URL change.

## Conventions (inherited from SalesforceATFX_mcp)

- ESM (`NodeNext`), `strict`, single quotes, semicolons, printWidth 100.
- One tool per file in `src/tools/`, exporting `xSchema` (zod) + `handleX`.
- Read tools set `readOnlyHint`. Write tools (`create_or_update_flow`,
  `set_flow_state`) require an explicit `dryRun` preview path first.
- `pnpm verify` = check + lint + format:check + test. Run before calling done.

## Scope

In: list/get/create/update flows, run history, run actions, connections,
start/stop. No delete in v1. No desktop flows. No tenant governance.
