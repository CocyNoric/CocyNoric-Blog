import { useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import { categoryIncludes, summarizeCategoryPaths } from '../../shared/categories.js';
import { matchesGalleryTitle } from '../../shared/search.js';
import type { PostSummary } from '../../shared/types.js';
import { ArrowIcon } from './Icons.js';
import { ArticleShowcase } from './ContentShowcase.js';
import { ListingInfoRail } from './ListingInfoRail.js';
import { ListingRailToggle } from './ListingRailToggle.js';
import { GalleryCard, PostCard } from './PostCard.js';

type ArticleSectionProps = {
  posts: PostSummary[];
  galleryItems?: GalleryItem[];
  galleryLoading?: boolean;
  galleryError?: string;
  loading: boolean;
  error?: string;
  headingLevel?: 'h1' | 'h2';
  limit?: number;
  moreLink?: string;
  surfaceOpacity?: number;
  railOpen?: boolean;
  onRailOpenChange?: (open: boolean) => void;
  showResultStatus?: boolean;
  showArticles?: boolean;
  showGallery?: boolean;
  plain?: boolean;
};

export function ArticleSection({ posts, galleryItems = [], galleryLoading = false, galleryError = '', loading, error = '', headingLevel = 'h2', limit, moreLink, surfaceOpacity, railOpen = false, onRailOpenChange, showResultStatus = true, showArticles = true, showGallery = false, plain = false }: ArticleSectionProps) {
  const Heading = headingLevel;
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const isSearching = Boolean(query.trim());
  const activeCategory = searchParams.get('category') ?? '';
  const allCategories = useMemo(() => showArticles ? summarizeCategoryPaths(posts.map((post) => post.category)) : [], [posts, showArticles]);
  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return showArticles ? posts.filter((post) => {
      const matchesCategory = categoryIncludes(post.category, activeCategory);
      const text = `${post.title} ${post.excerpt} ${post.category}`.toLocaleLowerCase('zh-CN');
      return matchesCategory && (!needle || text.includes(needle));
    }) : [];
  }, [posts, query, activeCategory, showArticles]);

  const filteredGallery = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return needle ? galleryItems.filter((item) => matchesGalleryTitle(item.title, query)) : [];
  }, [galleryItems, query]);

  const updateCategory = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('category', value); else next.delete('category');
    next.delete('tag');
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => setSearchParams({}, { replace: true });

  const articleRail = <ListingInfoRail
    kind="article"
    total={posts.length}
    visible={filteredPosts.length}
    context={[activeCategory && `分类：${activeCategory.replaceAll('/', ' / ')}`, query && `搜索：${query}`].filter(Boolean).join(' · ') || '全部文章'}
    categories={allCategories}
    activeCategory={activeCategory}
    onCategoryChange={updateCategory}
  />;
  const articleGrid = <div className="post-grid">{(limit === undefined ? filteredPosts : filteredPosts.slice(0, limit)).map((post) => <PostCard post={post} key={post.id} />)}</div>;

  return <section id="articles" className={`content-section article-section${plain ? ' article-section-plain' : ''}${surfaceOpacity === undefined ? '' : ' home-surface'}`} aria-labelledby="articles-heading" style={surfaceOpacity === undefined ? undefined : { '--surface-opacity': surfaceOpacity } as React.CSSProperties}>
    <div className="section-heading"><div><p className="eyebrow">{showArticles ? 'Articles' : 'Search'}</p><Heading id="articles-heading">{showArticles ? '文章' : '搜索结果'}</Heading></div>
      {showArticles && onRailOpenChange && <div className="listing-view-controls"><ListingRailToggle open={railOpen} onChange={onRailOpenChange} /></div>}
    </div>
    {showResultStatus && <p className="result-status" aria-live="polite">{loading ? '正在载入文章' : query ? `共 ${filteredPosts.length} 篇文章、${galleryLoading ? '…' : filteredGallery.length} 个画廊展示` : `共 ${filteredPosts.length} 篇文章`}</p>}
    {error && <div className="message error-message" role="alert">{error}</div>}
    {!loading && !error && showArticles && filteredPosts.length === 0 && <div className="empty-state">
      <h2>没有找到相关内容</h2><p>换一个关键词，或者清除当前筛选。</p><button className="button secondary-button" onClick={clearFilters}>清除筛选</button>
    </div>}
    {showArticles && limit === undefined && filteredPosts.length > 0
      ? <ArticleShowcase
        posts={filteredPosts}
        railOpen={railOpen}
        rail={articleRail}
      />
      : showArticles ? articleGrid : null}
    {isSearching && showGallery && <div className="search-gallery-results">
      <div className="section-heading"><div><p className="eyebrow">Gallery</p><h2>画廊</h2></div></div>
      {galleryLoading
        ? <p className="loading-state" aria-live="polite">正在搜索画廊</p>
        : galleryError
          ? <div className="message error-message" role="alert">画廊搜索暂时无法载入：{galleryError}</div>
          : filteredGallery.length > 0
            ? <div className="gallery-grid">{filteredGallery.map((item) => <GalleryCard item={item} key={item.id} />)}</div>
            : <div className="empty-state"><h3>没有找到相关画廊</h3><p>没有画廊展示匹配“{query.trim()}”。</p></div>}
    </div>}
    {moreLink && <div className="section-more"><Link className="button secondary-button" to={moreLink}>查看更多文章<ArrowIcon /></Link></div>}
  </section>;
}
