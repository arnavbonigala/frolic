import SwiftUI

enum PlanHero {
    static let fallback = "plan-free-stuff"

    static func resolve(_ key: String) -> String {
        #if canImport(UIKit)
        return UIImage(named: key) == nil ? fallback : key
        #else
        return key
        #endif
    }
}

struct SeedPacket<Content: View>: View {
    var label: String
    var number: String?
    var image: String?
    var imageDescription: String?
    var bandColor: Color = FrolicColor.band
    var hostedBy: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(label)
                    .font(.system(size: 12, weight: .bold))
                    .tracking(0.3)
                Spacer(minLength: 8)
                if let number {
                    Text(number)
                        .font(.system(size: 12, weight: .semibold))
                        .opacity(0.7)
                }
            }
            .foregroundStyle(FrolicColor.bandText)
            .padding(.horizontal, 16)
            .frame(minHeight: 36)
            .background(bandColor)
            .accessibilityElement(children: .combine)
            if let image {
                Image(PlanHero.resolve(image))
                    .resizable()
                    .scaledToFill()
                    .frame(height: 118)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
                    .accessibilityLabel(imageDescription ?? "")
                    .accessibilityHidden(imageDescription == nil)
            }
            VStack(alignment: .leading, spacing: 10) {
                content
                if let hostedBy {
                    Text("Hosted by \(hostedBy)")
                        .frolicFont(.footnote)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .accessibilityIdentifier("plan.hostedBy")
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)
            .padding(.bottom, 16)
        }
        .background(FrolicColor.paper)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .shadow(color: Color(hex: 0x78501E, opacity: 0.12), radius: 17, y: 14)
    }
}

struct WhyThis: View {
    var text: String

    var body: some View {
        (Text("Why this: ").fontWeight(.semibold).foregroundColor(FrolicColor.ink) + Text(text))
            .frolicFont(.footnote)
            .foregroundStyle(FrolicColor.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct FrolicCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
            .shadow(color: Color(hex: 0x78501E, opacity: 0.08), radius: 13, y: 10)
    }
}

struct FrolicGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
    }
}

struct FrolicCell<Leading: View>: View {
    var title: String
    var subtitle: String?
    var isFree: Bool?
    var showsChevron = false
    var showsDivider = false
    @ViewBuilder var leading: Leading

    var body: some View {
        HStack(spacing: 12) {
            leading
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .frolicFont(.bodyEmphasis)
                    .foregroundStyle(FrolicColor.ink)
                if let subtitle {
                    HStack(spacing: 6) {
                        if let isFree { StatusDot(isFree: isFree) }
                        Text(subtitle)
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                }
            }
            Spacer(minLength: 0)
            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FrolicColor.ink.opacity(0.4))
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .overlay(alignment: .top) {
            if showsDivider {
                FrolicColor.line.frame(height: 0.5).padding(.leading, 68)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct SectionHeader: View {
    var title: String
    var systemImage: String?

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage).imageScale(.small).accessibilityHidden(true)
            }
            Text(title)
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(FrolicColor.tertiaryText)
        .padding(.horizontal, 4)
        .padding(.top, 26)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
}

struct ScreenTitle: View {
    var title: String
    var subtitle: String?
    var identifier: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .frolicFont(.largeTitle)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier(identifier.map { "\($0).title" } ?? "")
            if let subtitle {
                Text(subtitle)
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .accessibilityIdentifier(identifier.map { "\($0).subtitle" } ?? "")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
