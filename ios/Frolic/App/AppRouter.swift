import Foundation
import Observation

enum AppTab: String, CaseIterable, Hashable {
    case today
    case crew
    case garden
    case you

    var title: String {
        switch self {
        case .today: "Today"
        case .crew: "Crew"
        case .garden: "Garden"
        case .you: "You"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "sun.horizon.fill"
        case .crew: "person.2.fill"
        case .garden: "camera.macro"
        case .you: "person.crop.circle"
        }
    }
}

struct E2ERoute: Equatable {
    var screen: String
    var state: String?
    var argument: String?
    var query: [String: String]

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.host == "e2e"
        else { return nil }
        let route = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !route.isEmpty else { return nil }
        let parts = route.split(separator: ":", maxSplits: 1).map(String.init)
        let path = parts[0].split(separator: "/", maxSplits: 1).map(String.init)
        screen = path[0]
        argument = path.count > 1 ? path[1] : nil
        state = parts.count > 1 ? parts[1] : nil
        query = Dictionary(
            (components.queryItems ?? []).map { ($0.name, $0.value ?? "") },
            uniquingKeysWith: { _, last in last }
        )
    }

    var tab: AppTab? {
        switch screen {
        case "today", "otw", "checkin", "sunday", "hopin": .today
        case "crew": .crew
        case "garden", "memory": .garden
        case "you": .you
        default: nil
        }
    }
}

@MainActor
@Observable
final class AppRouter {
    var tab: AppTab = .today
    var phaseOverride: ScreenPhase?
    var e2eRoute: E2ERoute?
    var showsGallery = false

    func handle(_ url: URL) {
        guard url.scheme == "frolic" else { return }
        if let tab = url.host.flatMap(AppTab.init(rawValue:)) {
            self.tab = tab
            return
        }
        #if DEBUG || E2E
        if url.host == "gallery" {
            showsGallery = true
            return
        }
        if let route = E2ERoute(url: url) {
            apply(route)
        }
        #endif
    }

    func resolve(_ phase: ScreenPhase, isOnline: Bool) -> ScreenPhase {
        if let phaseOverride { return phaseOverride }
        return isOnline ? phase : .offline
    }

    #if DEBUG || E2E
    private func apply(_ route: E2ERoute) {
        showsGallery = false
        e2eRoute = route
        phaseOverride = route.query["phase"].flatMap(ScreenPhase.init(name:))
        if let tab = route.tab {
            self.tab = tab
        }
    }
    #endif
}
