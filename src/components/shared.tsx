import { Activity, ChevronRight, Gamepad2 } from "lucide-react";
import { formatPlaytime } from "../domain/game";
import type { AppData, Game } from "../domain/game";

export type SaveGame = (
  game: Game,
  activity?: { type: "status" | "session" | "completed"; detail: string },
) => void;

export function Header({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat glass">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </div>
  );
}

export function GameMini({ game, onClick }: { game: Game; onClick: () => void }) {
  return (
    <button className="mini-card glass" onClick={onClick}>
      <div className="art">
        <Gamepad2 size={23} />
      </div>
      <div>
        <strong>{game.title}</strong>
        <span>
          {game.platform} · {formatPlaytime(game.totalSeconds)}
        </span>
      </div>
      <ChevronRight size={16} />
    </button>
  );
}

export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: () => void;
}) {
  return (
    <div className="empty glass">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button soft" onClick={action}>
          Open library
        </button>
      )}
    </div>
  );
}

export function ActivityList({ items }: { items: AppData["activities"] }) {
  return items.length ? (
    <div className="timeline">
      {items.map((item) => (
        <div className="timeline-item" key={item.id}>
          <span className={`timeline-dot ${item.type}`}></span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            <small>{new Date(item.occurredAt).toLocaleString()}</small>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty
      icon={<Activity />}
      title="No activity yet"
      text="Your local timeline will appear here."
    />
  );
}
