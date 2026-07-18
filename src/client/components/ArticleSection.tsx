import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PostSummary } from '../../shared/types.js';
import { ArrowIcon } from './Icons.js';
import { PostCard } from './PostCard.js';

type ArticleSectionProps = {
  posts: PostSummary[];
  loading: boolean;
  error?: string;
  headingLevel?: 'h1' | 'h2';
  limit?: number;
  moreLink?: string;
};

export function ArticleSection({ posts, loading, error = '', headingLevel = 'h2', limit, moreLink }: ArticleSectionProps) {
  const Heading = headingLevel;  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const activeTag = searchParams.get('tag') ?? '';
  const allTags = useMemo(() => [...new Set(posts.flatMap((post) => post.tags))].slice(0, 12), [posts]);
  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return posts.filter((post) => {
      const matchesTag = !activeTag || post.tags.includes(activeTag);
      const text = `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLocaleLowerCase('zh-CN');
      return matchesTag && (!needle || text.includes(needle));
    });
  }, [posts, query, activeTag]);

  const updateTag = (tag: string) => {
    const next = new URLSearchParams(searchParams);
    if (tag) next.set('tag', tag); else next.delete('tag');
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => setSearchParams({}, { replace: true });

  return <section id="articles" className="content-section article-section" aria-labelledby="articles-heading">
    <div className="section-heading"><div><p className="eyebrow">Articles</p><Heading id="articles-heading">文章</Heading></div></div>
    {allTags.length > 0 && <div className="chip-row" aria-label="按标签筛选">
      <button className="chip" aria-pressed={!activeTag} onClick={() => updateTag('')}>全部</button>
      {allTags.map((tag) => <button className="chip" aria-pressed={activeTag === tag} onClick={() => updateTag(activeTag === tag ? '' : tag)} key={tag}>{tag}</button>)}
    </div>}
    <p className="result-status" aria-live="polite">{loading ? '正在载入文章' : `共 ${filteredPosts.length} 篇文章`}</p>
    {error && <div className="message error-message" role="alert">{error}</div>}
    {!loading && !error && filteredPosts.length === 0 && <div className="empty-state">
      <h2>没有找到相关文章</h2><p>换一个关键词，或者清除当前筛选。</p><button className="button secondary-button" onClick={clearFilters}>清除筛选</button>
    </div>}
    <div className="post-grid">{(limit === undefined ? filteredPosts : filteredPosts.slice(0, limit)).map((post) => <PostCard post={post} key={post.id} />)}</div>
    {moreLink && <div className="section-more"><Link className="button secondary-button" to={moreLink}>Read more<ArrowIcon /></Link></div>}
  </section>;
}
