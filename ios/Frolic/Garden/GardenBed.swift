import SwiftUI

struct GardenBed: View {
    var countLine: String
    var sinceLine: String
    var yourFlower: Bool
    var colors: [FlowerColor] = []
    var health: GardenHealthState = .fine

    @ScaledMetric(relativeTo: .title3) private var countSize: CGFloat = 20
    @ScaledMetric(relativeTo: .footnote) private var captionSize: CGFloat = 13
    @ScaledMetric(relativeTo: .title3) private var bedHeight: CGFloat = 200

    init(count: Int, caption: String) {
        self.init(countLine: "\(count) frolics", sinceLine: caption, yourFlower: false, colors: [.pink, .marigold, .cobalt, .moss, .lilac, .tomato, .pink, .moss, .marigold, .cobalt, .lilac, .tomato])
    }

    init(countLine: String, sinceLine: String, yourFlower: Bool, colors: [FlowerColor], health: GardenHealthState = .fine) {
        self.health = health
        self.countLine = countLine
        self.sinceLine = sinceLine
        self.yourFlower = yourFlower
        self.colors = colors
    }

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
                    FlowerView(color: colors[index], radius: 13, stem: stems[index % stems.count], swayDelay: Double(index) * 0.4)
                        .scaleEffect(health.flowerScale, anchor: .bottom)
                        .saturation(health.saturation)
                        .rotationEffect(.degrees(health.droop * (index.isMultiple(of: 2) ? 1 : -1) * (0.6 + Double(index % 3) * 0.25)), anchor: .bottom)
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
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("garden.count")
                Text(sinceLine)
                    .font(.system(size: captionSize, weight: .medium))
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.leading, 16)
            .padding(.trailing, 16)
            .padding(.top, 14)
        }
        .frame(height: bedHeight)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
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
