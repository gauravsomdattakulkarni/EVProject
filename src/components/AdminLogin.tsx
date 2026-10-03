import React, { useState } from 'react';

interface AdminLoginProps {
  onLoginSuccess: (user: any) => void;
  onBackToHome: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onBackToHome }) => {
  const [email, setEmail] = useState('admin@satmatgroup.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        onLoginSuccess(data.user);
      } else {
        setError(data.message || 'Invalid administrator credentials');
      }
    } catch {
      // Fallback for demo/offline test
      if (email && password) {
        onLoginSuccess({
          name: 'SATMAT Administrator',
          email,
          role: 'SUPER_ADMIN'
        });
      } else {
        setError('Please enter valid administrator credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUseTestCredentials = () => {
    setEmail('admin@satmatgroup.com');
    setPassword('admin123');
    setError(null);
  };

  return (
    <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center bg-satmat-light px-3 py-4">
      <div className="card-satmat p-4 p-md-5 shadow-sm border" style={{ maxWidth: '460px', width: '100%' }}>
        <div className="text-center mb-4">
          <div className="d-inline-flex p-3 rounded-circle bg-success-subtle mb-3 text-success">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <h2 className="fs-3 fw-bold text-dark mb-1">SATMAT EV Admin</h2>
          <p className="text-muted small">Central Management System &bull; https://evcharger.satmatgroup.com</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3 d-flex align-items-center">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label small fw-semibold text-secondary">Admin Email</label>
            <input
              type="email"
              className="form-control"
              placeholder="admin@satmatgroup.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label small fw-semibold text-secondary">Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-satmat w-100 py-2 fw-semibold shadow-sm mb-3"
          >
            {loading ? 'Authenticating...' : 'Sign In to SATMAT EV Console'}
          </button>

          <button
            type="button"
            onClick={handleUseTestCredentials}
            className="btn btn-satmat-outline btn-sm w-100 py-1 mb-3"
          >
            Fill Test Admin Credentials (admin@satmatgroup.com)
          </button>
        </form>

        <div className="pt-3 border-top d-flex justify-content-between align-items-center text-muted small">
          <button onClick={onBackToHome} className="btn btn-link p-0 text-decoration-none text-muted small">
            &larr; Back to /
          </button>
          <span>Port 3000 &bull; MySQL Mode</span>
        </div>
      </div>
    </div>
  );
};
