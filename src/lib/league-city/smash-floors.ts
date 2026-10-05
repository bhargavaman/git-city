// ─── Smash: floors that score ───────────────────────────────
// What the drive room (party/smash.ts) counts for Towns play points: floors a
// player knocks down outside their own town, per login and UTC day, with the
// hidden review flags (floors per victim, implied jumps, device hashes). Pure
// and bundled by PartyKit, relative imports only.
//
// The room freezes what it has into one batch with an id and resends that
// batch, unchanged, until the site answers 200. New hits go into the next
// batch, so a save that failed after the DB write can't swallow newer floors
// (the site's add_town_floors skips a batch id it has seen).

/** Distinct device hashes kept per player and day. */
export const MAX_SEEN = 5;
/** Floors one entry may carry (the day cap is 200; this only bounds junk). */
export const FLOOR_ENTRY_MAX = 400;
/** A move faster than TOP_SPEED_MS × JUMP_SLACK (m/s) counts as a jump. */
export const JUMP_SLACK = 1.6;
/** Drive tuning top speed (m/s). Boost (35) stays under the 40 m/s line. */
export const TOP_SPEED_MS = 25;
/** Samples closer together than this (ms) say nothing about speed. */
const JUMP_MIN_DT = 50;

export interface FloorEntry {
  dev: number;
  login: string;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  n: number;
  /** Floors per victim login. */
  victims: Record<string, number>;
  jumps: number;
  seen: string[];
}

export interface FloorBatch {
  batch: string;
  entries: FloorEntry[];
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export class FloorTally {
  private live = new Map<string, FloorEntry>();
  private pending: FloorBatch | null = null;

  private entry(login: string, dev: number, now: number): FloorEntry {
    const day = utcDay(now);
    const key = `${login}|${day}`;
    let e = this.live.get(key);
    if (!e) this.live.set(key, (e = { dev, login, day, n: 0, victims: {}, jumps: 0, seen: [] }));
    return e;
  }

  /** `took` floors off `victim`'s building. */
  add(login: string, dev: number, victim: string, took: number, now: number) {
    if (!(took > 0)) return;
    const e = this.entry(login, dev, now);
    e.n += took;
    e.victims[victim] = (e.victims[victim] ?? 0) + took;
  }

  jump(login: string, dev: number, now: number) {
    this.entry(login, dev, now).jumps += 1;
  }

  see(login: string, dev: number, hash: string, now: number) {
    const e = this.entry(login, dev, now);
    if (e.seen.length < MAX_SEEN && !e.seen.includes(hash)) e.seen.push(hash);
  }

  /** The batch to send: the pending one, or the live floors frozen under a new id. */
  take(newId: () => string): FloorBatch | null {
    if (!this.pending) {
      const entries = [...this.live.values()].filter((e) => e.n > 0).map((e) => ({ ...e, n: Math.min(e.n, FLOOR_ENTRY_MAX) }));
      if (entries.length === 0) return null;
      this.pending = { batch: newId(), entries };
      this.live.clear();
    }
    return this.pending;
  }

  /** The site stored `batch`. */
  done(batch: string) {
    if (this.pending?.batch === batch) this.pending = null;
  }

  /** Floors waiting to be saved (flag-only entries don't count). */
  hasWork(): boolean {
    if (this.pending) return true;
    for (const e of this.live.values()) if (e.n > 0) return true;
    return false;
  }
}

/** Two car positions (m, ms) imply a speed no car reaches. */
export function impliedJump(prev: { x: number; z: number; at: number }, next: { x: number; z: number; at: number }): boolean {
  const dt = next.at - prev.at;
  if (dt < JUMP_MIN_DT) return false;
  return Math.hypot(next.x - prev.x, next.z - prev.z) / (dt / 1000) > TOP_SPEED_MS * JUMP_SLACK;
}

/** A device hash: HMAC-SHA256 of ip and user-agent, first 16 hex. Never the raw values. */
export async function seenHash(secret: string, ip: string, ua: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`seen:${ip}|${ua}`)));
  return [...sig.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
