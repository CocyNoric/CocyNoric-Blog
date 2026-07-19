import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import type { SiteSettings } from '../../../shared/schemas.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { ImageIcon } from '../../components/Icons.js';
import { ImageDropField } from '../../components/ImageDropField.js';
import { SelectField } from '../../components/SelectField.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useSettings } from '../../hooks/useSettings.js';

const tabs = [
  { value: 'base', label: '基础与首页' },
  { value: 'article', label: '文章浏览' },
  { value: 'gallery', label: '画廊浏览' },
] as const;
type SettingsTab = typeof tabs[number]['value'];

function isSettingsTab(value: string | null): value is SettingsTab {
  return tabs.some((tab) => tab.value === value);
}

type RangeSettingProps = {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  help?: string;
  onChange: (value: number) => void;
};

function RangeSetting({ label, value, defaultValue, min, max, step, suffix = '', disabled, help, onChange }: RangeSettingProps) {
  return <div className="range-setting">
    <div className="range-setting-heading"><span>{label}：{value}{suffix}</span><button type="button" className="button text-button" onClick={() => onChange(defaultValue)} disabled={disabled || value === defaultValue}>恢复默认</button></div>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    {help && <small>{help}</small>}
  </div>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="switch-field"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span></label>;
}

export function SettingsPage() {
  const { csrfToken } = useAuth();
  const { refresh } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const requestedTab = searchParams.get('tab');
  const activeTab: SettingsTab = isSettingsTab(requestedTab) ? requestedTab : 'base';

  useEffect(() => {
    if (!isSettingsTab(requestedTab)) setSearchParams({ tab: 'base' }, { replace: true });
  }, [requestedTab, setSearchParams]);

  useEffect(() => { void api.adminSettings().then(setSettings).catch((cause: Error) => setError(cause.message)); }, []);

  if (!settings) return <main id="main" className="page-shell admin-shell"><AdminNav /><p className="loading-state">正在载入站点设置…</p>{error && <div className="message error-message">{error}</div>}</main>;

  const update = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => setSettings((current) => current ? { ...current, [key]: value } : current);
  const updateArticle = <K extends keyof SiteSettings['browsing']['article']>(key: K, value: SiteSettings['browsing']['article'][K]) => setSettings((current) => current ? { ...current, browsing: { ...current.browsing, article: { ...current.browsing.article, [key]: value } } } : current);
  const updateGallery = <K extends keyof SiteSettings['browsing']['gallery']>(key: K, value: SiteSettings['browsing']['gallery'][K]) => setSettings((current) => current ? { ...current, browsing: { ...current.browsing, gallery: { ...current.browsing.gallery, [key]: value } } } : current);
  const backgroundVisibility = Math.round((1 - settings.backgroundOverlay) * 100);

  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { setSettings(await api.saveSettings(settings, csrfToken)); await refresh(); setMessage('设置已保存，所有访客都将看到更新。'); }
    catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  };

  const upload = async (kind: 'profileAvatar' | 'webIcon' | 'background', file?: File) => {
    if (!file) return;
    setUploading(true); setError(''); setMessage('');
    try {
      const response = await api.uploadSettingMedia(kind, file, csrfToken);
      setSettings((current) => current ? { ...current, [kind === 'background' ? 'backgroundImage' : kind]: response[kind === 'background' ? 'backgroundImage' : kind] } : current);
      await refresh();
      setMessage({ profileAvatar: '个人头像已更新。', webIcon: '网页 Icon 已更新。', background: '背景已更新。' }[kind]);
    } catch (cause) { setError((cause as Error).message); }
    finally { setUploading(false); }
  };

  const renderBase = () => <div className="settings-grid">
    <section className="settings-section"><h2>站点资料</h2>
      <label className="form-field"><span>站点名称</span><input value={settings.siteName} maxLength={80} onChange={(event) => update('siteName', event.target.value)} required /><small>显示在顶栏和浏览器标题</small></label>
      <label className="form-field"><span>首页 Title</span><input value={settings.homeTitle} maxLength={120} onChange={(event) => update('homeTitle', event.target.value)} required /><small>显示在首页背景上方的大标题</small></label>
      <label className="form-field"><span>页脚版权名称</span><input value={settings.footerText} maxLength={120} onChange={(event) => update('footerText', event.target.value)} required /><small>页脚会自动添加 © 和当前年份</small></label>
      <label className="form-field"><span>简介</span><textarea rows={3} maxLength={240} value={settings.description} onChange={(event) => update('description', event.target.value)} /><small>显示在首页和详情页个人信息栏</small></label>
    </section>
    <section className="settings-section"><h2>个人简介</h2>
      <label className="form-field"><span>个人名称</span><input value={settings.profileName} maxLength={80} onChange={(event) => update('profileName', event.target.value)} required /><small>显示在文章和图片详情页的信息栏</small></label>
      <ImageDropField className="upload-control" disabled={uploading} onFile={(file) => void upload('profileAvatar', file)} onError={setError}><span className="media-preview avatar-preview">{settings.profileAvatar ? <img src={settings.profileAvatar} alt="当前个人头像" /> : <ImageIcon />}</span><span><strong>上传或拖入个人头像</strong><small>PNG、JPEG 或 WebP，最大 20 MB；显示在详情页信息栏</small></span></ImageDropField>
      {settings.profileAvatar && <button type="button" className="button secondary-button" onClick={() => update('profileAvatar', null)}>移除个人头像</button>}
    </section>
    <section className="settings-section"><h2>品牌图标</h2>
      <p className="settings-help">网页 Icon 代表站点品牌，与个人头像独立设置。</p>
      <ImageDropField className="upload-control" disabled={uploading} onFile={(file) => void upload('webIcon', file)} onError={setError}><span className="media-preview web-icon-preview">{settings.webIcon ? <img src={settings.webIcon} alt="当前网页 Icon" /> : <ImageIcon />}</span><span><strong>上传或拖入网页 Icon</strong><small>PNG、JPEG 或 WebP，最大 20 MB；显示在顶栏和浏览器标签页</small></span></ImageDropField>
      {settings.webIcon && <button type="button" className="button secondary-button" onClick={() => update('webIcon', null)}>移除网页 Icon</button>}
    </section>
    <section className="settings-section"><h2>首页 Hero</h2>
      <p className="settings-help">调整首页第一屏的高度和标题位置；提高高度后文章卡片会整体下移。</p>
      <RangeSetting label="首屏高度" value={settings.homeHero.minHeight} defaultValue={680} min={520} max={900} step={10} suffix="px" onChange={(value) => update('homeHero', { ...settings.homeHero, minHeight: value })} help="范围 520–900px，使用最小高度，内容较多时仍会自然撑开" />
      <SelectField label="标题对齐" value={settings.homeHero.titleAlign} options={[{ value: 'left', label: '左侧' }, { value: 'center', label: '居中' }]} onChange={(value) => update('homeHero', { ...settings.homeHero, titleAlign: value })} />
      <RangeSetting label="内容上下位置" value={settings.homeHero.contentOffset} defaultValue={0} min={-180} max={180} step={10} suffix="px" onChange={(value) => update('homeHero', { ...settings.homeHero, contentOffset: value })} help="负值向上，正值向下；移动端会自动限制调整范围" />
    </section>
    <section className="settings-section"><h2>主题与排版</h2>
      <label className="form-field color-field"><span>Material 3 主色</span><span className="color-input"><input type="color" value={settings.seedColor} onChange={(event) => update('seedColor', event.target.value)} /><code>{settings.seedColor}</code></span><small>保存设置后应用到全站的浅色与暗色调色板</small></label>
      <SelectField label="内容宽度" value={settings.contentWidth} options={[{ value: 'narrow', label: '窄 · 专注阅读' }, { value: 'standard', label: '标准' }, { value: 'wide', label: '宽 · 更多卡片' }]} onChange={(value) => update('contentWidth', value)} />
      <SelectField label="卡片密度" value={settings.cardDensity} options={[{ value: 'compact', label: '紧凑' }, { value: 'comfortable', label: '舒适' }]} onChange={(value) => update('cardDensity', value)} />
      <RangeSetting label="正文字号" value={settings.bodyFontSize} defaultValue={16} min={14} max={22} suffix="px" onChange={(value) => update('bodyFontSize', value)} />
    </section>
    <section className="settings-section span-2"><h2>页面背景</h2>
      <ImageDropField className="upload-control background-upload" disabled={uploading} onFile={(file) => void upload('background', file)} onError={setError}><span className="media-preview background-preview">{settings.backgroundImage ? <img src={settings.backgroundImage} alt="当前背景" /> : <ImageIcon />}</span><span><strong>上传或拖入背景图片</strong><small>背景会固定在页面底层，内容区域保留 Material surface</small></span></ImageDropField>
      {settings.backgroundImage && <button type="button" className="button secondary-button" onClick={() => update('backgroundImage', null)}>移除背景</button>}
      <div className="background-controls">
        <SelectField label="背景位置" value={settings.backgroundPosition} options={[{ value: 'top', label: '顶部' }, { value: 'center', label: '居中' }, { value: 'bottom', label: '底部' }]} onChange={(value) => update('backgroundPosition', value)} />
        <RangeSetting label="背景可见度" value={backgroundVisibility} defaultValue={14} min={0} max={100} suffix="%" onChange={(value) => update('backgroundOverlay', Number((1 - value / 100).toFixed(2)))} help="数值越高，背景越明显；较高数值可能降低正文可读性" />
        <RangeSetting label="背景模糊" value={settings.backgroundBlur} defaultValue={0} min={0} max={16} suffix="px" onChange={(value) => update('backgroundBlur', value)} />
      </div>
    </section>
  </div>;

  const renderBrowsing = (page: 'article' | 'gallery') => {
    if (page === 'article') return renderArticleBrowsing();
    return renderGalleryBrowsing();
  };

  const renderArticleBrowsing = () => {
    const config = settings.browsing.article;
    return <div className="settings-grid">
      <section className="settings-section"><h2>文章信息栏</h2>
        <p className="settings-help">桌面端可调整信息栏位置和宽度；900px 以下会自动改为主内容在前的信息栏布局。</p>
        <SelectField label="信息栏位置" value={config.railSide} options={[{ value: 'left', label: '左侧' }, { value: 'right', label: '右侧' }]} onChange={(value) => updateArticle('railSide', value)} />
        <RangeSetting label="桌面信息栏宽度" value={config.railWidth} defaultValue={340} min={280} max={440} step={10} suffix="px" onChange={(value) => updateArticle('railWidth', value)} help="范围 280–440px" />
      </section>
      <section className="settings-section"><h2>信息栏内容</h2>
        <ToggleField label="显示最近文章" checked={config.showRecentPosts} onChange={(value) => updateArticle('showRecentPosts', value)} />
        <RangeSetting label="最近文章数量" value={config.recentPostsLimit} defaultValue={4} min={1} max={12} disabled={!config.showRecentPosts} onChange={(value) => updateArticle('recentPostsLimit', value)} />
        <ToggleField label="显示最近画廊" checked={config.showRecentGallery} onChange={(value) => updateArticle('showRecentGallery', value)} />
        <RangeSetting label="最近画廊数量" value={config.recentGalleryLimit} defaultValue={6} min={1} max={20} disabled={!config.showRecentGallery} onChange={(value) => updateArticle('recentGalleryLimit', value)} />
      </section>
      <section className="settings-section span-2"><h2>正文宽度</h2>
        <RangeSetting label="文章正文最大宽度" value={config.contentWidth} defaultValue={820} min={600} max={1100} step={10} suffix="px" onChange={(value) => updateArticle('contentWidth', value)} help="范围 600–1100px；正文过长时仍会自然换行" />
      </section>
    </div>;
  };

  const renderGalleryBrowsing = () => {
    const config = settings.browsing.gallery;
    return <div className="settings-grid">
      <section className="settings-section"><h2>画廊信息栏</h2>
        <p className="settings-help">桌面端可调整信息栏位置和宽度；900px 以下会自动改为主内容在前的信息栏布局。</p>
        <SelectField label="信息栏位置" value={config.railSide} options={[{ value: 'left', label: '左侧' }, { value: 'right', label: '右侧' }]} onChange={(value) => updateGallery('railSide', value)} />
        <RangeSetting label="桌面信息栏宽度" value={config.railWidth} defaultValue={340} min={280} max={440} step={10} suffix="px" onChange={(value) => updateGallery('railWidth', value)} help="范围 280–440px" />
      </section>
      <section className="settings-section"><h2>信息栏内容</h2>
        <ToggleField label="显示最近文章" checked={config.showRecentPosts} onChange={(value) => updateGallery('showRecentPosts', value)} />
        <RangeSetting label="最近文章数量" value={config.recentPostsLimit} defaultValue={4} min={1} max={12} disabled={!config.showRecentPosts} onChange={(value) => updateGallery('recentPostsLimit', value)} />
        <ToggleField label="显示最近画廊" checked={config.showRecentGallery} onChange={(value) => updateGallery('showRecentGallery', value)} />
        <RangeSetting label="最近画廊数量" value={config.recentGalleryLimit} defaultValue={6} min={1} max={20} disabled={!config.showRecentGallery} onChange={(value) => updateGallery('recentGalleryLimit', value)} />
      </section>
      <section className="settings-section span-2"><h2>主图宽度</h2>
        <RangeSetting label="主图宽度" value={config.mediaWidth} defaultValue={705} min={560} max={1100} step={5} suffix="px" onChange={(value) => updateGallery('mediaWidth', value)} help="默认 705px，范围 560–1100px；高度按图片比例自适应，横图不强制裁切" />
        <RangeSetting label="竖图最大高度" value={config.portraitMaxHeight} defaultValue={880} min={560} max={1200} step={10} suffix="px" onChange={(value) => updateGallery('portraitMaxHeight', value)} help="默认 880px；只限制竖图，图片保持原比例显示" />
        <div className="thumbnail-layout-settings"><p className="settings-help">信息栏画廊缩略图</p><RangeSetting label="缩略图列数" value={config.thumbnailColumns} defaultValue={2} min={1} max={5} onChange={(value) => updateGallery('thumbnailColumns', value)} /><RangeSetting label="缩略图行数" value={config.thumbnailRows} defaultValue={3} min={1} max={4} onChange={(value) => updateGallery('thumbnailRows', value)} /><small>最多显示列数 × 行数张图片，并受最近画廊数量限制。</small></div>
      </section>
    </div>;
  };

  return <main id="main" className="page-shell admin-shell settings-shell">
    <AdminNav />
    <form onSubmit={save}>
      <div className="admin-heading"><div><p className="eyebrow">全站配置</p><h1>站点设置</h1><p>基础资料、首页外观和详情页浏览行为分别管理。</p></div><button className="button primary-button" disabled={saving || uploading}>{saving ? '正在保存…' : '保存设置'}</button></div>
      <nav className="settings-tabs" aria-label="站点设置分类">{tabs.map((tab) => <NavLink key={tab.value} to={`/admin/settings?tab=${tab.value}`} className={({ isActive }) => isActive && activeTab === tab.value ? 'active' : undefined} aria-current={activeTab === tab.value ? 'page' : undefined}>{tab.label}</NavLink>)}</nav>
      {error && <div className="message error-message" role="alert">{error}</div>}
      {message && <div className="message success-message" role="status">{message}</div>}
      {activeTab === 'base' ? renderBase() : activeTab === 'article' ? renderArticleBrowsing() : renderGalleryBrowsing()}
    </form>
  </main>;
}
