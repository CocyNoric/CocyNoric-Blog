import { Link } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { categoryDisplayName } from '../../shared/categories.js';
import { GalleryCropImage, galleryCropAspectRatio } from './GalleryCropImage.js';
import { ArrowIcon, CalendarIcon } from './Icons.js';

function cardAspectRatio(item: GalleryItem) {
  return galleryCropAspectRatio(item.cardAspectRatio, item.width, item.height);
}

export function PostCard({ post }: { post: PostSummary }) {
  return <article className="card post-card">
    <div className="post-meta"><CalendarIcon /><time dateTime={post.date}>{post.date}</time><span aria-hidden="true">·</span><Link className="post-category-link" to={`/articles?category=${encodeURIComponent(post.category)}`}>{categoryDisplayName(post.category)}</Link></div>
    <h3><Link to={`/posts/${post.slug}`}>{post.title}</Link></h3>
    <p>{post.excerpt}</p>
    <div className="post-card-footer">
      <Link className="read-link" to={`/posts/${post.slug}`} aria-label={`阅读《${post.title}》`}>阅读<ArrowIcon /></Link>
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
      <Link className="gallery-category-link" to={`/gallery?category=${encodeURIComponent(item.category)}`}>{categoryDisplayName(item.category)}</Link>
    </div>
  </article>;
}
