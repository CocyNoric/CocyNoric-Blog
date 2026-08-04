import { useEffect, useState } from 'react';
import 'katex/dist/katex.min.css';
import { Link, useParams } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary, PublicPost } from '../../shared/types.js';
import { categoryDisplayName } from '../../shared/categories.js';
import { api } from '../api.js';
import { ArrowIcon, CalendarIcon } from '../components/Icons.js';
import { DetailPageLayout } from '../components/DetailPageLayout.js';
import { InformationBar } from '../components/InformationBar.js';
import { useSettings } from '../hooks/useSettings.js';

export function PostPage() {
  const { slug = '' } = useParams();
  const { settings } = useSettings();
  const config = settings.browsing.article;
  const [post, setPost] = useState<PublicPost | null>(null);
  const [recentPosts, setRecentPosts] = useState<PostSummary[] | undefined>();
  const [galleryItems, setGalleryItems] = useState<GalleryItem[] | undefined>();
  const [supplementalError, setSupplementalError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    window.scrollTo(0, 0);
    setPost(null); setError(''); setSupplementalError('');
    setRecentPosts(undefined); setGalleryItems(undefined);
    void api.postContext(slug, controller.signal).then((payload) => {
      setPost(payload.post);
      setRecentPosts(payload.recentPosts);
      setGalleryItems(payload.galleryItems);
      document.title = `${payload.post.title} · ${settings.siteName}`;
    }).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [slug, settings.siteName, settings.contentVisibility.gallery, config.showRecentPosts, config.recentPostsLimit, config.showRecentGallery, config.recentGalleryLimit]);

  if (error) return <main id="main" className="page-shell"><div className="empty-state"><h1>文章未找到</h1><p>{error}</p><Link className="button primary-button" to="/articles">返回文章列表</Link></div></main>;
  if (!post) return <main id="main" className="page-shell"><p className="loading-state">正在载入文章…</p></main>;

  return <main id="main" className="page-shell detail-shell reading-shell" style={{ '--detail-shell-width': `${Math.max(1240, config.contentWidth + config.railWidth + 20)}px` } as React.CSSProperties}>
    <DetailPageLayout
      side={config.railSide}
      railWidth={config.railWidth}
      primaryWidth={config.contentWidth}
      header={<Link className="back-link" to="/articles"><ArrowIcon />返回文章列表</Link>}
      aside={<InformationBar profileName={settings.profileName} description={settings.description} profileAvatar={settings.profileAvatar} recentPosts={recentPosts} galleryItems={galleryItems} thumbnailColumns={config.thumbnailColumns} thumbnailRows={config.thumbnailRows} supplementalError={supplementalError} />}
    >
      <article className="article-surface">
        <header className="article-header">
          <div className="post-meta"><CalendarIcon /><time dateTime={post.date}>{post.date}</time><span aria-hidden="true">·</span><Link className="post-category-link" to={`/articles?category=${encodeURIComponent(post.category)}`}>{categoryDisplayName(post.category)}</Link></div>
          <h1>{post.title}</h1>
          {post.excerpt && <p>{post.excerpt}</p>}
        </header>
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </DetailPageLayout>
  </main>;
}
