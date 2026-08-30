import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { SiteFooter } from './components/SiteFooter.js';
import { SiteHeader } from './components/SiteHeader.js';
import { AuthProvider, useAuth } from './hooks/useAuth.js';
import { useSettings } from './hooks/useSettings.js';

const HomePage = lazy(() => import('./pages/HomePage.js').then((module) => ({ default: module.HomePage })));
const ArticlesPage = lazy(() => import('./pages/ArticlesPage.js').then((module) => ({ default: module.ArticlesPage })));
const PostPage = lazy(() => import('./pages/PostPage.js').then((module) => ({ default: module.PostPage })));
const PublicGalleryPage = lazy(() => import('./pages/PublicGalleryPage.js').then((module) => ({ default: module.PublicGalleryPage })));
const RepositoryPage = lazy(() => import('./pages/RepositoryPage.js').then((module) => ({ default: module.RepositoryPage })));
const GalleryDetailPage = lazy(() => import('./pages/GalleryDetailPage.js').then((module) => ({ default: module.GalleryDetailPage })));
const LoginPage = lazy(() => import('./pages/admin/LoginPage.js').then((module) => ({ default: module.LoginPage })));
const PostsPage = lazy(() => import('./pages/admin/PostsPage.js').then((module) => ({ default: module.PostsPage })));
const EditorPage = lazy(() => import('./pages/admin/EditorPage.js').then((module) => ({ default: module.EditorPage })));
const GalleryPage = lazy(() => import('./pages/admin/GalleryPage.js').then((module) => ({ default: module.GalleryPage })));
const AdvancedGalleryUploadPage = lazy(() => import('./pages/admin/AdvancedGalleryUploadPage.js').then((module) => ({ default: module.AdvancedGalleryUploadPage })));
const AdminRepositoryPage = lazy(() => import('./pages/admin/RepositoryPage.js').then((module) => ({ default: module.AdminRepositoryPage })));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage.js').then((module) => ({ default: module.SettingsPage })));

function RouteBoundary() {
  return <Suspense fallback={<main id="main" className="page-shell"><p className="loading-state">正在载入页面…</p></main>}><Outlet /></Suspense>;
}

function AdminAuthLayout() {
  return <AuthProvider><Outlet /></AuthProvider>;
}

function ProtectedRoute() {
  const { loading, authenticated } = useAuth();
  if (loading) return <main id="main" className="page-shell"><p className="loading-state">正在检查登录状态…</p></main>;
  return authenticated ? <Outlet /> : <Navigate to="/admin/login" replace />;
}

function PublicFeatureRoute({ feature }: { feature: 'articles' | 'gallery' | 'repository' }) {
  const { settings, loading } = useSettings();
  if (loading) return <main id="main" className="page-shell"><p className="loading-state">正在载入站点…</p></main>;
  return settings.contentVisibility[feature] ? <Outlet /> : <Navigate to="/" replace />;
}

function PublicArticlesRoute() {
  const { settings, loading } = useSettings();
  const location = useLocation();
  const hasSearchQuery = Boolean(new URLSearchParams(location.search).get('q')?.trim());
  if (loading) return <main id="main" className="page-shell"><p className="loading-state">正在载入站点…</p></main>;
  return settings.contentVisibility.articles || hasSearchQuery ? <ArticlesPage /> : <Navigate to="/" replace />;
}

function PublicLayout() {
  const { settings } = useSettings();
  const location = useLocation();
  const workbench = location.pathname.startsWith('/admin');
  const reading = location.pathname.startsWith('/posts/') || location.pathname.startsWith('/gallery/');
  const listing = location.pathname === '/articles' || location.pathname === '/gallery' || location.pathname === '/repository';
  const configuredBackgroundOpacity = 1 - settings.backgroundOverlay;
  const backgroundBlur = Math.max(settings.backgroundBlur, workbench ? 2 : 0);
  const backgroundOpacity = workbench
    ? Math.min(configuredBackgroundOpacity, 0.18)
    : reading
      ? Math.min(configuredBackgroundOpacity, 0.34)
      : listing
        ? Math.min(configuredBackgroundOpacity, 0.42)
        : configuredBackgroundOpacity;
  const context = workbench ? 'workbench' : reading ? 'reading' : listing ? 'listing' : 'activity';

  return <div className={`site-layout ${workbench ? 'site-layout-workbench' : 'site-layout-public'} site-layout-context-${context}`}>
    {settings.backgroundImage && <div className="site-background" style={{
      backgroundImage: `url(${settings.backgroundImage})`,
      backgroundPosition: settings.backgroundPosition,
      filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
      opacity: backgroundOpacity,
    }} />}
    <a className="skip-link" href="#main">跳到主要内容</a><SiteHeader /><Outlet /><SiteFooter />
  </div>;
}

export function App() {
  return <Routes>
    <Route element={<PublicLayout />}>
      <Route element={<RouteBoundary />}>
        <Route index element={<HomePage />} />
        <Route path="articles" element={<PublicArticlesRoute />} />
        <Route element={<PublicFeatureRoute feature="articles" />}>
          <Route path="posts/:slug" element={<PostPage />} />
        </Route>
        <Route element={<PublicFeatureRoute feature="gallery" />}>
          <Route path="gallery" element={<PublicGalleryPage />} />
          <Route path="gallery/:id" element={<GalleryDetailPage />} />
        </Route>
        <Route element={<PublicFeatureRoute feature="repository" />}>
          <Route path="repository" element={<RepositoryPage />} />
          <Route path="repository/:directory/*" element={<RepositoryPage />} />
        </Route>
        <Route element={<AdminAuthLayout />}>
          <Route path="admin/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="admin/posts" element={<PostsPage />} />
            <Route path="admin/posts/new" element={<EditorPage />} />
            <Route path="admin/posts/:id" element={<EditorPage />} />
            <Route path="admin/gallery" element={<GalleryPage />} />
            <Route path="admin/gallery/upload" element={<AdvancedGalleryUploadPage />} />
            <Route path="admin/repository" element={<AdminRepositoryPage />} />
            <Route path="admin/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Route>
  </Routes>;
}
