/**
 * Phase 0 — endpoint reconnaissance.
 *
 * Before writing a single tool, we confirm the *actual* request/response shape
 * of every read route against this tenant, because the service API is
 * undocumented: the route templates below come from blog archaeology and
 * FlowStudio's observable behaviour, not from Microsoft reference docs. A route
 * that 404s here gets dropped from the tool surface instead of shipping broken.
 *
 * Nothing here writes. Each successful probe dumps a trimmed sample of the real
 * response to scratch/<name>.json (gitignored) so the tool layer can be typed
 * against ground truth.
 *
 * Run:  pnpm probe        (after `pnpm login`)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flowRequest } from '../src/client/flow-api.js';

const SCRATCH = join(dirname(dirname(fileURLToPath(import.meta.url))), 'scratch');
mkdirSync(SCRATCH, { recursive: true });

const green = (m: string) => `\x1b[32m✓\x1b[0m ${m}`;
const red = (m: string) => `\x1b[31m✗\x1b[0m ${m}`;

function save(name: string, data: unknown): void {
  writeFileSync(join(SCRATCH, `${name}.json`), JSON.stringify(data, null, 2), 'utf8');
}

interface EnvList {
  value: { name: string; properties?: { displayName?: string; isDefault?: boolean } }[];
}
interface FlowList {
  value: { name: string; properties?: { displayName?: string; state?: string } }[];
}
interface RunList {
  value: { name: string; properties?: { status?: string; startTime?: string } }[];
}

async function probe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const result = await fn();
    process.stdout.write(`  ${green(label)}\n`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`  ${red(`${label} — ${msg.slice(0, 160)}`)}\n`);
    return null;
  }
}

async function main(): Promise<void> {
  process.stdout.write('\n══ Phase 0 · endpoint recon ══\n\n');

  // 1 — environments
  const envs = await probe('environments', () =>
    flowRequest<EnvList>('/providers/Microsoft.ProcessSimple/environments'),
  );
  if (!envs?.value?.length) {
    process.stdout.write('\n  no environments — cannot continue\n\n');
    process.exit(1);
  }
  save('environments', envs);
  const env = envs.value.find((e) => e.properties?.isDefault) ?? envs.value[0];
  const envId = env.name;
  process.stdout.write(`    → using ${env.properties?.displayName} (${envId})\n\n`);

  // 2 — flows in the environment
  const flows = await probe('flows', () =>
    flowRequest<FlowList>(`/providers/Microsoft.ProcessSimple/environments/${envId}/flows`, {
      query: { $top: '50' },
    }),
  );
  if (flows) save('flows', flows);
  const flow = flows?.value?.[0];
  if (!flow) {
    process.stdout.write('\n  no flows to drill into — stopping after list probes\n\n');
    return;
  }
  const flowId = flow.name;
  process.stdout.write(`    → drilling into "${flow.properties?.displayName}" (${flowId})\n\n`);

  // 3 — full flow definition
  const def = await probe('get flow (full definition)', () =>
    flowRequest(`/providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}`, {
      query: { $expand: 'properties.connectionReferences,properties.definition' },
    }),
  );
  if (def) save('flow-definition', def);

  // 4 — run history
  const runs = await probe('flow runs', () =>
    flowRequest<RunList>(
      `/providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}/runs`,
      { query: { $top: '5' } },
    ),
  );
  if (runs) save('runs', runs);
  const run = runs?.value?.[0];

  // 5 — actions of a single run (the hard one: this is where per-action
  // inputs/outputs live, and it is the least-documented route).
  if (run) {
    process.stdout.write(`    → inspecting run ${run.name} (${run.properties?.status})\n`);
    const actions = await probe('run actions', () =>
      flowRequest(
        `/providers/Microsoft.ProcessSimple/environments/${envId}/flows/${flowId}/runs/${run.name}/actions`,
      ),
    );
    if (actions) save('run-actions', actions);
  } else {
    process.stdout.write(`  ${red('run actions — no runs available to inspect')}\n`);
  }

  // 6 — connections
  const conns = await probe('connections', () =>
    flowRequest(`/providers/Microsoft.ProcessSimple/environments/${envId}/connections`, {
      query: { $top: '50' },
    }),
  );
  if (conns) save('connections', conns);

  process.stdout.write(`\n══ done — samples written to scratch/ ══\n\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`\n  ${err instanceof Error ? err.message : String(err)}\n\n`);
  process.exit(1);
});
