import { useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import { categoryDisplayName, categoryIncludes, summarizeCategoryPaths } from '../../shared/categories.js';
import type { ListingViewMode } from '../listingView.js';
import { ArrowIcon } from './Icons.js';
import { GalleryShowcase } from './ContentShowcase.js';
import { ListingInfoRail } from './ListingInfoRail.js';
import { ListingRailStage } from './ListingRailStage.js';
import { ListingRailToggle } from './ListingRailToggle.js';
import { ListingViewToggle } from './ListingViewToggle.js';
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
  gridMaxColumns?: number;
  showcaseCardImageLimit?: number;
  viewMode?: ListingViewMode;
  onViewModeChange?: (mode: ListingViewMode) => void;
  railOpen?: boolean;
  onRailOpenChange?: (open: boolean) => void;
};

export function GallerySection({ items, loading, error = '', headingLevel = 'h2', limit, moreLink, description = '项目、作品与视觉记录。', surfaceOpacity, gridMaxColumns = 3, showcaseCardImageLimit = 5, viewMode, onViewModeChange, railOpen = false, onRailOpenChange }: GallerySectionProps) {
  const Heading = headingLevel;
  const normalizedGridMaxColumns = Math.min(6, Math.max(1, Math.trunc(gridMaxColumns)));
  const normalizedShowcaseCardImageLimit = Math.min(20, Math.max(1, Math.trunc(showcaseCardImageLimit)));
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = limit === undefined ? searchParams.get('category') ?? '' : '';
  const categories = useMemo(() => summarizeCategoryPaths(items.map((item) => item.category)), [items]);
  const filteredItems = useMemo(() => items.filter((item) => categoryIncludes(item.category, activeCategory)), [items, activeCategory]);
  const updateCategory = (category: string) => {
    const next = new URLSearchParams(searchParams);
    if (category) next.set('category', category); else next.delete('category');
    setSearchParams(next, { replace: true });
  };
  const galleryRail = <ListingInfoRail kind="gallery" total={items.length} visible={filteredItems.length} context={activeCategory ? `分类：${categoryDisplayName(activeCategory)}` : '全部画廊'} categories={categories} activeCategory={activeCategory} onCategoryChange={updateCategory} />;
  const galleryGrid = <div className={`gallery-grid${normalizedGridMaxColumns === 1 ? ' gallery-grid-single-column' : ''}`} style={{ '--gallery-grid-columns': normalizedGridMaxColumns } as CSSProperties}>{(limit === undefined ? filteredItems : filteredItems.slice(0, limit)).map((item) => <GalleryCard item={item} key={item.id} />)}</div>;

  return <section id="gallery" className={`content-section gallery-section${surfaceOpacity === undefined ? '' : ' home-surface'}`} aria-labelledby="gallery-heading" style={surfaceOpacity === undefined ? undefined : { '--surface-opacity': surfaceOpacity } as CSSProperties}>
    <div className="section-heading">
      <div><p className="eyebrow">Gallery</p><Heading id="gallery-heading">画廊</Heading></div>
      <div className="section-heading-aside"><p className="section-description">{description}</p>
        {viewMode && onViewModeChange && <div className="listing-view-controls"><ListingViewToggle mode={viewMode} onChange={onViewModeChange} label="画廊视图" />
          {onRailOpenChange && <ListingRailToggle open={railOpen} onChange={onRailOpenChange} />}
        </div>}
      </div>
    </div>
    {error && <div className="message error-message" role="alert">{error}</div>}
    {loading
      ? <p className="loading-state">正在载入画廊…</p>
      : !error && (filteredItems.length > 0
        ? (viewMode === 'showcase' && limit === undefined
          ? <GalleryShowcase items={filteredItems} cardImageLimit={normalizedShowcaseCardImageLimit} railOpen={railOpen} rail={galleryRail} />
          : viewMode && limit === undefined
            ? <ListingRailStage rail={galleryRail} railOpen={railOpen} railLabel="画廊浏览信息">{galleryGrid}</ListingRailStage>
            : galleryGrid)
        : <div className="gallery-empty">{items.length > 0 ? '当前分类还没有画廊展示。' : '画廊还没有展示内容。'}</div>)}
    {moreLink && <div className="section-more"><Link className="button secondary-button" to={moreLink}>View more<ArrowIcon /></Link></div>}
  </section>;
}
