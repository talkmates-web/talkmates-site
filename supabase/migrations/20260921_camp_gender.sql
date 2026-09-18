-- =====================================================
-- 合宿申込フォームに性別（部屋割り用）を追加
-- =====================================================
-- 任意項目。既存の申込データ・既存イベントには影響しない。

ALTER TABLE public.camp_applications
ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.camp_applications
DROP CONSTRAINT IF EXISTS camp_applications_gender_check;

ALTER TABLE public.camp_applications
ADD CONSTRAINT camp_applications_gender_check
CHECK (gender IN ('male', 'female'));

COMMENT ON COLUMN public.camp_applications.gender IS
'部屋割りのために収集する性別。任意項目のためNULL許可。';

-- register_for_camp に p_gender を追加（末尾に DEFAULT NULL で追加、既存呼び出しに影響なし）
CREATE OR REPLACE FUNCTION public.register_for_camp(
    p_event_id bigint,
    p_name text,
    p_phone text,
    p_university text,
    p_campus text,
    p_grade text,
    p_birthday date,
    p_hometown text,
    p_allergy_status text,
    p_student_id text DEFAULT NULL,
    p_allergy_details text DEFAULT NULL,
    p_dietary_religious text DEFAULT NULL,
    p_dietary_restrictions text DEFAULT NULL,
    p_accommodation_notes text DEFAULT NULL,
    p_gender text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registration_type text;
    v_capacity integer;
    v_registration_deadline date;
    v_current_count integer;
    v_cancellation_policy_id uuid;
    v_cancellation_version integer;
    v_disclaimer_policy_id uuid;
    v_disclaimer_version integer;
    v_application_id uuid;
BEGIN
    SELECT registration_type, capacity, registration_deadline
    INTO v_registration_type, v_capacity, v_registration_deadline
    FROM events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_registration_type <> 'camp' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_registration_deadline IS NOT NULL
       AND (now() AT TIME ZONE 'Asia/Tokyo')::date > v_registration_deadline THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM camp_applications
    WHERE event_id = p_event_id;

    IF v_capacity IS NOT NULL AND v_current_count >= v_capacity THEN
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
        gender,
        cancellation_policy_id, cancellation_policy_version, cancellation_agreed_at,
        disclaimer_policy_id, disclaimer_version, disclaimer_agreed_at
    )
    VALUES (
        p_event_id, p_name, p_phone, p_university, p_student_id, p_campus, p_grade, p_birthday, p_hometown,
        p_allergy_status, p_allergy_details, p_dietary_religious, p_dietary_restrictions, p_accommodation_notes,
        p_gender,
        v_cancellation_policy_id, v_cancellation_version, now(),
        v_disclaimer_policy_id, v_disclaimer_version, now()
    )
    RETURNING id INTO v_application_id;

    RETURN jsonb_build_object('ok', true, 'application_id', v_application_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_camp(
    bigint, text, text, text, text, text, date, text, text, text, text, text, text, text, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.register_for_camp(
    bigint, text, text, text, text, text, date, text, text, text, text, text, text, text, text
) TO authenticated;

-- register_for_camp_v2（属性別定員あり）にも同様に p_gender を追加
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
    p_accommodation_notes text DEFAULT NULL,
    p_gender text DEFAULT NULL
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
        gender,
        participant_type,
        cancellation_policy_id, cancellation_policy_version, cancellation_agreed_at,
        disclaimer_policy_id, disclaimer_version, disclaimer_agreed_at
    )
    VALUES (
        p_event_id, p_name, p_phone, p_university, p_student_id, p_campus, p_grade, p_birthday, p_hometown,
        p_allergy_status, p_allergy_details, p_dietary_religious, p_dietary_restrictions, p_accommodation_notes,
        p_gender,
        p_participant_type,
        v_cancellation_policy_id, v_cancellation_version, now(),
        v_disclaimer_policy_id, v_disclaimer_version, now()
    )
    RETURNING id INTO v_application_id;

    RETURN jsonb_build_object('ok', true, 'application_id', v_application_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_camp_v2(
    bigint, text, text, text, text, text, date, text, text, text, text, text, text, text, text, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.register_for_camp_v2(
    bigint, text, text, text, text, text, date, text, text, text, text, text, text, text, text, text
) TO authenticated;
