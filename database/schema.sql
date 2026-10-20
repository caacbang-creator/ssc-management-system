-- SSC Student Organization Management System - database schema
-- Works on MySQL 8 and MariaDB 10.4+ (XAMPP).
-- WARNING: running this file DELETES all existing data in ssc_db.

CREATE DATABASE IF NOT EXISTS ssc_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ssc_db;

-- Drop children before parents so foreign keys do not block the drop
DROP TABLE IF EXISTS office_logs;
DROP TABLE IF EXISTS duty_schedule;
DROP TABLE IF EXISTS office_code;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS resolutions;
DROP TABLE IF EXISTS financial_report_sales;
DROP TABLE IF EXISTS financial_report_expenses;
DROP TABLE IF EXISTS financial_reports;
DROP TABLE IF EXISTS annual_budgets;
DROP TABLE IF EXISTS item_loans;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS concerns;
DROP TABLE IF EXISTS event_videos;
DROP TABLE IF EXISTS event_photos;
DROP TABLE IF EXISTS event_registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS announcement_videos;
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
  role ENUM('student', 'pro', 'vp_internal', 'treasurer', 'secretary', 'property_custodian', 'president')
    NOT NULL DEFAULT 'student',
  requested_role ENUM('pro', 'vp_internal', 'treasurer', 'secretary', 'property_custodian') NULL,
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
  -- Optional link to the officer's login (C25), so office pages can show the directory photo.
  -- Directory entries stay separate from logins; NULL = not linked (initials are shown).
  user_id INT UNSIGNED NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_officers_user (user_id),        -- one directory entry per login (NULLs allowed)
  INDEX idx_officers_order (sort_order),
  CONSTRAINT fk_officers_committee FOREIGN KEY (committee_id)
    REFERENCES committees (id) ON DELETE SET NULL,
  CONSTRAINT fk_officers_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- announcements: draft -> pending -> published (pending -> draft + remarks)
-- ---------------------------------------------------------------
CREATE TABLE announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  category ENUM('general', 'academic', 'advisory', 'opportunity') NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  news_date DATE NOT NULL,                -- the date shown on the post, set by the PRO (C24)
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

