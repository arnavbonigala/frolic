import SwiftUI

enum ScreenPhase: Equatable {
    case loading
    case empty
    case error(String)
    case offline
    case ready

    static let previewable: [ScreenPhase] = [.loading, .empty, .error("Check your connection and try again."), .offline, .ready]

    var name: String {
        switch self {
        case .loading: "Loading"
        case .empty: "Empty"
        case .error: "Error"
        case .offline: "Offline"
        case .ready: "Ready"
        }
    }

    init?(name: String) {
        switch name.lowercased() {
        case "loading": self = .loading
        case "empty": self = .empty
        case "error": self = .error("Check your connection and try again.")
        case "offline": self = .offline
        case "ready": self = .ready
        default: return nil
        }
    }
}

struct PlaceholderCopy {
    var loading: String
    var emptyTitle: String
    var emptyMessage: String
    var emptyAction: String?
    var errorTitle: String
}

struct PhasePlaceholder: View {
    var phase: ScreenPhase
    var copy: PlaceholderCopy
    var color: FlowerColor = .marigold
    var onEmptyAction: (() -> Void)?
    var onRetry: (() -> Void)?

    var body: some View {
        VStack(spacing: 14) {
            switch phase {
            case .loading:
                FlowerView(state: .bud, color: color, radius: 26, stem: 30)
                    .accessibilityHidden(true)
                HStack(spacing: 10) {
                    SproutLoader()
                    Text(copy.loading)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(copy.loading)
            case .empty:
                FlowerView(state: .bloom, color: color, radius: 30, stem: 44)
                    .accessibilityHidden(true)
                message(title: copy.emptyTitle, body: copy.emptyMessage)
                if let action = copy.emptyAction, let onEmptyAction {
                    Button(action, action: onEmptyAction)
                        .buttonStyle(.frolicPrimary)
                        .padding(.top, 6)
                }
            case .error(let detail):
                FlowerView(state: .folded, color: color, radius: 30, stem: 44)
                    .accessibilityHidden(true)
                message(title: copy.errorTitle, body: detail)
                Button("Try again") { onRetry?() }
                    .buttonStyle(.frolicSecondaryWide)
                    .padding(.top, 6)
            case .offline:
                Image(systemName: "wifi.slash")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(FrolicColor.secondaryText)
                    .frame(width: 64, height: 64)
                    .background(Circle().fill(FrolicColor.chip))
                    .accessibilityHidden(true)
                message(title: "You're offline", body: "Frolic will catch up as soon as you're back online.")
                if let onRetry {
                    Button("Try again", action: onRetry)
                        .buttonStyle(.frolicSecondaryWide)
                        .padding(.top, 6)
                }
            case .ready:
                EmptyView()
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 22)
        .padding(.vertical, 28)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("state.\(phase.name.lowercased())")
    }

    private func message(title: String, body: String) -> some View {
        VStack(spacing: 8) {
            Text(title)
                .frolicFont(.sheetTitle)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
            Text(body)
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
    }
}

struct SproutLoader: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hop = false
    private let colors: [FlowerColor] = [.pink, .marigold, .lilac]

    var body: some View {
        HStack(spacing: 5) {
            ForEach(colors.indices, id: \.self) { index in
                Capsule()
                    .fill(colors[index].petal)
                    .frame(width: 7, height: 10)
                    .scaleEffect(y: hop ? 1.15 : 0.8, anchor: .bottom)
                    .offset(y: hop ? -4 : 1)
                    .rotationEffect(.degrees(hop ? 8 : -8))
                    .animation(
                        reduceMotion ? nil : .easeInOut(duration: 0.7).repeatForever(autoreverses: true).delay(Double(index) * 0.2),
                        value: hop
                    )
            }
        }
        .frame(height: 18)
        .onAppear { hop = true }
        .accessibilityHidden(true)
    }
}
