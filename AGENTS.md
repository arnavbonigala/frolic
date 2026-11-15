# Frolic

A daily in-person plan for your friend group. Each person secretly taps "I'm down"; when two or more match, it's on, and everyone's phone reveals the plan at the same instant. Native iOS (SwiftUI, iOS 26) on a Convex backend. Built for the YC Consumer Mobile Hackathon, Nov 15 2026; sponsors Capy, Revyl, Convex, Whop, Supermemory.

## Read first
- `docs/brief.md`: the product brief. Features 1 to 13, the architecture, the data model, the priority tiers and the bar for done. It is the spec.
- `design/mock/index.html`: the interactive mock of every screen (open it in Chrome; routes are hash links like `#today:waiting`, `#checkin`, `#garden`). Match it: layout, copy, colors, motion. Images in `design/mock/img/`.
- `convex/_generated/ai/guidelines.md` and `.agents/skills/convex*`: Convex rules. Follow them.

## Layout
- `convex/`: backend (schema, queries, mutations, actions, crons, HTTP routes, components)
- `ios/`: the Xcode project `Frolic.xcodeproj` with the app, widget and Live Activity targets
- `web/`: the web "I'm down" page, served from a Convex HTTP route
- `e2e/`: Revyl test flows
- `design/`: mock, images, app icon

## Commands
- Install: `npm install`
- Backend tests: `npm test` (vitest + convex-test). Every Convex function ships with tests.
- Typecheck: `npx tsc --noEmit -p convex`
- Local backend for a thread: `CONVEX_AGENT_MODE=anonymous npx convex dev --once` (never push to the shared dev deployment from a branch)
- iOS: build on Revyl and run on a cloud iPhone 17 Pro. Linux machines cannot build iOS.

## Rules
- No code comments.
- Copy: no em dashes, no exclamation marks, no "not X, but Y". Use the mock's exact words where they exist.
- Only the schema lane edits `convex/schema.ts`. Others ask the Captain for a change.
- The Xcode project uses file-system synchronized folders. Add files by creating them in the folder; never hand-edit `project.pbxproj` unless adding a target.
- Every iOS PR includes a Revyl build, a walkthrough on a cloud iPhone, and screenshots of each state it touched (loading, empty, error, success).
- Every state is designed: loading, empty, error, offline. Errors never render as empty.
- Accessibility: Dynamic Type, VoiceOver labels, 44pt targets, Reduce Motion fallbacks.
- Secrets live in environment variables only. Never print, log or commit them.
- Whop: create only new hidden Frolic products and plans, plus the visible Frolic Drops products that `drops:seed` creates. Never modify or delete existing products in the Whop company.
- Put cloud phones to sleep when you are done with them.

## Reviews
- Flag any Convex function without an argument validator or tests.
- Flag UI that drifts from the mock's colors, type or copy.
- Flag any reveal path where one phone can learn about a match before `revealAt`.

## Convex
When working on Convex code, always read `convex/_generated/ai/guidelines.md` first; its rules override what you learned about Convex from training data.
