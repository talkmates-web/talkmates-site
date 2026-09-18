//他のコードと基本同じ
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../contexts/langCore";
import { supabase } from "../lib/supabase";
import { getTokyoDateString } from "../lib/dateOnly";
import Card from "../components/Card";
import { Button, Panel, EmptyState } from "../components/ui";
import { Instagram, CalendarDays, Users } from "lucide-react";
import StaffLoginCard from "../components/StaffLoginCard";


export default function Home() {
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
        .limit(10);

      const pastRes = await supabase
        .from("events")
        .select("id,slug,starts_at,registration_deadline,location,cover_path,capacity,title_en,title_ja,description_en,description_ja")
        .lt("starts_at", today)
        .order("starts_at", { ascending: false })
        .limit(12);

      setNextEvents(nextRes.data ?? []);
      setPastEvents(pastRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      {/* HERO */}
      <section className="bg-linear-to-br from-green-600 via-emerald-500 to-lime-400">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              TalkMates
            </h1>
            <p className="mt-4 text-lg font-semibold text-white/95">
              {lang === "ja"
                ? "同志社大学の国際交流イベントサークル"
                : "International exchange event circle at Doshisha University"}
            </p>
            <p className="mt-2 text-base font-medium text-white/90">
              {lang === "ja"
                ? "英語が苦手でも大歓迎。留学生と一緒に活動しよう！"
                : "Everyone is welcome. Let's join activities together!"}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/events">
                <Button variant="primary" size="lg">
                  <CalendarDays className="h-5 w-5 mr-2" />
                  {lang === "ja" ? "イベントを見る" : "See events"}
                </Button>
              </Link>

              <a href="https://www.instagram.com/talkmates_2025/" target="_blank" rel="noreferrer">
                <Button variant="outline" size="lg" className="bg-white/95">
                  <Instagram className="h-5 w-5 mr-2" />
                  Instagram↗︎
                </Button>
              </a>
            </div>
          </div>

          
        </div>
      </section>
      <section>
        <h1 className="mt-5 text-center text-4xl text-black font-bold">About Talk mates</h1>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Panel className="p-5 bg-white/95">
            <div className="text-sm font-bold text-slate-900">
              {lang === "ja" ? "留学生の数 同志社No.1" : "No.1 international students"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {lang === "ja" ? "登録団体として活動しています" : "Officially registered club"}
            </div>
          </Panel>
          <Panel className="p-5 bg-white/95">
            <div className="text-sm font-bold text-slate-900">
              {lang === "ja" ? "初心者でも安心" : "Beginner-friendly"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {lang === "ja" ? "英語が苦手でも大歓迎" : "Even if you're not confident, welcome!"}
            </div>
          </Panel>
          <Panel className="p-5 bg-white/95">
            <div className="text-sm font-bold text-slate-900">
              {lang === "ja" ? "交流イベント多数" : "Many events"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {lang === "ja" ? "毎月いろんな企画を実施" : "Various activities every month"}
            </div>
          </Panel>
        </div>
      </section>

      {/* NEXT EVENTS */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            <span className="text-green-600">{lang === "ja" ? "次回" : "Next"}</span>{" "}
            {lang === "ja" ? "イベント" : "Events"}
          </h2>
          <Link to="/events">
            <Button variant="primary" size="md">
              {lang === "ja" ? "詳しく見る" : "Details"}
            </Button>
          </Link>
        </div>

        <div className="mt-4 h-px w-full bg-slate-200" />

        {loading ? (
          <div className="mt-6">
            <Panel className="p-6 text-slate-600">Loading...</Panel>
          </div>
        ) : nextEvents.length ? (
          <div className="mt-6">
            {/* mobile: horizontal scroll, desktop: grid */}
            <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
              <div className="flex gap-4 sm:grid sm:grid-cols-2 sm:gap-6">
                {nextEvents.map((e) => (
                  <div key={e.id} className="shrink-0 w-[85%] sm:w-auto">
                    <Card e={e} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title={lang === "ja" ? "準備中です" : "Coming soon"}
              description={lang === "ja" ? "イベント情報が更新されるまでお待ちください。" : "Please check back later."}
              action={
                <a href="https://www.instagram.com/talkmates_2025/" target="_blank" rel="noreferrer">
                  <Button variant="outline">Instagramを見る</Button>
                </a>
              }
            />
          </div>
        )}
      </section>

      {/* PAST EVENTS */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            <span className="text-green-600">{lang === "ja" ? "イベント記録" : "Event recap"}</span>{" "}
            2025
          </h2>
          <Link to="/events">
            <Button variant="outline">{lang === "ja" ? "すべて見る" : "View all"}</Button>
          </Link>
        </div>

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
      <StaffLoginCard />

    </div>
  );
}
