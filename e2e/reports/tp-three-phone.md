# tp-three-phone

Run `revyl3` (own seed, never the demo run), build `01M7GCYWPFM3HWPGT0AMKKRNFR` of main `772fecd`, three cloud iPhone 17 Pro Max, all three on the shared deployment, each signed in through `frolic://e2e/signin?token=..&group=..` and then opened on `frolic://e2e/today?token=..&group=..`.

The token on the route matters: without it the Today screen loads fixtures and skips every mutation (defect 1), which is what made the first two attempts look like a match that never reached the server.

## What happened

| Step | Who | Result |
| - | - | - |
| Open the day, free row and plan card | all three | PASS, live data from the seeded frolic |
| "Only with…", pick Dev, "I'm down if Dev is in" | Maya | PASS, planted card, no leak |
| "I'm down" | Dev | PASS, planted card, no leak |
| Reveal | Maya and Dev | PASS, both flipped to "It's on." with "You and Dev" and "You and Maya" |
| Hop-in card | Jordan | PASS, "Jordan, it's happening", "Maya and Dev are going", "Hop in" |
| "Hop in" | Jordan | PASS, joined, and Maya's screen updated live to "You, Maya and Dev" |
| "I'm on my way" | Maya | **FAIL**, no change at 0.9 s or 3.4 s |

## Server timestamps

`GET /e2e/reveals?run=revyl3`, after the flip:

| User | reveal_at | delivered_at | bloom_at |
| - | - | - | - |
| Maya | 1794774008182 | 1794774008192 | 1794774008982 |
| Dev | 1794774008182 | 1794774008192 | 1794774008982 |

Both rows carry the same reveal and delivery instant, so the server-side spread between the two phones is 0 ms. Taps: Maya's commit click at 1794774001187, Dev's at 1794774005763, a 4576 ms gap, so this run is the staged demo order and not the 100 ms race. `reveal_at` is 2419 ms after Dev's tap, which is the 1500 ms reveal delay plus the mutation round trip.

What this does not prove: the instant the two screens painted. Trees are polled, so I can only say both rendered "It's on." inside the same poll window, and there is no vision here to compare pixels. The server rows are the simultaneity evidence; a screen recording would be needed to claim frame-level equality.

## Defects

1. **High. Deep links silently switch to fixtures and then drop every tap.** `TodayStore` enters fixture mode whenever the route is `today` and carries no `token` query, and in fixture mode `tap`, `untap`, `hopIn` and the rest return early. The UI still shows a planted card, so the run looks alive; after reinstalling the app the tap was gone and `/e2e/reveals` stayed empty. Any demo or flow that deep-links without a token is testing mock data. Fix: require an explicit `fixture=1`, or drop the fixture path.
2. **High. "I'm on my way" does nothing on main.** Tapped on the reveal screen, no navigation, no notice and no label change at 0.9 s and 3.4 s. The destination screen is in #40, which is not merged, and `onMyWay()` returns silently when the frolic is nil.
3. **Medium. The tab bar is one unlabelled group.** `group "Tab Bar" 440x83` with no children, so the `tab.*` identifiers from #55 never reach the tree, VoiceOver cannot name a tab, and a flow can only tap the bar by coordinate.
4. **Medium. Only-if copy still says "is in".** "I'm down if Dev is in" on the sheet button and "You're down, if Dev is in" on the planted card. The sheet title now matches the mock ("I'm down only with…"), these two do not ("I'm down if Maya", "You're down, if Maya").
5. **Low. The deposit sheet covers the reveal.** On the first render after the flip, the tree holds only "Hold $3 to lock it in" and "Not now"; the reveal headline, names and details are behind it until dismissed. A screen reader announces a payment prompt before it says the plan is on.
6. **Low. Free-row copy differs from the mock on a live backend.** The band reads "TODAY · SUNDAY, Sunset Crew" and the reason line "Why this: You keep saying yes to sunset plans." where the mock has the Saturday band and its own reason line. Worth a decision, not obviously a bug.

## Not run

- Check-in and group snap, because the arrival flow is #40 and not on main.
- The on-my-way screen, same reason.
- The lock-screen flows, which need a notification category this build does not exercise here.
- The race test: this run staged the taps 4.5 s apart.

Evidence: `renders/FROL-8/tp-run/` holds the tree at each state and the reveal log JSON, with the raw timeline in `timeline.txt`.
