import SwiftUI

extension View {
    func frolicSheet<Content: View>(
        isPresented: Binding<Bool>,
        detents: Set<PresentationDetent> = [.medium, .large],
        cornerRadius: CGFloat = FrolicRadius.sheet,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        sheet(isPresented: isPresented, onDismiss: onDismiss) {
            content().frolicSheetChrome(detents: detents, cornerRadius: cornerRadius)
        }
    }

    func frolicSheet<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        detents: Set<PresentationDetent> = [.medium, .large],
        cornerRadius: CGFloat = FrolicRadius.sheet,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        sheet(item: item, onDismiss: onDismiss) { value in
            content(value).frolicSheetChrome(detents: detents, cornerRadius: cornerRadius)
        }
    }

    func frolicSheetChrome(
        detents: Set<PresentationDetent> = [.medium, .large],
        cornerRadius: CGFloat = FrolicRadius.sheet
    ) -> some View {
        presentationDetents(detents.isEmpty ? [.large] : detents)
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(cornerRadius)
            .presentationBackground(FrolicColor.cream)
    }
}
