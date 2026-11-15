# Frolic accessibility identifiers

iOS lane: give these elements these identifiers. The Revyl flows ground on the accessibility tree, and text alone breaks when a name, time or count changes, so an id per interactive element and per state headline keeps the suite stable. Keep the visible label exactly the copy in the second column; the flows assert on that copy, and the copy is the mock's.

Convention: \`<screen>.<element>\`, lowercase, dots between levels, stable across states. Never put a value in an id (no \`today.eta.12\`), put the value in the label or in a text child.

Bundle prefix \`frolic.\` comes free from the bundle; do not repeat it in ids.

## Launch and states

| Identifier | Element | Visible label or value |
| - | - | - |
| \`app.root\` | the root view of every screen | — |
| \`state.loading\` | any loading placeholder | the screen's own loading copy |
| \`state.error\` | any error card | the error copy, never an empty state |

Deep links: \`frolic://e2e/<route>\` where route is the mock's hash route (\`join\`, \`name\`, \`taste\`, \`reading\`, \`calendar\`, \`today:open|waiting|on|faded|done\`, \`today\` with \`solo\` query, \`crew\`, \`garden\`, \`memory/<n>\`, \`you\`, \`otw\`, \`checkin\`, \`sunday\`, \`hopin\`).

## Join (\`#join\`)

| Identifier | Visible label |
| - | - |
| \`join.title\` | Sunset Crew |
| \`join.invitedBy\` | Maya invited you to |
| \`join.blurb\` | Every afternoon, one plan for whoever's free. Say you're down in secret. It only happens if a friend is down too. |
| \`join.caption.free\` | Friends who are free bloom |
| \`join.caption.bud\` | Your yes is a secret bud |
| \`join.caption.on\` | Both yes: it's on |
| \`join.join\` | Join Sunset Crew |
| \`join.solo\` | No invite? Start on your own |

## Name and photo (\`#name\`)

| Identifier | Visible label |
| - | - |
| \`name.title\` | What do your friends call you? |
| \`name.photo\` | Add a photo, then Change photo |
| \`name.field\` | First name |
| \`name.foot\` | This is your flower. Your crew sees your name and photo, and nothing else. |
| \`name.continue\` | Continue (disabled while empty) |
| \`photo.sheet.title\` | Add a photo |
| \`photo.sheet.caption\` | Recents from your photo library |
| \`photo.sheet.item.1\` … \`.4\` | Selfie, Photo 1, Photo 2, Photo 3 |

## Taste (\`#taste\`, \`#reading\`)

| Identifier | Visible label |
| - | - |
| \`taste.title\` | Pick a few nights you loved |
| \`taste.count\` | 0 selected, 3 selected |
| \`taste.photo.<name>\` | the photo's aria label: Sunset, Pizza night, Bowling, Picnic, The Marina, Beach day, Campus, Climbing, Pier |
| \`taste.notice\` | Looked at on your phone. Photos are never uploaded. |
| \`taste.continue\` | Pick 3 more, then Continue |
| \`reading.title\` | You're into |
| \`reading.status\` | Looking at your photos on your phone, then That's what Frolic will plan around. |
| \`reading.chip.<tag>\` | Sunsets, Late-night food, Games, Outdoors, Free stuff |
| \`reading.confirm\` | Sounds like me |
| \`reading.repick\` | Pick different photos |

## Calendar (\`#calendar\`)

| Identifier | Visible label |
| - | - |
| \`calendar.title\` | Never type when you're free |
| \`calendar.row.today\` | Today / Free now till 8 PM |
| \`calendar.use\` | Use my calendar |
| \`calendar.manual\` | I'll tell it each day |
| \`free.sheet.title\` | When are you free today? |
| \`free.sheet.till8\` | Free now till 8 PM |
| \`free.sheet.after5\` | Free 5 PM to 8 PM |
| \`free.sheet.notToday\` | Not today |
| \`free.sheet.done\` | Done |

## Today, every phase (\`#today*\`)

| Identifier | Visible label |
| - | - |
| \`today.freePill\` | Free till 8, Free 5 to 8, Not today |
| \`today.freeRow\` | Maya, Dev, Jordan and Priya are free |
| \`today.bud\` | You (closed bud, waiting) |
| \`today.caption.waiting\` | Your bud is planted. Waiting for a friend |
| \`today.plan.card\` | the packet: Sunset at Indian Rock plus chips and Why this |
| \`today.plan.why\` | Why this: you're into sunsets, it's free, and the sky's clear until dark. |
| \`today.down\` | I'm down |
| \`today.onlyIf\` | Only with… |
| \`today.hush\` | Nobody sees you're down unless they are too |
| \`today.status.down\` | You're down, optionally You're down, if Maya |
| \`today.status.downBody\` | If a friend says yes too, you'll both bloom at once. If not, it disappears at 4 and nobody ever knows. |
| \`today.takeBack\` | Take it back |
| \`today.on.title\` | It's on. |
| \`today.on.who\` | You, Maya and Dev |
| \`today.on.details\` | Top of Indian Rock at 4:30. Leave by 4:18 and bring a layer, it gets windy up there. |
| \`today.on.otw\` | I'm on my way |
| \`today.on.directions\` | Directions |
| \`today.on.hopInNote\` | Jordan and Priya can still hop in. |
| \`today.faded.title\` | This one drifted off |
| \`today.faded.body\` | Not everyone you picked said yes to Sunset at Indian Rock this time, so it quietly faded. Nobody knows you said yes. Tomorrow's plan arrives at 3. |
| \`today.done.title\` | You went. |
| \`today.done.garden\` | See the garden |
| \`today.off.title\` | Taking the day off |
| \`today.off.back\` | I'm free after all |
| \`today.tomorrowRow\` | Tomorrow: Maya and Dev are kayaking. There's room for you. |
| \`today.solo.band\` | TODAY · JUST FOR YOU |
| \`today.solo.send\` | Send to the group chat |
| \`today.solo.down\` | I'm down |

## Only-if sheet

| Identifier | Visible label |
| - | - |
| \`onlyIf.title\` | I'm down only with… |
| \`onlyIf.body\` | Pick who has to be there. It only happens if they all say yes. Nobody ever finds out you picked them. |
| \`onlyIf.friend.<name>\` | Maya, Dev, Jordan, Priya |
| \`onlyIf.confirm\` | Pick at least one friend, then I'm down if Maya |

## Hop in and the paid Sunday plan (\`#hopin\`, \`#sunday\`)

| Identifier | Visible label |
| - | - |
| \`hopin.title\` | Jordan, it's happening |
| \`hopin.body\` | Maya and Dev are going |
| \`hopin.plan\` | Indian Rock with the walk time from this phone |
| \`hopin.cta\` | Hop in |
| \`sunday.plan.title\` | Kayaks at the Marina |
| \`sunday.plan.chips\` | $8 each, 2 hours, Calm before noon |
| \`sunday.hopIn\` | Hop in for $8 |
| \`sunday.paid\` | You're in. Paid $8. |
| \`chip.sheet.title\` | Chip in for kayaks |
| \`chip.sheet.share\` | Your share, $8.00 |
| \`chip.sheet.paidBy\` | Already paid, Maya, Dev |
| \`chip.sheet.pay\` | Pay with Apple Pay |

## Crew (\`#crew\`)

| Identifier | Visible label |
| - | - |
| \`crew.title\` | Sunset Crew |
| \`crew.subtitle\` | 5 of you · the crew started in September |
| \`crew.row.you\`, \`crew.row.<name>\` | the free window and rough distance, for example Free till 8 · 6 min away |
| \`crew.distance.note\` | Distances are rough on purpose. Nobody sees exactly where you are. |
| \`crew.friend.sheet\` | the friend's sheet: Free till 6, 15 min away, roughly |
| \`crew.friend.noAnswer\` | You'll never see whether Jordan said yes or no to a plan. That's the point. |
| \`crew.invite\` | Invite a friend |
| \`crew.invite.link\` | frolic.app/j/sunset-crew |
| \`crew.lately\` | Lately |
| \`crew.favorites\` | Your crew's favorites |
| \`crew.fund\` | the Frolic Fund section: balance and what it paid for |
| \`crew.fund.row\` | the fund change line, which never names who forfeited |

## Garden and memory (\`#garden\`, \`#memory/<n>\`)

| Identifier | Visible label |
| - | - |
| \`garden.title\` | Garden |
| \`garden.count\` | 19 frolics |
| \`garden.week\` | Your crew this week: |
| \`garden.story.sheet\` | Share your crew |
| \`garden.story.share\` | Share to Stories |
| \`garden.memory.<n>\` | the row: Cheese Board pizza, Nov 8 · Maya, Dev and Jordan |
| \`memory.title\` | Cheese Board pizza |
| \`memory.date\` | Nov 8 |
| \`memory.photos\` | Photos |
| \`memory.back\` | Back to Garden |
| \`memory.share\` | Share |

## You (\`#you\`)

| Identifier | Visible label |
| - | - |
| \`you.title\` | your name |
| \`you.privateHeader\` | Only you see these |
| \`you.budget\`, \`you.budget.free\`, \`.ten\`, \`.twentyFive\`, \`.any\` | Spend up to: Free, $10, $25, Any |
| \`you.energy\`, \`you.energy.chill\`, \`.anything\` | Energy: Chill, Down for anything |
| \`you.travel\` | Travel up to 5 min by foot or BART |
| \`you.homeBy\` | Home by: 9 PM, 10 PM, 11 PM, Midnight, Whenever |
| \`you.limitsNote\` | Plans quietly fit everyone's limits. Nobody has to say "I can't afford that." |
| \`you.calendarSwitch\` | Read my calendar |
| \`you.dropTime\` | Daily plan arrives: Noon, 2 PM, 3 PM, 4 PM |
| \`you.calendarOffNote\` | You'll pick when you're free from the pill on Today. |
| \`you.taste\` | What you're into |
| \`you.repick\` | Pick photos again |

## On my way, bail, check-in (\`#otw\`, \`#checkin\`)

| Identifier | Visible label |
| - | - |
| \`otw.title\` | Sunset at Indian Rock |
| \`otw.kicker\` | It's on · 4:30 |
| \`otw.who\` | Who's where |
| \`otw.row.you\` | your minutes away, updated live |
| \`otw.shareNote\` | Shared only with Maya and Dev, and only until you arrive. |
| \`otw.lockPreview\` | Indian Rock at 4:30, Maya's there. Dev is 4 min out. |
| \`otw.here\` | I'm here |
| \`otw.bail\` | I can't make it |
| \`bail.sheet.yes\` | I'll still go |
| \`bail.sheet.no\` | Sit this one out |
| \`checkin.card\` | You're all here |
| \`checkin.skip\` | Skip photo |
| \`checkin.snap\` | Group snap with Maya and Dev |
| \`checkin.count\` | the 3, 2, 1 countdown |
| \`checkin.polaroid\` | Indian Rock · Nov 15 · 4:30 |
| \`checkin.plant\` | Plant it in the garden |

## Lock screen and notifications

| Identifier | Visible label |
| - | - |
| \`push.action.down\` | I'm down |
| \`push.action.onlyIf\` | Only if |
| \`push.action.notToday\` | Not today |
| \`liveActivity.root\` | Indian Rock at 4:30 with the countdown |

Notification actions are registered on the notification category, not on a view, so these three are simply the action titles; the flows tap them by title.

## Web page

| Identifier | Visible label |
| - | - |
| \`web.sharedBy\` | Ari shared a plan with Roommates |
| \`web.name\` | Your first name |
| \`web.down\` | I'm down |
| \`web.hush\` | Nobody sees you're down unless someone else is too. No app needed. |
| \`web.downState\` | You're down, Maya |
| \`web.on\` | It's on. |
| \`web.getApp\` | Get Frolic for the next one |
