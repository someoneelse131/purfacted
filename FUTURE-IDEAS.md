# PurFacted - Future Ideas & Deferred Concepts

Parking lot for concepts that were deliberately deferred or noted for later.
Nothing here is scheduled; when an idea becomes relevant, it gets promoted into
REQUIREMENTS.md as a proper requirement.

---

## Structured Public Debates (deferred 2026-06-13)

Removed from the v2 catalog (was R31/R32) because of the worst effort/value ratio
in the catalog and a known conceptual weakness. Preserved here in full so it can
be revived.

### Original concept

- Any verified user challenges another user on a specific fact (e.g. from a
  comment); challenged user accepts/declines within 7 days
- Fixed turns, public from the start: Opening (max 1500 chars) -> Rebuttal
  (max 1500) -> Closing (max 1000), each side, alternating, 72 h per turn
  (auto-forfeit on timeout)
- Debate page linked from the fact
- After closing: 7-day community vote "more convincing side" (weighted)
- Winner +5 reputation, loser 0 (participation stays attractive)
- Result displayed permanently on debate + fact page
- (v1 also had private debates - dropped even earlier, keep dropped)

### Known weaknesses to solve before reviving

1. **Verdict bias:** the community vote happens after the fact's status is known;
   voters will simply pick the side matching the verdict. Ideas: blind voting
   (side labels hidden), vote opens only while the fact is still UNDER_REVIEW,
   or a small randomly-selected juror panel instead of an open vote.
2. **Competes with the core mechanism:** the platform's thesis is "evidence
   decides, not rhetoric". A debate feature rewards rhetoric. It must be framed
   as entertainment/engagement, never as input to fact status.
3. **High state-machine cost:** challenge/accept/decline, 3 turn types, per-turn
   timeouts, forfeit, voting window - a lot of lifecycle for one feature.

---

## Monetization & Legal Form (notes, status 2026-06-13)

Current stance: **non-profit / hobby project**, no revenue, operator identity in
the legal pages is a placeholder. Deciding the operator identity is a tracked
launch blocker (PROGRESS.md).

### Monetization hooks that already exist in the concept

- **Public API tiers (R39):** the API is keyed and rate-limited per tier
  ("FREE 100/day default") - this is the only built-in monetization hook.
  Paid tiers for commercial consumers (media, researchers, integrators) would be
  the most natural first revenue without touching the community's incentives.

### Options compatible with the non-profit character

- **Donations** (Open Collective / GitHub Sponsors / Ko-fi); transparent budget
  fits the platform's credibility mission.
- **Paid API tiers** for commercial use (see above); free tier stays for
  individuals.
- **Organization verification fee** (one-time, covers moderator review work).
  Caution: must never look like buying influence - orgs have 0 vote weight by
  design, the fee may only cover verification effort.
- **Grants / journalism & democracy funds** (fact-checking is a funded space).
- Embeds and RSS stay free - they are reach, not product.

### What NOT to do

- No ads (credibility platform + ad incentives contradict each other).
- No paid reputation/weight of any kind, ever.

### Legal form: what makes sense when

| Stage                           | Form                                     | Notes                                                                                                                           |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Demo / no real users (now)      | Placeholder operator in config           | Acceptable while access is effectively demo-only                                                                                |
| Real users and/or donations     | **Swiss Verein**                         | Cheap (no capital), liability limited to association assets, fits non-profit, can receive donations; 2+ founding members needed |
| Substantial revenue (API tiers) | Verein with commercial sideline, or GmbH | GmbH (CHF 20k capital) for serious commercialization or if liability exposure grows (defamation claims)                         |

Defamation note: the platform publicly marks claims about people/companies as
REFUTED. Before opening to real users, the takedown path (R46) must be live and
the operator question answered - personal operation means personal liability.

---

## Other deferred ideas

- **Global source entities:** today sources are per-fact rows keyed by URL. A
  global `source_documents` entity (URL-canonical) with per-fact attachments
  would let credibility and vote history accumulate per document/domain across
  facts, and enable per-domain credibility learning (a predatory journal is
  PEER_REVIEWED=5 today; a learned domain score could correct that). Big
  refactor; revisit when data volume justifies it.
- **Staleness / re-review:** decided facts stay decided forever unless vetoed,
  but evidence ages (science changes). Idea: "decided N years ago" indicator and
  an optional scheduled re-open for old high-traffic facts.
- **Nuanced verdicts:** VERIFIED/DISPUTED/REFUTED is coarse; many claims are
  "true but misleading". Idea: a community/moderator-written verdict summary
  paragraph on decided facts (context, caveats) without adding new statuses.
- **i18n:** English-only by design for now; revisit with real audience data.
- **pgvector:** only needed when the embedding dedup provider (R40) lands -
  requires a Postgres image with the extension; the `SimilarityProvider`
  interface (R27) is the preparation.
