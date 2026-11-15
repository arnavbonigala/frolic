# Keiki: the text lane

Keiki runs an iMessage agent for us. It hosts the model, the line, memory, and the
conversation; our code stays in Convex behind fourteen HTTPS tool routes. This file records what
Keiki can do, what we built on it, and what it costs us to depend on it. Doc citations point at
`~/.capy/work/keiki/` (the vendor docs, downloaded Nov 15 2026) and at the code in
`convex/keiki/` and `keiki/`.

## 1. Why Keiki is Tier 1 for Frolic

Frolic's promise is a plan for your friend group today, and the tap is secret until the reveal.
The app asks a friend to install something, sign in, and grant notifications before any of that
happens. The other entry point in the brief is the web "I'm down" page
(`docs/brief.md:452`): a link, a first name, one button. Keiki goes one step further, because a
thread is where the plan already lives. A friend texts, says down, and gets the reveal in the
same conversation. No install, no browser, no account.

The whole loop survives the move to text. `get_today` returns the plan, `tap_down` and
`tap_only_if` take the secret answer, `get_reveal` returns the match after the reveal, `on_my_way`
and `check_in` handle arrival, `submit_snap` collects the photo, `pay_deposit` hands over the
Whop link, and `remember` writes a preference into our memory lane
(`keiki/agent.ts:47-65`, `docs/keiki-system-prompt.md`). A crew that never opens the app can run
a day end to end.

The brief also says that without a paid Apple developer account there is no remote push
(`docs/brief.md:466`). An iMessage thread is a proactive channel that does not need one: the
server writes a notice, Keiki runs a turn, the phone buzzes.

## 2. Capabilities that fit

Ordered by how much design they carry, most first. Each row says what the docs promise and what
Frolic does with it.

| Capability | What the docs say | Frolic use |
| --- | --- | --- |
| Webhook tools with platform-derived identity | A webhook tool receives `{ input, context }` and returns JSON; `context.phone` is the conversation identity, filled by Keiki, never by the model (`docs_cloud-agents.md:787-793`, `docs_billing-agent-example.md:118-124`) | Every route resolves the person from `context.phone` alone (`convex/keiki/routes.ts:208-209`), so a prompt injection cannot tap for someone else |
| Notices for proactive turns | `POST /api/v1/developer/agents/:agentId/notice` with `text` and optional `phone`; text is written for the agent, which decides the wording, and `phone` must name an existing conversation (`docs_agent-api.md:242-281`) | The drop, the reveal, the leave nudge, the snap prompt and the collage all arrive this way (`convex/keiki/outbound.ts:290-320`) |
| Group chats on a dedicated line | `features.groupChats` enables groups; iMessage groups need a dedicated `photon` or `blooio` line, and each group is its own `imsg:chat:<provider chat id>` conversation (`docs_cloud-agents.md:247-270`) | The crew's group chat gets the morning drop and "It's on", so nobody has to forward anything (`convex/keiki/outbound.ts:91-110`) |
| Keiki Vault Face ID approval cards | `policy.approval: "ask"` turns a tool call into a card with Decline and Approve, both behind Face ID (`docs_actions.md:54-78`, `docs_keiki-vault.md:252-266`); `policy.card` is the layout (`docs_vault-cards.md:56-119`) | The Whop deposit hold is approved with Face ID in the thread, and the route only returns the link when `context.approval` is present (`convex/keiki/routes.ts:170-177`) |
| Attachments | An inbound photo, voice note or file carries `attachment_id`, and a tool called with it gets `context.attachments[<id>].url`, valid 15 minutes (`docs_cloud-agents.md:145-149`, `:196-201`) | `submit_snap` fetches the photo into Convex storage; `check_in` reads a shared location card the same way (`convex/keiki/routes.ts:90-116`) |
| Managed memory | `memory: { provider: 'supermemory', autoRetrieve, categories }` gives per-contact recall (`docs_cloud-agents.md:405-410`, `:481-492`) | Runs beside our own Supermemory ingest: `remember` writes an FROL-6 event, `get_member` returns our summary (`convex/keiki/tools.ts:76-98`) |
| Steering | Rapid messages are batched with a 2 second debounce and a new one can interrupt the turn (`docs_cloud-agents.md:238-245`, `:441`) | Three texts in a row get one answer, and a steered turn from the dashboard cannot write for the person (`convex/keiki/routes.ts:213-215`) |
| Media describe | Inbound attachments are described or transcribed before the model reads them (`docs_cloud-agents.md:444-450`) | A photo of the spot arrives as a sentence, so "we're here" works without typing |
| Tapbacks and threaded replies | iMessage supports tapbacks, threaded replies and message effects (`docs_channels.md:79`); a reaction never starts a turn and is stored as feedback (`docs_cloud-agents.md:171-174`) | A heart on the drop costs us nothing and answers nothing, which is the right silence for a secret |
| Voice calls | A line bought under Channels, Phone calls, answers with the same prompt and tools, and `ctx.channel.channel` is `phone_call` (`blog_introducing-voice-calls.md:13-19`, `:46`) | A friend can call and hear the plan. Every documented path is a call coming in; no doc names a way for a server to place one (`docs_channels.md:87`) |
| iMessage app cards (Dynamic UI) | A tool can return a `presentation` card that opens a web view in Messages, with `features.dynamicUi` on and a dedicated Keiki line (`docs_keiki-vault.md:154-172`, `docs_imessage-apps.md:113-137`) | The group snap collage could open as a card in the thread. Not used on demo day |
| Evals and replay | Eval Studio runs test cases against mocked tools; Replay re-runs the prompt over real tapes (`docs_evals.md:15-45`, `docs_replay.md:15-52`) | The way to prove the agent never hints at a match before `revealAt`, without waiting for a real mate |

