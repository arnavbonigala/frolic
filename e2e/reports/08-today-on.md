# 08-today-on

Device: cloud iPhone 17 Pro Max (machine_01M7G8PG10Z9A3VWYM5VZ5EY44).
Seed: run `revyl1`, scenario `demo` (`handoffs/seeds/revyl1.json`), signed in as Maya with her device link.
Method: every step is checked by reading the iOS accessibility tree before and after the action. No vision: a step passes on labels, roles and presence. Anything only visible as pixels is called out as unverified.

## main, build `01M7GB4ZDHP66D3JMTAR6WZ9WG`

**FAIL at step 2 of 8**: `frolic://e2e/today:on` renders the same "No plan yet" placeholder, so the reveal does not exist on main.

## FROL-14 branch, build `01M7GBKTNCXWK01AYDTJ0J8VTB`

| # | Step | Result |
| - | - | - |
| 2 | "It's on." with "You, Maya and Dev" | PASS, both present, though the names sit above the headline, matching the mock |
| 3 | "Top of Indian Rock at 4:30. Leave by 4:18 and bring a layer, it gets windy up there." | PASS, exact mock copy |
| 4 | Flowers for You, Maya and Dev | PASS, exposed as "You, going", "Maya, going", "Dev, going" |
| 5 | "I'm on my way" and "Directions" | PASS |
| 6 | "Jordan and Priya can still hop in." | PASS |
| 7 | Tap "I'm on my way" | **FAIL: nothing changes.** No navigation, no notice, no label change, sampled at 0.7 s and at 3.2 s |
| 8 | Heading "Sunset at Indian Rock" with "It's on · 4:30" | Cannot run: step 7 never moved |

The dead tap is the important one. `TodayStore.onMyWay()` guards on `frolic?.frolicId` and returns silently when it is nil, and the notification it posts has no consumer on this branch because the on-my-way screen is in #40. On a deep-linked state the guard leaves the primary post-reveal action doing nothing at all, which is a dead end in the demo's biggest moment.

    0 window "Frolic" 440x956 at 0,0
    1 heading "Frolic" 92x36 at 18,74
    2 button "Free till 8. Change when you're free" 110x45 at 312,70
    3 unknown "You, going" 116x193 at 77,211
    4 unknown "Maya, going" 120x244 at 167,161
    5 unknown "Dev, going" 118x213 at 258,191
    6 staticText "You, Maya and Dev" 137x18 at 22,420
    7 heading "It's on." 176x69 at 22,438
    8 staticText "Top of Indian Rock at 4:30. Leave by 4:18 and bring a layer, it gets windy up there." 396x41 at 22,517
    9 button "I'm on my way" 275x54 at 16,578
    10 button "Directions" 123x54 at 301,578
    11 staticText "Jordan and Priya can still hop in." 196x16 at 122,642
    12 button "I can't make it" 143x44 at 149,664
    13 group "Tab Bar" 440x83 at 0,873
