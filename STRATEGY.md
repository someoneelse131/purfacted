# PurFacted Strategy: Ground-Truth Layer for AI

> Strategic framing and forward backlog, distilled from the 2026-06 direction
> review. This sits one level above `REQUIREMENTS.md` (vision + positioning +
> work backlog). The concrete strands below should be folded into
> `REQUIREMENTS.md` as new requirements (R51+) so the requirements catalog stays
> the single source of truth for business rules. `FUTURE-IDEAS.md` remains the
> home for explicitly deferred concepts.

## Mission

PurFacted is the human-verified ground-truth layer that AI systems retrieve and
cite at inference time. Where LLMs lean on Wikipedia today, they should reach for
a machine-readable, attributed, current, human-verified source tomorrow. The
antidote to AI slop and misinformation.

## Positioning (what we are NOT)

- **Not** an "academically citable Wikipedia." That is a known graveyard
  (Citizendium failed; Scholarpedia is citable only because it dropped the crowd
  model). Crowd scale and academic citability pull in opposite directions.
- **Not** opinion voting. Status comes from a weighted, community-evaluated
  evidence balance, never from votes on the claim itself.

## The USP question (read this before building anything)

The LLM-grounding idea itself is **not** a USP. It is a crowded race, and the
tech pieces (read API, ClaimReview markup, MCP adapter) are commodity, buildable
in weeks. None of it is defensible on its own.

The only defensible, non-clonable moat is **cumulative**:

