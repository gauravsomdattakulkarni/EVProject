import express, { Request, Response, NextFunction, Router } from 'express';
import { dataStore, OcpiPartner, Charger } from './dataStore.js';

let activeOcppServerInstance: any = null;

export function setOcppServerForOcpi(ocppServer: any) {
  activeOcppServerInstance = ocppServer;
}

export function createOcpiRouter(ocppServer?: any): Router {
  if (ocppServer) {
    activeOcppServerInstance = ocppServer;
  }
  return ocpiRouter;
}

export const ocpiRouter = express.Router();

// Middleware to track OCPI request start
ocpiRouter.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any)._startTime = Date.now();
  next();
});

// Helper to asynchronously post CommandResult to response_url as mandated by OCPI 2.2.1
async function dispatchAsyncCallback(responseUrl: string, payload: any, token?: string) {
  if (!responseUrl || !responseUrl.startsWith('http')) return;
  setTimeout(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Token ${token}`;
      }
      await fetch(responseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      }).catch(() => {});
    } catch {
      // Async callback error non-blocking
    }
  }, 500);
}

// Helper for standard OCPI 2.2.1 response with detailed logging and pagination headers
export function ocpiResponse(
  res: Response,
  data: any,
  statusCode = 1000,
  message = 'Success',
  httpCode = 200,
  req?: Request,
  pagination?: { totalCount: number; limit: number; offset?: number }
) {
  const reqObj: any = req || (res as any).req;
  const durationMs = reqObj?._startTime ? Date.now() - reqObj._startTime : undefined;
  const partner = reqObj?.ocpiPartner as OcpiPartner | undefined;
  const method = reqObj?.method || 'GET';
  const url = reqObj?.originalUrl || reqObj?.url || '/ocpi';

  if (pagination) {
    res.setHeader('X-Total-Count', String(pagination.totalCount));
    res.setHeader('X-Limit', String(pagination.limit));
  }

  const bodyData = {
    status_code: statusCode,
    status_message: message,
    timestamp: new Date().toISOString(),
    data
  };

  try {
    dataStore.addLog({
      type: 'OCPI',
      protocol: 'OCPI 2.2.1',
      direction: 'OUT',
      action: `${method} ${url}`,
      status: statusCode === 1000 ? `${httpCode} OK` : `Error ${statusCode}`,
      durationMs,
      ip: reqObj?.ip || '127.0.0.1',
      machineId: partner ? `${partner.partyId} (${partner.name})` : 'External eMSP Partner',
      payload: reqObj?.body && Object.keys(reqObj.body).length > 0 ? reqObj.body : (reqObj?.query || {}),
      rawMessage: JSON.stringify(bodyData),
      details: {
        partnerId: partner?.id,
        partyId: partner?.partyId,
        countryCode: partner?.countryCode,
        httpStatus: httpCode,
        ocpiStatusCode: statusCode,
        message
      }
    });
  } catch {}

  return res.status(httpCode).json(bodyData);
}

// Authentication middleware for OCPI CPO endpoints (Supports Token <token> and Bearer <token>)
export function ocpiAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return ocpiResponse(
      res,
      null,
      2001,
      'Missing Authorization Header. External eMSP must send: Authorization: Token <token_b>',
      401,
      req
    );
  }

  const token = authHeader.replace(/^(Bearer|Token)\s+/i, '').trim();
  const partner = dataStore.findPartnerByToken(token);

  if (!partner) {
    return ocpiResponse(
      res,
      null,
      2002,
      'Invalid or unrecognized OCPI token. Please use the Token B provided in your CPO onboarding credentials.',
      401,
      req
    );
  }

  if (partner.status !== 'ACTIVE') {
    return ocpiResponse(res, null, 2003, `Partner account is ${partner.status.toLowerCase()}`, 403, req);
  }

  // Update last accessed time
  partner.lastAccessAt = new Date().toISOString();
  (req as any).ocpiPartner = partner;
  next();
}

// Dynamic Tariff Calculation based on CPO base rate and eMSP partner contract
function calculateDynamicTariff(partner: OcpiPartner, charger: Charger) {
  let rate = charger.baseCostPerKwh || 16.0;
  if (partner.pricingType === 'CUSTOM_RATE' && partner.customCostPerKwh !== null) {
    rate = partner.customCostPerKwh;
  } else if (partner.pricingType === 'PERCENTAGE_DISCOUNT' && partner.priceAdjustmentPercent) {
    rate = rate * (1 - Math.abs(partner.priceAdjustmentPercent) / 100);
  } else if (partner.pricingType === 'PERCENTAGE_MARKUP' && partner.priceAdjustmentPercent) {
    rate = rate * (1 + Math.abs(partner.priceAdjustmentPercent) / 100);
  }
  return Number(rate.toFixed(2));
}

// ==============================================================================
// 1. Root Versions Endpoint (Standard OCPI 2.2.1 / 2.2 / 2.0)
// ==============================================================================
ocpiRouter.get(['/versions', '/'], (req: Request, res: Response) => {
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return ocpiResponse(res, [
    {
      version: '2.2.1',
      url: `${baseUrl}/ocpi/2.2.1`
    },
    {
      version: '2.2',
      url: `${baseUrl}/ocpi/2.2`
    },
    {
      version: '2.0',
      url: `${baseUrl}/ocpi/2.0`
    }
  ], 1000, 'Success', 200, req);
});

// Version 2.2.1 and 2.2 Module Endpoints List (Official CPO Role)
ocpiRouter.get(
  ['/2.2.1', '/2.2', '/2.2.1/versions', '/2.2/versions', '/2.2.1/details', '/2.2/details'],
  (req: Request, res: Response) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    return ocpiResponse(res, {
      version: '2.2.1',
      endpoints: [
        {
          identifier: 'credentials',
          role: 'CPO',
          url: `${baseUrl}/ocpi/cpo/2.2.1/credentials`
        },
        {
          identifier: 'locations',
          role: 'CPO',
          url: `${baseUrl}/ocpi/cpo/2.2.1/locations`
        },
        {
          identifier: 'tariffs',
          role: 'CPO',
          url: `${baseUrl}/ocpi/cpo/2.2.1/tariffs`
        },
        {
          identifier: 'tokens',
          role: 'CPO',
          url: `${baseUrl}/ocpi/cpo/2.2.1/tokens`
        },
        {
          identifier: 'commands',
          role: 'CPO',
          url: `${baseUrl}/ocpi/cpo/2.2.1/commands`
        },
        {
          identifier: 'sessions',
          role: 'CPO',
          url: `${baseUrl}/ocpi/cpo/2.2.1/sessions`
        },
        {
          identifier: 'cdrs',
          role: 'CPO',
          url: `${baseUrl}/ocpi/cpo/2.2.1/cdrs`
        }
      ]
    }, 1000, 'Success', 200, req);
  }
);

// Version 2.0 Module Endpoints List
ocpiRouter.get(['/2.0', '/2.0/versions'], (req: Request, res: Response) => {
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return ocpiResponse(res, {
    version: '2.0',
    endpoints: [
      { identifier: 'credentials', url: `${baseUrl}/ocpi/cpo/2.0/credentials` },
      { identifier: 'locations', url: `${baseUrl}/ocpi/cpo/2.0/locations` },
      { identifier: 'tariffs', url: `${baseUrl}/ocpi/cpo/2.0/tariffs` },
      { identifier: 'commands', url: `${baseUrl}/ocpi/cpo/2.0/commands` },
      { identifier: 'sessions', url: `${baseUrl}/ocpi/cpo/2.0/sessions` },
      { identifier: 'cdrs', url: `${baseUrl}/ocpi/cpo/2.0/cdrs` }
    ]
  }, 1000, 'Success', 200, req);
});

// ==============================================================================
// 2. Credentials Module (OCPI 2.2.1 / 2.2 / 2.0 CPO Interface)
// ==============================================================================
ocpiRouter.get(
  [
    '/cpo/2.2.1/credentials',
    '/cpo/2.2/credentials',
    '/cpo/2.0/credentials',
    '/2.2.1/credentials',
    '/2.2/credentials',
    '/credentials'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    return ocpiResponse(res, {
      url: `${baseUrl}/ocpi/versions`,
      token: partner.tokenB || 'b2c3d4e5-token-b-satmat-2026',
      party_id: 'SMT',
      country_code: 'IN',
      business_details: {
        name: 'SATMAT EV Charging Station Management (CPO)',
        website: 'https://evcharger.satmatgroup.com/',
        logo: {
          url: `${baseUrl}/satmat-ev-logo.png`,
          category: 'OPERATOR',
          type: 'png'
        }
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
    }, 1000, 'Success', 200, req);
  }
);

// Registration handshake (Token A -> Token B)
ocpiRouter.post(
  [
    '/cpo/2.2.1/credentials',
    '/cpo/2.2/credentials',
    '/cpo/2.0/credentials',
    '/2.2.1/credentials',
    '/2.2/credentials',
    '/credentials'
  ],
  (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return ocpiResponse(res, null, 2001, 'Missing Token A authorization header', 401, req);
    }
    const token = authHeader.replace(/^(Bearer|Token)\s+/i, '').trim();
    const partner = dataStore.findPartnerByToken(token);

    if (!partner) {
      return ocpiResponse(res, null, 2001, 'Invalid Registration Token A', 401, req);
    }

    const { token: clientToken, url: clientUrl, party_id, country_code } = req.body || {};
    if (clientToken) partner.partnerToken = clientToken;
    if (clientUrl) partner.url = clientUrl;
    if (party_id) partner.partyId = party_id;
    if (country_code) partner.countryCode = country_code;
    partner.status = 'ACTIVE';

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    dataStore.addLog({
      type: 'OCPI',
      direction: 'IN',
      action: 'CredentialsHandshake',
      payload: { partner: partner.name, party_id: partner.partyId }
    });

    return ocpiResponse(res, {
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
    }, 1000, 'Success', 200, req);
  }
);

// PUT credentials (Update credentials)
ocpiRouter.put(
  ['/cpo/2.2.1/credentials', '/cpo/2.2/credentials', '/2.2.1/credentials', '/credentials'],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const { token: clientToken, url: clientUrl, party_id, country_code } = req.body || {};
    if (clientToken) partner.partnerToken = clientToken;
    if (clientUrl) partner.url = clientUrl;
    if (party_id) partner.partyId = party_id;
    if (country_code) partner.countryCode = country_code;

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    return ocpiResponse(res, {
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
    }, 1000, 'Credentials updated successfully', 200, req);
  }
);

// DELETE credentials (Unregister partner)
ocpiRouter.delete(
  ['/cpo/2.2.1/credentials', '/cpo/2.2/credentials', '/2.2.1/credentials', '/credentials'],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    partner.status = 'SUSPENDED';
    return ocpiResponse(res, null, 1000, 'Partner credentials removed successfully', 200, req);
  }
);

// ==============================================================================
// 3. Locations & EVSEs Module (Official OCPI 2.2.1 CPO Interface)
// Discover Chargers & EVSEs
// ==============================================================================
ocpiRouter.get(
  [
    '/cpo/2.2.1/locations',
    '/cpo/2.2/locations',
    '/cpo/2.0/locations',
    '/2.2.1/locations',
    '/2.2/locations',
    '/locations'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    let chargers = dataStore.getChargers();

    // Query parameters: date_from, date_to, offset, limit
    const { date_from, date_to, offset = '0', limit = '50' } = req.query;
    if (date_from) {
      chargers = chargers.filter((c) => !c.updatedAt || new Date(c.updatedAt) >= new Date(String(date_from)));
    }
    if (date_to) {
      chargers = chargers.filter((c) => !c.updatedAt || new Date(c.updatedAt) <= new Date(String(date_to)));
    }

    const totalCount = chargers.length;
    const numOffset = Math.max(0, parseInt(String(offset), 10) || 0);
    const numLimit = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 50));
    const paginatedChargers = chargers.slice(numOffset, numOffset + numLimit);

    const ocpiLocations = paginatedChargers.map((charger) => {
      const tariffId = `TARIFF-DYN-${partner.partyId}-${charger.id}`;

      return {
        country_code: 'IN',
        party_id: 'SMT',
        id: charger.id,
        publish: true,
        publish_allowed_to: [],
        name: charger.name,
        address: charger.location.address || 'SATMAT Tech Park, Viman Nagar',
        city: charger.location.city || 'Pune',
        postal_code: charger.location.postalCode || '411014',
        country: charger.location.country || 'IND',
        coordinates: {
          latitude: String(charger.location.latitude || 18.5679),
          longitude: String(charger.location.longitude || 73.9143)
        },
        parking_type: 'ON_STREET',
        charging_when_closed: true,
        operator: {
          name: 'SATMAT EV',
          website: 'https://evcharger.satmatgroup.com'
        },
        last_updated: charger.updatedAt || new Date().toISOString(),
        evses: charger.connectors.map((connector) => {
          let ocpiStatus = 'AVAILABLE';
          if (connector.status === 'Charging') ocpiStatus = 'CHARGING';
          else if (connector.status === 'Occupied') ocpiStatus = 'OCCUPIED';
          else if (connector.status === 'Faulted') ocpiStatus = 'OUTOFORDER';
          else if (connector.status === 'Unavailable') ocpiStatus = 'INOPERATIVE';
          else if (connector.status === 'Reserved') ocpiStatus = 'RESERVED';
          else ocpiStatus = 'AVAILABLE';

          let ocpiStandard = 'IEC_62196_T2_COMBO';
          if (connector.type === 'Type2') ocpiStandard = 'IEC_62196_T2';
          else if (connector.type === 'CHAdeMO') ocpiStandard = 'CHADEMO';
          else if (connector.type === 'GB_T') ocpiStandard = 'GBT';
          else if (connector.type === 'Bharat_DC001') ocpiStandard = 'DOMESTIC_F';

          return {
            uid: `${charger.id}-EVSE-${connector.id}`,
            evse_id: `IN*SMT*E${charger.id.replace(/[^A-Z0-9]/gi, '')}*${connector.id}`,
            status: ocpiStatus,
            status_schedule: [],
            capabilities: [
              'REMOTE_START_STOP_CAPABLE',
              'RFID_READER',
              'CHARGING_PROFILE_CAPABLE',
              'RESERVABLE'
            ],
            connectors: [
              {
                id: String(connector.id),
                standard: ocpiStandard,
                format: 'CABLE',
                power_type: connector.powerType,
                max_voltage: connector.voltage,
                max_amperage: connector.amperage,
                max_electric_power: Math.round(connector.maxKw * 1000),
                tariff_ids: [tariffId],
                tariff_id: tariffId,
                last_updated: charger.updatedAt || new Date().toISOString()
              }
            ],
            physical_reference: `Bay ${connector.id}`,
            last_updated: charger.updatedAt || new Date().toISOString()
          };
        })
      };
    });

    dataStore.addLog({
      type: 'OCPI',
      protocol: 'OCPI 2.2.1',
      direction: 'OUT',
      action: 'DiscoverChargers',
      payload: { partner: partner.name, party_id: partner.partyId, count: ocpiLocations.length }
    });

    return ocpiResponse(
      res,
      ocpiLocations,
      1000,
      'Success',
      200,
      req,
      { totalCount, limit: numLimit, offset: numOffset }
    );
  }
);

// Single Location: GET /locations/:id
ocpiRouter.get(
  [
    '/cpo/2.2.1/locations/:id',
    '/cpo/2.2/locations/:id',
    '/cpo/2.0/locations/:id',
    '/2.2.1/locations/:id',
    '/2.2/locations/:id',
    '/locations/:id'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const charger = dataStore.getCharger(req.params.id);
    if (!charger) {
      return ocpiResponse(res, null, 2003, `Location with machine ID ${req.params.id} not found`, 404, req);
    }
    const tariffId = `TARIFF-DYN-${partner.partyId}-${charger.id}`;

    return ocpiResponse(res, {
      country_code: 'IN',
      party_id: 'SMT',
      id: charger.id,
      publish: true,
      name: charger.name,
      address: charger.location.address,
      city: charger.location.city,
      postal_code: charger.location.postalCode,
      country: charger.location.country,
      coordinates: {
        latitude: String(charger.location.latitude),
        longitude: String(charger.location.longitude)
      },
      parking_type: 'ON_STREET',
      charging_when_closed: true,
      operator: {
        name: 'SATMAT EV',
        website: 'https://evcharger.satmatgroup.com'
      },
      evses: charger.connectors.map((c) => ({
        uid: `${charger.id}-EVSE-${c.id}`,
        evse_id: `IN*SMT*E${charger.id.replace(/[^A-Z0-9]/gi, '')}*${c.id}`,
        status: c.status === 'Charging' ? 'CHARGING' : (c.status === 'Faulted' ? 'OUTOFORDER' : 'AVAILABLE'),
        capabilities: ['REMOTE_START_STOP_CAPABLE', 'RFID_READER', 'RESERVABLE'],
        connectors: [
          {
            id: String(c.id),
            standard: c.type === 'CCS2' ? 'IEC_62196_T2_COMBO' : (c.type === 'Type2' ? 'IEC_62196_T2' : c.type),
            format: 'CABLE',
            power_type: c.powerType,
            max_voltage: c.voltage,
            max_amperage: c.amperage,
            max_electric_power: Math.round(c.maxKw * 1000),
            tariff_ids: [tariffId],
            tariff_id: tariffId,
            last_updated: charger.updatedAt
          }
        ],
        physical_reference: `Bay ${c.id}`,
        last_updated: charger.updatedAt
      })),
      last_updated: charger.updatedAt
    }, 1000, 'Success', 200, req);
  }
);

// Single EVSE Sub-resource: GET /locations/:id/:evse_uid
ocpiRouter.get(
  [
    '/cpo/2.2.1/locations/:id/:evse_uid',
    '/cpo/2.2/locations/:id/:evse_uid',
    '/locations/:id/:evse_uid'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const charger = dataStore.getCharger(req.params.id);
    if (!charger) {
      return ocpiResponse(res, null, 2003, `Location with machine ID ${req.params.id} not found`, 404, req);
    }
    const evseUid = req.params.evse_uid;
    const parts = evseUid.split(/[-*]/);
    const connId = parseInt(parts[parts.length - 1], 10) || 1;
    const connector = charger.connectors.find((c) => c.id === connId) || charger.connectors[0];
    const tariffId = `TARIFF-DYN-${partner.partyId}-${charger.id}`;

    return ocpiResponse(res, {
      uid: `${charger.id}-EVSE-${connector.id}`,
      evse_id: `IN*SMT*E${charger.id.replace(/[^A-Z0-9]/gi, '')}*${connector.id}`,
      status: connector.status === 'Charging' ? 'CHARGING' : 'AVAILABLE',
      capabilities: ['REMOTE_START_STOP_CAPABLE', 'RFID_READER'],
      connectors: [
        {
          id: String(connector.id),
          standard: connector.type === 'CCS2' ? 'IEC_62196_T2_COMBO' : 'IEC_62196_T2',
          format: 'CABLE',
          power_type: connector.powerType,
          max_voltage: connector.voltage,
          max_amperage: connector.amperage,
          max_electric_power: Math.round(connector.maxKw * 1000),
          tariff_ids: [tariffId],
          last_updated: charger.updatedAt
        }
      ],
      last_updated: charger.updatedAt
    }, 1000, 'Success', 200, req);
  }
);

// Single Connector Sub-resource: GET /locations/:id/:evse_uid/:connector_id
ocpiRouter.get(
  [
    '/cpo/2.2.1/locations/:id/:evse_uid/:connector_id',
    '/cpo/2.2/locations/:id/:evse_uid/:connector_id',
    '/locations/:id/:evse_uid/:connector_id'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const charger = dataStore.getCharger(req.params.id);
    if (!charger) {
      return ocpiResponse(res, null, 2003, `Location ${req.params.id} not found`, 404, req);
    }
    const connId = parseInt(req.params.connector_id, 10) || 1;
    const connector = charger.connectors.find((c) => c.id === connId) || charger.connectors[0];
    const tariffId = `TARIFF-DYN-${partner.partyId}-${charger.id}`;

    return ocpiResponse(res, {
      id: String(connector.id),
      standard: connector.type === 'CCS2' ? 'IEC_62196_T2_COMBO' : 'IEC_62196_T2',
      format: 'CABLE',
      power_type: connector.powerType,
      max_voltage: connector.voltage,
      max_amperage: connector.amperage,
      max_electric_power: Math.round(connector.maxKw * 1000),
      tariff_ids: [tariffId],
      last_updated: charger.updatedAt
    }, 1000, 'Success', 200, req);
  }
);

// ==============================================================================
// 4. Tariffs Module (Dynamic Pricing per Partner & Machine)
// ==============================================================================
ocpiRouter.get(
  [
    '/cpo/2.2.1/tariffs',
    '/cpo/2.2/tariffs',
    '/cpo/2.0/tariffs',
    '/2.2.1/tariffs',
    '/2.2/tariffs',
    '/tariffs'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const chargers = dataStore.getChargers();

    const tariffs = chargers.map((charger) => {
      const finalRate = calculateDynamicTariff(partner, charger);
      const tariffId = `TARIFF-DYN-${partner.partyId}-${charger.id}`;

      return {
        country_code: 'IN',
        party_id: 'SMT',
        id: tariffId,
        currency: 'INR',
        type: 'REGULAR',
        elements: [
          {
            price_components: [
              {
                type: 'ENERGY',
                price: finalRate,
                vat: 18.0,
                step_size: 1
              },
              {
                type: 'FLAT',
                price: charger.sessionBaseFee || 10.0,
                vat: 18.0,
                step_size: 1
              },
              {
                type: 'TIME',
                price: charger.idleFeePerMinute || 1.0,
                vat: 18.0,
                step_size: 60
              }
            ]
          }
        ],
        last_updated: charger.updatedAt || new Date().toISOString()
      };
    });

    return ocpiResponse(res, tariffs, 1000, 'Success', 200, req, {
      totalCount: tariffs.length,
      limit: 50,
      offset: 0
    });
  }
);

// Single Tariff: GET /tariffs/:id
ocpiRouter.get(
  [
    '/cpo/2.2.1/tariffs/:id',
    '/cpo/2.2/tariffs/:id',
    '/cpo/2.0/tariffs/:id',
    '/2.2.1/tariffs/:id',
    '/2.2/tariffs/:id',
    '/tariffs/:id'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const chargers = dataStore.getChargers();
    const charger = chargers[0];
    const finalRate = charger ? calculateDynamicTariff(partner, charger) : 16.0;

    return ocpiResponse(res, {
      country_code: 'IN',
      party_id: 'SMT',
      id: req.params.id,
      currency: 'INR',
      type: 'REGULAR',
      elements: [
        {
          price_components: [
            {
              type: 'ENERGY',
              price: finalRate,
              vat: 18.0,
              step_size: 1
            },
            {
              type: 'FLAT',
              price: charger?.sessionBaseFee || 10.0,
              vat: 18.0,
              step_size: 1
            },
            {
              type: 'TIME',
              price: charger?.idleFeePerMinute || 1.0,
              vat: 18.0,
              step_size: 60
            }
          ]
        }
      ],
      last_updated: new Date().toISOString()
    }, 1000, 'Success', 200, req);
  }
);

// ==============================================================================
// 5. Tokens Module (Official OCPI 2.2.1 Real-Time Token Authorization for eMSP)
// ==============================================================================
// POST /tokens/{token_uid}/authorize
ocpiRouter.post(
  [
    '/cpo/2.2.1/tokens/:token_uid/authorize',
    '/cpo/2.2/tokens/:token_uid/authorize',
    '/tokens/:token_uid/authorize'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const tokenUid = req.params.token_uid;
    const tokenType = String(req.query.type || 'RFID').toUpperCase();
    const locationReferences = req.body?.location_references || [];
    const authRef = `AUTH-${Date.now()}-${tokenUid.replace(/[^A-Za-z0-9]/g, '')}`;

    dataStore.addLog({
      type: 'OCPI',
      protocol: 'OCPI 2.2.1',
      direction: 'IN',
      action: 'AuthorizeToken',
      payload: {
        partner: partner.name,
        party_id: partner.partyId,
        token_uid: tokenUid,
        type: tokenType,
        location_references: locationReferences
      }
    });

    // In OCPI 2.2.1, CPO responds with AuthorizationInfo
    return ocpiResponse(res, {
      allowed: 'ALLOWED',
      token: {
        country_code: partner.countryCode || 'IN',
        party_id: partner.partyId || 'SMV',
        uid: tokenUid,
        type: tokenType,
        contract_id: `IN-${partner.partyId || 'SMV'}-${tokenUid}`,
        visual_number: tokenUid,
        issuer: partner.name || 'External eMSP Partner',
        group_id: null,
        valid: true,
        whitelist: 'ALLOWED',
        language: 'en',
        last_updated: new Date().toISOString()
      },
      location: locationReferences.length > 0 ? locationReferences[0] : undefined,
      authorization_reference: authRef,
      info: {
        language: 'en',
        text: `Token ${tokenUid} authorized on SATMAT EV CPO Network`
      }
    }, 1000, 'Token authorized successfully', 200, req);
  }
);

// GET /tokens/{country_code}/{party_id}/{token_uid}
ocpiRouter.get(
  [
    '/cpo/2.2.1/tokens/:country_code/:party_id/:token_uid',
    '/cpo/2.2/tokens/:country_code/:party_id/:token_uid',
    '/cpo/2.0/tokens/:country_code/:party_id/:token_uid',
    '/tokens/:country_code/:party_id/:token_uid'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const { country_code, party_id, token_uid } = req.params;
    return ocpiResponse(res, {
      country_code,
      party_id,
      uid: token_uid,
      type: 'RFID',
      contract_id: `IN-${party_id}-${token_uid}`,
      visual_number: token_uid,
      issuer: 'SATMAT Roaming Network (CPO)',
      group_id: null,
      valid: true,
      whitelist: 'ALLOWED',
      language: 'en',
      last_updated: new Date().toISOString()
    }, 1000, 'Success', 200, req);
  }
);

// PUT /tokens/{country_code}/{party_id}/{token_uid} (Push token into whitelist)
ocpiRouter.put(
  [
    '/cpo/2.2.1/tokens/:country_code/:party_id/:token_uid',
    '/cpo/2.2/tokens/:country_code/:party_id/:token_uid',
    '/tokens/:country_code/:party_id/:token_uid'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    return ocpiResponse(res, null, 1000, 'Token whitelist entry saved successfully', 200, req);
  }
);

// ==============================================================================
// 6. Commands Module: START_SESSION (Standard OCPI 2.2.1 / 2.2 / 2.0)
// External eMSP initiates charging on our CPO station
// ==============================================================================
ocpiRouter.post(
  [
    '/cpo/2.2.1/commands/START_SESSION',
    '/cpo/2.2/commands/START_SESSION',
    '/cpo/2.0/commands/START_SESSION',
    '/2.2.1/commands/START_SESSION',
    '/commands/START_SESSION'
  ],
  ocpiAuth,
  async (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const { location_id, evse_uid, token, connector_id, response_url, authorization_reference } = req.body || {};

    let charger = location_id ? dataStore.getCharger(location_id) : undefined;
    if (!charger) {
      const all = dataStore.getChargers();
      if (all.length > 0) charger = all[0];
    }
    if (!charger) {
      return ocpiResponse(
        res,
        { result: 'REJECTED', timeout: 0, message: [{ language: 'en', text: 'No charging station found for location_id' }] },
        2003,
        'Unknown Location',
        200,
        req
      );
    }

    // Parse connector ID from connector_id or evse_uid
    let connId = 1;
    if (connector_id !== undefined && connector_id !== null) {
      connId = Number(connector_id) || 1;
    } else if (evse_uid) {
      const parts = String(evse_uid).split(/[-*]/);
      const last = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(last) && last > 0) connId = last;
    }

    const connector = charger.connectors.find((c) => c.id === connId) || charger.connectors[0];
    if (connector && (connector.status === 'Charging' || !!connector.currentSession)) {
      return ocpiResponse(
        res,
        {
          result: 'REJECTED',
          timeout: 0,
          message: [{ language: 'en', text: `Connector #${connector.id} on station ${charger.name || charger.id} is already charging` }]
        },
        2000,
        'Connector is already charging',
        200,
        req
      );
    }

    const idTag = token?.uid || token?.contract_id || `OCPI-${partner?.partyId || 'SMV'}-USER`;

    let startResult: any = null;
    if (activeOcppServerInstance) {
      try {
        startResult = await activeOcppServerInstance.startChargingSessionDirect(charger.id, connector.id, idTag);
      } catch (err: any) {
        console.warn('[OCPI START_SESSION] error starting via ocppServer:', err.message);
      }
    }

    if (!startResult) {
      const txId = dataStore.generateNextTransactionId();
      startResult = dataStore.startSession(charger.id, connector.id, idTag, txId);
    }

    const txId = startResult?.transactionId || connector.activeTransactionId || 2001;

    dataStore.addLog({
      type: 'OCPI',
      protocol: 'OCPI 2.2.1',
      machineId: charger.id,
      connectorId: connector.id,
      transactionId: txId,
      direction: 'IN',
      action: 'START_SESSION',
      payload: {
        partner: partner?.name || 'External eMSP',
        party_id: partner?.partyId || 'SMV',
        location_id: charger.id,
        evse_uid: evse_uid || `${charger.id}-EVSE-${connector.id}`,
        connector_id: connector.id,
        token,
        authorization_reference,
        response_url
      },
      details: {
        transactionId: txId,
        result: 'ACCEPTED'
      }
    });

    // Send async CommandResult callback if response_url is specified
    if (response_url) {
      dispatchAsyncCallback(response_url, {
        result: 'ACCEPTED',
        message: [
          {
            language: 'en',
            text: `Charging session #${txId} successfully started on station ${charger.id} connector #${connector.id}`
          }
        ]
      }, partner.partnerToken || partner.tokenB);
    }

    return ocpiResponse(res, {
      result: 'ACCEPTED',
      timeout: 30,
      message: [
        {
          language: 'en',
          text: `Charging session #${txId} initiated for location ${charger.id} connector #${connector.id}`
        }
      ]
    }, 1000, 'Success', 200, req);
  }
);

