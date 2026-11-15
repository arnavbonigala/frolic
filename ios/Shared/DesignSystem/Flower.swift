import SwiftUI

struct FlowerPerson: Identifiable, Hashable {
    var id: String
    var name: String
    var color: FlowerColor
    var photo: String?
    var avatarURL: URL?

    init(id: String? = nil, name: String, color: FlowerColor, photo: String? = nil, avatarURL: URL? = nil, photoUrl: String? = nil) {
        self.id = id ?? name
        self.name = name
        self.color = color
        self.photo = photo
        self.avatarURL = avatarURL ?? photoUrl.flatMap(URL.init(string:))
    }

    var initial: String { String(name.prefix(1)).uppercased() }
}

enum FlowerState: String, CaseIterable, Hashable {
    case bloom
    case folded
    case bud

    var defaultStatus: String {
        switch self {
        case .bloom: "free"
        case .folded: "busy"
        case .bud: "planted in secret"
        }
    }
}

struct FlowerView: View {
    var state: FlowerState = .bloom
    var person: FlowerPerson?
    var color: FlowerColor?
    var radius: CGFloat = 32
    var stem: CGFloat = 50
    var showsName = false
    var status: String?
    var swayDelay: Double = 0
    var animatesIn = false
    var appearDelay: Double = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lean: Double = 0
    @State private var breathing = false
    @State private var appeared = false
    @State private var wind = Double.random(in: 0...1)

    private var tint: FlowerColor { color ?? person?.color ?? .marigold }
    private var width: CGFloat { radius * 2 + 8 }
    private var height: CGFloat { stem > 0 ? radius * 2 + stem + 4 : width }
    private var sways: Bool { state != .folded && !reduceMotion }
    private var shown: Bool { !animatesIn || appeared }

