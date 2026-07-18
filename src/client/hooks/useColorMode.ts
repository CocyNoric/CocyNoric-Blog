import { useEffect, useState } from 'react';

export type ColorMode = 'light' | 'dark';

function currentMode(): ColorMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function hasSavedMode() {
  try {
    const mode = localStorage.getItem('blog-color-mode');
    return mode === 'light' || mode === 'dark';
  } catch {
    return false;
  }
}

export function useColorMode() {
  const [mode, setMode] = useState<ColorMode>(currentMode);
  const [followsSystem, setFollowsSystem] = useState(() => !hasSavedMode());

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  useEffect(() => {
    if (!followsSystem) return;

    const preference = matchMedia('(prefers-color-scheme: dark)');
    const updateMode = (event: MediaQueryListEvent) => {
      setMode(event.matches ? 'dark' : 'light');
    };

    preference.addEventListener('change', updateMode);
    return () => preference.removeEventListener('change', updateMode);
  }, [followsSystem]);

  const toggle = () => {
    setFollowsSystem(false);
    setMode((value) => {
      const next = value === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('blog-color-mode', next);
      } catch {
        // Keep the selected mode for this session when storage is unavailable.
      }
      return next;
    });
  };

  return { mode, toggle };
}
