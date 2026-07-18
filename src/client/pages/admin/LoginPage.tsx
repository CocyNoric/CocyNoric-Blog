import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';

export function LoginPage() {
  const { authenticated, login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (authenticated) return <Navigate to="/admin/posts" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(password);
      navigate('/admin/posts', { replace: true });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return <main id="main" className="page-shell auth-shell">
    <form className="card auth-card" onSubmit={submit}>
      <p className="eyebrow">管理后台</p>
      <h1>登录</h1>
      <p>使用服务器上创建的管理员密码。</p>
      <label className="form-field"><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></label>
      {error && <div className="message error-message" role="alert">{error}</div>}
      <button className="button primary-button" disabled={submitting}>{submitting ? '正在登录…' : '登录'}</button>
    </form>
  </main>;
}
