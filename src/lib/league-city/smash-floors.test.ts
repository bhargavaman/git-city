import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CAPS } from "../towns/play-rules";
import { FLOOR_DAY_CAP, FLOOR_ENTRY_MAX, FloorTally, FloorsToday, JumpWatch, MAX_SEEN, cleanFloors, dropOwnTown, impliedJump, isUuid, seenHash } from "./smash-floors";

const T = Date.UTC(2026, 9, 12, 15, 0, 0); // Mon Oct 12, 15:00 UTC
const ids = () => {
  let i = 0;
  return () => `batch-${++i}`;
};

describe("FloorTally", () => {
  it("sums a player's floors for the day, with floors per victim", () => {
    const t = new FloorTally();
    t.add("ana", 7, "bob", 2, T);
    t.add("ana", 7, "bob", 3, T + 1000);
    t.add("ana", 7, "cid", 1, T + 2000);
    const b = t.take(ids());
    expect(b).toEqual({
      batch: "batch-1",
      entries: [{ dev: 7, login: "ana", day: "2026-10-12", n: 6, victims: { bob: 5, cid: 1 }, jumps: 0, seen: [] }],
    });
  });

  it("keeps the days apart across midnight UTC", () => {
    const t = new FloorTally();
    t.add("ana", 7, "bob", 2, Date.UTC(2026, 9, 12, 23, 59, 59));
    t.add("ana", 7, "bob", 1, Date.UTC(2026, 9, 13, 0, 0, 1));
    const days = t.take(ids())!.entries.map((e) => [e.day, e.n]);
    expect(days).toEqual([
      ["2026-10-12", 2],
      ["2026-10-13", 1],
    ]);
  });

  it("never merges new hits into a batch that was already taken", () => {
    const t = new FloorTally();
    const next = ids();
    t.add("ana", 7, "bob", 2, T);
    const first = t.take(next)!;
    t.add("ana", 7, "bob", 5, T + 1000);
    const again = t.take(next)!;
    expect(again.batch).toBe(first.batch);
    expect(again.entries).toEqual(first.entries);
    expect(again.entries[0].n).toBe(2);
    expect(t.hasWork()).toBe(true);
  });

  it("after done, the next take freezes the newer hits under a new id", () => {
    const t = new FloorTally();
    const next = ids();
    t.add("ana", 7, "bob", 2, T);
    const first = t.take(next)!;
    t.add("ana", 7, "bob", 5, T + 1000);
    t.done("someone-else");
    expect(t.take(next)!.batch).toBe(first.batch);
    t.done(first.batch);
    const second = t.take(next)!;
    expect(second.batch).toBe("batch-2");
    expect(second.entries[0].n).toBe(5);
    t.done(second.batch);
    expect(t.hasWork()).toBe(false);
  });

  it("take on an empty tally returns null and calls no id", () => {
    const t = new FloorTally();
    let called = 0;
    expect(
      t.take(() => {
        called++;
        return "x";
      }),
    ).toBeNull();
    expect(called).toBe(0);
    expect(t.hasWork()).toBe(false);
  });

  it("an entry with only flags isn't work and isn't sent", () => {
    const t = new FloorTally();
    t.jump("ana", 7, T);
    expect(t.hasWork()).toBe(false);
    expect(t.take(ids())).toBeNull();
  });

  it("jumps and seen ride on that day's floors entry", () => {
    const t = new FloorTally();
    t.jump("ana", 7, T);
    t.jump("ana", 7, T + 10);
    t.add("ana", 7, "bob", 1, T + 20);
    t.see("ana", 7, "aaaa", T + 20);
    const [e] = t.take(ids())!.entries;
    expect(e.jumps).toBe(2);
    expect(e.seen).toEqual(["aaaa"]);
  });

  it("keeps at most 5 unique seen hashes", () => {
    const t = new FloorTally();
    t.add("ana", 7, "bob", 1, T);
    for (const h of ["a", "b", "a", "c", "d", "e", "f", "g"]) t.see("ana", 7, h, T);
    const [e] = t.take(ids())!.entries;
    expect(e.seen).toEqual(["a", "b", "c", "d", "e"]);
    expect(e.seen).toHaveLength(MAX_SEEN);
  });

  it("clamps an entry to FLOOR_ENTRY_MAX and ignores non-positive hits", () => {
    const t = new FloorTally();
    t.add("ana", 7, "bob", 0, T);
    t.add("ana", 7, "bob", -3, T);
    expect(t.hasWork()).toBe(false);
    for (let i = 0; i < 50; i++) t.add("ana", 7, "bob", 10, T);
    expect(t.take(ids())!.entries[0].n).toBe(FLOOR_ENTRY_MAX);
  });
});

