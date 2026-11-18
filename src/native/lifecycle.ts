import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { soundEngine } from '../audio/soundEngine';
import { ensureBackButtonListener } from './backButton';

let shellInitialized = false;

/**
 * Initialize offline/native shell lifecycle: audio suspend/resume, Android back stack,
 * dark status bar styling, and splash screen teardown once first frame renders.
 */
export async function initNativeShell(): Promise<void> {
  if (shellInitialized) {
    return;
  }
  shellInitialized = true;

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        soundEngine.suspend();
      } else {
        soundEngine.resume();
      }
    });
  }

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  ensureBackButtonListener();

  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      soundEngine.resume();
    } else {
      soundEngine.suspend();
    }
  }).catch(() => {});

  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Ignore on platforms/versions where StatusBar styling is unavailable
  }

  try {
    await StatusBar.setBackgroundColor({ color: '#0f0b08' });
  } catch {
    // Android 15+ enforces edge-to-edge and throws/ignores setBackgroundColor
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
    });
  } else {
    void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
  }
}
