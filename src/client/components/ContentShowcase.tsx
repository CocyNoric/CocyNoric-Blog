import { Link } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { ArrowIcon, CalendarIcon } from './Icons.js';
import { ListingRailStage } from './ListingRailStage.js';

type ShowcaseRailProps = {
  rail: React.ReactNode;
  railOpen: boolean;
};

export function ArticleShowcase({ posts, rail, railOpen }: { posts: PostSummary[] } & ShowcaseRailProps) {
  return <ListingRailStage rail={rail} railOpen={railOpen} railLabel="文章浏览信息" variant="feed">
    <section className="article-showcase-feed" aria-label="文章帖子">
      {posts.map((post) => <article className="showcase-card article-showcase-card" key={post.id}>
        <Link className="article-showcase-visual" to={`/posts/${post.slug}`} aria-label={`阅读《${post.title}》`}>
          <span className="showcase-kicker">Featured article</span>
          <h3>{post.title}</h3>
          <span className="showcase-open-cue">阅读文章<ArrowIcon /></span>
        </Link>
        <div className="showcase-item-info article-showcase-info">
          <div>
            <span className="showcase-info-label">Description</span>
            <p>{post.excerpt || '打开文章阅读全文。'}</p>
          </div>
          <div className="showcase-meta-column">
            <span className="post-meta"><CalendarIcon /><time dateTime={post.date}>{post.date}</time></span>
            {post.tags.length > 0 && <div className="tag-list" aria-label="标签">{post.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>}
          </div>
        </div>
      </article>)}
    </section>
  </ListingRailStage>;
}

export function GalleryShowcase({ items, rail, railOpen }: { items: GalleryItem[] } & ShowcaseRailProps) {
  return <ListingRailStage rail={rail} railOpen={railOpen} railLabel="画廊浏览信息" variant="feed">
    <section className="gallery-showcase-feed" aria-label="画廊帖子">
      {items.map((item, index) => <article className="gallery-feed-post" key={item.id}>
        <Link className="gallery-feed-media" to={`/gallery/${item.id}`} aria-label={`查看图片：${item.title}`}>
          <img src={item.url} alt={item.title} loading={index === 0 ? 'eager' : 'lazy'} />
        </Link>
        <div className="gallery-feed-footer">
          <h3><Link to={`/gallery/${item.id}`}>{item.title}</Link></h3>
        </div>
      </article>)}
    </section>
  </ListingRailStage>;
}