## 3. Design

### Architecture

```
friend's iMessage  (no app, no account)
      |
      v
Keiki agent "Frolic"   model, prompt, tools, memory, steering
      |  POST {input, context}                        ^  POST /notice {text, phone}
      v                                               |
/keiki/tools/<tool>   Convex HTTP routes, convex/keiki/routes.ts
      |
      v
taps.tapAs  checkins.checkInAs  etas.setEtaAs  snaps.addSnapAs
users.joinAs  whop/deposits:checkoutLinkFor  memory/events:recordEvent
      |
      v
matcher, one transaction -> frolics.status "on", revealAt
      |
      v
scheduled reveal.flip -> keiki.outbound.onReveal -> keikiOutbox row, notBefore = revealAt
      |
      v
internal.keiki.outbound.deliver -> notice API -> Keiki -> iMessage
```

The reveal hook is called by `reveal.flip`, the same internal mutation that sets status `on` and
writes `revealAt` for the app (`convex/reveal.ts:47-51`). The drop, fade, leave nudge and snap
hooks hang off `frolics.ts:36`, `reveal.ts:94`, `reveal.ts:71` and `snaps.ts:21`. Those callers
are on `main`; this branch carries the lane's own files. `onCollage` is exported and nothing
calls it yet.

### One source of truth

The routes never write a tap or an attendance row themselves. `convex/keiki/refs.ts` binds each
mutation by name with `makeFunctionReference`, and `convex/keiki/tools.ts` calls through it:
`tapAs`, `checkInAs`, `setEtaAs`, `addSnapAs`, `joinAs`, `createUserAs`, `recordMemoryEvent`, plus
the Whop action `checkoutLinkFor` (`refs.ts:1-70`). Those are the FROL-3 actor mutations, so the
matcher, the invite rules, the rate limits and the memory events fire exactly as they do for the
app. A tap from a text is a tap.

### Auth

`authenticate` in `convex/keiki/auth.ts:35-57` accepts two shapes. A shared key in
`X-Orchid-Api-Key`, compared in constant time. Or an HMAC: `X-Keiki-Timestamp` plus
`X-Keiki-Signature: sha256=<hmac(secret, timestamp + "." + raw body)>`, refused when the clock
skew passes five minutes (`MAX_SKEW_MS`). With neither header valid the route answers 401, and
with no secret configured at all it answers 503, so an unsynced deployment cannot look healthy.
Keiki sends the api key on every webhook call, which is why the tools are registered as webhook
tools and not as code tools.

### Identity

