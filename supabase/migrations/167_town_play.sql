-- ─── Town play points ──────────────────────────────────────
-- From Mon Oct 19 one weekly count of player points decides Claude Code vs
-- Codex and the weekly top-10 prize (docs/plans/2026-10-05-town-play-prize.md).
--
-- town_play_days: floors each player knocked down outside their own town, per
-- UTC day, written by the drive room through the signed smash save. jumps,
-- victims and seen feed the Monday check; players never see them.
--
-- town_play_batches: batch ids already stored. The room resends a batch until
-- a save returns 200, so a resend adds nothing. Pruned after 2 days.
--
-- town_play_weeks: the frozen week, written by the Monday close. bonus_side and
-- bonus_pct are the smaller-side bonus that applied during that row's own week;
-- next_bonus is the one set at the close for the week that just opened (the
-- rules page reads it). winners is written once, at publish.
--
-- play_day_points: capped points per activity per player per UTC day, active
-- town members only. The 2× activity of the week is applied in TS on top
-- (points and cap both double, so the count cap stays the same).
-- Caps mirror CAPS in src/lib/towns/play-rules.ts (play-rules.test.ts asserts it).

BEGIN;

-- ─── Tables ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.town_play_days (
  developer_id bigint      NOT NULL REFERENCES public.developers(id) ON DELETE CASCADE,
  day          date        NOT NULL,
  floors       int         NOT NULL DEFAULT 0 CHECK (floors BETWEEN 0 AND 200),
  first_at     timestamptz NOT NULL DEFAULT now(),
  capped_at    timestamptz,
  jumps        int         NOT NULL DEFAULT 0,
  victims      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  seen         text[]      NOT NULL DEFAULT '{}',
  PRIMARY KEY (developer_id, day)
);
CREATE INDEX IF NOT EXISTS town_play_days_day_idx ON public.town_play_days (day);

