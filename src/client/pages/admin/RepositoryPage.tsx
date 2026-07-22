import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CodeToolAdminProject, CodeToolProjectListing, RepositoryEntry } from '../../../shared/types.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { ArrowIcon, DownloadIcon, FolderIcon, ImageIcon, TrashIcon, UploadIcon } from '../../components/Icons.js';
import { useAuth } from '../../hooks/useAuth.js';

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type PendingDelete =
  | { type: 'project'; project: CodeToolAdminProject }
  | { type: 'entry'; project: CodeToolAdminProject; entry: RepositoryEntry };

export function AdminRepositoryPage() {
  const { csrfToken } = useAuth();
  const [projects, setProjects] = useState<CodeToolAdminProject[]>([]);
  const [selected, setSelected] = useState<CodeToolAdminProject | null>(null);
  const [listing, setListing] = useState<CodeToolProjectListing | null>(null);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'folder' | 'zip'>('folder');
  const [zipMode, setZipMode] = useState<'extract' | 'keep'>('extract');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadProjects = async () => {
    const next = await api.adminCodeToolProjects();
    setProjects(next);
    return next;
  };

  const openProject = async (project: CodeToolAdminProject, pathname = '') => {
    setSelected(project);
    setError('');
    if (project.kind === 'legacy') {
      setListing(null);
      return;
    }
    setLoadingFiles(true);
    try {
      setListing(await api.adminCodeToolProject(project.slug, pathname));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    void loadProjects().catch((cause: Error) => setError(cause.message));
  }, []);

  const upload = async () => {
    if (!projectName.trim()) { setError('请输入项目名称'); return; }
    if (!files.length) { setError(mode === 'folder' ? '请选择项目文件夹' : '请选择 ZIP 文件'); return; }
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const project = await api.uploadCodeToolProject({ projectName: projectName.trim(), description: description.trim(), mode, zipMode, files }, csrfToken);
      await loadProjects();
      setProjectName('');
      setDescription('');
      setFiles([]);
      setMessage(mode === 'zip' && zipMode === 'keep' ? 'ZIP 已作为附件项目上传。' : '项目已上传并公开。');
      await openProject(project);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      if (pendingDelete.type === 'project') {
        const { project } = pendingDelete;
        if (project.kind === 'legacy') await api.deleteCodeTool(project.id, csrfToken);
        else await api.deleteCodeToolProject(project.slug, csrfToken);
        setProjects((current) => current.filter((candidate) => candidate.id !== project.id));
        if (selected?.id === project.id) { setSelected(null); setListing(null); }
        setMessage('项目已从公开仓库删除。');
      } else {
        const updatedProject = await api.deleteCodeToolProjectEntry(pendingDelete.project.slug, pendingDelete.entry.path, csrfToken);
        setProjects((current) => current.map((project) => project.id === updatedProject.id ? updatedProject : project));
        setSelected(updatedProject);
        await openProject(updatedProject, listing?.path ?? '');
        setMessage(pendingDelete.entry.kind === 'directory' ? '文件夹及其中内容已删除。' : '文件已删除。');
      }
      setPendingDelete(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const chooseFiles = (selectedFiles: FileList | null) => {
    const next = [...(selectedFiles ?? [])];
    setFiles(next);
    setError('');
    setMessage('');
    if (!projectName && next.length) {
      const relative = (next[0] as File & { webkitRelativePath?: string }).webkitRelativePath;
      setProjectName(mode === 'folder' && relative ? relative.split('/')[0] : next[0].name.replace(/\.zip$/i, ''));
    }
  };

  const renderEntry = (entry: RepositoryEntry) => {
    const primaryContent = <>
      <span className="repository-entry-icon">{entry.kind === 'directory' ? <FolderIcon /> : <span className="repository-file-type" aria-hidden="true">&lt;/&gt;</span>}</span>
      <span className="repository-entry-copy"><strong>{entry.name}{entry.kind === 'directory' ? '/' : ''}</strong><span className="repository-entry-mobile-meta"><span>{new Date(entry.updatedAt ?? '').toLocaleDateString('zh-CN')}</span>{entry.size !== undefined && <span>{formatFileSize(entry.size)}</span>}</span></span>
      <span className="repository-entry-meta"><span>{new Date(entry.updatedAt ?? '').toLocaleDateString('zh-CN')}</span>{entry.size !== undefined && <span>{formatFileSize(entry.size)}</span>}</span>
      <span className="repository-entry-arrow">{entry.download ? <DownloadIcon /> : <ArrowIcon />}</span>
    </>;
    const primary = entry.kind === 'directory'
      ? <button className="repository-entry-row repository-entry-button" type="button" onClick={() => selected && void openProject(selected, entry.path)}>{primaryContent}</button>
      : <a className="repository-entry-row" href={entry.href} download>{primaryContent}</a>;
    return <div className="repository-entry-item" key={entry.path}>
      {primary}
      <button className="icon-button danger repository-entry-delete" type="button" onClick={() => selected && setPendingDelete({ type: 'entry', project: selected, entry })} aria-label={`删除${entry.kind === 'directory' ? '文件夹' : '文件'} ${entry.name}`}><TrashIcon /></button>
    </div>;
  };

  const pathParts = listing?.path.split('/').filter(Boolean) ?? [];
  const deleteTitle = pendingDelete?.type === 'project' ? '删除仓库项目？' : '删除文件或文件夹？';
  const deleteDescription = pendingDelete?.type === 'project'
    ? `“${pendingDelete.project.name}”及其中全部文件会从公开仓库永久删除。`
    : pendingDelete ? pendingDelete.entry.kind === 'directory'
      ? `“${pendingDelete.entry.name}/”及其中全部文件会被永久删除，此操作无法撤销。`
      : `“${pendingDelete.entry.name}”会被永久删除，此操作无法撤销。`
      : '';

  return <main id="main" className="page-shell admin-shell repository-admin-shell">
    <AdminNav />
    <div className="admin-heading"><div><p className="eyebrow">文件管理</p><h1>仓库</h1><p>按内容类型管理公开仓库；代码和工具以独立项目组织。</p></div></div>
    {error && <div className="message error-message" role="alert">{error}</div>}
    {message && <div className="message success-message" role="status">{message}</div>}

    <div className="repository-admin-domains">
      <section className="repository-domain-card">
        <span className="repository-domain-icon"><FolderIcon /></span>
        <div><p className="eyebrow">markdown/</p><h2>Markdown</h2><p>文章和配套资源由文章管理统一导入、编辑与发布。</p></div>
        <Link className="button secondary-button" to="/admin/posts">前往文章管理</Link>
      </section>
      <section className="repository-domain-card">
        <span className="repository-domain-icon"><ImageIcon /></span>
        <div><p className="eyebrow">gallery/</p><h2>画廊</h2><p>图片的标题、说明和裁切位置继续在完整的画廊管理器中处理。</p></div>
        <Link className="button secondary-button" to="/admin/gallery">前往画廊管理</Link>
      </section>
    </div>

    <section className="repository-tools-panel" aria-labelledby="code-tools-heading">
      <div className="section-heading"><div><p className="eyebrow">code-tools/</p><h2 id="code-tools-heading">代码和工具</h2></div><p className="section-description">上传文件夹或 ZIP 项目；所有文件只作为附件下载，不会执行。</p></div>

      <div className="repository-project-upload">
        <div className="repository-upload-fields">
          <label className="form-field"><span>项目名称</span><input value={projectName} maxLength={120} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：image-converter" /></label>
          <label className="form-field"><span>项目说明</span><input value={description} maxLength={240} onChange={(event) => setDescription(event.target.value)} placeholder="简要说明用途（可选）" /></label>
        </div>
        <div className="repository-upload-options" role="group" aria-label="上传来源">
          <button type="button" className={mode === 'folder' ? 'active' : ''} onClick={() => { setMode('folder'); setFiles([]); }}>文件夹</button>
          <button type="button" className={mode === 'zip' ? 'active' : ''} onClick={() => { setMode('zip'); setFiles([]); }}>ZIP</button>
        </div>
        {mode === 'zip' && <div className="repository-upload-options" role="group" aria-label="ZIP 处理方式">
          <button type="button" className={zipMode === 'extract' ? 'active' : ''} onClick={() => setZipMode('extract')}>解压为项目</button>
          <button type="button" className={zipMode === 'keep' ? 'active' : ''} onClick={() => setZipMode('keep')}>保留 ZIP</button>
        </div>}
        <div className="repository-file-drop">
          <span className="repository-domain-icon"><UploadIcon /></span>
          <span><strong>{files.length ? (mode === 'folder' ? `已选择 ${files.length} 个文件` : files[0].name) : (mode === 'folder' ? '选择项目文件夹' : '选择 ZIP 文件')}</strong><small>{files.length ? `${formatFileSize(files.reduce((sum, file) => sum + file.size, 0))} · ${zipMode === 'keep' && mode === 'zip' ? '压缩包将原样保留' : '保留项目目录结构'}` : mode === 'folder' ? '最多 1000 个文件，单个文件最大 20 MB' : '最大 64 MB；默认安全解压为项目'}</small></span>
          <label className="button secondary-button import-control">{mode === 'folder' ? '选择文件夹' : '选择 ZIP'}<input type="file" accept={mode === 'zip' ? '.zip,application/zip' : undefined} multiple={mode === 'folder'} {...(mode === 'folder' ? { webkitdirectory: '' } : {})} disabled={uploading} onChange={(event) => { chooseFiles(event.target.files); event.target.value = ''; }} /></label>
          <button className="button primary-button" type="button" disabled={!files.length || uploading} onClick={() => void upload()}>{uploading ? '正在上传…' : '上传项目'}</button>
        </div>
      </div>

      <div className="repository-manager">
        <aside className="repository-project-sidebar" aria-label="代码和工具项目">
          <div className="repository-manager-heading"><strong>项目</strong><span>{projects.length}</span></div>
          {projects.map((project) => <button key={project.id} type="button" className={selected?.id === project.id ? 'active' : ''} onClick={() => void openProject(project)}><FolderIcon /><span><strong>{project.name}</strong><small>{project.fileCount} 个文件 · {formatFileSize(project.totalBytes)}</small></span></button>)}
          {!projects.length && <p>还没有项目。</p>}
        </aside>

        <div className="repository-manager-content">
          {!selected && <div className="empty-state"><h3>选择一个项目</h3><p>进入项目后可浏览、下载或删除文件和文件夹。</p></div>}
          {selected && <>
            <div className="repository-manager-toolbar">
              <div><strong>{selected.name}</strong>{selected.description && <small>{selected.description}</small>}</div>
              <button className="icon-button danger" type="button" onClick={() => setPendingDelete({ type: 'project', project: selected })} aria-label={`删除${selected.name}`}><TrashIcon /></button>
            </div>
            {selected.kind === 'legacy' && <div className="empty-state"><h3>旧版单文件项目</h3><p>这个附件保持旧格式，可下载或删除。</p><a className="button primary-button" href={selected.downloadUrl}><DownloadIcon />下载文件</a></div>}
            {selected.kind === 'project' && <>
              <nav className="repository-breadcrumbs repository-manager-breadcrumbs" aria-label="项目路径">
                <button type="button" onClick={() => void openProject(selected)}>{selected.name}</button>
                {pathParts.map((part, index) => <span className="repository-breadcrumb-item" key={`${part}-${index}`}><span className="repository-breadcrumb-separator" aria-hidden="true">/</span><button type="button" onClick={() => void openProject(selected, pathParts.slice(0, index + 1).join('/'))}>{part}</button></span>)}
                <span className="repository-breadcrumb-separator" aria-hidden="true">/</span>
              </nav>
              {loadingFiles ? <p className="loading-state">正在读取项目…</p> : <div className="repository-entry-list">{listing?.entries.map(renderEntry)}{!listing?.entries.length && <div className="empty-state"><h3>目录为空</h3><p>这里没有可浏览的文件。</p></div>}</div>}
            </>}
          </>}
        </div>
      </div>
    </section>

    <ConfirmDialog open={Boolean(pendingDelete)} title={deleteTitle} description={deleteDescription} confirmLabel="删除" destructive busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />
  </main>;
}
