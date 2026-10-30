import Constants from 'expo-constants';

export type BattleState = {
  type: 'battle_state'; code: string; players: string[]; names: Record<string, string>;
  ready: string[]; counts: Record<string, number>; status: 'waiting' | 'countdown' | 'active' | 'finished' | 'cancelled';
  winner: string | null; reason: string | null; start_at: number | null;
  lead_to_win: number; host_share: number; revision: number;
};

export type Joint = { id: string; x: number; y: number; visibility: number };
export type PoseFrame = { type: 'pose'; rep_count: number; state: string; valid: boolean;
  feedback: string; calibrated: boolean; keypoints: Record<string, Joint>; aspect: number;
  view_mode?: 'side' | 'head_on' | null };

export function repServerUrl(): string {
  const override = process.env.EXPO_PUBLIC_REP_SERVER_URL;
  if (override) return override;
  const host = Constants.expoConfig?.hostUri;
  if (!host) throw new Error('Start the app with npm run start:reps to connect the rep tracker.');
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  return `${local ? 'http' : 'https'}://${host}/rep-api`;
}

/** Small camera relay transport; low-frame-rate previews, not an audio call. */
export class RepConnection {
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  private token = '';
  private session = '';
  private polling?: ReturnType<typeof setTimeout>;
  private queue = Promise.resolve();
  private requests = new Set<AbortController>();
  constructor(private base: string) { setTimeout(() => { if (this.readyState === 1) this.onopen?.(); }, 0); }

  private emit(message: object) { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(message) }); }

  private async request(path: string, method: string, body?: object) {
    const controller = new AbortController(); this.requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${this.base}/${path}`, { method, signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}`, 'X-Rep-Session': this.session },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Rep server request failed.');
      return result;
    } finally { clearTimeout(timer); this.requests.delete(controller); }
  }

  private async poll() {
    if (this.readyState !== 1) return;
    try {
      const result = await this.request('poll', 'GET');
      for (const message of result.messages || []) this.emit(message);
    } catch (failure) {
      if (this.readyState === 1) { this.emit({ type: 'error', message: (failure as Error).message }); this.close(); }
      return;
    }
    if (this.readyState === 1) this.polling = setTimeout(() => this.poll(), 350);
  }

  send(encoded: string) {
    const data = JSON.parse(encoded);
    this.queue = this.queue.then(async () => {
      if (this.readyState !== 1) return;
      try {
        if (data.type === 'auth') {
          this.token = data.token;
          const response = await this.request('session', 'POST');
          this.session = response.session;
          this.emit({ type: 'connected', player_id: response.player_id }); this.poll();
        } else {
          const response = await this.request(data.type === 'frame' ? 'frame' : 'command', 'POST', data);
          for (const message of response.messages || []) this.emit(message);
        }
      } catch (failure) {
        this.emit({ type: 'error', message: (failure as Error).message });
        if (data.type === 'auth') this.close();
      }
    });
  }

  close() {
    if (this.readyState !== 1) return;
    this.readyState = 3; clearTimeout(this.polling);
    for (const controller of this.requests) controller.abort();
    if (this.session) fetch(`${this.base}/close`, { method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'X-Rep-Session': this.session },
    }).catch(() => {});
    this.onclose?.();
  }
}

export function ownShare(battle: BattleState, id: string): number {
  return battle.players[0] === id ? battle.host_share : 1 - battle.host_share;
}
