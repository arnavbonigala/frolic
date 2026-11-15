import SwiftUI
import WidgetKit

struct TodayEntry: TimelineEntry {
    var date: Date
    var headline: String
    var detail: String
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, headline: "Sunset at Indian Rock", detail: "Maya and Dev are free")
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : current())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        completion(Timeline(entries: [current()], policy: .after(.now.addingTimeInterval(30 * 60))))
    }

    private func current() -> TodayEntry {
        let defaults = AppGroup.defaults
        return TodayEntry(
            date: .now,
            headline: defaults.string(forKey: AppGroup.Key.widgetHeadline) ?? "No plan yet",
            detail: defaults.string(forKey: AppGroup.Key.widgetDetail) ?? "Today's plan arrives at 3."
        )
    }
}

struct TodayWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Wordmark(width: 56)
                Spacer()
                FlowerView(color: .marigold, radius: 12, stem: 0)
                    .accessibilityHidden(true)
            }
            Spacer(minLength: 0)
            Text(entry.headline)
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(FrolicColor.ink)
                .lineLimit(2)
            Text(entry.detail)
                .font(.system(size: 13))
                .foregroundStyle(FrolicColor.secondaryText)
                .lineLimit(2)
        }
        .containerBackground(for: .widget) {
            LinearGradient(colors: [FrolicColor.skyTop, FrolicColor.cream], startPoint: .top, endPoint: .bottom)
        }
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FrolicToday", provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Today's plan for your crew.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
