# Frolic accessibility identifiers

Every element a Revyl flow grounds on carries one of these. The flows assert the visible copy in the second column, so the copy here is the app's copy; `e2e/tools/drift.mjs` fails the build when a documented identifier no longer exists in the iOS source or a flow asserts copy the app no longer renders.

Convention: `<screen>.<element>`, lowercase with camelCase leaves, dots between levels, stable across states. Never put a value in an id (no per-minute or per-name suffix): put the value in the label or in a text child.

Bundle prefix `frolic.` comes free from the bundle; do not repeat it in ids.

## Launch and states

| Identifier | Element | Visible label or value |
| - | - | - |
| `app.root` | the root view of every screen | none |
| `state.loading` | any loading placeholder | the screen's own loading copy |
| `state.empty` | any empty state | the empty copy, never an error |
| `state.error` | any error card | the error copy, never an empty state |
| `state.offline` | any offline banner | You're offline |

Tab bar: `tab.today`, `tab.crew`, `tab.garden`, `tab.you`, one per tab, with the selected tab carrying the selected trait. Before #55 the bar exposed a single unlabelled `group "Tab Bar"`; these ids are what flows assert now.

Screen roots: `today.screen`, `crew.screen`, `garden.screen`, `memory.screen`, `you.screen`, `otw.screen`, `checkin.screen`, `you.privacy.screen`.

Sign-in deep link: `frolic://e2e/signin?token=<deviceToken>&group=<groupId>`. The older `frolic://signin?deviceToken=..&groupId=..` still resolves, and the seed's `users.<who>.link` comes back in that older shape, so a run rewrites it to the new one or leaves it, either works.

Deep links: `frolic://e2e/<route>` where route is the mock's hash route (`join`, `name`, `share`, `taste`, `reading`, `calendar`, `today:open|waiting|on|faded|done|solo|hopin|full|off|planning|none`, `crew`, `garden`, `memory/<n>`, `you`, `otw`, `checkin`, `sunday`, `hopin`). The solo state is `frolic://e2e/today?solo=1`, not a `solo` screen. Fixture screens need `?fixture=1`; Garden needs it too. Invite links arrive as `frolic://join/<code>` or `https://frolic.app/j/<code>`.

## Join (`#join`)

| Identifier | Visible label |
| - | - |
| `join.title` | Be the friend who says yes. |
| `join.blurb` | Frolic plans your hangouts. No asking, no deciding, no flaking. |
| `join.join` | Start a crew, Join your crew, or Join <group> when the invite resolved |
| `join.haveLink` | I have an invite link |
| `join.linkField` | the Invite link field in the paste sheet |
| `join.findCrew` | Find my crew |
| `crews.flow.close` | Close, on the add-a-crew flow an invite link opens from inside a crew |

## Name and photo (`#name`)

| Identifier | Visible label |
| - | - |
| `name.title` | What do your friends call you? |
| `name.photo` | Add a photo, then Change photo |
| `name.field` | First name |
| `name.counter` | appears past 30 characters, reads 31/40 and up |
| `name.foot` | Your crew sees your name and photo. |
| `name.continue` | Continue (disabled while empty) |
| `photo.sheet.title` | Add a photo |
| `photo.sheet.caption` | Recents from your photo library |
| `photo.sheet.item.1` … `.4` | Selfie, Photo 1, Photo 2, Photo 3 |

The step after the name is `#share`: `share.title` reads "Your crew is ready", `share.link` shows the crew code, `share.send` is "Share invite link" and `share.done` is "Go to Today". Taste and reading come after a crew has been started from a link.

## Taste (`#taste`, `#reading`)

| Identifier | Visible label |
| - | - |
| `taste.title` | Pick a few nights you loved |
| `taste.count` | 0 selected, 3 selected |
| `taste.photo.<name>` | the photo's aria label: Sunset, Pizza night, Bowling, Picnic, The Marina, Beach day, Campus, Climbing, Pier |
| `taste.notice` | Looked at on your phone. Photos are never uploaded. |
| `taste.continue` | Pick 3 more, then Continue |
| `reading.title` | You're into |
| `reading.status` | Looking at your photos on your phone, then That's what Frolic will plan around. |
| `reading.chip.<tag>` | Sunsets, Late-night food, Games, Outdoors, Free stuff |
| `reading.confirm` | Sounds like me |
| `reading.repick` | Pick different photos |

## Calendar (`#calendar`)

| Identifier | Visible label |
| - | - |
| `calendar.title` | Never type when you're free |
| `calendar.row.today` | Today / Free now till 8 PM |
| `calendar.use` | Use my calendar |
| `calendar.manual` | I'll tell it each day |
| `free.sheet.title` | When are you free today? |
| `free.sheet.till8` | Free now till 8 PM |
| `free.sheet.after5` | Free 5 PM to 8 PM |
| `free.sheet.notToday` | Not today |
| `free.sheet.done` | Done |

