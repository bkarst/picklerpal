# PicklerPal — Spec Review #2 (deeper pass)

> **Reviewer pass:** 2026-06-30 (second pass)
> **Docs reviewed:** [`pickler-pal-prd.md`](./pickler-pal-prd.md) (1,162 ll.), [`pickler-pal-ui-spec.md`](./pickler-pal-ui-spec.md) (1,190 ll.)
> **Cross-referenced:** [`picklerpal-strategy.md`](./picklerpal-strategy.md), [`court-admin.md`](./court-admin.md) (deferral), [`pickleheads-features.md`](./pickleheads-features.md) (PH), [`../research/seo-keyword-research.md`](../research/seo-keyword-research.md) (KW), and the first pass [`prd-review.md`](./prd-review.md).
> **Nature:** findings only — **no changes were made to the specs.** Each finding cites section/line and a suggested fix.
> **Relationship to review #1:** the docs have evolved substantially since the first pass (analytics §2.1, AdSense §2.2, the round-robin engine §6.8, Groups §6.9/Part 17, seed ingestion §9.8, the verification chapter §14, and the strategy doc all post-date it). This pass therefore (a) records what review #1 raised that is now **resolved / still open**, and (b) goes a layer deeper than review #1 did — into engine correctness, the check-in data model, real-time/infra decisions, and marketplace-money mechanics. Most of Part A–H below is **new** and was not in review #1.

---

## Calibration

These remain unusually strong specs, and they have visibly absorbed the first review: the measurement layer, the round-robin algorithms, Groups as a pillar, the thin-content guard, and a genuinely excellent §14 verification chapter are all now present. The remaining gaps cluster in four places that a first read glides over:

1. **The check-in data model quietly contradicts three features it powers** (history, "today" rollups, review-verification) because one TTL'd item is asked to be both ephemeral presence *and* durable record (Part A). This is the single highest-value new finding.
2. **The "live" surfaces have no transport** and several **load-bearing infrastructure choices are still forks or blanks** (real-time, auth provider, email/push provider, ISR-at-scale) — Part D/E.
3. **The round-robin engine — now specified — has correctness edges** (ties vs. a W-L-only UI, head-to-head in rotating formats, determinism vs. the §14 test, infeasible Popcorn/late-add) that will surface as bugs in the one feature the wedge depends on (Part C).
4. **The marketplace-money model stops at "take an application fee"** and doesn't address who funds refunds after payout, app-fee-on-refund, currency, or money typing (Part F).

Nothing here invalidates the architecture. As before, the gaps are one layer down or one layer up from where the docs are densest.

## Severity legend

- 🔴 **Blocker** — would mislead the build, break a shipped feature, or carry real financial/legal risk if built as-is.
- 🟠 **Major** — significant omission or contradiction; resolve before the affected area is built.
- 🟡 **Minor** — gap or cleanup; resolve opportunistically.

## What review #1 raised — current status (so this pass doesn't repeat it)

| #1 ID | Topic | Status now |
|---|---|---|
| S1 | No measurement layer | ✅ **Resolved** — analytics stack + event taxonomy §2.1; North Star/tree in `picklerpal-strategy.md`. |
| S2 / SEO1 | Cold-start / thin content | 🟡 **Largely resolved** — content-threshold + `noindex`-until-populated §14.4, §9.8; bootstrap still light (see R2-G6). |
| S4 | Notification/email/push infra | 🟠 **Partial** — Notification *entity* added (§9.3); **no provider, no pipeline, no compliance** still (see R2-E1). |
| S5 | RR engine a black box | ✅ **Resolved as spec** — 5 engines/8 presets in §6.8 — but now reviewable for **correctness** (see Part C). |
| S6 | Groups dropped / vestigial | ✅ **Resolved** — built as a pillar (§6.9 / UI Part 17); chat scrubbed to a non-goal. |
| X1 | Ladder has nav but no hub/finder | 🔴 **Still open** — see R2-J. |
| X2 | DUPR write-back contradiction | 🟠 **Still open** — see R2-J. |
| X3 | Pricing sells deferred Facility tier | 🟠 **Still open** — see R2-J. |
| X4 | "{city} games" exists twice | 🟡 **Still open** — see R2-G4. |
| X5 | "Until I leave" breaks TTL | 🟡 **Still open** — see R2-J. |
| X6 | games-at-court access pattern self-contradictory | 🟡 **Still open** — §9.3 still says "GSI1 overload or extra" while §9.5#9 says `OUTINGREF` — see R2-B2. |
| X7 / D1 | Messaging stance + missing entities | 🟠 **Still open & sharper** — team chat/broadcast ship with no entity/provider (see R2-E2, R2-B6). |
| T1 | Image moderation | 🔴 **Still open** — see R2-I1. |
| G1/G2 | Metrics / analytics sections | ✅ Resolved (strategy doc + §2.1). |
| G3–G8 | NFRs, dependency register, phasing, content ops, glossary, open-Qs | 🟠 **Still open** — see R2-J. |

---

## Part A — Check-in & presence: one TTL'd item is doing three incompatible jobs

This is the most consequential *new* finding. The check-in is modeled as a **single `CHECKIN` item with an `expiresAt` TTL** (§9.1 "TTL for check-ins (auto-expire 'playing now')"; §9.3 `expiresAt(TTL)`; §6.2 "TTL expiry (default 3h)"). DynamoDB TTL **deletes the item** (and its GSI projections). That same item is simultaneously asked to back durable, historical features. It cannot.

