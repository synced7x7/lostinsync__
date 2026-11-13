// Web entry point: start the cloud-sync engine, show the sign-in screen on first visit, then boot the unchanged app.
import "./cloud.css";
import { createRoot } from "react-dom/client";
import { init, needsLogin } from "./sync";
import { LoginGate } from "./login-gate";

const startApp = () => import("../../../src/main");

async function boot() {
  await init();
  if (!needsLogin()) return void startApp();
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  root.render(<LoginGate onDone={() => { root.unmount(); void startApp(); }} />);
}

void boot();
