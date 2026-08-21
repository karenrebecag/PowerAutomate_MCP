/**
 * OAuth device-code auth for the Power Automate service API.
 *
 * ── Why this works without an app registration ──────────────────────────────
 * Microsoft ships a handful of *public first-party* client IDs that any user
 * can authenticate against without registering their own Entra app and, more
 * importantly, WITHOUT admin consent. We use the one XrmToolBox popularised:
 *
 *     51f81489-12ee-4a9e-aaae-a2591f45987d   "Dynamics 365 Example Client"
 *
 * The device-code grant it drives is a delegated flow: the token we receive
 * carries the signed-in user's own identity and permissions. There is no
 * service principal, no client secret, no consent screen for an admin to
 * approve. That is the entire trick behind talking to Power Automate from a
 * personal machine for free — the paid MCPs wrap this same grant.
 *
 * ── The audience quirk ──────────────────────────────────────────────────────
 * The Power Automate *service* API answers to the audience
 *
 *     https://service.flow.microsoft.com//user_impersonation
 *                                      ^^ yes, two slashes — not a typo.
 *
 * The historical resource URI ends in a slash, and the v2 scope syntax appends
 * `/user_impersonation`, producing the double slash. Azure AD is fussy here:
 * the single-slash variant is rejected on some tenants. We keep the exact
 * string that the probe proved works against this tenant.
 *
 * ── Token storage ───────────────────────────────────────────────────────────
 * The refresh token is the long-lived secret (good for ~90 days of sliding
 * inactivity). We persist ONLY the refresh token, in a 0600 file next to the
 * package, and mint short-lived access tokens on demand. Access tokens live
 * ~60–75 min; we refresh a minute early to dodge clock skew.
 */

import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TENANT_ENV = 'PA_TENANT_ID';
const CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';
const SERVICE_SCOPE = 'https://service.flow.microsoft.com//user_impersonation offline_access';

// Refresh token lives beside the compiled binary, not in the user's env: a
// stdio server inherits whatever environment launched Claude Code, which is an
// unreliable place to keep a secret. A dedicated 0600 file is both safer and
// deterministic. Override the location with PA_TOKEN_FILE for tests.
const DEFAULT_TOKEN_FILE = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  '.pa-token',
);

function tokenFile(): string {
  return process.env.PA_TOKEN_FILE ?? DEFAULT_TOKEN_FILE;
}

function tenant(): string {
  // "organizations" works for any work/school account; a specific tenant GUID
  // via PA_TENANT_ID narrows it when a user belongs to several.
  return process.env[TENANT_ENV] ?? 'organizations';
}

function loginBase(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
  error?: string;
  error_description?: string;
}

async function postForm(url: string, params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return (await res.json()) as TokenResponse;
}

function saveRefreshToken(refreshToken: string): void {
  const file = tokenFile();
  writeFileSync(file, refreshToken, 'utf8');
  chmodSync(file, 0o600);
}

function readRefreshToken(): string | null {
  try {
    return readFileSync(tokenFile(), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Interactive device-code login. Prints a URL + code, blocks until the user
 * signs in, then persists the refresh token. Run once per machine (or after
 * the refresh token expires) via `pnpm login`.
 */
export async function deviceLogin(
  onPrompt: (verificationUri: string, userCode: string) => void,
): Promise<void> {
  const res = await fetch(`${loginBase()}/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SERVICE_SCOPE }),
  });
  const dc = (await res.json()) as DeviceCodeResponse;
  if (dc.error) {
    throw new Error(`device code request failed: ${dc.error} — ${dc.error_description ?? ''}`);
  }

  onPrompt(dc.verification_uri, dc.user_code);

  const deadline = Date.now() + dc.expires_in * 1000;
  const intervalMs = (dc.interval || 5) * 1000;

  // Poll the token endpoint until the user completes sign-in in their browser.
  // `authorization_pending` / `slow_down` are the expected "keep waiting"
  // signals; anything else is a real failure.
  for (;;) {
    if (Date.now() > deadline) throw new Error('device code expired before sign-in completed');
    await new Promise((r) => setTimeout(r, intervalMs));

    const t = await postForm(`${loginBase()}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENT_ID,
      device_code: dc.device_code,
    });

    if (t.access_token && t.refresh_token) {
      saveRefreshToken(t.refresh_token);
      return;
    }
    if (t.error === 'authorization_pending' || t.error === 'slow_down') continue;

    const hint = /AADSTS65001|consent|admin/i.test(t.error_description ?? '')
      ? ' (this tenant requires admin consent even for the public client — dead end without IT)'
      : '';
    throw new Error(`login failed: ${t.error} — ${t.error_description ?? ''}${hint}`);
  }
}

// Cache one access token in memory across tool calls in the same process.
let cached: { token: string; expiresAt: number } | null = null;

/**
 * Return a valid access token for the Power Automate service API, refreshing
 * from disk when the in-memory one is stale. Throws with an actionable message
 * when no refresh token exists yet.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    throw new Error(`not signed in — run "pnpm login" (token file: ${tokenFile()})`);
  }

  const t = await postForm(`${loginBase()}/token`, {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
    scope: SERVICE_SCOPE,
  });

  if (!t.access_token) {
    throw new Error(
      `token refresh failed: ${t.error} — ${t.error_description ?? ''}. Re-run "pnpm login".`,
    );
  }

  // Azure AD rotates the refresh token on most refreshes; persist the new one
  // so the 90-day sliding window keeps sliding. Fall back to the old one when
  // the response omits it.
  saveRefreshToken(t.refresh_token ?? refreshToken);

  const ttlMs = ((t.expires_in ?? 3600) - 60) * 1000;
  cached = { token: t.access_token, expiresAt: Date.now() + ttlMs };
  return t.access_token;
}

export function isSignedIn(): boolean {
  return readRefreshToken() !== null;
}
