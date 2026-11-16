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

struct PetalLoader: View {
    var tint: Color?
    var size: CGFloat = 18
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if reduceMotion {
                flower(open: 5, spin: 0)
            } else {
                TimelineView(.animation) { timeline in
                    let t = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.8)
                    flower(open: t / 0.22, spin: t * 40)
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var shading: GraphicsContext.Shading {
        tint.map { .color($0) } ?? .foreground
    }

    private func flower(open: Double, spin: Double) -> some View {
        Canvas { context, canvas in
            let center = CGPoint(x: canvas.width / 2, y: canvas.height / 2)
            let r = canvas.width / 2
            for i in 0..<5 {
                let grow = open >= 7 ? max(0, 1 - (open - 7) * 0.9) : min(1, max(0, open - Double(i)))
                guard grow > 0 else { continue }
                var petal = context
                petal.opacity = 0.35 + 0.65 * grow
                petal.translateBy(x: center.x, y: center.y)
                petal.rotate(by: .degrees(Double(i) * 72 + spin))
                petal.scaleBy(x: grow, y: grow)
                petal.fill(Path(ellipseIn: CGRect(x: -r * 0.26, y: -r * 1.0, width: r * 0.52, height: r * 0.68)), with: shading)
            }
            let dot = r * 0.32
            context.fill(Path(ellipseIn: CGRect(x: center.x - dot, y: center.y - dot, width: dot * 2, height: dot * 2)), with: shading)
        }
    }
}

struct StaggeredArrival: ViewModifier {
    var index: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var arrived = false

    func body(content: Content) -> some View {
        content
            .opacity(arrived ? 1 : 0)
            .offset(y: arrived || reduceMotion ? 0 : 10)
            .onAppear {
                guard !arrived else { return }
                let animation: Animation = reduceMotion ? .easeOut(duration: 0.25) : .spring(response: 0.45, dampingFraction: 0.8)
                withAnimation(animation.delay(Double(min(index, 8)) * 0.05)) { arrived = true }
            }
    }
}

struct TabArrival: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var arrived = false

    func body(content: Content) -> some View {
        content
            .opacity(arrived ? 1 : 0.4)
            .scaleEffect(arrived || reduceMotion ? 1 : 0.985)
            .onAppear {
                withAnimation(reduceMotion ? .easeOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.85)) { arrived = true }
            }
            .onDisappear { arrived = false }
    }
}

extension View {
    func staggeredArrival(_ index: Int) -> some View {
        modifier(StaggeredArrival(index: index))
    }

    func tabArrival() -> some View {
        modifier(TabArrival())
    }
}
