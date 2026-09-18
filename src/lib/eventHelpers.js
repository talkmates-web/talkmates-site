//理解済み sqlで定義している関数について、(get_event_registration_count)は学習の余地がある。
import { supabase } from "./supabase.js";

/**
 * イベントの参加人数を RPC 経由で取得
 * RLS をバイパスして anon でも正確な人数を取得可能
 * 個人情報（name/phone/hometown等）は絶対に返さない
 *
 * @param {number} eventId - イベントID
 * @returns {Promise<{count: number|null, error: string|null}>}
 */
export async function getEventRegistrationCount(eventId) {
  if (!eventId) {
    return { count: null, error: "Invalid event ID" };
  }

  const { data, error } = await supabase.rpc("get_event_registration_count", {
    p_event_id: eventId,
  });

  if (error) {
    return { count: null, error: error.message };
  }

  // data が null の場合はイベントが存在しない
  if (data === null) {
    return { count: null, error: "Event not found" };
  }

  return { count: data, error: null };
}

/**
 * 合宿の申込人数を RPC 経由で取得
 * RLS をバイパスして anon でも正確な人数を取得可能
 * 個人情報は絶対に返さない
 *
 * @param {number} eventId - イベントID
 * @returns {Promise<{count: number|null, error: string|null}>}
 */
export async function getCampApplicationCount(eventId) {
  if (!eventId) {
    return { count: null, error: "Invalid event ID" };
  }

  const { data, error } = await supabase.rpc("get_camp_application_count", {
    p_event_id: eventId,
  });

  if (error) {
    return { count: null, error: error.message };
  }

  if (data === null) {
    return { count: null, error: "Event not found" };
  }

  return { count: data, error: null };
}

/**
 * 属性別（日本人／留学生）の参加人数内訳を RPC 経由で取得
 * capacity_by_nationality = true のイベント専用
 * 個人情報は絶対に返さない
 *
 * @param {number} eventId - イベントID
 * @returns {Promise<{total: number|null, japanese: number|null, international: number|null, error: string|null}>}
 */
export async function getEventRegistrationBreakdown(eventId) {
  if (!eventId) {
    return { total: null, japanese: null, international: null, error: "Invalid event ID" };
  }

  const { data, error } = await supabase.rpc("get_event_registration_count_v2", {
    p_event_id: eventId,
  });

  if (error) {
    return { total: null, japanese: null, international: null, error: error.message };
  }

  if (data === null) {
    return { total: null, japanese: null, international: null, error: "Event not found" };
  }

  return { total: data.total, japanese: data.japanese, international: data.international, error: null };
}

/**
 * 属性別（日本人／留学生）の合宿申込人数内訳を RPC 経由で取得
 * capacity_by_nationality = true の合宿専用
 * 個人情報は絶対に返さない
 *
 * @param {number} eventId - イベントID
 * @returns {Promise<{total: number|null, japanese: number|null, international: number|null, error: string|null}>}
 */
export async function getCampApplicationBreakdown(eventId) {
  if (!eventId) {
    return { total: null, japanese: null, international: null, error: "Invalid event ID" };
  }

  const { data, error } = await supabase.rpc("get_camp_application_count_v2", {
    p_event_id: eventId,
  });

  if (error) {
    return { total: null, japanese: null, international: null, error: error.message };
  }

  if (data === null) {
    return { total: null, japanese: null, international: null, error: "Event not found" };
  }

  return { total: data.total, japanese: data.japanese, international: data.international, error: null };
}
