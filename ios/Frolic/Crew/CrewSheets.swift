import SwiftUI
import UIKit

struct CrewSheetShell<Content: View>: View {
    var title: String
    var identifier: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule()
                .fill(FrolicColor.ink.opacity(0.18))
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
                .accessibilityHidden(true)
            Text(title)
                .frolicFont(.sheetTitle)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier(identifier)
                .padding(.top, 14)
            content
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FrolicColor.cream)
        .accessibilityElement(children: .contain)
    }
}

struct CrewFreeSheet: View {
    var current: String
    var isBusy: Bool = false
    var options: [CrewFreeOption]
    var error: String?
    var onPick: (CrewFreeOption) -> Void
    var onDone: () -> Void

    var body: some View {
        CrewSheetShell(title: "When are you free today?", identifier: "free.sheet.title") {
            VStack(spacing: 0) {
                ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                    Button {
                        onPick(option)
                    } label: {
                        HStack(spacing: 12) {
                            Text(option.title)
                                .frolicFont(.bodyEmphasis)
                                .foregroundStyle(FrolicColor.ink)
                            Spacer(minLength: 0)
                            if option.kind == .busy ? isBusy : current == option.title {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundStyle(FrolicColor.free)
                                    .accessibilityHidden(true)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .frame(minHeight: 60)
                        .contentShape(Rectangle())
                        .overlay(alignment: .top) {
                            if index > 0 {
                                FrolicColor.line.frame(height: 0.5).padding(.leading, 16)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier(option.identifier)
                }
            }
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
            .padding(.top, 16)
            if let error {
                Text(error)
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .padding(.top, 10)
                    .accessibilityIdentifier("free.sheet.error")
            }
            Button("Done", action: onDone)
                .buttonStyle(.frolicPrimary)
                .padding(.top, 16)
                .accessibilityIdentifier("free.sheet.done")
        }
    }
}

struct CrewFriendSheet: View {
    var row: CrewRow
    var wentTogether: Bool
    var place: String?

    private var togetherTitle: String { wentTogether ? "1 frolic together" : "No frolics together yet" }

    private var distanceText: String {
        if let away = CrewCopy.distance(row.minutesAway) { return "\(away), roughly" }
        switch row.status {
        case .wentWithYou, .went: return "Was there today"
        default: return "Close to you, roughly"
        }
    }

    private var togetherDetail: String {
        if wentTogether { return "\(place ?? "Today"), today" }
        return "\(row.name) is in your crew"
    }

    var body: some View {
        CrewSheetShell(title: row.name, identifier: "crew.friend.title") {
            HStack {
                Spacer(minLength: 0)
                CrewBloom(row: row, radius: 46, stem: 60)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            FrolicGroup {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.spokenStatus)
                        .frolicFont(.bodyEmphasis)
                        .foregroundStyle(FrolicColor.ink)
                    Text(distanceText)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(minHeight: 60)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("crew.friend.sheet")
                VStack(alignment: .leading, spacing: 1) {
                    Text(togetherTitle)
                        .frolicFont(.bodyEmphasis)
                        .foregroundStyle(FrolicColor.ink)
                    Text(togetherDetail)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(minHeight: 60)
                .overlay(alignment: .top) {
                    FrolicColor.line.frame(height: 0.5).padding(.leading, 16)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("crew.friend.together")
            }
            .padding(.top, 12)
            Text("You'll never see whether \(row.name) said yes or no to a plan. That's the point.")
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 14)
                .accessibilityIdentifier("crew.friend.noAnswer")
        }
    }
}

struct CrewInviteSheet: View {
    var link: String?
    var error: String?
    var onRetry: () -> Void
    var onCopy: () -> Void
    var copied: Bool

    var body: some View {
        CrewSheetShell(title: "Invite to Sunset Crew", identifier: "crew.invite.title") {
            Group {
                if let link {
                    Text(link)
                        .frolicFont(.bodyEmphasis)
                        .foregroundStyle(FrolicColor.ink)
                        .accessibilityIdentifier("crew.invite.link")
                } else if let error {
                    VStack(spacing: 8) {
                        Text(error)
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                            .multilineTextAlignment(.center)
                        Button("Try again", action: onRetry)
                            .buttonStyle(.frolicSecondary)
                            .accessibilityIdentifier("crew.invite.retry")
                    }
                    .padding(.horizontal, 16)
                } else {
                    HStack(spacing: 8) {
                        ProgressView().tint(FrolicColor.ink)
                        Text("Making your link")
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
            .padding(.top, 14)
            HStack(spacing: 12) {
                Button(copied ? "Link copied" : "Copy link", action: onCopy)
                    .buttonStyle(.frolicSecondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("crew.invite.copy")
                if let link, let url = URL(string: "https://\(link)") {
                    ShareLink(item: url, subject: Text("Sunset Crew"), message: Text("Come frolic with us")) {
                        Text("Text it")
                            .frolicFont(.button)
                            .frame(maxWidth: .infinity, minHeight: 54)
                            .foregroundStyle(FrolicColor.cream)
                            .background(Capsule().fill(FrolicColor.ink))
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("crew.invite.text")
                }
            }
            .padding(.top, 14)
        }
    }
}
