/**
 * set_flow_state — turn a flow on (start) or off (stop).
 *
 * The service API exposes these as sibling POST actions on the flow resource:
 *   POST .../flows/{id}/start
 *   POST .../flows/{id}/stop
 * Both return 200 with no meaningful body. We read the flow back afterwards so
 * the caller gets the actual resulting state, not just an assumption.
 *
 * This is a write tool. It has real consequences — stopping a flow halts a
 * running automation — so it takes an explicit `confirm: true`. Without it the
 * tool refuses and reports what it *would* do, mirroring the dryRun pattern of
 * create_or_update_flow.
 */
import { z } from 'zod';
import { flowRequest } from '../client/flow-api.js';
import { jsonResult, runTool } from '../core/tool-result.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const setFlowStateSchema = z.object({
  environmentId: z.string().describe('Environment ID.'),
  flowId: z.string().describe('Flow ID.'),
  state: z.enum(['start', 'stop']).describe('Turn the flow on (start) or off (stop).'),
  confirm: z
    .boolean()
    .optional()
    .describe('Must be true to actually apply. Omit to preview the intended change.'),
});

interface FlowStateEnvelope {
  properties?: { state?: string; displayName?: string };
}

export async function handleSetFlowState(
  args: z.infer<typeof setFlowStateSchema>,
): Promise<CallToolResult> {
  return runTool(async () => {
    const base = `/providers/Microsoft.ProcessSimple/environments/${args.environmentId}/flows/${args.flowId}`;

    // Read current state first — both to preview and to report the delta.
    const before = await flowRequest<FlowStateEnvelope>(base, {
      query: { $expand: 'properties' },
    });
    const currentState = before.properties?.state;
    const displayName = before.properties?.displayName;

    if (!args.confirm) {
      return jsonResult({
        preview: true,
        flow: displayName,
        currentState,
        wouldSet: args.state === 'start' ? 'Started' : 'Stopped',
        note: 'Pass confirm:true to apply.',
      });
    }

    await flowRequest(`${base}/${args.state}`, { method: 'POST' });

    const after = await flowRequest<FlowStateEnvelope>(base, {
      query: { $expand: 'properties' },
    });
    const resultingState = after.properties?.state;

    return jsonResult({
      applied: true,
      flow: displayName,
      previousState: currentState,
      resultingState,
      changed: currentState !== resultingState,
    });
  });
}
