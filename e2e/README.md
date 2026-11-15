# Frolic e2e: Revyl flows

Every flow here is a Revyl YAML test. Revyl drives a real iPhone, so a flow is proof of the app, not of a mock. The flows target the mock's exact copy (design/mock/index.html), so a screen that drifts from the mock fails a flow on the copy alone.

There is no iOS app yet. Nothing here has run on a device. The files are valid Revyl YAML against Revyl's published schema and pass lint locally; the Revyl backend validator (which needs \`revyl auth login\`) has not seen them yet.

## Layout

- \`flows/\`: one flow per feature and per screen state. \`tp-*\` are the three-phone run's flows.
- \`scripts/\`: Revyl code_execution scripts, registered in Revyl by name and called from flows by name.
- \`tools/\`: the local lint, and the barrier server and CLI the three-phone run uses to release all three phones at once.
- \`three-phone-run.md\`: the demo run, the seed and reset steps, the evidence plan, and cost.

## Run one flow

    revyl auth login
    cd e2e && revyl init -y          # once; writes .revyl/config.yaml
    revyl test create --from-file flows/06-only-if.yaml
    revyl test run frolic-only-if

\`revyl test run\` without \`--build\` uses the test's saved build choice, which defaults to the app's newest build. Add \`--build\` to build and upload first. \`revyl test run frolic-only-if --json\` gives machine-readable results; \`revyl test open frolic-only-if\` opens the report.

The app name in every flow is \`frolic-ios\`. That is the name \`tools.mobile.build\` creates when it builds the iOS app, so a build from this repo is picked up with no further wiring. If the iOS lane names its build differently, change \`test.build.name\` in every flow, or override it per run with \`revyl test run <name> --ios-app <app-id>\`.

## Run all flows

    revyl workflow create frolic-all
    revyl workflow add-tests frolic-all $(ls flows/*.yaml | xargs -n1 basename | sed 's/.yaml//')
    revyl workflow run frolic-all --concurrency 5

Build and upload once first (\`tools.mobile.build\` in a Capy thread, or \`revyl workflow run frolic-all --build\`). Workflows run the tests in parallel up to the concurrency cap and the organization's device concurrency, whichever is lower.

Keep the \`tp-*\` flows out of \`frolic-all\`: they share one seeded run and must go together, and they block on the barrier scripts. They belong to the \`frolic-three-phone\` workflow described in \`three-phone-run.md\`.

## Point a build at a branch's backend

The app reads its Convex URL from a launch environment variable, so a branch's local backend can be swapped in without rebuilding:

1. In another Capy thread on the branch, start the backend: \`CONVEX_AGENT_MODE=anonymous npx convex dev --once\`, then expose the port as a preview URL.
2. Write the preview origin into the app as \`FROLIC_CONVEX_URL\` (and \`FROLIC_CONVEX_SITE_URL\` for HTTP routes) with \`revyl test env\` for one test, or on the workflow:

       revyl workflow run frolic-all --launch-env FROLIC_CONVEX_URL=https://<preview-host>

3. Otherwise the app uses the deployment baked into the build, which for a branch build should be the branch's own anonymous deployment, never the shared dev deployment.

The three-phone run needs one deployment that all three phones talk to. Its plan uses the single preview origin in \`FROLIC_E2E_URL\`.

## Lint

    ./lint.sh

Checks every flow against Revyl's schema (unknown keys, block fields per type, manual step types, wait and location formats, script timeouts), enforces lowercase-dashed unique test names, and enforces the repo copy rules on every user-visible string (no em dashes, no exclamation marks, no "not X, but Y"). Then, if the Revyl CLI is signed in, it runs \`revyl test validate\` over the same files, which is the same backend validator \`test create\` and \`test push\` use.

Run it before pushing a flow. It installs \`yaml\` into \`~/.capy/work/deps\` the first time and touches nothing in the repo.

## Naming

- File and \`metadata.name\` agree: \`NN-screen.yaml\` and \`frolic-<screen>\`. Numbers are the mock's reading order, and a letter suffix (\`05b\`) is another state of the same screen.
- \`tp-<who>\` is a phone in the three-phone run. \`tp-race-<who>\` is the same phone in the race test.
- Tags: the mock route (\`today\`, \`crew\`), the feature (\`feature-5\`), and the area (\`money\`, \`lock-screen\`, \`privacy\`, \`three-phone\`).
- Test names are the CLI handle: \`revyl test run frolic-today-waiting\`.

## How flows get to a state

Two ways, both needed:

- **Deep link, \`frolic://e2e/<route>\`** for states with no path from a fresh install (faded, done, on, hop-in). The route names are the mock's hash routes, so \`frolic://e2e/today:on\` is \`#today:on\` and \`frolic://e2e/garden\` is \`#garden\`. Query parameters are seeded state the mock also has: \`?went=0\`, \`?deposit=1\`, \`?deposit=held\`, \`?deposit=forfeited\`, \`?split=1\`. The app only honors this scheme in a debug or \`E2E\`-flagged build, and setting any route also sets whatever fake clock and seeded data that state needs so a screen is deterministic.
- **Taps and text**, so onboarding and every decision is exercised for real.

Flows never assert on a ui-test id for behavior that a person can see: they read the copy and the states in the mock, which is also what makes them catch copy drift.

## Accessibility identifiers the flows rely on

Revyl grounds on the accessibility tree, so these ids are a contract with the iOS lane. Give every element the id, and keep the visible label as the mock's words. Full list with the copy each one carries: \`handoffs/e2e-identifiers.md\` in the Captain drive, mirrored at \`e2e/identifiers.md\`.

## Cost

Cloud device time is billed per device minute (Revyl Pro: $0.075 per iOS device minute). A single flow is about 1 to 2 minutes; the 39 app flows are 45 to 70 device minutes in total, about $3.50 to $5.50, and a parallel workflow at concurrency 5 finishes in roughly 15 minutes of wall clock. The three-phone run is 3 devices for about 9 minutes each, about $2. See \`three-phone-run.md\`.

Do not run the suite against the shared dev deployment, and put phones to sleep the moment a run ends.
