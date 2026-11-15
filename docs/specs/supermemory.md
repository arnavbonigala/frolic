# Supermemory memory layer

Every person and every group gets a private Supermemory namespace (the v5 name for a container tag). Personal facts stay personal. The group namespace learns only what the whole crew already saw.

## What the docs give us (read 2026-11-15, API v5)

- Namespaces: `/ns/{namespace}/...`, one namespace per request, a document lives in exactly one. Isolation is the privacy boundary.
- Add: `POST /ns/{ns}/document` with `content`, a caller `id` (repeat id appends or diffs, so it is our idempotency key), `metadata`, `date`, `dreaming: "instant"` (memories searchable at once; default "dynamic" takes minutes).
- Search: `POST /ns/{ns}/search`, `searchMode` memories|chunks|hybrid, typed `filter` (and/or, eq, gte, arrayContains), `include.related` returns update, extend and derive edges.
- Profile: `POST /ns/{ns}/profile` returns static, dynamic and per-bucket memories. Buckets are custom topical categories set with `PUT /ns/{ns}/profile/buckets`.
- Namespace settings: `PATCH /ns/{ns}` with `supportingContext` steers what extraction pays attention to.
- Graph: new facts update, extend or derive from old ones; `isLatest` keeps retrieval on current truth. Contradicting memories supersede each other, which is how a taste changes.
- Forgetting: exact (`DELETE /ns/{ns}/memories`), semantic with dryRun, and `DELETE /ns/{ns}` for a whole namespace.
- Memory graph: `@supermemory/memory-graph` React component renders documents and memories as a network (web only).

## Advanced capabilities we use

1. Per-namespace supportingContext, so the group namespace extracts tastes, places and price feel, and the personal one extracts limits and preferences.
2. Profile buckets on the group (likes, avoids, vibe, budget, rhythm) and on the person (limits, only_if). The taste card reads the buckets directly.
3. Graph updates and derives: a later loved night supersedes an earlier skip of the same tag; "golden-hour chasers" is a derived memory, not a stored string. Search with include.related gives the chain behind a why line.
4. Typed metadata filters (kind, tag, placeId, day) so a why line only cites check-in, snap and night memories, never skips or taps.
5. Stable document ids per event, so retries never duplicate and a repeated event is a no-op.
6. Real deletion: `DELETE /ns/{ns}` on account deletion.

Not built, in the report: memory graph visual on a web page, memory review of inferred memories, semantic forgetMatching for a "forget this" button.

## Containers

- Person: `frolic_p_<userId>`. Group: `frolic_g_<groupId>`.
- Created lazily on first write; settings and buckets applied once (flag on the event pipeline, idempotent PUT/PATCH).

## Events and who sees them

| Event | Personal | Group |
| - | - | - |
| tap (down, only if) | yes, with group context | never |
| skip, not today | yes | never, only as a day-close aggregate counter (below) |
| plan shown | no | yes (everyone saw it) |
| reveal (outcome, place, tags, size) | each member | yes, at or after revealAt |
| check-in | yes | yes, after reveal |
| snap caption | yes | yes, after reveal |
| limits (budget, no car, vegetarian) | yes | never |

The mapping lives in one pure function (`convex/memory/mapping.ts`), keyed by event kind, which returns the namespace and text. Reveal, check-in and snap events must carry a `revealAt` (recordEvent refuses them otherwise) and the flusher holds the whole event until then; liked-tag counters are bumped only when the reveal event has been sent. Tests assert no group write for tap, skip, only if and limits.

Skips in aggregate: skips are personal. `closeDay(group, day)` runs after the day ends, counts a tag as skipped for the group once if the plan was shown, nobody revealed, and at least one skip was recorded. The counter has no person ids. Counter (Convex table, since Supermemory is not an aggregate store) drives suppression; a one-line group memory ("The crew passed on boba 2 times") goes to Supermemory so the taste profile reflects it.

## Entry points (stable, used by the Keiki lane too)

`internal.memory.events.recordEvent` (accepts `source: "app" | "web" | "notification" | "imessage"`), `internal.memory.read.getMemoryContext`, `internal.memory.read.whyThis`, `internal.memory.read.tasteProfile`, `internal.memory.stats.closeDay`, `internal.memory.account.deleteAccountMemory`, `internal.memory.ingest.flushDue`.

## Ingest

A namespace only exists after its first write (PATCH and PUT on a new namespace return 404), so the first write is a tiny superrag document `frolic_init` carrying the namespace context, followed by the supportingContext and bucket calls.

`recordEvent` (internal mutation) inserts a `memoryEvents` row keyed by `eventKey` (second insert is a no-op) and schedules `flushEvent`. `flushEvent` (internal action) claims the row, calls Supermemory with the eventKey as document id, and on failure reschedules with exponential backoff, up to 6 attempts, then marks failed. The client also retries 429 and 5xx twice inline.

## Read path

`getMemoryContext(groupId, day)` returns `{ likedTags, skipped: [{tag, count}], suppressed, pastNights }`. It is cached per group per day in `memoryContextCache` (a second call is one DB read; invalidated when the day closes or a reveal lands). Liked tags and skip counts come from Convex counters (exact); past nights come from one Supermemory search filtered to night and check-in memories. `whyThis(groupId, tags)` runs one search with include.related and returns the best real memory to quote with its id. Plan lane interface (`convex/plans/memoryContext.ts`) was not on a branch, so the same shape is defined in `convex/memory/context.ts`.

## Taste profile

`tasteProfile(groupId)` returns the group profile buckets, top liked tags and a deterministic headline ("Sunset Crew" style naming is left to the caller; the headline here is "golden-hour chasers, under $10" built from bucket and counter data).

## Deletion

`deleteAccountMemory(userId)` deletes `frolic_p_<userId>` and clears that user's event rows. Group namespaces hold no personal facts, so they stay.

## Proof

Convex-test with the HTTP client mocked for every function; privacy, retry and idempotency tests; one live script (`convex/memory/live.test.ts`, runs with SUPERMEMORY_LIVE=1) that uses a throwaway namespace pair, skips boba twice, shows it suppressed, reads a real why-this memory, and deletes the namespaces.
