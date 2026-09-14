-- =====================================================
-- イベント申込締切日の追加
-- =====================================================

-- 1) events テーブルに申込締切日を追加
-- 締切日は Asia/Tokyo 基準で、この日いっぱいまで受付可能とする
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS registration_deadline date;

-- 2) 既存イベントは現在の挙動に近づけるため、開催日を締切日にする
UPDATE public.events
SET registration_deadline = starts_at::date
WHERE registration_deadline IS NULL;

COMMENT ON COLUMN public.events.registration_deadline IS
'参加申し込みの締切日。Asia/Tokyo基準で、この日までは申し込み可能。';

-- 3) 古い電話番号・出身地なし RPC は締切チェックを迂回できるため削除
DROP FUNCTION IF EXISTS public.register_for_event(
    bigint, text, text, text, text, text
);

-- 4) 現在のアプリが使っている電話番号・出身地つき RPC に締切チェックを追加
CREATE OR REPLACE FUNCTION public.register_for_event(
    p_event_id bigint,
    p_campus text,
    p_name text,
    p_phone text,
    p_hometown text,
    p_japanese_level text,
    p_japanese_motivation text,
    p_english_level text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity integer;
    v_registration_deadline date;
    v_current_count integer;
    v_registration_id uuid;
BEGIN
    SELECT capacity, registration_deadline
    INTO v_capacity, v_registration_deadline
    FROM events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_registration_deadline IS NOT NULL
       AND (now() AT TIME ZONE 'Asia/Tokyo')::date > v_registration_deadline THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM event_registrations
    WHERE event_id = p_event_id;

    IF v_capacity IS NOT NULL AND v_current_count >= v_capacity THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'full');
    END IF;

    INSERT INTO event_registrations (
        event_id,
        campus,
        name,
        phone,
        hometown,
        japanese_level,
        japanese_motivation,
        english_level
    )
    VALUES (
        p_event_id,
        p_campus,
        p_name,
        p_phone,
        p_hometown,
        p_japanese_level,
        p_japanese_motivation,
        p_english_level
    )
    RETURNING id INTO v_registration_id;

    RETURN jsonb_build_object('ok', true, 'registration_id', v_registration_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_event(
    bigint, text, text, text, text, text, text, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.register_for_event(
    bigint, text, text, text, text, text, text, text
) TO authenticated;
