-- =====================================================
-- 属性別（日本人／留学生）定員管理機能
-- =====================================================
-- 既存イベント・既存合宿は一切変更しない。
-- events.capacity_by_nationality はデフォルト false のため、
-- 既存行はすべて今まで通り旧RPC（register_for_event_v2 / register_for_camp /
-- get_event_registration_count / get_camp_application_count）を使い続ける。
-- 新方式は、今後スタッフが直打ちで capacity_by_nationality = true に設定した
-- イベント/合宿でのみ有効になる。

-- 1) events テーブル
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS capacity_by_nationality boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS capacity_japanese integer;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS capacity_international integer;

-- 2) 参加者属性カラム
-- CHECK制約はNULLを許容する（Postgres仕様：式がNULLになる場合は制約違反にならない）。
-- 既存データや capacity_by_nationality = false のイベントの申込は
-- participant_type を設定せず NULL のままでよい。NOT NULL にしないこと。
ALTER TABLE public.event_registrations
ADD COLUMN IF NOT EXISTS participant_type text;

ALTER TABLE public.event_registrations
DROP CONSTRAINT IF EXISTS event_registrations_participant_type_check;

ALTER TABLE public.event_registrations
ADD CONSTRAINT event_registrations_participant_type_check
CHECK (participant_type IN ('japanese', 'international'));

ALTER TABLE public.camp_applications
ADD COLUMN IF NOT EXISTS participant_type text;

ALTER TABLE public.camp_applications
DROP CONSTRAINT IF EXISTS camp_applications_participant_type_check;

ALTER TABLE public.camp_applications
ADD CONSTRAINT camp_applications_participant_type_check
CHECK (participant_type IN ('japanese', 'international'));

