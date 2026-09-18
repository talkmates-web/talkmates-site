import { createElement, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useLang } from "../contexts/langCore";
import TalkMatesLogo from "../assets/TalkMatesLogo.png";
import { cx } from "../lib/cx";
import { Home, CalendarDays, Languages, Shield } from "lucide-react";

export default function Layout() {
  const { lang, toggle } = useLang();
  const loc = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const navItem = (to, label, Icon) => {
    const active = loc.pathname === to || (to === "/events" && loc.pathname.startsWith("/events"));
    return (
      <Link
        to={to}
        className={cx(
          "inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition",
          active
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-slate-100 bg-white text-slate-700 hover:border-green-200 hover:bg-green-50 hover:text-green-700"
        )}
      >
        {createElement(Icon, { className: "h-4 w-4" })}
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b-2 border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src={TalkMatesLogo} alt="TalkMates" className="h-10 w-10 rounded-2xl" />
            <div className="leading-tight">
              <div className="text-base font-black tracking-tight text-slate-900">
                <span className="text-green-600">Talk</span>Mates
              </div>
              <div className="text-xs font-semibold text-slate-500">
                {lang === "ja" ? "留学生とのイベントサークル" : "Event circle"}
              </div>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {navItem("/", lang === "ja" ? "ホーム" : "Home", Home)}
            {navItem("/events", lang === "ja" ? "イベント" : "Events", CalendarDays)}

            <button
              onClick={toggle}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-green-200 hover:bg-green-50 hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
            >
              <Languages className="h-4 w-4" />
              {lang === "en" ? "EN" : "JA"}
            </button>

            <Link
              to="/admin/login"
              className="hidden md:inline-flex items-center gap-2 rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-green-200 hover:bg-green-50 hover:text-green-700"
            >
              <Shield className="h-4 w-4" />
              Staff
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mt-16 bg-linear-to-b from-[#0b1220] via-[#0a1324] to-[#060b14]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-12 md:grid-cols-3">
            {/* Brand */}
            <div>
              <div className="text-3xl font-black tracking-tight text-white">
                TalkMates
              </div>

              <p className="mt-6 max-w-sm text-lg font-medium leading-relaxed text-slate-400">
                {lang === "ja"
                  ? "日本人学生と留学生の架け橋となる国際交流サークルです。"
                  : "We are an international exchange circle connecting Japanese and international students."}
              </p>
            </div>

            {/* Links */}
            <div>
              <h3 className="text-2xl font-black text-white">Links</h3>
              <ul className="mt-6 space-y-4 text-lg font-semibold">
                <li>
                  <Link
                    to="/"
                    className="text-slate-400 transition hover:text-white"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    to="/events"
                    className="text-slate-400 transition hover:text-white"
                  >
                    Events
                  </Link>
                </li>
              

                <li>
                  <Link
                    to="/admin/login"
                    className="text-slate-400 transition hover:text-white"
                  >
                    Staff Login
                  </Link>
                </li>
              </ul>
            </div>

            {/* Creator */}
            <div>
              <h3 className="text-2xl font-black text-white">Creater Contact</h3>

              <div className="mt-6 space-y-3 text-lg font-medium text-slate-400">
                <p>
                  Created by{" "}
                  <span className="font-bold text-slate-200">
                    Taishun Hagihara
                  </span>
                </p>

                <a
                  className="inline-flex items-center gap-2 font-semibold text-slate-300 transition hover:text-white"
                  href="https://taishun-portfolio.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Portfolio ↗︎
                </a>

                {/* TalkMatesのインスタも置きたいなら（不要なら削除OK） */}
                <a
                  className="block font-semibold text-slate-300 transition hover:text-white"
                  href="https://www.instagram.com/tais_.ha/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Instagram ↗︎
                </a>
              </div>
            </div>
          </div>

          <div className="mt-12 h-px w-full bg-white/10" />

          <div className="mt-6 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} TalkMates</p>
            
          </div>
        </div>
      </footer>

    </div>
  );
}
