#if DEBUG || E2E
import SwiftUI

struct ComponentGallery: View {
    @Environment(\.dismiss) private var dismiss
    @State private var segment = 1
    @State private var activityMessage: String?
    @State private var showSheet = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    colors
                    type
                    flowers
                    buttons
                    chips
                    packet
                    cards
                    states
                    polish
                    liveActivity
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 40)
            }
            .background(FrolicColor.cream.ignoresSafeArea())
            .navigationTitle("Component gallery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("gallery.done")
                }
            }
        }
        .accessibilityIdentifier("gallery.root")
        .frolicSheet(isPresented: $showSheet) {
            VStack(spacing: FrolicSpacing.md) {
                Text("Sheet with detents")
                    .frolicFont(.sheetTitle)
                    .foregroundStyle(FrolicColor.ink)
                Text("Medium and large, grabber visible.")
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                Spacer(minLength: 0)
            }
            .padding(FrolicSpacing.xl)
            .accessibilityIdentifier("gallery.polish.sheetContent")
        }
    }

    private var colors: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "Ground")
            HStack(spacing: 8) {
                swatch("Ink", FrolicColor.ink)
                swatch("Cream", FrolicColor.cream)
                swatch("Sky", FrolicColor.skyTop)
                swatch("Chip", FrolicColor.chip)
                swatch("Sun", FrolicColor.sun)
                swatch("Free", FrolicColor.free)
            }
            SectionHeader(title: "Friend flowers")
            HStack(spacing: 8) {
                ForEach(FlowerColor.allCases) { color in
                    VStack(spacing: 4) {
                        HStack(spacing: 0) {
                            color.petal
                            color.deep
                        }
                        .frame(height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        Text(color.name)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(color.name) flower color")
                }
            }
        }
    }

    private func swatch(_ name: String, _ color: Color) -> some View {
        VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(color)
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(FrolicColor.line, lineWidth: 1))
                .frame(height: 40)
            Text(name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(FrolicColor.secondaryText)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name) color")
    }

    private var type: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionHeader(title: "Type")
            Wordmark(width: 120)
                .padding(.bottom, 6)
            ForEach(FrolicTextStyle.allCases, id: \.self) { style in
                Text(style == .huge ? "It's on." : style.name)
                    .frolicFont(style)
                    .foregroundStyle(FrolicColor.ink)
            }
        }
    }

    private var flowers: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "Flowers: bloom, folded, bud")
            HStack(alignment: .bottom) {
                FlowerView(state: .bloom, person: SampleData.maya, radius: 32, stem: 50, showsName: true, status: "free till 8")
                FlowerView(state: .folded, person: SampleData.jordan, radius: 32, stem: 50, showsName: true, status: "busy", swayDelay: 0.5)
                FlowerView(state: .bud, person: SampleData.you, radius: 32, stem: 50, showsName: true)
                FlowerView(state: .bloom, person: SampleData.youWithoutPhoto, radius: 32, stem: 50, showsName: true, swayDelay: 1)
            }
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("gallery.flowers")
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(Array(FlowerColor.allCases.enumerated()), id: \.element) { index, color in
                    FlowerView(color: color, radius: 18, stem: CGFloat(20 + index * 8), swayDelay: Double(index) * 0.3, animatesIn: true)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 12)
        }
    }

    private var buttons: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Buttons")
            HStack(spacing: 10) {
                Button("I'm down") {}.buttonStyle(.frolicPrimary)
                Button("Only with…") {}.buttonStyle(.frolicSecondary)
            }
            Button("Pick 3 more") {}.buttonStyle(.frolicPrimary).disabled(true)
            Button("See the garden") {}.buttonStyle(.frolicSecondaryWide)
            Button("No invite? Start on your own") {}.buttonStyle(.frolicText).frame(maxWidth: .infinity)
            HStack {
                CircleIconButton(systemImage: "chevron.left", label: "Back") {}
                CircleIconButton(systemImage: "square.and.arrow.up", label: "Share") {}
            }
            FrolicSegmented(label: "Spend up to", options: [(0, "Free", nil), (1, "$10", nil), (2, "$25", nil), (3, "Any", nil)], selection: $segment)
        }
    }

    private var chips: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Chips and pills")
            ChipRow(chips: ["Free", "12 min walk", "Golden hour 4:28"])
            HStack {
                FrolicChip(text: "Sunsets", size: .big)
                FrolicChip(text: "Late-night food", size: .big)
            }
            HStack {
                StatusPill(text: "Free till 8")
                StatusPill(text: "Not today", isFree: false)
            }
            HushNote(text: "Nobody sees you're down unless they are too")
        }
    }

    private var packet: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "Seed packet")
            SeedPacket(label: "TODAY · SATURDAY", number: "Crew frolic No. 13", image: "plan-sunsets", imageDescription: "Sunset at Indian Rock") {
                Text("Sunset at Indian Rock")
                    .frolicFont(.title)
                    .foregroundStyle(FrolicColor.ink)
                ChipRow(chips: ["Free", "12 min walk", "Golden hour 4:28"])
                WhyThis(text: "you're into sunsets, it's free, and the sky's clear until dark.")
            }
            .accessibilityIdentifier("gallery.packet")
        }
    }

    private var cards: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Cards and groups")
            FrolicCard {
                HStack(spacing: 12) {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(FrolicColor.secondaryText)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("You're down").font(.system(size: 16, weight: .semibold))
                        Text("If a friend says yes too, you'll both bloom at once. If not, it disappears at 4 and nobody ever knows.")
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                }
            }
            FrolicGroup {
                FrolicCell(title: "Maya", subtitle: "Free till 8 · 6 min away", isFree: true, showsChevron: true) {
                    FlowerView(person: SampleData.maya, radius: 22, stem: 0)
                }
                FrolicCell(title: "Jordan", subtitle: "Busy now", isFree: false, showsChevron: true, showsDivider: true) {
                    FlowerView(state: .folded, person: SampleData.jordan, radius: 22, stem: 0)
                }
            }
            GardenBed(count: 12, caption: "all before you joined")
        }
    }

    private var states: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Screen states")
            ForEach(ScreenPhase.previewable.filter { $0 != .ready }, id: \.name) { phase in
                VStack(alignment: .leading, spacing: 0) {
                    Text(phase.name)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(FrolicColor.tertiaryText)
                        .padding(.leading, 16)
                        .padding(.top, 12)
                    PhasePlaceholder(
                        phase: phase,
                        copy: PlaceholderCopy(
                            loading: "Checking who's free",
                            emptyTitle: "No plan yet",
                            emptyMessage: "Today's plan arrives at 3. Your crew's flowers bloom here when they're free.",
                            emptyAction: "Invite a friend",
                            errorTitle: "Couldn't load today's plan"
                        ),
                        onRetry: {}
                    )
                }
                .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
        }
    }

    private var polish: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "Spacing and radii")
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(Self.spacingSamples, id: \.name) { sample in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(FrolicColor.sun)
                            .frame(width: sample.value, height: 24)
                        Text(sample.name)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                }
            }
            HStack(spacing: 8) {
                ForEach(Self.radiusSamples, id: \.name) { sample in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: sample.value, style: .continuous)
                            .fill(FrolicColor.chip)
                            .frame(height: 44)
                        Text(sample.name)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 8)
            SectionHeader(title: "Pressable")
            Button("I'm down") {}.buttonStyle(.frolicPrimary).buttonStyle(.frolicPressable)
            Button("See the garden") {
                showSheet = true
            }
            .buttonStyle(.frolicSecondaryWide)
            .buttonStyle(.frolicPressable)
            .accessibilityIdentifier("gallery.polish.sheet")
            SectionHeader(title: "Staggered entrance")
            VStack(spacing: 8) {
                ForEach(Array(Self.entranceSamples.enumerated()), id: \.offset) { index, title in
                    FrolicCard {
                        Text(title)
                            .frolicFont(.bodyEmphasis)
                            .foregroundStyle(FrolicColor.ink)
                    }
                    .frolicEntrance(index: index)
                }
            }
            SectionHeader(title: "Skeleton")
            FrolicCard {
                HStack(spacing: FrolicSpacing.sm) {
                    Skeleton(shape: .circle, width: 44, height: 44)
                    VStack(alignment: .leading, spacing: FrolicSpacing.xs) {
                        Skeleton(shape: .rounded(FrolicRadius.seed), width: 120, height: 14)
                        Skeleton(shape: .capsule, width: 82, height: 12)
                    }
                    Spacer(minLength: 0)
                }
            }
            FrolicCard {
                Text("Sunset at Indian Rock")
                    .frolicFont(.sheetTitle)
                    .foregroundStyle(FrolicColor.ink)
                SkeletonLines(count: 2)
            }
            .frolicSkeleton()
        }
    }

    private static let spacingSamples: [(name: String, value: CGFloat)] = [
        ("4", FrolicSpacing.xxs), ("8", FrolicSpacing.xs), ("12", FrolicSpacing.sm), ("16", FrolicSpacing.md),
        ("20", FrolicSpacing.lg), ("24", FrolicSpacing.xl), ("32", FrolicSpacing.xxl), ("40", FrolicSpacing.xxxl),
    ]

    private static let radiusSamples: [(name: String, value: CGFloat)] = [
        ("14", FrolicRadius.chip), ("18", FrolicRadius.tile), ("22", FrolicRadius.group), ("28", FrolicRadius.packet),
    ]

    private static let entranceSamples = ["Maya is free till 8", "Jordan is busy now", "Dev is free till 6"]

    private var liveActivity: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Live Activity")
            LiveActivityLockScreenView(
                attributes: Self.sampleActivity,
                state: .init(leaveAt: Date.now.addingTimeInterval(8 * 60), status: "Maya's there. Dev is 4 min out.")
            )
            .background(FrolicColor.night, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            HStack(spacing: 10) {
                Button("Start") {
                    do {
                        try LiveActivityController.start(Self.sampleActivity, leaveAt: Date.now.addingTimeInterval(8 * 60), status: "Maya's there. Dev is 4 min out.")
                        activityMessage = "Started. Lock the phone to see it."
                    } catch {
                        activityMessage = "Couldn't start: \(error.localizedDescription)"
                    }
                }
                .buttonStyle(.frolicPrimary)
                .accessibilityIdentifier("gallery.liveActivity.start")
                Button("End") {
                    Task {
                        await LiveActivityController.endAll()
                        activityMessage = "Ended."
                    }
                }
                .buttonStyle(.frolicSecondary)
                .accessibilityIdentifier("gallery.liveActivity.end")
            }
            if let activityMessage {
                Text(activityMessage)
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
            }
        }
    }

    private static let sampleActivity = FrolicActivityAttributes(
        planTitle: "Sunset at Indian Rock",
        place: "Indian Rock",
        meetTime: "4:30",
        color: .pink
    )
}
#endif