CREATE TABLE IF NOT EXISTS public.town_play_batches (
  id uuid        PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.town_play_weeks (
  week_start   date        PRIMARY KEY,
  standings    jsonb       NOT NULL,
  war          jsonb       NOT NULL,
  featured     text        CHECK (featured IN ('floors', 'raids', 'visits', 'kudos')),
  bonus_side   text        CHECK (bonus_side IN ('claude', 'codex')),
  bonus_pct    int         NOT NULL DEFAULT 0 CHECK (bonus_pct BETWEEN 0 AND 20),
  next_bonus   jsonb,
  excluded     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  winners      jsonb,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── add_town_floors ───────────────────────────────────────
-- p = [{dev, day, n, victims, jumps, seen}]. A batch id already stored returns
-- without changes. A malformed entry or an unknown dev is skipped, so one bad
-- entry can't make the room resend the batch forever.
CREATE OR REPLACE FUNCTION public.add_town_floors(p_batch uuid, p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new     int;
  e         jsonb;
  v_dev     bigint;
  v_day     date;
  v_n       int;
  v_jumps   int;
  v_victims jsonb;
  v_seen    text[];
BEGIN
  DELETE FROM public.town_play_batches WHERE at < now() - interval '2 days';

  INSERT INTO public.town_play_batches (id) VALUES (p_batch) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;
  IF v_new = 0 THEN
    RETURN;
  END IF;

  FOR e IN
    SELECT x.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) AS x
  LOOP
    CONTINUE WHEN jsonb_typeof(e->'dev') IS DISTINCT FROM 'number'
               OR jsonb_typeof(e->'n') IS DISTINCT FROM 'number'
               OR COALESCE(e->>'day', '') !~ '^\d{4}-\d{2}-\d{2}$';
    BEGIN
      v_dev := (e->>'dev')::numeric::bigint;
      v_day := (e->>'day')::date;
      v_n   := LEAST(GREATEST(floor((e->>'n')::numeric), 0), 200)::int;
      v_jumps := CASE WHEN jsonb_typeof(e->'jumps') = 'number'
                      THEN LEAST(GREATEST(floor((e->>'jumps')::numeric), 0), 10000)::int
                      ELSE 0 END;
      v_victims := CASE WHEN jsonb_typeof(e->'victims') = 'object' THEN
          (SELECT COALESCE(jsonb_object_agg(x.key, x.value::int), '{}'::jsonb)
           FROM jsonb_each_text(e->'victims') AS x
           WHERE x.value ~ '^\d{1,6}$')
        ELSE '{}'::jsonb END;
      v_seen := CASE WHEN jsonb_typeof(e->'seen') = 'array' THEN
          ARRAY(SELECT s.v FROM jsonb_array_elements_text(e->'seen') WITH ORDINALITY AS s(v, i)
                WHERE length(s.v) BETWEEN 1 AND 64
                GROUP BY s.v ORDER BY min(s.i) LIMIT 5)
        ELSE '{}'::text[] END;

      IF v_n > 0 AND EXISTS (SELECT 1 FROM public.developers WHERE id = v_dev) THEN
        INSERT INTO public.town_play_days AS d (developer_id, day, floors, capped_at, jumps, victims, seen)
        VALUES (v_dev, v_day, v_n, CASE WHEN v_n >= 200 THEN now() END, v_jumps, v_victims, v_seen)
        ON CONFLICT (developer_id, day) DO UPDATE SET
          floors    = LEAST(d.floors + EXCLUDED.floors, 200),
          capped_at = COALESCE(d.capped_at, CASE WHEN d.floors + EXCLUDED.floors >= 200 THEN now() END),
          jumps     = d.jumps + EXCLUDED.jumps,
          victims   = (SELECT COALESCE(jsonb_object_agg(u.k, u.n), '{}'::jsonb)
                       FROM (SELECT x.key AS k, sum(x.value::int) AS n
                             FROM (SELECT * FROM jsonb_each_text(d.victims)
                                   UNION ALL
                                   SELECT * FROM jsonb_each_text(EXCLUDED.victims)) AS x
                             GROUP BY x.key) AS u),
          seen      = ARRAY(SELECT s.v FROM unnest(d.seen || EXCLUDED.seen) WITH ORDINALITY AS s(v, i)
                            GROUP BY s.v ORDER BY min(s.i) LIMIT 5);
      END IF;
    EXCEPTION WHEN data_exception THEN
      NULL; -- a malformed entry is skipped; it never blocks the rest of the batch
    END;
  END LOOP;
END;
$$;

-- ─── play_day_points ───────────────────────────────────────
-- Capped points per activity per active town member per UTC day.
-- Caps mirror CAPS in src/lib/towns/play-rules.ts (play-rules.test.ts asserts it).
-- Every branch of parts returns (developer_id, day, floors, raids, visits, kudos, code)
-- in that order: UNION ALL matches columns by position.
CREATE OR REPLACE FUNCTION public.play_day_points(p_from date, p_to date)
RETURNS TABLE (
  developer_id bigint,
  day          date,
  floors       int,
  raids        int,
  visits       int,
  kudos        int,
  code         int,
  total        int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH parts AS (
    -- floors
    SELECT t.developer_id, t.day, LEAST(t.floors, 200) AS floors, 0 AS raids, 0 AS visits, 0 AS kudos, 0 AS code
    FROM public.town_play_days t
    WHERE t.day BETWEEN p_from AND p_to

    UNION ALL
    -- raids: successful raids only
    SELECT r.attacker_id, (r.created_at AT TIME ZONE 'utc')::date, 0, LEAST(10*count(*) FILTER (WHERE success), 30), 0, 0, 0
    FROM public.raids r
    WHERE r.success
      AND r.created_at >= p_from::timestamp AT TIME ZONE 'utc'
      AND r.created_at <  (p_to + 1)::timestamp AT TIME ZONE 'utc'
    GROUP BY r.attacker_id, (r.created_at AT TIME ZONE 'utc')::date

    UNION ALL
    -- visits. Your own town never counts (the visit route already skips members;
    -- this also drops a visit made before joining that town).
    SELECT v.developer_id, v.day, 0, 0, v.n, 0, 0
    FROM (
      SELECT tv.developer_id, tv.day, LEAST(10*count(*), 30)
      FROM public.town_visits tv
      WHERE tv.day BETWEEN p_from AND p_to
        AND NOT EXISTS (
          SELECT 1 FROM public.league_members lm
          WHERE lm.league_id = tv.league_id AND lm.developer_id = tv.developer_id AND lm.status IN ('active', 'invited')
        )
      GROUP BY tv.developer_id, tv.day
    ) AS v(developer_id, day, n)

    UNION ALL
    -- kudos given to someone else
    SELECT k.developer_id, k.day, 0, 0, 0, k.n, 0
    FROM (
      SELECT dk.giver_id, dk.given_date, LEAST(5*count(*), 25)
      FROM public.developer_kudos dk
      WHERE dk.given_date BETWEEN p_from AND p_to
        AND dk.giver_id <> dk.receiver_id
      GROUP BY dk.giver_id, dk.given_date
    ) AS k(developer_id, day, n)

    UNION ALL
    -- code: one flat score for any day with a contribution
    SELECT s.developer_id, s.day, 0, 0, 0, 0, 20
    FROM public.league_weekly_stats s
    WHERE s.day BETWEEN p_from AND p_to
      AND s.contributions > 0
  )
  SELECT p.developer_id,
         p.day,
         sum(p.floors)::int,
         sum(p.raids)::int,
         sum(p.visits)::int,
         sum(p.kudos)::int,
         sum(p.code)::int,
         sum(p.floors + p.raids + p.visits + p.kudos + p.code)::int
  FROM parts p
  WHERE p.developer_id IN (SELECT DISTINCT m.developer_id FROM public.league_members m WHERE m.status = 'active')
  GROUP BY p.developer_id, p.day;
$$;

-- ─── Grants ────────────────────────────────────────────────
-- Only the service role (the smash route, the close, the board) runs these.
REVOKE ALL ON FUNCTION public.add_town_floors(uuid, jsonb), public.play_day_points(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_town_floors(uuid, jsonb), public.play_day_points(date, date) TO service_role;

-- RLS on, no public policies: reads and writes go through the service role.
ALTER TABLE public.town_play_days    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.town_play_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.town_play_weeks   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.town_play_days, public.town_play_batches, public.town_play_weeks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.town_play_days, public.town_play_batches, public.town_play_weeks TO service_role;

COMMIT;
