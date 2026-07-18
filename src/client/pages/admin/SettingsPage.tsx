import { useEffect, useState, type FormEvent } from 'react';
import type { SiteSettings } from '../../../shared/schemas.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { ImageIcon } from '../../components/Icons.js';
import { ImageDropField } from '../../components/ImageDropField.js';
import { SelectField } from '../../components/SelectField.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useSettings } from '../../hooks/useSettings.js';

export function SettingsPage() {
  const { csrfToken } = useAuth();
  const { refresh } = useSettings();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { void api.adminSettings().then(setSettings).catch((cause: Error) => setError(cause.message)); }, []);

  if (!settings) return <main id="main" className="page-shell admin-shell"><AdminNav /><p className="loading-state">正在载入站点设置…</p>{error && <div className="message error-message">{error}</div>}</main>;

  const update = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => setSettings((current) => current ? { ...current, [key]: value } : current);
  const backgroundVisibility = Math.round((1 - settings.backgroundOverlay) * 100);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { setSettings(await api.saveSettings(settings, csrfToken)); await refresh(); setMessage('设置已保存，所有访客都将看到更新。'); }
    catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  };
  const upload = async (kind: 'avatar' | 'background', file?: File) => {
    if (!file) return; setError(''); setMessage('');
    try { setSettings(await api.uploadSettingMedia(kind, file, csrfToken)); await refresh(); setMessage(kind === 'avatar' ? '头像已更新。' : '背景已更新。'); }
    catch (cause) { setError((cause as Error).message); }
  };

  return <main id="main" className="page-shell admin-shell settings-shell">
    <AdminNav />
    <form onSubmit={save}>
      <div className="admin-heading"><div><p className="eyebrow">全站配置</p><h1>站点设置</h1><p>这里的修改保存在服务器上，对所有访客生效。</p></div><button className="button primary-button" disabled={saving}>{saving ? '正在保存…' : '保存设置'}</button></div>
      {error && <div className="message error-message" role="alert">{error}</div>}
      {message && <div className="message success-message" role="status">{message}</div>}
      <div className="settings-grid">
        <section className="settings-section"><h2>站点资料</h2>
          <label className="form-field"><span>站点名称</span><input value={settings.siteName} maxLength={80} onChange={(event) => update('siteName', event.target.value)} required /><small>显示在顶栏和浏览器标题</small></label>
          <label className="form-field"><span>首页 Title</span><input value={settings.homeTitle} maxLength={120} onChange={(event) => update('homeTitle', event.target.value)} required /><small>显示在首页背景上方的大标题</small></label>
          <label className="form-field"><span>页脚版权名称</span><input value={settings.footerText} maxLength={120} onChange={(event) => update('footerText', event.target.value)} required /><small>页脚会自动添加 © 和当前年份</small></label>
          <label className="form-field"><span>简介</span><textarea rows={3} maxLength={240} value={settings.description} onChange={(event) => update('description', event.target.value)} /></label>
          <ImageDropField className="upload-control" onFile={(file) => void upload('avatar', file)} onError={setError}><span className="media-preview avatar-preview">{settings.avatar ? <img src={settings.avatar} alt="当前头像" /> : <ImageIcon />}</span><span><strong>上传或拖入头像</strong><small>PNG、JPEG 或 WebP，最大 20 MB；超过 5 MB 自动压缩为 WebP</small></span></ImageDropField>
          {settings.avatar && <button type="button" className="button secondary-button" onClick={() => update('avatar', null)}>移除头像</button>}
        </section>
        <section className="settings-section"><h2>主题与排版</h2>
          <label className="form-field color-field"><span>Material 3 主色</span><span className="color-input"><input type="color" value={settings.seedColor} onChange={(event) => update('seedColor', event.target.value)} /><code>{settings.seedColor}</code></span><small>保存设置后应用到全站的浅色与暗色调色板</small></label>
          <SelectField label="内容宽度" value={settings.contentWidth} options={[{ value: 'narrow', label: '窄 · 专注阅读' }, { value: 'standard', label: '标准' }, { value: 'wide', label: '宽 · 更多卡片' }]} onChange={(value) => update('contentWidth', value)} />
          <SelectField label="卡片密度" value={settings.cardDensity} options={[{ value: 'compact', label: '紧凑' }, { value: 'comfortable', label: '舒适' }]} onChange={(value) => update('cardDensity', value)} />
          <label className="form-field"><span>正文字号：{settings.bodyFontSize}px</span><input type="range" min="14" max="22" value={settings.bodyFontSize} onChange={(event) => update('bodyFontSize', Number(event.target.value))} /></label>
        </section>
        <section className="settings-section span-2"><h2>页面背景</h2>
          <ImageDropField className="upload-control background-upload" onFile={(file) => void upload('background', file)} onError={setError}><span className="media-preview background-preview">{settings.backgroundImage ? <img src={settings.backgroundImage} alt="当前背景" /> : <ImageIcon />}</span><span><strong>上传或拖入背景图片</strong><small>背景会固定在页面底层，内容区域保留 Material surface</small></span></ImageDropField>
          {settings.backgroundImage && <button type="button" className="button secondary-button" onClick={() => update('backgroundImage', null)}>移除背景</button>}
          <div className="background-controls">
            <SelectField label="背景位置" value={settings.backgroundPosition} options={[{ value: 'top', label: '顶部' }, { value: 'center', label: '居中' }, { value: 'bottom', label: '底部' }]} onChange={(value) => update('backgroundPosition', value)} />
            <label className="form-field"><span>背景可见度：{backgroundVisibility}%</span><input type="range" min="0" max="100" value={backgroundVisibility} onChange={(event) => update('backgroundOverlay', Number((1 - Number(event.target.value) / 100).toFixed(2)))} /><small>数值越高，背景越明显；较高数值可能降低正文可读性</small></label>
            <label className="form-field"><span>背景模糊：{settings.backgroundBlur}px</span><input type="range" min="0" max="16" value={settings.backgroundBlur} onChange={(event) => update('backgroundBlur', Number(event.target.value))} /></label>
          </div>
        </section>
      </div>
    </form>
  </main>;
}
