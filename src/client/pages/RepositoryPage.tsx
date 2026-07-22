import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { RepositoryAreaKey, RepositoryEntry, RepositoryListing, RepositoryOverview } from '../../shared/types.js';
import { api } from '../api.js';
import { ArrowIcon, DownloadIcon, FileIcon, FolderIcon, ImageIcon } from '../components/Icons.js';
import { useSettings } from '../hooks/useSettings.js';

type Directory = RepositoryAreaKey;

const directories: Array<{ slug: Directory; name: string; description: string }> = [
  { slug: 'markdown', name: 'Markdown', description: '已发布的文章与配套内容' },
  { slug: 'gallery', name: 'Gallery', description: '按独立编号归档的图片项目' },
  { slug: 'code-tools', name: '代码和工具', description: '代码项目与工具归档' },
];

function isDirectory(value: string | undefined): value is Directory {
  return directories.some((directory) => directory.slug === value);
}

function encodeRepositoryPath(directory: Directory, pathname = '') {
  const suffix = pathname.split('/').filter(Boolean).map((part) => encodeURIComponent(part)).join('/');
  return `/repository/${directory}${suffix ? `/${suffix}` : ''}`;
}

function formatDate(value: string | null) {
  if (!value) return '暂无更新时间';
  return new Date(value).toLocaleDateString('zh-CN');
}

