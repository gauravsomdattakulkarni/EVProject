import React, { useState } from 'react';
import { OcpiPartner, Charger, Tariff } from '../types/index.js';
import { EmspPartnerPanel } from './EmspPartnerPanel.js';

interface OcpiPartnerManagerProps {
  partners: OcpiPartner[];
  chargers?: Charger[];
  tariffs?: Tariff[];
  onRefresh: () => void;
  onOpenEmspPanel?: () => void;
}

export const OcpiPartnerManager: React.FC<OcpiPartnerManagerProps> = ({
  partners,
  chargers = [],
  tariffs = [],
  onRefresh,
  onOpenEmspPanel
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'partners' | 'emsp_console'>('partners');
  const [showModal, setShowModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<OcpiPartner | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [form, setForm] = useState<{
    name: string;
    partyId: string;
    countryCode: string;
    role: OcpiPartner['role'];
    url: string;
    ocpiVersion: OcpiPartner['ocpiVersion'];
    status: OcpiPartner['status'];
    pricingType: OcpiPartner['pricingType'];
    customCostPerKwh: number;
    priceAdjustmentPercent: number;
    notes: string;
  }>({
    name: '',
    partyId: '',
    countryCode: 'IN',
    role: 'eMSP',
    url: 'https://roaming.partner-network.com/ocpi',
    ocpiVersion: '2.2.1',
    status: 'ACTIVE',
    pricingType: 'DEFAULT',
    customCostPerKwh: 16.0,
    priceAdjustmentPercent: 0,
    notes: ''
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpenAdd = () => {
    setEditingPartner(null);
    setForm({
      name: '',
      partyId: '',
      countryCode: 'IN',
      role: 'eMSP',
      url: 'https://roaming.partner-network.com/ocpi',
      ocpiVersion: '2.2.1',
      status: 'ACTIVE',
      pricingType: 'DEFAULT',
      customCostPerKwh: 16.0,
      priceAdjustmentPercent: 0,
      notes: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (p: OcpiPartner) => {
    setEditingPartner(p);
    setForm({
      name: p.name,
      partyId: p.partyId,
      countryCode: p.countryCode,
      role: p.role,
      url: p.url,
      ocpiVersion: p.ocpiVersion,
      status: p.status,
      pricingType: p.pricingType,
      customCostPerKwh: p.customCostPerKwh || 16.0,
      priceAdjustmentPercent: p.priceAdjustmentPercent || 0,
      notes: p.notes || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('save');
    try {
      const url = editingPartner ? `/api/ocpi/partners/${editingPartner.id}` : '/api/ocpi/partners';
      const method = editingPartner ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          customCostPerKwh: form.pricingType === 'CUSTOM_RATE' ? Number(form.customCostPerKwh) : null,
          priceAdjustmentPercent: Number(form.priceAdjustmentPercent)
        })
      });

      if (res.ok) {
        setNotification({
          type: 'success',
          message: editingPartner ? 'Partner updated successfully' : 'Roaming Partner added with tokens'
        });
        setShowModal(false);
        onRefresh();
      } else {
        const err = await res.json();
        setNotification({ type: 'error', message: err.error || 'Failed to save partner' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this roaming partner?')) return;
    try {
      const res = await fetch(`/api/ocpi/partners/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotification({ type: 'success', message: 'Partner removed' });
        onRefresh();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="container-fluid px-3 px-lg-4 py-4">
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-4 gap-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="badge bg-success text-white">CPO SYSTEM</span>
            <span className="badge bg-light text-muted border">OCPI 2.2.1 Roaming Gateway</span>
          </div>
          <h1 className="h3 fw-bold text-dark mb-1">OCPI Roaming Partner Management (CPO)</h1>
          <p className="text-secondary small mb-0">
            Our system is the Charge Point Operator (CPO) managing actual EVSE hardware. External companies operate their own eMSP panels. Provide them with our OCPI Base URL and Token B below.
          </p>
        </div>

        <div className="d-flex gap-2">
          <button
            onClick={() => setActiveSubTab(activeSubTab === 'partners' ? 'emsp_console' : 'partners')}
            className={`btn btn-sm ${activeSubTab === 'emsp_console' ? 'btn-satmat shadow-sm' : 'btn-satmat-outline'}`}
          >
            {activeSubTab === 'emsp_console' ? '👥 View Roaming Partners List' : '🧪 Open External eMSP Integration Sandbox'}
          </button>
          <button onClick={onRefresh} className="btn btn-satmat-outline btn-sm shadow-sm">
            🔄 Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-satmat btn-sm shadow-sm">
            ➕ Add Roaming Partner
          </button>
        </div>
      </div>

      {/* Live eMSP Quick Integration Credentials Banner */}
      <div className="card-satmat p-3 border mb-4 bg-satmat-light border-success-subtle">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-success text-white">CONNECTION CREDENTIALS</span>
            <strong className="text-dark small">Provide this Base URL &amp; Token B to the External eMSP Company:</strong>
          </div>
          <button
            onClick={() => setActiveSubTab('emsp_console')}
            className="btn btn-satmat btn-sm py-1 px-3 shadow-sm fw-semibold"
          >
            🧪 Test in External eMSP Sandbox
          </button>
        </div>

        <div className="row g-2 small font-monospace">
          <div className="col-12 col-md-6 col-lg-3">
            <div className="p-2 bg-white rounded border">
              <span className="text-muted d-block" style={{ fontSize: '10px' }}>OCPI 2.2.1 Base URL:</span>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-dark fw-bold text-truncate me-1" title={`${typeof window !== 'undefined' ? window.location.origin : 'https://evcharger.satmatgroup.com'}/ocpi/2.2.1`}>
                  .../ocpi/2.2.1
                </span>
                <button
                  onClick={() => handleCopy(`${window.location.origin}/ocpi/2.2.1`, 'top-loc')}
                  className="btn btn-link btn-sm p-0 text-success text-decoration-none"
                >
                  {copiedKey === 'top-loc' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <div className="p-2 bg-white rounded border">
              <span className="text-muted d-block" style={{ fontSize: '10px' }}>Versions Endpoint:</span>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-success fw-bold text-truncate me-1" title={`${typeof window !== 'undefined' ? window.location.origin : 'https://evcharger.satmatgroup.com'}/ocpi/versions`}>
                  .../ocpi/versions
                </span>
                <button
                  onClick={() => handleCopy(`${window.location.origin}/ocpi/versions`, 'top-rec')}
                  className="btn btn-link btn-sm p-0 text-success text-decoration-none"
                >
                  {copiedKey === 'top-rec' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <div className="p-2 bg-white rounded border">
              <span className="text-muted d-block" style={{ fontSize: '10px' }}>Auth Token (Token B):</span>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-primary fw-bold text-truncate me-1" title="b2c3d4e5-token-b-satmat-2026">
                  b2c3d4e5-token-b-satmat-2026
                </span>
                <button
                  onClick={() => handleCopy('b2c3d4e5-token-b-satmat-2026', 'top-tok')}
                  className="btn btn-link btn-sm p-0 text-success text-decoration-none"
                >
                  {copiedKey === 'top-tok' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6 col-lg-3">
            <div className="p-2 bg-white rounded border">
              <span className="text-muted d-block" style={{ fontSize: '10px' }}>Header &amp; Party ID:</span>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-dark fw-bold text-truncate me-1">
                  Authorization: Token &lt;token_b&gt;
                </span>
                <button
                  onClick={() => handleCopy('Authorization: Token b2c3d4e5-token-b-satmat-2026', 'top-hub')}
                  className="btn btn-link btn-sm p-0 text-success text-decoration-none"
                >
                  {copiedKey === 'top-hub' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
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

      {/* Render eMSP Console when toggled */}
      {activeSubTab === 'emsp_console' ? (
        <EmspPartnerPanel
          chargers={chargers}
          partners={partners}
          tariffs={tariffs}
          onRefresh={onRefresh}
        />
      ) : (
        <>
          {/* Partners List or Empty State */}
      {partners.length === 0 ? (
        <div className="card-satmat p-5 text-center border mb-4">
          <div className="d-inline-flex p-3 rounded-circle bg-success-subtle text-success mb-3">
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </div>
          <h3 className="h5 fw-bold text-dark mb-2">No OCPI Roaming Partners Registered</h3>
          <p className="text-secondary small mb-4" style={{ maxWidth: '480px', margin: '0 auto' }}>
            No dummy data. Click below to add an official OCPI roaming partner (e.g. Tata Power, Zeon, Jio-bp, Statiq) and generate their URL and Token.
          </p>
          <div>
            <button onClick={handleOpenAdd} className="btn btn-satmat px-4 py-2 shadow-sm">
              ➕ Add Your First Roaming Partner
            </button>
          </div>
        </div>
      ) : (
        <div className="row g-4 mb-4">
          {partners.map((partner) => {
            return (
              <div key={partner.id} className="col-12 col-xl-6">
                <div className="card-satmat p-4 border h-100 d-flex flex-column justify-content-between">
                  <div>
                    {/* Top info */}
                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span className="badge bg-success px-2.5 py-1 fw-bold">
                            {partner.countryCode}*{partner.partyId}
                          </span>
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                            Role: {partner.role}
                          </span>
                          <span className="badge bg-light text-dark border">
                            OCPI v{partner.ocpiVersion}
                          </span>
                          <span
                            className={`badge ${
                              partner.status === 'ACTIVE'
                                ? 'badge-connected'
                                : 'bg-warning-subtle text-warning-emphasis'
                            }`}
                          >
                            {partner.status}
                          </span>
                        </div>
                        <h2 className="h5 fw-bold text-dark mb-0">{partner.name}</h2>
                        <span className="text-muted small">Partner URL: {partner.url || 'Not set'}</span>
                      </div>

                      <div className="d-flex gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(partner)}
                          className="btn btn-sm btn-outline-secondary px-2.5 py-1"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(partner.id)}
                          className="btn btn-sm btn-outline-danger px-2.5 py-1"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Credentials & Token given to partner (Requirement 8) */}
                    <div className="bg-light p-3 rounded-3 mb-3 border">
                      <span className="small fw-bold text-secondary d-block mb-2">
                        🔑 Partner Connection Credentials (Give these to partner):
                      </span>

                      {/* Registration / Endpoints URL */}
                      <div className="mb-2">
                        <div className="d-flex justify-content-between align-items-center mb-0.5">
                          <span className="text-muted small">1. Official Versions & Registration URL:</span>
                          <button
                            onClick={() =>
                              handleCopy(
                                `https://evcharger.satmatgroup.com/ocpi/cpo/${partner.ocpiVersion}/locations`,
                                `${partner.id}-url`
                              )
                            }
                            className="btn btn-link btn-sm p-0 text-success text-decoration-none small fw-semibold"
                          >
                            {copiedKey === `${partner.id}-url` ? '✓ Copied' : 'Copy URL'}
                          </button>
                        </div>
                        <code className="text-dark small d-block bg-white p-1.5 rounded border text-break">
                          https://evcharger.satmatgroup.com/ocpi/cpo/{partner.ocpiVersion}/locations
                        </code>
                      </div>

                      {/* Token A / Token B */}
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-0.5">
                          <span className="text-muted small">2. Partner Auth Token (Token B / Bearer):</span>
                          <button
                            onClick={() => handleCopy(partner.tokenB, `${partner.id}-tok`)}
                            className="btn btn-link btn-sm p-0 text-success text-decoration-none small fw-semibold"
                          >
                            {copiedKey === `${partner.id}-tok` ? '✓ Copied' : 'Copy Token'}
                          </button>
                        </div>
                        <code className="text-success small fw-bold d-block bg-white p-1.5 rounded border text-break">
                          {partner.tokenB}
                        </code>
                      </div>
                    </div>

                    {/* Dynamic Costing Model for this partner */}
                    <div className="p-3 bg-satmat-light rounded-3 border border-success-subtle mb-3">
                      <div className="d-flex align-items-center justify-content-between">
                        <div>
                          <span className="small text-secondary d-block">Configured Roaming Tariff:</span>
                          <strong className="text-dark">
                            {partner.pricingType === 'DEFAULT' && 'Standard Base Machine Rates'}
                            {partner.pricingType === 'CUSTOM_RATE' && `Custom Flat Rate: ₹${partner.customCostPerKwh?.toFixed(2)}/kWh`}
                            {partner.pricingType === 'PERCENTAGE_DISCOUNT' && `Discounted: ${partner.priceAdjustmentPercent}% Off Station Price`}
                            {partner.pricingType === 'PERCENTAGE_MARKUP' && `Markup: +${partner.priceAdjustmentPercent}% On Station Price`}
                          </strong>
                        </div>
                        <span className="badge bg-success text-white py-1 px-2.5">
                          Dynamic Cost Active
                        </span>
                      </div>
                    </div>

                    {partner.notes && (
                      <p className="text-muted small mb-0">
                        <strong>Notes:</strong> {partner.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-top d-flex justify-content-between align-items-center text-muted small mt-3">
                    <span>Created: {new Date(partner.createdAt).toLocaleDateString()}</span>
                    <span>
                      Last Partner Access:{' '}
                      {partner.lastAccessAt ? new Date(partner.lastAccessAt).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Official OCPI Standard Endpoints Overview */}
      <div className="card-satmat p-4 border">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h6 fw-bold text-dark mb-0">Official OCPI 2.2.1 CPO Endpoints Reference</h2>
          <span className="badge bg-success text-white">CPO Role Specification</span>
        </div>
        <p className="text-secondary small mb-3">
          SATMAT EV implements the official OCPI 2.2.1 specification for the CPO role. External eMSP platforms connect directly to these endpoints.
        </p>

        <div className="table-responsive">
          <table className="table table-bordered table-sm align-middle small mb-0">
            <thead className="table-light">
              <tr>
                <th>Capability / Module</th>
                <th>Method</th>
                <th>CPO Endpoint Path</th>
                <th>Auth Header</th>
                <th>Role &amp; Functionality</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Versions</strong></td>
                <td><span className="badge bg-success">GET</span></td>
                <td><code>/ocpi/versions</code></td>
                <td>None</td>
                <td>Lists available versions (2.2.1, 2.2, 2.0)</td>
              </tr>
              <tr>
                <td><strong>Credentials Handshake</strong></td>
                <td><span className="badge bg-primary">GET / POST</span></td>
                <td><code>/ocpi/cpo/2.2.1/credentials</code></td>
                <td><code>Token &lt;token_a/b&gt;</code></td>
                <td>Registration handshake and credentials exchange with roles array</td>
              </tr>
              <tr>
                <td><strong>1. Discover Chargers &amp; EVSEs</strong></td>
                <td><span className="badge bg-success">GET</span></td>
                <td><code>/ocpi/cpo/2.2.1/locations</code></td>
                <td><code>Token &lt;token_b&gt;</code></td>
                <td>Returns all charging locations, coordinates, EVSEs, and connector statuses</td>
              </tr>
              <tr>
                <td><strong>2. Retrieve Charger Information</strong></td>
                <td><span className="badge bg-success">GET</span></td>
                <td><code>/ocpi/cpo/2.2.1/locations/:id</code></td>
                <td><code>Token &lt;token_b&gt;</code></td>
                <td>Returns specific station, EVSE specifications, and bay references</td>
              </tr>
              <tr>
                <td><strong>3. Retrieve Tariffs</strong></td>
                <td><span className="badge bg-success">GET</span></td>
                <td><code>/ocpi/cpo/2.2.1/tariffs</code></td>
                <td><code>Token &lt;token_b&gt;</code></td>
                <td>Returns dynamic partner pricing (Energy kWh rate, flat fee, idle fee)</td>
              </tr>
              <tr>
                <td><strong>4. Authorize Users / Tokens</strong></td>
                <td><span className="badge bg-primary">POST</span></td>
                <td><code>/ocpi/cpo/2.2.1/tokens/:token_uid/authorize?type=RFID</code></td>
                <td><code>Token &lt;token_b&gt;</code></td>
                <td>Real-time authorization check for external eMSP RFID tag or app token</td>
              </tr>
              <tr>
                <td><strong>5. Start Charging</strong></td>
                <td><span className="badge bg-warning text-dark">POST</span></td>
                <td><code>/ocpi/cpo/2.2.1/commands/START_SESSION</code></td>
                <td><code>Token &lt;token_b&gt;</code></td>
                <td>Dispatches remote start command to physical charger via OCPP</td>
              </tr>
              <tr>
                <td><strong>6. Stop Charging</strong></td>
                <td><span className="badge bg-warning text-dark">POST</span></td>
                <td><code>/ocpi/cpo/2.2.1/commands/STOP_SESSION</code></td>
                <td><code>Token &lt;token_b&gt;</code></td>
                <td>Dispatches remote stop command, terminates session, releases connector</td>
              </tr>
              <tr>
                <td><strong>7. Receive Session Info</strong></td>
                <td><span className="badge bg-success">GET</span></td>
                <td><code>/ocpi/cpo/2.2.1/sessions</code></td>
                <td><code>Token &lt;token_b&gt;</code></td>
                <td>Provides active charging session telemetry, kWh consumed, and duration</td>
              </tr>
              <tr>
                <td><strong>8. Retrieve Completed Records</strong></td>
                <td><span className="badge bg-success">GET</span></td>
                <td><code>/ocpi/cpo/2.2.1/cdrs</code></td>
                <td><code>Token &lt;token_b&gt;</code></td>
                <td>Returns finalized Charge Detail Records (CDRs) for billing and invoicing</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Add / Edit Partner Modal */}
      {showModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-satmat-light border-bottom">
                <h5 className="modal-title fw-bold text-dark">
                  {editingPartner ? `Edit Partner: ${editingPartner.name}` : 'Add Roaming Partner (OCPI 2.0 / 2.2)'}
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>

              <form onSubmit={handleSave}>
                <div className="modal-body p-4">
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary">Partner Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Tata Power EZ Charge"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="col-6 col-md-3">
                      <label className="form-label small fw-semibold text-secondary">Party ID (3 Char) *</label>
                      <input
                        type="text"
                        maxLength={3}
                        className="form-control text-uppercase font-monospace"
                        placeholder="e.g. TPE"
                        value={form.partyId}
                        onChange={(e) => setForm({ ...form, partyId: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>

                    <div className="col-6 col-md-3">
                      <label className="form-label small fw-semibold text-secondary">Country Code *</label>
                      <input
                        type="text"
                        maxLength={2}
                        className="form-control text-uppercase font-monospace"
                        placeholder="IN"
                        value={form.countryCode}
                        onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary">Partner Base URL</label>
                      <input
                        type="url"
                        className="form-control"
                        placeholder="https://roaming.partner.com/ocpi"
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        required
                      />
                    </div>

                    <div className="col-6 col-md-3">
                      <label className="form-label small fw-semibold text-secondary">Role</label>
                      <select
                        className="form-select"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                      >
                        <option value="eMSP">eMSP (Mobility Service Provider)</option>
                        <option value="CPO">CPO (Charge Point Operator)</option>
                        <option value="HUB">HUB (Roaming Broker)</option>
                      </select>
                    </div>

                    <div className="col-6 col-md-3">
                      <label className="form-label small fw-semibold text-secondary">OCPI Version</label>
                      <select
                        className="form-select"
                        value={form.ocpiVersion}
                        onChange={(e) => setForm({ ...form, ocpiVersion: e.target.value as any })}
                      >
                        <option value="2.2.1">OCPI 2.2.1 (Recommended)</option>
                        <option value="2.2">OCPI 2.2</option>
                        <option value="2.0">OCPI 2.0</option>
                      </select>
                    </div>

                    {/* Dynamic Costing Model (Requirement 9) */}
                    <div className="col-12">
                      <label className="form-label small fw-semibold text-secondary">
                        Dynamic Roaming Costing Model for this Partner
                      </label>
                      <select
                        className="form-select"
                        value={form.pricingType}
                        onChange={(e) => setForm({ ...form, pricingType: e.target.value as any })}
                      >
                        <option value="DEFAULT">Standard Base Machine Price (No adjustment)</option>
                        <option value="CUSTOM_RATE">Custom Fixed Rate per kWh (Override all machines)</option>
                        <option value="PERCENTAGE_DISCOUNT">Percentage Discount off Station Rate</option>
                        <option value="PERCENTAGE_MARKUP">Percentage Markup on Station Rate</option>
                      </select>
                    </div>

                    {form.pricingType === 'CUSTOM_RATE' && (
                      <div className="col-12 col-md-6">
                        <label className="form-label small fw-semibold text-secondary">Custom Rate (₹ / kWh)</label>
                        <input
                          type="number"
                          step="0.1"
                          className="form-control"
                          value={form.customCostPerKwh}
                          onChange={(e) => setForm({ ...form, customCostPerKwh: parseFloat(e.target.value) || 0 })}
                          required
                        />
                      </div>
                    )}

                    {(form.pricingType === 'PERCENTAGE_DISCOUNT' || form.pricingType === 'PERCENTAGE_MARKUP') && (
                      <div className="col-12 col-md-6">
                        <label className="form-label small fw-semibold text-secondary">
                          {form.pricingType === 'PERCENTAGE_DISCOUNT' ? 'Discount Percentage (%)' : 'Markup Percentage (%)'}
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          className="form-control"
                          value={form.priceAdjustmentPercent}
                          onChange={(e) => setForm({ ...form, priceAdjustmentPercent: parseFloat(e.target.value) || 0 })}
                          required
                        />
                      </div>
                    )}

                    <div className="col-12">
                      <label className="form-label small fw-semibold text-secondary">Notes & Agreement Reference</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        placeholder="Interoperability bilateral agreement details, contact person, etc."
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      ></textarea>
                    </div>
                  </div>
                </div>

                <div className="modal-footer bg-light">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading === 'save'} className="btn btn-satmat">
                    {actionLoading === 'save' ? 'Saving...' : 'Save Roaming Partner'}
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