`identify(context.phone)` (`convex/keiki/auth.ts:62-79`) is the only source of who is talking.
`imsg:chat:` prefix means a group and the chat id. Channel prefixes `wa:`, `sms:`, `imsg:`, `tel:`
are stripped, then the digits must form an E.164 number; a bare 10 digit number becomes `+1`, an
11 digit number starting with 1 gets a `+`. Anything else is 400 `unknown_sender`. The model has
no argument that names a user, and no route looks one up by name.

### Idempotency

A write in a steered turn or a replay needs the same answer twice. For every write with an
`X-Orchid-Trace-Id` header, the route hashes `tool | traceId | phone | input | approval` into
`keikiRequests` by `requestKey` (`convex/keiki/routes.ts:217-224`). A repeat returns the stored
body with `Keiki-Replayed: true` and never runs the mutation again. Preflight calls and reads are
not recorded.

### Steered turns and group chats

Two refusals protect the secret. A call carrying `context.internal` or `X-Orchid-Internal` is a
dashboard steer, and every write tool answers `steered_turn` without touching the database
(`convex/keiki/routes.ts:213-215`). In a group chat, only `get_today` and `link_group_chat` are
allowed; everything else, including all three tap tools, answers `dm_only` with copy telling the
person to text privately (`convex/keiki/routes.ts:30-44`, `:210-212`).

## 4. The secrecy rule and how it holds

The brief's hard rule is that nothing reveals a match before `revealAt` (`docs/brief.md:287-291`,
`:478`). Four things hold it in this lane.

Tap responses carry no match state. `tap` returns `{ ok, answer, onlyWith, after, say }` and
never a count, a name or a status (`convex/keiki/tools.ts:218-226`). The reply copy is "Got it.
Secret's safe." The agent cannot leak what it was never given.

`get_reveal` returns one body before the reveal. If the frolic is not revealed and has not faded,
it returns `{ ok: true, state: "not_yet", say: SECRET_LINE }`
(`convex/keiki/tools.ts:229-241`), the same bytes whether a match is already committed or not. It
has no `going`, no plan and no `revealAt`, so there is nothing to rephrase as a hint.

Outbound rows wait. Every reveal and hop-in draft is written with `notBefore: revealAt`, and the
delivery query refuses those kinds while `now < frolic.revealAt` even if a row somehow comes due
early (`convex/keiki/outbound.ts:112-156`, `:251-264`). `onReveal` also re-checks the clock and
reschedules itself rather than sending (`convex/keiki/outbound.ts:113-117`).

The hook rides the flip. `onReveal` is called inside `reveal.flip` in the same transaction that
sets status `on`, and the outbox schedules delivery at the latest `notBefore` (`convex/reveal.ts:47`,
`convex/keiki/outbound.ts:58`). The texts and the phones are driven by one commit.

## 5. Outbound messages

Copy below is read from `convex/keiki/outbound.ts`. Each notice wraps it as
`Frolic <kind> event. Send this to them now as one message, word for word, and nothing else:`
(`:290-291`), and the prompt addendum tells the agent to obey that line
(`keiki/prompt-addendum.md`).

| Kind | Trigger | Recipients | Copy |
| --- | --- | --- | --- |
| drop | `frolics.ts:36`, the daily drop | every linked crew member by DM, plus every linked group chat | `<title> at <place>, <startsAt>.` / `<why>` / `Reply "down", "only if…", or "pass".` (group: `DM me "down", "only if…", or "pass". It stays secret unless someone else is down too.`) |
| reveal | `reveal.flip`, the moment the app flips | each going attendee by DM, plus every linked group chat | `It's on. You, <names>.` / `Meet at <meetingPoint> at <startsAt>. Leave at <leaveAt>.` / with a paid plan: `Hold $<amount> to lock it in. It comes back when you arrive. Want the link?` (group: `It's on: <names> at <place>, <startsAt>. Hop in?`) |
| hopIn | `reveal.flip`, only when the crew has no group chat | everyone who did not match | `It's on: <names> at <place>, <startsAt>. Room for one more?` |
| faded | `reveal.fade` | the people who tapped down | `Today's plan faded. Tomorrow's drop is a fresh one.` |
| nudge | `reveal.flip` schedules it at leave time | going attendees | `Time to head out. <meetingPoint> is <walk> min away. Meet at <startsAt>.` |
| snap | `snaps.ts:21`, when the snap window opens | going attendees who checked in | `Group snap. Send me one photo right now. You'll see everyone's once yours is in.` |
| collage | `onCollage`, when a collage renders | everyone who sent a snap, plus group chats | `Here's your group snap: <url>` (group: `Today's group snap: <url>`) |

