//理解済み
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../contexts/LangContext";
import { getEventRegistrationCount } from "../lib/eventHelpers";
import { formatDeadlineDate, isRegistrationClosed } from "../lib/deadline";
import { supabase } from "../lib/supabase";
//lucide-reactはアイコン用の外部ライブラリ
import { CalendarDays, MapPin } from "lucide-react";

function pickLang(lang, en, ja) {
  //return lang === "ja" && (ja ? ja : en);ではないので注意
  return (lang === "ja" && ja) ? ja : en;
}

function coverUrl(cover_path) {
  if (!cover_path) return "";
  const { data } = supabase.storage.from("event-covers").getPublicUrl(cover_path);
  //||に関して、&&と逆やなと思ってる。左がtrueなら左を返すfalseなら右を返す
  return data?.publicUrl || "";
}

function formatDateOnly(lang, iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export default function Card({ e }) {
  const { lang } = useLang();
  const title = pickLang(lang, e.title_en, e.title_ja);
  const desc = pickLang(lang, e.description_en, e.description_ja);
  const img = coverUrl(e.cover_path);

  const isEnded = useMemo(() => {
    const start = new Date(e.starts_at);
    if (Number.isNaN(start.getTime())) return false;
    //Date()で引数なしの時は今この瞬間の日時を表す
    //return start < new Date()はbooleanでtrueかfalseを返す。
    return start < new Date();
  }, [e.starts_at]);

  const capacity = e.capacity ?? null;

  const [regCount, setRegCount] = useState(null);
  const [countErr, setCountErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCountErr(false);
    setRegCount(null);

    if (!e?.id || isEnded) return;
    if (capacity === null) return;

    (async () => {
      const { count, error } = await getEventRegistrationCount(e.id);

      if (cancelled) return;

      if (error) {
        console.warn("[Card] failed to fetch registration count:", error);
        setCountErr(true);
        return;
      }

      setRegCount(count ?? 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [e?.id, isEnded, capacity]);

  const dateText = formatDateOnly(lang, e.starts_at);
  const deadlineText = formatDeadlineDate(lang, e.registration_deadline);
  const isClosed = isRegistrationClosed(e.registration_deadline);

  const status = useMemo(() => {
    if (isEnded) {
      return {
        label: lang === "ja" ? "終了" : "Ended",
        pillClass: "bg-blue-100 text-blue-700 border border-blue-200",
        accent: "blue",
      };
    }

    if (isClosed) {
      return {
        label: lang === "ja" ? "申込締切済み" : "Closed",
        pillClass: "bg-amber-100 text-amber-800 border border-amber-200",
        accent: "green",
      };
    }

    if (capacity === null) {
      return {
        label: lang === "ja" ? "受付中" : "Open",
        pillClass: "bg-green-100 text-green-700 border border-green-200",
        accent: "green",
      };
    }

    if (regCount === null) {
      return {
        label: countErr
          ? (lang === "ja" ? "席数未取得" : "Seats unknown")
          : (lang === "ja" ? "席数確認中" : "Checking seats"),
        pillClass: "bg-slate-100 text-slate-700 border border-slate-200",
        accent: "green",
      };
    }
//バグ回避のためにMath.max()を用いかつ引数に0を含めている。
    const remaining = Math.max(capacity - regCount, 0);

    if (remaining <= 0) {
      return {
        label: lang === "ja" ? "満員" : "Full",
        pillClass: "bg-red-100 text-red-700 border border-red-200",
        accent: "green",
      };
    }

    return {
      label: lang === "ja" ? `残り${remaining}席` : `${remaining} seats left`,
      pillClass: "bg-green-100 text-green-700 border border-green-200",
      accent: "green",
    };
  }, [isEnded, isClosed, capacity, regCount, countErr, lang]);

  const buttonClass = "bg-green-600 hover:bg-green-700 focus-visible:ring-green-600";
//return以下は問題ない
  return (
    <Link
      to={`/events/${e.slug}`}
      className="group block overflow-hidden rounded-3xl bg-white shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/70 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
    >
      <div className="relative w-full aspect-video bg-slate-100 overflow-hidden">
        {img ? (
          <img
            src={img}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm font-semibold text-slate-500">
            No Image
          </div>
        )}
      </div>

      <div className="p-6">
        <div className="mb-4">
          <span className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-bold ${status.pillClass}`}>
            {status.label}
          </span>
        </div>

        <h3 className="text-2xl font-black tracking-tight text-slate-900">
          {title}
        </h3>

        {desc && (
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            {desc.length > 90 ? desc.slice(0, 90) + "…" : desc}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-base font-semibold text-slate-700">
          {dateText && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-slate-500" />
              <span>{dateText}</span>
            </div>
          )}
          {e.location && (
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-5 w-5 text-slate-500" />
              <span className="truncate">{e.location}</span>
            </div>
          )}
          {deadlineText && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-slate-500" />
              <span>
                {lang === "ja" ? "締切: " : "Deadline: "}
                {deadlineText}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6">
          <span
            className={`pointer-events-none inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-lg font-black text-white shadow-sm transition-colors ${buttonClass}`}
          >
            {lang === "ja" ? "詳細を見る" : "View details"}
          </span>
        </div>
      </div>
    </Link>
  );
}
