import { useEffect, useState } from 'react';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { api } from '../api.js';
import { ArticleSection } from '../components/ArticleSection.js';
import { GallerySection } from '../components/GallerySection.js';
import { useSettings } from '../hooks/useSettings.js';

export function HomePage() {
  const { settings } = useSettings();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = settings.siteName;
  }, [settings.siteName]);

  useEffect(() => {
    void Promise.all([api.posts(), api.gallery()])
      .then(([nextPosts, items]) => { setPosts(nextPosts); setGallery(items); })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  return <div className="public-page">
    <main id="main" className="page-shell home-shell">
      <section className="intro" aria-labelledby="intro-title">
        <p className="eyebrow">Blog</p>
        <h1 id="intro-title">{settings.homeTitle}</h1>
        <p>{settings.description}</p>
      </section>

      <ArticleSection posts={posts} loading={loading} error={error} limit={4} moreLink="/articles" />
      <GallerySection items={gallery} loading={loading} error={error} limit={6} moreLink="/gallery" />
    </main>
  </div>;
}
