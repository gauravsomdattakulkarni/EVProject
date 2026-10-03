-- SATMAT EV Charging Station Management System
-- Database Schema for MySQL 8.0 / Laravel 11
-- Database: evchargersatmatg_ev

CREATE DATABASE IF NOT EXISTS `evchargersatmatg_ev` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `evchargersatmatg_ev`;

-- 1. Users / Admins Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `email_verified_at` TIMESTAMP NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'SUPER_ADMIN',
  `remember_token` VARCHAR(100) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Admin Credentials Insert (Requirement: while php artisan migrate add default admin cred)
-- Default Password: admin123
INSERT INTO `users` (`name`, `email`, `password`, `role`)
VALUES ('SATMAT Admin', 'admin@satmatgroup.com', '$2y$12$e6/1j5v4iYyv11V0xZ0rG.tQdZkRj5P7Kq4w0bEwPzXl6sF.g1QyO', 'SUPER_ADMIN')
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

-- 2. Chargers (Charging Stations / EVSE Host)
CREATE TABLE IF NOT EXISTS `chargers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY, -- Machine ID (e.g. SATMAT-EV-001)
  `name` VARCHAR(191) NOT NULL,
  `ws_url` VARCHAR(255) NOT NULL,
  `local_ws_url` VARCHAR(255) NULL,
  `address` VARCHAR(255) NOT NULL DEFAULT '',
  `city` VARCHAR(100) NOT NULL DEFAULT 'Pune',
  `postal_code` VARCHAR(20) NOT NULL DEFAULT '411001',
  `country` VARCHAR(10) NOT NULL DEFAULT 'IND',
  `latitude` DECIMAL(10, 7) NOT NULL DEFAULT 18.5204,
  `longitude` DECIMAL(10, 7) NOT NULL DEFAULT 73.8567,
  `status` ENUM('Available', 'Occupied', 'Charging', 'Offline', 'Faulted') NOT NULL DEFAULT 'Offline',
  `is_connected` TINYINT(1) NOT NULL DEFAULT 0,
  `last_heartbeat` DATETIME NULL,
  `ocpp_version` VARCHAR(20) NOT NULL DEFAULT '1.6J',
  `base_cost_per_kwh` DECIMAL(8, 2) NOT NULL DEFAULT 16.00,
  `idle_fee_per_minute` DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
  `session_base_fee` DECIMAL(8, 2) NOT NULL DEFAULT 10.00,
  `max_power_kw` DECIMAL(8, 2) NOT NULL DEFAULT 60.00,
  `charge_point_vendor` VARCHAR(100) DEFAULT 'SATMAT',
  `charge_point_model` VARCHAR(100) DEFAULT 'SM-01',
  `firmware_version` VARCHAR(50) DEFAULT 'v1.0.0',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Connectors
CREATE TABLE IF NOT EXISTS `connectors` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `charger_id` VARCHAR(64) NOT NULL,
  `connector_number` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` ENUM('CCS2', 'Type2', 'CHAdeMO', 'GB_T', 'Bharat_DC001', 'Bharat_AC001') NOT NULL DEFAULT 'CCS2',
  `power_type` ENUM('DC', 'AC_3_PHASE', 'AC_1_PHASE') NOT NULL DEFAULT 'DC',
  `max_kw` DECIMAL(8, 2) NOT NULL DEFAULT 60.00,
  `voltage` INT NOT NULL DEFAULT 400,
  `amperage` INT NOT NULL DEFAULT 150,
  `status` ENUM('Available', 'Occupied', 'Charging', 'Faulted', 'Unavailable', 'Reserved') NOT NULL DEFAULT 'Available',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`charger_id`) REFERENCES `chargers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. OCPI Roaming Partners
CREATE TABLE IF NOT EXISTS `ocpi_partners` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `party_id` VARCHAR(10) NOT NULL,
  `country_code` VARCHAR(5) NOT NULL DEFAULT 'IN',
  `role` ENUM('CPO', 'eMSP', 'HUB') NOT NULL DEFAULT 'eMSP',
  `token_a` VARCHAR(128) NOT NULL,
  `token_b` VARCHAR(128) NOT NULL,
  `partner_token` VARCHAR(128) NULL,
  `url` VARCHAR(255) NOT NULL DEFAULT '',
  `ocpi_version` VARCHAR(10) NOT NULL DEFAULT '2.0',
  `status` ENUM('ACTIVE', 'PENDING', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `pricing_type` ENUM('DEFAULT', 'CUSTOM_RATE', 'PERCENTAGE_DISCOUNT', 'PERCENTAGE_MARKUP') NOT NULL DEFAULT 'DEFAULT',
  `custom_cost_per_kwh` DECIMAL(8, 2) NULL,
  `price_adjustment_percent` DECIMAL(5, 2) DEFAULT 0.00,
  `notes` TEXT NULL,
  `last_access_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tariffs (Dynamic Pricing)
CREATE TABLE IF NOT EXISTS `tariffs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `price_per_kwh` DECIMAL(8, 2) NOT NULL DEFAULT 16.00,
  `price_per_minute` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `idle_fee_per_minute` DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
  `session_fee` DECIMAL(8, 2) NOT NULL DEFAULT 10.00,
  `tax_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 18.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Charging Sessions & Transactions
CREATE TABLE IF NOT EXISTS `charging_sessions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `transaction_id` INT NOT NULL,
  `machine_id` VARCHAR(64) NOT NULL,
  `connector_id` INT NOT NULL,
  `id_tag` VARCHAR(100) NOT NULL,
  `start_time` DATETIME NOT NULL,
  `end_time` DATETIME NULL,
  `energy_kwh` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `cost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('Active', 'Completed', 'Stopped') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`machine_id`) REFERENCES `chargers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. OCPP Request & Response Detailed Logs
CREATE TABLE IF NOT EXISTS `ocpp_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `log_id` VARCHAR(128) NULL,
  `type` VARCHAR(20) NOT NULL DEFAULT 'OCPP',
  `protocol` VARCHAR(50) NOT NULL DEFAULT 'OCPP 1.6J',
  `direction` ENUM('IN', 'OUT') NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `machine_id` VARCHAR(64) NULL,
  `connector_id` INT NULL,
  `transaction_id` VARCHAR(64) NULL,
  `message_id` VARCHAR(128) NULL,
  `message_type_id` INT NULL,
  `status` VARCHAR(64) NULL,
  `duration_ms` INT NULL,
  `ip` VARCHAR(45) NULL,
  `payload` JSON NULL,
  `raw_message` LONGTEXT NULL,
  `details` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_logs_machine` (`machine_id`),
  INDEX `idx_logs_action` (`action`),
  INDEX `idx_logs_direction` (`direction`),
  INDEX `idx_logs_tx` (`transaction_id`),
  INDEX `idx_logs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
