-- ─── Town play prize codes ─────────────────────────────────
-- The sponsor's coupons (one per winner). The Monday publish hands one to each
-- winner, in order, and the winner email carries it. A winner keeps the same
-- code if the publish or the email runs again.

BEGIN;

CREATE TABLE IF NOT EXISTS public.town_play_codes (
  code         text        PRIMARY KEY,
  week_start   date,
  developer_id bigint      REFERENCES public.developers(id) ON DELETE SET NULL,
  assigned_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, developer_id)
);

-- The winner's code for the week: the one already given, or the next free one
-- (null when none is left).
CREATE OR REPLACE FUNCTION public.claim_play_code(p_week date, p_dev bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT code INTO v_code FROM public.town_play_codes WHERE week_start = p_week AND developer_id = p_dev;
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;
  UPDATE public.town_play_codes
     SET week_start = p_week, developer_id = p_dev, assigned_at = now()
   WHERE code = (SELECT code FROM public.town_play_codes WHERE developer_id IS NULL ORDER BY created_at, code LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING code INTO v_code;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_play_code(date, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_play_code(date, bigint) TO service_role;

ALTER TABLE public.town_play_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.town_play_codes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.town_play_codes TO service_role;

COMMIT;
