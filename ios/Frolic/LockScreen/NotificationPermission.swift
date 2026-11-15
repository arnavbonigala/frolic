import SwiftUI
import UIKit
import UserNotifications

enum NotificationPermission {
    static let prePromptTitle = "We'll tell you the second it's on"
    static let allowTitle = "Turn on notifications"
    static let laterTitle = "Not now"

    static func status() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    static func needsAsk() async -> Bool {
        await status() == .notDetermined
    }

    static func isAllowed() async -> Bool {
        let current = await status()
        return current == .authorized || current == .provisional || current == .ephemeral
    }

    @discardableResult
    static func request() async -> Bool {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted {
            await DropNotifications.scheduleNext(snapshot: LockScreenStore.snapshot)
        }
        return granted
    }

    @MainActor
    static func openSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

extension View {
    func notificationPrePrompt(isPresented: Binding<Bool>) -> some View {
        alert(NotificationPermission.prePromptTitle, isPresented: isPresented) {
            Button(NotificationPermission.allowTitle) {
                Task { await NotificationPermission.request() }
            }
            .accessibilityIdentifier("notifications.allow")
            Button(NotificationPermission.laterTitle, role: .cancel) {}
                .accessibilityIdentifier("notifications.later")
        }
    }
}
