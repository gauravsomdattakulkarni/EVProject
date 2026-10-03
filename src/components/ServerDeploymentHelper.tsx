import React, { useState } from 'react';

export const ServerDeploymentHelper: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pm2Command =
    'npx pm2 delete all && npx pm2 start ecosystem.config.cjs && npx pm2 save && npx pm2 status';

  const migrateCommand = 'php artisan migrate';

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="container-fluid px-3 px-lg-4 py-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="h3 fw-bold text-dark mb-1">Production Deployment & PM2 / Database Guide</h1>
        <p className="text-secondary small mb-0">
          Environment configuration, PM2 service commands, MySQL credentials, composer setup, and Laravel 11 migrations for{' '}
          <code className="text-success fw-bold">https://evcharger.satmatgroup.com/</code>
        </p>
      </div>

      <div className="row g-4 mb-4">
        {/* PM2 Command Card (Requirement 14) */}
        <div className="col-12 col-xl-6">
          <div className="card-satmat p-4 border h-100">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="d-flex align-items-center gap-2">
                <span className="p-2 bg-success text-white rounded-2">⚡</span>
                <h2 className="h6 fw-bold text-dark mb-0">PM2 Production Start Command (Req 14)</h2>
              </div>
              <button
                onClick={() => handleCopy(pm2Command, 'pm2')}
                className="btn btn-satmat btn-sm px-3 shadow-sm"
              >
                {copiedKey === 'pm2' ? '✓ Copied!' : 'Copy Command'}
              </button>
            </div>

            <p className="text-muted small mb-3">
              Run this one-liner command on your server (inside <code>public_html</code>) to restart and daemonize SATMAT EV with PM2:
            </p>

            <div className="bg-dark text-success p-3 rounded-3 font-monospace small mb-3 text-break">
              {pm2Command}
            </div>

            <div className="p-3 bg-light rounded-3 border">
              <span className="small fw-bold text-secondary d-block mb-1">
                Ecosystem Config (<code>ecosystem.config.cjs</code>):
              </span>
              <pre className="text-dark small mb-0 font-monospace overflow-auto" style={{ maxHeight: '140px' }}>
{`module.exports = {
  apps: [
    {
      name: "satmat-ev",
      script: "server.ts",
      interpreter: "tsx",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        APP_URL: "https://evcharger.satmatgroup.com"
      }
    }
  ]
};`}
              </pre>
            </div>
          </div>
        </div>

        {/* MySQL Credentials & Environment (Requirement 16) */}
        <div className="col-12 col-xl-6">
          <div className="card-satmat p-4 border h-100">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="d-flex align-items-center gap-2">
                <span className="p-2 bg-primary text-white rounded-2">🗄️</span>
                <h2 className="h6 fw-bold text-dark mb-0">MySQL Database Credentials (Req 16)</h2>
              </div>
              <button
                onClick={() =>
                  handleCopy(
                    'DB_CONNECTION=mysql\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_DATABASE=evchargersatmatg_ev\nDB_USERNAME=evchargersatmatg_ev\nDB_PASSWORD="{Kbip;e3NlL]Rpgm"',
                    'env'
                  )
                }
                className="btn btn-outline-secondary btn-sm"
              >
                {copiedKey === 'env' ? '✓ Copied' : 'Copy .env snippet'}
              </button>
            </div>

            <p className="text-muted small mb-3">
              Production database credentials configured in <code>.env</code> and <code>config/database.php</code>:
            </p>

            <div className="table-responsive mb-3">
              <table className="table table-bordered table-sm small mb-0">
                <tbody>
                  <tr>
                    <td className="fw-semibold text-secondary" style={{ width: '35%' }}>Database Name:</td>
                    <td className="font-monospace text-dark">evchargersatmatg_ev</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold text-secondary">Username:</td>
                    <td className="font-monospace text-dark">evchargersatmatg_ev</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold text-secondary">Password:</td>
                    <td className="font-monospace text-success fw-bold">&#123;Kbip;e3NlL]Rpgm</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold text-secondary">Host / Port:</td>
                    <td className="font-monospace text-dark">127.0.0.1 : 3306</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold text-secondary">Domain:</td>
                    <td className="font-monospace text-primary">https://evcharger.satmatgroup.com/</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-satmat-light p-2.5 rounded-2 border border-success-subtle text-secondary small">
              ✅ Database dump generated at <code>/laravel/schema.sql</code>. Import using:
              <code className="d-block mt-1 text-dark fw-bold">
                mysql -u evchargersatmatg_ev -p evchargersatmatg_ev &lt; laravel/schema.sql
              </code>
            </div>
          </div>
        </div>

        {/* Composer & Laravel Migrations (with default admin auto-seed) */}
        <div className="col-12">
          <div className="card-satmat p-4 border">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div>
                <h2 className="h6 fw-bold text-dark mb-0">Composer & Laravel 11 Migrations (Req 19)</h2>
                <span className="text-muted small">
                  Fixed for Laravel 11: <code>bootstrap/cache</code> and <code>cache</code> tables preconfigured to prevent missing cache errors
                </span>
              </div>
              <div className="d-flex gap-2">
                <button
                  onClick={() => handleCopy('composer install', 'comp')}
                  className="btn btn-sm btn-outline-secondary"
                >
                  {copiedKey === 'comp' ? '✓ Copied' : 'Copy "composer install"'}
                </button>
                <button
                  onClick={() => handleCopy(migrateCommand, 'mig')}
                  className="btn btn-sm btn-satmat"
                >
                  {copiedKey === 'mig' ? '✓ Copied' : 'Copy "php artisan migrate"'}
                </button>
              </div>
            </div>

            {/* Admin Credentials from DB info */}
            <div className="alert alert-success d-flex align-items-center justify-content-between p-3 rounded-3 mb-4">
              <div>
                <strong className="d-block mb-1">🔑 Default Admin Account in DB:</strong>
                <span className="small">
                  Email: <code className="fw-bold">admin@satmatgroup.com</code> &bull; Password: <code className="fw-bold">admin123</code> (or <code className="fw-bold">&#123;Kbip;e3NlL]Rpgm</code>) &bull; Role: <code className="fw-bold">SUPER_ADMIN</code>
                </span>
              </div>
              <span className="badge bg-success px-3 py-1.5">Auto-Created on Migrate</span>
            </div>

            <div className="row g-3">
              <div className="col-12 col-md-3">
                <div className="p-3 bg-light rounded-3 border h-100">
                  <div className="badge bg-secondary mb-1">000000</div>
                  <strong className="d-block text-dark small mb-1">create_cache_table</strong>
                  <span className="text-muted text-xs d-block">
                    Creates <code>cache</code>, <code>cache_locks</code>, and <code>sessions</code> tables so <code>php artisan optimize:clear</code> never fails.
                  </span>
                </div>
              </div>

              <div className="col-12 col-md-3">
                <div className="p-3 bg-light rounded-3 border h-100">
                  <div className="badge bg-secondary mb-1">000001</div>
                  <strong className="d-block text-dark small mb-1">create_users_table</strong>
                  <span className="text-muted text-xs d-block">
                    Creates users table and auto-inserts default admin credentials into the MySQL database.
                  </span>
                </div>
              </div>

              <div className="col-12 col-md-3">
                <div className="p-3 bg-light rounded-3 border h-100">
                  <div className="badge bg-secondary mb-1">000002</div>
                  <strong className="d-block text-dark small mb-1">create_chargers_table</strong>
                  <span className="text-muted text-xs d-block">
                    Stores machine IDs, names, dynamic WebSocket URLs, coordinates, and base tariffs.
                  </span>
                </div>
              </div>

              <div className="col-12 col-md-3">
                <div className="p-3 bg-light rounded-3 border h-100">
                  <div className="badge bg-secondary mb-1">000003</div>
                  <strong className="d-block text-dark small mb-1">create_connectors_partners_tariffs</strong>
                  <span className="text-muted text-xs d-block">
                    Multi-connector relational models, OCPI 2.0/2.2 roaming partner tokens, and tariffs.
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-dark text-white rounded-3 small font-monospace">
              <span className="text-secondary d-block mb-1"># Complete Server Setup & Migration Run:</span>
              <div className="text-muted"># 1. Ensure cache & storage folders exist with writable permissions</div>
              <div className="text-success">$ chmod -R 775 bootstrap/cache storage</div>
              <div className="text-muted mt-2"># 2. Install dependencies & build client bundle</div>
              <div className="text-success">$ composer install</div>
              <div className="text-success">$ npm run build</div>
              <div className="text-muted mt-2"># 3. Run migrations (Creates cache, users, chargers, connectors, OCPI tables & auto-seeds admin)</div>
              <div className="text-success">$ php artisan migrate</div>
              <div className="text-muted mt-2"># 4. Clear/cache optimizations safely</div>
              <div className="text-success">$ php artisan optimize:clear</div>
              <div className="text-muted mt-2"># 5. Start live PM2 daemon on port 3000 (Apache .htaccess & index.php proxy directly to it)</div>
              <div className="text-success">$ npx pm2 delete all && npx pm2 start ecosystem.config.cjs && npx pm2 save && npx pm2 status</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