// ==============================================================================
// 7. Commands Module: STOP_SESSION (Standard OCPI 2.2.1 / 2.2 / 2.0)
// External eMSP stops charging on our CPO station
// ==============================================================================
ocpiRouter.post(
  [
    '/cpo/2.2.1/commands/STOP_SESSION',
    '/cpo/2.2/commands/STOP_SESSION',
    '/cpo/2.0/commands/STOP_SESSION',
    '/2.2.1/commands/STOP_SESSION',
    '/commands/STOP_SESSION'
  ],
  ocpiAuth,
  async (req: Request, res: Response) => {
    const partner = (req as any).ocpiPartner as OcpiPartner;
    const { session_id, transaction_id, location_id, response_url } = req.body || {};

    dataStore.addLog({
      type: 'OCPI',
      protocol: 'OCPI 2.2.1',
      direction: 'IN',
      action: 'STOP_SESSION',
      payload: { partner: partner?.name || 'External eMSP', session_id, transaction_id, location_id }
    });

    // Find active session to stop
    const sessions = dataStore.getSessions();
    const searchId = session_id || transaction_id;
    let targetSession = sessions.find((s) =>
      (searchId && (s.id === searchId || String(s.transactionId) === String(searchId) || s.id === `sess-${searchId}`))
    );

    // If not found by ID but location_id specified, find active session on that charger
    if (!targetSession && location_id) {
      const charger = dataStore.getCharger(location_id);
      if (charger) {
        targetSession = sessions.find((s) => s.machineId === charger.id && s.status === 'Active');
      }
    }

    // If still not found, check any active session in the database
    if (!targetSession) {
      targetSession = sessions.find((s) => s.status === 'Active');
    }

    if (targetSession) {
      if (activeOcppServerInstance) {
        await activeOcppServerInstance.stopChargingSessionDirect(
          targetSession.machineId,
          targetSession.connectorId,
          targetSession.transactionId
        );
      } else {
        dataStore.stopSession(targetSession.machineId, targetSession.connectorId, targetSession.transactionId);
      }

      if (response_url) {
        dispatchAsyncCallback(response_url, {
          result: 'ACCEPTED',
          message: [{ language: 'en', text: `Session ${targetSession.id} stopped` }]
        }, partner.partnerToken || partner.tokenB);
      }

      return ocpiResponse(res, {
        result: 'ACCEPTED',
        timeout: 30,
        message: [
          { language: 'en', text: `Session ${targetSession.id} stopped successfully` }
        ]
      }, 1000, 'Success', 200, req);
    }

    // Fallback: check if any charger connector is charging
    const chargers = dataStore.getChargers();
    for (const ch of chargers) {
      const chargingConn = ch.connectors.find((c) => c.status === 'Charging' || !!c.currentSession);
      if (chargingConn) {
        if (activeOcppServerInstance) {
          await activeOcppServerInstance.stopChargingSessionDirect(ch.id, chargingConn.id);
        } else {
          dataStore.stopSession(ch.id, chargingConn.id);
        }

        if (response_url) {
          dispatchAsyncCallback(response_url, {
            result: 'ACCEPTED',
            message: [{ language: 'en', text: `Station ${ch.id} connector #${chargingConn.id} stopped` }]
          }, partner.partnerToken || partner.tokenB);
        }

        return ocpiResponse(res, {
          result: 'ACCEPTED',
          timeout: 30,
          message: [
            { language: 'en', text: `Station ${ch.id} connector #${chargingConn.id} stopped successfully` }
          ]
        }, 1000, 'Success', 200, req);
      }
    }

    return ocpiResponse(
      res,
      {
        result: 'REJECTED',
        timeout: 0,
        message: [{ language: 'en', text: 'No active charging session found to stop' }]
      },
      2000,
      'Session not found or already completed',
      200,
      req
    );
  }
);

