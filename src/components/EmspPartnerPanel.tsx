import React, { useState } from 'react';
import { Charger, OcpiPartner, Tariff } from '../types/index.js';

interface EmspPartnerPanelProps {
  chargers: Charger[];
  partners: OcpiPartner[];
  tariffs: Tariff[];
  onRefresh: () => void;
}

export const EmspPartnerPanel: React.FC<EmspPartnerPanelProps> = ({
  chargers,
  partners,
  tariffs,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'console' | 'docs' | 'cdrs'>('console');

  // External eMSP Simulation Configuration
  const [ocpiBaseUrl, setOcpiBaseUrl] = useState<string>(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://evcharger.satmatgroup.com';
    return `${origin}/ocpi/2.2.1`;
  });
  const [authToken, setAuthToken] = useState<string>('b2c3d4e5-token-b-satmat-2026');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('partner-smv-live');
  const [partyId, setPartyId] = useState<string>('SMV');
  const [countryCode, setCountryCode] = useState<string>('IN');

  // Execution states
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Inspector & Live Data
  const [lastExchange, setLastExchange] = useState<{
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody?: any;
    status: number;
    statusText: string;
    durationMs: number;
    ocpiStatusCode?: number;
    responseBody: any;
    timestamp: string;
  } | null>(null);

  const [discoveredLocations, setDiscoveredLocations] = useState<any[] | null>(null);
  const [discoveredTariffs, setDiscoveredTariffs] = useState<any[] | null>(null);
  const [discoveredSessions, setDiscoveredSessions] = useState<any[] | null>(null);
  const [discoveredCdrs, setDiscoveredCdrs] = useState<any[] | null>(null);
  const [tokenAuthResult, setTokenAuthResult] = useState<any | null>(null);

  // Quick inputs
  const [testTokenUid, setTestTokenUid] = useState<string>('RFID-SMV-USER-01');
  const [testLocationId, setTestLocationId] = useState<string>(chargers[0]?.id || 'SATMAT-EV-001');

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    const p = partners.find((item) => item.id === partnerId);
    if (p) {
      setAuthToken(p.tokenB || 'b2c3d4e5-token-b-satmat-2026');
      setPartyId(p.partyId);
      setCountryCode(p.countryCode);
    }
  };

  // Generic executor that uses our secure test proxy against live CPO endpoints
  const executeOcpiCall = async (
    targetUrl: string,
    method: 'GET' | 'POST' = 'GET',
    payload?: any,
    actionKey = 'request'
  ) => {
    setLoadingAction(actionKey);
    setNotification(null);
    const startMs = Date.now();

    try {
      const res = await fetch('/api/ocpi/test-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          method,
          token: authToken,
          partyId,
          countryCode,
          body: payload
        })
      });

      const json = await res.json();
      const durationMs = json.durationMs || Date.now() - startMs;

      setLastExchange({
        method,
        url: targetUrl,
        requestHeaders: {
          Authorization: `Token ${authToken}`,
          'Content-Type': 'application/json',
          'X-Correlation-ID': `req-emsp-${Date.now()}`
        },
        requestBody: payload,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        ocpiStatusCode: json.response?.status_code || json.ocpiStatusCode,
        responseBody: json.response || json,
        timestamp: new Date().toLocaleTimeString()
      });

      if (res.ok && json.ok !== false) {
        onRefresh();
        return json.response?.data || json.response || json;
      } else {
        const errorMsg = json.response?.status_message || json.error || 'OCPI Request Failed';
        setNotification({
          type: 'error',
          message: `OCPI Response (${json.response?.status_code || res.status}): ${errorMsg}`
        });
        return null;
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: `Network Execution Error: ${err.message}`
      });
      return null;
    } finally {
      setLoadingAction(null);
    }
  };

  // 1. Discover Chargers & EVSEs (Official OCPI 2.2.1 Locations Module)
  const handleDiscoverChargers = async () => {
    const url = `${ocpiBaseUrl}/locations`.replace('/ocpi/2.2.1/locations', '/ocpi/cpo/2.2.1/locations');
    const data = await executeOcpiCall(url, 'GET', undefined, 'discover-chargers');
    if (data && Array.isArray(data)) {
      setDiscoveredLocations(data);
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 GET /locations] Discovered ${data.length} CPO station(s) with live EVSE & connector statuses.`
      });
    } else if (data) {
      setDiscoveredLocations([data]);
      setNotification({
        type: 'success',
        message: '[OCPI 2.2.1 GET /locations] Discovered CPO station locations successfully.'
      });
    }
  };

  // 2. Retrieve Specific Charger / EVSE Information
  const handleGetLocationDetails = async (locationId: string) => {
    const url = `${ocpiBaseUrl}/locations/${locationId}`.replace('/ocpi/2.2.1/locations', '/ocpi/cpo/2.2.1/locations');
    const data = await executeOcpiCall(url, 'GET', undefined, `get-location-${locationId}`);
    if (data) {
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 GET /locations/${locationId}] Retrieved EVSE and Connector specifications for station ${locationId}.`
      });
    }
  };

  // 3. Retrieve Tariffs
  const handleRetrieveTariffs = async () => {
    const url = `${ocpiBaseUrl}/tariffs`.replace('/ocpi/2.2.1/tariffs', '/ocpi/cpo/2.2.1/tariffs');
    const data = await executeOcpiCall(url, 'GET', undefined, 'retrieve-tariffs');
    if (data) {
      const list = Array.isArray(data) ? data : [data];
      setDiscoveredTariffs(list);
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 GET /tariffs] Retrieved ${list.length} dynamic roaming tariff rule(s) for eMSP [${partyId}].`
      });
    }
  };

  // 4. Authorize User / Token (Official OCPI 2.2.1 Real-Time Authorization)
  const handleAuthorizeToken = async () => {
    const url = `${ocpiBaseUrl}/tokens/${testTokenUid}/authorize?type=RFID`.replace('/ocpi/2.2.1/tokens', '/ocpi/cpo/2.2.1/tokens');
    const payload = {
      location_references: [
        {
          location_id: testLocationId,
          evse_uids: [`${testLocationId}-EVSE-1`]
        }
      ]
    };
    const data = await executeOcpiCall(url, 'POST', payload, 'authorize-token');
    if (data) {
      setTokenAuthResult(data);
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 POST /tokens/authorize] Token "${testTokenUid}" authorized: ${data.allowed || 'ALLOWED'}. Reference: ${data.authorization_reference || 'AUTH-OK'}`
      });
    }
  };

  // 5. Start Charging (Official OCPI 2.2.1 Commands Module)
  const handleStartCharging = async (locationId: string, evseUid: string, connectorId: number) => {
    const url = `${ocpiBaseUrl}/commands/START_SESSION`.replace('/ocpi/2.2.1/commands', '/ocpi/cpo/2.2.1/commands');
    const payload = {
      response_url: `https://external-emsp.com/ocpi/cpo/2.2.1/commands/START_SESSION/callback`,
      token: {
        country_code: countryCode,
        party_id: partyId,
        uid: testTokenUid,
        type: 'RFID',
        contract_id: `IN-${partyId}-${testTokenUid}`,
        visual_number: testTokenUid,
        issuer: `${partyId} External eMSP`,
        valid: true,
        whitelist: 'ALLOWED'
      },
      location_id: locationId,
      evse_uid: evseUid,
      connector_id: connectorId,
      authorization_reference: `AUTH-${partyId}-${Date.now().toString(36).toUpperCase()}`
    };

    const res = await executeOcpiCall(url, 'POST', payload, `start-${locationId}-${connectorId}`);
    if (res && res.result === 'ACCEPTED') {
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 START_SESSION ACCEPTED] Remote start dispatched to station [${locationId}] connector #${connectorId}. Station is now CHARGING!`
      });
      handleDiscoverChargers();
      onRefresh();
    }
  };

  // 6. Stop Charging (Official OCPI 2.2.1 Commands Module)
  const handleStopCharging = async (sessionIdOrTxId: string | number, locationId?: string) => {
    const url = `${ocpiBaseUrl}/commands/STOP_SESSION`.replace('/ocpi/2.2.1/commands', '/ocpi/cpo/2.2.1/commands');
    const payload = {
      response_url: `https://external-emsp.com/ocpi/cpo/2.2.1/commands/STOP_SESSION/callback`,
      session_id: String(sessionIdOrTxId),
      location_id: locationId
    };

    const res = await executeOcpiCall(url, 'POST', payload, `stop-${sessionIdOrTxId}`);
    if (res && res.result === 'ACCEPTED') {
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 STOP_SESSION ACCEPTED] Session ${sessionIdOrTxId} stopped. Connector released to Available and CDR generated!`
      });
      handleDiscoverChargers();
      onRefresh();
    }
  };

  // 7. Receive Session Information
  const handleReceiveSessions = async () => {
    const url = `${ocpiBaseUrl}/sessions`.replace('/ocpi/2.2.1/sessions', '/ocpi/cpo/2.2.1/sessions');
    const data = await executeOcpiCall(url, 'GET', undefined, 'receive-sessions');
    if (data) {
      const list = Array.isArray(data) ? data : [data];
      setDiscoveredSessions(list);
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 GET /sessions] Retrieved ${list.length} charging session record(s) with live energy & cost.`
      });
    }
  };

  // 8. Retrieve Completed Records (CDRs)
  const handleRetrieveCdrs = async () => {
    const url = `${ocpiBaseUrl}/cdrs`.replace('/ocpi/2.2.1/cdrs', '/ocpi/cpo/2.2.1/cdrs');
    const data = await executeOcpiCall(url, 'GET', undefined, 'retrieve-cdrs');
    if (data) {
      const list = Array.isArray(data) ? data : [data];
      setDiscoveredCdrs(list);
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 GET /cdrs] Retrieved ${list.length} Charge Detail Record(s) for billing and invoicing.`
      });
    }
  };

  // Handshake test
  const handleCredentialsHandshake = async () => {
    const url = `${ocpiBaseUrl}/credentials`.replace('/ocpi/2.2.1/credentials', '/ocpi/cpo/2.2.1/credentials');
    const data = await executeOcpiCall(url, 'GET', undefined, 'credentials-handshake');
    if (data) {
      setNotification({
        type: 'success',
        message: `[OCPI 2.2.1 GET /credentials] CPO credentials confirmed: Party ${data.party_id} (${data.country_code}), Role: CPO.`
      });
    }
  };

  const copyFullOnboardingDetails = () => {
    const domain = window.location.origin;
    const text = `=== SATMAT EV CPO - EXTERNAL eMSP ONBOARDING PACKAGE ===
Protocol: OCPI 2.2.1 (Official CPO Interface)
Role: Charge Point Operator (CPO)
CPO Party ID: SMT
CPO Country Code: IN
Operator Name: SATMAT EV Charging Network

1. BASE URLS:
- Versions URL: ${domain}/ocpi/versions
- Version Details URL: ${domain}/ocpi/2.2.1
- CPO Module Endpoints Base: ${domain}/ocpi/cpo/2.2.1

2. AUTHENTICATION:
- Authorization Header: Authorization: Token ${authToken}
- Partner Party ID: ${partyId}
- Partner Country Code: ${countryCode}

3. PRIMARY ENDPOINTS FOR eMSP:
- Discover Chargers / EVSEs: GET ${domain}/ocpi/cpo/2.2.1/locations
- Retrieve Tariffs: GET ${domain}/ocpi/cpo/2.2.1/tariffs
- Authorize User / Token: POST ${domain}/ocpi/cpo/2.2.1/tokens/{token_uid}/authorize?type=RFID
- Remote Start Charging: POST ${domain}/ocpi/cpo/2.2.1/commands/START_SESSION
- Remote Stop Charging: POST ${domain}/ocpi/cpo/2.2.1/commands/STOP_SESSION
- Receive Active Sessions: GET ${domain}/ocpi/cpo/2.2.1/sessions
- Retrieve Completed CDRs: GET ${domain}/ocpi/cpo/2.2.1/cdrs
- Credentials Handshake: POST ${domain}/ocpi/cpo/2.2.1/credentials
======================================================`;
    handleCopy(text, 'full-onboarding');
  };

  return (
    <div className="container-fluid px-3 px-lg-4 py-4">
      {/* CPO Role Architecture Clarity Banner */}
      <div className="card-satmat border-0 shadow-sm p-4 mb-4 bg-white border-start border-4 border-success">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div>
            <div className="d-flex align-items-center gap-2 mb-1">
              <span className="badge bg-success text-white px-2.5 py-1">CPO SYSTEM</span>
              <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-0.5">
                OCPI 2.2.1 Compliant
              </span>
              <span className="badge bg-light text-muted border px-2 py-0.5">
                Our System Owns &amp; Operates EV Chargers
              </span>
            </div>
            <h1 className="h4 fw-bold text-dark mb-1">
              External eMSP Integration Sandbox &amp; Compliance Suite
            </h1>
            <p className="text-secondary small mb-0">
              <strong>Our application is NOT an eMSP panel.</strong> Our application is the CPO-side OCPI system that owns and manages the physical EV chargers/EVSEs. A separate external company operates the eMSP platform. This test suite verifies how the external eMSP integrates with our CPO APIs using the Base URL and Token we provide them.
            </p>
          </div>

          <div className="d-flex gap-2">
            <button
              onClick={copyFullOnboardingDetails}
              className="btn btn-satmat btn-sm shadow-sm px-3"
            >
              {copiedKey === 'full-onboarding' ? '✓ Copied Details!' : '📋 Copy eMSP Onboarding Package'}
            </button>
            <button
              onClick={() => setActiveTab(activeTab === 'console' ? 'docs' : 'console')}
              className="btn btn-satmat-outline btn-sm shadow-sm px-3"
            >
              {activeTab === 'console' ? '📖 API Docs & cURL Library' : '🧪 Interactive Test Console'}
            </button>
          </div>
        </div>
      </div>

      {/* Prominent Card: Credentials Provided to External eMSP Company */}
      <div className="card-satmat p-3 border mb-4 bg-satmat-light border-success-subtle">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-success text-white">CONNECTION CREDENTIALS</span>
            <strong className="text-dark small">Information Provided to External eMSP Company</strong>
          </div>
          <div className="d-flex align-items-center gap-2">
            <label className="text-muted small mb-0">Select Partner:</label>
            <select
              className="form-select form-select-sm py-0.5 px-2 bg-white"
              style={{ width: 'auto' }}
              value={selectedPartnerId}
              onChange={(e) => handlePartnerSelect(e.target.value)}
            >
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.partyId})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row g-2 small font-monospace">
          <div className="col-12 col-md-6 col-lg-3">
            <div className="p-2.5 bg-white rounded border h-100">
              <span className="text-muted d-block" style={{ fontSize: '10px' }}>1. OUR OCPI BASE URL:</span>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-dark fw-bold text-truncate me-1" title={`${ocpiBaseUrl}`}>
                  {ocpiBaseUrl}
                </span>
                <button
                  onClick={() => handleCopy(ocpiBaseUrl, 'box-base')}
                  className="btn btn-link btn-sm p-0 text-success text-decoration-none fw-semibold"
                >
                  {copiedKey === 'box-base' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <div className="p-2.5 bg-white rounded border h-100">
              <span className="text-muted d-block" style={{ fontSize: '10px' }}>2. VERSIONS URL:</span>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-success fw-bold text-truncate me-1" title={`${ocpiBaseUrl.replace('/2.2.1', '')}/versions`}>
                  {ocpiBaseUrl.replace('/2.2.1', '')}/versions
                </span>
                <button
                  onClick={() => handleCopy(`${ocpiBaseUrl.replace('/2.2.1', '')}/versions`, 'box-ver')}
                  className="btn btn-link btn-sm p-0 text-success text-decoration-none fw-semibold"
                >
                  {copiedKey === 'box-ver' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <div className="p-2.5 bg-white rounded border h-100">
              <span className="text-muted d-block" style={{ fontSize: '10px' }}>3. OCPI TOKEN (TOKEN B):</span>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-primary fw-bold text-truncate me-1" title={authToken}>
                  {authToken}
                </span>
                <button
                  onClick={() => handleCopy(authToken, 'box-tok')}
                  className="btn btn-link btn-sm p-0 text-success text-decoration-none fw-semibold"
                >
                  {copiedKey === 'box-tok' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <div className="p-2.5 bg-white rounded border h-100">
              <span className="text-muted d-block" style={{ fontSize: '10px' }}>4. AUTH HEADER &amp; ROLE:</span>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-dark fw-bold text-truncate me-1">
                  Authorization: Token &lt;token&gt; [CPO]
                </span>
                <button
                  onClick={() => handleCopy(`Authorization: Token ${authToken}`, 'box-hdr')}
                  className="btn btn-link btn-sm p-0 text-success text-decoration-none fw-semibold"
                >
                  {copiedKey === 'box-hdr' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {notification && (
        <div
          className={`alert ${
            notification.type === 'success'
              ? 'alert-success'
              : notification.type === 'info'
              ? 'alert-info'
              : 'alert-danger'
          } alert-dismissible fade show small py-2.5 px-3 rounded-3 mb-4 shadow-sm`}
        >
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <span>{notification.type === 'success' ? '✅' : notification.type === 'info' ? 'ℹ️' : '⚠️'}</span>
              <strong>{notification.message}</strong>
            </div>
            <button type="button" className="btn-close py-2" onClick={() => setNotification(null)}></button>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      {activeTab === 'console' ? (
        <div className="row g-4">
          {/* Left Column: 8 OCPI 2.2.1 Capabilities Trigger Panel */}
          <div className="col-12 col-xl-5">
            <div className="card-satmat p-4 border h-100">
              <div className="d-flex align-items-center justify-content-between pb-3 mb-3 border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <span className="p-2 rounded bg-success-subtle text-success">⚡</span>
                  <div>
                    <h2 className="h6 fw-bold text-dark mb-0">OCPI 2.2.1 CPO Integration Test Suite</h2>
                    <span className="text-muted small">8 Required Capabilities for External eMSP Integration</span>
                  </div>
                </div>
                <span className="badge bg-success text-white">LIVE SERVER</span>
              </div>

              {/* Action Buttons Matrix */}
              <div className="d-grid gap-2 mb-4">
                {/* 1. Discover Chargers */}
                <div className="p-2.5 border rounded-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong className="text-dark small">1. Discover Chargers &amp; EVSEs</strong>
                    <span className="badge bg-success-subtle text-success font-monospace">GET /locations</span>
                  </div>
                  <p className="text-muted small mb-2" style={{ fontSize: '11px' }}>
                    External eMSP discovers all physical chargers, EVSEs, and real-time connector availability.
                  </p>
                  <button
                    onClick={handleDiscoverChargers}
                    disabled={loadingAction === 'discover-chargers'}
                    className="btn btn-satmat btn-sm w-100 py-1.5 fw-semibold"
                  >
                    {loadingAction === 'discover-chargers' ? 'Querying Locations...' : '⚡ Discover Chargers (GET /locations)'}
                  </button>
                </div>

                {/* 2. Retrieve Specific Charger Information */}
                <div className="p-2.5 border rounded-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong className="text-dark small">2. Retrieve Charger / EVSE Info</strong>
                    <span className="badge bg-success-subtle text-success font-monospace">GET /locations/:id</span>
                  </div>
                  <div className="d-flex gap-2 mb-2">
                    <select
                      className="form-select form-select-sm"
                      value={testLocationId}
                      onChange={(e) => setTestLocationId(e.target.value)}
                    >
                      {chargers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => handleGetLocationDetails(testLocationId)}
                    disabled={loadingAction === `get-location-${testLocationId}`}
                    className="btn btn-satmat-outline btn-sm w-100 py-1.5"
                  >
                    {loadingAction === `get-location-${testLocationId}` ? 'Fetching Details...' : `🔍 Retrieve Location Info (${testLocationId})`}
                  </button>
                </div>

                {/* 3. Retrieve Tariffs */}
                <div className="p-2.5 border rounded-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong className="text-dark small">3. Retrieve Tariffs &amp; Pricing</strong>
                    <span className="badge bg-success-subtle text-success font-monospace">GET /tariffs</span>
                  </div>
                  <p className="text-muted small mb-2" style={{ fontSize: '11px' }}>
                    External eMSP retrieves dynamic rate cards (Energy kWh, Connection Flat Fee, Idle Minute Fee).
                  </p>
                  <button
                    onClick={handleRetrieveTariffs}
                    disabled={loadingAction === 'retrieve-tariffs'}
                    className="btn btn-satmat btn-sm w-100 py-1.5 fw-semibold"
                  >
                    {loadingAction === 'retrieve-tariffs' ? 'Fetching Tariffs...' : '💰 Retrieve Tariffs (GET /tariffs)'}
                  </button>
                </div>

                {/* 4. Authorize Users / Tokens */}
                <div className="p-2.5 border rounded-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong className="text-dark small">4. Authorize User / Token</strong>
                    <span className="badge bg-primary-subtle text-primary font-monospace">POST /tokens/:id/authorize</span>
                  </div>
                  <div className="mb-2">
                    <input
                      type="text"
                      className="form-control form-control-sm font-monospace"
                      value={testTokenUid}
                      onChange={(e) => setTestTokenUid(e.target.value)}
                      placeholder="e.g. RFID-SMV-USER-01"
                    />
                  </div>
                  <button
                    onClick={handleAuthorizeToken}
                    disabled={loadingAction === 'authorize-token'}
                    className="btn btn-satmat-outline btn-sm w-100 py-1.5"
                  >
                    {loadingAction === 'authorize-token' ? 'Authorizing Token...' : '🔑 Authorize Token (Real-Time Authorization)'}
                  </button>
                </div>

                {/* 5 & 6: Start & Stop Charging Session */}
                <div className="p-2.5 border rounded-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong className="text-dark small">5 &amp; 6. Remote Start / Stop Session</strong>
                    <span className="badge bg-warning-subtle text-dark font-monospace">POST /commands/*</span>
                  </div>
                  <p className="text-muted small mb-2" style={{ fontSize: '11px' }}>
                    External eMSP dispatches remote commands. Our CPO executes on the charger via OCPP.
                  </p>
                  <div className="d-flex gap-2">
                    <button
                      onClick={() => handleStartCharging(testLocationId, `${testLocationId}-EVSE-1`, 1)}
                      disabled={loadingAction?.startsWith('start-')}
                      className="btn btn-success btn-sm flex-grow-1 py-1.5 fw-semibold"
                    >
                      ▶️ Start Charging
                    </button>
                    <button
                      onClick={() => handleStopCharging('sess-active', testLocationId)}
                      disabled={loadingAction?.startsWith('stop-')}
                      className="btn btn-danger btn-sm flex-grow-1 py-1.5 fw-semibold"
                    >
                      ⏹️ Stop Charging
                    </button>
                  </div>
                </div>

                {/* 7. Receive Session Information */}
                <div className="p-2.5 border rounded-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong className="text-dark small">7. Receive Session Telemetry</strong>
                    <span className="badge bg-success-subtle text-success font-monospace">GET /sessions</span>
                  </div>
                  <button
                    onClick={handleReceiveSessions}
                    disabled={loadingAction === 'receive-sessions'}
                    className="btn btn-satmat btn-sm w-100 py-1.5 fw-semibold"
                  >
                    {loadingAction === 'receive-sessions' ? 'Fetching Sessions...' : '📊 Receive Active Sessions (GET /sessions)'}
                  </button>
                </div>

                {/* 8. Retrieve Completed Records (CDRs) */}
                <div className="p-2.5 border rounded-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong className="text-dark small">8. Retrieve Completed CDRs</strong>
                    <span className="badge bg-success-subtle text-success font-monospace">GET /cdrs</span>
                  </div>
                  <button
                    onClick={handleRetrieveCdrs}
                    disabled={loadingAction === 'retrieve-cdrs'}
                    className="btn btn-satmat btn-sm w-100 py-1.5 fw-semibold"
                  >
                    {loadingAction === 'retrieve-cdrs' ? 'Fetching CDRs...' : '🧾 Retrieve Completed CDRs (GET /cdrs)'}
                  </button>
                </div>

                {/* Credentials Handshake */}
                <button
                  onClick={handleCredentialsHandshake}
                  disabled={loadingAction === 'credentials-handshake'}
                  className="btn btn-light btn-sm text-secondary border mt-1"
                >
                  🤝 Verify CPO Credentials Handshake (GET /credentials)
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Request / Response Inspector */}
          <div className="col-12 col-xl-7">
            <div className="card-satmat p-4 border h-100 d-flex flex-column">
              <div className="d-flex align-items-center justify-content-between pb-3 mb-3 border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <span className="p-2 rounded bg-primary-subtle text-primary">📡</span>
                  <div>
                    <h2 className="h6 fw-bold text-dark mb-0">Live OCPI 2.2.1 Protocol Inspector</h2>
                    <span className="text-muted small">Real-time HTTP wire payload exchange</span>
                  </div>
                </div>
                {lastExchange && (
                  <span
                    className={`badge ${
                      lastExchange.status < 300 ? 'bg-success' : 'bg-danger'
                    } text-white font-monospace`}
                  >
                    {lastExchange.status} {lastExchange.statusText} ({lastExchange.durationMs}ms)
                  </span>
                )}
              </div>

              {lastExchange ? (
                <div className="flex-grow-1 d-flex flex-column gap-3">
                  {/* Exchange Metadata */}
                  <div className="p-2.5 bg-light rounded border small">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="badge bg-dark font-monospace">{lastExchange.method}</span>
                      <code className="text-dark fw-bold text-truncate mx-2 flex-grow-1 font-monospace">
                        {lastExchange.url}
                      </code>
                      <span className="text-muted small">{lastExchange.timestamp}</span>
                    </div>
                    <div className="d-flex gap-3 text-muted small mt-1">
                      <span>
                        OCPI Status: <strong className="text-success">{lastExchange.ocpiStatusCode || 1000}</strong>
                      </span>
                      <span>
                        Roundtrip: <strong>{lastExchange.durationMs}ms</strong>
                      </span>
                    </div>
                  </div>

                  {/* Request Headers */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="small fw-semibold text-secondary">Request Headers Sent by eMSP:</span>
                    </div>
                    <pre className="p-2.5 rounded bg-dark text-light small font-monospace mb-0" style={{ fontSize: '11px' }}>
                      {Object.entries(lastExchange.requestHeaders)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\n')}
                    </pre>
                  </div>

                  {/* Request Body if present */}
                  {lastExchange.requestBody && (
                    <div>
                      <span className="small fw-semibold text-secondary d-block mb-1">Request Payload:</span>
                      <pre className="p-2.5 rounded bg-dark text-info small font-monospace mb-0" style={{ fontSize: '11px', maxHeight: '160px', overflowY: 'auto' }}>
                        {JSON.stringify(lastExchange.requestBody, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Response Body */}
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="small fw-semibold text-secondary">
                        CPO Response (Official OCPI 2.2.1 Format):
                      </span>
                      <button
                        onClick={() => handleCopy(JSON.stringify(lastExchange.responseBody, null, 2), 'resp-body')}
                        className="btn btn-link btn-sm p-0 text-success text-decoration-none small"
                      >
                        {copiedKey === 'resp-body' ? '✓ Copied' : 'Copy JSON'}
                      </button>
                    </div>
                    <pre
                      className="p-3 rounded bg-dark text-success small font-monospace mb-0"
                      style={{ fontSize: '12px', minHeight: '260px', maxHeight: '420px', overflowY: 'auto' }}
                    >
                      {JSON.stringify(lastExchange.responseBody, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center p-5 text-muted">
                  <span className="display-4 text-secondary mb-3">📡</span>
                  <h3 className="h6 fw-bold text-dark">Ready to Inspect OCPI Wire Traffic</h3>
                  <p className="small text-muted mb-0" style={{ maxWidth: '380px' }}>
                    Click any capability button on the left to simulate how the external eMSP platform queries our CPO endpoints.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Documentation & cURL Generator Tab */
        <div className="card-satmat p-4 border bg-white">
          <div className="d-flex align-items-center justify-content-between pb-3 mb-4 border-bottom">
            <div>
              <h2 className="h5 fw-bold text-dark mb-1">Official OCPI 2.2.1 Specification &amp; eMSP Integration Guide</h2>
              <p className="text-secondary small mb-0">
                Share this guide and cURL commands with the external eMSP engineering team to integrate with our CPO platform.
              </p>
            </div>
            <button onClick={copyFullOnboardingDetails} className="btn btn-satmat btn-sm px-3">
              📋 Copy Full Onboarding Docs
            </button>
          </div>

          {/* Quick Specifications Table */}
          <div className="table-responsive mb-4">
            <table className="table table-bordered table-sm align-middle small mb-0">
              <thead className="table-light">
                <tr>
                  <th>Capability</th>
                  <th>Method</th>
                  <th>CPO Endpoint Path</th>
                  <th>Header Required</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>1. Discover Chargers</strong></td>
                  <td><span className="badge bg-success">GET</span></td>
                  <td><code>/ocpi/cpo/2.2.1/locations</code></td>
                  <td><code>Authorization: Token &lt;token&gt;</code></td>
                  <td>Returns list of stations, coordinates, EVSEs, connectors, and availability.</td>
                </tr>
                <tr>
                  <td><strong>2. Station / EVSE Info</strong></td>
                  <td><span className="badge bg-success">GET</span></td>
                  <td><code>/ocpi/cpo/2.2.1/locations/:id</code></td>
                  <td><code>Authorization: Token &lt;token&gt;</code></td>
                  <td>Returns single station details with bay references and capabilities.</td>
                </tr>
                <tr>
                  <td><strong>3. Retrieve Tariffs</strong></td>
                  <td><span className="badge bg-success">GET</span></td>
                  <td><code>/ocpi/cpo/2.2.1/tariffs</code></td>
                  <td><code>Authorization: Token &lt;token&gt;</code></td>
                  <td>Returns dynamic pricing rules (kWh rate, flat fee, idle minute fee).</td>
                </tr>
                <tr>
                  <td><strong>4. Authorize User / Token</strong></td>
                  <td><span className="badge bg-primary">POST</span></td>
                  <td><code>/ocpi/cpo/2.2.1/tokens/:token_uid/authorize?type=RFID</code></td>
                  <td><code>Authorization: Token &lt;token&gt;</code></td>
                  <td>Validates RFID tag or app user contract before charging start.</td>
                </tr>
                <tr>
                  <td><strong>5. Start Charging</strong></td>
                  <td><span className="badge bg-warning text-dark">POST</span></td>
                  <td><code>/ocpi/cpo/2.2.1/commands/START_SESSION</code></td>
                  <td><code>Authorization: Token &lt;token&gt;</code></td>
                  <td>Remotely initiates charging on physical charger connector via OCPP.</td>
                </tr>
                <tr>
                  <td><strong>6. Stop Charging</strong></td>
                  <td><span className="badge bg-warning text-dark">POST</span></td>
                  <td><code>/ocpi/cpo/2.2.1/commands/STOP_SESSION</code></td>
                  <td><code>Authorization: Token &lt;token&gt;</code></td>
                  <td>Remotely terminates active charging session and releases connector.</td>
                </tr>
                <tr>
                  <td><strong>7. Receive Sessions</strong></td>
                  <td><span className="badge bg-success">GET</span></td>
                  <td><code>/ocpi/cpo/2.2.1/sessions</code></td>
                  <td><code>Authorization: Token &lt;token&gt;</code></td>
                  <td>Retrieves active session telemetry (kWh consumed, elapsed duration, cost).</td>
                </tr>
                <tr>
                  <td><strong>8. Retrieve CDRs</strong></td>
                  <td><span className="badge bg-success">GET</span></td>
                  <td><code>/ocpi/cpo/2.2.1/cdrs</code></td>
                  <td><code>Authorization: Token &lt;token&gt;</code></td>
                  <td>Retrieves completed Charge Detail Records for financial settlement.</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Ready cURL commands */}
          <h3 className="h6 fw-bold text-dark mb-3">Copy-Paste cURL Commands for External eMSP Developers</h3>
          <div className="row g-3">
            <div className="col-12 col-lg-6">
              <div className="p-3 bg-dark text-light rounded-3 h-100">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-success small fw-bold">1. Discover Chargers (cURL)</span>
                  <button
                    onClick={() =>
                      handleCopy(
                        `curl -X GET "${window.location.origin}/ocpi/cpo/2.2.1/locations" \\\n  -H "Authorization: Token ${authToken}"`,
                        'curl-loc'
                      )
                    }
                    className="btn btn-link btn-sm p-0 text-decoration-none text-light small"
                  >
                    {copiedKey === 'curl-loc' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="small mb-0 font-monospace text-light" style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>
{`curl -X GET "${window.location.origin}/ocpi/cpo/2.2.1/locations" \\
  -H "Authorization: Token ${authToken}"`}
                </pre>
              </div>
            </div>

            <div className="col-12 col-lg-6">
              <div className="p-3 bg-dark text-light rounded-3 h-100">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-info small fw-bold">4. Authorize User / Token (cURL)</span>
                  <button
                    onClick={() =>
                      handleCopy(
                        `curl -X POST "${window.location.origin}/ocpi/cpo/2.2.1/tokens/RFID-SMV-01/authorize?type=RFID" \\\n  -H "Authorization: Token ${authToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"location_references":[{"location_id":"SATMAT-EV-001"}]}'`,
                        'curl-auth'
                      )
                    }
                    className="btn btn-link btn-sm p-0 text-decoration-none text-light small"
                  >
                    {copiedKey === 'curl-auth' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="small mb-0 font-monospace text-light" style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>
{`curl -X POST "${window.location.origin}/ocpi/cpo/2.2.1/tokens/RFID-SMV-01/authorize?type=RFID" \\
  -H "Authorization: Token ${authToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"location_references":[{"location_id":"SATMAT-EV-001"}]}'`}
                </pre>
              </div>
            </div>

            <div className="col-12 col-lg-6">
              <div className="p-3 bg-dark text-light rounded-3 h-100">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-warning small fw-bold">5. Remote Start Charging (cURL)</span>
                  <button
                    onClick={() =>
                      handleCopy(
                        `curl -X POST "${window.location.origin}/ocpi/cpo/2.2.1/commands/START_SESSION" \\\n  -H "Authorization: Token ${authToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"location_id":"SATMAT-EV-001","connector_id":1,"token":{"uid":"RFID-SMV-01","party_id":"SMV","country_code":"IN"}}'`,
                        'curl-start'
                      )
                    }
                    className="btn btn-link btn-sm p-0 text-decoration-none text-light small"
                  >
                    {copiedKey === 'curl-start' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="small mb-0 font-monospace text-light" style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>
{`curl -X POST "${window.location.origin}/ocpi/cpo/2.2.1/commands/START_SESSION" \\
  -H "Authorization: Token ${authToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"location_id":"SATMAT-EV-001","connector_id":1,"token":{"uid":"RFID-SMV-01","party_id":"SMV","country_code":"IN"}}'`}
                </pre>
              </div>
            </div>

            <div className="col-12 col-lg-6">
              <div className="p-3 bg-dark text-light rounded-3 h-100">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-danger small fw-bold">6. Remote Stop Charging (cURL)</span>
                  <button
                    onClick={() =>
                      handleCopy(
                        `curl -X POST "${window.location.origin}/ocpi/cpo/2.2.1/commands/STOP_SESSION" \\\n  -H "Authorization: Token ${authToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"session_id":"sess-2002","location_id":"SATMAT-EV-001"}'`,
                        'curl-stop'
                      )
                    }
                    className="btn btn-link btn-sm p-0 text-decoration-none text-light small"
                  >
                    {copiedKey === 'curl-stop' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="small mb-0 font-monospace text-light" style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>
{`curl -X POST "${window.location.origin}/ocpi/cpo/2.2.1/commands/STOP_SESSION" \\
  -H "Authorization: Token ${authToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"session_id":"sess-2002","location_id":"SATMAT-EV-001"}'`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
