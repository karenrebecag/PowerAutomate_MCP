# CLAUDE.md — Power Automate MCP

Local stdio MCP server for **personal** Power Automate cloud flows. Personal
reverse-engineering project. Read `README.md` for the product story,
`docs/DEVELOPMENT.md` for how to extend it, and `docs/SECURITY.md` for tokens.

## The one thing to never forget

This rides `api.flow.microsoft.com` — **undocumented and unsupported**. Route
templates are not in Microsoft's reference docs; they come from observed
behaviour. Therefore: **never write a tool against a guessed endpoint shape.**
Run `pnpm probe` first, read the real response from `scratch/`, then type the
tool against that. A route that 404s in the probe is dropped, not shipped.

## Auth model

- Public first-party client `51f81489-12ee-4a9e-aaae-a2591f45987d`, device-code
  delegated grant. No app registration, no admin consent (when the tenant allows
  this path).
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

## Conventions

- ESM (`NodeNext`), `strict`, single quotes, semicolons, printWidth 100.
- One tool per file in `src/tools/`, exporting `xSchema` (zod) + `handleX`.
- Read tools set `readOnlyHint`. Write tools (`create_or_update_flow`,
  `set_flow_state`) require an explicit preview path first (`dryRun` default
  true / `confirm` required).
- `pnpm verify` = check + lint + format:check + test. Run before calling done.

## Scope (v1)

**In:** list environments, list/get flows, run history, run actions (debug),
create/update flow definition, start/stop.

**Out:** delete flow, desktop flows, tenant governance, `list_connections` as a
standalone tool (route differed / not confirmed cleanly; connection references
are available on `get_flow`).

## When helping a user operate flows

1. `list_environments` → pick environment ID.
2. `list_flows` → pick flow ID.
3. Prefer `get_flow_runs` + `get_run_actions` before editing definitions.
4. Any definition change: `get_flow` → edit → `create_or_update_flow` with
   dry-run first → only then `dryRun: false` after the user confirms.
