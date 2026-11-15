# Whop in Frolic: "I'm down" becomes a promise

Status: proposal (FROL-5). Nothing here is built yet. Every Whop call below is checked against Whop's current docs and OpenAPI spec (`https://api.whop.com/api/v1/openapi.json`, read Nov 15 2026) and a read-only probe of our company.

Frolic fixes plans that die and friends who flake. The matcher fixes the first half. Whop fixes the second: the moment a frolic reveals, each matched friend backs their yes with a small hold on their card. Walk into the spot and the hold disappears. Don't show, and it becomes the crew's Frolic Fund, which pays for the next one. When a plan costs money, the same sheet splits the bill across exactly the people going, with the fund taken off first.

One system, three faces:

1. **Commitment hold** after the reveal, released by arrival.
2. **Frolic Fund**, fed by no-shows, spent on the next frolic.
3. **Paid plans**, split across the matched set, fund applied first.

Every money state reaches Convex through a signed Whop webhook.

## 1. What our Whop company can do today

Read-only probe with `WHOP_API_KEY`:

| Fact | Consequence |
| - | - |
| The key is a **production** key for `biz_S7TqTe7uIW8xhO` ("tinkly", created today). It returns 401 on `sandbox-api.whop.com`. | Every call with this key moves real money. Sandbox testing needs a second key from sandbox.whop.com. |
| `accept_card_payments: active` | Card and Apple Pay charges and holds work now. |
| `transfer: inactive`, `standard_payout: inactive`, `required_actions: verify_identity` | We cannot move money between Whop balances, send claim links, or pay out until Arnav completes identity verification in the Whop dashboard (Balance, "Verify now"). |
| No products, variants, or webhooks exist. | Nothing to protect. We create only new hidden "Frolic" products. |
| Our fee table shows a 2.7% processing rate; Whop's iOS docs quote 2.7% + $0.30. | We credit the fund with the payment's `amount_after_fees`, never the gross, so the ledger can't drift above the real balance. Whether a void or a refund returns the fee is undocumented, so we check it in the sandbox. |

What works without the $99 Apple account: everything web-based (Whop Elements on our own page, Whop-hosted checkout links, webhooks, the REST API). What doesn't: the native `WhopCheckout` Apple Pay surfaces (`Checkout.ApplePayButton`, `presentApplePay`). They use PassKit in-app payments, which need an Apple Pay merchant ID and the In-App Payments entitlement, and both need a paid membership. The native SDK also has no sandbox setting and no way to attach metadata such as a frolic id to a purchase. So the app opens our hosted pay page in an in-app Safari sheet (`SFSafariViewController`), where Apple Pay works through Whop Elements once our domain is registered.

Sandbox, per Whop's docs: separate accounts and keys at sandbox.whop.com, the same API at `https://sandbox-api.whop.com/api/v1`, and test cards (`4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` declines, `5385 3083 6013 5181` forces 3D Secure with `Checkout1!`). The sandbox has **no Apple Pay and no payouts**.

## 2. The Whop primitives we use