Rows are keyed (`drop:<frolicId>:<userId>`, `reveal:<frolicId>:<chatId>`) so a retry or a second
hook call cannot double-send. A paused link is written as `skipped`. Delivery retries three times
at 2 second spacing and then records `failed` with the HTTP status (`outbound.ts:45-56`,
`:266-288`).

## 6. Six deep features, ranked

| # | Feature | Demo value | Build cost | Risk | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | Frolic in the crew group chat | High. The plan and the match land where the group already talks | Low. `link_group_chat` plus the group fans in `onDrop` and `onReveal` | Needs a dedicated `photon` or `blooio` line with `features.groupChats` on; the current line's provider is unknown | Built. Group posts built and wired; taps refused in group |
| 2 | Photos into the group snap | Medium. Shows the text friend can still be in the scrapbook | Low. One route, one storage call | A group tool call does not identify the sender, so the photo path has to be a DM | Built through DM `submit_snap` |
| 3 | Whop deposit link behind Face ID | High. The only moment in the demo where a payment is approved inside Messages | Low. Policy block plus a preflight branch | The card needs a Keiki-owned dedicated line and Keiki Vault on the phone; other lines fall back to words | Built. Card on `pay_deposit`, link from FROL-5 |
| 4 | Check-in from a shared location | Medium. A friend who never opens the app still checks in | Medium. Parse a vCard or map URL, compare against the meeting point | Keiki documents no inbound pin format; the parse is best effort | Built best effort, 400 m radius |
| 5 | Per-person memory wired to Supermemory | Medium. Proves the agent knows the friend, not just the phone number | Low. One event, one read | Two memory systems on one person; ours has to stay the truth | Built. `remember` to FROL-6, `get_member` reads FROL-6 |
| 6 | Voice call for the leave nudge | High on paper | Out of bounds | No outbound call API; a line purchase is not this lane's | Not built |

Notes on the three that carry risk.

For photos, `context.phone` in a group is the chat identity, so the route cannot tell which member
sent the photo. Keiki also says contact cards and per-contact location requests do not apply to
group identities (`docs_cloud-agents.md:269-272`). The photo therefore goes through the DM, where
`context.phone` is the person.

For the deposit, the policy is on `pay_deposit` in `keiki/agent.ts:12-27`: `approval: "ask"`,
`approvalFallback: "tool"`, `preflight: true`, and a card that says the money comes back when they
arrive. The route answers the preflight without producing a link, then returns the link only on
the approved call (`convex/keiki/routes.ts:170-177`). On a line that cannot show a card, the
fallback runs the tool without `context.approval`, which is exactly how the words path works
(`docs_keiki-vault.md:332-337`).

For location, `parseSharedLocation` reads an Apple Maps `ll=` link, a `geo:` URI, or a bare
coordinate pair out of the attachment text (`convex/keiki/lib.ts:61-74`), and check-in refuses
past 400 m (`CHECKIN_RADIUS_METERS`). Keiki's documented location primitive is the agent asking
the phone with `device_location` and the `location_read` grant (`docs_keiki-vault.md:469`), which
is the Vault path if the best effort misses.

## 7. Delivery timing

A notice starts a model turn, so an iMessage lands a few seconds after the event that caused it,
not in the same frame as the app. The notice response says which happened: `ran`, `queued` inside
the conversation's roughly 2 second debounce or behind a running turn, or `unavailable`
(`docs_agent-api.md:272-274`). That is acceptable for the demo because nothing is sent before
`revealAt` by design: the text lands shortly after the bloom, so the screenshot taken at that
second shows the app flipping and the thread fills in just behind it.

## 8. The demo beat

The run of show lives in `docs/demo.md` on `capy/demo-script-sponsor-sheet` (commit `4b4229d`).
It is not on `main`, so read it with `git log --all -- docs/demo.md` and
`git show 4b4229d:docs/demo.md`. The Keiki beat is t46 to t54, and its cast is the one that
matters here: Maya stays on the app, Dev locks his phone, and Priya types in iMessage.

