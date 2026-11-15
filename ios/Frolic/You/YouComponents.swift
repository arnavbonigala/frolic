import SwiftUI

struct YouFlowerHead: View {
    var name: String
    var color: FlowerColor
    var photoURL: String?
    var radius: CGFloat
    var state: FlowerState = .bloom
    var status: String?

    var body: some View {
        FlowerView(
            state: state,
            person: FlowerPerson(name: name, color: color),
            radius: radius,
            stem: 0,
            status: status
        )
        .overlay {
            avatar
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if state != .bud, let photoURL, let url = URL(string: photoURL) {
            AsyncImage(url: url, transaction: Transaction(animation: nil)) { phase in
                if case .success(let image) = phase {
                    image
                        .resizable()
                        .scaledToFill()
                } else {
                    Color.clear
                }
            }
            .frame(width: radius, height: radius)
            .clipShape(Circle())
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

struct YouSettingRow<Content: View>: View {
    var showsDivider = true
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) {
                if showsDivider {
                    FrolicColor.line.frame(height: 0.5)
                }
            }
    }
}

struct YouValueRow<Value: View>: View {
    var label: String
    @ViewBuilder var value: Value

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                title
                value
            }
        } else {
            HStack(spacing: 12) {
                title
                Spacer(minLength: 8)
                value
            }
        }
    }

    private var title: some View {
        Text(label)
            .frolicFont(.body)
            .foregroundStyle(FrolicColor.ink)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct YouMenuValue: View {
    var text: String

    var body: some View {
        HStack(spacing: 5) {
            Text(text)
                .frolicFont(.body)
                .foregroundStyle(FrolicColor.secondaryText)
                .multilineTextAlignment(.trailing)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(FrolicColor.tertiaryText)
                .accessibilityHidden(true)
        }
        .frame(minHeight: 44)
    }
}

struct YouNote: View {
    var text: String
    var identifier: String?

    var body: some View {
        Text(text)
            .frolicFont(.footnote)
            .foregroundStyle(FrolicColor.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier(identifier ?? "")
    }
}

struct YouBanner: View {
    var systemImage: String
    var title: String
    var message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(FrolicColor.secondaryText)
                .frame(width: 22, height: 22)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .frolicFont(.bodyEmphasis)
                    .foregroundStyle(FrolicColor.ink)
                Text(message)
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FrolicColor.chip, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct YouSetupRow: View {
    var label: String
    var value: String
    var identifier: String

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .frolicFont(.body)
                .foregroundStyle(FrolicColor.ink)
            Spacer(minLength: 8)
            Text(value)
                .frolicFont(.body)
                .foregroundStyle(FrolicColor.secondaryText)
                .multilineTextAlignment(.trailing)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FrolicColor.ink.opacity(0.4))
                .accessibilityHidden(true)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}
