---
target: frontend/src/App.jsx
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-09T03-13-18Z
slug: frontend-src-app-jsx
---
Method: dual-agent (A: 019fe480-c946-71e3-86fa-bc7baed0978b · B: 019fe480-dcc0-7923-bfa4-57b82249d217)

Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading, success, busy, and empty states exist; business-decision status is weaker. |
| 2 | Match System / Real World | 2 | Merchant language exists, but terms like lead time, ML model, confidence, and predicted profitability need plainer framing. |
| 3 | User Control and Freedom | 3 | Cancel/Escape/filters/pagination are present; no undo for stock-changing or destructive actions. |
| 4 | Consistency and Standards | 3 | Shared components hold together; Spanish copy/encoding inconsistencies weaken trust. |
| 5 | Error Prevention | 2 | Some HTML constraints and delete confirmation; sales, stock edits, and predictions need stronger guardrails. |
| 6 | Recognition Rather Than Recall | 3 | Labeled nav and visible controls help; prediction meaning still requires interpretation. |
| 7 | Flexibility and Efficiency | 2 | Search/import/pagination exist; limited bulk workflows and custom table keyboard behavior need refinement. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean operational UI; too many equally weighted card/table regions hide what matters most. |
| 9 | Error Recovery | 2 | Errors display, but likely raw API wording and little next-step recovery. |
| 10 | Help and Documentation | 1 | Chat exists, but little contextual help at high-stakes inventory/prediction decisions. |
| **Total** | | **24/40** | **Acceptable** |

Design Specificity Verdict

LLM assessment: Moderately generic admin dashboard with some merchant-specific substance. The structure is calm and usable, but it could still belong to many CRUD SaaS products. The product's real promise, deciding what to buy, maintain, reduce, or stop selling, is present in data structures but not yet dominant in layout or copy.

Deterministic scan: `detect.mjs --json frontend/src/App.jsx` returned 0 findings. Broadened scan from Assessment B over `frontend/src` also returned 0 findings. No false positives.

Visual overlays: No reliable user-visible overlay. Browser/Playwright check failed with EPERM while accessing `C:\Users\USER\AppData\Local\OpenAI\Codex`; no dev server was started.

Overall Impression

Competent operational base, not yet a confident merchant decision tool. Biggest opportunity: make the app answer “what should I do today with my products?” before showing generic analytics.

What's Working

- Solid operational skeleton: labeled navigation, tables, filters, pagination, modals, badges, empty/loading states.
- Restrained palette fits a serious small-business tool; red/green mostly reserved for status.
- Import flow and chat assistant point toward a useful product for merchants without analytics support.

Priority Issues

**[P1] Main value proposition is buried**
Why it matters: merchants need action, not only KPIs. Dashboard starts as a reporting surface instead of a decision surface.
Fix: lead with urgent reorder, strongest investment product, weakest product, and confidence/risk summary.
Suggested command: `$impeccable layout`

**[P1] Prediction output is descriptive, not decisional**
Why it matters: “Demanda estimada” and “Confianza” still require the merchant to infer action.
Fix: add recommendation labels like “Comprar más,” “Mantener,” “Vender antes de reponer,” “Revisar margen,” with short reasons.
Suggested command: `$impeccable clarify`

**[P1] Copy/encoding issues damage trust**
Why it matters: strings like `PredicciÃ³n`, `AÃ±adir`, `MÃ­nimo` make a money/stock app feel unreliable.
Fix: normalize source encoding and correct visible Spanish copy across UI files.
Suggested command: `$impeccable polish`

**[P2] Inventory rows overload row-level decisions**
Why it matters: each row mixes product data, stock state, sale entry, edit, and delete in one strip. Fast selling and inventory maintenance compete.
Fix: group row actions, separate quick-sale affordance from destructive/admin actions, or move secondary actions into a compact menu.
Suggested command: `$impeccable distill`

**[P2] Help is present but not contextual**
Why it matters: users need explanation near “stock de seguridad,” “lead time,” reorder quantity, and confidence, exactly when decisions cost money.
Fix: add inline hints/tooltips and decision rationale beside the values that need interpretation.
Suggested command: `$impeccable onboard`

Persona Red Flags

**Alex (Power User)**: Search/import help, but no bulk edit, bulk reorder, batch sale, shortcut discoverability, or fast “act on all urgent alerts” workflow. Custom arrow-key table handling may frustrate expected browser/table behavior.

**Sam (Accessibility-Dependent User)**: Good: skip link, labeled nav, aria-modal focus work, busy labels. Risk: charts need text equivalents, badges may lean on color, custom table focus needs screen-reader semantics, and dropdown/profile focus styling is minimal.

**Jordan (First-Timer)**: Can find sections, but may not understand lead time, stock de seguridad, modelo ML, rentabilidad predicha, or confidence percentages. The interface names metrics more than it explains decisions.

Minor Observations

- Brand text “Inventario” is generic for a product whose stronger identity is decision guidance.
- “Dashboard” mixes English into otherwise Spanish navigation.
- Footer items “Whatsapp,” “Correo,” “Chat,” and “Ayuda” look like links but appear non-interactive.
- Dashboard `Top productos por ingresos` appears to show `#{p.id}` under Producto instead of product name.
- Chat suggestions show six options, above the low-load threshold.

Questions to Consider

- What if the dashboard opened with “Hoy debes comprar, mantener o frenar estos productos”?
- Should predictions be a ranked decision list first and a chart second?
- What evidence would make a shop owner trust the recommendation enough to spend real stock money?
- Is the product “Inventario,” or “decidir qué comprar y qué dejar de vender”?
