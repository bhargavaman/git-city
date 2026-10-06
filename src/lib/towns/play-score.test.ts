import { describe, expect, it } from "vitest";
import type { Side } from "./battle-rules";
import { CHECK_TOP, PRIZE_WINNERS } from "./play-rules";
import {
  buildWar,
  categoryWinner,
  countedIds,
  dayTotal,
  growthWinner,
  nextBonus,
  pickWinners,
  rankPlayers,
  sideDays,
  sideScore,
  sideSizes,
  warWinner,
  type PlayCategories,
  type PlayDayRow,
  type PlayPlayer,
  type SideBonus,
} from "./play-score";
import type { FeaturedActivity } from "./play-rules";

const WEEK = "2026-10-19";

/** The ISO day `i` days after Monday Oct 19 (0 = Mon). */
function day(i: number): string {
  return new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10);
}

function player(id: number, side: Side | null, over: Partial<PlayPlayer> = {}): PlayPlayer {
  return {
    developer_id: id,
    login: `p${id}`,
    avatar_url: null,
    side,
    claimed_at: "2026-09-01T00:00:00Z",
    account_created_at: "2020-01-01T00:00:00Z",
    claimed_by: `u${id}`,
    seen: [],
    ...over,
  };
}

function row(id: number, d: string, parts: Partial<Omit<PlayDayRow, "developer_id" | "day">>): PlayDayRow {
  return { developer_id: id, day: d, floors: 0, raids: 0, visits: 0, kudos: 0, code: 0, ...parts };
}

function rank(players: PlayPlayer[], rows: PlayDayRow[], featured: FeaturedActivity | null = null, bonus: SideBonus | null = null) {
  return rankPlayers(players, rows, { weekStart: WEEK, featured, bonus });
}

const NO_CATS: PlayCategories = {
  growth: { claude: 0, codex: 0 },
  sizes: { claude: 0, codex: 0 },
  visitDays: { claude: 0, codex: 0 },
  uniqueVisitors: { claude: 0, codex: 0 },
};

describe("dayTotal", () => {
  it("sums the capped parts", () => {
    expect(dayTotal(row(1, day(0), { floors: 10, raids: 10 }), null)).toBe(20);
  });

  it("doubles the featured activity: 4 raid wins (SQL caps at 30) on raids week give 60", () => {
    expect(dayTotal(row(1, day(0), { raids: 30 }), "raids")).toBe(60);
  });

  it("never doubles coding", () => {
    expect(dayTotal(row(1, day(0), { code: 20 }), "floors")).toBe(20);
    expect(dayTotal(row(1, day(0), { floors: 200, code: 20 }), "floors")).toBe(420);
  });
});

