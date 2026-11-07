import { STATUSES, type Game } from "./game";
import { evaluate, RARITY_LABEL, type Rarity } from "./trophies";
import { emulatedOn, PC } from "../data/platform";

export type Opt = Record<string, any>;
type Tone = "violet" | "cyan" | "rose" | "gold" | "green" | "blue";
export type Tile = { label: string; value: string; sub?: string; tone?: Tone };
export type ChartSpec = { id: string; title: string; note?: string; option?: Opt; tabs?: { label: string; option: Opt }[]; height?: number; wide?: boolean };
export type Section = { tiles: Tile[]; charts: ChartSpec[]; story?: { title: string; text: string }[] };
export type CategoryId = "overview" | "activity" | "genres" | "platforms" | "eras" | "franchises" | "developers" | "ratings" | "length" | "exploration" | "milestones" | "records" | "insights";

export const CATEGORIES: { id: CategoryId; title: string; blurb: string; tone: Tone }[] = [
  { id: "overview", title: "Overview", blurb: "Library size, completion rate and your years in the hobby", tone: "violet" },
  { id: "activity", title: "Activity", blurb: "How fast you finish games and how busy each period gets", tone: "cyan" },
  { id: "genres", title: "Genres", blurb: "What you collect, finish and love most", tone: "rose" },
  { id: "platforms", title: "Platforms", blurb: "Where you play, emulation included", tone: "blue" },
  { id: "eras", title: "Release Eras", blurb: "Which generations of gaming history you've explored", tone: "gold" },
  { id: "franchises", title: "Franchises", blurb: "The series you keep coming back to", tone: "green" },
  { id: "developers", title: "Developers", blurb: "The studios behind your library", tone: "violet" },
  { id: "ratings", title: "Ratings", blurb: "What your scores say about your taste", tone: "gold" },
  { id: "length", title: "Game Length", blurb: "Short, long and everything in between", tone: "cyan" },
  { id: "exploration", title: "Exploration", blurb: "How widely you roam across genres, studios and eras", tone: "green" },
  { id: "milestones", title: "Milestones", blurb: "Badges unlocked across every rarity", tone: "rose" },
  { id: "records", title: "Personal Records", blurb: "Your best years, months, weeks and streaks", tone: "blue" },
  { id: "insights", title: "Insights", blurb: "What your habits say about you", tone: "violet" },
];

/* ============================ row index (one pass) ============================ */
const DAY = 86_400_000;
const ALL_GENRES = 23; // genres IGDB offers
const OFF = ["Backlog", "Wishlist"];
type R = { g: Game; id: string; s?: number; f?: number; days?: number; rel?: number; genres: string[]; platform: string; fr: string[]; dev?: string; rating?: number; len?: number; done: boolean; played: boolean; at: number };
const ts = (d?: string) => { const n = Date.parse(d ?? ""); return Number.isNaN(n) ? undefined : n; };

export const index = (games: Game[]): R[] => games.map((g) => {
  const s = ts(g.startedAt), f = ts(g.finishedAt), p = g.playedPlatforms?.[0] ?? g.platform;
  return {
    g, id: g.id, s, f,
    days: s !== undefined && f !== undefined && f >= s ? Math.round((f - s) / DAY) + 1 : undefined, // inclusive start→finish days
    rel: Number((g.releaseDate ?? "").slice(0, 4)) || undefined,
    genres: (g.genres?.length ? g.genres : (g.genre ?? "").split(",")).map((x) => x.trim()).filter(Boolean),
    platform: p ? (p === "PC" ? PC : p) : "Unknown", // platform = where it was played (emulated or not)
    fr: g.franchises ?? [], dev: g.developer?.trim() || undefined, rating: g.rating || undefined,
    len: g.timeAvgSeconds ? g.timeAvgSeconds / 3600 : undefined, // IGDB average time to complete, in hours
    done: g.status === "Completed", played: !OFF.includes(g.status), at: f ?? s ?? (Date.parse(g.createdAt) || 0),
    };
});

export const yearsOf = (games: Game[]) => [...new Set(games.flatMap((g) => { const t = [ts(g.startedAt), ts(g.finishedAt)].filter(isNum); return (t.length ? t : [Date.parse(g.createdAt)]).filter((x) => !Number.isNaN(x)).map((x) => new Date(x).getUTCFullYear()); }))].sort((a, b) => b - a);
export const touchedIn = (g: Game, y: number) => { const t = [ts(g.startedAt), ts(g.finishedAt)].filter(isNum); return (t.length ? t : [Date.parse(g.createdAt)]).some((x) => new Date(x).getUTCFullYear() === y); };

/* ============================ helpers ============================ */
const isNum = (v: number | undefined): v is number => v !== undefined;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const f1 = (n: number) => String(Math.round(n * 10) / 10);
const hrs = (n: number) => `${n >= 10 ? Math.round(n) : f1(n)}h`;
const dash = "—";
const cut = (s: string, n = 24) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const yr = (t: number) => new Date(t).getUTCFullYear();
const mo = (t: number) => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const wk = (t: number) => Math.floor((Math.floor(t / DAY) + 3) / 7); // Monday-based week index
const moLabel = (k: number) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const T = (label: string, value: string, sub?: string, tone?: Tone): Tile => ({ label, value, sub, tone });

function ymd(a: number, b: number) {
  const A = new Date(a), B = new Date(b);
  let y = B.getUTCFullYear() - A.getUTCFullYear(), m = B.getUTCMonth() - A.getUTCMonth(), d = B.getUTCDate() - A.getUTCDate();
  if (d < 0) { m--; d += new Date(Date.UTC(B.getUTCFullYear(), B.getUTCMonth(), 0)).getUTCDate(); }
  if (m < 0) { y--; m += 12; }
  return `${y}y : ${m}m : ${d}d`;
}
function count<K>(rows: R[], key: (r: R) => K | undefined) { const m = new Map<K, number>(); rows.forEach((r) => { const k = key(r); if (k !== undefined) m.set(k, (m.get(k) ?? 0) + 1); }); return m; }
const peak = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1])[0];
function top<X>(a: X[], f: (x: X) => number, dir = 1): X | undefined { return [...a].sort((x, y) => dir * (f(y) - f(x)))[0]; }

