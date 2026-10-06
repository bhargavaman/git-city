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
/**
 * Average speed (m/s) over JUMP_WINDOW_MS that counts as a jump. Boost tops
 * out at 35; the margin covers being pushed out from under a fallen building.
 * A teleport across the city goes far past it.
 */
export const JUMP_SPEED = 60;
/**
 * Speed is measured over at least this long (ms). Packets are timestamped on
 * arrival, so network jitter makes any two close samples look like a jump.
 */
export const JUMP_WINDOW_MS = 1000;

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

type Sample = { x: number; z: number; at: number };

/** Two car positions (m, ms) at least JUMP_WINDOW_MS apart imply a speed no car reaches. */
export function impliedJump(prev: Sample, next: Sample): boolean {
  const dt = next.at - prev.at;
  if (dt < JUMP_WINDOW_MS) return false;
  return Math.hypot(next.x - prev.x, next.z - prev.z) / (dt / 1000) > JUMP_SPEED;
}

/** One car's jump check: compares each position with the one about a second before. */
export class JumpWatch {
  private anchor: Sample | null = null;

  /** True when the last window implied a jump. */
  see(p: Sample): boolean {
    if (!this.anchor) {
      this.anchor = p;
      return false;
    }
    if (p.at - this.anchor.at < JUMP_WINDOW_MS) return false;
    const jumped = impliedJump(this.anchor, p);
    this.anchor = p;
    return jumped;
  }
}

/**
 * Whole floors out of the blocks a player takes off a building. A building is
 * a grid of columns, each with its floors; a hit removes blocks (one floor of
 * one column). One floor scores once every column's worth of blocks is gone,
 * so a 15-floor building is worth 15 whatever its width. The rest carries
 * over to the next hit on the same building.
 */
export class FloorParts {
  private left = new Map<string, number>();

  /** `blocks` taken off a building with `cols` columns: the whole floors they complete. */
  add(login: string, building: string, blocks: number, cols: number): number {
    if (!(blocks > 0) || !(cols > 0)) return 0;
    const key = `${login}|${building}`;
    const total = (this.left.get(key) ?? 0) + blocks;
    const floors = Math.floor(total / cols);
    const rest = total - floors * cols;
    if (rest > 0) this.left.set(key, rest);
    else this.left.delete(key);
    return floors;
  }
}

/** Floors a player scores per UTC day (CAPS.floors in towns/play-rules; play-rules.test checks they match). */
export const FLOOR_DAY_CAP = 200;

/**
 * Each player's floors today, for the HUD: what scores of each hit and the
 * running total. Seeded from the site when the driver signs in, so it holds
 * across rooms; a new UTC day starts at 0.
 */
export class FloorsToday {
  private by = new Map<string, { day: string; n: number }>();

  private entry(login: string, now: number) {
    const day = utcDay(now);
    let c = this.by.get(login);
    if (!c || c.day !== day) this.by.set(login, (c = { day, n: 0 }));
    return c;
  }

  /** The site's stored count at sign-in; never lowers what this room already counted. */
  seed(login: string, n: number, now: number) {
    const c = this.entry(login, now);
    c.n = Math.max(c.n, Math.max(0, Math.floor(n)));
  }

  /** `took` floors off a building: how many of them score, and the day's total (capped). */
  add(login: string, took: number, now: number): { n: number; today: number } {
    const c = this.entry(login, now);
    const n = Math.max(0, Math.min(took, FLOOR_DAY_CAP - c.n));
    c.n += Math.max(0, took);
    return { n, today: Math.min(c.n, FLOOR_DAY_CAP) };
  }

  today(login: string, now: number): number {
    return Math.min(this.entry(login, now).n, FLOOR_DAY_CAP);
  }
}

/** A device hash: HMAC-SHA256 of ip and user-agent, first 16 hex. Never the raw values. */
export async function seenHash(secret: string, ip: string, ua: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`seen:${ip}|${ua}`)));
  return [...sig.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Site-side checks (smash route) ─────────────────────────
// The room's floor entries arrive in the signed save. The site still checks
// each field: a bad entry is dropped, and the save itself is never refused
// because of floors.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEEN = /^[0-9a-f]{16}$/;
const MAX_VICTIMS = 50;
const MAX_SEEN_SITE = 5;
const MAX_JUMPS = 10_000;
const DAY_MS = 86_400_000;

export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

const isDevId = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const isLoginKey = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 39;

/** The save's floor entries the site accepts: today or yesterday (UTC), n clamped to 1..FLOOR_ENTRY_MAX. */
export function cleanFloors(raw: unknown, now: number): FloorEntry[] {
  if (!Array.isArray(raw)) return [];
  const days = new Set([utcDay(now), utcDay(now - DAY_MS)]);
  const out: FloorEntry[] = [];
  for (const e of raw as unknown[]) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    if (!isLoginKey(r.login) || !isDevId(r.dev) || typeof r.day !== "string" || !days.has(r.day)) continue;
    if (typeof r.n !== "number" || !Number.isFinite(r.n) || r.n <= 0) continue;
    const n = Math.min(FLOOR_ENTRY_MAX, Math.max(1, Math.round(r.n)));

    const victims: Record<string, number> = {};
    if (r.victims && typeof r.victims === "object" && !Array.isArray(r.victims)) {
      for (const [login, count] of Object.entries(r.victims as Record<string, unknown>)) {
        if (Object.keys(victims).length >= MAX_VICTIMS) break;
        if (isLoginKey(login) && typeof count === "number" && Number.isSafeInteger(count) && count > 0) victims[login] = count;
      }
    }
    const jumps = typeof r.jumps === "number" && Number.isFinite(r.jumps) ? Math.min(MAX_JUMPS, Math.max(0, Math.round(r.jumps))) : 0;
    const seen = Array.isArray(r.seen)
      ? (r.seen as unknown[]).filter((s): s is string => typeof s === "string" && SEEN.test(s)).slice(0, MAX_SEEN_SITE)
      : [];

    out.push({ dev: r.dev, login: r.login, day: r.day, n, victims, jumps, seen });
  }
  return out;
}

/** Own-town floors score 0: drops entries whose dev is one of this town's (a player who joined or switched while connected). */
export function dropOwnTown(entries: FloorEntry[], devIds: Record<string, number>): FloorEntry[] {
  const own = new Set(Object.values(devIds));
  return entries.filter((e) => !own.has(e.dev));
}
