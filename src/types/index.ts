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
  isSocketLive?: boolean;
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
  tokenA: string;
  tokenB: string;
  partnerToken: string;
  url: string;
  ocpiVersion: '2.0' | '2.1.1' | '2.2' | '2.2.1';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  pricingType: 'DEFAULT' | 'CUSTOM_RATE' | 'PERCENTAGE_DISCOUNT' | 'PERCENTAGE_MARKUP';
  customCostPerKwh: number | null;
  priceAdjustmentPercent: number | null;
  notes: string;
  createdAt: string;
  lastAccessAt: string | null;
  credentialsUrl?: string;
  locationsUrl?: string;
  tariffsUrl?: string;
  versionsUrl?: string;
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

export interface SystemStats {
  totalChargers: number;
  onlineChargers: number;
  totalConnectors: number;
  activeCharging: number;
  totalPartners: number;
  activePartners: number;
  totalSessions: number;
  domain: string;
  wsUrl: string;
}

export interface LogItem {
  id: string;
  timestamp: string;
  type: 'OCPP' | 'OCPI' | 'SYSTEM' | 'HTTP';
  protocol?: string; // 'OCPP 1.6J', 'OCPI 2.0', 'OCPI 2.2', 'REST API'
  direction: 'IN' | 'OUT';
  action: string;
  machineId?: string;
  connectorId?: number | null;
  transactionId?: number | string | null;
  messageId?: string; // unique OCPP message id e.g. CALL/CALLRESULT uniqueId
  messageTypeId?: 2 | 3 | 4 | number; // 2=CALL, 3=CALLRESULT, 4=CALLERROR
  status?: string; // 'Accepted', 'Rejected', 'Completed', '200 OK', 'Error', etc.
  durationMs?: number;
  ip?: string;
  payload: any;
  response?: any;
  rawMessage?: string;
  details?: Record<string, any>;
}
