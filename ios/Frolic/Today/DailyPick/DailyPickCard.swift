import SwiftUI

struct DailyPickSlot: View {
    var scene: TodayScene
    var me: TodayPerson?
    var todayFixture: Bool

    @Environment(AppRouter.self) private var router

    var body: some View {
        if shows {
            DailyPickCard(me: todayFixture ? DailyPickSlot.fixtureMe : me)
                .padding(.horizontal, 16)
                .padding(.top, 22)
        }
    }

    private var shows: Bool {
        if todayFixture && router.e2eRoute?.query["pick"] == nil { return false }
        switch scene {
        case .open, .hopIn, .solo(waiting: false): return false
        default: return true
        }
    }

    private static let fixtureMe = TodayPerson(userId: "me", name: "You", color: "tomato", photoUrl: nil, role: nil)
}

struct DailyPickCard: View {
    var me: TodayPerson?

    @Environment(AppRouter.self) private var router
    @Environment(FrolicBackend.self) private var backend
    @Environment(FrolicIdentity.self) private var identity
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var store = DailyPickStore()

    private var route: E2ERoute? {
        guard let route = router.e2eRoute, route.screen == "today" else { return nil }
        return route
    }

    var body: some View {
        FrolicCard {
            switch store.phase {
            case .loading:
                DailyPickSkeleton()
            case .error(let message):
                errorState(message)
            case .ready:
                if let view = store.view {
                    ready(view)
                } else {
                    DailyPickSkeleton()
                }
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.2) : .spring(response: 0.45, dampingFraction: 0.85), value: store.answered)
        .task(id: identity.deviceToken + "|" + (identity.groupId ?? "") + "|" + (route?.query["pick"] ?? "")) {
            store.start(backend: backend, route: route)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dailyPick.card")
    }

    private func ready(_ view: DailyPickView) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(DailyPickCopy.label)
                .todayFont(12, .heavy, relativeTo: .caption)
                .tracking(1.2)
                .foregroundStyle(FrolicColor.chipText)
                .accessibilityHidden(true)
            Text(view.question)
                .todayFont(22, .heavy, rounded: true, relativeTo: .title2)
                .foregroundStyle(FrolicColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityLabel("Daily pick. " + view.question)
                .accessibilityIdentifier("dailyPick.question")
            if store.answered {
                DailyPickResultsView(store: store, options: view.options, me: me)
                    .transition(.opacity)
            } else {
                options(view.options)
                    .transition(.opacity)
            }
            if store.failed {
                Text(DailyPickCopy.failed)
                    .todayFont(15, .semibold, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.sun)
                    .accessibilityIdentifier("dailyPick.failed")
            }
        }
    }

