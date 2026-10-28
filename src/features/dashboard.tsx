import { Activity, Check, ChevronRight, Clock3, Gamepad2, Play, Plus, Sparkles } from "lucide-react";
import { formatPlaytime, type AppData, type Game } from "../domain/game";
import { ActivityList, Empty, GameMini, Header, Stat } from "../components/shared";

export function Dashboard({ data, openLibrary, openGame }: { data: AppData; openLibrary: () => void; openGame: (id: string) => void }) {
  const playing = data.games.filter((game) => game.status === "Playing");
  const total = data.games.reduce((sum, game) => sum + game.totalSeconds, 0);
  const completed = data.games.filter((game) => game.status === "Completed").length;
  return (
    <>
      <Header eyebrow="GOOD EVENING, {data.profile.displayName.toUpperCase()}" title="Your gaming universe" action={<button className="button primary" onClick={openLibrary}><Plus size={17} /> Add a game</button>} />
      <section className="hero glass"><div className="hero-copy"><span className="hero-icon"><Sparkles size={22} /></span><p className="eyebrow">YOUR OFFLINE SPACE</p><h2>Make every session<br /><span>count.</span></h2><p>Track the games you love, one focused session at a time.</p><button className="button soft" onClick={openLibrary}>Explore library <ChevronRight size={16} /></button></div><div className="hero-orbit"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><Gamepad2 size={100} /></div></section>
      <div className="stats-row"><Stat label="Collection" value={String(data.games.length)} hint="games tracked" icon={<Gamepad2 />} /><Stat label="Playtime" value={formatPlaytime(total)} hint="verified time" icon={<Clock3 />} /><Stat label="Completed" value={String(completed)} hint="finished games" icon={<Check />} /><Stat label="Current streak" value={playing.length ? `${playing.length}` : "0"} hint="active games" icon={<Activity />} /></div>
      <div className="two-col"><section className="section"><div className="section-title"><div><p className="eyebrow">IN PROGRESS</p><h2>Currently playing</h2></div><button className="text-button" onClick={openLibrary}>View all <ChevronRight size={14} /></button></div>{playing.length ? <div className="mini-grid">{playing.slice(0, 3).map((game) => <GameMini key={game.id} game={game} onClick={() => openGame(game.id)} />)}</div> : <Empty icon={<Play />} title="No active adventures" text="Start a session when you are ready to play." action={openLibrary} />}</section><section className="section"><div className="section-title"><div><p className="eyebrow">LATEST SIGNALS</p><h2>Recent activity</h2></div><button className="text-button">Timeline <ChevronRight size={14} /></button></div><ActivityList items={data.activities.slice(0, 4)} /></section></div>
    </>
  );
}
