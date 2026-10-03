import fs from 'fs';
import path from 'path';
import { mysqlClient } from './mysqlClient.js';

export interface Connector {
  id: number;
  name: string;
  type: 'CCS2' | 'Type2' | 'CHAdeMO' | 'GB_T' | 'Bharat_DC001' | 'Bharat_AC001';
  powerType: 'DC' | 'AC_3_PHASE' | 'AC_1_PHASE';
  maxKw: number;
  voltage: number;
  amperage: number;
  status: 'Available' | 'Occupied' | 'Charging' | 'Faulted' | 'Unavailable' | 'Reserved';
  activeTransactionId?: number | null;
  currentSession?: {
    transactionId: number;
    idTag: string;
    startTime: string;
    meterStart: number;
    currentKwh: number;
    currentPowerKw: number;
    currentVoltage: number;
    currentAmps: number;
    soc: number;
    cost: number;
  } | null;
}

export interface Charger {
  id: string; // Machine ID
  name: string;
  wsUrl: string;
  localWsUrl: string;
  location: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  status: 'Available' | 'Occupied' | 'Charging' | 'Offline' | 'Faulted';
  activeTransactionId?: number | null;
  isConnected: boolean;
  lastHeartbeat: string | null;
  ocppVersion: '1.6J' | '2.0.1';
  connectors: Connector[];
  baseCostPerKwh: number;
  idleFeePerMinute: number;
  sessionBaseFee: number;
  maxPowerKw: number;
  chargePointVendor: string;
  chargePointModel: string;
  firmwareVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface OcpiPartner {
  id: string;
  name: string;
  partyId: string;
  countryCode: string;
  role: 'CPO' | 'eMSP' | 'HUB';
  tokenA: string; // Token given to partner to register
  tokenB: string; // Server token for partner access
  partnerToken: string; // Token partner sends us
  url: string;
  ocpiVersion: '2.0' | '2.1.1' | '2.2' | '2.2.1';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  pricingType: 'DEFAULT' | 'CUSTOM_RATE' | 'PERCENTAGE_DISCOUNT' | 'PERCENTAGE_MARKUP';
  customCostPerKwh: number | null;
  priceAdjustmentPercent: number | null;
  notes: string;
  createdAt: string;
  lastAccessAt: string | null;
}

export interface Tariff {
  id: string;
  name: string;
  currency: string;
  pricePerKwh: number;
  pricePerMinute: number;
  idleFeePerMinute: number;
  sessionFee: number;
  taxPercentage: number;
}

export interface ChargingSessionRecord {
  id: string;
  transactionId: number;
  machineId: string;
  connectorId: number;
  idTag: string;
  startTime: string;
  endTime: string | null;
  energyKwh: number;
  cost: number;
  status: 'Active' | 'Completed' | 'Stopped';
}

export interface LogItem {
  id: string;
  timestamp: string;
  type: 'OCPP' | 'OCPI' | 'SYSTEM' | 'HTTP';
  protocol?: string;
  direction: 'IN' | 'OUT';
  action: string;
  machineId?: string;
  connectorId?: number | null;
  transactionId?: number | string | null;
  messageId?: string;
  messageTypeId?: 2 | 3 | 4 | number;
  status?: string;
  durationMs?: number;
  ip?: string;
  payload: any;
  response?: any;
  rawMessage?: string;
  details?: Record<string, any>;
}

interface DatabaseSchema {
  chargers: Charger[];
  partners: OcpiPartner[];
  tariffs: Tariff[];
  sessions: ChargingSessionRecord[];
  logs: LogItem[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'satmat_db.json');

const INITIAL_CHARGERS: Charger[] = [
  {
    id: 'SATMAT-EV-001',
    name: 'SATMAT EV Fast Charger 1',
    wsUrl: `wss://${(process.env.APP_URL || 'https://evcharger.satmatgroup.com').replace(/^https?:\/\//, '')}/ocpp/SATMAT-EV-001`,
    localWsUrl: `ws://localhost:${process.env.PORT || 3000}/ocpp/SATMAT-EV-001`,
    location: {
      name: 'SATMAT Tech Park, Viman Nagar',
      address: 'SATMAT Tech Park, Viman Nagar',
      city: 'Pune',
      postalCode: '411014',
      country: 'IND',
      latitude: 18.5679000,
      longitude: 73.9143000
    },
    status: 'Available',
    isConnected: false,
    lastHeartbeat: null,
    ocppVersion: '1.6J',
    connectors: [
      {
        id: 1,
        name: 'Connector 1 (CCS2 Fast DC)',
        type: 'CCS2',
        powerType: 'DC',
        maxKw: 60.00,
        voltage: 400,
        amperage: 150,
        status: 'Available',
        currentSession: null
      },
      {
        id: 2,
        name: 'Connector 2 (Type 2 AC)',
        type: 'Type2',
        powerType: 'AC_3_PHASE',
        maxKw: 22.00,
        voltage: 400,
        amperage: 32,
        status: 'Available',
        currentSession: null
      }
    ],
    baseCostPerKwh: 16.00,
    idleFeePerMinute: 1.00,
    sessionBaseFee: 10.00,
    maxPowerKw: 60.00,
    chargePointVendor: 'SATMAT',
    chargePointModel: 'SM-60KW-DC',
    firmwareVersion: 'v1.6.2',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const INITIAL_PARTNERS: OcpiPartner[] = [
  {
    id: 'partner-smv-live',
    name: 'SMV Mobility Roaming eMSP',
    partyId: 'SMV',
    countryCode: 'IN',
    role: 'eMSP',
    tokenA: 'a1b2c3d4-token-a-satmat-2026',
    tokenB: 'b2c3d4e5-token-b-satmat-2026',
    partnerToken: 'HUB-SATMAT-KEY-88220199',
    url: 'https://evcharger.satmatgroup.com/ocpi/2.2.1',
    ocpiVersion: '2.2',
    status: 'ACTIVE',
    pricingType: 'DEFAULT',
    customCostPerKwh: null,
    priceAdjustmentPercent: 0,
    notes: 'Official SMV Mobility eMSP Partner (Pre-configured Live Credentials)',
    createdAt: new Date().toISOString(),
    lastAccessAt: null
  },
  {
    id: 'partner-satmat-msp',
    name: 'SATMAT Roaming eMSP India',
    partyId: 'SAT',
    countryCode: 'IN',
    role: 'eMSP',
    tokenA: 'a1b2c3d4-token-a-satmat-2026',
    tokenB: 'b2c3d4e5-token-b-satmat-2026',
    partnerToken: 'c3d4e5f6-partner-token-2026',
    url: 'https://evcharger.satmatgroup.com/ocpi/versions',
    ocpiVersion: '2.2',
    status: 'ACTIVE',
    pricingType: 'DEFAULT',
    customCostPerKwh: null,
    priceAdjustmentPercent: 0,
    notes: 'Primary OCPI Roaming Network for SATMAT EV Fleet',
    createdAt: new Date().toISOString(),
    lastAccessAt: null
  }
];

const INITIAL_TARIFFS: Tariff[] = [
  {
    id: 'tariff-default-inr',
    name: 'SATMAT Standard Fast Charge Tariff',
    currency: 'INR',
    pricePerKwh: 16.00,
    pricePerMinute: 0.00,
    idleFeePerMinute: 1.00,
    sessionFee: 10.00,
    taxPercentage: 18.00
  }
];

class DataStore {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadData();
    // Non-blocking database init
    this.initDb().catch((err) => console.warn('[DataStore] DB init error:', err.message));
  }

  public async initDb(): Promise<void> {
    const isDbUp = await mysqlClient.init();
    if (!isDbUp) return;

    try {
      // 1. Synchronize Chargers
      const dbChargers = await mysqlClient.loadChargers();
      if (dbChargers && dbChargers.length > 0) {
        this.data.chargers = dbChargers;
        console.log(`[MySQL] Loaded ${dbChargers.length} charger(s) from database table 'chargers'.`);
      } else if (this.data.chargers.length > 0) {
        console.log(`[MySQL] Seeding ${this.data.chargers.length} initial charger(s) into database table 'chargers'...`);
        for (const c of this.data.chargers) {
          await mysqlClient.saveCharger(c);
        }
      }

      // 2. Synchronize Sessions
      const dbSessions = await mysqlClient.loadSessions();
      if (dbSessions && dbSessions.length > 0) {
        this.data.sessions = dbSessions;
        console.log(`[MySQL] Loaded ${dbSessions.length} session(s) from database table 'charging_sessions'.`);
      } else if (this.data.sessions.length > 0) {
        for (const s of this.data.sessions) {
          await mysqlClient.saveSession(s);
        }
      }

      // Reattach any currently active sessions to charger connectors
      for (const session of this.data.sessions) {
        if (session.status === 'Active') {
          const charger = this.getCharger(session.machineId);
          if (charger) {
            const conn = charger.connectors.find((c) => c.id === session.connectorId) || charger.connectors[0];
            if (conn) {
              const tx = Number(session.transactionId);
              conn.activeTransactionId = tx;
              conn.status = 'Charging';
              conn.currentSession = {
                transactionId: tx,
                idTag: session.idTag || 'SATMAT-ADMIN-CARD',
                startTime: session.startTime,
                meterStart: 0,
                currentKwh: session.energyKwh || 0.1,
                currentPowerKw: charger.maxPowerKw || 60,
                currentVoltage: 400,
                currentAmps: 150,
                soc: 20,
                cost: session.cost || 10
              };
              charger.activeTransactionId = tx;
              charger.status = 'Charging';
            }
          }
        }
      }

      // 3. Synchronize Partners
      const dbPartners = await mysqlClient.loadPartners();
      if (dbPartners && dbPartners.length > 0) {
        this.data.partners = dbPartners;
        console.log(`[MySQL] Loaded ${dbPartners.length} partner(s) from database table 'ocpi_partners'.`);
      } else if (this.data.partners.length > 0) {
        for (const p of this.data.partners) {
          await mysqlClient.savePartner(p);
        }
      }

      // 4. Synchronize Tariffs
      const dbTariffs = await mysqlClient.loadTariffs();
      if (dbTariffs && dbTariffs.length > 0) {
        this.data.tariffs = dbTariffs;
        console.log(`[MySQL] Loaded ${dbTariffs.length} tariff(s) from database table 'tariffs'.`);
      } else if (this.data.tariffs.length > 0) {
        for (const t of this.data.tariffs) {
          await mysqlClient.saveTariff(t);
        }
      }

      this.saveData();
    } catch (err: any) {
      console.warn('[MySQL] Error during table synchronization:', err.message);
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.chargers)) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed reading DB file, initializing empty', err);
    }

    const emptyData: DatabaseSchema = {
      chargers: INITIAL_CHARGERS,
      partners: INITIAL_PARTNERS,
      tariffs: INITIAL_TARIFFS,
      sessions: [],
      logs: []
    };
    this.saveData(emptyData);
    return emptyData;
  }