type Agg = { name: string; n: number; done: number; days: number; spanN: number; rated: number; rating: number; avgDays: number };
function agg(rows: R[], keys: (r: R) => string[]): Agg[] {
  const m = new Map<string, R[]>();
  rows.forEach((r) => keys(r).forEach((k) => (m.get(k) ?? m.set(k, []).get(k)!).push(r)));
  return [...m].map(([name, rs]) => {
    const rated = rs.filter((r) => r.rating), sp = rs.filter((r) => r.days);
    return { name, n: rs.length, done: rs.filter((r) => r.done).length, days: sum(sp.map((r) => r.days!)), spanN: sp.length, rated: rated.length, rating: avg(rated.map((r) => r.rating!)), avgDays: avg(sp.map((r) => r.days!)) };
  });
}
const ratedPool = (a: Agg[]) => { const p = a.filter((x) => x.rated >= 2); return p.length ? p : a.filter((x) => x.rated > 0); };
const tl = (label: string, x: Agg | undefined, sub: (x: Agg) => string, tone?: Tone) => T(label, x?.name ?? dash, x ? sub(x) : "No data yet", tone);
const evenness = (c: number[]) => { const t = sum(c); if (c.length < 2 || !t) return 0; return (-sum(c.map((n) => (n / t) * Math.log(n / t))) / Math.log(c.length)) * 100; };
function corr(p: [number, number, string][]) { if (p.length < 5) return undefined; const mx = avg(p.map((a) => a[0])), my = avg(p.map((a) => a[1])); let xy = 0, xx = 0, yy = 0; p.forEach(([x, y]) => { xy += (x - mx) * (y - my); xx += (x - mx) ** 2; yy += (y - my) ** 2; }); return xx && yy ? xy / Math.sqrt(xx * yy) : undefined; }
function trend(p: [number, number, string][]): [number, number][] | undefined { if (p.length < 3) return; const mx = avg(p.map((a) => a[0])), my = avg(p.map((a) => a[1])); let n = 0, d = 0; p.forEach(([x, y]) => { n += (x - mx) * (y - my); d += (x - mx) ** 2; }); if (!d) return; const b = n / d, a = my - b * mx, xs = p.map((q) => q[0]), x0 = Math.min(...xs), x1 = Math.max(...xs); return [[x0, a + b * x0], [x1, a + b * x1]]; }
const verdict = (r: number | undefined, hi: string, lo: string, flat: string) => (r === undefined ? "Rate a few more games to unlock this insight." : r > 0.3 ? hi : r < -0.3 ? lo : flat);

const ERAS: [string, number, number][] = [["Pre-1990", 0, 1989], ["1990s", 1990, 1999], ["2000s", 2000, 2009], ["2010s", 2010, 2019], ["2020s", 2020, 2029]];
const eraOf = (y?: number) => (y === undefined ? undefined : ERAS.find((e) => y >= e[1] && y <= e[2])?.[0]);

/* ============================ ECharts option builders (purple theme) ============================ */
const C = ["#a495ff", "#67d8e6", "#f08ab5", "#e7c56c", "#75a8ee", "#7bd88f", "#ff9f6b", "#c58bff", "#5eead4", "#f472b6"];
const MUTED = "#9b98b5";
const AX = { axisLine: { lineStyle: { color: "rgba(255,255,255,.14)" } }, axisTick: { show: false }, axisLabel: { color: MUTED, fontSize: 11 }, splitLine: { lineStyle: { color: "rgba(255,255,255,.06)" } } };
const TIP = { backgroundColor: "rgba(16,14,34,.94)", borderColor: "rgba(164,149,255,.35)", textStyle: { color: "#eee", fontSize: 12 }, extraCssText: "backdrop-filter:blur(8px);border-radius:10px" };
const LEG = { textStyle: { color: MUTED }, top: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10 };
const grad = (c: string) => ({ type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: c }, { offset: 1, color: c + "55" }] });
const GLASS_VM = { calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 90, inRange: { color: ["rgba(255,255,255,.05)", "#4b3f9e", "#a495ff", "#67d8e6"] }, textStyle: { color: MUTED } };

type S = { name: string; data: number[]; color?: string; kind?: "bar" | "line" | "area"; stack?: string; y2?: boolean };
function cartesian(cats: string[], series: S[], o: { horizontal?: boolean; zoom?: boolean; max?: number; rotate?: number } = {}): Opt {
  const catAxis = { type: "category", data: cats, ...AX, splitLine: { show: false }, axisLabel: { ...AX.axisLabel, rotate: o.rotate ?? 0, interval: o.horizontal ? 0 : "auto" } };
  const val = { type: "value", ...AX, max: o.max };
  const lines = series.every((s) => s.kind === "line" || s.kind === "area");
  return {
    color: C, tooltip: { trigger: "axis", axisPointer: { type: lines ? "line" : "shadow", shadowStyle: { color: "rgba(164,149,255,.08)" } }, ...TIP },
    legend: series.length > 1 ? LEG : undefined,
    grid: { left: 6, right: 16, top: series.length > 1 ? 36 : 14, bottom: o.zoom ? 40 : 6, containLabel: true },
    xAxis: o.horizontal ? val : catAxis,
    yAxis: o.horizontal ? { ...catAxis, inverse: true } : series.some((s) => s.y2) ? [val, { ...val, splitLine: { show: false } }] : val,
    dataZoom: o.zoom ? [{ type: "inside" }, { type: "slider", height: 16, bottom: 6, borderColor: "transparent", backgroundColor: "rgba(255,255,255,.04)", fillerColor: "rgba(164,149,255,.2)", handleStyle: { color: "#a495ff" }, textStyle: { color: MUTED } }] : undefined,
    series: series.map((s, i) => {
      const color = s.color ?? C[i % C.length], line = s.kind === "line" || s.kind === "area";
      return { name: s.name, type: line ? "line" : "bar", data: s.data, stack: s.stack, yAxisIndex: s.y2 ? 1 : 0, smooth: line, symbol: "circle", symbolSize: 6, showSymbol: s.data.length < 40, areaStyle: s.kind === "area" ? { opacity: 0.35 } : undefined, lineStyle: line ? { width: 3 } : undefined, itemStyle: line ? { color } : { color: o.horizontal ? color : grad(color), borderRadius: o.horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] }, barMaxWidth: 28, emphasis: { focus: "series" } };
    }),
  };
}
function donut(data: { name: string; value: number }[], o: { rose?: boolean; unit?: string } = {}): Opt {
  return { color: C, tooltip: { ...TIP, trigger: "item", formatter: (p: any) => `<b>${p.name}</b><br/>${p.value}${o.unit ? " " + o.unit : ""} (${p.percent}%)` }, legend: { ...LEG, top: undefined, bottom: 0, type: "scroll" },
    series: [{ type: "pie", radius: ["46%", "72%"], center: ["50%", "46%"], roseType: o.rose ? "radius" : undefined, itemStyle: { borderRadius: 8, borderColor: "#0e0c1f", borderWidth: 3 }, label: { show: false }, emphasis: { scaleSize: 6, label: { show: true, color: "#fff", fontSize: 14, fontWeight: 700, formatter: "{b}\n{d}%" } }, data }] };
}
function ring(pct: number, label: string, color = C[0]): Opt {
  return { series: [{ type: "pie", radius: ["66%", "84%"], startAngle: 90, silent: true, label: { show: true, position: "center", formatter: `{a|${Math.round(pct)}%}\n{b|${label}}`, rich: { a: { fontSize: 36, fontWeight: 800, color: "#fff" }, b: { fontSize: 11, color: MUTED, lineHeight: 24 } } }, itemStyle: { borderRadius: 10 }, data: [{ value: pct, itemStyle: { color } }, { value: Math.max(0, 100 - pct), itemStyle: { color: "rgba(255,255,255,.07)" } }] }] };
}
function scatter(pts: [number, number, string][], xName: string, yName: string): Opt {
  const line = trend(pts);
  return { tooltip: { ...TIP, trigger: "item", formatter: (p: any) => (p.data?.[2] ? `<b>${p.data[2]}</b><br/>${xName}: ${p.data[0]}<br/>${yName}: ${p.data[1]}` : "") },
    grid: { left: 6, right: 16, top: 16, bottom: 26, containLabel: true },
    xAxis: { type: "value", name: xName, nameLocation: "middle", nameGap: 30, nameTextStyle: { color: MUTED }, scale: true, ...AX },
    yAxis: { type: "value", name: yName, nameTextStyle: { color: MUTED }, min: 0, max: 10, ...AX },
    series: [{ type: "scatter", data: pts, symbolSize: 12, itemStyle: { color: "#a495ff", shadowBlur: 10, shadowColor: "rgba(164,149,255,.6)", opacity: 0.85 } }, ...(line ? [{ type: "line", data: line, symbol: "none", silent: true, lineStyle: { color: "#67d8e6", width: 2, type: "dashed" } }] : [])] };
}
function evolution(rows: R[], names: string[], keys: (x: R) => string[]): Opt {
  const act = rows.filter((x) => x.at > 0);
  if (!act.length) return cartesian([], []);
  const ys = range(Math.min(...act.map((x) => yr(x.at))), Math.max(...act.map((x) => yr(x.at))));
  return cartesian(ys.map(String), names.map((n) => ({ name: cut(n), kind: "area" as const, stack: "e", data: ys.map((y) => act.filter((x) => yr(x.at) === y && keys(x).includes(n)).length) })));
}
const slice = (a: Agg[], key: (x: Agg) => number, n: number) => { const s = [...a].filter((x) => key(x) > 0).sort((x, y) => key(y) - key(x)), rest = sum(s.slice(n).map(key)); return [...s.slice(0, n).map((x) => ({ name: cut(x.name), value: Math.round(key(x) * 10) / 10 })), ...(rest ? [{ name: "Other", value: Math.round(rest) }] : [])]; };
const stackedCollection = (a: Agg[], n = 12) => { const t = [...a].sort((x, y) => y.n - x.n).slice(0, n); return cartesian(t.map((x) => cut(x.name)), [{ name: "Completed", data: t.map((x) => x.done), stack: "c", color: "#a495ff" }, { name: "Not completed", data: t.map((x) => x.n - x.done), stack: "c", color: "#3b3470" }], { horizontal: true }); };

