import React, { useState, useEffect } from 'react';
import { Charger, LogItem } from '../types/index.js';
import { RequestResponseLogsTable } from './RequestResponseLogsTable.js';

interface LiveWebSocketMonitorProps {
  chargers: Charger[];
  wsConnected: boolean;
  onRefresh: () => void;
}

export const LiveWebSocketMonitor: React.FC<LiveWebSocketMonitorProps> = ({
  chargers,
  wsConnected,
  onRefresh
}) => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(chargers[0]?.id || '');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeView, setActiveView] = useState<'monitor' | 'tabular'>('monitor');

  useEffect(() => {
    if (!selectedMachineId && chargers.length > 0) {
      setSelectedMachineId(chargers[0].id);
    }
  }, [chargers, selectedMachineId]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=50');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      // ignore
    }
  };

  const selectedCharger = chargers.find((c) => c.id === selectedMachineId) || chargers[0];

  const handleRemoteAction = async (action: 'start' | 'stop' | 'unlock', connectorId: number, transactionId?: number) => {
    if (!selectedCharger) return;
    setActionLoading(`${action}-${connectorId}`);
    setNotification(null);
    try {
      const endpoint = action === 'start' ? 'remote-start' : action === 'stop' ? 'remote-stop' : 'unlock';
      const res = await fetch(`/api/chargers/${selectedCharger.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorId, transactionId })
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({ type: 'success', message: data.message || `Remote command sent to ${selectedCharger.id}` });
        onRefresh();
        fetchLogs();
      } else {
        // Fallback for stop command
        if (action === 'stop') {
          const fbRes = await fetch(`/api/chargers/${selectedCharger.id}/stop-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectorId, transactionId })
          });
          if (fbRes.ok) {
            setNotification({ type: 'success', message: `Charging session stopped successfully for ${selectedCharger.id}` });
            onRefresh();
            fetchLogs();
            return;
          }
        }
        setNotification({ type: 'error', message: data.error || `Failed to execute ${action}` });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="container-fluid px-3 px-lg-4 py-4">
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-4 gap-3">
        <div>
          <h1 className="h3 fw-bold text-dark mb-1">Real-Time WebSocket & OCPP Monitor</h1>
          <p className="text-secondary small mb-0">
            Bidirectional OCPP 1.6J WebSocket stream &bull; Live heartbeats, transactions, and meter values
          </p>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          {/* View mode toggle */}
          <div className="btn-group btn-group-sm bg-white p-0.5 border rounded-2 shadow-sm">
            <button
              onClick={() => setActiveView('monitor')}
              className={`btn btn-sm px-3 py-1.5 fw-semibold ${activeView === 'monitor' ? 'btn-satmat shadow-xs' : 'btn-light text-secondary'}`}
            >
              🔄 Live Charger Cards
            </button>
            <button
              onClick={() => setActiveView('tabular')}
              className={`btn btn-sm px-3 py-1.5 fw-semibold ${activeView === 'tabular' ? 'btn-satmat shadow-xs' : 'btn-light text-secondary'}`}
            >
              📊 Tabular Request/Response Ledger
            </button>
          </div>

          {chargers.length > 0 && activeView === 'monitor' && (
            <div className="d-flex align-items-center gap-2 ms-md-2">
              <span className="small text-secondary fw-semibold">Station:</span>
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                value={selectedMachineId}
                onChange={(e) => setSelectedMachineId(e.target.value)}
              >
                {chargers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} - {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {notification && (
        <div
          className={`alert ${
            notification.type === 'success' ? 'alert-success' : 'alert-danger'
          } alert-dismissible fade show small py-2 px-3 rounded-3 mb-4`}
        >
          {notification.message}
          <button type="button" className="btn-close py-2" onClick={() => setNotification(null)}></button>
        </div>
      )}

      {chargers.length === 0 ? (
        <div className="card-satmat p-5 text-center border mb-4">
          <div className="d-inline-flex p-3 rounded-circle bg-success-subtle text-success mb-3">
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <h3 className="h5 fw-bold text-dark mb-2">No Charging Stations Registered</h3>
          <p className="text-secondary small mb-0" style={{ maxWidth: '480px', margin: '0 auto' }}>
            The system starts clean with zero dummy data. Once you register a charger in the <strong>Chargers & Connectors</strong> tab and connect via WebSocket, live heartbeats, power telemetry, and connector status will stream here.
          </p>
        </div>
      ) : selectedCharger ? (
        <div className="row g-4 mb-4">
          {/* Main Status & Telemetry Card */}
          <div className="col-12 col-xl-8">
            <div className="card-satmat p-4 border h-100">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-3 mb-3 border-bottom">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <h2 className="h5 fw-bold text-dark mb-0">{selectedCharger.name}</h2>
                    <span className="badge bg-dark">{selectedCharger.id}</span>
                  </div>
                  <span className="text-muted small">
                    WebSocket: <code className="text-success">{selectedCharger.wsUrl}</code>
                  </span>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <span
                    className={`badge d-flex align-items-center gap-1.5 py-1.5 px-3 rounded-pill ${
                      selectedCharger.isConnected ? 'badge-connected' : 'badge-disconnected'
                    }`}
                  >
                    <span
                      className="d-inline-block rounded-circle"
                      style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: selectedCharger.isConnected ? '#16a34a' : '#dc2626'
                      }}
                    />
                    {selectedCharger.isConnected ? 'Connected & Alive' : 'Disconnected'}
                  </span>

                  <span className="badge bg-light text-dark border py-1.5 px-2.5">
                    Heartbeat: {selectedCharger.lastHeartbeat ? new Date(selectedCharger.lastHeartbeat).toLocaleTimeString() : 'None'}
                  </span>
                </div>
              </div>

              {/* Connectors Live Grid */}
              <h3 className="h6 fw-bold text-secondary text-uppercase tracking-wider mb-3">
                Live Connector States & Charging Sessions
              </h3>

              <div className="row g-3">
                {selectedCharger.connectors.map((conn) => {
                  const hasActiveTx = Boolean(
                    (conn.activeTransactionId && Number(conn.activeTransactionId) > 0) ||
                    (conn.currentSession && conn.currentSession.transactionId) ||
                    (selectedCharger.activeTransactionId && (selectedCharger.connectors.length === 1 || conn.id === 1)) ||
                    (selectedCharger.status === 'Charging' && (selectedCharger.connectors.length === 1 || conn.id === 1))
                  );
                  const isCharging = conn.status === 'Charging' || !!conn.currentSession || hasActiveTx;
                  const session = conn.currentSession;
                  const activeTxId = session?.transactionId || conn.activeTransactionId || selectedCharger.activeTransactionId || undefined;

                  return (
                    <div key={conn.id} className="col-12 col-md-6">
                      <div
                        className={`p-3 rounded-3 border h-100 d-flex flex-column justify-content-between ${
                          isCharging ? 'bg-satmat-light border-success' : 'bg-light'
                        }`}
                      >
                        <div>
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <strong className="text-dark small">
                              Connector #{conn.id}: {conn.name}
                            </strong>
                            <span
                              className={`badge ${
                                isCharging
                                  ? 'badge-charging'
                                  : conn.status === 'Available'
                                  ? 'badge-connected'
                                  : 'bg-secondary-subtle text-secondary'
                              }`}
                            >
                              {isCharging ? '⚡ Charging' : conn.status}
                            </span>
                          </div>

                          <div className="text-muted small mb-3">
                            {conn.type} &bull; {conn.powerType} &bull; Max {conn.maxKw} kW ({conn.voltage}V/{conn.amperage}A)
                          </div>

                          {isCharging && session ? (
                            <div className="bg-white p-3 rounded-2 border mb-3">
                              <div className="d-flex align-items-center justify-content-between mb-2">
                                <span className="small text-secondary">Active Session:</span>
                                <span className="badge bg-primary text-white">Tx #{session.transactionId}</span>
                              </div>

                              <div className="row g-2 text-center mb-2">
                                <div className="col-4">
                                  <div className="p-1.5 bg-light rounded">
                                    <span className="d-block small text-muted">Energy</span>
                                    <strong className="text-success">{session.currentKwh.toFixed(2)}</strong>
                                    <span className="text-muted text-xs d-block">kWh</span>
                                  </div>
                                </div>
                                <div className="col-4">
                                  <div className="p-1.5 bg-light rounded">
                                    <span className="d-block small text-muted">Power</span>
                                    <strong className="text-dark">{session.currentPowerKw}</strong>
                                    <span className="text-muted text-xs d-block">kW</span>
                                  </div>
                                </div>
                                <div className="col-4">
                                  <div className="p-1.5 bg-light rounded">
                                    <span className="d-block small text-muted">SoC</span>
                                    <strong className="text-primary">{session.soc}%</strong>
                                    <span className="text-muted text-xs d-block">Battery</span>
                                  </div>
                                </div>
                              </div>

                              {/* Progress bar for SoC */}
                              <div className="progress mb-2" style={{ height: '6px' }}>
                                <div
                                  className="progress-bar bg-success progress-bar-striped progress-bar-animated"
                                  style={{ width: `${session.soc}%` }}
                                ></div>
                              </div>

                              <div className="d-flex justify-content-between small text-muted">
                                <span>Tag: {session.idTag}</span>
                                <span className="fw-bold text-success">Cost: ₹{session.cost.toFixed(2)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 text-center bg-white rounded-2 border mb-3 text-muted small">
                              Connector is idle and ready for incoming EV or Remote Start
                            </div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="d-grid gap-2">
                          {isCharging ? (
                            <button
                              onClick={() => handleRemoteAction('stop', conn.id, activeTxId)}
                              disabled={actionLoading === `stop-${conn.id}` || actionLoading === `start-${conn.id}`}
                              className="btn btn-danger btn-sm fw-bold shadow-sm py-2 d-flex align-items-center justify-content-center gap-1.5"
                            >
                              <span>⏹</span> {actionLoading === `stop-${conn.id}` ? 'Stopping Charge...' : 'Stop Charging (RemoteStopTransaction)'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRemoteAction('start', conn.id)}
                              disabled={actionLoading === `start-${conn.id}` || actionLoading === `stop-${conn.id}`}
                              className="btn btn-satmat btn-sm fw-semibold shadow-sm py-2"
                            >
                              {actionLoading === `start-${conn.id}` ? 'Starting Charge...' : '▶ Start Charging (RemoteStartTransaction)'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Specifications and Dynamic Tariff Panel */}
          <div className="col-12 col-xl-4">
            <div className="card-satmat p-4 border h-100 d-flex flex-column justify-content-between">
              <div>
                <h3 className="h6 fw-bold text-dark mb-3">Charging Rate & Dynamic Pricing</h3>

                <div className="list-group list-group-flush mb-4">
                  <div className="list-group-item d-flex justify-content-between px-0 py-2">
                    <span className="text-secondary small">Base Electricity Rate:</span>
                    <strong className="text-success">₹{selectedCharger.baseCostPerKwh.toFixed(2)} / kWh</strong>
                  </div>
                  <div className="list-group-item d-flex justify-content-between px-0 py-2">
                    <span className="text-secondary small">Idle Fee:</span>
                    <strong className="text-dark">₹{selectedCharger.idleFeePerMinute.toFixed(2)} / min</strong>
                  </div>
                  <div className="list-group-item d-flex justify-content-between px-0 py-2">
                    <span className="text-secondary small">Session Fee:</span>
                    <strong className="text-dark">₹{selectedCharger.sessionBaseFee.toFixed(2)}</strong>
                  </div>
                  <div className="list-group-item d-flex justify-content-between px-0 py-2">
                    <span className="text-secondary small">Hardware Model:</span>
                    <span className="text-dark small fw-semibold">{selectedCharger.chargePointModel}</span>
                  </div>
                  <div className="list-group-item d-flex justify-content-between px-0 py-2">
                    <span className="text-secondary small">Vendor:</span>
                    <span className="text-dark small fw-semibold">{selectedCharger.chargePointVendor}</span>
                  </div>
                  <div className="list-group-item d-flex justify-content-between px-0 py-2">
                    <span className="text-secondary small">Firmware:</span>
                    <span className="text-dark small font-monospace">{selectedCharger.firmwareVersion}</span>
                  </div>
                </div>

                <div className="p-3 bg-satmat-light rounded-3 border border-success-subtle mb-3">
                  <h4 className="small fw-bold text-success mb-1">OCPP 1.6J WebSocket Protocol</h4>
                  <p className="text-secondary small mb-0">
                    Supports JSON over WebSockets: <code>CALL [2]</code>, <code>CALLRESULT [3]</code>, and <code>CALLERROR [4]</code>.
                    Compatible with all ABB, Delta, Schneider, Statiq, and Alfen hardware.
                  </p>
                </div>
              </div>

              <div className="text-center text-muted small pt-2">
                WebSocket Client: <strong className="text-success">{wsConnected ? 'Connected' : 'Connecting'}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tabular Request & Response Logs Table */}
      <RequestResponseLogsTable chargers={chargers} wsConnected={wsConnected} />
    </div>
  );
};
