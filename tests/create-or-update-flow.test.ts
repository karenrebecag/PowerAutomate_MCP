import { describe, it, expect } from 'vitest';
import { handleCreateOrUpdateFlow } from '../src/tools/create-or-update-flow.js';

// These exercise the dryRun path, which returns before any network call — so
// the safety-critical default (never write unless dryRun:false) is verified
// without touching a tenant.

describe('create_or_update_flow — safety defaults', () => {
  it('defaults to dryRun (no write) when dryRun is omitted', async () => {
    const r = await handleCreateOrUpdateFlow({
      environmentId: 'env',
      flowId: 'flow',
      definition: { triggers: {}, actions: {} },
    });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.dryRun).toBe(true);
    expect(payload.operation).toBe('update');
  });

  it('treats a missing flowId as a create', async () => {
    const r = await handleCreateOrUpdateFlow({
      environmentId: 'env',
      displayName: 'New Flow',
      definition: { triggers: {}, actions: {} },
    });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.operation).toBe('create');
    expect(payload.wouldSend.properties.displayName).toBe('New Flow');
  });

  it('refuses to create without a displayName', async () => {
    const r = await handleCreateOrUpdateFlow({
      environmentId: 'env',
      definition: { triggers: {}, actions: {} },
    });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.error).toMatch(/displayName is required/);
  });

  it('carries connectionReferences into the payload when provided', async () => {
    const r = await handleCreateOrUpdateFlow({
      environmentId: 'env',
      flowId: 'flow',
      definition: { triggers: {}, actions: {} },
      connectionReferences: { shared_sharepointonline: { connectionName: 'x' } },
    });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.wouldSend.properties.connectionReferences).toBeDefined();
  });
});
