# Frolic Convex API

The contract between the backend and the iOS and web clients. Every function named here exists in this directory. Anything registered with `internalQuery`, `internalMutation` or `internalAction` is not callable from a client and is listed under [Internal surface](#internal-surface).

Notation: `Id<"x">` is a Convex document id (a string on the wire). `ms` is epoch milliseconds in server time. `?` marks an optional argument field. Optional fields come back as `null` on the wire, never `undefined`.

## Identity

There is no login. A client mints a random `deviceToken` of 32 to 256 characters on first launch, stores it in the Keychain, and sends it as `deviceToken` on every call.

- The server stores only `sha256(deviceToken)` in `users.tokenHash` and looks the user up by that hash. The token itself is never stored, logged or returned.
- The token is the whole identity. Whoever holds it is that user. Never send it to another device, an invite link or a log.
- The first call that carries a token creates the user (`users.createGroup`, `users.joinGroup`). Every other call resolves an existing user or fails with `UNKNOWN_DEVICE`.
- `createGroup` and `joinGroup` also carry `firstName`, which is trimmed, collapses whitespace, and must be 1 to 40 characters. Calling either again with the same token updates the stored name instead of creating a second user.
- Six flower colors are handed out per crew, one per member, in `memberships.color`: `pink`, `cobalt`, `moss`, `marigold`, `tomato`, `lilac`. The client never picks a color.
- Photos are uploaded with `users.generateUploadUrl`, then attached with `users.updateProfile({ photoId })`. Reads return a served URL in `photoUrl`, or `null`.

## Errors

Every failure is a `ConvexError` whose `data` is `{ code, message }`. Branch on `code`, show `message` (it is written for people), and never parse the message.

| code | meaning |
| --- | --- |
| `BAD_TOKEN` | `deviceToken` is outside 32 to 256 characters |
| `UNKNOWN_DEVICE` | the token does not resolve to a user yet |
| `BAD_NAME` | a name is empty or longer than 40 characters |
| `BAD_INVITE` | the invite code is unknown, revoked or expired |
| `NOT_A_MEMBER` | the caller is not in this crew |
| `NOT_FOUND` | the frolic or crew is gone |
| `CLOSED` | the frolic is not taking this action right now |
| `BAD_ONLY_IF` | an `onlyIf` entry is not a member of the crew, or there are more than 12 |
| `BAD_WINDOW` | a window ends before it starts, or spans more than 24 hours |
| `BAD_DAY` | a day is not `YYYY-MM-DD` |
| `BAD_MINUTES` | minutes away is outside 0 to 600 |
| `BAD_LIMIT` | a limit is out of range |
| `NOT_GOING` | check in, eta or snap from someone not going to an `on` frolic |
| `NOT_CHECKED_IN` | snapped before checking in |
| `NO_SNAP_WINDOW` | snapped outside the snap window |

Rate limited calls throw a `ConvexError` whose `data` is `{ kind: "RateLimited", name, retryAfter }` instead: `data.kind` is `"RateLimited"` and `retryAfter` is milliseconds until a retry can succeed. Show the retry state, do not treat it as a generic error.

| limit | rule |
| --- | --- |
| `tap` | token bucket, 12 per minute, burst 6, per user |
| `hopIn` | token bucket, 12 per minute, burst 6, per user |
| `join` | fixed window, 30 per hour, per invite code |
| `createGroup` | fixed window, 10 per hour, per user |

## Clock

`clock.now()` returns the server's current time in ms. It is a mutation so the call has a full round trip to measure.

```
t0 = clientNowBeforeCall
serverNow = await clock.now()
t1 = clientNowAfterCall
offset = serverNow - (t0 + t1) / 2
```

`offset` is server time minus client time, so server time is `clientNow + offset`. Re-measure on launch and after a long background. Every timestamp below (`revealAt`, `bloomAt`, `startsAt`, `endsAt`, `deadline`, `snapAt`) is in server time and must be converted before it drives an animation.

## Reveal

A match never writes a readable row. The tap that completes a match writes a row to the private `reveals` table and schedules `reveal.flip` at `revealAt`. No client query reads `reveals`, and a pending match is invisible: `frolics.today` returns the same body, with `reveal: null`, as it did before the match. A test asserts `frolics.today` returns an unchanged body for every member while the reveal is pending.

Timing, from the server clock:

| event | value |
| --- | --- |
| `matchedAt` | server time of the tap that completed the match |
| `revealAt` | `matchedAt + 1500` ms, when `frolics.today` starts returning `reveal` |
| `bloomAt` | `revealAt + 800` ms, when the bloom animation plays |
| `startsAt` | the matched start slot, rounded up to a 5 minute step |
| `endsAt` | `startsAt + durationMinutes` |

The client flow:

1. Subscribe to `frolics.today`. While `reveal` is `null`, show the pre-reveal screen.
2. When `reveal` arrives, the flip has already happened, so it arrives at or just after `revealAt`. Do not animate on arrival; animate at `bloomAt`.
3. Schedule the bloom for local time `bloomAt - offset`. If that instant is already in the past when the reveal lands, play it immediately without a sound lead-in.
4. `reveal.me.bloomAt` is this person's own bloom time, which differs for anyone who joined after the flip. Use `reveal.me.bloomAt` when it is non-null, and `reveal.bloomAt` otherwise.
5. Reduce Motion replaces the bloom with a fade at the same instant.

Late joiners get `reveal.me.bloomAt` set to their join time plus 800 ms when they join through a late tap, hop in, or refill, so one phone never blooms another phone's moment.

## Phases

`frolics.today` returns `phase`, which decides the whole screen. `open` and `waiting` are the only phases that depend on the caller's own tap, so two people in the same crew can see different ones; the rest are the same for everyone.

| phase | when | screen |
| --- | --- | --- |
| `none` | no frolic exists for the day and the crew has two or more members | the drop is coming |
| `solo` | the crew has one member: no frolic yet, or an open one they have not tapped on | a real plan for one, with "Send to the group chat" and "I'll go solo" |
| `open` | the frolic is `open`, the caller has not tapped `down`, and the crew is bigger than one | the flower row and the tap |
| `waiting` | the frolic is `open` and the caller's tap is `down` | planted, you cannot see anyone else's tap |
| `on` | the frolic flipped to `on` and is not over | the reveal, the names, hop in |
| `done` | the frolic ended (`endsAt` passed) | the memory |
| `faded` | the deadline passed with no match | nothing happened, quietly |

`frolic` is `null` only for `none` and `solo` with no row. `myTap` is non-null only while the frolic is `open` or `on`, so it is `null` for `faded` and `done`. `reveal` is non-null only for `on` and `done`.

## Today

### `frolics.today`

Args: `{ deviceToken, groupId, day?, frolicId? }`. Returns:

```
{
  phase: "none" | "solo" | "open" | "waiting" | "on" | "faded" | "done",
  groupName: string,
  memberCount: number,
  frolic: null | {
    frolicId, day, kind, deadline, window: { start, end }, durationMinutes,
    plan: null | {
      title, line, why: string | null, cost: number, startsAt, sunsetAt: number | null,
      place: null | { placeId, name, lat, lng, photoUrl: string | null, neighborhood: string | null }
    }
  },
  myTap: null | { kind: "down" | "notToday", onlyIf: Person[], window: { start, end } | null },
  reveal: null | {
    revealAt, bloomAt, startsAt, endsAt, snapAt: number | null,
    going: (Person & { role: "matched" | "hopIn" | "refill" })[],
    me: { going: boolean, role: string | null, bloomAt: number | null,
          hopInWaiting: boolean, canHopIn: boolean }
  }
}
```

`Person` is `{ userId, name, color, photoUrl }`.

Pick the frolic with `frolicId` when you have one, else with `day`, else with the newest row for the crew. A `frolicId` from another crew is `NOT_FOUND`. Errors: `UNKNOWN_DEVICE`, `NOT_A_MEMBER`, `NOT_FOUND`.

`plan.startsAt` is the frolic's matched start once it is `on`, and the plan's own start before that. `cost` is a number in the plan's own units and `plan.costLabel` does not reach the client, so render `cost` with the app's own formatting.

`reveal.me`:

- `going` is whether the caller holds a `going` attendee row.
- `role` is how they got there: `matched` for a member of the matched set or a late tap that fit, `hopIn` for a tap on the reveal, `refill` for a promotion from the hop-in pool.
- `bloomAt` is their own bloom time, `null` when not going.
- `hopInWaiting` is true while they sit in the hop-in pool because the frolic was full.
- `canHopIn` is true while the frolic is `on`, the caller is not going, is not waiting in the hop-in pool, and there is room.

### `frolics.hopIn`

Args: `{ deviceToken, frolicId }`. Returns `"going" | "waiting"`.

Only while the frolic is `on` and before `endsAt`, else `CLOSED`. Already going returns `"going"` without a write. When capacity is set and full, the caller is queued in the hop-in pool and gets `"waiting"`. Errors: `UNKNOWN_DEVICE`, `NOT_FOUND`, `NOT_A_MEMBER`, `CLOSED`, `RateLimited`.

### `frolics.sitOut`

Args: `{ deviceToken, frolicId }`. Returns `null`.

Only acts while the frolic is `on`; otherwise a silent no-op. Drops a waiting hop-in to `left`. If the caller was going, marks them `sittingOut` and promotes the oldest waiting hop-in to `going` with role `refill` when there is room. A person who sits out can hop back in later if room exists.

## Tap

### `taps.tap`

Args: `{ deviceToken, frolicId, kind: "down" | "notToday", onlyIf?: Id<"users">[], window?: { start, end }, source?: "app" | "notification" }`. Returns `null`.

One row per user per frolic, replaced on every tap. Only `down` taps count toward a match.

- `onlyIf` names crew members who must also be in the matched set for this tap to hold. The caller's own id and duplicates are dropped. More than 12 names is `BAD_ONLY_IF`, and so is any id outside the crew. Nobody can read another person's `onlyIf`.
- `window` is the span this person is free. It must be longer than zero and at most 24 hours. A tap that omits it falls back to the frolic's `window`.
- `source` defaults to `"app"`. Clients send `"app"` or `"notification"`; `"web"` and `"imessage"` come from other lanes.
- While the frolic is `open` and before `deadline`, the tap re-runs the matcher immediately. Switching a tap to `notToday` before the reveal cancels the pending reveal and deletes it with no trace.
- While the frolic is `on` and before `startsAt`, a `down` tap joins as a late match when all of `onlyIf` is already going, the window covers the frolic and there is room. A `notToday` from a going attendee sits them out and refills the spot.

Errors: `UNKNOWN_DEVICE`, `NOT_FOUND`, `NOT_A_MEMBER`, `CLOSED` (faded or done, past the deadline, or past `startsAt` on an `on` frolic), `BAD_ONLY_IF`, `BAD_WINDOW`, `RateLimited`.

## Matcher

Runs inside the tap mutation for every tap while the frolic is `open`. The same rules apply to a late tap after the reveal, against the going set instead of the tap set.

- A candidate start is one of: the frolic window start, the plan's `startsAt`, and each tap's own window start. Every candidate is rounded up to the next 5 minute step and never earlier than now.
- A tap is eligible at a start `t` when its window covers the whole duration: `window.start <= t` and `t + durationMinutes <= window.end`. `window` is the tap's own, or the frolic's when the tap has none.
- `onlyIf` means every named person must be in the set. The set is pruned to a fixed point: taps whose names are missing drop out, and the survivors are re-checked. Removal can only shrink the set, so this terminates.
- A start with fewer than two survivors is not a match.
- The largest surviving set wins. On a tie, the candidate equal to the plan's `startsAt` wins over another same-size candidate. Otherwise the earliest start wins, because candidates are visited in ascending order and an equal-size set does not replace the current best.
- `startsAt` is the winning slot and `endsAt` is `startsAt + durationMinutes`. The plan's time is a preference, not a requirement: a set that only fits another slot still reveals there.

## Deadline and end

- `frolics.open` schedules `reveal.fade` at `deadline`. Fade deletes every tap row for the frolic, sets status `faded`, and fires the fade hook. Taps after that are `CLOSED`.
- Fade skips itself when a reveal is still pending, so a match that lands less than 1500 ms before the deadline still reveals.
- `reveal.flip` schedules `reveal.complete` at `endsAt`. Complete deletes the tap rows, marks waiting hop-ins `left`, and sets status `done`.

## Crew

### `crew.crew`

Args: `{ deviceToken, groupId, day }`. Returns `{ groupName, members: Member[] }` where `Member` is `{ userId, name, color, photoUrl, isMe, free }` and `free` is `null` or `{ state: "now" | "window" | "busy", window: { start, end } | null, minutesAway: number | null, updatedAt }`.

`day` is `YYYY-MM-DD` in the crew's timezone; availability is stored per day.

### `crew.setFree`

Args: `{ deviceToken, groupId, day, state: "now" | "window" | "busy", window?, minutesAway? }`. Returns `null`.

`window` is required when `state` is `"window"`. `minutesAway` is 0 to 600 and is ignored unless sent. Errors: `UNKNOWN_DEVICE`, `NOT_A_MEMBER`, `BAD_DAY`, `BAD_WINDOW`, `BAD_MINUTES`.

### Presence

| call | args | returns |
| --- | --- | --- |
| `crew.heartbeat` | `{ deviceToken, groupId, sessionId, interval }` | `{ roomToken, sessionToken }` |
| `crew.looking` | `{ roomToken }` | `{ userId, online, lastDisconnected }[]` |
| `crew.disconnect` | `{ sessionToken }` | `null` |

`sessionId` is a client-generated id that stays stable for the session. `interval` is clamped to 5000 to 60000 ms and should match how often the client calls `heartbeat`: a session drops offline after 2.5 times that interval without one. `roomToken` is what `looking` reads, so one call per crew, not per person. `sessionToken` is for `disconnect` on background. `crew.looking` is a plain query with no token check because the room token is the credential; keep it in memory and do not log it.

## Limits

### `limits.mine`

Args: `{ deviceToken }`. Returns `{ budgetCap: number | null, energy: "chill" | "anything" | null, maxMinutes: number | null, homeBy: number | null }`.

### `limits.set`

Args: `{ deviceToken, budgetCap?, energy?, maxMinutes?, homeBy? }`. Returns `null`.

Each field is set when present and `null` clears it. A field omitted keeps its stored value, so send the whole set when saving a sheet. `budgetCap` is 0 to 10000, `maxMinutes` is 0 to 600, `homeBy` is minutes past midnight, 0 to 2160. Anything outside is `BAD_LIMIT`.

## Check in

### `checkins.checkInMe`

Args: `{ deviceToken, frolicId, method: "geofence" | "manual" }`. Returns the `checkins` id.

Only for someone going to an `on` frolic, else `NOT_GOING`. Idempotent: a second call returns the first check-in's id and writes nothing. Check in before `snaps.start`.

## Etas

### `etas.setMine`

Args: `{ deviceToken, frolicId, minutes, onTheWay }`. Returns `null`.

Only for someone going to an `on` frolic, else `NOT_GOING`. `minutes` is 0 to 600, else `BAD_MINUTES`.

### `etas.forFrolic`

Args: `{ deviceToken, frolicId }`. Returns `{ userId, minutes, onTheWay, updatedAt }[]`.

Empty when the frolic is not `on`. Errors: `UNKNOWN_DEVICE`, `NOT_A_MEMBER`.

## Snaps

### `snaps.start`

Args: `{ deviceToken, frolicId }`. Returns `snapAt` as ms in server time.

Only for someone going to an `on` frolic, else `NOT_GOING`. Starts a shared 3000 ms countdown. Calling again while the window is open returns the same `snapAt` instead of starting a new one.

### `snaps.addMine`

Args: `{ deviceToken, frolicId, storageId, takenAt }`. Returns `null`.

Needs a check-in first, else `NOT_CHECKED_IN`. Accepted from 1000 ms before `snapAt` to 120000 ms after it, else `NO_SNAP_WINDOW`. A second upload in the same window replaces the first.

## Internal surface

Not callable from a client. These exist so the web, iMessage and plans lanes act as a user without holding a device token.

| function | args | returns |
| --- | --- | --- |
| `taps.tapAs` | `{ userId, frolicId, kind, onlyIf?, window?, source }` | `null` |
| `users.createAs` | `{ name, phone }` | `userId`, creating the user if the phone is new |
| `users.joinAs` | `{ userId, inviteCode, via: "invite" \| "web" \| "imessage" }` | `groupId` |
| `users.userByPhone` | `{ phone }` | the user doc or `null` |
| `checkins.checkInAs` | `{ userId, frolicId, method }` | `null` |
| `etas.setEtaAs` | `{ userId, frolicId, minutes, onTheWay }` | `null` |
| `snaps.addSnapAs` | `{ userId, frolicId, storageId, takenAt }` | `null` |
| `limits.forUsers` | `{ userIds }` | `{ userId, budgetCap, energy, maxMinutes, homeBy }[]`, nulls for anyone with none |
| `frolics.open` | `{ groupId, day, kind: "daily" \| "weekend" \| "solo", planId?, window, durationMinutes, deadline, capacity? }` | `frolicId` |
| `reveal.flip` | `{ frolicId }` | `null` |
| `reveal.fade` | `{ frolicId }` | `null` |
| `reveal.complete` | `{ frolicId }` | `null` |

`taps.tapAs` and the other `*As` wrappers share the validation of their public counterparts. They differ only in taking `userId` instead of `deviceToken`, so a caller must already have resolved the user.

`frolics.open` is idempotent per crew, day and kind: an existing frolic is returned as is, and its `planId` is updated when the frolic is still `open` and a new plan arrives. A new frolic starts `open`, schedules its fade at `deadline`, and fires the drop hook. `capacity` unset means no limit.

`reveal.flip` is a no-op unless the frolic is still `open` and a pending reveal exists, which is what makes two simultaneous matching taps flip exactly once. `reveal.fade` is a no-op once a reveal is pending or the frolic left `open`. `reveal.complete` is a no-op unless the frolic is `on`.

## Keiki hooks

The iMessage lane hangs its sending off these, in `convex/keiki/outbound.ts`. Every one is an `internalMutation` that currently returns `null` and takes the frolic plus the fields below.

| hook | fires from | when | args |
| --- | --- | --- | --- |
| `onDrop` | `frolics.open` | the moment a new frolic opens | `{ frolicId }` |
| `onReveal` | `reveal.flip` | inside the flip, before the reveal becomes readable | `{ frolicId, userIds, bloomAt }` |
| `onLeaveNudge` | `reveal.flip` | scheduled at `startsAt - 480000` ms (8 minutes before), only when that is still in the future | `{ frolicId, leaveAt }` |
| `onSnapWindow` | `snaps.start` | the moment a snap countdown starts | `{ frolicId, snapAt }` |
| `onFaded` | `reveal.fade` | the deadline passed with no match | `{ frolicId }` |
| `onCollage` | nothing yet | reserved for the collage lane | `{ frolicId, storageId }` |

A hook must not delay the transaction it runs in. Sending belongs in a scheduled action that reads the queued row, not in the hook body.

## E2E routes

Test-only HTTP routes that seed and inspect a demo run from the outside. They are registered in `convex/e2e/routes.ts` and implemented by the internal functions in `convex/e2e/admin.ts`.

Every route is closed unless the deployment sets `E2E_SECRET` to a non-empty value: with no secret the route answers `404` and reveals nothing about itself. With the secret set, `401` unless the `x-e2e-secret` request header equals it exactly. Bad bodies answer `400` with `{ error }`. A run id is 1 to 64 characters of `A-Z`, `a-z`, `0-9`, `_` and `-`.

| route | body | returns |
| --- | --- | --- |
| `POST /e2e/reset` | `{ run }` | `{ run, cleared }` where `cleared` counts the deleted documents |
| `POST /e2e/seed` | `{ run, scenario?: "three-phone" \| "demo" }` | `{ run, groupId, inviteCode, frolicId, deadline, users, reveal_at }` |
| `POST /e2e/advance` | `{ run }` | `{ run, frolicId }`, or `404` with `{ error }` when the run has no demo seed |
| `GET /e2e/reveals?run=` | none | `{ reveals: [{ frolicId, userId, name, reveal_at, bloom_at, delivered_at }] }` |

`reset` deletes every group whose `e2eRun` matches the run, plus its memberships, those members' users, invites, availability, plans, frolics, taps, attendees, hopIns, reveals, revealLog, checkins, etas and snaps. It cancels each reveal's scheduled flip before deleting it. Every query is bounded, so a run id shared by more than a few hundred documents leaves the tail for the next reset.

`seed` resets the run first, so seeding twice with the same run id leaves one crew. It creates the crew "Sunset Crew" in `America/Los_Angeles` with Maya, Dev, Jordan and Priya, one flower color each and a group invite. Each person gets a fresh 64 character device token; only its hash is stored. It upserts the place `indian-rock` (Indian Rock Park) and a plan for today titled "Sunset at Indian Rock" starting 4:30pm Pacific when that is at least 20 minutes away, else 30 minutes from now, then opens today's frolic with an 8 hour window and a 3 hour deadline. Priya gets a free window today from 5pm to 8pm. `users.<name>` is `{ userId, deviceToken, link }`, where `link` is `frolic://signin?deviceToken=<token>&groupId=<groupId>`. The tokens are returned by this route and nowhere else.

`reveal_at` in the seed response is always `null`. `revealAt` only exists once a match lands, and a match never writes a readable row before its own flip, so a seed cannot predict it. The three-phone contract used to describe `reveal_at` as a scheduled instant; that field is now the contract's `null` and the `revealLog` row's `reveal_at` is the real one.

The demo scenario also upserts `berkeley-marina-kayaks` (Cal Adventures at the Berkeley Marina, $8 per person paid up front) and a plan for the next day titled "Kayaks at the Marina", and leaves that frolic closed.

Triggering the frolics in the demo scenario:

1. `POST /e2e/seed` with `{ run, scenario: "demo" }` opens frolic one, today's sunset at Indian Rock. Every seeded phone shows it as today's plan.
2. Taps on frolic one from two of the four people reveal it. The route's `frolicId` is the one to tap, and `GET /e2e/reveals?run=` lists nothing until the scheduled flip at `revealAt` runs.
3. `POST /e2e/advance` opens frolic two, the kayaks on the next day, at whatever time it is called. Because it is the newest row for the crew, every phone's `frolics.today` returns it. Its taps reveal independently of frolic one, so one run can show two reveals in sequence.
