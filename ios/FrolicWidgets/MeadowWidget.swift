import SwiftUI
import WidgetKit

enum MeadowContent: Equatable {
    case signedOut
    case loading
    case fresh(MeadowSnapshot)
    case stale(MeadowSnapshot)
    case failure(FrolicAPIError)
}

struct MeadowEntry: TimelineEntry {
    var date: Date
    var content: MeadowContent
}

struct MeadowProvider: TimelineProvider {
    func placeholder(in context: Context) -> MeadowEntry {
        MeadowEntry(date: .now, content: .loading)
    }

    func getSnapshot(in context: Context, completion: @escaping (MeadowEntry) -> Void) {
        if context.isPreview {
            completion(MeadowEntry(date: .now, content: .fresh(MeadowSamples.snapshot("free") ?? MeadowSamples.free)))
            return
        }
        Task { completion(await entry()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MeadowEntry>) -> Void) {
        Task {
            let entry = await entry()
            let minutes: Double = switch entry.content {
            case .fresh: 15
            case .signedOut: 30
            default: 5
            }
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(minutes * 60))))
        }
    }

    private func entry(now: Date = .now) async -> MeadowEntry {
        #if DEBUG || E2E
        if let state = LockScreenStore.e2eMeadowState, let content = MeadowSamples.content(state) {
            return MeadowEntry(date: now, content: content)
        }
        #endif
        guard SharedSession.credentials != nil else { return MeadowEntry(date: now, content: .signedOut) }
        do {
            let snapshot = try await MeadowSnapshot.fetch(now: now)
            MeadowSnapshot.cached = snapshot
            await LockScreenStore.cachePortraits(snapshot.freeNow)
            return MeadowEntry(date: now, content: .fresh(snapshot))
        } catch {
            let failure = error as? FrolicAPIError ?? .unreadable
            if failure == .signedOut { return MeadowEntry(date: now, content: .signedOut) }
            if let cached = MeadowSnapshot.cached { return MeadowEntry(date: now, content: .stale(cached)) }
            return MeadowEntry(date: now, content: .failure(failure))
        }
    }
}

struct MeadowWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: MeadowSnapshot.widgetKind, provider: MeadowProvider()) { entry in
            MeadowWidgetView(entry: entry)
        }
        .configurationDisplayName("Meadow")
        .description("Your crew's flowers bloom when they're free.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct MeadowWidgetView: View {
    var entry: MeadowEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isMedium: Bool { family == .systemMedium }

    private var snapshot: MeadowSnapshot? {
        switch entry.content {
        case .fresh(let s), .stale(let s): s
        default: nil
        }
    }

    private var title: String {
        switch entry.content {
        case .signedOut: "Frolic"
        case .loading: "Your meadow"
        case .failure: "The meadow's out of reach"
        case .fresh(let s), .stale(let s): s.headline
        }
    }

    private var line: String {
        switch entry.content {
        case .signedOut: LockScreenCopy.signedOut
        case .loading: "Checking who's free"
        case .failure(.offline): "You're offline. It'll catch up when you're back."
        case .failure: "Frolic couldn't reach your crew. It'll try again soon."
        case .stale(let s): "Last checked \(LockScreenCopy.time(s.fetchedAt))"
        case .fresh(let s): s.isAlone ? "Invite a friend from the Crew tab" : MeadowSnapshot.tapLine
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            flowers
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            VStack(alignment: .leading, spacing: 3) {
                if let snapshot, isMedium {
                    Text(snapshot.groupName.uppercased())
                        .widgetFont(11, .bold, relativeTo: .caption)
                        .tracking(0.3)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .lineLimit(1)
                }
                Text(title)
                    .widgetFont(isMedium ? 20 : 16, .heavy, rounded: true, relativeTo: .headline)
                    .foregroundStyle(FrolicColor.ink)
                    .lineLimit(isMedium ? 2 : 3)
                    .minimumScaleFactor(0.6)
                HStack(spacing: 4) {
                    if case .stale = entry.content {
                        Image(systemName: "clock").accessibilityHidden(true)
                    }
                    Text(line)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .widgetFont(12, .semibold, relativeTo: .footnote)
                .foregroundStyle(FrolicColor.secondaryText)
            }
        }
        .redacted(reason: entry.content == .loading ? .placeholder : [])
        .id(title)
        .transition(reduceMotion ? .opacity : .push(from: .bottom))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title). \(line)")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("widget.meadow")
        .widgetURL(URL(string: "frolic://today?imfree=1"))
        .containerBackground(for: .widget) {
            LinearGradient(
                stops: [
                    .init(color: FrolicColor.skyTop, location: 0),
                    .init(color: FrolicColor.skyMid, location: 0.6),
                    .init(color: FrolicColor.meadow, location: 0.6),
                    .init(color: FrolicColor.meadowDeep, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
    }

    @ViewBuilder
    private var flowers: some View {
        let limit = isMedium ? 6 : 3
        let free = Array((snapshot?.freeNow ?? []).prefix(limit))
        let buds = min(snapshot?.restingCount ?? 0, max(0, limit + 1 - free.count))
        HStack(alignment: .bottom, spacing: isMedium ? 6 : 2) {
            ForEach(Array(free.enumerated()), id: \.element.id) { index, person in
                FlowerView(state: .bloom, person: person.flowerPerson, radius: isMedium ? 17 : 14, stem: CGFloat(isMedium ? 30 : 22) + CGFloat(index % 2) * 10, showsName: isMedium)
                    .overlay(alignment: .top) {
                        if let image = LockScreenStore.portrait(person) {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: isMedium ? 17 : 14, height: isMedium ? 17 : 14)
                                .clipShape(Circle())
                                .padding(.top, 4 + (isMedium ? 17 : 14) / 2)
                        }
                    }
            }
            ForEach(0..<buds, id: \.self) { index in
                FlowerView(state: .bud, color: .marigold, radius: 9, stem: CGFloat(14 + (index % 2) * 8))
            }
            if free.isEmpty && buds == 0 {
                FlowerView(state: .bud, color: .marigold, radius: 10, stem: 18)
            }
        }
        .opacity(entry.content == .loading ? 0.5 : 1)
        .accessibilityHidden(true)
    }
}

enum MeadowSamples {
    static var free: MeadowSnapshot {
        MeadowSnapshot(fetchedAt: .now, groupName: "Sunset Crew", freeNow: [WidgetSamples.maya, WidgetSamples.dev], restingCount: 2, healthLine: nil)
    }

    static func snapshot(_ state: String) -> MeadowSnapshot? {
        var s = free
        switch state {
        case "free": break
        case "one": s.freeNow = [WidgetSamples.jordan]; s.restingCount = 3
        case "many": s.freeNow = [WidgetSamples.maya, WidgetSamples.dev, WidgetSamples.jordan, WidgetSamples.priya]; s.restingCount = 0
        case "quiet": s.freeNow = []; s.restingCount = 4
        case "health": s.freeNow = []; s.restingCount = 4; s.healthLine = "Your garden's growing. 12 frolics so far."
        case "alone": s.freeNow = []; s.restingCount = 0
        case "stale": s.fetchedAt = .now.addingTimeInterval(-40 * 60)
        default: return nil
        }
        return s
    }

    static func content(_ state: String) -> MeadowContent? {
        switch state {
        case "signedout": .signedOut
        case "loading": .loading
        case "offline": .failure(.offline)
        case "error": .failure(.unreadable)
        case "stale": snapshot("stale").map(MeadowContent.stale)
        default: snapshot(state).map(MeadowContent.fresh)
        }
    }
}
