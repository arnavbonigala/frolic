import SwiftUI
import WidgetKit

enum TodayContent: Equatable {
    case signedOut
    case loading
    case snapshot(LockScreenSnapshot)
    case failure(FrolicAPIError, LockScreenSnapshot?)
}

struct TodayEntry: TimelineEntry {
    var date: Date
    var content: TodayContent
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, content: .loading)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        if context.isPreview {
            completion(TodayEntry(date: .now, content: .snapshot(WidgetSamples.snapshot("open") ?? WidgetSamples.base)))
            return
        }
        Task { completion(await timeline().entries.first ?? placeholder(in: context)) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        Task { completion(await timeline()) }
    }

    private func timeline(now: Date = .now) async -> Timeline<TodayEntry> {
        #if DEBUG || E2E
        if let state = LockScreenStore.e2eWidgetState, let entries = WidgetSamples.entries(state, now: now) {
            return Timeline(entries: entries, policy: .after(now.addingTimeInterval(15 * 60)))
        }
        #endif
        guard SharedSession.credentials != nil else {
            return Timeline(entries: [TodayEntry(date: now, content: .signedOut)], policy: .after(now.addingTimeInterval(30 * 60)))
        }
        let cached = LockScreenStore.snapshot
        let snapshot: LockScreenSnapshot
        if let cached, now.timeIntervalSince(cached.fetchedAt) < 10 {
            snapshot = cached
        } else {
            do {
                snapshot = try await LockScreenStore.fetch()
                LockScreenStore.snapshot = snapshot
            } catch {
                let failure = error as? FrolicAPIError ?? .unreadable
                if failure == .signedOut {
                    return Timeline(entries: [TodayEntry(date: now, content: .signedOut)], policy: .after(now.addingTimeInterval(30 * 60)))
                }
                return Timeline(entries: [TodayEntry(date: now, content: .failure(failure, cached))], policy: .after(now.addingTimeInterval(5 * 60)))
            }
        }
        await LockScreenStore.cachePortraits(snapshot.free + snapshot.going)
        var entries: [TodayEntry] = []
        if let failure = LockScreenStore.lastFailure, let at = LockScreenStore.lastFailureAt, now.timeIntervalSince(at) < 60 {
            entries.append(TodayEntry(date: now, content: .failure(failure, snapshot)))
            entries.append(TodayEntry(date: at.addingTimeInterval(60), content: .snapshot(snapshot.revealGated(at: at.addingTimeInterval(60)))))
        } else {
            entries.append(TodayEntry(date: now, content: .snapshot(snapshot.revealGated(at: now))))
        }
        if let revealAt = snapshot.revealAt, revealAt > now {
            entries.append(TodayEntry(date: revealAt, content: .snapshot(snapshot)))
        }
        return Timeline(entries: entries, policy: .after(nextReload(snapshot, now: now)))
    }

    private func nextReload(_ snapshot: LockScreenSnapshot, now: Date) -> Date {
        let soon = now.addingTimeInterval(15 * 60)
        let edge: Date? = switch snapshot.phase {
        case .open, .waiting, .solo: snapshot.deadline?.addingTimeInterval(5)
        case .on: snapshot.endsAt?.addingTimeInterval(5)
        default: nil
        }
        guard let edge, edge > now else { return snapshot.phase == .none ? now.addingTimeInterval(30 * 60) : soon }
        return min(edge, soon)
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: LockScreenStore.widgetKind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Today's plan, who's free, and your I'm down.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}
