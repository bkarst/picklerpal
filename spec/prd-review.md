# PicklerPal — Spec Review (PRD + UI Spec)

> **Reviewer pass:** 2026-06-30
> **Docs reviewed:** [`pickler-pal-prd.md`](./pickler-pal-prd.md), [`pickler-pal-ui-spec.md`](./pickler-pal-ui-spec.md)
> **Cross-referenced:** [`court-admin.md`](./court-admin.md) (deferral doc), [`pickleheads-features.md`](./pickleheads-features.md) (PH teardown), [`../research/seo-keyword-research.md`](../research/seo-keyword-research.md) (KW)
> **Nature:** findings only — no changes have been made to the specs. Each finding cites section(s) and a suggested fix.

## Calibration

These are unusually strong specs: per-view render/auth/SEO annotations, exhaustive state coverage, a read-pattern-first single-table model with an access-pattern→index map, accessibility in every component, and a coherent free→paid funnel. The gaps below are mostly **one layer up** from where the docs operate — measurement, operations, infrastructure, risk — plus a tight set of concrete internal contradictions. Nothing here invalidates the design; it's what's missing around it.

## Severity legend

- 🔴 **Blocker** — would mislead the build or break the core thesis if shipped as-is.
- 🟠 **Major** — significant omission or contradiction; resolve before the affected area is built.
- 🟡 **Minor** — gap or cleanup; resolve opportunistically.

---

## Part A — Strategic gaps (the big overlooked things)

### 🔴 S1 — No measurement layer at all
**Where:** PRD §1 (goals), §8 (funnel); absent from §2 tech stack. Grep across both docs: zero hits for analytics / metric / KPI / North Star / conversion rate / A·B / Search Console.
**Why it matters:** The entire thesis is *SEO flywheel → multi-step conversion funnel*. With no event taxonomy, funnel instrumentation, Search Console integration, or experimentation path, you can't tell if the thesis works or which on-ramp converts. Goals in §1 have no measurable target, owner, or baseline.
**Fix:** Add a **Success Metrics / North Star** section (a measurable target per §1 goal) and an **Analytics & Instrumentation** section (tooling, event taxonomy, dashboards, Search Console, A/B framework). Add an analytics/tag layer to §2.

### 🔴 S2 — Cold-start / flywheel bootstrap is unaddressed
**Where:** PRD §3 (SEO strategy), §3.6 (freshness); court-admin.md §1 (launch = seeded, read-only).
**Why it matters:** The SEO moat depends on community data (check-ins, reviews, games) for freshness *and* page uniqueness. At launch there are zero users and a seeded, read-only directory — so ~24K court pages and ~9.7K city pages are thin templated listings, the exact "doorway/thin content" profile Google demotes. The docs assume the flywheel is already spinning.
**Fix:** Add a bootstrap plan — seeded/imported reviews or content, a content-threshold (noindex-until-populated) rule for empty pages, geographic phasing, and a paid-acquisition primer. Tie to S6 (thin content).

### 🟠 S3 — "Last verified" freshness has no mechanism at launch
**Where:** PRD §3.6 (freshness signals) vs court-admin.md (edit/claim/verify all deferred).
**Why it matters:** §3.6 sells "last verified dates," but with edit/claim/verification deferred, seeded facts rot with no correction path. The freshness story contradicts the read-only-seed reality.
**Fix:** Either define a launch verification mechanism (internal re-crawl/refresh cadence) or drop "last verified" from the freshness claims until court-admin ships.

### 🔴 S4 — Notification / email / push infrastructure is entirely unspecified
**Where:** Referenced throughout (email verification, password reset, receipts, RSVP confirmations, waitlist promotions, partner invites §12.7, league reminders, challenge deadlines). The §2 tech-stack table lists no email or push provider. UI §13.6 adds a Notification entity without the system that fills it.
**Why it matters:** This is load-bearing across the whole product and currently has no provider, delivery pipeline, digest/batching, quiet-hours implementation, unsubscribe/CAN-SPAM handling, or transactional-vs-marketing separation.
**Fix:** Add email + push providers to §2; spec the notification-generation pipeline (emitters, dedupe, batching, quiet hours, channelsSent), unsubscribe/compliance, and a subscriber entity (see D1).

