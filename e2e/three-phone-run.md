# The three-phone run

The demo proof: three cloud iPhone 17 Pros are Maya, Dev and Jordan. Maya taps "only if Dev", Dev taps "I'm down", nothing appears on any phone, and then Maya's and Dev's phones flip to "It's on." in the same frame. Jordan, who was never part of the secret, gets the hop-in and joins. Recorded on all three, and every flip timestamped against one server clock.

Someone who has never read the Revyl harness can run this from this file alone.

## Why this is the demo moment

Three phones in three places in Berkeley, each one a different person, one of them holding a secret condition, and no phone able to reveal anything early. A single-device test tool cannot show that, because the product's whole claim is about what two phones know before the reveal. Revyl's cloud phones plus `set_location` put three real iPhones at three real Berkeley locations while the Convex matcher decides, and the recordings of all three are the artifact a judge can check.

On screen during the 90 second demo: the two flip recordings side by side with the millisecond offset burned in from the barrier server's release timestamp, the Convex dashboard showing the taps landing while both phones are still blank, and Jordan's phone receiving the hop-in. That comparison, "dashboard knows, phones do not, then phones flip together", is the thing no other sponsor in this stack can produce.

## Devices and placement

| Phone | Person | Location | Where it is |
| - | - | - | - |
| 1 | Maya | 37.8719,-122.2585 | North side of campus, about 6 min from Indian Rock |
| 2 | Dev | 37.8651,-122.2578 | Telegraph, about 11 min out |
| 3 | Jordan | 37.8735,-122.2730 | West of campus, about 15 min out |

All three are iPhone 17 Pro on the newest iOS runtime the model supports (`revyl device targets` lists the pairs). Placement happens with `set_location` in the first block of each flow, before the Today screen asserts the free line, so a flow that silently loses location fails on the walking time.

## Prerequisites

1. A build exists for `frolic-ios` on the branch (`tools.mobile.build` or `revyl workflow run --build`), and it is the build the three-phone tests resolve to.
2. One backend deployment all three phones use, with the e2e seed routes enabled and the e2e flag on:
   - `POST /e2e/reset` body `{run}`, header `x-e2e-secret`. Deletes everything the e2e group owns for that run id and returns `{run, cleared}`.
   - `POST /e2e/seed` body `{run}`, same header. Creates the Sunset Crew with Maya, Dev, Jordan and Priya, the open Today plan for Indian Rock at 4:30, Priya's free window, and returns `{run, users: {maya: {link}, dev: {link}, jordan: {link}}, reveal_at: null}` where each link is that person's sign-in deep link. `reveal_at` is null at seed time because a reveal instant only exists once a match lands.
   - `GET /e2e/reveals?run=` returns `{reveals: [{userId, reveal_at, bloom_at, flipped_at}]}` from the reveal log, mirroring the `revealLog` table: `reveal_at` is the instant scheduled for the group (the same value for everyone in a match), `bloom_at` when the matcher wrote the match, and `flipped_at` that phone's observed flip. The race test reads the row count; the demo comparison reads `flipped_at`.
   These routes are test-only and refuse unless `E2E_SECRET` is set on the deployment. They are the backend lane's to add; the contract above is what these flows call.
3. The barrier server reachable from the phones' scripts, and `FROLIC_E2E_BARRIER_URL`, `FROLIC_E2E_URL`, `FROLIC_E2E_SECRET`, `FROLIC_E2E_RUN` set as launch environment variables for all three sessions.
4. Revyl scripts registered once from `e2e/scripts/`:

       revyl script create barrier --file scripts/barrier.py --runtime python
       revyl script create stamp-server-time --file scripts/stamp-server-time.py --runtime python
       revyl script create e2e-reset --file scripts/e2e-reset.py --runtime python
       revyl script create e2e-seed --file scripts/e2e-seed.py --runtime python
       revyl script create assert-single-reveal --file scripts/assert-single-reveal.py --runtime python
       revyl script create push-daily-drop --file scripts/push-daily-drop.py --runtime python

   `FROLIC_BARRIER_NAME` is per phone: `maya`, `dev`, `jordan`.

## Seed and reset

Every run starts clean, and the run id is unique so nothing leaks between rehearsals:

    export FROLIC_E2E_RUN=demo-$(date +%s)
    curl -s -X POST "$FROLIC_E2E_URL/e2e/reset" -H "x-e2e-secret: $FROLIC_E2E_SECRET" -H 'content-type: application/json' -d "{\"run\":\"$FROLIC_E2E_RUN\"}"
    curl -s -X POST "$FROLIC_E2E_URL/e2e/seed"  -H "x-e2e-secret: $FROLIC_E2E_SECRET" -H 'content-type: application/json' -d "{\"run\":\"$FROLIC_E2E_RUN\"}"

