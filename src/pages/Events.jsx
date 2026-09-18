//他のコードと基本おなじ
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useLang } from "../contexts/langCore";
import { getTokyoDateString } from "../lib/dateOnly";
import Card from "../components/Card";
import { Panel } from "../components/ui";

export default function Events() {
  const { lang } = useLang();
  const [nextEvents, setNextEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = getTokyoDateString();

      const nextRes = await supabase
        .from("events")
        .select("id,slug,starts_at,registration_deadline,location,cover_path,capacity,title_en,title_ja,description_en,description_ja")
        .gte("starts_at", today)
        .order("starts_at", { ascending: true })
        .limit(12);

      const pastRes = await supabase
        .from("events")
        .select("id,slug,starts_at,registration_deadline,location,cover_path,capacity,title_en,title_ja,description_en,description_ja")
        .lt("starts_at", today)
        .order("starts_at", { ascending: false })
        .limit(36);

      setNextEvents(nextRes.data ?? []);
      setPastEvents(pastRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 lg:px-8">
      <h1 className="mt-10 text-4xl font-black tracking-tight text-slate-900">
        {lang === "ja" ? "イベント" : "Events"}
      </h1>

      <section className="mt-10">
        <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          <span className="text-green-600">{lang === "ja" ? "次回" : "Next"}</span>{" "}
          {lang === "ja" ? "イベント・予約" : "Events / Reservation"}
        </h2>
        <div className="mt-4 h-px w-full bg-slate-200" />

        {loading ? (
          <div className="mt-6">
            <Panel className="p-6 text-slate-600">Loading...</Panel>
          </div>
        ) : nextEvents.length ? (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {nextEvents.map((e) => (
              <Card key={e.id} e={e} />
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <Panel className="p-6 text-slate-600">{lang === "ja" ? "準備中です。" : "Coming soon."}</Panel>
          </div>
        )}
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          <span className="text-green-600">{lang === "ja" ? "過去" : "Past"}</span>{" "}
          {lang === "ja" ? "イベント" : "Events"}
        </h2>
        <div className="mt-4 h-px w-full bg-slate-200" />

        {loading ? (
          <div className="mt-6">
            <Panel className="p-6 text-slate-600">Loading...</Panel>
          </div>
        ) : pastEvents.length ? (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pastEvents.map((e) => (
              <Card key={e.id} e={e} />
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <Panel className="p-6 text-slate-600">{lang === "ja" ? "準備中です。" : "Coming soon."}</Panel>
          </div>
        )}
      </section>
    </div>
  );
}