// UNLOCK_CONNECTOR (Standard OCPI 2.2.1 / 2.2)
ocpiRouter.post(
  ['/cpo/2.2.1/commands/UNLOCK_CONNECTOR', '/cpo/2.2/commands/UNLOCK_CONNECTOR', '/commands/UNLOCK_CONNECTOR'],
  ocpiAuth,
  async (req: Request, res: Response) => {
    const { location_id, evse_uid, connector_id = 1, response_url } = req.body || {};
    let connId = Number(connector_id) || 1;
    if (evse_uid) {
      const parts = evse_uid.split('-');
      const last = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(last)) connId = last;
    }

    if (activeOcppServerInstance && location_id) {
      try {
        await activeOcppServerInstance.sendUnlockConnector(location_id, connId);
      } catch {}
    }

    if (response_url) {
      dispatchAsyncCallback(response_url, {
        result: 'ACCEPTED',
        message: [{ language: 'en', text: `Connector #${connId} unlocked` }]
      });
    }

    return ocpiResponse(res, {
      result: 'ACCEPTED',
      timeout: 30
    }, 1000, 'Success', 200, req);
  }
);

// RESERVE_NOW
ocpiRouter.post(
  ['/cpo/2.2.1/commands/RESERVE_NOW', '/cpo/2.2/commands/RESERVE_NOW', '/commands/RESERVE_NOW'],
  ocpiAuth,
  async (req: Request, res: Response) => {
    const { location_id, evse_uid, reservation_id } = req.body || {};
    let connId = 1;
    if (evse_uid) {
      const parts = evse_uid.split('-');
      const last = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(last)) connId = last;
    }

    if (location_id) {
      const charger = dataStore.getCharger(location_id);
      if (charger) {
        dataStore.updateConnectorStatus(charger.id, connId, 'Reserved');
      }
    }

    return ocpiResponse(res, {
      result: 'ACCEPTED',
      timeout: 30,
      message: [{ language: 'en', text: `Reservation #${reservation_id || 1} created` }]
    }, 1000, 'Success', 200, req);
  }
);

