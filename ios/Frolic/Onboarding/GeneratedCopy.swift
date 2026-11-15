import Foundation

struct DeviceCopy: Equatable {
    var headline: String
    var why: String
}

protocol DeviceCopyWriting: Sendable {
    func tasteHeadline(topTags: [String], budget: String, recentFrolics: [String]) async -> DeviceCopy?
    func whyLine(placeName: String, topTags: [String]) async -> String?
    func gardenCaption(placeName: String, date: String, people: Int) async -> String?
}

enum DeviceCopyRules {
    static let headlineMax = 40
    static let whyMax = 90
    static let lineMax = 140

    static func headline(_ raw: String) -> String? {
        guard let text = cleaned(raw) else { return nil }
        guard text.count <= headlineMax, !(text.first?.isLowercase ?? false) else { return nil }
        return text
    }

    static func why(_ raw: String) -> String? {
        guard let text = cleaned(raw, keepsFinalStop: true) else { return nil }
        guard text.count <= whyMax else { return nil }
        return text
    }

    static func line(_ raw: String, max: Int = lineMax) -> String? {
        guard let text = cleaned(raw, keepsFinalStop: true) else { return nil }
        guard text.count <= max else { return nil }
        return text
    }

    private static func cleaned(_ raw: String, keepsFinalStop: Bool = false) -> String? {
        var text = raw
            .replacingOccurrences(of: "\u{2014}", with: ",")
            .replacingOccurrences(of: "\u{2013}", with: ",")
            .replacingOccurrences(of: "!", with: ".")
            .replacingOccurrences(of: "\n", with: " ")
        text = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        text = text.trimmingCharacters(in: CharacterSet(charactersIn: " \"'“”"))
        guard !text.isEmpty else { return nil }
        guard text.range(of: "\\bnot\\b[^.]{0,40}\\bbut\\b", options: [.regularExpression, .caseInsensitive]) == nil else { return nil }
        if keepsFinalStop, !text.hasSuffix("."), !text.hasSuffix("?") {
            text += "."
        }
        return text
    }
}

enum GeneratedCopy {
    static let shared: DeviceCopyWriting = makeWriter()

    private static func makeWriter() -> DeviceCopyWriting {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return FoundationModelsCopyWriter()
        }
        #endif
        return SilentCopyWriter()
    }

    static var isOnDeviceModelAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModelSupport.isAvailable
        }
        #endif
        return false
    }
}

struct SilentCopyWriter: DeviceCopyWriting {
    func tasteHeadline(topTags: [String], budget: String, recentFrolics: [String]) async -> DeviceCopy? { nil }
    func whyLine(placeName: String, topTags: [String]) async -> String? { nil }
    func gardenCaption(placeName: String, date: String, people: Int) async -> String? { nil }
}

#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
enum SystemLanguageModelSupport {
    static var isAvailable: Bool {
        if case .available = SystemLanguageModel.default.availability { return true }
        return false
    }
}

@available(iOS 26.0, *)
@Generable
struct GeneratedTasteLine {
    @Guide(description: "The crew name they will recognize, title case, two or three words, at most 32 characters.")
    let headline: String
    @Guide(description: "One lowercase clause naming what this group keeps choosing, at most 90 characters, ending with a period.")
    let why: String
}

@available(iOS 26.0, *)
@Generable
struct GeneratedLine {
    @Guide(description: "One lowercase sentence, at most 120 characters, ending with a period.")
    let text: String
}

@available(iOS 26.0, *)
struct FoundationModelsCopyWriter: DeviceCopyWriting {
    private static let voice = [
        "You write copy for Frolic, which turns a friend group's tastes into one plan for tonight.",
        "Voice: plain and warm. Say what is true of this group: what they like, what it costs, what the sky is doing.",
        "Lowercase openings on why lines and captions, sentence case elsewhere.",
        "Commas, not dashes. No em dashes. No exclamation marks. No hype adjectives, no emoji.",
        "Never the shape not X, but Y.",
        "Names in this house voice: Sunset Crew, Late-Night Noodle Society.",
    ].joined(separator: " ")

    func tasteHeadline(topTags: [String], budget: String, recentFrolics: [String]) async -> DeviceCopy? {
        guard SystemLanguageModelSupport.isAvailable else { return nil }
        let prompt = [
            Self.voice,
            "",
            "Write a crew name and a one line why for this group's taste.",
            "headline: the name they will recognize, title case, like Sunset Crew or Late-Night Noodle Society.",
            "why: one clause, lowercase start, like: you keep picking sunsets, free stuff, and being outside.",
            "",
            "Tags: " + (topTags.isEmpty ? "none yet" : topTags.joined(separator: ", ")),
            "Budget: " + budget,
            "Recent frolics: " + (recentFrolics.isEmpty ? "none yet" : recentFrolics.joined(separator: "; ")),
        ].joined(separator: "\n")
        do {
            let session = LanguageModelSession(instructions: Self.voice)
            let response = try await session.respond(to: prompt, generating: GeneratedTasteLine.self)
            guard let headline = DeviceCopyRules.headline(response.content.headline),
                  let why = DeviceCopyRules.why(response.content.why)
            else { return nil }
            return DeviceCopy(headline: headline, why: why)
        } catch {
            return nil
        }
    }

    func whyLine(placeName: String, topTags: [String]) async -> String? {
        guard SystemLanguageModelSupport.isAvailable else { return nil }
        let prompt = [
            "Write the one line reason under tonight's plan at " + placeName + ".",
            "At most 120 characters, lowercase start, one clause, ends with a period.",
            "Like: you're into sunsets, it's free, and the sky's clear until dark.",
            "Group top tags: " + (topTags.isEmpty ? "unknown" : topTags.joined(separator: ", ")),
        ].joined(separator: "\n")
        return await generateLine(prompt)
    }

    func gardenCaption(placeName: String, date: String, people: Int) async -> String? {
        guard SystemLanguageModelSupport.isAvailable else { return nil }
        let prompt = [
            "Write one line for the group's memory book about the night that just happened at " + placeName + ".",
            "At most 80 characters, like: three of us at the marina on " + date + ", and the sky did the rest.",
            "People: " + String(people),
        ].joined(separator: "\n")
        return await generateLine(prompt, max: 80)
    }

    private func generateLine(_ prompt: String, max: Int = 120) async -> String? {
        do {
            let session = LanguageModelSession(instructions: Self.voice)
            let response = try await session.respond(to: prompt, generating: GeneratedLine.self)
            return DeviceCopyRules.line(response.content.text, max: max)
        } catch {
            return nil
        }
    }
}
#endif
