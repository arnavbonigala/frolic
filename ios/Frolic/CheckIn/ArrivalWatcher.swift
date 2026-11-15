import CoreLocation
import Foundation

@MainActor
@Observable
final class ArrivalWatcher: NSObject, CLLocationManagerDelegate {
    enum Permission {
        case undecided
        case granted
        case denied
    }

    static let radius: CLLocationDistance = 150
    static let purposeLine = "Turn on location so Frolic knows when you arrive."

    var permission: Permission = .undecided
    var arrived = false
    var currentCoordinate: CLLocationCoordinate2D?

    private let manager = CLLocationManager()
    private var place: WirePlace?
    private var simulation: SimulatedLocation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 20
        permission = Self.map(manager.authorizationStatus)
    }

    func begin(place: WirePlace?, simulation: SimulatedLocation?) {
        self.place = place
        self.simulation = simulation
        if simulation != nil { permission = .granted }
        refresh()
        if simulation == nil, permission == .granted {
            manager.startUpdatingLocation()
        }
    }

    func requestPermission() {
        guard simulation == nil else { return }
        manager.requestWhenInUseAuthorization()
    }

    func refresh() {
        if let simulation {
            apply(CLLocationCoordinate2D(latitude: simulation.latitude, longitude: simulation.longitude))
        } else if permission == .granted {
            manager.requestLocation()
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
    }

    private func apply(_ coordinate: CLLocationCoordinate2D) {
        currentCoordinate = coordinate
        guard let place else { return }
        let here = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let there = CLLocation(latitude: place.lat, longitude: place.lng)
        if here.distance(from: there) <= Self.radius { arrived = true }
    }

    private static func map(_ status: CLAuthorizationStatus) -> Permission {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse: .granted
        case .denied, .restricted: .denied
        default: .undecided
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            guard simulation == nil else { return }
            permission = Self.map(status)
            if permission == .granted {
                self.manager.startUpdatingLocation()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        Task { @MainActor in
            guard simulation == nil else { return }
            apply(coordinate)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {}
}
