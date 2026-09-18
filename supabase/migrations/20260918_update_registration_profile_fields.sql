-- =====================================================
-- イベント参加フォーム項目の更新
-- =====================================================

-- 新しい受付項目。既存の参加者データと対立しないよう NULL 許可で追加する。
ALTER TABLE public.event_registrations
ADD COLUMN IF NOT EXISTS university text,
ADD COLUMN IF NOT EXISTS grade text,
ADD COLUMN IF NOT EXISTS birthday date,
ADD COLUMN IF NOT EXISTS student_id text;

-- 新フォームでは使わなくなるが、過去データ保持のためカラム自体は残す。
-- 新フォームの INSERT と対立しないよう NOT NULL 制約だけ外す。
ALTER TABLE public.event_registrations
ALTER COLUMN japanese_level DROP NOT NULL,
ALTER COLUMN japanese_motivation DROP NOT NULL,
ALTER COLUMN english_level DROP NOT NULL;

COMMENT ON COLUMN public.event_registrations.university IS
'参加者の所属大学。例: doshisha, doshisha_womens, other';

COMMENT ON COLUMN public.event_registrations.grade IS
'参加者の学年。例: year_1, year_2, year_3, year_4, master_1, master_2, other';

COMMENT ON COLUMN public.event_registrations.birthday IS
'参加者の誕生日。';

COMMENT ON COLUMN public.event_registrations.student_id IS
'参加者の学籍番号。同志社大学（university = doshisha）の場合はアプリ側で入力必須にする。半角数字のみ。';

-- 既存の register_for_event は残し、現行デプロイや過去実装を壊さない。
-- 新フォームは v2 を呼び出す。
CREATE OR REPLACE FUNCTION public.register_for_event_v2(
    p_event_id bigint,
    p_name text,
    p_phone text,
    p_university text,
    p_campus text,
    p_grade text,
    p_birthday date,
    p_hometown text,
    p_student_id text DEFAULT NULL
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
        name,
        phone,
        university,
        campus,
        grade,
        birthday,
        hometown,
        student_id
    )
    VALUES (
        p_event_id,
        p_name,
        p_phone,
        p_university,
        p_campus,
        p_grade,
        p_birthday,
        p_hometown,
        p_student_id
    )
    RETURNING id INTO v_registration_id;

    RETURN jsonb_build_object('ok', true, 'registration_id', v_registration_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_event_v2(
    bigint, text, text, text, text, text, date, text, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.register_for_event_v2(
    bigint, text, text, text, text, text, date, text, text
) TO authenticated;
