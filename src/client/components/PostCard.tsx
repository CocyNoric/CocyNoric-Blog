import { Link } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { categoryDisplayName } from '../../shared/categories.js';
import { categoryAccent } from '../categoryAccent.js';
import { GalleryCropImage, galleryCropAspectRatio } from './GalleryCropImage.js';
import { ArrowIcon, CalendarIcon } from './Icons.js';

function cardAspectRatio(item: GalleryItem) {
  return galleryCropAspectRatio(item.cardAspectRatio, item.width, item.height);
}

export function PostCard({ post }: { post: PostSummary }) {
  const category = categoryDisplayName(post.category);
  const tags = post.tags.filter((tag) => tag.toLocaleLowerCase('zh-CN') !== category.toLocaleLowerCase('zh-CN'));
  return <article className="card post-card article-accent-card" data-accent={categoryAccent(post.category)}>
    <div className="post-card-visual" aria-hidden="true">
      <span className="post-visual-orbit" />
      <span className="post-visual-disc" />
    </div>
    <div className="post-card-content">
      <div className="post-chip-row">
        <Link className="post-category-link" to={`/articles?category=${encodeURIComponent(post.category)}`}>{category}</Link>
        {tags.slice(0, 2).map((tag) => <span className="post-tag" key={tag}>{tag}</span>)}
        {tags.length > 2 && <span className="post-tag post-tag-more" aria-label={`另有 ${tags.length - 2} 个标签`}>+{tags.length - 2}</span>}
      </div>
      <h3><Link to={`/posts/${post.slug}`}>{post.title}</Link></h3>
      <div className="post-card-summary"><span className="showcase-info-label">Abstract</span><p>{post.excerpt || '打开文章阅读全文。'}</p></div>
      <div className="post-card-footer">
        <div className="post-meta"><CalendarIcon /><time dateTime={post.date}>{post.date}</time></div>
        <Link className="read-link" to={`/posts/${post.slug}`} aria-label={`阅读《${post.title}》`}>阅读文章<ArrowIcon /></Link>
      </div>
    </div>
  </article>;
}

export function GalleryCard({ item }: { item: GalleryItem }) {
  return <article className="gallery-card">
    <Link className="gallery-visual" style={{ aspectRatio: String(cardAspectRatio(item)) }} to={`/gallery/${item.id}`} aria-label={`查看画廊展示：${item.title}`}>
      <GalleryCropImage src={item.url} alt={item.title} loading="lazy" focus={item.cardFocus} aspectRatio={item.cardAspectRatio} cropPositioning={item.cropPositioning} width={item.width} height={item.height} />
      {item.images.length > 1 && <span className="gallery-image-count">{item.images.length} 张</span>}
    </Link>
    <div className="gallery-copy">
      <h3>{item.title}</h3>
    </div>
  </article>;
}
