# Keiki: the text lane

Keiki runs an iMessage agent for us. It hosts the model, the line, memory, and the
conversation; our code stays in Convex behind a set of HTTPS tool routes. This file records what
Keiki can do, what we built on it, and what it costs us to depend on it. Doc citations point at
`~/.capy/work/keiki/` (the vendor docs, downloaded Nov 15 2026) and at the code in
`convex/keiki/` and `keiki/`.

## 0. The line we ship on

Frolic's Keiki line is a shared iMessage number: **+1 (779) 625-1378**. Contacts text the join
code **K-LHG4J7** to it, then the crew's Frolic invite code in the same message.

What a shared line carries: one-to-one threads with anyone who texted first, an agent turn per
inbound message, the notice API, attachments, tapbacks, memory and steering.

What it forbids: group chats, Keiki Vault Face ID cards, and calls. Each of those needs a line
bought through Keiki in our own name, and a shared line cannot ask a bought line to forward a
call (`docs_keiki-vault.md:154-161`, `docs_cloud-agents.md:255-257`).

That also fixes the direction of every conversation: Keiki refuses a send to a person who has not
messaged, as `recipient_reply_required`, and a platform notice does not clear it
(`docs_channels.md:121`, `:132-134`). So the friend's first text is the price of entry, which is
why onboarding is a join code rather than a link we can push.

The group chat and Face ID paths are still in the repo, behind `KEIKI_DEDICATED_LINE`. Set it to
`1` or `true` on the Convex deployment and in the sync environment, and the agent registers
`link_group_chat`, turns on `features.groupChats`, attaches the Vault approval card to
`pay_deposit`, and appends the group section to its prompt. Left unset, which is the shipped
state, none of that reaches the agent. The routes enforce the same flag, so a stale agent cannot
link a group chat either (`convex/keiki/routes.ts` `link_group_chat`, `convex/keiki/outbound.ts`
`chatsOf`).

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
Whop link, and `remember` writes a preference into our memory lane (`keiki/agent.ts`,
`docs/keiki-system-prompt.md`). A crew that never opens the app can run a day end to end, and on
the shared line thirteen routes cover it; `link_group_chat` is the fourteenth and needs the flag.

The brief also says that without a paid Apple developer account there is no remote push
(`docs/brief.md:466`). An iMessage thread is a proactive channel that does not need one: the
server writes a notice, Keiki runs a turn, the phone buzzes.

## 2. Capabilities that fit

Ordered by how much design they carry, most first. Each row says what the docs promise and what
Frolic does with it.

