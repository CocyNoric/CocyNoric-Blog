import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PostInput } from '../../../shared/schemas.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { DateField } from '../../components/DateField.js';
import { ImageIcon } from '../../components/Icons.js';
import { SelectField } from '../../components/SelectField.js';
import { validateImageFile } from '../../components/ImageDropField.js';
import { useAuth } from '../../hooks/useAuth.js';

const emptyPost: PostInput = {
  slug: '', title: '', excerpt: '', date: new Date().toISOString().slice(0, 10), status: 'draft', category: '未分类', tags: [], markdown: '',
};

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { csrfToken } = useAuth();
  const [post, setPost] = useState<PostInput>(emptyPost);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadState, setLoadState] = useState<'new' | 'loading' | 'loaded' | 'error'>(id ? 'loading' : 'new');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (!id) {
      setPost(emptyPost);
      setDirty(false);
      setLoadError('');
      setLoadState('new');
      return () => { active = false; };
    }
    setPost(emptyPost);
    setPreview('');
    setDirty(false);
    setLoadError('');
    setLoadState('loading');
    void api.adminPost(id).then((value) => {
      if (!active) return;
      setPost(value);
      setLoadState('loaded');
    }).catch((cause: Error) => {
      if (!active) return;
      setLoadError(cause.message);
      setLoadState('error');
    });
    return () => { active = false; };
  }, [id, loadAttempt]);

  const ready = !id || loadState === 'loaded';

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api.preview(post.markdown, csrfToken, controller.signal).then((result) => setPreview(result.html)).catch((cause: Error) => {
        if (cause.name !== 'AbortError') setError(cause.message);
      });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [post.markdown, csrfToken, ready]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = <K extends keyof PostInput>(key: K, value: PostInput[K]) => { setPost((current) => ({ ...current, [key]: value })); setDirty(true); setMessage(''); };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (!id) { setError('请先保存文章，再插入图片'); return; }
    setError('');
    setMessage('');
    setUploadingImage(true);
    try {
      validateImageFile(file);
      const { url } = await api.uploadPostImage(id, file, csrfToken);
      setPost((current) => ({ ...current, markdown: `${current.markdown}${current.markdown.endsWith('\n') || !current.markdown ? '' : '\n'}![图片说明](${url})\n` }));
      setDirty(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setUploadingImage(false);
    }
  };

  const dropImage = (event: DragEvent) => {
    event.preventDefault();
    setImageDragActive(false);
    if (!event.dataTransfer.files.length) return;
    if (event.dataTransfer.files.length !== 1) { setError('每次只能插入一张图片'); return; }
    void uploadImage(event.dataTransfer.files[0]);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) {
      setError('文章仍在载入，请稍后再保存');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = id ? await api.updatePost(id, post, csrfToken) : await api.createPost(post, csrfToken);
      setDirty(false);
      setPost(saved);
      if (!id) navigate(`/admin/posts/${saved.id}`, { replace: true });
      setMessage(saved.status === 'published' ? '文章已保存并发布。' : '草稿已保存。');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return <main id="main" className="page-shell admin-shell editor-shell">
    <AdminNav />
    <form onSubmit={save}>
      <div className="admin-heading editor-heading">
        <div><p className="eyebrow">文章编辑</p><h1>{id ? '编辑文章' : '新建文章'}</h1></div>
        <div className="heading-actions"><Link className="button text-button" to="/admin/posts">返回</Link><button className="button primary-button" disabled={saving || !ready}>{saving ? '正在保存…' : loadState === 'loading' ? '正在载入…' : '保存'}</button></div>
      </div>
      {(error || loadError) && <div className="message error-message" role="alert">{error || loadError}</div>}
      {message && <div className="message success-message" role="status" aria-live="polite">{message}</div>}
      {loadState === 'loading' && <p className="loading-state">正在载入文章…</p>}
      {loadState === 'error' && <div className="empty-state"><h2>无法载入文章</h2><p>请重新载入后再编辑或保存。</p><button className="button secondary-button" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>重新载入</button></div>}
      {ready && <>
      <div className="metadata-grid">
        <label className="form-field span-2"><span>标题</span><input value={post.title} maxLength={160} onChange={(event) => update('title', event.target.value)} required /></label>
        <label className="form-field"><span>文章路径</span><input value={post.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="my-post" onChange={(event) => update('slug', event.target.value)} required /></label>
        <DateField label="日期" value={post.date} onChange={(value) => update('date', value)} required />
        <SelectField label="状态" value={post.status} options={[{ value: 'draft', label: '草稿' }, { value: 'published', label: '发布' }]} onChange={(value) => update('status', value)} />
        <label className="form-field span-2"><span>多级分类</span><input value={post.category} maxLength={131} onChange={(event) => update('category', event.target.value)} placeholder="例如：技术 / 前端 / React" /><small>使用 / 分隔层级，最多 4 级</small></label>
        <label className="form-field span-2"><span>摘要</span><textarea rows={2} maxLength={320} value={post.excerpt} onChange={(event) => update('excerpt', event.target.value)} /></label>
      </div>
      <div className="editor-grid">
        <section
          className={`editor-pane${imageDragActive ? ' drag-active' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setImageDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setImageDragActive(false); }}
          onDrop={dropImage}
        ><div className="pane-label"><span>Markdown</span><label className="editor-upload"><ImageIcon />{uploadingImage ? '正在上传…' : !id ? '保存后可插入图片' : '插入或拖入图片'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingImage || !id} onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ''; }} /></label></div><label className="visually-hidden" htmlFor="markdown-editor">Markdown 正文</label><textarea id="markdown-editor" value={post.markdown} onChange={(event) => update('markdown', event.target.value)} spellCheck="false" /></section>
        <section className="preview-pane" aria-labelledby="preview-title"><div className="pane-label" id="preview-title">实时预览</div><div className="markdown-body" dangerouslySetInnerHTML={{ __html: preview }} /></section>
      </div>
      </>}
    </form>
  </main>;
}
