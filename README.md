# Power Automate MCP

A local [MCP](https://modelcontextprotocol.io) server that lets an AI agent
inspect and edit your **personal Power Automate cloud flows** — authenticated
with your own Microsoft account, with no admin consent and no paid subscription.

It exists because the hosted alternatives charge a monthly fee to wrap an API
that Microsoft already exposes to your account for free — and because the Power
Automate portal is a poor interface when you would rather **describe the change
and let an agent apply it under guardrails**. This repo is the reverse-engineering
writeup of how that API actually works, packaged as a working tool.

**Personal project, provided as-is.** Read the [reliability note](#reliability-note-read-this)
and [docs/SECURITY.md](docs/SECURITY.md) before depending on it.

Not affiliated with or endorsed by Microsoft.

---

## The interesting part: how it authenticates without asking IT

Every "manage Power Automate from code" tutorial tells you to register an app in
Entra ID and get an admin to consent to `Dynamics CRM user_impersonation` or
`Flows.Manage.All`. In a locked-down corporate tenant that request is a
non-starter — it grants a standing service principal, and admins (rightly) say
no.

This project sidesteps that entirely by using a **public first-party client
ID** that Microsoft ships for interactive tooling:

```
51f81489-12ee-4a9e-aaae-a2591f45987d   ("Dynamics 365 Example Client", of XrmToolBox fame)
```

Driven through the **OAuth 2.0 device-code grant**, this is a *delegated* login:
the token carries your identity and your permissions, there is no service
principal for anyone to approve, and no consent screen appears. You can talk to
Power Automate from your laptop with exactly the rights you already have in the
portal — nothing more, nothing less.

The token audience has one non-obvious quirk worth documenting:

```
https://service.flow.microsoft.com//user_impersonation
                                  ^^ two slashes, on purpose
```

The legacy resource URI ends in a slash and the v2 scope syntax appends
`/user_impersonation`, producing the double slash. Some tenants reject the
single-slash form. That one string is the difference between a working login and
an opaque `AADSTS` error.

## The other interesting part: two APIs that see different flows

There are two REST backends and they are **not** interchangeable:

| | `api.flow.microsoft.com` | `api.powerplatform.com` |
| --- | --- | --- |
| Status | Undocumented, unsupported | Official, documented (`2024-10-01`) |
| Sees **personal** flows | **Yes** | No — 404s without Dataverse |
| Sees **solution** flows | Yes | Yes |
| What we use it for | Everything (personal flows) | Wired in, dormant |

The lesson that cost the most research: the *supported* API cannot see personal
flows at all. It requires the flow to live in a Dataverse solution. So any tool
that manages the flows a normal user creates in the portal — including every
paid MCP — has no choice but to ride the unsupported service API. This project
makes that trade-off explicit rather than hiding it.

`src/client/flow-api.ts` keeps both base URLs behind one switch, so a flow that
later moves into a solution (or a future where the service API finally breaks)
is a one-constant change, not a rewrite.

---

## Reliability note (read this)

`api.flow.microsoft.com` is **undocumented and unsupported by Microsoft**. It
can change shape or disappear without notice, and this tool will break when it
does. That risk is precisely what the paid services charge to absorb on your
behalf. For a personal tool where you fix things yourself, it is a fine trade.
For anything load-bearing, it is not. Choose accordingly.

Everything runs as **you**. If you lose access to the account, the tool stops
working — there is no service identity behind it.

---

## Install

Requirements: **Node 18+** (for built-in `fetch`) and **pnpm**. A Microsoft
work/school account that can use Power Automate — nothing more.

```bash
git clone https://github.com/karenrebecag/PowerAutomate_MCP.git
cd PowerAutomate_MCP
pnpm install
pnpm build
```

## Credentials — sign in once

There is no config file to edit and no secret to paste. Authentication is an
interactive **device-code** login against your own Microsoft account:

```bash
pnpm login
```

It prints a URL and a short code:

```
  Power Automate MCP — sign in

  1. Open:  https://microsoft.com/devicelogin
  2. Code:  ABCD-EFGH

  Waiting for you to finish signing in...
```

Open the URL, enter the code, sign in with the account whose flows you want to
manage, and approve. On success a **refresh token** is written to `.pa-token`
(permissions `0600`, gitignored). The server mints short-lived access tokens
from it automatically — you won't be asked again until it expires (~90 days of
inactivity). To switch accounts or recover from an expired token, just re-run
`pnpm login`.

**Optional environment variables**

| Variable | Default | When to set it |
| --- | --- | --- |
| `PA_TENANT_ID` | `organizations` | Pin a specific tenant GUID if your account belongs to several. |
| `PA_TOKEN_FILE` | `.pa-token` beside the package | Store the refresh token somewhere else. |

## Verify (optional but recommended)

`pnpm probe` runs Phase 0 — it calls every read endpoint against *your* tenant
and dumps the real responses to `scratch/` (gitignored). If a route 404s on your
environment you'll see it here rather than mid-use. Nothing it does writes.

```bash
pnpm probe
```

## Register with your MCP client

Add the server to your client's config. For Claude Code that's `~/.mcp.json`:

```json
{
  "mcpServers": {
    "power-automate": {
      "command": "node",
      "args": ["/absolute/path/to/PowerAutomate_MCP/dist/index.js"]
    }
  }
}
```

Use an **absolute** path to `dist/index.js`. The server finds `.pa-token`
relative to its own location, so no working directory or env needs to be set in
the client. Restart the client (or reconnect the server) and the seven tools
appear. A quick check from the terminal without a client:

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node dist/index.js
```

## Tools

| Tool | Writes? | What it does |
| --- | --- | --- |
| `list_environments` | no | Every environment the account can see. Start here for the environment ID. |
| `list_flows` | no | Cloud flows in an environment (summary fields). |
| `get_flow` | no | Full editable definition + connection references. |
| `get_flow_runs` | no | Recent run history: status, code, timing. |
| `get_run_actions` | no | Per-action breakdown of one run; follows inputs/outputs links for failed actions. The debugging view. |
| `set_flow_state` | **yes** | Start / stop a flow. Previews unless you pass `confirm: true`. |
| `create_or_update_flow` | **yes** | Create or edit a flow from a definition object. **`dryRun` is the default** — pass `dryRun: false` to actually write. |

### Typical agent workflow

**Inspect / debug a failure**

```
list_environments
list_flows(environmentId)
get_flow_runs(environmentId, flowId)
get_run_actions(environmentId, flowId, runName)   → see which action failed
```

**Change a definition safely**

```
get_flow(environmentId, flowId)                   → copy properties.definition
… edit the definition object …
create_or_update_flow(..., dryRun: true)          → default; shows wouldSend
create_or_update_flow(..., dryRun: false)         → only after explicit OK
```

Both write tools refuse to mutate anything until you opt in explicitly
(`dryRun: false` / `confirm: true`). Treat that as a feature, not a nuisance —
one bad definition can break a live automation.

### Example conversation (what this is for)

> **You:** Why did "Notify sales on new lead" fail this morning?
>
> **Agent:** *(list_environments → list_flows → get_flow_runs → get_run_actions)*
> The run at 09:14 failed on action `HTTP_To_CRM` with 401. The token connection
> reference is still present on the flow; the downstream API rejected the call.
>
> **You:** Turn the flow off until we fix the connection.
>
> **Agent:** *(set_flow_state preview → confirm: true after you approve)*
> Flow stopped.

You never open the Power Automate designer for that loop. The agent uses the
same permissions you already have in the portal.

---

## Project layout

```
src/
  auth/       device-code login + silent refresh (the interesting bit)
  client/     thin HTTP wrapper over the two REST backends
  core/       shared MCP result helpers
  tools/      one file per MCP tool (added after Phase 0 confirms shapes)
  server.ts   MCP server wiring
  index.ts    stdio transport entry point
scripts/
  probe-endpoints.ts   Phase 0 reconnaissance — run before trusting any tool
docs/
  SECURITY.md          tokens, disk artifacts, blast radius
  DEVELOPMENT.md       how to extend tools without guessing routes
```

## How it was built (spec / probe-driven)

1. **Phase 0** — `pnpm probe` hits read routes on a live tenant and saves real
   JSON under `scratch/` (gitignored).
2. Tools are typed and implemented **only** against those shapes.
3. Routes that 404 or look wrong are **dropped** (e.g. standalone
   `list_connections` is not in v1; refs still appear on `get_flow`).
4. Writes ship with **preview defaults** so an agent cannot apply a definition
   on the first try by accident.

Details: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Status

Working. Seven tools (five read, two write), each shaped against responses
captured by Phase 0 on a live tenant. `pnpm verify` (typecheck + lint + format +
tests) is the local gate.

**Not in v1:** delete flow, desktop flows, tenant admin APIs, standalone
connection listing.

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/SECURITY.md](docs/SECURITY.md) | Token file, delegated blast radius, what not to commit |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Probe-first workflow, scripts, adding tools |
| [CLAUDE.md](CLAUDE.md) | Hard rules for coding agents working in this repo |

## License & intent

[MIT](LICENSE). Personal, educational reverse-engineering project. Shared so
others can learn how this API works and build their own personal tooling on top
of it. Use within your own account and your organization's policies.

Not affiliated with or endorsed by Microsoft.