### 🔴 S5 — The round-robin engine (the acquisition wedge) is a black box
**Where:** PRD §6.8; UI §11.1 ("12 fun formats") / §11.2 / §11.4.
**Why it matters:** UI advertises 12 formats; only ~5 are named, and **none** are specified — no matchup-generation algorithm, partner-rotation rules, court assignment, bye handling, or re-shuffle logic. The single feature the entire organizer funnel and the high-CPC tool-keyword play rests on (KW Cat 4) has no engine spec.
**Fix:** Enumerate the formats and spec each algorithm (inputs, constraints e.g. even count for fixed partners, round/match generation, court assignment, re-shuffle) — or reference a dedicated algorithm sub-spec.

### ✅ S6 — A social pillar (Groups/Clubs) was dropped silently and left vestigially referenced — **RESOLVED**
**Where:** PH §6.3/§11/§12/§14.1 (Groups: membership, group chat, per-court "group plays here", ~5K indexed pages). PicklerPal has no Groups entity, page, or non-goal entry — yet Court Detail's "Connect band" (UI §4.5 region 7) still shows a **"groups" count** and the copy **"Follow to chat & get invited"**, with no Groups and no chat anywhere.
**Why it matters:** Both an internal inconsistency and a tell that the cut was unintentional. Also see X7 (messaging).
**Fix:** Decide explicitly — build Groups + DMs, or remove the vestigial copy/count and list both as non-goals in §1.
**Resolved (built as a pillar):** Groups specced in **PRD §6.9** (hub/finder · detail ★ · create · manage · my-groups), data model §9.3 (`GROUP#`/`MEMBER#`/`Group invite`/`Group@court`/meet-up ref), sitemap §5, nav §4, SEO §3.1/§3.4, free→paid §8, access patterns #24–28, view index §11, decision §13(8); **meet-ups reuse Outings** (`hostType=GROUP`); build-exact UI in **UI Part 17**. Connective tissue = **member-status visibility** (playing-now / looking-for-a-game / meet-up RSVPs), **not chat** — group chat is now an explicit **non-goal** (§1), and the UI §4.5 "chat" copy was scrubbed → "Follow to see who's playing & get invited".

---

## Part B — Internal contradictions (most actionable; clean fixes)

| ID | Issue | Where | Suggested fix |
|---|---|---|---|
| 🟠 X1 | Ladders have nav + footer links but **no destination page** — sitemap has only `/ladders/[id]` and `/ladders/[id]/challenges`; no `/ladders` hub or `/ladders/.../[city]` finder. "pickleball ladder" (KW Cat 4) has no indexable landing. | PRD §4, §5; UI §3.3 | Add `/ladders` hub + location finder, or remove ladder from primary nav and route via Leagues. |
| 🟠 X2 | **DUPR write-back contradiction** — UI shows "DUPR submit: ✓" (asserts write-back); PRD lists read-only-vs-write as an *open question*. The DUPR-gated-division feature depends on an unconfirmed partnership. | UI §12.4.1 vs PRD §13 | Resolve DUPR scope before build; make UI match the decision; flag DUPR as a hard dependency (see G4). |
| 🟠 X3 | **Pricing sells an unbuildable tier** — §16.1 advertises a Facility tier (claim & manage, promote, integrations) + "Contact sales (facility)", but claim/facility management is deferred to court-admin.md. | UI §16.1 vs court-admin.md | Demote Facility to a "coming soon / contact us" lead-gen row, or remove until court-admin ships. |
| 🟡 X4 | **"{City} games" exists twice** with no stated canonical — City Directory Games toggle and a separate `/play/.../[city]` finder target the same intent. | UI §4.3 vs §10.1 | Declare one canonical for the city-games intent; cross-link the other or fold them. |
| 🟡 X5 | **"Until I leave" check-in breaks the TTL model** — offered as a duration, but `expiresAt` (TTL) is mandatory and "playing now" depends on expiry. | UI §5.1 vs PRD §9.3 | Add a hard max cap (e.g. 6h) for "until I leave" so presence always expires. |
| 🟡 X6 | **`games at a court` access pattern is self-contradictory** — §9.3 hand-waves "GSI2b … via GSI1 overload or extra"; the §9.5 note proposes a separate `OUTINGREF` item. | PRD §9.3 vs §9.5 (pattern 9) | Pick one mechanism (the `OUTINGREF` item is the cleaner single-partition option) and delete the other. |
| 🟡 X7 | **Messaging inconsistency** — profile "Message" is "gated/future", but league team chat ships; no message/chat entity exists in §9. | UI §6.1 vs §12.4.1; PRD §9 | Decide launch scope for chat; if shipping team chat, add the entity (D1) and reconcile the profile copy. |

