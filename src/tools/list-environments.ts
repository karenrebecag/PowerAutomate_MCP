/**
 * list_environments — every Power Platform environment visible to the account.
 *
 * Shape confirmed by Phase 0 against a live tenant: items carry a top-level
 * `name` (the environment ID used by every other route) and the readable
 * fields under `properties`.
 */
import { z } from 'zod';
import { flowRequest } from '../client/flow-api.js';
import { jsonResult, runTool } from '../core/tool-result.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const listEnvironmentsSchema = z.object({});

interface EnvelopeEnv {
  name: string;
  properties?: {
    displayName?: string;
    isDefault?: boolean;
    environmentSku?: string;
    azureRegionHint?: string;
  };
}

export async function handleListEnvironments(): Promise<CallToolResult> {
  return runTool(async () => {
    const res = await flowRequest<{ value: EnvelopeEnv[] }>(
      '/providers/Microsoft.ProcessSimple/environments',
    );
    const environments = (res.value ?? []).map((e) => ({
      id: e.name,
      displayName: e.properties?.displayName,
      isDefault: e.properties?.isDefault ?? false,
      sku: e.properties?.environmentSku,
      region: e.properties?.azureRegionHint,
    }));
    return jsonResult({ count: environments.length, environments });
  });
}