// CANCEL_RESERVATION
ocpiRouter.post(
  ['/cpo/2.2.1/commands/CANCEL_RESERVATION', '/cpo/2.2/commands/CANCEL_RESERVATION', '/commands/CANCEL_RESERVATION'],
  ocpiAuth,
  async (req: Request, res: Response) => {
    const { reservation_id } = req.body || {};
    return ocpiResponse(res, {
      result: 'ACCEPTED',
      timeout: 30,
      message: [{ language: 'en', text: `Reservation #${reservation_id} cancelled` }]
    }, 1000, 'Success', 200, req);
  }
);

// ==============================================================================
// 8. Sessions Module (Standard OCPI 2.2.1 format)
// External eMSP polls or receives active charging session telemetry
// ==============================================================================
ocpiRouter.get(
  [
    '/cpo/2.2.1/sessions',
    '/cpo/2.2/sessions',
    '/cpo/2.0/sessions',
    '/2.2.1/sessions',
    '/2.2/sessions',
    '/sessions'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    let sessions = dataStore.getSessions();
    const { date_from, date_to, offset = '0', limit = '50' } = req.query;

    if (date_from) {
      sessions = sessions.filter((s) => new Date(s.startTime) >= new Date(String(date_from)));
    }
    if (date_to) {
      sessions = sessions.filter((s) => new Date(s.startTime) <= new Date(String(date_to)));
    }

    const totalCount = sessions.length;
    const numOffset = Math.max(0, parseInt(String(offset), 10) || 0);
    const numLimit = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 50));
    const paginatedSessions = sessions.slice(numOffset, numOffset + numLimit);

    const ocpiSessions = paginatedSessions.map((s) => ({
      country_code: 'IN',
      party_id: 'SMT',
      id: s.id,
      start_date_time: s.startTime,
      end_date_time: s.endTime,
      kwh: s.energyKwh,
      cdr_token: {
        country_code: 'IN',
        party_id: 'SMT',
        uid: s.idTag,
        type: 'RFID',
        contract_id: s.idTag
      },
      auth_method: 'COMMAND',
      authorization_reference: `AUTH-${s.transactionId}`,
      location_id: s.machineId,
      evse_uid: `${s.machineId}-EVSE-${s.connectorId}`,
      connector_id: String(s.connectorId),
      meter_id: s.machineId,
      currency: 'INR',
      charging_periods: [
        {
          start_date_time: s.startTime,
          dimensions: [
            {
              type: 'ENERGY',
              volume: s.energyKwh
            },
            {
              type: 'TIME',
              volume: 0.25
            }
          ]
        }
      ],
      total_cost: {
        excl_vat: Number((s.cost / 1.18).toFixed(2)),
        incl_vat: s.cost
      },
      status: s.status === 'Active' ? 'ACTIVE' : 'COMPLETED',
      last_updated: s.endTime || s.startTime
    }));

    return ocpiResponse(
      res,
      ocpiSessions,
      1000,
      'Success',
      200,
      req,
      { totalCount, limit: numLimit, offset: numOffset }
    );
  }
);

