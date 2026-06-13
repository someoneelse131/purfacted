# PurFacted Design System

> Single source of truth for all UI work. Every new page/component follows this;
> deviations need a documented reason here. Direction (user-approved 2026-06-13):
> **Trust/Editorial, light-first** - the calm, credible look of serious
> fact-checking and science publications.

## 1. Principles

1. **Status is the hero.** The fact status (VERIFIED / DISPUTED / REFUTED /
   UNSUBSTANTIATED / UNDER_REVIEW) is the most important visual element on any
   surface. It must be readable at a glance, color + icon + label (never color
   alone - accessibility).
2. **Calm and neutral.** Lots of whitespace, restrained color, no gradients, no
   decorative imagery. The platform must never look like it is selling an
   opinion. One accent color, used sparingly.
3. **Evidence-dense but readable.** Evidence columns, queues and tables are the
   core surfaces; favor clear hierarchy and generous line-height over decoration.
4. **Lightweight.** No external font loading, no icon fonts, no CSS framework
   beyond Tailwind. Inline SVG icons only (Heroicons outline style, 1.5px
   stroke). Performance is a stated project priority.
5. **Accessible by default.** WCAG AA contrast, visible focus rings, 44px hit
   targets for interactive controls, aria labels on icon-only buttons.

## 2. Design Tokens

Defined as Tailwind 4 `@theme` tokens in `src/app.css`. Always use tokens /
semantic classes, never raw hex in components.

### Color

| Token                    | Light                       | Role                               |
| ------------------------ | --------------------------- | ---------------------------------- |
| `--color-canvas`         | `#f8f7f4` (warm off-white)  | Page background                    |
| `--color-surface`        | `#ffffff`                   | Cards, panels                      |
| `--color-ink`            | `#1c2733`                   | Primary text (near-black blue)     |
| `--color-ink-muted`      | `#5b6a79`                   | Secondary text                     |
| `--color-ink-faint`      | `#8b97a3`                   | Tertiary/meta text                 |
| `--color-line`           | `#e3e1db`                   | Borders, dividers                  |
| `--color-primary`        | `#1f4e79` (deep trust blue) | Links, primary buttons, active nav |
| `--color-primary-strong` | `#173b5c`                   | Hover/active                       |
| `--color-primary-soft`   | `#e8eff6`                   | Selected/soft backgrounds          |

Status palette (the semantic core - badge background is the soft tone, text/icon
the strong tone):

| Status           | Strong                 | Soft      | Icon                 |
| ---------------- | ---------------------- | --------- | -------------------- |
| VERIFIED         | `#1a7f4e`              | `#e3f3ea` | check-badge          |
| DISPUTED         | `#9a6b00`              | `#faf0d8` | scale                |
| REFUTED          | `#b3261e`              | `#fbe7e5` | x-circle             |
| UNSUBSTANTIATED  | `#5b6a79`              | `#eef0f2` | question-mark-circle |
| UNDER_REVIEW     | `#5b4ea0`              | `#edeaf7` | magnifying-glass     |
| Contested marker | `#c2410c` outline only | -         | exclamation-triangle |

PRO/CONTRA evidence columns: PRO uses the VERIFIED green family, CONTRA the
REFUTED red family, but only as thin top border + heading tint on the column,
never as full backgrounds (the sources themselves stay neutral).

**Dark mode:** tokens get a `prefers-color-scheme: dark` override block
(canvas `#11161c`, surface `#1a212a`, ink `#e7ecf1`, line `#2a333e`, status
tones lightened for contrast). Defined with the tokens from the start; pages
must only ever reference tokens so dark mode is free. No manual toggle yet
(can come with R50 polish).

### Typography

No webfont downloads. System stacks:

- **UI / body:** `ui-sans-serif, system-ui, sans-serif` (Tailwind default) -
  15px base (`--text-base: 0.9375rem`), line-height 1.6.
- **Claims / fact titles:** `ui-serif, Georgia, 'Times New Roman', serif` -
  the editorial signature. Used ONLY for fact claim titles (cards, detail page,
  embeds) and the wordmark. Weight 600, tight leading.
