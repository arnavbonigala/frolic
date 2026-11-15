# Developing Frolic

## Repository layout

```
convex/            backend
  schema.ts        every table and index (one owner, the schema lane)
  convex.config.ts Workflow, Presence and Rate Limiter components
  http.ts          HTTP router, calls one register function per lane
  crons.ts         cron router, calls the plan lane's register function
  lib/matcher.ts   the subset matcher, the rule the product is
  taps.ts          the secret tap, and the match inside the same mutation
  reveal.ts        one revealAt, written once, in the match transaction
  frolics.ts       Today, hop in, bail and the fade
  crew.ts          the crew tab, free status and the presence read
  daily.ts         the day boundary and the memory day close
  memory/          Supermemory client, privacy mapping, ingest, context, taste
  e2e/             the secret-gated seed, reset and reveal-log routes
  whop/            holds, the fund, the split, the signed webhook, the pay page
  keiki/           inbound routes and the outbound hooks the matcher calls
  web/             the invite and "I'm down" pages (routes land on a branch)
  plans/           daily drop, place candidates, weather, the scorer (pending)
ios/               the Xcode project, app, widget and Live Activity targets (pending, branch ios-foundation)
web/               the web "I'm down" page, its build and its screenshots
e2e/               Revyl flows, the three-phone run, the barrier scripts
design/mock/       the interactive mock, every screen, the copy reference
design/generated/  painted plan heroes, one per taste tag, and the friend portraits
design/icon/       the app icon, light, dark and tinted, painted and flat
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
2. Install and drive it on a cloud iPhone, either with `tools.capy.phone` (live screen only) or with the Revyl CLI, which needs a key rather than a browser login:

   ```bash
   export REVYL_API_KEY=...
   cd e2e && revyl init -y
   revyl test create --from-file flows/05-today-open.yaml
   revyl test run frolic-today-open
   ```

3. Point a build at a branch's backend without rebuilding, by passing the branch's preview origin as launch environment:

   ```bash
   revyl workflow run frolic-all --launch-env FROLIC_CONVEX_URL=https://<preview-host>
   ```

4. Run everything. The app flows go in one workflow; the three phone flows are their own, because they share one seeded run and block on a barrier:

   ```bash
   node e2e/tools/lint.mjs e2e/flows
   revyl workflow create frolic-all
   revyl workflow add-tests frolic-all $(ls flows/[0-9]*.yaml | xargs -n1 basename | sed 's/.yaml//')
   revyl workflow run frolic-all --concurrency 5
   ```

5. Put the phones to sleep the moment the run ends. `tools.capy.phone` with `sleep`, or `revyl device stop --all`. Cloud phones bill by the minute.

The three phone run, with its seed, reset, barrier and evidence chain, is `e2e/three-phone-run.md`. Read it before touching those flows: it is the demo's proof and the only place that explains how three phones are released together.

Every iOS pull request carries a green Revyl build, a walkthrough on a cloud iPhone, and screenshots of each state it touched, loading, empty, error and success, embedded in the body. A feature that cannot show that does not merge.

