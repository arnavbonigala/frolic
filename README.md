# Frolic

Your friend group's plans, actually happening.

Every afternoon Frolic makes one plan for whoever is free, and the plan unlocks the moment two of you secretly say yes. Who is free is public. Who is down is private, even to the people in the group. Nobody learns a friend said no, and nobody has to be the one who asks.

The daily plan is a real place with a real time, price and walk, fitted to everyone's hidden limits and to what the group actually liked last time. When it matches, every committed phone flips at the same instant, then the rest of the free friends see names and can hop in, because it is already happening. Every night out becomes a photo in the group's scrapbook.

Built for the YC Consumer Mobile Hackathon, Nov 15 2026, on Convex with Revyl, Capy, Whop, Supermemory and Keiki.

`docs/brief.md` is the spec: features, data model, tiers and the bar for done. `design/mock/index.html` is the interactive mock of every screen, and it is the visual and copy reference. `docs/demo.md` is the 90 second demo script and the sponsor sheet, and its status table says what is built today, with the evidence beside each row.

## Architecture

One iOS app, one Convex backend, one web page. The phone does the private work, the backend does the deciding, and no client ever holds a secret it should not.

| Layer | What it is | Why it is there |
| - | - | - |
| App | SwiftUI on iOS 26, four tabs (Today, Crew, Garden, You), a widget extension and a Live Activity | The reveal, the countdown and the photo have to feel native, and every state has a designed screen |
| Sync | ConvexMobile over the Convex live queries, no push | Without a paid Apple account there is no remote push, and none is needed: the phones are already subscribed, so a match arrives through the same query that drew the plan |
| Backend | Convex: schema, queries, mutations, actions, scheduler, crons, file storage, HTTP actions, and the Workflow, Presence and Rate Limiter components | One serializable transaction decides a match, so two taps in the same instant cannot reveal twice |
| Matcher | Every subset of tappers of size two or more, filtered by each person's hidden "only if" set and by window overlap; biggest set, then earliest time | The rule the product is: who is really going, not who is free |
| Reveal | The match writes `revealAt`, every phone keeps a clock offset from the server and flips at that instant | The reveal is the moment people talk about, and it has to be one frame on every phone |
| Plan generation | A seeded Berkeley set of real places, Open-Meteo for weather and sunset, MapKit ETAs computed on each phone, a deterministic scorer, and a Workflow for the daily drop | Never an invented place, and every pick fits every private limit |
| Taste on the phone | Vision labels the hangout photos and Foundation Models turns the labels into a typed taste; only the tags leave the device | Photos never leave the phone, and the taste still changes tomorrow's plan |
| Memory | Supermemory, one namespace per person and one per group | A group that skipped boba twice should stop being offered boba, and a "why this" line should quote the memory |
| Money | Whop: an authorization hold at the reveal, released when you arrive, a per group Frolic Fund fed by no-shows, and paid plans split across the matched friends with the fund applied first | Commitment without a charge, and a real ledger behind the fund |
| Messaging | Keiki, an agent on iMessage | A friend who will not install an app can still say yes, and gets the same reveal at the same second |
| Web | One HTTP route serving the invite page and the "I'm down" page | A friend or a judge can match from a browser with no account and no install |

The privacy rule shapes the schema. A tap is readable by no client query, the matcher reads taps through internal functions only, and a "only if" list never leaves the server. Anything that could break that rule is a bug with a test beside it.

## Repository layout

```
convex/            backend
  schema.ts        every table and index (one owner, the schema lane)
  convex.config.ts Workflow, Presence and Rate Limiter components
  http.ts          HTTP router, calls one register function per lane
  crons.ts         cron router, calls the plan lane's register function
  matcher.ts       the subset matcher and the reveal write
  plans/           daily drop, place candidates, weather, the scorer
  memory/          Supermemory ingest, privacy mapping, context, taste
  whop/            payments, holds, the fund, the pay page, webhooks
  keiki/           inbound routes and the outbound hooks the matcher calls
  web/             the invite and "I'm down" pages
ios/               the Xcode project, app, widget and Live Activity targets
web/               the web "I'm down" page assets
e2e/               Revyl flows, the three-phone run, the barrier scripts
design/            the interactive mock, images, app icon
docs/              the brief, the demo script and sponsor sheet, specs
```

The Xcode project uses file system synchronized folders, so a Swift file is in the target when the file exists. Never hand edit `project.pbxproj` unless you are adding a target.

## Run the backend tests

```bash
npm install
npm test                          # vitest and convex-test
npx tsc --noEmit -p convex        # typecheck the backend
```

