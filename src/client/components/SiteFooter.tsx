import { Link } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings.js';

export function SiteFooter() {
  const { settings } = useSettings();
  return <footer className="site-footer"><div className="footer-inner"><span>© {new Date().getFullYear()} {settings.footerText}</span><Link to="/admin/login">管理入口</Link></div></footer>;
}
