import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { CalendarIcon } from './Icons.js';

type InformationBarProps = {
  profileName: string;
  description: string;
  profileAvatar: string | null;
  recentPosts?: PostSummary[];
  galleryItems?: GalleryItem[];
  currentGalleryId?: string;
  thumbnailColumns?: number;
  thumbnailRows?: number;
  supplementalError?: string;
};

function thumbnailAspectRatio(item: GalleryItem) {
  if (item.thumbnailAspectRatio === 'original') {
    return item.width && item.height ? `${item.width} / ${item.height}` : '1 / 1';
  }
  return item.thumbnailAspectRatio.replace(':', ' / ');
}

export function InformationBar({ profileName, description, profileAvatar, recentPosts, galleryItems, currentGalleryId, thumbnailColumns = 2, thumbnailRows = 3, supplementalError }: InformationBarProps) {
  return <div className="information-bar">
    <section className="information-profile" aria-labelledby="information-profile-heading">
      <div className="information-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : <span aria-hidden="true">{profileName.slice(0, 1)}</span>}</div>
      <div><p className="eyebrow">Profile</p><h2 id="information-profile-heading">{profileName}</h2></div>
      {description && <p>{description}</p>}
    </section>
    {recentPosts && <section className="information-section" aria-labelledby="recent-posts-heading">
      <div className="information-heading"><CalendarIcon /><h2 id="recent-posts-heading">最近文章</h2></div>
      {recentPosts.length > 0
        ? <nav className="recent-posts" aria-label="最近文章">{recentPosts.map((post) => <Link key={post.id} to={`/posts/${post.slug}`}><span>{post.title}</span><time dateTime={post.date}>{post.date}</time></Link>)}</nav>
        : <p className="information-empty">暂时没有可显示的文章。</p>}
    </section>}
    {galleryItems && <section className="information-section information-gallery" aria-labelledby="gallery-thumbnails-heading">
      <div className="information-heading"><span className="information-mark" aria-hidden="true" /><h2 id="gallery-thumbnails-heading">画廊浏览</h2></div>
      {galleryItems.length > 0
        ? <nav className="gallery-thumbnails" aria-label="其他图片" style={{ '--thumbnail-columns': thumbnailColumns, '--thumbnail-rows': thumbnailRows } as CSSProperties}>{galleryItems.slice(0, thumbnailColumns * thumbnailRows).map((item) => <Link key={item.id} to={`/gallery/${item.id}`} aria-label={`查看图片：${item.title}`} aria-current={item.id === currentGalleryId ? 'page' : undefined} style={{ aspectRatio: thumbnailAspectRatio(item) }}><img src={item.url} alt="" loading="lazy" style={{ objectPosition: `${item.thumbnailFocus.x * 100}% ${item.thumbnailFocus.y * 100}%`, transform: `scale(${1 / item.thumbnailFocus.size})`, transformOrigin: `${item.thumbnailFocus.x * 100}% ${item.thumbnailFocus.y * 100}%` } as CSSProperties} /></Link>)}</nav>
        : <p className="information-empty">暂时没有可显示的图片。</p>}
    </section>}
    {supplementalError && <p className="information-error" role="status">{supplementalError}</p>}
  </div>;
}
