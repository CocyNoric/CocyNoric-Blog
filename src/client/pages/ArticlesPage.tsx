import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { api } from '../api.js';
import { ArticleSection } from '../components/ArticleSection.js';
import { useSettings } from '../hooks/useSettings.js';

export function ArticlesPage() {
  const { settings } = useSettings();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `文章 · ${settings.siteName}`;
  }, [settings.siteName]);

  useEffect(() => {
    window.scrollTo(0, 0);
    void api.posts()
      .then(setPosts)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    const trimmedQuery = query.trim();
    setGalleryError('');
    setGallery([]);
    if (trimmedQuery) {
      setGalleryLoading(true);
      void api.gallery(trimmedQuery)
        .then((items) => { if (active) setGallery(items); })
        .catch((cause: Error) => { if (active) setGalleryError(cause.message); })
        .finally(() => { if (active) setGalleryLoading(false); });
    } else {
      setGallery([]);
      setGalleryLoading(false);
    }
    return () => { active = false; };
  }, [query]);

  return <main id="main" className="page-shell listing-shell">
    <ArticleSection posts={posts} galleryItems={gallery} galleryLoading={galleryLoading} galleryError={galleryError} loading={loading} error={error} headingLevel="h1" />
  </main>;
}
