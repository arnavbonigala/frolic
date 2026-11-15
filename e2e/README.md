# Frolic e2e: Revyl flows

Every flow here is a Revyl YAML test. Revyl drives a real iPhone, so a flow is proof of the app, not of a mock. The flows target the mock's exact copy (design/mock/index.html), so a screen that drifts from the mock fails a flow on the copy alone.

There is no iOS app yet. Nothing here has run on a device.

## Layout

- `flows/`: one flow per feature and per screen state. `tp-*` are the three-phone run's flows.
- `scripts/`: Revyl code_execution scripts, registered in Revyl by name and called from flows by name.
- `tools/`: the local lint, and the barrier server and CLI the three-phone run uses to release all three phones at once.
- `identifiers.md`: the id contract with the iOS lane.
- `three-phone-run.md`: the demo run, the seed and reset steps, the evidence plan, and cost.

## Running a flow: Capy's tools

This is how the crew runs flows here. Capy's tools and the Revyl CLI drive the same Revyl organization and the same cloud devices; Capy's path needs no Revyl key, because Capy sets the Revyl integration up on first use.

1. **Claim a phone.** Read `handoffs/phones.md` in the Captain drive. At most three phones are awake across the crew at once. If three claims are active, wait. Append `<your-code> claim <purpose> <UTC time>` before waking anything.
2. **Attach one.** `tools.capy.phone` with `action: "attach"`, `platform: "ios"`, `model: "iPhone 17 Pro Max"`. Revyl offers iPhone Duo, iPhone 18 Pro Max, iPhone 18 Pro, iPhone 17 Pro Max, iPhone Air, iPhone 16, iPhone 15 and iPad Pro 13-inch (M4); plain "iPhone 17 Pro" is refused. One attached phone is reused for the whole run: every attach adds another one.
3. **Build.** `tools.mobile.build` with `action: "start"`, `platform: "ios"`, `app: "frolic-ios"`, and a `workspace` source rooted at `ios/` with the `xcodebuild` commands and the `.app` output path. The app name must stay `frolic-ios`, which is what the flows' `test.build.name` says.
4. **Install.** `tools.capy.phone` with `action: "install"` and the succeeded build's id.
5. **Walk the flow file top to bottom.** Read the YAML and do each block on the phone through `tools.capy.computer` on that phone's machine:
   - `instructions`: tap the target by its visible label or identifier, or type into a field.
   - `validation`: read the accessibility tree and check the copy the block names. That check is the assertion; if the copy is not in the tree, the flow failed.
   - `extraction`: read the named value out of the tree and record it next to the evidence.
   - `manual` `navigate`: `tools.capy.phone` with `action: "open_url"` and the deep link.
   - `manual` `wait`: sleep the stated seconds.
   - `manual` `set_location`: **not available through Capy's phone tools.** Use the CLI path below, or have the app read a debug fake-location route. The three-phone run depends on location, so it needs one of those two.
   - `code_execution`: run the script locally with the same environment variables the deployment expects.
   - `while` and `if`: poll the tree until the condition's copy appears or disappears, with a timeout.
6. **Record evidence per flow.** One screenshot at every validation state into `renders/<your-code>/<flow-name>/`, named `NN-<block>.png` in block order, and one screen recording of the whole flow (`tools.desktop.recording` start and stop) saved beside them as `recording.mp4`. The recording is what a reviewer watches; the screenshots are what the PR body embeds.
7. **Sleep and release.** `tools.capy.phone` with `action: "sleep"`, then append `<your-code> release <UTC time>` to `handoffs/phones.md`. A claim older than 30 minutes without a release is a bug.

What Capy's path does not give you: Revyl's report, its per-step timeline with video scrubbing, its network and performance tabs, and its share links. The phone tools read the live screen only. Per-block screenshots and the recording are the substitute, so take them at every validation rather than at the end.

### From the CLI, when you have a Revyl key

