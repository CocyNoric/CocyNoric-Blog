import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { api } from '../api.js';
import { ArticleSection } from '../components/ArticleSection.js';
import { useListingRailPreference } from '../hooks/useListingViewMode.js';
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
  const [railOpen, setRailOpen] = useListingRailPreference('blog-articles-rail');

  useEffect(() => {
    document.title = `${query.trim() ? '搜索' : '文章'} · ${settings.siteName}`;
  }, [query, settings.siteName]);

  useEffect(() => {
    let active = true;
    window.scrollTo(0, 0);
    setError('');
    if (!settings.contentVisibility.articles) {
      setPosts([]);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void api.posts()
      .then((items) => { if (active) setPosts(items); })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [settings.contentVisibility.articles]);

  useEffect(() => {
    let active = true;
    const trimmedQuery = query.trim();
    setGalleryError('');
    setGallery([]);
    if (trimmedQuery && settings.contentVisibility.gallery) {
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
  }, [query, settings.contentVisibility.gallery]);

  return <main id="main" className="page-shell listing-shell">
    <ArticleSection posts={posts} galleryItems={gallery} galleryLoading={galleryLoading} galleryError={galleryError} loading={loading} error={error} headingLevel="h1" railOpen={railOpen} onRailOpenChange={setRailOpen} showResultStatus={false} showArticles={settings.contentVisibility.articles} showGallery={settings.contentVisibility.gallery} plain />
  </main>;
}
