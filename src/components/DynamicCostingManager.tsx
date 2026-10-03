import React, { useState } from 'react';
import { Charger, OcpiPartner, Tariff } from '../types/index.js';

interface DynamicCostingManagerProps {
  chargers: Charger[];
  partners: OcpiPartner[];
  tariffs: Tariff[];
  onRefresh: () => void;
}

export const DynamicCostingManager: React.FC<DynamicCostingManagerProps> = ({
  chargers,
  partners,
  onRefresh
}) => {
  const [editingChargerId, setEditingChargerId] = useState<string | null>(null);
  const [chargerPriceForm, setChargerPriceForm] = useState({
    baseCostPerKwh: 16.0,
    idleFeePerMinute: 1.0,
    sessionBaseFee: 10.0
  });

  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [partnerPriceForm, setPartnerPriceForm] = useState<{
    pricingType: OcpiPartner['pricingType'];
    customCostPerKwh: number;
    priceAdjustmentPercent: number;
  }>({
    pricingType: 'DEFAULT',
    customCostPerKwh: 16.0,
    priceAdjustmentPercent: 0
  });

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const startEditCharger = (c: Charger) => {
    setEditingChargerId(c.id);
    setChargerPriceForm({
      baseCostPerKwh: c.baseCostPerKwh,
      idleFeePerMinute: c.idleFeePerMinute,
      sessionBaseFee: c.sessionBaseFee
    });
  };

  const saveChargerPrice = async (id: string) => {
    try {
      const res = await fetch(`/api/chargers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chargerPriceForm)
      });
      if (res.ok) {
        setNotification({ type: 'success', message: `Station ${id} tariffs updated` });
        setEditingChargerId(null);
        onRefresh();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const startEditPartner = (p: OcpiPartner) => {
    setEditingPartnerId(p.id);
    setPartnerPriceForm({
      pricingType: p.pricingType,
      customCostPerKwh: p.customCostPerKwh || 16.0,
      priceAdjustmentPercent: p.priceAdjustmentPercent || 0
    });
  };

  const savePartnerPrice = async (id: string) => {
    try {
      const res = await fetch(`/api/ocpi/partners/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partnerPriceForm)
      });
      if (res.ok) {
        setNotification({ type: 'success', message: 'Partner dynamic pricing updated' });
        setEditingPartnerId(null);
        onRefresh();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="container-fluid px-3 px-lg-4 py-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="h3 fw-bold text-dark mb-1">Dynamic Charging Cost Management</h1>
        <p className="text-secondary small mb-0">
          Configure per-machine base energy pricing and partner-specific OCPI roaming tariffs. Changes apply immediately to live OCPI endpoints and session bills.
        </p>
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

      <div className="row g-4">
        {/* Section 1: Per-Machine Base Tariffs */}
        <div className="col-12 col-lg-6">
          <div className="card-satmat p-4 border h-100">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h2 className="h6 fw-bold text-dark mb-0">1. Per-Machine Station Pricing</h2>
              <span className="badge bg-light text-secondary border">Station Overrides</span>
            </div>
            <p className="text-muted small mb-3">
              Set unique electricity tariff rates for individual stations depending on power capacity (e.g. 120kW Ultra DC vs 22kW AC).
            </p>

            {chargers.length === 0 ? (
              <div className="p-4 text-center border rounded-2 bg-light text-muted small">
                No stations added yet. Add a charger to configure its individual energy rate.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle small mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Station ID</th>
                      <th>Rate/kWh</th>
                      <th>Idle Fee</th>
                      <th>Session Fee</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargers.map((c) => {
                      const isEditing = editingChargerId === c.id;
                      return (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.id}</strong>
                            <span className="d-block text-xs text-muted">{c.name}</span>
                          </td>

                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.1"
                                className="form-control form-control-sm"
                                style={{ width: '80px' }}
                                value={chargerPriceForm.baseCostPerKwh}
                                onChange={(e) =>
                                  setChargerPriceForm({
                                    ...chargerPriceForm,
                                    baseCostPerKwh: parseFloat(e.target.value) || 0
                                  })
                                }
                              />
                            ) : (
                              <span className="text-success fw-bold">₹{c.baseCostPerKwh.toFixed(2)}</span>
                            )}
                          </td>

                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.1"
                                className="form-control form-control-sm"
                                style={{ width: '70px' }}
                                value={chargerPriceForm.idleFeePerMinute}
                                onChange={(e) =>
                                  setChargerPriceForm({
                                    ...chargerPriceForm,
                                    idleFeePerMinute: parseFloat(e.target.value) || 0
                                  })
                                }
                              />
                            ) : (
                              <span>₹{c.idleFeePerMinute.toFixed(2)}/m</span>
                            )}
                          </td>

                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.5"
                                className="form-control form-control-sm"
                                style={{ width: '70px' }}
                                value={chargerPriceForm.sessionBaseFee}
                                onChange={(e) =>
                                  setChargerPriceForm({
                                    ...chargerPriceForm,
                                    sessionBaseFee: parseFloat(e.target.value) || 0
                                  })
                                }
                              />
                            ) : (
                              <span>₹{c.sessionBaseFee.toFixed(2)}</span>
                            )}
                          </td>

                          <td className="text-end">
                            {isEditing ? (
                              <div className="d-flex gap-1 justify-content-end">
                                <button
                                  onClick={() => saveChargerPrice(c.id)}
                                  className="btn btn-xs btn-satmat"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingChargerId(null)}
                                  className="btn btn-xs btn-outline-secondary"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditCharger(c)}
                                className="btn btn-xs btn-outline-secondary"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Per-OCPI Partner Tariffs */}
        <div className="col-12 col-lg-6">
          <div className="card-satmat p-4 border h-100">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h2 className="h6 fw-bold text-dark mb-0">2. Per-OCPI Partner Roaming Tariffs</h2>
              <span className="badge bg-success-subtle text-success border border-success-subtle">
                B2B Roaming Rates
              </span>
            </div>
            <p className="text-muted small mb-3">
              Configure partner-specific rates (custom fixed rate per kWh, percentage discount, or markup).
            </p>

            {partners.length === 0 ? (
              <div className="p-4 text-center border rounded-2 bg-light text-muted small">
                No roaming partners added yet. Add an OCPI partner to configure its dynamic roaming tariff.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle small mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Partner</th>
                      <th>Model</th>
                      <th>Value</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.map((p) => {
                      const isEditing = editingPartnerId === p.id;
                      return (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>
                            <span className="d-block text-xs text-muted">
                              {p.countryCode}*{p.partyId} &bull; {p.role}
                            </span>
                          </td>

                          <td>
                            {isEditing ? (
                              <select
                                className="form-select form-select-sm"
                                value={partnerPriceForm.pricingType}
                                onChange={(e) =>
                                  setPartnerPriceForm({
                                    ...partnerPriceForm,
                                    pricingType: e.target.value as any
                                  })
                                }
                              >
                                <option value="DEFAULT">Default</option>
                                <option value="CUSTOM_RATE">Fixed Rate</option>
                                <option value="PERCENTAGE_DISCOUNT">Discount %</option>
                                <option value="PERCENTAGE_MARKUP">Markup %</option>
                              </select>
                            ) : (
                              <span className="badge bg-light text-dark border">
                                {p.pricingType}
                              </span>
                            )}
                          </td>

                          <td>
                            {isEditing ? (
                              partnerPriceForm.pricingType === 'CUSTOM_RATE' ? (
                                <input
                                  type="number"
                                  step="0.1"
                                  className="form-control form-control-sm"
                                  style={{ width: '80px' }}
                                  value={partnerPriceForm.customCostPerKwh}
                                  onChange={(e) =>
                                    setPartnerPriceForm({
                                      ...partnerPriceForm,
                                      customCostPerKwh: parseFloat(e.target.value) || 0
                                    })
                                  }
                                />
                              ) : partnerPriceForm.pricingType !== 'DEFAULT' ? (
                                <input
                                  type="number"
                                  step="0.5"
                                  className="form-control form-control-sm"
                                  style={{ width: '70px' }}
                                  value={partnerPriceForm.priceAdjustmentPercent}
                                  onChange={(e) =>
                                    setPartnerPriceForm({
                                      ...partnerPriceForm,
                                      priceAdjustmentPercent: parseFloat(e.target.value) || 0
                                    })
                                  }
                                />
                              ) : (
                                <span className="text-muted">Standard</span>
                              )
                            ) : (
                              <span className="fw-bold text-dark">
                                {p.pricingType === 'DEFAULT' && 'Station Base'}
                                {p.pricingType === 'CUSTOM_RATE' && `₹${p.customCostPerKwh?.toFixed(2)}/kWh`}
                                {p.pricingType === 'PERCENTAGE_DISCOUNT' && `-${p.priceAdjustmentPercent}%`}
                                {p.pricingType === 'PERCENTAGE_MARKUP' && `+${p.priceAdjustmentPercent}%`}
                              </span>
                            )}
                          </td>

                          <td className="text-end">
                            {isEditing ? (
                              <div className="d-flex gap-1 justify-content-end">
                                <button
                                  onClick={() => savePartnerPrice(p.id)}
                                  className="btn btn-xs btn-satmat"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingPartnerId(null)}
                                  className="btn btn-xs btn-outline-secondary"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditPartner(p)}
                                className="btn btn-xs btn-outline-secondary"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
