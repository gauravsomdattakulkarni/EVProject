import React, { useState } from 'react';
import { Charger, Connector } from '../types/index.js';

interface ChargersManagerProps {
  chargers: Charger[];
  onRefresh: () => void;
}

export const ChargersManager: React.FC<ChargersManagerProps> = ({ chargers, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);
  const [showConnectorModal, setShowConnectorModal] = useState<{ chargerId: string; connector?: Connector } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states for Add / Edit Charger
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    address: 'SATMAT Charging Station',
    city: 'Pune',
    postalCode: '411001',
    latitude: 18.5204,
    longitude: 73.8567,
    baseCostPerKwh: 16.50,
    idleFeePerMinute: 1.50,
    sessionBaseFee: 15.00,
    maxPowerKw: 60.0,
    vendor: 'SATMAT PowerTech',
    model: 'SM-PRO-DC60'
  });

  // Form states for Add / Edit Connector
  const [connectorForm, setConnectorForm] = useState<{
    name: string;
    type: Connector['type'];
    powerType: Connector['powerType'];
    maxKw: number;
    voltage: number;
    amperage: number;
  }>({
    name: 'Connector 1 (CCS2 Fast)',
    type: 'CCS2',
    powerType: 'DC',
    maxKw: 60,
    voltage: 400,
    amperage: 150
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAdd = () => {
    const nextNum = chargers.length + 1;
    setFormData({
      id: `SATMAT-EV-00${nextNum}`,
      name: `SATMAT Station ${nextNum}`,
      address: '',
      city: 'Pune',
      postalCode: '411001',
      latitude: 18.5204,
      longitude: 73.8567,
      baseCostPerKwh: 16.00,
      idleFeePerMinute: 1.00,
      sessionBaseFee: 10.00,
      maxPowerKw: 60.0,
      vendor: 'SATMAT',
      model: 'SM-01'
    });
    setEditingCharger(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (charger: Charger) => {
    setEditingCharger(charger);
    setFormData({
      id: charger.id,
      name: charger.name,
      address: charger.location.address,
      city: charger.location.city,
      postalCode: charger.location.postalCode,
      latitude: charger.location.latitude,
      longitude: charger.location.longitude,
      baseCostPerKwh: charger.baseCostPerKwh,
      idleFeePerMinute: charger.idleFeePerMinute,
      sessionBaseFee: charger.sessionBaseFee,
      maxPowerKw: charger.maxPowerKw,
      vendor: charger.chargePointVendor,
      model: charger.chargePointModel
    });
    setShowAddModal(true);
  };

  const handleSaveCharger = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('save');
    try {
      const url = editingCharger ? `/api/chargers/${editingCharger.id}` : '/api/chargers';
      const method = editingCharger ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formData.id.trim(),
          name: formData.name.trim(),
          location: {
            name: formData.name,
            address: formData.address,
            city: formData.city,
            postalCode: formData.postalCode,
            country: 'IND',
            latitude: Number(formData.latitude),
            longitude: Number(formData.longitude)
          },
          baseCostPerKwh: Number(formData.baseCostPerKwh),
          idleFeePerMinute: Number(formData.idleFeePerMinute),
          sessionBaseFee: Number(formData.sessionBaseFee),
          maxPowerKw: Number(formData.maxPowerKw),
          chargePointVendor: formData.vendor,
          chargePointModel: formData.model
        })
      });

      if (res.ok) {
        setNotification({
          type: 'success',
          message: editingCharger ? `Charger ${formData.id} updated successfully` : `New Charger ${formData.id} added successfully`
        });
        setShowAddModal(false);
        onRefresh();
      } else {
        const err = await res.json();
        setNotification({ type: 'error', message: err.error || 'Failed to save charger' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error saving charger' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCharger = async (id: string) => {
    let confirmed = true;
    try {
      confirmed = window.confirm(`Are you sure you want to delete charger ${id}?`);
    } catch {
      confirmed = true;
    }
    if (!confirmed) return;

    setActionLoading(`delete-${id}`);
    try {
      const res = await fetch(`/api/chargers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotification({ type: 'success', message: `Charger ${id} deleted successfully` });
        onRefresh();
      } else {
        setNotification({ type: 'error', message: 'Failed to delete charger' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenAddConnector = (chargerId: string) => {
    setConnectorForm({
      name: 'Connector (CCS2 Fast)',
      type: 'CCS2',
      powerType: 'DC',
      maxKw: 60,
      voltage: 400,
      amperage: 150
    });
    setShowConnectorModal({ chargerId });
  };

  const handleSaveConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showConnectorModal) return;
    setActionLoading('connector-save');

    try {
      const { chargerId, connector } = showConnectorModal;
      const url = connector
        ? `/api/chargers/${chargerId}/connectors/${connector.id}`
        : `/api/chargers/${chargerId}/connectors`;
      const method = connector ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectorForm)
      });

      if (res.ok) {
        setNotification({ type: 'success', message: 'Connector saved successfully' });
        setShowConnectorModal(null);
        onRefresh();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteConnector = async (chargerId: string, connId: number) => {
    if (!window.confirm(`Delete Connector ${connId}?`)) return;
    try {
      const res = await fetch(`/api/chargers/${chargerId}/connectors/${connId}`, { method: 'DELETE' });
      if (res.ok) {
        setNotification({ type: 'success', message: 'Connector removed' });
        onRefresh();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleRemoteCommand = async (machineId: string, action: 'start' | 'stop' | 'reset' | 'unlock', connectorId = 1, transactionId?: number) => {
    setActionLoading(`${action}-${machineId}-${connectorId}`);
    try {
      const endpoint = action === 'start' ? 'remote-start' : action === 'stop' ? 'remote-stop' : action === 'unlock' ? 'unlock' : 'reset';
      const res = await fetch(`/api/chargers/${machineId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorId, transactionId })
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({
          type: 'success',
          message: data.message || `Command ${action.toUpperCase()} successfully processed for ${machineId}`
        });
        onRefresh();
      } else {
        // Fallback for stop: try direct stop-session endpoint
        if (action === 'stop') {
          const fallbackRes = await fetch(`/api/chargers/${machineId}/stop-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectorId, transactionId })
          });
          if (fallbackRes.ok) {
            setNotification({ type: 'success', message: `Charging session stopped successfully for ${machineId}` });
            onRefresh();
            return;
          }
        }
        setNotification({
          type: 'error',
          message: data.error || `Failed to execute ${action} on ${machineId}`
        });
      }
      onRefresh();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || `Failed to execute ${action}` });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="container-fluid px-3 px-lg-4 py-4">
      {/* Header bar */}
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-4 gap-3">
        <div>
          <h1 className="h3 fw-bold text-dark mb-1">EV Chargers & Connectors</h1>
          <p className="text-secondary small mb-0">
            Real-time OCPP 1.6J charge stations with dynamic WebSocket endpoints: <code className="text-success fw-semibold">wss://evcharger.satmatgroup.com/ocpp/:machineId</code>
          </p>
        </div>

        <div className="d-flex gap-2">
          <button onClick={onRefresh} className="btn btn-satmat-outline btn-sm shadow-sm d-flex align-items-center gap-1.5">
            <span>🔄</span> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-satmat btn-sm shadow-sm d-flex align-items-center gap-1.5">
            <span>➕</span> Add New Charger
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`alert ${
            notification.type === 'success' ? 'alert-success' : 'alert-danger'
          } alert-dismissible fade show small py-2 px-3 rounded-3 mb-4`}
          role="alert"
        >
          {notification.message}
          <button type="button" className="btn-close py-2" onClick={() => setNotification(null)}></button>
        </div>
      )}

      {/* Live Active Charging Sessions Banner */}
      {(() => {
        const activeSessions = chargers.flatMap((c) =>
          c.connectors
            .filter((conn) => conn.status === 'Charging' || !!conn.currentSession)
            .map((conn) => ({ charger: c, connector: conn }))
        );

        if (activeSessions.length === 0) return null;

        return (
          <div className="card-satmat border-success border-2 p-3 p-md-4 mb-4 bg-satmat-light shadow-sm">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-success text-white py-1.5 px-3 fs-6 d-flex align-items-center gap-1.5 shadow-sm">
                  <span className="spinner-grow spinner-grow-sm text-light" role="status" />
                  ⚡ LIVE CHARGING IN PROGRESS ({activeSessions.length} Active)
                </span>
                <span className="small text-secondary fw-semibold d-none d-md-inline">
                  Streaming real-time OCPP power, battery SoC, and dynamic costing
                </span>
              </div>
            </div>

            <div className="row g-3">
              {activeSessions.map(({ charger, connector }) => {
                const session = connector.currentSession;
                return (
                  <div key={`${charger.id}-${connector.id}`} className="col-12 col-lg-6">
                    <div className="bg-white p-3 rounded-3 border border-success-subtle shadow-sm h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <div>
                            <strong className="text-dark d-block fs-6">{charger.name}</strong>
                            <div className="d-flex gap-1.5 mt-0.5">
                              <span className="badge bg-dark text-white">{charger.id}</span>
                              <span className="badge bg-secondary text-white">Connector #{connector.id}</span>
                            </div>
                          </div>
                          <span className="badge bg-primary text-white py-1 px-2.5">
                            Tx #{session?.transactionId || connector.activeTransactionId || charger.activeTransactionId || 'Active'}
                          </span>
                        </div>

                        {/* Live Metrics Grid */}
                        <div className="row g-2 text-center my-3">
                          <div className="col-3">
                            <div className="p-2 bg-light rounded border">
                              <span className="small text-muted d-block">Energy</span>
                              <strong className="text-success fs-5">{session?.currentKwh.toFixed(2) || '0.00'}</strong>
                              <span className="text-muted text-xs d-block">kWh</span>
                            </div>
                          </div>
                          <div className="col-3">
                            <div className="p-2 bg-light rounded border">
                              <span className="small text-muted d-block">Power</span>
                              <strong className="text-dark fs-5">{session?.currentPowerKw || 45}</strong>
                              <span className="text-muted text-xs d-block">kW</span>
                            </div>
                          </div>
                          <div className="col-3">
                            <div className="p-2 bg-light rounded border">
                              <span className="small text-muted d-block">Battery</span>
                              <strong className="text-primary fs-5">{session?.soc || 15}%</strong>
                              <span className="text-muted text-xs d-block">SoC</span>
                            </div>
                          </div>
                          <div className="col-3">
                            <div className="p-2 bg-light rounded border">
                              <span className="small text-muted d-block">Cost</span>
                              <strong className="text-success fs-5">₹{session?.cost.toFixed(2) || '0.00'}</strong>
                              <span className="text-muted text-xs d-block">Dynamic</span>
                            </div>
                          </div>
                        </div>

                        {/* Animated Battery SoC Progress Bar */}
                        <div className="progress mb-2" style={{ height: '8px' }}>
                          <div
                            className="progress-bar bg-success progress-bar-striped progress-bar-animated"
                            style={{ width: `${session?.soc || 15}%` }}
                          />
                        </div>

                        <div className="d-flex justify-content-between text-muted text-xs mb-3">
                          <span>Tag: {session?.idTag || 'SATMAT-ADMIN-CARD'}</span>
                          <span>Rate: ₹{charger.baseCostPerKwh.toFixed(2)}/kWh</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoteCommand(charger.id, 'stop', connector.id, session?.transactionId || connector.activeTransactionId || charger.activeTransactionId || undefined)}
                        disabled={actionLoading === `stop-${charger.id}-${connector.id}` || actionLoading === `start-${charger.id}-${connector.id}`}
                        className="btn btn-danger w-100 fw-bold py-2 shadow-sm d-flex align-items-center justify-content-center gap-2"
                      >
                        <span>⏹</span> {actionLoading === `stop-${charger.id}-${connector.id}` ? 'Stopping Charge...' : 'Stop Charging (RemoteStopTransaction)'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Chargers Grid or Empty State */}
      {chargers.length === 0 ? (
        <div className="card-satmat p-5 text-center border">
          <div className="d-inline-flex p-3 rounded-circle bg-success-subtle text-success mb-3">
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <h3 className="h5 fw-bold text-dark mb-2">No EV Chargers Registered Yet</h3>
          <p className="text-secondary small mb-4" style={{ maxWidth: '480px', margin: '0 auto' }}>
            The system starts clean with no dummy data. Click below to add your physical charging machine and generate its dynamic WebSocket connection URL.
          </p>
          <div>
            <button onClick={handleOpenAdd} className="btn btn-satmat px-4 py-2 shadow-sm">
              ➕ Add Your First Charger
            </button>
          </div>
        </div>
      ) : (
        <div className="row g-4">
          {chargers.map((charger) => {
            const isConnected = charger.isConnected || charger.isSocketLive;
            return (
              <div key={charger.id} className="col-12 col-xl-6">
                <div className="card-satmat h-100 p-4 border d-flex flex-column justify-content-between">
                  <div>
                    {/* Top info row */}
                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span className="badge bg-dark text-white fw-bold px-2.5 py-1">
                            {charger.id}
                          </span>
                          <span className={`badge ${isConnected ? 'badge-connected' : 'badge-disconnected'} px-2.5 py-1`}>
                            ● {isConnected ? 'WebSocket Online' : 'Offline'}
                          </span>
                          <span className="badge bg-secondary-subtle text-secondary small">
                            OCPP {charger.ocppVersion}
                          </span>
                        </div>
                        <h2 className="h5 fw-bold text-dark mb-0">{charger.name}</h2>
                        <span className="text-muted small">
                          📍 {charger.location.address}, {charger.location.city}
                        </span>
                      </div>

                      <div className="d-flex gap-1.5 align-items-center">
                        {charger.connectors.some((c) => c.status === 'Charging' || !!c.currentSession || (c.activeTransactionId && Number(c.activeTransactionId) > 0)) || charger.status === 'Charging' ? (
                          <button
                            onClick={() => handleRemoteCommand(charger.id, 'stop', charger.connectors.find((c) => c.status === 'Charging' || !!c.currentSession)?.id || 1)}
                            disabled={actionLoading?.startsWith(`stop-${charger.id}`)}
                            className="btn btn-sm btn-danger px-2.5 py-1 fw-bold shadow-sm d-flex align-items-center gap-1 text-xs"
                            title="Emergency Stop: Halt all charging on this station"
                          >
                            <span>⏹</span> {actionLoading?.startsWith(`stop-${charger.id}`) ? 'Stopping...' : 'Stop Station'}
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleOpenEdit(charger)}
                          className="btn btn-sm btn-outline-secondary px-2.5 py-1"
                          title="Edit Machine Details"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteCharger(charger.id)}
                          disabled={actionLoading === `delete-${charger.id}`}
                          className="btn btn-sm btn-outline-danger px-2.5 py-1"
                          title="Delete Machine"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Dynamic WebSocket URLs (Requirement 5) */}
                    <div className="bg-light p-3 rounded-3 mb-3 border">
                      <div className="d-flex align-items-center justify-content-between mb-1.5">
                        <span className="small fw-bold text-secondary">
                          🌐 Production Dynamic WebSocket URL:
                        </span>
                        <button
                          onClick={() => handleCopy(charger.wsUrl, `${charger.id}-ws`)}
                          className="btn btn-link btn-sm p-0 text-success text-decoration-none fw-semibold small"
                        >
                          {copiedId === `${charger.id}-ws` ? '✓ Copied!' : 'Copy URL'}
                        </button>
                      </div>
                      <code className="text-success small fw-semibold text-break d-block mb-2">
                        {charger.wsUrl}
                      </code>

                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <span className="small text-muted">Local Dev WebSocket:</span>
                        <button
                          onClick={() => handleCopy(charger.localWsUrl, `${charger.id}-local`)}
                          className="btn btn-link btn-sm p-0 text-muted text-decoration-none small"
                        >
                          {copiedId === `${charger.id}-local` ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      <code className="text-muted small text-break d-block">
                        {charger.localWsUrl}
                      </code>
                    </div>

                    {/* Costing & Specs Info */}
                    <div className="row g-2 mb-3 text-center">
                      <div className="col-4">
                        <div className="p-2 border rounded-2 bg-satmat-light">
                          <span className="d-block small text-secondary">Base Rate</span>
                          <strong className="text-success fs-6">₹{charger.baseCostPerKwh.toFixed(2)}</strong>
                          <span className="text-muted small">/kWh</span>
                        </div>
                      </div>
                      <div className="col-4">
                        <div className="p-2 border rounded-2 bg-white">
                          <span className="d-block small text-secondary">Idle Fee</span>
                          <strong className="text-dark fs-6">₹{charger.idleFeePerMinute.toFixed(2)}</strong>
                          <span className="text-muted small">/min</span>
                        </div>
                      </div>
                      <div className="col-4">
                        <div className="p-2 border rounded-2 bg-white">
                          <span className="d-block small text-secondary">Max Capacity</span>
                          <strong className="text-dark fs-6">{charger.maxPowerKw} kW</strong>
                          <span className="text-muted small">Max</span>
                        </div>
                      </div>
                    </div>

                    {/* Connectors Section (Requirement 6: each charger can have multiple connectors) */}
                    <div className="mb-3">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span className="fw-bold small text-dark d-flex align-items-center gap-1.5">
                          🔌 Connectors ({charger.connectors.length})
                        </span>
                        <button
                          onClick={() => handleOpenAddConnector(charger.id)}
                          className="btn btn-sm btn-satmat-outline py-0.5 px-2 text-xs"
                        >
                          + Add Connector
                        </button>
                      </div>

                      <div className="d-flex flex-column gap-2">
                        {charger.connectors.map((conn) => {
                          const hasActiveTx = Boolean(
                            (conn.activeTransactionId && Number(conn.activeTransactionId) > 0) ||
                            (conn.currentSession && conn.currentSession.transactionId) ||
                            (charger.activeTransactionId && (charger.connectors.length === 1 || conn.id === 1)) ||
                            (charger.status === 'Charging' && (charger.connectors.length === 1 || conn.id === 1))
                          );
                          const isCharging = conn.status === 'Charging' || !!conn.currentSession || hasActiveTx;
                          const activeTxId = conn.currentSession?.transactionId || conn.activeTransactionId || charger.activeTransactionId || undefined;
                          return (
                            <div
                              key={conn.id}
                              className={`p-2.5 rounded-3 border d-flex flex-wrap align-items-center justify-content-between gap-2 ${
                                isCharging ? 'bg-primary-subtle border-primary' : 'bg-white'
                              }`}
                            >
                              <div>
                                <div className="d-flex align-items-center gap-2">
                                  <span className="badge bg-secondary text-white small">
                                    #{conn.id}
                                  </span>
                                  <strong className="small text-dark">{conn.name}</strong>
                                  <span
                                    className={`badge ${
                                      isCharging
                                        ? 'badge-charging'
                                        : conn.status === 'Available'
                                        ? 'badge-connected'
                                        : 'bg-warning-subtle text-warning-emphasis'
                                    }`}
                                  >
                                    {isCharging ? '⚡ Charging' : conn.status}
                                  </span>
                                </div>
                                <span className="text-muted small d-block mt-0.5">
                                  {conn.type} &bull; {conn.powerType} &bull; {conn.maxKw} kW &bull; {conn.voltage}V / {conn.amperage}A
                                </span>
                                {conn.currentSession ? (
                                  <span className="text-primary small fw-semibold d-block mt-1">
                                    ⚡ Active Charging: {conn.currentSession.currentKwh.toFixed(2)} kWh ({conn.currentSession.soc}% SoC) &bull; ₹{conn.currentSession.cost.toFixed(2)}
                                    {conn.currentSession.transactionId && (
                                      <span className="text-muted ms-1">(Tx #{conn.currentSession.transactionId})</span>
                                    )}
                                  </span>
                                ) : isCharging ? (
                                  <span className="text-primary small fw-semibold d-block mt-1">
                                    ⚡ Charging In Progress &bull; Session Active
                                  </span>
                                ) : null}
                              </div>

                              <div className="d-flex align-items-center gap-1.5">
                                {isCharging ? (
                                  <button
                                    onClick={() => handleRemoteCommand(charger.id, 'stop', conn.id, activeTxId)}
                                    disabled={actionLoading === `stop-${charger.id}-${conn.id}` || actionLoading === `start-${charger.id}-${conn.id}`}
                                    className="btn btn-sm btn-danger py-1.5 px-3 text-xs fw-bold shadow-sm d-flex align-items-center gap-1"
                                    title="Stop charging session and release connector"
                                  >
                                    <span>⏹</span> {actionLoading === `stop-${charger.id}-${conn.id}` ? 'Stopping...' : 'Stop Charge'}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleRemoteCommand(charger.id, 'start', conn.id)}
                                    disabled={actionLoading === `start-${charger.id}-${conn.id}` || actionLoading === `stop-${charger.id}-${conn.id}`}
                                    className="btn btn-sm btn-success py-1.5 px-3 text-xs fw-semibold shadow-sm d-flex align-items-center gap-1"
                                    title="Initiate charging session on this connector"
                                  >
                                    <span>▶</span> {actionLoading === `start-${charger.id}-${conn.id}` ? 'Starting...' : 'Start Charge'}
                                  </button>
                                )}

                                <button
                                  onClick={() => handleDeleteConnector(charger.id, conn.id)}
                                  className="btn btn-sm btn-outline-secondary py-1 px-2 text-xs text-danger"
                                  title="Remove Connector"
                                >
                                  &times;
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Footer status & quick actions */}
                  <div className="pt-3 border-top d-flex flex-wrap align-items-center justify-content-between gap-2 text-muted small">
                    <div>
                      <span>Heartbeat: </span>
                      <strong className="text-dark">
                        {charger.lastHeartbeat ? new Date(charger.lastHeartbeat).toLocaleTimeString() : 'No ping yet'}
                      </strong>
                    </div>

                    <div className="d-flex gap-2">
                      <button
                        onClick={() => handleRemoteCommand(charger.id, 'unlock', charger.connectors[0]?.id || 1)}
                        disabled={actionLoading === `unlock-${charger.id}-${charger.connectors[0]?.id || 1}`}
                        className="btn btn-sm btn-outline-secondary py-0.5 px-2"
                        title="Send UnlockConnector command to release vehicle plug"
                      >
                        🔓 Unlock Plug
                      </button>
                      <button
                        onClick={() => handleRemoteCommand(charger.id, 'reset')}
                        disabled={actionLoading === `reset-${charger.id}`}
                        className="btn btn-sm btn-outline-secondary py-0.5 px-2"
                        title="Send Remote Reset to Charger"
                      >
                        🔄 Reset Station
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Charger Modal */}
      {showAddModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-satmat-light border-bottom">
                <h5 className="modal-title fw-bold text-dark">
                  {editingCharger ? `Edit Charger: ${editingCharger.id}` : 'Add New EV Charging Station'}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
              </div>

              <form onSubmit={handleSaveCharger}>
                <div className="modal-body p-4">
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary">
                        Machine ID <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. SATMAT-EV-004"
                        value={formData.id}
                        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                        disabled={!!editingCharger}
                        required
                      />
                      <small className="text-muted">Unique machine identifier used in WebSocket URL</small>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary">
                        Machine Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. SATMAT Pune Metro Supercharger 04"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>

                    {/* Dynamic WebSocket URL preview */}
                    <div className="col-12">
                      <div className="bg-light p-2.5 rounded-2 border">
                        <span className="small text-secondary fw-semibold d-block mb-1">
                          Generated Dynamic WebSocket Endpoint:
                        </span>
                        <code className="text-success fw-bold small">
                          wss://evcharger.satmatgroup.com/ocpp/{formData.id || ':machineId'}
                        </code>
                      </div>
                    </div>

                    <div className="col-12 col-md-8">
                      <label className="form-label small fw-semibold text-secondary">Address</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Highway Plaza, Sector 4"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      />
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="form-label small fw-semibold text-secondary">City</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>

                    <div className="col-6 col-md-3">
                      <label className="form-label small fw-semibold text-secondary">Base Rate (₹/kWh)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control"
                        value={formData.baseCostPerKwh}
                        onChange={(e) => setFormData({ ...formData, baseCostPerKwh: parseFloat(e.target.value) || 0 })}
                        required
                      />
                    </div>

                    <div className="col-6 col-md-3">
                      <label className="form-label small fw-semibold text-secondary">Idle Fee (₹/min)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control"
                        value={formData.idleFeePerMinute}
                        onChange={(e) => setFormData({ ...formData, idleFeePerMinute: parseFloat(e.target.value) || 0 })}
                        required
                      />
                    </div>

                    <div className="col-6 col-md-3">
                      <label className="form-label small fw-semibold text-secondary">Session Fee (₹)</label>
                      <input
                        type="number"
                        step="0.5"
                        className="form-control"
                        value={formData.sessionBaseFee}
                        onChange={(e) => setFormData({ ...formData, sessionBaseFee: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="col-6 col-md-3">
                      <label className="form-label small fw-semibold text-secondary">Max Power (kW)</label>
                      <input
                        type="number"
                        step="1"
                        className="form-control"
                        value={formData.maxPowerKw}
                        onChange={(e) => setFormData({ ...formData, maxPowerKw: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary">Vendor / Manufacturer</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.vendor}
                        onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary">Model</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.model}
                        onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer bg-light">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading === 'save'} className="btn btn-satmat">
                    {actionLoading === 'save' ? 'Saving...' : editingCharger ? 'Update Charger' : 'Create Charger'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Connector Modal */}
      {showConnectorModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-satmat-light border-bottom">
                <h5 className="modal-title fw-bold text-dark">
                  Add Connector to {showConnectorModal.chargerId}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowConnectorModal(null)}></button>
              </div>

              <form onSubmit={handleSaveConnector}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="form-label small fw-semibold text-secondary">Connector Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={connectorForm.name}
                      onChange={(e) => setConnectorForm({ ...connectorForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="row g-3 mb-3">
                    <div className="col-6">
                      <label className="form-label small fw-semibold text-secondary">Standard / Type</label>
                      <select
                        className="form-select"
                        value={connectorForm.type}
                        onChange={(e) => setConnectorForm({ ...connectorForm, type: e.target.value as any })}
                      >
                        <option value="CCS2">CCS2 (DC Fast)</option>
                        <option value="Type2">Type 2 (AC)</option>
                        <option value="CHAdeMO">CHAdeMO (DC)</option>
                        <option value="GB_T">GB/T</option>
                        <option value="Bharat_DC001">Bharat DC001</option>
                        <option value="Bharat_AC001">Bharat AC001</option>
                      </select>
                    </div>

                    <div className="col-6">
                      <label className="form-label small fw-semibold text-secondary">Power Type</label>
                      <select
                        className="form-select"
                        value={connectorForm.powerType}
                        onChange={(e) => setConnectorForm({ ...connectorForm, powerType: e.target.value as any })}
                      >
                        <option value="DC">DC (Fast)</option>
                        <option value="AC_3_PHASE">AC 3-Phase</option>
                        <option value="AC_1_PHASE">AC 1-Phase</option>
                      </select>
                    </div>

                    <div className="col-4">
                      <label className="form-label small fw-semibold text-secondary">Max Power (kW)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={connectorForm.maxKw}
                        onChange={(e) => setConnectorForm({ ...connectorForm, maxKw: parseFloat(e.target.value) || 0 })}
                        required
                      />
                    </div>

                    <div className="col-4">
                      <label className="form-label small fw-semibold text-secondary">Voltage (V)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={connectorForm.voltage}
                        onChange={(e) => setConnectorForm({ ...connectorForm, voltage: parseInt(e.target.value, 10) || 0 })}
                        required
                      />
                    </div>

                    <div className="col-4">
                      <label className="form-label small fw-semibold text-secondary">Current (A)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={connectorForm.amperage}
                        onChange={(e) => setConnectorForm({ ...connectorForm, amperage: parseInt(e.target.value, 10) || 0 })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer bg-light">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowConnectorModal(null)}>
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading === 'connector-save'} className="btn btn-satmat">
                    Save Connector
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
