import SwiftUI
import UIKit

struct FrolicChip: View {
    enum Size {
        case regular
        case big
    }

    var text: String
    var systemImage: String?
    var size: Size = .regular

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage {
                Image(systemName: systemImage)
                    .imageScale(.small)
                    .accessibilityHidden(true)
            }
            Text(text)
        }
        .frolicFont(size == .big ? .pill : .chip)
        .foregroundStyle(FrolicColor.chipText)
        .padding(.horizontal, size == .big ? 15 : 11)
        .frame(minHeight: size == .big ? 38 : 30)
        .background(Capsule().fill(FrolicColor.chip))
    }
}

struct ChipRow: View {
    var chips: [String]

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(chips, id: \.self) { FrolicChip(text: $0) }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = rows[rows.count - 1].indices.isEmpty ? size.width : rows[rows.count - 1].width + spacing + size.width
            if needed > width, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            var row = rows[rows.count - 1]
            row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
            rows[rows.count - 1] = row
        }
        return rows
    }
}

struct StatusPill: View {
    var text: String
    var isFree = true

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "clock")
                .font(.system(size: 14, weight: .semibold, design: .rounded))
            Text(text)
                .frolicFont(.pill)
            Image(systemName: "chevron.down")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .opacity(0.6)
        }
        .foregroundStyle(Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.965, green: 0.922, blue: 0.867, alpha: 1) : UIColor(red: 0.137, green: 0.094, blue: 0.059, alpha: 1) }))
        .padding(.horizontal, 14)
        .frame(minHeight: 44)
        .glassEffect(.regular.tint(FrolicColor.cream.opacity(0.55)).interactive(), in: .capsule)
    }
}

struct StatusDot: View {
    var isFree = true

    var body: some View {
        EmptyView()
    }
}

struct HushNote: View {
    var text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: "lock.fill")
                .imageScale(.small)
                .accessibilityHidden(true)
            Text(text)
        }
        .frolicFont(.footnote)
        .foregroundStyle(FrolicColor.secondaryText)
        .multilineTextAlignment(.center)
        .accessibilityElement(children: .combine)
    }
}
