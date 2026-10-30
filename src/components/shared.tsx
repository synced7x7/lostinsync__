import { useState, useRef, useEffect, useMemo } from "react";
import {
  Activity,
  Award,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDashed,
  Crown,
  Flame,
  Gamepad2,
  Minus,
  Plus,
  Shield,
  Star,
  Zap,
  X,
} from "lucide-react";
import { formatPlaytime } from "../domain/game";
import type { AppData, Game } from "../domain/game";

export type SaveGame = (
  game: Game,
  activity?: { type: "status" | "completed" | "started"; detail: string },
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

const RATING_LABELS: Record<number, string> = {
  1: "1/10 · Abysmal",
  2: "2/10 · Terrible",
  3: "3/10 · Bad",
  4: "4/10 · Subpar",
  5: "5/10 · Mediocre",
  6: "6/10 · Decent",
  7: "7/10 · Good",
  8: "8/10 · Great",
  9: "9/10 · Amazing",
  10: "10/10 · Masterpiece",
};

export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = 18,
  showLabel = true,
}: {
  value?: number;
  onChange?: (val: number | undefined) => void;
  readOnly?: boolean;
  size?: number;
  showLabel?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const displayScore = hovered !== null ? hovered : (value ?? 0);

  const handleClick = (starNum: number) => {
    if (readOnly || !onChange) return;
    if (value === starNum) {
      onChange(undefined);
    } else {
      onChange(starNum);
    }
  };

  return (
    <div className={`star-rating-box ${readOnly ? "readonly" : ""}`}>
      <div className="star-rating-header">
        <span className="star-rating-title">Rating</span>
        {showLabel && (
          <div className="star-rating-score">
            {displayScore > 0 ? (
              <span className="rating-desc active">
                {RATING_LABELS[displayScore] || `${displayScore}/10`}
              </span>
            ) : (
              <span className="rating-desc muted">Not rated</span>
            )}
            {!readOnly && value !== undefined && value > 0 && (
              <button
                type="button"
                className="star-rating-clear"
                onClick={() => onChange?.(undefined)}
                title="Reset rating"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className="star-rating-stars"
        onMouseLeave={() => !readOnly && setHovered(null)}
      >
        <div className="star-cluster">
          {[1, 2, 3, 4, 5].map((starNum) => {
            const isFilled = starNum <= displayScore;
            return (
              <button
                key={starNum}
                type="button"
                className={`star-btn ${isFilled ? "filled" : "empty"}`}
                onClick={() => handleClick(starNum)}
                onMouseEnter={() => !readOnly && setHovered(starNum)}
                disabled={readOnly}
                aria-label={`Rate ${starNum} out of 10`}
                title={`${starNum}/10`}
              >
                <Star size={size} />
              </button>
            );
          })}
        </div>
        <div className="star-cluster-divider" />
        <div className="star-cluster">
          {[6, 7, 8, 9, 10].map((starNum) => {
            const isFilled = starNum <= displayScore;
            return (
              <button
                key={starNum}
                type="button"
                className={`star-btn ${isFilled ? "filled" : "empty"}`}
                onClick={() => handleClick(starNum)}
                onMouseEnter={() => !readOnly && setHovered(starNum)}
                disabled={readOnly}
                aria-label={`Rate ${starNum} out of 10`}
                title={`${starNum}/10`}
              >
                <Star size={size} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const PRESETS = [
  { label: "0%", value: 0 },
  { label: "25%", value: 25 },
  { label: "50%", value: 50 },
  { label: "75%", value: 75 },
  { label: "100%", value: 100, isCrown: true },
];

export function MasteryProgress({
  value,
  onChange,
  readOnly = false,
}: {
  value?: number;
  onChange?: (val: number) => void;
  readOnly?: boolean;
}) {
  const current = Math.min(100, Math.max(0, value ?? 0));

  const getTier = (v: number) => {
    if (v >= 100) return { label: "Grandmaster", rank: "100% Completed", color: "grandmaster", icon: Crown };
    if (v >= 75) return { label: "Master", rank: "Platinum Tier", color: "platinum", icon: Flame };
    if (v >= 50) return { label: "Expert", rank: "Gold Tier", color: "gold", icon: Award };
    if (v >= 25) return { label: "Adept", rank: "Silver Tier", color: "silver", icon: Zap };
    if (v > 0) return { label: "Novice", rank: "Bronze Tier", color: "bronze", icon: Shield };
    return { label: "Unstarted", rank: "0% Progress", color: "none", icon: CircleDashed };
  };

  const tier = getTier(current);
  const TierIcon = tier.icon;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly || !onChange) return;
    onChange(Number(e.target.value));
  };

  const handleStep = (delta: number) => {
    if (readOnly || !onChange) return;
    const next = Math.min(100, Math.max(0, current + delta));
    onChange(next);
  };

  return (
    <div className={`mastery-card tier-${tier.color}`}>
      <div className="mastery-header">
        <div className="mastery-info">
          <span className="mastery-title">Mastery Progress</span>
          <div className="mastery-tier-badge">
            <TierIcon size={13} />
            <span>{tier.label}</span>
            <small>· {tier.rank}</small>
          </div>
        </div>
        <div className="mastery-value-box">
          <strong className="mastery-percentage">{current}</strong>
          <span className="mastery-unit">%</span>
        </div>
      </div>

      <div className="mastery-track-wrapper">
        <div className="mastery-track-bg">
          <div
            className="mastery-track-fill"
            style={{ width: `${current}%` }}
          >
            <div className="mastery-fill-glow" />
            <div className="mastery-fill-shimmer" />
          </div>
          {current > 0 && current < 100 && (
            <div
              className="mastery-indicator-pin"
              style={{ left: `${current}%` }}
            />
          )}
        </div>
        {!readOnly && (
          <input
            type="range"
            min="0"
            max="100"
            value={current}
            onChange={handleSliderChange}
            className="mastery-native-slider"
            aria-label="Mastery progress slider"
          />
        )}
      </div>

      {!readOnly && (
        <div className="mastery-controls">
          <div className="mastery-presets">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`mastery-preset-btn ${current === p.value ? "active" : ""}`}
                onClick={() => onChange?.(p.value)}
              >
                {p.isCrown ? <Crown size={11} /> : null}
                {p.label}
              </button>
            ))}
          </div>
          <div className="mastery-steppers">
            <button
              type="button"
              className="mastery-step-btn"
              onClick={() => handleStep(-5)}
              title="Decrease 5%"
              disabled={current <= 0}
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              className="mastery-step-btn"
              onClick={() => handleStep(5)}
              title="Increase 5%"
              disabled={current >= 100}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export const formatDate = (v?: string) => {
  if (!v) return "";
  const [y, m, d] = v.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}, ${y}`;
};

export const parseDate = (raw: string): string | undefined => {
  const s = raw.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase() === m![2].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(+m[1])}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function DateField({
  label, value, onChange, min, max,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  min?: string;
  max?: string;
}) {
  const [text, setText] = useState(formatDate(value));
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState("");
  const pickerRef = useRef<HTMLInputElement>(null);
  useEffect(() => setText(formatDate(value)), [value]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);
  const save = (v: string | undefined) => { onChange(v); setSaved(true); };
  const commit = (raw: string) => {
    const parsed = parseDate(raw);
    if (raw.trim() && !parsed) { setText(formatDate(value)); return; }
    if (parsed && min && parsed < min) {
      setInvalid(`Must be on or after ${formatDate(min)}`);
      setText(formatDate(value));
      return;
    }
    if (parsed && max && parsed > max) {
      setInvalid(`Must be on or before ${formatDate(max)}`);
      setText(formatDate(value));
      return;
    }
    setInvalid("");
    setText(formatDate(parsed));
    if (parsed !== value) save(parsed);
  };
  return (
    <label>
      {label}
      <div className="date-field">
        <input
          type="text"
          className={saved ? "saved" : ""}
          placeholder="e.g. 1 Oct, 2026"
          value={text}
          onChange={(e) => { setText(e.target.value); setSaved(false); setInvalid(""); }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit(text)}
          onPaste={(e) => {
            const parsed = parseDate(e.clipboardData.getData("text"));
            if (parsed) { e.preventDefault(); setText(formatDate(parsed)); commit(parsed); }
          }}
        />
        <button
          type="button"
          className={saved ? "icon-btn active" : "icon-btn"}
          title="Open calendar"
          onClick={() => pickerRef.current?.showPicker()}
        >
          {saved ? <Check size={16} /> : <CalendarDays size={16} />}
        </button>
        <input
          ref={pickerRef}
          type="date"
          className="date-native"
          tabIndex={-1}
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => commit(e.target.value)}
        />
      </div>
      {invalid && <span className="date-error">{invalid}</span>}
    </label>
  );
}

export function PlatformPicker({
  label, value, onChange, options, hint,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  hint?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useMemo(
    () => options.filter((o) => !value.includes(o) && o.toLowerCase().includes(q.toLowerCase())).slice(0, 40),
    [options, value, q]
  );
  const add = (o: string) => { onChange([...value, o]); setQ(""); };
  return (
    <div className="pf">
      <span className="pf-label">{label}</span>
      <div className="pf-box">
        {value.length > 0 && (
          <div className="pf-chips">
            {value.map((v) => (
              <span className="pill pf-chip" key={v}>
                {v}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== v))}><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <input
          value={q}
          placeholder={value.length ? "Add more…" : "Search platforms…"}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (list[0]) add(list[0]); }
            if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
          }}
        />
      </div>
      {open && list.length > 0 && (
        <div className="pf-menu glass">
          {list.map((o) => (
            <button type="button" key={o} onMouseDown={(e) => { e.preventDefault(); add(o); }}>{o}</button>
          ))}
        </div>
      )}
      {hint && <span className="pf-hint">{hint}</span>}
    </div>
  );
}