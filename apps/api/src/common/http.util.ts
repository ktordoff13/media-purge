/** Minimal JSON HTTP helper over native fetch, with token redaction in errors. */

const SECRET_PARAMS = ['X-Plex-Token', 'api_key', 'apikey', 'ApiKey'];

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const p of SECRET_PARAMS) {
      if (u.searchParams.has(p)) u.searchParams.set(p, '***');
    }
    return u.toString();
  } catch {
    return url;
  }
}

export async function getJson<T>(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 60_000,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(`Request to ${redactUrl(url)} failed: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${redactUrl(url)}`);
  }
  return (await res.json()) as T;
}

export async function sendJson<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 60_000,
): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new Error(`Request to ${redactUrl(url)} failed: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${redactUrl(url)}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

/** Map a video pixel height to the app's coarse resolution buckets. */
export function resolutionFromHeight(height: number | null | undefined): string | null {
  if (!height) return null;
  if (height >= 1600) return '4k';
  if (height >= 1000) return '1080';
  if (height >= 700) return '720';
  return 'sd';
}

export function bestResolution(a: string | null, b: string | null): string | null {
  const order = ['sd', '720', '1080', '4k'];
  if (!a) return b;
  if (!b) return a;
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}
