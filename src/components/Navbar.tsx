import React, { useState, useEffect } from 'react';
import { SystemStats } from '../types/index.js';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  stats: SystemStats | null;
  wsConnected: boolean;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  stats,
  wsConnected,
  onLogout
}) => {
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; database: string; host: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const checkDb = async () => {
      try {
        const res = await fetch('/api/db-status');
        if (res.ok) {
          const data = await res.json();
          setDbStatus(data);
        }
      } catch {}
    };
    checkDb();
    const interval = setInterval(checkDb, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncDb = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/db-sync', { method: 'POST' });
      const data = await res.json();
      setDbStatus((prev) => prev ? { ...prev, connected: data.connected } : null);
    } catch {}
    finally {
      setSyncing(false);
    }
  };
  return (
    <header className="sticky-top bg-white border-bottom shadow-sm">
      <div className="container-fluid px-3 px-lg-4">
        {/* Top brand & status bar */}
        <div className="d-flex flex-wrap align-items-center justify-content-between py-2 border-bottom">
          <div className="d-flex align-items-center gap-3">
            <div className="d-flex align-items-center gap-2">
              <span className="p-2 rounded-3 bg-success text-white d-flex align-items-center justify-content-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
              </span>
              <div>
                <span className="fs-5 fw-bold text-dark tracking-wide">SATMAT EV</span>
                <span className="badge bg-success-subtle text-success border border-success-subtle ms-2 d-none d-sm-inline">
                  CPO &bull; OCPI 2.2.1
                </span>
              </div>
            </div>

            <span className="text-secondary small d-none d-md-inline">
              | Domain: <code className="text-success fw-semibold">https://evcharger.satmatgroup.com/</code>
            </span>
          </div>

          <div className="d-flex align-items-center gap-2 mt-2 mt-sm-0">
            {/* Real-time WebSocket connection badge */}
            <div
              className={`badge d-flex align-items-center gap-1.5 py-1.5 px-2.5 rounded-pill ${
                wsConnected ? 'badge-connected' : 'badge-disconnected'
              }`}
            >
              <span
                className="d-inline-block rounded-circle"
                style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: wsConnected ? '#16a34a' : '#dc2626'
                }}
              />
              <span className="fw-semibold">WS {wsConnected ? 'Live' : 'Connecting'}</span>
            </div>

            {/* MySQL Database connection badge */}
            <button
              onClick={handleSyncDb}
              disabled={syncing}
              title={`MySQL Database: ${dbStatus?.database || 'evchargersatmatg_ev'} (${dbStatus?.host || '127.0.0.1'}). Click to sync.`}
              className={`badge d-flex align-items-center gap-1.5 py-1.5 px-2.5 rounded-pill border-0 text-decoration-none ${
                dbStatus?.connected ? 'bg-success text-white' : 'bg-secondary text-white'
              }`}
              style={{ cursor: 'pointer' }}
            >
              <span
                className="d-inline-block rounded-circle"
                style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: dbStatus?.connected ? '#ffffff' : '#f59e0b'
                }}
              />
              <span className="fw-semibold">
                {syncing ? 'Syncing...' : (dbStatus?.connected ? 'DB: MySQL Live' : 'DB: Pending Sync')}
              </span>
            </button>

            {stats && (
              <>
                {stats.activeCharging > 0 && (
                  <span className="badge bg-primary text-white py-1.5 px-2.5 rounded-pill d-flex align-items-center gap-1 shadow-sm">
                    <span className="spinner-grow spinner-grow-sm text-light" style={{ width: '8px', height: '8px' }} />
                    <span className="fw-bold">{stats.activeCharging} Charging</span>
                  </span>
                )}
                <span className="badge bg-light text-dark border py-1.5 px-2.5 rounded-pill d-none d-lg-inline">
                  Online: <strong className="text-success">{stats.onlineChargers}/{stats.totalChargers}</strong>
                </span>
              </>
            )}

            <button
              onClick={onLogout}
              className="btn btn-outline-danger btn-sm rounded-pill px-3 py-1 ms-2"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Strictly Live Management Only) */}
        <div className="d-flex overflow-x-auto py-1 gap-1">
          <button
            onClick={() => setActiveTab('chargers')}
            className={`btn btn-sm rounded-2 text-nowrap px-3 py-2 fw-medium ${
              activeTab === 'chargers' ? 'btn-satmat shadow-sm' : 'btn-light text-secondary'
            }`}
          >
            ⚡ Chargers & EVSEs
          </button>

          <button
            onClick={() => setActiveTab('monitor')}
            className={`btn btn-sm rounded-2 text-nowrap px-3 py-2 fw-medium ${
              activeTab === 'monitor' ? 'btn-satmat shadow-sm' : 'btn-light text-secondary'
            }`}
          >
            🔄 Live WebSocket Monitor
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`btn btn-sm rounded-2 text-nowrap px-3 py-2 fw-medium ${
              activeTab === 'logs' ? 'btn-satmat shadow-sm' : 'btn-light text-secondary'
            }`}
          >
            📊 Request / Response Logs (Table)
          </button>

          <button
            onClick={() => setActiveTab('ocpi')}
            className={`btn btn-sm rounded-2 text-nowrap px-3 py-2 fw-medium ${
              activeTab === 'ocpi' ? 'btn-satmat shadow-sm' : 'btn-light text-secondary'
            }`}
          >
            🌐 OCPI Roaming Gateway (CPO)
          </button>

          <button
            onClick={() => setActiveTab('emsp')}
            title="Simulate how external eMSP platform discovers chargers, fetches tariffs, starts/stops charging, and fetches CDRs via OCPI 2.2.1"
            className={`btn btn-sm rounded-2 text-nowrap px-3 py-2 fw-medium ${
              activeTab === 'emsp' ? 'btn-satmat shadow-sm' : 'btn-light text-secondary'
            }`}
          >
            🧪 External eMSP Integration Sandbox
          </button>

          <button
            onClick={() => setActiveTab('costing')}
            className={`btn btn-sm rounded-2 text-nowrap px-3 py-2 fw-medium ${
              activeTab === 'costing' ? 'btn-satmat shadow-sm' : 'btn-light text-secondary'
            }`}
          >
            💰 Dynamic Costing
          </button>

          <button
            onClick={() => setActiveTab('deploy')}
            className={`btn btn-sm rounded-2 text-nowrap px-3 py-2 fw-medium ${
              activeTab === 'deploy' ? 'btn-satmat shadow-sm' : 'btn-light text-secondary'
            }`}
          >
            🛠️ PM2 & DB Deployment
          </button>
        </div>
      </div>
    </header>
  );
};
