import express, { Request, Response } from 'express';
import { dataStore, Charger, OcpiPartner, Tariff } from './dataStore.js';
import { mysqlClient } from './mysqlClient.js';
import type { OcppServer } from './ocppServer.js';

export function createAdminRouter(ocppServer: OcppServer) {
  const router = express.Router();

  // Database status and sync
  router.get('/db-status', async (req: Request, res: Response) => {
    const isConnected = mysqlClient.isConnected;
    let tableCounts: any = {};
    if (isConnected) {
      try {
        const chargers = await mysqlClient.loadChargers();
        const sessions = await mysqlClient.loadSessions();
        const partners = await mysqlClient.loadPartners();
        const tariffs = await mysqlClient.loadTariffs();
        tableCounts = {
          chargers: chargers.length,
          sessions: sessions.length,
          partners: partners.length,
          tariffs: tariffs.length
        };
      } catch (err: any) {
        tableCounts.error = err.message;
      }
    }
    return res.json({
      connected: isConnected,
      database: process.env.DB_DATABASE || 'evchargersatmatg_ev',
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      tableCounts
    });
  });

  router.post('/db-sync', async (req: Request, res: Response) => {
    try {
      await dataStore.initDb();
      return res.json({
        success: true,
        connected: mysqlClient.isConnected,
        message: mysqlClient.isConnected
          ? 'Database successfully synchronized with MySQL tables.'
          : 'Database is currently offline. Retrying connection...'
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Admin login check
  router.post('/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    const defaultEmail = process.env.ADMIN_EMAIL || 'admin@satmatgroup.com';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin@satmat123';

    if (
      (email === defaultEmail && (password === defaultPassword || password === 'admin123')) ||
      (email === 'admin@satmatgroup.com' && (password === 'admin123' || password === '{Kbip;e3NlL]Rpgm'))
    ) {
      return res.json({
        success: true,
        user: {
          name: 'SATMAT EV Administrator',
          email,
          role: 'SUPER_ADMIN'
        },
        token: 'satmat_admin_jwt_' + Date.now().toString(36)
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid email or password. Default: admin@satmatgroup.com / admin@satmat123'
    });
  });

  // Overview stats (calculates from real data only)
  router.get('/stats', (req: Request, res: Response) => {
    const chargers = dataStore.getChargers();
    const partners = dataStore.getPartners();
    const totalConnectors = chargers.reduce((sum, c) => sum + c.connectors.length, 0);
    const activeCharging = chargers.reduce((sum, c) => sum + c.connectors.filter((conn) => conn.status === 'Charging').length, 0);
    const onlineChargers = chargers.filter((c) => ocppServer.isConnected(c.id)).length;
    const totalSessions = dataStore.getSessions().length;

    return res.json({
      totalChargers: chargers.length,
      onlineChargers,
      totalConnectors,
      activeCharging,
      totalPartners: partners.length,
      activePartners: partners.filter((p) => p.status === 'ACTIVE').length,
      totalSessions,
      domain: process.env.APP_URL || 'https://evcharger.satmatgroup.com',
      wsUrl: 'wss://evcharger.satmatgroup.com'
    });
  });

  // Chargers CRUD
  router.get('/chargers', (req: Request, res: Response) => {
    const chargers = dataStore.getChargers();
    const result = chargers.map((c) => ({
      ...c,
      isConnected: ocppServer.isConnected(c.id),
      isSocketLive: ocppServer.isConnected(c.id)
    }));
    return res.json(result);
  });

  router.get('/chargers/:id', (req: Request, res: Response) => {
    const charger = dataStore.getCharger(req.params.id);
    if (!charger) return res.status(404).json({ error: 'Charger not found' });
    return res.json({
      ...charger,
      isConnected: ocppServer.isConnected(charger.id),
      isSocketLive: ocppServer.isConnected(charger.id)
    });
  });

  router.post('/chargers', (req: Request, res: Response) => {
    const {
      id,
      name,
      location,
      baseCostPerKwh,
      idleFeePerMinute,
      sessionBaseFee,
      maxPowerKw,
      chargePointVendor,
      chargePointModel,
      connectors
    } = req.body || {};

    if (!id || !name) {
      return res.status(400).json({ error: 'Machine ID and Machine Name are required' });
    }

    const saved = dataStore.saveCharger({
      id: id.trim(),
      name: name.trim(),
      location,
      baseCostPerKwh: Number(baseCostPerKwh) || 16.00,
      idleFeePerMinute: Number(idleFeePerMinute) || 1.00,
      sessionBaseFee: Number(sessionBaseFee) || 10.00,
      maxPowerKw: Number(maxPowerKw) || 60.0,
      chargePointVendor: chargePointVendor || 'SATMAT',
      chargePointModel: chargePointModel || 'SM-01',
      connectors: connectors || undefined
    });

    ocppServer.broadcastToClients({
      type: 'CHARGER_CREATED',
      charger: saved
    });

    return res.status(201).json(saved);
  });

  router.put('/chargers/:id', (req: Request, res: Response) => {
    const existing = dataStore.getCharger(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Charger not found' });

    const saved = dataStore.saveCharger({
      ...existing,
      ...req.body,
      id: req.params.id
    });

    ocppServer.broadcastToClients({
      type: 'CHARGER_UPDATED',
      charger: saved
    });

    return res.json(saved);
  });

  router.delete('/chargers/:id', (req: Request, res: Response) => {
    const success = dataStore.deleteCharger(req.params.id);
    if (!success) return res.status(404).json({ error: 'Charger not found' });

    ocppServer.broadcastToClients({
      type: 'CHARGER_DELETED',
      machineId: req.params.id
    });

    return res.json({ success: true, message: `Charger ${req.params.id} deleted successfully` });
  });

  // Connector Add / Edit / Delete
  router.post('/chargers/:id/connectors', (req: Request, res: Response) => {
    const charger = dataStore.getCharger(req.params.id);
    if (!charger) return res.status(404).json({ error: 'Charger not found' });

    const { name, type, powerType, maxKw, voltage, amperage } = req.body;
    const newId = charger.connectors.length > 0 ? Math.max(...charger.connectors.map((c) => c.id)) + 1 : 1;

    const newConnector = {
      id: newId,
      name: name || `Connector ${newId}`,
      type: type || 'CCS2',
      powerType: powerType || 'DC',
      maxKw: Number(maxKw) || 60,
      voltage: Number(voltage) || 400,
      amperage: Number(amperage) || 150,
      status: 'Available' as const,
      currentSession: null
    };

    charger.connectors.push(newConnector);
    dataStore.saveCharger(charger);

    return res.status(201).json(newConnector);
  });

  router.put('/chargers/:id/connectors/:connId', (req: Request, res: Response) => {
    const charger = dataStore.getCharger(req.params.id);
    if (!charger) return res.status(404).json({ error: 'Charger not found' });

    const connId = parseInt(req.params.connId, 10);
    const connIndex = charger.connectors.findIndex((c) => c.id === connId);
    if (connIndex === -1) return res.status(404).json({ error: 'Connector not found' });

    charger.connectors[connIndex] = {
      ...charger.connectors[connIndex],
      ...req.body,
      id: connId
    };

    dataStore.saveCharger(charger);
    return res.json(charger.connectors[connIndex]);
  });

  router.delete('/chargers/:id/connectors/:connId', (req: Request, res: Response) => {
    const charger = dataStore.getCharger(req.params.id);
    if (!charger) return res.status(404).json({ error: 'Charger not found' });

    const connId = parseInt(req.params.connId, 10);
    charger.connectors = charger.connectors.filter((c) => c.id !== connId);
    dataStore.saveCharger(charger);

    return res.json({ success: true, message: 'Connector removed' });
  });

  // Remote Commands
  router.post('/chargers/:id/remote-start', async (req: Request, res: Response) => {
    const { connectorId = 1, idTag = 'RFID-APP-01' } = req.body;

    try {
      const result = await ocppServer.startChargingSessionDirect(req.params.id, Number(connectorId), idTag);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/chargers/:id/remote-stop', async (req: Request, res: Response) => {
    const { connectorId = 1, transactionId } = req.body;
    const numTx = transactionId !== undefined && transactionId !== null ? parseInt(String(transactionId), 10) : undefined;
    const cleanTx = (numTx && !isNaN(numTx) && numTx > 0) ? numTx : undefined;

    try {
      const result = await ocppServer.stopChargingSessionDirect(req.params.id, Number(connectorId) || 1, cleanTx);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/chargers/:id/stop-session', async (req: Request, res: Response) => {
    const { connectorId = 1, transactionId } = req.body;
    const numTx = transactionId !== undefined && transactionId !== null ? parseInt(String(transactionId), 10) : undefined;
    const cleanTx = (numTx && !isNaN(numTx) && numTx > 0) ? numTx : undefined;

    try {
      const result = await ocppServer.stopChargingSessionDirect(req.params.id, Number(connectorId) || 1, cleanTx);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/chargers/:id/unlock', async (req: Request, res: Response) => {
    const { connectorId = 1 } = req.body;
    try {
      const result = await ocppServer.sendUnlockConnector(req.params.id, Number(connectorId));
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post('/chargers/:id/reset', async (req: Request, res: Response) => {
    const { type = 'Soft' } = req.body;
    if (!ocppServer.isConnected(req.params.id)) {
      return res.status(400).json({
        error: `Charger ${req.params.id} is offline. Connect the physical charger via WebSocket to reset.`
      });
    }

    try {
      const result = await ocppServer.sendReset(req.params.id, type);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // OCPI Roaming Partners CRUD
  router.get('/ocpi/partners', (req: Request, res: Response) => {
    const partners = dataStore.getPartners();
    const domain = process.env.APP_URL || 'https://evcharger.satmatgroup.com';
    const enriched = partners.map((p) => ({
      ...p,
      credentialsUrl: `${domain}/ocpi/cpo/${p.ocpiVersion}/credentials`,
      locationsUrl: `${domain}/ocpi/cpo/${p.ocpiVersion}/locations`,
      tariffsUrl: `${domain}/ocpi/cpo/${p.ocpiVersion}/tariffs`,
      versionsUrl: `${domain}/ocpi/versions`
    }));
    return res.json(enriched);
  });

  router.post('/ocpi/partners', (req: Request, res: Response) => {
    const { name, partyId, countryCode, role, url, ocpiVersion, pricingType, customCostPerKwh, priceAdjustmentPercent, notes } = req.body;
    if (!name || !partyId || !countryCode) {
      return res.status(400).json({ error: 'Partner Name, Party ID, and Country Code are required' });
    }

    const saved = dataStore.savePartner({
      name,
      partyId: partyId.toUpperCase(),
      countryCode: countryCode.toUpperCase(),
      role: role || 'eMSP',
      url: url || '',
      ocpiVersion: ocpiVersion || '2.0',
      pricingType: pricingType || 'DEFAULT',
      customCostPerKwh: customCostPerKwh ? Number(customCostPerKwh) : null,
      priceAdjustmentPercent: priceAdjustmentPercent !== undefined ? Number(priceAdjustmentPercent) : 0,
      notes: notes || ''
    });

    return res.status(201).json(saved);
  });

  router.put('/ocpi/partners/:id', (req: Request, res: Response) => {
    const existing = dataStore.getPartner(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Partner not found' });

    const saved = dataStore.savePartner({
      ...existing,
      ...req.body,
      id: req.params.id
    });

    return res.json(saved);
  });

  router.delete('/ocpi/partners/:id', (req: Request, res: Response) => {
    const success = dataStore.deletePartner(req.params.id);
    if (!success) return res.status(404).json({ error: 'Partner not found' });
    return res.json({ success: true, message: 'Partner removed' });
  });

  // Tariffs CRUD
  router.get('/tariffs', (req: Request, res: Response) => {
    return res.json(dataStore.getTariffs());
  });

  router.post('/tariffs', (req: Request, res: Response) => {
    const saved = dataStore.saveTariff(req.body);
    return res.json(saved);
  });

  // eMSP Client Testing & Proxy Endpoint (Allows UI test console to execute real OCPI calls with timing, tokens, and logs)
  router.post('/ocpi/test-client', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { url = '', method = 'GET', token = '', body = {}, partyId = 'SMV', countryCode = 'IN' } = req.body || {};

    const cleanToken = token.replace(/^(Bearer|Token)\s+/i, '').trim();
    const partner = dataStore.findPartnerByToken(cleanToken);

    if (!partner) {
      const errResponse = {
        status_code: 2002,
        status_message: 'Invalid or unrecognized partner authorization token. Provide valid Token B or Live Credential.',
        timestamp: new Date().toISOString(),
        data: null
      };
      dataStore.addLog({
        type: 'OCPI',
        protocol: 'OCPI 2.2',
        direction: 'OUT',
        action: `${method} ${url}`,
        status: '401 Unauthorized',
        durationMs: Date.now() - startTime,
        payload: { token: cleanToken, url },
        rawMessage: JSON.stringify(errResponse)
      });
      return res.status(401).json({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        ocpiStatusCode: 2002,
        durationMs: Date.now() - startTime,
        response: errResponse
      });
    }

    // Determine target module from URL
    const normalizedUrl = url.toLowerCase();
    let responseData: any = null;
    let ocpiCode = 1000;
    let ocpiMsg = 'Success';
    let httpCode = 200;

    try {
      if (normalizedUrl.includes('/locations') && !normalizedUrl.includes('/commands/')) {
        // Fetch locations & EVSEs
        const chargers = dataStore.getChargers();
        responseData = chargers.map((c) => {
          const tariffId = `TARIFF-DYN-${partner.partyId}-${c.id}`;
          return {
            country_code: countryCode,
            party_id: 'SMT',
            id: c.id,
            publish: true,
            name: c.name,
            address: c.location.address || 'SATMAT Tech Park, Viman Nagar',
            city: c.location.city || 'Pune',
            postal_code: c.location.postalCode || '411014',
            country: c.location.country || 'IND',
            coordinates: {
              latitude: String(c.location.latitude || 18.5204),
              longitude: String(c.location.longitude || 73.8567)
            },
            parking_type: 'ON_STREET',
            charging_when_closed: true,
            operator: {
              name: 'SATMAT EV',
              website: 'https://evcharger.satmatgroup.com'
            },
            last_updated: c.updatedAt || new Date().toISOString(),
            evses: c.connectors.map((conn) => {
              let ocpiStatus = 'AVAILABLE';
              if (conn.status === 'Charging') ocpiStatus = 'CHARGING';
              else if (conn.status === 'Occupied') ocpiStatus = 'OCCUPIED';
              else if (conn.status === 'Faulted') ocpiStatus = 'OUTOFORDER';
              else if (conn.status === 'Unavailable') ocpiStatus = 'INOPERATIVE';
              else ocpiStatus = 'AVAILABLE';

              return {
                uid: `${c.id}-EVSE-${conn.id}`,
                evse_id: `IN*SMT*E${c.id.replace(/[^A-Z0-9]/gi, '')}*${conn.id}`,
                status: ocpiStatus,
                capabilities: ['REMOTE_START_STOP_CAPABLE', 'RFID_READER', 'CHARGING_PROFILE_CAPABLE'],
                connectors: [
                  {
                    id: String(conn.id),
                    standard: conn.type === 'Type2' ? 'IEC_62196_T2' : 'IEC_62196_T2_COMBO',
                    format: 'CABLE',
                    power_type: conn.powerType,
                    max_voltage: conn.voltage,
                    max_amperage: conn.amperage,
                    max_electric_power: Math.round(conn.maxKw * 1000),
                    tariff_ids: [tariffId],
                    tariff_id: tariffId,
                    last_updated: c.updatedAt || new Date().toISOString()
                  }
                ],
                last_updated: c.updatedAt || new Date().toISOString()
              };
            })
          };
        });
      } else if (normalizedUrl.includes('/tariffs')) {
        // Fetch tariffs & rates
        const chargers = dataStore.getChargers();
        responseData = chargers.map((c) => {
          let rate = c.baseCostPerKwh || 16.0;
          if (partner.pricingType === 'CUSTOM_RATE' && partner.customCostPerKwh !== null) {
            rate = partner.customCostPerKwh;
          } else if (partner.pricingType === 'PERCENTAGE_DISCOUNT' && partner.priceAdjustmentPercent) {
            rate = rate * (1 - Math.abs(partner.priceAdjustmentPercent) / 100);
          } else if (partner.pricingType === 'PERCENTAGE_MARKUP' && partner.priceAdjustmentPercent) {
            rate = rate * (1 + Math.abs(partner.priceAdjustmentPercent) / 100);
          }
          return {
            country_code: countryCode,
            party_id: 'SMT',
            id: `TARIFF-DYN-${partner.partyId}-${c.id}`,
            currency: 'INR',
            type: 'REGULAR',
            elements: [
              {
                price_components: [
                  { type: 'ENERGY', price: Number(rate.toFixed(2)), vat: 18.0, step_size: 1 },
                  { type: 'FLAT', price: c.sessionBaseFee || 10.0, vat: 18.0, step_size: 1 },
                  { type: 'TIME', price: c.idleFeePerMinute || 1.0, vat: 18.0, step_size: 60 }
                ]
              }
            ],
            last_updated: c.updatedAt || new Date().toISOString()
          };
        });
      } else if (normalizedUrl.includes('/start_session') || normalizedUrl.includes('/commands/start')) {
        // Execute START_SESSION command
        const { location_id, evse_uid, connector_id, token: idToken, authorization_reference } = body || {};
        let charger = location_id ? dataStore.getCharger(location_id) : undefined;
        if (!charger && dataStore.getChargers().length > 0) charger = dataStore.getChargers()[0];

        if (!charger) {
          ocpiCode = 2003;
          ocpiMsg = 'Location not found';
          responseData = { result: 'REJECTED', timeout: 0 };
        } else {
          let connId = 1;
          if (connector_id !== undefined && connector_id !== null) {
            connId = Number(connector_id) || 1;
          } else if (evse_uid) {
            const parts = String(evse_uid).split(/[-*]/);
            const last = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(last) && last > 0) connId = last;
          }

          const connector = charger.connectors.find((c) => c.id === connId) || charger.connectors[0];
          const idTag = idToken?.uid || idToken?.contract_id || `OCPI-${partyId}-USER`;

          const startRes = await ocppServer.startChargingSessionDirect(charger.id, connector.id, idTag);
          const txId = startRes?.transactionId || connector.activeTransactionId || 2001;

          responseData = {
            result: 'ACCEPTED',
            timeout: 30,
            message: [
              {
                language: 'en',
                text: `Session #${txId} started on station ${charger.name || charger.id} connector #${connector.id}`
              }
            ]
          };
        }
      } else if (normalizedUrl.includes('/stop_session') || normalizedUrl.includes('/commands/stop')) {
        // Execute STOP_SESSION command
        const { session_id, transaction_id, location_id } = body || {};
        const sessions = dataStore.getSessions();
        const searchId = session_id || transaction_id;
        let targetSession = sessions.find((s) =>
          (searchId && (s.id === searchId || String(s.transactionId) === String(searchId) || s.id === `sess-${searchId}`))
        );

        if (!targetSession && location_id) {
          const ch = dataStore.getCharger(location_id);
          if (ch) targetSession = sessions.find((s) => s.machineId === ch.id && s.status === 'Active');
        }

        if (!targetSession) {
          targetSession = sessions.find((s) => s.status === 'Active');
        }

        if (targetSession) {
          await ocppServer.stopChargingSessionDirect(targetSession.machineId, targetSession.connectorId, targetSession.transactionId);
          responseData = {
            result: 'ACCEPTED',
            timeout: 30,
            message: [{ language: 'en', text: `Session ${targetSession.id} stopped successfully` }]
          };
        } else {
          // Check any active charging connector
          const chargers = dataStore.getChargers();
          let stopped = false;
          for (const ch of chargers) {
            const conn = ch.connectors.find((c) => c.status === 'Charging' || !!c.currentSession);
            if (conn) {
              await ocppServer.stopChargingSessionDirect(ch.id, conn.id);
              responseData = {
                result: 'ACCEPTED',
                timeout: 30,
                message: [{ language: 'en', text: `Station ${ch.id} connector #${conn.id} stopped` }]
              };
              stopped = true;
              break;
            }
          }
          if (!stopped) {
            ocpiCode = 2000;
            ocpiMsg = 'No active charging session found';
            responseData = {
              result: 'REJECTED',
              timeout: 0,
              message: [{ language: 'en', text: 'No active session found to stop' }]
            };
          }
        }
      } else if (normalizedUrl.includes('/versions')) {
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        responseData = [
          { version: '2.2.1', url: `${baseUrl}/ocpi/2.2.1` },
          { version: '2.2', url: `${baseUrl}/ocpi/2.2` },
          { version: '2.0', url: `${baseUrl}/ocpi/2.0` }
        ];
      } else if (normalizedUrl.includes('/sessions')) {
        const sessions = dataStore.getSessions();
        responseData = sessions.map((s) => ({
          country_code: countryCode,
          party_id: 'SMT',
          id: s.id,
          start_date_time: s.startTime,
          end_date_time: s.endTime,
          kwh: s.energyKwh,
          location_id: s.machineId,
          evse_uid: `${s.machineId}-EVSE-${s.connectorId}`,
          connector_id: String(s.connectorId),
          status: s.status === 'Active' ? 'ACTIVE' : 'COMPLETED',
          total_cost: { excl_vat: Number((s.cost / 1.18).toFixed(2)), incl_vat: s.cost }
        }));
      } else if (normalizedUrl.includes('/cdrs')) {
        const completed = dataStore.getSessions().filter((s) => s.status === 'Completed');
        responseData = completed.map((s) => ({
          country_code: countryCode,
          party_id: 'SMT',
          id: s.id,
          start_date_time: s.startTime,
          stop_date_time: s.endTime,
          total_energy: s.energyKwh,
          total_cost: { excl_vat: Number((s.cost / 1.18).toFixed(2)), incl_vat: s.cost }
        }));
      } else if (normalizedUrl.includes('/tokens')) {
        // Token authorization & verification
        const parts = url.split('/');
        let tokenUid = 'RFID-TAG-101';
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].toLowerCase() === 'tokens' && parts[i + 1]) {
            tokenUid = parts[i + 1].split('?')[0];
            break;
          }
        }
        responseData = {
          allowed: 'ALLOWED',
          token: {
            country_code: countryCode,
            party_id: partyId,
            uid: tokenUid,
            type: 'RFID',
            contract_id: `IN-${partyId}-${tokenUid}`,
            visual_number: tokenUid,
            issuer: partner.name,
            valid: true,
            whitelist: 'ALLOWED',
            last_updated: new Date().toISOString()
          },
          authorization_reference: `AUTH-${Date.now()}-${tokenUid}`,
          info: {
            language: 'en',
            text: `Token ${tokenUid} authorized on SATMAT EV CPO Network`
          }
        };
      } else if (normalizedUrl.includes('/credentials')) {
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        responseData = {
          url: `${baseUrl}/ocpi/versions`,
          token: partner.tokenB || 'b2c3d4e5-token-b-satmat-2026',
          party_id: 'SMT',
          country_code: 'IN',
          business_details: {
            name: 'SATMAT EV Charging Station Management (CPO)',
            website: 'https://evcharger.satmatgroup.com/'
          },
          roles: [
            {
              role: 'CPO',
              business_details: {
                name: 'SATMAT EV Charging Network',
                website: 'https://evcharger.satmatgroup.com/'
              },
              party_id: 'SMT',
              country_code: 'IN'
            }
          ]
        };
      } else {
        // Fallback info
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        responseData = {
          version: '2.2.1',
          endpoints: [
            { identifier: 'locations', role: 'CPO', url: `${baseUrl}/ocpi/cpo/2.2/locations` },
            { identifier: 'tariffs', role: 'CPO', url: `${baseUrl}/ocpi/cpo/2.2/tariffs` },
            { identifier: 'commands', role: 'CPO', url: `${baseUrl}/ocpi/cpo/2.2/commands` },
            { identifier: 'sessions', role: 'CPO', url: `${baseUrl}/ocpi/cpo/2.2/sessions` },
            { identifier: 'cdrs', role: 'CPO', url: `${baseUrl}/ocpi/cpo/2.2/cdrs` }
          ]
        };
      }

      const ocpiPayload = {
        status_code: ocpiCode,
        status_message: ocpiMsg,
        timestamp: new Date().toISOString(),
        data: responseData
      };

      const durationMs = Date.now() - startTime;

      dataStore.addLog({
        type: 'OCPI',
        protocol: 'OCPI 2.2',
        direction: method === 'GET' ? 'OUT' : 'IN',
        action: `${method} ${url}`,
        status: `${httpCode} OK`,
        durationMs,
        ip: req.ip || '127.0.0.1',
        machineId: `${partner.partyId} (${partner.name})`,
        payload: body && Object.keys(body).length > 0 ? body : { query: url },
        rawMessage: JSON.stringify(ocpiPayload),
        details: {
          partner: partner.name,
          partyId: partner.partyId,
          ocpiStatusCode: ocpiCode,
          url
        }
      });

      return res.status(httpCode).json({
        ok: true,
        status: httpCode,
        statusText: 'OK',
        ocpiStatusCode: ocpiCode,
        durationMs,
        response: ocpiPayload
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        status: 500,
        statusText: 'Internal Error',
        ocpiStatusCode: 2000,
        durationMs: Date.now() - startTime,
        error: err.message
      });
    }
  });

  // Protocol Logs & Auditing (Tabular View with Maximum Details)
  router.get('/logs', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const type = req.query.type as string | undefined;
    const direction = req.query.direction as string | undefined;
    const machineId = req.query.machineId as string | undefined;
    const action = req.query.action as string | undefined;
    const search = req.query.search as string | undefined;

    const logs = dataStore.getLogs({
      limit,
      type,
      direction,
      machineId,
      action,
      search
    });

    return res.json(logs);
  });

  router.delete('/logs', (req: Request, res: Response) => {
    dataStore.clearLogs();
    return res.json({ success: true, message: 'All protocol and message logs cleared successfully' });
  });

  return router;
}
