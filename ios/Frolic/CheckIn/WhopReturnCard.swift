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
        case "held": "You're in. \(amount) held."
        default: "You're all here"
        }
    }

    private var note: String {
        switch state {
        case "returning": "This takes a moment on our side."
        case "returned": "Your hold is off your card. Nothing to do."
        case "held": "The hold comes off the moment you arrive."
        default: "The group snap is ready when you are."
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

struct WhopReturnBanner: View {
    var state: String
    var amount: String

    var body: some View {
        VStack(spacing: 10) {
            if UIImage(named: "whop-deposit-back") != nil {
                Image("whop-deposit-back")
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 132)
                    .accessibilityHidden(true)
            }
            Text(state == "returning" ? "Sending your \(amount) back." : "You made it. Your \(amount) is back.")
                .frolicFont(.title)
                .multilineTextAlignment(.center)
                .foregroundStyle(FrolicColor.ink)
            Text(state == "returning"
                 ? "This takes a moment on our side."
                 : "Your hold is off your card. Walk in, plant the snap, that's the whole thing.")
                .frolicFont(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(FrolicColor.secondaryText)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("checkin.money")
    }
}