| Capability | What the docs say | Frolic use |
| --- | --- | --- |
| Webhook tools with platform-derived identity | A webhook tool receives `{ input, context }` and returns JSON; `context.phone` is the conversation identity, filled by Keiki, never by the model (`docs_cloud-agents.md:787-793`, `docs_billing-agent-example.md:118-124`) | Every route resolves the person from `context.phone` alone (`convex/keiki/routes.ts`), so a prompt injection cannot tap for someone else |
| Notices for proactive turns | `POST /api/v1/developer/agents/:agentId/notice` with `text` and optional `phone`; text is written for the agent, which decides the wording, and `phone` must name an existing conversation (`docs_agent-api.md:242-281`) | The drop, the reveal, the hop-in, the leave nudge, the snap prompt, the collage and the money messages all arrive this way (`convex/keiki/outbound.ts`) |
| Attachments | An inbound photo, voice note or file carries `attachment_id`, and a tool called with it gets `context.attachments[<id>].url`, valid 15 minutes (`docs_cloud-agents.md:145-149`, `:196-201`) | `submit_snap` fetches the photo into Convex storage; `check_in` reads a shared location card the same way (`convex/keiki/routes.ts`) |
| Managed memory | `memory: { provider: 'supermemory', autoRetrieve, categories }` gives per-contact recall (`docs_cloud-agents.md:405-410`, `:481-492`) | Runs beside our own Supermemory ingest: `remember` writes a `memory/events:recordEvent` with source `imessage`, and `get_member` returns our summary plus the crew's taste (`convex/keiki/tools.ts`, `convex/keiki/routes.ts` `get_member` calling `memory/read:getMemoryContext`) |
| Steering | Rapid messages are batched with a 2 second debounce and a new one can interrupt the turn (`docs_cloud-agents.md:238-245`, `:441`) | Three texts in a row get one answer, and a steered turn from the dashboard cannot write for the person (`convex/keiki/routes.ts`) |
| Media describe | Inbound attachments are described or transcribed before the model reads them (`docs_cloud-agents.md:444-450`) | A photo of the spot arrives as a sentence, so "we're here" works without typing |
| Tapbacks and threaded replies | iMessage supports tapbacks, threaded replies and message effects (`docs_channels.md:79`); a reaction never starts a turn and is stored as feedback (`docs_cloud-agents.md:171-174`) | A heart on the drop costs us nothing and answers nothing, which is the right silence for a secret |
| Group chats on a dedicated line | `features.groupChats` enables groups; iMessage groups need a dedicated `photon` or `blooio` line, and each group is its own `imsg:chat:<provider chat id>` conversation (`docs_cloud-agents.md:247-270`) | Built and behind `KEIKI_DEDICATED_LINE`, off on the shared line. With the flag on, the crew's group chat takes the morning drop and "It's on" |
| Keiki Vault Face ID approval cards | `policy.approval: "ask"` turns a tool call into a card with Decline and Approve, both behind Face ID (`docs_actions.md:54-78`, `docs_keiki-vault.md:252-266`); `policy.card` is the layout (`docs_vault-cards.md:56-119`) | Built and behind the same flag. On the shared line `pay_deposit` is a plain tool whose description says it texts a Whop link |
| Voice calls | A line bought under Channels, Phone calls, answers with the same prompt and tools, and `ctx.channel.channel` is `phone_call` (`blog_introducing-voice-calls.md:13-19`, `:46`) | Not reachable from the shared line. Every documented path is a call coming in, and no doc names a way for a server to place one (`docs_channels.md:87`) |
| iMessage app cards (Dynamic UI) | A tool can return a `presentation` card that opens a web view in Messages, with `features.dynamicUi` on and a dedicated Keiki line (`docs_keiki-vault.md:154-172`, `docs_imessage-apps.md:113-137`) | Needs the same bought line. Not used on demo day |
| Evals and replay | Eval Studio runs test cases against mocked tools; Replay re-runs the prompt over real tapes (`docs_evals.md:15-45`, `docs_replay.md:15-52`) | The way to prove the agent never hints at a match before `revealAt`, without waiting for a real mate |

## 3. Design

### Architecture

