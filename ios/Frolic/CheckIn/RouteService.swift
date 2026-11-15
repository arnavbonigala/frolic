import CoreLocation
import MapKit

enum RouteService {
    static func walkingMinutes(from coordinate: CLLocationCoordinate2D, to place: WirePlace) async -> Int? {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)))
        request.transportType = .walking
        let directions = MKDirections(request: request)
        do {
            let response = try await directions.calculate()
            guard let route = response.routes.min(by: { $0.expectedTravelTime < $1.expectedTravelTime }) else {
                return estimate(from: coordinate, to: place)
            }
            return max(1, Int((route.expectedTravelTime / 60).rounded(.up)))
        } catch {
            return estimate(from: coordinate, to: place)
        }
    }

    static func estimate(from coordinate: CLLocationCoordinate2D, to place: WirePlace) -> Int? {
        let here = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let there = CLLocation(latitude: place.lat, longitude: place.lng)
        let meters = here.distance(from: there)
        guard meters > 0 else { return 1 }
        return max(1, Int((meters * 1.3 / 78).rounded(.up)))
    }

    @MainActor
    static func openDirections(to place: WirePlace) {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)))
        item.name = place.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking])
    }

    static func angle(for minutes: Int) -> Double {
        min(0.96, max(0.08, 1 - Double(minutes) * 0.06))
    }
}
