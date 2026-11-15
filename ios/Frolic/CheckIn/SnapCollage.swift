import CoreMotion
import SwiftUI
import UIKit

@MainActor
@Observable
final class MotionTilt {
    var pitch: Double = 0
    var roll: Double = 0
    private let manager = CMMotionManager()
    private var baseline: (pitch: Double, roll: Double)?

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        manager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] motion, _ in
            guard let motion else { return }
            MainActor.assumeIsolated { self?.update(motion.attitude) }
        }
    }

    private func update(_ attitude: CMAttitude) {
        let p = attitude.pitch * 180 / .pi
        let r = attitude.roll * 180 / .pi
        if baseline == nil { baseline = (p, r) }
        guard let baseline else { return }
        let targetPitch = max(-20, min(20, (p - baseline.pitch) * 0.6))
        let targetRoll = max(-25, min(25, (r - baseline.roll) * 0.6))
        pitch += (targetPitch - pitch) * 0.35
        roll += (targetRoll - roll) * 0.35
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        baseline = nil
        pitch = 0
        roll = 0
    }
}

struct SnapCollage: View {
    @Bindable var store: CheckInStore
    var onPlant: () -> Void
    var onAgain: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var motion = MotionTilt()
    @State private var revealed = 1

    private var people: [WirePerson] {
        ([store.myPerson].compactMap { $0 }) + store.others
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 4) {
                    Text("Group snap")
                        .font(.system(.subheadline, design: .default, weight: .bold))
                        .foregroundStyle(FrolicColor.ink)
                    Text("Every angle, one moment")
                        .frolicFont(.title)
                        .foregroundStyle(FrolicColor.ink)
                        .multilineTextAlignment(.center)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("checkin.title")
                }
                .padding(.top, 66)
                .padding(.horizontal, 18)
                press
                Text(caption)
                    .font(.system(.subheadline, design: .default, weight: .bold))
                    .foregroundStyle(FrolicColor.ink)
                    .padding(.top, 6)
                    .accessibilityIdentifier("checkin.polaroid")
                Text(shotCount > 1 ? "Taken at the same second on \(shotCount) phones." : "Theirs appear here as they add them.")
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
                    .padding(.horizontal, 24)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Plant it in the garden", action: onPlant)
                    .buttonStyle(.frolicPrimary)
                    .padding(.top, 16)
                    .padding(.horizontal, 18)
                    .accessibilityIdentifier("checkin.plant")
                Button("Take it again together", action: onAgain)
                    .buttonStyle(.frolicSecondaryWide)
                    .padding(.top, 10)
                    .padding(.horizontal, 18)
                    .accessibilityIdentifier("checkin.again")
            }
            .padding(.bottom, 30)
        }
        .background(FrolicColor.cream)
        .accessibilityIdentifier("checkin.collage")
        .task {
            if !reduceMotion { motion.start() }
            if reduceMotion {
                revealed = people.count
            } else {
                for index in 1..<max(1, people.count) {
                    try? await Task.sleep(nanoseconds: 500_000_000)
                    withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                        revealed = index + 1
                    }
                }
            }
        }
        .onDisappear { motion.stop() }
    }

    private var shotCount: Int {
        max(1, store.snaps.count)
    }

    private var caption: String {
        let place = store.placeName
        let day = CheckInClock.day(store.startsAt ?? Date().timeIntervalSince1970 * 1000)
        let time = CheckInClock.time(store.startsAt ?? Date().timeIntervalSince1970 * 1000)
        return "\(place) · \(day) · \(time)"
    }

    private var press: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .topLeading) {
                ForEach(Array(people.prefix(3).enumerated()), id: \.element.id) { index, person in
                    ParallaxLayer(motion: motion, depth: depth(index)) {
                        polaroid(person: person, index: index)
                            .frame(width: cardWidth(width))
                    }
                        .offset(x: offsetX(index: index, width: width), y: offsetY(index: index))
                        .rotationEffect(.degrees(rotation(index: index)), anchor: .center)
                        .zIndex(Double(3 - index))
                        .opacity(index < revealed ? 1 : 0)
                        .offset(y: index < revealed ? 0 : 40)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .modifier(TiltEffect(motion: motion))
        }
        .frame(height: 372)
        .padding(.horizontal, 26)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(FrolicColor.paper)
                .shadow(color: Color(hex: 0x78501E, opacity: 0.14), radius: 17, y: 14)
        )
        .padding(.horizontal, 16)
        .padding(.top, 18)
    }

    private func cardWidth(_ width: CGFloat) -> CGFloat {
        width * 0.52
    }

    private func offsetX(index: Int, width: CGFloat) -> CGFloat {
        switch index {
        case 0: 6
        case 1: width - cardWidth(width) - 6
        default: (width - cardWidth(width)) / 2
        }
    }

    private func offsetY(index: Int) -> CGFloat {
        switch index {
        case 0: 6
        case 1: 26
        default: 104
        }
    }

    private func depth(_ index: Int) -> Double {
        [0.5, 0.2, -0.25][min(index, 2)]
    }

    private func rotation(index: Int) -> Double {
        [-4, 5, -2][min(index, 2)]
    }

    private func polaroid(person: WirePerson, index: Int) -> some View {
        VStack(spacing: 0) {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay { photo(for: person, index: index) }
                .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
        }
        .padding(7)
        .padding(.bottom, 30)
        .background(FrolicColor.paper)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .shadow(color: FrolicColor.ink.opacity(0.18), radius: 11, y: 8)
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: 4) {
                FlowerView(state: .bloom, color: person.flower, radius: 6, stem: 0)
                    .accessibilityHidden(true)
                Text(store.isMe(person) ? "You" : person.name)
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(FrolicColor.ink)
            }
            .padding(.leading, 8)
            .padding(.bottom, 5)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(store.isMe(person) ? "Your shot" : (snapURL(for: person) == nil ? "\(person.name) is still adding theirs" : "\(person.name)'s shot"))
        .accessibilityIdentifier(index == 0 ? "checkin.shot.you" : "checkin.shot.\(person.name.lowercased())")
    }

    @ViewBuilder
    private func photo(for person: WirePerson, index: Int) -> some View {
        if store.isMe(person), let shot = store.myShot {
            Image(uiImage: shot).resizable().scaledToFill().accessibilityHidden(true)
        } else if let url = snapURL(for: person) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill().accessibilityHidden(true)
                } else {
                    waiting(for: person, label: phase.error == nil ? "Developing" : "Couldn't load theirs")
                }
            }
        } else {
            waiting(for: person, label: "Still adding theirs")
        }
    }

    private func snapURL(for person: WirePerson) -> URL? {
        ReachableURL.from(store.snaps.first { $0.userId == person.userId }?.url)
    }

    private func waiting(for person: WirePerson, label: String) -> some View {
        ZStack {
            FrolicColor.chip
            VStack(spacing: 8) {
                FlowerView(state: .bud, color: person.flower, radius: 14, stem: 12)
                    .accessibilityHidden(true)
                Text(label)
                    .font(.system(.caption, weight: .semibold))
                    .foregroundStyle(FrolicColor.secondaryText)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .padding(.horizontal, 8)
            }
        }
    }
}

private struct TiltEffect: ViewModifier {
    let motion: MotionTilt

    func body(content: Content) -> some View {
        content
            .rotation3DEffect(.degrees(-motion.pitch), axis: (x: 1, y: 0, z: 0), perspective: 0.45)
            .rotation3DEffect(.degrees(motion.roll), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
    }
}

private struct ParallaxLayer<Content: View>: View {
    let motion: MotionTilt
    let depth: Double
    @ViewBuilder var content: Content

    var body: some View {
        content
            .offset(x: motion.roll * depth, y: -motion.pitch * depth)
    }
}
