import SwiftUI

struct FrolicSegmented<Value: Hashable>: View {
    var label: String
    var options: [(value: Value, title: String, identifier: String?)]
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 3) {
            ForEach(options.indices, id: \.self) { index in
                let option = options[index]
                let selected = option.value == selection
                Button {
                    selection = option.value
                } label: {
                    Text(option.title)
                        .font(.system(size: 14, weight: selected ? .bold : .medium))
                        .foregroundStyle(selected ? Color.white : FrolicColor.secondaryText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(selected ? Color(hex: 0x2E8A4E) : .clear)
                                .shadow(color: .black.opacity(selected ? 0.08 : 0), radius: 3, y: 2)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityIdentifier(option.identifier ?? "")
            }
        }
        .padding(3)
        .background(FrolicColor.chip, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
}
