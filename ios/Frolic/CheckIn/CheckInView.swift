import SwiftUI

struct CheckInView: View {
    var body: some View {
        PhasePlaceholder(
            phase: .loading,
            copy: PlaceholderCopy(loading: "Getting the group snap ready", emptyTitle: "", emptyMessage: "", errorTitle: "Couldn't start the group snap"),
            color: .lilac
        )
        .background(FrolicColor.cream.ignoresSafeArea())
        .accessibilityIdentifier("checkin.screen")
    }
}
