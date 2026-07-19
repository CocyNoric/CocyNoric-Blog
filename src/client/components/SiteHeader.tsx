import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useColorMode } from '../hooks/useColorMode.js';
import { useSettings } from '../hooks/useSettings.js';
import { MoonIcon, SearchIcon, SunIcon } from './Icons.js';

export function SiteHeader() {
  const { settings } = useSettings();
  const { mode, toggle } = useColorMode();
  const location = useLocation();
  const navigate = useNavigate();
  const activeQuery = location.pathname === '/articles'
    ? new URLSearchParams(location.search).get('q') ?? ''
    : '';
  const [query, setQuery] = useState(activeQuery);

  useEffect(() => setQuery(activeQuery), [activeQuery]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(location.pathname === '/articles' ? location.search : '');
    if (query.trim()) params.set('q', query.trim()); else params.delete('q');
    navigate({ pathname: '/articles', search: params.toString() });
  };

  return <header className="site-header">
    <div className="header-inner">
      <div className="header-leading">
        <Link className="brand" to="/">
          {settings.webIcon && <span className="brand-avatar" aria-hidden="true"><img src={settings.webIcon} alt="" /></span>}
          <span>{settings.siteName}</span>
        </Link>
        <nav className="main-nav" aria-label="主导航">
          <Link to="/articles">文章</Link>
          <Link to="/gallery">画廊</Link>
        </nav>
      </div>
      <div className="header-actions">
        <form className="header-search" role="search" onSubmit={search}>
          <SearchIcon />
          <label className="visually-hidden" htmlFor="site-search">搜索文章和画廊</label>
          <input id="site-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" />
        </form>
        <button className="icon-button" type="button" onClick={toggle} aria-label={mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'} title={mode === 'dark' ? '亮色模式' : '暗色模式'}>
          {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  </header>;
}
