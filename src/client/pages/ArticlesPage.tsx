import { useEffect, useState } from 'react';
import type { PostSummary } from '../../shared/types.js';
import { api } from '../api.js';
import { ArticleSection } from '../components/ArticleSection.js';
import { useSettings } from '../hooks/useSettings.js';

export function ArticlesPage() {
  const { settings } = useSettings();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
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

  return <main id="main" className="page-shell listing-shell">
    <ArticleSection posts={posts} loading={loading} error={error} headingLevel="h1" />
  </main>;
}
