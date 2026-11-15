# Frolic: the 90 seconds, and what each sponsor is doing in it

Judges score sponsor use, so every sponsor in the stack gets one moment on screen where it is visibly doing something no other tool in the room can. Six sponsors, ninety seconds, one plan that becomes real.

This file is the presenter's copy: cast, run of show to the second, the line spoken at each beat, and the exact fallback when a beat fails. The second half is the sponsor sheet: the capabilities we use from each sponsor's current docs, the files they live in, and the demo moment. Anything not yet on `main` is marked **pending** with where it lives today, and no beat claims a feature works unless a test, a report, or a recorded run shows it.

Read it with `docs/brief.md` open. The product rules in the brief still hold: nothing on any screen tells a friend that a tap exists, and no beat may look like a rejection.

## Cast and devices

Four people on stage, three real phones, one laptop driving the projector.

| Roll | Who | Holds | Does |
| - | - | - | - |
| Speaker | Arnav | nothing | Says every line, calls the taps, drives the reveal by asking the room |
| Operator | second person at the laptop | laptop | Switches the projector panes on cue, fires the fallback, watches the Convex dashboard |
| Maya | phone 1 on the podium | iPhone | Taps "I'm down", then "only if Dev". Pays the hold. Checks in. |
| Dev | phone 2 on the podium | iPhone | Taps "I'm down". Walks to the geofence marker on the floor. |
| Jordan | phone 3 on the podium | iPhone | Watches, hops in, then pockets the phone and never shows |
| Priya | her own phone, off the podium | iPhone with iMessage | Never installs Frolic. Says yes in a text thread. |

If it is only Arnav in the room, he taps phones 1 and 2 himself and reads Jordan's line. The judge called taps variant is in beat 3.

**The projector** is one laptop screen showing four panes, never more:

1. Left, wide: phones 1 and 2 mirrored, side by side, at about 40 percent of the screen each.
2. Right, upper: the Convex dashboard, `taps` table open, sorted newest first.
3. Right, lower: the Whop dashboard, payments list, filtered to today.
4. Overlay, full width, only during beat 4: two cloud iPhone recordings from the three-phone Revyl run, frozen on their flip frames.

The mock is on a fifth tab, `design/mock/index.html`, ready to take the whole screen. It is the fallback for every phone beat and it is also the thing a judge can play with after the pitch.

## Before you start

Ten minutes out, in this order. Every item is a check, not a setup step.

1. All three phones on the shared backend, signed in as Maya, Dev and Jordan in Sunset Crew, today's plan on screen, `revealAt` not yet set.
2. The seeded run id is fresh: `FROLIC_E2E_RUN=demo-$(date +%s)`, reset, seed, and the three sign-in links used. Exact commands in `e2e/three-phone-run.md`.
3. The Convex dashboard is open on `taps` and `frolics`, and the Whop dashboard is on today's payments. Both logged in, both scoped to the Frolic company, nothing typed in the URL bar live.
4. The three-phone recording is already downloaded, two files, named `flip-maya.mp4` and `flip-dev.mp4`, in a folder on the laptop. Do not rely on the dashboard playing video.
5. The mock is open at `design/mock/index.html#today:on` in Chrome, and at `#today` in a second tab.
6. Cloud phones are asleep. Only the three podium phones and Priya's are awake. Phone time is budgeted at $5.40 an hour and three awake phones is the crew limit.
7. Jordon's hold is already placed before he pockets the phone. A capture needs a hold that exists.

## Run of show

Times are seconds from the first word. Line is what the room hears. Fallback keys are in the next section.

