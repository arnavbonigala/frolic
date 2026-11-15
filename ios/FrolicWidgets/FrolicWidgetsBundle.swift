import SwiftUI
import WidgetKit

@main
struct FrolicWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        FrolicLiveActivity()
    }
}
