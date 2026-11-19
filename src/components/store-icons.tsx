import type { SVGProps } from "react";

/** Simple, transparent storefront glyphs keyed by IGDB external_game_source / category ID. */
export function StoreIcon({ source, size = 16 }: { source: number; size?: number }) {
  const p: SVGProps<SVGSVGElement> = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true };
  const glyph = (label: string, font = 10) => (
    <svg {...p}>
      <text x="12" y="16.4" textAnchor="middle" fontSize={font} fontWeight={800} fill="currentColor" fontFamily="Arial, sans-serif">{label}</text>
    </svg>
  );
  switch (source) {
    case 1: // Steam
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="16.2" cy="7.8" r="2.8" fill="currentColor" stroke="none" />
          <circle cx="6.9" cy="17.1" r="2" />
          <path d="M8.3 15.7 14 10M6.3 9.4l4 4" />
        </svg>
      );
    case 5: // GOG
      return glyph("GOG", 8);
    case 10: // YouTube
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.6}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="M10.5 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 11: // Microsoft
      return (
        <svg {...p} fill="currentColor">
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <rect x="13" y="3" width="8" height="8" rx="1" />
          <rect x="3" y="13" width="8" height="8" rx="1" />
          <rect x="13" y="13" width="8" height="8" rx="1" />
        </svg>
      );
    case 13: // Apple
      return (
        <svg {...p} fill="currentColor">
          <path d="M15.6 12.7c0-2 1.6-3 1.7-3.1-.9-1.3-2.3-1.5-2.8-1.5-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.5-.7C7 8.1 5.6 9 4.9 10.4c-1.4 2.5-.4 6.2 1 8.2.7 1 1.5 2.1 2.5 2 1-.1 1.4-.6 2.6-.6s1.5.6 2.6.6c1.1 0 1.8-1 2.5-2 .7-1 1-2 1-2.1-.1 0-2-.8-2-3.8z" />
          <path d="M14 6.9c.5-.7.9-1.6.8-2.5-.8 0-1.8.5-2.4 1.2-.5.6-1 1.6-.8 2.4.9.1 1.8-.4 2.4-1.1z" />
        </svg>
      );
    case 14: // Twitch
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
          <path d="M4 3h16v11l-4.5 4.5H13L9.5 22v-3.5H4V3z" />
          <path d="M9 8v5M14 8v5" strokeLinecap="round" />
        </svg>
      );
    case 15: // Android
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <rect x="6" y="9" width="12" height="7.5" rx="3.5" />
          <path d="M6 12v3.5A3.5 3.5 0 0 0 9.5 19h5a3.5 3.5 0 0 0 3.5-3.5V12M8.5 6.5 10 9M15.5 6.5 14 9" />
          <circle cx="9.5" cy="12.7" r=".8" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="12.7" r=".8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 20: // Amazon (ASIN)
    case 22: // Amazon Luna
    case 23: // Amazon Adg
      return glyph("a", 14);
    case 26: // Epic Games
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
          <path d="M12 2.5 20 5.5v6c0 4.7-3.2 8.1-8 9.8-4.8-1.7-8-5.1-8-9.8v-6l8-3z" />
          <path d="M9.4 9h5.2M9.4 12h4.2M9.4 15h5.2" />
        </svg>
      );
    case 28: // Meta / Oculus
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.7}>
          <circle cx="9" cy="12" r="4.2" />
          <circle cx="15" cy="12" r="4.2" />
        </svg>
      );
    case 29: // Utomik
      return glyph("u");
    case 30: // itch.io
      return glyph("i");
    case 31: // Xbox marketplace
    case 54: // Xbox Game Pass Ultimate cloud
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <circle cx="12" cy="12" r="9.2" />
          <path d="M7.4 7.2c2.6 2.6 6.6 6.6 9.2 9.2M16.6 7.2c-2.6 2.6-6.6 6.6-9.2 9.2" />
        </svg>
      );
    case 32: // Kartridge
      return glyph("k");
    case 36: // PlayStation Store
      return (
        <svg {...p}>
          <text x="12" y="16.2" textAnchor="middle" fontSize="11" fontWeight={900} fontStyle="italic" fill="currentColor" fontFamily="Arial, sans-serif">PS</text>
        </svg>
      );
    case 37: // Focus Entertainment
      return glyph("f");
    case 55: // GameJolt
      return glyph("g");
    default:
      return (
        <svg {...p} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
      );
  }
}