## Today, every phase (`#today*`)

| Identifier | Visible label |
| - | - |
| `today.freePill` | Free till 8, Free 5 to 8, Not today |
| `today.freeRow` | Maya, Dev, Jordan and Priya are free |
| `today.bud` | You (closed bud, waiting) |
| `today.caption.waiting` | Waiting for a friend, or Waiting for Maya |
| `today.plan.card` | the packet: Sunset at Indian Rock plus chips and Why this |
| `today.plan.line` | Golden hour on the rocks, ten minutes from campus. |
| `today.plan.why` | Why this: you're into sunsets, it's free, and the sky's clear until dark. |
| `today.down` | I'm down |
| `today.onlyIf` | Only with… |
| `today.hush` | Nobody sees you're down unless they are too |
| `today.next` | We'll tell you the moment it's on. |
| `today.status.down` | You're down, optionally You're down, if Maya or You're down, if all 3 |
| `today.status.downBody` | Disappears at 4 if nobody joins. |
| `today.takeBack` | Take it back |
| `today.off.title` | Taking the day off |
| `today.off.back` | I'm free after all |
| `today.on.title` | It's on. |
| `today.on.who` | You, Maya and Dev |
| `today.on.details` | Top of Indian Rock at 4:30. Leave by 4:18 and bring a layer, it gets windy up there. |
| `today.on.otw` | I'm on my way |
| `today.on.directions` | Directions |
| `today.on.bail` | I can't make it |
| `today.arrived.title` | You made it. |
| `today.arrived.who` | who is already there |
| `today.arrived.snap` | Take the group snap |
| `today.faded.title` | This one drifted off |
| `today.faded.body` | This one drifted off. Nobody knows you said yes. |
| `today.done.title` | You went. |
| `today.done.garden` | See the garden |
| `today.tomorrowRow` | Tomorrow: Maya and Dev are going to Kayaks at the Marina. There's room for you. |
| `today.solo.band` | TODAY · JUST FOR YOU |
| `today.solo.send` | Send to the group chat |
| `today.solo.down` | I'm down |
| `today.money.card` | You're in. Paid $8. |
| `today.money.pay` | Pay $8.00 |

The done line under `today.done.title` is "Your first flower is in the garden."

## Only-if sheet

| Identifier | Visible label |
| - | - |
| `onlyIf.title` | I'm down only with… |
| `onlyIf.body` | Pick who has to be there. It only happens if they all say yes. Nobody ever finds out you picked them. |
| `onlyIf.friend.<name>` | Maya, Dev, Jordan, Priya |
| `onlyIf.confirm` | Pick at least one friend, then I'm down if Maya. Three picks read I'm down if all 3 |

## Hop in and the paid plan (`#hopin`)

| Identifier | Visible label |
| - | - |
| `hopin.title` | Ari, it's happening |
| `hopin.body` | Maya and Dev are going |
| `hopin.plan` | Kayaks at the Marina: The boat ramp at 4:30, $8 each. |
| `hopin.cta` | Hop in, or Hop in for $8 on a paid plan |
| `chip.sheet.title` | Chip in for kayaks |
| `chip.sheet.share` | Your share, $5.00 |
| `chip.sheet.paidBy` | Already paid, Maya and Dev |
| `chip.sheet.pay` | Pay $5.00 |
| `hold.sheet.title` | Hold $3 to lock it in |
| `hold.sheet.body` | You get it back the moment you arrive. |
| `hold.sheet.pay` | Hold $3 |
| `hold.sheet.later` | Not now |

A paid plan is the Today screen with `?paid=1`; there is no separate Sunday screen. It hops in through `hopin`, and its chips read `$8 each`, `2 hours`, `Calm before noon`.

## Crew (`#crew`)

| Identifier | Visible label |
| - | - |
| `crew.title` | the crew switcher: Sunset Crew, switch crew |
| `crew.subtitle` | 5 of you · the crew started in September |
| `crew.free` | your own free time control: Free till 8 |
| `crew.row.you` | your own row, Free till 8 |
| `crew.comingUp` | Sunday 11 AM: Kayaks at the Marina. Maya and Dev are going. |
| `crew.invite` | Invite a friend |
| `crew.invite.title` | Invite to Sunset Crew |
| `crew.invite.link` | Code SUNSET-CREW |
| `crew.invite.copy` | Copy link, then Link copied |
| `crew.invite.text` | Text it |
| `crew.hold` | the hold row: Hold $3 |
| `crew.fund` | the Frolic Fund section: balance and what it paid for |
| `crew.fund.row` | the fund change line, which never names who forfeited |
| `crew.friend.title` | the friend's name |
| `crew.friend.sheet` | Free till 6, 15 min away, roughly |
| `crew.friend.together` | 1 frolic together, or No frolics together yet |