| t | Projector | Room | Line | If it fails |
| - | - | - | - | - |
| 0 | Three Today screens, free flowers, the seed packet for Indian Rock at 4:30 | Arnav at the podium, hands off the phones | Three of us are free this afternoon. Frolic made one plan for all of us. | F1 |
| 6 | Convex dashboard slides in on the right, `taps` empty | Operator confirms the pane | Every phone reads one Convex query. This is the database behind the screens. | F7 |
| 12 | Dashboard still empty. Phones 1 and 2 change to a bud: "Planted. Nobody can see it." | A judge calls the taps, or Arnav does: Maya picks "only if Dev", Dev taps "I'm down". Two rows appear in `taps`, 0.3 seconds apart. | Maya, only if Dev. Dev, I'm down. Both taps are already in the database. | F2 |
| 18 | Phones 3 and Maya's still read as an open plan. Nothing says anyone is down. | Arnav holds one hand up, everyone waits | Every phone still shows nothing. Nobody can read a tap. | F3 |
| 24 | Both phones flip to "It's on." in the same frame, confetti, haptic. Jordan's phone gets "Jordan, it's happening". | Jordan hops in with one tap | Both flip from one server timestamp. Same frame. | F4 |
| 28 | Overlay: the two cloud iPhone flips, frozen, with "Maya +0.31 s, Dev +0.34 s from one server release" burned in | Operator drops the overlay for four seconds, then clears it | Two cloud iPhones in two places in Berkeley, flipped by the same release. | F5 |
| 32 | Whop pane: "Hold $3 to lock it in" on Maya's phone, then the Apple Pay sheet | Maya pays. Her payment appears as Authorized. | Whop puts a three dollar hold on her card. It comes back when she arrives. | F6 |
| 38 | Dev's phone: "You made it. Your $3 is back." The Whop pane flips that payment to Voided | Dev walks to the tape marker on the floor | Dev walked in. Whop released it. | F6 |
| 42 | Jordan's hold moves to Captured. Crew tab: the Frolic Fund ticks from $0 to $3, "toward the next one" | Jordan's phone is face down in his pocket | Jordan didn't show. His three dollars is the crew's Frolic Fund now. | F6 |
| 46 | Priya's iMessage thread, full pane: her message "down" and the agent's reply "Got it. Secret's safe." | Priya types on her own phone. Maya's phone stays on the app, Dev's phone locks to the lock screen. | Priya has never installed Frolic. She's texting our Keiki agent. | F8 |
| 54 | All three surfaces at once: the app flips, the lock screen notification becomes "It's on. Indian Rock at 4:30", the iMessage thread gets the same line | Nobody touches anything | Same reveal, same second, in a text thread. | F8 |
| 58 | Garden pane: two skipped days for boba, then today's plan on the pier. "Why this" cites the skip and the last sunset | Arnav steps back so the screen is the only thing moving | We skipped boba twice. It stopped suggesting boba, and it says why. | F9 |
| 70 | GitHub pull requests, each with a Revyl replay link. Then the Captain's Drive, the crew's reports for today | Operator scrolls slowly once | Every screen here arrived as a pull request with a recording of it on a real iPhone. Capy agents wrote them today. | F10 |
| 82 | Back to the three phones, all on "It's on.", with the fund visible on Crew | Arnav at the podium | Frolic. Your friend group's plans, actually happening. | none |

That is 88 seconds spoken and 2 seconds of silence. If the room is running long, cut beat 6 (t58 to 70) and its line, and the run lands at 78 seconds with every sponsor still represented except Supermemory, which must then be one sentence at t44: "It also remembers what we skip, and it writes that into the plan."

## The taps

The order matters and it is the one thing a rehearsal gets wrong. Maya's condition has to be held before Dev's tap commits, because the matcher has to reveal on Dev's tap against a secret it cannot read from the client.

- Maya: "I'm down" then "only if Dev". Her phone reads "You're down. Only if Dev · nobody can see this". It never counts taps.
- Dev: "I'm down". His phone reads "Planted. Nobody can see it."
- Jordan: does nothing until the reveal. His phone reads an open plan with free flowers and no count of who is down.

If a judge calls the taps, hand them the two phones and say the two words once: "only if Dev". Do not hand them Jordan's phone, his beat comes later.

## Fallbacks

Each key names the failure, the recovery, and the exact words. Never say "let me try that again". Say what happened and move.

**F1, a phone is not on today's plan.** The app is open on the wrong group or the wrong day. Recovery: show the mock at `#today` full screen and say "This is the same screen, running off the seeded backend. The phones are on the demo build." Then re-open the app on the right group in beat 2 while the dashboard holds attention.

