import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PostSummary } from '../../../shared/types.js';
import { categoryDisplayName } from '../../../shared/categories.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { EditIcon, TrashIcon } from '../../components/Icons.js';
import { PostImportControl } from '../../components/PostImportControl.js';
import { useAuth } from '../../hooks/useAuth.js';

export function PostsPage() {
  const { csrfToken } = useAuth();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PostSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  return <main id="main" className="page-shell admin-shell">
    <AdminNav />
    <div className="admin-heading">
      <div><p className="eyebrow">内容管理</p><h1>文章</h1><p>编辑 Markdown、预览公式并控制发布状态。</p></div>
      <div className="heading-actions">
        <PostImportControl onError={setError} />
        <Link className="button primary-button" to="/admin/posts/new"><EditIcon />新建文章</Link>
      </div>
    </div>
    {error && <div className="message error-message" role="alert">{error}</div>}
    <div className="admin-list">
      {posts.map((post) => <article className="admin-list-item" key={post.id}>
        <div className="status-column"><span className={`status ${post.status}`}>{post.status === 'published' ? '已发布' : '草稿'}</span><time dateTime={post.date}>{post.date}</time></div>
        <div><h2><Link to={`/admin/posts/${post.id}`}>{post.title}</Link></h2><p>{post.excerpt || '暂无摘要'}</p><span className="category-label">{categoryDisplayName(post.category)}</span></div>
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