1. The network of verified human reviewers and their accumulated track-record
   (this is Wikipedia's real moat: the editors, not the software).
2. The corpus of verified claims with provenance, which grows with use.
3. Trust / brand as a citation source, the signal LLM providers actually select
   on. Incumbency is sticky.
4. The data flywheel: more verifications -> more LLM usage -> visible impact ->
   more reviewers -> more verifications.

**The moat and the hardest problem are the same thing.** Whoever only builds the
API has no USP. Whoever builds the community has the only one. It is not
one-time; it compounds.

## The three hard problems everything is designed around

1. **Cold start** (no coverage -> no value to LLMs -> no users).
2. **Contributor motivation** (unpaid, hard verification work).
3. **Manipulation / poisoning** (once cited, we are attack target #1: a forged
   VERIFIED launders falsehood into millions of AI answers).

## Architecture principle

Tool/data service first, website second. **Build a clean HTTP/JSON API core
(never goes out of style) and put thin protocol adapters on top** (MCP, A2A agent
card, OpenAI tool schema). MCP is the 2026 standard for agent-to-tool
connectivity (Linux Foundation AAIF governance, all major vendors); A2A is
complementary (agent-to-agent), not a successor. Do not bet the architecture on
any single protocol.

## Content population model

The vision does not lower the bar (human-verified evidence balance stays); it
raises the pressure on coverage and changes how we populate:

- **Demand-driven, not random.** Log "gap queries" (API/MCP/user asks where we
  return nothing) and make that the reviewer worklist. Populate what is actually
  needed.
- **AI assists, humans verify.** R37 writing-assist may help draft claims and
  find sources faster. The evidence verification step stays mandatory and human.
  AI proposes, human verifies, AI never verifies.
- **Prioritize** contested / high-misinformation-risk / frequently-asked claims
  over trivia.
- **Freshness obligation.** Facts age. Expose "last reviewed" and add re-review
  triggers; LLMs need current verdicts.
- **Rate = verification capacity.** The corpus grows only as fast as the reviewer
  community can sustain quality. The community is the bottleneck, not content.

## Distribution model

Goal is **committed reviewers + authority, not reach.** Posting random facts on
social media is the wrong lever (vanity impressions, near-zero conversion to
reviewers, slop risk).

- **For LLM/crawler discovery:** authority backlinks and citations from sources
  LLMs already trust (Wikipedia, news, authoritative niche sites), structured
  data, a real API + bulk dump. Authority, not impressions.
- **For contributors:** recruit where the chosen vertical community already
  argues about evidence (specific subreddits, fediverse, professional/academic
  forums, field Discords/Slacks). Quality of 50 committed verifiers beats 50k
  passive scrollers.
- **Social media's on-mission role:** showcase impact and brisant verified
  verdicts to pull the right people in, directly where misinformation lives.

---

# Prioritized backlog

Recommended order: 0 (gate) -> 1 (machine-consumable core) -> 2 (integrity) ->
3 (impact attribution). 4-6 run alongside.

## 0. Decision gate (before building)

- [ ] Confirm purpose = product/mission (not pure portfolio).
- [ ] Run a cheap demand test on ONE narrow vertical: 30-50 real reviewers,
      observe whether the contribution loop self-sustains.

## 1. Become machine-consumable (highest leverage, the new core)

- [ ] Public read API (REST/JSON): claim, verdict, PRO/CONTRA evidence, sources,
      confidence, provenance, "last reviewed".
- [ ] ClaimReview / schema.org markup on every claim page.
- [ ] Bulk data dump + permissive license (e.g. CC-BY) with attribution duty.
- [ ] MCP server adapter on the API core: `verify_claim(text)`,
      `search_claims(query)`, `get_evidence(id)`. The lane we can start now.
- [ ] Crawler access: `robots.txt` / `llms.txt`, allow AI bots. (SSR already in
      place is an advantage.)
- [ ] Stable permanent claim URLs + versioning with a fixed identifier
      (DOI-like), so an AI can cite a frozen state.
- [ ] Usage telemetry: count API/MCP queries per claim (feeds the motivator in 3).

## 2. Trust & integrity (existential, we are an attack target)

- [ ] Real-human verification / proof-of-personhood: limit anonymity for voting.
      Decide method (email is weak). Set the friction-vs-trust tradeoff
      deliberately.
- [ ] Anti-poisoning hardening: full audit trail, provenance on every verdict,
      immutable versioned records.
- [ ] Methodology transparency page (how verdicts are computed: credibility
      tiers, K, quorum). Trust signal for LLM providers and users.
- [ ] Expose confidence/uncertainty in the API (calibrated, not binary).

## 3. Motivation / gamification (design now, bites at scale)

> Rule: you get more of what you reward. Reward ACCURACY and CALIBRATION, never
> volume/speed/streaks (those breed the slop we fight).

- [ ] Impact attribution surface: "your verification was used in N AI
      answers/queries." Killer motivator, builds on telemetry from 1.
- [ ] Portable, verifiable reputation as a real credential (public, exportable).
- [ ] Calibration track-record / hit-rate display (Metaculus model; the existing
      early-vote-matches-consensus bonus is this).
- [ ] Mastery / unlocks = responsibility (harder claims, expert status, veto
      rights).
- [ ] Do NOT add volume/streak gamification.

## 4. Distribution / go-to-market

- [ ] Pitch the grounding API/MCP to AI builders (RAG/agent devs) as
      hallucination/slop reduction. Controllable channel, breaks chicken-egg.
- [ ] Earn authority: get cited by Wikipedia/news, backlinks, brand.
- [ ] Domain reputation + trust/legal pages.
- [ ] Recruit verifiers in the chosen vertical community.

## 5. Legal / compliance

- [ ] Defamation exposure for REFUTED claims about real people/companies.
- [ ] License terms for API/data reuse.
- [ ] Privacy/legal for human verification (PII).

## 6. Could still be done / open R&D

- [ ] Evaluate bridging-style aggregation (Community Notes: agreement despite
      disagreement) as a complement to reputation weighting; empirically strong
      against polarization.
- [ ] Freshness/update model details (re-review triggers, staleness signals).
- [ ] Machine-readable "confidence + last reviewed" so an AI can decide whether
      to trust a given verdict.

---

# 2026-06 multi-perspective review (3 independent agents)

Three independent critical takes (investor / product-community / AI-trust lens).

**Consensus (strong signal):**
- Mechanics & engineering are good; that is NOT the problem.
- The real problem is cold-start + distribution + trust, not the mechanics.
- The "LLMs cite you" vision in its current form is the weakest link. Shelve or
  radically narrow it; it is a channel you do not control.
- The only realistic LLM path is the grounding API/MCP, but as B2B developer
  distribution, and it dies on coverage (an API that returns "no data" 95% of the
  time gets removed).
- Narrow to ONE low-partisanship, high-value vertical and own it; seed the corpus
  yourself. Named independently twice: health/supplement claims, consumer/product
  claims.
- Tool, not platform. Useful from day one (bot / browser extension / API) before
  any community exists.
- Willingness-to-pay is unproven; validate usage/payment before building more.

**Disagreement to resolve:**
- Governance: SIMPLIFY for launch (product lens: cut roles/reputation/quorum/veto,
  it is governance for 100k users you don't have) vs HARDEN for trust (AI lens:
  probation is not enough, need Sybil-resistant identity + stake/slashing).
  Resolution = time horizon: simplify now (pre-traction), harden only if/when
  pursuing the trusted-LLM-source role at scale. Both at once is the mistake.
- "What kills it" stacks rather than competes: cold-start dead-loop (need
  authority for integration but integration for authority) + partisan capture
  (the credibility fight just moves one layer down, "is this source credible") +
  poisoning/reputation-farming (Expert x3.0 is a single point of capture: buy
  three "experts" in a niche and you own its ground truth).

**Concrete design critique (AI/trust lens):** reducing truth to a single weighted
balance conflates STRENGTH of evidence with DIRECTION; a 50/50 DISPUTED can mean
"genuinely contested" or "we have no idea" (opposite epistemic states). Emit
confidence/coverage as a SEPARATE dimension from PRO/CONTRA, and make the honest
`insufficient_evidence` / "I don't know" response the make-or-break interface.

**Net:** idea + code are strong, the platform ambition is not. All three converge
on: narrow paid niche, tool not platform, honest "don't know", prove demand
first. Reinforces the Gate (section 0) much harder than the original plan did.
