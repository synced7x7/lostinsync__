import { Sparkles } from "lucide-react";
import type { Game } from "../domain/game";
import { RARITY_COLOR, topBadge, type Override } from "../domain/trophies";

export function RarityBadge({ games, cheat = {} }: { games: Game[]; cheat?: Override }) {
  const top = topBadge(games, cheat);
  const rarity = top?.rarity ?? "common";

  return (
    <span
      className={`rarity-badge r-${rarity}`}
      style={{ ["--rc" as string]: RARITY_COLOR[rarity] }}
      title={top?.desc ?? "Complete 10% of all achievements to earn your first badge"}
    >
      <Sparkles size={12} /> {top?.name ?? "Unranked"}
    </span>
  );
}