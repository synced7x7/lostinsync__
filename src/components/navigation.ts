import {
  BookOpen, Gamepad2, LayoutDashboard, Route, Settings, Trophy, Compass, BarChart3,
} from "lucide-react";
import type { View } from "../domain/game";

export const navigation: { id: View; label: string; icon: typeof BookOpen }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "library", label: "Library", icon: Gamepad2 },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "journey", label: "Game Journey", icon: Route },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "trophies", label: "Trophies", icon: Trophy },
  { id: "settings", label: "Settings", icon: Settings },
];