describe("impliedJump", () => {
  it("flags a move faster than any car over a second", () => {
    expect(impliedJump({ x: 0, z: 0, at: 0 }, { x: 100, z: 0, at: 1000 })).toBe(true);
    expect(impliedJump({ x: 0, z: 0, at: 0 }, { x: 35, z: 0, at: 1000 })).toBe(false); // boost
    expect(impliedJump({ x: 0, z: 0, at: 0 }, { x: 36, z: 48, at: 1000 })).toBe(false); // 60 m/s, boost plus a push-out
  });

  it("ignores samples less than a second apart", () => {
    expect(impliedJump({ x: 0, z: 0, at: 0 }, { x: 100, z: 0, at: 900 })).toBe(false);
  });
});

describe("JumpWatch", () => {
  it("never flags boost driving with jittery packets", () => {
    const w = new JumpWatch();
    let flagged = 0;
    // 35 m/s, sent every 66 ms, arriving in bursts (0-60 ms late).
    for (let i = 0; i < 300; i++) {
      const sent = i * 66;
      const at = sent + ((i * 37) % 61);
      if (w.see({ x: (35 * sent) / 1000, z: 0, at })) flagged++;
    }
    expect(flagged).toBe(0);
  });

  it("flags a teleport across the city once", () => {
    const w = new JumpWatch();
    const hits = [0, 500, 1000, 1500, 2000].map((at) => w.see({ x: at === 2000 ? 500 : at / 100, z: 0, at }));
    expect(hits.filter(Boolean)).toHaveLength(1);
  });
});

describe("seenHash", () => {
  it("is a deterministic 16-hex HMAC of ip and user-agent", async () => {
    const a = await seenHash("s".repeat(32), "1.2.3.4", "Mozilla/5.0");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await seenHash("s".repeat(32), "1.2.3.4", "Mozilla/5.0")).toBe(a);
    expect(await seenHash("s".repeat(32), "1.2.3.5", "Mozilla/5.0")).not.toBe(a);
    const want = createHmac("sha256", "s".repeat(32)).update("seen:1.2.3.4|Mozilla/5.0").digest("hex").slice(0, 16);
    expect(a).toBe(want);
  });
});

const NOW = Date.parse("2026-10-10T12:00:00Z");
const good = {
  dev: 42,
  login: "octocat",
  day: "2026-10-10",
  n: 12,
  victims: { torvalds: 8, gaearon: 4 },
  jumps: 0,
  seen: ["0123456789abcdef"],
};

