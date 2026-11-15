import SwiftUI

enum TodayMedia {
    static var siteURL: String? {
        ConvexConfig.siteURL ?? ConvexConfig.validated(Bundle.main.object(forInfoDictionaryKey: "FrolicSiteURL") as? String)
    }

    static func portraitAsset(_ raw: String?) -> String? {
        guard let raw, let range = raw.range(of: "/p/avatar/") else { return nil }
        let key = raw[range.upperBound...].split(separator: ".").first.map(String.init) ?? ""
        let name = "portrait-" + key
        return UIImage(named: name) != nil ? name : nil
    }

    static func url(_ raw: String?) -> URL? {
        guard let raw, !raw.isEmpty else { return nil }
        if let site = siteURL, let parsed = URL(string: raw), let host = parsed.host,
           host == "127.0.0.1" || host == "localhost" {
            return URL(string: site + parsed.path)
        }
        return URL(string: raw)
    }
}

struct TodayFlower: View {
    var person: TodayPerson?
    var state: FlowerState = .bloom
    var color: FlowerColor = .marigold
    var radius: CGFloat = 28
    var stem: CGFloat = 36
    var name: String?
    var status: String?
    var swayDelay: Double = 0
    var animatesIn = false
    var appearDelay: Double = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var swayed = false
    @State private var breathing = false
    @State private var appeared = false

    private var tint: FlowerColor { person?.flower ?? color }
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
            if let name {
                Text(name)
                    .frolicFont(.flowerName)
                    .foregroundStyle(state == .bud ? FrolicColor.ink : FrolicColor.secondaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .rotationEffect(.degrees(sways ? (swayed ? 2.6 : -2.6) : 0), anchor: .bottom)
        .offset(y: sways && swayed ? -1.5 : 0)
        .scaleEffect(reduceMotion || shown ? 1 : 0.2, anchor: .bottom)
        .offset(y: reduceMotion || shown ? 0 : 40)
        .opacity(shown ? 1 : 0)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .onAppear(perform: startMotion)
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
    private func face(for person: TodayPerson) -> some View {
        if let asset = TodayMedia.portraitAsset(person.photoUrl) {
            Image(asset).resizable().scaledToFill()
        } else if let url = TodayMedia.url(person.photoUrl) {
            PortraitView(id: person.id, url: url, size: radius, tint: person.flower)
        } else {
            initial(person)
        }
    }

    private func initial(_ person: TodayPerson) -> some View {
        ZStack {
            FrolicColor.cream
            Text(String((person.name == "You" ? MyAvatar.shared.name ?? person.name : person.name).prefix(1)).uppercased())
                .font(.system(size: radius * 0.5, weight: .heavy, design: .rounded))
                .foregroundStyle(person.flower.deep)
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
        if sways {
            withAnimation(.easeInOut(duration: 4.6 + swayDelay.truncatingRemainder(dividingBy: 1.3)).repeatForever(autoreverses: true).delay(swayDelay)) {
                swayed = true
            }
        }
        if state == .bud {
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) {
                breathing = true
            }
        }
    }
}
