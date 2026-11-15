import SwiftUI

struct BailSheet: View {
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
            Text("Your crew will see a spot open up.")
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("bail.sheet.body")
            HStack(spacing: 10) {
                Button("I'll still go", action: onKeepGoing)
                    .buttonStyle(.frolicSecondaryWide)
                    .accessibilityIdentifier("bail.sheet.yes")
                Button("Sit this one out", action: onSitOut)
                    .buttonStyle(.frolicPrimary)
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
}
