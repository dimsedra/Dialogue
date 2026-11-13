import type { ReactNode } from "react";
import { cn } from "../core/cn";

/** Two overlapping speech bubbles: the Dialogue brand mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] border border-line-strong bg-sunken text-ink",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none">
        <path
          d="M3.5 7.25A3.25 3.25 0 0 1 6.75 4h6.5a3.25 3.25 0 0 1 3.25 3.25v2.5A3.25 3.25 0 0 1 13.25 13H10l-3.1 2.6a.5.5 0 0 1-.82-.38V13h-.33A3.25 3.25 0 0 1 3.5 9.75z"
          fill="currentColor"
        />
        <path
          d="M18.5 10.1c1.2.45 2 1.6 2 2.9v2.5a3.25 3.25 0 0 1-3.25 3.25h-.33v2.2a.5.5 0 0 1-.82.38L13 19.1h-3.25a3.25 3.25 0 0 1-2.9-1.8"
          stroke="#3b82f6"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function StatusChip({
  live,
  children,
  className,
}: {
  live: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none",
        live ? "bg-todo-tint text-todo-fg" : "bg-active text-ink-2 border border-line",
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", live ? "bg-todo" : "bg-ink-4")} />
      {children}
    </span>
  );
}
