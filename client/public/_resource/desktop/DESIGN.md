# Design System Specification: High-Density Developer Experience

## 1. Overview & Creative North Star
**Creative North Star: The Monolithic Console**
This design system rejects the "web-page" aesthetic in favor of a precision-engineered tool. It is inspired by the efficiency of command-line interfaces and the tactical feel of high-end physical hardware. We move beyond "template" UI by embracing extreme information density, tonal layering, and an "Editorial-Technical" layout style.

The goal is to provide a "Flow State" environment. By using a strict monochromatic base punctuated by a singular indigo accent, we minimize cognitive load while maximizing professional authority. We don't just display data; we curate an environment for high-velocity engineering.

---

## 2. Colors & Surface Architecture
The palette is rooted in deep obsidian tones, utilizing the Material Design surface-tiering logic to create depth without the clutter of traditional UI lines.

### Surface Hierarchy & The "No-Line" Rule
To achieve a premium, integrated look, **prohibit the use of 1px solid borders for primary sectioning.** Instead, boundaries are defined by tonal shifts:
*   **Global Background:** `surface_container_lowest` (#0e0e0e)
*   **Primary Sidebar:** `surface_dim` (#131313)
*   **Main Content Workspaces:** `surface_container_low` (#1c1b1b)
*   **Floating Modals/Popovers:** `surface_container_high` (#2a2a2a)

### The "Glass & Gradient" Rule
Standard flat colors feel static. To inject "soul" into the tool:
*   **Floating Elements:** Use `surface_container_highest` (#353534) at 80% opacity with a `20px` backdrop-blur. This creates a "frosted glass" effect that allows background code or data to subtly bleed through.
*   **Signature Textures:** For primary CTAs or "In-Progress" states, apply a subtle linear gradient from `primary_container` (#5e6ad2) to a slightly deeper indigo to mimic the sheen of high-quality hardware buttons.

---

## 3. Typography: The Editorial-Technical Scale
We use a high-contrast typographic scale to maintain readability at extremely small sizes. 

*   **Primary Typeface:** `Geist Variable` (Sans) - Chosen for its technical precision and readability at low font sizes.
*   **Mono Typeface:** `JetBrains Mono` - Used exclusively for code blocks, IDs, and raw data strings.

| Role | Token | Size | Weight | Tracking | Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Headline** | `headline-sm` | 1.5rem | 600 | -0.02em | Sentence |
| **Title** | `title-sm` | 1rem | 500 | -0.01em | Sentence |
| **Body (Default)** | `body-sm` | 0.8125rem (13px) | 400 | 0 | Sentence |
| **Code** | `mono-sm` | 0.8125rem (13px) | 450 | 0 | None |
| **Meta/Label** | `label-sm` | 0.6875rem (11px) | 500 | 0.04em | Uppercase |

**Hierarchy Note:** Use `on_surface_variant` (#c6c5d5) for labels to create a clear visual distinction from active content in `on_surface` (#e5e2e1).

---

## 4. Elevation & Depth
Depth in this system is a matter of "Tonal Stacking," not structural framing.

*   **The Layering Principle:** Rather than using shadows, "lift" a component by placing a higher-tier surface on a lower-tier one. A `surface_container_high` card sitting on a `surface_container_low` background provides enough natural contrast to define the object.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility (e.g., in high-density data tables), use a "Ghost Border": `outline_variant` at 10% opacity. Never use 100% opaque borders for interior elements.
*   **Ambient Shadows:** For floating menus (Dropdowns/Modals), use a "Large-Diffusion" shadow: `0px 12px 32px rgba(0, 0, 0, 0.5)`. The shadow color must be the background color, never a neutral grey.

---

## 5. Components & High-Density Patterns

### Buttons & Inputs
*   **Primary Button:** `primary_container` (#5e6ad2) background with `on_primary_container` text. Radius: `md` (0.375rem).
*   **Ghost Input:** No background color; only a `outline_variant` ghost border at 10%. On focus, animate the border to `primary` (#bdc2ff) at 50% with a 2px outer ring.
*   **Density:** Padding for inputs should follow the `spacing.1` (0.15rem) for vertical and `spacing.2` (0.3rem) for horizontal.

### Cards & Lists
*   **Forbid Divider Lines:** Separate list items using a background hover state of `white/5%` or `surface_bright` (#3a3939). 
*   **Vertical Rhythm:** Use `spacing.1.5` (0.225rem) between list items. This "tight-but-legible" spacing is the hallmark of the system.

### Interaction States
*   **Hover:** All interactive rows should utilize a `white/5%` overlay on hover.
*   **Active/Selected:** Use a 2px vertical "pill" of `primary` (#bdc2ff) on the far left of the element to denote selection, rather than changing the entire background color.

---

## 6. Do’s and Don’ts

### Do
*   **DO** use `JetBrains Mono` for any value that is an ID, hash, or hex code.
*   **DO** lean on the `spacing.0.5` (1px) for hairline adjustments and fine-tuning alignment.
*   **DO** use Phosphor Icons at exactly `14px` to match the x-height of the 13px Geist typography.

### Don't
*   **DON'T** use `0px` border-radii. Even in a professional tool, a `sm` or `md` radius (2px-4px) prevents the UI from feeling "sharp" or aggressive.
*   **DON'T** use pure white (#ffffff) for text. Always use `on_surface` (#e5e2e1) to reduce eye strain in long-duration dev sessions.
*   **DON'T** use standard shadows for depth. If the surface tiers don't provide enough separation, your layout is too flat; revisit the surface hierarchy.