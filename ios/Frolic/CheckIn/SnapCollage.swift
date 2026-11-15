import CoreMotion
import SwiftUI
import UIKit

@MainActor
@Observable
final class MotionTilt {
    var pitch: Double = 0
    var roll: Double = 0
    private let manager = CMMotionManager()

    func start() {
        guard manager.isDeviceMotionAvailable else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let motion else { return }
            MainActor.assumeIsolated {
                let gravity = motion.gravity
                self.roll = max(-25, min(25, gravity.x * 55))
                self.pitch = max(-20, min(20, (gravity.y + 1) * 45))
            }
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        pitch = 0
        roll = 0
    }
}

struct SnapCollage: View {
    @Bindable var store: CheckInStore
    var frolicId: String
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
                Text(motionHint)
                    .frolicFont(.chip)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .padding(.top, 6)
                    .accessibilityIdentifier("checkin.tiltHint")
                Text(caption)
                    .font(.system(.subheadline, design: .default, weight: .bold))
                    .foregroundStyle(FrolicColor.ink)
                    .padding(.top, 6)
                    .accessibilityIdentifier("checkin.polaroid")
                Text("Taken at the same second on \(people.count) phones. Nobody saw the others until they added theirs.")
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

    private var motionHint: String {
        reduceMotion ? "Every angle, one moment" : "Tilt your phone to look around"
    }

    private var caption: String {
        let place = store.placeName
        let day = CheckInClock.day(store.reveal?.startsAt ?? Date().timeIntervalSince1970 * 1000)
        let time = CheckInClock.time(store.reveal?.startsAt ?? Date().timeIntervalSince1970 * 1000)
        return "\(place) · \(day) · \(time)"
    }

    private var press: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .topLeading) {
                ForEach(Array(people.prefix(3).enumerated()), id: \.element.id) { index, person in
                    polaroid(person: person, index: index)
                        .frame(width: width * 0.62)
                        .offset(x: offsetX(index: index, width: width), y: offsetY(index: index))
                        .rotationEffect(.degrees(rotation(index: index)), anchor: .center)
                        .zIndex(Double(3 - index))
                        .opacity(index < revealed ? 1 : 0)
                        .offset(y: index < revealed ? 0 : 40)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .rotation3DEffect(.degrees(motion.pitch), axis: (x: 1, y: 0, z: 0), perspective: 0.55)
            .rotation3DEffect(.degrees(motion.roll), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
            .animation(.easeOut(duration: 0.18), value: motion.pitch)
            .animation(.easeOut(duration: 0.18), value: motion.roll)
        }
        .frame(height: 372)
        .padding(.horizontal, 30)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(FrolicColor.paper)
                .shadow(color: Color(hex: 0x78501E, opacity: 0.14), radius: 17, y: 14)
        )
        .padding(.horizontal, 16)
        .padding(.top, 18)
    }

    private func offsetX(index: Int, width: CGFloat) -> CGFloat {
        switch index {
        case 0: 0
        case 1: width - width * 0.62
        default: width * 0.18
        }
    }

    private func offsetY(index: Int) -> CGFloat {
        switch index {
        case 0: 0
        case 1: 24
        default: 132
        }
    }

    private func rotation(index: Int) -> Double {
        [-4, 5, -2][min(index, 2)]
    }

    private func polaroid(person: WirePerson, index: Int) -> some View {
        VStack(spacing: 0) {
            photo(for: person, index: index)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
            Spacer(minLength: 0)
        }
        .padding(7)
        .padding(.bottom, 30)
        .background(FrolicColor.paper)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .shadow(color: FrolicColor.ink.opacity(0.18), radius: 11, y: 8)
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: 4) {
                SentShotAvatar(name: person.name, flower: person.flower, radius: 5)
                Text(person.name)
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(FrolicColor.ink)
            }
            .padding(.leading, 8)
            .padding(.bottom, 5)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(person.name)'s shot")
        .accessibilityIdentifier(index == 0 ? "checkin.shot.you" : "checkin.shot.\(person.name.lowercased())")
    }

    @ViewBuilder
    private func photo(for person: WirePerson, index: Int) -> some View {
        if index == 0, let shot = store.myShot {
            Image(uiImage: shot)
                .resizable()
                .scaledToFill()
        } else if let url = snapURL(for: person) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                portrait(for: person)
            }
        } else {
            portrait(for: person)
        }
    }

    private func snapURL(for person: WirePerson) -> URL? {
        guard let row = store.snaps.first(where: { $0.userId == person.userId }),
              let raw = row.url
        else { return nil }
        return URL(string: raw)
    }

    private func portrait(for person: WirePerson) -> some View {
        ZStack {
            LinearGradient(
                colors: [person.flower.petal, person.flower.deep],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            if let photo = person.photoUrl, let url = URL(string: photo) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    ProgressView().tint(.white)
                }
            } else {
                Text(String(person.name.prefix(1)).uppercased())
                    .font(.system(size: 54, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
    }
}