    var body: some View {
        VStack(spacing: 2) {
            head
                .frame(width: width, height: height)
                .scaleEffect(state == .bud && breathing ? 1.07 : 1, anchor: .bottom)
                .saturation(state == .folded ? 0.25 : 1)
                .opacity(state == .folded ? 0.6 : 1)
            if showsName, let person {
                Text(person.name)
                    .frolicFont(.flowerName)
                    .foregroundStyle(state == .bud ? FrolicColor.ink : FrolicColor.secondaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .rotationEffect(.degrees(sways ? lean : 0), anchor: .bottom)
        .scaleEffect(reduceMotion || shown ? 1 : 0.2, anchor: .bottom)
        .offset(y: reduceMotion || shown ? 0 : 40)
        .opacity(shown ? 1 : 0)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .onAppear(perform: startMotion)
        .task(id: sways) { await sway() }
    }

    private var accessibilityText: String {
        let detail = status ?? state.defaultStatus
        guard let person else { return "\(tint.name) flower" }
        return "\(person.name), \(detail)"
    }

    @ViewBuilder
    private var head: some View {
        switch state {
        case .bloom, .folded:
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in drawBloom(in: &context) }
                center
                    .position(x: width / 2, y: radius + 4)
            }
        case .bud:
            Canvas { context, _ in drawBud(in: &context) }
        }
    }

    @ViewBuilder
    private var center: some View {
        if let person {
            ZStack {
                Circle()
                    .fill(FrolicColor.cream)
                    .frame(width: radius + 6, height: radius + 6)
                face(for: person)
                    .frame(width: radius, height: radius)
                    .clipShape(Circle())
            }
        } else {
            Circle()
                .fill(FrolicColor.pollen)
                .overlay(Circle().stroke(FrolicColor.pollenRing, lineWidth: 2))
                .frame(width: radius * 0.68, height: radius * 0.68)
        }
    }

    @ViewBuilder
    private func face(for person: FlowerPerson) -> some View {
        if let photo = person.photo {
            Image(photo)
                .resizable()
                .scaledToFill()
        } else if let url = person.avatarURL {
            PortraitView(id: person.id, url: url, size: radius, tint: person.color)
        } else {
            initial(for: person)
        }
    }

    private func initial(for person: FlowerPerson) -> some View {
        ZStack {
            FrolicColor.cream
            Text(person.initial)
                .font(.system(size: radius * 0.5, weight: .heavy, design: .rounded))
                .foregroundStyle(person.color.deep)
        }
    }

    private func drawStem(in context: inout GraphicsContext, from top: CGFloat, leafToRight: Bool) {
        guard stem > 0 else { return }
        let cx = width / 2
        var stalk = Path()
        stalk.move(to: CGPoint(x: cx, y: top))
        stalk.addCurve(
            to: CGPoint(x: cx, y: height),
            control1: CGPoint(x: cx - 3, y: top + stem * 0.4 + (state == .bud ? 0 : radius * 0.6)),
            control2: CGPoint(x: cx + 4, y: top + stem * 0.7 + (state == .bud ? 0 : radius * 0.6))
        )
        context.stroke(stalk, with: .color(FrolicColor.stem), style: StrokeStyle(lineWidth: 4, lineCap: .round))
        let base = radius * 2 + 4
        let dir: CGFloat = leafToRight ? 1 : -1
        let y = base + stem * (leafToRight ? 0.55 : 0.45)
        var leaf = Path()
        leaf.move(to: CGPoint(x: cx, y: y))
        leaf.addCurve(
            to: CGPoint(x: cx + 26 * dir, y: base + stem * (leafToRight ? 0.5 : 0.4)),
            control1: CGPoint(x: cx + 14 * dir, y: base + stem * (leafToRight ? 0.3 : 0.2)),
            control2: CGPoint(x: cx + 24 * dir, y: base + stem * (leafToRight ? 0.38 : 0.28))
        )
        leaf.addCurve(
            to: CGPoint(x: cx, y: y),
            control1: CGPoint(x: cx + 18 * dir, y: base + stem * (leafToRight ? 0.62 : 0.52)),
            control2: CGPoint(x: cx + 8 * dir, y: base + stem * (leafToRight ? 0.62 : 0.52))
        )
        context.fill(leaf, with: .color(FrolicColor.leaf))
    }

    private func drawBloom(in context: inout GraphicsContext) {
        let cx = width / 2
        let cy = radius + 4
        drawStem(in: &context, from: cy + radius * 0.4, leafToRight: true)
        for layer in 0..<2 {
            let color = layer == 0 ? tint.deep : tint.petal
            let rx = radius * (layer == 0 ? 0.34 : 0.3)
            let ry = radius * (layer == 0 ? 0.5 : 0.46)
            let lift = radius * (layer == 0 ? 0.56 : 0.58)
            let start = layer == 0 ? 22.5 : 0
            for i in 0..<8 {
                var petal = context
                petal.translateBy(x: cx, y: cy)
                petal.rotate(by: .degrees(Double(i) * 45 + start))
                petal.fill(
                    Path(ellipseIn: CGRect(x: -rx, y: -lift - ry, width: rx * 2, height: ry * 2)),
                    with: .color(color)
                )
            }
        }
    }

    private func drawBud(in context: inout GraphicsContext) {
        let cx = width / 2
        let r = radius
        let top = r * 0.5
        let bot = r * 2 + 4
        drawStem(in: &context, from: bot - 4, leafToRight: false)
        var outer = Path()
        outer.move(to: CGPoint(x: cx, y: top))
        outer.addCurve(to: CGPoint(x: cx, y: bot), control1: CGPoint(x: cx + r * 0.75, y: top + r * 0.5), control2: CGPoint(x: cx + r * 0.7, y: bot - r * 0.3))
        outer.addCurve(to: CGPoint(x: cx, y: top), control1: CGPoint(x: cx - r * 0.7, y: bot - r * 0.3), control2: CGPoint(x: cx - r * 0.75, y: top + r * 0.5))
        context.fill(outer, with: .color(tint.deep))
        var inner = Path()
        inner.move(to: CGPoint(x: cx, y: top + r * 0.15))
        inner.addCurve(to: CGPoint(x: cx, y: bot - r * 0.1), control1: CGPoint(x: cx + r * 0.45, y: top + r * 0.6), control2: CGPoint(x: cx + r * 0.35, y: bot - r * 0.4))
        inner.addCurve(to: CGPoint(x: cx, y: top + r * 0.15), control1: CGPoint(x: cx - r * 0.1, y: bot - r * 0.5), control2: CGPoint(x: cx - r * 0.05, y: top + r * 0.6))
        context.fill(inner, with: .color(tint.petal))
        var sepal = Path()
        sepal.move(to: CGPoint(x: cx - r * 0.55, y: bot - r * 0.55))
        sepal.addCurve(to: CGPoint(x: cx + r * 0.55, y: bot - r * 0.55), control1: CGPoint(x: cx - r * 0.3, y: bot - r * 0.05), control2: CGPoint(x: cx + r * 0.3, y: bot - r * 0.05))
        sepal.addCurve(to: CGPoint(x: cx - r * 0.55, y: bot - r * 0.55), control1: CGPoint(x: cx + r * 0.2, y: bot + r * 0.05), control2: CGPoint(x: cx - r * 0.2, y: bot + r * 0.05))
        context.fill(sepal, with: .color(FrolicColor.leaf))
    }

    private func startMotion() {
        if animatesIn, !appeared {
            withAnimation((reduceMotion ? Animation.easeInOut(duration: 0.4) : .spring(response: 0.6, dampingFraction: 0.62)).delay(appearDelay)) {
                appeared = true
            }
        }
        guard !reduceMotion else { return }
        if state == .bud {
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) {
                breathing = true
            }
        }
    }

    private var gust: Animation { .easeInOut(duration: tempo * 0.85) }

    private var reach: Double { 2.2 + (1 - wind) * 1.6 }

    private var tempo: Double { 2.4 + wind * 1.4 }

    @MainActor
    private func sway() async {
        guard sways else {
            lean = 0
            return
        }
        try? await Task.sleep(for: .seconds(swayDelay + wind * 1.2))
        while !Task.isCancelled {
            withAnimation(gust) { lean = reach * Double.random(in: 0.55...1) }
            try? await Task.sleep(for: .seconds(tempo * Double.random(in: 0.9...1.1)))
            withAnimation(gust) { lean = -reach * Double.random(in: 0.3...0.7) }
            try? await Task.sleep(for: .seconds(tempo * Double.random(in: 0.95...1.3)))
        }
    }
}
