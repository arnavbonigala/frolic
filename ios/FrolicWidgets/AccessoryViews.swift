import SwiftUI
import WidgetKit

struct AccessoryRectangularView: View {
    var display: WidgetDisplay

    var body: some View {
        switch display {
        case .open(let s):
            HStack(spacing: 6) {
                lines(s.planTitle ?? LockScreenCopy.dropTitle, LockScreenCopy.freeLine(s.free.map(\.name)))
                Button(intent: ImDownIntent()) {
                    Text(LockScreenCopy.down)
                        .font(.caption.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.horizontal, 8)
                        .frame(minWidth: 44, minHeight: 44)
                        .background(.white.opacity(0.25), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(LockScreenCopy.down)
                .accessibilityIdentifier("widget.down")
            }
        case .hopIn(let s):
            HStack(spacing: 6) {
                lines(LockScreenCopy.placeAt(s.placeName, s.startsAt), s.hopInWaiting ? "You're next if a spot opens." : "Room for one more?")
                if !s.hopInWaiting {
                    Button(intent: HopInIntent()) {
                        Text(LockScreenCopy.hopIn)
                            .font(.caption.weight(.bold))
                            .lineLimit(1)
                            .padding(.horizontal, 8)
                            .frame(minWidth: 44, minHeight: 44)
                            .background(.white.opacity(0.25), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("widget.hopIn")
                }
            }
        case .waiting(let s):
            lines(LockScreenCopy.planted, s.onlyIf.isEmpty ? LockScreenCopy.hush : LockScreenCopy.onlyIfLine(s.onlyIf))
        case .on(let s):
            lines("\(LockScreenCopy.itsOn) \(s.startsAt.map(LockScreenCopy.time) ?? "")", LockScreenCopy.goingLine(s.going.map(\.name), meName: s.me?.name, amGoing: s.amGoing))
        case .dayOff:
            lines(LockScreenCopy.dayOff, "You can still hop in")
        case .faded:
            lines(LockScreenCopy.drifted, LockScreenCopy.nextDrop)
        case .done(let s):
            lines(s.amGoing ? "You went." : LockScreenCopy.noPlanYet, s.amGoing ? (s.placeName ?? "") : LockScreenCopy.nextDrop)
        case .none:
            lines(LockScreenCopy.noPlanYet, LockScreenCopy.todayArrives)
        case .signedOut:
            lines("Frolic", LockScreenCopy.signedOut)
        case .loading:
            lines("Today's plan", "Finding your crew").redacted(reason: .placeholder)
        case .error:
            lines(LockScreenCopy.errorTitle, "Open Frolic to try again")
        case .offline(let last):
            lines(LockScreenCopy.offlineTitle, last?.planTitle ?? "Frolic will catch up")
        }
    }

    private func lines(_ title: String, _ line: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(.headline)
                .widgetAccentable()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(line)
                .font(.caption)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct AccessoryCircularView: View {
    var display: WidgetDisplay

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            switch display {
            case .open(let s):
                VStack(spacing: 0) {
                    FlowerView(color: .marigold, radius: 8, stem: 0)
                    Text("\(s.free.count)")
                        .font(.system(.body, design: .rounded).weight(.heavy))
                        .minimumScaleFactor(0.6)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(LockScreenCopy.freeLine(s.free.map(\.name)))
            case .waiting:
                FlowerView(state: .bud, color: .marigold, radius: 12, stem: 0)
                    .accessibilityLabel(LockScreenCopy.planted)
            case .on(let s):
                VStack(spacing: 0) {
                    Text("On")
                        .font(.caption2.weight(.bold))
                    Text(s.startsAt.map(LockScreenCopy.time) ?? "")
                        .font(.system(.footnote, design: .rounded).weight(.heavy))
                        .minimumScaleFactor(0.6)
                }
                .accessibilityElement(children: .combine)
            default:
                FlowerView(state: .folded, color: .marigold, radius: 12, stem: 0)
                    .accessibilityLabel("Frolic")
            }
        }
        .widgetAccentable()
    }
}

struct AccessoryInlineView: View {
    var display: WidgetDisplay

    var body: some View {
        switch display {
        case .open(let s): Text("\(s.planTitle ?? "Today's plan") · \(s.free.count) free")
        case .waiting: Text(LockScreenCopy.planted)
        case .on(let s): Text("It's on · \(s.startsAt.map(LockScreenCopy.time) ?? "")")
        case .hopIn: Text("Room for one more")
        case .faded: Text(LockScreenCopy.drifted)
        case .dayOff: Text(LockScreenCopy.dayOff)
        case .none, .done: Text(LockScreenCopy.todayArrives)
        case .signedOut: Text("Open Frolic to join")
        case .loading: Text("Frolic")
        case .error: Text(LockScreenCopy.errorTitle)
        case .offline: Text(LockScreenCopy.offlineTitle)
        }
    }
}
