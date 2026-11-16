import SafariServices
import SwiftUI

struct TodaySheetHost: View {
    var sheet: TodayStore.Sheet
    var store: TodayStore

    var body: some View {
        Group {
            switch sheet {
            case .onlyIf: TodayOnlyIfSheet(store: store)
            case .share: TodayShareSheet(store: store)
            case .bail: TodayBailSheet(store: store)
            case .hold: TodayHoldSheet(store: store)
            case .free: TodayFreeSheet(store: store)
            case .imFree: TodayImFreeSheet(store: store)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(38)
        .presentationBackground(FrolicColor.cream)
    }
}

private struct TodaySheetTitle: View {
    var text: String
    var identifier: String
    var centered = false

    var body: some View {
        Text(text)
            .font(.system(.title, design: .serif, weight: .heavy))
            .foregroundStyle(FrolicColor.ink)
            .multilineTextAlignment(centered ? .center : .leading)
            .frame(maxWidth: centered ? .infinity : nil, alignment: centered ? .center : .leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier(identifier)
    }
}

private struct TodaySheetBody: View {
    var text: String
    var identifier: String = ""
    var centered = false

    var body: some View {
        Text(text)
            .todayFont(15, relativeTo: .subheadline)
            .foregroundStyle(FrolicColor.secondaryText)
            .multilineTextAlignment(centered ? .center : .leading)
            .frame(maxWidth: centered ? .infinity : nil, alignment: centered ? .center : .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 6)
            .accessibilityIdentifier(identifier)
    }
}

private struct TodayOnlyIfSheet: View {
    @Bindable var store: TodayStore
    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        let friends = store.allFriends
        let picked = friends.filter { store.picks.contains($0.userId) }
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TodaySheetTitle(text: "I'm down only with…", identifier: "onlyIf.title")
                TodaySheetBody(text: "Pick who has to be there. It only happens if they all say yes. Nobody ever finds out you picked them.", identifier: "onlyIf.body")
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(friends) { friend in
                        let on = store.picks.contains(friend.userId)
                        Button {
                            store.togglePick(friend.userId)
                        } label: {
                            HStack(spacing: 8) {
                                TodayFlower(person: friend, radius: 20, stem: 0, swayDelay: 0)
                                    .accessibilityHidden(true)
                                Text(friend.name)
                                    .todayFont(14, .semibold, relativeTo: .subheadline)
                                    .foregroundStyle(FrolicColor.ink)
                                    .lineLimit(1)
                                Spacer(minLength: 0)
                                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundStyle(on ? FrolicColor.ink : FrolicColor.disabled)
                                    .accessibilityHidden(true)
                            }
                            .padding(.horizontal, 10)
                            .frame(minHeight: 72)
                            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .stroke(on ? FrolicColor.ink : FrolicColor.hairline, lineWidth: on ? 2 : 0.5)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(friend.name)
                        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                        .accessibilityIdentifier("onlyIf.friend.\(friend.name.lowercased())")
                    }
                }
                .padding(.top, 14)
                Button(picked.isEmpty ? "Pick at least one friend" : "I'm down if " + TodayCopy.ifInAre(picked.map(\.name))) {
                    store.tapDown(onlyIf: picked)
                }
                .buttonStyle(.frolicPrimary)
                .disabled(picked.isEmpty)
                .padding(.top, 14)
                .accessibilityIdentifier("onlyIf.confirm")
            }
        }
        .scrollBounceBehavior(.basedOnSize)
    }
}

