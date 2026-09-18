-- =====================================================
-- 合宿専用申し込みフォーム機能
-- =====================================================

-- 1) events テーブルにイベント種別を追加
-- 既存行は 'standard' として扱われ、標準イベントフローに影響なし。
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS registration_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_registration_type_check;

ALTER TABLE public.events
ADD CONSTRAINT events_registration_type_check
CHECK (registration_type IN ('standard', 'camp'));

-- 2) policies テーブル作成
-- キャンセル規定・免責事項の本文をバージョン管理する。
-- 公開済み(content)は上書きしない運用とする（アプリからのUPDATE経路は用意しない）。
CREATE TABLE IF NOT EXISTS public.policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('cancellation', 'disclaimer')),
    title text NOT NULL,
    content text NOT NULL,
    version integer NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 同じ event_id × type で「公開中」が同時に2つ存在することをDBレベルで防ぐ。
-- 新しいバージョンを公開する際は、まず既存の published 行を archived に更新してから
-- 新しい draft 行を published に更新すること（直打ち運用）。
CREATE UNIQUE INDEX IF NOT EXISTS uniq_policies_published_per_event_type
ON public.policies (event_id, type)
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_policies_event_type_status
ON public.policies (event_id, type, status);

-- 3) camp_applications テーブル作成
-- event_registrations とは完全に独立させ、標準イベントのRLS/RPCに影響を与えない。
CREATE TABLE IF NOT EXISTS public.camp_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

    -- 参加者情報（標準フォームと同じ基本項目）
    name text NOT NULL,
    phone text NOT NULL,
    university text NOT NULL,
    student_id text,
    campus text NOT NULL,
    grade text NOT NULL,
    birthday date NOT NULL,
    hometown text NOT NULL,

    -- 宿泊・食事関連
    allergy_status text NOT NULL CHECK (allergy_status IN ('none', 'has')),
    allergy_details text,
    dietary_religious text,
    dietary_restrictions text,
    accommodation_notes text,

    -- 規約同意の追跡。値は register_for_camp RPC 内部でのみ設定し、
    -- クライアントから直接書き込ませない（なりすまし防止）。
    cancellation_policy_id uuid NOT NULL REFERENCES public.policies(id),
    cancellation_policy_version integer NOT NULL,
    cancellation_agreed_at timestamptz NOT NULL,
    disclaimer_policy_id uuid NOT NULL REFERENCES public.policies(id),
    disclaimer_version integer NOT NULL,
    disclaimer_agreed_at timestamptz NOT NULL,

    application_status text NOT NULL DEFAULT 'applied' CHECK (application_status IN ('applied', 'confirmed', 'cancelled')),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camp_applications_event_id
ON public.camp_applications (event_id);

-- 4) RLS

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

-- anon は公開済みのpolicyのみ閲覧可（申込モーダル表示用）
DROP POLICY IF EXISTS "anon_select_published_policies" ON public.policies;
CREATE POLICY "anon_select_published_policies" ON public.policies
    FOR SELECT
    TO anon
    USING (status = 'published');

-- staff は全ステータスを閲覧可（過去に同意された内容の確認用）
DROP POLICY IF EXISTS "authenticated_select_policies" ON public.policies;
CREATE POLICY "authenticated_select_policies" ON public.policies
    FOR SELECT
    TO authenticated
    USING (true);

-- policies への INSERT/UPDATE はアプリから提供しない（Supabase側で直打ちする運用）。
-- anon/authenticated 向けの書き込みポリシーは意図的に作らない。

ALTER TABLE public.camp_applications ENABLE ROW LEVEL SECURITY;

-- staff のみ閲覧可。
DROP POLICY IF EXISTS "authenticated_select_camp_applications" ON public.camp_applications;
CREATE POLICY "authenticated_select_camp_applications" ON public.camp_applications
    FOR SELECT
    TO authenticated
    USING (true);

-- anon への直接INSERT権限は意図的に付与しない。
-- register_for_camp は SECURITY DEFINER のため、RLSをバイパスしてINSERTできる。
-- ここで anon に直接INSERTを許可すると、RPCを経由せず policy_id や agreed_at を
-- 捏造した行を書き込めてしまい、同意の証跡としての価値が失われるため。

-- 5) 参加人数のみを返す安全なRPC（個人情報は返さない）
CREATE OR REPLACE FUNCTION public.get_camp_application_count(p_event_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*)::integer INTO v_count
    FROM camp_applications
    WHERE event_id = p_event_id;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_camp_application_count(bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.get_camp_application_count(bigint) TO authenticated;

-- 6) 合宿申し込みRPC
-- policy_id はクライアントから受け取らず、現在publishedのバージョンをRPC内部で確定する。
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
    p_accommodation_notes text DEFAULT NULL
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
    -- イベント行をロック（同時実行を防ぐ）
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

    -- 現在公開中のキャンセル・返金規定を確定
    SELECT id, version INTO v_cancellation_policy_id, v_cancellation_version
    FROM policies
    WHERE event_id = p_event_id AND type = 'cancellation' AND status = 'published';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'policy_missing', 'policy_type', 'cancellation');
    END IF;

    -- 現在公開中の免責事項を確定
    SELECT id, version INTO v_disclaimer_policy_id, v_disclaimer_version
    FROM policies
    WHERE event_id = p_event_id AND type = 'disclaimer' AND status = 'published';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'policy_missing', 'policy_type', 'disclaimer');
    END IF;

    INSERT INTO camp_applications (
        event_id, name, phone, university, student_id, campus, grade, birthday, hometown,
        allergy_status, allergy_details, dietary_religious, dietary_restrictions, accommodation_notes,
        cancellation_policy_id, cancellation_policy_version, cancellation_agreed_at,
        disclaimer_policy_id, disclaimer_version, disclaimer_agreed_at
    )
    VALUES (
        p_event_id, p_name, p_phone, p_university, p_student_id, p_campus, p_grade, p_birthday, p_hometown,
        p_allergy_status, p_allergy_details, p_dietary_religious, p_dietary_restrictions, p_accommodation_notes,
        v_cancellation_policy_id, v_cancellation_version, now(),
        v_disclaimer_policy_id, v_disclaimer_version, now()
    )
    RETURNING id INTO v_application_id;

    RETURN jsonb_build_object('ok', true, 'application_id', v_application_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_camp(
    bigint, text, text, text, text, text, date, text, text, text, text, text, text, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.register_for_camp(
    bigint, text, text, text, text, text, date, text, text, text, text, text, text, text
) TO authenticated;

-- 7) register_for_event_v2 に registration_type ガードを追加
-- 合宿イベント(registration_type = 'camp')が標準登録フローから誤って
-- 申し込めてしまわないようにする（関数の既存ロジックはそのまま維持）。
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
    v_registration_type text;
    v_capacity integer;
    v_registration_deadline date;
    v_current_count integer;
    v_registration_id uuid;
BEGIN
    SELECT registration_type, capacity, registration_deadline
    INTO v_registration_type, v_capacity, v_registration_deadline
    FROM events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    IF v_registration_type <> 'standard' THEN
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