### 🔴 R2-A1 — "My Check-in History" is destroyed by the TTL that powers "playing now"
**Where:** PRD §6.2 / UI §5.3 ("`/account/checkins` — chronological list of courts you've checked into, frequency stats, **favorite courts**, this month") vs §9.3 (`CHECKIN … expiresAt(TTL)`) + access pattern #6 (`GSI1 USER#uid`, SK begins `CHECKIN#`).
**Why it matters:** with a ~3h TTL the base item and its `GSI1` projection are gone within hours, so the history view, the month/total/"favorite court" stats, and the dashboard's check-in counts can **never show more than the last ~3 hours** — the feature is empty by construction. The North Star (`picklerpal-strategy.md` §1) counts check-ins as a *play action*; if the durable record is TTL-deleted, WAP loses its largest input retroactively.
**Fix:** split presence from history. Either (a) write a **non-TTL `CHECKIN` history item** plus a separate **short-TTL `PRESENCE` item** for "playing now," or (b) keep one item, drop the TTL, and compute "playing now" purely by `expiresAt > now` at read (accepting that expired rows linger and must be swept). Decide which item feeds analytics.

### 🔴 R2-A2 — "N players checked in around {City} **today**" has no backing aggregate
**Where:** UI §4.1 (homepage strip "38 players checked in around Lenexa **today**") + §5.2 city rollup vs §9.4 (only `liveCheckinCount` is maintained) + the §9.3 TTL.
**Why it matters:** "today" is a **cumulative day** metric, but the only check-in aggregate is `liveCheckinCount` (currently-present), and the underlying items are TTL-deleted after 3h — so by evening there is no data from which to compute "today." The homepage and city pages promise a number the data model can't produce.
**Fix:** maintain a daily, non-TTL counter (e.g. `CITYDAY#<cityKey>#<yyyymmdd>` incremented on check-in via Streams), or restate the copy to the live "N playing now" metric the model actually supports.

### 🟠 R2-A3 — `liveCheckinCount` drifts because TTL deletion is asynchronous
**Where:** §9.4 (`liveCheckinCount` via "CHECKIN insert + **TTL-expire**").
**Why it matters:** DynamoDB TTL deletion is **best-effort and can lag up to ~48 hours.** A counter decremented on the TTL-delete Stream event will over-count "playing now" for as long as the delete is queued — inflating the exact freshness/social-proof signal §6.2 calls a differentiator, and a North-Star input the strategy doc already flags as gameable (`picklerpal-strategy.md` §1 guardrail). The list query (#5) is safe because it filters `expiresAt > now`; the **counter** is not.
**Fix:** treat `liveCheckinCount` as advisory and recompute from a time-windowed count on read for any surface that matters, or run a periodic reconciliation sweep; don't rely on prompt TTL deletion.

### 🟠 R2-A4 — "Verified via check-in" reviews depend on durable check-ins that don't exist
**Where:** UI §7.1/§7.2 + §2.5 ReviewCard ("verified via check-in" badge); PRD §6.4 (`checkinVerified`).
**Why it matters:** the badge requires proving "this reviewer checked in here." If check-ins TTL away in 3h, a review written the next day can't be verified — the trust feature only works inside the TTL window. Same root cause as R2-A1.
**Fix:** falls out of R2-A1 — verify against the durable check-in history record.

### 🟡 R2-A5 — Anonymous check-in carries an unmoderated public free-text "note"
**Where:** UI §5.1 / PRD §6.2 (anonymous check-in with optional `note` "open play, bring a paddle"), shown on the court strip (§5.2).
**Why it matters:** an account-less token can publish public free text on a high-traffic, indexable court page — an anonymous, unauthenticated message surface (spam/abuse/PII vector) beyond review #1's T2 (count inflation).
**Fix:** drop the note for anonymous check-ins, or length-cap + profanity/rate-limit it and exclude it from crawlable HTML.

---

## Part B — Single-table model: keys, queries, and aggregates

### 🟠 R2-B1 — Mutable `popularityRank` is embedded in a sort key
**Where:** §9.3 `GSI2 CITY#…/ COURT#<popularityRank>#<courtId>` (courts in a city) and `GROUPLOC#…/ <popularity>#<groupId>`; `popularityRank` listed under "computed" attrs and "refine later" (§9.8).
**Why it matters:** DynamoDB keys are immutable — you can't update a sort key in place. Every time popularity is recomputed you must **delete + rewrite** each court's GSI2 projection, and non-unique ranks **collide** in the SK (two "rank 3" courts in a city overwrite). The doc explicitly plans to "refine [rank] later," i.e. churn the very value it keyed on. This makes the city-page ordering expensive and fragile.
**Fix:** key GSI2 on a **stable** discriminator (e.g. `courtId`, or a zero-padded immutable seed-order) and sort/rank in the read layer, or store rank as a non-key attribute and re-sort on read. Same for `GROUPLOC`.

### 🟠 R2-B2 — Date-bucketed game queries have no defined timezone (and X6 is still unresolved)
**Where:** §9.3 `GSI2 CITYGAME#…#<yyyymmdd>` + access pattern #8; outings store `tz` (§9.3 attrs).
**Why it matters:** the city game-finder buckets outings by calendar **day**, but the day is computed in *which* timezone? If in UTC, a 9 pm-local Friday game in a Pacific city lands in Saturday's bucket and disappears from "Friday's games." Cross-tz correctness is load-bearing for the date stepper (UI §10.1) and for the §14 fixed-clock E2E (J3). **Separately, X6 from review #1 persists:** §9.3 still describes games-at-a-court as "`GSI2b … via GSI1 overload or extra`," while §9.5 #9 prescribes a dedicated `OUTINGREF` item — pick one.
**Fix:** define the bucket date as the **court's local day** (derive from the court's tz at write time) and store it explicitly; delete the "GSI1 overload" wording and standardize on `OUTINGREF`.

