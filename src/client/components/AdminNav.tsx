import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EditIcon, FolderIcon, ImageIcon, SettingsIcon } from './Icons.js';

export function AdminNav() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return <div className="admin-nav">
    <nav aria-label="后台导航">
      <NavLink to="/admin/posts"><EditIcon />文章</NavLink>
      <NavLink to="/admin/gallery"><ImageIcon />画廊</NavLink>
      <NavLink to="/admin/repository"><FolderIcon />仓库</NavLink>
      <NavLink to="/admin/settings"><SettingsIcon />站点设置</NavLink>
    </nav>
    <button className="text-button" onClick={() => void logout().then(() => navigate('/'))}>退出登录</button>
  </div>;
}