The seed response's `users.maya.link`, `.dev.link` and `.jordan.link` go into the run as test variables `maya_link`, `dev_link`, `jordan_link`. Each comes back as `frolic://signin?deviceToken=..&groupId=..`; the app also takes `frolic://e2e/signin?token=..&group=..`, so pass either and do not rewrite them. Do not wait on `reveal_at` from the seed: it comes back null, because `revealAt` is only written when the matcher finds a match. The clock the run works to comes from the barrier below, and the reveal log is read afterwards to prove exactly one reveal.

Reset after a run too, so the next rehearsal never inherits a tap.

## The run

Three tests, one workflow, all started together:

    revyl workflow create frolic-three-phone
    revyl workflow add-tests frolic-three-phone frolic-tp-maya frolic-tp-dev frolic-tp-jordan
    revyl workflow run frolic-three-phone --concurrency 3 \
      --var maya_link=... --var dev_link=... --var jordan_link=... \
      --launch-env FROLIC_E2E_BARRIER_URL=https://<barrier-host> \
      --launch-env FROLIC_E2E_RUN=$FROLIC_E2E_RUN

Start the barrier before launching:

    PORT=8787 node e2e/tools/barrier-server.mjs        # on any machine the phones can reach
    node e2e/tools/barrier.mjs https://<barrier-host> watch $FROLIC_E2E_RUN

The two barriers do the work that separate devices cannot do on their own:

| Barrier | What it means | Who waits |
| - | - | - |
| `barrier-t0` | All three phones are signed in, on the seeded Today screen, with location set, and nobody has tapped. | Maya, Dev, Jordan |
| `barrier-t30` | Every phone has done everything it can do before the reveal. Maya holds "only if Dev", Dev has not tapped yet, Jordan is parked on an open plan. | Maya, Dev, Jordan |

Run the rehearsal on the operator's terminal with both barriers released by hand:

    node e2e/tools/barrier.mjs https://<barrier-host> watch $RUN     # wait for 3 arrivals at t0
    node e2e/tools/barrier.mjs https://<barrier-host> release $RUN   # release t0
    node e2e/tools/barrier.mjs https://<barrier-host> watch $RUN     # wait for 3 arrivals at t30
    node e2e/tools/barrier.mjs https://<barrier-host> release $RUN   # release t30

For the demo itself, the person on stage releases `t30` with one key press, which is the moment the audience sees three phones do the same thing at once. Because every script prints its own arrival and release offsets, the timings from a rehearsal also show when the taps landed relative to each other.

## Running it with Capy's tools

The workflow above is the CLI path. The crew's default path needs no Revyl key, and it changes one thing: instead of three independent test runs released by the barrier, one Capy thread attaches all three phones and drives them in step itself.

1. Claim all three slots in `handoffs/phones.md` before anything wakes. The crew cap is three awake phones, so a three-phone run occupies all of them and nobody else can run a walkthrough during it. Say so in the claim line so the Captain can schedule it.
2. Attach three phones, `model: "iPhone 17 Pro Max"` (Revyl does not offer plain "iPhone 17 Pro"), then install the same `frolic-ios` build on each from `tools.mobile.build`.
3. Deep link each phone to its seeded state: `tools.capy.phone` with `action: "open_url"` and that person's link.
4. Drive each phone through its flow file with `tools.capy.computer` on its machine, reading the YAML block by block as `README.md` describes. The three taps that must land together are queued in one `execute` program against all three handles and awaited as one batch, so they commit inside a few milliseconds of each other rather than the seconds a person takes. That is the same simultaneity the barrier buys, bought with a batch instead of a server, and it is enough for the demo and for the race test.
5. Read each phone's flip time off its own tree, note the wall clock from `now()` at the moment the "It's on." validation passes on each, and the difference between those two readings is the offset burned into the demo comparison.
6. Evidence: one screenshot per phone per validation state into `renders/<your-code>/<flow>/`, plus three `tools.desktop.recording` videos if the machines are attached, then sleep all three and release all three claims.

Two things the Capy path cannot do, and the CLI path can: `set_location` has no phone-tool equivalent, so the demo's Berkeley placement needs the CLI run or a debug route in the app that takes a location, and there is no Revyl report with a per-step timeline, so the offsets come from the wall clock readings rather than from a report's step timings. Write which path produced a given recording; do not mix offsets from the two.

## What each phone does

**Maya (`tp-maya`).** Deep links to her seeded Today screen, sets `37.8719,-122.2585`, validates the free line and the plan card, arrives at `t0`. At `t30` she taps "Only if…", taps Dev, taps "I'm down if Dev". Asserts the status card reads "You're down, if Dev" and that nothing on screen shows another person down, no count, and no "It's on.". Then a `while` loop waits for the headline "It's on.", reads the clock off the status bar, stamps the server clock, and asserts "You, Dev" with both flowers. It waits 15 seconds and asserts the reveal happened exactly once. Then "I'm on my way".

**Dev (`tp-dev`).** Same setup at `37.8651,-122.2578`. Arrives `t0`, is released at `t30`, asserts nothing shows Maya down before he taps, then taps "I'm down" and asserts "Your bud is planted. Waiting for a friend" and no "It's on." yet. Then the same flip wait, clock read and server stamp, asserting "You, Maya".

