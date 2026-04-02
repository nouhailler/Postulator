# Design System Document: The Command Center

## 1. Overview & Creative North Star
**Creative North Star: The Sovereign Architect**
This design system moves away from the "busy" aesthetics of traditional job boards. It treats job seeking as a high-stakes engineering project. The UI is designed to feel like a private, secure terminal—a sophisticated command center where data is paramount but never overwhelming. 

We break the "standard template" look through **Intentional Asymmetry** and **Tonal Depth**. Instead of a rigid, boxed-in grid, we use expansive white space and "ghost" containers to create an editorial feel that prioritizes readability and professional authority. The experience should feel like an elite IDE: powerful, customizable, and focused.

---

## 2. Colors: Tonal Architecture
The palette is rooted in deep slates (`#0b1326`) to provide a sense of security, with vibrant technical accents in primary blue (`#7bd0ff`) and tertiary teal (`#3cddc7`) to highlight AI-driven insights.

### The Rules of Engagement
*   **The "No-Line" Rule:** 1px solid borders for sectioning are strictly prohibited. Sectioning must be achieved through background shifts (e.g., a `surface-container-low` component sitting on a `surface` background).
*   **Surface Hierarchy & Nesting:** Treat the UI as layers of physical material. Use the `surface-container` tiers (Lowest to Highest) to define importance.
    *   *Example:* A sidebar uses `surface-container-low`, the main workspace uses `surface`, and active data cards use `surface-container-high`.
*   **The "Glass & Gradient" Rule:** For floating modals or "AI Analysis" overlays, use Glassmorphism. Combine `surface-variant` at 60% opacity with a `backdrop-blur` of 12px.
*   **Signature Textures:** Main CTAs should not be flat. Use a subtle linear gradient from `primary` (`#7bd0ff`) to `primary-container` (`#00a7e0`) at a 135-degree angle to provide a "liquid-crystal" depth.

---

## 3. Typography: The Editorial Edge
We employ a dual-type system to balance technical precision with high-end editorial authority.

*   **Display & Headlines (Manrope):** Chosen for its geometric modernism. Large-scale headlines (`display-lg` to `headline-sm`) should use tighter tracking (-0.02em) to feel "locked-in" and authoritative.
*   **Body & Labels (Inter):** The workhorse. Used for high-density data tables and Kanban cards. Inter provides the "developer-friendly" clarity required for reading technical job descriptions.
*   **Hierarchy as Brand:** Use `title-lg` in `tertiary` (`#3cddc7`) for AI-generated insights or "Match Scores" to immediately signal machine-intelligence value to the user.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are too heavy for a data-centric tool. We use light to define space.

*   **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-lowest` card placed on a `surface-container-low` background creates a natural inset look, mimicking a physical carving in a slate console.
*   **Ambient Shadows:** When an element must float (e.g., a dropdown), use a shadow with a 32px blur, 4% opacity, using the `on-surface` color. It should feel like a soft glow, not a dark drop-shadow.
*   **The "Ghost Border" Fallback:** If accessibility requires a container edge, use the `outline-variant` token at **15% opacity**. This creates a "whisper" of a boundary that doesn't break the visual flow.
*   **Glassmorphism:** Use semi-transparent `surface-bright` for hover states on cards to create a "lit-from-within" effect.

---

## 5. Components: Precision Primitives

### Kanban Cards & Data Tables
*   **The Divider Ban:** Do not use horizontal lines between rows or cards. Use 12px of vertical white space or a subtle shift to `surface-container-highest` on hover to define rows.
*   **Kanban Cards:** Use `surface-container-low`. Status indicators should be small 4px vertical "pills" on the left edge using `primary` or `tertiary` tokens, rather than full-card background colors.

### Progress Indicators (AI Analysis)
*   **The Neural Trace:** Instead of a standard circular loader, use a horizontal "shimmer" gradient moving between `primary` and `tertiary`. This signals active computation and "smart" filtering.

### Buttons & Inputs
*   **Primary Button:** Gradient fill (`primary` to `primary-container`), `on-primary` text, `xl` (0.75rem) roundedness.
*   **Ghost Inputs:** Input fields should have no background fill. Use a `surface-container-highest` bottom-border (2px) that transforms into a `primary` glow upon focus.
*   **Chips:** Use `secondary-container` with `on-secondary-container` text for tech stacks (e.g., "React", "Rust"). Use `sm` (0.125rem) roundedness for a sharper, more technical "tag" look.

### Navigation Sidebar
*   **Asymmetric Width:** Use a slim, icon-only sidebar that expands into a rich `surface-container-low` panel. Navigation items use `title-sm` with high-contrast `on-surface` for active states and `outline` for inactive.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use asymmetrical margins. A wider left-hand margin for "Display" text creates a sophisticated, journal-like layout.
*   **Do** prioritize "Data Density." Technical users want to see more information at once; use `body-sm` for secondary metadata.
*   **Do** use `tertiary` (`#3cddc7`) exclusively for AI/Smart features to build a mental shortcut for the user.

### Don't
*   **Don't** use 100% black. The deepest color should be `surface` (`#0b1326`). Pure black kills the "slate" sophistication.
*   **Don't** use standard "Success Green." Use the `tertiary` teal. It feels more modern and less like a generic CRUD app.
*   **Don't** use heavy card borders. If the UI feels cluttered, increase the spacing (`gap`) rather than adding lines. Lines are the enemy of this system.