import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AdminPost } from '../../../shared/types.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { EditIcon, ImageIcon, TrashIcon } from '../../components/Icons.js';
import { useAuth } from '../../hooks/useAuth.js';

const acceptedImports = new Set(['.md', '.markdown', '.zip']);
const importLimit = 64 * 1024 * 1024;

export function PostsPage() {
  const navigate = useNavigate();
  const { csrfToken } = useAuth();
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [error, setError] = useState('');

  const load = () => api.adminPosts().then(setPosts).catch((cause: Error) => setError(cause.message));
  useEffect(() => { void load(); }, []);

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deletePost(pendingDelete.id, csrfToken);
      setPosts((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!acceptedImports.has(extension)) { setError('仅支持 .md、.markdown 或 .zip 文件'); return; }
    const limit = extension === '.zip' ? importLimit : 1024 * 1024;
    if (file.size > limit) { setError(extension === '.zip' ? 'ZIP 文件不能超过 64 MB' : 'Markdown 文件不能超过 1 MB'); return; }
    setImporting(true); setError('');
    try {
      const post = await api.importPost(file, csrfToken);
      navigate(`/admin/posts/${post.id}`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const dragEnter = (event: DragEvent) => {
    event.preventDefault();
    if (!event.dataTransfer.types.includes('Files')) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  return <main id="main" className="page-shell admin-shell">
    <AdminNav />
    <div className="admin-heading">
      <div><p className="eyebrow">内容管理</p><h1>文章</h1><p>编辑 Markdown、预览公式并控制发布状态。</p></div>
      <div className="heading-actions">
        <label
          className={`button secondary-button import-control${dragging ? ' drag-active' : ''}`}
          onDragEnter={dragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (!dragDepth.current) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (event.dataTransfer.files.length !== 1) setError('每次只能导入一个文章文件');
            else void importFile(event.dataTransfer.files[0]);
          }}
        >
          <ImageIcon />{importing ? '正在导入…' : '导入文章'}
          <input type="file" accept=".md,.markdown,.zip" disabled={importing} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        <Link className="button primary-button" to="/admin/posts/new"><EditIcon />新建文章</Link>
      </div>
    </div>
    {error && <div className="message error-message" role="alert">{error}</div>}
    <div className="admin-list">
      {posts.map((post) => <article className="admin-list-item" key={post.id}>
        <div className="status-column"><span className={`status ${post.status}`}>{post.status === 'published' ? '已发布' : '草稿'}</span><time dateTime={post.date}>{post.date}</time></div>
        <div><h2><Link to={`/admin/posts/${post.id}`}>{post.title}</Link></h2><p>{post.excerpt || '暂无摘要'}</p><div className="tag-list">{post.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
        <div className="row-actions"><Link className="icon-button" to={`/admin/posts/${post.id}`} aria-label={`编辑《${post.title}》`}><EditIcon /></Link><button className="icon-button danger" onClick={() => setPendingDelete(post)} aria-label={`删除《${post.title}》`}><TrashIcon /></button></div>
      </article>)}
      {!posts.length && !error && <div className="empty-state"><h2>还没有文章</h2><p>新建或导入一篇 Markdown 文章开始记录。</p></div>}
    </div>
    <ConfirmDialog
      open={Boolean(pendingDelete)}
      title="删除文章？"
      description={pendingDelete ? `《${pendingDelete.title}》会被永久删除，此操作无法撤销。` : ''}
      confirmLabel="删除"
      destructive
      busy={deleting}
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => void remove()}
    />
  </main>;
}
