import { useEffect, useState } from 'react';

export const MQ_NARROW = '(max-width: 768px)';
export const MQ_SHORT_LANDSCAPE = '(orientation: landscape) and (max-height: 540px)';

export interface ViewportMode {
  isMobile: boolean;
  isMobilePortrait: boolean;
  isMobileLandscape: boolean;
}

export function getViewportMode(): ViewportMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return {
      isMobile: false,
      isMobilePortrait: false,
      isMobileLandscape: false,
    };
  }

  const narrowMatches = window.matchMedia(MQ_NARROW).matches;
  const shortLandscapeMatches = window.matchMedia(MQ_SHORT_LANDSCAPE).matches;

  return {
    isMobile: narrowMatches || shortLandscapeMatches,
    isMobilePortrait: narrowMatches && !shortLandscapeMatches,
    isMobileLandscape: shortLandscapeMatches,
  };
}

/**
 * Subscribe to responsive mobile portrait and short-landscape breakpoints
 * without breaking Node/SSR environments.
 */
export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(getViewportMode);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const narrowMql = window.matchMedia(MQ_NARROW);
    const landscapeMql = window.matchMedia(MQ_SHORT_LANDSCAPE);

    const update = () => {
      const next = getViewportMode();
      setMode((prev) =>
        prev.isMobile === next.isMobile &&
        prev.isMobilePortrait === next.isMobilePortrait &&
        prev.isMobileLandscape === next.isMobileLandscape
          ? prev
          : next
      );
    };

    update();

    const addSub = (mql: MediaQueryList) => {
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', update);
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(update);
      }
    };

    const removeSub = (mql: MediaQueryList) => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', update);
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(update);
      }
    };

    addSub(narrowMql);
    addSub(landscapeMql);
    window.addEventListener('resize', update);

    return () => {
      removeSub(narrowMql);
      removeSub(landscapeMql);
      window.removeEventListener('resize', update);
    };
  }, []);

  return mode;
}