/* ============================ categories ============================ */
function overview(r: R[]): Section {
  const done = r.filter((x) => x.done).length, started = r.filter((x) => x.played).length, rate = started ? (done / started) * 100 : 0;
  const st = r.map((x) => x.s ?? x.f).filter(isNum), en = r.map((x) => x.f ?? x.s).filter(isNum), rated = r.filter((x) => x.rating);
  const added = [...count(r, (x) => { const t = Date.parse(x.g.createdAt); return Number.isNaN(t) ? undefined : mo(t); })].sort((a, b) => a[0] - b[0]);
  const ks = added.length ? range(added[0][0], added[added.length - 1][0]) : [], m = new Map(added); let run = 0;
  return {
    tiles: [
      T("Total games", String(r.length), "in your library", "violet"), T("Completed", String(done), "marked as completed", "green"), T("Started", String(started), "backlog & wishlist excluded", "cyan"),
      T("Completion rate", `${f1(rate)}%`, "completed ÷ started", "gold"),
      T("Time in the hobby", st.length ? ymd(Math.min(...st), Math.max(...en)) : dash, "first start → latest finish (years : months : days)", "rose"),
      T("Mean rating", rated.length ? `${f1(avg(rated.map((x) => x.rating!)))} /10` : dash, `${rated.length} rated games`, "blue"),
    ],
    charts: [
      { id: "status", title: "Library by status", option: donut(STATUSES.map((s) => ({ name: s, value: r.filter((x) => x.g.status === s).length })).filter((d) => d.value), { unit: "games" }) },
      { id: "rate", title: "Completion rate", note: "Completed games out of every game you've actually started.", option: ring(rate, "completed") },
      { id: "growth", title: "Library growth", note: "Cumulative games added, month by month.", wide: true, option: cartesian(ks.map(moLabel), [{ name: "Games", kind: "area", data: ks.map((k) => (run += m.get(k) ?? 0)) }], { zoom: ks.length > 18 }) },
    ],
  };
}

