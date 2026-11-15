import SwiftUI

struct GardenHealthRow: View {
    var health: GardenHealth
    var onFree: () -> Void

    var body: some View {
        if let line = health.line, !line.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(line)
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                if health.state.needsWater, health.cta != nil {
                    Button("I'm free", action: onFree)
                        .buttonStyle(.frolicSecondaryWide)
                        .accessibilityIdentifier("garden.health.free")
                }
            }
            .padding(.top, 12)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("garden.health")
        }
    }
}

struct GardenMilestoneRow: View {
    var milestone: GardenMilestone
    var count: Int

    var body: some View {
        if let line = milestone.line, !line.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FrolicColor.pollenRing)
                        .accessibilityHidden(true)
                    Text(line)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                if let target = milestone.nextAt, target > 0 {
                    ProgressView(value: min(max(Double(count) / target, 0), 1))
                        .tint(FrolicColor.pollenRing)
                        .accessibilityHidden(true)
                }
            }
            .padding(14)
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
            .padding(.top, 12)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("garden.milestone")
        }
    }
}

struct GardenCollectionShelf: View {
    var collection: GardenCollection

    var body: some View {
        if !collection.varieties.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeader(title: "Your collection")
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        ForEach(collection.varieties) { variety in
                            GardenVarietyCard(variety: variety)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .scrollIndicators(.hidden)
                .scrollClipDisabled()
            }
            .accessibilityIdentifier("garden.collection")
        }
    }
}

private struct GardenVarietyCard: View {
    var variety: GardenVariety

    @ScaledMetric(relativeTo: .footnote) private var cardWidth: CGFloat = 128
    @ScaledMetric(relativeTo: .body) private var cardMinHeight: CGFloat = 150
    @ScaledMetric(relativeTo: .footnote) private var nameSize: CGFloat = 14

    var body: some View {
        VStack(spacing: 6) {
            FlowerView(color: variety.color, radius: 20, stem: 18)
                .saturation(variety.unlocked ? 1 : 0)
                .opacity(variety.unlocked ? 1 : 0.28)
                .accessibilityHidden(true)
            Text(variety.name)
                .font(.system(size: nameSize, weight: .semibold))
                .foregroundStyle(variety.unlocked ? FrolicColor.ink : FrolicColor.secondaryText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text(detail)
                .frolicFont(.flowerName)
                .foregroundStyle(FrolicColor.secondaryText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(width: cardWidth)
        .frame(minHeight: cardMinHeight, alignment: .top)
        .background(FrolicColor.paper.opacity(variety.unlocked ? 1 : 0.6), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    private var detail: String {
        if variety.unlocked { return variety.flowerCount == 1 ? "1 grown" : "\(variety.flowerCount) grown" }
        return variety.hint ?? ""
    }

    private var spoken: String {
        if variety.unlocked { return "\(variety.name), \(detail)" }
        guard let hint = variety.hint, !hint.isEmpty else { return "\(variety.name), locked" }
        return "\(variety.name), locked. \(hint)"
    }
}

struct GardenOnThisDayCard: View {
    var card: GardenOnThisDay

    @ScaledMetric(relativeTo: .caption2) private var dateSize: CGFloat = 12
    @ScaledMetric(relativeTo: .callout) private var titleSize: CGFloat = 16

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(FrolicColor.chip)
                if let url = card.photoUrl, !url.isEmpty {
                    GardenRemoteImage(url: url, heroKey: card.heroKey)
                } else {
                    GardenArtwork(key: card.heroKey, seed: card.title ?? "")
                }
            }
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(card.dateLine ?? "On this day")
                    .font(.system(size: dateSize, weight: .bold))
                    .tracking(0.3)
                    .foregroundStyle(FrolicColor.tertiaryText)
                if let title = card.title {
                    Text(title)
                        .font(.system(size: titleSize, weight: .semibold))
                        .foregroundStyle(FrolicColor.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let line = card.line {
                    Text(line)
                        .frolicFont(.footnote)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .shadow(color: Color(hex: 0x78501E, opacity: 0.07), radius: 9, y: 6)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("garden.onThisDay")
    }
}
