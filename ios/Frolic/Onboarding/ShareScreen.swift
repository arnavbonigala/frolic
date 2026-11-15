import SwiftUI
import UIKit

struct ShareScreen: View {
    @Bindable var model: OnboardingModel
    @State private var copied = false

    var body: some View {
        OnboardingPage(onBack: { model.backToName() }) {
            OnboardingTitle(
                title: "Your crew is ready",
                subcopy: "Anyone with this code can join.",
                identifier: "share.title"
            )
            if let code = model.shareCode {
                VStack(spacing: 22) {
                    HStack(alignment: .bottom, spacing: -6) {
                        FlowerView(color: .pink, radius: 22, stem: 40)
                        FlowerView(color: .marigold, radius: 30, stem: 64)
                        FlowerView(color: .cobalt, radius: 22, stem: 46)
                    }
                    .accessibilityHidden(true)
                    Button {
                        UIPasteboard.general.string = code
                        copied = true
                    } label: {
                        HStack(spacing: 10) {
                            Text(code)
                                .font(.system(size: 22, weight: .bold, design: .monospaced))
                                .foregroundStyle(FrolicColor.ink)
                            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(copied ? Color(hex: 0x34A160) : FrolicColor.secondaryText)
                        }
                        .padding(.horizontal, 22)
                        .frame(minHeight: 56)
                        .glassEffect(.regular.tint(FrolicColor.cream.opacity(0.82)).interactive(), in: .capsule)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(copied ? "Code \(code), copied" : "Code \(code). Copy")
                    .accessibilityIdentifier("share.link")
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 48)
                .sensoryFeedback(.success, trigger: copied)
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
