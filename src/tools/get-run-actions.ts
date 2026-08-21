/**
 * get_run_actions — per-action breakdown of a single run: the debugging view.
 *
 * ── The two-hop gotcha (found in Phase 0) ───────────────────────────────────
 * The actions list returns each action's status/code/error inline, but NOT its
 * inputs and outputs. Those are offloaded to Azure blob storage and referenced
 * as `inputsLink` / `outputsLink` — short-lived SAS URLs. To show what an action
 * actually received and returned, we follow those links in a second hop.
 *
 * We only follow links for actions the caller cares about (failed by default,
 * or a named action), because a big run can have dozens of links and each is a
 * separate fetch. `includeIO: "all"` follows every link — use sparingly.
 *
 * A Cancelled/Skipped action has no links at all; those come back with io=null.
 */
import { z } from 'zod';
import { flowRequest } from '../client/flow-api.js';
import { jsonResult, runTool } from '../core/tool-result.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const getRunActionsSchema = z.object({
  environmentId: z.string().describe('Environment ID.'),
  flowId: z.string().describe('Flow ID.'),
  runId: z.string().describe('Run ID from get_flow_runs.'),
  includeIO: z
    .enum(['failed', 'all', 'none'])
    .optional()
    .describe('Follow inputs/outputs links for: failed actions (default), all, or none.'),
  actionName: z.string().optional().describe('Only this action; follows its I/O links.'),
});

interface ActionEnvelope {
  name: string;
  properties?: {
    status?: string;
    code?: string;
    startTime?: string;
    endTime?: string;
    error?: { code?: string; message?: string };
    inputsLink?: { uri?: string };
    outputsLink?: { uri?: string };
  };
}

const FAILED_STATUSES = new Set(['Failed', 'TimedOut']);

// SAS blob links are already authenticated by the URL itself — no bearer token,
// and adding one can trip the storage layer. Fetch them bare.
async function followLink(uri: string | undefined): Promise<unknown> {
  if (!uri) return null;
  try {
    const res = await fetch(uri);
    if (!res.ok) return { fetchError: `HTTP ${res.status}` };
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    return { fetchError: err instanceof Error ? err.message : String(err) };
  }
}

export async function handleGetRunActions(
  args: z.infer<typeof getRunActionsSchema>,
): Promise<CallToolResult> {
  return runTool(async () => {
    const res = await flowRequest<{ value: ActionEnvelope[] }>(
      `/providers/Microsoft.ProcessSimple/environments/${args.environmentId}` +
        `/flows/${args.flowId}/runs/${args.runId}/actions`,
    );
    const mode = args.includeIO ?? 'failed';

    const actions = await Promise.all(
      (res.value ?? []).map(async (a) => {
        const p = a.properties ?? {};
        const wantIO =
          args.actionName === a.name ||
          (args.actionName === undefined &&
            (mode === 'all' || (mode === 'failed' && FAILED_STATUSES.has(p.status ?? ''))));

        const base = {
          name: a.name,
          status: p.status,
          code: p.code,
          error: p.error,
        };
        if (!wantIO) return base;

        const [inputs, outputs] = await Promise.all([
          followLink(p.inputsLink?.uri),
          followLink(p.outputsLink?.uri),
        ]);
        return { ...base, inputs, outputs };
      }),
    );

    return jsonResult({ runId: args.runId, count: actions.length, actions });
  });
}