function activity(r: R[]): Section {
  const sp = r.filter((x) => x.done && x.days), dv = sp.map((x) => x.days!);
  const touch = (key: (t: number) => number) => { const m = new Map<number, Set<string>>(); r.forEach((x) => [x.s, x.f].forEach((t) => { if (t !== undefined) { const k = key(t); (m.get(k) ?? m.set(k, new Set()).get(k)!).add(x.id); } })); return new Map([...m].map(([k, v]) => [k, v.size] as [number, number])); };
  const W = touch(wk), M = touch(mo), Y = touch(yr), per = (m: Map<number, number>) => { const k = [...m.keys()]; return k.length ? sum([...m.values()]) / (Math.max(...k) - Math.min(...k) + 1) : 0; };
  const now = Date.now(), lo = top(sp, (x) => x.days!, -1), hi = top(sp, (x) => x.days!);
  const B: [string, number, number][] = [["< 5 days", 0, 5], ["5–15", 5, 15], ["15–30", 15, 30], ["30–60", 30, 60], ["60–90", 60, 90], ["90+ days", 90, Infinity]];
  const sm = count(r, (x) => (x.s === undefined ? undefined : mo(x.s))), fm = count(r, (x) => (x.f === undefined || !x.done ? undefined : mo(x.f)));
  const all = [...sm.keys(), ...fm.keys()], ks = all.length ? range(Math.min(...all), Math.max(...all)) : [];
  const cal = new Map<string, number>(); r.forEach((x) => [x.s, x.f].forEach((t) => { if (t !== undefined) cal.set(iso(t), (cal.get(iso(t)) ?? 0) + 1); }));
  const cy = cal.size ? Math.max(...[...cal.keys()].map((k) => Number(k.slice(0, 4)))) : new Date().getUTCFullYear();
  const cd = [...cal].filter(([k]) => k.startsWith(String(cy)));
  const pk = (m: Map<number, number>, l: (k: number) => string) => { const p = peak(m); return p ? { v: `${p[1]} games`, s: l(p[0]) } : { v: dash, s: "No data yet" }; };
  const pw = pk(W, (k) => `week of ${iso((k * 7 - 3) * DAY)}`), pm = pk(M, moLabel), py = pk(Y, String);
  return {
    tiles: [
      T("Longest journey", hi ? `${hi.days} days` : dash, hi?.g.title ?? "Needs start & finish dates", "rose"), T("Average journey", dv.length ? `${f1(avg(dv))} days` : dash, "start → finish, completed games", "violet"), T("Shortest journey", lo ? `${lo.days} days` : dash, lo?.g.title ?? "", "green"),
      T("Busiest week", pw.v, pw.s, "cyan"), T("Busiest month", pm.v, pm.s, "cyan"), T("Busiest year", py.v, py.s, "cyan"),
      T("Weekly average", f1(per(W)), "games / week", "blue"), T("Monthly average", f1(per(M)), "games / month", "blue"), T("Yearly average", f1(per(Y)), "games / year", "blue"),
      T("Played this month", String(M.get(mo(now)) ?? 0), "started or finished", "gold"), T("Played this year", String(Y.get(yr(now)) ?? 0), "started or finished", "gold"),
      T("Finished this week", String(r.filter((x) => x.done && x.f !== undefined && wk(x.f) === wk(now)).length), "completed games", "gold"),
    ],
    charts: [
      { id: "dist", title: "Completion journey distribution", note: "How long games take you from first start to final finish.", option: cartesian(B.map((b) => b[0]), [{ name: "Games", data: B.map(([, a, b]) => dv.filter((v) => v >= a && v < b).length) }]) },
      { id: "calendar", title: `Activity calendar · ${cy}`, note: "Each square is a day you started or finished a game.", option: { tooltip: { ...TIP, formatter: (p: any) => `${p.data[0]}: ${p.data[1]} event(s)` }, visualMap: { ...GLASS_VM, min: 0, max: Math.max(1, ...cd.map((d) => d[1])) }, calendar: { range: String(cy), top: 30, left: 40, right: 12, cellSize: ["auto", 15], itemStyle: { color: "transparent", borderColor: "rgba(255,255,255,.06)", borderWidth: 1 }, splitLine: { show: false }, yearLabel: { color: MUTED }, monthLabel: { color: MUTED }, dayLabel: { color: MUTED, firstDay: 1 } }, series: [{ type: "heatmap", coordinateSystem: "calendar", data: cd }] }, height: 260 },
      { id: "timeline", title: "Starts vs completions", note: "Month-by-month rhythm. Drag the slider to zoom.", wide: true, option: cartesian(ks.map(moLabel), [{ name: "Started", kind: "area", data: ks.map((k) => sm.get(k) ?? 0) }, { name: "Completed", kind: "area", data: ks.map((k) => fm.get(k) ?? 0) }], { zoom: true }) },
    ],
  };
}

function genres(r: R[]): Section {
  const a = agg(r, (x) => x.genres), spn = a.filter((x) => x.days > 0), rp = ratedPool(a);
  return {
    tiles: [
      tl("Most collected", top(a, (x) => x.n), (x) => `${x.n} games`, "violet"), tl("Most time invested", top(spn, (x) => x.days), (x) => `${x.days} days start → finish`, "cyan"), tl("Most completed", top(a, (x) => x.done), (x) => `${x.done} completed`, "green"),
      tl("Least time invested", top(spn, (x) => x.days, -1), (x) => `${x.days} days start → finish`, "blue"), tl("Favorite", top(rp, (x) => x.rating), (x) => `${f1(x.rating)}/10 average`, "gold"), tl("Lowest rated", top(rp, (x) => x.rating, -1), (x) => `${f1(x.rating)}/10 average`, "rose"), tl("Most rated", top(a, (x) => x.rated), (x) => `${x.rated} rated games`, "violet"),
    ],
    charts: [
      { id: "size", title: "Genre collection size", option: stackedCollection(a), height: 360 },
      { id: "time", title: "Time invested per genre", note: "Days between starting and finishing games of that genre.", option: donut(slice(a, (x) => x.days, 8), { rose: true, unit: "days" }), height: 360 },
      { id: "evo", title: "Genre evolution", note: "Games per genre by year of activity (top 6 genres).", wide: true, option: evolution(r, [...a].sort((x, y) => y.n - x.n).slice(0, 6).map((x) => x.name), (x) => x.genres) },
    ],
  };
}

function platforms(r: R[]): Section {
  const a = agg(r, (x) => [x.platform]), spn = a.filter((x) => x.days > 0), rp = ratedPool(a);
  const known = r.filter((x) => x.g.platforms?.length), emu = known.filter((x) => emulatedOn(x.g.playedPlatforms ?? [x.platform], x.g.platforms ?? []).length > 0).length;
  const avgD = [...spn].sort((x, y) => y.avgDays - x.avgDays).slice(0, 10);
  return {
    tiles: [
      tl("Most time invested", top(spn, (x) => x.days), (x) => `${x.days} days start → finish`, "cyan"), tl("Most completed", top(a, (x) => x.done), (x) => `${x.done} completed`, "green"), tl("Largest collection", top(a, (x) => x.n), (x) => `${x.n} games`, "violet"), tl("Favorite", top(rp, (x) => x.rating), (x) => `${f1(x.rating)}/10 average`, "gold"),
      T("Emulation rate", known.length ? `${f1((emu / known.length) * 100)}%` : dash, "played on a platform the game never released for", "rose"), T("Emulated games", String(emu), "total", "rose"),
    ],
    charts: [
      { id: "size", title: "Platform collection size", option: stackedCollection(a, 10), height: 340 },
      { id: "emu", title: "Native vs emulated", option: donut([{ name: "Native", value: known.length - emu }, { name: "Emulated", value: emu }], { unit: "games" }), height: 340 },
      { id: "avg", title: "Average journey per game", note: "Average days from start to finish per platform.", option: cartesian(avgD.map((x) => cut(x.name, 14)), [{ name: "Days", data: avgD.map((x) => Math.round(x.avgDays * 10) / 10) }], { rotate: 20 }) },
      { id: "evo", title: "Platform evolution", note: "Where you played over the years (top 6).", option: evolution(r, [...a].sort((x, y) => y.n - x.n).slice(0, 6).map((x) => x.name), (x) => [x.platform]) },
    ],
  };
}

