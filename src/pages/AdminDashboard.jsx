import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDeadlineDate, isRegistrationClosed } from "../lib/deadline";
import { compareEventDates, formatEventDate, isPastEventDate } from "../lib/dateOnly";
import { Badge, Button, Panel, Alert } from "../components/ui";
import { LogOut, Users, FileText, CalendarDays } from "lucide-react";

const PDF_BUCKET = "staff-pdfs";

const getCategory = (filePath = "") => {
  const s = filePath.toLowerCase();
  if (s.includes("proposal")) return "proposal";
  if (s.includes("report")) return "report";
  return "other";
};

export default function AdminDashboard() {
  const [docs, setDocs] = useState([]);
  const [docErr, setDocErr] = useState("");
  const [tab, setTab] = useState("all");

  const [events, setEvents] = useState([]);
  const [eventsErr, setEventsErr] = useState("");
  const [registrationCounts, setRegistrationCounts] = useState({});

  const loadEvents = async () => {
    setEventsErr("");

    const { data, error } = await supabase
      .from("events")
      .select("id,slug,title_ja,title_en,capacity,starts_at,registration_deadline")
      .order("starts_at", { ascending: false })
      .limit(50);

    if (error) {
      setEventsErr(error.message);
      return;
    }

    setEvents(data ?? []);

    const counts = {};
    for (const ev of data ?? []) {
      const { count } = await supabase
        .from("event_registrations")
        .select("*", { count: "exact", head: true })
        .eq("event_id", ev.id);
      counts[ev.id] = count || 0;
    }
    setRegistrationCounts(counts);
  };

  const loadDocs = async () => {
    setDocErr("");
    const { data, error } = await supabase
      .from("staff_documents")
      .select("id,title,file_path,category,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return setDocErr(error.message);
    setDocs(data ?? []);
  };

  const openPdf = async (file_path) => {
    const { data, error } = await supabase.storage
      .from(PDF_BUCKET)
      .createSignedUrl(file_path, 60);

    if (error) return alert(error.message);
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    loadDocs();
    loadEvents();
  }, []);

  const categorized = docs.map((d) => ({
    ...d,
    _cat: getCategory(d.file_path),
  }));

  const counts = {
    all: categorized.length,
    proposal: categorized.filter((d) => d._cat === "proposal").length,
    report: categorized.filter((d) => d._cat === "report").length,
    other: categorized.filter((d) => d._cat === "other").length,
  };

  const filteredDocs = tab === "all" ? categorized : categorized.filter((d) => d._cat === tab);

  const upcomingEvents = (events ?? [])
    .filter((ev) => !isPastEventDate(ev.starts_at))
    .sort((a, b) => compareEventDates(a.starts_at, b.starts_at));
  const pastEvents = (events ?? [])
    .filter((ev) => isPastEventDate(ev.starts_at))
    .sort((a, b) => compareEventDates(b.starts_at, a.starts_at));

  const renderEventList = (eventList, emptyMessage) => (
    <div className="grid gap-4 md:grid-cols-2">
      {eventList.map((ev) => {
        const count = registrationCounts[ev.id] ?? 0;
        const isFull = ev.capacity !== null && count >= ev.capacity;
        const isClosed = isRegistrationClosed(ev.registration_deadline);
        const deadlineText = formatDeadlineDate("ja", ev.registration_deadline);
        return (
          <Panel key={ev.id} className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-black text-slate-900">
                  {ev.title_ja || ev.title_en}
                </div>
                <div className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                  <CalendarDays className="h-4 w-4" />
                  {formatEventDate("ja", ev.starts_at)}
                </div>
                {deadlineText && (
                  <div className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDays className="h-4 w-4" />
                    申込締切: {deadlineText}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {isClosed && <Badge variant="warning">締切済み</Badge>}
                <Badge variant={isFull ? "error" : "success"}>
                  {count} / {ev.capacity ?? "∞"}
                </Badge>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <Link to={`/admin/events/${ev.id}/registrations`}>
                <Button variant="primary" fullWidth>
                  <Users className="h-4 w-4 mr-2" />
                  参加者一覧を見る（{count}名）
                </Button>
              </Link>
            </div>
          </Panel>
        );
      })}

      {!eventList.length && (
        <Panel className="p-6 text-slate-600 md:col-span-2">{emptyMessage}</Panel>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-black text-slate-900">Admin Dashboard</h1>
          <Button variant="ghost" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* Events */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-black text-slate-900">イベント参加者</h2>
            <p className="mt-1 text-sm text-slate-600">各イベントの参加者一覧を確認</p>
          </div>
        </div>

        {eventsErr && <Alert variant="error" className="mt-4">{eventsErr}</Alert>}

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-bold text-slate-700">これからのイベント</h3>
          {renderEventList(upcomingEvents, "予定されているイベントがありません。")}
        </div>

        <div className="mt-10">
          <h3 className="mb-3 text-sm font-bold text-slate-700">過去のイベント</h3>
          {renderEventList(pastEvents, "過去のイベントがありません。")}
        </div>

        {/* PDFs */}
        <div className="mt-14">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-slate-900">PDF</h2>
              <p className="mt-1 text-sm text-slate-600">企画書・反省文書など</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { key: "all", label: `All (${counts.all})` },
              { key: "proposal", label: `Proposals (${counts.proposal})` },
              { key: "report", label: `Reports (${counts.report})` },
              { key: "other", label: `Others (${counts.other})` },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  tab === t.key
                    ? "rounded-full bg-green-600 px-4 py-2 text-sm font-black text-white"
                    : "rounded-full border-2 border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {docErr && <Alert variant="error" className="mt-4">{docErr}</Alert>}

          <Panel className="mt-4 overflow-hidden">
            <ul className="divide-y divide-slate-200">
              {filteredDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-slate-900">{d.title}</p>
                      <Badge variant="neutral">{(d._cat || "other").toUpperCase()}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {d.file_path} • {new Date(d.created_at).toLocaleString("ja-JP")}
                    </p>
                  </div>

                  <Button variant="outline" onClick={() => openPdf(d.file_path)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Open
                  </Button>
                </li>
              ))}

              {!filteredDocs.length && (
                <li className="px-4 py-8 text-sm text-slate-600">No PDFs.</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
