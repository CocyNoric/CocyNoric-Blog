import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { SiteFooter } from './components/SiteFooter.js';
import { SiteHeader } from './components/SiteHeader.js';
import { useAuth } from './hooks/useAuth.js';
import { HomePage } from './pages/HomePage.js';
import { ArticlesPage } from './pages/ArticlesPage.js';
import { PostPage } from './pages/PostPage.js';
import { PublicGalleryPage } from './pages/PublicGalleryPage.js';
import { RepositoryPage } from './pages/RepositoryPage.js';
import { GalleryDetailPage } from './pages/GalleryDetailPage.js';
import { LoginPage } from './pages/admin/LoginPage.js';
import { PostsPage } from './pages/admin/PostsPage.js';
import { EditorPage } from './pages/admin/EditorPage.js';
import { GalleryPage } from './pages/admin/GalleryPage.js';
import { AdminRepositoryPage } from './pages/admin/RepositoryPage.js';
import { useSettings } from './hooks/useSettings.js';
import { SettingsPage } from './pages/admin/SettingsPage.js';

function ProtectedRoute() {
  const { loading, authenticated } = useAuth();
  if (loading) return <main id="main" className="page-shell"><p className="loading-state">正在检查登录状态…</p></main>;
  return authenticated ? <Outlet /> : <Navigate to="/admin/login" replace />;
}

function PublicLayout() {
  const { settings } = useSettings();
  return <div className="site-layout">
    {settings.backgroundImage && <div className="site-background" style={{
      backgroundImage: `url(${settings.backgroundImage})`,
      backgroundPosition: settings.backgroundPosition,
      filter: settings.backgroundBlur > 0 ? `blur(${settings.backgroundBlur}px)` : undefined,
      opacity: 1 - settings.backgroundOverlay,
    }} />}
    <a className="skip-link" href="#main">跳到主要内容</a><SiteHeader /><Outlet /><SiteFooter />
  </div>;
}

export function App() {
  return <Routes>
    <Route element={<PublicLayout />}>
      <Route index element={<HomePage />} />
      <Route path="articles" element={<ArticlesPage />} />
      <Route path="gallery" element={<PublicGalleryPage />} />
      <Route path="repository" element={<RepositoryPage />} />
      <Route path="repository/:directory/*" element={<RepositoryPage />} />
      <Route path="gallery/:id" element={<GalleryDetailPage />} />
      <Route path="posts/:slug" element={<PostPage />} />
      <Route path="admin/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="admin/posts" element={<PostsPage />} />
        <Route path="admin/posts/new" element={<EditorPage />} />
        <Route path="admin/posts/:id" element={<EditorPage />} />
        <Route path="admin/gallery" element={<GalleryPage />} />
        <Route path="admin/repository" element={<AdminRepositoryPage />} />
        <Route path="admin/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}
