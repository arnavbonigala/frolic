# tp-full-run

Full run on main `5d6df54`, build `01M7GFQD64MS8KGX01M0DCKVVY`, three cloud iPhone 17 Pro Max, own seed run `revyl5`. Method: every step read from the accessibility tree before and after the action, no vision, so anything that only exists as pixels is unverified and said so.

## What passed

- **Onboarding from a clean install** on one phone: "Be the friend who says yes." and "Your crew, outside, more often.", then "Start a crew", the photo library prompt, "What do your friends call you?" with the photo picker and its caption, name typed, and "Your crew is ready" with a real invite link (`https://dutiful-basilisk-895.convex.site/p/TVRVCPZ7`) and both "Share invite link" and "Go to Today".
- **Secret taps and synced reveal.** Dev tapped "I'm down" and Jordan tapped "I'm down". Both flipped to "It's on." with "You, going" and each other's flower, and neither saw anything before `revealAt`.
- **Server timestamps**, `GET /e2e/reveals?run=revyl5`: two rows, Dev and Jordan, both `reveal_at` 1794776479245, both `delivered_at` 1794776479254, both `bloom_at` 1794776480045. Server-side spread 0 ms. Taps at 1794776471629 and 1794776476873, a 5.2 s staged gap, so this is the demo order rather than the race.
- **I'm on my way** now works (#40 on main): the on-my-way screen shows "It's on · 4:30", "Sunset at Indian Rock", "Who's where" with "Jordan, Going · You, On the way", "Shared only with Jordan, and only until you arrive.", a lock-screen preview, and "I'm here".
- **Check-in and group snap.** "I'm here" opened the camera flow, the group snap ran a countdown ("Adding your shot"), then the collage "Every angle, one moment" with the date and place line "Indian Rock Park · Nov 15 · 4:30", the second shot as "Jordan is still adding theirs" and "Theirs appear here as they add them.", then "Plant it in the garden" and "Take it again together".
- **Crew tab** with real data: "4 of you · the crew started in November", free windows per person, "Nobody sees exactly where you are.", "Invite a friend", the hold copy, and the friend sheet for Jordan with its privacy line.
- **Daily pick** renders on Today with two answers and "See what your crew said after you pick".

## Answer to the tab bar question

No. On the first Today screenshot of this run the tree still carries no labelled tab: there is no `tab.today`, `tab.crew`, `tab.garden` or `tab.you` element, and where the bar appears at all it is one `group "Tab Bar"` with no children. #76's overlay was removed, so the ids are gone from the tree entirely and every tab tap in this run was by coordinate (Crew at 165,915; Garden at 275,915).

## Defects

1. **High. A phone can fall out of its identity and land back on onboarding mid-run.** After the notification permission alert on the freshly onboarded phone, the next `frolic://e2e/today?token=..&group=..` opened the welcome screen instead of the signed-in Today, and re-sending both the sign-in route and `frolic://today` did not recover it. That phone was unusable for the rest of the batch, which is why the reveal ran between the other two. A session that exists should never be pre-empted by onboarding.
2. **High. System permission alerts do not take a tap by accessibility label.** Both the camera and notification dialogs showed their buttons in the tree, but clicking "Allow" by label did nothing three times in a row and only a coordinate click dismissed them. Anything scripted by label will silently hang here, and a demo run cannot afford that.
3. **Medium. Daily pick does not visibly accept an answer.** Tapping "breakfast for dinner" left the tree unchanged: still the question, still "See what your crew said after you pick", no selected state and no confirmation line.
4. **Medium. The tab bar still exposes no label.** Detail above; VoiceOver cannot name a tab, and a flow can only tap it by coordinate.
5. **Medium. The group snap is one-sided.** After the tapper's countdown and collage, the other matched phone never showed a snap prompt or countdown, so the collage can only ever read "still adding theirs" from the tapper's side.
6. **Medium. The Crew row for someone who has not tapped reads "Not said yet".** That is a statement about whether a person has answered a private question, which is exactly what the product says is never visible.
7. **Low. "Plant it in the garden" returns to Today** rather than to the Garden where the new flower is, so the reward is never seen.

## Not run

Garden was not reached in this batch: the Jordan friend sheet was open when the Garden tap landed and the sheet took it. Lock-screen flows and the 100 ms race test were not attempted either.

Timeline and trees: `renders/FROL-8/tp-full/`.
