import { Link } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import { categoryDisplayName } from '../../shared/categories.js';
import type { PostSummary } from '../../shared/types.js';
import { ArrowIcon, CalendarIcon, DownloadIcon } from './Icons.js';
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
          <span className="showcase-kicker">{categoryDisplayName(post.category)}</span>
          <h3>{post.title}</h3>
          <span className="showcase-open-cue">阅读文章<ArrowIcon /></span>
        </Link>
        <div className="showcase-item-info article-showcase-info">
          <div>
            <span className="showcase-info-label">Abstract</span>
            <p>{post.excerpt || '打开文章阅读全文。'}</p>
          </div>
          <div className="showcase-meta-column">
            <span className="post-meta"><CalendarIcon /><time dateTime={post.date}>{post.date}</time></span>
          </div>
        </div>
      </article>)}
    </section>
  </ListingRailStage>;
}

function groupGalleryItems(items: GalleryItem[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function GalleryShowcase({ items, cardImageLimit, rail, railOpen }: { items: GalleryItem[]; cardImageLimit: number } & ShowcaseRailProps) {
  const groups = groupGalleryItems(items, cardImageLimit);
  return <ListingRailStage rail={rail} railOpen={railOpen} railLabel="画廊浏览信息" variant="feed">
    <div className="gallery-showcase-groups">
      {groups.map((group, groupIndex) => <section className="gallery-showcase-feed" aria-label={`画廊帖子第 ${groupIndex + 1} 组`} key={group[0]!.id}>
        {group.map((item, itemIndex) => <article className="gallery-feed-post" key={item.id}>
          <Link className="gallery-feed-media" to={`/gallery/${item.id}`} aria-label={`查看画廊展示：${item.title}`}>
            <img src={item.url} alt={item.title} loading={groupIndex === 0 && itemIndex === 0 ? 'eager' : 'lazy'} />
            {item.images.length > 1 && <span className="gallery-image-count">{item.images.length} 张</span>}
          </Link>
          <div className="gallery-feed-footer">
            <div><h3><Link to={`/gallery/${item.id}`}>{item.title}</Link></h3></div>
            {item.images.length === 1 && <a className="icon-button gallery-feed-download" href={`/media/gallery/${item.id}/${encodeURIComponent(item.originalFilename)}`} download={item.originalFilename} title={`下载 ${item.title}`} aria-label={`下载图片：${item.title}`}><DownloadIcon /></a>}
          </div>
        </article>)}
      </section>)}
    </div>
  </ListingRailStage>;
}
