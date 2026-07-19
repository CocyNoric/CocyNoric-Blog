import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import { ArrowIcon } from './Icons.js';
import { GalleryCard } from './PostCard.js';

type GallerySectionProps = {
  items: GalleryItem[];
  loading: boolean;
  error?: string;
  headingLevel?: 'h1' | 'h2';
  limit?: number;
  moreLink?: string;
  description?: string;
  surfaceOpacity?: number;
};

export function GallerySection({ items, loading, error = '', headingLevel = 'h2', limit, moreLink, description = '项目、作品与视觉记录。', surfaceOpacity }: GallerySectionProps) {
  const Heading = headingLevel;
  return <section id="gallery" className={`content-section gallery-section${surfaceOpacity === undefined ? '' : ' home-surface'}`} aria-labelledby="gallery-heading" style={surfaceOpacity === undefined ? undefined : { '--surface-opacity': surfaceOpacity } as CSSProperties}>
    <div className="section-heading">
      <div><p className="eyebrow">Gallery</p><Heading id="gallery-heading">画廊</Heading></div>
      <p className="section-description">{description}</p>
    </div>
    {error && <div className="message error-message" role="alert">{error}</div>}
    {loading
      ? <p className="loading-state">正在载入画廊…</p>
      : !error && (items.length > 0
        ? <div className="gallery-grid">{(limit === undefined ? items : items.slice(0, limit)).map((item) => <GalleryCard item={item} key={item.id} />)}</div>
        : <div className="gallery-empty">画廊还没有图片。</div>)}
    {moreLink && <div className="section-more"><Link className="button secondary-button" to={moreLink}>View more<ArrowIcon /></Link></div>}
  </section>;
}