private struct TodayShareSheet: View {
    var store: TodayStore
    @State private var previewURL: TodayWebPage?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TodaySheetTitle(text: "Send to the group chat", identifier: "share.sheet.title")
                VStack(alignment: .trailing, spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        TodayHeroImage(asset: TodayCopy.heroAsset(store.plan), remote: store.plan?.place?.photoUrl, description: nil)
                            .frame(height: 110)
                            .frame(maxWidth: .infinity)
                            .clipped()
                        VStack(alignment: .leading, spacing: 2) {
                            Text(store.plan?.title ?? "")
                                .todayFont(14, .semibold, relativeTo: .subheadline)
                                .foregroundStyle(Color(hex: 0x111111))
                            Text("frolic.app · say you're down, secretly")
                                .todayFont(12, relativeTo: .caption)
                                .foregroundStyle(Color(hex: 0x555555))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(hex: 0xE9E9EB))
                        Text("Anyone free for this? Say you're down on the link. It stays secret unless someone else is too.")
                            .todayFont(15, relativeTo: .body)
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                    }
                    .frame(maxWidth: 260)
                    .background(Color(hex: 0x2C7BF6))
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 4, topTrailingRadius: 18, style: .continuous))
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(14)
                .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .padding(.top, 12)
                .accessibilityElement(children: .combine)
                Text("Friends can say yes from the link without the app. Anyone who taps joins your crew.")
                    .todayFont(13, relativeTo: .footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                if let item = store.shareItem {
                    ShareLink(item: item.url, subject: Text(item.title), message: Text("Anyone free for this? Say you're down on the link. It stays secret unless someone else is too.")) {
                        Text("Send")
                    }
                    .buttonStyle(.frolicPrimary)
                    .padding(.top, 14)
                    .accessibilityIdentifier("share.sheet.send")
                    Button("See what friends see") { previewURL = TodayWebPage(url: item.url) }
                        .buttonStyle(.frolicText)
                        .frame(maxWidth: .infinity)
                        .accessibilityIdentifier("share.sheet.preview")
                } else {
                    Button {
                        store.prepareShare()
                    } label: {
                        HStack(spacing: 8) {
                            if store.shareBusy { PetalLoader() }
                            Text(store.shareBusy ? "One sec." : "Try again")
                        }
                    }
                    .buttonStyle(.frolicPrimary)
                    .disabled(store.shareBusy)
                    .padding(.top, 14)
                    .accessibilityIdentifier("share.sheet.send")
                }
            }
        }
        .scrollBounceBehavior(.basedOnSize)
        .sheet(item: $previewURL) { page in
            TodaySafari(url: page.url).ignoresSafeArea()
        }
    }
}

private struct TodayBailSheet: View {
    var store: TodayStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TodaySheetTitle(text: "Can't make it?", identifier: "bail.sheet.title")
            TodaySheetBody(text: "Your crew will see a spot open up.", identifier: "bail.sheet.body")
            HStack(spacing: 10) {
                Button("I'll still go") { store.sheet = nil }
                    .buttonStyle(.frolicSecondaryWide)
                    .accessibilityIdentifier("bail.sheet.yes")
                Button("Sit this one out") { store.sitOut() }
                    .buttonStyle(.frolicPrimary)
                    .accessibilityIdentifier("bail.sheet.no")
            }
            .padding(.top, 16)
            Spacer(minLength: 0)
        }
        .presentationDetents([.height(260), .large])
    }
}

private struct TodayHoldSheet: View {
    var store: TodayStore

