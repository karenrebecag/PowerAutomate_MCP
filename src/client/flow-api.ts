/**
 * Thin HTTP client over the Power Automate REST surface.
 *
 * ── Two APIs, one client ────────────────────────────────────────────────────
 * There are two backends and they are NOT interchangeable:
 *
 *   1. api.flow.microsoft.com    — the "service" API. UNDOCUMENTED / unsupported
 *      (Microsoft says so in writing). BUT it is the only one that can see
 *      *personal* cloud flows — the kind created outside a Dataverse solution.
 *      Every paid Power Automate MCP is built on this. So are we.
 *
 *   2. api.powerplatform.com     — the official, documented, stable API
 *      (version 2024-10-01). It only sees flows that live in Dataverse
 *      (solution flows). It 404s on personal flows: "Environment does not
 *      have a Microsoft Dataverse database" for the flow scope.
 *
 * This project targets personal flows, so it drives (1) today. (2) is wired in
 * behind the same base-URL switch so that, the day a flow moves into a
 * solution — or the day the service API finally breaks — the tools can be
 * pointed at the supported API by flipping one constant, without rewriting
 * request shapes.
 *
 * The auth audience is the same service scope for both in practice on this
 * tenant; if that ever diverges, split getAccessToken by base.
 */

import { getAccessToken } from '../auth/token.js';

export const FLOW_SERVICE_BASE = 'https://api.flow.microsoft.com';
export const POWER_PLATFORM_BASE = 'https://api.powerplatform.com';

/** The undocumented service API pins this version across every route. */
export const SERVICE_API_VERSION = '2016-11-01';

export interface FlowApiError extends Error {
  status: number;
  body: string;
}

function makeError(status: number, body: string): FlowApiError {
  const err = new Error(`Flow API ${status}: ${body.slice(0, 300)}`) as FlowApiError;
  err.status = status;
  err.body = body;
  return err;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  base?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

/**
 * Issue a request against the service API and return parsed JSON.
 *
 * `path` is everything after the base host, starting with a slash. The
 * api-version is appended automatically unless the caller already set one in
 * `query`. A 204 (No Content) resolves to null rather than throwing.
 */
export async function flowRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', base = FLOW_SERVICE_BASE, query = {}, body } = options;

  const token = await getAccessToken();
  const url = new URL(base + path);
  if (!('api-version' in query)) url.searchParams.set('api-version', SERVICE_API_VERSION);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw makeError(res.status, text);
  if (!text) return null as T;
  return JSON.parse(text) as T;
}
