import Combine
import ConvexMobile
import Foundation
import Observation
import SwiftUI

struct YouProfile: Codable, Equatable {
    var userId: String
    var name: String
    var photoUrl: String?
    var groups: [Group]

    struct Group: Codable, Equatable {
        var groupId: String
        var name: String
        var color: String
        var joinedAt: Double?
    }

    var crewName: String? {
        groups.first?.name
    }

    var crewColor: FlowerColor {
        groups.first.flatMap { FlowerColor(rawValue: $0.color) } ?? .tomato
    }
}

struct YouToday: Decodable {
    var phase: String
    var frolic: Frolic?
    var reveal: Reveal?

    struct Frolic: Decodable {
        var plan: Plan?
    }

    struct Plan: Decodable {
        var title: String
        var place: Place?
    }

    struct Place: Decodable {
        var name: String
    }

    struct Reveal: Decodable {
        var going: [Person]
        var me: Me
    }

    struct Person: Decodable {
        var userId: String
        var name: String
        var color: String
        var photoUrl: String?
        var role: String
    }

    struct Me: Decodable {
        var going: Bool
    }
}

struct YouOverview: Decodable {
    var memories: [Memory]
    var yourCount: Int?

    struct Memory: Decodable {
        var youWent: Bool
    }
}

struct YouCardPerson: Codable, Equatable {
    var name: String
    var color: FlowerColor
    var photoUrl: String?
}

struct YouCard: Codable, Equatable {
    var went = false
    var people: [YouCardPerson] = []
    var friends: [String] = []
    var place = ""

    static let none = YouCard()

    static let wentSample = YouCard(
        went: true,
        people: [
            YouCardPerson(name: "You", color: .tomato, photoUrl: nil),
            YouCardPerson(name: "Maya", color: .pink, photoUrl: nil),
            YouCardPerson(name: "Dev", color: .cobalt, photoUrl: nil),
        ],
        friends: ["Maya", "Dev"],
        place: "Indian Rock"
    )

    var friendLine: String {
        friends.isEmpty ? "You went to \(place) today." : "You, \(YouNames.list(friends)) went to \(place) today."
    }
}

enum YouNames {
    static func list(_ names: [String]) -> String {
        switch names.count {
        case 0: return ""
        case 1: return names[0]
        case 2: return "\(names[0]) and \(names[1])"
        default:
            return names.dropLast().joined(separator: ", ") + " and " + (names.last ?? "")
        }
    }
}

enum YouSavePhase: Equatable {
    case idle
    case saving
    case saved
    case failed
}

enum YouAccountPhase: Equatable {
    case idle
    case working
    case failed
}

enum YouCountPhase: Equatable {
    case loading
    case ready
    case failed
}

@MainActor
@Observable
final class YouModel {
    var profile: YouProfile? = YouPreferences.cachedProfile()
    var loadPhase: ScreenPhase = .loading
    var card: YouCard = YouPreferences.cachedCard()
    var budget: YouBudget?
    var energy: YouEnergyChoice?
    var travel: Double?
    var homeBy: YouHomeBy?
    var readCalendar = YouPreferences.readCalendar
    var tasteTags: [String] = []
    var wentCount: Int?
    var countPhase: YouCountPhase = .loading
    var savePhase: YouSavePhase = .idle
    var accountPhase: YouAccountPhase = .idle

    @ObservationIgnored private var hasLoaded = false
    @ObservationIgnored private var cardOverride: YouCard?
    @ObservationIgnored private var countOverride: YouCountPhase?
    @ObservationIgnored private var countTask: Task<Void, Never>?
    @ObservationIgnored private var saveTask: Task<Void, Never>?

    init() {
        tasteTags = YouPreferences.tasteTags
        if let cached = YouPreferences.cachedLimits() {
            apply(cached)
        }
        if profile != nil || YouPreferences.cachedLimits() != nil {
            loadPhase = .ready
        }
    }

    var groupId: String? {
        CrewSelection.choose(
            pinned: ProcessInfo.processInfo.environment[FrolicIdentity.groupEnvironmentKey],
            persisted: FrolicIdentity.shared.groupId ?? FrolicIdentity.storedGroupChoice,
            memberships: (profile?.groups ?? []).map { group in
                CrewSelection.Candidate(groupId: group.groupId, joinedAt: group.joinedAt ?? 0)
            }
        ) ?? FrolicIdentity.shared.groupId
    }

    var crewName: String? {
        profile?.crewName
    }

    var myColor: FlowerColor {
        profile?.crewColor ?? .tomato
    }

