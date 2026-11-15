import Foundation
import WidgetKit

struct MeadowSnapshot: Codable, Equatable {
    var fetchedAt: Date
    var groupName: String
    var freeNow: [LockScreenPerson]
    var restingCount: Int
    var healthLine: String?

    static let widgetKind = "FrolicMeadow"
    static let quietLine = "Quiet right now"
    static let tapLine = "Tap if you're free"
    private static let cacheKey = "lockscreen.meadow"

    var isAlone: Bool { freeNow.isEmpty && restingCount == 0 }

    var headline: String {
        if !freeNow.isEmpty {
            return "\(LockScreenCopy.list(freeNow.map(\.name))) \(freeNow.count == 1 ? "is" : "are") free right now"
        }
        if isAlone { return "Just you so far" }
        return healthLine ?? Self.quietLine
    }

    static var cached: MeadowSnapshot? {
        get { AppGroup.defaults.data(forKey: cacheKey).flatMap { try? JSONDecoder().decode(MeadowSnapshot.self, from: $0) } }
        set { AppGroup.defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: cacheKey) }
    }

    private struct GardenOverview: Decodable {
        struct Health: Decodable {
            var line: String?
        }

        var health: Health?
    }

    static func fetch(now: Date = .now) async throws -> MeadowSnapshot {
        guard let credentials = SharedSession.credentials else { throw FrolicAPIError.signedOut }
        let http = FrolicHTTP(deploymentURL: credentials.url)
        let args: [String: Any] = ["deviceToken": credentials.token, "groupId": credentials.groupId]
        let day = LockScreenStore.snapshot?.day ?? LockScreenStore.localDay(now)
        let crew = try await http.query("crew:crew", args.merging(["day": day]) { a, _ in a }, as: CrewResponse.self)
        let health = try? await http.query("garden:overview", args, as: GardenOverview.self)
        let nowMs = (now.timeIntervalSince1970 + SharedSession.clockOffset) * 1000
        let friends = crew.members.filter { !$0.isMe }
        let free = friends.filter { member in
            guard let free = member.free else { return false }
            if free.state == "now" { return true }
            guard free.state == "window", let window = free.window else { return false }
            return window.start <= nowMs && nowMs <= window.end
        }
        return MeadowSnapshot(
            fetchedAt: now,
            groupName: crew.groupName,
            freeNow: free.map { LockScreenPerson(id: $0.userId, name: $0.name, color: FlowerColor(rawValue: $0.color) ?? .marigold, photoUrl: $0.photoUrl) },
            restingCount: friends.count - free.count,
            healthLine: health?.health?.line.flatMap { $0.isEmpty ? nil : $0 }
        )
    }

    static func reload() {
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }
}