-- Videos the PRO uploads to an announcement (C21). The title is required: it names the
-- video for screen readers and is shown under the player.
CREATE TABLE announcement_videos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  announcement_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  title VARCHAR(150) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_announcement_videos (announcement_id),
  CONSTRAINT fk_announcement_videos_announcement FOREIGN KEY (announcement_id)
    REFERENCES announcements (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- events: draft -> pending -> published -> completed / cancelled
-- ---------------------------------------------------------------
CREATE TABLE events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  venue VARCHAR(150) NULL,               -- optional; NULL = "to be announced" (C22)
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NULL,
  capacity INT UNSIGNED NULL,            -- optional; NULL = no limit on registrations (C22)
  documentation TEXT NULL,
  status ENUM('draft', 'pending', 'published', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  review_remarks VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_events_status_date (status, event_date),
  CONSTRAINT chk_events_capacity CHECK (capacity IS NULL OR capacity > 0),
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

-- Videos of a completed event (C21), uploaded by the PRO. Title required (see announcement_videos).
CREATE TABLE event_videos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  title VARCHAR(150) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_videos (event_id),
  CONSTRAINT fk_event_videos_event FOREIGN KEY (event_id)
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
  -- Set by the Property Custodian (C19). "Units out" is computed from item_loans, never stored.
  status ENUM('available', 'unavailable') NOT NULL DEFAULT 'available',
  status_note VARCHAR(150) NULL,            -- why it is not available, e.g. "Under repair"
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
-- ---------------------------------------------------------------
-- item_loans: the borrowing log kept by the Property Custodian (C19).
-- One row per handover. Out = returned_at IS NULL. The last borrower of an item is
-- simply its newest row. transaction_id links to the approved online request;
-- NULL means a walk-in loan recorded at the office.
-- ---------------------------------------------------------------
CREATE TABLE item_loans (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  borrower_id INT UNSIGNED NOT NULL,
  transaction_id INT UNSIGNED NULL,
  quantity INT UNSIGNED NOT NULL,
  released_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_by INT UNSIGNED NULL,
  due_date DATE NOT NULL,
  returned_at DATETIME NULL,
  returned_by INT UNSIGNED NULL,
  return_condition ENUM('good', 'damaged', 'lost') NULL,
  notes VARCHAR(255) NULL,
  UNIQUE KEY uq_loans_transaction (transaction_id),   -- one handover per request (NULLs allowed)
  INDEX idx_loans_item (item_id, released_at),
  INDEX idx_loans_open (returned_at),
  CONSTRAINT chk_loan_quantity CHECK (quantity > 0),
  -- History is kept: an item or borrower with loans cannot be deleted (mark the item unavailable instead)
  CONSTRAINT fk_loans_item FOREIGN KEY (item_id)
    REFERENCES items (id) ON DELETE RESTRICT,
  CONSTRAINT fk_loans_borrower FOREIGN KEY (borrower_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_loans_transaction FOREIGN KEY (transaction_id)
    REFERENCES transactions (id) ON DELETE SET NULL,
  CONSTRAINT fk_loans_released_by FOREIGN KEY (released_by)
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_loans_returned_by FOREIGN KEY (returned_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One budget for the whole school year (C18). Spent and remaining are COMPUTED from the
-- published reports of that year, never stored.
CREATE TABLE annual_budgets (
  school_year CHAR(9) PRIMARY KEY,          -- e.g. '2026-2027'
  amount DECIMAL(12, 2) NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_annual_budget_amount CHECK (amount >= 0),
  CONSTRAINT fk_annual_budget_editor FOREIGN KEY (updated_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A liquidation report. Its totals come from its expense and sales lines (computed in the SELECT).
CREATE TABLE financial_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  school_year CHAR(9) NOT NULL,             -- counts toward this year's annual budget
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  notes TEXT NULL,
  status ENUM('draft', 'pending', 'published') NOT NULL DEFAULT 'draft',
  review_remarks VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_financial_status (status, published_at),
  INDEX idx_financial_year (school_year, status),
  CONSTRAINT chk_financial_period CHECK (period_end >= period_start),
  CONSTRAINT fk_financial_author FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_financial_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One receipt on a liquidation report (e.g. "Tissues, 0001283, 2026-08-04, LCC Supermarket, 58.00").
-- receipt_no is NULL for acknowledgement receipts, which have no number.
CREATE TABLE financial_report_expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  item VARCHAR(60) NOT NULL,
  receipt_no VARCHAR(30) NULL,
  receipt_date DATE NOT NULL,
  particulars VARCHAR(150) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  INDEX idx_expenses_report (report_id, receipt_date),
  CONSTRAINT chk_expense_amount CHECK (amount > 0),
  CONSTRAINT fk_expenses_report FOREIGN KEY (report_id)
    REFERENCES financial_reports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One product sold during the activity. Its total (quantity x unit price) is computed, not stored.
CREATE TABLE financial_report_sales (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  product VARCHAR(100) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  INDEX idx_sales_report (report_id),
  CONSTRAINT chk_sale_numbers CHECK (quantity > 0 AND unit_price >= 0),
  CONSTRAINT fk_sales_report FOREIGN KEY (report_id)
    REFERENCES financial_reports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- resolutions: Secretary submits, President publishes.
-- ---------------------------------------------------------------
CREATE TABLE resolutions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resolution_no VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,      -- official titles are long (up to about 220 characters)
  body TEXT NOT NULL,
  date_adopted DATE NOT NULL,
  photo_path VARCHAR(255) NULL,   -- pubmat shown on the Documents page (C17)
  pdf_path VARCHAR(255) NULL,     -- signed copy to preview or download (C17)
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

-- ---------------------------------------------------------------
-- Office duty (C25): the weekly Officer of the Day (OOTD) schedule, the office code
-- and the office check-in log. Replaces biometrics / QR scanning (outside Weeks 2-9).
-- ---------------------------------------------------------------

-- Who is on duty on which weekday. day_of_week uses MySQL's DAYOFWEEK() numbering:
-- 1 = Sunday, 2 = Monday ... 7 = Saturday. A day may have more than one officer.
CREATE TABLE duty_schedule (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,                  -- Time In more than 15 minutes after this is late
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_duty_user_day (user_id, day_of_week),   -- an officer is on a weekday at most once
  INDEX idx_duty_day (day_of_week),
  CONSTRAINT chk_duty_day CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT fk_duty_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The one current office code (always one row, id = 1, like about_ssc). Only visible at the
-- SSC office (printed, or inside a QR code). Regenerating it makes the old code stop working.
CREATE TABLE office_code (
  id TINYINT UNSIGNED PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_office_code_single_row CHECK (id = 1),
  CONSTRAINT fk_office_code_editor FOREIGN KEY (updated_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per Time In. time_out NULL = still in the office (today) or a missing time-out
-- (past date). Times are always set by the database clock (NOW(), CURDATE()), never by the form.
-- No UNIQUE on the date: an officer may visit more than once a day; the route checks for an
-- open log and for an existing duty log today instead.
CREATE TABLE office_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  log_type ENUM('duty', 'visit') NOT NULL,
  log_date DATE NOT NULL,
  time_in DATETIME NOT NULL,
  time_out DATETIME NULL,
  is_late TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_office_logs_user_date (user_id, log_date),
  INDEX idx_office_logs_date (log_date),
  -- Attendance history is kept: a user with office logs cannot be deleted
  CONSTRAINT fk_office_logs_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
