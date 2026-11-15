import AppIntents
import SwiftUI
import WidgetKit

enum WidgetDisplay: Equatable {
    case signedOut
    case loading
    case open(LockScreenSnapshot)
    case waiting(LockScreenSnapshot)
    case dayOff(LockScreenSnapshot)
    case on(LockScreenSnapshot)
    case hopIn(LockScreenSnapshot)
    case faded(LockScreenSnapshot)
    case done(LockScreenSnapshot)
    case none
    case error(String)
    case offline(LockScreenSnapshot?)

    init(_ content: TodayContent) {
        switch content {
        case .signedOut: self = .signedOut
        case .loading: self = .loading
        case .failure(.offline, let last): self = .offline(last)
        case .failure(let error, _): self = .error(error.errorDescription ?? LockScreenCopy.errorTitle)
        case .snapshot(let s):
            switch s.phase {
            case .none: self = .none
            case .solo, .open: self = s.tookDayOff ? .dayOff(s) : .open(s)
            case .waiting: self = .waiting(s)
            case .on: self = s.amGoing ? .on(s) : (s.canHopIn || s.hopInWaiting ? .hopIn(s) : (s.tookDayOff ? .dayOff(s) : .on(s)))
            case .faded: self = .faded(s)
            case .done: self = .done(s)
            }
        }
    }

    var key: String {
        switch self {
        case .signedOut: "signedOut"
        case .loading: "loading"
        case .open: "open"
        case .waiting: "waiting"
        case .dayOff: "dayOff"
        case .on: "on"
        case .hopIn: "hopIn"
        case .faded: "faded"
        case .done: "done"
        case .none: "none"
        case .error: "error"
        case .offline: "offline"
        }
    }
}

struct TodayWidgetView: View {
    var entry: TodayEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let display = WidgetDisplay(entry.content)
        Group {
            switch family {
            case .accessoryRectangular: AccessoryRectangularView(display: display)
            case .accessoryCircular: AccessoryCircularView(display: display)
            case .accessoryInline: AccessoryInlineView(display: display)
            case .systemMedium: MediumTodayView(display: display)
            default: SmallTodayView(display: display)
            }
        }
        .id(display.key)
        .transition(reduceMotion ? .opacity : .push(from: .bottom))
        .accessibilityIdentifier("widget.root")
        .containerBackground(for: .widget) {
            if family == .systemSmall || family == .systemMedium {
                LinearGradient(colors: [FrolicColor.skyTop, FrolicColor.skyMid, FrolicColor.cream], startPoint: .top, endPoint: .bottom)
            } else {
                AccessoryWidgetBackground()
            }
        }
    }
}

private struct WidgetFontModifier: ViewModifier {
    @ScaledMetric private var size: CGFloat
    var weight: Font.Weight
    var rounded: Bool

    init(size: CGFloat, weight: Font.Weight, rounded: Bool, relativeTo: Font.TextStyle) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: relativeTo)
        self.weight = weight
        self.rounded = rounded
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: rounded ? .rounded : .default))
    }
}

extension View {
    func widgetFont(_ size: CGFloat, _ weight: Font.Weight = .regular, rounded: Bool = false, relativeTo: Font.TextStyle = .body) -> some View {
        modifier(WidgetFontModifier(size: size, weight: weight, rounded: rounded, relativeTo: relativeTo))
    }
}

struct WidgetFlower: View {
    var person: LockScreenPerson
    var state: FlowerState = .bloom
    var radius: CGFloat = 10

    var body: some View {
        FlowerView(state: state, person: person.flowerPerson, radius: radius, stem: 0)
            .overlay {
                if state != .bud, let image = LockScreenStore.portrait(person) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: radius, height: radius)
                        .clipShape(Circle())
                        .accessibilityHidden(true)
                }
            }
    }
}

struct FlowerRow: View {
    var people: [LockScreenPerson]
    var radius: CGFloat = 10
    var limit = 4
    var label: String?

    var body: some View {
        HStack(spacing: -radius * 0.45) {
            ForEach(people.prefix(limit)) { WidgetFlower(person: $0, radius: radius) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label ?? LockScreenCopy.freeLine(people.map(\.name)))
        .accessibilityHidden(people.isEmpty)
    }
}

struct PaintedImage: View {
    var name: String
    var fill = true

    var body: some View {
        if let image = LockScreenStore.image(name) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: fill ? .fill : .fit)
        } else if name.hasPrefix("plan-") {
            LinearGradient(colors: [FrolicColor.skyTop, FrolicColor.band.opacity(0.6), FrolicColor.sun.opacity(0.5)], startPoint: .top, endPoint: .bottom)
        } else {
            FlowerView(state: name == "state-waiting" ? .bud : (name == "state-faded" ? .folded : .bloom), color: .marigold, radius: 18, stem: 22)
        }
    }
}

