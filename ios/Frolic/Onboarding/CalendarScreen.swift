import SwiftUI

struct CalendarScreen: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        OnboardingPage {
            OnboardingTitle(
                title: "Never type when you're free",
                subcopy: "Frolic reads your calendar on your phone and shows your crew only when you're free. Never what you're doing.",
                identifier: "calendar.title"
            )
            switch model.calendarPhase {
            case .reading:
                skeleton
            case .ready:
                week
            case .denied:
                OnboardingStateCard(
                    title: "Frolic can't see your calendar",
                    detail: "That's fine. Tell it each day when you're free, or allow the calendar in Settings.",
                    actionTitle: "I'll tell it each day",
                    secondaryTitle: "Open Settings",
                    onAction: { model.tellItEachDay() },
                    onSecondary: { model.openSettings() },
                    identifier: "state.error"
                )
                .padding(.top, 20)
            case .empty:
                OnboardingStateCard(
                    title: "Nothing to show yet",
                    detail: "Your calendar has no days Frolic can read. Tell it each day when you're free.",
                    actionTitle: "I'll tell it each day",
                    onAction: { model.tellItEachDay() },
                    identifier: "state.empty"
                )
                .padding(.top, 20)
            }
        } bar: {
            if model.calendarPhase == .ready || model.calendarPhase == .reading {
                Button(model.isSubmitting ? "One moment" : "Use my calendar") {
                    Task { await model.useCalendar() }
                }
                .buttonStyle(.frolicPrimary)
                .disabled(model.calendarPhase != .ready || model.isSubmitting)
                .accessibilityIdentifier("calendar.use")
            }
            Button("I'll tell it each day") { model.tellItEachDay() }
                .buttonStyle(.frolicText)
                .accessibilityIdentifier("calendar.manual")
        }
        .sheet(isPresented: $model.showsFreeSheet) {
            FreeSheet(model: model)
        }
    }

    private var week: some View {
        VStack(alignment: .leading, spacing: 0) {
            FrolicGroup {
                ForEach(Array(model.freeDays.enumerated()), id: \.element.id) { index, day in
                    HStack {
                        Text(day.label)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(FrolicColor.ink)
                        Spacer(minLength: 8)
                        Text(day.value)
                            .font(.system(size: 17))
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(minHeight: 60)
                    .overlay(alignment: .top) {
                        if index > 0 { FrolicColor.line.frame(height: 0.5).padding(.leading, 16) }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier(day.id == "today" ? "calendar.row.today" : "calendar.row.\(day.id)")
                }
            }
            .padding(.top, 20)
            Text("This is what your crew would see this week.")
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 8)
                .padding(.horizontal, 16)
        }
    }

    private var skeleton: some View {
        FrolicGroup {
            ForEach(0..<5, id: \.self) { index in
                HStack {
                    RoundedRectangle(cornerRadius: 6).fill(FrolicColor.chip).frame(width: 44, height: 16)
                    Spacer()
                    RoundedRectangle(cornerRadius: 6).fill(FrolicColor.chip).frame(width: 120, height: 16)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 60)
                .overlay(alignment: .top) {
                    if index > 0 { FrolicColor.line.frame(height: 0.5).padding(.leading, 16) }
                }
            }
        }
        .padding(.top, 20)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Reading your calendar")
        .accessibilityIdentifier("state.loading")
    }
}

struct FreeSheet: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("When are you free today?")
                .frolicFont(.sheetTitle)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("free.sheet.title")
            Text("Your crew sees this. What you're doing stays private.")
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
            FrolicGroup {
                option("Free now till 8 PM", sub: "From your calendar", id: "free.sheet.till8", divider: false) {
                    Task { await model.chooseFree(.window(Self.window(from: nil))) }
                }
                option("Free 5 PM to 8 PM", sub: "Set by you, just for today", id: "free.sheet.after5", divider: true) {
                    Task { await model.chooseFree(.window(Self.window(from: 17))) }
                }
                option("Not today", sub: "No plan for you today. Nobody gets told.", id: "free.sheet.notToday", divider: true) {
                    Task { await model.chooseFree(.notToday) }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .presentationDetents([.height(400)])
        .presentationBackground(FrolicColor.cream)
    }

    private func option(_ title: String, sub: String, id: String, divider: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(FrolicColor.ink)
                Text(sub).font(.system(size: 14)).foregroundStyle(FrolicColor.secondaryText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
            .overlay(alignment: .top) {
                if divider { FrolicColor.line.frame(height: 0.5).padding(.leading, 16) }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(id)
    }

    static func window(from hour: Int?) -> DateInterval {
        let calendar = Calendar.current
        let now = Date()
        let end = calendar.date(bySettingHour: 20, minute: 0, second: 0, of: now) ?? now.addingTimeInterval(3600)
        let start = hour.flatMap { calendar.date(bySettingHour: $0, minute: 0, second: 0, of: now) } ?? now
        return DateInterval(start: min(start, end.addingTimeInterval(-900)), end: end)
    }
}
