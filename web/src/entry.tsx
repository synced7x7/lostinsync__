// Web entry point: start the cloud-sync engine, then boot the unchanged app.
import "./cloud.css";
import { init } from "./sync";


void init();
import("../../src/main");


// web only: never auto-enter fullscreen
Element.prototype.requestFullscreen = () => Promise.resolve();
(document as any).webkitExitFullscreen?.();
if (document.fullscreenElement) void document.exitFullscreen();