    func run(backend: FrolicBackend, router: AppRouter) async {
        applyRoute(router.e2eRoute)
        let token = FrolicIdentity.shared.deviceToken
        if !backend.isConfigured {
            if !hasLoaded { loadPhase = .error(BackendError.notConfigured.localizedDescription) }
            return
        }
        guard let client = try? backend.requireClient() else {
            if !hasLoaded { loadPhase = .error(BackendError.notConfigured.localizedDescription) }
            return
        }
        if let cached = YouPreferences.cachedLimits() {
            apply(cached)
            loadPhase = .ready
        }
        if YouPreferences.tasteTags.isEmpty, let groupId = FrolicIdentity.shared.groupId {
            Task { [weak self] in
                guard let stream = try? client.subscribe(to: "taste:crew", with: ["deviceToken": token, "groupId": groupId], yielding: [String].self).values else { return }
                do {
                    for try await tags in stream {
                        let labels = tags.map { raw -> String in
                            let words = raw.replacingOccurrences(of: "_", with: " ")
                            return words.prefix(1).uppercased() + words.dropFirst()
                        }
                        self?.tasteTags = labels
                    }
                } catch {}
            }
        }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.trackLimits(client: client, token: token) }
            group.addTask { await self.trackProfile(client: client, token: token) }
            group.addTask { await self.trackCard(client: client, token: token) }
            group.addTask { await self.trackCount(client: client, token: token) }
            group.addTask { await self.watchLoad() }
        }
    }

    func choose(budget: YouBudget) {
        self.budget = budget
        persist()
    }

    func choose(energy: YouEnergyChoice) {
        self.energy = energy
        persist()
    }

    func choose(travel: Double) {
        self.travel = min(max(travel.rounded(), 5), 45)
        persist()
    }

    func choose(homeBy: YouHomeBy) {
        self.homeBy = homeBy
        persist()
    }

    func setReadCalendar(_ value: Bool) {
        readCalendar = value
        YouPreferences.readCalendar = value
    }

    func save(backend: FrolicBackend) {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await self?.flush(backend: backend)
        }
    }

    func retryCount(backend: FrolicBackend) {
        countTask?.cancel()
        countOverride = nil
        countPhase = .loading
        countTask = Task { [weak self] in
            await self?.restartCount(backend: backend)
        }
    }

    func retrySave(backend: FrolicBackend) {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            await self?.flush(backend: backend)
        }
    }

    func deleteAccount(backend: FrolicBackend) async -> Bool {
        accountPhase = .working
        let token = FrolicIdentity.shared.deviceToken
        guard let client = try? backend.requireClient() else {
            accountPhase = .failed
            return false
        }
        let args: [String: ConvexEncodable?] = ["deviceToken": token]
        do {
            try await client.mutation("users:deleteAccount", with: args)
            profile = nil
            card = YouCard.none
            hasLoaded = false
            loadPhase = .empty
            accountPhase = .idle
            YouPreferences.clearAll()
            FrolicIdentity.shared.signIn(deviceToken: Self.mintToken(), groupId: nil)
            return true
        } catch is CancellationError {
            accountPhase = .idle
            return false
        } catch {
            accountPhase = .failed
            return false
        }
    }

    func clearAccountError() {
        if accountPhase == .failed { accountPhase = .idle }
    }

    var currentLimits: YouLimits {
        YouLimits(
            budgetCap: budget?.cap,
            energy: energy?.stored,
            maxMinutes: travel,
            homeBy: homeBy?.minutes
        )
    }

    private func trackLimits(client: ConvexClient, token: String) async {
        let publisher = client.subscribe(
            to: "limits:mine",
            with: ["deviceToken": token],
            yielding: YouLimits.self
        )
        do {
            for try await limits in publisher.values {
                if savePhase == .saving || savePhase == .failed { continue }
                apply(limits)
                hasLoaded = true
                loadPhase = .ready
            }
        } catch is CancellationError {
            return
        } catch {
            fail(error)
        }
    }

    private func trackProfile(client: ConvexClient, token: String) async {
        let publisher = client.subscribe(
            to: "users:me",
            with: ["deviceToken": token],
            yielding: YouProfile?.self
        )
        do {
            for try await me in publisher.values {
                profile = me
                YouPreferences.save(profile: me)
                if let me {
                    hasLoaded = true
                    if loadPhase != .ready { loadPhase = .ready }
                } else if !hasLoaded {
                    loadPhase = .empty
                }
            }
        } catch is CancellationError {
            return
        } catch {
            fail(error)
        }
    }

    private func trackCard(client: ConvexClient, token: String) async {
        if let cardOverride {
            card = cardOverride
            return
        }
        guard let groupId = await resolvedGroupId() else {
            card = YouCard.none
            return
        }
        let publisher = client.subscribe(
            to: "frolics:today",
            with: ["deviceToken": token, "groupId": groupId],
            yielding: YouToday.self
        )
        do {
            for try await today in publisher.values {
                if let cardOverride {
                    card = cardOverride
                    continue
                }
                card = Self.card(from: today, profile: profile)
                YouPreferences.save(card: card)
            }
        } catch is CancellationError {
            return
        } catch {
            card = cardOverride ?? YouCard.none
        }
    }

    private func watchLoad() async {
        try? await Task.sleep(nanoseconds: 400_000_000)
        guard !Task.isCancelled, loadPhase == .loading else { return }
        loadPhase = .empty
    }

    private func trackCount(client: ConvexClient, token: String) async {
        if let countOverride {
            countPhase = countOverride
            return
        }
        guard let groupId = await resolvedGroupId() else {
            countPhase = .failed
            return
        }
        let publisher = client.subscribe(
            to: "garden:overview",
            with: ["deviceToken": token, "groupId": groupId],
            yielding: YouOverview.self
        )
        do {
            for try await overview in publisher.values {
                wentCount = overview.yourCount ?? overview.memories.filter(\.youWent).count
                countPhase = .ready
            }
        } catch is CancellationError {
            return
        } catch {
            countPhase = .failed
        }
    }

    private func restartCount(backend: FrolicBackend) async {
        let token = FrolicIdentity.shared.deviceToken
        guard let client = try? backend.requireClient() else {
            countPhase = .failed
            return
        }
        await trackCount(client: client, token: token)
    }

    private func resolvedGroupId() async -> String? {
        if let groupId { return groupId }
        for _ in 0..<20 {
            if Task.isCancelled { return nil }
            try? await Task.sleep(nanoseconds: 300_000_000)
            if let groupId { return groupId }
        }
        return nil
    }

    private static func mintToken() -> String {
        (0..<24).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    }

    private func apply(_ limits: YouLimits) {
        budget = YouBudget.from(limits.budgetCap)
        energy = YouEnergyChoice.from(limits.energy)
        travel = limits.maxMinutes.map(Self.travelValue)
        homeBy = YouHomeBy.from(limits.homeBy)
    }

    private func persist() {
        YouPreferences.save(limits: currentLimits, card: card)
    }

    private func flush(backend: FrolicBackend) async {
        let token = FrolicIdentity.shared.deviceToken
        guard let client = try? backend.requireClient() else {
            savePhase = .failed
            return
        }
        let snapshot = currentLimits
        YouPreferences.save(limits: snapshot)
        savePhase = .saving
        let args: [String: ConvexEncodable?] = [
            "deviceToken": token,
            "budgetCap": snapshot.budgetCap,
            "energy": snapshot.energy?.rawValue,
            "maxMinutes": snapshot.maxMinutes,
            "homeBy": snapshot.homeBy,
        ]
        do {
            try await client.mutation("limits:set", with: args)
            savePhase = .saved
        } catch is CancellationError {
            savePhase = .idle
        } catch {
            savePhase = .failed
        }
    }

    private func fail(_ error: Error) {
        guard !hasLoaded, loadPhase != .ready else { return }
        if String(describing: error).contains("UNKNOWN_DEVICE") {
            loadPhase = .empty
            return
        }
        loadPhase = .error("Check your connection and try again.")
    }

    private func applyRoute(_ route: E2ERoute?) {
        #if DEBUG || E2E
        guard let route, route.screen == "you" else { return }
        if route.query["went"] != nil {
            cardOverride = .wentSample
        }
        countOverride = nil
        if route.query["count"] == "error" { countOverride = .failed }
        if route.query["count"] == "loading" { countOverride = .loading }
        if let taste = route.query["taste"] {
            tasteTags = taste
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        }
        #endif
    }

    private static func travelValue(_ minutes: Double) -> Double {
        let clamped = min(max(minutes, 5), 45)
        return (clamped / 5).rounded() * 5
    }

    private static func card(from today: YouToday, profile: YouProfile?) -> YouCard {
        guard today.phase == "done", let reveal = today.reveal, reveal.me.going else { return YouCard.none }
        let myId = profile?.userId
        let friends = reveal.going.filter { $0.userId != myId }
        var people = [
            YouCardPerson(name: profile?.name ?? "You", color: profile?.crewColor ?? .tomato, photoUrl: profile?.photoUrl)
        ]
        for friend in friends.prefix(2) {
            people.append(
                YouCardPerson(
                    name: friend.name,
                    color: FlowerColor(rawValue: friend.color) ?? .pink,
                    photoUrl: friend.photoUrl
                )
            )
        }
        let place = today.frolic?.plan?.place?.name ?? today.frolic?.plan?.title ?? "your plan"
        return YouCard(went: true, people: people, friends: friends.prefix(2).map(\.name), place: place)
    }
}
