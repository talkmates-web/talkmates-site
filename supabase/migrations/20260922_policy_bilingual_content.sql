-- =====================================================
-- policies テーブルを英語対応にする
-- =====================================================
-- 既存の title / content は日本語用として維持し、
-- 英語表示用の title_en / content_en を追加する（両方NULL許可）。
-- 既存行・既存イベントには影響しない（NULLのままなら日本語content にフォールバック表示）。

ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS title_en text;

ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS content_en text;