function eras(r: R[]): Section {
  const D = r.filter((x) => x.rel), pl = D.filter((x) => x.played), dn = D.filter((x) => x.done);
  const ex = (rows: R[], dir: number, label: string, tone: Tone) => { const x = top(rows, (y) => y.rel!, dir); return T(label, x ? String(x.rel) : dash, x?.g.title ?? "No data yet", tone); };
  const dec = agg(D, (x) => [`${Math.floor(x.rel! / 10) * 10}s`]).sort((a, b) => a.name.localeCompare(b.name));
  const py = count(D, (x) => x.rel), mode = peak(py), td = top(dec.filter((x) => x.days), (x) => x.days), cd = top(dec, (x) => x.done);
  const col = (label: string, n: number, tone: Tone) => T(label, String(n), D.length ? `${f1((n / D.length) * 100)}% of dated library` : "", tone);
  const ys = D.length ? range(Math.min(...D.map((x) => x.rel!)), Math.max(...D.map((x) => x.rel!))) : [];
  return {
    tiles: [
      ex(pl, -1, "Oldest game played", "gold"), ex(pl, 1, "Newest game played", "cyan"), ex(dn, -1, "Oldest game completed", "gold"), ex(dn, 1, "Newest game completed", "cyan"),
      T("Most represented year", mode ? String(mode[0]) : dash, mode ? `${mode[1]} games` : "", "violet"), tl("Most time invested", td, (x) => `${x.days} days start → finish`, "rose"), tl("Most completed", cd, (x) => `${x.done} completed`, "green"),
      col("Before 1990", D.filter((x) => x.rel! < 1990).length, "violet"), col("Before 2000", D.filter((x) => x.rel! < 2000).length, "blue"), col("Before 2010", D.filter((x) => x.rel! < 2010).length, "cyan"), col("2010s", D.filter((x) => x.rel! >= 2010 && x.rel! < 2020).length, "gold"), col("2020s", D.filter((x) => x.rel! >= 2020 && x.rel! < 2030).length, "rose"),
    ],
    charts: [
      { id: "years", title: "Titles per release year", note: "Every release year in your library. Drag to zoom.", wide: true, option: cartesian(ys.map(String), [{ name: "Games", data: ys.map((y) => py.get(y) ?? 0) }], { zoom: ys.length > 25 }) },
      { id: "dec", title: "Release decades", note: "Games and completions, with days invested start → finish.", wide: true, option: cartesian(dec.map((x) => x.name), [{ name: "Games", data: dec.map((x) => x.n) }, { name: "Completed", data: dec.map((x) => x.done) }, { name: "Days invested", kind: "line", y2: true, data: dec.map((x) => x.days) }]) },
    ],
  };
}

function franchises(r: R[]): Section {
  const a = agg(r, (x) => x.fr), spn = a.filter((x) => x.days > 0), rp = ratedPool(a), fr = r.filter((x) => x.fr.length);
  const jr = a.map((f) => { const rs = r.filter((x) => x.fr.includes(f.name)), s = rs.map((x) => x.s ?? x.f).filter(isNum), e = rs.map((x) => x.f).filter(isNum); return { name: f.name, d: s.length && e.length ? Math.round((Math.max(...e) - Math.min(...s)) / DAY) + 1 : 0 }; });
  const lj = top(jr, (x) => x.d), avgD = [...spn].sort((x, y) => y.avgDays - x.avgDays).slice(0, 10), pool = a.filter((x) => x.n >= 2).length >= 3 ? a.filter((x) => x.n >= 2) : a;
  const cr = [...pool].sort((x, y) => y.done / y.n - x.done / x.n).slice(0, 10);
  return {
    tiles: [
      tl("Most time invested", top(spn, (x) => x.days), (x) => `${x.days} days start → finish`, "cyan"), tl("Most collected", top(a, (x) => x.n), (x) => `${x.n} games`, "violet"), tl("Most completed", top(a, (x) => x.done), (x) => `${x.done} completed`, "green"), tl("Favorite", top(rp, (x) => x.rating), (x) => `${f1(x.rating)}/10 average`, "gold"),
      T("Longest journey", lj?.d ? lj.name : dash, lj?.d ? `${lj.d} days, first start → latest finish` : "No data yet", "rose"), T("Franchises completed", String(a.filter((x) => x.n > 0 && x.done === x.n).length), "every owned game finished", "green"),
      T("Franchise completion", fr.length ? `${f1((fr.filter((x) => x.done).length / fr.length) * 100)}%` : dash, "of your franchise games are completed", "blue"),
    ],
    charts: [
      { id: "size", title: "Top franchises", option: stackedCollection(a, 10), height: 340 },
      { id: "rate", title: "Completion by franchise", note: "Share of your owned games in each series that you've finished.", option: cartesian(cr.map((x) => cut(x.name)), [{ name: "% completed", data: cr.map((x) => Math.round((x.done / x.n) * 100)), color: "#7bd88f" }], { horizontal: true, max: 100 }), height: 340 },
      { id: "avg", title: "Average completion time per franchise", note: "Average days from start to finish.", wide: true, option: cartesian(avgD.map((x) => cut(x.name, 16)), [{ name: "Days", data: avgD.map((x) => Math.round(x.avgDays * 10) / 10) }], { rotate: 15 }) },
    ],
  };
}

function developers(r: R[]): Section {
  const a = agg(r, (x) => (x.dev ? [x.dev] : [])), spn = a.filter((x) => x.days > 0), rp = ratedPool(a);
  return {
    tiles: [tl("Most time invested", top(spn, (x) => x.days), (x) => `${x.days} days start → finish`, "cyan"), tl("Most collected", top(a, (x) => x.n), (x) => `${x.n} games`, "violet"), tl("Favorite", top(rp, (x) => x.rating), (x) => `${f1(x.rating)}/10 average`, "gold")],
    charts: [
      { id: "size", title: "Most collected studios", option: stackedCollection(a, 12), height: 380 },
      { id: "time", title: "Time invested per studio", note: "Days between starting and finishing their games.", option: donut(slice(a, (x) => x.days, 8), { rose: true, unit: "days" }), height: 380 },
    ],
  };
}

