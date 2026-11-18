# Android App Guide — B'n'D (Bind & Divide)

This repository packages **B'n'D — Bind & Divide** (`com.christoctavianus.bnd`) as an offline-capable **Capacitor 8 Android** application locked to portrait orientation.

## Native Shell Highlights
- **100% Offline Assets:** Fonts (`@fontsource/cinzel` and `@fontsource/inter`) are bundled directly into `dist/` by Vite — no external network requests or CDN fonts are needed at runtime.
- **Portrait Lock & Edge-to-Edge Safe Areas:** `AndroidManifest.xml` sets `android:screenOrientation="portrait"` on `.MainActivity`, and `src/index.css` applies safe-area insets for notches and gesture bars alongside responsive 5×5 board scaling.
- **Touch Board Controls:** On touch screens, tapping an empty Neutral square previews the placement and flank/neutralize outcomes first (`Confirm Place` button or second tap on the highlighted square commits the play; desktop mouse hover + single-click remains unchanged).
- **Hardware Back Button & Audio Lifecycle:**
  - `src/native/backButton.ts` handles Android Back navigation cleanly across modals, active touch previews, mid-match leave confirmations, tab navigation back to the Tavern, and app minimization from the root screen.
  - `src/native/lifecycle.ts` wires `appStateChange` and `visibilitychange` to `soundEngine.suspend()` / `soundEngine.resume()`, configures the dark `#0f0b08` status bar, and dismisses the Capacitor splash screen after first render.

## Building & Downloading the Debug APK via GitHub Actions
Every push to `main` / `master` (or manual `workflow_dispatch`) triggers `.github/workflows/android.yml` on `ubuntu-latest` (Node 22 + Java 21 Temurin):
1. Open the repository on GitHub and go to the **Actions** tab.
2. Select **Build Android Debug APK** and wait for the latest run to finish.
3. Download the **`bnd-card-game-debug-apk`** workflow artifact to obtain `app-debug.apk`.
4. Transfer `app-debug.apk` to your Android phone and allow installation from unknown sources when prompted.

## Local Development Workflow (Optional Android Studio / SDK)
If you have Android Studio / Android SDK + JDK 21 installed locally:

```bash
# Rebuild dist/ and sync assets + plugins into android/
npm run android:sync

# Open the project in Android Studio
npm run android:open
```

Or build the debug APK directly from the CLI:

```bash
npm run android:sync
cd android
./gradlew assembleDebug
```

Output APK location: `android/app/build/outputs/apk/debug/app-debug.apk`.
