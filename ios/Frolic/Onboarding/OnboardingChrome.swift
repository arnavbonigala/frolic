import SwiftUI

struct OnboardingBottomBar<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 4) {
            content
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 16)
        .background(
            LinearGradient(
                colors: [FrolicColor.cream.opacity(0), FrolicColor.cream.opacity(0.96)],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)
        )
    }
}

struct OnboardingTitle: View {
    var title: String
    var subcopy: String?
    var identifier: String?
    var titleSize: CGFloat = 34

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: titleSize, weight: .heavy, design: .rounded))
                .tracking(-0.3)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier(identifier ?? "")
                .fixedSize(horizontal: false, vertical: true)
            if let subcopy {
                Text(subcopy)
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct OnboardingStateCard: View {
    var title: String
    var detail: String
    var actionTitle: String?
    var secondaryTitle: String?
    var onAction: (() -> Void)?
    var onSecondary: (() -> Void)?
    var icon: String = "exclamationmark.circle.fill"
    var identifier: String = "state.error"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                FlowerView(state: .folded, color: .marigold, radius: 20, stem: 26)
                    .accessibilityHidden(true)
                Text(title)
                    .frolicFont(.sheetTitle)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(detail)
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            if let actionTitle, let onAction {
                Button(actionTitle, action: onAction)
                    .buttonStyle(.frolicSecondary)
            }
            if let secondaryTitle, let onSecondary {
                Button(secondaryTitle, action: onSecondary)
                    .buttonStyle(.frolicText)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }
}

struct OnboardingSpinner: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spinning = false

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.72)
            .stroke(FrolicColor.ink, style: StrokeStyle(lineWidth: 2, lineCap: .round))
            .frame(width: 18, height: 18)
            .rotationEffect(.degrees(spinning ? 360 : 0))
            .animation(reduceMotion ? nil : .linear(duration: 1).repeatForever(autoreverses: false), value: spinning)
            .accessibilityHidden(true)
            .onAppear { spinning = !reduceMotion }
    }
}

struct OnboardingChipFlow: View {
    var tags: [TasteTag]
    var identifierPrefix: String

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(tags) { tag in
                FrolicChip(text: tag.label, size: .big)
                    .accessibilityIdentifier("\(identifierPrefix).chip.\(tag.identifierSlug)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("\(identifierPrefix).chips")
    }
}

struct OnboardingPage<Content: View, Bar: View>: View {
    @ViewBuilder var content: Content
    @ViewBuilder var bar: Bar

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .padding(.horizontal, 18)
            .padding(.top, 34)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OnboardingBottomBar { bar }
        }
        .background(SkyBackground().ignoresSafeArea())
    }
}
