import type { AdminPost, AuthState, PostSummary, PublicPost, PublicSettings } from '../shared/types.js';
import type { GalleryInput, GalleryItem, PostInput, SiteSettings } from '../shared/schemas.js';

async function readResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    try {
      return await response.json() as T;
    } catch {
      throw new Error(`服务器响应格式无效（${response.status}）`);
    }
  }

  const body = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error ?? `请求失败（${response.status}）`);
}

async function request<T>(path: string, options?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options?.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('无法连接博客服务，请确认后端服务已启动并刷新页面后重试。');
    }
    throw error;
  }
  return readResponse<T>(response);
}

function writeHeaders(csrfToken: string) {
  return { 'X-CSRF-Token': csrfToken };
}

export const api = {
  settings: () => request<PublicSettings>('/api/settings'),
  gallery: () => request<GalleryItem[]>('/api/gallery'),
  galleryItem: (id: string) => request<GalleryItem>(`/api/gallery/${encodeURIComponent(id)}`),
  posts: (query = '') => request<PostSummary[]>(`/api/posts${query}`),
  post: (slug: string) => request<PublicPost>(`/api/posts/${encodeURIComponent(slug)}`),
  authState: () => request<AuthState>('/api/auth/me'),
  login: (password: string) => request<AuthState>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),
  logout: (csrfToken: string) => request<AuthState>('/api/auth/logout', {
    method: 'POST',
    headers: writeHeaders(csrfToken),
  }),
  adminPosts: () => request<AdminPost[]>('/api/admin/posts'),
  adminPost: (id: string) => request<AdminPost>(`/api/admin/posts/${encodeURIComponent(id)}`),
  preview: (markdown: string, csrfToken: string, signal?: AbortSignal) => request<{ html: string }>('/api/admin/preview', {
    method: 'POST',
    headers: writeHeaders(csrfToken),
    body: JSON.stringify({ markdown }),
    signal,
  }),
  createPost: (post: PostInput, csrfToken: string) => request<AdminPost>('/api/admin/posts', {
    method: 'POST',
    headers: writeHeaders(csrfToken),
    body: JSON.stringify(post),
  }),
  updatePost: (id: string, post: PostInput, csrfToken: string) => request<AdminPost>(`/api/admin/posts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: writeHeaders(csrfToken),
    body: JSON.stringify(post),
  }),
  deletePost: (id: string, csrfToken: string) => request<void>(`/api/admin/posts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: writeHeaders(csrfToken),
  }),
  importPost: (file: File, csrfToken: string) => {
    const body = new FormData();
    body.append('article', file);
    return request<AdminPost>('/api/admin/posts/import', {
      method: 'POST',
      headers: writeHeaders(csrfToken),
      body,
    });
  },
  uploadGalleryItem: (input: GalleryInput, file: File, csrfToken: string) => {
    const body = new FormData();
    body.append('image', file);
    body.append('title', input.title);
    body.append('description', input.description);
    return request<GalleryItem>('/api/admin/gallery', {
      method: 'POST',
      headers: writeHeaders(csrfToken),
      body,
    });
  },
  updateGalleryItem: (id: string, input: GalleryInput, csrfToken: string) => request<GalleryItem>(`/api/admin/gallery/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: writeHeaders(csrfToken),
    body: JSON.stringify(input),
  }),
  deleteGalleryItem: (id: string, csrfToken: string) => request<void>(`/api/admin/gallery/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: writeHeaders(csrfToken),
  }),
  adminSettings: () => request<SiteSettings>('/api/admin/settings'),
  saveSettings: (settings: SiteSettings, csrfToken: string) => request<SiteSettings>('/api/admin/settings', {
    method: 'PUT',
    headers: writeHeaders(csrfToken),
    body: JSON.stringify(settings),
  }),
  uploadPostImage: (file: File, csrfToken: string) => {
    const body = new FormData();
    body.append('image', file);
    return request<{ url: string }>('/api/admin/media', {
      method: 'POST',
      headers: writeHeaders(csrfToken),
      body,
    });
  },
  uploadSettingMedia: (kind: 'avatar' | 'background', file: File, csrfToken: string) => {
    const body = new FormData();
    body.append('image', file);
    return request<SiteSettings>(`/api/admin/settings/media/${kind}`, {
      method: 'POST',
      headers: writeHeaders(csrfToken),
      body,
    });
  },
};
