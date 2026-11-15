import SwiftUI

struct PhasedContent<Ready: View>: View {
    var phase: ScreenPhase
    var copy: PlaceholderCopy
    var color: FlowerColor = .marigold
    var onEmptyAction: (() -> Void)?
    var onRetry: (() -> Void)?
    @ViewBuilder var ready: Ready

    var body: some View {
        if phase == .ready {
            ready
        } else {
            PhasePlaceholder(phase: phase, copy: copy, color: color, onEmptyAction: onEmptyAction, onRetry: onRetry)
        }
    }
}

extension FrolicBackend {
    var initialPhase: ScreenPhase {
        isConfigured ? .empty : .error(BackendError.notConfigured.localizedDescription)
    }
}