// Single Session: GET /sessions/:id
ocpiRouter.get(
  [
    '/cpo/2.2.1/sessions/:id',
    '/cpo/2.2/sessions/:id',
    '/2.2.1/sessions/:id',
    '/sessions/:id'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const s = dataStore.getSessions().find((sess) => sess.id === req.params.id || String(sess.transactionId) === req.params.id);
    if (!s) {
      return ocpiResponse(res, null, 2000, `Session ${req.params.id} not found`, 404, req);
    }
    return ocpiResponse(res, {
      country_code: 'IN',
      party_id: 'SMT',
      id: s.id,
      start_date_time: s.startTime,
      end_date_time: s.endTime,
      kwh: s.energyKwh,
      cdr_token: {
        country_code: 'IN',
        party_id: 'SMT',
        uid: s.idTag,
        type: 'RFID',
        contract_id: s.idTag
      },
      auth_method: 'COMMAND',
      authorization_reference: `AUTH-${s.transactionId}`,
      location_id: s.machineId,
      evse_uid: `${s.machineId}-EVSE-${s.connectorId}`,
      connector_id: String(s.connectorId),
      meter_id: s.machineId,
      currency: 'INR',
      charging_periods: [],
      total_cost: {
        excl_vat: Number((s.cost / 1.18).toFixed(2)),
        incl_vat: s.cost
      },
      status: s.status === 'Active' ? 'ACTIVE' : 'COMPLETED',
      last_updated: s.endTime || s.startTime
    }, 1000, 'Success', 200, req);
  }
);

