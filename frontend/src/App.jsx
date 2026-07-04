import { createContext, useContext, useEffect, useState } from "react";

import logo from "../logo.png";
const API = "http://localhost:8000/api";
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// ── Translations (English + Marathi) ──
export const T = {
  en: {
    appName:"CiviCare", tagline:"Phaltan Municipal Council",
    dashboard:"Dashboard", applyConn:"Apply Connection",
    trackApp:"Track Application", myPortal:"My Portal",
    login:"Login", logout:"Logout", loading:"Loading CiviCare...",
    citizenPortal:"💧 Citizen Portal", officerDash:"👮 Officer Dashboard",
    plumberPortal:"🔧 Plumber Portal", corporatorDash:"🏛️ Corporator Dashboard",
    home:"🏠 Home", connection:"🔗 Connection", bills:"💰 Bills",
    complaints:"📋 Complaints", services:"🛠 Services", assistant:"🤖 Assistant",
    filedComplaint:"File Complaint", myComplaints:"My Complaints",
    supplyToday:"Today's Water Supply", announcements:"📢 Announcements",
    noAnnouncements:"No announcements",
  },
  mr: {
    appName:"सिविकेअर", tagline:"फलटण नगरपालिका",
    dashboard:"डॅशबोर्ड", applyConn:"कनेक्शन अर्ज",
    trackApp:"अर्ज ट्रॅक करा", myPortal:"माझा पोर्टल",
    login:"लॉगिन", logout:"लॉगआउट", loading:"सिविकेअर लोड होत आहे...",
    citizenPortal:"💧 नागरिक पोर्टल", officerDash:"👮 अधिकारी डॅशबोर्ड",
    plumberPortal:"🔧 प्लंबर पोर्टल", corporatorDash:"🏛️ नगरसेवक डॅशबोर्ड",
    home:"🏠 मुख्यपृष्ठ", connection:"🔗 कनेक्शन", bills:"💰 बिले",
    complaints:"📋 तक्रारी", services:"🛠 सेवा", assistant:"🤖 सहाय्यक",
    filedComplaint:"तक्रार नोंदवा", myComplaints:"माझ्या तक्रारी",
    supplyToday:"आजचा पाणीपुरवठा", announcements:"📢 घोषणा",
    noAnnouncements:"कोणत्याही घोषणा नाहीत",
  },
};

export const useT = () => {
  const { lang } = useAuth();
  return T[lang] || T.en;
};

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("civicare_token");
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type":"application/json",
      ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    ...options,
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || "Request failed"); }
  return res.json();
}