**F2, a tap does not land.** No row appears in `taps` inside two seconds. Recovery: Arnav taps the same phone himself. If the row still does not appear, say "the second tap is the one that decides it" and go to F4 early, showing the dashboard rows from the seeded rehearsal.

**F3, a phone shows a count or a name before the reveal.** This is the one failure that cannot be talked past, because it breaks the product's central promise. Recovery: kill the beat. Say "That is a bug and we are not going to pretend it is a feature. Here is the test that exists to catch it." Switch to the convex-test output for the privacy test, or the mock. Then continue at beat 5. Do not continue the live reveal.

**F4, the reveal does not flip.** Phones stay on the bud for more than three seconds after Dev's tap. Recovery: play the recorded flip overlay from beat 5 and say "That is the same seed, recorded ten minutes ago, with one server release driving both phones." Continue at beat 6 with the recordings still on screen. The demo survives; the live claim does not, so do not say "same frame" about the room.

**F5, no cloud recording.** Recovery: drop the overlay and go straight to the Whop pane. The two phone panes already showed the flip. Say nothing about Revyl here; Revyl's moment moves to beat 12 with the replays.

**F6, Whop jams.** Either the Apple Pay sheet does not appear or the dashboard does not move. Recovery: switch the projector to the Whop dashboard on the rehearsal's payments and narrate the state machine while pointing: "Hold, arrive, void. No show, capture, fund." Then say "This ran against real cards a hour ago; the recording is on the pull request." Never enter card details on stage.

**F7, the dashboard is blank.** Recovery: it is one tab. Switch to the `frolics` table and the reveal timestamp instead of `taps`. If the whole backend is unreachable, the phones are also dead, which means F4.

**F8, Keiki does not answer.** Recovery: show the recorded iMessage thread from the rehearsal as a static screenshot, and say "That thread is Priya's, from the rehearsal, with the same reveal second as the phones." Then run the app and lock screen halves live, which need no Keiki.

**F9, Supermemory is not in the live path.** Recovery: open a terminal running the live script and show one real memory coming back with its related edges, then the plan line that quotes it. If that also fails, cut to the mock's Garden, and keep the sentence "It remembers what we skip" as the only claim.

**F10, GitHub is not loading.** Recovery: the pull requests are also in the Captain's Drive as reports with the replay links pasted in. Show the Drive.

## What the judges can hold afterwards

Hand over three things, in this order: the mock on a laptop (every screen, interactive, no account), the three-phone recording, and the pull request trail. The mock is the only one that needs no explanation.

---

# Sponsor sheet

Status is this file's truth as of 5:00pm PT on Nov 15 2026. Where a lane lands a report or a test, the row moves from pending to built and names the evidence. Nothing moves on a lane's word alone.