function formatFileSize(size: number | undefined) {
  if (size === undefined) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function EntryIcon({ entry }: { entry: RepositoryEntry }) {
  if (entry.kind === 'directory') return <FolderIcon />;
  if (entry.icon === 'image') return <ImageIcon />;
  return <FileIcon />;
}

export function RepositoryPage() {
  const { directory, '*': pathname = '' } = useParams();
  const { settings } = useSettings();
  const [overview, setOverview] = useState<RepositoryOverview | null>(null);
  const [listing, setListing] = useState<RepositoryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selected = isDirectory(directory) ? directory : undefined;
  const invalidDirectory = directory !== undefined && !selected;
  const appearance = settings.repositoryAppearance;
  const heading = selected ? directories.find((item) => item.slug === selected)! : null;
  const repositoryStyle = {
    '--repository-heading-min-height': `${appearance.headingMinHeight}px`,
    '--repository-content-offset': `${appearance.contentOffset}px`,
    '--repository-surface-opacity': appearance.surfaceOpacity,
    '--repository-background': appearance.backgroundImage ? `url(${appearance.backgroundImage})` : 'transparent',
  } as CSSProperties;
  const pathParts = pathname.split('/').filter(Boolean);
  const inProject = Boolean(selected && pathParts.length);

  useEffect(() => {
    document.title = `${heading?.name ?? settings.repositoryTitle} · ${settings.siteName}`;
  }, [heading?.name, settings.repositoryTitle, settings.siteName]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    setError('');
    const request = selected ? api.repositoryTree(selected, pathname) : api.repositoryOverview();
    void request
      .then((data) => {
        if ('areas' in data) {
          setOverview(data);
          setListing(null);
        } else {
          setListing(data);
        }
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [pathname, selected]);

  const description = selected
    ? (appearance.showDescriptions ? (heading?.description ?? '') : '')
    : settings.repositoryDescription;
  const layoutClass = appearance.directoryLayout === 'list' ? 'repository-layout-list' : '';
  const surfaceClass = appearance.surfaceOpacity < 1 ? 'repository-surface-transparent' : '';
  const areas = overview?.areas ?? directories.map((item) => ({ ...item, key: item.slug, entryCount: 0, updatedAt: null }));

  const breadcrumbs = useMemo(() => {
    if (!selected) return [];
    return [
      { label: '仓库', href: '/repository' },
      { label: heading?.name ?? selected, href: encodeRepositoryPath(selected) },
      ...pathParts.map((part, index) => ({
        label: part,
        href: encodeRepositoryPath(selected, pathParts.slice(0, index + 1).join('/')),
      })),
    ];
  }, [heading?.name, pathParts, selected]);

  const renderEntry = (entry: RepositoryEntry) => {
    const content = <>
      <span className="repository-entry-icon"><EntryIcon entry={entry} /></span>
      <span className="repository-entry-copy">
        <strong>{entry.name}{entry.kind === 'directory' ? '/' : ''}</strong>
        {appearance.showDescriptions && entry.description && <small>{entry.description}</small>}
        {appearance.showRecentUpdates && <span className="repository-entry-mobile-meta"><span>{formatDate(entry.updatedAt)}</span>{entry.size !== undefined && appearance.showFileMetadata && <span>{formatFileSize(entry.size)}</span>}</span>}
      </span>
      {appearance.showRecentUpdates || appearance.showFileMetadata ? <span className="repository-entry-meta">
        {appearance.showRecentUpdates && <span>{formatDate(entry.updatedAt)}</span>}
        {appearance.showFileMetadata && entry.size !== undefined && <span>{formatFileSize(entry.size)}</span>}
      </span> : null}
      <span className="repository-entry-arrow">{entry.download ? <DownloadIcon /> : <ArrowIcon />}</span>
    </>;
    if (entry.kind === 'directory') return <Link className="repository-entry-row" key={entry.path} to={encodeRepositoryPath(selected!, entry.path)}>{content}</Link>;
    if (entry.href) return <a className="repository-entry-row" key={entry.path} href={entry.href} download={entry.download}>{content}</a>;
    return <div className="repository-entry-row repository-entry-static" key={entry.path}>{content}</div>;
  };

  return <main id="main" className="page-shell listing-shell repository-shell" style={repositoryStyle}>
    <section className="content-section" aria-labelledby="repository-heading">
      <div className={`section-heading repository-heading repository-title-${appearance.titleAlign}`}>
        <div>
          <p className="eyebrow">Repository</p>
          <h1 id="repository-heading">{heading?.name ?? settings.repositoryTitle}</h1>
        </div>
        {description && <p className="section-description">{description}</p>}
      </div>

      {selected && <nav className="repository-breadcrumbs" aria-label="仓库路径">
        {breadcrumbs.map((crumb, index) => <span className="repository-breadcrumb-item" key={crumb.href}>
          {index > 0 && <span className="repository-breadcrumb-separator" aria-hidden="true">/</span>}
          {index === breadcrumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <Link to={crumb.href}>{crumb.label}</Link>}
        </span>)}
        <span className="repository-breadcrumb-separator" aria-hidden="true">/</span>
      </nav>}

      {invalidDirectory && <div className="empty-state"><h2>目录未找到</h2><p>仓库中没有这个公开目录。</p><Link className="button primary-button" to="/repository">返回仓库</Link></div>}
      {!invalidDirectory && loading && <p className="loading-state">正在读取仓库…</p>}
      {!invalidDirectory && error && <div className="message error-message" role="alert">{error}</div>}

      {!invalidDirectory && !loading && !error && !selected && <div className={`repository-directory-grid ${layoutClass} ${surfaceClass}`}>
        {areas.map((area) => <Link className="repository-directory" key={area.key} to={`/repository/${area.key}`}>
          <span className="repository-folder-mark" aria-hidden="true" />
          <span className="repository-directory-copy"><strong>{area.key}/</strong>{appearance.showDescriptions && <small>{area.description}</small>}</span>
          {appearance.showItemCounts && <span className="repository-count">{area.entryCount} 项</span>}<ArrowIcon />
        </Link>)}
      </div>}

      {!invalidDirectory && !loading && !error && selected && <>
        {!inProject && <div className={`repository-project-grid ${layoutClass} ${surfaceClass}`}>
          {(listing?.entries ?? []).map((entry) => <Link className="repository-project-card" key={entry.path} to={encodeRepositoryPath(selected, entry.path)}>
            <span className="repository-project-mark"><FolderIcon /></span>
            <span className="repository-directory-copy"><strong>{entry.name}/</strong>{appearance.showDescriptions && <small>{entry.description}</small>}{appearance.showRecentUpdates && <small>最近更新：{formatDate(entry.updatedAt)}</small>}</span>
            <ArrowIcon />
          </Link>)}
          {!listing?.entries.length && <div className="empty-state"><h2>{heading?.name}目录为空</h2><p>这里暂时没有可公开浏览的项目。</p></div>}
        </div>}
        {inProject && <div className={`repository-entry-list ${surfaceClass}`}>
          {listing?.entries.map(renderEntry)}
          {!listing?.entries.length && <div className="empty-state"><h2>目录为空</h2><p>这个目录中暂时没有公开文件。</p></div>}
        </div>}
      </>}
    </section>
  </main>;
}
