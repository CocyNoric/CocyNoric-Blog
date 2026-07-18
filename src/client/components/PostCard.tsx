import { Link } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { ArrowIcon, CalendarIcon } from './Icons.js';

export function PostCard({ post }: { post: PostSummary }) {
  return <article className="card post-card">
    <div className="post-meta"><CalendarIcon /><time dateTime={post.date}>{post.date}</time></div>
    <h3><Link to={`/posts/${post.slug}`}>{post.title}</Link></h3>
    <p>{post.excerpt}</p>
    <div className="post-card-footer">
      <div className="tag-list" aria-label="标签">
        {post.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
      </div>
      <Link className="read-link" to={`/posts/${post.slug}`} aria-label={`阅读《${post.title}》`}>阅读<ArrowIcon /></Link>
    </div>
  </article>;
}

export function GalleryCard({ item }: { item: GalleryItem }) {
  return <article className="gallery-card">
    <Link className="gallery-visual" to={`/gallery/${item.id}`} aria-label={`查看图片：${item.title}`}>
      <img src={item.url} alt={item.title} loading="lazy" />
    </Link>
    <div className="gallery-copy">
      <h3>{item.title}</h3>
    </div>
  </article>;
}