### 🟠 R2-B3 — The OUTINGREF / games-at-court pointer carries no visibility, leaking private group meet-ups
**Where:** §6.9 ("Private-group meet-ups inherit the group's visibility"); meet-ups are Outings with `hostType=GROUP` that "surface on … the **court's Upcoming Games** (§6.1), the **city game finder**"; access pattern #9 / §9.5 note (`OUTINGREF PK=COURT#id / SK=OUTING#<startTs>#<outingId>`).
**Why it matters:** a private group's meet-up at a *public* court would surface on that public, indexable court page and city finder unless the games-at-court query can filter by visibility — but the `OUTINGREF` item as specced carries only `startTs`+`outingId`, no `visibility`. Either the query fans out to read each OUTING/META to check visibility (defeats the single-query design) or private meet-ups **leak** onto public pages.
**Fix:** project `visibility` (and `hostType`/`groupId`) onto `OUTINGREF` so the court/city query filters in one shot; assert "private meet-up never appears on a public court page" as an E2E case.

### 🟠 R2-B4 — The "every view = 1 query" headline is contradicted by the binding matrix
**Where:** §9.5 header ("every view is one query") and §9.6 Pro ("every view = 1 round trip") vs UI §15.2, which binds **Court detail = #1 + #4 + #5 + #9** (slug + reviews + check-ins + games) — four queries; City directory = #2 + #8 + nearby; etc.
**Why it matters:** the claim is a stated design guarantee and a §14.6 test target ("assert call count = 1, no scans"). Rich pages legitimately need several single-partition queries; if §14.6 enforces "= 1" literally it will fail the crown-jewel pages, and the headline oversells the model.
**Fix:** restate as "**each access *pattern* is one query; a view composes a small, bounded set**," list the per-view query budget (court detail = 4), and make §14.6 assert the budget, not `=1`.

### 🟡 R2-B5 — Stream-maintained aggregates have no reconciliation path
**Where:** §9.4 (all counters: `reviewCount`, `ratingAvg`, `memberCount`, `counts{}`, `registeredCount`, materialized `STANDING#`).
**Why it matters:** DynamoDB Streams are at-least-once with 24h retention; dropped/duplicated/late events make denormalized counters drift over months. `registeredCount`/`spotsLeft` drift is a **money/oversell** problem, not cosmetic.
**Fix:** add a periodic reconciliation/repair job per aggregate (recompute from source items), and gate capacity decisions on a conditional write against the source of truth, not the cached counter.

### 🟠 R2-B6 — `fee` has no currency and no declared money unit; team-chat/broadcast have no entity
**Where:** §9.3 (`Division … fee`, `League … stripePriceId/feeModel`), every wireframe shows `$` (UI §12.x); §14.5 tests "service-fee math." **Zero** occurrences of `currency`/`cents`/`USD` in either doc (verified by grep). Messaging: §6.9 makes group chat a non-goal, but §7.3 league "**team chat / broadcast**," §6.7/§10.4 "message attendees," and §12.2.6/§12.3.6 organizer "broadcast/messaging" all ship — with **no message entity in §9**.
**Why it matters:** (a) money typing is unspecified — float dollars invite rounding errors in absorb-vs-pass-through math; and with a country-first taxonomy (§3.2) and international ambitions (§13), the absence of a per-event `currency` attribute is a latent rebuild. (b) The shipped chat/broadcast features have nowhere to store messages and no delivery path (ties R2-E1/E2).
**Fix:** store money as **integer minor units + an ISO-4217 `currency`** on every priced entity; add a `Message`/`Broadcast` entity (or explicitly cut team-chat/broadcast to match the "not chat" stance) and name the delivery channel.

### 🟡 R2-B7 — No optimistic-concurrency token on concurrently-editable items; no lifecycle/TTL for abandoned anonymous RR events
**Where:** organizer dashboards, group settings, outing edits (no `version`/ETag in §9.3); `RR#<eventId>` items (§9.3) have no TTL though they're created with **no account** (§6.8).
**Why it matters:** concurrent edits are silent last-write-wins; and every anonymous round-robin ever generated persists forever (storage/cost, and an ever-growing public surface of stale events).
**Fix:** add a `version` attribute + conditional writes for multi-editor items; add a TTL (or archival sweep) for unclaimed RR events with no activity.

---

## Part C — Round-robin engine correctness (now that it's specified)

Review #1 could only call the engine a black box. It's now specified in §6.8, so it can be checked — and several edges will produce visibly wrong tournaments in the wedge feature.

### 🟠 R2-C1 — The engine allows ties, but standings, StandingRow, and the tiebreak ladder assume W-L only
**Where:** §6.8 params ("`timeCapSec` … high score at the buzzer; **ties allowed if enabled**") vs §6.8 standings ("canonical tiebreak ladder — **1) Wins**…") and UI §2.5 StandingRow / §11.3 columns (**"record (W-L)"**, "W-L Pts +/-" — no T/draw column).
**Why it matters:** if a time-capped game can tie, standings need a draws column and a defined points value for a tie (half-win? a point?), and the "Wins / win %" tiebreak top rung is ill-defined when draws exist. The UI has no column for it, so ties either vanish or corrupt the table.
**Fix:** either forbid ties (require a tiebreak game) or add `T` to the standings model + StandingRow and define a tie's contribution to ranking.

### 🟠 R2-C2 — "Head-to-head" tiebreak is undefined for rotating/mixer formats
**Where:** §6.8 tiebreak ladder rung 4 ("**head-to-head**") applied to "rotating/mixer aggregate **individually**."
**Why it matters:** in a rotating-partner mixer two individuals may have been **partners** (not opponents), opponents multiple times, or never met — "head-to-head" has no single meaning. Applying a head-to-head rung to individual standings in E2/E3 is ambiguous and will resolve ties differently than organizers expect.
**Fix:** specify that head-to-head applies only to formats where entrants meet as opponents a defined number of times (E1/E4/E5), and skip that rung (fall through to point diff / fewest byes) for rotating formats.