At t46 the projector shows one thread and the line is "Priya has never installed Frolic. She's
texting our Keiki agent." At t54 the app, the lock screen and the thread move together and the
line is "Same reveal, same second, in a text thread." The fallback is F8, a recorded thread from
rehearsal.

On the seeded kayak plan (tomorrow's kayaks, the paid plan from `docs/brief.md:330`) the same two
beats carry the deposit, which is where Keiki stops being a parity story. That is the one moment
only Keiki can do: the Face ID approval card for the deposit appears in the iMessage-only
friend's thread seconds after the reveal, and the crew group chat gets "It's on" with the matched
names at the same moment the phones bloom. No other surface in the stack can put a payment
approval and a group announcement inside a text thread.

## 9. Setup and operations

Environment variables on the Convex deployment (`convex/keiki/env.ts`):

| Variable | Needed | Effect |
| --- | --- | --- |
| `KEIKI_API_KEY` | yes | Checked on every tool route; missing means 503, and outbound rows settle as `not_configured` |
| `KEIKI_AGENT_ID` | no | Agent the notice API targets; defaults to the built-in id in `agent.ts:6` |
| `KEIKI_TOOL_SIGNING_SECRET` | no | Turns on HMAC verification with a five minute window |

Sync the agent:

```bash
cd keiki && bun install
FROLIC_TOOLS_BASE_URL=<convex site url> bun run sync.ts
FROLIC_TOOLS_BASE_URL=<convex site url> bun run sync.ts --dry-run
```

The `--dry-run` pass prints the payload it would send, with the system prompt replaced by its
length, and writes nothing.

`sync.ts` intercepts only the `POST /api/v1/developer/sync` call, adds `agent_id`, and rewrites
each tool into a webhook tool with `executionType: "webhook"` and a `webhookUrl` of
`<base>/keiki/tools/<name>`. The AgentKit SDK only emits code tools (`syncFeatures` and the tool
builder both hardcode code execution, see `answers.md` section 2), and a code tool runs inside
Keiki's sandbox where it cannot carry our auth header. A webhook tool is a plain HTTPS POST that
Keiki signs with `X-Orchid-Api-Key`, which is the header `authenticate` checks, and it keeps the
tool bodies in Convex where our other tests and deploys already run.

After the sync, `sync.ts` sends `PATCH /api/v1/developer/config` with
`features: { groupChats: true }`. It has to: `syncFeatures` has no `groupChats` field, and a PATCH
only changes the flags it names (`docs_cloud-agents.md:249-251`, `:740`). The agent runs
`google/gemini-3.8-flash` with low reasoning, 10 steps and a 16 message history
(`keiki/agent.ts:68-85`).

## 10. Open risks

Line type is unknown for the two best features. Group chats need a dedicated `photon` or `blooio`
line (`docs_cloud-agents.md:255-257`), and Vault cards are sent only from a line bought through
Keiki, in a 1:1 chat (`docs_keiki-vault.md:154-161`). Nothing in the repo records which provider
our line uses, so on demo day the group fan-out and the Face ID card may both be dark. The
deposit falls back to words through `approvalFallback: "tool"`, and the reveal still works by DM.

The group identity format is inferred. `identify` treats `imsg:chat:` as a group
(`convex/keiki/auth.ts:65`). The docs say a group's conversation is
`imsg:chat:<provider chat id>` (`docs_cloud-agents.md:269-270`) and that a notice's `phone` must
use the conversation format (`docs_agent-api.md:266-268`), but neither states that a group's
`context.phone` is that string. One live group call settles it.

A shared or inbound-only line needs the friend to text first. Keiki refuses a send to someone who
has not messaged, with `recipient_reply_required`, and a platform notice does not clear it
(`docs_channels.md:121`, `:132-134`). Onboarding copy has to put the first message on the friend.

Volume limits are small enough to matter for a crew of friends and large enough not to matter
today: 5,000 messages a day per line, fewer than 50 new conversations in 24 hours, 400 to 500
active users per line (`docs_imessage-best-practices.md:21-23`).

One hook is unwired. `onCollage` has no caller, so the collage text never goes out until the snap
lane calls it. `onDrop`, `onSnapWindow` and the reveal hooks all depend on another lane's function
calling them, so a change there silently turns this lane off.