function ratings(r: R[]): Section {
  const R_ = r.filter((x) => x.rating), mx = top(R_, (x) => x.rating!), mn = top(R_, (x) => x.rating!, -1);
  const bars = (a: Agg[]) => { const p = ratedPool(a).sort((x, y) => y.rating - x.rating).slice(0, 12); return cartesian(p.map((x) => cut(x.name)), [{ name: "Average rating", data: p.map((x) => Math.round(x.rating * 10) / 10), color: "#e7c56c" }], { horizontal: true, max: 10 }); };
  const ey = [...new Set(R_.filter((x) => x.at > 0).map((x) => yr(x.at)))].sort(), ya = ey.map((y) => R_.filter((x) => x.at > 0 && yr(x.at) === y));
  const pj = R_.filter((x) => x.days).map((x) => [x.days!, x.rating!, x.g.title] as [number, number, string]), pr = R_.filter((x) => x.rel).map((x) => [x.rel!, x.rating!, x.g.title] as [number, number, string]), pl = R_.filter((x) => x.len).map((x) => [Math.round(x.len! * 10) / 10, x.rating!, x.g.title] as [number, number, string]);
  return {
    tiles: [T("Highest rated game", mx ? `${mx.rating}/10` : dash, mx?.g.title ?? "No ratings yet", "gold"), T("Lowest rated game", mn ? `${mn.rating}/10` : dash, mn?.g.title ?? "", "rose"), T("Perfect 10s", String(R_.filter((x) => x.rating === 10).length), "games rated 10/10", "green"), T("Rated games", String(R_.length), `of ${r.length} in your library`, "violet")],
    charts: [
      { id: "dist", title: "Rating distribution", option: cartesian(range(1, 10).map(String), [{ name: "Games", data: range(1, 10).map((n) => R_.filter((x) => Math.round(x.rating!) === n).length), color: "#e7c56c" }]) },
      { id: "by", title: "Average rating by…", note: "Groups with at least 2 rated games when possible.", option: bars(agg(R_, (x) => x.genres)), height: 360,
        tabs: [{ label: "Genre", option: bars(agg(R_, (x) => x.genres)) }, { label: "Developer", option: bars(agg(R_, (x) => (x.dev ? [x.dev] : []))) }, { label: "Franchise", option: bars(agg(R_, (x) => x.fr)) }, { label: "Platform", option: bars(agg(R_, (x) => [x.platform])) }, { label: "Era", option: bars(agg(R_, (x) => (x.rel ? [`${Math.floor(x.rel / 10) * 10}s`] : []))) }] },
      { id: "evo", title: "Rating evolution", note: "Average rating by year of activity, with games rated per year.", wide: true, option: cartesian(ey.map(String), [{ name: "Games rated", data: ya.map((x) => x.length), color: "#3b3470" }, { name: "Average rating", kind: "line", y2: true, data: ya.map((x) => Math.round(avg(x.map((y) => y.rating!)) * 10) / 10), color: "#e7c56c" }]) },
      { id: "j", title: "Rating vs time invested", note: verdict(corr(pj), "You tend to rate games higher the longer you stay with them. Time invested seems to pay off.", "Games you finish quickly score higher with you. You reward tight, focused experiences.", "How long you spend with a game barely moves your rating."), option: scatter(pj, "Days start → finish", "Rating") },
      { id: "y", title: "Rating vs release year", note: verdict(corr(pr), "Newer games tend to win higher scores from you.", "Classics beat modern releases in your ratings.", "Your ratings don't favour any particular generation."), option: scatter(pr, "Release year", "Rating") },
      { id: "l", title: "Rating vs game length", note: verdict(corr(pl), "You enjoy longer games more. Big adventures tend to score well with you.", "Shorter games tend to impress you more than long ones.", "Game length doesn't predict how much you enjoy a game."), option: scatter(pl, "Average playtime (hours)", "Rating"), wide: true },
    ],
  };
}

function length(r: R[]): Section {
  const L = r.filter((x) => x.len), dn = L.filter((x) => x.done), lv = L.map((x) => x.len!), mx = top(L, (x) => x.len!), mn = top(L, (x) => x.len!, -1);
  const B: [string, number, number][] = [["< 5h", 0, 5], ["5–10h", 5, 10], ["10–20h", 10, 20], ["20–40h", 20, 40], ["40–80h", 40, 80], ["80h+", 80, Infinity]];
  const lst = (rows: R[]) => cartesian(rows.map((x) => cut(x.g.title)), [{ name: "Playtime (h)", data: rows.map((x) => Math.round(x.len! * 10) / 10), color: "#67d8e6" }], { horizontal: true });
  return {
    tiles: [T("Longest game", mx ? hrs(mx.len!) : dash, mx?.g.title ?? "No length data yet", "rose"), T("Shortest game", mn ? hrs(mn.len!) : dash, mn?.g.title ?? "", "green"), T("Average game length", lv.length ? hrs(avg(lv)) : dash, "average playtime", "violet"), T("Median game length", lv.length ? hrs(median(lv)) : dash, "median playtime", "blue"), T("Playtime per completion", dn.length ? hrs(avg(dn.map((x) => x.len!))) : dash, "average for completed games", "cyan"), T("Total in completed games", hrs(sum(dn.map((x) => x.len!))), `${L.length} of ${r.length} games have length data`, "gold")],
    charts: [
      { id: "hist", title: "How long are your games?", option: cartesian(B.map((b) => b[0]), [{ name: "Games", data: B.map(([, a, b]) => lv.filter((v) => v >= a && v < b).length), color: "#67d8e6" }]) },
      { id: "top", title: "Longest & shortest games", height: 340, option: lst([...L].sort((a, b) => b.len! - a.len!).slice(0, 10)), tabs: [{ label: "Longest 10", option: lst([...L].sort((a, b) => b.len! - a.len!).slice(0, 10)) }, { label: "Shortest 10", option: lst([...L].sort((a, b) => a.len! - b.len!).slice(0, 10)) }] },
    ],
  };
}

function newGenres(P: R[]) { const seen = new Set<string>(), m = new Map<number, number>(); [...P].filter((x) => x.at > 0).sort((a, b) => a.at - b.at).forEach((x) => x.genres.forEach((g) => { if (!seen.has(g)) { seen.add(g); m.set(yr(x.at), (m.get(yr(x.at)) ?? 0) + 1); } })); return m; }
function exploration(r: R[]): Section {
  const P = r.filter((x) => x.played), cnt = (k: (x: R) => string[]) => agg(P, k).map((x) => x.n);
  const gN = cnt((x) => x.genres), dN = cnt((x) => (x.dev ? [x.dev] : [])), fN = cnt((x) => x.fr), eN = cnt((x) => { const e = eraOf(x.rel); return e ? [e] : []; }), pN = cnt((x) => [x.platform]);
  const sc = [evenness(gN), evenness(dN), evenness(fN), evenness(eN), evenness(pN)], ng = newGenres(P), pk = peak(ng), ys = ng.size ? range(Math.min(...ng.keys()), Math.max(...ng.keys())) : []; let run = 0;
  return {
    tiles: [
      T("Genres explored", String(gN.length), `${f1((gN.length / ALL_GENRES) * 100)}% of ${ALL_GENRES} IGDB genres`, "rose"), T("Franchises explored", String(fN.length), "unique series", "green"), T("Developers explored", String(dN.length), "unique studios", "violet"), T("Release eras explored", `${eN.length} / ${ERAS.length}`, "gaming generations", "gold"), T("Platforms explored", String(pN.length), "unique platforms", "blue"),
      T("Overall diversity", `${Math.round(avg(sc))}/100`, "how evenly your games are spread", "cyan"), T("Most experimental year", pk ? String(pk[0]) : dash, pk ? `${pk[1]} new genres tried` : "", "rose"),
    ],
    charts: [
      { id: "radar", title: "Diversity scores", note: "100 means your games are spread perfectly evenly across the category.", height: 340, option: { color: C, tooltip: { ...TIP }, radar: { shape: "circle", radius: "68%", indicator: ["Genres", "Developers", "Franchises", "Eras", "Platforms"].map((name) => ({ name, max: 100 })), axisName: { color: MUTED }, splitLine: { lineStyle: { color: "rgba(255,255,255,.1)" } }, splitArea: { show: false }, axisLine: { lineStyle: { color: "rgba(255,255,255,.1)" } } }, series: [{ type: "radar", data: [{ value: sc.map(Math.round), name: "Diversity" }], areaStyle: { color: "rgba(164,149,255,.35)" }, lineStyle: { color: "#a495ff", width: 3 }, itemStyle: { color: "#67d8e6" } }] } },
      { id: "new", title: "New genres discovered per year", height: 340, option: cartesian(ys.map(String), [{ name: "New genres", data: ys.map((y) => ng.get(y) ?? 0) }, { name: "Total genres", kind: "line", y2: true, data: ys.map((y) => (run += ng.get(y) ?? 0)), color: "#67d8e6" }]) },
    ],
  };
}

