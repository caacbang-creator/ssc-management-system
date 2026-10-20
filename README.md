# SSC Student Organization Management System

## Setup

Requirements: Node.js 20 or 22 LTS and npm.

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your values (`.env` is git-ignored, never commit it).
   Choose any demo password for `SEED_PASSWORD`.

3. Start MySQL (XAMPP: click **Start** next to MySQL in the XAMPP Control Panel).

4. Create the database and fake demo data:

   ```
   npm run db:reset
   ```

   This runs `database/schema.sql` and `database/seed.js`. **It deletes all existing data** in `ssc_db`.
   Every seeded account uses `SEED_PASSWORD`. Officer accounts use the SSC officers' school e-mails
   (decision C15), for example `jesumpay@my.cspc.edu.ph` (President), `raabonal@my.cspc.edu.ph`
   (VP Internal), `casalvadora@my.cspc.edu.ph` (PIO, PRO role), `rjsernal@my.cspc.edu.ph` (Treasurer)
   and `matulabot@my.cspc.edu.ph` (Secretary). Student demo accounts are fake, e.g. `paolo.reyes@my.cspc.edu.ph`.

5. Start the server:

   ```
   npm run dev
   ```

   `npm run dev` restarts automatically when you save a file (nodemon).
   Use `npm start` to run it without auto-restart.

6. Open http://localhost:3000 in your browser.
