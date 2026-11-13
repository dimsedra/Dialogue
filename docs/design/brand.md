---
title: "Brand Design SOT: Dialogue Desktop Assistant"
type: reference
status: active
last_updated: 2026-11-13
---

# Brand Design SOT: Dialogue Desktop Assistant

## Brand & Positioning

Dialogue is a calm, human-centered local-first personal operating system for organizing everyday life across four pillars: Calendar, To-do, Habits, and Money. It pairs the conversational warmth of a quiet personal notebook with the speed and clarity of a native desktop tool, keeping every conversation and record strictly on the user's device.

Dialogue is meant to feel grounded, approachable, and unhurried rather than coldly mechanical. It avoids noisy SaaS dashboards, glowing purple AI gradients, decorative mascots, and cluttered multi-widget home screens. Every surface exists either to carry a calm conversation or to give an instant, glanceable view of what is on the user's plate.

## Target User & Context

Dialogue is built for systemic thinkers, builders, and everyday professionals who want less cognitive friction when turning messy thoughts into concrete plans. They interact with Dialogue in two complementary modes depending on their attention and urgency.

The first mode is Quick Command, a floating global-hotkey overlay summoned over any running app to check today's schedule or log a calendar item in seconds without losing focus. The second mode is the Main Workspace, a full desktop window used for deeper multi-thread conversations, reviewing upcoming days in Quick Look, opening the full calendar grid, and managing local provider settings.

## Generic Baseline to Avoid

We deliberately avoid generic dark-mode AI chat templates that stack monotonous monospace badges, harsh utilitarian boxes, and rigid all-caps labels on top of pure flat black. We also avoid importing light-paper cream and terracotta color tropes verbatim, because Dialogue v0.1 stays rooted in its Carbon Black and Dark Grey visual palette while adopting softer editorial geometry and calmer reading proportions.

## Design Decisions

### 1. Color Palette (Dark Surface System Preserved)

Dialogue keeps its existing Carbon Black and Dark Grey palette as the foundational surface system, mapping each surface role from the new layout onto stepped dark values and crisp `1px` structural borders rather than light-mode drop shadows.

- **Base Chat Canvas (`#090a0c`)**: Ultra-deep Carbon Black for the main center conversation stream and the Quick Command backdrop, keeping long reading sessions quiet and glare-free.
- **Side Panels & Elevated Cards (`#131417`)**: Dark Grey for the left sidebar, the right Quick Look panel, the floating composer dock, inline event cards, and empty-state suggestion cards.
- **Sunken & Recessed Surfaces (`#18191e` and `#1c1e24`)**: Slightly lifted dark neutral tones used for right-aligned user chat bubbles, the segmented pillar tab track, search inputs, and active or hovered thread rows.
- **Structural Borders (`#22242a` and `#363942`)**: Hairline `1px` borders (`#22242a`) define panel seams and card edges cleanly without heavy shadows, stepping up to `#363942` on hover, focus, or dashed empty states.
- **Text Hierarchy**: Primary text uses `#f3f4f6` for high readability, secondary metadata and timestamps use `#8b8f98`, and subdued hints or inactive shortcuts use `#525660`.
- **Primary Brand & Live Calendar Accent**: Cold Blue (`#3b82f6` solid, `#2563eb` hover, `rgba(59, 130, 246, 0.14)` dark tint, and `#93c5fd` foreground text on dark tint) anchors active Calendar indicators, focus rings, the secondary stroke on the Dialogue brand mark, and primary interactive highlights.
- **High-Contrast Primary Actions**: Primary action buttons such as `"New conversation"`, the active send button, and the selected date circle in Quick Look use inverted high contrast (`#f3f4f6` background with `#090a0c` text) or Cold Blue (`#3b82f6` with `#ffffff` text) so primary actions stand out without loud gradients.
- **Semantic Pillar Accents on Dark Surfaces**: Calendar uses Cold Blue (`#3b82f6`), while the planned v0.2+ pillars and status badges use dark-adapted muted tints so they stay legible on `#131417` without overpowering the Carbon Black theme: emerald (`#34d399` / dark tint) for To-do and live status chips, indigo or cyan (`#60a5fa` / dark tint) for Habits, amber (`#fbbf24` / dark tint) for Money and postponed badges, and muted rose (`#f87171` / dark tint) for destructive or error states.

### 2. Typography (Bundled Local-First Variable Fonts)

All fonts are bundled locally inside the app so Dialogue never depends on remote font servers (such as Google Fonts CDN) and renders identically offline.

- **Primary Interface & Reading Font**: `Figtree Variable` (`@fontsource-variable/figtree`), falling back to system sans-serif, used across navigation, inputs, labels (`13px` to `14px`), and conversation body copy (`15.5px` with relaxed `1.7` line height).
- **Editorial Display Font**: `Fraunces Variable` (`@fontsource-variable/fraunces`), a serif display typeface reserved strictly for high-identity moments: the `"Dialogue"` sidebar wordmark (`20px`, semibold), the empty-chat greeting headline (`34px`, medium, tight tracking), and the active pillar title inside Quick Look (`23px`, medium).
- **Monospace & Numeric Detail**: System monospace or tabular numerals (`tabular-nums`) for keyboard shortcut badges (`⌘K`, `Esc`, `⌘⏎`) and time slots (`12px` to `12.5px`).

### 3. Brand Mark & Visual Identity

