# Development

How this repo is meant to be extended. The short version: **probe first, type
against real JSON, then ship a tool** — never the other way around.

## Prerequisites

- Node 18+
- pnpm
- A Microsoft work/school account that can use Power Automate
- `pnpm login` completed on the machine

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm build` | Compile `src/` → `dist/` |
| `pnpm dev` | Run entry with `tsx` (stdio MCP) |
| `pnpm login` | Device-code sign-in; writes `.pa-token` |
| `pnpm probe` | Phase 0 recon; writes `scratch/*.json` (read-only) |
| `pnpm test` | Vitest unit tests |
| `pnpm verify` | `check` + `lint` + `format:check` + `test` |

`pnpm verify` should be green before you call a change done.

## Phase 0 (mandatory for new routes)

`api.flow.microsoft.com` is unsupported. Route templates in this repo come from
observed behaviour, not from a public reference contract.

1. Add or adjust a call in `scripts/probe-endpoints.ts` if needed.
2. Run `pnpm probe`.
3. Inspect `scratch/<name>.json`.
4. If the route 404s or returns an unusable shape → **do not** add an MCP tool
   for it. Drop it or park it (see `list_connections` in v1).
5. Only then implement `src/tools/<name>.ts` with types that match the sample.

Probe never writes to the tenant. Tools that write must still default to
preview (`dryRun` / `confirm`).

## Layout

```
src/
  auth/       device-code + refresh (public client ID)
  client/     HTTP wrapper; both API bases, one switch
  core/       shared tool result helpers
  tools/      one file per MCP tool (zod schema + handler)
  server.ts   tool registration + MCP instructions
  index.ts    stdio entry
scripts/
  probe-endpoints.ts
tests/
  …
```

Conventions (aligned with the sibling Salesforce MCP pattern):

- ESM (`NodeNext`), TypeScript strict
- Single quotes, semicolons, Prettier printWidth 100
- One tool per file: export `xSchema` + `handleX`
- Read tools: `readOnlyHint: true`
- Write tools: explicit opt-in before mutation

## Adding a tool

1. Confirm the route with Phase 0.
2. Create `src/tools/my-tool.ts` with zod input schema and handler.
3. Re-export from `src/tools/index.ts`.
4. Register in `src/server.ts` with description and annotations.
5. Add unit tests for pure logic / dry-run behaviour where possible.
6. Run `pnpm verify`.

Prefer thin tools: list/get shapes stay close to the API; the agent composes
them. Do not expand scope into tenant governance, desktop flows, or delete
without an explicit product decision.

## Two API bases

`src/client/flow-api.ts` keeps:

- **Active:** `api.flow.microsoft.com` — personal + solution flows (undocumented)
- **Dormant:** `api.powerplatform.com` — official; does **not** see personal flows

All tools should go through `flowRequest` so a future retarget is a base-URL
change, not a rewrite of every tool.

## Testing limits

Unit tests cover dry-run behaviour and result helpers. They do **not** call a
live tenant (no CI secret for `.pa-token`). Live confidence is:

1. `pnpm probe` on your account
2. Manual MCP session against a non-critical flow

## Agent instructions

See [CLAUDE.md](../CLAUDE.md) for the hard rules agents must not “fix.”
