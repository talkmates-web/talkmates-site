//理解済み
import { Link } from "react-router-dom";
import { useLang } from "../contexts/langCore";

export default function StaffLoginCard() {
    const { lang } = useLang();

    return (
        <section className="w-full bg-slate-50 py-14">
            <div className="mx-auto max-w-4xl px-4">
                <div className="rounded-[28px] bg-white px-6 py-12 text-center shadow-[0_18px_50px_-20px_rgba(15,23,42,0.25)] ring-1 ring-slate-200/70 sm:px-12">
                    <h2 className="text-4xl font-black tracking-tight text-slate-900">
                        Staff Members
                    </h2>

                    <p className="mx-auto mt-5 max-w-md text-lg font-medium leading-relaxed text-slate-500">
                        {lang === "ja"
                            ? "イベント管理や参加者情報の確認はこちらから"
                            : "Manage events and check registrations here."}
                    </p>

                    <div className="mt-10">
                        <Link
                            to="/admin/login"
                            className="inline-flex items-center justify-center rounded-2xl border-2 border-green-600 px-10 py-4 text-lg font-bold text-green-700 shadow-sm transition hover:bg-green-50 hover:text-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                        >
                            Staff Login
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
