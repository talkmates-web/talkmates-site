import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDeadlineDate, isRegistrationClosed } from "../lib/deadline";
import { formatEventDate } from "../lib/dateOnly";
import {
  campusOptions,
  gradeOptions,
  universityOptions,
  allergyStatusOptions,
  nationalityOptions,
  genderOptions,
} from "../lib/formOptions";
import { Alert, Badge, Button, Panel, Input, EmptyState } from "../components/ui";
import {
  ArrowLeft,
  LogOut,
  Users,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

function getLabel(options, value) {
  const opt = options.find((o) => o.value === value);
  return opt ? opt.label : value || "-";
}

export default function AdminCampApplications() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("created_at"); // "name" | "created_at"
  const [sortOrder, setSortOrder] = useState("desc"); // "asc" | "desc"
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    setError("");

    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("id,slug,title_ja,title_en,capacity,starts_at,registration_deadline,registration_type,capacity_by_nationality,capacity_japanese,capacity_international")
      .eq("id", id)
      .maybeSingle();

    if (eventError) {
      setError(eventError.message);
      setLoading(false);
      return;
    }
    if (!eventData) {
      setError("イベントが見つかりません");
      setLoading(false);
      return;
    }
    setEvent(eventData);

    const { data: appData, error: appError } = await supabase
      .from("camp_applications")
      .select(
        "id,name,phone,university,student_id,campus,grade,birthday,hometown,participant_type,gender,allergy_status,allergy_details,dietary_religious,dietary_restrictions,accommodation_notes,cancellation_policy_version,cancellation_agreed_at,disclaimer_version,disclaimer_agreed_at,application_status,created_at"
      )
      .eq("event_id", id)
      .order("created_at", { ascending: false });

    if (appError) {
      setError(appError.message);
      setLoading(false);
      return;
    }

    setApplications(appData ?? []);
    setLoading(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const base = !q
      ? applications
      : applications.filter((r) => {
          return (
            (r.name || "").toLowerCase().includes(q) ||
            (r.phone || "").includes(q) ||
            (r.student_id || "").includes(q) ||
            getLabel(universityOptions, r.university).toLowerCase().includes(q) ||
            getLabel(gradeOptions, r.grade).toLowerCase().includes(q) ||
            getLabel(nationalityOptions, r.participant_type).toLowerCase().includes(q) ||
            (r.hometown || "").toLowerCase().includes(q)
          );
        });

    const sorted = [...base].sort((a, b) => {
      if (sortField === "name") {
        const A = (a.name || "").toLowerCase();
        const B = (b.name || "").toLowerCase();
        return sortOrder === "asc" ? A.localeCompare(B) : B.localeCompare(A);
      } else {
        const A = new Date(a.created_at).getTime();
        const B = new Date(b.created_at).getTime();
        return sortOrder === "asc" ? A - B : B - A;
      }
    });

    return sorted;
  }, [applications, searchTerm, sortField, sortOrder]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const toggleExpand = (rid) => {
    const next = new Set(expanded);
    if (next.has(rid)) next.delete(rid);
    else next.add(rid);
    setExpanded(next);
  };

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-slate-600">Loading...</div>;
  }

  const count = applications.length;
  const cap = event?.capacity;
  const isFull = cap !== null && cap !== undefined && count >= cap;
  const deadlineText = formatDeadlineDate("ja", event?.registration_deadline);
  const isClosed = isRegistrationClosed(event?.registration_deadline);
  const allergyCount = applications.filter((r) => r.allergy_status === "has").length;

  const isByNationality = !!event?.capacity_by_nationality;
  const japaneseCount = applications.filter((r) => r.participant_type === "japanese").length;
  const internationalCount = applications.filter((r) => r.participant_type === "international").length;
  const japaneseFull = isByNationality && event?.capacity_japanese !== null && event?.capacity_japanese !== undefined && japaneseCount >= event.capacity_japanese;
  const internationalFull = isByNationality && event?.capacity_international !== null && event?.capacity_international !== undefined && internationalCount >= event.capacity_international;

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-3">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-bold text-green-700 hover:text-green-800">
            <ArrowLeft className="h-4 w-4" />
            ダッシュボード
          </Link>

          <Button variant="ghost" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900">合宿申込者一覧</h1>
            {event && <p className="mt-1 text-slate-600">{event.title_ja || event.title_en}</p>}
          </div>

          {event && (
            <div className="flex flex-wrap items-center gap-2">
              {isByNationality ? (
                <>
                  <Badge variant={japaneseFull ? "error" : "success"}>
                    日本人 {japaneseCount} / {event.capacity_japanese ?? "∞"}
                  </Badge>
                  <Badge variant={internationalFull ? "error" : "success"}>
                    留学生 {internationalCount} / {event.capacity_international ?? "∞"}
                  </Badge>
                </>
              ) : (
                <Badge variant={isFull ? "error" : "success"}>
                  {count} / {cap ?? "∞"}
                </Badge>
              )}
              <Badge variant="neutral">
                開催日: {formatEventDate("ja", event.starts_at)}
              </Badge>
              {deadlineText && (
                <Badge variant={isClosed ? "warning" : "neutral"}>
                  申込締切: {deadlineText}
                </Badge>
              )}
              {allergyCount > 0 && (
                <Badge variant="warning">
                  アレルギーあり: {allergyCount}名
                </Badge>
              )}
            </div>
          )}
        </div>

        {error && <Alert variant="error" className="mt-4">{error}</Alert>}

        {/* Controls */}
        <Panel className="mt-6 p-4 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Input
                label="検索"
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="名前、電話番号、学籍番号、大学、学年、出身地で検索..."
                icon={<Search className="h-5 w-5" />}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => toggleSort("name")}>
                <ArrowUpDown className="h-4 w-4 mr-2" />
                名前{sortField === "name" ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}
              </Button>
              <Button variant="outline" onClick={() => toggleSort("created_at")}>
                <ArrowUpDown className="h-4 w-4 mr-2" />
                登録日時{sortField === "created_at" ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}
              </Button>
            </div>
          </div>
        </Panel>

        {/* Empty */}
        {filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title={searchTerm ? "申込者が見つかりません" : "申込者がいません"}
              description={searchTerm ? "検索条件を変更してください" : "申込が入るとここに表示されます"}
            />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filtered.map((r) => (
              <Panel key={r.id} className="p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-black text-slate-900">{r.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {r.phone || "-"} ・ {getLabel(universityOptions, r.university)}
                      {r.student_id ? `（学籍番号: ${r.student_id}）` : ""} ・ {getLabel(campusOptions, r.campus)} ・ {getLabel(gradeOptions, r.grade)}
                      {isByNationality ? ` ・ ${getLabel(nationalityOptions, r.participant_type)}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.allergy_status === "has" && <Badge variant="warning">アレルギーあり</Badge>}
                    <Badge variant="neutral">{new Date(r.created_at).toLocaleString("ja-JP")}</Badge>
                  </div>
                </div>

                {expanded.has(r.id) && (
                  <div className="mt-4 grid gap-4 border-t-2 border-slate-100 pt-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs font-bold text-slate-600">誕生日</div>
                      <div className="text-sm text-slate-800">{formatEventDate("ja", r.birthday) || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-600">出身地</div>
                      <div className="text-sm text-slate-800">{r.hometown || "-"}</div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-600">性別（部屋割り用）</div>
                      <div className="text-sm text-slate-800">{getLabel(genderOptions, r.gender)}</div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-600">アレルギーの有無</div>
                      <div className="text-sm text-slate-800">{getLabel(allergyStatusOptions, r.allergy_status)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-600">アレルギー詳細</div>
                      <div className="text-sm text-slate-800 whitespace-pre-wrap">{r.allergy_details || "-"}</div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-600">宗教・文化上食べられないもの</div>
                      <div className="text-sm text-slate-800 whitespace-pre-wrap">{r.dietary_religious || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-600">ベジタリアン等の食事制限</div>
                      <div className="text-sm text-slate-800 whitespace-pre-wrap">{r.dietary_restrictions || "-"}</div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-xs font-bold text-slate-600">運営への事前共有事項</div>
                      <div className="text-sm text-slate-800 whitespace-pre-wrap">{r.accommodation_notes || "-"}</div>
                    </div>

                    <div className="md:col-span-2 rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-bold text-slate-600">同意状況</div>
                      <div className="mt-1 text-sm text-slate-800">
                        キャンセル・返金規定 v{r.cancellation_policy_version} に同意
                        （{new Date(r.cancellation_agreed_at).toLocaleString("ja-JP")}）
                      </div>
                      <div className="text-sm text-slate-800">
                        注意事項・免責事項 v{r.disclaimer_version} に同意
                        （{new Date(r.disclaimer_agreed_at).toLocaleString("ja-JP")}）
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => toggleExpand(r.id)}
                  className="mt-3 w-full border-t border-slate-200 pt-3 text-sm font-black text-green-700 hover:text-green-800 inline-flex items-center justify-center gap-2"
                >
                  {expanded.has(r.id) ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      詳細を閉じる
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      詳細を見る
                    </>
                  )}
                </button>
              </Panel>
            ))}

            <div className="mt-3 text-sm text-slate-500">
              {searchTerm && <span>検索結果: {filtered.length}件 / </span>}
              全{applications.length}件
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
