---
name: Inventario
description: A SaaS inventory and demand-prediction workspace for small retailers — a calm decision desk where the merchant reads the state of the business and acts.
colors:
  navy: "#102A43"
  navy-dark: "#0B1D30"
  navy-2: "#243B53"
  navy-3: "#486581"
  navy-4: "#9DB2C6"
  navy-soft: "#E1E9F2"
  accent: "#D99000"
  accent-strong: "#B87A00"
  accent-soft: "#FBF0D8"
  success: "#18864B"
  success-soft: "#E3F2E9"
  danger: "#C94C4C"
  danger-soft: "#FBEAEA"
  bg: "#F7F9FC"
  surface: "#FFFFFF"
  surface-alt: "#F1F4F9"
  text: "#172B4D"
  muted: "#556C82"
  border: "#D9E2EC"
  border-strong: "#C1CEDC"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  metric:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
    fontFeature: "'tnum' 1, 'cv05' 1"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.006em"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  overline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.06em"
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.navy-2}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.navy-dark}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-danger-subtle:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  nav-item-active:
    backgroundColor: "{colors.navy-2}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
---

# Design System: Inventario

## Overview

**Creative North Star: "The Decision Desk"**

Inventario is where a small-shop owner sits down, reads the state of the business in one glance, sees the one thing that needs doing today, and acts. The interface is a quiet operating surface, not a marketing page and not a spreadsheet: it leads every screen with the decision it wants made — *reponer, invertir, discontinuar* — and sizes the numbers that drive that decision so they can be read across a shop counter.

The world is a deep navy identity on a near-white blue-grey field, with white cards carrying the work. Navy owns the spine of the app — the sidebar, the primary buttons, the chart data. A single gold accent does exactly three jobs and no more: it marks the selected navigation item, it colours the one metric that matters most on a view (the margin, the total to charge), and it dresses the one action a view is really asking for. Green means healthy; red means critical, and nothing else. The result should read like a fintech dashboard a merchant already trusts — Stripe's or Mercury's calm — rather than an admin template.

It deliberately refuses the generic admin look: equal-weight grey cards with no hierarchy, a dashboard that decorates instead of deciding, serif display type, gradient fills, and cards that lift and glow on hover just because the cursor passed over them.

**Key Characteristics:**
- Navy identity, white cards, `#F7F9FC` ground — never a wall of dark
- Gold used on well under 10% of any screen; its rarity is the signal
- Metrics at weight 800 with tabular figures; everything else is 400–600
- Near-flat elevation: shadows have a real offset and blur, never a coloured halo
- One spacing rhythm (4 · 8 · 12 · 16 · 24 · 32 · 48) everywhere
- Line icons at a single stroke weight; no emoji, no glyph substitutes

## Colors

A restrained palette: one identity colour (navy) across four steps, one accent (gold), two status hues, and a cool neutral ramp. Colour commits at page scale on the navy sidebar and the `#F7F9FC` ground; everywhere else colour is a small, deliberate mark.

