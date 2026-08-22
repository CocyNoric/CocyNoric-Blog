import type { AdminPost, AuthState, CodeToolAdminProject, CodeToolProjectListing, GalleryPagePayload, HomePayload, PostPagePayload, PostSummary, PublicCodeTool, PublicPost, PublicSettings, RepositoryAreaKey, RepositoryListing, RepositoryOverview, TransferUsage, UploadProgress } from '../shared/types.js';
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

function uploadRequest<T>(path: string, body: FormData, csrfToken: string, onProgress?: (progress: UploadProgress) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const estimatedTotal = [...body.entries()].reduce((sum, [, value]) => sum + (value instanceof File ? value.size : new Blob([value]).size), 0);
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.upload.addEventListener('progress', (event) => {
      const total = event.lengthComputable ? event.total : estimatedTotal;
      const loaded = event.loaded;
      onProgress?.({ loaded, total: total || loaded, percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0 });
    });
    xhr.addEventListener('error', () => reject(new Error('无法连接博客服务，请确认后端服务已启动并刷新页面后重试。')));
    xhr.addEventListener('abort', () => reject(new Error('上传已中断')));
    xhr.addEventListener('load', () => {
      let value: { error?: string } & T;
      try { value = JSON.parse(xhr.responseText) as { error?: string } & T; } catch { reject(new Error(`服务器响应格式无效（${xhr.status}）`)); return; }
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.({ loaded: estimatedTotal, total: estimatedTotal, percent: 100 }); resolve(value as T); return; }
      reject(new Error(value.error ?? `请求失败（${xhr.status}）`));
    });
    xhr.send(body);
  });
}

function appendGalleryFields(body: FormData, input: GalleryInput) {
  body.append('title', input.title);
  body.append('description', input.description);
  body.append('category', input.category);
  body.append('tags', JSON.stringify(input.tags ?? []));
  body.append('cardFocusX', String(input.cardFocus?.x ?? 0.5));
  body.append('cardFocusY', String(input.cardFocus?.y ?? 0.5));
  body.append('cardFocusSize', String(input.cardFocus?.size ?? 1));
  body.append('cardAspectRatio', input.cardAspectRatio ?? 'original');
  body.append('thumbnailFocusX', String(input.thumbnailFocus?.x ?? 0.5));
  body.append('thumbnailFocusY', String(input.thumbnailFocus?.y ?? 0.5));
  body.append('thumbnailFocusSize', String(input.thumbnailFocus?.size ?? 1));
  body.append('thumbnailAspectRatio', input.thumbnailAspectRatio ?? '1:1');
  body.append('cropPositioning', input.cropPositioning ?? 'center');
}

let pendingHomeRequest: Promise<HomePayload> | null = null;

function homeRequest() {
  if (!pendingHomeRequest) {
    const pending = request<HomePayload>('/api/home');
    pendingHomeRequest = pending;
    const clear = () => { if (pendingHomeRequest === pending) pendingHomeRequest = null; };
    void pending.then(clear, clear);
  }
  return pendingHomeRequest;
}