---

## Part C — Under-specified mechanics (will block implementation)

### 🟠 U1 — Recurring outings: materialized or virtual?
RSVP is keyed per `OUTING#<id>` but there's a `SERIES#` master and "RSVP to this one / the series" (UI §10.2, PRD §9.3). Whether occurrences are pre-created or computed from RRULE — and how per-occurrence RSVPs reconcile with series RSVPs and exceptions (skip a week) — is unspecified. **Fix:** define occurrence materialization strategy and the series-RSVP data model.

### 🟠 U2 — Waitlist payment choreography
"You're #3 — charged only if a spot opens" (UI §12.1) requires SetupIntent / saved method / manual capture / auth-hold expiry handling — none specified. **Fix:** spec the Stripe deferred-capture flow and what happens when an authorization expires before promotion.

### 🟠 U3 — Partner-pending lifecycle
Registration sits `pending` until the partner accepts (UI §12.7). What holds the capacity slot, for how long, timeout/never-accept behavior, and fee-split refund are all unhandled. **Fix:** define hold duration, expiry, capacity accounting during pending, and refund-on-expiry.

### 🟡 U4 — Free-agent matching
Named (UI §12.3.3) with no algorithm, owner (organizer-manual vs auto), or flow. **Fix:** specify who matches and how.