### Primary
- **Ink Navy** (`#102A43`): The identity colour. Owns the sidebar, primary buttons, chart bars and series, link text, focus rings, and every large numeral. The `menu` topbar on mobile.
- **Slate Navy** (`#243B53`): The active-navigation fill and the hover state of primary buttons; secondary navy surfaces (the sidebar's own dividers and controls).
- **Steel Blue** (`#486581`): Navy at reading weight *on light* — the resting colour of line icons and secondary labels on white/`#F7F9FC` cards, and hairline borders drawn on a navy surface. Never used for text *on* navy (only ≈2.4:1 there).
- **Navy Line** (`#9DB2C6`): The accessible resting colour for UI text *on* navy surfaces — sidebar nav items, the "PYME" switcher label, the auth-panel tagline (≈6.6:1, WCAG AA). This is the on-dark counterpart to Steel Blue, which fails contrast on navy. Only ever on navy; it is nearly invisible on white.
- **Navy Wash** (`#E1E9F2`): A pale navy tint for "this row/cell is selected" states on white.

### Secondary
- **Signal Gold** (`#D99000`): The accent, and the only one. Used for: the 3px vertical bar on the active nav item, the single hero metric per view (margin, total to charge), one call-to-action per view (`button-accent`), and the tallest bar of the logo monogram. `#B87A00` (**Deep Gold**) is its hover/pressed and its text-on-light form; `#FBF0D8` (**Gold Wash**) is the only surface it is ever allowed to tint (badges, the input-focus glow).

### Neutral
- **Deep Ink** (`#172B4D`): Primary body and heading text.
- **Muted Slate** (`#556C82`): Secondary text, captions, table headers, placeholder text, chart ticks, resting icon colour on light. Held at ≥4.5:1 on both white and the `#F7F9FC` ground (the earlier `#627D98` sat at ≈4.1:1 on the ground — below AA).
- **Field** (`#F7F9FC`): The application background behind every card.
- **Surface** (`#FFFFFF`): Every card, table, modal, input, and the POS panel.
- **Surface Alt** (`#F1F4F9`): Table header rows, inset panels, ghost-button hover, rank chips.
- **Hairline** (`#D9E2EC`): Card borders, table dividers, section rules.
- **Hairline Strong** (`#C1CEDC`): Input borders, category chips, scrollbar thumbs, dashed capture zones.

### Status
- **Healthy Green** (`#18864B`) / **Green Wash** (`#E3F2E9`): Stock at or above minimum, "OK" badges, positive confidence meters, success toasts and receipts.
- **Critical Red** (`#C94C4C`) / **Red Wash** (`#FBEAEA`): Stock below minimum, "Bajo stock" badges, the reorder-alert spotlight, destructive actions, error states. Red is reserved for genuine urgency.

### Named Rules
**The One Gold Rule.** Gold appears at most three times on a view: the active nav marker, the single most decision-relevant number, and one action. It never fills a region, never sits behind body text, and never marks a status — green and red do that.

**The Navy-Is-Identity Rule.** Navy signals *where you are and what the app is*, not *this is urgent*. Urgency is red. A navy block is earned once per view at most (the sidebar always; the POS checkout bar; nothing else by default).

## Typography

**Display / Body / Label Font:** Inter (self-hosted, weights 400/500/600/700/800), with a system stack fallback (`-apple-system, 'Segoe UI', Roboto`).
**Numeric:** Inter with `font-variant-numeric: tabular-nums` and `font-feature-settings: 'tnum' 1, 'cv05' 1` (slashed zero) on every metric, table cell, and money value. There is no separate mono face for data — Inter's tabular figures do that job. A true monospace stack (`--font-mono`) survives only for raw product codes.

**Character:** One workhorse family across the whole product. Personality comes from the weight jump — 400 for prose, 800 for the numbers that drive decisions — and from tight negative tracking on headings and metrics, not from a display face.

### Hierarchy
- **Metric** (800, 26px, line-height 1.1, tracking −0.025em, tabular): KPI values, the PYME-card stat trio, the alert spotlight figure. Navy, or gold for the one hero metric, or red when it *is* the alert.
- **Display / h1** (700, 22px, line-height 1.25, tracking −0.02em): Page titles ("Hola, Comerciante", "Mi inventario").
- **h2** (700, 17px, tracking −0.017em): Section titles inside a page.
- **Title / h3 / card-title** (600, 14px, tracking −0.01em): Card headers, modal titles, list-row product names.
- **Body** (400, 14px, line-height 1.55, tracking −0.006em): All running text and form values.
- **Label** (500, 12px): Field labels, KPI captions.
- **Overline** (600, 11px, tracking 0.06em, uppercase): Table column headers, decision-card kickers ("REPONER AHORA"), the sidebar "PYME" label. Used only where a repeating grid genuinely needs a category marker.

### Named Rules
**The Weight-Not-Face Rule.** Emphasis is a step in weight (400 → 600 → 800), never italic, never a second family, never colour alone.

## Layout

A fixed navy sidebar (240px) on desktop and a fluid content column capped at 1240px (`--content-max`), centred, on the `#F7F9FC` ground. Page padding is 32px (24px on the smallest screens).

Content is built from white cards on a single spacing rhythm: `--sp-1` … `--sp-7` = 4 · 8 · 12 · 16 · 24 · 32 · 48px. Card internal padding is 24px; the gap between stacked cards and between grid cells is 16–24px. More space sits above a heading than below it.

Common grids: the dashboard KPI row is `repeat(auto-fit, minmax(210px, 1fr))`; the PYME grid is `repeat(auto-fill, minmax(300px, 380px))` so a lone card still reads as a card, not a stretched panel; two-column detail regions collapse to one column at 768px.

**Responsive.** Below 768px the sidebar leaves the layout entirely: a fixed 56px navy topbar appears with a hamburger and the wordmark, the content column gets a matching top padding, and the sidebar becomes an off-canvas drawer (272px, `max-width: 84vw`) that slides in from the left over a dimming backdrop. The drawer keeps full labels — it is never an icon-only strip. Tables that do not fit switch to a stacked card list (Inventario, Equipo). Touch targets go to 44px.

## Elevation & Depth

Near-flat. Surfaces are white cards separated from the ground by a 1px hairline border and a very soft shadow; depth is mostly the border and the ground colour, not the shadow. Every shadow has a real vertical offset and a soft blur — there are no zero-offset coloured halos, no hard offset blocks, no glass or blur used as decoration.

### Shadow Vocabulary
- **Resting** (`0 1px 2px rgba(16,42,67,0.05), 0 2px 8px rgba(16,42,67,0.05)`): The default on cards, tables, the POS panel, the recent-sales panel.
- **Raised** (`0 4px 12px rgba(16,42,67,0.08), 0 2px 4px rgba(16,42,67,0.05)`): Hover on genuinely interactive cards (PYME cards), and primary/danger buttons on hover.
- **Overlay** (`0 12px 32px rgba(16,42,67,0.14)`): Modals, the chat panel, toasts, the open mobile drawer.
- **Hairline** (`0 1px 2px rgba(16,42,67,0.06)`): Buttons at rest — barely there, just enough to lift them off a card.

### Named Rules
**The Flat-Container Rule.** A `.card` is a container, not a control. It does not lift, scale, or change border colour on hover. Only elements that are actually clickable (PYME cards, table rows, list items) get a hover response.

## Shapes

Two radii: 12px (`--radius`) for cards, modals, tables, the POS panel, and large surfaces; 8px (`--radius-sm`) for buttons, inputs, chips, and small controls. Pills (`--radius-pill`, 999px) for badges, category filter chips, the notification-tab and chart-range segmented controls, and count bubbles.

Borders are 1px hairlines. The one deliberately dashed element is the barcode scan input in the POS — a 1.5px dashed capture zone on a tinted ground that turns solid on focus. The active-nav indicator is a 3px gold bar with a rounded outer edge, inset against the sidebar's left edge. Icons are a custom line set (`Icons.jsx`), 24×24 viewBox, single 1.75px stroke, round caps and joins — the same weight at every size.

## Components

### Buttons
- **Shape:** 8px radius (`--radius-sm`); min-height 36px (44px on touch); 13px semibold text, tight tracking.
- **Primary** (`button-primary`): Navy fill, white text, hairline shadow. Hover → slate navy (`#243B53`) + raised shadow. The main action of a view.
- **Secondary** (`button-outline`): White fill, `#C1CEDC` border, text ink. Hover → steel-blue border + surface-alt fill. Neutral actions ("Importar / Exportar", "Cámara").
- **Accent** (`button-accent`): Gold fill, `#0B1D30` text (≈8:1). Hover → deep gold + white text. Exactly one per view, for the action the view is asking for (POS "Confirmar venta").
- **Danger, solid** (`button-danger`): Red fill — only the final submit of a confirmation.
- **Danger, subtle** (`button-danger-subtle`): Red-wash fill, red text, no border — the resting "delete" trigger in table rows. Fills red on hover.
- **Ghost** (`button-ghost`): Transparent, muted text; hover → surface-alt.
- **Focus:** 2px navy outline, 2px offset, on every variant.

### Chips
- **Category filter chips:** Pill, white fill, `#C1CEDC` border, 500 weight. Active → navy fill, white text, 600 weight. The count number sits inside, muted.
- **Segmented control** (notification tabs, chart-range picker): A pill track in surface-alt with a 1px hairline; the active segment is a solid navy pill, white text, 600 weight; resting segments are muted, hover to ink. The chart-range variant (`.chart-range` / `.chart-range-btn`) is the same thing one size down — 12.5px text, 32px min-height, no count bubble — and lives in a chart card's header. On narrow screens it goes full-width with equal-flex segments.

### Cards / Containers
- **Corner:** 12px.
- **Background:** White on the `#F7F9FC` ground.
- **Border:** 1px `#D9E2EC` hairline, always.
- **Shadow:** Resting (see Elevation). No hover lift on plain cards.
- **Padding:** 24px internal; `card-title` is 14px/600 with a 16px bottom margin and room for a trailing link/action.

### Inputs / Fields
- **Style:** White fill, 1px `#C1CEDC` border, 8px radius, 13.5px text.
- **Hover:** border → steel blue.
- **Focus:** border → navy, plus a `0 0 0 3px rgba(16,42,67,0.12)` navy-tinted glow. Caret is navy.
- **Disabled:** surface-alt fill, muted text.
- **On navy surfaces** (POS checkout, sidebar PYME select): translucent-white fill and border, gold focus border + gold glow.

### Navigation
- **Sidebar:** Navy (`#102A43`) with a `#243B53` right hairline, 240px. Items are 14px/500 in Navy Line (`#9DB2C6`, ≈6.6:1 on the navy — readable at a glance and for tired eyes) with a full-opacity line icon; hover → white text on a faint white wash. **Active** → white text, 600 weight, `#243B53` fill, and a 3px gold vertical bar inset on the left edge (`.rail-item.active::before`). Under `prefers-contrast: more` the resting text lifts to `#D3DEE9` and the rail's inner hairlines go to Steel Blue. The wordmark pairs the "Inventario" name with a monogram of three ascending bars whose tallest bar is gold.
- **Mobile:** Off-canvas drawer behind a fixed 56px navy topbar (hamburger + wordmark). The drawer carries the full sidebar, labels and all, and slides over a `rgba(11,29,48,0.55)` backdrop; it closes on navigation, backdrop tap, or Escape, and locks body scroll while open.

### KPI card (signature)
White card, 24px padding. A 12px/500 muted label, a 26px/800 navy value with tabular figures, a 12px muted hint line. Exactly one KPI per view may take gold (`dash-kpi-accent`) — the margin. A KPI that *is* an alert takes red (`dash-kpi-alert`), green when the alert count is zero.

### Alert spotlight (signature)
The single most urgent reorder, pulled out above the list as a white card with a `rgba(201,76,76,0.4)` border, a red overline label with a leading dot, the product name in navy, and the quantity-to-order as a 28px/800 **red** numeral. Urgency is red, not navy.

### Confidence meter (signature)
A pill track (`#F1F4F9`) with a `scaleX`-driven fill: steel blue by default, green above 70%, gold 40–70%, hairline-grey below. Paired with a tabular percentage and the word "confianza". Used per row in the demand-prediction list.

### POS panel (signature)
A single bordered white panel in three stacked bands — scan (white, big dashed capture input), cart (white list), and checkout (the one navy band: "PAGÓ CON" / "VUELTO" / "TOTAL A COBRAR" at 40px/800 gold, and the gold "Confirmar venta" button). The recent-sales history is a separate, quieter white card beside it.

## Do's and Don'ts

### Do:
- **Do** lead every screen with the decision it wants made, and size the number that drives it to weight 800 with tabular figures.
- **Do** keep gold to at most three marks per view: active nav, the one hero metric, one CTA.
- **Do** put every surface on a white card with a 1px `#D9E2EC` border on the `#F7F9FC` ground.
- **Do** use the spacing scale (4/8/12/16/24/32/48) via `--sp-1`…`--sp-7`; more space above a heading than below.
- **Do** theme the browser surfaces — selection is gold-wash, scrollbars are hairline-strong pills, focus rings are 2px navy.
- **Do** render charts on white cards: navy bars, `#D9E2EC` grid, `#556C82` ticks, a rounded bordered tooltip. Disable Recharts entrance animation on bar charts.
- **Do** turn a category bar chart horizontal (`layout="vertical"`) when the labels are product names or anything longer than ~8 characters — the name goes on the Y axis with room to read, instead of overlapping under a vertical axis. Keep the value axis labelled and order bars high→low. The Y-axis tick colour steps up to `#172B4D` since it now carries the item identity.
- **Do** offer a time-range control on a trend chart as a compact pill segmented control in the card header (`.chart-range`: same track/active language as the notification tabs). Keep the set small — Semana / Mes / Trimestre / Año — and put a plain-language "por día · últimos 7 días" sub-label next to the card title so the bucketing is never a guess.
- **Do** give data figures Inter with `tabular-nums` + slashed zero, not a monospace face.

### Don't:
- **Don't** use a navy block to mean "urgent" — that is red. Navy is identity and navigation.
- **Don't** fill a region with gold, put gold behind body text, or use gold for a status.
- **Don't** lift, scale, or glow a plain `.card` on hover; only actually-clickable elements get hover feedback.
- **Don't** use gradients as fills, glass/blur as decoration, or a colored `border-left` wider than the 3px nav indicator.
- **Don't** collapse the mobile sidebar to an icon-only strip — it becomes a full-label drawer.
- **Don't** reintroduce a serif display face or emphasis-by-italic; emphasis is a weight step.
- **Don't** add per-row staggered entrance animations to data tables.