The Dialogue mark (`LogoMark`) consists of two overlapping rounded speech bubbles inside a rounded-square badge (`rounded-[10px]`, `32px` in headers and assistant avatars, `48px` with `rounded-[14px]` in the empty-state hero). On the dark palette, the badge uses `#f3f4f6` or `#18191e` with `#22242a` framing, and the second overlapping speech bubble uses Cold Blue (`#3b82f6` or `#60a5fa`) as its accent stroke instead of warm terracotta.

### 4. Layout Hierarchy & Navigation

The Main Window uses a three-panel collapsible layout anchored by a uniform `56px` (`h-14`) top header bar across every column so visual alignment runs continuously from left to right.

- **Left Sidebar (`280px` inline on desktop, slide-over drawer below `860px`)**: Dedicated to brand identity and conversation history rather than top-level view tabs. It contains the `"Dialogue"` header with a sidebar collapse toggle, a full-width `"New conversation"` button, a `"Search conversations"` input (`⌘K`), conversation threads grouped by `"Pinned"`, `"Today"`, `"Yesterday"`, and `"Earlier"` with pillar dots and hover Pin/Delete actions, and a bottom `"Local-first"` status footer housing the `Settings` gear button.
- **Center Workspace (`flex-1`, `min-w-0`)**: Hosts the active conversation stream centered within a comfortable `46rem` (`736px`) reading column, with a header showing the thread title, active pillar pill badge, and `"Quick look"` panel toggle. When the user opens the Full Calendar grid (`@fullcalendar/react` Month/Week/Day) or Settings from the sidebar footer, that view occupies the center workspace with an explicit `"Back to chat"` return action.
- **Right Quick Look Panel (`372px` inline on desktop, slide-over drawer below `1240px`)**: Features a `"Quick look"` header with today's date and collapse toggle, a four-tab segmented switcher (`Calendar`, `To-do`, `Habits`, `Money`), and the active pillar body. In v0.1, the Calendar tab renders a compact interactive month grid with event-count dots, the selected day's agenda with an `"Add"` shortcut, a `"Coming up"` preview list, and a direct button to open the Full Calendar view; the other three tabs render `"Planned for v0.2+"` sketch previews with a prompt trigger.
- **Quick Command Overlay (`680px` floating window)**: Keeps its centered frameless overlay footprint (`#090a0c` base, `#131417` input card, `1px` `#22242a` border, subtle ambient shadow) while adopting `Figtree Variable` typography, `LogoMark`, `rounded-2xl` outer corners, and the structured inline `EventCard` style for visual continuity with the Main Window.

### 5. Component Geometry, Depth & Spacing

Component corners shift from sharp technical boxes to softer, friendly proportions while keeping borders crisp and readable against Carbon Black. Outer containers, cards, segmented tab tracks, the composer dock, and empty-state prompt cards use `rounded-2xl` (`16px`). User message bubbles use `rounded-2xl rounded-br-md` as a subtle conversational anchor. Primary action buttons, sidebar thread rows, and agenda event rows use `rounded-xl` (`12px`), secondary and icon buttons use `rounded-lg` (`8px`), and status chips, pillar pills, and selected calendar day circles use `rounded-full`.

Because drop shadows vanish on `#090a0c`, visual elevation is expressed through stepped dark backgrounds (`#090a0c` -> `#131417` -> `#18191e`) paired with `1px` `#22242a` borders, reserving soft shadows (`shadow-2xl`) strictly for floating slide-over drawers and the Quick Command overlay. All CSS animations respect `prefers-reduced-motion: reduce`.

### 6. AI UI & Chat Interaction Patterns (`@ai-sdk/react`)

- **Empty State**: Centered editorial welcome featuring the `48px` `LogoMark`, `Fraunces Variable` greeting (`"What is on your plate today?"`), concise subtitle, and a `2x2` grid of clickable pillar suggestion cards showing live or planned status.
- **Message Stream**: User messages appear as right-aligned `rounded-2xl rounded-br-md` bubbles (`max-w-[82%]`, `#18191e` background, `#22242a` border). Assistant messages appear left-aligned directly on `#090a0c` next to a `32px` `LogoMark` avatar, `"Dialogue"` label, and timestamp, rendered with clean markdown prose (`15.5px`, `leading-[1.7]`).
- **Typing & Streaming Feedback**: Waiting state uses three subtle animated dots (`animate-dot`) aligned beside the assistant `LogoMark`; active token streaming appends text smoothly in place.
- **Structured Tool & Event Cards**: Calendar mutations (`createEvent`, `updateEvent`) render as compact structured `EventCard` containers (`max-w-[26rem]`, `rounded-xl`, `#131417` background, `1px` `#22242a` border, `4px` Cold Blue left accent stripe) showing status, title, formatted date and time, optional reminder or postponed pills, and quick actions (`"View in calendar"` and `"Undo"`). Read and delete tool actions (`listEvents`, `deleteEvent`) or execution errors render as restrained dark status rows matching the same border and radius system.
- **Auto-Growing Composer**: A `rounded-2xl` `#131417` container with `#22242a` border (brightening to `#363942` with a subtle Cold Blue focus ring on focus), hosting a borderless `<textarea>` that grows automatically up to `168px`, keyboard hints (`Enter to send · Shift + Enter for a new line`) on the bottom left, and a `size-9 rounded-xl` arrow-up send button on the bottom right, followed by a quiet local-first privacy line underneath.

## Non-Goals

- No light mode or cream paper theme in v0.1; the dark Carbon Black and Dark Grey palette remains the sole theme for now.
- No arbitrary user theme customizer or skinning system in v0.1.
- No functional To-do, Habit, or Money persistence in v0.1 beyond the `"Planned for v0.2+"` preview tabs in Quick Look.
- No remote web font fetches; typography must stay bundled locally.