describe("rankPlayers", () => {
  it("sums the week, fills the 7 days, counts days played and non-coding points", () => {
    const [e] = rank([player(1, "claude")], [row(1, day(0), { floors: 5, code: 20 }), row(1, day(2), { kudos: 10 })]);
    expect(e).toMatchObject({ login: "p1", total: 35, prize: 35, nonCoding: 15, days: 2, counted: true, eligible: true, rank: 1 });
    expect(e.daily).toEqual([25, 0, 10, 0, 0, 0, 0]);
  });

  it("ignores rows outside the week and drops players with 0 points", () => {
    const out = rank([player(1, "claude"), player(2, "codex")], [row(1, day(7), { floors: 50 }), row(2, day(-1), { floors: 50 })]);
    expect(out).toEqual([]);
  });

  it("applies the featured activity to the total", () => {
    const [e] = rank([player(1, "codex")], [row(1, day(0), { raids: 30 })], "raids");
    expect(e.total).toBe(60);
    expect(e.nonCoding).toBe(60);
  });

  it("breaks ties by days played, then earlier claim, then lower id", () => {
    const players = [
      player(1, "claude"),
      player(2, "claude"),
      player(3, "codex", { claimed_at: "2026-08-01T00:00:00Z" }),
      player(4, "codex", { claimed_at: "2026-08-01T00:00:00Z" }),
      player(5, null, { claimed_at: null }),
    ];
    const rows = [
      row(1, day(0), { floors: 50 }),
      ...[2, 3, 4, 5].flatMap((id) => [row(id, day(0), { floors: 25 }), row(id, day(1), { floors: 25 })]),
    ];
    const out = rank(players, rows);
    expect(out.map((e) => e.login)).toEqual(["p3", "p4", "p2", "p5", "p1"]);
    expect(out.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("countedIds (alt checks)", () => {
  it("needs a claim before the week and an account created before Sep 8", () => {
    const players = [
      player(1, "claude"),
      player(2, "claude", { account_created_at: "2026-09-20T00:00:00Z" }),
      player(3, "claude", { account_created_at: null }),
      player(4, "claude", { claimed_at: "2026-10-19T00:00:00Z" }),
      player(5, "claude", { claimed_at: null }),
    ];
    expect([...countedIds(players, new Map(), WEEK)]).toEqual([1]);
  });

  it("keeps one developer per auth user: most points, then the lower id", () => {
    const players = [player(2, "codex", { claimed_by: "x" }), player(1, "codex", { claimed_by: "x" }), player(3, "codex", { claimed_by: "y" }), player(4, "codex", { claimed_by: "y" })];
    const totals = new Map([[1, 10], [2, 10], [3, 5], [4, 9]]);
    const ids = countedIds(players, totals, WEEK);
    expect([...ids].sort()).toEqual([1, 4]);
  });
});

describe("sideScore", () => {
  it("averages the players who scored, rounded, and needs 3 of them", () => {
    expect(sideScore([10, 20, 31, 0])).toEqual({ perPlayer: 20, scorers: 3 });
    expect(sideScore([900, 800, 0])).toBeNull();
  });
});

describe("categoryWinner", () => {
  it("goes to the higher count; a tie or a leader under min goes to nobody", () => {
    expect(categoryWinner(5, 2)).toBe("claude");
    expect(categoryWinner(2, 5)).toBe("codex");
    expect(categoryWinner(3, 3)).toBeNull();
    expect(categoryWinner(4, 1, 5)).toBeNull();
    expect(categoryWinner(5, 1, 5)).toBe("claude");
  });
});

describe("growthWinner", () => {
  it("compares raw joins in count mode and joins per member in share mode", () => {
    const growth = { claude: 10, codex: 8 };
    const sizes = { claude: 100, codex: 20 };
    expect(growthWinner(growth, sizes, "count")).toBe("claude");
    expect(growthWinner(growth, sizes, "share")).toBe("codex");
  });

  it("is nobody's on a tie in either mode", () => {
    expect(growthWinner({ claude: 3, codex: 3 }, { claude: 10, codex: 10 }, "count")).toBeNull();
    expect(growthWinner({ claude: 2, codex: 1 }, { claude: 20, codex: 10 }, "share")).toBeNull();
  });

  it("treats a side of size 0 as size 1 in share mode", () => {
    expect(growthWinner({ claude: 2, codex: 1 }, { claude: 0, codex: 50 }, "share")).toBe("claude");
  });
});

describe("warWinner", () => {
  it("goes to the higher score; a tie or two nulls go to nobody; a single null loses", () => {
    expect(warWinner(35, 10)).toBe("claude");
    expect(warWinner(10, 35)).toBe("codex");
    expect(warWinner(20, 20)).toBeNull();
    expect(warWinner(null, null)).toBeNull();
    expect(warWinner(null, 4)).toBe("codex");
    expect(warWinner(4, null)).toBe("claude");
  });
});

describe("buildWar: the side average", () => {
  it("the 2× activity never changes the formula: perPlayer is the rounded mean of the totals", () => {
    const players = [player(1, "claude"), player(2, "claude"), player(3, "claude")];
    const rows = [row(1, day(0), { raids: 30, code: 20 }), row(2, day(0), { raids: 10 }), row(3, day(0), { code: 20 })];
    const doubled = buildWar(rank(players, rows, "raids"), NO_CATS);
    expect(doubled.claude).toEqual({ perPlayer: Math.round((80 + 20 + 20) / 3), scorers: 3, bonus: 0, score: 40 });
    const plain = buildWar(rank(players, rows, null), NO_CATS);
    expect(plain.claude.perPlayer).toBe(Math.round((50 + 10 + 20) / 3));
  });

  it("keeps alts on the board but out of their side's average and scorers", () => {
    const players = [
      player(1, "claude"),
      player(2, "claude"),
      player(3, "claude"),
      player(4, "claude", { account_created_at: "2026-09-20T00:00:00Z" }),
      player(5, "claude", { claimed_at: "2026-10-20T10:00:00Z" }),
      player(6, "claude", { account_created_at: null }),
      player(7, "claude", { claimed_at: "2026-10-19T00:00:00Z" }),
    ];
    const rows = [
      row(1, day(0), { floors: 10 }),
      row(2, day(0), { floors: 20 }),
      row(3, day(0), { floors: 30 }),
      ...[4, 5, 6, 7].map((id) => row(id, day(0), { floors: 200 })),
    ];
    const entries = rank(players, rows);
    expect(entries).toHaveLength(7);
    for (const login of ["p4", "p5", "p6", "p7"]) {
      expect(entries.find((e) => e.login === login)).toMatchObject({ counted: false, eligible: false });
    }
    const war = buildWar(entries, NO_CATS);
    expect(war.claude.perPlayer).toBe(20);
    expect(war.claude.scorers).toBe(3);
  });

  it("counts a coding-only member for the side but not for the prize", () => {
    const players = [player(1, "codex"), player(2, "codex"), player(3, "codex")];
    const rows = [row(1, day(0), { floors: 10 }), row(2, day(0), { floors: 10 }), row(3, day(0), { code: 20 })];
    const entries = rank(players, rows);
    expect(entries.find((e) => e.login === "p3")).toMatchObject({ counted: true, eligible: false, nonCoding: 0 });
    const war = buildWar(entries, NO_CATS);
    expect(war.codex.scorers).toBe(3);
    expect(war.codex.perPlayer).toBe(Math.round(40 / 3));
  });

  it("counts two accounts of one auth user once, keeping the higher total", () => {
    const players = [
      player(1, "claude", { claimed_by: "same" }),
      player(2, "claude", { claimed_by: "same" }),
      player(3, "claude"),
      player(4, "claude"),
    ];
    const rows = [
      row(1, day(0), { floors: 50 }),
      row(2, day(0), { floors: 30 }),
      row(3, day(0), { floors: 10 }),
      row(4, day(0), { floors: 20 }),
    ];
    const entries = rank(players, rows);
    expect(entries.find((e) => e.login === "p2")?.counted).toBe(false);
    const war = buildWar(entries, NO_CATS);
    expect(war.claude.scorers).toBe(3);
    expect(war.claude.perPlayer).toBe(Math.round(80 / 3));
  });
});

describe("buildWar: team categories", () => {
  const sides = [player(1, "claude"), player(2, "claude"), player(3, "claude"), player(4, "codex"), player(5, "codex"), player(6, "codex")];
  const tens = sides.map((p) => row(p.developer_id, day(0), { floors: 10 }));
  const cats = (over: Partial<PlayCategories>): PlayCategories => ({ ...NO_CATS, sizes: { claude: 10, codex: 10 }, ...over });

  it("adds +25 to the side that grew the most", () => {
    const war = buildWar(rank(sides, tens), cats({ growth: { claude: 5, codex: 2 } }));
    expect(war.growth).toEqual({ claude: 5, codex: 2, winner: "claude" });
    expect(war.claude).toEqual({ perPlayer: 10, scorers: 3, bonus: 25, score: 35 });
    expect(war.codex).toEqual({ perPlayer: 10, scorers: 3, bonus: 0, score: 10 });
    expect(war.winner).toBe("claude");
  });

  it("gives nobody the bonus on a tie", () => {
    const war = buildWar(rank(sides, tens), cats({ growth: { claude: 3, codex: 3 } }));
    expect(war.growth.winner).toBeNull();
    expect(war.claude.bonus).toBe(0);
    expect(war.codex.bonus).toBe(0);
    expect(war.winner).toBeNull();
  });

  it("gives most visited only with 5+ unique visitors", () => {
    const under = buildWar(
      rank(sides, tens),
      cats({ visitDays: { claude: 9, codex: 2 }, uniqueVisitors: { claude: 4, codex: 2 } }),
    );
    expect(under.visits).toEqual({ claude: 9, codex: 2, winner: null, unique: { claude: 4, codex: 2 } });
    expect(under.claude.bonus).toBe(0);

    const enough = buildWar(
      rank(sides, tens),
      cats({ visitDays: { claude: 9, codex: 2 }, uniqueVisitors: { claude: 5, codex: 2 } }),
    );
    expect(enough.visits.winner).toBe("claude");
    expect(enough.claude.score).toBe(35);
  });

  it("voids a category won by a side under 3 scorers, which gets no bonus and no score", () => {
    const short = sides.filter((p) => p.developer_id !== 6);
    const war = buildWar(rank(short, tens), cats({ growth: { claude: 1, codex: 9 } }));
    expect(war.growth.winner).toBeNull();
    expect(war.codex).toEqual({ perPlayer: null, scorers: 2, bonus: 0, score: null });
    expect(war.claude.score).toBe(10);
    expect(war.winner).toBe("claude");
  });
});

describe("smaller-side bonus", () => {
  it("50 vs 19 gives the smaller side +16%; equal or empty sides give none", () => {
    expect(nextBonus({ claude: 50, codex: 19 })).toEqual({ side: "codex", pct: 16 });
    expect(nextBonus({ claude: 19, codex: 50 })).toEqual({ side: "claude", pct: 16 });
    expect(nextBonus({ claude: 30, codex: 30 })).toBeNull();
    expect(nextBonus({ claude: 0, codex: 0 })).toBeNull();
  });

  it("adds the bonus to prize points only, rounded down, and only on the smaller side", () => {
    const players = [player(1, "codex"), player(2, "codex"), player(3, "claude"), player(4, null)];
    const rows = [
      row(1, day(0), { floors: 100 }),
      row(2, day(0), { floors: 99 }),
      row(3, day(0), { floors: 100 }),
      row(4, day(0), { floors: 100 }),
    ];
    const out = rank(players, rows, null, { side: "codex", pct: 16 });
    const prize = (login: string) => out.find((e) => e.login === login)?.prize;
    expect(prize("p1")).toBe(116);
    expect(prize("p2")).toBe(114);
    expect(prize("p3")).toBe(100);
    expect(prize("p4")).toBe(100);
    expect(out.find((e) => e.login === "p1")?.total).toBe(100);
  });

  it("never changes the war average", () => {
    const players = [1, 2, 3].map((id) => player(id, "claude")).concat([4, 5, 6].map((id) => player(id, "codex")));
    const rows = players.map((p) => row(p.developer_id, day(0), { floors: 10 * (((p.developer_id - 1) % 3) + 1) }));
    const without = buildWar(rank(players, rows), NO_CATS);
    const withBonus = buildWar(rank(players, rows, null, { side: "codex", pct: 16 }), NO_CATS);
    expect(withBonus.codex).toEqual(without.codex);
    expect(withBonus.codex.perPlayer).toBe(20);
  });
});

describe("sideSizes", () => {
  it("counts side members claimed before the day, past the account cutoff, one per auth user", () => {
    const players = [
      player(1, "claude"),
      player(2, "claude"),
      player(3, "claude", { claimed_at: "2026-10-19T05:00:00Z" }),
      player(4, "codex"),
      player(5, "codex", { claimed_by: "u4" }),
      player(6, "codex", { account_created_at: "2026-09-10T00:00:00Z" }),
      player(7, null),
    ];
    expect(sideSizes(players, "2026-10-19")).toEqual({ claude: 2, codex: 1 });
  });
});

describe("pickWinners", () => {
  // Players 1..n on Claude with floors 130 - id, so rank === id.
  function field(n: number, over: (id: number) => Partial<PlayPlayer> = () => ({})) {
    const players = Array.from({ length: n }, (_, i) => player(i + 1, "claude", over(i + 1)));
    return rank(players, players.map((p) => row(p.developer_id, day(0), { floors: 130 - p.developer_id })));
  }
  const ids = (out: { developer_id: number }[]) => out.map((e) => e.developer_id);
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  it("relies on 10 winners and a top-15 check", () => {
    expect(PRIZE_WINNERS).toBe(10);
    expect(CHECK_TOP).toBe(15);
  });

  it("takes the top 10 eligible in order", () => {
    expect(ids(pickWinners(field(12), { excluded: [], pastWinners: [], onePrize: false }))).toEqual(range(1, 10));
  });

  it("moves the 11th up when a login is excluded (case-insensitive)", () => {
    const out = pickWinners(field(12), { excluded: ["P3"], pastWinners: [], onePrize: false });
    expect(ids(out)).toEqual([1, 2, ...range(4, 11)]);
  });

  it("skips players who aren't eligible", () => {
    const entries = field(12).map((e) => (e.developer_id === 2 ? { ...e, eligible: false } : e));
    expect(ids(pickWinners(entries, { excluded: [], pastWinners: [], onePrize: false }))).toEqual([1, ...range(3, 11)]);
  });

  it("skips past winners only when onePrize is on", () => {
    const entries = field(12);
    expect(ids(pickWinners(entries, { excluded: [], pastWinners: ["p1"], onePrize: true }))).toEqual(range(2, 11));
    expect(ids(pickWinners(entries, { excluded: [], pastWinners: ["p1"], onePrize: false }))).toEqual(range(1, 10));
  });

  it("gives one prize to accounts sharing a seen hash in the top 15", () => {
    const entries = field(12, (id) => ({ seen: id === 1 || id === 2 ? ["h1"] : [`own${id}`] }));
    expect(ids(pickWinners(entries, { excluded: [], pastWinners: [], onePrize: false }))).toEqual([1, ...range(3, 11)]);
  });

  it("doesn't compare seen hashes below the top 15", () => {
    const entries = field(20, (id) => ({ seen: id === 16 || id === 17 ? ["h2"] : [] }));
    const excluded = range(1, 8).map((id) => `p${id}`);
    expect(ids(pickWinners(entries, { excluded, pastWinners: [], onePrize: false }))).toEqual(range(9, 18));
  });
});

describe("sideDays", () => {
  it("averages each day over the side's counted scorers", () => {
    const players = [
      player(1, "claude"),
      player(2, "claude"),
      player(3, "claude", { account_created_at: "2026-09-30T00:00:00Z" }),
      player(4, "codex"),
    ];
    const rows = [
      row(1, day(0), { floors: 10 }),
      row(1, day(1), { floors: 20 }),
      row(2, day(0), { floors: 30 }),
      row(3, day(0), { floors: 200 }),
      row(4, day(0), { floors: 10 }),
    ];
    const entries = rank(players, rows);
    expect(sideDays(entries, "claude")).toEqual([20, 10, 0, 0, 0, 0, 0]);
    expect(sideDays(entries, "codex")).toEqual([10, 0, 0, 0, 0, 0, 0]);
  });
});