- Scale: `text-sm` meta, `text-base` body, `text-lg` section heads,
  `text-2xl/text-3xl` serif claims, `text-4xl` serif page hero.
- Numbers in scores/leaderboards: `tabular-nums`.

### Spacing, radius, elevation

- 8px spacing scale (Tailwind default). Page shell `max-w-6xl mx-auto px-4`.
- Radius: `rounded-lg` (8px) for cards/inputs, `rounded-full` for badges/pills.
- Elevation: borders over shadows. Cards = `bg-surface border border-line`;
  shadow only for overlays/menus (`shadow-md`). No decorative shadows.

## 3. Core Components (canonical looks)

- **StatusBadge** (`src/lib/components/StatusBadge.svelte`): pill,
  `soft bg + strong text + icon + uppercase label`, sizes sm (lists) / md
  (detail). The contested variant renders the previous status badge plus an
  outlined amber "CONTESTED" pill next to it.
- **FactCard** (feed/hub lists): surface card; serif claim title, category +
  time meta line in ink-faint, StatusBadge right-aligned (or quorum progress
  while under review). Whole card clickable, focus-visible ring.
- **QuorumProgress**: thin progress bar (primary fill on line track) + text
  "needs 3 more reviewers" in ink-muted. Never shows balance direction (blind
  review).
- **EvidenceColumn**: heading "PRO evidence" / "CONTRA evidence" with the thin
  colored top border; SourceCards inside are neutral surface cards with type
  chip (PEER_REVIEWED etc. as small uppercase chip), quote in serif-free body
  text, domain + archive link in meta line, vote controls right.
- **Vote controls**: icon buttons (chevron up/down) with count, 44px hit area,
  pressed state = primary-soft background; disabled (anonymous) shows tooltip
  "Sign in to review".
- **Buttons**: primary (primary bg, white text), secondary (surface, line
  border, ink text), danger (refuted red), ghost (text-only primary). One
  primary action per view.
- **Forms**: labels above inputs, `bg-surface border-line rounded-lg`, focus =
  primary ring, error text in refuted-red below field, help text ink-faint.
- **Header**: surface bar with bottom line; serif wordmark "PurFacted" left;
  nav (Facts, Review Hub, Categories, Leaderboards); right: submit button
  (primary) + user menu with level/role chip.
- **Footer**: ink-faint links (About, Terms, Privacy, Contact, API, Stats).
- **Queues/tables** (moderation, leaderboards): zebra-free, row dividers via
  line color, sticky header on long lists.
- **Badges/levels**: small rounded-full chips, primary-soft; role chips:
  Expert = primary-soft, Moderator = ink-soft, Organization = distinct outline.
- **Empty states**: centered icon + one sentence + one action; never blank.

## 4. Voice & Microcopy

- Factual, calm, no exclamation marks, no gamified hype ("Great job!!" is out;
  "Badge earned: Source Hunter" is in).
- Statuses always uppercase in badges, sentence-case in prose.
- Buttons are verbs ("Add source", "Submit veto", "Review now").
- Errors say what to do next, not just what failed.

## 5. Accessibility Checklist (every PR)

- AA contrast on text and status badges (the tones above are AA on their softs)
- Focus visible on all interactive elements (`focus-visible:ring-2` primary)
- Icon-only controls have `aria-label`; badges have `title`/sr-only status text
- Forms: `<label for>`, errors linked via `aria-describedby`
- Keyboard: every flow operable without mouse (vote, comment, moderate)

## 6. Implementation Notes

- Tokens live in `src/app.css` under `@theme`; semantic utilities like
  `bg-canvas`, `text-ink`, `border-line`, `bg-status-verified-soft` come from
  the token names.
- Shared UI primitives in `src/lib/components/` (StatusBadge, FactCard,
  QuorumProgress, SourceCard, Button/FormField as needed) - pages compose
  primitives, they don't restyle them.
- Status colors/icons are mapped in ONE module (`src/lib/status.ts`) consumed
  by badge, embed and OG-image code so they can never drift.
- E2E selectors: keep `data-testid` attributes stable when restyling.
