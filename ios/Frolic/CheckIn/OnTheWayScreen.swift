import SwiftUI

struct OnTheWayScreen: View {
    @Bindable var store: CheckInStore
    @Bindable var watcher: ArrivalWatcher
    var shown: ScreenPhase
    var onBack: () -> Void
    var onBail: () -> Void
    @State private var askingForLocation = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ZStack(alignment: .topLeading) {
                    HeroBand(imageName: "plan-sunsets", fallback: store.others.first?.flower ?? .marigold)
                    CircleIconButton(systemImage: "chevron.left", label: "Back to Today", action: onBack)
                        .padding(.leading, 18)
                        .padding(.top, 60)
                }
                VStack(alignment: .leading, spacing: 0) {
                    PhasedContent(
                        phase: shown,
                        copy: PlaceholderCopy(
                            loading: "Finding everyone",
                            emptyTitle: "This one's over",
                            emptyMessage: "The frolic ended. It's in your garden if you went.",
                            errorTitle: "Couldn't follow today's frolic"
                        ),
                        color: store.others.first?.flower ?? .marigold,
                        onRetry: onBack
                    ) {
                        ready
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, -50)
            }
            .padding(.bottom, 40)
        }
        .background(SkyBackground())
        .accessibilityIdentifier("otw.screen")
        .task { watcher.refresh() }
    }

    private var ready: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(store.kicker)
                .font(.system(.subheadline, design: .default, weight: .bold))
                .foregroundStyle(FrolicColor.ink)
                .accessibilityIdentifier("otw.kicker")
            Text(store.title)
                .frolicFont(.largeTitle)
                .foregroundStyle(FrolicColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("otw.title")
            if let leaveBy = store.leaveBy {
                HStack(spacing: 6) {
                    Image(systemName: "figure.walk")
                        .imageScale(.small)
                        .accessibilityHidden(true)
                    Text(leaveBy)
                }
                .frolicFont(.chip)
                .foregroundStyle(FrolicColor.chipText)
                .padding(.horizontal, 12)
                .frame(minHeight: 30)
                .background(Capsule().fill(FrolicColor.chip))
                .padding(.top, 10)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("otw.leaveBy")
            }
            SectionHeader(title: "Who's where")
                .accessibilityIdentifier("otw.who")
            FrolicGroup {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, person in
                    OnTheWayRow(
                        person: person,
                        isMe: store.isMe(person),
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
            if askingForLocation, watcher.permission == .undecided {
                locationReason
            }
            if let error = store.actionError {
                Text(error)
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .padding(.top, 12)
                    .accessibilityIdentifier("otw.error")
            }
            Button {
                primaryAction()
            } label: {
                if store.isCheckingIn {
                    ProgressView().tint(FrolicColor.cream)
                } else {
                    Text("I'm here")
                }
            }
            .buttonStyle(.frolicPrimary)
            .padding(.top, 20)
            .accessibilityIdentifier("otw.here")
            Button("Directions") {
                if let place = store.place { RouteService.openDirections(to: place) }
            }
            .buttonStyle(.frolicSecondaryWide)
            .padding(.top, 10)
            .accessibilityIdentifier("otw.directions")
            Button("I can't make it") { onBail() }
                .buttonStyle(.frolicText)
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
                .accessibilityIdentifier("otw.bail")
        }
    }

    private var rows: [WirePerson] {
        store.others + (store.myPerson.map { [$0] } ?? [])
    }

    private var lockPreview: some View {
        HStack(spacing: 12) {
            if let first = store.others.first {
                SentShotAvatar(name: first.name, flower: first.flower, radius: 9)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(store.lockTitle)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text(store.lockLine)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.7))
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 1) {
                Text("\(store.myMinutes ?? 12) min")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(FrolicColor.band)
                Text("away")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(FrolicColor.night))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("otw.lockPreview")
    }

    private var locationReason: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(watcher.purposeLine)
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button("Use my location") {
                    watcher.requestPermission()
                    askingForLocation = false
                }
                .buttonStyle(.frolicSecondary)
                .accessibilityIdentifier("otw.location.use")
                Button("I'll check in myself") {
                    askingForLocation = false
                    Task { await store.checkIn(method: "manual") }
                }
                .buttonStyle(.frolicText)
                .accessibilityIdentifier("otw.location.manual")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .padding(.top, 14)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("otw.location")
    }

    private func primaryAction() {
        switch watcher.permission {
        case .undecided:
            askingForLocation = true
        case .denied:
            Task { await store.checkIn(method: "manual") }
        case .granted:
            watcher.refresh()
            Task { await store.checkIn(method: watcher.arrived ? "geofence" : "manual") }
        }
    }
}

private struct OnTheWayRow: View {
    var person: WirePerson
    var isMe: Bool
    var status: String
    var progress: Double
    var showsDivider: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            CheckInAvatar(person: person, radius: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(person.name)
                    .frolicFont(.bodyEmphasis)
                    .foregroundStyle(FrolicColor.ink)
                Text(status)
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                RouteBar(progress: progress, tint: person.flower.deep)
                    .padding(.top, 6)
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
        .accessibilityLabel("\(person.name), \(status)")
    }
}
