import SwiftUI

struct OnboardingBeat: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var beat = 0

    private static let captions = [
        "Friends who are free bloom",
        "Your yes is a secret bud",
        "Both yes: it's on",
    ]

    var body: some View {
        VStack(spacing: 0) {
            Text("One plan a day")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(Color(hex: 0x8EE3A8))
            stage
                .frame(height: 92)
                .padding(.top, 2)
            ZStack {
                ForEach(0..<OnboardingBeat.captions.count, id: \.self) { index in
                    if index == beat {
                        Text(OnboardingBeat.captions[index])
                            .frolicFont(.bodyEmphasis)
                            .foregroundStyle(FrolicColor.ink)
                            .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 6)))
                    }
                }
            }
            .frame(height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("One plan a day. Friends who are free bloom. Your yes is a secret bud. Both yes, it is on.")
        .accessibilityIdentifier("join.beat")
        .task { await cycle() }
    }

    private var stage: some View {
        ZStack {
            ForEach(0..<OnboardingBeat.captions.count, id: \.self) { index in
                if index == beat {
                    flowers(for: index)
                        .transition(insertion)
                }
            }
        }
    }

    private var insertion: AnyTransition {
        guard !reduceMotion else { return .opacity }
        return .asymmetric(
            insertion: .offset(y: 12).combined(with: .opacity).combined(with: .scale(scale: 0.9, anchor: .bottom)),
            removal: .opacity
        )
    }

    @ViewBuilder
    private func flowers(for index: Int) -> some View {
        switch index {
        case 1:
            FlowerView(state: .bud, color: .tomato, radius: 20, stem: 22)
        case 2:
            HStack(spacing: 0) {
                FlowerView(state: .bloom, color: .tomato, radius: 18, stem: 18)
                FlowerView(state: .bloom, color: .cobalt, radius: 18, stem: 18)
            }
        default:
            FlowerView(state: .bloom, color: .pink, radius: 20, stem: 22)
        }
    }

    private func cycle() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(reduceMotion ? .easeInOut(duration: 0.4) : .spring(response: 0.5, dampingFraction: 0.78)) {
                beat = (beat + 1) % OnboardingBeat.captions.count
            }
        }
    }
}
