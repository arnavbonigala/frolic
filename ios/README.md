# Frolic iOS

SwiftUI app for iOS 26 with a WidgetKit extension that also hosts the Live Activity. Everything is in `Frolic.xcodeproj`, which uses file-system synchronized folders: create a file in the right folder and it is in the target. Never hand-edit `project.pbxproj` unless you are adding a target.

## Layout

| Folder | Target | What goes here |
| - | - | - |
| `Frolic/App/` | app | `FrolicApp`, `RootView` (the tab bar), `AppRouter` (tab selection, deep links), `PhasedContent`, `SampleData` |
| `Frolic/Today/` | app | Today tab, every phase (open, waiting, on, faded, done, solo) |
| `Frolic/Crew/` | app | Crew tab, friend and invite sheets |
| `Frolic/Garden/` | app | Garden tab, memory detail, story card |
| `Frolic/You/` | app | You tab, settings |
| `Frolic/Onboarding/` | app | join, name, taste, reading, calendar |
| `Frolic/CheckIn/` | app | on my way, check-in, group snap, collage |
| `Frolic/LockScreen/` | app | app side of the Live Activity (`LiveActivityController`), local notifications |
| `Frolic/Convex/` | app | `FrolicBackend` (the ConvexMobile client), `ConvexConfig`, `ConnectivityMonitor` |
| `Frolic/Gallery/` | app, debug only | the component gallery |
| `Shared/DesignSystem/` | app and widgets | colors, type, flowers, buttons, chips, seed packet, cards, state placeholders |
| `Shared/LiveActivity/` | app and widgets | `FrolicActivityAttributes` and the lock screen view |
| `Shared/AppGroup.swift` | app and widgets | the App Group (`group.com.frolic.app`) and its keys |
| `FrolicWidgets/` | widgets | the widget bundle, Today widget, Live Activity configuration |
| `Config/` | none | Info.plist fragments and entitlements |

Stay in your folder. If you need a design-system change, add to `Shared/DesignSystem/` without changing existing signatures, or ask the Captain.

## Design system

Match `design/mock/index.html`. Use the tokens, never raw hex:

- `FrolicColor` for ground and text (ink, cream, sky, chip, sun, free), `FlowerColor` for the six friend colors (pink, cobalt, moss, marigold, tomato, lilac), each with `petal` and `deep`. `SkyBackground()` is the sky-to-cream ground.
- `.frolicFont(.largeTitle)` and friends: SF Pro Rounded heavy for big words, SF Pro for the rest. All styles scale with Dynamic Type.
- `FlowerView(state: .bloom | .folded | .bud, person:)`: face in a flower. Sways, the bud breathes, Reduce Motion turns both off and swaps the bloom-in for a fade. VoiceOver reads "Maya, free till 8" from `status`.
- `.buttonStyle(.frolicPrimary | .frolicSecondary | .frolicSecondaryWide | .frolicText)`, `CircleIconButton`, `FrolicSegmented`.
- `FrolicChip`, `ChipRow`, `StatusPill`, `HushNote`, `SeedPacket`, `WhyThis`, `FrolicCard`, `FrolicGroup` with `FrolicCell`, `SectionHeader`, `ScreenTitle`, `Wordmark`.
- `PhasePlaceholder` renders the loading, empty, error and offline states. Errors never render as empty.

Every tab screen holds a `ScreenPhase` and renders through `PhasedContent`; `router.resolve(phase, isOnline:)` turns it into offline when the network drops. Replace the `...ReadyPreview` view and the `.task` in your tab with real subscriptions. The previews use `SampleData` (the mock's Sunset Crew); do not ship sample data as real data.

The app is light only (`UIUserInterfaceStyle = Light`): Frolic is a daytime app.

## Convex

`FrolicBackend` is in the environment. Use `backend.client` (a `ConvexClient` from ConvexMobile 0.8) or `try backend.requireClient()`:

    let plan = try backend.requireClient()
        .subscribe(to: "plans:today", yielding: Plan?.self)
        .values

The deployment URL resolves in this order:

1. `FROLIC_CONVEX_URL` launch environment variable (Revyl `--launch-env`, or the Xcode scheme). `FROLIC_CONVEX_SITE_URL` does the same for HTTP routes; otherwise the site URL is derived from `.convex.cloud`.
2. The `CONVEX_URL` build setting, written into Info.plist as `ConvexDeploymentURL`. It defaults to `$(SHARED_CONVEX_URL)`, so `SHARED_CONVEX_URL=... xcodebuild ...` or `xcodebuild ... CONVEX_URL=https://...` sets it. Nothing is committed.

With neither set, every tab shows its error state ("Frolic isn't connected to a server yet."). Branch builds point at their own anonymous backend, never at the shared dev deployment.

## Build

Linux machines cannot build iOS. Build on Revyl with `tools.mobile.build`, app name `frolic-ios` (the e2e flows use it), source path `ios`, output `build/Build/Products/Debug-iphonesimulator/Frolic.app`, command:

    xcodebuild -project Frolic.xcodeproj -scheme Frolic -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build ARCHS=arm64 CONVEX_URL=<your deployment> build

Then install on a cloud iPhone with `tools.capy.phone`. Claim a phone in `handoffs/phones.md` first and put it to sleep right after.

On a Mac: open `Frolic.xcodeproj`, pick the Frolic scheme and a simulator, and set `FROLIC_CONVEX_URL` in the scheme's environment variables. No paid Apple account is needed: no push, no Sign in with Apple.

## Accessibility identifiers

The Revyl flows ground on the accessibility tree. Every interactive element and every state headline gets the identifier listed in `handoffs/e2e-identifiers.md` in the Captain drive (mirrored at `e2e/identifiers.md`), with the mock's exact copy as its visible label. Convention: `<screen>.<element>`, lowercase, dots between levels, no values in ids. Already wired here: `app.root`, `state.loading`, `state.empty`, `state.error`, `state.offline` (on every `PhasePlaceholder`), `<tab>.screen`, `crew.title`, `garden.title`, `you.title`, `liveActivity.root`, and the ids on the ready previews. Put `.accessibilityElement(children: .contain)` before an identifier on a container so it does not swallow its children.

## Deep links

- `frolic://today`, `frolic://crew`, `frolic://garden`, `frolic://you` select a tab in every build.
- Debug and `E2E` builds only (`#if DEBUG || E2E`): `frolic://gallery` opens the component gallery, and `frolic://e2e/<route>` takes the mock's hash route, for example `frolic://e2e/today:on`, `frolic://e2e/memory/2`, `frolic://e2e/today?solo=1`. `AppRouter` parses it into `router.e2eRoute` (`screen`, `state`, `argument`, `query`) and selects the tab. Your screen reads `router.e2eRoute` and seeds its own deterministic state for it. `?phase=loading|empty|error|offline|ready` forces the placeholder state on every tab. Release builds ignore both, so no deep link can reach another user's data.

## Component gallery

In a debug build, You → Component gallery, or open `frolic://gallery`. It shows every design-system piece and can start and end a sample Live Activity.

## Pull requests

Every iOS PR includes a green Revyl build, a walkthrough on a cloud iPhone, and screenshots of each state it touches (loading, empty, error, offline, success).
