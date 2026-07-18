import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import { api } from '../api.js';
import { ArrowIcon } from '../components/Icons.js';
import { useSettings } from '../hooks/useSettings.js';

export function GalleryDetailPage() {
  const { id = '' } = useParams();
  const { settings } = useSettings();
  const [item, setItem] = useState<GalleryItem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    void api.galleryItem(id)
      .then((value) => {
        setItem(value);
        document.title = `${value.title} · ${settings.siteName}`;
      })
      .catch((cause: Error) => setError(cause.message));
  }, [id, settings.siteName]);

  if (error) return <main id="main" className="page-shell listing-shell"><div className="empty-state"><h1>图片未找到</h1><p>{error}</p><Link className="button primary-button" to="/gallery">返回画廊</Link></div></main>;
  if (!item) return <main id="main" className="page-shell listing-shell"><p className="loading-state">正在载入图片…</p></main>;

  return <main id="main" className="page-shell gallery-detail-shell">
    <Link className="back-link" to="/gallery"><ArrowIcon />返回画廊</Link>
    <article className="gallery-detail">
      <div className="gallery-detail-media"><img src={item.url} alt={item.title} /></div>
      <div className="gallery-detail-copy">
        <p className="eyebrow">Gallery</p>
        <h1>{item.title}</h1>
        {item.description && <p>{item.description}</p>}
      </div>
    </article>
  </main>;
}