## Garden and memory (`#garden`, `#memory/<n>`)

| Identifier | Visible label |
| - | - |
| `garden.title` | Garden |
| `garden.health` | Your garden is glowing. Two frolics this week. |
| `garden.milestone` | 7 more frolics to unlock the bench |
| `garden.fund` | The Frolic Fund covered $8 at Kayaks at the Marina. |
| `garden.story.sheet` | Share your crew |
| `garden.story.share` | Share to Stories |
| `garden.memory.<n>` | the row: Cheese Board pizza, Nov 8 · Maya, Dev and Jordan |
| `memory.title` | Cheese Board pizza |
| `memory.date` | Nov 8 |
| `memory.photos` | Photos |
| `memory.addPhoto` | Add your photo |
| `memory.back` | Back to Garden |
| `memory.share` | Share |

The empty garden reads "Nothing planted yet" and "Your first flower grows the first time you go." under `state.empty`.

## You (`#you`)

| Identifier | Visible label |
| - | - |
| `you.title` | your name |
| `you.count.error` | Couldn't load your frolics. Tap to try again. The header line while the count is unknown, tap it to resubscribe |
| `you.privateHeader` | Your limits |
| `you.budget`, `you.budget.free`, `.ten`, `.twentyFive`, `.any` | Spend up to: Free, $10, $25, Any |
| `you.energy`, `you.energy.chill`, `.anything` | Energy: Chill, Down for anything |
| `you.travel` | Travel up to, with 5 min by foot or BART |
| `you.homeBy` | Home by: 9 PM, 10 PM, 11 PM, Midnight, Whenever |
| `you.taste` | What you're into |
| `you.repick` | Pick photos again |
| `you.taste.sheet` | the taste sheet |
| `you.privacy` | What friends can see |
| `you.privacy.title` | Privacy |
| `you.privacy.friends` | Friends see: Your flower, Who's free, Rough distance |
| `you.privacy.private` | Only you see: Whether you said yes, Only with… picks, A pass, Your limits |
| `you.permissions.notifications`, `you.permissions.calendar`, `you.permissions.location` | Notifications, Calendar, Location with their status |
| `you.permissions.settings` | Open Settings |
| `you.account.delete` | Delete my account |
| `you.privacy.done` | Done |

The You screen has no daily drop time and no calendar switch on screen; the drop arrives at 3 and the free pill on Today is where a day gets set.

## On my way, bail, check-in (`#otw`, `#checkin`)

| Identifier | Visible label |
| - | - |
| `otw.title` | Sunset at Indian Rock |
| `otw.kicker` | It's on · 4:30 |
| `otw.who` | Who's where |
| `otw.row.you` | your minutes away, updated live |
| `otw.shareNote` | Shared only with Maya and Dev, and only until you arrive. |
| `otw.autoCheckIn` | You'll be checked in when you arrive. |
| `otw.lockPreview` | Indian Rock at 4:30, Maya's there. Dev is 4 min out. |
| `otw.here` | I'm here |
| `otw.directions` | Directions |
| `otw.bail` | I can't make it |
| `bail.sheet.title` | Can't make it? |
| `bail.sheet.body` | Your crew will see a spot open up. |
| `bail.sheet.yes` | I'll still go |
| `bail.sheet.no` | Sit this one out |
| `checkin.card` | You're all here, with Everyone's shot unlocks when you add yours. |
| `checkin.skip` | Skip photo |
| `checkin.snap` | Group snap with Maya and Dev |
| `checkin.title` | Every angle, one moment |
| `checkin.count` | the 3, 2, 1 countdown |
| `checkin.polaroid` | Indian Rock · Nov 15 · 4:30 |
| `checkin.again` | Take it again together |
| `checkin.plant` | Plant it in the garden |
| `checkin.library` | Use a photo instead |
| `checkin.uploading` | Adding your shot |
| `checkin.cameraOff` | The camera is off, with Turn it on in Settings. |
| `checkin.error` | The snap didn't go through, with Try again |

After `checkin.plant` the app opens the planted memory from the Garden, which is what a flow checks for with `memory.back`.

## Lock screen and notifications

| Identifier | Visible label |
| - | - |
| `liveActivity.root` | Indian Rock at 4:30 with the countdown |
| `liveActivity.onMyWay` | on the way |
| `liveActivity.here` | here |

Notification actions are registered on the notification category by title, so a flow taps `I'm down`, `Only with…` or `Not today` by title rather than by identifier.

## Web page

The web page carries no test ids. A flow asserts its copy: `Ari shared a plan with Roommates`, `Your first name`, `I'm down`, `Nobody sees you're down unless someone else is too.`, `You're down, Maya`, `It's on.`, `Get Frolic for the next one`.