| Need | Whop primitive (current API) |
| - | - |
| A hold that charges nobody who shows up | `POST /payments` with `capture: false` puts an authorization hold on the card (status `authorized`, substatus `requires_capture`). `POST /payments/{id}/void` releases it, and `POST /payments/{id}/capture` collects it in full. A hold must be captured within five days or it lapses. Partial capture is not supported. |
| Collecting the card | Whop Payment Elements on our page: a `Payments` handle with `accountId`, `currency`, and `amount` (minor units), then `PaymentElement` and `BrandingElement`. Elements take `amount` in minor units (300 for $3), while every REST price (`initial_price`, `partial_amount`) is in dollars (3.00), then `createConfirmationToken()`, which returns a single-use `ctok_` token. Our server passes it to `POST /payments`. `handleNextAction(client_secret)` runs 3D Secure when a payment needs it. |
| Apple Pay on our page | Serve `/.well-known/apple-developer-merchantid-domain-association` (Whop's file) from our Convex site, then register the domain with `POST /domains` (with `apple_pay: {}`) and poll `POST /domains/{id}/check` until it is ready. (`/payment_method_domains` is deprecated.) Needs the `domain:manage` scope. We test this on a real iPhone in `SFSafariViewController` before building on it. |
| Charging a share of the bill | `POST /payments` with an inline `variant` (`initial_price` = the share in dollars, `currency: "usd"`, `billing_type: one_time`, `product_id` of a hidden Frolic product). Captured immediately. A paid variant charges at least $1.00. |
| Giving money back | `POST /payments/{id}/refund` (full, or `partial_amount`). |
| Safe retries | The `Idempotency-Key` header on `POST /payments`, `/capture`, `/void`, and `/refund`. Our key is `<paymentRowId>:<operation>`. |
| Catching what a webhook missed | `GET /payments/{id}` returns `status`, `substatus`, `capture_expires_at`, `amount_after_fees`, and `refunded_amount`. |
| Knowing what happened | Webhooks follow Standard Webhooks: HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{body}` with the `ws_` secret, a 5-minute timestamp tolerance, at-least-once delivery, retries for about 3 days, and no ordering guarantee. Events we handle: `payment.authorized`, `payment.succeeded`, `payment.failed`, `payment.canceled`, `refund.created`, `refund.updated`, `dispute.created`. (`payment.requires_action` fires only for off-session charges, so on-page 3D Secure never emits it; the page runs it with `handleNextAction`.) Later, `transfer.completed` and `transfer.failed`. |
| A link a friend can pay from outside the app | Our own hosted page at `https://<convex-site>/pay/<token>`, the same page the app opens. Whop-hosted checkout links from `POST /checkout_configurations` carry `metadata` but can't place a hold, so we keep them only as a fallback. |
| A real per-group balance | **No lightweight primitive exists.** The closest real things are a **subaccount** per group (`POST /accounts` with `external_id: "group:<id>"`) that receives `POST /transfers` (`type: "balance"`, with `idempotence_key`) and whose balance is readable at `GET /ledger_accounts/{biz_id}`, and a **claim link** (`POST /transfers` with `type: "claim_link"`), which pays whoever fronted the bill. Both need `transfer` to be active, which today means Arnav's identity verification. The destination may also need onboarding before it can receive. |

## 3. The design

### 3.1 Products and variants (created once by an internal action, all hidden)

- Product **"Frolic Commitment"**, `visibility: hidden`, with one variant **"Frolic hold"**: `one_time`, `initial_price` = the hold amount (proposed **$3**), `visibility: hidden`.
- Product **"Frolic Plans"**, `visibility: hidden`. No fixed variants. Each share is charged with an inline `variant` under this `product_id`, `visibility: hidden`, with a title like "Kayaks at the Marina, your share".

IDs go into Convex env vars (`WHOP_ACCOUNT_ID`, `WHOP_HOLD_VARIANT_ID`, `WHOP_PLANS_PRODUCT_ID`, `WHOP_WEBHOOK_SECRET`, `WHOP_ENV=sandbox|production`). The API key stays on the server. No Whop key ships in the app.

### 3.2 One pay page for the app, the web page, and iMessage

`GET /pay/<token>` is a Convex HTTP route that serves one small HTML page in the mock's style. It shows the frolic's title and time, the amount, and Whop's `PaymentElement` with Apple Pay. It shows no names, because a forwarded link must not hand a stranger the roster. The token is a random 128-bit id stored on the payment row. It names exactly one user and one frolic, and it expires at the frolic's `startsAt`.

- **iOS app:** the "It's on" card's button calls `whop.pay.link` and opens the URL in `SFSafariViewController`. The live `myPayment` query flips the card to "You're in" when the webhook lands. What the browser returns means nothing.
- **Web "I'm down" page:** after the page flips to "It's on", it links to the same `/pay/<token>`.
- **iMessage (FROL-9, Keiki):** calls `internal.whop.links.checkoutLink({ userId, frolicId })` and texts the URL. A Keiki Face ID approval can gate the send, and nothing on our side changes. FROL-9 builds no payment code.

On "Pay", the page calls `createConfirmationToken()` and posts `{ token, ctok }` to `POST /pay/<token>/confirm`. That route runs an action. It moves the row to `authorizing` (refusing if it's already past `open`), then calls `POST /payments` with `Idempotency-Key: <rowId>:create`, so one row never creates two Whop payments, with `account_id`, the variant, `confirmation_token`, `capture: false` for a hold (true for a share), `return_url` = the pay page, and `metadata: { frolicId, userId, kind, paymentRowId }`. It stores the `pay_` id and returns `{ status, client_secret }`, and the page runs `handleNextAction` when needed.

### 3.3 The interface FROL-9 and the app call

```ts
// convex/whop/links.ts
export const checkoutLink = internalMutation({
  args: { userId: v.id("users"), frolicId: v.id("frolics") },
  returns: v.union(
    v.object({ kind: v.union(v.literal("hold"), v.literal("share")), url: v.string(), amountCents: v.number(), expiresAt: v.number() }),
    v.object({ kind: v.literal("none"), reason: v.union(v.literal("not_revealed"), v.literal("not_member"), v.literal("already_paid"), v.literal("covered"), v.literal("closed")) }),
  ),
  handler: ...
});
// convex/whop/pay.ts: public mutation link (app), public query myPayment (app), public query fund (Crew tab)
```

The function refuses with `not_revealed` unless `frolic.status === "on"`, `now >= frolic.revealAt`, and the user is in `frolic.members`. Calling it twice returns the same row and URL.

### 3.4 Data (schema request to the schema lane)

```ts
whopPayments: defineTable({
  frolicId: v.id("frolics"), groupId: v.id("groups"), userId: v.id("users"),
  kind: v.union(v.literal("hold"), v.literal("share")),
  amountCents: v.number(),
  token: v.string(),
  state: v.union(
    v.literal("open"), v.literal("authorizing"), v.literal("held"), v.literal("paid"),
    v.literal("releasing"), v.literal("released"), v.literal("captured"), v.literal("refunding"), v.literal("refunded"),
    v.literal("failed"), v.literal("needs_attention"),
  ),
  whopPaymentId: v.optional(v.string()),
  whopRefundId: v.optional(v.string()),
  lastError: v.optional(v.string()),
  updatedAt: v.number(),
}).index("by_frolic_user", ["frolicId", "userId"]).index("by_token", ["token"]).index("by_whop_payment", ["whopPaymentId"]),
whopEvents: defineTable({ webhookId: v.string(), type: v.string(), receivedAt: v.number() }).index("by_webhook_id", ["webhookId"]),
fundEntries: defineTable({
  groupId: v.id("groups"), amountCents: v.number(),
  reason: v.union(v.literal("no_show"), v.literal("applied"), v.literal("reversed")),
  frolicId: v.id("frolics"), whopPaymentId: v.optional(v.string()), at: v.number(),
}).index("by_group", ["groupId"]),
```

On `frolics` we need `costCents` (per person, from the place) and `fundAppliedCents`. Hooks into other lanes: the reveal job calls `internal.whop.reveal.open(frolicId)`, check-in calls `internal.whop.checkin.arrived({ frolicId, userId })`, and bail calls `internal.whop.checkin.bailed`. The `whopPayments` rows of a frolic are readable only by that frolic's members, and only after `revealAt`.

### 3.5 Hold state machine (free plans)

```
open ──pay page, POST /payments capture:false──► authorizing
authorizing ──payment.authorized──► held
authorizing ──payment.failed──► failed ──friend retries──► open
held ──arrived, called off, or early bail: POST /void, then payment.canceled──► released
held ──void rejected: POST /refund──► refunding ──refund.updated succeeded──► refunded
refunding ──refund.updated failed──► needs_attention (Captain alert; card says "We're sorting out your $3")
held ──startsAt + 45 min, not checked in: POST /capture, then payment.succeeded──► captured ──► fundEntries +amount_after_fees (no_show)
held ──capture rejected, or re-read shows canceled or past capture_expires_at──► released (nobody is charged)
captured ──late arrival before the frolic is done: POST /refund──► refunding, and the no_show entry is reversed
captured ──dispute.created──► needs_attention, and the no_show entry is reversed
authorizing ──pay page abandoned 30 min, re-read shows no payment or a failed one──► open
```

Rules:

- **Whop is the source of truth.** Our own API responses move a row only to `authorizing` or `refunding`. `held`, `paid`, `released`, `captured`, and `refunded` are set only from Whop's own state: a verified webhook, followed by a re-read of `GET /payments/{id}` because events can arrive out of order.
- **A reconciler catches lost webhooks.** A scheduled sweep every 2 minutes re-reads every row in `authorizing`, `held`, or `refunding` older than 2 minutes and applies the same transition the webhook would have. It also releases holds whose `capture_expires_at` has passed, retries a stuck refund three times, and then marks it `needs_attention`. Webhook loss can delay a state by minutes, but it can't wedge one.
- **Void and capture can't cross.** The no-show sweep re-reads each payment and captures only if it is still `authorized`/`requires_capture` and the friend has no check-in. A void that returned "still authorized" leaves a `releasing` mark on the row that the sweep skips.
- **Failures land on the friend's side.** If our backend dies, an uncaptured hold lapses on its own, so nobody is charged by mistake. We never set `auto_capture_after_minutes`.
- **Friends who don't confirm.** A matched friend who hasn't placed the hold stays in the frolic, and their card shows "Hold $3 to lock it in" until `startsAt`. Whether to drop them to the hop-in pool after 10 minutes is decision 4.
- **Bail.** "Can't make it" 60 or more minutes before `startsAt` voids the hold. Under 60 minutes it counts as a no-show (decision 3).
- **Hop-ins** get a row the moment they join. Their join already happened in the open, after the reveal.

### 3.6 Paid plans (shares) and the fund

When the reveal job opens a frolic with `costCents > 0`:

1. `total = costCents × members.length`.
2. `applied = min(fundBalance(group), total)` is written as a negative `fundEntries` row (`reason: "applied"`) in the same transaction, so two frolics can't spend the same dollars. `reveal.open` is idempotent per frolic: if the frolic already has payment rows it does nothing, so a retried job can't spend the fund twice or reissue links already texted.
3. `due = total - applied`. Each member's share is `floor(due / n)`, and the first `due mod n` members by join order pay one cent more. A share under $1.00 is taken from the fund too when the fund can cover it, and otherwise rounds up to $1.00. A member whose share is 0 gets no payment row, and their card says "The Frolic Fund covered you".
4. Each share is a captured `POST /payments` (`kind: "share"`, `paid` on `payment.succeeded`). Paying the share is the commitment, so paid plans have no separate hold. If the frolic is called off before `startsAt`, every share is refunded and the `applied` entry is reversed. A hop-in pays the plain per-person price (`costCents`), and shares already paid don't change. A friend who bails after paying keeps the plan paid for: there's no refund unless the whole frolic is called off (decision 7). A share that fails stays unpaid with a retry button, and the others are unaffected, because each share is its own payment. Frolic absorbs the gap.

Copy follows the mock: "Chip in for kayaks", "Your share", "Already paid", "If it gets called off, you get it back automatically.", "You're in. Paid $8."

**Where the fund's money really is.** Captured holds land in Frolic's Whop balance. The fund is a Convex ledger (`fundEntries`), and each credit names the `pay_` id that funded it, so every dollar on the Crew tab traces back to a real Whop payment. Spending the fund means the group pays less through Whop. That is honest and works today. It doesn't pay the venue, though: at the counter people still pay the shop, and Frolic holds the shares. Making that a real payment to the venue needs transfers (section 5, B and C).

### 3.7 Webhook route

`POST /whop/webhook`, registered by `convex/whop/routes.ts`:

1. Read the raw body. Verify `webhook-signature` with Web Crypto HMAC-SHA256, keyed with the full `ws_…` secret string exactly as Whop gives it (Whop's guide: don't strip the prefix and don't base64-decode it). We pin a fixture from a real sandbox delivery in the tests, so a wrong key derivation fails a test before it fails in production. Reject a timestamp more than 5 minutes off. A bad signature returns 401.
2. Dedupe on `webhook-id` through `whopEvents` (insert if absent, in one mutation). A duplicate returns 200.
3. Find the row by `metadata.paymentRowId`, falling back to `by_whop_payment`. An unknown payment is logged and returns 200.
4. Apply the transition only if it's legal from the current state (for example, `payment.authorized` after `released` is ignored). Return 200 within 5 seconds, and run any follow-up API call in a scheduled action.

Tests (vitest + convex-test, written first): good and bad signatures, a stale timestamp, a duplicate delivery, `authorized` arriving after `canceled`, every legal and illegal transition, the fund math (rounding, the fund covering everything, the fund covering part, two frolics racing for the same fund), `checkoutLink` refusing before `revealAt` and for non-members, the no-show sweep capturing only held rows whose friend didn't arrive, the reconciler applying a missed webhook, and a lapsed hold releasing.

### 3.8 Secrecy

A hold can't leak a secret yes, because nothing about money exists before the reveal:

- No Whop call, no `whopPayments` row, and no pay link exists for a frolic until the reveal job runs. That job is scheduled with `runAt(revealAt)`, never called from the match mutation, which sets `revealAt` 1.5 seconds ahead. Taps never touch Whop.
- `checkoutLink` and `link` refuse before `revealAt`. The token is random and never derived from ids.
- `myPayment` returns only the caller's row. The "Already paid" names come from a members-only query after `revealAt`.
- Whop metadata holds ids only, and receipts go only to the payer.
- The fund total is visible to the crew. A credit names the no-show ("Jordan's hold from the Marina") only once `frolic.status` is `done`, and decision 5 can make it anonymous.

### 3.9 Testing without moving real money

1. **Unit:** convex-test with signed fixture webhooks that the test signs with a fixed `ws_` secret.
2. **Sandbox end to end:** Arnav creates a sandbox company and key. We set `WHOP_ENV=sandbox`, the sandbox key, and the account id on a local backend exposed as a preview URL, and register a sandbox webhook to it. Then we pay on the pay page with `4242`, decline with `0002`, run 3D Secure with `5385…`, and check hold, void, capture, refund, and dedupe. Apple Pay can't be tested there.
3. **Production demo:** $1 to $3 holds on real cards, voided at check-in, so no money moves for anyone who shows up. The one captured no-show is a real $3 that Arnav can refund after the demo.

## 4. What the judges see

The one moment: **Dev walks into the geofence. His phone says "You made it. Your $3 is back.", and on the projected Whop dashboard his payment flips from Authorized to Voided in the same beat. Jordan never shows, so his hold is captured and the Crew tab's Frolic Fund ticks from $0 to $3, "toward the next one".** Money that commits a friend and is released by walking into a real place is Whop's money logic running on Frolic's physical-world signal. No other sponsor in the stack touches money, and a generic pay button can't express it.

Script beat for the 90 seconds: reveal, then "Hold $3 to lock it in" with Apple Pay, then arrival releases it, then the no-show feeds the fund, then tomorrow's kayaks show "Frolic Fund covers $3, your share $7".

## 5. Beyond the baseline, ranked

| # | Idea | Demo value | Build | Risk | Call |
| - | - | - | - | - | - |
| A | **Commitment hold plus fund ledger plus paid-plan split** (sections 3.1 to 3.9) | High: the Tier 1 story | About 6 h for backend and pay page, plus about 1.5 h for the iOS sheet and its states | Medium: holds through Elements are unproven until the sandbox run; Apple Pay domain registration | **Build first** |
| B | **Real per-group Whop balance:** a subaccount per group, `POST /transfers` on each capture, and the Crew tab reads `GET /ledger_accounts/{id}` | High: the fund is a real Whop balance, beyond our own ledger | About 2 h | High: `transfer` stays inactive until Arnav's identity verification; the destination may need onboarding; the sandbox has no payouts | Only if Arnav verifies by about 1pm |
| C | **The fund pays whoever fronted the bill:** Maya buys the ice cream, and the fund sends her a Whop **claim link** (`type: "claim_link"`) in the group or iMessage thread | Very high: money visibly moves between friends | About 1.5 h on top of B | High: the same verification gate, and the claimer needs a Whop account | After B |
| D | **Saved card, zero-tap holds:** save the card once at onboarding with a setup intent, then each reveal places the hold off-session under consent given once | High polish: the reveal needs no sheet | About 2 h | Medium: off-session holds can hit `payment.requires_action`; consent copy | Stretch |
| E | **Local spots sell Frolic experiences:** one Berkeley shop as a subaccount, with shares charged as direct charges on it with `application_fee_amount` | Medium-high: the business model on stage | About 2 h | Medium: a subaccount for a real shop, and verification for its payouts | "What's next" slide unless B lands |
| F | Whop Wallet Elements (Swift) showing the fund in the Crew tab | Low to medium | About 2 h | High: needs OAuth and a subaccount | Skip |

Recommendation for 6pm: **A only, done properly**, and B if Arnav finishes identity verification early. C, D, and E go on the "what's next" slide.

## 6. Decisions for Arnav

1. **Sandbox or production for the demo.** Production gives real Apple Pay and real holds voided at check-in, with one real $3 captured. Sandbox is risk-free but card-only, with no Apple Pay. Either way we need a sandbox key for testing (sandbox.whop.com, about 2 minutes).
2. **Identity verification on Whop** today (Balance, "Verify now"). It unlocks transfers, which B and C need.
3. **Hold amount and the no-show rule:** $3 proposed. Is "Can't make it" within 60 minutes of the start a no-show?
4. **Friends who don't confirm:** stay in, or drop to the hop-in pool after 10 minutes without a hold?
5. **Fund credit wording:** name the no-show ("Jordan's $3") or keep it anonymous ("A missed hold")?
6. **Copy and design for surfaces the mock doesn't have:** the hold sheet, the "Your $3 is back" moment, the Crew tab fund, and the Garden's "paid for by the fund" line. Proposed: "Hold $3 to lock it in. You get it back the moment you arrive."
7. **No separate hold on paid plans:** paying the share is the commitment, and a friend who bails after paying isn't refunded unless the frolic is called off. Agree?
8. **The brief says native WhopCheckout and budgets chip-in at one hour (4 to 5pm).** This spec swaps the native SDK for a hosted page in an in-app Safari sheet, because the native Apple Pay button needs the paid Apple account, has no sandbox, and can't tag a payment with a frolic. That makes Whop a roughly 7.5 hour Tier 1 build instead of a one-hour add-on. Confirm the swap and the time.
