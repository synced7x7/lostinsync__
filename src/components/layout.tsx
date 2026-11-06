import { useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  LayoutDashboard,
  Route,
  Settings,
  X,
  Trophy,
  Compass,
  BarChart3,
} from "lucide-react";
import type { AppData, View } from "../domain/game";

export const navigation: { id: View; label: string; icon: typeof BookOpen }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "library", label: "Library", icon: Gamepad2 },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "journey", label: "Game Journey", icon: Route },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "trophies", label: "Trophies", icon: Trophy },
  { id: "settings", label: "Settings", icon: Settings },

];

export function AppLayout({
  data,
  view,
  onNavigate,
  error,
  children,
}: {
  data: AppData;
  view: View;
  onNavigate: (view: View) => void;
  error: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <Sidebar data={data} view={view} onNavigate={onNavigate} />
      <main className="main">
        {error && (
          <div className="toast error">
            <X size={15} />
            {error}
          </div>
        )}
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

function Sidebar({
  data,
  view,
  onNavigate,
}: {
  data: AppData;
  view: View;
  onNavigate: (view: View) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleNavigate = (id: View) => {
    onNavigate(id);
    if (typeof window !== "undefined" && window.innerWidth <= 750) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`sidebar ${isOpen ? "open" : "closed"}`}
        aria-label="Sidebar navigation"
      >
        <div className="sidebar-header">
          <div
            className="brand"
            onClick={() => !isOpen && setIsOpen(true)}
            title={isOpen ? "Lost in Sync" : "Lost in Sync (Click to expand)"}
            style={{ cursor: !isOpen ? "pointer" : "default" }}
          >
            <span className="brand-mark">
              <Gamepad2 size={20} />
            </span>
            {isOpen && (
              <span className="brand-text">
                LOST IN SYNC
                <small>PERSONAL GAME OS</small>
              </span>
            )}
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setIsOpen((prev) => !prev)}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={isOpen}
          >
            {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        <div className="profile-mini" title={data.profile.displayName}>
          <div className="avatar">
            {data.profile.picture
              ? <img src={data.profile.picture} alt="" />
              : data.profile.displayName.slice(0, 1)}
          </div>
          {isOpen && (
            <div className="profile-info">
              <strong>{data.profile.displayName}</strong>
              <span>Offline profile</span>
            </div>
          )}
        </div>

        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => handleNavigate(id)}
              title={label}
              aria-label={label}
            >
              <Icon size={18} />
              {isOpen && <span className="nav-label">{label}</span>}
              {isOpen && id === "library" && data.games.length > 0 && (
                <em>{data.games.length}</em>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="offline">
            <span title="Local-first workspace"></span>
            {isOpen && (
              <span className="sidebar-bottom-text">Local-first workspace</span>
            )}
          </div>
          {isOpen && <small>v0.1.0 · Everything stays yours</small>}
        </div>
      </aside>
      {!isOpen && (
        <button
          type="button"
          className="fullscreen-sidebar-toggle glass"
          onClick={() => setIsOpen(true)}
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </>
  );
}
