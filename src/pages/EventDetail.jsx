//他のコードと基本同じ
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useLang } from "../contexts/LangContext";
import { getEventRegistrationCount } from "../lib/eventHelpers";
import { formatDeadlineDate, isRegistrationClosed } from "../lib/deadline";
import { CalendarDays, MapPin, Users, ArrowLeft } from "lucide-react";

function coverUrl(cover_path) {
  if (!cover_path) return "";
  const { data } = supabase.storage.from("event-covers").getPublicUrl(cover_path);
  return data?.publicUrl || "";
}

function formatDateTime(lang, iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // 画像に寄せて「2024/4/15 18:00:00」風
  return d.toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function EventDetail() {
  const { slug } = useParams();
  const { lang } = useLang();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  const [count, setCount] = useState(null); // 参加者数
  const [countLoading, setCountLoading] = useState(false);
  const [countErr, setCountErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("events")
        // ★ count取得に event.id が必要
        .select(
          "id,slug,starts_at,registration_deadline,location,cover_path,title_en,title_ja,description_en,description_ja,capacity"
        )
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setEvent(null);
        setLoading(false);
        return;
      }

      setEvent(data ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // 参加者数を取得（capacity が null の場合は不要）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCountErr("");
      setCount(null);

      if (!event?.id) return;
      if (event.capacity === null) return;

      setCountLoading(true);

      const { count: c, error } = await getEventRegistrationCount(event.id);

      if (cancelled) return;

      setCountLoading(false);

      if (error) {
        console.warn("[EventDetail] failed to fetch registration count:", error);
        setCountErr(error);
        return;
      }
      setCount(c ?? 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [event?.id, event?.capacity]);

  const isEnded = (() => {
    if (!event?.starts_at) return false;
    const start = new Date(event.starts_at);
    if (Number.isNaN(start.getTime())) return false;
    return start < new Date();
  })();

  const img = event?.cover_path ? coverUrl(event.cover_path) : "";
  const dateText = event?.starts_at ? formatDateTime(lang, event.starts_at) : "";
  const deadlineText = formatDeadlineDate(lang, event?.registration_deadline);
  const isClosed = isRegistrationClosed(event?.registration_deadline);

  const titleMain =
    lang === "ja" ? (event?.title_ja || event?.title_en) : (event?.title_en || event?.title_ja);
  const titleSub =
    lang === "ja" ? event?.title_en : event?.title_ja;

  const descJa = event?.description_ja || "";
  const descEn = event?.description_en || "";

  const status = useMemo(() => {
    if (!event) return null;

    if (isEnded) {
      return {
        label: lang === "ja" ? "終了" : "Ended",
        pill: "bg-blue-100 text-blue-700 border border-blue-200",
        button: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600",
        disableRegister: true,
      };
    }

    if (isClosed) {
      return {
        label: lang === "ja" ? "申込締切済み" : "Closed",
        pill: "bg-amber-100 text-amber-800 border border-amber-200",
        button: "bg-green-600 hover:bg-green-700 focus-visible:ring-green-600",
        disableRegister: true,
        reason: "closed",
      };
    }

    if (event.capacity === null) {
      return {
        label: lang === "ja" ? "受付中" : "Open",
        pill: "bg-green-100 text-green-700 border border-green-200",
        button: "bg-green-600 hover:bg-green-700 focus-visible:ring-green-600",
        disableRegister: false,
        reason: "open",
      };
    }

    // capacity あり
    if (countLoading || count === null) {
      return {
        label: lang === "ja" ? "席数確認中" : "Checking seats",
        pill: "bg-slate-100 text-slate-700 border border-slate-200",
        button: "bg-green-600 hover:bg-green-700 focus-visible:ring-green-600",
        disableRegister: true, // 数が確定するまで押せないように
        reason: "checking",
      };
    }

    const remaining = Math.max(event.capacity - count, 0);

    if (remaining <= 0) {
      return {
        label: lang === "ja" ? "満員" : "Full",
        pill: "bg-red-100 text-red-700 border border-red-200",
        button: "bg-green-600 hover:bg-green-700 focus-visible:ring-green-600",
        disableRegister: true,
        reason: "full",
      };
    }

    return {
      label: lang === "ja" ? `残り${remaining}席` : `${remaining} seats left`,
      pill: "bg-green-100 text-green-700 border border-green-200",
      button: "bg-green-600 hover:bg-green-700 focus-visible:ring-green-600",
      disableRegister: false,
      reason: "open",
    };
  }, [event, isEnded, isClosed, lang, countLoading, count]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-slate-600">
        Loading...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-slate-800 font-bold text-xl">
          {lang === "ja" ? "イベントが見つかりません" : "Event not found"}
        </p>
        <p className="mt-2 text-slate-600">
          {lang === "ja" ? "URLを確認してください。" : "Please check the URL."}
        </p>
        <Link
          to="/events"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-700"
        >
          {lang === "ja" ? "イベント一覧へ" : "Back to events"}
        </Link>
      </div>
    );
  }

  const capacityText =
    event.capacity === null
      ? "-"
      : (countLoading || count === null)
        ? (lang === "ja" ? "確認中…" : "Loading…")
        : `${count} / ${event.capacity}名`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
      {/* Back */}
      <div className="pt-8">
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {lang === "ja" ? "イベント一覧に戻る" : "Back to events"}
        </Link>
      </div>

      {/* Cover image (タイトルの上に表示) */}
      <div className="mt-6 overflow-hidden rounded-3xl bg-slate-100 ring-1 ring-slate-200/70">
        <div className="relative aspect-video w-full">
          {img ? (
            <img
              src={img}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-500">
              No Image
            </div>
          )}
        </div>
      </div>

      {/* Status + Title */}
      <div className="mt-6">
        {status && (
          <div className="mb-4">
            <span className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-bold ${status.pill}`}>
              {status.label}
            </span>
          </div>
        )}

        <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
          {titleMain}
        </h1>

        {titleSub && (
          <p className="mt-2 text-lg font-semibold text-slate-500">
            {titleSub}
          </p>
        )}
      </div>

      {/* Info panel (日時/場所/定員) */}
      <div className="mt-6 rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200/70">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* 開催日時 */}
          <div>
            <p className="text-sm font-bold text-slate-500">
              {lang === "ja" ? "開催日時" : "Date & Time"}
            </p>
            <div className="mt-2 flex items-center gap-3 text-slate-900">
              <CalendarDays className="h-5 w-5 text-green-600" />
              <p className="font-bold">{dateText}</p>
            </div>
          </div>

          {/* 場所 */}
          <div>
            <p className="text-sm font-bold text-slate-500">
              {lang === "ja" ? "場所" : "Location"}
            </p>
            <div className="mt-2 flex items-center gap-3 text-slate-900">
              <MapPin className="h-5 w-5 text-green-600" />
              <p className="font-bold">{event.location || "-"}</p>
            </div>
          </div>

          {/* 申込締切 */}
          {deadlineText && (
            <div>
              <p className="text-sm font-bold text-slate-500">
                {lang === "ja" ? "申込締切" : "Registration Deadline"}
              </p>
              <div className="mt-2 flex items-center gap-3 text-slate-900">
                <CalendarDays className="h-5 w-5 text-green-600" />
                <p className="font-bold">{deadlineText}</p>
              </div>
            </div>
          )}

          {/* 定員 */}
          {event.capacity !== null && (
            <div>
              <p className="text-sm font-bold text-slate-500">
                {lang === "ja" ? "定員" : "Capacity"}
              </p>
              <div className="mt-2 flex items-center gap-3 text-slate-900">
                <Users className="h-5 w-5 text-green-600" />
                <p className="font-bold">{capacityText}</p>
              </div>
              {countErr && (
                <p className="mt-2 text-sm text-red-600">{countErr}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="mt-10">
        <h2 className="text-2xl font-black text-slate-900">
          {lang === "ja" ? "イベント詳細" : "Event Details"}
        </h2>

        <div className="mt-4 space-y-4 text-slate-700">
          {lang === "ja" ? <p className="whitespace-pre-wrap leading-relaxed">
            {descJa}
          </p> : <p className="whitespace-pre-wrap leading-relaxed text-slate-600">
            {descEn}
          </p> }
        </div>

        <div className="mt-4 space-y-4 text-slate-700">

          {!descJa && !descEn && (
            <p className="text-slate-500">
              {lang === "ja" ? "詳細は準備中です。" : "Details coming soon."}
            </p>
          )}
        </div>
      </div>

      {/* Register button */}
      <div className="mt-10">
        <Link
          to={status?.disableRegister ? "#" : `/events/${event.slug}/register`}
          onClick={(e) => {
            if (status?.disableRegister) e.preventDefault();
          }}
          className={[
            "inline-flex w-full items-center justify-center rounded-2xl px-6 py-5 text-lg font-black text-white shadow-sm transition-colors",
            status?.disableRegister
              ? "bg-slate-300 cursor-not-allowed"
              : status?.button || "bg-green-600 hover:bg-green-700",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          ].join(" ")}
        >
          {lang === "ja" ? "このイベントに参加する" : "Join this event"}
        </Link>

        {status?.disableRegister && (
          <p className="mt-3 text-center text-sm font-semibold text-slate-500">
            {isEnded
              ? (lang === "ja" ? "このイベントは終了しました。" : "This event has ended.")
              : status?.reason === "closed"
                ? (lang === "ja" ? "申込締切日を過ぎたため、参加登録を受け付けていません。" : "Registration is closed for this event.")
                : status?.reason === "full"
                  ? (lang === "ja" ? "定員に達したため、参加登録を受け付けていません。" : "This event is full.")
                  : (lang === "ja" ? "現在参加登録できません。" : "Registration is not available now.")}
          </p>
        )}
      </div>
    </div>
  );
}
