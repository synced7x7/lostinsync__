// Web-only sign-in screen shown before the app on a first visit. Local-first: signing in just connects Google Drive.
import { AlertTriangle, Cloud, Loader2 } from "lucide-react";
import { driveConfigured } from "./drive";
import { signIn, skipLogin, useSyncState } from "./sync";

export function LoginGate({ onDone }: { onDone: () => void }) {
  const s = useSyncState();
  const busy = s.busy !== null;

  const go = async () => {
    if (await signIn()) onDone();
  };
  const guest = async () => {
    await skipLogin();
    onDone();
  };

  return (
    <main className="login-gate">
      <section className="login-card">
        <h1>Lost in Sync</h1>
        <p>Sign in with Google to keep your library backed up to your own Google Drive and restore it on any browser.</p>
        <button className="login-google" onClick={() => void go()} disabled={busy || !driveConfigured}>
          {busy ? <Loader2 size={16} className="spin" /> : <Cloud size={16} />}
          {busy ? s.progress ?? "Connecting…" : "Continue with Google"}
        </button>
        {!driveConfigured && (
          <div className="login-error"><AlertTriangle size={14} /> Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID).</div>
        )}
        {s.error && <div className="login-error"><AlertTriangle size={14} /> {s.error}</div>}
        <button className="login-skip" onClick={() => void guest()} disabled={busy}>Continue on this device only</button>
        <small>Only a hidden app folder in your Drive is accessed. Your IGDB keys never leave this browser.</small>
      </section>
    </main>
  );
}
