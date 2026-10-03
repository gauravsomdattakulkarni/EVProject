import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { dataStore } from './dataStore.js';
import { mysqlClient } from './mysqlClient.js';

interface ActiveChargerSocket {
  machineId: string;
  chargerId?: string;
  ws: WebSocket;
  ip: string;
  connectedAt: Date;
  isAlive: boolean;
  activeTransactionId?: number;
}

interface PendingCall {
  action: string;
  machineId: string;
  startTime: number;
  resolve: (val: any) => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

export class OcppServer {
  private activeSockets: Map<string, ActiveChargerSocket> = new Map();
  private clientSockets: Set<WebSocket> = new Set();
  private pendingCalls: Map<string, PendingCall> = new Map();
  private activeSimulatorTxIds: Map<string, number> = new Map();
  private transactionCounter = 2000;
  private pingTimer: NodeJS.Timeout | null = null;
  private tickerTimer: NodeJS.Timeout | null = null;

  constructor(private wss: WebSocketServer) {
    this.transactionCounter = dataStore.generateNextTransactionId();
    this.setupWss();
    this.startPingInterval();
    this.startLiveMeterTicker();
  }

  public getUniqueSockets(): ActiveChargerSocket[] {
    const seen = new Set<WebSocket>();
    const list: ActiveChargerSocket[] = [];
    for (const s of this.activeSockets.values()) {
      if (!seen.has(s.ws) && s.ws.readyState === WebSocket.OPEN) {
        seen.add(s.ws);
        list.push(s);
      }
    }
    return list;
  }

  public getSocketForCharger(id: string): ActiveChargerSocket | undefined {
    if (!id) return undefined;
    const clean = id.trim();
    const direct = this.activeSockets.get(clean) || this.activeSockets.get(clean.toLowerCase());
    if (direct && direct.ws.readyState === WebSocket.OPEN) return direct;

    const unique = this.getUniqueSockets();
    const match = unique.find(s => 
      s.machineId.toLowerCase() === clean.toLowerCase() ||
      s.chargerId?.toLowerCase() === clean.toLowerCase()
    );
    if (match) return match;

    if (unique.length === 1) {
      return unique[0];
    }
    return undefined;
  }

