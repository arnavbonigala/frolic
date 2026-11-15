import ConvexMobile
import SwiftUI

struct CrewSummary: Decodable, Identifiable, Equatable {
    let groupId: String
    let name: String
    let memberCount: Double
    let planOpen: Bool
    var id: String { groupId }
}

private struct SwitcherMe: Decodable {
    let name: String
}

private struct CreatedCrew: Decodable {
    let groupId: String
}

@MainActor
@Observable
final class CrewSwitcherModel {
    var crews: [CrewSummary] = []
    var current: CrewSummary? { crews.first { $0.groupId == FrolicIdentity.shared.groupId } }
    var othersWaiting: Int { crews.filter { $0.planOpen && $0.groupId != FrolicIdentity.shared.groupId }.count }
    var myName = ""
    private var tasks: [Task<Void, Never>] = []

    func start(backend: FrolicBackend) {
        tasks.forEach { $0.cancel() }
        guard let client = try? backend.requireClient() else { return }
        let token = FrolicIdentity.shared.deviceToken
        tasks = [
            Task { [weak self] in
                guard let stream = try? client.subscribe(to: "crews:mine", with: ["deviceToken": token], yielding: [CrewSummary].self).values else { return }
                do {
                    for try await crews in stream { self?.crews = crews }
                } catch {}
            },
            Task { [weak self] in
                guard let stream = try? client.subscribe(to: "users:me", with: ["deviceToken": token], yielding: SwitcherMe?.self).values else { return }
                do {
                    for try await me in stream { if let me { self?.myName = me.name } }
                } catch {}
            },
        ]
    }

    func create(name: String, backend: FrolicBackend) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let client = try? backend.requireClient() else { return }
        let created: CreatedCrew? = try? await client.mutation(
            "users:createGroup",
            with: [
                "deviceToken": FrolicIdentity.shared.deviceToken,
                "firstName": myName.isEmpty ? "Me" : myName,
                "groupName": trimmed,
                "timezone": TimeZone.current.identifier,
            ]
        )
        if let created { FrolicIdentity.shared.setGroup(created.groupId) }
    }
}

struct CrewSwitchMenu<Label: View>: View {
    var model: CrewSwitcherModel
    @ViewBuilder var label: Label
    @Environment(FrolicBackend.self) private var backend
    @State private var naming = false
    @State private var newName = ""

    var body: some View {
        Menu {
            ForEach(model.crews) { crew in
                Button {
                    FrolicIdentity.shared.setGroup(crew.groupId)
                } label: {
                    if crew.groupId == FrolicIdentity.shared.groupId {
                        SwiftUI.Label(crew.name, systemImage: "checkmark")
                    } else if crew.planOpen {
                        SwiftUI.Label(crew.name, systemImage: "sparkles")
                    } else {
                        Text(crew.name)
                    }
                }
            }
            Divider()
            Button {
                newName = ""
                naming = true
            } label: {
                SwiftUI.Label("Start a new crew", systemImage: "plus")
            }
        } label: {
            label
        }
        .alert("Name your new crew", isPresented: $naming) {
            TextField("Crew name", text: $newName)
            Button("Start crew") { Task { await model.create(name: newName, backend: backend) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Then invite friends to it.")
        }
    }
}

struct CrewSwitcherTitle: View {
    var title: String
    var subtitle: String?
    var centered = false
    @Environment(FrolicBackend.self) private var backend
    @State private var model = CrewSwitcherModel()

    var body: some View {
        VStack(alignment: centered ? .center : .leading, spacing: 8) {
            CrewSwitchMenu(model: model) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(title)
                        .font(.system(.largeTitle, design: .serif, weight: .heavy))
                        .foregroundStyle(FrolicColor.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Image(systemName: "chevron.down.circle.fill")
                        .font(.title2)
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
            }
            .accessibilityLabel("\(title), switch crew")
            .accessibilityIdentifier("crew.title")
            if let subtitle {
                Text(subtitle)
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .multilineTextAlignment(centered ? .center : .leading)
                    .accessibilityIdentifier("crew.subtitle")
            }
        }
        .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
        .task { model.start(backend: backend) }
    }
}
