import SwiftUI

struct PlantedMemoryLanding: ViewModifier {
    @Binding var path: [GardenMemoryRow]
    var memories: [GardenMemoryRow]?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var coordinator = CheckInFlowCoordinator.shared
    @State private var blooming = false

    func body(content: Content) -> some View {
        content
            .overlay {
                if blooming {
                    FlowerView(state: .bloom, color: .marigold, radius: 44, stem: 0)
                        .transition(.scale(scale: 0.2).combined(with: .opacity))
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .onAppear { land() }
            .onChange(of: coordinator.plantedFrolicId) { _, _ in land() }
            .onChange(of: memories) { _, _ in land() }
    }

    private func land() {
        guard let id = coordinator.plantedFrolicId, let memories else { return }
        coordinator.plantedFrolicId = nil
        guard let row = memories.first(where: { $0.frolicId == id }) else { return }
        path = [row]
        guard !reduceMotion else { return }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.6)) { blooming = true }
        Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            withAnimation(.easeOut(duration: 0.35)) { blooming = false }
        }
    }
}

extension View {
    func landsOnPlantedMemory(path: Binding<[GardenMemoryRow]>, memories: [GardenMemoryRow]?) -> some View {
        modifier(PlantedMemoryLanding(path: path, memories: memories))
    }
}
