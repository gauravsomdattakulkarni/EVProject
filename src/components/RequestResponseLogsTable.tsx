import React, { useState, useEffect, useMemo } from 'react';
import { LogItem, Charger } from '../types/index.js';

interface RequestResponseLogsTableProps {
  chargers?: Charger[];
  wsConnected?: boolean;
}

export const RequestResponseLogsTable: React.FC<RequestResponseLogsTableProps> = ({
  chargers = [],
  wsConnected = false
}) => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');
  const [directionFilter, setDirectionFilter] = useState<string>('ALL');
  const [actionCategory, setActionCategory] = useState<string>('ALL');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(2000); // 2s default
  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=500');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      // silence
    }
  };

  useEffect(() => {
    fetchLogs();
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(fetchLogs, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [autoRefreshInterval]);

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all stored request & response logs?')) return;
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      if (res.ok) {
        setLogs([]);
        setNotification({ type: 'success', message: 'All logs cleared successfully' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to clear logs' });
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Protocol filter
      if (protocolFilter !== 'ALL' && log.type !== protocolFilter) return false;

      // Direction filter
      if (directionFilter !== 'ALL' && log.direction !== directionFilter) return false;

      // Station filter
      if (selectedStation !== 'ALL') {
        const st = (log.machineId || '').toLowerCase();
        if (!st.includes(selectedStation.toLowerCase())) return false;
      }

      // Action category filter
      if (actionCategory !== 'ALL') {
        const act = (log.action || '').toLowerCase();
        if (actionCategory === 'STOP' && !act.includes('stop')) return false;
        if (actionCategory === 'START' && !act.includes('start')) return false;
        if (actionCategory === 'METER' && !act.includes('meter')) return false;
        if (actionCategory === 'HEARTBEAT' && !act.includes('heartbeat')) return false;
        if (actionCategory === 'STATUS' && !act.includes('status')) return false;
        if (actionCategory === 'ERROR' && !(act.includes('error') || (log.status || '').toLowerCase().includes('error') || (log.status || '').toLowerCase().includes('reject'))) return false;
      }

      // Text search
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const actionMatch = (log.action || '').toLowerCase().includes(s);
        const stationMatch = (log.machineId || '').toLowerCase().includes(s);
        const idMatch = (log.messageId || '').toLowerCase().includes(s);
        const txMatch = log.transactionId !== undefined && log.transactionId !== null && String(log.transactionId).toLowerCase().includes(s);
        const statusMatch = (log.status || '').toLowerCase().includes(s);
        const payloadMatch = (log.rawMessage || JSON.stringify(log.payload || {})).toLowerCase().includes(s);
        if (!actionMatch && !stationMatch && !idMatch && !txMatch && !statusMatch && !payloadMatch) {
          return false;
        }
      }

      return true;
    });
  }, [logs, protocolFilter, directionFilter, selectedStation, actionCategory, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Statistics
  const ocppCount = useMemo(() => logs.filter((l) => l.type === 'OCPP').length, [logs]);
  const ocpiCount = useMemo(() => logs.filter((l) => l.type === 'OCPI').length, [logs]);
  const stopCount = useMemo(() => logs.filter((l) => (l.action || '').toLowerCase().includes('stop')).length, [logs]);
  const startCount = useMemo(() => logs.filter((l) => (l.action || '').toLowerCase().includes('start')).length, [logs]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Type', 'Protocol', 'Direction', 'MachineId', 'Action', 'ConnectorId', 'TransactionId', 'Status', 'DurationMs', 'MessageId', 'Payload', 'Response'];
    const rows = filteredLogs.map((l) => [
      `"${l.timestamp}"`,
      `"${l.type}"`,
      `"${l.protocol || ''}"`,
      `"${l.direction}"`,
      `"${l.machineId || ''}"`,
      `"${l.action}"`,
      `"${l.connectorId ?? ''}"`,
      `"${l.transactionId ?? ''}"`,
      `"${l.status || ''}"`,
      `"${l.durationMs ?? ''}"`,
      `"${l.messageId || ''}"`,
      `"${JSON.stringify(l.payload || {}).replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.response || {}).replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `satmat_request_response_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to JSON
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `satmat_logs_dump_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container-fluid px-3 px-lg-4 py-4">
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-4 gap-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <h1 className="h3 fw-bold text-dark mb-0">Request & Response Protocol Logs (Tabular)</h1>
            <span className="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1">
              Live Structured Audit
            </span>
          </div>
          <p className="text-secondary small mb-0">
            Real-time, maximum-detail tabular ledger of all OCPP 1.6J WebSocket frames, OCPI 2.0/2.2 roaming calls, and CSMS commands
          </p>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          {/* Live Auto-Refresh Selector */}
          <div className="d-flex align-items-center gap-1.5 bg-white border rounded-2 px-2.5 py-1 small">
            <span
              className="d-inline-block rounded-circle"
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: autoRefreshInterval > 0 ? '#16a34a' : '#9ca3af'
              }}
            />
            <span className="text-secondary fw-semibold">Auto-Refresh:</span>
            <select
              className="form-select form-select-sm border-0 bg-transparent py-0 ps-1 pe-4 fw-medium text-dark"
              style={{ width: 'auto', boxShadow: 'none' }}
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
            >
              <option value={1000}>1 sec</option>
              <option value={2000}>2 sec</option>
              <option value={5000}>5 sec</option>
              <option value={0}>Paused</option>
            </select>
          </div>

          <button
            onClick={() => {
              setLoading(true);
              fetchLogs().finally(() => setLoading(false));
            }}
            className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1.5"
            title="Refresh logs from server"
          >
            <span>🔄</span> {loading ? 'Loading...' : 'Refresh'}
          </button>

          <button
            onClick={handleExportCsv}
            className="btn btn-sm btn-outline-success d-flex align-items-center gap-1"
            title="Export filtered logs as CSV"
          >
            <span>📥</span> CSV
          </button>

          <button
            onClick={handleExportJson}
            className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
            title="Export filtered logs as JSON"
          >
            <span>💾</span> JSON
          </button>

          <button
            onClick={handleClearLogs}
            className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
            title="Clear all stored logs"
          >
            <span>🗑️</span> Clear Logs
          </button>
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

      {/* KPI Stats Ribbon */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="card-satmat p-3 border">
            <span className="text-secondary small d-block">Total Logged Records</span>
            <strong className="fs-4 text-dark">{logs.length}</strong>
            <span className="text-muted small d-block">Persisted in memory & JSON</span>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card-satmat p-3 border">
            <span className="text-secondary small d-block">OCPP 1.6J WebSocket Frames</span>
            <strong className="fs-4 text-primary">{ocppCount}</strong>
            <span className="text-muted small d-block">CALL, CALLRESULT, CALLERROR</span>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card-satmat p-3 border">
            <span className="text-secondary small d-block">Stop Transactions</span>
            <strong className="fs-4 text-danger">{stopCount}</strong>
            <span className="text-muted small d-block">Remote & Station Stopped</span>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card-satmat p-3 border">
            <span className="text-secondary small d-block">Start Transactions</span>
            <strong className="fs-4 text-success">{startCount}</strong>
            <span className="text-muted small d-block">Initiated Charging Cycles</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-satmat p-3 border mb-3">
        <div className="row g-2 align-items-center">
          {/* Quick Search */}
          <div className="col-12 col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light text-muted border-end-0">🔍</span>
              <input
                type="text"
                className="form-control border-start-0"
                placeholder="Search action, machine ID, transaction, payload..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {search && (
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={() => setSearch('')}
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {/* Station Filter */}
          <div className="col-6 col-md-2">
            <select
              className="form-select form-select-sm"
              value={selectedStation}
              onChange={(e) => {
                setSelectedStation(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Stations</option>
              {chargers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                </option>
              ))}
            </select>
          </div>

          {/* Protocol Filter */}
          <div className="col-6 col-md-2">
            <select
              className="form-select form-select-sm"
              value={protocolFilter}
              onChange={(e) => {
                setProtocolFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Protocols</option>
              <option value="OCPP">OCPP 1.6J</option>
              <option value="OCPI">OCPI Roaming</option>
              <option value="SYSTEM">System / Core</option>
            </select>
          </div>

          {/* Direction Filter */}
          <div className="col-6 col-md-2">
            <select
              className="form-select form-select-sm"
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Directions</option>
              <option value="IN">← INCOMING</option>
              <option value="OUT">→ OUTGOING</option>
            </select>
          </div>

          {/* Action Category Filter */}
          <div className="col-6 col-md-2">
            <select
              className="form-select form-select-sm"
              value={actionCategory}
              onChange={(e) => {
                setActionCategory(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Actions</option>
              <option value="STOP">⏹ Stop Transactions</option>
              <option value="START">▶ Start Transactions</option>
              <option value="METER">⚡ Meter Values</option>
              <option value="STATUS">🔄 Status Notifications</option>
              <option value="HEARTBEAT">💓 Heartbeats</option>
              <option value="ERROR">⚠️ Errors & Rejections</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Pill Buttons */}
        <div className="d-flex flex-wrap gap-1.5 mt-2.5 pt-2 border-top">
          <span className="small text-secondary fw-semibold me-1 align-self-center">Quick Filters:</span>
          <button
            onClick={() => {
              setActionCategory('ALL');
              setProtocolFilter('ALL');
              setDirectionFilter('ALL');
              setSearch('');
              setCurrentPage(1);
            }}
            className={`btn btn-sm py-0.5 px-2.5 rounded-pill text-xs fw-semibold ${
              actionCategory === 'ALL' && protocolFilter === 'ALL' && directionFilter === 'ALL' && !search
                ? 'btn-dark'
                : 'btn-outline-secondary'
            }`}
          >
            All ({logs.length})
          </button>
          <button
            onClick={() => {
              setActionCategory('STOP');
              setCurrentPage(1);
            }}
            className={`btn btn-sm py-0.5 px-2.5 rounded-pill text-xs fw-semibold ${
              actionCategory === 'STOP' ? 'btn-danger' : 'btn-outline-danger'
            }`}
          >
            ⏹ Stop ({stopCount})
          </button>
          <button
            onClick={() => {
              setActionCategory('START');
              setCurrentPage(1);
            }}
            className={`btn btn-sm py-0.5 px-2.5 rounded-pill text-xs fw-semibold ${
              actionCategory === 'START' ? 'btn-success' : 'btn-outline-success'
            }`}
          >
            ▶ Start ({startCount})
          </button>
          <button
            onClick={() => {
              setActionCategory('METER');
              setCurrentPage(1);
            }}
            className={`btn btn-sm py-0.5 px-2.5 rounded-pill text-xs fw-semibold ${
              actionCategory === 'METER' ? 'btn-primary' : 'btn-outline-primary'
            }`}
          >
            ⚡ MeterValues
          </button>
          <button
            onClick={() => {
              setProtocolFilter('OCPI');
              setCurrentPage(1);
            }}
            className={`btn btn-sm py-0.5 px-2.5 rounded-pill text-xs fw-semibold ${
              protocolFilter === 'OCPI' ? 'btn-info text-dark' : 'btn-outline-info text-dark'
            }`}
          >
            🌐 OCPI Roaming ({ocpiCount})
          </button>
          <button
            onClick={() => {
              setDirectionFilter('IN');
              setCurrentPage(1);
            }}
            className={`btn btn-sm py-0.5 px-2.5 rounded-pill text-xs fw-semibold ${
              directionFilter === 'IN' ? 'btn-secondary text-white' : 'btn-outline-secondary'
            }`}
          >
            ← Inbound
          </button>
          <button
            onClick={() => {
              setDirectionFilter('OUT');
              setCurrentPage(1);
            }}
            className={`btn btn-sm py-0.5 px-2.5 rounded-pill text-xs fw-semibold ${
              directionFilter === 'OUT' ? 'btn-secondary text-white' : 'btn-outline-secondary'
            }`}
          >
            → Outbound
          </button>
          <button
            onClick={() => {
              setActionCategory('ERROR');
              setCurrentPage(1);
            }}
            className={`btn btn-sm py-0.5 px-2.5 rounded-pill text-xs fw-semibold ${
              actionCategory === 'ERROR' ? 'btn-warning text-dark' : 'btn-outline-warning text-dark'
            }`}
          >
            ⚠️ Errors
          </button>
        </div>
      </div>

      {/* Tabular View with Maximum Details */}
      <div className="card-satmat border overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover table-striped align-middle mb-0 text-xs">
            <thead className="table-light border-bottom text-secondary">
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ width: '135px' }}>Timestamp</th>
                <th style={{ width: '130px' }}>Protocol & Direction</th>
                <th style={{ width: '140px' }}>Station ID</th>
                <th style={{ minWidth: '150px' }}>Action / Command</th>
                <th style={{ width: '110px' }}>Connector / Tx</th>
                <th style={{ width: '110px' }}>Status</th>
                <th style={{ width: '85px' }}>Latency</th>
                <th style={{ minWidth: '220px' }}>Payload Preview / Details</th>
                <th style={{ width: '90px' }} className="text-end pe-3">Inspect</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-5 text-muted">
                    <div className="py-3">
                      <span className="fs-3 d-block mb-1">📭</span>
                      <strong className="d-block text-dark">No request or response logs found</strong>
                      <span className="small text-secondary">
                        {search || protocolFilter !== 'ALL' || directionFilter !== 'ALL' || actionCategory !== 'ALL'
                          ? 'Try adjusting your search criteria or quick filters.'
                          : 'Connect an EV simulator or charger via WebSocket to stream live traffic.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log, index) => {
                  const isOut = log.direction === 'OUT';
                  const actLower = (log.action || '').toLowerCase();
                  const isStop = actLower.includes('stop');
                  const isStart = actLower.includes('start');
                  const isMeter = actLower.includes('meter');
                  const isHeartbeat = actLower.includes('heartbeat');
                  const isStatus = actLower.includes('status');
                  const isError = actLower.includes('error') || (log.status || '').toLowerCase().includes('reject');

                  const rowNum = (currentPage - 1) * pageSize + index + 1;

                  // Format timestamp with milliseconds
                  const dateObj = new Date(log.timestamp);
                  const timeFormatted = !isNaN(dateObj.getTime())
                    ? dateObj.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(dateObj.getMilliseconds()).padStart(3, '0')
                    : log.timestamp;

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      style={{ cursor: 'pointer' }}
                      className={isStop ? 'table-danger-subtle' : isStart ? 'table-success-subtle' : ''}
                    >
                      {/* Index */}
                      <td className="text-muted fw-semibold">{rowNum}</td>

                      {/* Timestamp */}
                      <td>
                        <span className="font-monospace fw-semibold text-dark d-block">
                          {timeFormatted}
                        </span>
                        <span className="text-muted text-xxs">
                          {!isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : ''}
                        </span>
                      </td>

                      {/* Protocol & Direction */}
                      <td>
                        <div className="d-flex align-items-center gap-1">
                          <span
                            className={`badge px-1.5 py-0.5 rounded ${
                              isOut ? 'bg-warning text-dark' : 'bg-success text-white'
                            }`}
                          >
                            {isOut ? '→ OUT' : '← IN'}
                          </span>
                          <span
                            className={`badge px-1.5 py-0.5 rounded ${
                              log.type === 'OCPI' ? 'bg-info text-dark' : log.type === 'SYSTEM' ? 'bg-secondary' : 'bg-primary'
                            }`}
                          >
                            {log.protocol || log.type}
                          </span>
                        </div>
                      </td>

                      {/* Station ID */}
                      <td>
                        <span className="fw-bold text-dark font-monospace">
                          {log.machineId || 'N/A'}
                        </span>
                        {log.ip && (
                          <span className="text-muted d-block text-xxs">{log.ip}</span>
                        )}
                      </td>

                      {/* Action / Command */}
                      <td>
                        <div className="d-flex align-items-center gap-1">
                          {isStop && <span className="text-danger fw-bold">⏹</span>}
                          {isStart && <span className="text-success fw-bold">▶</span>}
                          {isMeter && <span className="text-primary fw-bold">⚡</span>}
                          {isHeartbeat && <span className="text-danger-emphasis">💓</span>}
                          {isStatus && <span className="text-secondary">🔄</span>}
                          <strong
                            className={
                              isStop
                                ? 'text-danger fw-bold'
                                : isStart
                                ? 'text-success fw-bold'
                                : isError
                                ? 'text-danger'
                                : 'text-dark'
                            }
                          >
                            {log.action}
                          </strong>
                        </div>
                        {log.messageId && (
                          <span className="text-muted font-monospace text-xxs d-block" title={log.messageId}>
                            ID: {log.messageId.length > 24 ? log.messageId.substring(0, 24) + '...' : log.messageId}
                          </span>
                        )}
                      </td>

                      {/* Connector / Tx ID */}
                      <td>
                        {log.connectorId !== undefined && log.connectorId !== null && (
                          <span className="badge bg-secondary-subtle text-secondary me-1">
                            Conn #{log.connectorId}
                          </span>
                        )}
                        {log.transactionId !== undefined && log.transactionId !== null && (
                          <span className="badge bg-primary-subtle text-primary fw-bold">
                            Tx #{log.transactionId}
                          </span>
                        )}
                        {log.connectorId === null && log.transactionId === null && (
                          <span className="text-muted">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`badge ${
                            log.status === 'Accepted' || log.status === 'Success' || log.status === 'Completed' || (log.status || '').includes('200')
                              ? 'bg-success text-white'
                              : (log.status || '').includes('Error') || (log.status || '').includes('Reject')
                              ? 'bg-danger text-white'
                              : log.status === 'Dispatched'
                              ? 'bg-warning text-dark'
                              : 'bg-secondary text-white'
                          }`}
                        >
                          {log.status || 'OK'}
                        </span>
                      </td>

                      {/* Latency */}
                      <td>
                        {log.durationMs !== undefined && log.durationMs !== null ? (
                          <span className={`fw-semibold ${log.durationMs > 1000 ? 'text-warning' : 'text-success'}`}>
                            {log.durationMs}ms
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>

                      {/* Payload Preview */}
                      <td className="font-monospace text-secondary" style={{ maxWidth: '300px' }}>
                        <div className="text-truncate">
                          {log.details?.meterStop !== undefined && (
                            <span className="badge bg-danger-subtle text-danger me-1">
                              meterStop: {log.details.meterStop}
                            </span>
                          )}
                          {log.details?.meterStart !== undefined && (
                            <span className="badge bg-success-subtle text-success me-1">
                              meterStart: {log.details.meterStart}
                            </span>
                          )}
                          {log.details?.reason && (
                            <span className="badge bg-light text-dark border me-1">
                              reason: {log.details.reason}
                            </span>
                          )}
                          {log.details?.idTag && (
                            <span className="badge bg-light text-dark border me-1">
                              idTag: {log.details.idTag}
                            </span>
                          )}
                          <span>
                            {typeof log.payload === 'object'
                              ? JSON.stringify(log.payload)
                              : String(log.payload || '')}
                          </span>
                        </div>
                      </td>

                      {/* Inspect Button */}
                      <td className="text-end pe-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="btn btn-xs btn-outline-secondary py-0.5 px-2 text-xxs fw-semibold"
                        >
                          Inspect 👁️
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Footer Controls */}
        <div className="p-3 bg-light border-top d-flex flex-wrap align-items-center justify-content-between gap-2 text-secondary small">
          <div className="d-flex align-items-center gap-2">
            <span>Rows per page:</span>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Showing {filteredLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} entries
            </span>
          </div>

          <div className="d-flex align-items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="btn btn-sm btn-outline-secondary py-0.5 px-2"
            >
              &larr; Prev
            </button>
            <span className="px-2 fw-semibold text-dark">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="btn btn-sm btn-outline-secondary py-0.5 px-2"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Inspect Modal: Full Maximum Detail View */}
      {selectedLog && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-satmat-light border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <span
                    className={`badge ${
                      selectedLog.direction === 'OUT' ? 'bg-warning text-dark' : 'bg-success text-white'
                    }`}
                  >
                    {selectedLog.direction === 'OUT' ? '→ OUTGOING' : '← INCOMING'}
                  </span>
                  <span className="badge bg-primary">{selectedLog.protocol || selectedLog.type}</span>
                  <h5 className="modal-title fw-bold text-dark mb-0 font-monospace">
                    {selectedLog.action}
                  </h5>
                </div>
                <button type="button" className="btn-close" onClick={() => setSelectedLog(null)}></button>
              </div>

              <div className="modal-body p-4">
                {/* Meta details grid */}
                <div className="row g-2 mb-3 bg-light p-3 rounded-3 border text-xs">
                  <div className="col-6 col-md-4">
                    <span className="text-secondary d-block">Station / Machine ID:</span>
                    <strong className="text-dark font-monospace">{selectedLog.machineId || 'N/A'}</strong>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-secondary d-block">Timestamp (Precise):</span>
                    <strong className="text-dark font-monospace">{selectedLog.timestamp}</strong>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-secondary d-block">Status:</span>
                    <span className="badge bg-success text-white">{selectedLog.status || 'OK'}</span>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-secondary d-block">Connector ID:</span>
                    <strong className="text-dark">{selectedLog.connectorId ?? 'N/A'}</strong>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-secondary d-block">Transaction ID:</span>
                    <strong className="text-primary font-monospace">{selectedLog.transactionId ?? 'N/A'}</strong>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-secondary d-block">Latency (Roundtrip):</span>
                    <strong className="text-success">{selectedLog.durationMs !== undefined ? `${selectedLog.durationMs} ms` : 'N/A'}</strong>
                  </div>
                  <div className="col-12 col-md-8">
                    <span className="text-secondary d-block">Unique Message ID (UID):</span>
                    <code className="text-dark font-monospace text-xs">{selectedLog.messageId || 'N/A'}</code>
                  </div>
                  <div className="col-12 col-md-4">
                    <span className="text-secondary d-block">IP Address:</span>
                    <span className="font-monospace text-dark">{selectedLog.ip || '127.0.0.1'}</span>
                  </div>
                </div>

                {/* Additional Details (meterStop, reason, idTag) */}
                {selectedLog.details && Object.keys(selectedLog.details).some((k) => selectedLog.details![k] !== undefined) && (
                  <div className="mb-3 p-3 bg-satmat-light rounded-3 border border-success-subtle">
                    <h6 className="small fw-bold text-success mb-2">⚡ Extracted Parameters:</h6>
                    <div className="d-flex flex-wrap gap-2 text-xs">
                      {Object.entries(selectedLog.details).map(([key, val]) => {
                        if (val === undefined || val === null) return null;
                        return (
                          <div key={key} className="p-1.5 px-2.5 bg-white border rounded">
                            <span className="text-secondary me-1">{key}:</span>
                            <strong className="text-dark font-monospace">{String(val)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Request / Message Payload */}
                <div className="mb-3">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <strong className="small text-secondary fw-semibold">
                      📄 Message / Request Payload:
                    </strong>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(selectedLog.payload, null, 2), 'payload')}
                      className="btn btn-xs btn-outline-secondary py-0.5 px-2 text-xxs"
                    >
                      {copiedKey === 'payload' ? '✓ Copied' : '📋 Copy JSON'}
                    </button>
                  </div>
                  <pre
                    className="bg-dark text-light p-3 rounded-3 font-monospace small overflow-auto mb-0"
                    style={{ maxHeight: '200px', fontSize: '11.5px' }}
                  >
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </pre>
                </div>

                {/* Response Payload (if available) */}
                {selectedLog.response && (
                  <div className="mb-3">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <strong className="small text-secondary fw-semibold">
                        📥 Response Payload:
                      </strong>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(selectedLog.response, null, 2), 'response')}
                        className="btn btn-xs btn-outline-secondary py-0.5 px-2 text-xxs"
                      >
                        {copiedKey === 'response' ? '✓ Copied' : '📋 Copy Response'}
                      </button>
                    </div>
                    <pre
                      className="bg-dark text-success-emphasis p-3 rounded-3 font-monospace small overflow-auto mb-0"
                      style={{ maxHeight: '180px', fontSize: '11.5px', backgroundColor: '#0f172a' }}
                    >
                      {JSON.stringify(selectedLog.response, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Raw Wire Frame */}
                {selectedLog.rawMessage && (
                  <div>
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <strong className="small text-secondary fw-semibold">
                        🔌 Raw Wire Message Frame:
                      </strong>
                      <button
                        onClick={() => copyToClipboard(selectedLog.rawMessage || '', 'raw')}
                        className="btn btn-xs btn-outline-secondary py-0.5 px-2 text-xxs"
                      >
                        {copiedKey === 'raw' ? '✓ Copied' : '📋 Copy Raw'}
                      </button>
                    </div>
                    <pre
                      className="bg-light text-dark p-2.5 rounded-2 font-monospace border overflow-auto mb-0"
                      style={{ maxHeight: '100px', fontSize: '11px' }}
                    >
                      {selectedLog.rawMessage}
                    </pre>
                  </div>
                )}
              </div>

              <div className="modal-footer border-top bg-light py-2">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setSelectedLog(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
