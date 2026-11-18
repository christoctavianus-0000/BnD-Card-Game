import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export type BackHandler = () => boolean;

interface BackEntry {
  id: number;
  priority: number;
  handler: () => boolean;
}

const backStack: BackEntry[] = [];
let nextEntryId = 1;
let nativeListenerBound = false;

/** Bind a single global Capacitor hardware back-button listener on native platforms. */
export function ensureBackButtonListener(): void {
  if (nativeListenerBound || !Capacitor.isNativePlatform()) {
    return;
  }
  nativeListenerBound = true;

  void App.addListener('backButton', () => {
    const ordered = [...backStack].sort((a, b) =>
      b.priority !== a.priority ? b.priority - a.priority : b.id - a.id
    );
    for (const entry of ordered) {
      if (entry.handler()) {
        return;
      }
    }
    void App.minimizeApp().catch(() => {});
  }).catch(() => {
    nativeListenerBound = false;
  });
}

/**
 * Register a hardware back-button handler ordered by priority (highest runs first).
 * Return true from the handler to consume the event; false passes to lower handlers.
 */
export function useBackHandler(handler: BackHandler, priority = 0): void {
  const handlerRef = useRef<BackHandler>(handler);
  handlerRef.current = handler;

  useEffect(() => {
    ensureBackButtonListener();
    const id = nextEntryId++;
    const entry: BackEntry = {
      id,
      priority,
      handler: () => handlerRef.current(),
    };
    backStack.push(entry);

    return () => {
      const idx = backStack.findIndex((item) => item.id === id);
      if (idx !== -1) {
        backStack.splice(idx, 1);
      }
    };
  }, [priority]);
}