  public clearAll() {
    this.data = {
      chargers: [],
      partners: [],
      tariffs: [],
      sessions: [],
      logs: []
    };
    this.saveData();
  }

  public saveData(dataToSave?: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave || this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed saving DB file', err);
    }
  }

  public getChargers(): Charger[] {
    return this.data.chargers;
  }

  public getCharger(id: string): Charger | undefined {
    if (!id) return this.data.chargers[0];
    const clean = id.trim();
    // 1. Exact match on id
    const exact = this.data.chargers.find((c) => c.id === clean);
    if (exact) return exact;

    // 2. Case-insensitive match on id
    const caseMatch = this.data.chargers.find((c) => c.id.toLowerCase() === clean.toLowerCase());
    if (caseMatch) return caseMatch;

    // 3. Match on machine name
    const nameMatch = this.data.chargers.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    if (nameMatch) return nameMatch;

    // 4. Fallback if single charger exists in database
    if (this.data.chargers.length === 1) {
      return this.data.chargers[0];
    }

    return undefined;
  }

  private lastAssignedTxId = 2000;

  public generateNextTransactionId(): number {
    const maxInSessions = this.data.sessions.reduce((max, s) => Math.max(max, Number(s.transactionId) || 0), 2000);
    const maxInConnectors = this.data.chargers.reduce((max, c) => {
      const connMax = c.connectors.reduce((m, conn) => Math.max(m, conn.activeTransactionId || conn.currentSession?.transactionId || 0), 0);
      return Math.max(max, connMax);
    }, 2000);
    const next = Math.max(this.lastAssignedTxId, maxInSessions, maxInConnectors) + 1;
    this.lastAssignedTxId = next;
    return next;
  }