### 🟠 U5 — Concurrency / last-spot races
Two registrants for the final spot, waitlist promotion, ladder-challenge accept — all need conditional writes / idempotency; only the Stripe webhook dedupe is specified (§10, §9.5 #23). **Fix:** add a concurrency note (DynamoDB conditional updates) to the registration/waitlist/challenge flows.

---

## Part D — Data-model gaps (PRD §9)

### 🟠 D1 — Missing entities
No entities for **messages/chat**, **newsletter subscribers** (capture appears on 4+ surfaces — homepage, /learn, /news, footer), **contact-form submissions** (UI §16.3), or a **followed-court game-alert subscription** (prefs exist on the profile, but not the match/fan-out entity that turns "new game at a followed court" into a notification). **Fix:** add the entities you intend to ship; cut the surfaces you don't.

### 🟡 D2 — Geohash hot-partition risk
Dense metros share a geohash prefix (GSI4, §9.7) → hot partition under load. **Fix:** note a precision/sharding strategy for high-density cells.

### 🟡 D3 — Mass-aggregation fan-out at seed time
Seeding 24K courts updates city/state/country `counts` via Streams (§9.4) — a large fan-out with consistency implications. **Fix:** note a batch-aggregation path for the import pipeline distinct from the steady-state Stream path.

---

## Part E — SEO risks the SEO section doesn't cover

### 🔴 SEO1 — Thin/doorway content at long-tail scale
See S2. ~24K courts + ~9.7K cities, most empty at launch (no reviews/check-ins/games). No content-threshold or noindex-until-populated rule. **Fix:** gate indexation on a minimum-content bar; let pages enter the index as they populate.

### 🟠 SEO2 — Faceted-nav canonicalization
"Popular searches" chips link to "filtered city views" (UI §4.3); only `/search?*` is disallowed (§3.7). Filter-combo URLs are a crawl-budget/duplicate trap. **Fix:** define canonical/noindex policy for filtered views.

### 🟠 SEO3 — hreflang missing
Country-level taxonomy + stated international ambitions (§13) but no hreflang. **Fix:** add hreflang to the templated metadata plan (§3.3) when multi-country/locale ships.

### 🟠 SEO4 — Interactive maps vs Core Web Vitals
§3.8 makes LCP a budget and a ranking input, but court/city ISR pages embed interactive Mapbox. **Fix:** use static map images with progressive enhancement on indexable pages; reserve interactive Mapbox for the noindex `/search`.

### 🟡 SEO5 — Map/weather cost & caching at scale
A forecast and a map per court across 24K courts is a real per-load cost/caching problem; weather source is still an open question (§13). **Fix:** define caching + provider/cost budget (ties to G3).

---

## Part F — Trust / safety / legal / compliance (all grep-zero)

### 🔴 T1 — User-uploaded image moderation
Avatars, court photos, review photos flow to S3 (§2, §6.4, §6.3) with no automated scanning (e.g. Rekognition/Hive) or CSAM handling — table stakes for UGC at scale. **Fix:** add an image-moderation step to the upload pipeline.

### 🟠 T2 — Anonymous check-in abuse
A browser token with no account (§6.2) can inflate "playing now" — the core social-proof/freshness signal — cheaply, with no anti-abuse. **Fix:** rate-limit/sanity-cap anonymous check-ins; consider proof-of-uniqueness.

### 🟠 T3 — No abuse reporting / blocking
No report/block for profiles, outings, reviews, or chat; no harassment handling for a product where strangers meet to play. **Fix:** add report/block flows + a moderation queue (review moderation is already an open question in §13).

### 🟠 T4 — Privacy / consent management
Geo-IP + Mapbox + (future) analytics = tracking; a "Do Not Sell" link exists (§3.3 footer) but there's no cookie-consent / GDPR-CCPA consent management. **Fix:** add a consent management platform; gate non-essential tracking.

### 🟡 T5 — Minors / COPPA
Youth divisions and a "Youth" amenity exist, but no under-13 handling or guardian-consent waiver for minors in paid events (§7, §12.1). **Fix:** add minor-consent handling to registration waivers.

### 🟠 T6 — Marketplace tax & disputes
§10 covers refunds but not 1099-K for organizers, sales tax on registration fees (Stripe Tax), chargeback/dispute handling, or platform-fee reconciliation on cancellation. **Fix:** add a tax/disputes subsection to §10.

---

## Part G — Doc-level structural improvements

The PRD has 13 sections but is missing the standard "spine" a build PRD of this scope needs:

- **G1 — Success Metrics / North Star** (per §1 goal). *(see S1)*
- **G2 — Analytics & Instrumentation** (tooling, event taxonomy, Search Console, experimentation). *(see S1)*
- **G3 — Non-Functional Requirements** — consolidate the scattered perf budget and add availability, security/authz model, privacy/compliance, observability, and cost budgets (Mapbox/weather/Dynamo).
- **G4 — Dependencies & Third-Party Risk register** — DUPR, Stripe Connect, Mapbox, weather, email/push, geo-IP, **and the seed-data source** — with fallbacks. ⚠️ Flag the legal exposure of the repo's `pickleheads-crawl.js` scraping a direct competitor to seed the directory.
- **G5 — Phasing / MVP cut** — 40+ views are presented flat as "the initial build" with only court-admin phased out. Define v1 vs fast-follow.
- **G6 — Content & Editorial Operations** — the SEO thesis depends on `/learn` + `/news`; who produces them, news sourcing/licensing, authentic E-E-A-T authorship.
- **G7 — Glossary** — DUPR/UTR-P/WPR/CTPR, open play, MD/WD/MX, Popcorn/Gauntlet — for builders who don't know pickleball.
- **G8 — Resolve §13 open questions before build** — several are load-bearing (DUPR scope, singles/doubles depth, weather source), not "decide later."

---

## Appendix — Pickleheads coverage tail

Beyond S6 (Groups) and X2 (DUPR write-back), the PH teardown surfaces a tail of smaller divergences — most look **deliberate**, a few like **oversights**:

- **Likely oversights:** co-organizer / shared-organizer roles (no role concept in organizer views or schema); **consolation brackets / back-draw** (only pool→single/double elim + league playoff); **round-robin standings/results export** (export exists for tournament registrations only); homepage trust/endorsement band (moved to /about only — a conversion downgrade); per-court "people who play here" roster drill-down (replaced by an aggregate "{N} players" count with no drill-down).
- **Deliberate (documented non-goals or clean strategic divergences):** coaching/lessons marketplace, gear e-commerce/affiliate + paddle-matching quiz, the subscription ladder + player-funded loop (deferred to a per-registration fee), crowdsourced court add/edit/claim (deferred to court-admin.md), Vacation Mode.
- **Undocumented-but-probably-intended cuts (worth naming as non-goals):** curated player Lists, facility integrations (CourtReserve) + paid facility promotion.

## Appendix — verification notes

Coverage claims above were checked by grep across both specs. Confirmed **zero** occurrences of: analytics, metric, KPI, North Star, conversion rate, A/B, hreflang, GDPR, CCPA, cookie consent, 1099, sales tax, Stripe Tax, chargeback, web push, FCM, uptime, observability, deliverability, unsubscribe, CAN-SPAM, currency, i18n, localization. ("consent" appears only in the legal-waiver sense; "moderat*" only re: review moderation as an open question + court-admin references.)
