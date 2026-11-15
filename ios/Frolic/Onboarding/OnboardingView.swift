import SwiftUI

struct OnboardingView: View {
    var body: some View {
        VStack(spacing: 24) {
            Wordmark(width: 140)
            HStack(alignment: .bottom) {
                ForEach(Array(SampleData.friends.enumerated()), id: \.element.id) { index, person in
                    FlowerView(person: person, radius: 30, stem: [110, 66, 130, 86][index] * 0.6, swayDelay: Double(index) * 0.5)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.top, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SkyBackground())
        .accessibilityIdentifier("onboarding.screen")
    }
}
