import { describe, it, expect } from 'vitest';
import { jsonResult, errorResult, runTool } from '../src/core/tool-result.js';

describe('tool-result', () => {
  it('jsonResult wraps data as pretty JSON text', () => {
    const r = jsonResult({ a: 1 });
    expect(r.content[0]).toEqual({ type: 'text', text: '{\n  "a": 1\n}' });
    expect(r.isError).toBeUndefined();
  });

  it('errorResult flags isError', () => {
    const r = errorResult('boom');
    expect(r.isError).toBe(true);
    expect(r.content[0]).toEqual({ type: 'text', text: 'error: boom' });
  });

  it('runTool passes through a successful result', async () => {
    const r = await runTool(async () => jsonResult({ ok: true }));
    expect(r.isError).toBeUndefined();
  });

  it('runTool converts a thrown error into an error result', async () => {
    const r = await runTool(async () => {
      throw new Error('kaboom');
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('kaboom');
  });
});
