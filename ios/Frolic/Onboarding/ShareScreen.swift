import SwiftUI

struct ShareScreen: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        OnboardingPage {
            OnboardingTitle(
                title: "Your crew is ready",
                subcopy: "Send this link to your friends.",
                identifier: "share.title"
            )
            if let url = model.shareURL {
                HStack(spacing: 12) {
                    FlowerView(state: .folded, color: .marigold, radius: 20, stem: 26)
                        .accessibilityHidden(true)
                    Text(url.absoluteString)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.ink)
                        .lineLimit(2)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                    Spacer(minLength: 0)
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(FrolicColor.paper))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.line, lineWidth: 1))
                .padding(.top, 26)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Invite link, \(url.absoluteString)")
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
