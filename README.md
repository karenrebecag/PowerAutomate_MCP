# Power Automate MCP

A local [MCP](https://modelcontextprotocol.io) server that lets an AI agent
inspect and edit your **personal Power Automate cloud flows** — authenticated
with your own Microsoft account, with no admin consent and no paid subscription.

It exists because the hosted alternatives charge a monthly fee to wrap an API
that Microsoft already exposes to your account for free. This repo is the
reverse-engineering writeup of how that API actually works, packaged as a
working tool. **Personal project, provided as-is** — read the reliability note
before depending on it.

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

## Setup

```bash
pnpm install
pnpm login       # one-time device-code sign-in; stores a refresh token (0600)
pnpm probe       # Phase 0: confirm every endpoint against your tenant
pnpm build
```

Then register it with your MCP client (e.g. Claude Code, `~/.mcp.json`):

```json
{
  "mcpServers": {
    "power-automate": {
      "command": "node",
      "args": ["/absolute/path/to/PowerAutomate_mcp/dist/index.js"]
    }
  }
}
```

## Project layout

```
src/
  auth/       device-code login + silent refresh (the interesting bit)
  client/     thin HTTP wrapper over the two REST backends
  tools/      one file per MCP tool (added after Phase 0 confirms shapes)
  server.ts   MCP server wiring
  index.ts    stdio transport entry point
scripts/
  probe-endpoints.ts   Phase 0 reconnaissance — run before trusting any tool
```

## Status

Scaffold + auth + Phase 0 probe are in place. Tools are written against the real
response shapes the probe captures — see `scratch/` after running `pnpm probe`.

## License & intent

Personal, educational reverse-engineering project. Shared so others can learn
how this API works and build their own personal tooling on top of it. Not
affiliated with or endorsed by Microsoft. Use within your own account and your
organization's policies.
