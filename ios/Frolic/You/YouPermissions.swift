import CoreLocation
import EventKit
import Observation
import SwiftUI
import UIKit
import UserNotifications

enum YouPermissionStatus: Equatable {
    case on
    case off
    case notAsked
    case checking

    var label: String {
        switch self {
        case .on: "On"
        case .off: "Off"
        case .notAsked: "Not asked yet"
        case .checking: "Checking"
        }
    }
}

@MainActor
@Observable
final class YouPermissionModel {
    var notifications: YouPermissionStatus = .checking
    var calendar: YouPermissionStatus = .checking
    var location: YouPermissionStatus = .checking

    @ObservationIgnored private let locationManager = CLLocationManager()

    func refresh() async {
        location = Self.status(for: locationManager.authorizationStatus)
        calendar = Self.status(for: EKEventStore.authorizationStatus(for: .event))
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        notifications = Self.status(for: settings.authorizationStatus)
    }

    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    private static func status(for status: UNAuthorizationStatus) -> YouPermissionStatus {
        switch status {
        case .authorized, .provisional, .ephemeral: .on
        case .denied: .off
        case .notDetermined: .notAsked
        @unknown default: .notAsked
        }
    }

    private static func status(for status: EKAuthorizationStatus) -> YouPermissionStatus {
        switch status {
        case .notDetermined: .notAsked
        case .denied, .restricted, .writeOnly: .off
        default: .on
        }
    }

    private static func status(for status: CLAuthorizationStatus) -> YouPermissionStatus {
        switch status {
        case .notDetermined: .notAsked
        case .denied, .restricted: .off
        case .authorizedAlways, .authorizedWhenInUse: .on
        @unknown default: .notAsked
        }
    }
}
