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
            .ignoresSafeArea(edges: .bottom)
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
        VStack(spacing: 10) {
            Text(title)
                .font(.system(.largeTitle, design: .serif, weight: .heavy))
                .multilineTextAlignment(.center)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier(identifier ?? "")
                .fixedSize(horizontal: false, vertical: true)
            if let subcopy {
                Text(subcopy)
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 28)
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

struct OnboardingNotice: View {
    var title: String
    var detail: String
    var actionTitle: String?
    var onAction: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(FlowerColor.marigold.deep)
                .padding(.top, 1)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .frolicFont(.bodyEmphasis)
                    .foregroundStyle(FrolicColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail)
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if let actionTitle, let onAction {
                Button(actionTitle, action: onAction)
                    .buttonStyle(.frolicText)
                    .frame(minHeight: 44)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
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
    var onBack: (() -> Void)?
    @ViewBuilder var content: Content
    @ViewBuilder var bar: Bar

    init(onBack: (() -> Void)? = nil, @ViewBuilder content: () -> Content, @ViewBuilder bar: () -> Bar) {
        self.onBack = onBack
        self.content = content()
        self.bar = bar()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let onBack {
                    Button(action: onBack) {
                        Label("Back", systemImage: "chevron.left")
                            .frolicFont(.bodyEmphasis)
                            .foregroundStyle(FrolicColor.ink)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, -24)
                    .accessibilityIdentifier("onboarding.back")
                }
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
