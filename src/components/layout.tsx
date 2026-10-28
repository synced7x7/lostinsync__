import { Activity, BookOpen, ChevronRight, Gamepad2, LayoutDashboard, Search, Settings, UserRound, X } from "lucide-react";
import type { AppData, View } from "../domain/game";

export const navigation: { id: View; label: string; icon: typeof Activity }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "library", label: "Library", icon: Gamepad2 },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "journal", label: "Journal", icon: BookOpen },
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
        <Topbar data={data} view={view} onNavigate={onNavigate} />
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
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Gamepad2 size={20} /></span>
        <span>LOST IN SYNC<small>PERSONAL GAME OS</small></span>
      </div>
      <div className="profile-mini">
        <div className="avatar">{data.profile.displayName.slice(0, 1)}</div>
        <div><strong>{data.profile.displayName}</strong><span>Offline profile</span></div>
      </div>
      <nav>
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onNavigate(id)}>
            <Icon size={17} />{label}
            {id === "library" && data.games.length > 0 && <em>{data.games.length}</em>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="offline"><span></span> Local-first workspace</div>
        <small>v0.1.0 · Everything stays yours</small>
      </div>
    </aside>
  );
}

function Topbar({
  data,
  view,
  onNavigate,
}: {
  data: AppData;
  view: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <header className="topbar">
      <div className="crumb"><span>Workspace</span><ChevronRight size={14}/><strong>{navigation.find((item) => item.id === view)?.label}</strong></div>
      <div className="top-actions">
        <div className="top-search"><Search size={16}/><span>Quick find</span><kbd>⌘ K</kbd></div>
        <button className="icon-btn" onClick={() => onNavigate("settings")} aria-label="Settings"><Settings size={18}/></button>
        <button className="avatar small" onClick={() => onNavigate("profile")}>{data.profile.displayName.slice(0, 1)}</button>
      </div>
    </header>
  );
}
