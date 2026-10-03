import React from 'react';

interface HomePageProps {
  onNavigateToAdmin: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigateToAdmin }) => {
  return (
    <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center bg-satmat-light px-3 text-center">
      <div className="card-satmat p-5 shadow-sm border" style={{ maxWidth: '480px', width: '100%' }}>
        <div className="d-inline-flex p-3 rounded-circle bg-success-subtle mb-3 text-success">
          <svg className="bi" width="36" height="36" fill="currentColor" viewBox="0 0 16 16">
            <path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 0 7.5 6h1A1.5 1.5 0 0 0 10 4.5v-4a.5.5 0 0 1 1 0v4A2.5 2.5 0 0 1 8.5 7h-1A2.5 2.5 0 0 1 5 4.5v-4a.5.5 0 0 1 .5-.5z"/>
            <path d="M2.5 6A1.5 1.5 0 0 0 1 7.5v6A2.5 2.5 0 0 0 3.5 16h9a2.5 2.5 0 0 0 2.5-2.5v-6A1.5 1.5 0 0 0 13.5 6h-11zm1 1h9a.5.5 0 0 1 .5.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-6a.5.5 0 0 1 .5-.5z"/>
          </svg>
        </div>

        {/* Exact Requirement 17: simple <p> tag with text satmat ev */}
        <p className="fs-2 fw-bold text-success mb-2 text-uppercase tracking-wider">satmat ev</p>
        <p className="text-secondary small mb-4">
          EV Charging Station Network &bull; https://evcharger.satmatgroup.com/
        </p>

        <div className="d-grid gap-2">
          <button
            onClick={onNavigateToAdmin}
            className="btn btn-satmat py-2 fw-semibold shadow-sm"
          >
            Access Admin Management Portal (/login_admin)
          </button>
        </div>

        <div className="mt-4 pt-3 border-top text-muted small">
          <span>Official OCPP 1.6J / 2.0 &bull; OCPI 2.0 / 2.2 Roaming Hub</span>
        </div>
      </div>
    </div>
  );
};
