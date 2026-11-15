import SwiftUI

struct CrewFreeControl: View {
    var text: String
    var isFree: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                StatusDot(isFree: isFree)
                Text(text)
                    .frolicFont(.pill)
                    .foregroundStyle(FrolicColor.ink)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(FrolicColor.secondaryText)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(Capsule().fill(.white.opacity(0.75)))
            .overlay(Capsule().stroke(FrolicColor.ink.opacity(0.08), lineWidth: 0.5))
            .shadow(color: Color(hex: 0x3C5078, opacity: 0.08), radius: 6, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Your free time today, \(text)")
        .accessibilityHint("Set when you're free today")
        .accessibilityIdentifier("crew.free")
    }
}

struct CrewPersonRowView: View {
    var row: CrewRow
    var showsDivider: Bool
    var onTap: (() -> Void)?

    var body: some View {
        let label = "\(row.name), \(row.detail)\(row.lookingNow ? ", looking now" : "")"
        Group {
            if let onTap {
                Button(action: onTap) {
                    content
                }
                .buttonStyle(.plain)
            } else {
                content
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAddTraits(onTap == nil ? AccessibilityTraits() : .isButton)
        .accessibilityIdentifier(row.isMe ? "crew.row.you" : "crew.row.\(row.name.lowercased())")
    }

    private var content: some View {
        HStack(spacing: 12) {
            CrewBloom(row: row)
                .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 1) {
                Text(row.name)
                    .frolicFont(.bodyEmphasis)
                    .foregroundStyle(FrolicColor.ink)
                HStack(spacing: 6) {
                    StatusDot(isFree: row.isFree)
                    Text(row.detail)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            if onTap != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FrolicColor.ink.opacity(0.4))
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
        .overlay(alignment: .top) {
            if showsDivider {
                FrolicColor.line.frame(height: 0.5).padding(.leading, 68)
            }
        }
    }
}

struct CrewComingUpRow: View {
    var comingUp: CrewComingUp
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                CrewPainted(name: comingUp.heroAsset ?? "plan-outdoors", size: 44, fallbackSymbol: "leaf.fill")
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                (Text(comingUp.lead).fontWeight(.semibold) + Text(" ") + Text(comingUp.body))
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FrolicColor.ink.opacity(0.4))
                    .accessibilityHidden(true)
            }
            .padding(10)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(comingUp.lead) \(comingUp.body)")
        .accessibilityIdentifier("crew.comingUp")
    }
}

struct CrewLatelyGroup: View {
    var rows: [CrewLatelyRow]

    var body: some View {
        FrolicGroup {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                HStack(spacing: 12) {
                    HStack(spacing: 0) {
                        ForEach(Array(row.colors.prefix(3).enumerated()), id: \.offset) { _, color in
                            FlowerView(color: color, radius: 9, stem: 0)
                                .frame(width: 20, height: 26)
                        }
                    }
                    .frame(width: 44, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.title)
                            .frolicFont(.bodyEmphasis)
                            .foregroundStyle(FrolicColor.ink)
                        Text("\(row.names) · \(row.day)")
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(minHeight: 60)
                .overlay(alignment: .top) {
                    if index > 0 {
                        FrolicColor.line.frame(height: 0.5).padding(.leading, 68)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.title), \(row.names), \(row.day)")
                .accessibilityIdentifier("crew.lately.row")
            }
        }
    }
}

struct CrewFavoritesGroup: View {
    var rows: [CrewFavoriteRow]

    var body: some View {
        FrolicGroup {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                HStack(spacing: 12) {
                    Text(row.title)
                        .frolicFont(.bodyEmphasis)
                        .foregroundStyle(FrolicColor.ink)
                    Spacer(minLength: 0)
                    Text(row.count)
                        .frolicFont(.body)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(minHeight: 60)
                .overlay(alignment: .top) {
                    if index > 0 {
                        FrolicColor.line.frame(height: 0.5).padding(.leading, 16)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.title), \(row.count)")
                .accessibilityIdentifier("crew.favorites.row")
            }
        }
    }
}

struct CrewNewThisWeek: View {
    var title: String
    var hero: String?

    var body: some View {
        FrolicGroup {
            HStack(spacing: 12) {
                CrewPainted(name: hero ?? "plan-sunsets", size: 40, fallbackSymbol: "camera.macro")
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .frolicFont(.bodyEmphasis)
                        .foregroundStyle(FrolicColor.ink)
                    Text("Your first frolic with the crew")
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(minHeight: 60)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(title), your first frolic with the crew")
            .accessibilityIdentifier("crew.newThisWeek")
        }
    }
}

struct CrewFundSection: View {
    var fund: CrewFund

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 14) {
                CrewPainted(name: "whop-fund-jar", size: 56, fallbackSymbol: "leaf.fill", fallbackTint: FrolicColor.bandText)
                VStack(alignment: .leading, spacing: 2) {
                    Text(fund.balanceLine)
                        .frolicFont(.sheetTitle)
                        .foregroundStyle(FrolicColor.ink)
                    Text(fund.note)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
                Spacer(minLength: 0)
            }
            if !fund.rows.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(fund.rows.enumerated()), id: \.element.id) { index, row in
                        HStack(spacing: 10) {
                            if row.kind == .added {
                                CrewPainted(name: "whop-noshow-coin", size: 22, fallbackSymbol: "circle.dashed")
                            } else {
                                Image(systemName: row.kind == .covered ? "hands.and.sparkles.fill" : "arrow.uturn.left")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(FrolicColor.secondaryText)
                                    .frame(width: 22, height: 22)
                                    .accessibilityHidden(true)
                            }
                            Text(row.text)
                                .frolicFont(.subheadline)
                                .foregroundStyle(FrolicColor.secondaryText)
                            Spacer(minLength: 0)
                            Text(row.day)
                                .frolicFont(.footnote)
                                .foregroundStyle(FrolicColor.tertiaryText)
                        }
                        .padding(.vertical, 8)
                        .overlay(alignment: .top) {
                            if index > 0 {
                                FrolicColor.ink.opacity(0.08).frame(height: 0.5)
                            }
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(row.text) \(row.day)")
                        .accessibilityIdentifier("crew.fund.row")
                    }
                }
                .padding(.top, 6)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [FrolicColor.meadow, FrolicColor.meadowDeep],
                startPoint: .top,
                endPoint: .bottom
            ),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("crew.fund")
    }
}

struct CrewHoldRow: View {
    var groupName: String
    var isOn: Bool
    var amount: String
    var onChange: (Bool) -> Void

    var body: some View {
        let line: String? = "Show up and it's released. Flake and it funds the next one."
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Hold \(amount)")
                    .frolicFont(.bodyEmphasis)
                    .foregroundStyle(FrolicColor.ink)
                if let line {
                    Text(line)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            Toggle("Hold \(amount)", isOn: Binding(get: { isOn }, set: onChange))
                .labelsHidden()
                .tint(FrolicColor.free)
                .frame(minWidth: 51, minHeight: 44)
                .accessibilityLabel("Hold \(amount)")
                .accessibilityValue(isOn ? "On" : "Off")
                .accessibilityIdentifier("crew.hold.toggle")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("crew.hold")
    }
}