    private func options(_ options: [String]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { optionButtons(options) }
                VStack(spacing: 10) { optionButtons(options) }
            }
            Label(DailyPickCopy.hidden, systemImage: "lock.fill")
                .todayFont(15, .semibold, relativeTo: .subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
                .accessibilityLabel(DailyPickCopy.hidden + " after you pick")
                .accessibilityIdentifier("dailyPick.hidden")
            DailyPickWaterLine(text: DailyPickCopy.waters)
        }
    }

    private func optionButtons(_ options: [String]) -> some View {
        ForEach(options, id: \.self) { option in
            Button(option) { store.pick(option) }
                .buttonStyle(.frolicSecondaryWide)
                .accessibilityHint("Picks \(option) and shows what your crew said")
                .accessibilityIdentifier("dailyPick.option.\(option)")
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 10) {
            Text(DailyPickCopy.errorTitle)
                .todayFont(20, .heavy, rounded: true, relativeTo: .title3)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .todayFont(15, relativeTo: .subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
            Button(DailyPickCopy.retry) { store.retry(backend: backend, route: route) }
                .buttonStyle(.frolicSecondaryWide)
                .padding(.top, 4)
                .accessibilityIdentifier("dailyPick.retry")
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("dailyPick.error")
    }
}

private struct DailyPickResultsView: View {
    var store: DailyPickStore
    var options: [String]
    var me: TodayPerson?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = true

    var body: some View {
        let tallies = store.tallies(me: me)
        let total = max(1, tallies?.reduce(0) { $0 + $1.people.count } ?? 1)
        let others = store.others(me: me)
        VStack(alignment: .leading, spacing: 10) {
            ForEach(options, id: \.self) { option in
                row(option: option, people: tallies?.first { $0.option == option }?.people, total: total)
            }
            if tallies != nil {
                if others == 0 {
                    Text(DailyPickCopy.first)
                        .todayFont(15, relativeTo: .subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("dailyPick.first")
                }
                DailyPickWaterLine(text: others > 0 ? DailyPickCopy.watered : DailyPickCopy.oneMore, done: others > 0)
            }
        }
        .onChange(of: store.revealID) { _, _ in reveal() }
    }

    private func reveal() {
        guard !reduceMotion else { return }
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) { grown = false }
        withAnimation(.spring(response: 0.7, dampingFraction: 0.75).delay(0.05)) { grown = true }
    }

    private func row(option: String, people: [TodayPerson]?, total: Int) -> some View {
        let mine = option == store.myAnswer
        let count = people?.count ?? 0
        let fraction = people == nil ? 0 : CGFloat(count) / CGFloat(total)
        return Button {
            store.pick(option)
        } label: {
            HStack(spacing: 10) {
                if mine {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(FrolicColor.sun)
                        .accessibilityHidden(true)
                }
                Text(option)
                    .todayFont(17, mine ? .bold : .semibold, relativeTo: .body)
                    .foregroundStyle(FrolicColor.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                if let people {
                    faces(people)
                } else {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
            .background(alignment: .leading) {
                GeometryReader { proxy in
                    Capsule()
                        .fill(mine ? FrolicColor.band.opacity(0.35) : FrolicColor.meadow)
                        .frame(width: max(54, proxy.size.width * (grown ? fraction : 0)))
                        .opacity(people == nil ? 0 : 1)
                }
            }
            .background(Capsule().fill(FrolicColor.chip))
            .overlay(Capsule().strokeBorder(mine ? FrolicColor.band : .clear, lineWidth: 1.5))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label(option: option, mine: mine, people: people))
        .accessibilityHint(mine ? "" : "Changes your pick to \(option)")
        .accessibilityAddTraits(mine ? .isSelected : [])
        .accessibilityIdentifier("dailyPick.result.\(option)")
    }

    private func faces(_ people: [TodayPerson]) -> some View {
        HStack(spacing: -10) {
            ForEach(Array(people.prefix(4).enumerated()), id: \.element.id) { index, person in
                TodayFlower(person: shown(person), radius: 15, stem: 0)
                    .scaleEffect(grown || reduceMotion ? 1 : 0.2)
                    .opacity(grown ? 1 : 0)
                    .animation(reduceMotion ? .easeOut(duration: 0.2) : .spring(response: 0.5, dampingFraction: 0.6).delay(0.15 + Double(index) * 0.08), value: grown)
            }
            if people.count > 4 {
                Text("+\(people.count - 4)")
                    .todayFont(13, .bold, relativeTo: .footnote)
                    .foregroundStyle(FrolicColor.chipText)
                    .padding(.leading, 14)
            }
        }
    }

    private func shown(_ person: TodayPerson) -> TodayPerson {
        guard person.userId == me?.userId else { return person }
        var you = person
        you.name = "You"
        return you
    }

    private func label(option: String, mine: Bool, people: [TodayPerson]?) -> String {
        var parts = [option]
        if mine { parts.append("your pick") }
        if let people {
            parts.append(DailyPickCopy.people(people.count))
            let names = people.map { shown($0).name }
            if !names.isEmpty { parts.append(names.formatted(.list(type: .and))) }
        }
        return parts.joined(separator: ", ")
    }
}

private struct DailyPickWaterLine: View {
    var text: String
    var done = false

    var body: some View {
        Label(text, systemImage: done ? "drop.fill" : "drop")
            .todayFont(15, .semibold, relativeTo: .subheadline)
            .foregroundStyle(done ? FrolicColor.stem : FrolicColor.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("dailyPick.water")
    }
}

private struct DailyPickSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Capsule().fill(FrolicColor.chip).frame(width: 90, height: 12)
            Capsule().fill(FrolicColor.chip).frame(height: 22)
            Capsule().fill(FrolicColor.chip).frame(width: 180, height: 22)
            HStack(spacing: 10) {
                Capsule().fill(FrolicColor.chip).frame(height: 54)
                Capsule().fill(FrolicColor.chip).frame(height: 54)
            }
        }
        .opacity(pulse ? 0.55 : 1)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading today's pick")
        .accessibilityIdentifier("dailyPick.loading")
    }
}
