// Detect Tauri environment
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Fetch a URL using Tauri's IPC (bypasses CORS) or native fetch as fallback.
 */
export async function fetchText(url: string): Promise<string> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string>('fetch_url', { url });
  }
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json, application/xml, text/xml, */*' }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
  return resp.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  return JSON.parse(text) as T;
}
