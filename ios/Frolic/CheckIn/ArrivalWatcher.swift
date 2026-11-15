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

    var permission: Permission = .undecided
    var distance: CLLocationDistance?
    var arrived = false
    var asked = false
    var lastCoordinate: CLLocationCoordinate2D?

    var simulatedCoordinate: CLLocationCoordinate2D? {
        simulation.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
    }

    private let manager = CLLocationManager()
    private var place: WirePlace?
    private var simulation: SimulatedLocation?
    private var regionId: String?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: permission = .granted
        case .denied, .restricted: permission = .denied
        default: permission = .undecided
        }
    }

    var purposeLine: String {
        "Frolic checks your location once, to know you made it."
    }

    func begin(place: WirePlace?, simulation: SimulatedLocation?) {
        self.place = place
        self.simulation = simulation
        if let simulation {
            apply(latitude: simulation.latitude, longitude: simulation.longitude)
        } else if permission == .granted {
            manager.startUpdatingLocation()
        }
        startRegion()
    }

    func requestPermission() {
        asked = true
        guard simulation == nil else {
            permission = .granted
            return
        }
        manager.requestWhenInUseAuthorization()
    }

    func refresh() {
        if let simulation {
            apply(latitude: simulation.latitude, longitude: simulation.longitude)
            return
        }
        guard permission == .granted else { return }
        manager.requestLocation()
    }

    func isInside(latitude: Double, longitude: Double) -> Bool {
        guard let place else { return false }
        let here = CLLocation(latitude: latitude, longitude: longitude)
        let there = CLLocation(latitude: place.lat, longitude: place.lng)
        return here.distance(from: there) <= Self.radius
    }

    private func startRegion() {
        guard let place, permission == .granted else { return }
        let region = CLCircularRegion(
            center: CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng),
            radius: Self.radius,
            identifier: place.placeId
        )
        region.notifyOnEntry = true
        region.notifyOnExit = false
        regionId = place.placeId
        manager.startMonitoring(for: region)
    }

    private func apply(latitude: Double, longitude: Double) {
        lastCoordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        guard let place else { return }
        let here = CLLocation(latitude: latitude, longitude: longitude)
        let there = CLLocation(latitude: place.lat, longitude: place.lng)
        distance = here.distance(from: there)
        arrived = here.distance(from: there) <= Self.radius
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedAlways, .authorizedWhenInUse:
                permission = .granted
                startRegion()
                if simulation == nil { manager.requestLocation() }
            case .denied, .restricted:
                permission = .denied
            default:
                permission = .undecided
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        let latitude = last.coordinate.latitude
        let longitude = last.coordinate.longitude
        Task { @MainActor in
            guard simulation == nil else { return }
            apply(latitude: latitude, longitude: longitude)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {}

    nonisolated func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        Task { @MainActor in
            arrived = true
            distance = 0
        }
    }
}
