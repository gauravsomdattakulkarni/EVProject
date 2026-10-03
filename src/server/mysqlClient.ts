import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { Charger, Connector, OcpiPartner, Tariff, ChargingSessionRecord, LogItem } from './dataStore.js';

dotenv.config();

export class MySqlClient {
  private pool: mysql.Pool | null = null;
  public isConnected = false;
  private hasInitialized = false;

  constructor() {
    this.createPool();
  }

  private createPool() {
    try {
      const host = process.env.DB_HOST || '127.0.0.1';
      const port = Number(process.env.DB_PORT) || 3306;
      const user = process.env.DB_USERNAME || 'evchargersatmatg_ev';
      // Clean leading and trailing quotes if present
      const password = (process.env.DB_PASSWORD || '{Kbip;e3NlL]Rpgm').replace(/^["']|["']$/g, '');
      const database = process.env.DB_DATABASE || 'evchargersatmatg_ev';

      this.pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 5000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
      });
    } catch (err: any) {
      console.warn('[MySQL] Failed to create connection pool:', err.message);
      this.pool = null;
    }
  }

  public async init(): Promise<boolean> {
    if (!this.pool) this.createPool();
    if (!this.pool) return false;
    try {
      const conn = await this.pool.getConnection();
      this.isConnected = true;
      conn.release();
      console.log('[MySQL] Connected to database successfully:', process.env.DB_DATABASE || 'evchargersatmatg_ev');
      this.hasInitialized = true;

      // Seed initial data into tables if they are empty
      await this.seedDefaultsIfEmpty();

      return true;
    } catch (err: any) {
      this.isConnected = false;
      console.warn(`[MySQL] Note: Could not connect to MySQL at ${process.env.DB_HOST || '127.0.0.1'}:3306 (${err.message}). Application will keep caching state until reachable.`);
      return false;
    }
  }

  /**
   * Seed default station, connectors, tariff, and roaming partner if tables are currently empty
   */
  public async seedDefaultsIfEmpty(): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      // 1. Check if chargers table has records
      const [chargerRows] = await this.pool.query<any[]>('SELECT COUNT(*) as cnt FROM chargers');
      const chargerCount = chargerRows?.[0]?.cnt || 0;

