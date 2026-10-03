import React, { useState, useEffect, useCallback } from 'react';
import { HomePage } from './components/HomePage.js';
import { AdminLogin } from './components/AdminLogin.js';
import { Navbar } from './components/Navbar.js';
import { ChargersManager } from './components/ChargersManager.js';
import { LiveWebSocketMonitor } from './components/LiveWebSocketMonitor.js';
import { OcpiPartnerManager } from './components/OcpiPartnerManager.js';
import { EmspPartnerPanel } from './components/EmspPartnerPanel.js';
import { DynamicCostingManager } from './components/DynamicCostingManager.js';
import { ServerDeploymentHelper } from './components/ServerDeploymentHelper.js';
import { RequestResponseLogsTable } from './components/RequestResponseLogsTable.js';
import { Charger, OcpiPartner, Tariff, SystemStats } from './types/index.js';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  const [adminUser, setAdminUser] = useState<any>(() => {
    const saved = localStorage.getItem('satmat_admin_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<string>('chargers');
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [partners, setPartners] = useState<OcpiPartner[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Sync route
  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [chargersRes, partnersRes, tariffsRes, statsRes] = await Promise.all([
        fetch('/api/chargers'),
        fetch('/api/ocpi/partners'),
        fetch('/api/tariffs'),
        fetch('/api/stats')
      ]);

      if (chargersRes.ok) setChargers(await chargersRes.json());
      if (partnersRes.ok) setPartners(await partnersRes.json());
      if (tariffsRes.ok) setTariffs(await tariffsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Error fetching SATMAT data', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Connect to live WebSocket stream + background polling sync
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isCleanedUp = false;

    const connectWs = () => {
      if (isCleanedUp) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws-client`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'CHARGER_UPDATED' && data.charger) {
              // Instantaneous 0ms state update
              setChargers((prev) => {
                const idx = prev.findIndex((c) => c.id === data.charger.id);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = data.charger;
                  return copy;
                }
                return [...prev, data.charger];
              });
              // Refresh stats in background
              fetch('/api/stats')
                .then((r) => r.json())
                .then((s) => setStats(s))
                .catch(() => {});
            } else if (data.type === 'CHARGER_DELETED' && data.machineId) {
              setChargers((prev) =>
                prev.filter(
                  (c) =>
                    c.id !== data.machineId &&
                    c.id.toLowerCase() !== data.machineId.toLowerCase()
                )
              );
              fetchData();
            } else if (
              data.type === 'CHARGER_CONNECTED' ||
              data.type === 'CHARGER_DISCONNECTED' ||
              data.type === 'CHARGER_CREATED' ||
              data.type === 'SESSION_STARTED' ||
              data.type === 'SESSION_STOPPED'
            ) {
              fetchData();
            }
          } catch {
            // non-json message
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!isCleanedUp) {
            reconnectTimeout = setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = () => {
          setWsConnected(false);
          if (ws) {
            try { ws.close(); } catch {}
          }
        };
      } catch {
        setWsConnected(false);
        if (!isCleanedUp) {
          reconnectTimeout = setTimeout(connectWs, 4000);
        }
      }
    };

    connectWs();

    // 2.5-second polling safeguard ensures CSMS UI never hangs or desyncs
    const pollInterval = setInterval(() => {
      fetchData();
    }, 2500);

    return () => {
      isCleanedUp = true;
      if (ws) {
        try { ws.close(); } catch {}
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
    };
  }, [fetchData]);

  const handleLoginSuccess = (user: any) => {
    setAdminUser(user);
    localStorage.setItem('satmat_admin_user', JSON.stringify(user));
    navigateTo('/login_admin');
  };

  const handleLogout = () => {
    setAdminUser(null);
    localStorage.removeItem('satmat_admin_user');
    navigateTo('/login_admin');
  };

  // Route 17: in / home page simple <p> tag with text satmat ev
  if (currentPath === '/' && !adminUser) {
    return (
      <HomePage
        onNavigateToAdmin={() => navigateTo('/login_admin')}
      />
    );
  }

  // Route 18: in /login_admin : admin login and after admin login all things
  if (!adminUser) {
    return (
      <AdminLogin
        onLoginSuccess={handleLoginSuccess}
        onBackToHome={() => navigateTo('/')}
      />
    );
  }

  // Admin Console (All Things after Admin Login)
  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        wsConnected={wsConnected}
        onLogout={handleLogout}
      />

      <main className="flex-grow-1">
        {activeTab === 'chargers' && (
          <ChargersManager chargers={chargers} onRefresh={fetchData} />
        )}

        {activeTab === 'monitor' && (
          <LiveWebSocketMonitor
            chargers={chargers}
            wsConnected={wsConnected}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'logs' && (
          <RequestResponseLogsTable
            chargers={chargers}
            wsConnected={wsConnected}
          />
        )}

        {activeTab === 'ocpi' && (
          <OcpiPartnerManager
            partners={partners}
            chargers={chargers}
            tariffs={tariffs}
            onRefresh={fetchData}
            onOpenEmspPanel={() => setActiveTab('emsp')}
          />
        )}

        {activeTab === 'emsp' && (
          <EmspPartnerPanel
            chargers={chargers}
            partners={partners}
            tariffs={tariffs}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'costing' && (
          <DynamicCostingManager
            chargers={chargers}
            partners={partners}
            tariffs={tariffs}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'deploy' && <ServerDeploymentHelper />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-top py-3 text-center text-muted small">
        <div className="container-fluid px-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <strong className="text-dark">SATMAT EV</strong> &bull; Live Central Management System &bull; Domain:{' '}
              <a href="https://evcharger.satmatgroup.com/" target="_blank" rel="noreferrer" className="text-success text-decoration-none fw-semibold">
                https://evcharger.satmatgroup.com/
              </a>
            </div>
            <div>
              <span>OCPP 1.6J WebSocket &bull; OCPI 2.0 / 2.2 Roaming Protocol &bull; Node v20 & PM2</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
