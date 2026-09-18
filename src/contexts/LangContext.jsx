//おおよそ理解した。ただ、LangContextがexprt functionの中に入っていないのでconst LangContext = createContext(null);が独立しているような違和感がある。
import { useMemo, useState } from "react";
import { LangContext } from "./langCore";

export function LangProvider({ children }) {
    const [lang, setLang] = useState(() => localStorage.getItem("lang") || "ja");

    const value = useMemo(
        () => ({
            lang:lang,
            toggle: () => {
                const next = (lang === "en") ? "ja" : "en";
                setLang(next);
                localStorage.setItem("lang", next);
            },
        }),
        [lang]
    );

    return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