  public getActiveTransactionId(machineId: string, connectorId = 1): number | null {
    const charger = this.getCharger(machineId);
    if (!charger) return null;
    const conn = charger.connectors.find((c) => c.id === connectorId) || charger.connectors[0];

    // 1. From connector currentSession
    if (conn?.currentSession?.transactionId && Number(conn.currentSession.transactionId) > 0) {
      return Number(conn.currentSession.transactionId);
    }
    // 2. From connector activeTransactionId
    if (conn?.activeTransactionId && Number(conn.activeTransactionId) > 0) {
      return Number(conn.activeTransactionId);
    }
    // 3. From charger activeTransactionId
    if (charger.activeTransactionId && Number(charger.activeTransactionId) > 0) {
      return Number(charger.activeTransactionId);
    }
    // 4. From active session in sessions array (authoritative from DB)
    const activeSess = this.data.sessions.find((s) => 
      (s.machineId === charger.id || s.machineId.toLowerCase() === charger.id.toLowerCase()) && 
      (s.connectorId === connectorId || !connectorId) && 
      s.status === 'Active'
    ) || this.data.sessions.find((s) => 
      (s.machineId === charger.id || s.machineId.toLowerCase() === charger.id.toLowerCase()) && 
      s.status === 'Active'
    );

    if (activeSess && Number(activeSess.transactionId) > 0) {
      return Number(activeSess.transactionId);
    }

    return null;
  }

  public setActiveTransactionId(machineId: string, connectorId = 1, txId: number | null): void {
    const charger = this.getCharger(machineId);
    if (!charger) return;
    const conn = charger.connectors.find((c) => c.id === connectorId) || charger.connectors[0];
    if (conn) {
      conn.activeTransactionId = txId;
      if (txId) {
        if (!conn.currentSession) {
          conn.currentSession = {
            transactionId: txId,
            idTag: 'SATMAT-ADMIN-CARD',
            startTime: new Date().toISOString(),
            meterStart: 0,
            currentKwh: 0.1,
            currentPowerKw: charger.maxPowerKw || 60,
            currentVoltage: 400,
            currentAmps: 150,
            soc: 20,
            cost: 11.60
          };
        } else {
          conn.currentSession.transactionId = txId;
        }
      } else {
        conn.activeTransactionId = null;
        conn.currentSession = null;
      }
    }
    if (txId) {
      charger.activeTransactionId = txId;
      const activeSession = this.data.sessions.find((s) =>
        (s.machineId === charger.id || s.machineId.toLowerCase() === charger.id.toLowerCase()) &&
        (s.connectorId === (conn?.id || connectorId)) &&
        s.status === 'Active'
      );
      if (activeSession && activeSession.transactionId !== txId) {
        activeSession.transactionId = txId;
        activeSession.id = 'sess-' + txId;
        mysqlClient.saveSession(activeSession).catch((e) => console.warn('[MySQL] sync session err:', e.message));
      }
    } else {
      const anyActive = charger.connectors.some((c) => c.activeTransactionId || c.currentSession);
      if (!anyActive) charger.activeTransactionId = null;
    }
    this.saveData();
  }

