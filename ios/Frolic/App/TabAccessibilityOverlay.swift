import SwiftUI

struct TabAccessibilityOverlay: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                Button {
                    router.tab = tab
                } label: {
                    Color.clear
                        .frame(maxWidth: .infinity, minHeight: 62)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(tab.title)
                .accessibilityIdentifier("tab.\(tab.rawValue)")
                .accessibilityAddTraits(router.tab == tab ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.horizontal, 18)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tabs")
    }
}