// ==============================================================================
// 9. CDRs (Charge Detail Records) Module (Official OCPI 2.2.1 format)
// External eMSP retrieves completed session records for billing and invoicing
// ==============================================================================
ocpiRouter.get(
  [
    '/cpo/2.2.1/cdrs',
    '/cpo/2.2/cdrs',
    '/cpo/2.0/cdrs',
    '/2.2.1/cdrs',
    '/2.2/cdrs',
    '/cdrs'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    let completed = dataStore.getSessions().filter((s) => s.status === 'Completed');
    const { date_from, date_to, offset = '0', limit = '50' } = req.query;

    if (date_from) {
      completed = completed.filter((s) => new Date(s.startTime) >= new Date(String(date_from)));
    }
    if (date_to) {
      completed = completed.filter((s) => new Date(s.startTime) <= new Date(String(date_to)));
    }

    const totalCount = completed.length;
    const numOffset = Math.max(0, parseInt(String(offset), 10) || 0);
    const numLimit = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 50));
    const paginatedCdrs = completed.slice(numOffset, numOffset + numLimit);

    const ocpiCdrs = paginatedCdrs.map((s) => ({
      country_code: 'IN',
      party_id: 'SMT',
      id: s.id,
      start_date_time: s.startTime,
      stop_date_time: s.endTime || s.startTime,
      auth_id: s.idTag,
      auth_method: 'COMMAND',
      authorization_reference: `AUTH-${s.transactionId}`,
      cdr_token: {
        country_code: 'IN',
        party_id: 'SMT',
        uid: s.idTag,
        type: 'RFID',
        contract_id: s.idTag
      },
      location_id: s.machineId,
      evse_uid: `${s.machineId}-EVSE-${s.connectorId}`,
      connector_id: String(s.connectorId),
      currency: 'INR',
      tariffs: [],
      charging_periods: [
        {
          start_date_time: s.startTime,
          dimensions: [
            {
              type: 'ENERGY',
              volume: s.energyKwh
            },
            {
              type: 'TIME',
              volume: 0.5
            }
          ]
        }
      ],
      total_cost: {
        excl_vat: Number((s.cost / 1.18).toFixed(2)),
        incl_vat: s.cost
      },
      total_energy: s.energyKwh,
      total_time: 0.5,
      total_parking_time: 0,
      remark: 'Settled via OCPI 2.2.1 Roaming',
      last_updated: s.endTime || s.startTime
    }));

    return ocpiResponse(
      res,
      ocpiCdrs,
      1000,
      'Success',
      200,
      req,
      { totalCount, limit: numLimit, offset: numOffset }
    );
  }
);

