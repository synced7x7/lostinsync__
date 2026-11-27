export const isAndroidApp =
  "__TAURI_INTERNALS__" in globalThis && /Android/i.test(navigator.userAgent);

if (isAndroidApp) {
  document.documentElement.dataset.platform = "android";

  let vp = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!vp) {
    vp = document.createElement("meta");
    vp.name = "viewport";
    document.head.appendChild(vp);
  }
  vp.content = "width=device-width, initial-scale=1, viewport-fit=cover";

  // Policy: Android is always windowed (system bars handled via safe-area CSS).
  // main.tsx's enter() already swallows the rejection.
  Element.prototype.requestFullscreen = () =>
    Promise.reject(new Error("Fullscreen is disabled on Android"));

  void import("./android.css");
}
