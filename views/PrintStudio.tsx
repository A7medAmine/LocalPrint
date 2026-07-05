import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CardIDTool from "./CardIDTool";
import PDFJobManager from "./PDFJobManager";
import { useLanguage } from "../lib/useLanguage";
import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/toaster";
import LanguageToggle from "../components/LanguageToggle";
import type { Language, ShopSettings } from "../types";
import { TRANSLATIONS } from "../constants";

type StudioTab = "cards" | "pdf";

const studioNavItems: { id: StudioTab; icon: string; labelKey: string }[] = [
  {
    id: "cards",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    labelKey: "cardsTab",
  },
  {
    id: "pdf",
    icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
    labelKey: "pdfTab",
  },
];

interface PrintStudioProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  lang: Language;
  onToggleLang: (lang: Language) => void;
  currentSettings: ShopSettings;
}

const PrintStudio: React.FC<PrintStudioProps> = ({
  darkMode,
  onToggleDarkMode,
  lang,
  onToggleLang,
  currentSettings,
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isRtl = lang === "ar";
  const [tab, setTab] = useState<StudioTab>("cards");
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (sessionStorage.getItem("ps_edit_job")) {
      setTab("pdf");
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-gray-50 dark:bg-[#111] border-r border-gray-200 dark:border-gray-800 transition-all duration-250 ease shrink-0 ${
          expanded ? "w-[220px]" : "w-[52px]"
        } ${isRtl ? "font-['IBMPlexArabic']" : ""}`}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center gap-3 px-4 py-5">
          {expanded ? (
            <>
              <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white overflow-hidden shadow-sm flex-shrink-0">
                {currentSettings.logoUrl ? (
                  <img src={currentSettings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm-1 9H8v2h4v-2z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span dir="auto" className="text-base font-bold tracking-tight text-gray-900 dark:text-gray-100 truncate">
                {currentSettings.shopName || TRANSLATIONS.appTitle[lang]}
              </span>
            </>
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="w-full flex items-center justify-center p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors"
              title={isRtl ? "توسيع" : "Expand"}
            >
              <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white overflow-hidden shadow-sm flex-shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm-1 9H8v2h4v-2z" clipRule="evenodd" />
                </svg>
              </div>
            </button>
          )}
          {expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors ml-auto"
              aria-label={isRtl ? "طي" : "Collapse"}
            >
              <svg className="w-4 h-4 rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Section: STUDIO */}
        {expanded && (
          <div className="px-4 pt-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              {isRtl ? "الاستوديو" : "STUDIO"}
            </span>
          </div>
        )}

        {/* Studio tab nav items */}
        <nav className={`${expanded ? "px-3 py-2 space-y-0.5" : "px-2 py-3 space-y-1"}`}>
          {studioNavItems.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 ${expanded ? "px-3.5 py-2.5" : "px-2.5 py-2.5 justify-center"} rounded-xl text-sm font-medium transition-colors duration-150 ease ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                    : "text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/[0.06]"
                }`}
                title={!expanded ? t(item.labelKey) : undefined}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d={item.icon} />
                </svg>
                {expanded && <span className="truncate">{t(item.labelKey)}</span>}
              </button>
            );
          })}
        </nav>

        {/* Section: TOOLS */}
        {expanded && (
          <div className="px-4 pt-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              {isRtl ? "أدوات" : "TOOLS"}
            </span>
          </div>
        )}

        <nav className={`${expanded ? "px-3 pb-2 space-y-0.5" : "px-2 pb-3 space-y-1"}`}>
          <button
            onClick={() => navigate("/admin/dashboard")}
            className={`w-full flex items-center gap-3 ${expanded ? "px-3.5 py-2.5" : "px-2.5 py-2.5 justify-center"} rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors duration-150 ease`}
            title={!expanded ? (isRtl ? "لوحة التحكم" : "Dashboard") : undefined}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            {expanded && <span className="truncate">{isRtl ? "لوحة التحكم" : "Dashboard"}</span>}
          </button>
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Help Card */}
        {expanded && (
          <div className="px-3 pb-3">
            <div className="bg-white/60 dark:bg-white/[0.06] rounded-xl p-3.5 border border-gray-200 dark:border-white/10">
              <div className="flex items-start gap-2.5 mb-2.5">
                <svg className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0 9 9 0 0112.728 0zM12 8v4m0 4h.01" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight">
                    {isRtl ? "تحتاج مساعدة؟" : "Need help?"}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                    {isRtl ? "فريقنا جاهز للمساعدة" : "Our team is here to help"}
                  </p>
                </div>
              </div>
              <button className="w-full text-xs font-semibold py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
                {isRtl ? "اتصل بالدعم" : "Contact Support"}
              </button>
            </div>
          </div>
        )}

        {/* Dark mode + Language toggles */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onToggleDarkMode}
            className={`${expanded ? "p-2" : "p-2 w-full flex justify-center"} rounded-lg text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors`}
            aria-label={lang === "ar" ? "الوضع الليلي" : "Dark mode"}
          >
            {darkMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          {expanded && onToggleLang && <LanguageToggle currentLang={lang} onToggle={onToggleLang} />}
          {!expanded && onToggleLang && (
            <button
              onClick={() => onToggleLang(lang === "en" ? "ar" : "en")}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors"
              title={lang === "en" ? "عربي" : "English"}
            >
              <span className="text-xs font-bold">{lang === "en" ? "ع" : "EN"}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header with hamburger */}
        <div className="md:hidden flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setExpanded(true)}
            className="p-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/[0.06]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {currentSettings.shopName || TRANSLATIONS.appTitle[lang]}
          </span>
          <div className="w-5" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
          <div className={`p-6 ${isRtl ? "rtl text-right" : ""}`}>
            {tab === "cards" ? <CardIDTool /> : <PDFJobManager />}
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
};

export default PrintStudio;
