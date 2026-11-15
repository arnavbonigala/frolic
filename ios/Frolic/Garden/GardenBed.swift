import SwiftUI

struct GardenYourFlower {
    var index: Int
    var color: FlowerColor
    var person: GardenPerson?
}

struct GardenBed: View {
    var countLine: String
    var sinceLine: String
    var yourFlower: GardenYourFlower?
    var colors: [FlowerColor] = []
    var health: GardenHealthState = .fine

    @ScaledMetric(relativeTo: .title3) private var countSize: CGFloat = 20
    @ScaledMetric(relativeTo: .footnote) private var captionSize: CGFloat = 13

    init(count: Int, caption: String) {
        self.init(
            countLine: "\(count) frolics",
            sinceLine: caption,
            yourFlower: nil,
            colors: [.pink, .marigold, .cobalt, .moss, .lilac, .tomato, .pink, .moss, .marigold, .cobalt, .lilac, .tomato]
        )
    }

    init(countLine: String, sinceLine: String, yourFlower: GardenYourFlower? = nil, colors: [FlowerColor], health: GardenHealthState = .fine) {
        self.health = health
        self.countLine = countLine
        self.sinceLine = sinceLine
        self.yourFlower = yourFlower
        self.colors = colors
    }

    private let stems: [CGFloat] = [30, 52, 40, 64, 36, 58, 44, 70, 32, 50, 42, 60]
    private let flowerRadius: CGFloat = 13
    private let yourRadius: CGFloat = 20
    private let yourStem: CGFloat = 74
    private let yourDrop: CGFloat = 4
    private let widestPitch: CGFloat = 24
    private let bedInset: CGFloat = 8
    private let bedBottom: CGFloat = 6
    private let cap = 14

    private var flowerWidth: CGFloat { flowerRadius * 2 + 8 }
    private var yourWidth: CGFloat { yourRadius * 2 + 8 }

    private var shown: [FlowerColor] { Array(colors.prefix(cap)) }

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
            GeometryReader { proxy in
                let pitch = pitch(for: shown.count, in: proxy.size.width)
                ZStack(alignment: .bottomLeading) {
                    ForEach(shown.indices, id: \.self) { slot in
                        bloom(shown[slot], slot: slot, pitch: pitch)
                    }
                }
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .bottomLeading)
                .offset(y: -bedBottom)
            }
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

    private func pitch(for count: Int, in width: CGFloat) -> CGFloat {
        guard count > 1 else { return widestPitch }
        let span = max(width - bedInset * 2 - flowerWidth, 0)
        return min(widestPitch, span / CGFloat(count - 1))
    }

    private func bloom(_ color: FlowerColor, slot: Int, pitch: CGFloat) -> some View {
        let yours = yourFlower?.index == slot
        let x = bedInset + CGFloat(slot) * pitch + (yours ? flowerWidth - yourWidth : 0)
        return GardenFlower(
            person: yours ? yourFlower?.person : nil,
            color: yours ? (yourFlower?.color ?? color) : color,
            radius: yours ? yourRadius : flowerRadius,
            stem: yours ? yourStem : stems[slot % stems.count],
            swayDelay: Double(slot) * 0.4
        )
        .scaleEffect(health.flowerScale, anchor: .bottom)
        .saturation(health.saturation)
        .rotationEffect(.degrees(health.droop * (slot.isMultiple(of: 2) ? 1 : -1) * (0.6 + Double(slot % 3) * 0.25)), anchor: .bottom)
        .offset(x: max(bedInset, x), y: yours ? yourDrop : 0)
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
