import SwiftUI

struct WhopReturnCard: View {
    var state: String
    var amount: String

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            illustration
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .frolicFont(.bodyEmphasis)
                    .foregroundStyle(FrolicColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(note)
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(FrolicColor.cream))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(note)")
        .accessibilityIdentifier("checkin.money")
    }

    private var title: String {
        switch state {
        case "returning": "Sending your \(amount) back."
        case "returned": "You made it. Your \(amount) is back."
        default: "You made it."
        }
    }

    private var note: String {
        switch state {
        case "returning": "This takes a moment on our side."
        case "returned": "The hold is off your card."
        default: ""
        }
    }

    @ViewBuilder
    private var illustration: some View {
        if UIImage(named: "whop-deposit-back") != nil {
            Image("whop-deposit-back")
                .resizable()
                .scaledToFill()
                .frame(width: 48, height: 48)
                .clipShape(Circle())
                .accessibilityHidden(true)
        } else {
            ZStack {
                Circle().fill(FrolicColor.band)
                Image(systemName: "arrow.uturn.left")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(FrolicColor.bandText)
            }
            .frame(width: 48, height: 48)
            .accessibilityHidden(true)
        }
    }
}
