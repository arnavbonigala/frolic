import Foundation
import UIKit
import WidgetKit

enum LockScreenStore {
    static let widgetKind = "FrolicToday"
    private static let snapshotKey = "lockscreen.snapshot"
    private static let failureKey = "lockscreen.failure"
    private static let e2eKey = "lockscreen.e2eWidget"
    private static let failureAtKey = "lockscreen.failureAt"

    static var lastFailureAt: Date? {
        AppGroup.defaults.object(forKey: failureAtKey) as? Date
    }

    static func image(_ name: String) -> UIImage? {
        guard let url = heroDirectory?.appending(path: "\(name).png") else { return nil }
        return UIImage(contentsOfFile: url.path(percentEncoded: false))
    }

    static var snapshot: LockScreenSnapshot? {
        get {
            AppGroup.defaults.data(forKey: snapshotKey).flatMap { try? JSONDecoder().decode(LockScreenSnapshot.self, from: $0) }
        }
        set {
            AppGroup.defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: snapshotKey)
        }
    }

    static var lastFailure: FrolicAPIError? {
        get {
            guard let raw = AppGroup.defaults.string(forKey: failureKey) else { return nil }
            switch raw {
            case "offline": return .offline
            case "signedOut": return .signedOut
            case "rateLimited": return .rateLimited
            default: return .server(code: "UNKNOWN", message: raw)
            }
        }
        set {
            let raw: String? = switch newValue {
            case .none: nil
            case .offline: "offline"
            case .signedOut: "signedOut"
            case .rateLimited: "rateLimited"
            case .server(_, let message): message
            case .unreadable: FrolicAPIError.unreadable.errorDescription
            }
            AppGroup.defaults.set(raw, forKey: failureKey)
            AppGroup.defaults.set(raw == nil ? nil : Date.now, forKey: failureAtKey)
        }
    }

    static var e2eWidgetState: String? {
        get { AppGroup.defaults.string(forKey: e2eKey) }
        set { AppGroup.defaults.set(newValue, forKey: e2eKey) }
    }

    static func save(_ snapshot: LockScreenSnapshot) {
        let changed = self.snapshot != snapshot
        self.snapshot = snapshot
        lastFailure = nil
        if changed { WidgetCenter.shared.reloadTimelines(ofKind: widgetKind) }
    }

    static func fetch() async throws -> LockScreenSnapshot {
        guard let credentials = SharedSession.credentials else { throw FrolicAPIError.signedOut }
        let http = FrolicHTTP(deploymentURL: credentials.url)
        let args: [String: Any] = ["deviceToken": credentials.token, "groupId": credentials.groupId]
        let today = try await http.query("frolics:today", args, as: TodayResponse.self)
        let day = today.frolic?.day ?? Self.localDay()
        let crew = try? await http.query("crew:crew", args.merging(["day": day]) { a, _ in a }, as: CrewResponse.self)
        if SharedSession.userId == nil, let me = try? await http.query("users:me", ["deviceToken": credentials.token], as: MeResponse.self) {
            SharedSession.userId = me.userId
            SharedSession.name = me.name
        }
        return LockScreenSnapshot(today: today, crew: crew, myUserId: SharedSession.userId)
    }

    static func syncClock() async {
        guard let http = try? FrolicHTTP.current() else { return }
        let before = Date.now.timeIntervalSince1970
        guard let server = try? await http.mutation("clock:now", [:], as: Double.self) else { return }
        let after = Date.now.timeIntervalSince1970
        SharedSession.clockOffset = server / 1000 - (before + after) / 2
    }

    static func localDay(_ date: Date = .now) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static var heroDirectory: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: AppGroup.identifier)?.appending(path: "heroes", directoryHint: .isDirectory)
    }

    static func portrait(_ person: LockScreenPerson) -> UIImage? {
        guard let url = heroDirectory?.deletingLastPathComponent().appending(path: "portraits/\(person.id).jpg") else { return nil }
        return UIImage(contentsOfFile: url.path(percentEncoded: false))
    }

    static func cachePortraits(_ people: [LockScreenPerson]) async {
        guard let dir = heroDirectory?.deletingLastPathComponent().appending(path: "portraits", directoryHint: .isDirectory) else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for person in people {
            let file = dir.appending(path: "\(person.id).jpg")
            guard !FileManager.default.fileExists(atPath: file.path(percentEncoded: false)),
                  let raw = person.photoUrl, let url = URL(string: raw)
            else { continue }
            let response = try? await URLSession.shared.data(from: url)
            guard let data = response?.0,
                  let image = UIImage(data: data)?.preparingThumbnail(of: CGSize(width: 96, height: 96)),
                  let jpeg = image.jpegData(compressionQuality: 0.8)
            else { continue }
            try? jpeg.write(to: file)
        }
    }
}