  private startPingInterval() {
    // 15s keepalive ping prevents load balancer / proxy / browser timeout hangs
    this.pingTimer = setInterval(() => {
      this.activeSockets.forEach((sock, key) => {
        if (sock.ws.readyState === WebSocket.OPEN) {
          try {
            sock.ws.ping();
          } catch {
            this.activeSockets.delete(key);
          }
        } else {
          this.activeSockets.delete(key);
        }
      });

      this.clientSockets.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.ping();
          } catch {
            this.clientSockets.delete(client);
          }
        } else {
          this.clientSockets.delete(client);
        }
      });
    }, 15000);
  }

  private startLiveMeterTicker() {
    // Live meter telemetry ticker: increments kWh and dynamic cost in real-time
    this.tickerTimer = setInterval(() => {
      const chargers = dataStore.getChargers();

      for (const charger of chargers) {
        let updated = false;
        for (const conn of charger.connectors) {
          if (conn.status === 'Charging' && conn.currentSession) {
            // Live energy accumulation (+0.03 kWh every 3 seconds approx 36 kW rate)
            const addedKwh = 0.03;
            const newKwh = Number((conn.currentSession.currentKwh + addedKwh).toFixed(2));
            const newSoc = Math.min(99, conn.currentSession.soc + (Math.random() > 0.65 ? 1 : 0));
            const rate = charger.baseCostPerKwh || 16.50;
            const baseFee = charger.sessionBaseFee || 10.00;
            const newCost = Number((newKwh * rate + baseFee).toFixed(2));

            conn.currentSession.currentKwh = newKwh;
            conn.currentSession.soc = newSoc;
            conn.currentSession.cost = newCost;
            updated = true;

            dataStore.updateSession(conn.currentSession.transactionId, {
              energyKwh: newKwh,
              cost: newCost
            });
          }
        }

        if (updated) {
          this.broadcastToClients({
            type: 'CHARGER_UPDATED',
            machineId: charger.id,
            charger
          });
        }
      }
    }, 3000);
  }

  private setupWss() {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const rawUrl = req.url || '';
      const cleanPath = rawUrl.split('?')[0].replace(/\/+$/, '');

      // Check if it's an admin client connecting for live dashboard feeds
      if (cleanPath === '/ws-client' || cleanPath.startsWith('/ws-client/')) {
        const clientWs = ws as any;
        clientWs.isAlive = true;
        this.clientSockets.add(ws);
        ws.on('pong', () => { clientWs.isAlive = true; });
        ws.on('close', () => this.clientSockets.delete(ws));
        ws.on('error', () => this.clientSockets.delete(ws));
        ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to SATMAT EV Real-Time Stream' }));
        return;
      }

      // OCPP Charger Connection: e.g. /ocpp/:machineId or /ws/:machineId or /:machineId
      const parts = cleanPath.split('/').filter(Boolean);
      let machineId = '';

      if (parts.length >= 2 && (parts[0] === 'ocpp' || parts[0] === 'ws')) {
        machineId = parts[1];
      } else if (parts.length >= 1) {
        machineId = parts[parts.length - 1];
      }

      if (!machineId) {
        ws.close(1008, 'Machine ID required in URL path');
        return;
      }

      // Clean machine ID
      machineId = decodeURIComponent(machineId).trim();

      const socketEntry: ActiveChargerSocket = {
        machineId,
        ws,
        ip: req.socket.remoteAddress || 'unknown',
        connectedAt: new Date(),
        isAlive: true
      };

      // Register socket with machineId
      this.activeSockets.set(machineId, socketEntry);
      this.activeSockets.set(machineId.toLowerCase(), socketEntry);

      ws.on('pong', () => {
        socketEntry.isAlive = true;
      });

      // Match to existing user-registered charger or primary charger
      let charger = dataStore.getCharger(machineId);
      if (!charger && dataStore.getChargers().length > 0) {
        charger = dataStore.getChargers()[0];
      }
      if (!charger) {
        charger = dataStore.saveCharger({
          id: machineId,
          name: machineId
        });
      }

      if (charger) {
        socketEntry.chargerId = charger.id;
        this.activeSockets.set(charger.id, socketEntry);
        this.activeSockets.set(charger.id.toLowerCase(), socketEntry);
        this.activeSockets.set(machineId, socketEntry);
        this.activeSockets.set(machineId.toLowerCase(), socketEntry);
        dataStore.updateChargerConnection(charger.id, true, true);

        // Restore active transaction IDs from dataStore if an active session exists
        charger.connectors.forEach((c) => {
          const activeTx = c.activeTransactionId || c.currentSession?.transactionId;
          if (activeTx) {
            socketEntry.activeTransactionId = Number(activeTx);
            this.activeSimulatorTxIds.set(charger.id, Number(activeTx));
            this.activeSimulatorTxIds.set(charger.id.toLowerCase(), Number(activeTx));
            this.activeSimulatorTxIds.set(machineId, Number(activeTx));
            this.activeSimulatorTxIds.set(machineId.toLowerCase(), Number(activeTx));
          }
        });

        dataStore.addLog({
          type: 'OCPP',
          protocol: 'OCPP 1.6J',
          machineId: charger.id,
          direction: 'IN',
          action: 'Connected',
          status: 'Established',
          ip: req.socket.remoteAddress,
          payload: { ip: req.socket.remoteAddress, url: rawUrl }
        });

        this.broadcastToClients({
          type: 'CHARGER_CONNECTED',
          machineId: charger.id,
          charger: dataStore.getCharger(charger.id),
          timestamp: new Date().toISOString()
        });
      } else {
        dataStore.addLog({
          type: 'OCPP',
          protocol: 'OCPP 1.6J',
          machineId,
          direction: 'IN',
          action: 'Connected (Unregistered)',
          status: 'Pending',
          ip: req.socket.remoteAddress,
          payload: { ip: req.socket.remoteAddress, url: rawUrl }
        });
      }

      ws.on('message', (data: Buffer | string) => {
        try {
          socketEntry.isAlive = true;
          const raw = data.toString();
          this.handleOcppMessage(machineId, raw, ws, socketEntry);
        } catch (err) {
          console.error(`Error processing OCPP message from ${machineId}:`, err);
        }
      });

      ws.on('close', () => {
        this.activeSockets.delete(machineId);
        this.activeSockets.delete(machineId.toLowerCase());
        const ch = dataStore.getCharger(machineId);
        if (ch) {
          this.activeSockets.delete(ch.id);
          this.activeSockets.delete(ch.id.toLowerCase());
          dataStore.updateChargerConnection(ch.id, false);
          this.broadcastToClients({
            type: 'CHARGER_DISCONNECTED',
            machineId: ch.id,
            timestamp: new Date().toISOString()
          });
        }
        dataStore.addLog({
          type: 'OCPP',
          protocol: 'OCPP 1.6J',
          machineId,
          direction: 'IN',
          action: 'Disconnected',
          status: 'Closed',
          payload: {}
        });
      });

      ws.on('error', (err) => {
        console.error(`WebSocket error for ${machineId}:`, err);
        this.activeSockets.delete(machineId);
        this.activeSockets.delete(machineId.toLowerCase());
        const ch = dataStore.getCharger(machineId);
        if (ch) {
          this.activeSockets.delete(ch.id);
          this.activeSockets.delete(ch.id.toLowerCase());
        }
      });
    });
  }

  private handleOcppMessage(machineId: string, raw: string, ws: WebSocket, socketEntry?: ActiveChargerSocket) {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (!Array.isArray(parsed) || parsed.length < 3) return;

    const messageTypeId = parsed[0]; // 2 = CALL, 3 = CALLRESULT, 4 = CALLERROR
    const uniqueId = String(parsed[1]);
    const effectiveStationId = socketEntry?.chargerId || socketEntry?.machineId || machineId;

    if (messageTypeId === 2) {
      // OCPP Call from Charger
      const action = parsed[2];
      const payload = parsed[3] || {};
      const rawConnId = payload.connectorId !== undefined ? payload.connectorId : payload.evseId;
      const connectorId = rawConnId !== undefined && rawConnId !== null ? Number(rawConnId) : null;
      const transactionId = payload.transactionId !== undefined && payload.transactionId !== null ? payload.transactionId : null;

      dataStore.addLog({
        type: 'OCPP',
        protocol: 'OCPP 1.6J',
        machineId: effectiveStationId,
        direction: 'IN',
        action,
        connectorId,
        transactionId,
        messageId: uniqueId,
        messageTypeId: 2,
        status: 'Received',
        ip: socketEntry?.ip,
        payload,
        rawMessage: raw,
        details: {
          meterStart: payload.meterStart,
          meterStop: payload.meterStop,
          reason: payload.reason,
          idTag: payload.idTag,
          status: payload.status || payload.connectorStatus
        }
      });

      this.processOcppCall(effectiveStationId, uniqueId, action, payload, ws, socketEntry).catch((e) =>
        console.warn('processOcppCall error:', e.message)
      );
    } else if (messageTypeId === 3) {
      // Response to a call we sent (e.g. RemoteStartTransaction or RemoteStopTransaction)
      const payload = parsed[2] || {};
      const pending = this.pendingCalls.get(uniqueId);
      const durationMs = pending ? Date.now() - pending.startTime : undefined;
      const callStatus = payload.status || (payload.idTagInfo?.status) || 'Accepted';

      dataStore.addLog({
        type: 'OCPP',
        protocol: 'OCPP 1.6J',
        machineId: pending?.machineId || effectiveStationId,
        direction: 'IN',
        action: pending ? `${pending.action}Response` : 'CallResult',
        messageId: uniqueId,
        messageTypeId: 3,
        status: callStatus,
        durationMs,
        ip: socketEntry?.ip,
        payload,
        rawMessage: raw
      });

      // Resolve pending call promise
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCalls.delete(uniqueId);
        pending.resolve({
          success: payload.status !== 'Rejected',
          status: payload.status || 'Accepted',
          payload
        });
      }

      this.broadcastToClients({
        type: 'OCPP_CALL_RESULT',
        machineId: effectiveStationId,
        uniqueId,
        payload
      });
    } else if (messageTypeId === 4) {
      // CallError from Charger
      const errorCode = parsed[2];
      const errorDescription = parsed[3];
      const errorDetails = parsed[4] || {};
      const pending = this.pendingCalls.get(uniqueId);
      const durationMs = pending ? Date.now() - pending.startTime : undefined;

      dataStore.addLog({
        type: 'OCPP',
        protocol: 'OCPP 1.6J',
        machineId: pending?.machineId || effectiveStationId,
        direction: 'IN',
        action: pending ? `${pending.action}Error` : 'CallError',
        messageId: uniqueId,
        messageTypeId: 4,
        status: `Error: ${errorCode}`,
        durationMs,
        ip: socketEntry?.ip,
        payload: { errorCode, errorDescription, errorDetails },
        rawMessage: raw,
        details: { errorCode, errorDescription, errorDetails }
      });

      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCalls.delete(uniqueId);
        pending.reject(new Error(errorDescription || errorCode || 'CallError from charger'));
      }
    }
  }

  private async processOcppCall(machineId: string, uniqueId: string, action: string, payload: any, ws: WebSocket, socketEntry?: ActiveChargerSocket) {
    const startTime = Date.now();
    let responsePayload: any = {};
    const cleanId = machineId.trim();

    switch (action) {
      case 'BootNotification': {
        const charger = dataStore.getCharger(cleanId);
        if (charger) {
          dataStore.updateChargerConnection(charger.id, true, true);
        }
        responsePayload = {
          status: 'Accepted',
          currentTime: new Date().toISOString(),
          interval: 30
        };
        break;
      }

      case 'Heartbeat': {
        dataStore.updateChargerConnection(cleanId, true, true);
        responsePayload = {
          currentTime: new Date().toISOString()
        };
        break;
      }

      case 'StatusNotification': {
        const rawConnectorId = payload.connectorId !== undefined && payload.connectorId !== null
          ? Number(payload.connectorId)
          : (payload.evseId !== undefined ? Number(payload.evseId) : 1);
        let charger = (socketEntry?.chargerId ? dataStore.getCharger(socketEntry.chargerId) : undefined) ||
          dataStore.getCharger(cleanId) ||
          (dataStore.getChargers().length > 0 ? dataStore.getChargers()[0] : undefined);

        // In OCPP 1.6, connectorId 0 is the Charge Point itself (main station controller).
        if (rawConnectorId === 0) {
          if (charger) {
            dataStore.updateChargerConnection(charger.id, true, true);
          }
          responsePayload = {};
          break;
        }

        const connectorId = rawConnectorId;
        const ocppStatus = String(payload.connectorStatus || payload.status || 'Available');
        const statusNorm = ocppStatus.trim().toLowerCase();
        let internalStatus: any = 'Available';

        const existingConn = charger?.connectors.find((c) => c.id === connectorId) || charger?.connectors[0];
        const hasActiveSession = !!(existingConn && (existingConn.activeTransactionId || existingConn.currentSession));

        if (statusNorm === 'charging') {
          internalStatus = 'Charging';
          // If simulator reports Charging but session was not initiated yet, start one automatically
          if (!hasActiveSession && charger) {
            const nextTx = dataStore.generateNextTransactionId();
            dataStore.startSession(charger.id, connectorId, 'SIMULATOR-RFID', nextTx);
            this.activeSimulatorTxIds.set(charger.id, nextTx);
            this.activeSimulatorTxIds.set(cleanId, nextTx);
            dataStore.setActiveTransactionId(charger.id, connectorId, nextTx);
          }
        } else if (statusNorm === 'available' || statusNorm === 'finishing') {
          internalStatus = 'Available';
          // Charge point explicitly ended transaction or cable was disconnected
          if (hasActiveSession) {
            const activeTx = existingConn?.activeTransactionId || existingConn?.currentSession?.transactionId;
            dataStore.stopSession(charger?.id || cleanId, connectorId, activeTx ? Number(activeTx) : undefined);
            this.activeSimulatorTxIds.delete(cleanId);
            this.activeSimulatorTxIds.delete(cleanId.toLowerCase());
            if (charger) {
              this.activeSimulatorTxIds.delete(charger.id);
              this.activeSimulatorTxIds.delete(charger.id.toLowerCase());
            }
            if (socketEntry) {
              socketEntry.activeTransactionId = undefined;
            }
          }
        } else if (statusNorm === 'suspendedev' || statusNorm === 'suspendedevse') {
          // If already actively charging, keep it in Charging so UI shows Stop button and doesn't flip back to Start
          internalStatus = hasActiveSession ? 'Charging' : 'Occupied';
        } else if (statusNorm === 'occupied' || statusNorm === 'preparing') {
          // Preparing/Occupied during an active transaction should retain charging session
          internalStatus = hasActiveSession ? 'Charging' : 'Occupied';
        } else if (statusNorm === 'faulted') {
          internalStatus = 'Faulted';
        } else if (statusNorm === 'unavailable') {
          internalStatus = 'Unavailable';
        } else if (statusNorm === 'reserved') {
          internalStatus = 'Reserved';
        } else {
          internalStatus = hasActiveSession ? 'Charging' : 'Available';
        }

        let sessionObj: any = undefined;
        if (internalStatus === 'Charging') {
          sessionObj = existingConn?.currentSession;
        } else if (internalStatus === 'Available') {
          sessionObj = null;
        }
        dataStore.updateConnectorStatus(charger?.id || cleanId, connectorId, internalStatus, sessionObj);

        dataStore.updateChargerConnection(charger?.id || cleanId, true, true);
        responsePayload = {};
        break;
      }

      case 'Authorize': {
        responsePayload = {
          idTagInfo: {
            status: 'Accepted',
            expiryDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            parentIdTag: 'SATMAT-GLOBAL-MASTER'
          }
        };
        break;
      }

      case 'StartTransaction': {
        const rawConnectorId = payload.connectorId !== undefined && payload.connectorId !== null ? Number(payload.connectorId) : 1;
        const connectorId = rawConnectorId === 0 ? 1 : rawConnectorId;
        const startTimeStr = payload.timestamp || new Date().toISOString();
        const meterStart = Number(payload.meterStart || 0);
        const idTag = payload.idTag || 'SATMAT-ADMIN-CARD';

        let charger = (socketEntry?.chargerId ? dataStore.getCharger(socketEntry.chargerId) : undefined) ||
          dataStore.getCharger(cleanId) ||
          (dataStore.getChargers().length > 0 ? dataStore.getChargers()[0] : undefined);
        if (!charger) {
          charger = dataStore.saveCharger({ id: cleanId, name: cleanId });
        }

        // Ensure charger exists in MySQL
        await mysqlClient.ensureChargerExists(charger.id, charger.name);

        let transactionId = 0;

        // 1. Check if simulator explicitly provided a transactionId in the payload
        if (payload.transactionId) {
          const simTx = parseInt(String(payload.transactionId), 10);
          if (simTx && simTx > 0) transactionId = simTx;
        }

        // 2. Check if CSMS already assigned an activeTransactionId
        if (!transactionId && socketEntry?.activeTransactionId && Number(socketEntry.activeTransactionId) > 0) {
          transactionId = Number(socketEntry.activeTransactionId);
        }
        if (!transactionId && charger) {
          const conn = charger.connectors.find((c) => c.id === connectorId) || charger.connectors[0];
          if (conn && conn.activeTransactionId && Number(conn.activeTransactionId) > 0) {
            transactionId = Number(conn.activeTransactionId);
          }
        }

        // 3. Check active transaction directly from MySQL charging_sessions table
        if (!transactionId && charger) {
          const dbTx = await mysqlClient.getActiveTransaction(charger.id, connectorId);
          if (dbTx && dbTx > 0) transactionId = dbTx;
        }

        // 4. Check in-memory map
        if (!transactionId) {
          const mapped = this.activeSimulatorTxIds.get(cleanId) ||
            (charger ? this.activeSimulatorTxIds.get(charger.id) : undefined);
          if (mapped && Number(mapped) > 0) transactionId = Number(mapped);
        }

        // 5. Otherwise generate a new sequential transactionId from MySQL or dataStore
        if (!transactionId) {
          const nextDbId = await mysqlClient.getNextTransactionId();
          transactionId = nextDbId && nextDbId >= 2001 ? nextDbId : dataStore.generateNextTransactionId();
        }

        const validTxId: number = transactionId;
        this.transactionCounter = Math.max(this.transactionCounter, validTxId);

        // Store persistently in dataStore so Start and Stop use the EXACT same ID
        dataStore.startSession(charger.id, connectorId, idTag, validTxId, meterStart);
        this.activeSimulatorTxIds.set(charger.id, validTxId);
        this.activeSimulatorTxIds.set(charger.id.toLowerCase(), validTxId);
        this.activeSimulatorTxIds.set(cleanId, validTxId);
        this.activeSimulatorTxIds.set(cleanId.toLowerCase(), validTxId);
        dataStore.setActiveTransactionId(charger.id, connectorId, validTxId);
        dataStore.updateChargerConnection(charger.id, true, true);

        if (socketEntry) {
          socketEntry.activeTransactionId = validTxId;
        }

        // Exact standard OCPP 1.6 response: [3, uniqueId, { transactionId, idTagInfo: { status: "Accepted", expiryDate: "..." } }]
        responsePayload = {
          transactionId: validTxId,
          idTagInfo: {
            status: 'Accepted',
            expiryDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
          }
        };

        const activeCh = dataStore.getCharger(charger.id);
        this.broadcastToClients({
          type: 'CHARGER_UPDATED',
          machineId: charger.id,
          charger: activeCh
        });
        this.broadcastToClients({
          type: 'SESSION_STARTED',
          machineId: charger.id,
          connectorId,
          transactionId: validTxId,
          charger: activeCh
        });
        break;
      }

      case 'StopTransaction': {
        const rawTxId = payload.transactionId;
        let charger = (socketEntry?.chargerId ? dataStore.getCharger(socketEntry.chargerId) : undefined) ||
          dataStore.getCharger(cleanId) ||
          (dataStore.getChargers().length > 0 ? dataStore.getChargers()[0] : undefined);

        const incomingTxId = (rawTxId !== undefined && rawTxId !== null) ? Number(rawTxId) : 0;
        const meterStop = Number(payload.meterStop || 0);

        let connectorId = 1;
        let matchedConn = null;
        if (charger) {
          // 1. First look for connector that has this specific transactionId
          if (incomingTxId > 0) {
            matchedConn = charger.connectors.find((c) =>
              Number(c.activeTransactionId) === incomingTxId ||
              Number(c.currentSession?.transactionId) === incomingTxId
            );
          }
          // 2. If not found by txId, look for any connector that is currently Charging or has an active session
          if (!matchedConn) {
            matchedConn = charger.connectors.find((c) => c.status === 'Charging' || !!c.currentSession);
          }
          // 3. Fallback to connector 1
          if (!matchedConn) {
            matchedConn = charger.connectors[0];
          }
          if (matchedConn) connectorId = matchedConn.id;
        }

        const activeTxId = incomingTxId ||
          Number(matchedConn?.activeTransactionId) ||
          Number(matchedConn?.currentSession?.transactionId) ||
          Number(charger?.activeTransactionId) ||
          Number(this.activeSimulatorTxIds.get(cleanId)) ||
          Number(socketEntry?.activeTransactionId) ||
          2001;

        // Clean up tracking
        this.activeSimulatorTxIds.delete(cleanId);
        this.activeSimulatorTxIds.delete(cleanId.toLowerCase());
        if (charger) {
          this.activeSimulatorTxIds.delete(charger.id);
          this.activeSimulatorTxIds.delete(charger.id.toLowerCase());
        }
        if (socketEntry) {
          socketEntry.activeTransactionId = undefined;
        }

        if (charger) {
          dataStore.stopSession(charger.id, connectorId, activeTxId, meterStop);
          await mysqlClient.updateSessionStatus(activeTxId, 'Completed', meterStop).catch(() => {});
          await mysqlClient.updateConnectorStatus(charger.id, connectorId, 'Available').catch(() => {});
          await mysqlClient.updateChargerStatus(charger.id, 'Available', true).catch(() => {});
        }

        // Standard OCPP 1.6 response: [3, uniqueId, { idTagInfo: { status: "Accepted" } }]
        responsePayload = {
          idTagInfo: {
            status: 'Accepted'
          }
        };

        const stoppedCh = charger ? dataStore.getCharger(charger.id) : dataStore.getCharger(cleanId);
        this.broadcastToClients({
          type: 'CHARGER_UPDATED',
          machineId: charger ? charger.id : cleanId,
          charger: stoppedCh
        });
        this.broadcastToClients({
          type: 'SESSION_STOPPED',
          machineId: charger ? charger.id : cleanId,
          connectorId,
          transactionId: activeTxId,
          charger: stoppedCh
        });
        break;
      }

      case 'MeterValues': {
        const rawConnectorId = payload.connectorId !== undefined && payload.connectorId !== null ? Number(payload.connectorId) : 1;
        const connectorId = rawConnectorId === 0 ? 1 : rawConnectorId;
        let charger = (socketEntry?.chargerId ? dataStore.getCharger(socketEntry.chargerId) : undefined) ||
          dataStore.getCharger(cleanId) ||
          (dataStore.getChargers().length > 0 ? dataStore.getChargers()[0] : undefined);
        const conn = charger?.connectors.find((c) => c.id === connectorId);

        if (payload.transactionId) {
          const mvTxId = parseInt(String(payload.transactionId), 10);
          if (mvTxId && mvTxId > 0) {
            if (socketEntry) socketEntry.activeTransactionId = mvTxId;

            if (conn && conn.status === 'Charging') {
              this.activeSimulatorTxIds.set(cleanId, mvTxId);
              this.activeSimulatorTxIds.set(cleanId.toLowerCase(), mvTxId);
              if (charger) {
                this.activeSimulatorTxIds.set(charger.id, mvTxId);
                this.activeSimulatorTxIds.set(charger.id.toLowerCase(), mvTxId);
                dataStore.setActiveTransactionId(charger.id, connectorId, mvTxId);
              }
              conn.activeTransactionId = mvTxId;
              if (conn.currentSession && conn.currentSession.transactionId !== mvTxId) {
                conn.currentSession.transactionId = mvTxId;
              }
            }
          }
        }

        if (conn && conn.status === 'Charging' && conn.currentSession) {
          const meterValueList = payload.meterValue || [];
          let currentKwh = conn.currentSession.currentKwh;
          let currentPowerKw = conn.currentSession.currentPowerKw;
          let voltage = conn.currentSession.currentVoltage;
          let amps = conn.currentSession.currentAmps;
          let soc = conn.currentSession.soc;

          if (meterValueList.length > 0) {
            const sampled = meterValueList[0].sampledValue || [];
            sampled.forEach((sv: any) => {
              const val = parseFloat(sv.value);
              if (isNaN(val)) return;
              if (sv.measurand === 'Energy.Active.Import.Register') {
                const start = conn.currentSession?.meterStart || 0;
                currentKwh = Math.max(0, (val - start) / 1000);
              } else if (sv.measurand === 'Power.Active.Import') {
                currentPowerKw = val / 1000;
              } else if (sv.measurand === 'Voltage') {
                voltage = val;
              } else if (sv.measurand === 'Current.Import') {
                amps = val;
              } else if (sv.measurand === 'SoC') {
                soc = val;
              }
            });
          } else {
            currentKwh += 0.05;
            soc = Math.min(100, soc + 1);
          }

          const rate = charger?.baseCostPerKwh || 16.50;
          const cost = Number((currentKwh * rate + (charger?.sessionBaseFee || 10)).toFixed(2));

          const updatedSession = {
            ...conn.currentSession,
            currentKwh: Number(currentKwh.toFixed(2)),
            currentPowerKw,
            currentVoltage: voltage,
            currentAmps: amps,
            soc,
            cost
          };

          dataStore.updateConnectorStatus(charger?.id || cleanId, connectorId, 'Charging', updatedSession);
          dataStore.updateSession(conn.currentSession.transactionId, {
            energyKwh: Number(currentKwh.toFixed(2)),
            cost
          });
        }

        responsePayload = {};
        break;
      }

      case 'TransactionEvent': {
        const eventType = payload.eventType; // 'Started', 'Updated', 'Ended'
        const txInfo = payload.transactionInfo || {};
        const simTxId = txInfo.transactionId ? String(txInfo.transactionId) : '';
        const evse = payload.evse || {};
        const connectorId = Number(evse.connectorId || payload.connectorId || 1);

        let charger = (socketEntry?.chargerId ? dataStore.getCharger(socketEntry.chargerId) : undefined) ||
          dataStore.getCharger(cleanId) ||
          (dataStore.getChargers().length > 0 ? dataStore.getChargers()[0] : undefined);
        const conn = charger?.connectors.find((c) => c.id === connectorId) || charger?.connectors[0];

        if (simTxId) {
          const numericTx = parseInt(simTxId, 10);
          if (numericTx) {
            this.activeSimulatorTxIds.set(cleanId, numericTx);
            this.activeSimulatorTxIds.set(cleanId.toLowerCase(), numericTx);
            if (charger) {
              this.activeSimulatorTxIds.set(charger.id, numericTx);
              this.activeSimulatorTxIds.set(charger.id.toLowerCase(), numericTx);
            }
            if (conn && conn.currentSession) {
              conn.currentSession.transactionId = numericTx;
            }
          }
        }

        if (eventType === 'Ended') {
          this.activeSimulatorTxIds.delete(cleanId);
          this.activeSimulatorTxIds.delete(cleanId.toLowerCase());
          if (charger) {
            this.activeSimulatorTxIds.delete(charger.id);
            this.activeSimulatorTxIds.delete(charger.id.toLowerCase());
          }
          dataStore.stopSession(charger?.id || cleanId, connectorId);
          dataStore.updateConnectorStatus(charger?.id || cleanId, connectorId, 'Available', null);
        } else if (eventType === 'Started') {
          dataStore.updateConnectorStatus(charger?.id || cleanId, connectorId, 'Charging');
        }

        responsePayload = {
          totalCost: 0
        };
        break;
      }

      default:
        responsePayload = {};
        break;
    }

    // Send OCPP CALLRESULT back: [3, "<uniqueId>", { ...responsePayload }]
    const responseMsg = JSON.stringify([3, uniqueId, responsePayload]);
    ws.send(responseMsg);

    const durationMs = Date.now() - startTime;
    const respStatus = responsePayload.status || (responsePayload.idTagInfo?.status) || 'Accepted';

    dataStore.addLog({
      type: 'OCPP',
      protocol: 'OCPP 1.6J',
      machineId: cleanId,
      direction: 'OUT',
      action: `${action}Response`,
      connectorId: payload.connectorId !== undefined ? Number(payload.connectorId) : null,
      transactionId: responsePayload.transactionId || payload.transactionId || null,
      messageId: uniqueId,
      messageTypeId: 3,
      status: respStatus,
      durationMs,
      payload: responsePayload,
      rawMessage: responseMsg
    });

    const finalCharger = dataStore.getCharger(cleanId);
    if (finalCharger) {
      this.broadcastToClients({
        type: 'CHARGER_UPDATED',
        machineId: cleanId,
        charger: finalCharger
      });
    }
  }

  // Remote Commands to EV Charger
  public sendRemoteStartTransaction(machineId: string, connectorId: number, idTag = 'RFID-APP-01'): Promise<any> {
    return this.sendOcppCall(machineId, 'RemoteStartTransaction', {
      connectorId: parseInt(String(connectorId), 10) || 1,
      idTag: idTag || 'RFID-APP-01'
    });
  }

  public async startChargingSessionDirect(machineId: string, connectorId = 1, idTag = 'RFID-APP-01'): Promise<any> {
    let charger = dataStore.getCharger(machineId);
    if (!charger && dataStore.getChargers().length > 0) {
      charger = dataStore.getChargers()[0];
    }
    if (!charger) {
      charger = dataStore.saveCharger({ id: machineId, name: machineId });
    }

    // Generate single authoritative transactionId aligned with MySQL
    const dbNext = await mysqlClient.getNextTransactionId();
    const nextTxId = dbNext && dbNext >= 2001 ? dbNext : dataStore.generateNextTransactionId();
    this.transactionCounter = Math.max(this.transactionCounter, nextTxId);

    // 1. Immediately transition connector to Charging in dataStore with synchronized active session
    const startResult = dataStore.startSession(charger.id, connectorId, idTag, nextTxId);
    this.activeSimulatorTxIds.set(charger.id, nextTxId);
    this.activeSimulatorTxIds.set(charger.id.toLowerCase(), nextTxId);
    this.activeSimulatorTxIds.set(machineId, nextTxId);
    this.activeSimulatorTxIds.set(machineId.toLowerCase(), nextTxId);
    dataStore.setActiveTransactionId(charger.id, connectorId, nextTxId);

    const activeSocket = this.activeSockets.get(charger.id) ||
      this.activeSockets.get(charger.id.toLowerCase()) ||
      this.activeSockets.get(machineId) ||
      this.activeSockets.get(machineId.toLowerCase()) ||
      (this.activeSockets.size === 1 ? Array.from(this.activeSockets.values())[0] : undefined);
    if (activeSocket) {
      activeSocket.activeTransactionId = nextTxId;
    }

    // Broadcast immediately so CSMS UI updates in 0ms without waiting for socket ACK
    const initialCharger = dataStore.getCharger(charger.id);
    this.broadcastToClients({
      type: 'CHARGER_UPDATED',
      machineId: charger.id,
      charger: initialCharger
    });
    this.broadcastToClients({
      type: 'SESSION_STARTED',
      machineId: charger.id,
      connectorId,
      transactionId: nextTxId,
      charger: initialCharger
    });

    // 2. If machine socket is connected, send RemoteStartTransaction with exact required schema
    let socketResult = null;
    const targetSocket = this.activeSockets.get(charger.id) ||
      this.activeSockets.get(charger.id.toLowerCase()) ||
      this.activeSockets.get(machineId) ||
      this.activeSockets.get(machineId.toLowerCase()) ||
      (this.activeSockets.size === 1 ? Array.from(this.activeSockets.values())[0] : undefined);

    const targetId = this.isConnected(charger.id)
      ? charger.id
      : (this.isConnected(machineId)
        ? machineId
        : (targetSocket ? targetSocket.machineId : undefined));

    if (targetId) {
      try {
        socketResult = await this.sendRemoteStartTransaction(targetId, connectorId, idTag);
      } catch (err: any) {
        console.warn('RemoteStartTransaction socket warning:', err.message);
      }
    }

    // 3. Immediately broadcast updates to CSMS dashboard
    const updatedCharger = dataStore.getCharger(charger.id);
    this.broadcastToClients({
      type: 'CHARGER_UPDATED',
      machineId: charger.id,
      charger: updatedCharger
    });
    this.broadcastToClients({
      type: 'SESSION_STARTED',
      machineId: charger.id,
      connectorId,
      transactionId: nextTxId,
      charger: updatedCharger
    });

    return {
      success: true,
      message: `Charging started successfully on station ${charger.name || charger.id} connector #${connectorId}`,
      transactionId: nextTxId,
      charger: updatedCharger,
      socketResult
    };
  }

  public async sendRequestStopTransaction(machineId: string, transactionId: string | number): Promise<any> {
    const txStr = String(transactionId);
    return this.sendOcppCall(machineId, 'RequestStopTransaction', {
      transactionId: txStr
    });
  }

  public async sendRemoteStopTransaction(machineId: string, transactionId: number | string): Promise<any> {
    const numTxId = parseInt(String(transactionId), 10);
    const validTx = !isNaN(numTxId) && numTxId > 0 ? numTxId : 2001;
    return this.sendOcppCall(machineId, 'RemoteStopTransaction', {
      transactionId: validTx
    });
  }

  public async stopChargingSessionDirect(machineId: string, connectorId = 1, transactionId?: number): Promise<any> {
    let charger = dataStore.getCharger(machineId);
    if (!charger && dataStore.getChargers().length > 0) {
      charger = dataStore.getChargers()[0];
    }
    if (!charger) {
      charger = dataStore.saveCharger({ id: machineId, name: machineId });
    }

    const conn = (connectorId ? charger.connectors.find((c) => c.id === connectorId) : undefined) ||
      charger.connectors.find((c) => c.status === 'Charging' || !!c.currentSession) ||
      charger.connectors[0];

    // Authoritative lookup of active transaction ID:
    const activeSocket = this.getSocketForCharger(charger.id) || this.getSocketForCharger(machineId);

    const socketTxId = Number(activeSocket?.activeTransactionId) || 0;
    const dbActiveTx = (await mysqlClient.getActiveTransaction(charger.id, conn.id)) ||
      (await mysqlClient.getActiveTransaction(machineId, conn.id)) || 0;
    const latestDbTx = (await mysqlClient.getLatestTransaction(charger.id, conn.id)) ||
      (await mysqlClient.getLatestTransaction(machineId, conn.id)) || 0;
    const activeStoredTxId = Number(dataStore.getActiveTransactionId(charger.id, conn.id)) || 0;
    const inMemoryTxId = Number(this.activeSimulatorTxIds.get(charger.id)) ||
      Number(this.activeSimulatorTxIds.get(charger.id.toLowerCase())) ||
      Number(this.activeSimulatorTxIds.get(machineId)) ||
      Number(this.activeSimulatorTxIds.get(machineId.toLowerCase())) ||
      0;
    const connTxId = Number(conn?.activeTransactionId) || Number(conn?.currentSession?.transactionId) || 0;
    const chargerTxId = Number(charger.activeTransactionId) || 0;
    const explicitTxId = (transactionId !== undefined && transactionId !== null && Number(transactionId) > 0) ? Number(transactionId) : 0;

    // Prioritize authoritative live transaction ID
    const primaryTxId = explicitTxId || socketTxId || connTxId || dbActiveTx || activeStoredTxId || inMemoryTxId || chargerTxId || latestDbTx || 2001;
    const txId = primaryTxId;

    // 1. IMMEDIATELY stop the session in dataStore and MySQL so the UI and state flip to Available instantly
    this.activeSimulatorTxIds.delete(charger.id);
    this.activeSimulatorTxIds.delete(charger.id.toLowerCase());
    this.activeSimulatorTxIds.delete(machineId);
    this.activeSimulatorTxIds.delete(machineId.toLowerCase());
    if (activeSocket) {
      activeSocket.activeTransactionId = undefined;
    }
    dataStore.setActiveTransactionId(charger.id, conn.id, null);

    // Finalize session in CSMS and MySQL so screen & DB immediately update to Available
    const result = dataStore.stopSession(charger.id, conn.id, txId);
    // Safety check: ensure all connectors on this station that were in Charging state are reset to Available
    charger.connectors.forEach((c) => {
      if (c.id === conn.id || c.status === 'Charging') {
        c.status = 'Available';
        c.currentSession = null;
        c.activeTransactionId = null;
      }
    });
    charger.status = 'Available';
    charger.activeTransactionId = null;
    dataStore.saveData();

    await mysqlClient.updateSessionStatus(txId, 'Completed').catch((e) => console.warn('[MySQL] err:', e.message));
    await mysqlClient.updateConnectorStatus(charger.id, conn.id, 'Available').catch((e) => console.warn('[MySQL] err:', e.message));
    await mysqlClient.updateChargerStatus(charger.id, 'Available', true).catch((e) => console.warn('[MySQL] err:', e.message));

    const updatedCharger = dataStore.getCharger(charger.id);
    this.broadcastToClients({
      type: 'CHARGER_UPDATED',
      machineId: charger.id,
      charger: updatedCharger
    });
    this.broadcastToClients({
      type: 'SESSION_STOPPED',
      machineId: charger.id,
      connectorId: conn.id,
      transactionId: txId,
      charger: updatedCharger
    });

    dataStore.addLog({
      type: 'SYSTEM',
      protocol: 'CSMS Core',
      machineId: charger.id,
      direction: 'OUT',
      action: 'StopChargingDirect',
      connectorId: conn.id,
      transactionId: txId,
      status: 'Completed',
      payload: { connectorId: conn.id, transactionId: txId, socketConnected: !!activeSocket }
    });

    // 2. Dispatch RemoteStopTransaction & UnlockConnector to connected charger socket with fast 2.5s timeout
    let socketResult: any = null;
    let fallbackUnlock: any = null;

    const targetId = activeSocket ? activeSocket.machineId : (charger ? charger.id : machineId);

    if (activeSocket && activeSocket.ws.readyState === WebSocket.OPEN) {
      try {
        socketResult = await this.sendRemoteStopTransaction(targetId, txId);
      } catch (err: any) {
        console.warn(`RemoteStopTransaction (${txId}) warning:`, err.message);
      }

      // If rejected and we have a different secondary ID, try it once
      const isAccepted = socketResult?.payload?.status === 'Accepted' || socketResult?.status === 'Accepted';
      if (!isAccepted && connTxId && connTxId !== txId) {
        try {
          socketResult = await this.sendRemoteStopTransaction(targetId, connTxId);
        } catch {}
      }

      // Also send UnlockConnector to ensure cable release
      try {
        fallbackUnlock = await this.sendUnlockConnector(targetId, conn.id);
      } catch (err: any) {
        console.warn('UnlockConnector error:', err.message);
      }
    }

    return {
      success: true,
      message: `Charging stopped successfully for station ${charger.name || charger.id} connector #${conn.id}`,
      transactionId: txId,
      status: 'Completed',
      charger: updatedCharger,
      socketResult,
      fallbackUnlock,
      result
    };
  }

  public sendReset(machineId: string, type: 'Hard' | 'Soft' = 'Soft'): Promise<any> {
    return this.sendOcppCall(machineId, 'Reset', { type });
  }

  public sendUnlockConnector(machineId: string, connectorId: number): Promise<any> {
    return this.sendOcppCall(machineId, 'UnlockConnector', {
      connectorId: parseInt(String(connectorId), 10) || 1
    });
  }

  public isConnected(machineId: string): boolean {
    const clean = machineId.trim();
    const item = this.activeSockets.get(clean) || this.activeSockets.get(clean.toLowerCase());
    if (item && item.ws.readyState === WebSocket.OPEN) return true;

    const uniqueSockets = this.getUniqueSockets();
    if (uniqueSockets.length > 0) {
      const match = uniqueSockets.find(s =>
        s.machineId.toLowerCase() === clean.toLowerCase() ||
        s.chargerId?.toLowerCase() === clean.toLowerCase()
      );
      if (match) return true;
      if (dataStore.getChargers().length === 1) return true;
    }
    return false;
  }

  private sendOcppCall(machineId: string, action: string, payload: any, timeoutMs: number = 2500): Promise<any> {
    return new Promise((resolve, reject) => {
      const active = this.getSocketForCharger(machineId);

      if (!active || active.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error(`Charger ${machineId} is not connected via WebSocket`));
      }

      // Exact CSMS-REMO message ID format expected by hardware
      const uniqueId = `CSMS-REMO-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const call = JSON.stringify([2, uniqueId, action, payload]);
      const startTime = Date.now();
      const stationId = active.chargerId || active.machineId || machineId;

      dataStore.addLog({
        type: 'OCPP',
        protocol: 'OCPP 1.6J',
        machineId: stationId,
        direction: 'OUT',
        action,
        connectorId: payload.connectorId !== undefined ? Number(payload.connectorId) : null,
        transactionId: payload.transactionId !== undefined ? payload.transactionId : null,
        messageId: uniqueId,
        messageTypeId: 2,
        status: 'Dispatched',
        payload,
        rawMessage: call
      });

      const timer = setTimeout(() => {
        this.pendingCalls.delete(uniqueId);
        resolve({ success: true, uniqueId, status: 'Dispatched (No ACK)', message: `${action} dispatched to charger socket` });
      }, timeoutMs);

      this.pendingCalls.set(uniqueId, {
        action,
        machineId: stationId,
        startTime,
        resolve,
        reject,
        timer
      });

      active.ws.send(call, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingCalls.delete(uniqueId);
          return reject(err);
        }
      });
    });
  }

  public broadcastToClients(msg: any) {
    const raw = JSON.stringify(msg);
    this.clientSockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(raw);
        } catch {
          // ignore
        }
      }
    });
  }
}

