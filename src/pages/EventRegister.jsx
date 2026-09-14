//useCallbackが何やねんそれ状態である。
//useCallbackとuseMemoの違いについて、zennの記事にしてまとめて理解した。
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useLang } from "../contexts/LangContext";
import { getEventRegistrationCount } from "../lib/eventHelpers";
import { formatDeadlineDate, isRegistrationClosed } from "../lib/deadline";
import {
  campusOptions,
  japaneseLevelOptions,
  japaneseMotivationOptions,
  englishLevelOptions,
} from "../lib/formOptions";
import { Badge, Button, Panel, Alert, Input, Select } from "../components/ui";
import { ArrowLeft, CalendarDays, MapPin, CheckCircle2 } from "lucide-react";

function pickLang(lang, en, ja) {
  return lang === "ja" && ja ? ja : en;
}

export default function EventRegister() {
  const { slug } = useParams();
  const { lang } = useLang();

  const [event, setEvent] = useState(null);
  const [currentCount, setCurrentCount] = useState(0);
  const [countLoading, setCountLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [campus, setCampus] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hometown, setHometown] = useState("");
  const [japaneseLevel, setJapaneseLevel] = useState("");
  const [japaneseMotivation, setJapaneseMotivation] = useState("");
  const [englishLevel, setEnglishLevel] = useState("");

  // 成功・エラー画面に遷移したときにページトップにスクロール
  useEffect(() => {
    if (success || error) {
      window.scrollTo(0, 0);
    }
  }, [success, error]);

  // データ取得関数
  const fetchEventData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setCountLoading(true);

    const { data: eventData } = await supabase
      .from("events")
      .select("id,slug,title_en,title_ja,starts_at,registration_deadline,location,capacity")
      .eq("slug", slug)
      .maybeSingle();

    if (!eventData) {
      setEvent(null);
      setLoading(false);
      setCountLoading(false);
      return;
    }

    setEvent(eventData);

    // RPC 経由で参加人数を取得（エラー時は安全側に倒す）
    const { count, error } = await getEventRegistrationCount(eventData.id);

    if (error) {
      console.warn("[EventRegister] failed to fetch registration count:", error);
      // エラー時は満員扱い（安全側）
      setCurrentCount(eventData.capacity ?? 0);
    } else {
      setCurrentCount(count ?? 0);
    }
    setCountLoading(false);
    setLoading(false);
  }, [slug]);

  // 初回読み込み
  useEffect(() => {
    fetchEventData();
  }, [fetchEventData]);

  // ページにフォーカスが戻ったときにデータを再取得
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !success) {
        fetchEventData(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchEventData, success]);

  // 読み込み中またはエラー時は安全側（登録不可）
  const isFull = useMemo(() => {
    if (countLoading) return true; // 読み込み中は登録不可
    if (event?.capacity === null) return false; // 無制限
    return currentCount >= event.capacity;
  }, [countLoading, event?.capacity, currentCount]);

  const isClosed = isRegistrationClosed(event?.registration_deadline);
  const isEnded = (() => {
    if (!event?.starts_at) return false;
    const start = new Date(event.starts_at);
    if (Number.isNaN(start.getTime())) return false;
    return start < new Date();
  })();

  const validate = () => {
    if (!name.trim()) {
      setError(lang === "ja" ? "名前を入力してください" : "Please enter your name");
      return false;
    }
    if (name.trim().length > 100) {
      setError(lang === "ja" ? "名前は100文字以内で入力してください" : "Name must be 100 characters or less");
      return false;
    }
    if (!phone.trim()) {
      setError(lang === "ja" ? "電話番号を入力してください" : "Please enter your phone number");
      return false;
    }
    if (!hometown.trim()) {
      setError(lang === "ja" ? "出身地を入力してください" : "Please enter your hometown");
      return false;
    }
    if (!campus) {
      setError(lang === "ja" ? "キャンパスを選択してください" : "Please select a campus");
      return false;
    }
    if (!japaneseLevel) {
      setError(lang === "ja" ? "日本語レベルを選択してください" : "Please select your Japanese level");
      return false;
    }
    if (!japaneseMotivation) {
      setError(lang === "ja" ? "参加動機を選択してください" : "Please select your motivation");
      return false;
    }
    if (!englishLevel) {
      setError(lang === "ja" ? "英語レベルを選択してください" : "Please select your English level");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    if (isEnded) {
      setError(lang === "ja" ? "このイベントは終了しました。" : "This event has ended.");
      return;
    }
    if (isClosed) {
      setError(lang === "ja" ? "申込締切日を過ぎたため、参加登録を受け付けていません。" : "Registration is closed for this event.");
      return;
    }

    setSubmitting(true);

    const { data, error: rpcError } = await supabase.rpc("register_for_event", {
      p_event_id: event.id,
      p_campus: campus,
      p_name: name.trim(),
      p_phone: phone.trim(),
      p_hometown: hometown.trim(),
      p_japanese_level: japaneseLevel,
      p_japanese_motivation: japaneseMotivation,
      p_english_level: englishLevel,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    if (!data.ok) {
      if (data.reason === "full") {
        setError(lang === "ja" ? "申し訳ありません。定員に達しました。" : "Sorry, this event is now full.");
        setCurrentCount(event.capacity);
      } else if (data.reason === "closed") {
        setError(lang === "ja" ? "申込締切日を過ぎたため、参加登録を受け付けていません。" : "Registration is closed for this event.");
      } else if (data.reason === "invalid") {
        setError(lang === "ja" ? "イベントが見つかりません" : "Event not found");
      } else {
        setError(lang === "ja" ? "エラーが発生しました" : "An error occurred");
      }
      return;
    }

    setSuccess(true);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-slate-600">
        Loading...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Panel className="p-6 text-slate-700">
          {lang === "ja" ? "イベントが見つかりません" : "Event not found"}
          <div className="mt-4">
            <Link to="/events">
              <Button variant="outline">{lang === "ja" ? "イベント一覧に戻る" : "Back to events"}</Button>
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  const title = pickLang(lang, event.title_en, event.title_ja);
  const dateText = new Date(event.starts_at).toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const deadlineText = formatDeadlineDate(lang, event.registration_deadline);

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Panel className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            {lang === "ja" ? "参加登録が完了しました！" : "Registration Complete!"}
          </h2>
          <p className="mt-2 text-slate-600">
            {lang === "ja"
              ? `${title}への参加登録を受け付けました。当日お会いできることを楽しみにしています！`
              : `You have successfully registered for ${title}. We look forward to seeing you!`}
          </p>

          <div className="mt-6">
            <Link to={`/events/${slug}`}>
              <Button variant="outline">
                {lang === "ja" ? "イベント詳細に戻る" : "Back to event details"}
              </Button>
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link to={`/events/${slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        {lang === "ja" ? "イベント詳細に戻る" : "Back to event details"}
      </Link>

      <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
        {lang === "ja" ? "参加登録" : "Event Registration"}
      </h1>
      <p className="mt-1 text-slate-600">{title}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="neutral">
          <CalendarDays className="h-3.5 w-3.5" />
          {dateText}
        </Badge>
        {event.location && (
          <Badge variant="neutral">
            <MapPin className="h-3.5 w-3.5" />
            {event.location}
          </Badge>
        )}
        {deadlineText && (
          <Badge variant={isClosed ? "warning" : "neutral"}>
            <CalendarDays className="h-3.5 w-3.5" />
            {lang === "ja" ? "締切: " : "Deadline: "}
            {deadlineText}
          </Badge>
        )}
        {event.capacity !== null && countLoading && (
          <Badge variant="neutral">
            {lang === "ja" ? "席数確認中..." : "Checking seats..."}
          </Badge>
        )}
        {event.capacity !== null && !countLoading && (
          <Badge variant={isFull ? "error" : "info"}>
            {lang === "ja" ? "参加者" : "Registered"}: {currentCount} / {event.capacity}
            {isFull && (lang === "ja" ? "（満員）" : " (Full)")}
          </Badge>
        )}
      </div>

      <div className="mt-6">
        {isEnded ? (
          <Alert variant="info">
            {lang === "ja"
              ? "このイベントは終了しました。"
              : "This event has ended."}
          </Alert>
        ) : isClosed ? (
          <Alert variant="warning">
            {lang === "ja"
              ? "申込締切日を過ぎたため、参加登録を受け付けていません。"
              : "Registration is closed for this event."}
          </Alert>
        ) : countLoading ? (
          <Alert variant="info">
            {lang === "ja"
              ? "席数を確認中です。しばらくお待ちください..."
              : "Checking available seats. Please wait..."}
          </Alert>
        ) : isFull ? (
          <Alert variant="error">
            {lang === "ja"
              ? "申し訳ありませんが、定員に達したため参加登録を受け付けていません。"
              : "Sorry, we are no longer accepting registrations as the event has reached its capacity."}
          </Alert>
        ) : (
          <form onSubmit={handleSubmit}>
            <Panel className="p-6">
              {error && <Alert variant="error" className="mb-4">{error}</Alert>}

              <div className="grid gap-5">
                <Input
                  label={lang === "ja" ? "名前" : "Name"}
                  required
                  value={name}
                  onChange={setName}
                  maxLength={100}
                  placeholder={lang === "ja" ? "田中 太郎" : "Your name"}
                />

                <Input
                  label={lang === "ja" ? "電話番号" : "Phone Number"}
                  required
                  value={phone}
                  onChange={setPhone}
                  maxLength={20}
                  placeholder="090-1234-5678"
                />

                <Input
                  label={lang === "ja" ? "出身地" : "Hometown"}
                  required
                  value={hometown}
                  onChange={setHometown}
                  maxLength={100}
                  placeholder={lang === "ja" ? "東京都" : "Tokyo, Japan"}
                />

                <Select
                  label={lang === "ja" ? "キャンパス" : "Campus"}
                  required
                  value={campus}
                  onChange={setCampus}
                  placeholder={lang === "ja" ? "選択してください" : "Select..."}
                  options={campusOptions.map((o) => ({ value: o.value, label: lang === "ja" ? o.label : o.labelEn }))}
                />

                <Select
                  label={lang === "ja" ? "日本語レベル" : "Japanese Level"}
                  required
                  value={japaneseLevel}
                  onChange={setJapaneseLevel}
                  placeholder={lang === "ja" ? "選択してください" : "Select..."}
                  options={japaneseLevelOptions.map((o) => ({ value: o.value, label: lang === "ja" ? o.label : o.labelEn }))}
                />

                <Select
                  label={lang === "ja" ? "参加動機" : "Motivation"}
                  required
                  value={japaneseMotivation}
                  onChange={setJapaneseMotivation}
                  placeholder={lang === "ja" ? "選択してください" : "Select..."}
                  options={japaneseMotivationOptions.map((o) => ({ value: o.value, label: lang === "ja" ? o.label : o.labelEn }))}
                />

                <Select
                  label={lang === "ja" ? "英語レベル" : "English Level"}
                  required
                  value={englishLevel}
                  onChange={setEnglishLevel}
                  placeholder={lang === "ja" ? "選択してください" : "Select..."}
                  options={englishLevelOptions.map((o) => ({ value: o.value, label: lang === "ja" ? o.label : o.labelEn }))}
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={submitting}
                >
                  {submitting
                    ? (lang === "ja" ? "送信中..." : "Submitting...")
                    : (lang === "ja" ? "参加登録する" : "Register")}
                </Button>
              </div>
            </Panel>
          </form>
        )}
      </div>
    </div>
  );
}