const RC: Record<Rarity, string> = { common: "#9aa3b5", uncommon: "#7bd88f", rare: "#75a8ee", legendary: "#e7c56c", mythic: "#ff6b5b", lostinsync: "#b565ff" };
const RT: Record<Rarity, Tone> = { common: "blue", uncommon: "green", rare: "cyan", legendary: "gold", mythic: "rose", lostinsync: "violet" };
function milestones(_r: R[], all: Game[]): Section {
  const tiers = evaluate(all, {}).flatMap((s) => s.tiers), by = (Object.keys(RC) as Rarity[]).map((k) => ({ k, total: tiers.filter((t) => t.rarity === k).length, got: tiers.filter((t) => t.rarity === k && t.unlocked).length }));
  const got = sum(by.map((x) => x.got)), o = cartesian(by.map((x) => RARITY_LABEL[x.k]), [{ name: "Unlocked", data: by.map((x) => x.got), stack: "b" }, { name: "Still locked", data: by.map((x) => x.total - x.got), stack: "b", color: "rgba(255,255,255,.12)" }]);
  o.series[0].data = by.map((x) => ({ value: x.got, itemStyle: { color: RC[x.k] } }));
  return {
    tiles: [T("Badges unlocked", String(got), `of ${tiers.length} (all time)`, "violet"), T("Badge completion", `${f1((got / Math.max(1, tiers.length)) * 100)}%`, "unlocked ÷ available", "cyan"), ...by.map((x) => T(`${RARITY_LABEL[x.k]} badges`, String(x.got), `of ${x.total}`, RT[x.k]))],
    charts: [{ id: "rar", title: "Badges by rarity", option: o }, { id: "ring", title: "Badge completion", option: ring((got / Math.max(1, tiers.length)) * 100, "unlocked", "#b565ff") }],
  };
}

function records(r: R[]): Section {
  const D = r.filter((x) => x.done && x.f !== undefined), cnt = (k: (t: number) => number) => count(D, (x) => k(x.f!)), Y = cnt(yr), M = cnt(mo), W = cnt(wk);
  const py = peak(Y), pm = peak(M), pw = peak(W), ps = peak(count(r.filter((x) => x.s !== undefined), (x) => mo(x.s!)));
  const days = [...new Set(r.flatMap((x) => [x.s, x.f]).filter(isNum).map((t) => Math.floor(t / DAY)))].sort((a, b) => a - b);
  let best = 0, run = 0; days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
  const ev: [number, number][] = []; r.forEach((x) => { if (x.s === undefined) return; const e = x.f ?? (x.g.status === "Playing" ? Date.now() : undefined); if (e !== undefined && e >= x.s) ev.push([x.s, 1], [e + DAY, -1]); });
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); let cur = 0, sim = 0; ev.forEach(([, v]) => { cur += v; sim = Math.max(sim, cur); });
  const P = r.filter((x) => x.played && x.at > 0), ys = [...new Set(P.map((x) => yr(x.at)))].sort(), uniq = (k: (x: R) => string[]) => ys.map((y) => new Set(P.filter((x) => yr(x.at) === y).flatMap(k)).size);
  const gy = uniq((x) => x.genres), fy = uniq((x) => x.fr);
  const ra = [...new Set(r.filter((x) => x.rating && x.at > 0).map((x) => yr(x.at)))].map((y) => { const rs = r.filter((x) => x.rating && x.at > 0 && yr(x.at) === y); return { y, n: rs.length, v: avg(rs.map((x) => x.rating!)) }; });
  const hy = top(ra.filter((x) => x.n >= 2).length ? ra.filter((x) => x.n >= 2) : ra, (x) => x.v);
  const cy = [...Y.keys()].length ? range(Math.min(...Y.keys()), Math.max(...Y.keys())) : [], yo = cartesian(cy.map(String), [{ name: "Completed", data: cy.map((y) => Y.get(y) ?? 0), color: "#e7c56c" }]);
  yo.series[0].markPoint = { data: [{ type: "max", name: "Record" }], symbolSize: 54, itemStyle: { color: "#a495ff" }, label: { color: "#fff", fontWeight: 700 } };
  const vals = cy.flatMap((y, yi) => MONTHS.map((_, m) => [m, yi, count(D.filter((x) => yr(x.f!) === y), (x) => new Date(x.f!).getUTCMonth()).get(m) ?? 0]));
  return {
    tiles: [
      T("Most completed in a year", py ? String(py[1]) : dash, py ? String(py[0]) : "", "gold"), T("Most completed in a month", pm ? String(pm[1]) : dash, pm ? moLabel(pm[0]) : "", "gold"), T("Most completed in a week", pw ? String(pw[1]) : dash, pw ? `week of ${iso((pw[0] * 7 - 3) * DAY)}` : "", "gold"),
      T("Longest streak", `${best} days`, "in a row with a start or finish", "rose"), T("Most games at once", String(sim), "overlapping start → finish journeys", "cyan"), T("Most started in a month", ps ? String(ps[1]) : dash, ps ? moLabel(ps[0]) : "", "blue"),
      T("Most genres in a year", String(Math.max(0, ...gy)), ys[gy.indexOf(Math.max(0, ...gy))] ? String(ys[gy.indexOf(Math.max(...gy))]) : "", "green"), T("Most franchises in a year", String(Math.max(0, ...fy)), ys[fy.indexOf(Math.max(0, ...fy))] ? String(ys[fy.indexOf(Math.max(...fy))]) : "", "green"), T("Highest rated year", hy ? String(hy.y) : dash, hy ? `${f1(hy.v)}/10 average` : "", "violet"),
    ],
    charts: [
      { id: "year", title: "Completions per year", note: "Your most productive year is marked.", option: yo },
      { id: "heat", title: "Completions by month", note: "Every year × month. Brighter means more finishes.", height: Math.max(220, 60 + cy.length * 38), option: { tooltip: { ...TIP, position: "top", formatter: (p: any) => `${cy[p.data[1]]} ${MONTHS[p.data[0]]}: ${p.data[2]} completed` }, grid: { left: 6, right: 16, top: 10, bottom: 50, containLabel: true }, xAxis: { type: "category", data: MONTHS, ...AX, splitLine: { show: false } }, yAxis: { type: "category", data: cy.map(String), ...AX, splitLine: { show: false } }, visualMap: { ...GLASS_VM, min: 0, max: Math.max(1, ...vals.map((v) => v[2])) }, series: [{ type: "heatmap", data: vals, itemStyle: { borderRadius: 5, borderColor: "rgba(10,9,24,.8)", borderWidth: 3 }, label: { show: true, color: "#fff", fontSize: 10, formatter: (p: any) => p.data[2] || "" } }] } },
      { id: "div", title: "Genres & franchises explored per year", wide: true, option: cartesian(ys.map(String), [{ name: "Genres", kind: "area", data: gy }, { name: "Franchises", kind: "area", data: fy }]) },
    ],
  };
}