    var body: some View {
        let payment = store.visiblePayment
        let amount = TodayCopy.money(cents: payment?.amountCents ?? 300)
        let share = payment?.kind == "share"
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()
                    TodayPainting(name: share ? "whop-fund-jar" : "whop-deposit-back", height: 120)
                    Spacer()
                }
                TodaySheetTitle(text: share ? "Chip in for " + TodayMoneyCard.shortTitle(store.plan) : "Hold \(amount) to lock it in", identifier: share ? "chip.sheet.title" : "hold.sheet.title", centered: true)
                    .padding(.top, 8)
                if share {
                    FrolicGroup {
                        HStack {
                            Text("Your share")
                                .todayFont(17, .semibold, relativeTo: .body)
                                .foregroundStyle(FrolicColor.ink)
                            Spacer()
                            Text(String(format: "$%.2f", (payment?.amountCents ?? 0) / 100))
                                .todayFont(17, .bold, relativeTo: .body)
                                .foregroundStyle(FrolicColor.ink)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 60)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("chip.sheet.share")
                        if let names = payment?.paidNames, !names.isEmpty {
                            HStack {
                                Text("Already paid")
                                    .todayFont(17, relativeTo: .body)
                                    .foregroundStyle(FrolicColor.ink)
                                Spacer()
                                Text(TodayCopy.names(names))
                                    .todayFont(17, relativeTo: .body)
                                    .foregroundStyle(FrolicColor.secondaryText)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 60)
                            .overlay(alignment: .top) { FrolicColor.line.frame(height: 0.5).padding(.leading, 16) }
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("chip.sheet.paidBy")
                        }
                    }
                    .padding(.top, 12)
                    TodaySheetBody(text: "If it gets called off, you get it back automatically.", centered: true)
                } else {
                    TodaySheetBody(text: "You get it back the moment you arrive.", identifier: "hold.sheet.body", centered: true)
                }
                Button {
                    store.openPayPage()
                } label: {
                    HStack(spacing: 8) {
                        if store.payBusy { PetalLoader() }
                        Text(store.payBusy ? "One sec." : (share ? "Pay " + String(format: "$%.2f", (payment?.amountCents ?? 0) / 100) : "Hold \(amount)"))
                    }
                }
                .buttonStyle(.frolicPrimary)
                .disabled(store.payBusy)
                .padding(.top, 16)
                .accessibilityIdentifier(share ? "chip.sheet.pay" : "hold.sheet.pay")
                Button("Not now") { store.sheet = nil }
                    .buttonStyle(.frolicText)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("hold.sheet.later")
            }
        }
        .scrollBounceBehavior(.basedOnSize)
    }
}

private struct TodayFreeSheet: View {
    var store: TodayStore

