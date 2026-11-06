import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Activity, ArrowLeft, BarChart3, Building2, Compass, GitBranch, Hourglass, Layers, LayoutDashboard, Medal, Monitor, Sparkles, Star, Timer, Trophy } from "lucide-react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart } from "echarts/charts";
import { CalendarComponent, DataZoomComponent, GridComponent, LegendComponent, MarkPointComponent, RadarComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { AppData } from "../domain/game";
import { build, CATEGORIES, index, touchedIn, yearsOf, type CategoryId, type ChartSpec, type Opt } from "../domain/stats";
import "./stats.css";

echarts.use([BarChart, LineChart, PieChart, RadarChart, ScatterChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, VisualMapComponent, CalendarComponent, MarkPointComponent, RadarComponent, CanvasRenderer]);

const ICONS: Record<CategoryId, typeof Activity> = {
    overview: LayoutDashboard, activity: Activity, genres: Layers, platforms: Monitor, eras: Hourglass, franchises: GitBranch, developers: Building2,
    ratings: Star, length: Timer, exploration: Compass, milestones: Trophy, records: Medal, insights: Sparkles,
};

function Chart({ option, height }: { option: Opt; height: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const inst = useRef<echarts.ECharts | null>(null);
    useEffect(() => {
        const c = echarts.init(ref.current!, undefined, { renderer: "canvas" });
        inst.current = c;
        const ro = new ResizeObserver(() => c.resize());
        ro.observe(ref.current!);
        return () => { ro.disconnect(); c.dispose(); };
    }, []);
    useEffect(() => { inst.current?.setOption(option, true); }, [option]);
    return <div ref={ref} style={{ height }} />;
}

function ChartCard({ c, i }: { c: ChartSpec; i: number }) {
    const [tab, setTab] = useState(0);
    const option = c.tabs ? c.tabs[tab].option : c.option!;
    return (
        <section className={`st-chart${c.wide ? " wide" : ""}`} style={{ "--i": i } as CSSProperties}>
            <header>
                <div><h3>{c.title}</h3>{c.note && <p>{c.note}</p>}</div>
                {c.tabs && <div className="st-tabs">{c.tabs.map((t, k) => <button key={t.label} className={k === tab ? "on" : ""} onClick={() => setTab(k)}>{t.label}</button>)}</div>}
            </header>
            <Chart option={option} height={c.height ?? 300} />
        </section>
    );
}

export function StatsView({ data }: { data: AppData }) {
    const [cat, setCat] = useState<CategoryId | undefined>(() => history.state?.statsCat);
    const open = (id: CategoryId) => { history.pushState({ ...history.state, statsCat: id }, ""); setCat(id); };
    const close = () => { if (history.state?.statsCat) history.back(); else setCat(undefined); };
    useEffect(() => {
        const onPop = (e: PopStateEvent) => setCat(e.state?.statsCat);
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);
    const [range, setRange] = useState("all");
    const years = useMemo(() => yearsOf(data.games), [data.games]);
    const games = useMemo(() => (range === "all" ? data.games : data.games.filter((g) => touchedIn(g, Number(range)))), [data.games, range]);
    const rows = useMemo(() => index(games), [games]);
    const section = useMemo(() => (cat ? build(cat, rows, data.games) : undefined), [cat, rows, data.games]); // only the open category is computed
    const meta = CATEGORIES.find((c) => c.id === cat);

    if (!cat || !meta || !section) {
        return (
            <div className="st-landing">
                <header className="st-head"><p className="eyebrow">YOUR NUMBERS</p><h1>Stats</h1><p className="muted">Pick a category to dive into the charts.</p></header>
                <div className="st-grid">
                    {CATEGORIES.map((c, i) => {
                        const Icon = ICONS[c.id];
                        return (
                            <button key={c.id} className={`st-card tone-${c.tone}`} style={{ "--i": i } as CSSProperties} onClick={() => open(c.id)}>
                                <span className="st-no">{String(i + 1).padStart(2, "0")}</span>
                                <span className="st-ico"><Icon size={24} /></span>
                                <h3>{c.title}</h3>
                                <p>{c.blurb}</p>
                                <span className="st-go">Explore →</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    const Icon = ICONS[meta.id];
    return (
        <div className="st-page" key={`${cat}-${range}`}>
            <button className="st-back" onClick={close}><ArrowLeft size={16} /> All categories</button>
            <header className={`st-hero tone-${meta.tone}`}>
                <span className="st-ico big"><Icon size={28} /></span>
                <div><p className="eyebrow">CATEGORY {String(CATEGORIES.indexOf(meta) + 1).padStart(2, "0")}</p><h1>{meta.title}</h1><p className="muted">{meta.blurb}</p></div>
                <label className="st-range"><BarChart3 size={14} />
                    <select value={range} disabled={cat === "milestones"} onChange={(e) => setRange(e.target.value)}>
                        <option value="all">All time</option>
                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
            </header>
            <div className="st-tiles">
                {section.tiles.map((t, i) => (
                    <div key={t.label} className={`st-tile tone-${t.tone ?? "violet"}`} style={{ "--i": i } as CSSProperties}>
                        <small>{t.label}</small><strong title={t.value}>{t.value}</strong>{t.sub && <span title={t.sub}>{t.sub}</span>}
                    </div>
                ))}
            </div>
            {section.story && (
                <div className="st-story">
                    {section.story.map((s, i) => <article key={s.title} style={{ "--i": i } as CSSProperties}><h4>{s.title}</h4><p>{s.text}</p></article>)}
                </div>
            )}
            <div className="st-charts">{section.charts.map((c, i) => <ChartCard key={c.id} c={c} i={i} />)}</div>
        </div>
    );
}