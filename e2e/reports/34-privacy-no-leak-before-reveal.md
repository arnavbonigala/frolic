# 34-privacy-no-leak-before-reveal

Device: cloud iPhone 17 Pro Max (machine_01M7G8PG10Z9A3VWYM5VZ5EY44).
Seed: run `revyl1`, scenario `demo` (`handoffs/seeds/revyl1.json`), signed in as Maya with her device link.
Method: every step is checked by reading the iOS accessibility tree before and after the action. No vision: a step passes on labels, roles and presence. Anything only visible as pixels is called out as unverified.

## main, build `01M7GB4ZDHP66D3JMTAR6WZ9WG`

**FAIL at step 2 of 5**: the only-if control does not exist on the placeholder Today.

## FROL-14 branch, build `01M7GBKTNCXWK01AYDTJ0J8VTB`

| # | Step | Result |
| - | - | - |
| 2 | Only-if, pick Dev, confirm | PASS |
| 3 | Card reads "You're down, if Dev" | PARTIAL: reads "You're down, if Dev is in" |
| 4 | Wait 20 s | PASS |
| 5 | Nothing shows who is down or any count | PASS |

Held server-side: `GET /e2e/reveals?run=revyl1` returned `{"reveals":[]}` throughout the run, so no reveal was written while a tap was sitting private. The Today tree after the wait held only the user's own state, and the Crew tab held no per-person down state.

    0 window "Frolic" 440x956 at 0,0
    1 heading "Frolic" 92x36 at 18,74
    2 button "Free till 8. Change when you're free" 110x45 at 312,70
    3 button "Maya, Dev, Jordan and Priya are free. Your bud is planted. See your crew" 395x122 at 24,120
    4 image "Sunset at Indian Rock" 388x277 at 26,248
    5 staticText "TODAY · SUNDAY, Sunset Crew" 408x36 at 16,282
    6 heading "Sunset at Indian Rock" 257x30 at 34,458
    7 staticText "Free" 28x16 at 45,505
    8 staticText "12 min walk" 73x16 at 101,505
    9 staticText "Golden hour 4:28" 110x16 at 202,505
    10 staticText "Your bud is planted. Waiting for a friend" 303x18 at 69,250
    11 staticText "You're down, if Dev is in" 180x19 at 59,574
    12 staticText "If Dev says yes too, you'll both bloom at once. If not, it disappears at 4 and nobody ever knows." 337x34 at 59,595
    13 button "Take it back" 408x54 at 16,659
    14 group "Tab Bar" 440x83 at 0,873
