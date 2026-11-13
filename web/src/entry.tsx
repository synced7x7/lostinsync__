// Web entry point: start the cloud-sync engine, then boot the unchanged app.
import "./cloud.css";
import { init } from "./sync";


void init();
import("../../src/main");

// web only: fullscreen is never automatic; it is allowed only right after the user presses F11
let f11At = 0;
window.addEventListener("keydown", (e) => { if (e.key === "F11") f11At = Date.now(); }, true);
const realFs = Element.prototype.requestFullscreen;
Element.prototype.requestFullscreen = function (this: Element, ...a: []) {
  return Date.now() - f11At < 1000 ? realFs.apply(this, a) : Promise.resolve();
};