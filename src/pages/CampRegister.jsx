import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useLang } from "../contexts/langCore";
import { getCampApplicationCount, getCampApplicationBreakdown } from "../lib/eventHelpers";
import { formatDeadlineDate, isRegistrationClosed } from "../lib/deadline";
import { formatEventDate, getTokyoDateString, isPastEventDate } from "../lib/dateOnly";
import {
  campusOptions,
  gradeOptions,
  universityOptions,
  allergyStatusOptions,
  nationalityOptions,
  genderOptions,
} from "../lib/formOptions";
import { Badge, Button, Panel, Alert, Input, Select, Textarea, Checkbox, Modal } from "../components/ui";
import { ArrowLeft, CalendarDays, MapPin, CheckCircle2 } from "lucide-react";

function pickLang(lang, en, ja) {
  return lang === "ja" && ja ? ja : en;
}

export default function CampRegister() {
  const { slug } = useParams();
  const { lang } = useLang();

  const [event, setEvent] = useState(null);
  const [currentCount, setCurrentCount] = useState(0);
  const [japaneseCount, setJapaneseCount] = useState(0);
  const [internationalCount, setInternationalCount] = useState(0);
  const [countLoading, setCountLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [cancellationPolicy, setCancellationPolicy] = useState(null);
  const [disclaimerPolicy, setDisclaimerPolicy] = useState(null);
  const [policiesLoading, setPoliciesLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [university, setUniversity] = useState("");
  const [studentId, setStudentId] = useState("");
  const [campus, setCampus] = useState("");
  const [grade, setGrade] = useState("");
  const [birthday, setBirthday] = useState("");
  const [hometown, setHometown] = useState("");
  const [participantType, setParticipantType] = useState("");

  const [gender, setGender] = useState("");
  const [allergyStatus, setAllergyStatus] = useState("");
  const [allergyDetails, setAllergyDetails] = useState("");
  const [dietaryReligious, setDietaryReligious] = useState("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState("");
  const [accommodationNotes, setAccommodationNotes] = useState("");

  const [cancellationModalOpen, setCancellationModalOpen] = useState(false);
  const [disclaimerModalOpen, setDisclaimerModalOpen] = useState(false);
  const [cancellationViewed, setCancellationViewed] = useState(false);
  const [disclaimerViewed, setDisclaimerViewed] = useState(false);
  const [cancellationAgreed, setCancellationAgreed] = useState(false);
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);

  useEffect(() => {
    if (success || error) {
      window.scrollTo(0, 0);
    }
  }, [success, error]);

  const loadEventSnapshot = useCallback(async () => {
    const { data: eventData } = await supabase
      .from("events")
      .select(
        "id,slug,title_en,title_ja,starts_at,registration_deadline,location,capacity,registration_type,capacity_by_nationality,capacity_japanese,capacity_international"
      )
      .eq("slug", slug)
      .maybeSingle();

    if (!eventData) {
      return { event: null, currentCount: 0, japaneseCount: 0, internationalCount: 0 };
    }

    if (eventData.capacity_by_nationality) {
      const { total, japanese, international, error } = await getCampApplicationBreakdown(eventData.id);

      if (error) {
        console.warn("[CampRegister] failed to fetch application breakdown:", error);
        return {
          event: eventData,
          currentCount: (eventData.capacity_japanese ?? 0) + (eventData.capacity_international ?? 0),
          japaneseCount: eventData.capacity_japanese ?? 0,
          internationalCount: eventData.capacity_international ?? 0,
        };
      }

      return {
        event: eventData,
        currentCount: total ?? 0,
        japaneseCount: japanese ?? 0,
        internationalCount: international ?? 0,
      };
    }

    const { count, error: countError } = await getCampApplicationCount(eventData.id);

    if (countError) {
      console.warn("[CampRegister] failed to fetch application count:", countError);
      return { event: eventData, currentCount: eventData.capacity ?? 0, japaneseCount: 0, internationalCount: 0 };
    }

    return { event: eventData, currentCount: count ?? 0, japaneseCount: 0, internationalCount: 0 };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const snapshot = await loadEventSnapshot();
      if (cancelled) return;

      setEvent(snapshot.event);
      setCurrentCount(snapshot.currentCount);
      setJapaneseCount(snapshot.japaneseCount);
      setInternationalCount(snapshot.internationalCount);
      setCountLoading(false);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadEventSnapshot]);

  // 現在公開中の規約本文を取得（anonはstatus='published'のみ閲覧可）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!event?.id) return;
      setPoliciesLoading(true);

      const [cancellationRes, disclaimerRes] = await Promise.all([
        supabase
          .from("policies")
          .select("id,title,content,version")
          .eq("event_id", event.id)
          .eq("type", "cancellation")
          .eq("status", "published")
          .maybeSingle(),
        supabase
          .from("policies")
          .select("id,title,content,version")
          .eq("event_id", event.id)
          .eq("type", "disclaimer")
          .eq("status", "published")
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setCancellationPolicy(cancellationRes.data ?? null);
      setDisclaimerPolicy(disclaimerRes.data ?? null);
      setPoliciesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [event?.id]);

  const isByNationality = !!event?.capacity_by_nationality;

  const isFull = useMemo(() => {
    if (countLoading) return true;
    if (isByNationality) {
      const jFull = event?.capacity_japanese !== null && event?.capacity_japanese !== undefined && japaneseCount >= event.capacity_japanese;
      const iFull = event?.capacity_international !== null && event?.capacity_international !== undefined && internationalCount >= event.capacity_international;
      return jFull && iFull;
    }
    if (event?.capacity === null) return false;
    return currentCount >= event?.capacity;
  }, [countLoading, isByNationality, event?.capacity, event?.capacity_japanese, event?.capacity_international, currentCount, japaneseCount, internationalCount]);

  const japaneseFull = isByNationality && event?.capacity_japanese !== null && event?.capacity_japanese !== undefined && japaneseCount >= event.capacity_japanese;
  const internationalFull = isByNationality && event?.capacity_international !== null && event?.capacity_international !== undefined && internationalCount >= event.capacity_international;

  const isClosed = isRegistrationClosed(event?.registration_deadline);
  const isEnded = event?.starts_at ? isPastEventDate(event.starts_at) : false;
  const today = getTokyoDateString();

  const policiesMissing = !policiesLoading && (!cancellationPolicy || !disclaimerPolicy);

  const validate = () => {
    if (!name.trim()) {
      setError(lang === "ja" ? "氏名を入力してください" : "Please enter your name");
      return false;
    }
    if (name.trim().length > 100) {
      setError(lang === "ja" ? "氏名は100文字以内で入力してください" : "Name must be 100 characters or less");
      return false;
    }
    if (!phone.trim()) {
      setError(lang === "ja" ? "電話番号を入力してください" : "Please enter your phone number");
      return false;
    }
    if (!university) {
      setError(lang === "ja" ? "所属大学を選択してください" : "Please select your university");
      return false;
    }
    if (university === "doshisha") {
      if (!studentId.trim()) {
        setError(lang === "ja" ? "学籍番号を入力してください" : "Please enter your student number");
        return false;
      }
      if (!/^[0-9]+$/.test(studentId.trim())) {
        setError(lang === "ja" ? "学籍番号は半角数字で入力してください" : "Please enter your student number using half-width digits only");
        return false;
      }
    }
    if (!campus) {
      setError(lang === "ja" ? "キャンパスを選択してください" : "Please select a campus");
      return false;
    }
    if (!grade) {
      setError(lang === "ja" ? "学年を選択してください" : "Please select your grade");
      return false;
    }
    if (!birthday) {
      setError(lang === "ja" ? "誕生日を入力してください" : "Please enter your birthday");
      return false;
    }
    if (birthday > today) {
      setError(lang === "ja" ? "誕生日を確認してください" : "Please check your birthday");
      return false;
    }
    if (!hometown.trim()) {
      setError(lang === "ja" ? "出身地を入力してください" : "Please enter your hometown");
      return false;
    }
    if (!allergyStatus) {
      setError(lang === "ja" ? "アレルギーの有無を選択してください" : "Please select your allergy status");
      return false;
    }
    if (allergyStatus === "has" && !allergyDetails.trim()) {
      setError(lang === "ja" ? "アレルギーの詳細を入力してください" : "Please describe your allergy");
      return false;
    }
    if (isByNationality) {
      if (!participantType) {
        setError(lang === "ja" ? "日本人／留学生を選択してください" : "Please select Japanese or International Student");
        return false;
      }
      if (participantType === "japanese" && japaneseFull) {
        setError(lang === "ja" ? "申し訳ありません。日本人枠は定員に達しました。" : "Sorry, the Japanese-participant slots are full.");
        return false;
      }
      if (participantType === "international" && internationalFull) {
        setError(lang === "ja" ? "申し訳ありません。留学生枠は定員に達しました。" : "Sorry, the international-student slots are full.");
        return false;
      }
    }
    if (!cancellationAgreed) {
      setError(lang === "ja" ? "キャンセル・返金規定への同意が必要です" : "You must agree to the cancellation policy");
      return false;
    }
    if (!disclaimerAgreed) {
      setError(lang === "ja" ? "注意事項・免責事項への同意が必要です" : "You must agree to the disclaimer");
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
    if (policiesMissing) {
      setError(lang === "ja" ? "現在、規約が公開されていないため申込みできません。運営にお問い合わせください。" : "Registration is unavailable because the policies have not been published yet.");
      return;
    }

    setSubmitting(true);

    const basePayload = {
      p_event_id: event.id,
      p_name: name.trim(),
      p_phone: phone.trim(),
      p_university: university,
      p_campus: campus,
      p_grade: grade,
      p_birthday: birthday,
      p_hometown: hometown.trim(),
      p_allergy_status: allergyStatus,
      p_student_id: studentId.trim() || null,
      p_allergy_details: allergyStatus === "has" ? allergyDetails.trim() : null,
      p_dietary_religious: dietaryReligious.trim() || null,
      p_dietary_restrictions: dietaryRestrictions.trim() || null,
      p_accommodation_notes: accommodationNotes.trim() || null,
      p_gender: gender || null,
    };

    const { data, error: rpcError } = isByNationality
      ? await supabase.rpc("register_for_camp_v2", { ...basePayload, p_participant_type: participantType })
      : await supabase.rpc("register_for_camp", basePayload);

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    if (!data.ok) {
      if (data.reason === "full") {
        setError(
          isByNationality
            ? (lang === "ja"
                ? `申し訳ありません。${participantType === "japanese" ? "日本人" : "留学生"}枠は定員に達しました。`
                : `Sorry, the ${participantType === "japanese" ? "Japanese-participant" : "international-student"} slots are full.`)
            : (lang === "ja" ? "申し訳ありません。定員に達しました。" : "Sorry, this camp is now full.")
        );
        const snapshot = await loadEventSnapshot();
        setCurrentCount(snapshot.currentCount);
        setJapaneseCount(snapshot.japaneseCount);
        setInternationalCount(snapshot.internationalCount);
      } else if (data.reason === "closed") {
        setError(lang === "ja" ? "申込締切日を過ぎたため、参加登録を受け付けていません。" : "Registration is closed for this event.");
      } else if (data.reason === "policy_missing") {
        setError(lang === "ja" ? "規約が公開されていないため申込みできません。運営にお問い合わせください。" : "Registration is unavailable because the policies have not been published yet.");
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
  const dateText = formatEventDate(lang, event.starts_at, { full: true });
  const deadlineText = formatDeadlineDate(lang, event.registration_deadline);

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Panel className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            {lang === "ja" ? "申し込みが完了しました！" : "Application Complete!"}
          </h2>
          <p className="mt-2 text-slate-600">
            {lang === "ja"
              ? `${title}への申し込みを受け付けました。当日お会いできることを楽しみにしています！`
              : `Your application for ${title} has been received. We look forward to seeing you!`}
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
        {lang === "ja" ? "合宿申し込み" : "Camp Application"}
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
        {isByNationality ? (
          countLoading ? (
            <Badge variant="neutral">
              {lang === "ja" ? "席数確認中..." : "Checking seats..."}
            </Badge>
          ) : (
            <>
              <Badge variant={japaneseFull ? "error" : "info"}>
                {lang === "ja" ? "日本人" : "Japanese"}: {japaneseCount} / {event.capacity_japanese ?? "∞"}
                {japaneseFull && (lang === "ja" ? "（満員）" : " (Full)")}
              </Badge>
              <Badge variant={internationalFull ? "error" : "info"}>
                {lang === "ja" ? "留学生" : "International"}: {internationalCount} / {event.capacity_international ?? "∞"}
                {internationalFull && (lang === "ja" ? "（満員）" : " (Full)")}
              </Badge>
            </>
          )
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="mt-6">
        {isEnded ? (
          <Alert variant="info">
            {lang === "ja" ? "このイベントは終了しました。" : "This event has ended."}
          </Alert>
        ) : isClosed ? (
          <Alert variant="warning">
            {lang === "ja" ? "申込締切日を過ぎたため、参加登録を受け付けていません。" : "Registration is closed for this event."}
          </Alert>
        ) : countLoading || policiesLoading ? (
          <Alert variant="info">
            {lang === "ja" ? "読み込み中です。しばらくお待ちください..." : "Loading. Please wait..."}
          </Alert>
        ) : isFull ? (
          <Alert variant="error">
            {lang === "ja"
              ? "申し訳ありませんが、定員に達したため参加登録を受け付けていません。"
              : "Sorry, we are no longer accepting registrations as this camp has reached its capacity."}
          </Alert>
        ) : policiesMissing ? (
          <Alert variant="error">
            {lang === "ja"
              ? "現在、規約が公開されていないため申込みできません。運営にお問い合わせください。"
              : "Registration is unavailable because the policies have not been published yet."}
          </Alert>
        ) : (
          <form onSubmit={handleSubmit}>
            <Panel className="p-6">
              {error && <Alert variant="error" className="mb-4">{error}</Alert>}

              <div className="grid gap-5">
                <Input
                  label={lang === "ja" ? "氏名" : "Name"}
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

                {isByNationality && (
                  <Select
                    label={lang === "ja" ? "日本人／留学生" : "Japanese / International Student"}
                    required
                    value={participantType}
                    onChange={setParticipantType}
                    placeholder={lang === "ja" ? "選択してください" : "Select..."}
                    options={nationalityOptions.map((o) => ({
                      value: o.value,
                      label: `${lang === "ja" ? o.label : o.labelEn}${
                        (o.value === "japanese" && japaneseFull) || (o.value === "international" && internationalFull)
                          ? (lang === "ja" ? "（満員）" : " (Full)")
                          : ""
                      }`,
                    }))}
                  />
                )}

                <Select
                  label={lang === "ja" ? "所属大学" : "University"}
                  required
                  value={university}
                  onChange={setUniversity}
                  placeholder={lang === "ja" ? "選択してください" : "Select..."}
                  options={universityOptions.map((o) => ({ value: o.value, label: lang === "ja" ? o.label : o.labelEn }))}
                />

                <Input
                  label={lang === "ja" ? "学籍番号" : "Student Number"}
                  required={university === "doshisha"}
                  value={studentId}
                  onChange={(v) => setStudentId(v.replace(/[^0-9]/g, ""))}
                  maxLength={20}
                  placeholder={lang === "ja" ? "半角数字で入力" : "Digits only"}
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
                  label={lang === "ja" ? "学年" : "Grade"}
                  required
                  value={grade}
                  onChange={setGrade}
                  placeholder={lang === "ja" ? "選択してください" : "Select..."}
                  options={gradeOptions.map((o) => ({ value: o.value, label: lang === "ja" ? o.label : o.labelEn }))}
                />

                <Input
                  label={lang === "ja" ? "誕生日" : "Birthday"}
                  required
                  type="date"
                  value={birthday}
                  onChange={setBirthday}
                  max={today}
                />

                <Input
                  label={lang === "ja" ? "出身地" : "Hometown"}
                  required
                  value={hometown}
                  onChange={setHometown}
                  maxLength={100}
                  placeholder={lang === "ja" ? "東京都" : "Tokyo, Japan"}
                />

                <div className="border-t-2 border-slate-100 pt-5">
                  <h2 className="mb-4 text-lg font-black text-slate-900">
                    {lang === "ja" ? "宿泊・食事について" : "Accommodation & Meals"}
                  </h2>

                  <div className="grid gap-5">
                    <div>
                      <Select
                        label={lang === "ja" ? "性別" : "Gender"}
                        value={gender}
                        onChange={setGender}
                        placeholder={lang === "ja" ? "選択してください" : "Select..."}
                        options={genderOptions.map((o) => ({ value: o.value, label: lang === "ja" ? o.label : o.labelEn }))}
                      />
                      <p className="mt-1.5 text-xs text-slate-500">
                        {lang === "ja"
                          ? "合宿の部屋割りで必要なのでご協力ください。"
                          : "This helps us arrange room assignments for the camp."}
                      </p>
                    </div>

                    <Select
                      label={lang === "ja" ? "アレルギーの有無" : "Allergies"}
                      required
                      value={allergyStatus}
                      onChange={setAllergyStatus}
                      placeholder={lang === "ja" ? "選択してください" : "Select..."}
                      options={allergyStatusOptions.map((o) => ({ value: o.value, label: lang === "ja" ? o.label : o.labelEn }))}
                    />

                    {allergyStatus === "has" && (
                      <Textarea
                        label={lang === "ja" ? "アレルギー詳細" : "Allergy Details"}
                        required
                        value={allergyDetails}
                        onChange={setAllergyDetails}
                        maxLength={500}
                        placeholder={lang === "ja" ? "卵、そば 等" : "e.g. eggs, buckwheat"}
                      />
                    )}

                    <Textarea
                      label={lang === "ja" ? "宗教・文化上食べられないもの" : "Religious / cultural dietary restrictions"}
                      value={dietaryReligious}
                      onChange={setDietaryReligious}
                      maxLength={500}
                    />

                    <Textarea
                      label={lang === "ja" ? "ベジタリアン等の食事制限" : "Vegetarian / other dietary restrictions"}
                      value={dietaryRestrictions}
                      onChange={setDietaryRestrictions}
                      maxLength={500}
                    />

                    <Textarea
                      label={lang === "ja" ? "宿泊・参加上、運営に事前共有したい事項" : "Anything else the organizers should know"}
                      value={accommodationNotes}
                      onChange={setAccommodationNotes}
                      maxLength={500}
                    />
                  </div>
                </div>

                <div className="border-t-2 border-slate-100 pt-5">
                  <h2 className="mb-4 text-lg font-black text-slate-900">
                    {lang === "ja" ? "キャンセル・返金規定" : "Cancellation Policy"}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {lang === "ja"
                      ? "申込後のキャンセルには、時期に応じてキャンセル料が発生する場合があります。"
                      : "Depending on the timing, a cancellation fee may apply after you apply."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      setCancellationModalOpen(true);
                      setCancellationViewed(true);
                    }}
                  >
                    {lang === "ja" ? "キャンセル・返金規定を確認する" : "View cancellation policy"}
                  </Button>

                  <Checkbox
                    className="mt-3"
                    label={lang === "ja" ? "キャンセル・返金規定を確認し、同意します" : "I have read and agree to the cancellation policy"}
                    checked={cancellationAgreed}
                    onChange={setCancellationAgreed}
                    required
                    disabled={!cancellationViewed}
                  />
                  {!cancellationViewed && (
                    <p className="mt-1 text-xs text-slate-500">
                      {lang === "ja" ? "上のボタンから規定を確認すると同意できます。" : "Open the policy above to enable this checkbox."}
                    </p>
                  )}
                </div>

                <div className="border-t-2 border-slate-100 pt-5">
                  <h2 className="mb-4 text-lg font-black text-slate-900">
                    {lang === "ja" ? "参加にあたっての注意事項・責任範囲" : "Terms & Disclaimer"}
                  </h2>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDisclaimerModalOpen(true);
                      setDisclaimerViewed(true);
                    }}
                  >
                    {lang === "ja" ? "注意事項・免責事項を確認する" : "View terms & disclaimer"}
                  </Button>

                  <Checkbox
                    className="mt-3"
                    label={lang === "ja" ? "注意事項・免責事項を確認し、同意します" : "I have read and agree to the terms & disclaimer"}
                    checked={disclaimerAgreed}
                    onChange={setDisclaimerAgreed}
                    required
                    disabled={!disclaimerViewed}
                  />
                  {!disclaimerViewed && (
                    <p className="mt-1 text-xs text-slate-500">
                      {lang === "ja" ? "上のボタンから内容を確認すると同意できます。" : "Open the terms above to enable this checkbox."}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={submitting || !cancellationAgreed || !disclaimerAgreed}
                >
                  {submitting
                    ? (lang === "ja" ? "送信中..." : "Submitting...")
                    : (lang === "ja" ? "申し込む" : "Apply")}
                </Button>
              </div>
            </Panel>
          </form>
        )}
      </div>

      <Modal
        open={cancellationModalOpen}
        onClose={() => setCancellationModalOpen(false)}
        title={cancellationPolicy?.title || (lang === "ja" ? "キャンセル・返金規定" : "Cancellation Policy")}
      >
        {cancellationPolicy?.content || ""}
      </Modal>

      <Modal
        open={disclaimerModalOpen}
        onClose={() => setDisclaimerModalOpen(false)}
        title={disclaimerPolicy?.title || (lang === "ja" ? "注意事項・免責事項" : "Terms & Disclaimer")}
      >
        {disclaimerPolicy?.content || ""}
      </Modal>
    </div>
  );
}
