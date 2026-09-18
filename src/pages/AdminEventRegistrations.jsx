import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDeadlineDate, isRegistrationClosed } from "../lib/deadline";
import { formatEventDate } from "../lib/dateOnly";
import {
  campusOptions,
  gradeOptions,
  universityOptions,
  nationalityOptions,
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

export default function AdminEventRegistrations() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
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
      .select("id,slug,title_ja,title_en,capacity,starts_at,registration_deadline,capacity_by_nationality,capacity_japanese,capacity_international")
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

    const { data: regData, error: regError } = await supabase
      .from("event_registrations")
      .select("id,name,phone,university,student_id,campus,grade,birthday,hometown,participant_type,created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: false });

    if (regError) {
      setError(regError.message);
      setLoading(false);
      return;
    }

    setRegistrations(regData ?? []);
    setLoading(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const base = !q
      ? registrations
      : registrations.filter((r) => {
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
  }, [registrations, searchTerm, sortField, sortOrder]);

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

  const count = registrations.length;
  const cap = event?.capacity;
  const isFull = cap !== null && cap !== undefined && count >= cap;
  const deadlineText = formatDeadlineDate("ja", event?.registration_deadline);
  const isClosed = isRegistrationClosed(event?.registration_deadline);

  const isByNationality = !!event?.capacity_by_nationality;
  const japaneseCount = registrations.filter((r) => r.participant_type === "japanese").length;
  const internationalCount = registrations.filter((r) => r.participant_type === "international").length;
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
            <h1 className="text-3xl font-black text-slate-900">参加者一覧</h1>
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
              title={searchTerm ? "参加者が見つかりません" : "参加者がいません"}
              description={searchTerm ? "検索条件を変更してください" : "参加登録が入るとここに表示されます"}
            />
          </div>
        ) : (
          <div className="mt-6">
            {/* Mobile cards */}
            <div className="space-y-4 md:hidden">
              {filtered.map((r) => (
                <Panel key={r.id} className="p-4">
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs font-bold text-slate-600">名前</div>
                      <div className="text-lg font-black text-slate-900">{r.name}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-600">電話番号</div>
                        <div className="text-sm text-slate-800">{r.phone || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-600">所属大学</div>
                        <div className="text-sm text-slate-800">{getLabel(universityOptions, r.university)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-600">学籍番号</div>
                        <div className="text-sm text-slate-800">{r.student_id || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-600">キャンパス</div>
                        <div className="text-sm text-slate-800">{getLabel(campusOptions, r.campus)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-600">学年</div>
                        <div className="text-sm text-slate-800">{getLabel(gradeOptions, r.grade)}</div>
                      </div>
                      {isByNationality && (
                        <div>
                          <div className="text-xs font-bold text-slate-600">日本人／留学生</div>
                          <div className="text-sm text-slate-800">{getLabel(nationalityOptions, r.participant_type)}</div>
                        </div>
                      )}
                    </div>

                    {expanded.has(r.id) && (
                      <div className="pt-3 mt-3 border-t border-slate-200 space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs font-bold text-slate-600">誕生日</div>
                            <div className="text-sm text-slate-800">{formatEventDate("ja", r.birthday) || "-"}</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-600">出身地</div>
                            <div className="text-sm text-slate-800">{r.hometown || "-"}</div>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-slate-600">登録日時</div>
                          <div className="text-sm text-slate-700">{new Date(r.created_at).toLocaleString("ja-JP")}</div>
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
                  </div>
                </Panel>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Panel className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-slate-50 border-b-2 border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">名前</th>
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">電話番号</th>
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">所属大学</th>
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">学籍番号</th>
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">キャンパス</th>
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">学年</th>
                        {isByNationality && (
                          <th className="px-4 py-3 text-left text-sm font-black text-slate-700">日本人／留学生</th>
                        )}
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">誕生日</th>
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">出身地</th>
                        <th className="px-4 py-3 text-left text-sm font-black text-slate-700">登録日時</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filtered.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-bold text-slate-900">{r.name}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.phone || "-"}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{getLabel(universityOptions, r.university)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.student_id || "-"}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{getLabel(campusOptions, r.campus)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{getLabel(gradeOptions, r.grade)}</td>
                          {isByNationality && (
                            <td className="px-4 py-3 text-sm text-slate-700">{getLabel(nationalityOptions, r.participant_type)}</td>
                          )}
                          <td className="px-4 py-3 text-sm text-slate-700">{formatEventDate("ja", r.birthday) || "-"}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.hometown || "-"}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString("ja-JP")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            <div className="mt-3 text-sm text-slate-500">
              {searchTerm && <span>検索結果: {filtered.length}件 / </span>}
              全{registrations.length}件
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