Both must pass before a push. Every Convex function ships with tests, written first: the matcher's rules, two taps inside the same 100 ms revealing exactly once, a failed match leaving no trace, and the privacy cases that assert a client query cannot read a tap, a skip or an "only if".

A local backend for a branch, with no deploy and no shared state:

```bash
CONVEX_AGENT_MODE=anonymous npx convex dev --once
```

Never push a branch to the shared dev deployment. It is deployed from `main` only.

When working in `convex/`, read `convex/_generated/ai/guidelines.md` and `.agents/skills/convex*` first. They override older Convex knowledge, including the function form, validators and component usage.

## Build iOS on Revyl

Linux machines cannot build iOS. The build runs on Revyl's runners, from a Capy thread, and the run happens on a cloud iPhone 17 Pro Max, which is the device in Revyl's list closest to the 17 Pro.

1. Build from the thread with `tools.mobile.build`. It creates a build named `frolic-ios`, which is the name every flow in `e2e/` resolves to.
2. Install and drive it on a cloud iPhone, either with `tools.capy.phone` or from `e2e/`:

   ```bash
   cd e2e
   revyl auth login
   revyl init -y
   revyl test create --from-file flows/05-today-open.yaml
   revyl test run frolic-today-open
   ```

3. Point a build at a branch's backend without rebuilding, by passing the branch's preview origin as launch environment:

   ```bash
   revyl workflow run frolic-all --launch-env FROLIC_CONVEX_URL=https://<preview-host>
   ```

4. Run everything. The app flows go in one workflow; the three phone flows are their own, because they share one seeded run and block on a barrier:

   ```bash
   ./e2e/lint.sh
   revyl workflow create frolic-all
   revyl workflow add-tests frolic-all $(ls flows/[0-9]*.yaml | xargs -n1 basename | sed 's/.yaml//')
   revyl workflow run frolic-all --concurrency 5
   ```

5. Put the phones to sleep the moment the run ends. `tools.capy.phone` with `sleep`, or `revyl device stop --all`. Cloud phones bill by the minute.

The three phone run, with its seed, reset, barrier and evidence chain, is `e2e/three-phone-run.md`. Read it before touching those flows: it is the demo's proof and the only place that explains how three phones are released together.

Every iOS pull request carries a green Revyl build, a walkthrough on a cloud iPhone, and screenshots of each state it touched, loading, empty, error and success, embedded in the body. A feature that cannot show that does not merge.

## What is next

Features that miss the bar today. Some are cut for time, some are blocked on an account, and each says which.

- **A real Whop balance per group.** The Frolic Fund as designed is a Convex ledger with every credit traced to a `pay_` id. A subaccount per group plus `POST /transfers` would make the fund a real Whop balance. Blocked on identity verification on the Whop company, which also unlocks payouts and claim links.
- **The fund paying back whoever fronted the bill.** A claim link to the friend who bought the ice cream. Same verification gate as above.
- **Saved cards and a hold with no sheet.** A setup intent at onboarding, then off session holds. Needs consent copy and a `requires_action` path that does not exist yet.
- **Local businesses selling Frolic experiences.** One Berkeley shop as a subaccount, shares charged on it with an application fee. The business model on the last slide, not on the demo path.
- **Remote push.** The build has no paid Apple developer account, so the daily drop is a local notification the phone schedules itself, and the lock screen buttons run the tap in the background. A paid account moves the same buttons to real push and lets the server wake a phone.
- **Friends of friends.** Sam, Dev's roommate, invited from outside the group. Reuses the matcher, needed a fourth device and a scope decision, cut for time.
- **The weekend drop.** A second weekly plan on Saturday. Reuses the daily pipeline, adds a cron and a scoring pass.
- **Fair rotation and the weather swap.** Rotating whose taste leads the pick, and re-checking the forecast two hours out to swap to the indoor backup while everyone's taps carry over. Both are designed and both landed behind the core loop.
- **A memory page a person can inspect and correct.** The graph visual and a "forget this" button exist in the sponsor docs. Reading a memory is one query; letting someone edit or delete one is a product surface nobody has designed.
- **Per photo depth in the group snap.** The collage tilts today. Depth Anything on device, so the foreground lifts off the sky, is a stretch that did not fit.
- **A real account.** Identity is a device id, because the build has no paid account and no Sign in with Apple. The schema carries a token per user and an `imessage` source, so a real sign in is a swap, not a rewrite.
- **Serving people with no group.** 134 of the comments in the research say some version of "I don't have friends". Matching them into a group is the second product, and the hardest one.

Anything on this list stays out of `docs/demo.md` unless it has a test or a recording. The rule for the last hour is the rule for the whole build: depth on the core loop beats breadth.
