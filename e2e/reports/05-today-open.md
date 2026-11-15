# 05-today-open

Device: cloud iPhone 17 Pro Max (machine_01M7G8PG10Z9A3VWYM5VZ5EY44).
Seed: run `revyl1`, scenario `demo` (`handoffs/seeds/revyl1.json`), signed in as Maya with her device link.
Method: every step is checked by reading the iOS accessibility tree before and after the action. No vision: a step passes on labels, roles and presence. Anything only visible as pixels is called out as unverified.

## main, build `01M7GB4ZDHP66D3JMTAR6WZ9WG` (tree `07355ba`)

**FAIL at step 2 of 9.** `frolic://e2e/today:open` renders the foundation placeholder, and the e2e route is ignored entirely:

    heading "Frolic"
    heading "No plan yet"
    staticText "Today's plan arrives at 3. Your crew's flowers bloom here when they're free."
    group "Tab Bar"

Steps 3 to 9 cannot run on main. Expected: main's Today is a placeholder until #43 merges.

## FROL-14 branch `capy/today-in-every-phase`, build `01M7GBKTNCXWK01AYDTJ0J8VTB` (tree `2333b7b`)

| # | Step | Result |
| - | - | - |
| 2 | Pill reads "Free till 8" | PASS, label is "Free till 8. Change when you're free" |
| 3 | "Maya, Dev, Jordan and Priya are free" under four flowers | PASS |
| 4 | Plan card "Sunset at Indian Rock" with chips Free, 12 min walk, Golden hour 4:28 | PASS |
| 5 | "Why this:" line | PASS, exact mock copy |
| 6 | Buttons "I'm down" and the only-if control | PASS: the second button is titled "Only if…" |
| 7 | "Nobody sees you're down unless they are too" | PASS |
| 8 | Row starting "Tomorrow:" | **FAIL: not rendered** |
| 9 | Tab bar shows Today, Crew, Garden and You with Today selected | **FAIL: the tree exposes one `group "Tab Bar"` with no children**, so no tab is labelled or selectable by name; the tabs do work by coordinate |

Tree at step 3:

    0 window "Frolic" 440x956 at 0,0
    1 heading "Frolic" 92x36 at 18,74
    2 button "Free till 8. Change when you're free" 110x45 at 312,70
    3 button "Maya, Dev, Jordan and Priya are free. See your crew" 374x122 at 35,121
    4 image "Sunset at Indian Rock" 388x277 at 26,248
    5 staticText "TODAY · SUNDAY, Sunset Crew" 408x36 at 16,282
    6 heading "Sunset at Indian Rock" 257x30 at 34,458
    7 staticText "Free" 28x16 at 45,505
    8 staticText "12 min walk" 73x16 at 101,505
    9 staticText "Golden hour 4:28" 110x16 at 202,505
    10 staticText "Why this: you're into sunsets, it's free, and the sky's clear until dark." 355x31 at 34,538
    11 staticText "Maya, Dev, Jordan and Priya are free" 260x18 at 90,250
    12 button "I'm down" 292x54 at 16,599
    13 button "Only if…" 106x54 at 318,599
    14 staticText "Nobody sees you're down unless they are too" 290x16 at 76,663
    15 group "Tab Bar" 440x83 at 0,873

Two real defects: the Sunday "Tomorrow:" row from the mock is missing, and the tab bar carries no accessibility labels, which is a VoiceOver blocker and stops any flow from asserting it.