struct WidgetPillButton<I: AppIntent>: View {
    var title: String
    var intent: I
    var id: String
    var dark = true

    var body: some View {
        Button(intent: intent) {
            Text(title)
                .widgetFont(16, .bold, rounded: true, relativeTo: .headline)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(dark ? FrolicColor.cream : FrolicColor.ink)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(dark ? FrolicColor.ink : FrolicColor.paper, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityIdentifier(id)
    }
}

struct WidgetMessage: View {
    var illustration: String?
    var title: String
    var line: String?
    var compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let illustration {
                PaintedImage(name: illustration, fill: false)
                    .frame(maxWidth: .infinity, maxHeight: compact ? 54 : 72, alignment: .leading)
                    .accessibilityHidden(true)
            }
            Text(title)
                .widgetFont(compact ? 15 : 17, .heavy, rounded: true, relativeTo: .headline)
                .foregroundStyle(FrolicColor.ink)
                .lineLimit(3)
                .minimumScaleFactor(0.6)
            if let line {
                Text(line)
                    .widgetFont(12, relativeTo: .footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .lineLimit(3)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }
}

struct SmallTodayView: View {
    var display: WidgetDisplay

    var body: some View {
        switch display {
        case .open(let s):
            VStack(alignment: .leading, spacing: 6) {
                PaintedImage(name: s.heroKey)
                    .frame(height: 52)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(alignment: .bottomLeading) { FlowerRow(people: s.free, radius: 8, limit: 3).padding(4) }
                    .accessibilityHidden(true)
                Text(s.planTitle ?? LockScreenCopy.dropTitle)
                    .widgetFont(14, .heavy, rounded: true, relativeTo: .headline)
                    .foregroundStyle(FrolicColor.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                    .accessibilityLabel("\(s.planTitle ?? LockScreenCopy.dropTitle). \(LockScreenCopy.freeLine(s.free.map(\.name)))")
                Spacer(minLength: 0)
                WidgetPillButton(title: LockScreenCopy.down, intent: ImDownIntent(), id: "widget.down")
            }
        case .waiting(let s):
            WidgetMessage(illustration: "state-waiting", title: LockScreenCopy.planted, line: s.onlyIf.isEmpty ? LockScreenCopy.hush : LockScreenCopy.onlyIfLine(s.onlyIf), compact: true)
        case .on(let s):
            VStack(alignment: .leading, spacing: 4) {
                FlowerRow(people: s.going, radius: 12, label: "Going: " + LockScreenCopy.list(s.going.map(\.name)))
                Spacer(minLength: 0)
                Text(LockScreenCopy.itsOn)
                    .widgetFont(26, .heavy, rounded: true, relativeTo: .title)
                    .foregroundStyle(FrolicColor.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(LockScreenCopy.placeAt(s.placeName, s.startsAt))
                    .widgetFont(13, .semibold, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                if let leave = s.leaveAt {
                    Text("Leave by \(LockScreenCopy.time(leave))")
                        .widgetFont(12, relativeTo: .footnote)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .accessibilityElement(children: .combine)
        case .hopIn(let s):
            VStack(alignment: .leading, spacing: 6) {
                FlowerRow(people: s.going, radius: 11, label: "Going: " + LockScreenCopy.list(s.going.map(\.name)))
                Text(s.hopInWaiting ? "You're next if a spot opens." : LockScreenCopy.hopInLine(going: s.going.map(\.name), place: s.placeName))
                    .widgetFont(13, .semibold, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.ink)
                    .lineLimit(3)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 0)
                if !s.hopInWaiting {
                    WidgetPillButton(title: LockScreenCopy.hopIn, intent: HopInIntent(), id: "widget.hopIn")
                }
            }
        default:
            StateMessage(display: display, compact: true)
        }
    }
}

struct MediumTodayView: View {
    var display: WidgetDisplay

    var body: some View {
        switch display {
        case .open(let s):
            HStack(spacing: 12) {
                PaintedImage(name: s.heroKey)
                    .frame(width: 118)
                    .frame(maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.phase == .solo ? "JUST FOR YOU" : "TODAY · \(s.groupName.uppercased())")
                        .widgetFont(11, .bold, relativeTo: .caption)
                        .tracking(0.3)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .lineLimit(1)
                    Text(s.planTitle ?? LockScreenCopy.dropTitle)
                        .widgetFont(17, .heavy, rounded: true, relativeTo: .headline)
                        .foregroundStyle(FrolicColor.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)
                    HStack(spacing: 6) {
                        FlowerRow(people: s.free, radius: 9)
                        Text(LockScreenCopy.freeLine(s.free.map(\.name)))
                            .widgetFont(12, relativeTo: .footnote)
                            .foregroundStyle(FrolicColor.secondaryText)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .accessibilityElement(children: .combine)
                    Spacer(minLength: 0)
                    WidgetPillButton(title: LockScreenCopy.down, intent: ImDownIntent(), id: "widget.down")
                }
            }
        case .waiting(let s):
            HStack(spacing: 12) {
                PaintedImage(name: "state-waiting", fill: false)
                    .frame(width: 110)
                    .accessibilityHidden(true)
                WidgetMessage(illustration: nil, title: LockScreenCopy.planted, line: s.onlyIf.isEmpty ? "\(s.planTitle ?? "Today's plan"). \(LockScreenCopy.hush)." : "\(LockScreenCopy.onlyIfLine(s.onlyIf)). \(LockScreenCopy.hush).", compact: false)
            }
        case .on(let s):
            HStack(spacing: 12) {
                PaintedImage(name: "state-its-on", fill: false)
                    .frame(width: 110)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(LockScreenCopy.goingLine(s.going.map(\.name), meName: s.me?.name, amGoing: s.amGoing))
                        .widgetFont(13, .semibold, relativeTo: .subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(LockScreenCopy.itsOn)
                        .widgetFont(30, .heavy, rounded: true, relativeTo: .title)
                        .foregroundStyle(FrolicColor.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(LockScreenCopy.placeAt(s.placeName, s.startsAt) + (s.leaveAt.map { ". Leave by \(LockScreenCopy.time($0))." } ?? ""))
                        .widgetFont(13, relativeTo: .subheadline)
                        .foregroundStyle(FrolicColor.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                    FlowerRow(people: s.going, radius: 10, limit: 6, label: "Going: " + LockScreenCopy.list(s.going.map(\.name)))
                }
                .accessibilityElement(children: .combine)
            }
        case .hopIn(let s):
            HStack(spacing: 12) {
                PaintedImage(name: s.heroKey)
                    .frame(width: 110)
                    .frame(maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    FlowerRow(people: s.going, radius: 11, limit: 5, label: "Going: " + LockScreenCopy.list(s.going.map(\.name)))
                    Text(s.hopInWaiting ? "You're next if a spot opens." : LockScreenCopy.hopInLine(going: s.going.map(\.name), place: s.placeName))
                        .widgetFont(15, .semibold, relativeTo: .subheadline)
                        .foregroundStyle(FrolicColor.ink)
                        .lineLimit(3)
                        .minimumScaleFactor(0.6)
                    Spacer(minLength: 0)
                    if !s.hopInWaiting {
                        WidgetPillButton(title: LockScreenCopy.hopIn, intent: HopInIntent(), id: "widget.hopIn")
                    }
                }
            }
        default:
            StateMessage(display: display, compact: false)
        }
    }
}

struct StateMessage: View {
    var display: WidgetDisplay
    var compact: Bool

    var body: some View {
        switch display {
        case .signedOut:
            content(illustration: "launch-meadow", title: "Frolic", line: LockScreenCopy.signedOut)
        case .loading:
            content(illustration: "state-waiting", title: "Today's plan", line: "Finding your crew's plan")
                .redacted(reason: .placeholder)
        case .dayOff:
            content(illustration: nil, title: LockScreenCopy.dayOff, line: LockScreenCopy.dayOffLine)
        case .faded(let s):
            content(illustration: "state-faded", title: LockScreenCopy.drifted, line: compact ? LockScreenCopy.nextDrop : "\(s.planTitle.map { "\($0) quietly faded. " } ?? "")\(LockScreenCopy.nextDrop)")
        case .done(let s):
            content(illustration: "state-its-on", title: s.amGoing ? "Planted in the garden" : LockScreenCopy.noPlanYet, line: s.amGoing ? LockScreenCopy.bloomedLine(going: s.going.map(\.name), meName: s.me?.name, place: s.placeName) : LockScreenCopy.nextDrop)
        case .none:
            content(illustration: "launch-meadow", title: LockScreenCopy.noPlanYet, line: LockScreenCopy.todayArrives)
        case .error(let message):
            VStack(alignment: .leading, spacing: 6) {
                WidgetMessage(illustration: compact ? nil : "state-faded", title: LockScreenCopy.errorTitle, line: message, compact: compact)
                WidgetPillButton(title: LockScreenCopy.tryAgain, intent: RefreshTodayIntent(), id: "widget.retry", dark: false)
            }
        case .offline(let last):
            VStack(alignment: .leading, spacing: 4) {
                Image(systemName: "wifi.slash")
                    .widgetFont(18, .semibold, relativeTo: .headline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .accessibilityHidden(true)
                WidgetMessage(illustration: nil, title: LockScreenCopy.offlineTitle, line: last?.planTitle.map { "Last seen: \($0)" } ?? "Frolic will catch up when you're back.", compact: compact)
            }
        default:
            EmptyView()
        }
    }

    private func content(illustration: String?, title: String, line: String) -> some View {
        WidgetMessage(illustration: illustration, title: title, line: line, compact: compact)
    }
}
