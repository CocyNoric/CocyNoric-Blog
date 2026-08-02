import { useEffect, useState, type CSSProperties } from 'react';
import type { GalleryItem } from '../../shared/schemas.js';
import type { PostSummary } from '../../shared/types.js';
import { api } from '../api.js';
import { ArticleSection } from '../components/ArticleSection.js';
import { GallerySection } from '../components/GallerySection.js';
import { useSettings } from '../hooks/useSettings.js';

export function HomePage() {
  const { settings, loading: settingsLoading } = useSettings();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = settings.siteName;
  }, [settings.siteName]);

  useEffect(() => {
    if (settingsLoading) return;
    let active = true;
    setLoading(true);
    setError('');
    const postsRequest = settings.contentVisibility.articles ? api.posts() : Promise.resolve([]);
    const galleryRequest = settings.contentVisibility.gallery ? api.gallery() : Promise.resolve([]);
    void Promise.all([postsRequest, galleryRequest])
      .then(([nextPosts, items]) => { if (active) { setPosts(nextPosts); setGallery(items); } })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [settings.contentVisibility.articles, settings.contentVisibility.gallery, settingsLoading]);

  return <div className="public-page">
    <main id="main" className="page-shell home-shell">
      <section
        className={`intro intro-align-${settings.homeHero.titleAlign}`}
        aria-labelledby="intro-title"
        style={{
          '--home-hero-height': `${settings.homeHero.minHeight}px`,
          '--home-hero-offset': `${settings.homeHero.contentOffset}px`,
        } as CSSProperties}
      >
        <div className="intro-content">
          <p className="eyebrow">Blog</p>
          <h1 id="intro-title">{settings.homeTitle}</h1>
          <p>{settings.description}</p>
        </div>
      </section>

      {!settingsLoading && settings.contentVisibility.articles && <ArticleSection posts={posts} loading={loading} error={error} limit={settings.homeContent.articleLimit} surfaceOpacity={settings.homeContent.articleSurfaceOpacity} moreLink="/articles" />}
      {!settingsLoading && settings.contentVisibility.gallery && <GallerySection items={gallery} loading={loading} error={error} limit={settings.homeContent.galleryLimit} surfaceOpacity={settings.homeContent.gallerySurfaceOpacity} moreLink="/gallery" description={settings.galleryDescription} />}
    </main>
  </div>;
}
