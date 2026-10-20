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
    // Officers: the real SY 2026-2027 SSC officers with their school e-mails (decision C15).
    // Their student numbers are placeholders. VP External and Auditor have no officer role in
    // the system, so they log in as students. The Property Custodian manages items (C19).
    // Students: fake demo accounts.
    const users = [
      // key, student_no, first, last, email, role, requested_role, request_status
      ['president', '2023-10001', 'Jester Carl SJ.', 'Sumpay', 'jesumpay@my.cspc.edu.ph', 'president', null, 'none'],
      ['vpInternal', '2023-10002', 'Ralph Joe Francis', 'Abonal', 'raabonal@my.cspc.edu.ph', 'vp_internal', null, 'none'],
      ['vpExternal', '2023-10003', 'Jessil', 'Martinez', 'jemartinez@my.cspc.edu.ph', 'student', null, 'none'],
      ['secretary', '2024-10004', 'Ma. Lourdes', 'Tulabot', 'matulabot@my.cspc.edu.ph', 'secretary', null, 'none'],
      ['treasurer', '2024-10005', 'Rj Patrick', 'Sernal', 'rjsernal@my.cspc.edu.ph', 'treasurer', null, 'none'],
      ['auditor', '2024-10006', 'Krystine', 'Gospe', 'krgospe@my.cspc.edu.ph', 'student', null, 'none'],
      // The PIO holds the pro role (announcements and events)
      ['pro', '2024-10007', 'Camille', 'Salvadora', 'casalvadora@my.cspc.edu.ph', 'pro', null, 'none'],
      ['custodian', '2024-10008', 'Luke', 'Ronquillo', 'luronquillo@my.cspc.edu.ph', 'property_custodian', null, 'none'],
      ['paolo', '2025-10009', 'Paolo', 'Reyes', 'paolo.reyes@my.cspc.edu.ph', 'student', null, 'none'],
      ['aisha', '2025-10010', 'Aisha', 'Mamalinta', 'aisha.mamalinta@my.cspc.edu.ph', 'student', null, 'none'],
      ['liza', '2025-10011', 'Liza', 'Ramos', 'liza.ramos@my.cspc.edu.ph', 'student', 'pro', 'pending'],
      ['joshua', '2026-10012', 'Joshua', 'Tan', 'joshua.tan@my.cspc.edu.ph', 'student', null, 'none']
    ];
    const ids = {};
    for (const [key, studentNo, first, last, email, role, requestedRole, requestStatus] of users) {
      const [result] = await conn.query(
        `INSERT INTO users (student_no, first_name, last_name, email, password_hash, role,
           requested_role, officer_request_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [studentNo, first, last, email, hash, role, requestedRole, requestStatus]
      );
      ids[key] = result.insertId;
    }
    const { president, vpInternal, pro, treasurer, secretary, custodian, paolo, aisha, liza } = ids;

    // ---------- About SSC (the single row) ----------
    await conn.query(
      'INSERT INTO about_ssc (id, overview, mission, vision, goals, updated_by) VALUES (1, ?, ?, ?, ?, ?)',
      [
        'The Supreme Student Council (SSC) is the highest student governing body of Camarines Sur ' +
          'Polytechnic Colleges. It represents all students and works with the administration on ' +
          'student welfare, activities and services.',
        // Mission, vision and goals: the SSC's official text
        'To establish a student-led organization that actively engage, supports, and advocates for ' +
          'student voices while promoting a sense of community, leadership, and personal development ' +
          'among students.',
        'To empower, represent, and advocate for the rights and interests of the student body, ' +
          'thereby fostering a positive and inclusive school environment.',
        [
          'Support Institutionally Recognized and Accredited Student Organizations whose goals do not ' +
            'violate the law, public order, or educational Institutional policy and foster student ' +
            'leadership and sense of responsibility among student leaders;',
          'Develop moral character and personal discipline among the students for the welfare of this ' +
            'educational Institution;',
          'Establish and sustain avenues for students to express feedback on school policy, events, and ' +
            'issues; and',
          'Organize inclusive events and activities that reflect the student body’s different interests ' +
            'and backgrounds.'
        ].join('\n'),
        president
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
    // Official SSC portraits, resized for the web, in public/img/officers/ (decision C16)
    const officers = [
      ['Jester Carl SJ. Sumpay', 'President', null, 'president.jpg', 1],
      ['Ralph Joe Francis Abonal', 'Vice President for Internal Affairs', committeeIds[0], 'vp-internal.jpg', 2],
      ['Jessil Martinez', 'Vice President for External Affairs', null, 'vp-external.jpg', 3],
      ['Ma. Lourdes Tulabot', 'Secretary', null, 'secretary.jpg', 4],
      ['Rj Patrick Sernal', 'Treasurer', committeeIds[2], 'treasurer.jpg', 5],
      ['Krystine Gospe', 'Auditor', null, 'auditor.jpg', 6],
      ['Camille Salvadora', 'Public Information Officer', committeeIds[3], 'pio.jpg', 7],
      ['Luke Ronquillo', 'Property Custodian', null, 'property-custodian.jpg', 8]
    ];
    for (const [fullName, position, committeeId, photo, sortOrder] of officers) {
      await conn.query(
        `INSERT INTO officers (full_name, position, committee_id, term, photo_path, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fullName, position, committeeId, term, `/img/officers/${photo}`, sortOrder]
      );
    }

    // ---------- announcements (one per status) ----------
    await conn.query(
      `INSERT INTO announcements (title, category, body, news_date, status, created_by, reviewed_by, published_at)
       VALUES (?, ?, ?, ?, 'published', ?, ?, ?)`,
      ['Enrollment advisory for the second semester', 'academic',
        'Enrollment for the second semester opens next month. Please settle your clearance early.',
        dayFromToday(-100), pro, vpInternal, dayFromToday(-100)]
    );

    // ---------- published news with posters ----------
    // The posters are in public/newsimg/<folder>/ (official SSC pubmats, see docs/decisions.md).
    // Listed oldest first; the newest one becomes the featured post on the News page.
    // Bodies are placeholders for the team to fill in.
    const newsPosts = [
      ['Call for SSC Assistants and Committee Directors', 'opportunity', dayFromToday(-95), '/newsimg/search',
        ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eigth', 'nineth']
          .map((name) => `${name}.jpg`)],
      ['Orientation Seminar', 'general', dayFromToday(-80), '/newsimg/2Orsem',
        ['757523965_1027779183439318_1344236409131355570_n.jpg']],
      ['Happy birthday, Gab!', 'general', dayFromToday(-75), '/newsimg/3Gabbday', ['1.jpg']],
      ['Orgbit 2026: The CSPC Organizational Fair', 'general', dayFromToday(-70), '/newsimg/4Orgbit', ['1.jpg']],
      ['Saurbetes', 'general', dayFromToday(-50), '/newsimg/5Saurbetes', ['1.jpg']],
      ['Meet your host', 'general', dayFromToday(-40), '/newsimg/6Meetyourhost', ['1.jpg']],
      ['Happy birthday, Earl!', 'general', dayFromToday(-20), '/newsimg/7EarlBday', ['1.jpg']]
    ];
    for (const [title, category, date, folder, files] of newsPosts) {
      const [post] = await conn.query(
        `INSERT INTO announcements (title, category, body, news_date, status, created_by, reviewed_by, published_at)
         VALUES (?, ?, ?, ?, 'published', ?, ?, ?)`,
        [title, category, 'Details to follow.', date, pro, vpInternal, date]
      );
      for (let i = 0; i < files.length; i++) {
        await conn.query(
          'INSERT INTO announcement_photos (announcement_id, file_path, sort_order) VALUES (?, ?, ?)',
          [post.insertId, `${folder}/${files[i]}`, i + 1]
        );
      }
    }
    await conn.query(
      `INSERT INTO announcements (title, category, body, news_date, status, created_by)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      ['Call for student volunteers', 'opportunity',
        'The SSC is looking for volunteers for the upcoming foundation week.', dayFromToday(-2), pro]
    );
    await conn.query(
      `INSERT INTO announcements (title, category, body, news_date, status, created_by)
       VALUES (?, ?, ?, ?, 'draft', ?)`,
      ['Library hours update', 'advisory', 'Draft: confirm the new library hours with the admin office.',
        dayFromToday(0), pro]
    );

    // ---------- events ----------
    const [openEvent] = await conn.query(
      `INSERT INTO events (title, description, venue, event_date, start_time, end_time, capacity,
         status, created_by, reviewed_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, NOW())`,
      ['Leadership Training Seminar', 'A half-day seminar on student leadership and teamwork.',
        'CSPC Gymnasium', dayFromToday(14), '08:00', '12:00', 100, pro, vpInternal]
    );
    await conn.query(
      `INSERT INTO events (title, description, venue, event_date, start_time, capacity, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ['Campus Clean-up Drive', 'Help keep our campus clean and green.',
        'Main Quadrangle', dayFromToday(21), '07:00', 50, pro]
    );
    await conn.query(
      `INSERT INTO events (title, description, venue, event_date, start_time, end_time, capacity,
         documentation, status, created_by, reviewed_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
      ['Freshmen Welcome Assembly', 'Orientation and welcome program for first-year students.',
        'CSPC Auditorium', dayFromToday(-30), '13:00', '17:00', 300,
        'About 250 first-year students attended. Officers introduced SSC services.',
        pro, vpInternal, dayFromToday(-45)]
    );

    // ---------- completed events with photos ----------
    // The image files are in public/img/<folder>/ (official SSC photos, see docs/decisions.md).
    // Each file list is in chronological order; its position becomes sort_order.
    // Descriptions, venues and times are placeholders for the team to fill in.
    const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];
    const photoEvents = [
      ['Oath of Office', dayFromToday(-120), '/img/1Oathofoffice',
        ORDINALS.slice(0, 6).map((name) => `${name}.jpg`)],
      ['Search for SSC Assistants and Committee Directors', dayFromToday(-88), '/img/2SearchforAssandCom',
        ORDINALS.slice(0, 7).map((name) => `${name}.jpg`)],
      ['1st General Meeting', dayFromToday(-60), '/img/31stGeneralMeeting',
        Array.from({ length: 10 }, (_, i) => `${i + 1}.jpg`)]
    ];
    for (const [title, date, folder, files] of photoEvents) {
      const [photoEvent] = await conn.query(
        `INSERT INTO events (title, description, venue, event_date, start_time, capacity,
           documentation, status, created_by, reviewed_by, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
        [title, 'Details to follow.', 'CSPC Campus', date, '08:00', 100,
          'Details to follow.', pro, vpInternal, date]
      );
      for (let i = 0; i < files.length; i++) {
        await conn.query(
          'INSERT INTO event_photos (event_id, file_path, sort_order) VALUES (?, ?, ?)',
          [photoEvent.insertId, `${folder}/${files[i]}`, i + 1]
        );
      }
    }

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
        'We raised this with the registrar. An online queue will be tried next semester.', vpInternal]
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
        dayFromToday(4), 'Please pick up at the SSC office.', vpInternal]
    );

    // ---------- borrowing log (C19): one returned loan and one walk-in that is overdue ----------
    // T-0002 above is approved but not handed over yet, so it waits on the custodian's desk.
    await conn.query(
      `INSERT INTO item_loans (item_id, borrower_id, quantity, released_at, released_by, due_date,
         returned_at, returned_by, return_condition, notes)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'good', ?)`,
      [itemIds[1], aisha, `${dayFromToday(-12)} 09:00:00`, custodian, dayFromToday(-10),
        `${dayFromToday(-10)} 16:30:00`, custodian, 'Walk-in for a CCS seminar']
    );
    await conn.query(
      `INSERT INTO item_loans (item_id, borrower_id, quantity, released_at, released_by, due_date, notes)
       VALUES (?, ?, 2, ?, ?, ?, ?)`,
      [itemIds[0], liza, `${dayFromToday(-4)} 13:00:00`, custodian, dayFromToday(-1), 'Walk-in for a booth']
    );

    // ---------- annual budget and liquidation reports (decision C18) ----------
    await conn.query(
      'INSERT INTO annual_budgets (school_year, amount, updated_by) VALUES (?, ?, ?)',
      ['2026-2027', 1000000.00, treasurer]
    );

    // The SSC's liquidation reports, line by line. Totals are NOT stored: the app adds them up
    // (SaurBETes: expenses 6,446.00, sales 6,930.00, net income 484.00; ORSEM 2026: expenses 5,731.00).
    const liquidations = [
      {
        title: 'Liquidation Report: SSC SaurBETes',
        start: '2026-08-04', end: '2026-08-05',
        notes: 'Held on August 4 and 5, 2026.',
        // item, receipt no. (null = acknowledgement receipt), date, particulars, amount
        expenses: [
          ['Ice Cream', null, '2026-08-04', 'Acknowledgement Receipt', 3100.00],
          ['Ice Cream', null, '2026-08-05', 'Acknowledgement Receipt', 3100.00],
          ['Tissues', '0001283', '2026-08-04', 'C.G Baking\'s and Milktea Supplies Trading', 65.00],
          ['Tissues', '018105', '2026-08-05', 'LCC Supermarket', 58.00],
          ['Utensils', '0001286', '2026-08-04', 'C.G Baking\'s and Milktea Supplies Trading', 48.00],
          ['Utensils', '0001288', '2026-08-04', 'C.G Baking\'s and Milktea Supplies Trading', 75.00]
        ],
        // product, quantity sold, unit price
        sales: [
          ['Ice Cream (Cone)', 206, 15.00],
          ['Ice Cream (Cup)', 192, 20.00]
        ]
      },
      {
        title: 'Liquidation Report: ORSEM 2026',
        start: '2026-08-04', end: '2026-08-05',
        notes: 'Held on August 4 and 5, 2026. Receipts are dated from July 15 to August 5, 2026.',
        expenses: [
          ['Meals', '1168', '2026-07-15', 'Jollibee Nabua', 400.00],
          ['Meals', '001165', '2026-07-20', 'Drewvalle Frukt Skaka Fruit Shake', 80.00],
          ['Meals', '1179', '2026-07-20', 'Jollibee Nabua', 320.00],
          ['Meals', '1181', '2026-07-20', 'Jollibee Nabua', 320.00],
          ['Meals', '1197', '2026-07-24', 'Jollibee Nabua', 594.00],
          ['Meals', '018058', '2026-07-24', 'LCC Supermarket', 67.00],
          ['Meals', '0172', '2026-08-04', 'DMR Wet and Dry Goods Store', 72.00],
          ['Meals', '018085', '2026-08-04', 'LCC Supermarket', 671.00],
          ['Meals', '018086', '2026-08-04', 'LCC Supermarket', 378.00],
          ['Meals', '000488', '2026-08-04', 'Derecho Meat Stand', 600.00],
          ['Meals', '10313', '2026-08-04', 'Baino-Bergantin Sari-Sari Store', 321.00],
          ['Meals', '0438', '2026-08-04', 'A&J Water Refilling Station', 140.00],
          ['Meals', '0001284', '2026-08-04', 'C.G Baking\'s and Milktea Supplies Trading', 262.00],
          ['Meals', '000061', '2026-08-05', 'Dok-Tonton Grocery Products Trading', 60.00],
          ['Meals', '000486', '2026-08-05', 'Derecho Meat Stand', 600.00],
          ['Meals', '018103', '2026-08-05', 'LCC Supermarket', 461.75],
          ['Meals', '018104', '2026-08-05', 'LCC Supermarket', 189.00],
          ['Meals', '018106', '2026-08-05', 'LCC Supermarket', 19.25],
          ['Meals', '0174', '2026-08-05', 'DMR Wet and Dry Goods Store', 176.00]
        ],
        sales: []
      }
    ];
    for (const report of liquidations) {
      const [result] = await conn.query(
        `INSERT INTO financial_reports (title, school_year, period_start, period_end, notes,
           status, created_by, reviewed_by, published_at)
         VALUES (?, '2026-2027', ?, ?, ?, 'published', ?, ?, '2026-08-12 10:00:00')`,
        [report.title, report.start, report.end, report.notes, treasurer, president]
      );
      for (const [item, receiptNo, date, particulars, amount] of report.expenses) {
        await conn.query(
          `INSERT INTO financial_report_expenses (report_id, item, receipt_no, receipt_date, particulars, amount)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [result.insertId, item, receiptNo, date, particulars, amount]
        );
      }
      for (const [product, quantity, unitPrice] of report.sales) {
        await conn.query(
          'INSERT INTO financial_report_sales (report_id, product, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [result.insertId, product, quantity, unitPrice]
        );
      }
    }

    // ---------- resolutions: the SSC's official resolutions, s. 2025-2026 (decision C17) ----------
    // Pubmats in public/img/resolutions/, signed copies in public/files/resolutions/.
    // The text is the "RESOLVED" clause of each PDF, word for word (typos included, to match the signed copy).
    const resolutions = [
      ['001', '2025-07-02',
        'Resolution Approving the Conduct of Aqua-Ask InfoDesk: The 40th Commencement Exercises Facilitation ' +
          'and Disbursement of Fund Amounting to Nineteen Thousand Eight Hundred Sixty-Six Pesos (P19,866.00)',
        'RESOLVED, AS IT IS HEREBY RESOLVED, that the office authorizes the conduct of Aqua-Ask InfoDesk: ' +
          'The 40th Commencement Exercises Facilitation on July 7,9, and 10, 2025 and an amount of Nineteen ' +
          'Thousand Eight Hundred Sixty-Six (P19,866.00) shall be disbursed.'],
      ['002', '2025-07-02',
        'Resolution Approving the Appointment of Dr. Seth B. Barandon as One of the Organization’s Advisers ' +
          'for the Academic Year',
        'RESOLVED, AS IT IS HEREBY RESOLVED, that the organization confirms and approves the appointment of ' +
          'DR. SETH B. BARANDON to serve as one of the faculty advisers of the CSPC – Supreme Student Council, ' +
          'which functions include overseeing the organizational bureaucratic processes, ensure ethical ' +
          'practices of all officers, and shall aid and guide in all decisional affairs of the body;'],
      ['003', '2025-07-21',
        'Resolution Approving the Conduct of the Search for SSC Assistants and Committee Directors 2025 and ' +
          'Disbursement of Fund Amounting to Eight Thousand Thirty Pesos (Php 8,030.00)',
        'NOW, THEREFORE, BE IT RESOLVED, that the CSPC – Supreme Student Council approves the conduct of ' +
          'Search for SSC Assistants and Committee Directors 2025 that will span from July 22-29, 2025, and the ' +
          'disbursement of fund amounting to Eight Thousand Thirty Pesos (Php 8,030.00) to finance the event.'],
      ['004', '2025-07-21',
        'Resolution Approving the Conduct of the Supreme Student Council’s Facilitation and Contribution to ' +
          'CSPC’s Orientation Seminar 2025 and Disbursement of Fund Amounting to Twelve Thousand Six Hundred ' +
          'Fifty Pesos (Php 12,650.00)',
        'NOW, THEREFORE, BE IT RESOLVED, that the CSPC – Supreme Student Council approves its facilitation ' +
          'and contribution during the ORSEM 2025: Igniting the Flame of CSPCean Culture: Guiding New Journeys ' +
          'Toward Brilliance and Belonging at the CSPC Gymnasium on July 31 and August 1, 2025, d the ' +
          'disbursement of fund amounting to Twelve Thousand Six Hundred Pesos (Php 12,650.00) to finance ' +
          'the council’s needs for the event.'],
      ['005', '2025-07-21',
        'Resolution Approving the Conduct of ORGbit: ORSEM 2025 Booth Fair; SSC’s SaurBETes and Disbursement ' +
          'of Fund Amounting to Seven Thousand Seven Hundred Seventy-Seven (Php 7,777.00)',
        'NOW, THEREFORE, BE IT RESOLVED, that the CSPC – Supreme Student Council approves ORGbit: ORSEM 2025 ' +
          'Booth Fair; SSC’s SaurBETes, the disbursement of fund amounting to Seven Thousand Seven Hundred ' +
          'Seventy-Seven (Php 7,777.00), and shall oversee the registration, allocation, and adherence to ' +
          'guidelines for all participating recognized student organizations, ensuring the successful ' +
          'implementation of this initiative.']
    ];
    for (const [no, adopted, title, body] of resolutions) {
      await conn.query(
        `INSERT INTO resolutions (resolution_no, title, body, date_adopted, photo_path, pdf_path, status,
           created_by, reviewed_by, published_at)
         VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
        [`SSC-RES-2025-${no}`, title, body, adopted, `/img/resolutions/res-${no}.jpg`,
          `/files/resolutions/resolution-${no}-s2025-2026.pdf`, secretary, president, adopted]
      );
    }
    await conn.query(
      `INSERT INTO documents (title, doc_type, body, status, created_by)
       VALUES (?, ?, ?, 'draft', ?)`,
      ['Minutes of the first general assembly', 'minutes',
        'Draft minutes: attendance, agenda items and decisions.', secretary]
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
