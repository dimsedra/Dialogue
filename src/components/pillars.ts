import { CalendarDays, Droplets, ListChecks, Wallet, type LucideIcon } from "lucide-react";

export type PillarId = "calendar" | "todo" | "habit" | "finance";

export interface Pillar {
  id: PillarId;
  name: string;
  tab: string;
  icon: LucideIcon;
  live: boolean;
  status: string;
  reality: string;
  promise: string;
  /** Short badge shown on the empty-state prompt card */
  promptTag: string;
  suggestion: string;
  wish: string;
  dot: string;
  tint: string;
  fg: string;
}

export const PILLARS: Pillar[] = [
  {
    id: "calendar",
    name: "Calendar",
    tab: "Calendar",
    icon: CalendarDays,
    live: true,
    status: "Live in v0.1",
    reality: "For when “I will definitely remember that” inevitably fails.",
    promise: "",
    promptTag: "Schedule",
    suggestion: "Schedule team standup tomorrow at 10am",
    wish: "",
    dot: "bg-calendar",
    tint: "bg-calendar-tint",
    fg: "text-calendar-fg",
  },
  {
    id: "todo",
    name: "To-do list",
    tab: "To-do",
    icon: ListChecks,
    live: false,
    status: "Planned for v0.2+",
    reality: "A place for tasks that actually need doing, not a graveyard of good intentions.",
    promise: "Only the tasks that matter, with a nudge to drop the ones that never will.",
    promptTag: "Today",
    suggestion: "What events are on my calendar today?",
    wish: "For the to-do list, I'd really want it to ",
    dot: "bg-todo",
    tint: "bg-todo-tint",
    fg: "text-todo-fg",
  },
  {
    id: "habit",
    name: "Habit tracker",
    tab: "Habits",
    icon: Droplets,
    live: false,
    status: "Planned for v0.2+",
    reality: "Helping you drink water instead of running on sheer anxiety and caffeine.",
    promise: "Tiny habits, honest streaks, and zero guilt when Wednesday happens.",
    promptTag: "Focus",
    suggestion: "Block 30 minutes every weekday morning for focus time",
    wish: "For the habit tracker, I'd really want it to ",
    dot: "bg-habit",
    tint: "bg-habit-tint",
    fg: "text-habit-fg",
  },
  {
    id: "finance",
    name: "Finance tracker",
    tab: "Money",
    icon: Wallet,
    live: false,
    status: "Planned for v0.2+",
    reality: "A gentle reality check for your late-night online cart checkouts.",
    promise: "A calm look at where the money went, before the 2 AM cart gets checked out.",
    promptTag: "Reminder",
    suggestion: "Remind me about rent due on the 1st of next month",
    wish: "For the finance tracker, I'd really want it to ",
    dot: "bg-finance",
    tint: "bg-finance-tint",
    fg: "text-finance-fg",
  },
];

export const PILLAR_BY_ID = Object.fromEntries(
  PILLARS.map((p) => [p.id, p])
) as Record<PillarId, Pillar>;
