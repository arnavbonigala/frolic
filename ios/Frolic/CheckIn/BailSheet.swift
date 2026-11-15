import SwiftUI

struct BailSheet: View {
    var names: String
    var onKeepGoing: () -> Void
    var onSitOut: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule()
                .fill(FrolicColor.ink.opacity(0.18))
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
                .accessibilityHidden(true)
            Text("Can't make it?")
                .frolicFont(.sheetTitle)
                .foregroundStyle(FrolicColor.ink)
                .padding(.top, 18)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("bail.sheet.title")
            Text(subcopy)
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("bail.sheet.body")
            HStack(spacing: 10) {
                Button("I'll still go", action: onKeepGoing)
                    .buttonStyle(.frolicSecondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("bail.sheet.yes")
                Button("Sit this one out", action: onSitOut)
                    .buttonStyle(.frolicPrimary)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("bail.sheet.no")
            }
            .padding(.top, 18)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 30)
        .background(FrolicColor.cream)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bail.sheet")
    }

    private var subcopy: String {
        names.isEmpty
            ? "Your crew will just see one fewer. The others get a chance to hop in."
            : "\(names) will just see one fewer. The others get a chance to hop in."
    }
}
