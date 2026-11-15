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

struct SimulatedLocation: Equatable, Codable {
    var latitude: Double
    var longitude: Double

    static let defaultsKey = "e2e.simulatedLocation"

    init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    init?(query: [String: String]) {
        guard let lat = query["lat"].flatMap(Double.init), let lng = query["lng"].flatMap(Double.init),
              (-90...90).contains(lat), (-180...180).contains(lng)
        else { return nil }
        self.init(latitude: lat, longitude: lng)
    }
}

@MainActor
@Observable
final class AppRouter {
    var tab: AppTab = .today
    var phaseOverride: ScreenPhase?
    var e2eRoute: E2ERoute?
    var showsGallery = false
    var simulatedLocation: SimulatedLocation?

    init() {
        #if DEBUG || E2E
        if let data = UserDefaults.standard.data(forKey: SimulatedLocation.defaultsKey) {
            simulatedLocation = try? JSONDecoder().decode(SimulatedLocation.self, from: data)
        }
        #endif
    }

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
        if route.query["clearLocation"] != nil {
            setSimulatedLocation(nil)
        } else if let location = SimulatedLocation(query: route.query) {
            setSimulatedLocation(location)
        }
        if route.screen == "location" { return }
        showsGallery = false
        e2eRoute = route
        phaseOverride = route.query["phase"].flatMap(ScreenPhase.init(name:))
        if let tab = route.tab {
            self.tab = tab
        }
    }

    private func setSimulatedLocation(_ location: SimulatedLocation?) {
        simulatedLocation = location
        if let location, let data = try? JSONEncoder().encode(location) {
            UserDefaults.standard.set(data, forKey: SimulatedLocation.defaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: SimulatedLocation.defaultsKey)
        }
    }
    #endif
}
