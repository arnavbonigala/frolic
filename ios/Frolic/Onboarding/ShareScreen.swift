import SwiftUI

struct ShareScreen: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        OnboardingPage(onBack: { model.backToName() }) {
            OnboardingTitle(
                title: "Your crew is ready",
                subcopy: "Anyone with this code can join.",
                identifier: "share.title"
            )
            if let code = model.shareCode {
                HStack(spacing: 12) {
                    FlowerView(state: .folded, color: .marigold, radius: 20, stem: 26)
                        .accessibilityHidden(true)
                    Text(code)
                        .frolicFont(.bodyEmphasis)
                        .foregroundStyle(FrolicColor.ink)
                        .textSelection(.enabled)
                    Spacer(minLength: 0)
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(FrolicColor.paper))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.line, lineWidth: 1))
                .padding(.top, 26)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(code)
                .accessibilityIdentifier("share.link")
            }
        } bar: {
            if let url = model.shareURL {
                ShareLink(item: url, subject: Text("Join my crew on Frolic"), message: Text("Join my crew on Frolic.")) {
                    Text("Share invite link")
                }
                .buttonStyle(.frolicPrimary)
                .accessibilityIdentifier("share.send")
            }
            Button("Go to Today") {
                Task { await model.finish() }
            }
            .buttonStyle(.frolicText)
            .disabled(model.isSubmitting)
            .accessibilityIdentifier("share.done")
        }
    }
}