The CLI adds the report timeline, `revyl test validate` against Revyl's own backend validator, and workflows that run many flows in parallel. It needs `REVYL_API_KEY` in the environment (issued from the Revyl dashboard; the CLI's own `revyl auth login` is a browser approval flow and does not work on this machine).

    export REVYL_API_KEY=...
    cd e2e && revyl init -y
    revyl test create --from-file flows/06-only-if.yaml
    revyl test run frolic-only-if

anka `revyl test run frolic-only-if --json` for machine-readable results, `revyl test open frolic-only-if` for the report.

Run all flows as a workflow:

    revyl workflow create frolic-all
    revyl workflow add-tests frolic-all $(ls flows/*.yaml | xargs -n1 basename | sed 's/.yaml//')
    revyl workflow run frolic-all --concurrency 5

Keep the `tp-*` flows out of `frolic-all`: they share one seeded run and must go together. They belong to `frolic-three-phone`, described in `three-phone-run.md`.

## Point a build at a branch's backend

The app reads its Convex URL from a launch environment variable, so a branch's local backend can be swapped in without rebuilding.

- Capy's path: build with the preview origin passed as a launch environment variable in the build commands, so the `.xcconfig` or Info.plist carries it.
- CLI path: `revyl test env` for one test, or `revyl workflow run frolic-all --launch-env FROLIC_CONVEX_URL=https://<preview-host>` for the run.

Either way the app uses the deployment baked into the build when the variable is absent, and a branch build must point at that branch's own anonymous deployment, never the shared dev deployment.

The three-phone run needs one deployment all three phones talk to: `FROLIC_E2E_URL` in `three-phone-run.md`.

## Lint

    ./lint.sh

Checks every flow against Revyl's schema (unknown keys, block fields per type, manual step types, wait and location formats, script timeouts), enforces lowercase-dashed unique test names, and enforces the repo copy rules on every user-visible string (no em dashes, no exclamation marks, no "not X, but Y"). Then, if the Revyl CLI is signed in with a key, it runs `revyl test validate` over the same files, which is the backend validator `test create` and `test push` use.

Run it before pushing a flow. It installs `yaml` into `~/.capy/work/deps` the first time and touches nothing in the repo.

## Naming

- File and `metadata.name` agree: `NN-screen.yaml` and `frolic-<screen>`. Numbers are the mock's reading order, and a letter suffix (`05b`) is another state of the same screen.
- `tp-<who>` is a phone in the three-phone run. `tp-race-<who>` is the same phone in the race test.
- Tags: the mock route (`today`, `crew`), the feature (`feature-5`), and the area (`money`, `lock-screen`, `privacy`, `three-phone`).
- Test names are the CLI handle: `revyl test run frolic-today-waiting`.

## How flows get to a state

Two ways, both needed:

- **Deep link, `frolic://e2e/<route>`** for states with no path from a fresh install (faded, done, on, hop-in). The route names are the mock's hash routes, so `frolic://e2e/today:on` is `#today:on` and `frolic://e2e/garden` is `#garden`. Query parameters are seeded state the mock also has: `?went=0`, `?deposit=1`, `?deposit=held`, `?deposit=forfeited`, `?split=1`. The app honors this scheme only in a debug or `E2E`-flagged build, and setting a route also sets the fake clock and seeded data that state needs, so a screen is deterministic.
- **Taps and text**, so onboarding and every decision is exercised for real.

Flows never assert on a ui-test id for behavior a person can see: they read the copy and the states in the mock, which is also what makes them catch copy drift.

## Cost

A cloud phone costs $5.40 an hour, about $0.09 a device minute, and Revyl Pro bills $0.075 per iOS device minute; the difference is Capy's own session overhead, so assume the higher number. A single flow is about 1 to 2 minutes including attach and install; the 39 app flows are 45 to 70 device minutes, about $4 to $6.30, and the CLI path can run them in parallel to cut wall clock.

The three-phone run is three phones for about 9 minutes each, about $2.50. See `three-phone-run.md`.

Never run against the shared dev deployment, and put phones to sleep the moment a run ends: at most three may be awake across the crew.
