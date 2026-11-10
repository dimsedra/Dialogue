---
title: "Brand Design SOT: Dialogue Desktop Assistant"
type: reference
status: active
last_updated: 2026-11-10
---

# Brand Design SOT: Dialogue Desktop Assistant

## Brand & Positioning

Dialogue is a sleek, minimalist personal operating system for life organization. It is engineered for fast, distraction-free utility:
- **What it is**: High-contrast, dense, utilitarian, and razor-sharp. It feels like an engineer's high-performance workbench—calm, responsive, and completely grounded in the user's local data.
- **What it is not**: No colorful SaaS cartoonish shapes, no purple AI sparkles or nebulous gradient blobs, and no bloated, distracting dashboard widgets.

## Target User & Context

- **User**: Systemic thinkers, builders, and professionals who prioritize cognitive speed, clean typography, and zero friction.
- **Context**: Interacted with via two modes:
  1. **Quick Command**: Instant, summon-and-dismiss global hotkey overlay during active work sessions (asking a quick schedule question or logging a calendar entry in under 5 seconds).
  2. **Main Workspace**: Deliberate review and planning sessions in a full desktop window.

## Generic Baseline to Avoid

- Overly rounded "bubbly" UI components (`rounded-2xl`, `rounded-3xl`).
- Pastel purple/indigo AI gradient backgrounds and glowing drop shadows.
- Low-contrast washed-out dark grays with muddy text contrast.
- Sprawling cards with excessive whitespace that force unnecessary scrolling.

## Design Decisions

### 1. Color Palette

- **Carbon Black (Base Background)**: `#090a0c` — Ultra-deep, clean carbon black that grounds the app and minimizes visual noise.
- **Dark Grey (Elevated Panels & Containers)**: `#131417` — Secondary surface for the left navigation rail, the right organizer sidebar, and the Quick Command bar.
- **Borders & Dividers**: `#22242a` — Crisp, subtle 1px structural lines that define panels and inputs without drawing attention to themselves.
- **Active / Hover State**: `#1c1e24` — Subtle elevation on interactive list items and buttons.
- **Typography Colors**:
  - Primary: `#f3f4f6` (Crisp, high contrast white)
  - Secondary / Muted: `#8b8f98` (Legible neutral grey for metadata, timestamps, and subtitles)
  - Tertiary / Subdued: `#525660` (Placeholders, inactive shortcuts, subtle icons)
- **Purposeful Contrast Accent**: Clean Cold Blue (`#3b82f6`) or Crisp Silver-White (`#ffffff`) used strictly for active navigation markers, keyboard shortcut pills, and primary event tags.

### 2. Typography

- **Primary Font**: `Geist` (`Geist Sans`), falling back to system sans-serif.
- **Monospace Font**: `Geist Mono`, used for keyboard shortcut hints (e.g. `⌘K`, `Esc`), time ranges, and event timestamps.
- **Scale**:
  - Headings / Titles: 14px–16px, medium weight (`font-medium`).
  - Body / Chat Text: 13px–14px, regular weight (`font-normal`), tight line height (`leading-relaxed`).
  - Meta / Badges / Hotkeys: 11px–12px, regular or medium weight.

### 3. Layout Hierarchy

- **Main Window (Three-Panel Flexible Workspace)**:
  - **Left Rail (Navigation & Chat Threads)**: Default width `240px` (resizable/shrinkable between `200px` and `360px`, with quick collapse toggle). Houses navigation tabs and persistent chat threads.
  - **Center Workspace (Active Context)**: Fluid `flex-1` space that automatically expands or contracts. Houses the active conversation stream with the agent or detailed views.
  - **Right Sidebar (Life Organizer Panel)**: Default width `340px` (resizable/extensible between `280px` and `520px`, with quick collapse toggle). Houses glanceable life management tools (Calendar in v0.1; To-Do, Habit, and Finance modules in v0.2+).
- **Quick Command Overlay (Raycast-Style Floating Bar)**:
  - Fixed 680px width, centered on screen, floating above all desktop applications.
  - Frameless Carbon Black backdrop (`#090a0c`) with a 1px Dark Grey border (`#22242a`) and a subtle dark ambient shadow (`shadow-2xl`).
  - Primary input bar styled as an AI search prompt with `"Ask AI..."` placeholder.
  - Clean inline response box below the input with compact status pills and bottom keyboard hints (`Esc to close`, `⌘⏎ Continue in App`).

### 4. Component Geometry & Workspace Corners

- **Corners**: Sharper, workspace-style corner radii.
  - Inputs, buttons, and list items: `rounded-md` (4px to 6px).
  - Panels and floating Quick Command overlay: `rounded-lg` (8px max).
  - No balloon or pill-shaped buttons; strict, clean rectangular discipline with slight softening.

### 5. AI UI & Interaction Patterns (`@ai-sdk/react`)

- **"Ask AI..." Prompt Bar**:
  - Carbon black background (`#090a0c`) with a crisp 1px border (`#22242a`).
  - On focus: subtle border brightening to `#3b82f6` or `#3f424e` without large blurry drop-shadows.
  - Integrated keyboard shortcut tags in `Geist Mono` (e.g., `Return ↵` to run, `Esc` to dismiss).
- **Message Streams & Bubbles**:
  - **User Messages**: Contained inside a subtle dark grey card (`#131417`, border `#1e2026`, `rounded-md`, compact padding) aligned right or distinctively blocked.
  - **Assistant Messages**: Rendered directly against the background with no enclosing bubble, prioritizing clean editorial reading. Typography uses `Geist Sans` with crisp high-contrast white text (`#f3f4f6`) and relaxed line height.
- **Streaming State & Cursor**:
  - Smooth token streaming with a minimalist vertical bar cursor (`inline-block w-1.5 h-4 bg-blue-500/80 animate-pulse`).
  - No bouncy pastel dots or pulsing purple aura.
- **Tool Invocation Cards & Badges (`tool-invocation` parts)**:
  - Compact inline workspace badges rendered between message chunks whenever the agent calls calendar tools:
    - *In-progress / Executing*: Subtle dark slate container with animated spinner and action text (`Reading calendar: Nov 10–17...`).
    - *Completed / Success*: Crisp 1px border container (`#22242a`, background `#131417`) with a solid micro-badge (`✓ Scheduled: Lunch with Sarah at 1:00 PM`).
    - *Failed / Error*: Restrained dark crimson border (`#7f1d1d`) with error description and retry hint.

## Non-Goals

- No light mode in v0.1 (pure Carbon Black dark theme).
- No arbitrary customizable themes or skinning in v0.1.
- No decorative illustrations, animations, or gradient borders.
