import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getViewportMode,
  MQ_NARROW,
  MQ_SHORT_LANDSCAPE,
} from '../useViewportMode';

describe('getViewportMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to desktop mode in Node/SSR when window is undefined', () => {
    expect(getViewportMode()).toEqual({
      isMobile: false,
      isMobilePortrait: false,
      isMobileLandscape: false,
    });
  });

  it('detects mobile portrait on narrow screens', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query === MQ_NARROW,
      }),
    });

    expect(getViewportMode()).toEqual({
      isMobile: true,
      isMobilePortrait: true,
      isMobileLandscape: false,
    });
  });

  it('detects mobile landscape on short landscape screens even when wider than 768px', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query === MQ_SHORT_LANDSCAPE,
      }),
    });

    expect(getViewportMode()).toEqual({
      isMobile: true,
      isMobilePortrait: false,
      isMobileLandscape: true,
    });
  });

  it('prefers mobile landscape when both narrow and short landscape match', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query === MQ_NARROW || query === MQ_SHORT_LANDSCAPE,
      }),
    });

    expect(getViewportMode()).toEqual({
      isMobile: true,
      isMobilePortrait: false,
      isMobileLandscape: true,
    });
  });

  it('detects desktop mode when neither mobile breakpoint matches', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({
        matches: false,
      }),
    });

    expect(getViewportMode()).toEqual({
      isMobile: false,
      isMobilePortrait: false,
      isMobileLandscape: false,
    });
  });
});
