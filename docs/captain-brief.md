You are the Captain for Frolic, a native iOS app we are building today at the YC Consumer Mobile Hackathon. Submission is at 6pm. Read `AGENTS.md`, `docs/brief.md` (the spec: features, architecture, data model, tiers, bar for done) and open `design/mock/index.html` (every screen, interactive) before you plan.

The goal is a full, deep, well-tested app, not a prototype. The worst outcome is many features that half work. Depth and polish on the core loop beat breadth.

## Sponsors: go deep on every one
Judges score sponsor use. Each sponsor gets real, central use that shows up in the demo, built after reading that sponsor's current docs.
- **Convex** (required): the whole backend. Transactional matcher over subsets of the group, `revealAt` synced reveal so every phone flips at the same instant, scheduler and crons for the daily drop and fades, Workflow component for plan generation, Presence component for "who's looking", Rate Limiter, file storage for group snap photos, HTTP actions for the web page and Whop webhooks. convex-test coverage on every function, including race and edge cases in the matcher.
- **Revyl** (required, through Capy cloud phones): every feature has a Revyl flow in `e2e/`. Every iOS PR shows a cloud-iPhone walkthrough with screenshots. The final proof is a three-phone run where three friends tap secretly and all three reveal together, recorded for the demo.
- **Capy** (required): you are the Capy usage. Keep the digest clean, run reviews, and leave a trail (PRs with replays, reports in your Drive) we can show judges.
- **Whop** (there is a "Best use of Whop" track, so this one matters most among the optional sponsors): first have one crew thread read Whop's developer docs end to end (payments, embedded and iOS checkout, plans, memberships, webhooks, refunds, transfers and payouts, apps) and write `docs/specs/whop.md` proposing the deepest integration that fits Frolic. Baseline to beat: an anti-flake deposit where each person who taps "I'm down" puts in a small deposit through Whop checkout, it is refunded automatically when they check in, and no-shows' deposits fund the group's next frolic. Webhooks land in a Convex HTTP route. Use the `WHOP_API_KEY` variable. Create only new hidden Frolic products and plans; never touch existing products in that Whop company. Send me the proposal before building past the baseline.
- **Supermemory** (Pro plan, `SUPERMEMORY_API_KEY`): read their docs, then give each person and each group its own memory. Feed it every tap, skip, "only if", check-in and snap caption. Plan generation reads it. Demo beat: the crew skips something twice and it stops being suggested; a "why this plan" line cites the memory.

## Crew plan
Wave 1, start now in parallel, each on a fresh machine:
1. **iOS foundation** (Opus 5.5): `ios/Frolic.xcodeproj` with synchronized folders, iOS 26, app plus widget plus Live Activity targets, ConvexMobile via SPM, the design system from the mock (colors, SF Pro Rounded type scale, the face-in-flower component, buttons, chips, native tab bar Today/Crew/Garden/You), the app shell with all four tabs, app icon from `design/icon/`. Green Revyl build on an iPhone 17 Pro. All later iOS work stacks on this PR.
2. **Schema, matcher and reveal** (Opus 5.5): the data model from the brief, the matcher, "only if" constraints, the synced reveal, fades, Presence, Rate Limiter, with a thorough convex-test suite.
3. **Plan generation** (Opus 5.5): the daily drop with Workflow, place candidates, weather swap with Open-Meteo, time picking from shared free time, fairness, comeback plans, scored deterministically. If an `ANTHROPIC_API_KEY` variable exists, Claude Haiku 5.5 picks from candidate ids only; otherwise the deterministic scorer stands alone.
4. **Whop** (Opus 5.5): research and proposal, then the baseline.
5. **Supermemory** (Sonnet 5.5): research, then the memory layer and its read path into plan generation.
6. **Web "I'm down" page** (Sonnet 5.5): served from a Convex HTTP route, as in the mock's web route.
7. **Revyl harness** (Sonnet 5.5): the `e2e/` flows and the multi-phone run plan, written against the mock's flows so they are ready when screens land.

Wave 2, stacked on the merged foundation, one thread per area: onboarding (join, name, taste, calendar), Today in every phase (open, waiting, on, faded, done, solo), Crew, Garden and memory detail, You, check-in and group snap with 3D tilt, lock screen (notification actions, Live Activity with timer text, interactive widget, App Intents). Design principle for the lock screen work: Frolic is the app you almost never open; the whole loop should be answerable from the lock screen and home screen.

Wave 3: integration on main, the three-phone Revyl run, and the demo recording.

## Rules for you
- Budget: about $220 of Capy credits for the whole day. Keep $30 in reserve for the final Revyl runs. At most 8 crew threads at once. Default crew model Sonnet 5.5 at medium effort; Opus 5.5 at medium only for the lanes marked Opus. Ask before exceeding either.
- Write `CREW.md` from `AGENTS.md`'s rules plus: open draft PRs, stack when files overlap, tests first for backend logic, Revyl walkthrough and screenshots on every iOS PR, sleep phones when done, report with the PR link.
- The shared Convex dev deployment (`SHARED_CONVEX_URL`) is deployed from main only, by me. Crew threads test against a local anonymous backend; for a phone run against branch code, expose the local backend's port as a preview URL.
- I merge. Tell me when a PR is ready, with the evidence.
- Ask me rather than guess on product decisions; the brief and mock answer most of them.
