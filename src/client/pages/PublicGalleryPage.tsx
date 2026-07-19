import { useEffect, useState } from 'react';
import type { GalleryItem } from '../../shared/schemas.js';
import { api } from '../api.js';
import { GallerySection } from '../components/GallerySection.js';
import { useSettings } from '../hooks/useSettings.js';

export function PublicGalleryPage() {
  const { settings } = useSettings();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `画廊 · ${settings.siteName}`;
  }, [settings.siteName]);

  useEffect(() => {
    window.scrollTo(0, 0);
    void api.gallery()
      .then(setItems)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  return <main id="main" className="page-shell listing-shell">
    <GallerySection items={items} loading={loading} error={error} headingLevel="h1" description={settings.galleryDescription} />
  </main>;
}