  public startSession(machineId: string, connectorId = 1, idTag = 'SATMAT-ADMIN-CARD', txId?: number, meterStart = 0): { charger: Charger; session: any } | null {
    const charger = this.getCharger(machineId);
    if (!charger) return null;

    let conn = charger.connectors.find((c) => c.id === connectorId);
    if (!conn) {
      if (charger.connectors.length > 0) conn = charger.connectors[0];
      else return null;
    }

    // If explicit txId passed, use it. Otherwise if already actively charging, keep it; else generate a brand new ID
    let transactionId = (txId && Number(txId) > 0) ? Number(txId) : 0;
    if (!transactionId) {
      if (conn.status === 'Charging' && conn.activeTransactionId && Number(conn.activeTransactionId) > 0) {
        transactionId = Number(conn.activeTransactionId);
      } else {
        transactionId = this.generateNextTransactionId();
      }
    }
    const rate = charger.baseCostPerKwh || 16.00;
    const baseFee = charger.sessionBaseFee || 10.00;

    const session = {
      transactionId,
      idTag,
      startTime: new Date().toISOString(),
      meterStart,
      currentKwh: 0.1,
      currentPowerKw: charger.maxPowerKw || 60.0,
      currentVoltage: 400,
      currentAmps: 150,
      soc: 20,
      cost: Number((0.1 * rate + baseFee).toFixed(2))
    };

    conn.status = 'Charging';
    conn.activeTransactionId = transactionId;
    conn.currentSession = session;
    charger.activeTransactionId = transactionId;
    charger.status = 'Charging';
    charger.updatedAt = new Date().toISOString();

    // Check if session record already exists, otherwise add it
    const existingSessIndex = this.data.sessions.findIndex((s) => s.transactionId === transactionId && s.status === 'Active');
    if (existingSessIndex >= 0) {
      this.data.sessions[existingSessIndex] = {
        ...this.data.sessions[existingSessIndex],
        machineId: charger.id,
        connectorId: conn.id,
        idTag,
        status: 'Active'
      };
    } else {
      this.addSession({
        id: 'sess-' + transactionId,
        transactionId,
        machineId: charger.id,
        connectorId: conn.id,
        idTag,
        startTime: session.startTime,
        endTime: null,
        energyKwh: 0.1,
        cost: session.cost,
        status: 'Active'
      });
    }

    this.saveData();
    return { charger, session };
  }

