import Observation
import SwiftUI
import UIKit

@MainActor
@Observable
final class OnboardingModel {
    enum Step: String {
        case join, name, taste, reading, calendar
    }

    enum InvitePhase: Equatable {
        case loading
        case ready
        case expired
        case invalid
        case offline
        case failed(String)
    }

    enum PhotoPhase: Equatable {
        case loading
        case ready
        case denied
        case empty
    }

    enum ReadingPhase: Equatable {
        case reading
        case done
        case quiet
    }

    enum CalendarPhase: Equatable {
        case reading
        case ready
        case denied
        case empty
    }

    enum FreeChoice: Equatable {
        case none
        case window(DateInterval)
        case notToday
    }

    struct Seed: Equatable {
        var screen: String
        var state: String?
        var query: [String: String]
    }

    var step: Step = .join
    var invitePhase: InvitePhase = .loading
    var preview: InvitePreview?
    var link: InviteLink?
    var isSolo = false
    var question = ""
    var firstName = ""
    var photo: Data?
    var photoImage: UIImage?
    var photos: [TastePhoto] = []
    var photoPhase: PhotoPhase = .loading
    var pickedIds: [String] = []
    var tags: [TasteTag] = []
    var readingPhase: ReadingPhase = .reading
    var freeDays: [FreeDay] = []
    var calendarPhase: CalendarPhase = .reading
    var freeChoice: FreeChoice = .none
    var isSubmitting = false
    var failure: OnboardingFailure?
    var showsFreeSheet = false
    var showsPhotoSheet = false
    var showsInviteEntry = false
    var groupId: String?

    var onFinish: () -> Void = {}

    private(set) var backend: OnboardingBackend
    private var seed: Seed?
    private var recentFrolics: [String] = []
    private var didStart = false

    init(backend: OnboardingBackend, seed: Seed? = nil) {
        self.backend = backend
        self.seed = seed
    }

    var pickedPhotos: [TastePhoto] {
        pickedIds.compactMap { id in photos.first(where: { $0.id == id }) }
    }

    var canContinueTaste: Bool { pickedIds.count >= 3 }

    var crewName: String {
        preview?.groupName ?? (firstName.isEmpty ? "Your crew" : firstName + "'s crew")
    }

    func start() {
        guard !didStart else { return }
        didStart = true
        if let override = InviteLink.launchOverride {
            link = override
        }
        guard let seed else {
            loadInvite()
            return
        }
        step = Step(rawValue: seed.screen) ?? .join
        if let code = seed.query["invite"], let link = InviteLink(text: code) { self.link = link }
        switch step {
        case .join:
            applyJoinSeed(seed)
        case .name:
            if seed.query["photo"] != nil {
                photoImage = UIImage(named: "photo-selfie.jpg")
                photo = photoImage?.jpegData(compressionQuality: 0.8)
            }
            firstName = seed.query["name"] ?? ""
            preview = Self.demoPreview
        case .taste, .reading:
            preview = Self.demoPreview
            photos = TasteLibrary.demoPhotos
            photoPhase = .ready
            let wanted = Int(seed.query["selected"] ?? "") ?? (step == .reading ? 4 : 0)
            pickedIds = Array(photos.prefix(max(0, wanted))).map(\.id)
            if step == .reading { runReading() }
        case .calendar:
            preview = Self.demoPreview
            applyCalendarSeed(seed)
        }
    }

    private func applyJoinSeed(_ seed: Seed) {
        switch seed.query["invite"] {
        case "expired":
            preview = Self.demoPreview
            invitePhase = .expired
        case "invalid":
            invitePhase = .invalid
        case "offline":
            invitePhase = .offline
        case "none":
            isSolo = true
            invitePhase = .ready
        default:
            switch seed.query["phase"] {
            case "loading":
                preview = Self.demoPreview
                invitePhase = .loading
            case "error":
                invitePhase = .failed("Something got in the way.")
            case "offline":
                invitePhase = .offline
            default:
                preview = Self.demoPreview
                invitePhase = .ready
            }
        }
    }

    private func applyCalendarSeed(_ seed: Seed) {
        switch seed.query["calendar"] {
        case "denied":
            calendarPhase = .denied
        case "empty":
            calendarPhase = .empty
        case "reading":
            calendarPhase = .reading
        default:
            freeDays = FreeDay.demo
            calendarPhase = .ready
        }
    }

    static let demoPreview = InvitePreview(
        groupName: "Sunset Crew",
        invitedBy: "Maya",
        members: [
            .init(name: "Maya", color: "pink"),
            .init(name: "Dev", color: "cobalt"),
            .init(name: "Jordan", color: "moss"),
            .init(name: "Priya", color: "marigold"),
        ],
        memberCount: 4
    )

    func loadInvite() {
        guard let link else {
            invitePhase = .ready
            isSolo = true
            return
        }
        invitePhase = .ready
        failure = nil
        Task {
            do {
                let preview = try await backend.preview(code: link.code)
                self.preview = preview
                invitePhase = .ready
            } catch {
                let failure = OnboardingBackend.classify(error)
                switch failure {
                case .inviteUnknown: invitePhase = .invalid
                case .inviteExpired: invitePhase = .expired
                case .offline, .notConnected: invitePhase = .offline
                default: invitePhase = .failed(failure.title)
                }
            }
        }
    }

    func retryInvite() {
        loadInvite()
    }

    func acceptInvite() {
        isSolo = false
        failure = nil
        step = .name
    }

