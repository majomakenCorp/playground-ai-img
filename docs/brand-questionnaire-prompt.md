# Claude Code Prompt — Brand Brief Questionnaire

> **What this does**: Builds an 8-part, multi-step brand brief wizard as a single-file React artifact (.jsx) for claude.ai. Each part is a screen with distinct interaction patterns (text inputs, chips, sliders, archetype cards, tone selectors, visual grids). At the end it compiles all answers into a structured JSON object and displays a summary.

---

## Before starting, read and understand the repository:

1. Read the project root: `ls -la` and examine key config files
2. Identify the tech stack and existing patterns
3. Check for any existing components, utilities, or design tokens you can reuse
4. Read any linting/formatting configs

---

## Task: Build a Brand Brief Questionnaire Wizard

Build a **single-file React component** (`.jsx`) that implements an 8-part, step-by-step brand brief questionnaire. The artifact must work as a claude.ai artifact — all code in one file, using only Tailwind core utility classes and libraries available in the claude.ai artifact sandbox (React, lucide-react, recharts, lodash, d3, shadcn/ui).

**Do NOT use localStorage or sessionStorage.** Use React state (`useState`, `useReducer`) for all data.

### Design Direction

- **Aesthetic**: Editorial, refined, quiet confidence. Think a high-end brand strategy studio's intake form — not a SaaS onboarding wizard.
- **Typography**: Use a distinctive Google Font loaded via `<link>` in a `<style>` block at the top. Something like `DM Serif Display` for headings and `DM Sans` for body. Avoid Inter, Roboto, Arial.
- **Color palette**: Off-white background (#FAFAF8 or similar warm neutral), near-black text (#1A1A1A), one single accent color (a muted sage green like #7C8C6E or warm terracotta #C4775A) used sparingly for active states, selections, and progress indicators.
- **Layout**: Generous whitespace. Left-aligned content. Max-width ~680px centered. Each part occupies a full screen with smooth transitions.
- **Motion**: Subtle fade-in/slide-up on part transitions using CSS transitions. No heavy animation libraries needed.
- **Progress**: A minimal top progress bar or step indicator (e.g., "3 / 8" with a thin line) — not a numbered stepper with circles.

### Global Mechanics

- Use `useState` for current step (1–8) and a `formData` object holding all answers.
- Each part has a "Continue" button at the bottom. Back navigation via a subtle "← Back" link.
- Validate required fields before advancing (soft validation — highlight, don't block aggressively).
- At step 8 completion, show a **Summary** screen with all collected data organized by section, plus a "Generate Brief" button that logs the JSON to console and shows a confirmation.
- The entire form state lives in a single `useReducer` or nested `useState` — no prop drilling chaos.
- All UI text must be in **English**.

---

### Part 1: The Basics

**Title**: "The Basics"
**Intro**: "Three details to get started."

**1.1 — Brand Name**
- Text input with label "Brand name"
- Placeholder: "E.g. Marfil · Casa Lima · Talud"
- A small secondary link next to the input: "Help me create a name →" (non-functional, just renders as a muted link)

**1.2 — Sector**
- Label: "Sector"
- Helper text: "Pick the closest one. If your brand spans several, choose the dominant."
- Render as **single-select chip group** (pill-shaped buttons). On select, the chip fills with the accent color. Options:

  Food & Beverage, Fashion & Apparel, Beauty & Personal Care, Health & Wellness, Technology, Education, Real Estate, Architecture & Interiors, Hospitality, Finance, Retail, Media & Entertainment, Sustainability, Consulting & Professional Services, Automotive, Art & Culture, Sports & Fitness, Nonprofit & Social Impact, Luxury Goods, Other

**1.3 — Project Type**
- Label: "What kind of project is this?"
- Three **radio-style cards** (vertical stack, one selectable at a time). Each card has a title and a short subtitle:
  - **New brand** — "Starting from scratch."
  - **Redesign** — "You have a brand and you're refreshing it."
  - **Brand extension** — "A line or sub-brand within something existing."

---

### Part 2: The Core

**Title**: "The Core"
**Intro**: "Two short sentences. The first says why the brand exists. The second, what the person who chooses you gets."

**2.1 — Purpose**
- Label: "Purpose"
- Text input with inline prompt (placeholder): "We exist to…"
- Helper: "What drives the brand, not what it sells. Max 140 characters."
- Character counter that appears when typing, turns red past 140.

**2.2 — Promise**
- Label: "Promise"
- Text input with inline prompt (placeholder): "When someone chooses us, they get…"
- Helper: "The concrete value, in your customer's words. Max 140 characters."
- Same character counter behavior.

---

### Part 3: How the Brand Feels

**Title**: "How the Brand Feels"
**Intro**: "Five scales. Slide each one to where you'd want the brand to land."

Render **5 horizontal sliders** (range inputs styled with Tailwind), each with opposing labels:

| Left Label | Right Label |
|---|---|
| Serious | Playful |
| Warm | Clinical |
| Traditional | Avant-garde |
| Understated | Expressive |
| Refined | Raw |

- Default position: center (value 50 on a 0–100 scale).
- Show the current position as a subtle dot/thumb. No numeric value displayed to the user — just the visual position.
- Style the track and thumb to match the editorial aesthetic (thin track, small circular thumb in accent color).

---

### Part 4: The Character Behind It

**Title**: "The Character Behind It"
**Intro**: "Twelve classic archetypes. Pick the one that most resembles your brand, and a secondary one to add nuance."

**Helper above the grid**: "One primary. One secondary, optional."

Render a **4×3 grid of archetype cards**. Each card shows:
- An icon (use lucide-react icons — pick one that fits each archetype)
- The archetype name
- On hover: a microcopy line "How this brand shows up in the world" plus 2–3 example brand names

The 12 archetypes:

1. **The Innocent** — Coca-Cola, Dove, Nintendo
2. **The Explorer** — Patagonia, Jeep, National Geographic
3. **The Sage** — Google, TED, The Economist
4. **The Hero** — Nike, FedEx, BMW
5. **The Outlaw** — Harley-Davidson, Diesel, Virgin
6. **The Magician** — Apple, Disney, Tesla
7. **The Everyman** — IKEA, Target, Levi's
8. **The Lover** — Chanel, Victoria's Secret, Häagen-Dazs
9. **The Jester** — Old Spice, M&M's, Dollar Shave Club
10. **The Caregiver** — Johnson & Johnson, TOMS, Volvo
11. **The Creator** — Adobe, Lego, Moleskine
12. **The Ruler** — Rolex, Mercedes-Benz, American Express

**Selection states**:
- No selection: show a message "Pick your primary archetype"
- One selected (primary, accent color border): show "Pick a secondary (optional)"
- Two selected (primary = accent fill, secondary = accent border/dashed): show "All set"
- Clicking a third deselects the secondary and replaces it.
- Clicking the primary deselects everything.

---

### Part 5: Who You're Talking To

**Title**: "Who You're Talking To"
**Intro**: "Describe your audience."

**5.1 — Age Range**
- Label: "Age range"
- A **dual-handle range slider** (or two dropdowns if simpler) for min/max age, range 16–65+.
- Helper: "The core, not the full spectrum. If it's broad, prioritize the segment that matters most."

**5.2 — What Drives Them**
- Label: "What drives them"
- **Multi-select chip group** (same style as sector chips, but multi-select — chips toggle on/off).
- Helper: "Pick the ones that apply. Three or four is usually enough."
- Options:

  Status & belonging, Convenience & speed, Self-expression, Financial security, Health & longevity, Learning & growth, Sustainability & ethics, Community & connection, Adventure & novelty, Control & autonomy, Aesthetics & beauty, Tradition & legacy

**5.3 — Life Moment**
- Label: "Life moment"
- Text input.
- Placeholder: "E.g. Just moved · Starting their first business · Looking for a career change"
- Helper: "One line. The most revealing one."

---

### Part 6: How It Sounds

**Title**: "How It Sounds"
**Intro**: "Ten possible tones. Pick the one that resonates most with your brand — and the one that clearly doesn't."

Render **10 tone cards** in a vertical list or 2-column grid. Each card shows:
- A short label (the tone name)
- An example sentence in italics

The user must select **two** — one positive ("This one, yes") and one negative ("This one, no").

**Labels above selections:**
- Selection 1 (green/positive marker): "This one, yes"
- Selection 2 (gray/strike-through marker): "This one, no"

The 10 tones with their example lines:

1. **Formal & reverent**: "We deeply appreciate the trust you place in us."
2. **Technical & precise**: "We reduced cycle time by 32% with three specific adjustments."
3. **Warm & close**: "We know what you're solving. We're on the same side."
4. **Direct, no frills**: "It's not for everyone. If you've made it this far, it probably is."
5. **Dry humor**: "We made this without taking ourselves too seriously. Neither should you."
6. **Editorial & reflective**: "There are decisions you don't notice until they're missing. Those are the ones we take care of."
7. **Aspirational, elevated**: "For those who know that things done well take time."
8. **Honest & conversational**: "We won't promise you something we can't deliver. This is what we do."
9. **Provocative, contrarian**: "While everyone's looking the same direction, we're doing something else."
10. **Minimal & serene**: "Fewer things. Better made."

**Interaction**: First click on any card marks it as "yes" (green accent). Second click on a different card marks it as "no" (gray with strikethrough or muted). Clicking a selected card deselects it. Max 1 yes + 1 no.

---

### Part 7: How It Looks

**Title**: "How It Looks"
**Intro**: "Now the visual part. Three blocks: aesthetic, palette, and typography. Pick what resonates most with your brand."

**7.1 — Aesthetic Universe**
- Label: "Aesthetic universe"
- Helper: "Up to three references. If they all pull in the same direction, even better."
- Render as a **grid of visual cards** (3 columns). Each card has a styled preview zone (use CSS-only treatments — gradients, patterns, typography samples — to evoke the aesthetic) plus label and microcopy.
- **Multi-select, max 3.**

The 10 aesthetics with microcopy:

1. **Swiss Editorial** — "Dominant typography, clean grid, plenty of breathing room."
2. **Bauhaus** — "Primary shapes, rigorous geometry, functional color."
3. **Japanese Contemporary** — "Negative space, subtle type, almost monastic restraint."
4. **Digital Brutalism** — "Raw, unpolished. Structure on display."
5. **Mid-Century** — "1950s optimism: earthy palettes, humanist sans-serifs."
6. **Art Deco** — "Ornamental geometry, symmetry, golds."
7. **Memphis** — "Colliding shapes, saturated color, intentional play."
8. **Organic-Natural** — "Real textures, earth palettes, soft forms."
9. **New York Editorial** — "Like a cultural magazine: classic serif, weighty photography."
10. **Decorative Maximalism** — "Layers, patterns, fearless color. More is more."

For the CSS-only preview on each card, create small visual vignettes:
- Swiss Editorial: large bold type on a grid with thin rules
- Bauhaus: colored circles/triangles/squares
- Japanese Contemporary: lots of whitespace with a single thin line
- Digital Brutalism: monospaced type, thick borders, raw background
- Mid-Century: warm earth tones, rounded shapes
- Art Deco: geometric fan/sunburst pattern with gold accent
- Memphis: colorful squiggles and triangles
- Organic-Natural: soft green gradient with wavy shapes
- NY Editorial: serif type with a dark photograph-like block
- Decorative Maximalism: layered colorful patterns

**7.2 — Palette**
- Label: "Palette"
- Helper: "Eight curated ranges. Pick the one you like best."
- A secondary button: "Customize HEX →" (non-functional, renders as a muted link)
- **Single-select grid of 8 palette cards.** Each card displays 4–5 color swatches as circles or rectangles in a row, plus a label and microcopy.

The 8 palettes:

1. **Warm Neutrals** — "Paper, bone, sand. For brands that breathe." — Swatches: #F5F0EB, #E8DDD3, #C9B99A, #8C7B6B, #4A3F35
2. **Saturated Earths** — "Ochre, terracotta, olive. Body and memory." — Swatches: #C2703E, #A4512B, #6B7C3F, #D4A652, #3D2B1F
3. **Editorial Contrast** — "Black, white, one accent. Typography carries the hierarchy." — Swatches: #1A1A1A, #FFFFFF, #E63946, #F1F1F1, #333333
4. **Sustained Pastels** — "Soft but with body. Not childish." — Swatches: #C8D5BB, #F2D0A4, #D4A5A5, #A7C7E7, #F5ECD7
5. **Deep Jewels** — "Bottle green, wine, mustard. Brands with weight." — Swatches: #1B4332, #722F37, #C49B2A, #2C3E50, #8B6914
6. **Cold Monochrome** — "Grays working with one precise blue." — Swatches: #F0F0F0, #B0B0B0, #6B6B6B, #2D5F8A, #1A1A1A
7. **Contained Tropical** — "Saturated color, but curated — not carnival." — Swatches: #E07A5F, #3D9B8F, #F2CC8F, #264653, #E9C46A
8. **Off-Blacks & Raws** — "Blacks that aren't black, whites that aren't white." — Swatches: #2B2B2B, #1E1E1E, #F7F3EF, #3A3A3A, #E8E4DF

**7.3 — Typographic Direction**
- Label: "Typography"
- Helper: "Proven pairings."
- **Single-select grid of cards.** Each card renders the actual font pairing as a visual preview (load Google Fonts for preview). Show a heading sample + body sample in each card.

Suggested pairings (pick 6–8):

1. **DM Serif Display + DM Sans** — Classic editorial
2. **Playfair Display + Source Sans 3** — Elegant contrast
3. **Space Grotesk + Inter** — Tech-forward
4. **Fraunces + Work Sans** — Warm personality
5. **Instrument Serif + Instrument Sans** — Contemporary harmony
6. **Libre Baskerville + Karla** — Bookish warmth
7. **Syne + Outfit** — Bold geometric
8. **Cormorant Garamond + Montserrat** — Luxury meets clean

---

### Part 8: What You Don't Want

**Title**: "What You Don't Want"
**Intro**: "As important as what you want. What you rule out sharpens the direction."

**Field 1 — Clichés to Avoid**
- Label: "Clichés to avoid"
- Helper: "Check the ones that feel off for your brand."
- Render as a **multi-select grid of visual thumbnail cards** — each card represents a design cliché. Use CSS-only illustrations (no external images). Examples of clichés:

  Generic gradient blobs, Handwritten script logos, Overused geometric monograms, Stock photo lifestyle, Neon on dark, Excessive drop shadows, Clipart-style icons, Rainbow color schemes, Grunge textures, Cookie-cutter minimalism, Glossy 3D effects, Watercolor splashes

Each card: small CSS-only visual treatment + short label. Toggle on/off.

**Field 2 — Brands You Admire**
- Label: "Brands you admire"
- Helper: "Up to three. Not to copy — to locate the territory."
- Three text inputs in a row (or a tag-input that accepts up to 3).
- Placeholder: "E.g. Aesop · Patagonia · Standard Hotels"

**Field 3 — Brands You Want to Differentiate From**
- Label: "Brands you want to differentiate from"
- Helper: "Up to three. What you don't want to look like helps just as much as what you do."
- Three text inputs in a row.
- Placeholder: "E.g. direct competitors or references that don't resonate"

---

### Summary Screen (after Part 8)

After completing Part 8 and clicking "Finish":

- Show a clean summary of all collected data, organized by section.
- Each section is collapsible (open by default).
- A "Generate Brief" button at the bottom that:
  1. Logs the full `formData` JSON to the console
  2. Shows a confirmation message: "Your brand brief data has been captured. Copy the JSON from your browser console, or use it to generate a full brand manual."

---

## Code Quality Requirements

1. Single `.jsx` file, default export, no required props.
2. All styling via Tailwind core utility classes only — no custom Tailwind config, no `@apply`, no CSS modules.
3. Load Google Fonts via a `<style>` tag with `@import` at the component top (inside a `<style>` in the JSX return).
4. Use `useState` / `useReducer` for all state — **no localStorage, no sessionStorage**.
5. Responsive: works on desktop (1200px+) and mobile (375px+). Stack layouts vertically on mobile.
6. Accessible: proper `aria-label` on interactive elements, keyboard navigation for chips and cards, visible focus states.
7. Clean, readable code with comments marking each Part section.
8. All text in English.

## Before considering this task complete:

1. Verify the component renders without errors
2. Test each step transition (forward and back)
3. Verify all interaction patterns work (chips, sliders, archetype selection logic, tone yes/no logic)
4. Confirm the summary screen displays all collected data
5. Check mobile responsiveness
6. Review `git diff` — verify nothing unintended was modified
7. Ensure no hardcoded secrets, no TODO/FIXME left behind, no commented-out code