-- 3) register_for_event_v3
-- capacity_by_nationality = true のイベント専用。false のイベントでは reason:'invalid' を返す
-- （旧ロジックをここに複製しない。旧イベントは今まで通り register_for_event_v2 を使い続ける）。
-- ロックは既存 register_for_event_v2 と同じく events 行の FOR UPDATE。
-- 粒度はイベント単位でありプール単位ではないが、同一イベントへの同時実行はすべて
-- この1行のロックで直列化されるため、プール別カウントでも競合状態は起きない。
CREATE OR REPLACE FUNCTION public.register_for_event_v3(
    p_event_id bigint,
    p_name text,
    p_phone text,
    p_university text,
    p_campus text,
    p_grade text,
    p_birthday date,
    p_hometown text,
    p_participant_type text,
    p_student_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registration_type text;
    v_capacity_by_nationality boolean;
    v_capacity_japanese integer;
    v_capacity_international integer;
    v_registration_deadline date;
    v_current_count integer;
    v_registration_id uuid;
BEGIN
    SELECT registration_type, capacity_by_nationality, capacity_japanese, capacity_international, registration_deadline
    INTO v_registration_type, v_capacity_by_nationality, v_capacity_japanese, v_capacity_international, v_registration_deadline
    FROM events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_registration_type <> 'standard' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_capacity_by_nationality IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF p_participant_type IS NULL OR p_participant_type NOT IN ('japanese', 'international') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_registration_deadline IS NOT NULL
       AND (now() AT TIME ZONE 'Asia/Tokyo')::date > v_registration_deadline THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM event_registrations
    WHERE event_id = p_event_id AND participant_type = p_participant_type;

    IF p_participant_type = 'japanese' AND v_capacity_japanese IS NOT NULL AND v_current_count >= v_capacity_japanese THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'full');
    END IF;

    IF p_participant_type = 'international' AND v_capacity_international IS NOT NULL AND v_current_count >= v_capacity_international THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'full');
    END IF;

    INSERT INTO event_registrations (
        event_id, name, phone, university, campus, grade, birthday, hometown, student_id, participant_type
    )
    VALUES (
        p_event_id, p_name, p_phone, p_university, p_campus, p_grade, p_birthday, p_hometown, p_student_id, p_participant_type
    )
    RETURNING id INTO v_registration_id;

    RETURN jsonb_build_object('ok', true, 'registration_id', v_registration_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_event_v3(
    bigint, text, text, text, text, text, date, text, text, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.register_for_event_v3(
    bigint, text, text, text, text, text, date, text, text, text
) TO authenticated;

-- 4) register_for_camp_v2
-- register_for_camp と同じ流れに、capacity_by_nationality ガードとプール別定員判定を追加。
-- 「register_for_camp_v2」という名前だが、register_for_camp に "_v1" があったわけではない
-- （命名は関数ごとの改版履歴であり、camp 系と standard 系で採番が揃っていないのは既存の
-- register_for_event_v2 / register_for_camp の命名差に由来する既知の非一貫性）。
CREATE OR REPLACE FUNCTION public.register_for_camp_v2(
    p_event_id bigint,
    p_name text,
    p_phone text,
    p_university text,
    p_campus text,
    p_grade text,
    p_birthday date,
    p_hometown text,
    p_allergy_status text,
    p_participant_type text,
    p_student_id text DEFAULT NULL,
    p_allergy_details text DEFAULT NULL,
    p_dietary_religious text DEFAULT NULL,
    p_dietary_restrictions text DEFAULT NULL,
    p_accommodation_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registration_type text;
    v_capacity_by_nationality boolean;
    v_capacity_japanese integer;
    v_capacity_international integer;
    v_registration_deadline date;
    v_current_count integer;
    v_cancellation_policy_id uuid;
    v_cancellation_version integer;
    v_disclaimer_policy_id uuid;
    v_disclaimer_version integer;
    v_application_id uuid;
BEGIN
    SELECT registration_type, capacity_by_nationality, capacity_japanese, capacity_international, registration_deadline
    INTO v_registration_type, v_capacity_by_nationality, v_capacity_japanese, v_capacity_international, v_registration_deadline
    FROM events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_registration_type <> 'camp' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_capacity_by_nationality IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF p_participant_type IS NULL OR p_participant_type NOT IN ('japanese', 'international') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_registration_deadline IS NOT NULL
       AND (now() AT TIME ZONE 'Asia/Tokyo')::date > v_registration_deadline THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM camp_applications
    WHERE event_id = p_event_id AND participant_type = p_participant_type;

    IF p_participant_type = 'japanese' AND v_capacity_japanese IS NOT NULL AND v_current_count >= v_capacity_japanese THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'full');
    END IF;

    IF p_participant_type = 'international' AND v_capacity_international IS NOT NULL AND v_current_count >= v_capacity_international THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'full');
    END IF;

    SELECT id, version INTO v_cancellation_policy_id, v_cancellation_version
    FROM policies
    WHERE event_id = p_event_id AND type = 'cancellation' AND status = 'published';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'policy_missing', 'policy_type', 'cancellation');
    END IF;

    SELECT id, version INTO v_disclaimer_policy_id, v_disclaimer_version
    FROM policies
    WHERE event_id = p_event_id AND type = 'disclaimer' AND status = 'published';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'policy_missing', 'policy_type', 'disclaimer');
    END IF;

    INSERT INTO camp_applications (
        event_id, name, phone, university, student_id, campus, grade, birthday, hometown,
        allergy_status, allergy_details, dietary_religious, dietary_restrictions, accommodation_notes,
        participant_type,
        cancellation_policy_id, cancellation_policy_version, cancellation_agreed_at,
        disclaimer_policy_id, disclaimer_version, disclaimer_agreed_at
    )
    VALUES (
        p_event_id, p_name, p_phone, p_university, p_student_id, p_campus, p_grade, p_birthday, p_hometown,
        p_allergy_status, p_allergy_details, p_dietary_religious, p_dietary_restrictions, p_accommodation_notes,
        p_participant_type,
        v_cancellation_policy_id, v_cancellation_version, now(),
        v_disclaimer_policy_id, v_disclaimer_version, now()
    )
    RETURNING id INTO v_application_id;

    RETURN jsonb_build_object('ok', true, 'application_id', v_application_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_camp_v2(
    bigint, text, text, text, text, text, date, text, text, text, text, text, text, text, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.register_for_camp_v2(
    bigint, text, text, text, text, text, date, text, text, text, text, text, text, text, text
) TO authenticated;

-- 5) 参加人数の内訳を返すRPC（capacity_by_nationality = true のイベント/合宿用）
-- 個人情報は返さない。
CREATE OR REPLACE FUNCTION public.get_event_registration_count_v2(p_event_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total integer;
    v_japanese integer;
    v_international integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
        RETURN NULL;
    END IF;

    SELECT
        COUNT(*)::integer,
        COUNT(*) FILTER (WHERE participant_type = 'japanese')::integer,
        COUNT(*) FILTER (WHERE participant_type = 'international')::integer
    INTO v_total, v_japanese, v_international
    FROM event_registrations
    WHERE event_id = p_event_id;

    RETURN jsonb_build_object('total', v_total, 'japanese', v_japanese, 'international', v_international);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_registration_count_v2(bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.get_event_registration_count_v2(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_camp_application_count_v2(p_event_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total integer;
    v_japanese integer;
    v_international integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
        RETURN NULL;
    END IF;

    SELECT
        COUNT(*)::integer,
        COUNT(*) FILTER (WHERE participant_type = 'japanese')::integer,
        COUNT(*) FILTER (WHERE participant_type = 'international')::integer
    INTO v_total, v_japanese, v_international
    FROM camp_applications
    WHERE event_id = p_event_id;

    RETURN jsonb_build_object('total', v_total, 'japanese', v_japanese, 'international', v_international);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_camp_application_count_v2(bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.get_camp_application_count_v2(bigint) TO authenticated;