  public saveCharger(chargerData: Partial<Charger> & { id: string }): Charger {
    const existingIndex = this.data.chargers.findIndex((c) => c.id === chargerData.id || c.id.toLowerCase() === chargerData.id.toLowerCase());
    const domain = process.env.APP_URL || 'https://evcharger.satmatgroup.com';
    const cleanDomain = domain.replace(/^https?:\/\//, '');
    const wsUrl = `wss://${cleanDomain}/ocpp/${chargerData.id}`;
    const localWsUrl = `ws://localhost:${process.env.PORT || 3000}/ocpp/${chargerData.id}`;

    if (existingIndex >= 0) {
      const existing = this.data.chargers[existingIndex];
      const updated: Charger = {
        ...existing,
        ...chargerData,
        wsUrl: wsUrl,
        localWsUrl: localWsUrl,
        updatedAt: new Date().toISOString()
      };
      this.data.chargers[existingIndex] = updated;
      this.saveData();
      mysqlClient.saveCharger(updated).catch((e) => console.warn('[MySQL] saveCharger err:', e.message));
      return updated;
    } else {
      const newCharger: Charger = {
        id: chargerData.id,
        name: chargerData.name || `SATMAT Charger ${chargerData.id}`,
        wsUrl: wsUrl,
        localWsUrl: localWsUrl,
        location: chargerData.location || {
          name: chargerData.name || 'Charging Station',
          address: 'Station Location',
          city: 'Pune',
          postalCode: '411001',
          country: 'IND',
          latitude: 18.5204,
          longitude: 73.8567
        },
        status: 'Offline',
        isConnected: false,
        lastHeartbeat: null,
        ocppVersion: chargerData.ocppVersion || '1.6J',
        connectors: chargerData.connectors && chargerData.connectors.length > 0 ? chargerData.connectors : [
          {
            id: 1,
            name: 'Connector 1',
            type: 'CCS2',
            powerType: 'DC',
            maxKw: 60.0,
            voltage: 400,
            amperage: 150,
            status: 'Available',
            currentSession: null
          }
        ],
        baseCostPerKwh: chargerData.baseCostPerKwh || 16.00,
        idleFeePerMinute: chargerData.idleFeePerMinute || 1.00,
        sessionBaseFee: chargerData.sessionBaseFee || 10.00,
        maxPowerKw: chargerData.maxPowerKw || 60.0,
        chargePointVendor: chargerData.chargePointVendor || 'SATMAT',
        chargePointModel: chargerData.chargePointModel || 'SM-01',
        firmwareVersion: chargerData.firmwareVersion || 'v1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.data.chargers.push(newCharger);
      this.saveData();
      mysqlClient.saveCharger(newCharger).catch((e) => console.warn('[MySQL] saveCharger err:', e.message));
      return newCharger;
    }
  }

  public deleteCharger(id: string): boolean {
    const prevLen = this.data.chargers.length;
    this.data.chargers = this.data.chargers.filter((c) => c.id !== id && c.id.toLowerCase() !== id.toLowerCase());
    if (this.data.chargers.length !== prevLen) {
      this.saveData();
      mysqlClient.deleteCharger(id).catch((e) => console.warn('[MySQL] deleteCharger err:', e.message));
      return true;
    }
    return false;
  }

  public updateChargerConnection(id: string, isConnected: boolean, heartbeat?: boolean) {
    const charger = this.getCharger(id);
    if (charger) {
      charger.isConnected = isConnected;
      const hasCharging = charger.connectors.some((c) => c.status === 'Charging' || !!c.currentSession);
      if (hasCharging) {
        charger.status = 'Charging';
      } else if (isConnected && charger.status === 'Offline') {
        charger.status = 'Available';
      } else if (!isConnected) {
        charger.status = 'Offline';
      }
      if (heartbeat) {
        charger.lastHeartbeat = new Date().toISOString();
      }
      charger.updatedAt = new Date().toISOString();
      this.saveData();
      mysqlClient.updateChargerStatus(charger.id, charger.status, isConnected, heartbeat).catch((e) => console.warn('[MySQL] updateChargerStatus err:', e.message));
    }
  }

  public updateConnectorStatus(machineId: string, connectorId: number, status: Connector['status'], session?: any): Charger | null {
    const charger = this.getCharger(machineId);
    if (!charger) return null;

    let conn = charger.connectors.find((c) => c.id === connectorId);
    if (!conn) {
      if (charger.connectors.length > 0) {
        conn = charger.connectors[0];
      } else {
        return null;
      }
    }

    conn.status = status;
    if (session !== undefined) {
      conn.currentSession = session;
      if (session && session.transactionId) {
        conn.activeTransactionId = session.transactionId;
        charger.activeTransactionId = session.transactionId;
      } else if (session === null) {
        conn.activeTransactionId = null;
      }
    }

    if (status === 'Available' && !session) {
      conn.activeTransactionId = null;
      conn.currentSession = null;
    }

    const hasFault = charger.connectors.some((c) => c.status === 'Faulted');
    const hasCharging = charger.connectors.some((c) => c.status === 'Charging' || !!c.currentSession);
    const hasOccupied = charger.connectors.some((c) => c.status === 'Occupied');

    if (hasFault) charger.status = 'Faulted';
    else if (hasCharging) charger.status = 'Charging';
    else if (hasOccupied) charger.status = 'Occupied';
    else if (charger.isConnected) charger.status = 'Available';
    else charger.status = 'Offline';

    if (!charger.connectors.some((c) => c.activeTransactionId || c.currentSession)) {
      charger.activeTransactionId = null;
    }

    charger.updatedAt = new Date().toISOString();
    this.saveData();
    mysqlClient.updateConnectorStatus(charger.id, conn.id, status).catch((e) => console.warn('[MySQL] updateConnectorStatus err:', e.message));
    return charger;
  }

  public stopSession(machineId: string, connectorId?: number, transactionId?: number, meterStop?: number): { charger: Charger; energyKwh: number; totalCost: number } | null {
    let charger = this.getCharger(machineId);
    if (!charger) return null;

    const numTx = (transactionId !== undefined && transactionId !== null) ? Number(transactionId) : 0;

    // 1. First priority: find connector with matching transactionId
    let conn = (numTx > 0)
      ? charger.connectors.find((c) => Number(c.currentSession?.transactionId) === numTx || Number(c.activeTransactionId) === numTx)
      : undefined;

    // 2. Second priority: find connector specified by connectorId IF it has an active session or is Charging
    if (!conn && connectorId) {
      const byId = charger.connectors.find((c) => c.id === connectorId);
      if (byId && (byId.status === 'Charging' || byId.currentSession || byId.activeTransactionId)) {
        conn = byId;
      }
    }

    // 3. Third priority: find ANY connector on this charger that is Charging or has a session
    if (!conn) {
      conn = charger.connectors.find((c) => c.status === 'Charging' || !!c.currentSession || !!c.activeTransactionId);
    }

    // 4. Fallback to specified connectorId or first connector
    if (!conn) {
      conn = (connectorId ? charger.connectors.find((c) => c.id === connectorId) : undefined) || charger.connectors[0];
    }

    if (!conn) return null;

    const session = conn.currentSession;
    
    // Find active session from list of records
    const activeSessionRecord = (numTx > 0 && this.data.sessions.find((s) => Number(s.transactionId) === numTx)) ||
      (conn.activeTransactionId && this.data.sessions.find((s) => Number(s.transactionId) === Number(conn.activeTransactionId))) ||
      (session?.transactionId && this.data.sessions.find((s) => Number(s.transactionId) === Number(session.transactionId))) ||
      this.data.sessions.find((s) => 
        (s.machineId === charger.id || s.machineId.toLowerCase() === charger.id.toLowerCase()) && 
        (s.connectorId === conn.id) && 
        s.status === 'Active'
      ) ||
      this.data.sessions.find((s) => 
        (s.machineId === charger.id || s.machineId.toLowerCase() === charger.id.toLowerCase()) && 
        s.status === 'Active'
      );

    const txId = (numTx > 0)
      ? numTx
      : (activeSessionRecord?.transactionId
        ? Number(activeSessionRecord.transactionId)
        : (conn.activeTransactionId || session?.transactionId || charger.activeTransactionId || 2001));

    const costPerKwh = charger.baseCostPerKwh || 16.50;
    const baseFee = charger.sessionBaseFee || 10.00;

    let energyKwh = session?.currentKwh || activeSessionRecord?.energyKwh || 0;
    if (meterStop && session?.meterStart) {
      const diffKwh = Math.max(0, (meterStop - session.meterStart) / 1000);
      if (diffKwh > 0) energyKwh = diffKwh;
    }
    if (energyKwh <= 0) energyKwh = 1.25;

    const totalCost = Number((energyKwh * costPerKwh + baseFee).toFixed(2));

    // Terminate session on connector
    conn.status = 'Available';
    conn.activeTransactionId = null;
    conn.currentSession = null;

    // Also safety-check if other connectors were orphaned in Charging state without session
    charger.connectors.forEach((otherConn) => {
      if (otherConn.id !== conn.id && !otherConn.currentSession && otherConn.status === 'Charging') {
        otherConn.status = 'Available';
        otherConn.activeTransactionId = null;
      }
    });

    if (!charger.connectors.some((c) => c.activeTransactionId || c.currentSession || c.status === 'Charging')) {
      charger.activeTransactionId = null;
    }

    if (txId && txId > 0) {
      this.updateSession(txId, {
        endTime: new Date().toISOString(),
        energyKwh: Number(energyKwh.toFixed(2)),
        cost: totalCost,
        status: 'Completed'
      });
    } else if (activeSessionRecord) {
      activeSessionRecord.endTime = new Date().toISOString();
      activeSessionRecord.energyKwh = Number(energyKwh.toFixed(2));
      activeSessionRecord.cost = totalCost;
      activeSessionRecord.status = 'Completed';
      this.saveData();
      mysqlClient.saveSession(activeSessionRecord).catch((e) => console.warn('[MySQL] saveSession err:', e.message));
    }

    const hasFault = charger.connectors.some((c) => c.status === 'Faulted');
    const hasCharging = charger.connectors.some((c) => c.status === 'Charging' || !!c.currentSession);
    const hasOccupied = charger.connectors.some((c) => c.status === 'Occupied');

    if (hasFault) charger.status = 'Faulted';
    else if (hasCharging) charger.status = 'Charging';
    else if (hasOccupied) charger.status = 'Occupied';
    else if (charger.isConnected) charger.status = 'Available';
    else charger.status = 'Offline';

    charger.updatedAt = new Date().toISOString();
    this.saveData();
    mysqlClient.updateConnectorStatus(charger.id, conn.id, 'Available').catch((e) => console.warn('[MySQL] updateConnectorStatus err:', e.message));
    mysqlClient.updateChargerStatus(charger.id, charger.status, charger.isConnected).catch((e) => console.warn('[MySQL] updateChargerStatus err:', e.message));
    return { charger, energyKwh, totalCost };
  }

  public getPartners(): OcpiPartner[] {
    if (!this.data.partners || this.data.partners.length === 0) {
      this.data.partners = [...INITIAL_PARTNERS];
      this.saveData();
    }
    return this.data.partners;
  }

  public getPartner(id: string): OcpiPartner | undefined {
    return this.getPartners().find((p) => p.id === id);
  }

  public findPartnerByToken(token: string): OcpiPartner | undefined {
    if (!token) return undefined;
    const clean = token.replace(/^Token\s+/i, '').replace(/^Bearer\s+/i, '').trim();
    if (!clean) return undefined;

    const partners = this.getPartners();
    let partner = partners.find(
      (p) => p.tokenA === clean || p.tokenB === clean || p.partnerToken === clean
    );
    if (partner) return partner;

    // Direct check for standard configured keys
    if (
      clean === 'b2c3d4e5-token-b-satmat-2026' ||
      clean === 'HUB-SATMAT-KEY-88220199' ||
      clean === 'a1b2c3d4-token-a-satmat-2026'
    ) {
      let smv = partners.find((p) => p.partyId === 'SMV');
      if (!smv) {
        smv = {
          id: 'partner-smv-live',
          name: 'SMV Mobility Roaming eMSP',
          partyId: 'SMV',
          countryCode: 'IN',
          role: 'eMSP',
          tokenA: 'a1b2c3d4-token-a-satmat-2026',
          tokenB: 'b2c3d4e5-token-b-satmat-2026',
          partnerToken: 'HUB-SATMAT-KEY-88220199',
          url: 'https://evcharger.satmatgroup.com/ocpi/2.2.1',
          ocpiVersion: '2.2',
          status: 'ACTIVE',
          pricingType: 'DEFAULT',
          customCostPerKwh: null,
          priceAdjustmentPercent: 0,
          notes: 'Official SMV Mobility eMSP Partner (Pre-configured Live Credentials)',
          createdAt: new Date().toISOString(),
          lastAccessAt: new Date().toISOString()
        };
        this.data.partners.push(smv);
        this.saveData();
      }
      return smv;
    }

    return undefined;
  }

  public savePartner(partnerData: Partial<OcpiPartner> & { name: string; partyId: string; countryCode: string }): OcpiPartner {
    const existingIndex = partnerData.id ? this.data.partners.findIndex((p) => p.id === partnerData.id) : -1;
    const tokenRandom = Math.random().toString(36).substring(2, 12);
    const tokenRandomB = Math.random().toString(36).substring(2, 12);

    if (existingIndex >= 0) {
      const existing = this.data.partners[existingIndex];
      const updated: OcpiPartner = {
        ...existing,
        ...partnerData,
        id: existing.id
      };
      this.data.partners[existingIndex] = updated;
      this.saveData();
      mysqlClient.savePartner(updated).catch((e) => console.warn('[MySQL] savePartner err:', e.message));
      return updated;
    } else {
      const id = 'partner-' + partnerData.partyId.toLowerCase() + '-' + Date.now().toString(36);
      const newPartner: OcpiPartner = {
        id,
        name: partnerData.name,
        partyId: partnerData.partyId.toUpperCase(),
        countryCode: partnerData.countryCode.toUpperCase(),
        role: partnerData.role || 'eMSP',
        tokenA: partnerData.tokenA || `satmat_ocpi_tokenA_${partnerData.partyId.toLowerCase()}_${tokenRandom}`,
        tokenB: partnerData.tokenB || `satmat_ocpi_tokenB_${partnerData.partyId.toLowerCase()}_${tokenRandomB}`,
        partnerToken: partnerData.partnerToken || '',
        url: partnerData.url || '',
        ocpiVersion: partnerData.ocpiVersion || '2.0',
        status: partnerData.status || 'ACTIVE',
        pricingType: partnerData.pricingType || 'DEFAULT',
        customCostPerKwh: partnerData.customCostPerKwh ?? null,
        priceAdjustmentPercent: partnerData.priceAdjustmentPercent ?? 0,
        notes: partnerData.notes || '',
        createdAt: new Date().toISOString(),
        lastAccessAt: null
      };
      this.data.partners.push(newPartner);
      this.saveData();
      mysqlClient.savePartner(newPartner).catch((e) => console.warn('[MySQL] savePartner err:', e.message));
      return newPartner;
    }
  }

  public deletePartner(id: string): boolean {
    const prevLen = this.data.partners.length;
    this.data.partners = this.data.partners.filter((p) => p.id !== id);
    if (this.data.partners.length !== prevLen) {
      this.saveData();
      mysqlClient.deletePartner(id).catch((e) => console.warn('[MySQL] deletePartner err:', e.message));
      return true;
    }
    return false;
  }

  public getTariffs(): Tariff[] {
    return this.data.tariffs;
  }

  public saveTariff(tariffData: Tariff): Tariff {
    const index = this.data.tariffs.findIndex((t) => t.id === tariffData.id);
    if (index >= 0) {
      this.data.tariffs[index] = tariffData;
    } else {
      this.data.tariffs.push(tariffData);
    }
    this.saveData();
    mysqlClient.saveTariff(tariffData).catch((e) => console.warn('[MySQL] saveTariff err:', e.message));
    return tariffData;
  }

  public deleteTariff(id: string): boolean {
    const prevLen = this.data.tariffs.length;
    this.data.tariffs = this.data.tariffs.filter((t) => t.id !== id);
    if (this.data.tariffs.length !== prevLen) {
      this.saveData();
      mysqlClient.deleteTariff(id).catch((e) => console.warn('[MySQL] deleteTariff err:', e.message));
      return true;
    }
    return false;
  }

  public addLog(entry: {
    type?: 'OCPP' | 'OCPI' | 'SYSTEM' | 'HTTP';
    protocol?: string;
    machineId?: string;
    direction: 'IN' | 'OUT';
    action: string;
    connectorId?: number | null;
    transactionId?: number | string | null;
    messageId?: string;
    messageTypeId?: 2 | 3 | 4 | number;
    status?: string;
    durationMs?: number;
    ip?: string;
    payload: any;
    response?: any;
    rawMessage?: string;
    details?: Record<string, any>;
  }): LogItem {
    const rawType = entry.type || (entry.action?.startsWith('/ocpi') || entry.action?.includes('OCPI') ? 'OCPI' : 'OCPP');
    const protocol = entry.protocol || (rawType === 'OCPI' ? 'OCPI 2.0/2.2' : rawType === 'OCPP' ? 'OCPP 1.6J' : 'HTTP/JSON');

    // Auto extract connectorId / transactionId from payload if not explicitly provided
    const payload = entry.payload || {};
    let connectorId = entry.connectorId ?? (payload.connectorId !== undefined ? Number(payload.connectorId) : null);
    let transactionId = entry.transactionId ?? (payload.transactionId !== undefined ? payload.transactionId : null);
    let status = entry.status;

    if (!status && entry.response?.status) {
      status = String(entry.response.status);
    } else if (!status && payload.status) {
      status = String(payload.status);
    } else if (!status && entry.response?.status_code) {
      status = entry.response.status_code === 1000 ? 'Success' : `Error ${entry.response.status_code}`;
    }

    const logItem: LogItem = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      timestamp: new Date().toISOString(),
      type: rawType,
      protocol,
      direction: entry.direction,
      action: entry.action,
      machineId: entry.machineId || 'SATMAT-EV-001',
      connectorId: connectorId !== null && !isNaN(Number(connectorId)) ? Number(connectorId) : null,
      transactionId: transactionId !== null ? transactionId : null,
      messageId: entry.messageId,
      messageTypeId: entry.messageTypeId,
      status: status || (entry.direction === 'OUT' ? 'Dispatched' : 'Received'),
      durationMs: entry.durationMs,
      ip: entry.ip || '127.0.0.1',
      payload: entry.payload,
      response: entry.response,
      rawMessage: entry.rawMessage || (typeof entry.payload === 'object' ? JSON.stringify(entry.payload) : String(entry.payload)),
      details: entry.details || {
        meterStart: payload.meterStart,
        meterStop: payload.meterStop,
        reason: payload.reason,
        idTag: payload.idTag,
        errorCode: payload.errorCode,
        errorDescription: payload.errorDescription
      }
    };

    this.data.logs.unshift(logItem);
    // Keep up to 1000 logs persistently in memory & JSON so users have full audit trail
    if (this.data.logs.length > 1000) {
      this.data.logs = this.data.logs.slice(0, 1000);
    }
    this.saveData();
    // Persist to MySQL ocpp_logs table
    mysqlClient.saveLog(logItem).catch((e) => console.warn('[MySQL] saveLog err:', e.message));
    return logItem;
  }

  public getLogs(filter?: {
    limit?: number;
    type?: string;
    direction?: string;
    machineId?: string;
    action?: string;
    search?: string;
  }) {
    let result = this.data.logs;
    if (!filter) return result.slice(0, 100);

    if (filter.type && filter.type !== 'ALL') {
      result = result.filter((l) => l.type === filter.type);
    }
    if (filter.direction && filter.direction !== 'ALL') {
      result = result.filter((l) => l.direction === filter.direction);
    }
    if (filter.machineId && filter.machineId !== 'ALL') {
      const target = filter.machineId.toLowerCase();
      result = result.filter((l) => l.machineId && l.machineId.toLowerCase() === target);
    }
    if (filter.action && filter.action !== 'ALL') {
      result = result.filter((l) => l.action.toLowerCase().includes(filter.action!.toLowerCase()));
    }
    if (filter.search && filter.search.trim()) {
      const s = filter.search.trim().toLowerCase();
      result = result.filter((l) =>
        (l.action && l.action.toLowerCase().includes(s)) ||
        (l.machineId && l.machineId.toLowerCase().includes(s)) ||
        (l.messageId && l.messageId.toLowerCase().includes(s)) ||
        (l.status && l.status.toLowerCase().includes(s)) ||
        (l.transactionId && String(l.transactionId).toLowerCase().includes(s)) ||
        (l.rawMessage && l.rawMessage.toLowerCase().includes(s))
      );
    }

    const limit = filter.limit && filter.limit > 0 ? filter.limit : 100;
    return result.slice(0, limit);
  }

  public clearLogs(): void {
    this.data.logs = [];
    this.saveData();
    mysqlClient.clearLogs().catch((e) => console.warn('[MySQL] clearLogs err:', e.message));
  }

  public getSessions() {
    return this.data.sessions;
  }

  public addSession(session: ChargingSessionRecord) {
    this.data.sessions.unshift(session);
    this.saveData();
    mysqlClient.saveSession(session).catch((e) => console.warn('[MySQL] saveSession err:', e.message));
  }

  public updateSession(transactionId: number, update: Partial<ChargingSessionRecord>) {
    const numTx = Number(transactionId);
    let sess = this.data.sessions.find((s) => Number(s.transactionId) === numTx);
    if (!sess && numTx > 0) {
      sess = this.data.sessions.find((s) => s.status === 'Active');
    }
    if (sess) {
      Object.assign(sess, update);
      this.saveData();
      mysqlClient.saveSession(sess).catch((e) => console.warn('[MySQL] saveSession err:', e.message));
    }
  }
}

export const dataStore = new DataStore();
