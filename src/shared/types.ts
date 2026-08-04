import type { CodeToolItem, CodeToolProject, GalleryItem, PostMeta, SiteSettings } from './schemas.js';

export type RepositoryAreaKey = 'markdown' | 'gallery' | 'code-tools';

export type RepositoryArea = {
  key: RepositoryAreaKey;
  name: string;
  description: string;
  entryCount: number;
  updatedAt: string | null;
};

export type RepositoryEntry = {
  kind: 'directory' | 'file';
  name: string;
  path: string;
  icon: 'folder' | 'markdown' | 'image' | 'code' | 'file';
  description: string;
  updatedAt: string | null;
  size?: number;
  mimeType?: string | null;
  href?: string;
  download?: boolean;
  archiveHref?: string;
};

export type RepositoryListing = {
  area: RepositoryAreaKey;
  path: string;
  parentPath: string | null;
  archiveHref?: string;
  entries: RepositoryEntry[];
};

export type RepositoryOverview = {
  areas: RepositoryArea[];
};

export type PublicSettings = SiteSettings & {
  themes: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
};

export type PublicCodeTool = CodeToolItem & {
  downloadUrl: string;
};

export type PostSummary = PostMeta;

export type CodeToolAdminProject = {
  kind: 'project' | 'legacy';
  id: string;
  slug: string;
  name: string;
  description: string;
  updatedAt: string;
  fileCount: number;
  totalBytes: number;
  downloadUrl?: string;
};

export type CodeToolProjectListing = {
  project: CodeToolAdminProject;
  path: string;
  parentPath: string | null;
  entries: RepositoryEntry[];
};



export type PublicPost = PostMeta & {
  html: string;
};

export type HomePayload = {
  settings: PublicSettings;
  posts: PostSummary[];
  gallery: GalleryItem[];
};

export type PostPagePayload = {
  post: PublicPost;
  recentPosts?: PostSummary[];
  galleryItems?: GalleryItem[];
};

export type GalleryPagePayload = {
  item: GalleryItem;
  recentPosts?: PostSummary[];
  galleryItems?: GalleryItem[];
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
