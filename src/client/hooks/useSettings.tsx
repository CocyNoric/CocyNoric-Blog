import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicSettings } from '../../shared/types.js';
import { api } from '../api.js';

const fallbackSettings: PublicSettings = {
  version: 5,
  siteName: 'CocyNoric‘s Blog',
  homeTitle: 'CocyNoric‘s Blog',
  footerText: 'CocyNoric‘s Blog',
  description: '记录技术、作品与生活。',
  profileName: 'CocyNoric',
  profileAvatar: null,
  webIcon: null,
  homeHero: {
    minHeight: 680,
    titleAlign: 'left',
    contentOffset: 0,
  },
  backgroundImage: null,
  backgroundPosition: 'center',
  backgroundOverlay: 0.86,
  backgroundBlur: 0,
  seedColor: '#415f91',
  contentWidth: 'standard',
  cardDensity: 'comfortable',
  bodyFontSize: 16,
  browsing: {
    article: {
      railSide: 'left',
      railWidth: 340,
      showRecentPosts: true,
      recentPostsLimit: 4,
      showRecentGallery: false,
      recentGalleryLimit: 6,
      contentWidth: 820,
    },
    gallery: {
      railSide: 'right',
      railWidth: 340,
      showRecentPosts: true,
      recentPostsLimit: 4,
      showRecentGallery: true,
      recentGalleryLimit: 6,
      mediaWidth: 705,
      portraitMaxHeight: 880,
      thumbnailColumns: 2,
      thumbnailRows: 3,
    },
  },
  themes: { light: {}, dark: {} },
};

type SettingsContextValue = {
  settings: PublicSettings;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function serializeTokens(tokens: Record<string, string>) {
  return Object.entries(tokens).map(([name, value]) => `${name}:${value}`).join(';');
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(fallbackSettings);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const next = await api.settings();
    setSettings(next);
    document.title = next.siteName;
  };

  useEffect(() => {
    void refresh().catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const style = document.getElementById('site-theme') ?? document.head.appendChild(document.createElement('style'));
    style.id = 'site-theme';
    style.textContent = `:root{${serializeTokens(settings.themes.light)}}[data-theme="dark"]{${serializeTokens(settings.themes.dark)}}`;
  }, [settings.themes]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--content-width', settings.contentWidth === 'narrow' ? '820px' : settings.contentWidth === 'wide' ? '1280px' : '1080px');
    root.style.setProperty('--body-font-size', `${settings.bodyFontSize}px`);
    root.style.setProperty('--card-padding', settings.cardDensity === 'compact' ? '18px' : '24px');
  }, [settings.contentWidth, settings.bodyFontSize, settings.cardDensity]);

  useEffect(() => {
    const current = document.querySelector<HTMLLinkElement>('link[data-site-favicon]');
    if (!settings.webIcon) {
      current?.remove();
      return;
    }
    const favicon = current ?? document.head.appendChild(document.createElement('link'));
    favicon.dataset.siteFavicon = '';
    favicon.rel = 'icon';
    favicon.href = settings.webIcon;
  }, [settings.webIcon]);

  const value = useMemo(() => ({ settings, loading, refresh }), [settings, loading]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings 必须在 SettingsProvider 内使用');
  return context;
}