    func startSolo() {
        isSolo = true
        failure = nil
        step = .name
    }

    func submitInviteLink(_ text: String) {
        guard let parsed = InviteLink(text: text) else {
            invitePhase = .invalid
            showsInviteEntry = false
            return
        }
        link = parsed
        showsInviteEntry = false
        loadInvite()
    }

    func submitName() async {
        let name = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !isSubmitting else { return }
        isSubmitting = true
        failure = nil
        do {
            if isSolo {
                let outcome = try await backend.createGroup(firstName: name)
                groupId = outcome.groupId
            } else if let link {
                let outcome = try await backend.join(code: link.code, firstName: name)
                groupId = outcome.groupId
            } else {
                let outcome = try await backend.createGroup(firstName: name)
                groupId = outcome.groupId
            }
            if let photoData = photo {
                try? await backend.uploadPhoto(photoData)
            }
            recentFrolics = await backend.todayPlanTitle(groupId: groupId ?? "")
            OnboardingIdentity.firstName = name
            OnboardingIdentity.groupId = groupId
            OnboardingIdentity.inviteCode = link?.code
            step = .taste
            await loadPhotos()
        } catch {
            failure = OnboardingBackend.classify(error)
        }
        isSubmitting = false
    }

    func loadPhotos() async {
        photoPhase = .loading
        if let seed, seed.query["photos"] == "demo" {
            photos = TasteLibrary.demoPhotos
            photoPhase = .ready
            return
        }
        switch TasteLibrary.access {
        case .denied:
            photoPhase = .denied
            return
        case .undetermined:
            let access = await TasteLibrary.requestAccess()
            if access == .denied {
                photoPhase = .denied
                return
            }
        case .authorized, .limited:
            break
        }
        let recent = await TasteLibrary.recent()
        if recent.isEmpty {
            photos = []
            photoPhase = .empty
            return
        }
        var loaded: [TastePhoto] = []
        for item in recent {
            var photo = item
            photo.image = await TasteLibrary.image(for: item)
            loaded.append(photo)
        }
        photos = loaded
        photoPhase = .ready
    }

    func useDemoPhotos() async {
        photos = TasteLibrary.demoPhotos
        photoPhase = .ready
    }

    func togglePick(_ id: String) {
        if let index = pickedIds.firstIndex(of: id) {
            pickedIds.remove(at: index)
        } else {
            pickedIds.append(id)
        }
    }

    func pickIndex(_ id: String) -> Int? {
        pickedIds.firstIndex(of: id).map { $0 + 1 }
    }

    func startReading() {
        guard canContinueTaste else { return }
        step = .reading
        runReading()
    }

    func runReading() {
        readingPhase = .reading
        tags = []
        Task {
            var found: [TasteTag] = []
            for photo in pickedPhotos {
                var photoTags = photo.tags
                if photoTags.isEmpty, let data = await TasteLibrary.data(for: photo) {
                    photoTags = await PhotoTagging.tags(for: data)
                }
                for tag in photoTags where !found.contains(tag) {
                    found.append(tag)
                    tags = found
                    try? await Task.sleep(nanoseconds: 420_000_000)
                }
            }
            readingPhase = found.isEmpty ? .quiet : .done
        }
    }

    func repick() {
        failure = nil
        step = .taste
        if photos.isEmpty { Task { await loadPhotos() } }
    }

    func confirmTaste() async {
        failure = nil
        step = .calendar
        readCalendar()
    }

    func readCalendar() {
        calendarPhase = .reading
        Task {
            if let seed {
                applyCalendarSeed(seed)
                return
            }
            switch CalendarRead.access {
            case .notAsked:
                guard CalendarRead.isPackaged else {
                    calendarPhase = .denied
                    return
                }
                try? await Task.sleep(nanoseconds: 550_000_000)
                let access = await CalendarRead.requestAccess()
                guard access == .granted else {
                    calendarPhase = .denied
                    return
                }
            case .denied:
                calendarPhase = .denied
                return
            case .granted:
                break
            }
            let week = await Task.detached(priority: .userInitiated) { CalendarRead.week() }.value
            freeDays = week
            calendarPhase = week.isEmpty ? .empty : .ready
        }
    }

    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    func useCalendar() async {
        freeChoice = .window(CalendarRead.todayWindow(freeDays) ?? DateInterval(start: Date(), duration: 3600))
        await finish()
    }

    func tellItEachDay() {
        showsFreeSheet = true
    }

    func chooseFree(_ choice: FreeChoice) async {
        freeChoice = choice
        showsFreeSheet = false
        await finish()
    }

    func finish() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        let groupId = groupId ?? OnboardingIdentity.groupId ?? ""
        if !groupId.isEmpty {
            switch freeChoice {
            case .window(let interval):
                try? await backend.setFreeToday(groupId: groupId, state: "window", window: interval)
                OnboardingIdentity.lastFreeState = "Free till 8"
            case .notToday:
                try? await backend.setFreeToday(groupId: groupId, state: "busy", window: nil)
                OnboardingIdentity.lastFreeState = "Not today"
            case .none:
                OnboardingIdentity.lastFreeState = "Free till 8"
            }
            OnboardingIdentity.commit(groupId: groupId)
        }
        OnboardingIdentity.isComplete = true
        OnboardingSessionRelay.store(deviceToken: OnboardingIdentity.deviceToken, groupId: groupId)
        isSubmitting = false
        onFinish()
    }
}