export const api = {
  settings: () => request<PublicSettings>('/api/settings'),
  home: homeRequest,
  repositoryOverview: () => request<RepositoryOverview>('/api/repository'),
  repositoryTree: (area: RepositoryAreaKey, pathname = '') => request<RepositoryListing>(`/api/repository/tree/${area}${pathname ? `?path=${encodeURIComponent(pathname)}` : ''}`),
  gallery: (query = '') => request<GalleryItem[]>(`/api/gallery${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  galleryItem: (id: string) => request<GalleryItem>(`/api/gallery/${encodeURIComponent(id)}`),
  galleryContext: (id: string, signal?: AbortSignal) => request<GalleryPagePayload>(`/api/gallery/${encodeURIComponent(id)}/context`, { signal }),
  repositoryCodeTools: () => request<PublicCodeTool[]>('/api/repository/code-tools'),
  posts: (query = '') => request<PostSummary[]>(`/api/posts${query}`),
  post: (slug: string) => request<PublicPost>(`/api/posts/${encodeURIComponent(slug)}`),
  postContext: (slug: string, signal?: AbortSignal) => request<PostPagePayload>(`/api/posts/${encodeURIComponent(slug)}/context`, { signal }),
  authState: () => request<AuthState>('/api/auth/me'),
  login: (password: string) => request<AuthState>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),
  logout: (csrfToken: string) => request<AuthState>('/api/auth/logout', {
    method: 'POST',
    headers: writeHeaders(csrfToken),
  }),
  adminPosts: () => request<PostSummary[]>('/api/admin/posts'),
  adminCodeTools: () => request<PublicCodeTool[]>('/api/admin/repository/code-tools'),
  adminCodeToolProjects: () => request<CodeToolAdminProject[]>('/api/admin/repository/code-tools/projects'),
  adminCodeToolProject: (slug: string, pathname = '') => request<CodeToolProjectListing>(`/api/admin/repository/code-tools/projects/${encodeURIComponent(slug)}${pathname ? `?path=${encodeURIComponent(pathname)}` : ''}`),
  uploadCodeToolProject: (input: { projectName: string; description?: string; mode: 'folder' | 'zip'; zipMode: 'extract' | 'keep'; files: File[] }, csrfToken: string, onProgress?: (progress: UploadProgress) => void) => {
    const body = new FormData();
    body.append('projectName', input.projectName);
    body.append('description', input.description ?? '');
    body.append('mode', input.mode);
    body.append('zipMode', input.zipMode);
    input.files.forEach((file) => body.append('files', file, input.mode === 'folder' ? (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name : file.name));
    return uploadRequest<CodeToolAdminProject>('/api/admin/repository/code-tools/projects', body, csrfToken, onProgress);
  },
  deleteCodeToolProject: (slug: string, csrfToken: string) => request<void>(`/api/admin/repository/code-tools/projects/${encodeURIComponent(slug)}`, { method: 'DELETE', headers: writeHeaders(csrfToken) }),
  deleteCodeToolProjectEntry: (slug: string, pathname: string, csrfToken: string) => request<CodeToolAdminProject>(`/api/admin/repository/code-tools/projects/${encodeURIComponent(slug)}/entries?path=${encodeURIComponent(pathname)}`, { method: 'DELETE', headers: writeHeaders(csrfToken) }),
  uploadCodeTool: (file: File, csrfToken: string, onProgress?: (progress: UploadProgress) => void) => {
    const body = new FormData();
    body.append('file', file);
    return uploadRequest<PublicCodeTool>('/api/admin/repository/code-tools', body, csrfToken, onProgress);
  },
  deleteCodeTool: (id: string, csrfToken: string) => request<void>(`/api/admin/repository/code-tools/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: writeHeaders(csrfToken),
  }),
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
  importPost: (file: File, csrfToken: string, onProgress?: (progress: UploadProgress) => void) => {
    const body = new FormData();
    body.append('article', file);
    return uploadRequest<AdminPost>('/api/admin/posts/import', body, csrfToken, onProgress);
  },
  uploadGalleryItem: (input: GalleryInput, file: File, csrfToken: string, onProgress?: (progress: UploadProgress) => void) => {
    const body = new FormData();
    body.append('image', file);
    appendGalleryFields(body, input);
    return uploadRequest<GalleryItem>('/api/admin/gallery', body, csrfToken, onProgress);
  },
  uploadGalleryGroup: (input: GalleryInput, files: File[], coverIndex: number, csrfToken: string, onProgress?: (progress: UploadProgress) => void) => {
    const body = new FormData();
    files.forEach((file) => body.append('images', file, file.name));
    appendGalleryFields(body, input);
    body.append('coverIndex', String(coverIndex));
    return uploadRequest<GalleryItem>('/api/admin/gallery/group', body, csrfToken, onProgress);
  },
  reorderGallery: (ids: string[], csrfToken: string) => request<GalleryItem[]>('/api/admin/gallery/order', {
    method: 'PUT',
    headers: writeHeaders(csrfToken),
    body: JSON.stringify({ ids }),
  }),
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
  traffic: () => request<TransferUsage>('/api/admin/traffic'),
  saveTraffic: (monthlyLimitGb: number, csrfToken: string) => request<TransferUsage>('/api/admin/traffic', { method: 'PUT', headers: writeHeaders(csrfToken), body: JSON.stringify({ monthlyLimitGb }) }),
  resetTraffic: (csrfToken: string) => request<TransferUsage>('/api/admin/traffic/reset', { method: 'POST', headers: writeHeaders(csrfToken) }),
  saveSettings: (settings: SiteSettings, csrfToken: string) => request<SiteSettings>('/api/admin/settings', {
    method: 'PUT',
    headers: writeHeaders(csrfToken),
    body: JSON.stringify(settings),
  }),
  uploadPostImage: (postId: string, file: File, csrfToken: string, onProgress?: (progress: UploadProgress) => void) => {
    const body = new FormData();
    body.append('image', file);
    body.append('postId', postId);
    return uploadRequest<{ url: string }>('/api/admin/media', body, csrfToken, onProgress);
  },
  uploadSettingMedia: (kind: 'profileAvatar' | 'webIcon' | 'background' | 'repositoryBackground', file: File, csrfToken: string, onProgress?: (progress: UploadProgress) => void) => {
    const body = new FormData();
    body.append('image', file);
    return uploadRequest<SiteSettings>(`/api/admin/settings/media/${kind}`, body, csrfToken, onProgress);
  },
};