// Single CDR: GET /cdrs/:id
ocpiRouter.get(
  [
    '/cpo/2.2.1/cdrs/:id',
    '/cpo/2.2/cdrs/:id',
    '/2.2.1/cdrs/:id',
    '/cdrs/:id'
  ],
  ocpiAuth,
  (req: Request, res: Response) => {
    const s = dataStore.getSessions().find((sess) => sess.id === req.params.id || String(sess.transactionId) === req.params.id);
    if (!s) {
      return ocpiResponse(res, null, 2000, `CDR ${req.params.id} not found`, 404, req);
    }
    return ocpiResponse(res, {
      country_code: 'IN',
      party_id: 'SMT',
      id: s.id,
      start_date_time: s.startTime,
      stop_date_time: s.endTime || s.startTime,
      auth_id: s.idTag,
      auth_method: 'COMMAND',
      authorization_reference: `AUTH-${s.transactionId}`,
      cdr_token: {
        country_code: 'IN',
        party_id: 'SMT',
        uid: s.idTag,
        type: 'RFID',
        contract_id: s.idTag
      },
      location_id: s.machineId,
      evse_uid: `${s.machineId}-EVSE-${s.connectorId}`,
      connector_id: String(s.connectorId),
      currency: 'INR',
      tariffs: [],
      charging_periods: [],
      total_cost: {
        excl_vat: Number((s.cost / 1.18).toFixed(2)),
        incl_vat: s.cost
      },
      total_energy: s.energyKwh,
      total_time: 0.5,
      total_parking_time: 0,
      last_updated: s.endTime || s.startTime
    }, 1000, 'Success', 200, req);
  }
);
