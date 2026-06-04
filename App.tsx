import React, { useState, useEffect } from "react";
import { Language, ShopSettings } from "./types";
import { TRANSLATIONS } from "./constants";
import { storageService } from "./services/storageService";
import UploadView from "./views/UploadView";
import AdminView from "./views/AdminView";
import PrintStudio from "./views/PrintStudio";
import LanguageToggle from "./components/LanguageToggle";

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => {
    const savedLang = localStorage.getItem("ps_language") as Language;
    return savedLang || "ar";
  });

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    const token = localStorage.getItem("ps_admin_token");
    if (token) storageService.setAuthToken(token);
    return !!token;
  });

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [settings, setSettings] = useState<ShopSettings>({
    shopName: "PrintShop Hub",
    logoUrl: null,
  });

  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const onSessionExpired = () => {
      storageService.setAuthToken(null);
      localStorage.removeItem("ps_admin_token");
      setIsAdmin(false);
      setShowAdminLogin(true);
      window.location.hash = "admin";
    };
    window.addEventListener("session-expired", onSessionExpired);
    return () =>
      window.removeEventListener("session-expired", onSessionExpired);
  }, []);

  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("ps_language", lang);
    window.dispatchEvent(new CustomEvent("ps:langchange", { detail: lang }));
  }, [lang]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const serverSettings = await storageService.getSettings();
        setSettings(serverSettings);
        document.title = serverSettings.shopName;
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (!isAdmin) {
          setShowAdminLogin(true);
        } else {
          navigateToPage("admin");
        }
      }
      if (e.altKey && e.key === "a") {
        e.preventDefault();
        if (!isAdmin) {
          setShowAdminLogin(true);
          window.location.hash = "admin";
        } else {
          navigateToPage("admin");
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "u") {
        e.preventDefault();
        navigateToPage("upload");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        navigateToPage("studio");
      }
      if (e.key === "Escape") {
        if (showAdminLogin && !isAdmin) {
          setShowAdminLogin(false);
          window.location.hash = "";
        } else if (isAdmin) {
          navigateToPage("upload");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAdmin, showAdminLogin]);

  useEffect(() => {
    if (currentHash === "#studio" && !isAdmin) {
      window.location.hash = "admin";
      setShowAdminLogin(true);
      return;
    }
    if (currentHash === "#studio") return;
    if (isAdmin && currentHash !== "#admin") {
      window.location.hash = "admin";
    } else if (!isAdmin && currentHash === "#admin") {
      setShowAdminLogin(true);
    } else if (!isAdmin && !showAdminLogin && currentHash !== "") {
      window.location.hash = "";
    }
  }, [isAdmin, currentHash, showAdminLogin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await storageService.verifyPassword(password);
    if (result.success && result.token) {
      storageService.setAuthToken(result.token);
      localStorage.setItem("ps_admin_token", result.token);
      setIsAdmin(true);
      setShowAdminLogin(false);
      setLoginError(false);
      setPassword("");
      window.location.hash = "admin";
    } else {
      setLoginError(true);
    }
  };

  const handleLogout = () => {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("ps_admin_token")}`,
      },
    }).catch(() => {});
    storageService.setAuthToken(null);
    localStorage.removeItem("ps_admin_token");
    setIsAdmin(false);
    window.location.hash = "";
  };

  const handleToggleMode = () => {
    if (isAdmin && currentHash === "#studio") {
      window.location.hash = "admin";
      return;
    }
    setIsTransitioning(true);
    setTimeout(() => {
      if (isAdmin) {
        handleLogout();
      } else {
        setShowAdminLogin(!showAdminLogin);
        if (showAdminLogin) window.location.hash = "";
      }
      setIsTransitioning(false);
    }, 150);
  };

  const navigateToPage = (page: "upload" | "admin" | "studio") => {
    setIsTransitioning(true);
    setTimeout(() => {
      if (page === "admin" && !isAdmin) {
        setShowAdminLogin(true);
      } else if (page === "admin") {
        window.location.hash = "admin";
      } else if (page === "studio") {
        window.location.hash = "studio";
      } else {
        window.location.hash = "";
      }
      setIsTransitioning(false);
    }, 150);
  };

  const renderContent = () => {
    if (currentHash === "#studio") {
      return <PrintStudio />;
    }

    if (showAdminLogin && !isAdmin) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
          <div className="w-full max-w-sm animate-[scaleIn_0.2s_ease-out]">
            <div className="bg-white rounded-xl shadow-card border border-[#E2E8F0] p-8">
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-[#0F172A]">
                  {TRANSLATIONS.adminLogin[lang]}
                </h2>
                <p className="text-sm text-[#64748B] mt-1">
                  {lang === "ar" ? "أدخل كلمة المرور للدخول" : "Enter your password to continue"}
                </p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      autoFocus
                      className="w-full h-12 px-4 pr-11 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] transition"
                      tabIndex={-1}
                    >
                      {showLoginPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {loginError && (
                  <p className="text-sm text-danger font-medium flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {lang === "ar" ? "كلمة المرور خاطئة" : "Incorrect password"}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full h-11 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary-600 transition-all active:scale-[0.98] shadow-card"
                >
                  {TRANSLATIONS.loginBtn[lang]}
                </button>
              </form>
              <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex justify-center">
                <LanguageToggle currentLang={lang} onToggle={setLang} />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (isAdmin || currentHash === "#admin") {
      if (!isAdmin) {
        setShowAdminLogin(true);
        return null;
      }
      return (
        <AdminView
          lang={lang}
          onLogout={handleLogout}
          currentSettings={settings}
          onSettingsUpdate={setSettings}
        />
      );
    }

    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <nav className="bg-white/80 backdrop-blur-xl border-b border-[#E2E8F0]/50 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-topbar">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => (window.location.hash = "")}>
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white overflow-hidden shadow-sm">
              {settings.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm-1 9H8v2h4v-2z"
                    clipRule="evenodd"
                  ></path>
                </svg>
              )}
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-lg font-bold tracking-tight text-[#0F172A] truncate max-w-[150px] sm:max-w-[300px]">
                {settings.shopName || TRANSLATIONS.appTitle[lang]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggle currentLang={lang} onToggle={setLang} />
            <button
              onClick={() => {
                setShowAdminLogin(true);
                window.location.hash = "admin";
              }}
              className="text-sm font-medium text-[#64748B] hover:text-primary transition-colors px-4 py-2 rounded-xl hover:bg-primary/5"
            >
              {lang === "ar" ? "المسؤول" : "Admin"}
            </button>
          </div>
        </nav>

        <main className="container mx-auto py-6 px-4 flex-grow">
          <div key={lang} className="animate-[langFadeIn_0.25s_ease-out]">
            <UploadView lang={lang} shopSettings={settings} />
          </div>
        </main>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] antialiased font-sans selection:bg-primary/20 selection:text-primary-700">
      <div key={lang} className="animate-[langFadeIn_0.25s_ease-out]">
        {renderContent()}
      </div>
    </div>
  );
};

export default App;
