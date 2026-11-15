import SwiftUI

struct Skeleton: View {
    enum Shape {
        case rounded(CGFloat)
        case capsule
        case circle
    }

    var shape: Shape = .rounded(FrolicRadius.chip)
    var width: CGFloat?
    var height: CGFloat

    var body: some View {
        SkeletonShimmer {
            shapeView.fill(FrolicColor.chip)
        }
        .frame(width: width, height: height)
        .accessibilityHidden(true)
    }

    private var shapeView: AnyShape {
        switch shape {
        case .rounded(let radius): AnyShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        case .capsule: AnyShape(Capsule())
        case .circle: AnyShape(Circle())
        }
    }
}

struct SkeletonLines: View {
    var count: Int = 2

    var body: some View {
        VStack(alignment: .leading, spacing: FrolicSpacing.xs) {
            ForEach(0..<max(count, 1), id: \.self) { index in
                Skeleton(shape: .rounded(FrolicRadius.seed), width: index == max(count, 1) - 1 ? 168 : nil, height: 14)
            }
        }
        .accessibilityHidden(true)
    }
}

private struct SkeletonShimmer<Content: View>: View {
    @ViewBuilder var content: Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sweeping = false

    var body: some View {
        content
            .overlay {
                if !reduceMotion {
                    GeometryReader { proxy in
                        LinearGradient(
                            colors: [.clear, FrolicColor.paper.opacity(0.75), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: max(proxy.size.width * 0.55, 40))
                        .offset(x: sweeping ? proxy.size.width : -proxy.size.width)
                    }
                    .allowsHitTesting(false)
                }
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) {
                    sweeping = true
                }
            }
    }
}

private struct FrolicSkeletonModifier: ViewModifier {
    var active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sweeping = false

    @ViewBuilder
    func body(content: Content) -> some View {
        if active {
            shimmer(content.redacted(reason: .placeholder))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Loading")
        } else {
            content
        }
    }

    private func shimmer(_ content: some View) -> some View {
        content
            .overlay {
                if !reduceMotion {
                    GeometryReader { proxy in
                        LinearGradient(
                            colors: [.clear, FrolicColor.paper.opacity(0.6), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: max(proxy.size.width * 0.55, 40))
                        .offset(x: sweeping ? proxy.size.width : -proxy.size.width)
                    }
                    .allowsHitTesting(false)
                }
            }
            .task(id: active) {
                guard active, !reduceMotion else { return }
                sweeping = false
                withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) {
                    sweeping = true
                }
            }
    }
}

extension View {
    func frolicSkeleton(_ active: Bool = true) -> some View {
        modifier(FrolicSkeletonModifier(active: active))
    }
}
