import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicPost } from '../../shared/types.js';
import { api } from '../api.js';
import { ArrowIcon, CalendarIcon } from '../components/Icons.js';
import { useSettings } from '../hooks/useSettings.js';

export function PostPage() {
  const { slug = '' } = useParams();
  const { settings } = useSettings();
  const [post, setPost] = useState<PublicPost | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    void api.post(slug).then((value) => {
      setPost(value);
      document.title = `${value.title} · ${settings.siteName}`;
    }).catch((cause: Error) => setError(cause.message));
  }, [slug, settings.siteName]);

  if (error) return <main id="main" className="page-shell"><div className="empty-state"><h1>文章未找到</h1><p>{error}</p><Link className="button primary-button" to="/articles">返回文章列表</Link></div></main>;
  if (!post) return <main id="main" className="page-shell"><p className="loading-state">正在载入文章…</p></main>;

  return <main id="main" className="page-shell reading-shell">
    <Link className="back-link" to="/articles"><ArrowIcon />返回文章列表</Link>
    <article className="article-surface">
      <header className="article-header">
        <div className="post-meta"><CalendarIcon /><time dateTime={post.date}>{post.date}</time></div>
        <h1>{post.title}</h1>
        {post.excerpt && <p>{post.excerpt}</p>}
        <div className="tag-list">{post.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      </header>
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  </main>;
}
