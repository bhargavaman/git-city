import { describe, expect, it } from "vitest";
import { ACTIVITY_COPY } from "./play-rules";
import { rulesView } from "./play-rules-view";

const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h);

describe("rulesView", () => {
  it("has no week, no 2x activity and a pending bonus before the prize weeks", () => {
    for (const now of [at(2026, 10, 5), at(2026, 10, 14)]) {
      const v = rulesView(now, { next_bonus: { side: "codex", pct: 16 } });
      expect(v.week).toBeNull();
      expect(v.featured).toBeNull();
      expect(v.bonus).toEqual({ state: "pending" });
      expect(v.activities.every((a) => !a.doubled)).toBe(true);
    }
    expect(rulesView(at(2026, 10, 5), null).phase).toBe("before");
    expect(rulesView(at(2026, 10, 14), null).phase).toBe("practice");
  });

  it("numbers the prize week and ends it the next Monday", () => {
    const v = rulesView(at(2026, 10, 20), null);
    expect(v.phase).toBe("prize");
    expect(v.week).toEqual({ number: 1, start: "2026-10-19", end: "2026-10-26", endsAt: Date.UTC(2026, 9, 26) });
    expect(rulesView(at(2026, 11, 15, 23), null).week?.number).toBe(4);
  });

  it("uses the label string from ACTIVITY_COPY, never the whole object", () => {
    const v = rulesView(at(2026, 10, 20), null);
    for (const a of v.activities) {
      expect(typeof a.label).toBe("string");
      expect(a.label).toBe(ACTIVITY_COPY[a.key].label);
    }
  });

  it("doubles the featured activity's points and cap, never coding", () => {
    const v = rulesView(at(2026, 10, 20), null);
    const floors = v.activities.find((a) => a.key === "floors");
    const code = v.activities.find((a) => a.key === "code");
    expect(v.featured).toBe("floors");
    expect(floors).toMatchObject({ pts: 2, capNote: "400", doubled: true });
    expect(code).toMatchObject({ pts: 20, doubled: false });
    expect(rulesView(at(2026, 11, 10), null).featured).toBe("kudos");
  });

  it("doubles raid points but keeps the 3 raids a day", () => {
    const v = rulesView(at(2026, 10, 27), null);
    expect(v.featured).toBe("raids");
    expect(v.activities.find((a) => a.key === "raids")).toMatchObject({ pts: 20, capNote: "60 (3 raids)", doubled: true });
  });

  it("reads the bonus from the row the last close wrote", () => {
    expect(rulesView(at(2026, 10, 20), null).bonus).toEqual({ state: "pending" });
    expect(rulesView(at(2026, 10, 20), { next_bonus: null }).bonus).toEqual({ state: "even" });
    expect(rulesView(at(2026, 10, 20), { next_bonus: { side: "codex", pct: 0 } }).bonus).toEqual({ state: "even" });
    expect(rulesView(at(2026, 10, 20), { next_bonus: { side: "codex", pct: 16 } }).bonus).toEqual({
      state: "smaller",
      side: "codex",
      pct: 16,
    });
  });

  it("drops the week and the bonus once the season is over", () => {
    const v = rulesView(at(2026, 11, 20), { next_bonus: { side: "codex", pct: 16 } });
    expect(v.phase).toBe("ended");
    expect(v.week).toBeNull();
    expect(v.featured).toBeNull();
    expect(v.bonus).toEqual({ state: "pending" });
  });
});