      if (Number(chargerCount) === 0) {
        console.log('[MySQL] chargers table is empty. Seeding default charger SATMAT-EV-001...');
        const domain = process.env.APP_URL || 'https://evcharger.satmatgroup.com';
        const cleanDomain = domain.replace(/^https?:\/\//, '');

        await this.pool.execute(
          `INSERT INTO chargers (
            id, name, ws_url, local_ws_url, address, city, postal_code, country,
            latitude, longitude, status, is_connected, ocpp_version,
            base_cost_per_kwh, idle_fee_per_minute, session_base_fee, max_power_kw,
            charge_point_vendor, charge_point_model, firmware_version, created_at, updated_at
          ) VALUES (
            'SATMAT-EV-001', 'SATMAT EV Fast Charger 1',
            ?, ?,
            'SATMAT Tech Park, Viman Nagar', 'Pune', '411014', 'IND',
            18.5679000, 73.9143000, 'Available', 0, '1.6J',
            16.00, 1.00, 10.00, 60.00,
            'SATMAT', 'SM-60KW-DC', 'v1.6.2', NOW(), NOW()
          ) ON DUPLICATE KEY UPDATE updated_at = NOW()`,
          [`wss://${cleanDomain}/ocpp/SATMAT-EV-001`, `ws://localhost:${process.env.PORT || 3000}/ocpp/SATMAT-EV-001`]
        );
      }

      // 2. Check if connectors table has records
      const [connRows] = await this.pool.query<any[]>('SELECT COUNT(*) as cnt FROM connectors WHERE charger_id = "SATMAT-EV-001"');
      const connCount = connRows?.[0]?.cnt || 0;

      if (Number(connCount) === 0) {
        console.log('[MySQL] connectors table is empty. Seeding connectors for SATMAT-EV-001...');
        await this.pool.execute(
          `INSERT INTO connectors (
            charger_id, connector_number, name, type, power_type, max_kw, voltage, amperage, status, created_at, updated_at
          ) VALUES 
          ('SATMAT-EV-001', 1, 'Connector 1 (CCS2 Fast DC)', 'CCS2', 'DC', 60.00, 400, 150, 'Available', NOW(), NOW()),
          ('SATMAT-EV-001', 2, 'Connector 2 (Type 2 AC)', 'Type2', 'AC_3_PHASE', 22.00, 400, 32, 'Available', NOW(), NOW())`
        );
      }

      // 3. Check if tariffs table has records
      const [tariffRows] = await this.pool.query<any[]>('SELECT COUNT(*) as cnt FROM tariffs');
      const tariffCount = tariffRows?.[0]?.cnt || 0;

      if (Number(tariffCount) === 0) {
        console.log('[MySQL] tariffs table is empty. Seeding default tariff...');
        await this.pool.execute(
          `INSERT INTO tariffs (
            id, name, currency, price_per_kwh, price_per_minute, idle_fee_per_minute, session_fee, tax_percentage, created_at, updated_at
          ) VALUES (
            'tariff-default-inr', 'SATMAT Standard Fast Charge Tariff', 'INR', 16.00, 0.00, 1.00, 10.00, 18.00, NOW(), NOW()
          ) ON DUPLICATE KEY UPDATE updated_at = NOW()`
        );
      }

      // 4. Check if ocpi_partners table has records
      const [partnerRows] = await this.pool.query<any[]>('SELECT COUNT(*) as cnt FROM ocpi_partners');
      const partnerCount = partnerRows?.[0]?.cnt || 0;

      if (Number(partnerCount) === 0) {
        console.log('[MySQL] ocpi_partners table is empty. Seeding default OCPI roaming partner...');
        await this.pool.execute(
          `INSERT INTO ocpi_partners (
            id, name, party_id, country_code, role, token_a, token_b, partner_token, url, ocpi_version, status, pricing_type, custom_cost_per_kwh, price_adjustment_percent, notes, created_at, updated_at
          ) VALUES (
            'partner-satmat-msp', 'SATMAT Roaming eMSP India', 'SAT', 'IN', 'eMSP',
            'a1b2c3d4-token-a-satmat-2026', 'b2c3d4e5-token-b-satmat-2026', 'c3d4e5f6-partner-token-2026',
            'https://evcharger.satmatgroup.com/ocpi/versions', '2.2', 'ACTIVE', 'DEFAULT', NULL, 0.00,
            'Primary OCPI Roaming Network for SATMAT EV Fleet', NOW(), NOW()
          ) ON DUPLICATE KEY UPDATE updated_at = NOW()`
        );
      }

      // 5. Ensure ocpp_logs table exists with full detailed columns
      await this.ensureLogsTable();

      console.log('[MySQL] Table seeding verification completed successfully.');
    } catch (err: any) {
      console.warn('[MySQL] seedDefaultsIfEmpty note:', err.message);
    }
  }

  /**
   * Ensures ocpp_logs table exists in MySQL with all maximum detail columns
   */
  public async ensureLogsTable(): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS ocpp_logs (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          log_id VARCHAR(128) NULL,
          type VARCHAR(20) NOT NULL DEFAULT 'OCPP',
          protocol VARCHAR(50) NOT NULL DEFAULT 'OCPP 1.6J',
          direction ENUM('IN', 'OUT') NOT NULL,
          action VARCHAR(100) NOT NULL,
          machine_id VARCHAR(64) NULL,
          connector_id INT NULL,
          transaction_id VARCHAR(64) NULL,
          message_id VARCHAR(128) NULL,
          message_type_id INT NULL,
          status VARCHAR(64) NULL,
          duration_ms INT NULL,
          ip VARCHAR(45) NULL,
          payload JSON NULL,
          raw_message LONGTEXT NULL,
          details JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_logs_machine (machine_id),
          INDEX idx_logs_action (action),
          INDEX idx_logs_direction (direction),
          INDEX idx_logs_tx (transaction_id),
          INDEX idx_logs_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (err: any) {
      console.warn('[MySQL] ensureLogsTable note:', err.message);
    }
  }

  /**
   * Guarantees charger exists in MySQL 'chargers' table so foreign keys in connectors and charging_sessions never fail
   */
  public async ensureChargerExists(chargerId: string, chargerName?: string): Promise<void> {
    if (!this.pool || !this.isConnected || !chargerId) return;
    try {
      const cleanId = chargerId.trim();
      const domain = process.env.APP_URL || 'https://evcharger.satmatgroup.com';
      const cleanDomain = domain.replace(/^https?:\/\//, '');

      const sql = `
        INSERT INTO chargers (
          id, name, ws_url, local_ws_url, address, city, postal_code, country,
          latitude, longitude, status, is_connected, ocpp_version,
          base_cost_per_kwh, idle_fee_per_minute, session_base_fee, max_power_kw,
          charge_point_vendor, charge_point_model, firmware_version, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, 'Station Location', 'Pune', '411001', 'IND',
          18.5204, 73.8567, 'Available', 1, '1.6J',
          16.00, 1.00, 10.00, 60.00,
          'SATMAT', 'SM-01', 'v1.0.0', NOW(), NOW()
        )
        ON DUPLICATE KEY UPDATE
          is_connected = 1,
          updated_at = NOW()
      `;

      await this.pool.execute(sql, [
        cleanId,
        chargerName || `SATMAT Charger ${cleanId}`,
        `wss://${cleanDomain}/ocpp/${cleanId}`,
        `ws://localhost:${process.env.PORT || 3000}/ocpp/${cleanId}`
      ]);

      // Ensure connector 1 exists
      const [conns] = await this.pool.query<any[]>(
        'SELECT id FROM connectors WHERE charger_id = ? AND connector_number = 1',
        [cleanId]
      );
      if (!conns || conns.length === 0) {
        await this.pool.execute(
          `INSERT INTO connectors (
            charger_id, connector_number, name, type, power_type, max_kw, voltage, amperage, status, created_at, updated_at
          ) VALUES (?, 1, 'Connector 1', 'CCS2', 'DC', 60.00, 400, 150, 'Available', NOW(), NOW())`,
          [cleanId]
        );
      }
    } catch (err: any) {
      console.warn('[MySQL] ensureChargerExists warning:', err.message);
    }
  }

  /**
   * Direct query to get the next authoritative transactionId from MySQL charging_sessions table
   */
  public async getNextTransactionId(): Promise<number> {
    if (!this.pool || !this.isConnected) return 2001;
    try {
      const [rows] = await this.pool.query<any[]>(
        'SELECT COALESCE(MAX(transaction_id), 2000) + 1 AS nextId FROM charging_sessions'
      );
      if (rows && rows.length > 0 && rows[0].nextId) {
        return Math.max(2001, Number(rows[0].nextId));
      }
    } catch (err: any) {
      console.warn('[MySQL] getNextTransactionId error:', err.message);
    }
    return 2001;
  }

  /**
   * Look up active transaction_id directly from MySQL charging_sessions table
   */
  public async getActiveTransaction(machineId: string, connectorId = 1): Promise<number | null> {
    if (!this.pool || !this.isConnected || !machineId) return null;
    try {
      const [rows] = await this.pool.query<any[]>(
        `SELECT transaction_id FROM charging_sessions 
         WHERE (machine_id = ? OR machine_id = ?) 
           AND status = 'Active' 
         ORDER BY id DESC, start_time DESC LIMIT 1`,
        [machineId.trim(), machineId.trim().toLowerCase()]
      );
      if (rows && rows.length > 0 && rows[0].transaction_id) {
        const tx = Number(rows[0].transaction_id);
        if (!isNaN(tx) && tx > 0) return tx;
      }
    } catch (err: any) {
      console.warn('[MySQL] getActiveTransaction error:', err.message);
    }
    return null;
  }

  /**
   * Look up the most recent transaction_id (Active or latest) directly from MySQL
   */
  public async getLatestTransaction(machineId: string, connectorId = 1): Promise<number | null> {
    if (!this.pool || !this.isConnected || !machineId) return null;
    try {
      const [rows] = await this.pool.query<any[]>(
        `SELECT transaction_id FROM charging_sessions 
         WHERE (machine_id = ? OR machine_id = ?) 
         ORDER BY id DESC, start_time DESC LIMIT 1`,
        [machineId.trim(), machineId.trim().toLowerCase()]
      );
      if (rows && rows.length > 0 && rows[0].transaction_id) {
        const tx = Number(rows[0].transaction_id);
        if (!isNaN(tx) && tx > 0) return tx;
      }
    } catch (err: any) {
      console.warn('[MySQL] getLatestTransaction error:', err.message);
    }
    return null;
  }

  public async loadChargers(): Promise<Charger[]> {
    if (!this.pool || !this.isConnected) return [];
    try {
      const [rows] = await this.pool.query<any[]>('SELECT * FROM chargers ORDER BY created_at DESC');
      if (!Array.isArray(rows) || rows.length === 0) return [];

      const chargers: Charger[] = [];
      for (const row of rows) {
        const [connRows] = await this.pool.query<any[]>(
          'SELECT * FROM connectors WHERE charger_id = ? ORDER BY connector_number ASC',
          [row.id]
        );

        const connectors: Connector[] = (connRows || []).map((cr: any) => ({
          id: cr.connector_number || cr.id,
          name: cr.name || `Connector ${cr.connector_number || 1}`,
          type: cr.type || 'CCS2',
          powerType: cr.power_type || 'DC',
          maxKw: Number(cr.max_kw) || 60,
          voltage: Number(cr.voltage) || 400,
          amperage: Number(cr.amperage) || 150,
          status: cr.status || 'Available',
          currentSession: null
        }));

        chargers.push({
          id: row.id,
          name: row.name,
          wsUrl: row.ws_url,
          localWsUrl: row.local_ws_url || `ws://localhost:3000/ocpp/${row.id}`,
          location: {
            name: row.name,
            address: row.address || '',
            city: row.city || 'Pune',
            postalCode: row.postal_code || '411001',
            country: row.country || 'IND',
            latitude: Number(row.latitude) || 18.5204,
            longitude: Number(row.longitude) || 73.8567
          },
          status: row.status || 'Offline',
          isConnected: Boolean(row.is_connected),
          lastHeartbeat: row.last_heartbeat ? new Date(row.last_heartbeat).toISOString() : null,
          ocppVersion: (row.ocpp_version as any) || '1.6J',
          connectors: connectors.length > 0 ? connectors : [
            {
              id: 1,
              name: 'Connector 1',
              type: 'CCS2',
              powerType: 'DC',
              maxKw: Number(row.max_power_kw) || 60,
              voltage: 400,
              amperage: 150,
              status: 'Available',
              currentSession: null
            }
          ],
          baseCostPerKwh: Number(row.base_cost_per_kwh) || 16,
          idleFeePerMinute: Number(row.idle_fee_per_minute) || 1,
          sessionBaseFee: Number(row.session_base_fee) || 10,
          maxPowerKw: Number(row.max_power_kw) || 60,
          chargePointVendor: row.charge_point_vendor || 'SATMAT',
          chargePointModel: row.charge_point_model || 'SM-01',
          firmwareVersion: row.firmware_version || 'v1.6J',
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
        });
      }
      return chargers;
    } catch (err: any) {
      console.warn('[MySQL] loadChargers error:', err.message);
      return [];
    }
  }

  public async saveCharger(charger: Charger): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      const sql = `
        INSERT INTO chargers (
          id, name, ws_url, local_ws_url, address, city, postal_code, country,
          latitude, longitude, status, is_connected, last_heartbeat, ocpp_version,
          base_cost_per_kwh, idle_fee_per_minute, session_base_fee, max_power_kw,
          charge_point_vendor, charge_point_model, firmware_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          ws_url = VALUES(ws_url),
          local_ws_url = VALUES(local_ws_url),
          address = VALUES(address),
          city = VALUES(city),
          postal_code = VALUES(postal_code),
          country = VALUES(country),
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          status = VALUES(status),
          is_connected = VALUES(is_connected),
          last_heartbeat = VALUES(last_heartbeat),
          ocpp_version = VALUES(ocpp_version),
          base_cost_per_kwh = VALUES(base_cost_per_kwh),
          idle_fee_per_minute = VALUES(idle_fee_per_minute),
          session_base_fee = VALUES(session_base_fee),
          max_power_kw = VALUES(max_power_kw),
          charge_point_vendor = VALUES(charge_point_vendor),
          charge_point_model = VALUES(charge_point_model),
          firmware_version = VALUES(firmware_version),
          updated_at = NOW()
      `;

      await this.pool.execute(sql, [
        charger.id,
        charger.name,
        charger.wsUrl,
        charger.localWsUrl || null,
        charger.location?.address || '',
        charger.location?.city || 'Pune',
        charger.location?.postalCode || '411001',
        charger.location?.country || 'IND',
        charger.location?.latitude || 18.5204,
        charger.location?.longitude || 73.8567,
        charger.status || 'Offline',
        charger.isConnected ? 1 : 0,
        charger.lastHeartbeat ? new Date(charger.lastHeartbeat) : null,
        charger.ocppVersion || '1.6J',
        charger.baseCostPerKwh || 16,
        charger.idleFeePerMinute || 1,
        charger.sessionBaseFee || 10,
        charger.maxPowerKw || 60,
        charger.chargePointVendor || 'SATMAT',
        charger.chargePointModel || 'SM-01',
        charger.firmwareVersion || 'v1.6J'
      ]);

      // Save connectors into MySQL
      if (charger.connectors && charger.connectors.length > 0) {
        for (const conn of charger.connectors) {
          const connNumber = conn.id || 1;
          const [exists] = await this.pool.query<any[]>(
            'SELECT id FROM connectors WHERE charger_id = ? AND connector_number = ?',
            [charger.id, connNumber]
          );

          if (exists && exists.length > 0) {
            await this.pool.execute(
              `UPDATE connectors SET 
                name = ?, type = ?, power_type = ?, max_kw = ?, voltage = ?, amperage = ?, status = ?, updated_at = NOW()
               WHERE charger_id = ? AND connector_number = ?`,
              [
                conn.name,
                conn.type || 'CCS2',
                conn.powerType || 'DC',
                conn.maxKw || 60,
                conn.voltage || 400,
                conn.amperage || 150,
                conn.status || 'Available',
                charger.id,
                connNumber
              ]
            );
          } else {
            await this.pool.execute(
              `INSERT INTO connectors (
                charger_id, connector_number, name, type, power_type,
                max_kw, voltage, amperage, status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                charger.id,
                connNumber,
                conn.name || `Connector ${connNumber}`,
                conn.type || 'CCS2',
                conn.powerType || 'DC',
                conn.maxKw || 60,
                conn.voltage || 400,
                conn.amperage || 150,
                conn.status || 'Available'
              ]
            );
          }
        }
      }
    } catch (err: any) {
      console.warn('[MySQL] saveCharger error:', err.message);
    }
  }

  public async updateChargerStatus(id: string, status: string, isConnected: boolean, heartbeat = false): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      if (heartbeat) {
        await this.pool.execute(
          'UPDATE chargers SET status = ?, is_connected = ?, last_heartbeat = NOW(), updated_at = NOW() WHERE id = ?',
          [status, isConnected ? 1 : 0, id]
        );
      } else {
        await this.pool.execute(
          'UPDATE chargers SET status = ?, is_connected = ?, updated_at = NOW() WHERE id = ?',
          [status, isConnected ? 1 : 0, id]
        );
      }
    } catch (err: any) {
      console.warn('[MySQL] updateChargerStatus error:', err.message);
    }
  }

  public async updateConnectorStatus(chargerId: string, connectorId: number, status: string): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      await this.ensureChargerExists(chargerId);
      const connNum = connectorId || 1;
      const [res] = await this.pool.execute<any>(
        'UPDATE connectors SET status = ?, updated_at = NOW() WHERE charger_id = ? AND connector_number = ?',
        [status, chargerId, connNum]
      );
      if (res && res.affectedRows === 0) {
        await this.pool.execute(
          `INSERT INTO connectors (
            charger_id, connector_number, name, type, power_type, max_kw, voltage, amperage, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'CCS2', 'DC', 60.00, 400, 150, ?, NOW(), NOW())`,
          [chargerId, connNum, `Connector ${connNum}`, status]
        );
      }
    } catch (err: any) {
      console.warn('[MySQL] updateConnectorStatus error:', err.message);
    }
  }

  public async saveSession(session: ChargingSessionRecord): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      // Guarantee charger exists in chargers table before session insert
      await this.ensureChargerExists(session.machineId);

      const sql = `
        INSERT INTO charging_sessions (
          id, transaction_id, machine_id, connector_id, id_tag,
          start_time, end_time, energy_kwh, cost, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          end_time = VALUES(end_time),
          energy_kwh = VALUES(energy_kwh),
          cost = VALUES(cost),
          status = VALUES(status),
          updated_at = NOW()
      `;

      await this.pool.execute(sql, [
        session.id,
        session.transactionId,
        session.machineId,
        session.connectorId || 1,
        session.idTag || 'SATMAT-ADMIN-CARD',
        session.startTime ? new Date(session.startTime) : new Date(),
        session.endTime ? new Date(session.endTime) : null,
        Number(session.energyKwh) || 0,
        Number(session.cost) || 0,
        session.status || 'Active'
      ]);
    } catch (err: any) {
      console.warn('[MySQL] saveSession error:', err.message);
    }
  }

  public async updateSessionStatus(transactionId: number, status: 'Active' | 'Completed' | 'Stopped', energyKwh?: number, cost?: number): Promise<void> {
    if (!this.pool || !this.isConnected || !transactionId) return;
    try {
      const isEnd = status === 'Completed' || status === 'Stopped';
      if (isEnd) {
        await this.pool.execute(
          `UPDATE charging_sessions SET 
            status = ?, 
            end_time = COALESCE(end_time, NOW()),
            energy_kwh = COALESCE(?, energy_kwh),
            cost = COALESCE(?, cost),
            updated_at = NOW() 
           WHERE transaction_id = ?`,
          [status, energyKwh !== undefined ? Number(energyKwh) : null, cost !== undefined ? Number(cost) : null, transactionId]
        );
      } else {
        await this.pool.execute(
          `UPDATE charging_sessions SET 
            status = ?,
            energy_kwh = COALESCE(?, energy_kwh),
            cost = COALESCE(?, cost),
            updated_at = NOW() 
           WHERE transaction_id = ?`,
          [status, energyKwh !== undefined ? Number(energyKwh) : null, cost !== undefined ? Number(cost) : null, transactionId]
        );
      }
    } catch (err: any) {
      console.warn('[MySQL] updateSessionStatus error:', err.message);
    }
  }

  public async loadSessions(): Promise<ChargingSessionRecord[]> {
    if (!this.pool || !this.isConnected) return [];
    try {
      const [rows] = await this.pool.query<any[]>('SELECT * FROM charging_sessions ORDER BY start_time DESC LIMIT 500');
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        id: r.id,
        transactionId: Number(r.transaction_id),
        machineId: r.machine_id,
        connectorId: Number(r.connector_id) || 1,
        idTag: r.id_tag,
        startTime: r.start_time ? new Date(r.start_time).toISOString() : new Date().toISOString(),
        endTime: r.end_time ? new Date(r.end_time).toISOString() : null,
        energyKwh: Number(r.energy_kwh) || 0,
        cost: Number(r.cost) || 0,
        status: r.status || 'Active'
      }));
    } catch (err: any) {
      console.warn('[MySQL] loadSessions error:', err.message);
      return [];
    }
  }

  public async savePartner(partner: OcpiPartner): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      const sql = `
        INSERT INTO ocpi_partners (
          id, name, party_id, country_code, role, token_a, token_b, partner_token,
          url, ocpi_version, status, pricing_type, custom_cost_per_kwh, price_adjustment_percent,
          notes, last_access_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          party_id = VALUES(party_id),
          country_code = VALUES(country_code),
          role = VALUES(role),
          token_a = VALUES(token_a),
          token_b = VALUES(token_b),
          partner_token = VALUES(partner_token),
          url = VALUES(url),
          ocpi_version = VALUES(ocpi_version),
          status = VALUES(status),
          pricing_type = VALUES(pricing_type),
          custom_cost_per_kwh = VALUES(custom_cost_per_kwh),
          price_adjustment_percent = VALUES(price_adjustment_percent),
          notes = VALUES(notes),
          last_access_at = VALUES(last_access_at),
          updated_at = NOW()
      `;

      await this.pool.execute(sql, [
        partner.id,
        partner.name,
        partner.partyId,
        partner.countryCode || 'IN',
        partner.role || 'eMSP',
        partner.tokenA,
        partner.tokenB,
        partner.partnerToken || null,
        partner.url || '',
        partner.ocpiVersion || '2.0',
        partner.status || 'ACTIVE',
        partner.pricingType || 'DEFAULT',
        partner.customCostPerKwh || null,
        partner.priceAdjustmentPercent || 0,
        partner.notes || '',
        partner.lastAccessAt ? new Date(partner.lastAccessAt) : null
      ]);
    } catch (err: any) {
      console.warn('[MySQL] savePartner error:', err.message);
    }
  }

  public async loadPartners(): Promise<OcpiPartner[]> {
    if (!this.pool || !this.isConnected) return [];
    try {
      const [rows] = await this.pool.query<any[]>('SELECT * FROM ocpi_partners ORDER BY created_at DESC');
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        partyId: r.party_id,
        countryCode: r.country_code || 'IN',
        role: r.role || 'eMSP',
        tokenA: r.token_a,
        tokenB: r.token_b,
        partnerToken: r.partner_token || '',
        url: r.url || '',
        ocpiVersion: r.ocpi_version || '2.0',
        status: r.status || 'ACTIVE',
        pricingType: r.pricing_type || 'DEFAULT',
        customCostPerKwh: r.custom_cost_per_kwh ? Number(r.custom_cost_per_kwh) : null,
        priceAdjustmentPercent: r.price_adjustment_percent ? Number(r.price_adjustment_percent) : 0,
        notes: r.notes || '',
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        lastAccessAt: r.last_access_at ? new Date(r.last_access_at).toISOString() : null
      }));
    } catch (err: any) {
      console.warn('[MySQL] loadPartners error:', err.message);
      return [];
    }
  }

  public async deletePartner(id: string): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      await this.pool.execute('DELETE FROM ocpi_partners WHERE id = ?', [id]);
    } catch (err: any) {
      console.warn('[MySQL] deletePartner error:', err.message);
    }
  }

  public async saveTariff(tariff: Tariff): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      const sql = `
        INSERT INTO tariffs (
          id, name, currency, price_per_kwh, price_per_minute,
          idle_fee_per_minute, session_fee, tax_percentage, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          currency = VALUES(currency),
          price_per_kwh = VALUES(price_per_kwh),
          price_per_minute = VALUES(price_per_minute),
          idle_fee_per_minute = VALUES(idle_fee_per_minute),
          session_fee = VALUES(session_fee),
          tax_percentage = VALUES(tax_percentage),
          updated_at = NOW()
      `;

      await this.pool.execute(sql, [
        tariff.id,
        tariff.name,
        tariff.currency || 'INR',
        tariff.pricePerKwh || 16,
        tariff.pricePerMinute || 0,
        tariff.idleFeePerMinute || 1,
        tariff.sessionFee || 10,
        tariff.taxPercentage || 18
      ]);
    } catch (err: any) {
      console.warn('[MySQL] saveTariff error:', err.message);
    }
  }

  public async loadTariffs(): Promise<Tariff[]> {
    if (!this.pool || !this.isConnected) return [];
    try {
      const [rows] = await this.pool.query<any[]>('SELECT * FROM tariffs ORDER BY created_at DESC');
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        currency: r.currency || 'INR',
        pricePerKwh: Number(r.price_per_kwh) || 16,
        pricePerMinute: Number(r.price_per_minute) || 0,
        idleFeePerMinute: Number(r.idle_fee_per_minute) || 1,
        sessionFee: Number(r.session_fee) || 10,
        taxPercentage: Number(r.tax_percentage) || 18
      }));
    } catch (err: any) {
      console.warn('[MySQL] loadTariffs error:', err.message);
      return [];
    }
  }

  public async deleteTariff(id: string): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      await this.pool.execute('DELETE FROM tariffs WHERE id = ?', [id]);
    } catch (err: any) {
      console.warn('[MySQL] deleteTariff error:', err.message);
    }
  }

  public async deleteCharger(id: string): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      await this.pool.execute('DELETE FROM connectors WHERE charger_id = ?', [id]);
      await this.pool.execute('DELETE FROM charging_sessions WHERE machine_id = ?', [id]);
      await this.pool.execute('DELETE FROM chargers WHERE id = ?', [id]);
    } catch (err: any) {
      console.warn('[MySQL] deleteCharger error:', err.message);
    }
  }

  /**
   * Save rich request/response log directly to MySQL ocpp_logs table
   */
  public async saveLog(log: LogItem): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      const sql = `
        INSERT INTO ocpp_logs (
          log_id, type, protocol, direction, action, machine_id, connector_id,
          transaction_id, message_id, message_type_id, status, duration_ms, ip,
          payload, raw_message, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.pool.execute(sql, [
        log.id || null,
        log.type || 'OCPP',
        log.protocol || 'OCPP 1.6J',
        log.direction,
        log.action,
        log.machineId || null,
        log.connectorId !== undefined && log.connectorId !== null ? Number(log.connectorId) : null,
        log.transactionId !== undefined && log.transactionId !== null ? String(log.transactionId) : null,
        log.messageId || null,
        log.messageTypeId !== undefined && log.messageTypeId !== null ? Number(log.messageTypeId) : null,
        log.status || null,
        log.durationMs !== undefined && log.durationMs !== null ? Number(log.durationMs) : null,
        log.ip || null,
        log.payload ? JSON.stringify(log.payload) : null,
        log.rawMessage || null,
        log.details ? JSON.stringify(log.details) : null,
        log.timestamp ? new Date(log.timestamp) : new Date()
      ]);
    } catch (err: any) {
      console.warn('[MySQL] saveLog error:', err.message);
    }
  }

  /**
   * Load rich logs from MySQL ocpp_logs table
   */
  public async loadLogs(limit = 100): Promise<LogItem[]> {
    if (!this.pool || !this.isConnected) return [];
    try {
      const [rows] = await this.pool.query<any[]>(
        'SELECT * FROM ocpp_logs ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        id: r.log_id || 'log-' + r.id,
        timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        type: r.type || 'OCPP',
        protocol: r.protocol || 'OCPP 1.6J',
        direction: r.direction,
        action: r.action,
        machineId: r.machine_id,
        connectorId: r.connector_id,
        transactionId: r.transaction_id,
        messageId: r.message_id,
        messageTypeId: r.message_type_id,
        status: r.status,
        durationMs: r.duration_ms,
        ip: r.ip,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
        rawMessage: r.raw_message,
        details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details
      }));
    } catch (err: any) {
      console.warn('[MySQL] loadLogs error:', err.message);
      return [];
    }
  }

  /**
   * Clear all logs from MySQL ocpp_logs table
   */
  public async clearLogs(): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      await this.pool.execute('TRUNCATE TABLE ocpp_logs');
    } catch (err: any) {
      console.warn('[MySQL] clearLogs error:', err.message);
    }
  }
}

export const mysqlClient = new MySqlClient();
