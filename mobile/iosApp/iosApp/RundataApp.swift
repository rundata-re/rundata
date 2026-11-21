import SwiftUI
import Shared

/// L'hôte iPhone : l'écran principal commun (shared, Compose Multiplatform) dans une scène SwiftUI.
@main
struct RundataApp: App {
    var body: some Scene {
        WindowGroup {
            EcranCommun().ignoresSafeArea()
        }
    }
}

struct EcranCommun: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        return EcranIosKt.ecranPrincipal(version: version)
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
