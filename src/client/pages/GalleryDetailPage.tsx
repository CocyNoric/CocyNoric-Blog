import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { categoryDisplayName } from '../../shared/categories.js';
import { api } from '../api.js';
import { ArrowIcon, DownloadIcon } from '../components/Icons.js';
import { DetailPageLayout } from '../components/DetailPageLayout.js';
import { InformationBar } from '../components/InformationBar.js';
import { useSettings } from '../hooks/useSettings.js';

export function GalleryDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const config = settings.browsing.gallery;
  const [item, setItem] = useState<GalleryItem | null>(null);
  const [recentPosts, setRecentPosts] = useState<PostSummary[] | undefined>();
  const [galleryItems, setGalleryItems] = useState<GalleryItem[] | undefined>();
  const [supplementalError, setSupplementalError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    setItem(null); setError(''); setSupplementalError('');
    setRecentPosts(undefined); setGalleryItems(undefined);
    void api.galleryItem(id).then((value) => {
      setItem(value);
      if (value.id !== id) navigate(`/gallery/${value.id}`, { replace: true });
      document.title = `${value.title} · ${settings.siteName}`;
    }).catch((cause: Error) => setError(cause.message));

    const requests: Promise<unknown>[] = [];
    if (config.showRecentPosts && settings.contentVisibility.articles) requests.push(api.posts().then((posts) => setRecentPosts(posts.slice(0, config.recentPostsLimit))).catch(() => setSupplementalError('最近文章暂时无法载入。')));
    if (config.showRecentGallery) requests.push(api.gallery().then((gallery) => {
      const selected = gallery.find((candidate) => candidate.id === id);
      const visible = gallery.slice(0, config.recentGalleryLimit);
      setGalleryItems(selected && !visible.some((candidate) => candidate.id === selected.id)
        ? [...visible.slice(0, Math.max(0, config.recentGalleryLimit - 1)), selected]
        : visible);
    }).catch(() => setSupplementalError((current) => current ? `${current} 最近画廊暂时无法载入。` : '最近画廊暂时无法载入。')));
    void Promise.all(requests);
  }, [id, navigate, settings.siteName, settings.contentVisibility.articles, config.showRecentPosts, config.recentPostsLimit, config.showRecentGallery, config.recentGalleryLimit]);

  if (error) return <main id="main" className="page-shell listing-shell"><div className="empty-state"><h1>画廊展示未找到</h1><p>{error}</p><Link className="button primary-button" to="/gallery">返回画廊</Link></div></main>;
  if (!item) return <main id="main" className="page-shell listing-shell"><p className="loading-state">正在载入画廊展示…</p></main>;

  return <main id="main" className="page-shell detail-shell gallery-detail-shell" style={{ '--detail-shell-width': `${Math.max(1240, config.mediaWidth + config.railWidth + 20)}px`, '--gallery-portrait-max-height': `${config.portraitMaxHeight}px` } as CSSProperties}>
    <DetailPageLayout
      side={config.railSide}
      railWidth={config.railWidth}
      primaryWidth={config.mediaWidth}
      header={<Link className="back-link" to="/gallery"><ArrowIcon />返回画廊</Link>}
      aside={<InformationBar profileName={settings.profileName} description={settings.description} profileAvatar={settings.profileAvatar} recentPosts={recentPosts} galleryItems={galleryItems} currentGalleryId={item.id} thumbnailColumns={config.thumbnailColumns} thumbnailRows={config.thumbnailRows} supplementalError={supplementalError} />}
    >
      <article className="gallery-detail">
        <div className="gallery-detail-media-list" aria-label={`${item.title}，共 ${item.images.length} 张图片`}>{item.images.map((image, index) => <figure className="gallery-detail-media" key={image.mediaId}>
          <img src={image.url} alt={`${item.title}（${index + 1}/${item.images.length}）`} />
          <figcaption><span>{index + 1} / {item.images.length}{image.mediaId === item.coverImageId && <strong>卡片缩略图</strong>}</span><a className="icon-button" href={`/media/gallery/${item.id}/${encodeURIComponent(image.originalFilename)}`} download={image.originalFilename} title={`下载 ${image.originalFilename}`} aria-label={`下载第 ${index + 1} 张图片`}><DownloadIcon /></a></figcaption>
        </figure>)}</div>
        <div className="gallery-detail-copy">
          <p className="eyebrow">Gallery</p>
          <Link className="gallery-category-link" to={`/gallery?category=${encodeURIComponent(item.category)}`}>{categoryDisplayName(item.category)}</Link>
          <h1>{item.title}</h1>
          {item.images.length > 1 && <p className="gallery-detail-count">这一展示包含 {item.images.length} 张图片</p>}
          {item.description && <p>{item.description}</p>}
        </div>
      </article>
    </DetailPageLayout>
  </main>;
}