const ARCH: [RegExp, string][] = [[/role/i, "The Lorekeeper"], [/shooter/i, "The Marksman"], [/adventure/i, "The Wanderer"], [/strateg|tactic/i, "The Tactician"], [/platform/i, "The Acrobat"], [/racing/i, "The Road Warrior"], [/fight/i, "The Duelist"], [/puzzle/i, "The Mastermind"], [/simulat/i, "The Architect"], [/sport/i, "The Competitor"], [/indie/i, "The Treasure Hunter"]];
const lvl = (v: number, hi: number, mid: number, a: string, b: string, c: string) => (v >= hi ? a : v >= mid ? b : c);
function insights(r: R[]): Section {
  const P = r.filter((x) => x.played), g = agg(P, (x) => x.genres), tg = top(g, (x) => x.n), rate = P.length ? P.filter((x) => x.done).length / P.length : 0, avgD = avg(P.filter((x) => x.days).map((x) => x.days!));
  const arche = ARCH.find(([re]) => tg && re.test(tg.name))?.[1] ?? "The Collector";
  const trait = rate >= 0.7 ? "relentless finisher" : g.length >= 10 ? "restless explorer" : avgD && avgD <= 14 ? "fast, focused player" : avgD >= 60 ? "slow-burn savourer" : "balanced all-rounder";
  const top3 = (k: (x: R) => string[]) => (P.length ? (sum([...agg(P, k)].sort((a, b) => b.n - a.n).slice(0, 3).map((x) => x.n)) / P.length) * 100 : 0);
  const fl = top3((x) => x.fr), dl = top3((x) => (x.dev ? [x.dev] : []));
  const nd = P.filter((x) => x.rel && x.days), nos = nd.length ? (sum(nd.filter((x) => x.rel! < 2000).map((x) => x.days!)) / sum(nd.map((x) => x.days!))) * 100 : 0;
  const lg = P.filter((x) => x.len), lp = lg.length ? (lg.filter((x) => x.len! >= 30).length / lg.length) * 100 : 0;
  const sorted = [...P].filter((x) => x.at > 0).sort((a, b) => a.at - b.at), k = Math.floor(sorted.length / 3), early = sorted.slice(0, k), late = sorted.slice(sorted.length - k);
  const nm = (rows: R[], keys: (x: R) => string[]) => top(agg(rows, keys), (x) => x.n)?.name;
  const eg = nm(early, (x) => x.genres), lgN = nm(late, (x) => x.genres), ep = nm(early, (x) => [x.platform]), lpN = nm(late, (x) => [x.platform]);
  const evo = k < 2 ? "Add more dated games to reveal how your taste changes." : eg === lgN && ep === lpN ? `Your taste has stayed steady: ${eg ?? "your favourite genre"} on ${ep ?? "your main platform"}, then and now.` : `Early on you gravitated to ${eg ?? "variety"} on ${ep ?? "your first platform"}. Lately it's ${lgN ?? "variety"} on ${lpN ?? "your latest platform"}.`;
  const ng = newGenres(P), yk = [...ng.keys()].sort(), ly = yk[yk.length - 1], recent = sum(yk.filter((y) => y >= ly - 1).map((y) => ng.get(y)!)), before = sum(yk.filter((y) => y < ly - 1).map((y) => ng.get(y)!)), n0 = Math.max(1, yk.filter((y) => y < ly - 1).length);
  const trendTxt = yk.length < 2 ? "Not enough history yet to see a trend." : recent / 2 > before / n0 ? `You tried ${recent} new genres in the last two years. You're branching out faster than ever.` : `You tried ${recent} new genres in the last two years. You're settling into your favourites.`;
  const top6 = [...g].sort((a, b) => b.n - a.n).slice(0, 6).map((x) => x.name), share = (rows: R[], n: string) => (rows.length ? Math.round((rows.filter((x) => x.genres.includes(n)).length / rows.length) * 100) : 0);
  return {
    tiles: [T("Gaming personality", arche, `a ${trait}`, "violet"), T("Franchise loyalty", `${Math.round(fl)}%`, "of games from your top 3 series", "green"), T("Developer loyalty", `${Math.round(dl)}%`, "of games from your top 3 studios", "cyan"), T("Nostalgia index", `${Math.round(nos)}%`, "of journey days spent on pre-2000 games", "gold"), T("Long-game preference", `${Math.round(lp)}%`, "of games take 30h+ to beat", "rose")],
    story: [
      { title: arche, text: `${tg ? `${tg.name} leads your library (${tg.n} games). ` : ""}You finish ${Math.round(rate * 100)}% of what you start and wander across ${g.length} genres. You're a ${trait}.` },
      { title: "Franchise loyalty", text: lvl(fl, 50, 25, "You're a series loyalist. You stick with the worlds you love.", "You balance favourite series with fresh worlds.", "You rarely stay with one series. Every game is a new place to visit.") },
      { title: "Developer loyalty", text: lvl(dl, 50, 25, "A handful of studios shape most of your library.", "You follow a few studios but keep your options open.", "Your library is spread across many studios. You follow games, not brands.") },
      { title: "Nostalgia", text: lvl(nos, 40, 15, "The past is your playground. Classics get most of your attention.", "You visit classics regularly alongside newer releases.", "You live in the present. Modern releases take most of your time.") },
      { title: "Long-game preference", text: lg.length ? lvl(lp, 50, 25, "You love a long haul. Epic 30h+ adventures dominate.", "A healthy mix of epics and shorter experiences.", "You favour tight, shorter games over sprawling epics.") : "Games need IGDB length data to unlock this insight." },
      { title: "Gaming evolution", text: evo }, { title: "Exploration trend", text: trendTxt },
    ],
    charts: [
      { id: "idx", title: "Your indexes", note: "0–100, higher means a stronger tendency.", option: cartesian(["Franchise loyalty", "Developer loyalty", "Nostalgia", "Long-game preference"], [{ name: "Index", data: [fl, dl, nos, lp].map(Math.round) }], { horizontal: true, max: 100 }) },
      { id: "shift", title: "How your taste shifted", note: "Share of your early games vs your most recent games, per genre.", option: cartesian(top6.map((n) => cut(n, 14)), [{ name: "Early", data: top6.map((n) => share(early, n)), color: "#3b3470" }, { name: "Recent", data: top6.map((n) => share(late, n)), color: "#a495ff" }]) },
    ],
  };
}

const BUILD: Record<CategoryId, (r: R[], all: Game[]) => Section> = { overview, activity, genres, platforms, eras, franchises, developers, ratings, length, exploration, milestones, records, insights };
export const build = (id: CategoryId, rows: R[], all: Game[]) => BUILD[id](rows, all);