### 🟠 R2-C3 — Determinism claim and the §14 J4 test don't hold for dynamic formats
**Where:** §6.8 ("Generation is **seeded** … a shared event renders identically for every viewer") and §14.3 J4 ("**schedule equals the engine output for the `rngSeed`**").
**Why it matters:** for **dynamic** formats (E3 court-movement, E4 Swiss, E5 bracket) the next round is a function of **entered scores**, not the seed alone — so "renders identically for every viewer" only holds *after* scores are confirmed, and J4's "schedule == f(rngSeed)" is false for E3/E4/E5 (it's f(seed, scores)). The test as written can't pass for the dynamic engines.
**Fix:** scope the determinism guarantee to static schedules (E1/E2/E5-pools) and to "given the same confirmed scores" for dynamic ones; rewrite J4 to assert round-N pairings as a function of (seed, prior confirmed results).

### 🟠 R2-C4 — Popcorn (and any "chosen round count") can be mathematically infeasible
**Where:** §6.8 ("Popcorn … **hard no-repeat-partner** constraint … for a chosen round count (needn't complete a full design)").
**Why it matters:** with N=4 doubles there are only 3 unique partner pairings; a Popcorn request for 5 rounds **cannot** satisfy "no repeat partner." The spec states the hard constraint and the free round count but never says what happens when `requestedRounds > maxUniquePartnerRounds(N)` — generate fewer, relax the constraint, or error?
**Fix:** cap rounds at the feasible maximum for N (and surface it in the live preview), with an explicit relax-or-stop rule.

### 🟡 R2-C5 — "Late add into a static schedule" is hand-waved and breaks the design invariant
**Where:** §6.8 lifecycle ("**Late add** → into the remaining bye rotation (static)…").
**Why it matters:** a circle-method (E1) schedule is constructed for a fixed N; inserting an N+1th entrant mid-event can't preserve "everyone plays everyone once" without regeneration. "Into the remaining bye rotation" doesn't define which existing matches change or how the invariant is maintained.
**Fix:** specify late-add for static formats explicitly (e.g. add as an alternate who only fills byes, with no pairing guarantee) or regenerate remaining rounds and say so.

### 🟡 R2-C6 — Anyone with the link can rewrite scores on an unclaimed event, re-pairing dynamic rounds
**Where:** §6.8 ("Any participant may enter a score … Link-shared events stay editable by **anyone** until **claimed**"); UI §11.4 conflict resolution.
**Why it matters:** for dynamic formats, an accidental or malicious score edit on a public, unclaimed event **changes the next round's pairings/standings** for everyone, with only "conflicting entries flag for resolution" as a guard. The wedge's frictionless "no account" sharing is also its integrity hole.
**Fix:** lock a round once advanced, require a soft claim (PIN/owner token) before the first score, or make score edits append-only with an organizer confirm for dynamic formats.

### 🟡 R2-C7 — Quiz dimensions vs. progress indicator mismatch
**Where:** UI §11.5 (progress `●●○○` = 4 questions) vs the listed five dimensions ("player count · competitive vs social · fixed vs rotating · # courts · time").
**Fix:** reconcile the count (4 or 5) — trivial, but it's a visible spec inconsistency in a conversion surface.

---

## Part D — Missing architecture & infrastructure decisions

### 🔴 R2-D1 — The "live" surfaces have no real-time transport
**Where:** "live" appears throughout — "playing now" (§6.2), live standings/brackets (§6.8, §7.1, §7.2), participant score-submit-then-opponent-confirms (§7.3), ladder auto re-rank (§7.4); the only mechanism named anywhere is UI "CSR refresh **~60s**" (polling, §5.2) and "Real-time standings" as prose (§6.8). **Grep confirms no websocket/SSE/AppSync/pub-sub** in either doc.
**Why it matters:** the run console (multiple operators entering scores courtside) and the participant console (you submit, opponent confirms) need sub-minute propagation; 60s polling across 16K court pages is also a real read-load/cost concern. DynamoDB has no native client fan-out — this requires an explicit choice (AppSync subscriptions, API Gateway WebSockets, Ably/Pusher) that's absent from the §2 stack.
**Fix:** add a real-time transport to §2, or explicitly commit to polling and specify intervals + the load/caching budget per surface.

### 🟠 R2-D2 — Auth is an undecided fork ("Cognito / Auth.js")
**Where:** §2 stack ("Auth | **Cognito / Auth.js**"); UI §13.7 (2FA, active-session revoke, OAuth Google/Apple, "hand off to the auth provider"); §13.9 (reset/verify token flows).
**Why it matters:** Cognito (managed user pool) and Auth.js (self-hosted library) are very different systems with different session models, 2FA support, OAuth wiring, and token/email flows — every auth view (§13.4/§13.7/§13.9) and "indexable pages never depend on session" (§2) depend on which. This is presented as a decision but is an unmade fork.
**Fix:** pick one and spec the session model (cookie/JWT), 2FA mechanism, and token lifecycle.

### 🟠 R2-D3 — No stated generation strategy for ~16K+ static pages
**Where:** §2 ("SSG static at build" / "ISR(n)"); §9.8 (~16,311 courts) + cities/types/amenities/content; §3.1 targets 24K+ parity.
**Why it matters:** building every court/city/type/amenity page at deploy is infeasible at this scale; you need **on-demand ISR (fallback: 'blocking')** with a warm-up/priority strategy. This has SEO consequences (first crawl of an un-generated page = cold TTFB, hurting the §3.8 LCP budget) and cost consequences, and it interacts with the customized Next.js (AGENTS.md). The doc never says whether pages are pre-built or generated on first request.
**Fix:** specify the generation mode per template (pre-build the top-traffic head, on-demand the long tail), the revalidation/warm-up plan, and how cold generation stays within the LCP budget for crawlers.

