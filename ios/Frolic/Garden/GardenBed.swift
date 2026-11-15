import SwiftUI

struct GardenBed: View {
    var countLine: String
    var sinceLine: String
    var yourFlower: Bool

    @ScaledMetric(relativeTo: .title3) private var countSize: CGFloat = 20
    @ScaledMetric(relativeTo: .footnote) private var captionSize: CGFloat = 13

    private let colors: [FlowerColor] = [.pink, .marigold, .cobalt, .moss, .lilac, .tomato, .pink, .moss, .marigold, .cobalt, .lilac, .tomato]
    private let stems: [CGFloat] = [30, 52, 40, 64, 36, 58, 44, 70, 32, 50, 42, 60]

    var body: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(
                stops: [
                    .init(color: FrolicColor.skyTop, location: 0),
                    .init(color: FrolicColor.skyMid, location: 0.6),
                    .init(color: FrolicColor.meadow, location: 0.6),
                    .init(color: FrolicColor.meadowDeep, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            HStack(alignment: .bottom, spacing: -10) {
                ForEach(colors.indices, id: \.self) { index in
                    FlowerView(color: colors[index], radius: 12, stem: stems[index], swayDelay: Double(index) * 0.4)
                }
                if yourFlower {
                    GardenFlower(person: nil, color: .tomato, radius: 20, stem: 74, swayDelay: 1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(countLine)
                    .font(.system(size: countSize, weight: .heavy, design: .rounded))
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityIdentifier("garden.count")
                Text(sinceLine)
                    .font(.system(size: captionSize, weight: .medium))
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            .padding(.leading, 16)
            .padding(.top, 14)
        }
        .frame(height: 200)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .contain)
    }
}

struct GardenToast: View {
    var text: String

    var body: some View {
        Text(text)
            .frolicFont(.subheadline)
            .foregroundStyle(FrolicColor.cream)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Capsule().fill(FrolicColor.ink))
            .accessibilityIdentifier("garden.toast")
    }
}

private struct GardenToastModifier: ViewModifier {
    @Binding var text: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let text {
                    GardenToast(text: text)
                        .padding(.top, 8)
                        .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                        .task(id: text) {
                            try? await Task.sleep(for: .seconds(3))
                            guard !Task.isCancelled else { return }
                            withAnimation(.easeOut(duration: 0.2)) { self.text = nil }
                        }
                }
            }
            .animation(reduceMotion ? .easeOut(duration: 0.2) : .spring(response: 0.4, dampingFraction: 0.8), value: text)
    }
}

extension View {
    func gardenToast(_ text: Binding<String?>) -> some View {
        modifier(GardenToastModifier(text: text))
    }
}