export async function apiFetchBlob(path) {
  const token = localStorage.getItem("civicare_token");
  const res = await fetch(`${API}${path}`, {
    headers: { ...(token ? { Authorization:`Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}

import ApplyConnection from "./pages/ApplyConnection";
import Chatbot from "./pages/Chatbot";
import CitizenDashboard from "./pages/CitizenDashboard";
import CorporatorDashboard from "./pages/CorporatorDashboard";
import LoginPage from "./pages/LoginPage";
import OfficerDashboard from "./pages/OfficerDashboard";
import OnboardingTour from "./pages/OnboardingTour";
import PlumberPortal from "./pages/PlumberPortal";
import PublicDashboard from "./pages/PublicDashboard";
import TrackApplication from "./pages/TrackApplication";

export default function App() {
  const [user, setUser]         = useState(null);
  const [page, setPage]         = useState("public");
  const [loading, setLoading]   = useState(true);
  const [theme, setTheme]       = useState(() => localStorage.getItem("civicare_theme") || "light");
  const [lang, setLang]         = useState(() => localStorage.getItem("civicare_lang") || "en");
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("civicare_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("civicare_lang", lang);
  }, [lang]);

  useEffect(() => {
    const token     = localStorage.getItem("civicare_token");
    const savedUser = localStorage.getItem("civicare_user");
    if (token && savedUser) {
      setUser(JSON.parse(savedUser)); setPage("dashboard");
      // Refresh user data from server in background (fixes stale profile data)
      fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(fresh => {
          if (fresh) {
            localStorage.setItem("civicare_user", JSON.stringify(fresh));
            setUser(fresh);
          }
        })
        .catch(() => {});
    }
    setLoading(false);
  }, []);

  function login(userData, token) {
    localStorage.setItem("civicare_token", token);
    localStorage.setItem("civicare_user", JSON.stringify(userData));
    setUser(userData); setPage("dashboard");
    // Show onboarding tour if first time
    const toured = localStorage.getItem(`civicare_toured_${userData.id}`);
    if (!toured) setShowTour(true);
  }

  function logout() {
    localStorage.removeItem("civicare_token");
    localStorage.removeItem("civicare_user");
    setUser(null); setPage("public");
  }

  function toggleTheme() {
    setTheme(t => t === "light" ? "dark" : "light");
  }

  function setLanguage(lang) {
    setLang(lang);
  }

  function finishTour() {
    if (user) localStorage.setItem(`civicare_toured_${user.id}`, "1");
    setShowTour(false);
  }

  if (loading) return (
    <div className="loading">
      <div className="loading-drop">💧</div>
      <p>{T[lang]?.loading || "Loading CiviCare..."}</p>
    </div>
  );

  function getDashboard() {
    if (!user) return <PublicDashboard />;
    switch (user.role) {
      case "officer": case "admin": return <OfficerDashboard />;
      case "corporator": return <CorporatorDashboard />;
      case "plumber": return <PlumberPortal />;
      default: return <CitizenDashboard />;
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, setPage, theme, toggleTheme, lang, setLanguage }}>
      <div className="app">
        <Navbar />
        {showTour && user && <OnboardingTour role={user.role} onFinish={finishTour} lang={lang} />}
        {page === "public"    && <PublicDashboard />}
        {page === "login"     && <LoginPage />}
        {page === "apply"     && <ApplyConnection />}
        {page === "track"     && <TrackApplication />}
        {page === "dashboard" && getDashboard()}
        {/* Floating chatbot — visible on all pages, works with or without login */}
        <Chatbot />
      </div>
    </AuthContext.Provider>
  );
}

function Navbar() {
  const { user, logout, setPage, theme, toggleTheme, lang, setLanguage } = useAuth();
  const t = T[lang] || T.en;

  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => setPage("public")}>
        <span className="brand-icon">
           <img src={logo} alt="CiviCare Logo" style={{ width: "92px", height: "auto" }} />
          </span>
        <span className="brand-text">{t.appName}</span>
        <span className="brand-sub">{t.tagline}</span>
      </div>
      <div className="navbar-links">
        <button className="nav-btn" onClick={() => setPage("public")}>{t.dashboard}</button>
        <button className="nav-btn" onClick={() => setPage("apply")}>{t.applyConn}</button>
        <button className="nav-btn" onClick={() => setPage("track")}>{t.trackApp}</button>
        {user ? (
          <>
            <button className="nav-btn" onClick={() => setPage("dashboard")}>{t.myPortal}</button>
            <span className="user-badge">
              {user.property_number || user.email} <em>({user.role})</em>
            </span>
            <button className="btn-primary nav-btn" onClick={logout}>{t.logout}</button>
          </>
        ) : (
          <button className="btn-primary nav-btn" onClick={() => setPage("login")}>{t.login}</button>
        )}
        {/* Language toggle */}
        <div className="lang-toggle">
          <button className={`lang-btn ${lang==="en"?"active":""}`} onClick={() => setLanguage("en")}>EN</button>
          <button className={`lang-btn ${lang==="mr"?"active":""}`} onClick={() => setLanguage("mr")}>म</button>
        </div>
        {/* Dark mode toggle */}
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle dark mode">
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>
    </nav>
  );
}
