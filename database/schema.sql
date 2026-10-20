-- SSC Student Organization Management System - database schema
-- Works on MySQL 8 and MariaDB 10.4+ (XAMPP).
-- WARNING: running this file DELETES all existing data in ssc_db.

CREATE DATABASE IF NOT EXISTS ssc_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ssc_db;

-- Drop children before parents so foreign keys do not block the drop
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS resolutions;
DROP TABLE IF EXISTS financial_reports;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS concerns;
DROP TABLE IF EXISTS event_photos;
DROP TABLE IF EXISTS event_registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS announcement_photos;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS officers;
DROP TABLE IF EXISTS committees;
DROP TABLE IF EXISTS about_ssc;
DROP TABLE IF EXISTS users;

-- ---------------------------------------------------------------
-- users: login accounts. Everyone starts as a student.
-- ---------------------------------------------------------------
CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_no VARCHAR(20) NOT NULL,
  first_name VARCHAR(60) NOT NULL,
  last_name VARCHAR(60) NOT NULL,
  email VARCHAR(120) NOT NULL,
  password_hash CHAR(60) NOT NULL,
  role ENUM('student', 'pro', 'vp_internal', 'treasurer', 'secretary', 'president')
    NOT NULL DEFAULT 'student',
  requested_role ENUM('pro', 'vp_internal', 'treasurer', 'secretary') NULL,
  officer_request_status ENUM('none', 'pending', 'rejected') NOT NULL DEFAULT 'none',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_student_no (student_no),
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_request (officer_request_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- about_ssc: the About SSC page text. Always exactly one row (id = 1),
-- edited by the President. (Team decision: added in M4.)
-- ---------------------------------------------------------------
CREATE TABLE about_ssc (
  id TINYINT UNSIGNED PRIMARY KEY,
  overview TEXT NOT NULL,
  mission TEXT NOT NULL,
  vision TEXT NOT NULL,
  goals TEXT NOT NULL,          -- one goal per line; the About page shows them as a list (a, b, c...)
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_about_single_row CHECK (id = 1),
  CONSTRAINT fk_about_editor FOREIGN KEY (updated_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- committees and officers: the public directory (separate from users)
-- ---------------------------------------------------------------
CREATE TABLE committees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_committees_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE officers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  position VARCHAR(100) NOT NULL,
  committee_id INT UNSIGNED NULL,
  term VARCHAR(20) NOT NULL,
  photo_path VARCHAR(255) NULL,   -- e.g. /img/officers/president.jpg (C16); NULL = show initials
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_officers_order (sort_order),
  CONSTRAINT fk_officers_committee FOREIGN KEY (committee_id)
    REFERENCES committees (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- announcements: draft -> pending -> published (pending -> draft + remarks)
-- ---------------------------------------------------------------
CREATE TABLE announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  category ENUM('general', 'academic', 'advisory', 'opportunity') NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  status ENUM('draft', 'pending', 'published') NOT NULL DEFAULT 'draft',
  review_remarks VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_announcements_status (status, published_at),
  CONSTRAINT fk_announcements_author FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_announcements_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Posters (pubmats) of an announcement; sort_order 1 is the cover. Several rows = a carousel.
-- Same idea as event_photos: the files are in public/newsimg/ (decision C2: no uploads).
CREATE TABLE announcement_photos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  announcement_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  caption VARCHAR(150) NULL,
  sort_order INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_announcement_photo_order (announcement_id, sort_order),
  CONSTRAINT fk_announcement_photos_announcement FOREIGN KEY (announcement_id)
    REFERENCES announcements (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- events: draft -> pending -> published -> completed / cancelled
-- ---------------------------------------------------------------
CREATE TABLE events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  venue VARCHAR(150) NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NULL,
  capacity INT UNSIGNED NOT NULL,
  documentation TEXT NULL,
  status ENUM('draft', 'pending', 'published', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  review_remarks VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_events_status_date (status, event_date),
  CONSTRAINT chk_events_capacity CHECK (capacity > 0),
  CONSTRAINT fk_events_author FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_events_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per student per event. UNIQUE blocks duplicate registration.
CREATE TABLE event_registrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_registration (event_id, user_id),
  INDEX idx_registrations_user (user_id),
  CONSTRAINT fk_registrations_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT fk_registrations_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Photos of a completed event, shown as a gallery on the public event page.
-- Round 1 has no uploads (decision C2): the team places the image files in public/img/
-- and this table stores only the path, the order and an optional caption.
CREATE TABLE event_photos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  caption VARCHAR(150) NULL,
  sort_order INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_event_photo_order (event_id, sort_order),
  CONSTRAINT fk_event_photos_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- concerns: submitted -> under_review -> responded -> resolved
-- user_id NULL = anonymous (tracked by reference number only)
-- ---------------------------------------------------------------
CREATE TABLE concerns (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_no VARCHAR(20) NULL,
  user_id INT UNSIGNED NULL,
  category ENUM('academic', 'facilities', 'student_services', 'other') NOT NULL,
  subject VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('submitted', 'under_review', 'responded', 'resolved') NOT NULL DEFAULT 'submitted',
  response TEXT NULL,
  responded_by INT UNSIGNED NULL,
  responded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_concerns_reference (reference_no),
  INDEX idx_concerns_user (user_id),
  INDEX idx_concerns_status (status),
  CONSTRAINT fk_concerns_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_concerns_responder FOREIGN KEY (responded_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- items: things students can borrow (managed by PRO / President)
-- ---------------------------------------------------------------
CREATE TABLE items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_items_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- transactions: one table for all three request types.
-- pending -> under_review -> approved / rejected -> completed; pending -> cancelled
-- Type-specific columns are NULL when they do not apply.
-- ---------------------------------------------------------------
CREATE TABLE transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_no VARCHAR(20) NULL,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('clearance_appointment', 'item_borrowing', 'ssc_appointment') NOT NULL,
  purpose VARCHAR(500) NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time TIME NULL,
  item_id INT UNSIGNED NULL,
  quantity INT UNSIGNED NULL,
  return_date DATE NULL,
  status ENUM('pending', 'under_review', 'approved', 'rejected', 'completed', 'cancelled')
    NOT NULL DEFAULT 'pending',
  remarks VARCHAR(500) NULL,
  reviewed_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transactions_reference (reference_no),
  INDEX idx_transactions_user (user_id),
  INDEX idx_transactions_status (status),
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_item FOREIGN KEY (item_id)
    REFERENCES items (id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- financial_reports: Treasurer submits, President publishes.
-- Remaining balance is computed in SELECT (budget - expenses), never stored.
-- ---------------------------------------------------------------
CREATE TABLE financial_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  budget DECIMAL(12, 2) NOT NULL,
  expenses DECIMAL(12, 2) NOT NULL,
  notes TEXT NULL,
  status ENUM('draft', 'pending', 'published') NOT NULL DEFAULT 'draft',
  review_remarks VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_financial_status (status, published_at),
  CONSTRAINT chk_financial_amounts CHECK (budget >= 0 AND expenses >= 0),
  CONSTRAINT chk_financial_period CHECK (period_end >= period_start),
  CONSTRAINT fk_financial_author FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_financial_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- resolutions: Secretary submits, President publishes.
-- ---------------------------------------------------------------
CREATE TABLE resolutions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resolution_no VARCHAR(30) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  date_adopted DATE NOT NULL,
  status ENUM('draft', 'pending', 'published') NOT NULL DEFAULT 'draft',
  review_remarks VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_resolutions_no (resolution_no),
  INDEX idx_resolutions_status (status, published_at),
  CONSTRAINT fk_resolutions_author FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_resolutions_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- documents: other SSC documents. Secretary submits, President publishes.
-- ---------------------------------------------------------------
CREATE TABLE documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  doc_type ENUM('minutes', 'memorandum', 'letter', 'other') NOT NULL,
  body TEXT NOT NULL,
  status ENUM('draft', 'pending', 'published') NOT NULL DEFAULT 'draft',
  review_remarks VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_documents_status (status, published_at),
  CONSTRAINT fk_documents_author FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_documents_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
