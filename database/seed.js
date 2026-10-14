// Resets the database and fills it with FAKE demo data.
// Usage: npm run db:reset   (WARNING: deletes all existing data)
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { STRICT_MODE } = require('../db');

// Returns a 'YYYY-MM-DD' date string, offset by a number of days from today
function dayFromToday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

async function main() {
  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) {
    console.error('SEED_PASSWORD is missing in .env. Add it and run again.');
    process.exit(1);
  }

  // multipleStatements is needed to run the whole schema file at once.
  // It is used ONLY here, on our own file - never in the app or with user input.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  try {
    await conn.query(`SET SESSION sql_mode = '${STRICT_MODE}'`);
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await conn.query(schema);
    console.log('Schema created.');

    // Every demo account gets the same password, hashed with bcrypt cost 12
    const hash = await bcrypt.hash(seedPassword, 12);

    // ---------- users ----------
    const users = [
      // student_no, first, last, email, role, requested_role, request_status
      ['2023-10001', 'Andrea', 'Villanueva', 'andrea.villanueva@my.cspc.edu.ph', 'president', null, 'none'],
      ['2023-10002', 'Marco', 'Dela Cruz', 'marco.delacruz@my.cspc.edu.ph', 'vp_internal', null, 'none'],
      ['2024-10003', 'Jasmine', 'Bautista', 'jasmine.bautista@my.cspc.edu.ph', 'pro', null, 'none'],
      ['2024-10004', 'Rafael', 'Mendoza', 'rafael.mendoza@my.cspc.edu.ph', 'treasurer', null, 'none'],
      ['2024-10005', 'Kristine', 'Santos', 'kristine.santos@my.cspc.edu.ph', 'secretary', null, 'none'],
      ['2025-10006', 'Paolo', 'Reyes', 'paolo.reyes@my.cspc.edu.ph', 'student', null, 'none'],
      ['2025-10007', 'Aisha', 'Mamalinta', 'aisha.mamalinta@my.cspc.edu.ph', 'student', null, 'none'],
      ['2025-10008', 'Liza', 'Ramos', 'liza.ramos@my.cspc.edu.ph', 'student', 'pro', 'pending'],
      ['2026-10009', 'Joshua', 'Tan', 'joshua.tan@my.cspc.edu.ph', 'student', null, 'none']
    ];
    const ids = {};
    for (const [studentNo, first, last, email, role, requestedRole, requestStatus] of users) {
      const [result] = await conn.query(
        `INSERT INTO users (student_no, first_name, last_name, email, password_hash, role,
           requested_role, officer_request_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [studentNo, first, last, email, hash, role, requestedRole, requestStatus]
      );
      ids[first.toLowerCase()] = result.insertId;
    }
    const { andrea, marco, jasmine, rafael, kristine, paolo, aisha, liza } = ids;

    // ---------- About SSC (the single row) ----------
    await conn.query(
      'INSERT INTO about_ssc (id, overview, mission, vision, updated_by) VALUES (1, ?, ?, ?, ?)',
      [
        'The Supreme Student Council (SSC) is the highest student governing body of Camarines Sur ' +
          'Polytechnic Colleges. It represents all students and works with the administration on ' +
          'student welfare, activities and services.',
        'To serve every student through transparent leadership, responsive services and meaningful activities.',
        'An empowered, united and inclusive student community.',
        andrea
      ]
    );

    // ---------- committees and officer directory ----------
    const committees = [
      ['Academic Affairs', 'Tutorials, academic concerns and student-faculty dialogue.'],
      ['Student Welfare', 'Wellness programs, student services and assistance.'],
      ['Finance', 'Budget planning and financial transparency.'],
      ['Public Information', 'Announcements, social media and campus news.'],
      ['Sports and Culture', 'Intramurals, arts and cultural events.']
    ];
    const committeeIds = [];
    for (const [name, description] of committees) {
      const [result] = await conn.query(
        'INSERT INTO committees (name, description) VALUES (?, ?)',
        [name, description]
      );
      committeeIds.push(result.insertId);
    }

    const term = '2026-2027';
    const officers = [
      ['Andrea Villanueva', 'President', null, 1],
      ['Marco Dela Cruz', 'Vice President for Internal Affairs', committeeIds[0], 2],
      ['Jasmine Bautista', 'Public Relations Officer', committeeIds[3], 3],
      ['Rafael Mendoza', 'Treasurer', committeeIds[2], 4],
      ['Kristine Santos', 'Secretary', null, 5],
      ['Noel Agbayani', 'Committee Head', committeeIds[1], 6],
      ['Bea Lacsamana', 'Committee Head', committeeIds[4], 7]
    ];
    for (const [fullName, position, committeeId, sortOrder] of officers) {
      await conn.query(
        `INSERT INTO officers (full_name, position, committee_id, term, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [fullName, position, committeeId, term, sortOrder]
      );
    }

    // ---------- announcements (one per status) ----------
    await conn.query(
      `INSERT INTO announcements (title, category, body, status, created_by, reviewed_by, published_at)
       VALUES (?, ?, ?, 'published', ?, ?, NOW())`,
      ['Enrollment advisory for the second semester', 'academic',
        'Enrollment for the second semester opens next month. Please settle your clearance early.',
        jasmine, marco]
    );
    await conn.query(
      `INSERT INTO announcements (title, category, body, status, created_by)
       VALUES (?, ?, ?, 'pending', ?)`,
      ['Call for student volunteers', 'opportunity',
        'The SSC is looking for volunteers for the upcoming foundation week.', jasmine]
    );
    await conn.query(
      `INSERT INTO announcements (title, category, body, status, created_by)
       VALUES (?, ?, ?, 'draft', ?)`,
      ['Library hours update', 'advisory', 'Draft: confirm the new library hours with the admin office.', jasmine]
    );

    // ---------- events ----------
    const [openEvent] = await conn.query(
      `INSERT INTO events (title, description, venue, event_date, start_time, end_time, capacity,
         status, created_by, reviewed_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, NOW())`,
      ['Leadership Training Seminar', 'A half-day seminar on student leadership and teamwork.',
        'CSPC Gymnasium', dayFromToday(14), '08:00', '12:00', 100, jasmine, marco]
    );
    await conn.query(
      `INSERT INTO events (title, description, venue, event_date, start_time, capacity, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ['Campus Clean-up Drive', 'Help keep our campus clean and green.',
        'Main Quadrangle', dayFromToday(21), '07:00', 50, jasmine]
    );
    await conn.query(
      `INSERT INTO events (title, description, venue, event_date, start_time, end_time, capacity,
         documentation, status, created_by, reviewed_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
      ['Freshmen Welcome Assembly', 'Orientation and welcome program for first-year students.',
        'CSPC Auditorium', dayFromToday(-30), '13:00', '17:00', 300,
        'About 250 first-year students attended. Officers introduced SSC services.',
        jasmine, marco, dayFromToday(-45)]
    );
    await conn.query(
      'INSERT INTO event_registrations (event_id, user_id) VALUES (?, ?)',
      [openEvent.insertId, paolo]
    );

    // ---------- concerns (one named, one anonymous) ----------
    const year = new Date().getFullYear();
    await conn.query(
      `INSERT INTO concerns (reference_no, user_id, category, subject, message, status)
       VALUES (?, ?, ?, ?, ?, 'submitted')`,
      [`C-${year}-0001`, paolo, 'facilities', 'Broken ceiling fan in Room 204',
        'The ceiling fan in Room 204 has not worked for two weeks.']
    );
    await conn.query(
      `INSERT INTO concerns (reference_no, user_id, category, subject, message, status,
         response, responded_by, responded_at)
       VALUES (?, NULL, ?, ?, ?, 'responded', ?, ?, NOW())`,
      [`C-${year}-0002`, 'student_services', 'Long queue at the registrar',
        'The registrar queue takes more than two hours during enrollment.',
        'We raised this with the registrar. An online queue will be tried next semester.', marco]
    );

    // ---------- items and transactions ----------
    const items = [
      ['Extension cord', '10-meter heavy-duty extension cord', 5],
      ['Projector', 'Portable LCD projector with HDMI cable', 2],
      ['Folding chair', 'Monobloc folding chair', 40],
      ['Sound system', 'Speaker with two wireless microphones', 1]
    ];
    const itemIds = [];
    for (const [name, description, quantity] of items) {
      const [result] = await conn.query(
        'INSERT INTO items (name, description, quantity) VALUES (?, ?, ?)',
        [name, description, quantity]
      );
      itemIds.push(result.insertId);
    }

    await conn.query(
      `INSERT INTO transactions (reference_no, user_id, type, purpose, preferred_date, preferred_time, status)
       VALUES (?, ?, 'clearance_appointment', ?, ?, ?, 'pending')`,
      [`T-${year}-0001`, aisha, 'Sign SSC clearance for the semester', dayFromToday(5), '10:00']
    );
    await conn.query(
      `INSERT INTO transactions (reference_no, user_id, type, purpose, preferred_date, item_id, quantity,
         return_date, status, remarks, reviewed_by)
       VALUES (?, ?, 'item_borrowing', ?, ?, ?, ?, ?, 'approved', ?, ?)`,
      [`T-${year}-0002`, paolo, 'Class presentation', dayFromToday(3), itemIds[1], 1,
        dayFromToday(4), 'Please pick up at the SSC office.', marco]
    );

    // ---------- financial report, resolution, document ----------
    await conn.query(
      `INSERT INTO financial_reports (title, period_start, period_end, budget, expenses, notes,
         status, created_by, reviewed_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, NOW())`,
      ['Freshmen Welcome Assembly expenses', dayFromToday(-60), dayFromToday(-30), 15000.00, 12350.50,
        'Sound system rental, snacks and printed programs.', rafael, andrea]
    );
    await conn.query(
      `INSERT INTO resolutions (resolution_no, title, body, date_adopted, status, created_by,
         reviewed_by, published_at)
       VALUES (?, ?, ?, ?, 'published', ?, ?, NOW())`,
      [`SSC-RES-${year}-001`, 'Adopting the SSC calendar of activities',
        'Resolved, that the SSC adopts the attached calendar of activities for the school year.',
        dayFromToday(-20), kristine, andrea]
    );
    await conn.query(
      `INSERT INTO documents (title, doc_type, body, status, created_by)
       VALUES (?, ?, ?, 'draft', ?)`,
      ['Minutes of the first general assembly', 'minutes',
        'Draft minutes: attendance, agenda items and decisions.', kristine]
    );

    console.log(`Seed complete: ${users.length} users. Pending officer request: Liza Ramos (id ${liza}).`);
    console.log('All demo accounts use the SEED_PASSWORD from .env.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
