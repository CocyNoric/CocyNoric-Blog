import { useEffect, useState } from 'react';
import { parseListingRailPreference, parseListingViewMode, type ListingViewMode } from '../listingView.js';

export function useListingViewMode(storageKey: string) {
  const [mode, setMode] = useState<ListingViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    try {
      return parseListingViewMode(window.localStorage.getItem(storageKey));
    } catch {
      return 'grid';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      // 浏览器禁用本地存储时，视图切换在当前页面内仍然可用。
    }
  }, [mode, storageKey]);

  return [mode, setMode] as const;
}

export function useListingRailPreference(storageKey: string) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return parseListingRailPreference(window.localStorage.getItem(storageKey));
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? 'open' : 'closed');
    } catch {
      // 浏览器禁用本地存储时，开关在当前页面内仍然可用。
    }
  }, [open, storageKey]);

  return [open, setOpen] as const;
}
