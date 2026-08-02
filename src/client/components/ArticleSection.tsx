import { useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
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
  plain?: boolean;
};

export function ArticleSection({ posts, galleryItems = [], galleryLoading = false, galleryError = '', loading, error = '', headingLevel = 'h2', limit, moreLink, surfaceOpacity, railOpen = false, onRailOpenChange, showResultStatus = true, showArticles = true, plain = false }: ArticleSectionProps) {
  const Heading = headingLevel;
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const activeTag = searchParams.get('tag') ?? '';
  const allTags = useMemo(() => showArticles ? [...new Set(posts.flatMap((post) => post.tags))].slice(0, 12) : [], [posts, showArticles]);
  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return showArticles ? posts.filter((post) => {
      const matchesTag = !activeTag || post.tags.includes(activeTag);
      const text = `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLocaleLowerCase('zh-CN');
      return matchesTag && (!needle || text.includes(needle));
    }) : [];
  }, [posts, query, activeTag, showArticles]);

  const filteredGallery = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return needle ? galleryItems.filter((item) => matchesGalleryTitle(item.title, query)) : [];
  }, [galleryItems, query]);

  const updateTag = (tag: string) => {
    const next = new URLSearchParams(searchParams);
    if (tag) next.set('tag', tag); else next.delete('tag');
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => setSearchParams({}, { replace: true });

  const articleRail = <ListingInfoRail
    kind="article"
    total={posts.length}
    visible={filteredPosts.length}
    context={activeTag ? `标签：${activeTag}` : query ? `搜索：${query}` : '全部文章'}
  />;
  const articleGrid = <div className="post-grid">{(limit === undefined ? filteredPosts : filteredPosts.slice(0, limit)).map((post) => <PostCard post={post} key={post.id} />)}</div>;

  return <section id="articles" className={`content-section article-section${plain ? ' article-section-plain' : ''}${surfaceOpacity === undefined ? '' : ' home-surface'}`} aria-labelledby="articles-heading" style={surfaceOpacity === undefined ? undefined : { '--surface-opacity': surfaceOpacity } as React.CSSProperties}>
    <div className="section-heading"><div><p className="eyebrow">{showArticles ? 'Articles' : 'Search'}</p><Heading id="articles-heading">{showArticles ? '文章' : '搜索结果'}</Heading></div>
      {showArticles && onRailOpenChange && <div className="listing-view-controls"><ListingRailToggle open={railOpen} onChange={onRailOpenChange} /></div>}
    </div>
    {allTags.length > 0 && <div className="chip-row" aria-label="按标签筛选">
      <button className="chip" aria-pressed={!activeTag} onClick={() => updateTag('')}>全部</button>
      {allTags.map((tag) => <button className="chip" aria-pressed={activeTag === tag} onClick={() => updateTag(activeTag === tag ? '' : tag)} key={tag}>{tag}</button>)}
    </div>}
    {showResultStatus && <p className="result-status" aria-live="polite">{loading ? '正在载入文章' : query ? `共 ${filteredPosts.length} 篇文章、${galleryLoading ? '…' : filteredGallery.length} 张图片` : `共 ${filteredPosts.length} 篇文章`}</p>}
    {error && <div className="message error-message" role="alert">{error}</div>}
    {galleryError && <div className="message error-message" role="alert">画廊搜索暂时无法载入：{galleryError}</div>}
    {!loading && !galleryLoading && !error && !galleryError && filteredPosts.length === 0 && filteredGallery.length === 0 && <div className="empty-state">
      <h2>没有找到相关内容</h2><p>换一个关键词，或者清除当前筛选。</p><button className="button secondary-button" onClick={clearFilters}>清除筛选</button>
    </div>}
    {showArticles && limit === undefined && filteredPosts.length > 0
      ? <ArticleShowcase
        posts={filteredPosts}
        railOpen={railOpen}
        rail={articleRail}
      />
      : showArticles ? articleGrid : null}
    {filteredGallery.length > 0 && <div className="search-gallery-results"><div className="section-heading"><div><p className="eyebrow">Gallery</p><h2>画廊</h2></div></div><div className="gallery-grid">{filteredGallery.map((item) => <GalleryCard item={item} key={item.id} />)}</div></div>}
    {moreLink && <div className="section-more"><Link className="button secondary-button" to={moreLink}>Read more<ArrowIcon /></Link></div>}
  </section>;
}
