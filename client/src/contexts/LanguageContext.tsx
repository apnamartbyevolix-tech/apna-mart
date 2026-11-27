import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  languageKey,
  languageNames,
  marketLanguage,
  translate,
  type MarketLanguage,
} from "@/lib/i18n";
const Context = createContext({
  language: "en" as MarketLanguage,
  setLanguage: (_: MarketLanguage) => {},
  t: (text: string) => text,
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<MarketLanguage>(() => {
    try {
      return marketLanguage(localStorage.getItem(languageKey));
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    document.documentElement.lang =
      language === "hi" ? "hi" : language === "hinglish" ? "hi-Latn" : "en";
    try {
      localStorage.setItem(languageKey, language);
    } catch {
      /* Language remains usable without storage. */
    }
  }, [language]);
  return (
    <Context.Provider
      value={{ language, setLanguage, t: text => translate(language, text) }}
    >
      {children}
    </Context.Provider>
  );
}
export const useLanguage = () => useContext(Context);
export function LanguageSelect() {
  const { language, setLanguage } = useLanguage();
  return (
    <label className="mart-language">
      <span className="sr-only">Language / भाषा</span>
      <select
        aria-label="Language / भाषा"
        value={language}
        onChange={e => setLanguage(marketLanguage(e.target.value))}
      >
        {Object.entries(languageNames).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