### 🟠 R2-D4 — Offline-tolerant run console is specified as a parenthetical, not a design
**Where:** UI §11.4 ("Optimistic writes; **offline-tolerant (queue + sync)**").
**Why it matters:** an offline write queue with reconnect reconciliation is a substantial feature — and for **dynamic** formats, offline score entry that conflicts with an already-computed next round is genuinely hard (which round wins?). It's flagged in four words with no data/sync model.
**Fix:** either descope to online-only for v1 (courts usually have signal) or spec the offline queue, conflict policy, and how it interacts with dynamic round computation.

### 🟡 R2-D5 — No backup / DR / retention posture for the single table
**Where:** §9 (one table is the whole system of record); §13.7 has user-facing "export my data" but no platform backup.
**Why it matters:** single-table = single blast radius. PITR, backup cadence, cross-region DR, and retention (esp. for TTL'd vs financial items) are unstated for a system holding payments and community data.
**Fix:** add PITR + backup/DR + retention to the NFR section (R2-J/G3).

---

## Part E — Notifications & messaging (S4, partially resolved)

### 🔴 R2-E1 — Still no email/push provider, generation pipeline, or compliance — and transactional mail is non-optional
**Where:** §2 stack has **no email or push provider** (grep-confirmed: no SES/Postmark/Resend/SendGrid/FCM/APNs/web-push); the Notification *entity* exists (§9.3) and UI §13.6/§14.4 promise in-app/email/push with quiet hours, but nothing fills or sends them. Email verification (§13.9), password reset, receipts (§10), RSVP/waitlist/partner-invite/challenge-deadline/league-recap notices all assume delivery.
**Why it matters:** review #1's S4 is only half-closed — the *entity* landed but the **provider, the fan-out pipeline** (event → query followers via `GSI1 COURT#/FOLLOWER#` → write Notification → send), **batching/digest, quiet-hours enforcement, deliverability (SPF/DKIM/DMARC), unsubscribe/CAN-SPAM, and transactional-vs-marketing separation** are all still absent. Email verification and Stripe receipts can't ship without this.
**Fix:** add providers to §2; spec the notification-generation Lambda(s), the followed-court game-alert fan-out, channel preferences enforcement, and compliance (one-click unsubscribe, suppression list).

### 🟠 R2-E2 — "Push" is promised but barely works on a no-native-app product on iOS
**Where:** §13 decision 7 (no native app v1; responsive web); UI §13.6/§14.4 list **push** as a first-class channel.
**Why it matters:** web push on iOS Safari only works when the user **installs the PWA to the home screen** (iOS 16.4+); otherwise there is no push on the dominant mobile platform for this audience. Promising "push" as a co-equal channel overstates reach.
**Fix:** scope push to web-push-with-PWA-install + Android/desktop, set expectations in the prefs UI, and lean on email/SMS for the iOS majority (or reconsider a thin native shell later).

### 🟠 R2-E3 — Three different chat stances, none with a data model
**Where:** profile "Message (**gated/future**)" (UI §6.1) · league "**team chat / broadcast**" ships (§7.3/§12.4.1) · groups "**not chat**" (§6.9); no message entity (R2-B6).
**Why it matters:** the product simultaneously defers DMs, ships team chat, and forbids group chat — an inconsistent stance that will confuse builders, and the one form that ships (team chat) has no storage/transport.
**Fix:** make a single explicit decision per surface and reconcile the copy; if team chat ships, give it an entity, transport (R2-D1), and moderation (R2-I).

---

## Part F — Payments & marketplace risk

### 🔴 R2-F1 — Who funds refunds after payout? (negative-balance liability)
**Where:** §10 ("Connect (Express) — funds **flow to their connected account**"; organizer-initiated refunds; §14.5 "event cancellation → mass-refund reconciliation").
**Why it matters:** if funds are paid out to the organizer and the event is later cancelled (mass refund), the connected account may not have the balance — the **platform** eats the negative balance. This is the central marketplace risk and it's unaddressed. There's also no **payout-hold/escrow-until-after-event** policy (standard for event marketplaces), so the exposure is maximal.
**Fix:** define a payout schedule that **holds funds until after the event** (or a rolling reserve), and state who is liable for post-payout refunds/chargebacks.

### 🟠 R2-F2 — Application fee on refund is undefined
**Where:** §10 ("PicklerPal takes an **application fee**"); refunds (§7 shared, §12.x dashboards).
**Why it matters:** Stripe does **not** refund the platform application fee by default (`refund_application_fee` must be set). So on a refund, does PicklerPal keep its cut? Keeping it on an organizer-cancelled event is a trust/PR problem; refunding it is a revenue decision. The spec is silent, and §14.5's fee-math tests can't assert the right ledger without it.
**Fix:** state the policy (recommend: refund the app fee on organizer-cancellation, retain on registrant-initiated within policy) and test it.

### 🟠 R2-F3 — Off-session waitlist/partner captures will hit SCA/3DS failures
**Where:** UI §12.1 ("You're #3 — **charged only if a spot opens**"); review #1 U2/U3; §14.5 tests "waitlist deferred capture" + "partner-pending."
**Why it matters:** charging later, when the user isn't present, is an **off-session** payment — which frequently requires SCA/3DS the customer can't complete in the moment, so the charge fails. The deferred-capture design (SetupIntent vs. manual-capture auth-hold, and auth-holds expire in ~7 days) is still unspecified beyond the test name.
**Fix:** spec SetupIntent + off-session `PaymentIntent` with a 3DS-failure fallback (notify + on-session retry window), and define auth-hold expiry behavior.

### 🟠 R2-F4 — Gender-gated divisions have no validation (and a single `gender` field meets gendered events)
**Where:** §9.3 user `gender`; divisions `eventType (MD/WD/MX/Singles)` (§9.3); registration validates **DUPR** but not gender (UI §12.1 / §7.1).
**Why it matters:** Women's/Men's divisions imply a gender eligibility check the reg flow doesn't perform; and a single binary `gender` field colliding with gendered divisions is an inclusion question (non-binary players, mixed-doubles gender requirements) the spec doesn't touch.
**Fix:** define division gender-eligibility validation, and decide how `gender` (and a possible separate "division eligibility") handles non-binary players.

### 🟠 R2-F5 — Account deletion collides with financial/community obligations
**Where:** UI §13.7 ("**Delete account** → typed-confirm"); §10 financial records; organizer-owned paid events; group last-admin (§17.4 has a last-admin guard for groups but not for account-level deletion).
**Why it matters:** deleting a user who **organizes a paid event with registrants**, holds **pending payouts**, or is a group's **sole admin** is not a simple erase — GDPR erasure conflicts with financial-record retention, and orphaned events/groups/outings need a transfer or block. "Typed-confirm modal listing consequences" doesn't define the consequences.
**Fix:** spec deletion preconditions (no active organized events / settle payouts / transfer sole-admin), and anonymize-vs-retain rules for reviews and financial records.

### 🟡 R2-F6 — No co-organizer / delegated roles
**Where:** organizer views (§7, UI §12.x) and schema (§9.3) model a single `organizerId`; review #1 appendix flagged this.
**Why it matters:** clubs and facilities run events as teams; a single owning account with no delegation blocks real organizer workflows and conflicts with the Groups→League on-ramp (a group with 3 admins → one personal league owner).
**Fix:** add an event-level role grant (owner/co-organizer) — small schema addition (`EVENT#…/ROLE#<uid>`), large workflow unlock.

---

## Part G — SEO depth (beyond review #1)

### 🟠 R2-G1 — The high-value "{type} in {city}" intersection has no canonical URL
**Where:** §5 taxonomy has `/courts/types/[type]` (national) and `/courts/.../[city]` (city) but **no** type×city route; UI §4.6 says type landings link to "**filtered city views**," and §4.3 "Popular searches" chips (Indoor/Lighted/Dedicated/Free) link to "filtered views."
**Why it matters:** "**indoor pickleball courts in {city}**" is exactly the low-comp long-tail the KW research targets (Cat 2–3), but it has no canonical static page — only an implied `?filter=` param view, which is non-canonical and a crawl/duplicate trap (review #1 SEO2, now concrete). This both **misses demand** and **risks faceted-nav dilution**.
**Fix:** decide the type×city pattern (e.g. canonical `/courts/.../[city]/[type]` for a curated set of high-demand types) and `noindex`/canonical the rest of the filter space.

### 🟠 R2-G2 — `verifiedAt = seed updated_at` turns "Last verified" into a monotonic staleness signal
**Where:** §9.8 ("`verifiedAt` = `updated_at` … seeds the 'last verified' freshness signal §3.6"); UI §4.5 sidebar "**Last verified {date}**"; court-admin (re-verification deferred).
**Why it matters:** with the directory read-only and re-verification deferred, `verifiedAt` is frozen at import and **recedes further into the past every day** — every court will eventually show "Last verified 2+ years ago," the opposite of freshness. Review #1's S3 is "resolved" by wiring the field, but the wiring makes it counterproductive. (Relatedly, §3.6 lists "ISR revalidation" as a freshness signal, but regenerating identical static HTML from unchanged seed data isn't freshness to a crawler — the only real freshness on court pages is UGC, which depends on cold-start.)
**Fix:** hide "Last verified" until a real re-verification/refresh cadence exists (even an automated internal re-crawl), or relabel to the import date without "verified" framing.

### 🟡 R2-G3 — No slug-change → 301 history for user/group/league/tournament slugs
**Where:** username change "warns about URL change" (UI §6.2); group/league/tournament slugs are organizer-set; only `/sessions/[id]`→301 is specified (§5).
**Why it matters:** changing a username or event slug 404s the old indexed URL (lost links + SEO). Court slugs are seeded/stable, but the user-editable slugs have no redirect-history entity.
**Fix:** add a slug-history/redirect item (`SLUGREDIRECT#<old> → <new>`) and 301 old slugs.

### 🟡 R2-G4 — "{city} games" still indexed twice; long city lists have no pagination/canonical story
**Where:** City Directory "Games" segmented toggle (UI §4.3) vs `/play/.../[city]` game finder (UI §10.1) — review #1 X4, **still unresolved** (no canonical declared between them); and a city with 100+ courts has no stated pagination/`rel=next`/canonical.
**Fix:** declare one canonical surface for the city-games intent; define pagination + canonical for long directory lists.

### 🟡 R2-G5 — `/round-robin/quiz` is marked "indexable (light)" but is CSR
**Where:** §5 / UI §11.5 (CSR · indexable (light)).
**Why it matters:** CSR pages render their content client-side, which indexes poorly — an "indexable" landing for "how to pick a round robin format" should be SSG/SSR for the crawlable copy.
**Fix:** render the quiz's marketing/explainer content statically; keep only the interactive answer flow client-side.

### 🟡 R2-G6 — Cold-start, OG-image cost, and "scale parity" are still soft
**Where:** §3.1 targets 24K+ courts / 9.7K cities, but the seed is ~16,311 courts (court-admin §1) with crowdsourced add deferred — so parity is **unreachable at launch by construction**; on-the-fly `ImageResponse` OG images × 16K pages (§2) need a caching budget (review #1 SEO5); news/`learn` sourcing + authorship (review #1 G6) still unowned.
**Fix:** restate the launch-scale target honestly; add an OG-image cache/CDN note; assign content/editorial ownership.

---

## Part H — IA / UX / cross-doc consistency (new)

### 🟠 R2-H1 — Three different account-navigation inventories
**Where:** account shell sidebar (UI §13.1: Dashboard · Profile & Ratings · Check-ins · Outings · Registrations · Payments · Help · Log out) vs header avatar menu (UI §3.2: Dashboard, Profile & Ratings, My Check-ins, My Outings, My Registrations, **Organize**, Help, Log out) vs the actual `/account/*` routes (§5: + **Saved Courts, Alerts, Settings, My Groups, Payments**).
**Why it matters:** Saved Courts, Alerts, Settings, and My Groups exist as pages but appear in **neither** primary nav inventory; the avatar menu and the shell sidebar list different items. Real pages become undiscoverable.
**Fix:** reconcile to one canonical account-nav set (sidebar + avatar menu derive from it) covering every `/account/*` route.

### 🟠 R2-H2 — "Following" a group has no entity; group join-policy × visibility matrix is unconstrained
**Where:** UI §17.2 lists **Following** as a membership action alongside Join/Request/Invite; §9.3 group member status is `active|pending|invited` (no follower). Visibility (`public|unlisted|private`) × `joinPolicy` (`open|request|invite`) combinations aren't constrained.
**Why it matters:** group-follow is in the UI with no data model (courts have `FOLLOW#COURT`; groups don't); and contradictory combos like `private + open` (undiscoverable but anyone-can-join) aren't ruled out.
**Fix:** add a group-follow entity (or drop the action), and specify the legal visibility×joinPolicy matrix.

### 🟠 R2-H3 — Outing "Private" is both a *type* and a *visibility*
**Where:** UI §10.3 step 3 "type (**Open Play / Private**)" and step 4 "Visibility (**Public / Unlisted / Private**)"; §9.3 outing has both `type` and `visibility`.
**Why it matters:** "Private game" (type) and "Private visibility" are conflated — a user picking type=Private and visibility=Public (or vice-versa) is undefined. The model needs the two axes to be clearly orthogonal (kind-of-play vs who-can-see) or merged.
**Fix:** rename to remove the collision (e.g. type = Open Play / Reserved-group; visibility = Public / Unlisted / Invite-only) and define their interaction.

### 🟡 R2-H4 — Identity bootstrap: username/slug isn't assigned at signup or onboarding
**Where:** Auth modal collects "**only email + name + password**" (UI §13.4); onboarding does city/rating/first-action (UI §13.8); username (with availability check + `/players/<slug>`) is set in **profile edit** (UI §6.2); `USERSLUG#<username>` keys the public profile (§9.3).
**Why it matters:** a new user has no username until they visit profile edit — so what is their `/players/[username]` URL in the meantime, and what feeds RatingBadge/check-in attributions? The slug source is undefined at account creation.
**Fix:** auto-generate a unique username at signup (editable later, with R2-G3 redirects).

### 🟡 R2-H5 — "Save ♡" vs "Follow" on a court are two affordances for one action
**Where:** UI §4.5 hero "[ save ♡ ]" + title-band "**Follow**"; CourtCard "save" control (§2.5); §13.5 titled "**Saved / Followed** Courts"; only `FOLLOW#COURT` exists in §9.3.
**Fix:** unify to one verb/affordance (or define save ≠ follow with two entities) — currently the same `FOLLOW#COURT` is surfaced as both "save" and "Follow."

### 🟡 R2-H6 — Dashboard "Recommended" and global search scope imply/omit features without specs
**Where:** UI §6.3 dashboard module "**Recommended** (skill-matched games nearby)" — an unspecified reco engine (skill×geo×time), same family as free-agent matching (review #1 U4); §2.10/§3.2 global search covers only **PLACES + COURTS** — you can't search a tournament, league, group, player, or article by name from global search.
**Fix:** spec (or cut) the recommendation surface; confirm the deliberately narrow global-search scope and provide entity-specific search where needed.

---

## Part I — Trust / safety / legal (new + persisting)

### 🔴 R2-I1 — User-uploaded image moderation is still entirely absent
**Where:** avatars (§6.3), review photos (§6.4/§7.2), and court photos to S3; review #1 T1 — **unchanged**.
**Why it matters:** any UGC image product at scale needs automated scanning (CSAM/NSFW) and a takedown path; this is legal table-stakes and still nowhere in the pipeline.
**Fix:** add an image-moderation step (Rekognition/Hive) + CSAM reporting to every upload path.

### 🟠 R2-I2 — Strangers-meet-to-play has no physical-safety or no-show layer
**Where:** "looking for a 4th," "get invited," anonymous presence (§6.2, §6.9); review #1 T3 (reporting/blocking) — still open.
**Why it matters:** the core loop introduces strangers to meet at physical locations; there's no report/block, no no-show reputation, no verified/women-only filter (PH-relevant), and anonymous presence makes accountability weak.
**Fix:** add report/block + a moderation queue, a no-show signal, and consider verified-only/gender-scoped visibility for presence.

### 🟠 R2-I3 — Re-hosting Google Places photos and aggregating news carry licensing exposure (alongside the scrape)
**Where:** §9.3 photos `source(user|google-places|…)` + "re-hosted S3 keys" (§9.8); §6.6 news hub with "source attribution"/"via {Source}"; the seed itself is scraped from a competitor (§9.8 warning, review #1 G4).
**Why it matters:** **caching/re-hosting Google Places imagery** generally violates Places ToS; **republishing third-party news** beyond headline+link risks scraped-content penalties + copyright; both join the already-flagged competitor-scrape as launch-blocking legal review.
**Fix:** consolidate a content-rights review covering scrape provenance, Places photo terms, and news licensing; prefer hotlink-with-attribution or licensed sources.

### 🟡 R2-I4 — No CMS / curation / moderation surface for the many "featured" slots
**Where:** featured articles (UI §8.1), lead news story + topic curation (§9.1), featured tournaments/leagues/groups (§12.x/§17.1), the seasonal **promo banner** (§3.1), MDX article authoring (`mdxKey`, §9.3), news ingestion (§6.6); the only admin tool specced is court-admin (deferred, courts only).
**Why it matters:** every "featured/curated/lead/promo" slot needs someone to set it, and `/learn` MDX + `/news` need an authoring/ingestion path — none exist. The SEO thesis depends on content that has no production surface.
**Fix:** spec a minimal internal CMS/curation tool (or name the external CMS) for content, featured slots, promo banner, and news ingestion.

---

## Part J — Still-open from review #1 (compact)

These were raised in `prd-review.md` and remain unresolved in the current docs; re-listed with current locations so they aren't lost.

| ID (was) | Issue | Where (current) | Fix |
|---|---|---|---|
| 🔴 X1 | **Ladder has nav + footer entries but no `/ladders` hub or city finder** | nav §4, footer UI §3.3 vs sitemap §5 (only `/ladders/[id]` + `/challenges`) | add `/ladders` hub + `/ladders/.../[city]`, or route ladders under Leagues and drop the dead nav target. |
| 🟠 X2 | **DUPR write-back contradiction** | UI §12.4.1 "DUPR submit: ✓" + §13.7 vs PRD §13 open question | resolve DUPR partnership scope; make UI match; flag as a hard dependency. |
| 🟠 X3 | **Pricing advertises the deferred Facility tier** | UI §16.1 vs court-admin (claim/manage deferred) + court-admin §7 open-Q | demote Facility to "coming soon / contact us" until court-admin ships. |
| 🟡 X4/X5/X6 | city-games dup / "Until I leave" TTL cap / games-at-court mechanism | see R2-G4 / R2-J note / R2-B2 | declare canonical; add a hard max cap (≤6h) to "Until I leave"; standardize on `OUTINGREF`. |
| 🟠 G3 | **No consolidated NFR section** (availability/SLA, security/authz model, DR/backup, cost budgets) | scattered | add an NFR chapter (perf budget already exists; add the rest, incl. R2-D5). |
| 🟠 G4 | **No dependency / third-party-risk register** | DUPR, Stripe Connect, Mapbox, weather, email/push, geo-IP, **seed source** | add a register with fallbacks + the content-rights review (R2-I3). |
| 🟠 G5 | **No phasing / MVP cut within the core build** | 40+ views all "initial build" except court-admin | define v1 vs fast-follow (the build is enormous; the wedge = court finder + check-in + RR + one paid path). |
| 🟡 G7/G8 | **No glossary; §13 open questions are load-bearing** | §13 (DUPR scope, weather source, singles/doubles depth, moderation, intl) | add a glossary; resolve the load-bearing open-Qs before the dependent areas are built. |

> **"Until I leave" (X5) detail:** UI §5.1 still offers it as a duration but §9.3 makes `expiresAt` mandatory and "playing now" depends on expiry — with R2-A's model split, "Until I leave" still needs a hard cap (≤6h) on the *presence* item so presence always self-expires.

---

## Appendix — verification method & calibration

**How coverage was checked.** Both specs read in full (PRD 1,162 ll.; UI 1,190 ll.) plus strategy, court-admin, and review #1. Key claims were grep-verified across both docs:
- **Zero** occurrences of: `websocket`/`AppSync`/`SSE`/`pub-sub` (→ R2-D1); `SES`/`Postmark`/`SendGrid`/`Resend`/`FCM`/`APNs`/`web-push`/`deliverability`/`unsubscribe`/`CAN-SPAM` (→ R2-E1); `currency`/`cents`/`USD`/`locale`/`i18n` (→ R2-B6); `escrow`/`negative balance`/`refund_application`/`1099`/`chargeback`(payment sense) (→ R2-F1/F2).
- **Confirmed present & contradictory:** `CHECKIN … expiresAt(TTL)` (§9.3) alongside "My Check-in History / favorite courts / this month" (UI §5.3) → R2-A1; "every view is one query" (§9.5/§9.6) alongside Court detail = #1+#4+#5+#9 (UI §15.2) → R2-B4; `COURT#<popularityRank>#…` mutable key (§9.3) → R2-B1; `Auth | Cognito / Auth.js` fork (§2) → R2-D2; ties-allowed engine (§6.8) vs W-L-only StandingRow (§2.5) → R2-C1.

**Deliberate divergences (not findings).** For calibration, these look intentional and are *not* flagged: the free RR Pool→Bracket giving away bracket-running (monetization is registration/payment, not the bracket — consistent with §8); the narrow PLACES+COURTS global search (a PH-style choice, though noted in R2-H6); group chat as a non-goal (§1); and the deferral of crowdsourced court add/edit/claim to court-admin.md.

**Net.** The architecture is sound and the spec is materially stronger than at review #1. The new high-leverage work is: **fix the check-in data model (Part A)**, **name the real-time / auth / email-push / ISR-scale decisions (Parts D–E)**, **close the engine correctness edges (Part C)**, and **make the marketplace-money model handle refunds, payout timing, and currency (Part F)** — then resolve the still-open contradictions in Part J.

*Prepared as a second, deeper review pass over `pickler-pal-prd.md` + `pickler-pal-ui-spec.md`. Findings only — the specs were not modified.*