describe("cleanFloors", () => {
  it("keeps a valid entry as is", () => {
    expect(cleanFloors([good], NOW)).toEqual([good]);
  });

  it("returns [] for anything that isn't an array", () => {
    expect(cleanFloors(undefined, NOW)).toEqual([]);
    expect(cleanFloors("x", NOW)).toEqual([]);
    expect(cleanFloors({ dev: 1 }, NOW)).toEqual([]);
  });

  it("keeps today and yesterday (UTC), drops two days ago and tomorrow", () => {
    const days = ["2026-10-10", "2026-10-09", "2026-10-08", "2026-10-11"];
    const out = cleanFloors(days.map((day) => ({ ...good, day })), NOW);
    expect(out.map((e) => e.day)).toEqual(["2026-10-10", "2026-10-09"]);
  });

  it("drops a bad login and a bad dev", () => {
    const bad = [
      { ...good, login: "" },
      { ...good, login: "x".repeat(40) },
      { ...good, login: 7 },
      { ...good, dev: 0 },
      { ...good, dev: -3 },
      { ...good, dev: 1.5 },
      { ...good, dev: "42" },
      null,
    ];
    expect(cleanFloors(bad, NOW)).toEqual([]);
  });

  it("drops n <= 0 or non-finite, rounds, and clamps n to FLOOR_ENTRY_MAX", () => {
    const out = cleanFloors(
      [{ ...good, n: 0 }, { ...good, n: -5 }, { ...good, n: Number.NaN }, { ...good, n: "9" }, { ...good, n: 900 }, { ...good, n: 0.3 }, { ...good, n: 7.6 }],
      NOW,
    );
    expect(out.map((e) => e.n)).toEqual([400, 1, 8]);
    expect(FLOOR_ENTRY_MAX).toBe(400);
  });

  it("filters victims to login keys with positive integer counts, max 50", () => {
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`v${i}`, 1]));
    const [a] = cleanFloors([{ ...good, victims: { ok: 3, zero: 0, neg: -1, frac: 1.5, str: "2", ["y".repeat(40)]: 2 } }], NOW);
    expect(a.victims).toEqual({ ok: 3 });
    const [b] = cleanFloors([{ ...good, victims: many }], NOW);
    expect(Object.keys(b.victims)).toHaveLength(50);
    const [c] = cleanFloors([{ ...good, victims: "nope" }], NOW);
    expect(c.victims).toEqual({});
  });

  it("clamps jumps to a non-negative int up to 10,000", () => {
    const out = cleanFloors([{ ...good, jumps: -2 }, { ...good, jumps: 3.4 }, { ...good, jumps: 99_999 }, { ...good, jumps: "x" }], NOW);
    expect(out.map((e) => e.jumps)).toEqual([0, 3, 10_000, 0]);
  });

  it("keeps only 16-char lowercase hex seen hashes, max 5", () => {
    const hex = (i: number) => i.toString(16).padStart(16, "0");
    const [a] = cleanFloors([{ ...good, seen: ["0123456789abcdef", "XYZ", "0123456789ABCDEF", "0123456789abcde", 5, hex(1)] }], NOW);
    expect(a.seen).toEqual(["0123456789abcdef", hex(1)]);
    const [b] = cleanFloors([{ ...good, seen: Array.from({ length: 9 }, (_, i) => hex(i)) }], NOW);
    expect(b.seen).toHaveLength(5);
    const [c] = cleanFloors([{ ...good, seen: "0123456789abcdef" }], NOW);
    expect(c.seen).toEqual([]);
  });
});

describe("dropOwnTown", () => {
  it("drops entries whose dev lives in this town", () => {
    const devIds = { torvalds: 1, octocat: 42 };
    const other = { ...good, dev: 7, login: "gaearon" };
    expect(dropOwnTown([good, other], devIds)).toEqual([other]);
  });

  it("keeps everything when the town has no devs", () => {
    expect(dropOwnTown([good], {})).toEqual([good]);
  });
});

describe("isUuid", () => {
  it("accepts a v4 uuid and rejects anything else", () => {
    expect(isUuid("3f2b8c1e-9d4a-4f6b-8a2c-1e5d7b9f0a12")).toBe(true);
    expect(isUuid(crypto.randomUUID())).toBe(true);
    expect(isUuid("x")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid("3f2b8c1e-9d4a-4f6b-8a2c-1e5d7b9f0a1")).toBe(false);
  });
});

describe("FloorsToday", () => {
  it("matches the floors cap in the play rules", () => {
    expect(FLOOR_DAY_CAP).toBe(CAPS.floors);
  });

  it("starts from the site's count and stops scoring at the cap", () => {
    const f = new FloorsToday();
    f.seed("ana", 190, T);
    expect(f.add("ana", 6, T)).toEqual({ n: 6, today: 196 });
    expect(f.add("ana", 6, T)).toEqual({ n: 4, today: 200 });
    expect(f.add("ana", 3, T)).toEqual({ n: 0, today: 200 });
  });

  it("never lowers a count with an older seed, and resets on a new UTC day", () => {
    const f = new FloorsToday();
    f.add("ana", 30, T);
    f.seed("ana", 10, T);
    expect(f.today("ana", T)).toBe(30);
    expect(f.add("ana", 5, Date.UTC(2026, 9, 13, 0, 0, 1))).toEqual({ n: 5, today: 5 });
  });
});