| Sponsor | Tier | Demo beat | Status today | Evidence |
| - | - | - | - | - |
| Convex | required | The dashboard has both taps while every phone shows nothing, then both flip from one server timestamp | Schema, components, routers on `schema-matcher` (PR #1, draft). Matcher, reveal and tests pending. | `convex/schema.ts` review, `e2e/` assertions written against it |
| Whop | Tier 1 | The $3 hold at the reveal, released by arrival, the no-show feeding the Frolic Fund, the paid plan split with the fund first | Spec only (PR #3, draft). Nothing built. | `docs/specs/whop.md` on the spec branch |
| Keiki | Tier 1 | One friend on the app, one on the lock screen, one only in iMessage, all revealing together | Agent prompt on `main`. Routes and agent number pending. | `docs/keiki-system-prompt.md` |
| Supermemory | required | Two skips and boba stops being suggested, and the "why this" line quotes a memory | Code and tests on branch `memory`, not merged. | `convex/memory/*` on that branch |
| Revyl | required | Cloud phones flipping with ours, offsets burned in, the three-phone recorded run | 44 flows and the run plan on `e2e/revyl-harness` (PR #2, draft). Never run: no build, no login. | `e2e/` lint at 0 errors, 44 files |
| Capy | required | The pull request trail with replays, and the reports in the Drive | This thread, and every lane that opened a PR today | PRs #1, #2, #3, `reports/` in the Captain Drive |

## Convex

**What Frolic uses.** The whole backend, and the part of the demo a judge cannot see working anywhere else.

- A matcher inside one mutation: every subset of tappers of size two or more, filtered by each person's hidden "only if" set and by window overlap. Convex transactions are serializable, so two taps landing in the same instant cannot reveal twice. `convex/matcher.ts`, pending.
- One server timestamp for the reveal: the match writes `revealAt = now + 1.5s`, every phone keeps a small clock offset from the server and fires the flip at exactly that instant. `revealAt` is a field in `convex/schema.ts`, the offset query is pending.
- Reactive queries as the transport. There is no push in this build, and none is needed: the phones are already subscribed, so the match arrives through the same query that drew the plan. The demo beat is exactly this fact.
- The Workflow component for plan generation, mounted in `convex/convex.config.ts`, called from `convex/plans/`. The Presence component for who has the app open, and the Rate Limiter for the tap and invite routes, both mounted in the same file.
- Scheduler and crons for the daily drop and the fade: `convex/crons.ts` calls `registerPlanCrons` in `convex/plans/crons.ts`.
- File storage for the group snap, one `_storage` id per shot in `convex/schema.ts` and the collage row beside it.
- HTTP actions for the web "I'm down" page, the Whop webhook and the Keiki routes: `convex/http.ts` registers `convex/web/routes.ts`, `convex/whop/routes.ts` and `convex/keiki/routes.ts`. The router is the schema lane's file; each lane fills its own.
- Tests everywhere: vitest and convex-test, one suite per function, with the matcher's race and privacy cases written as tests rather than claims.

**Where it lives.** `convex/schema.ts`, `convex/convex.config.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/matcher.ts`, `convex/reveal.ts`, `convex/taps.ts`, `convex/frolics.ts`, `convex/plans/`, `convex/memory/`, `convex/whop/`, `convex/keiki/`, `convex/web/`.

**The moment.** At t6 the dashboard shows both taps landing while every phone still shows a bud, and at t24 both phones flip from one server timestamp. A judge can check the timestamps themselves. Nothing else in this stack can make two phones agree to a millisecond while the server holds the secret.

**If it is not ready.** The mock plus the recorded flip. The dashboard is still worth showing, because the reveal timestamps are in `frolics` and a judge can see one row per frolic.

## Whop

**What Frolic uses.** One commitment system with three faces, read from Whop's current API docs and OpenAPI spec on Nov 15 2026. Full detail in `docs/specs/whop.md` on the spec branch.

- A hold that charges nobody who shows up: `POST /payments` with `capture: false` authorizes against the card, `POST /payments/{id}/void` releases it, `POST /payments/{id}/capture` collects it. A hold lapses on its own within five days, which is the failure mode we want.
- The card is collected with Whop Payment Elements on our own page: `createConfirmationToken()` returns a single use `ctok_` token, our server passes it to `POST /payments`, and `handleNextAction(client_secret)` runs 3D Secure when a payment needs it.
- Apple Pay on our page, not in the app. The native `WhopCheckout` Apple Pay surfaces need an Apple Pay merchant id and a paid Apple developer account, which this build does not have, so the app opens our hosted pay page in an in app Safari sheet.
- A per-share charge on a paid plan: `POST /payments` with an inline `variant` under a hidden product, captured immediately, because paying the share is the commitment.
- Refunds with `POST /payments/{id}/refund`, for a called off plan.
- Webhooks as the only source of money truth: Standard Webhooks HMAC over the id, timestamp and body, a five minute tolerance, at least once delivery, so we dedupe on `webhook-id` and re-read the payment with `GET /payments/{id}` before a row moves.
- A real ledger on our side, `shares` and `fundLedger` in `convex/schema.ts`, where every fund credit names the `pay_` id that funded it, so a dollar on the Crew tab traces back to a real payment.
- Only new hidden products in the Whop company, created by one internal action. Nothing that already exists is touched.

**Where it lives.** `convex/whop/` (payments, links, the state machine, the fund, the pay page), `convex/whop/routes.ts` for the webhook, `convex/schema.ts` for `shares`, `fundLedger`, `whopPlans` and `webhookEvents`.

**The moment.** At t32 a hold is placed the second the plan is on, at t38 walking into a real place releases it, and at t42 the friend who never came funds tomorrow's plan. Money that commits a friend and is released by a physical arrival is Whop's money logic running on Frolic's location signal. A pay button cannot express it.

**If it is not ready.** The dashboard and the state machine narrated, with the spec's four states on screen. Do not mime a payment.

## Keiki

**What Frolic uses.** The whole loop over iMessage, for friends who never install Frolic.

- One Keiki agent per number, prompted in `docs/keiki-system-prompt.md`, holding the same secrecy rule as the app: never say who else is down, how many, or whether anyone is, before the reveal, and never confirm that someone tapped, skipped or said "only if".
- Tools written as Keiki tools or reached over MCP, one per backend action: today's plan, tap, only if, pass, the reveal, on my way, check in, submit the snap, pay the deposit, remember a preference. Every one of them is a Convex function the app also calls, so a text yes and an app yes go through the same matcher in the same table.
- The channel's own primitives: threaded replies, tapbacks and typing, so the conversation reads like a friend texting, and one inbox with every conversation and tool call in order, which is also how the demo is debugged live.
- The reveal is the hard part and the reason this is a sponsor moment: the agent cannot send "It's on" before `revealAt`, and it sends to every matched friend at once, one of whom has an app open and one of whom has a lock screen.

**Where it lives.** `convex/keiki/routes.ts` (inbound), `convex/keiki/outbound.ts` (the drop, reveal, leave nudge and snap window hooks the matcher calls), the agent prompt at `docs/keiki-system-prompt.md`, and the agent itself in Keiki's own console.

**The moment.** At t46 Priya says yes in a text thread, and at t54 the app, the lock screen and the iMessage thread all reveal in the same second. Three surfaces, one person who never installed anything.

**If it is not ready.** The recorded thread, plus the app and lock screen halves live. Say which one is a recording.

## Supermemory

**What Frolic uses.** One namespace per person and one per group, so private limits stay private and shared taste builds up.

- Namespaces as the privacy boundary: `POST /ns/{ns}/document` with our own event id as the document id, so a retry is a no op, and `dreaming: "instant"` so a memory is searchable the same second it is written.
- Search with typed filters and graph edges: `POST /ns/{ns}/search` with `include.related` returns the update, extend and derive edges behind a fact, which is what a "why this" line quotes from.
- Profile buckets per namespace, so the taste card reads likes, avoids, vibe, budget and rhythm directly instead of re-deriving them.
- `supportingContext` per namespace, so the group extracts tastes, places and price feel while the personal one extracts limits and preferences.
- Graph supersession as the way a taste changes: a loved night updates an earlier skip of the same tag, and `isLatest` keeps retrieval on the current truth.
- Real deletion: `DELETE /ns/{ns}` on account deletion, and group namespaces stay because they hold no personal facts.

**Where it lives.** `convex/memory/client.ts`, `events.ts` (the only place that decides what leaves the phone and for which namespace), `ingest.ts` (the outbox and its retries), `mapping.ts`, `context.ts` (the plan lane's read path), `read.ts`, `stats.ts`, `account.ts`. Tables `memoryContainers`, `memoryOutbox` and `tasteProfiles` in `convex/schema.ts`.

**The moment.** At t58 the crew's two skipped days for boba stop boba from being suggested, and the "why this" line quotes the memory it learned from, with the graph chain visible in one search.

**Status.** On branch `memory`, not merged. The suite passes: 42 tests in 4 files (`npx vitest run`, Nov 15 18:48) and `npx tsc --noEmit -p convex` is clean, run against that branch by this thread. The live half is not proven: no run against the real API here, which needs `SUPERMEMORY_LIVE=1` and the key, and the read path into plan generation is called by no lane yet. Until a live run lands, the Supermemory beat runs from the recorded thread or the live script (F9).

## Revyl

**What Frolic uses.** Real iPhones in three real places, each recording what that phone knew and when.

- YAML flows in the repo, one per feature and per screen state, 44 of them, written against the mock's exact copy so a screen that drifts from the mock fails on the copy alone.
- Workflows with `--concurrency` to run phones in parallel, which is the only way to test a product about what two phones know at once.
- Per phone `set_location`, so Maya is six minutes from Indian Rock and Dev is eleven.
- Per run launch environment, so a build can point at a branch's backend preview without a rebuild.
- Code execution scripts as the coordination layer: a barrier server releases all three phones at the same instant, and every phone stamps the server clock on its flip.
- Per step report timelines with video and timings, which is the artifact: two flips, one release, the offsets printed.

**Where it lives.** `e2e/flows/` (44 flows including the three `tp-*` phone flows), `e2e/three-phone-run.md` (the run, seed, reset, cost, backup plan), `e2e/tools/barrier-server.mjs` and `barrier.mjs`, `e2e/scripts/`, `e2e/lint.sh`, `e2e/identifiers.md`, and the accessibility ids mirrored to `handoffs/e2e-identifiers.md` in the Captain Drive.

**The moment.** At t28 the two cloud phone flips sit next to ours, frozen, with "Maya +0.31 s, Dev +0.34 s from one server release" burned in. The claim is checkable, and a simulator cannot make it.

**Status.** Written and linted locally, 44 files, 0 errors. Never run: no iOS build, and the Revyl CLI on the lane's machine was not signed in. Blocked on the iOS app's deep link scheme and the three `/e2e/*` backend routes, both listed in `e2e/three-phone-run.md`.

## Capy

**What Frolic uses.** The build itself, on a clock.

- Parallel crew threads, each on its own cloud machine, one per lane: schema and matcher, plan generation, Whop, Supermemory, Keiki, the web page, the Revyl harness, the iOS screens.
- Each lane opens a draft pull request early and keeps pushing to it, and the pull request body carries what was verified and how, with test counts and, for iOS, screenshots and a replay.
- Build and run on cloud iPhones from inside a thread, so a lane can prove a screen without owning a Mac.
- Reviews and reports: every lane leaves a report in the Captain's Drive with the outcome, the pull request, what it verified, what it did not, and the lesson for the next lane. The Captain's notes read them and route the next wave.
- Subagents on a cheaper model for the work that is not the hard core of a lane: tests, copy passes, a self review of a diff before it reports.

**Where it lives.** There is no Capy code in this repository, by design. The trail is the artifact: the pull requests, their replays, and `reports/` in the Captain Drive.

**The moment.** At t70 the pull requests on screen, each with a recording, and the day's reports behind them. The claim is that a person watched every one of these run on a real phone before it merged.

**Status.** Every row above is a live pull request today. The trail is public and it is the only sponsor claim in this script that needs no rehearsal.

## Reading the sheet against the build

Two rules keep this honest.

1. A row says built only when a test, a report or a recording exists, and the row names it. A lane's message is not evidence; its pull request is.
2. A beat with a pending row runs from a recording and says so, or it does not run. The audience is told which. A demo that admits a gap is worth more than one a judge catches.

## Sources

- `docs/brief.md`, the spec, read for the demo section, the tiers and the bar for done.
- `design/mock/index.html`, the copy and the states, read for every quoted line.
- `convex/schema.ts`, `convex/convex.config.ts`, `convex/http.ts`, `convex/crons.ts` on `schema-matcher`, read for what exists and where.
- `docs/specs/whop.md` on `capy/whop-spec-commitment-hold`, read for the money states and the script beat.
- The Supermemory spec in the memory lane's report, read for namespaces, search, graph and deletion.
- `docs/keiki-system-prompt.md`, read for the agent's capabilities and its secrecy rule.
- Whop current API reference, `docs.whop.com/api-reference/overview`, read Nov 15 2026.
- Supermemory docs, `supermemory.ai/docs` and the API reference, read Nov 15 2026.
- Keiki, `onkeiki.com`, read Nov 15 2026.