Maya and Dev are ordered so Maya's condition is already held when Dev's tap commits. That is the case the matcher has to get right: the reveal must be triggered by Dev's tap against Maya's existing secret, not by either phone's earlier state.

**Jordan (`tp-jordan`).** At `37.8735,-122.2730`, arrives `t0` and validates the open plan with no sign that anyone is down. Released at `t30`, still sees nothing. Then waits for the hop-in card "Jordan, it's happening" with "Maya and Dev are going", stamps the server clock so the hop-in's arrival time is on record, taps "Hop in", and asserts his flower joins Maya and Dev under "You, Maya and Dev".

## How the simultaneous flip is evidenced

Three layers, because a video alone can be argued with:

1. **Synchronized recordings.** Each test run produces a full video in its report (`revyl test report`). All three are the same length from the same moment because `barrier-t30` released them together, so the three videos can be tiled side by side and scrubbed in step. `revyl test share` gives a public link per run.
2. **Server timestamps.** `stamp-server-time` returns the barrier's release instant, which is the only clock all three phones share. Each phone's flip moment is the frame where the report's timeline shows the "It's on." validation, and the report's timeline has a per-step offset from the run start. Subtracting gives each phone's flip offset from the same release. The acceptance bar is that both flips land within the same second, and the report says so with numbers.
3. **The state the flip came from.** Maya's run proves her phone never showed the match before her own client learned it, and Dev's run proves his phone was on "Your bud is planted" until the reveal. Neither can be faked by a phone that simply polls.

For the demo screen, take the two flip offsets and burn them into the comparison: "Maya +0.31 s, Dev +0.34 s from one server release". That number is the whole claim.

## The race test

`tp-race-maya` and `tp-race-dev` are the same taps with no gap: Maya arrives at `t0` already holding "only if Dev" and parks on the flip wait, Dev arrives at `t0`, is released at `t30` and taps "I'm down" with no assertions in between, so the two taps commit inside the same 100 ms window rather than being staged apart. Both phones then wait for "It's on.", stamp the clock, and assert one reveal.

The proof of "reveals once" is not the phone: `assert-single-reveal` reads `GET /e2e/reveals?run=` from the backend and exits non-zero unless the reveal log holds exactly one reveal for the group. A phone that showed "It's on." twice, or two reveal writes for one match, both fail.

    revyl workflow create frolic-three-phone-race
    revyl workflow add-tests frolic-three-phone-race frolic-tp-race-maya frolic-tp-race-dev
    revyl workflow run frolic-three-phone-race --concurrency 2 --var maya_link=... --var dev_link=...

Run the race after the rehearsal on the same seed, then reset.

## Cost per run

Revyl Pro bills $0.075 per iOS device minute.

| Run | Device minutes | Cost |
| - | - | - |
| Three-phone demo (3 phones, about 9 min each, setup and flip included) | about 27 | about $2.00 |
| Race test (2 phones, about 3 min each) | about 6 | about $0.45 |
| Full rehearsal pair | about 33 | about $2.50 |

On Capy's path a cloud phone costs $5.40 an hour, about $0.09 a device minute, so the same pair is about $3. The crew cap of three awake phones means a three-phone run uses every slot; schedule it and release all three claims the moment it ends.

Wall clock is about 10 minutes for the demo run and 4 for the race. Build time is separate and runs on the build runner. Rehearse twice, record the demo run, and keep the phones asleep between runs: `tools.capy.phone` with `sleep`, or `revyl device stop --all`.

## Backup recording plan

Recordings can fail for reasons that have nothing to do with the app: a session dies, a script times out, a viewer never connects. Three fallbacks, in order:

1. **Record the rehearsal, not just the final run.** The rehearsal and the demo run are the same seed and the same flow, so the rehearsal's three videos are already the proof. Keep the share links from both.
2. **Local screen recording of the three streams.** With three cloud phones attached as thread machines, start `tools.desktop.recording` on each phone machine's viewer while the run goes, so an independent recording exists outside Revyl. The barrier timestamps still align them.
3. **A single-phone run as the last resort.** If one phone's report is lost, `tp-maya` alone still shows the flip and the report still carries the server timestamp; the pair is reconstructed from Maya's video plus Dev's narration. Say which one is missing rather than implying a full three-phone capture.

Never present an unrecorded run as recorded. If all three fail, the demo shows the Convex dashboard and Maya and Dev's two phones live, and the report from the last good run is shown as a previous run with its timestamp visible.

## Blocked on

- The iOS app's deep link scheme and the e2e flag: needed by every flow, not just these.
- `E2E_SECRET` and the three `/e2e/*` routes on the deployment: seed, reset and the reveal log.
- Push notification category with the I'm down, Only if and Not today actions, for the lock-screen flows.
- The reveal log query the race test's assertion reads.
- `set_location` for the Berkeley placement: available on the CLI path, unavailable through Capy's phone tools, so the Capy path needs a debug location route in the app.
