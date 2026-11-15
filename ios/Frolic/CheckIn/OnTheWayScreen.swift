import SwiftUI

struct OnTheWayScreen: View {
    @Bindable var store: CheckInStore
    @Bindable var watcher: ArrivalWatcher
    var shown: ScreenPhase
    var onBack: () -> Void
    var onRetry: () -> Void
    var onBail: () -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            scroll
            CircleIconButton(systemImage: "chevron.left", label: "Back to Today", action: onBack)
                .padding(.leading, 18)
                .padding(.top, 4)
        }
        .background(FrolicColor.cream.ignoresSafeArea())
        .accessibilityIdentifier("otw.screen")
    }

    private var scroll: some View {
        ScrollView {
            VStack(spacing: 0) {
                HeroBand(imageName: shown == .ready ? store.heroKey : nil, fallback: .marigold)
                Group {
                    if shown == .ready {
                        ready
                    } else {
                        PhasePlaceholder(
                            phase: shown,
                            copy: PlaceholderCopy(
                                loading: "Finding everyone",
                                emptyTitle: "Nothing to walk to",
                                emptyMessage: "When a plan is on and you're going, everyone's walk shows up here.",
                                emptyAction: "Back to today",
                                errorTitle: "Couldn't follow today's frolic"
                            ),
                            color: .marigold,
                            onEmptyAction: onBack,
                            onRetry: onRetry
                        )
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, shown == .ready ? -50 : 0)
            }
            .padding(.bottom, 40)
        }
        .scrollBounceBehavior(.basedOnSize)
        .ignoresSafeArea(edges: .top)
    }

    private var ready: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(store.kicker)
                .font(.system(.subheadline, weight: .bold))
                .foregroundStyle(FrolicColor.ink)
                .accessibilityIdentifier("otw.kicker")
            Text(store.title)
                .font(.system(.largeTitle, design: .rounded, weight: .heavy))
                .foregroundStyle(FrolicColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("otw.title")
            chips
            if watcher.permission == .undecided {
                locationAsk
            }
            SectionHeader(title: "Who's where")
                .accessibilityIdentifier("otw.who")
            FrolicGroup {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, person in
                    OnTheWayRow(
                        person: person,
                        name: store.isMe(person) ? "You" : person.name,
                        status: store.rowStatus(for: person),
                        progress: store.rowProgress(for: person),
                        showsDivider: index > 0
                    )
                    .accessibilityIdentifier(store.isMe(person) ? "otw.row.you" : "otw.row.\(person.name.lowercased())")
                }
            }
            Text(store.sharedNote)
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 10)
                .padding(.horizontal, 4)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("otw.shareNote")
            SectionHeader(title: "On your lock screen")
            lockPreview
            if watcher.permission == .denied {
                Text("Location is off, so tap I'm here when you get there.")
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .padding(.top, 14)
                    .padding(.horizontal, 4)
                    .accessibilityIdentifier("otw.locationOff")
            }
            if let error = store.actionError {
                Text(error)
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.sun)
                    .padding(.top, 14)
                    .padding(.horizontal, 4)
                    .accessibilityIdentifier("otw.error")
            }
            Button("I'm here") {
                store.checkIn(method: watcher.arrived ? "geofence" : "manual")
            }
            .buttonStyle(.frolicPrimary)
            .sensoryFeedback(.success, trigger: store.checkedIn)
            .padding(.top, 20)
            .accessibilityIdentifier("otw.here")
            Button("I can't make it", action: onBail)
                .buttonStyle(.frolicText)
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
                .accessibilityIdentifier("otw.bail")
        }
    }

    private var chips: some View {
        HStack(spacing: 8) {
            if let leaveBy = store.leaveBy {
                Label(leaveBy, systemImage: "figure.walk")
                    .modifier(ChipLook())
                    .accessibilityIdentifier("otw.leaveBy")
            }
            if let place = store.place {
                Button {
                    RouteService.openDirections(to: place)
                } label: {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .modifier(ChipLook())
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
                .accessibilityIdentifier("otw.directions")
            }
        }
        .padding(.top, 6)
    }

    private var rows: [WirePerson] {
        store.others + [store.myPerson].compactMap { $0 }
    }

    private var lockPreview: some View {
        HStack(spacing: 12) {
            if let first = store.others.first {
                FlowerView(state: .bloom, color: first.flower, radius: 9, stem: 0)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(store.lockTitle)
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(.white)
                Text(store.lockLine)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.7))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 1) {
                Text(store.checkedIn ? "Here" : "\(store.myMinutes.map(String.init) ?? "–") min")
                    .font(.system(.title2, design: .rounded, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(FrolicColor.band)
                    .contentTransition(.numericText())
                if !store.checkedIn {
                    Text("away")
                        .font(.system(.caption2, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(FrolicColor.night))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("otw.lockPreview")
    }

    private var locationAsk: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "location.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(FlowerColor.cobalt.deep)
                .frame(width: 36, height: 36)
                .background(Circle().fill(FrolicColor.chip))
                .accessibilityHidden(true)
            Text(ArrivalWatcher.purposeLine)
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button("Turn on") { watcher.requestPermission() }
                .buttonStyle(.frolicText)
                .accessibilityIdentifier("otw.location.use")
        }
        .padding(.leading, 12)
        .padding(.vertical, 8)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .padding(.top, 14)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("otw.location")
    }
}

private struct ChipLook: ViewModifier {
    func body(content: Content) -> some View {
        content
            .labelStyle(.titleAndIcon)
            .frolicFont(.chip)
            .foregroundStyle(FrolicColor.chipText)
            .padding(.horizontal, 12)
            .frame(minHeight: 30)
            .background(Capsule().fill(FrolicColor.chip))
    }
}

private struct OnTheWayRow: View {
    var person: WirePerson
    var name: String
    var status: String
    var progress: Double
    var showsDivider: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            FlowerView(state: .bloom, person: FlowerPerson(id: person.userId, name: person.name, color: person.flower, avatarURL: ReachableURL.from(person.photoUrl)), radius: 22, stem: 0)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .frolicFont(.bodyEmphasis)
                    .foregroundStyle(FrolicColor.ink)
                Text(status)
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .contentTransition(.numericText())
                RouteBar(progress: progress, tint: person.flower.petal)
                    .padding(.top, 6)
                    .animation(.easeInOut(duration: 1), value: progress)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .overlay(alignment: .top) {
            if showsDivider {
                FrolicColor.line.frame(height: 0.5).padding(.leading, 68)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(status)")
    }
}