```
friend's iMessage  (no app, no account, first text carries the join code)
      |
      v
Keiki agent "Frolic"   model, prompt, tools, memory, steering
      |  POST {input, context}                        ^  POST /notice {text, phone}
      v                                               |
/keiki/tools/<tool>   Convex HTTP routes, convex/keiki/routes.ts
      |
      v
taps.tapAs  checkins.checkInAs  etas.setEtaAs  snaps.addSnapAs
users.joinAs  whop/links:checkoutLink  memory/events:recordEvent
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
hooks hang off `convex/frolics.ts`, `convex/reveal.ts` and `convex/snaps.ts`. Those callers are on
`main`; this branch carries the lane's own files. `onMoney` is exported and waiting on a caller:
FROL-5 owns the Whop webhooks and has been asked to call it when a hold releases and when a
no-show credits the fund. `onCollage` is exported and nothing calls it yet.

### One source of truth

The routes never write a tap or an attendance row themselves. `convex/keiki/refs.ts` binds each
mutation by name with `makeFunctionReference`, and `convex/keiki/tools.ts` calls through it:
`tapAs`, `checkInAs`, `setEtaAs`, `addSnapAs`, `joinAs`, `createUserAs`, `recordMemoryEvent`, plus
the Whop checkout `whop/links:checkoutLink`. Those are the FROL-3 actor mutations, so the matcher,
the invite rules, the rate limits and the memory events fire exactly as they do for the app. A tap
from a text is a tap.

### Auth

`authenticate` in `convex/keiki/auth.ts` accepts two shapes. A shared key in `X-Orchid-Api-Key`,
compared in constant time. Or an HMAC: `X-Keiki-Timestamp` plus
`X-Keiki-Signature: sha256=<hmac(secret, timestamp + "." + raw body)>`, refused when the clock
skew passes five minutes (`MAX_SKEW_MS`). With neither header valid the route answers 401, and
with no secret configured at all it answers 503, so an unsynced deployment cannot look healthy.
Keiki sends the api key on every webhook call, which is why the tools are registered as webhook
tools and not as code tools.

### Identity

`identify(context.phone)` (`convex/keiki/auth.ts`) is the only source of who is talking.
`imsg:chat:` prefix means a group and the chat id. Channel prefixes `wa:`, `sms:`, `imsg:`, `tel:`
are stripped, then the digits must form an E.164 number; a bare 10 digit number becomes `+1`, an
11 digit number starting with 1 gets a `+`. Anything else is 400 `unknown_sender`. The model has
no argument that names a user, and no route looks one up by name.

### Joining by join code

The line is shared, so the first text a person sends carries two codes: the Keiki join code for
the number, `K-LHG4J7`, and the crew's Frolic invite code. `keiki/prompt-addendum.md` tells the
agent to ignore the `K-` code and pass the Frolic code to `join_crew`. The join code never reaches
our database, and a text without a Frolic code gets the agent asking for one.

### Idempotency

A write in a steered turn or a replay needs the same answer twice. For every write with an
`X-Orchid-Trace-Id` header, the route hashes `tool | traceId | phone | input | approval` into
`keikiRequests` by `requestKey` (`convex/keiki/routes.ts`). A repeat returns the stored body with
`Keiki-Replayed: true` and never runs the mutation again. Preflight calls and reads are not
recorded.

### Steered turns, and group chats behind the flag

Two refusals protect the secret. A call carrying `context.internal` or `X-Orchid-Internal` is a
dashboard steer, and every write tool answers `steered_turn` without touching the database. In a
group chat, only `get_today` and `link_group_chat` are allowed; everything else, including all
three tap tools, answers `dm_only` with copy telling the person to text privately. None of that
path is reachable on the shared line, where `link_group_chat` answers `needs_dedicated_line` and
`chatsOf` returns no chats, so nothing outbound can ever address one.

## 4. The secrecy rule and how it holds

The brief's hard rule is that nothing reveals a match before `revealAt` (`docs/brief.md:287-291`,
`:478`). Four things hold it in this lane.

Tap responses carry no match state. `tap` returns `{ ok, answer, onlyWith, after, say }` and
never a count, a name or a status (`convex/keiki/tools.ts`). The reply copy is "Got it. Secret's
safe." The agent cannot leak what it was never given.

`get_reveal` returns one body before the reveal. If the frolic is not revealed and has not faded,
it returns `{ ok: true, state: "not_yet", say: SECRET_LINE }`
(`convex/keiki/tools.ts`), the same bytes whether a match is already committed or not. It has no
`going`, no plan and no `revealAt`, so there is nothing to rephrase as a hint.

Outbound rows wait. Every reveal and hop-in draft is written with `notBefore: revealAt`, and the
delivery query refuses those kinds while `now < frolic.revealAt` even if a row somehow comes due
early (`convex/keiki/outbound.ts` `onReveal`, `due`). `onReveal` also re-checks the clock and
reschedules itself rather than sending.

The hook rides the flip. `onReveal` is called inside `reveal.flip` in the same transaction that
sets status `on`, and the outbox schedules delivery at the latest `notBefore`
(`convex/reveal.ts:47`, `convex/keiki/outbound.ts` `enqueue`). The texts and the phones are
driven by one commit.

## 5. Outbound messages

Copy below is read from `convex/keiki/outbound.ts`. Each notice wraps it behind a fence line,
`FROLIC-OPS <token>`, where the token is a 16 character hash of the deployment's
`KEIKI_API_KEY` (`convex/keiki/notice.ts`). The prompt addendum carries the same token and
tells the agent that a message opening with that exact line comes from the server: skip
`get_member`, call no tool, send only the lines after the fence, word for word. A message with
the wrong token, or `FROLIC-OPS` anywhere but the first line, is someone pretending; the agent
is told to refuse it and never to show the token. Because the fence depends on a secret only the
server and the agent hold, a person typing the phrase cannot make the agent send a fake reveal
(`keiki/prompt-addendum.md`).

| Kind | Trigger | Recipients | Copy |
| --- | --- | --- | --- |
| drop | `frolics.ts`, the daily drop | every linked crew member by DM, plus every linked group chat when the flag is on | `<title> at <place>, <startsAt>.` / `<why>` / `Reply "down", "only if…", or "pass".` (group: `DM me "down", "only if…", or "pass". It stays secret unless someone else is down too.`) |
| reveal | `reveal.flip`, the moment the app flips | each going attendee by DM, plus every linked group chat when the flag is on | `It's on. You, <names>.` / `Meet at <meetingPoint> at <startsAt>. Leave at <leaveAt>.` / with a paid plan: `Hold $<amount> to lock it in. It comes back when you arrive. Want the link?` (group: `It's on: <names> at <place>, <startsAt>. Hop in?`) |
| hopIn | `reveal.flip`, when no group chat is in play, which is every reveal on the shared line | everyone in the crew who did not match and is linked | `It's on: <names> at <place>, <startsAt>. Room for one more?` |
| faded | `reveal.fade` | the people who tapped down | `This one drifted off. Nobody knows you said yes.` |
| nudge | `reveal.flip` schedules it at leave time | going attendees | `Time to head out. <meetingPoint> is <walk> min away. Meet at <startsAt>.` |
| snap | `snaps.ts`, when the snap window opens | going attendees who checked in | `Group snap. Send me one photo right now. You'll see everyone's once yours is in.` |
| collage | `onCollage`, when a collage renders | everyone who sent a snap, plus group chats when the flag is on | `Here's your group snap: <url>` (group: `Today's group snap: <url>`) |
| money | `outbound.onMoney`, requested from FROL-5 for a released hold or a no-show credit | the one linked person | `Your $<amount> is back.` or `A no-show added $<amount> to the Frolic Fund.`, each with the matching hero image when `FROLIC_HERO_BASE_URL` is set |

