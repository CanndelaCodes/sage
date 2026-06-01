# SageOS Liquid Linear Overlay Design

Date: 2026-06-01
Status: Approved direction for MVP visual gate
Decision source: Visual companion selection `b-liquid-linear`

## Summary

SageOS should evolve from the current Sage-native Vitreous Liquor foundation into a Liquid Linear command glass system for the Windows overlay MVP.

The target is: Apple-like liquid glass material physics plus Linear-like command hierarchy, density, restraint, and operational precision. The overlay should feel premium and dimensional, but it must remain a serious local operator surface over Windows, not a decorative browser dashboard.

## Product Intent

The Windows overlay is the main SageOS MVP interface. It should feel like a system-level glass control layer over the active desktop:

- Instant enough for daily use from a global hotkey.
- Dense enough for repeated operational scanning.
- Beautiful enough to feel world-class and product-defining.
- Restrained enough that task state, incidents, approvals, and emergency controls remain the first thing the eye understands.

The visual direction must serve SageOS operations before visual novelty.

## Design Direction

Use Liquid Linear command glass as the production target:

- Liquid material: translucent glass, backdrop blur, saturation, rim highlights, soft internal light, and material depth that responds to elevation.
- Linear precision: crisp information hierarchy, small controls, compact rows, command-first layout, clear state colors, and low-noise motion.
- Windows overlay fit: strong opacity floors, readable over bright and dark apps, no dependence on full-page browser backgrounds, no marketing-style hero composition.

Do not copy Apple, Linear, or PeakHQ branding. Borrow material logic, motion discipline, hierarchy, and polish standards.

## Material System

The overlay should use a four-level glass elevation scale:

1. Ambient glass: pinned widgets, passive indicators, background surfaces.
2. Command glass: toolbar, Universal Launcher, HUD, Edge Rail controls.
3. Focus glass: Command Deck cards, active rows, Agent Workspace, selected records.
4. Summit glass: modal or high-risk approval/incident surfaces.

Each level should have tokenized values for:

- Background alpha and opacity floor.
- Blur and saturation.
- Border/rim highlight.
- Inner highlight and shadow.
- Outer shadow.
- State overlay strength.

The implementation should keep these in shared CSS tokens, not scattered literal colors.

## Visual Language

Core qualities:

- Neutral charcoal base with cool platinum highlights.
- Cyan/blue for primary command paths and active focus.
- Green for verified or healthy states.
- Amber for pending, degraded, or review-needed states.
- Red for urgent, destructive, failed, or emergency states.
- Violet only as a sparse synthesis/accent state, never the dominant palette.

Surface treatment:

- Use rounded glass only where it clarifies a control or surface boundary.
- Cards remain at 8px default radius unless the surface is an overlay shell, HUD, Edge Rail, or high-risk modal.
- Rows are compact, bordered, and scanner-friendly.
- Avoid decorative orbs, bokeh blobs, or one-note purple/blue gradients.
- Use subtle topographic or dot texture only when it improves depth without competing with data.

## Interaction And Motion

The overlay is mouse-first, keyboard-complete, and voice-ready.

Motion rules:

- Motion should communicate spatial state: open, collapse, expand, focus, approve, reject, repair, queue, dismiss.
- Maximum two active motion channels per viewport.
- Prefer transform and opacity.
- Respect reduced motion.
- No slow decorative shimmer in default mode.
- Premium effects such as magnetic pull, spotlight, material glint, or glass refraction may be used only on high-value controls after screenshot review.

Keyboard rules:

- Global hotkey opens and closes the overlay.
- `Ctrl+K` focuses the launcher when the overlay is active.
- `Escape` dismisses the overlay.
- Tab order and focus-visible states must be obvious against glass.

## Component Targets

The visual pass must cover:

- Command Deck.
- Universal Launcher.
- Agent Workspace.
- Compact HUD.
- Edge Rail.
- Pinned Widgets.
- Toolbars.
- Active operation rows.
- Approval cards and actions.
- Incident cards and repair actions.
- System resource rows.
- Loading, empty, disconnected, degraded, disabled, success, warning, error, and critical states.

Every visible control needs hover, focus-visible, pressed, disabled, pending/loading, and success/error affordances where applicable.

## Quality Bar

Liquid Linear command glass is an MVP release gate. The MVP is not visually accepted until:

- Screenshots prove full overlay, HUD, Edge Rail, and pinned widgets are legible.
- Pinned widgets remain readable over representative dark, light, text-heavy, browser, and IDE backgrounds.
- Text does not clip or overlap in cards, rows, badges, buttons, widgets, or command input.
- Contrast meets practical WCAG 2.2 AA expectations for normal text and controls.
- Reduced motion is honored.
- The visual system is tokenized and maintainable.
- No dead decoration ships without operational purpose.

## Verification

Required evidence:

- Unit/contract tests for material tokens, state classes, overflow guards, reduced motion, and keyboard focus.
- `pnpm --dir apps/windows-overlay test`.
- `pnpm --dir apps/windows-overlay typecheck`.
- `pnpm --dir apps/windows-overlay build`.
- `pnpm --dir apps/windows-overlay smoke:electron`.
- Screenshot paths recorded in `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md`.
- Manual or automated visual review notes for dark, bright, text-heavy, browser, and IDE backgrounds.

## Implementation Notes

Implementation should proceed in small verified slices:

1. Expand the visual contract tests for Liquid Linear tokens and state classes.
2. Refactor `apps/windows-overlay/src/renderer/styles.css` into named Liquid Linear token sections.
3. Apply the tokens to each overlay surface.
4. Add screenshot/visual evidence to the smoke artifact.
5. Commit visual-system work separately from unrelated functional changes.
