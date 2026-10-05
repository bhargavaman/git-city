import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FLOOR_ENTRY_MAX, FloorTally, MAX_SEEN, impliedJump, seenHash } from "./smash-floors";

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
  it("flags a move faster than a car can drive", () => {
    expect(impliedJump({ x: 0, z: 0, at: 0 }, { x: 100, z: 0, at: 1000 })).toBe(true);
    expect(impliedJump({ x: 0, z: 0, at: 0 }, { x: 20, z: 0, at: 1000 })).toBe(false);
    expect(impliedJump({ x: 0, z: 0, at: 0 }, { x: 30, z: 40, at: 1000 })).toBe(true); // 50 m/s
  });

  it("ignores samples closer than 50 ms", () => {
    expect(impliedJump({ x: 0, z: 0, at: 0 }, { x: 100, z: 0, at: 40 })).toBe(false);
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
