const IGDB = `Linux|Nintendo 64|Wii|PC (Microsoft Windows)|PlayStation|PlayStation 2|PlayStation 3|Xbox|Xbox 360|PC DOS|Mac|Commodore C64/128|Amiga|Nintendo Entertainment System (NES)|Super Nintendo Entertainment System (SNES)|Nintendo DS|Nintendo GameCube|Game Boy Color|Dreamcast|Game Boy Advance|Amstrad CPC|ZX Spectrum|MSX|Sega Mega Drive/Genesis|Sega 32X|Sega Saturn|Game Boy|Android|Sega Game Gear|Xbox Live Arcade|Nintendo 3DS|PlayStation Portable|iOS|Wii U|N-Gage|Tapwave Zodiac|PlayStation Network|PlayStation Vita|Virtual Console (Nintendo)|PlayStation 4|Xbox One|3DO Interactive Multiplayer|Family Computer Disk System|Arcade|MSX2|Mobile|Legacy Mobile Devices|Legacy Computer|WiiWare|WonderSwan|Super Famicom|Atari 2600|Atari 7800|Atari Lynx|Atari Jaguar|Atari ST/STE|Sega Master System|Atari 8-bit|Atari 5200|Intellivision|ColecoVision|BBC Microcomputer System|Vectrex|Commodore VIC-20|Ouya|BlackBerry OS|Windows Phone|Apple II|Sharp X1|Sega CD|Neo Geo MVS|Neo Geo AES|Web browser|SG-1000|Donner Model 30|TurboGrafx-16/PC Engine|Virtual Boy|Odyssey|Microvision|Commodore PET|Bally Astrocade|SteamOS|Commodore 16|Commodore Plus/4|PDP-1|PDP-10|PDP-8|DEC GT40|Family Computer (FAMICOM)|Analogue electronics|Ferranti Nimrod Computer|EDSAC|PDP-7|HP 2100|HP 3000|SDS Sigma 7|Call-A-Computer time-shared mainframe computer system|PDP-11|CDC Cyber 70|PLATO|Imlac PDS-1|Microcomputer|OnLive Game System|Amiga CD32|Apple IIGS|Acorn Archimedes|Philips CD-i|FM Towns|Neo Geo Pocket|Neo Geo Pocket Color|Sharp X68000|Nuon|WonderSwan Color|SwanCrystal|PC-8801|TRS-80|Fairchild Channel F|PC Engine SuperGrafx|Texas Instruments TI-99|Nintendo Switch|Nintendo PlayStation|Amazon Fire TV|Philips Videopac G7000|Acorn Electron|Hyper Neo Geo 64|Neo Geo CD|New Nintendo 3DS|VC 4000|1292 Advanced Programmable Video System|AY-3-8500|AY-3-8610|PC-50X Family|AY-3-8760|AY-3-8710|AY-3-8603|AY-3-8605|AY-3-8606|AY-3-8607|PC-98|Turbografx-16/PC Engine CD|TRS-80 Color Computer|FM-7|Dragon 32/64|Amstrad PCW|Tatung Einstein|Thomson MO5|NEC PC-6000 Series|Commodore CDTV|Nintendo DSi|Nintendo eShop|Windows Mixed Reality|Oculus VR|SteamVR|Daydream|PlayStation VR|Pokémon mini`;

const EXTRA = `PlayStation 5|PlayStation VR2|Xbox Series X|S|Nintendo Switch 2|Steam Deck|Google Stadia|Amazon Luna|Meta Quest 2|Meta Quest 3|Playdate|Evercade|Analogue Pocket|Sega Pico|Xbox Cloud Gaming|GeForce NOW`;

// "Xbox Series X|S" contains the separator, so protect it
const split = (s: string) => s.replace("Xbox Series X|S", "Xbox Series X\u0000S").split("|").map((x) => x.replace("\u0000", "|"));

const PRIORITY = [
  "PC (Microsoft Windows)", "PlayStation 5", "PlayStation 4", "Xbox Series X|S", "Xbox One",
  "Nintendo Switch", "Nintendo Switch 2", "Steam Deck", "Android", "iOS", "Mac", "Linux",
];

export const PC = "PC (Microsoft Windows)";
export const ALL_PLATFORMS: string[] = [
  ...PRIORITY,
  ...[...new Set([...split(IGDB), ...split(EXTRA)])].filter((p) => !PRIORITY.includes(p)).sort((a, b) => a.localeCompare(b)),
];

// Names that are the same hardware family count as "the same platform"
const ALIAS: Record<string, string> = {
  "PC": "pc", "PC (Microsoft Windows)": "pc",
  "Nintendo Entertainment System (NES)": "nes", "Family Computer (FAMICOM)": "nes",
  "Super Nintendo Entertainment System (SNES)": "snes", "Super Famicom": "snes",
  "TurboGrafx-16/PC Engine": "pce", "Turbografx-16/PC Engine CD": "pce",
};
const key = (n: string) => ALIAS[n] ?? n.toLowerCase();

/** Platforms the user played on that the game never released for = emulation. */
export function emulatedOn(played: string[], released: string[]): string[] {
  if (!released.length) return [];
  const keys = new Set(released.map(key));
  return played.filter((p) => !keys.has(key(p)));
}