Rows are keyed (`drop:<frolicId>:<userId>`, `reveal:<frolicId>:<chatId>`) so a retry or a second
hook call cannot double-send. A paused link is written as `skipped`.

Delivery reads the notice response rather than trusting the status code. `deliver` parses
`results[].outcome`: `ran` and `queued` count as sent (`queued` means the notice sits in the
conversation's debounce window and runs on its next turn), `unavailable` is a retry. A transport
failure, a 5xx and a 429 retry with exponential backoff (2 s, 4 s, 8 s, capped at 60 s) up to three
attempts, then the row records `failed` with the reason. A 200 whose body carries no outcome is a retry, never a send. The retry wait is derived from the
row's attempt count rather than stored, so any later enqueue cannot send a waiting retry early, and a
row that has sat queued for six hours is failed as stale instead of delivering old news. A 400, 404
or 422, and an outcome naming a missing identity, is permanent: the row is `failed` at once with a `lost_` prefix, because a
contact who has never texted the line cannot be reached by a notice and no retry will change that.

Which plan a texter sees: `currentFrolic` prefers today's `open` frolic, then any `open` one, then
today's `on` one, then any `on` one, then today's, then the newest of any status. A weekend drop that
opens a Saturday and a Sunday plan therefore shows Saturday on Saturday. A closed plan seeded for a later day therefore cannot
shadow today's open one, and once the next plan opens it becomes the one texts describe, matching
what the phones show.

### Starting a plan from a text

A texter who says they are free can start today's plan: the `im_free` tool calls
`internal.frolics.imFreeAs({ userId, groupId, forMinutes })` through the same actor path as every
other tool (requested in handoffs/schema-requests/FROL-9.md). A friend who texts a name that already belongs to an account in the crew joins as their own person;
the phone is never bound to someone else's account, because an invite code and a first name are not
proof of identity. `im_free` is inert until `KEIKI_IM_FREE` is set on the deployment and the agent sync lists the tool, and it answers "not live yet" rather than
failing if the mutation is absent. The reply the starter gets tells the agent to describe the plan
without naming who started it, and the notice the crew receives names nobody.

## 6. Deep features, ranked for the shared line

Ranked by what the demo and the product get from each one, given that the line carries DMs only.

| # | Feature | Demo value | Build cost | Risk | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | The reveal lands in an iMessage thread | Highest. The iMessage-only friend sees "It's on" with the matched names seconds after the phones bloom, from the same scheduled reveal | Low. One hook off `reveal.flip` plus the outbox | Needs the friend to have texted first | Built and shipped on the shared line |
| 2 | Whop deposit link by text | High. The friend pays the hold from the thread without an app | Low. `pay_deposit` preflight shows the amount, then returns the link | None now that FROL-5 ships `whop/links:checkoutLink` | Built. Hold comes back on arrival, share is the plan's cost split |
| 3 | Photos into the group snap | Medium. Shows the text friend can still be in the scrapbook | Low. One route, one storage call | A photo must come by DM, since a group call carries no sender | Built through DM `submit_snap` |
| 4 | Check-in from a shared location | Medium. A friend who never opens the app still checks in | Medium. Parse a vCard or map URL, compare against the meeting point | Keiki documents no inbound pin format; the parse is best effort | Built best effort, 400 m radius |
| 5 | Per-person memory wired to Supermemory | Medium. Proves the agent knows the friend, not just the phone number | Low. One event, one read | Two memory systems on one person; ours has to stay the truth | Built. `remember` writes source `imessage`, `get_member` reads the crew taste back |
| 6 | Frolic in the crew group chat | High on a dedicated line. On the shared line, zero | Low. `link_group_chat` plus the group fans in `onDrop` and `onReveal` | Needs a dedicated `photon` or `blooio` line with `features.groupChats` on | Built, behind `KEIKI_DEDICATED_LINE`, off on the shared line |
| 7 | Whop deposit link behind Face ID | High on a dedicated line. On the shared line, zero | Low. Policy block and a preflight branch, both in place | Cards are sent only from a Keiki-bought line, in a 1:1 chat | Built, behind the same flag, off on the shared line |
| 8 | Voice call for the leave nudge | High on paper | Out of bounds | A shared line cannot forward a call, and no outbound call API exists; calls need a bought number | Not possible on this line |

Notes on the three that carry risk.

For photos, `context.phone` in a group is the chat identity, so the route cannot tell which member
sent the photo. Keiki also says contact cards and per-contact location requests do not apply to
group identities (`docs_cloud-agents.md:269-272`). The photo therefore goes through the DM, where
`context.phone` is the person.

For the deposit, the money lane is real: `pay_deposit` calls `whop/links:checkoutLink`, which
returns `kind: "hold"` for a commitment deposit and `kind: "share"` for a plan split, with the
amount and the pay page URL, or `kind: "none"` with a reason when there is nothing to pay. The
route answers a preflight with the amount and the words ("a hold that comes back when they
arrive" or "their share of the plan") and no link, so the agent states the number before it hands
over anything. With the flag off there is no approval policy: the description tells the agent to
send the link as one text and say plainly what it is. With the flag on the Vault card comes back,
`preflight: true` keeps the card out of the amount question, and the link is only returned on the
approved call (`docs_keiki-vault.md:332-337` for the fallback that runs the tool anyway).

For location, `parseSharedLocation` reads an Apple Maps `ll=` link, a `geo:` URI, or a bare
coordinate pair out of the attachment text (`convex/keiki/lib.ts`), and check-in refuses past
400 m (`CHECKIN_RADIUS_METERS`). Keiki's documented location primitive is the agent asking the
phone with `device_location` and the `location_read` grant (`docs_keiki-vault.md:469`), which is
the Vault path if the best effort misses.

## 7. Delivery timing

A notice starts a model turn, so an iMessage lands a few seconds after the event that caused it,
not in the same frame as the app. The notice response says which happened: `ran`, `queued` inside
the conversation's roughly 2 second debounce or behind a running turn, or `unavailable`
(`docs_agent-api.md:272-274`). That is acceptable for the demo because nothing is sent before
`revealAt` by design: the text lands shortly after the bloom, so the screenshot taken at that
second shows the app flipping and the thread fills in just behind it.

## 8. The demo beat

The run of show lives in `docs/demo.md` on `capy/demo-script-sponsor-sheet` (commit `4b4229d`).
The Keiki beat is t46 to t54: Maya stays on the app, Dev locks his phone, and Priya types in
iMessage. Priya has texted the line with the join code before the demo starts, which is the only
prerequisite the shared line puts on us.

At t46 the projector shows Priya's thread and the line is "Priya has never installed Frolic. She's
texting our shared line." At t54 the phones bloom and the same scheduled reveal writes her thread:
"It's on. You, Maya." with the meeting point and the leave time, within seconds of the bloom. No
other surface in the stack can put the result of a secret tap into a thread the friend never
installed anything to join.

On the seeded kayak plan (the paid plan from `docs/brief.md:330`) the next message is the deposit.
She taps the Whop link in the same thread and holds $5. That is the money beat: a payment that
starts and finishes inside Messages.

Neither beat needs a group chat or a Face ID card, so the demo holds with the flag off. The
fallback is F8, a recorded thread from rehearsal.

## 9. Setup and operations

Environment variables on the Convex deployment (`convex/keiki/env.ts`):

| Variable | Needed | Effect |
| --- | --- | --- |
| `KEIKI_API_KEY` | yes | Checked on every tool route; missing means 503, and outbound rows settle as `not_configured` |
| `KEIKI_AGENT_ID` | no | Agent the notice API targets; defaults to the built-in id in `keiki/agent.ts` |
| `KEIKI_TOOL_SIGNING_SECRET` | no | Turns on HMAC verification with a five minute window |
| `KEIKI_DEDICATED_LINE` | no | `1` or `true` turns on group chats and Vault cards. Unset is the shared line: no `link_group_chat`, no approval policy, `features.groupChats` false, no group section in the prompt |
| `FROLIC_HERO_BASE_URL` | no | Prefix for the hero images in the drop, reveal and money texts |

Sync the agent. Our sandbox organization cannot call the SDK's `/sync` endpoint, which answers
403, so `keiki/sync.ts` reads the payload AgentKit builds and applies it over REST: it PATCHes
`/api/v1/developer/config` and then creates or updates each tool.

```bash
cd keiki && bun install
KEIKI_DEDICATED_LINE= FROLIC_TOOLS_BASE_URL=<convex site url> bun run sync.ts --dry-run
KEIKI_DEDICATED_LINE= FROLIC_TOOLS_BASE_URL=<convex site url> bun run sync.ts
KEIKI_DEDICATED_LINE=1 FROLIC_TOOLS_BASE_URL=<convex site url> bun run sync.ts --dry-run
```

The `--dry-run` pass prints the payload it would send, with the system prompt replaced by its
length, and writes nothing. Run it with the flag off and on after any prompt or tool change: the
off pass must show 13 tools, no policy on `pay_deposit`, `groupChats: false`, and a prompt without
the group section; the on pass must show 14, the policy, `groupChats: true`, and the group
section.

`sync.ts` intercepts only the sync call, adds `agent_id`, and rewrites each tool into a webhook
tool with `executionType: "webhook"` and a `webhookUrl` of `<base>/keiki/tools/<name>`. The
AgentKit SDK only emits code tools (`syncFeatures` and the tool builder both hardcode code
execution, see `answers.md` section 2), and a code tool runs inside Keiki's sandbox where it
cannot carry our auth header. A webhook tool is a plain HTTPS POST that Keiki signs with
`X-Orchid-Api-Key`, which is the header `authenticate` checks, and it keeps the tool bodies in
Convex where our other tests and deploys already run.

The config PATCH has to carry `features.groupChats` explicitly in both directions: `syncFeatures`
has no `groupChats` field, and a PATCH only changes the flags it names
(`docs_cloud-agents.md:249-251`, `:740`), so syncing with the flag off turns groups off on the
agent. The agent runs `google/gemini-3.8-flash` with low reasoning, 10 steps and a 16 message
history (`keiki/agent.ts`).

`sync.ts` creates and updates tools, and never deletes one. A `link_group_chat` registered while
the flag was on therefore stays on the agent after the flag goes off, and its route answers
`needs_dedicated_line` with copy telling the person to text directly, so the stale tool is
harmless.

Talk to the agent from the Keiki MCP server (`talk_to_agent`) to test a change end to end: it
sends a message as a real contact and returns the reply plus the tool calls, which is the only
check that covers the prompt, the tool descriptions and the routes together. Use a number you
have already texted the line from, since the shared line still refuses the first send.

## 10. Open risks

Volume limits are small enough to matter for a crew of friends and large enough not to matter
today: 5,000 messages a day per line, fewer than 50 new conversations in 24 hours, 400 to 500
active users per line (`docs_imessage-best-practices.md:21-23`). A shared line splits those limits
with every other app on it, so a cold demo day should get its own line.

Every notice depends on the friend having texted first. Keiki refuses a send to anyone who has
not, with `recipient_reply_required` (`docs_channels.md:121`, `:132-134`), which makes the join
code the onboarding step and the demo's setup step.

The group identity format is still inferred, and only matters with the flag on. `identify` treats
`imsg:chat:` as a group (`convex/keiki/auth.ts`). The docs say a group's conversation is
`imsg:chat:<provider chat id>` (`docs_cloud-agents.md:269-270`) and that a notice's `phone` must
use the conversation format (`docs_agent-api.md:266-268`), but neither states that a group's
`context.phone` is that string. One live group call settles it, and it costs a bought line.

Two hooks are unwired. `onCollage` has no caller, so the collage text never goes out until the
snap lane calls it, and `onMoney` waits on FROL-5's release and no-show webhook. `onDrop`,
`onSnapWindow` and the reveal hooks all depend on another lane's function calling them, so a
change there silently turns this lane off.
