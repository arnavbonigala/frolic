# 06-only-if

Device: cloud iPhone 17 Pro Max (machine_01M7G8PG10Z9A3VWYM5VZ5EY44).
Seed: run `revyl1`, scenario `demo` (`handoffs/seeds/revyl1.json`), signed in as Maya with her device link.
Method: every step is checked by reading the iOS accessibility tree before and after the action. No vision: a step passes on labels, roles and presence. Anything only visible as pixels is called out as unverified.

## main, build `01M7GB4ZDHP66D3JMTAR6WZ9WG`

**FAIL at step 2 of 10**: no only-if control exists, because Today is the placeholder.

## FROL-14 branch, build `01M7GBKTNCXWK01AYDTJ0J8VTB`

| # | Step | Result |
| - | - | - |
| 2 | Tap "Only if…" | PASS |
| 3 | Sheet title and body | PASS: the title reads "I'm down only if…" and the body is exact mock copy |
| 4 | Primary button "Pick at least one friend", disabled | PASS |
| 5 | Tap Maya | PASS |
| 6 | Primary reads "I'm down if Maya" | PARTIAL: reads "I'm down if Maya is in" |
| 7 | Tap Dev | PASS |
| 8 | Primary reads "I'm down if Maya and Dev" | PARTIAL: reads "I'm down if Maya and Dev are in" |
| 9 | Deselect Dev, tap confirm | PASS |
| 10 | Card reads "You're down, if Maya" | PARTIAL: reads "You're down, if Maya is in" |

The flow works end to end; every failure is copy. The app adds "is in" and renames the sheet, so the mock's words and the app's words disagree. Copy drift against the mock, which CREW.md asks to flag.

Tree with the sheet open:

    0 window "Frolic" 440x956 at 0,0
    1 button "Sheet Grabber" 96x23 at 172,447
    2 group "dismiss popup" 1320x2868 at -440,-956
    3 group "dismiss popup" 1320x2868 at -440,-956
    4 heading "I'm down only if…" 178x25 at 27,472
    5 staticText "Pick who has to be there. It only happens if they all say yes. Nobody ever finds out you picked them." 365x35 at 27,503
    6 button "Maya" 188x70 at 27,551
    7 button "Dev" 188x70 at 225,551
    8 button "Jordan" 188x70 at 27,630
    9 button "Priya" 188x70 at 225,630
    10 button "Pick at least one friend" 385x52 at 27,714
