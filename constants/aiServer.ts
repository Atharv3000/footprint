import Constants from 'expo-constants';
import { repServerUrl, getRepAuthToken } from './repTrackerProtocol';

/**
 * Footprint AI server connection (food photo, meal text, body fat, muscle photos).
 *
 * URL resolution:
 *  1. EXPO_PUBLIC_AI_SERVER_URL (e.g. wss://ai.example.com or ws://192.168.1.20:9001)
 *  2. The machine running Metro (same host the phone loaded the app from), port 9001
 *  3. ws://localhost:9001 (simulator / web)
 * Optional EXPO_PUBLIC_AI_TOKEN is sent as ?token=... when the server sets FOOTPRINT_AI_TOKEN.
 */
export function getAIServerUrl(): string {
  const override = (process.env.EXPO_PUBLIC_AI_SERVER_URL || '').trim();
  let base = override;
  if (!base) {
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
    const host = hostUri ? String(hostUri).split(':')[0] : '';
    base = host ? `ws://${host}:9001` : 'ws://localhost:9001';
  }
  const token = (process.env.EXPO_PUBLIC_AI_TOKEN || '').trim();
  if (!token) return base;
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

export const AI_SERVER_WS_URL = getAIServerUrl();

export interface AIResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** true when the server could not be reached at all (show offline UI / local fallback) */
  offline?: boolean;
}

const RESULT_TYPES: Record<string, string> = {
  analyze_food: 'food_analysis_result',
  describe_food: 'describe_food_result',
  estimate_body_fat: 'body_fat_result',
  analyze_muscle: 'muscle_analysis_result',
  scan_label: 'label_scan_result',
  read_receipt: 'receipt_result',
  read_recipe: 'recipe_result',
};

/**
 * One AI request. Never throws.
 *
 * Route order:
 *  - Cloud build (EXPO_PUBLIC_REP_SERVER_URL set, no EXPO_PUBLIC_AI_SERVER_URL): straight to the hosted
 *    rep server's authenticated /rep-api/ai route, which runs the same footprint_ai models.
 *  - Otherwise: the AI server WebSocket (port 9001) first, then /rep-api/ai through the Metro proxy
 *    (this is what makes the AI work over an Expo tunnel).
 */
export async function aiRequest<T = any>(type: string, payload: Record<string, unknown>, timeoutMs = 20000): Promise<AIResponse<T>> {
  const cloudOnly = !!(process.env.EXPO_PUBLIC_REP_SERVER_URL || '').trim() && !(process.env.EXPO_PUBLIC_AI_SERVER_URL || '').trim();
  if (cloudOnly) return aiRequestViaRepServer<T>(type, payload, timeoutMs);
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost || '';
  const host = String(hostUri).split(':')[0];
  const isLocalHost = !host || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[1])\.)/.test(host);
  // Over an Expo tunnel (*.exp.direct), direct port 9001 is unreachable; go straight through /rep-api/ai.
  if (!isLocalHost && !(process.env.EXPO_PUBLIC_AI_SERVER_URL || '').trim()) {
    return aiRequestViaRepServer<T>(type, payload, timeoutMs);
  }
  const direct = await aiRequestViaWebSocket<T>(type, payload, timeoutMs);
  if (direct.ok || !direct.offline) return direct;
  const proxied = await aiRequestViaRepServer<T>(type, payload, timeoutMs);
  return proxied.ok || !proxied.offline ? proxied : direct;
}

/** POST /rep-api/ai on the rep server (cloud or Metro proxy), authenticated like the rep tracker. */
export async function aiRequestViaRepServer<T = any>(type: string, payload: Record<string, unknown>, timeoutMs = 20000): Promise<AIResponse<T>> {
  let base: string;
  try {
    base = repServerUrl();
  } catch {
    return { ok: false, offline: true, error: 'No AI server configured. Run "npm run start:reps" or set EXPO_PUBLIC_REP_SERVER_URL.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = await getRepAuthToken().catch(() => '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token && token !== 'local-dev-proxy') headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${base}/ai`, { method: 'POST', headers, body: JSON.stringify({ type, ...payload }), signal: controller.signal });
    if (response.status === 401 || response.status === 403) return { ok: false, error: 'Sign in to use the AI features.' };
    if (response.status === 429) return { ok: false, error: 'Too many AI requests. Wait a minute and try again.' };
    if (response.status === 413) return { ok: false, error: 'Photos are too large to send. Try fewer photos.' };
    if (!response.ok) return { ok: false, offline: true, error: `AI service error (HTTP ${response.status}).` };
    const msg = await response.json();
    return msg?.success ? { ok: true, data: msg.data as T } : { ok: false, error: msg?.error || 'Analysis failed.' };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return { ok: false, offline: true, error: aborted ? `AI service did not answer within ${Math.round(timeoutMs / 1000)} s.` : `Could not reach the AI service at ${base}.` };
  } finally {
    clearTimeout(timer);
  }
}

/** One request/response over a short-lived WebSocket to the AI server. Never throws. */
export function aiRequestViaWebSocket<T = any>(type: string, payload: Record<string, unknown>, timeoutMs = 20000): Promise<AIResponse<T>> {
  const wsUrl = getAIServerUrl();
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let settled = false;
    let opened = false;
    const finish = (r: AIResponse<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(connectTimer);
      try { ws?.close(); } catch {}
      resolve(r);
    };
    const connectTimer = setTimeout(() => {
      if (!opened) finish({ ok: false, offline: true, error: `Could not reach the AI server at ${wsUrl.split('?')[0]}.` });
    }, Math.min(timeoutMs, 2500));
    const timer = setTimeout(() => finish({ ok: false, offline: true, error: `AI server did not answer within ${Math.round(timeoutMs / 1000)} s.` }), timeoutMs);
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      finish({ ok: false, offline: true, error: 'Could not open a connection to the AI server.' });
      return;
    }
    ws.onopen = () => {
      opened = true;
      clearTimeout(connectTimer);
      ws?.send(JSON.stringify({ type, ...payload }));
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === RESULT_TYPES[type] || msg.type === 'error') {
          finish(msg.success ? { ok: true, data: msg.data as T } : { ok: false, error: msg.error || 'Analysis failed.' });
        }
      } catch {
        finish({ ok: false, error: 'Unreadable reply from the AI server.' });
      }
    };
    ws.onerror = () => finish({ ok: false, offline: true, error: `Could not reach the AI server at ${wsUrl.split('?')[0]}. Start it with "npm run start:ai" on the same Wi-Fi.` });
    ws.onclose = (e: any) => {
      if (e?.code === 4401) finish({ ok: false, error: 'AI server rejected the token (EXPO_PUBLIC_AI_TOKEN).' });
      else finish({ ok: false, offline: true, error: 'AI server closed the connection.' });
    };
  });
}
