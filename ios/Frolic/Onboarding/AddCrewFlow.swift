import SwiftUI

struct AddCrewFlow: View {
    var link: InviteLink?
    var onClose: () -> Void = {}

    @Environment(FrolicBackend.self) private var backend
    @State private var model: OnboardingModel?

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let model {
                OnboardingView(model: model)
            } else {
                SkyBackground().ignoresSafeArea()
            }
            Button { onClose() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(FrolicColor.ink)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, 12)
            .padding(.top, 4)
            .accessibilityLabel("Close")
            .accessibilityIdentifier("crews.flow.close")
        }
        .task {
            guard model == nil else { return }
            let created = OnboardingModel(backend: OnboardingBackend(client: backend.client))
            created.addsCrew = true
            created.onFinish = onClose
            created.onCancel = onClose
            created.step = .join
            created.link = link
            created.showsInviteEntry = link == nil
            model = created
        }
    }
}
