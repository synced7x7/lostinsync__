import { useEffect } from "react";

// true if the element (or an ancestor) is its own scroll area, so we leave it alone
const scrollable = (el: Element | null) => {
  while (el && el !== document.body && el !== document.documentElement) {
    const s = getComputedStyle(el);
    if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) return true;
    el = el.parentElement;
  }
  return false;
};

export function useSmoothScroll(enabled = true, { ease = 0.14, step = 1 } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.scrollingElement ?? document.documentElement;
    let target = root.scrollTop;
    let raf = 0;

    const tick = () => {
      const diff = target - root.scrollTop;
      if (Math.abs(diff) < 0.5) { root.scrollTop = target; raf = 0; return; }
      root.scrollTop += diff * ease;
      raf = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented) return;
      const t = e.target as Element | null;
      // modals, the lightbox, the journey and form controls keep native scrolling
      if (t?.closest?.(".modal-backdrop, .lightbox, .jn-screen, textarea, select")) return;
      if (scrollable(t)) return;
      const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * root.clientHeight : e.deltaY;
      if (e.deltaMode === 0 && Math.abs(px) < 40) return; // touchpads are already smooth
      e.preventDefault();
      if (!raf) target = root.scrollTop;
      target = Math.max(0, Math.min(root.scrollHeight - root.clientHeight, target + px * step));
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onScroll = () => { if (!raf) target = root.scrollTop; };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled, ease, step]);
}