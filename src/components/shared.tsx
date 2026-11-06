import { useState, useRef, useEffect, useMemo } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Gamepad2,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { formatPlaytime } from "../domain/game";
import type { Game } from "../domain/game";

export type SaveGame = (
  game: Game,
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



export function TrophyToggle({
  value,
  onChange,
  readOnly = false,
}: {
  value?: boolean;
  onChange?: (val: boolean) => void;
  readOnly?: boolean;
}) {
  const active = value === true;
  return (
    <button
      type="button"
      className={`trophy-toggle${active ? " active" : ""}`}
      onClick={() => !readOnly && onChange?.(!active)}
      disabled={readOnly}
      title={active ? "100% Completed — click to unmark" : "Mark as 100% Completed"}
      aria-label={active ? "Platinum achieved" : "Mark platinum"}
    >
      <Trophy size={16} />
      <span>{active ? "100% Mastered" : "100% Mastery"}</span>
    </button>
  );
}


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  label, value, onChange, min, max, capAtToday = false,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  min?: string;
  max?: string;
  capAtToday?: boolean;
}) {
  const [text, setText] = useState(formatDate(value));
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState("");
  const pickerRef = useRef<HTMLInputElement>(null);
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const effectiveMax = capAtToday ? (max && max < todayValue ? max : todayValue) : max;
  useEffect(() => setText(formatDate(value)), [value])
  
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);
  const save = (v: string | undefined) => { onChange(v); setSaved(true); };
  const commit = (raw: string) => {
    const parsed = parseDate(raw);
    if (raw.trim() && !parsed) { setText(formatDate(value)); return; }
    const capped = parsed && capAtToday && parsed > todayValue ? todayValue : parsed;
    if (capped && min && capped < min) {
      setInvalid(`Must be on or after ${formatDate(min)}`);
      setText(formatDate(value));
      return;
    }
    if (capped && effectiveMax && capped > effectiveMax) {
      setInvalid(`Must be on or before ${formatDate(effectiveMax)}`);
      setText(formatDate(value));
      return;
    }
    setInvalid("");
    setText(formatDate(capped));
    if (capped !== value) save(capped);
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
          max={effectiveMax}
          value={value ?? ""}
          onChange={(e) => commit(e.target.value)}
        />
      </div>
      {invalid && <span className="date-error">{invalid}</span>}
    </label>
  );
}

export function PlatformPicker({
  label, value, onChange, options, hint, single = false,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  hint?: string;
  single?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useMemo(
    () => options.filter((o) => (single || !value.includes(o)) && o.toLowerCase().includes(q.toLowerCase())).slice(0, 40),
    [options, value, q, single]
  );
  const add = (o: string) => {
    onChange(single ? [o] : [...value, o]);
    setQ("");
    if (single) setOpen(false);
  };
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

          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const typed = q.trim();
              if (!typed) return;
              const exact = options.find((o) => o.toLowerCase() === typed.toLowerCase());
              add(exact ?? (list[0] && list[0].toLowerCase().startsWith(typed.toLowerCase()) ? list[0] : typed));
            }
            if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
          }}
        />
      </div>
      {open && list.length > 0 && (
        <div className="pf-menu glass">
          {list.map((o) => (
            <button type="button" key={o} onMouseDown={(e) => { e.preventDefault(); add(o); }}>{o}</button>
          ))}
            {q.trim() && !options.some((o) => o.toLowerCase() === q.trim().toLowerCase()) && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); add(q.trim()); }}>
              + Add '{q.trim()}'
            </button>
          )}
        </div>
      )}
      {hint && <span className="pf-hint">{hint}</span>}
    </div>
  );
}