import type { PostMeta, SiteSettings } from './schemas.js';

export type PublicSettings = SiteSettings & {
  themes: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
};

export type PostSummary = PostMeta;

export type PublicPost = PostMeta & {
  html: string;
};

export type AdminPost = PostMeta & {
  markdown: string;
  version: string;
};

export type AuthState = {
  authenticated: boolean;
  csrfToken?: string;
};

export type ApiError = {
  error: string;
  issues?: string[];
};
