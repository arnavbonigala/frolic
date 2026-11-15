import SwiftUI

enum FrolicSpring {
    static let standard = Animation.spring(response: 0.35, dampingFraction: 1.0)
    static let gesture = Animation.interactiveSpring(response: 0.35, dampingFraction: 0.7, blendDuration: 0.2)
    static let settle = Animation.spring(response: 0.45, dampingFraction: 0.82)
    static let reveal = Animation.spring(response: 0.6, dampingFraction: 0.62)

    static func standard(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeInOut(duration: 0.2) : standard
    }

    static func gesture(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeInOut(duration: 0.2) : gesture
    }

    static func settle(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeInOut(duration: 0.24) : settle
    }

    static func reveal(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeInOut(duration: 0.3) : reveal
    }
}

extension Animation {
    static var frolic: Animation { FrolicSpring.standard }
    static var frolicGesture: Animation { FrolicSpring.gesture }
}