    var body: some View {
        let state = store.myFree?.state
        let eight = TodayCopy.todayAt(hour: 20)
        let five = TodayCopy.todayAt(hour: 17)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TodaySheetTitle(text: "When are you free today?", identifier: "free.sheet.title")
                TodaySheetBody(text: "Your crew sees this. What you're doing stays private.")
                FrolicGroup {
                    row("Free now till 8 PM", nil, selected: state == "now", id: "free.sheet.till8") {
                        store.setFree("now", window: TodayWindow(start: min(store.now(), eight - 60_000), end: eight))
                    }
                    row("Free 5 PM to 8 PM", "Just for today", selected: state == "window", id: "free.sheet.after5", divider: true) {
                        store.setFree("window", window: TodayWindow(start: five, end: eight))
                    }
                    row("Not today", "No plan for you today. Nobody gets told.", selected: state == "busy", id: "free.sheet.notToday", divider: true) {
                        store.setFree("busy", window: nil)
                    }
                }
                .padding(.top, 14)
                Button("Done") { store.sheet = nil }
                    .buttonStyle(.frolicPrimary)
                    .padding(.top, 14)
                    .accessibilityIdentifier("free.sheet.done")
            }
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private func row(_ title: String, _ detail: String?, selected: Bool, id: String, divider: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .todayFont(17, .semibold, relativeTo: .body)
                        .foregroundStyle(FrolicColor.ink)
                    if let detail {
                        Text(detail)
                            .todayFont(14, relativeTo: .subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(selected ? FrolicColor.ink : FrolicColor.disabled)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
            .overlay(alignment: .top) {
                if divider { FrolicColor.line.frame(height: 0.5).padding(.leading, 16) }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityIdentifier(id)
    }
}

private struct TodayImFreeSheet: View {
    var store: TodayStore

    var body: some View {
        let tonight = max(60, (TodayCopy.todayAt(hour: 23) - store.now()) / 60_000)
        let options: [(String, Double, String)] = [("1 hour", 60, "1h"), ("2 hours", 120, "2h"), ("3 hours", 180, "3h"), ("Tonight", tonight, "tonight")]
        VStack(alignment: .leading, spacing: 0) {
            TodaySheetTitle(text: "I'm free for", identifier: "imFree.sheet.title")
            let free = store.freeFriends.map(\.name)
            if !free.isEmpty {
                TodaySheetBody(text: TodayCopy.names(free) + (free.count == 1 ? " is free right now" : " are free right now"), identifier: "imFree.sheet.proof")
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(options, id: \.2) { option in
                    Button(option.0) { store.imFree(minutes: option.1.rounded()) }
                        .buttonStyle(.frolicSecondaryWide)
                        .accessibilityIdentifier("imFree.sheet.\(option.2)")
                }
            }
            .padding(.top, 16)
            Spacer(minLength: 0)
        }
        .presentationDetents([.height(300), .large])
    }
}

struct TodayMoneyCard: View {
    var store: TodayStore

    static func shortTitle(_ plan: TodayPlan?) -> String {
        guard let title = plan?.title else { return "this" }
        return title.split(separator: " ").first.map { $0.lowercased() } ?? title.lowercased()
    }

    var body: some View {
        if let payment = store.visiblePayment, store.iAmGoing || store.scene == .done, let info = copy(payment) {
            HStack(alignment: .center, spacing: 12) {
                if let art = info.art {
                    TodayPainting(name: art, height: 52)
                        .frame(width: 52)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(info.title)
                        .todayFont(16, .semibold, relativeTo: .headline)
                        .foregroundStyle(FrolicColor.ink)
                    if let detail = info.detail {
                        Text(detail)
                            .todayFont(14, relativeTo: .subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if payment.state == "paying" {
                    PetalLoader(tint: FrolicColor.ink)
                }
                if let action = info.action {
                    Button(action) {
                        if payment.state == "failed" {
                            store.openPayPage()
                        } else {
                            store.sheet = .hold
                        }
                    }
                    .buttonStyle(.frolicSecondary)
                    .accessibilityIdentifier("today.money.pay")
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("today.money.card")
        }
    }

    private struct Copy {
        var title: String
        var detail: String?
        var action: String?
        var art: String?
    }

    private func copy(_ payment: TodayPayment) -> Copy? {
        let amount = TodayCopy.money(cents: payment.amountCents)
        let share = payment.kind == "share"
        switch payment.state {
        case "due":
            if share {
                return Copy(title: "Your share", detail: "If it gets called off, you get it back automatically.", action: "Chip in for " + Self.shortTitle(store.plan), art: "whop-fund-jar")
            }
            return Copy(title: "Hold \(amount) to lock it in", detail: "You get it back the moment you arrive.", action: "Hold \(amount)", art: "whop-deposit-back")
        case "paying":
            return Copy(title: "One sec.")
        case "held":
            return Copy(title: "You're in. \(amount) held.", detail: "You get it back the moment you arrive.", art: "whop-deposit-back")
        case "returning":
            return Copy(title: "Sending your \(amount) back.", art: "whop-deposit-back")
        case "returned":
            return Copy(title: "You made it. Your \(amount) is back.", art: "whop-deposit-back")
        case "paid":
            return Copy(title: "You're in. Paid \(amount).", art: "whop-fund-jar")
        case "kept":
            return Copy(title: "Your \(amount) went to the Frolic Fund.", art: "whop-noshow-coin")
        case "covered":
            return Copy(title: "The Frolic Fund covered you.", art: "whop-fund-jar")
        case "failed":
            return Copy(title: payment.error ?? "That didn't go through. Try again.", action: "Try again")
        case "sorting":
            return Copy(title: "We're sorting out your \(amount).")
        default:
            return nil
        }
    }
}

struct TodaySafari: UIViewControllerRepresentable {
    var url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredControlTintColor = UIColor(FrolicColor.ink)
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

struct TodayBloomOverlay: View {
    var trigger: Int
    var drift = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: Date?
    @State private var across = false

    var body: some View {
        ZStack {
            if let start {
                if reduceMotion {
                    TodayPainting(name: "state-its-on", height: 260)
                        .opacity(0)
                        .modifier(TodayFadePulse())
                } else {
                    TimelineView(.animation) { timeline in
                        let t = timeline.date.timeIntervalSince(start)
                        ZStack {
                            TodayPetals(time: t, across: across)
                            if !across {
                                TodayPainting(name: "state-its-on", height: 280)
                                .scaleEffect(bouquetScale(t))
                                .opacity(bouquetOpacity(t))
                                .padding(.top, 70)
                            }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onChange(of: trigger) { _, value in
            guard value > 0 else { return }
            play(across: false, seconds: 2.6)
        }
        .onChange(of: drift) { _, value in
            guard value > 0, !reduceMotion else { return }
            play(across: true, seconds: 1.8)
        }
        .accessibilityHidden(true)
    }

    private func play(across: Bool, seconds: Double) {
        let begun = Date()
        self.across = across
        start = begun
        Task {
            try? await Task.sleep(for: .seconds(seconds))
            if start == begun { start = nil }
        }
    }

    private func bouquetScale(_ t: Double) -> Double {
        if t < 0.45 { return 0.4 + 0.75 * (t / 0.45) }
        if t < 0.7 { return 1.15 - 0.15 * ((t - 0.45) / 0.25) }
        return 1 + 0.05 * (t - 0.7)
    }

    private func bouquetOpacity(_ t: Double) -> Double {
        if t < 0.15 { return t / 0.15 }
        if t < 1.3 { return 1 }
        return max(0, 1 - (t - 1.3) / 0.6)
    }
}

private struct TodayFadePulse: ViewModifier {
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.5)) { shown = true }
                withAnimation(.easeInOut(duration: 0.5).delay(1.2)) { shown = false }
            }
    }
}

private struct TodayPetals: View {
    var time: Double
    var across = false
    private static let colors = FlowerColor.allCases.map(\.petal)

    var body: some View {
        Canvas { context, size in
            if across {
                drift(&context, size)
                return
            }
            for index in 0..<28 {
                let seed = Double(index)
                let x0 = size.width * (0.5 + 0.42 * sin(seed * 12.9898))
                let delay = (seed.truncatingRemainder(dividingBy: 7)) * 0.05
                let t = max(0, time - delay)
                let y = 80 + t * (220 + 40 * cos(seed)) + 120 * t * t
                let x = x0 + 22 * sin(t * 3 + seed)
                let alpha = max(0, 1 - t / 2.3)
                guard alpha > 0 else { continue }
                var petal = context
                petal.opacity = alpha
                petal.translateBy(x: x, y: y)
                petal.rotate(by: .radians(t * 2.4 + seed))
                petal.fill(Path(ellipseIn: CGRect(x: -5, y: -9, width: 10, height: 18)), with: .color(Self.colors[index % Self.colors.count]))
            }
        }
    }

    private func drift(_ context: inout GraphicsContext, _ size: CGSize) {
        for index in 0..<16 {
            let seed = Double(index)
            let t = max(0, time - seed.truncatingRemainder(dividingBy: 5) * 0.07)
            let speed = size.width * (0.75 + 0.2 * sin(seed * 3.7))
            let x = -30 + t * speed
            let y = size.height * (0.18 + 0.5 * abs(sin(seed * 12.9898))) + 26 * sin(t * 3.2 + seed) + t * 30
            let alpha = min(1, t * 4) * max(0, 1 - t / 1.6)
            guard alpha > 0, x < size.width + 30 else { continue }
            var petal = context
            petal.opacity = alpha * 0.9
            petal.translateBy(x: x, y: y)
            petal.rotate(by: .radians(t * 3 + seed))
            petal.scaleBy(x: 0.6 + 0.4 * abs(sin(seed)), y: 0.6 + 0.4 * abs(sin(seed)))
            petal.fill(Path(ellipseIn: CGRect(x: -5, y: -9, width: 10, height: 18)), with: .color(Self.colors[index % Self.colors.count]))
        }
    }
}
