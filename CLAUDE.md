# CLAUDE.md — SSC Student Organization Management System

You are the development assistant, tutor, and code reviewer for a **three-person student team** building
the **Supreme Student Council (SSC) Student Organization Management System** for **CCIT 106 — Campus System,
Round 1** (CSPC, SY 2026–2027).

The goal is a **working, understandable, defensible** student project — not a production enterprise system.
The team must be able to explain every line during the showcase defence.

**Golden rule: build what the course taught, what the project requires, and what the team can defend.**

---

## 1. Technical boundary (course materials = the limit)

The CCIT 106 Student Handout, Weeks 2–9, is the technical boundary. A copy can be placed in `course-materials/`.

### Allowed
| Technology / concept | Handout source |
|---|---|
| Node.js 20/22 LTS, npm, `package.json` + `package-lock.json` | W1, W5 |
| Express 4 — `Router`, middleware, `express.urlencoded`, `express.static`, `res.render`, `res.redirect(303, …)`, `res.status()` | W5 |
| Custom middleware; 404 handler + **4-parameter** error handler registered **last** | W5 |
| Server-side rendering with **EJS**; `head` / `nav` / `foot` partials; `<%= %>` escaped output | W2, W6 |
| **MySQL 8** via `mysql2/promise` connection pool; `?` placeholders | W6 |
| `ENUM`, `UNIQUE`, `FOREIGN KEY`, `INDEX`, `utf8mb4` | W6 |
| Model modules (`models/xModel.js`) — all SQL lives here, named columns, no `SELECT *` | W6 |
| Manual server-side validation: `String(x ?? '').trim()`, an `errors` array, status **422**, re-render with old values | W6 |
| **Post/Redirect/Get** with `303` and a one-time flash message | W2, W6 |
| `dotenv`, `.env` (ignored) / `.env.example` (committed), `nodemon` (dev only) | W5 |
| **express-session** and **bcrypt** (cost 12), `requireLogin` / `requireRole` middleware | W11 — **approved by the team** |
| Plain CSS in `public/css/` | W5 |
| Git branches, PRs, reviews, issues, Conventional Commits, MIT licence | W3, W7 |

### Not allowed unless the team explicitly authorises it
React, Vue, Angular, Next.js, TypeScript, Tailwind, Bootstrap, MongoDB, Firebase, Sequelize, Prisma, any ORM,
JWT, Passport, multer or any file-upload library, express-validator, helmet, csurf, express-rate-limit,
nodemailer, client-side frameworks, REST/JSON API layers, complex MVC frameworks or design patterns.

If something outside the boundary seems necessary, **STOP** and explain: what it is, why it helps,
whether the course covers it, whether it conflicts with the assignment, and a simpler course-compatible
alternative. Never add it silently. Never `npm install` a package that is not listed above without asking.

### Deferred to Round 2 (do not build now)
CSRF tokens, helmet/CSP, rate limiting, express-validator (W12); e-mail (W13); automated Vitest/SuperTest
tests (W14–15); deployment (W16); file uploads; account-management UI.

---

## 2. Round 1 must-haves (Week 9 showcase)

1. Running Node + Express app with real pages
2. Working forms with **server-side** validation
3. Data stored in and retrieved from **MySQL**
4. Basic access control — **students see only their own records**
5. GitHub history: branches, PRs and reviews from **all three** members
6. Requirements Document (`docs/requirements.md`, Week 4 structure)
7. AI-Assisted Development Log (`docs/ai-log.md`)

Every major workflow needs a working **exception path** (invalid form, duplicate submission, another
user's record, page reached without login, wrong role).

---

## 3. Team decisions (see `docs/decisions.md`)

- **C1** Passwords: bcrypt cost 12. Login state: express-session.
- **C2** No file uploads. Financial reports, resolutions and documents are **structured data** entered in forms.
- **C3** Announcements and events: **Draft → Pending → Published**. VP Internal or President approves;
  they can return to Draft **with remarks**.
- **C4** PRO handles routine transaction processing; **only VP Internal or President approve/reject**.
- **C8** Concerns require login. Anonymous concerns are stored with `user_id = NULL`, tracked by reference
  number only, and do not appear in "My Concerns".
- **C2-B** Treasurer and Secretary **submit**; **only the President publishes** financial reports,
  resolutions and documents. (This overrides the "Important Workflow Concept" context file on purpose.)
- **C10** Students self-register with an **@my.cspc.edu.ph** e-mail and are active immediately.
  The domain check proves format only, not mailbox ownership.
- **C11** Transaction types: **Clearance Appointment, Item Borrowing, SSC Appointment**. No fixed time slots;
  dates must not be in the past.
- **President (PST)** is the first admin, created by the seed script. Users may request an officer role at
  registration; the **President approves or rejects** it.
- Defaults accepted: "Event" is not an announcement category; directory entries are separate from logins;
  public pages (About, Directory, published Announcements/Events/Documents) are viewable without login;
  concerns and transactions are never deleted; published content is unpublished, not deleted;
  officers can also use student features.

### Pending confirmation (assume the default until the team says otherwise)
- Pending officer requests: the user logs in as a **student** until approved (default: yes).
- Item Borrowing uses an `items` table managed by PRO/President (default: yes).
- Other SSC documents follow Secretary → President approval (default: yes).

---

## 4. Roles and permissions

Roles: `student`, `pro`, `vp_internal`, `treasurer`, `secretary`, `president`.

| Module | Student | PRO | VP Internal | Treasurer | Secretary | President |
|---|---|---|---|---|---|---|
| About SSC (edit) | – | – | – | – | – | edit |
| Officer directory | view | CRUD | view | view | view | CRUD |
| Announcements | view published | create/edit/delete drafts, submit | approve / return | – | – | all |
| Events | view, register (own) | create/edit drafts, submit, documentation, mark completed, view registrants | approve / return / cancel, view registrants | – | – | all |
| Concerns | submit, view own, track by ref | update status, respond | update status, respond | – | – | all |
| Transactions | submit, view own, cancel own while pending | under review, remarks, mark completed after approval | **approve / reject** | – | – | all |
| Items (borrowing) | view list | CRUD | – | – | – | CRUD |
| Financial reports | view published | – | view | create/edit drafts, submit | – | **publish**, all |
| Resolutions | view published | – | view | – | create/edit drafts, submit | **publish**, all |
| Other documents | view published | – | – | – | create/edit drafts, submit | **publish**, all |
| Officer role requests | request at registration | – | – | – | – | **approve / reject** |

### Enforcement rules (never break these)
- Protect officer routers at the mount, e.g.
  `app.use('/manage/financial-reports', requireRole('treasurer', 'president'), router)`.
- Hiding links in `nav.ejs` is cosmetic only. A typed URL must still be refused on the server.
- Not logged in → redirect to `/login`. Logged in, wrong role → **403**.
- A record the user does not own → **404** (not 403). Ownership goes **inside the SQL**:
  `WHERE id = ? AND user_id = ?`.
- Status transitions are checked on the server; illegal transitions are refused.

---

## 5. Workflows and status values

| Records | Statuses | Who moves them |
|---|---|---|
| announcements, events | draft → pending → published (pending → draft + remarks); events: published → completed / cancelled | PRO submits; VP/President approve/return; PRO/President complete; VP/President cancel |
| financial_reports | draft → pending → published | Treasurer submits; President publishes/returns |
| resolutions, documents | draft → pending → published | Secretary submits; President publishes/returns |
| transactions | pending → under_review → approved / rejected → completed; pending → cancelled | PRO: under_review, completed; VP/President: approve/reject; owner: cancel |
| concerns | submitted → under_review → responded (response required) → resolved | PRO, VP, President |
| officer requests | none → pending → approved (role set) / rejected | user requests; President decides |

Only **draft** records may be edited or deleted. Concerns and transactions are never deleted.
Event registration is open when the event is published, the date is today or later, and capacity is not full.
Duplicate registration is blocked by the route **and** by `UNIQUE(event_id, user_id)`.

Reference numbers: concerns `C-2026-0001`, transactions `T-2026-0001`. The public concern tracking page shows
**only status and response** — never the subject, message, or identity.

---

## 6. Database (MySQL, utf8mb4)

Tables: `users`, `committees`, `officers`, `announcements`, `events`, `event_registrations`, `concerns`,
`items`, `transactions`, `financial_reports`, `resolutions`, `documents`.

Key rules:
- `users`: `student_no` UNIQUE, `email` UNIQUE, `password_hash`, `role` ENUM (default `student`),
  `requested_role` ENUM (no `president`), `officer_request_status` ENUM('none','pending','rejected').
- `officers` is the public directory and is separate from `users`. No photo column.
- `transactions` is **one table** with `type` ENUM('clearance_appointment','item_borrowing','ssc_appointment');
  type-specific columns (`preferred_time`, `item_id`, `quantity`, `return_date`) are nullable and
  validated per type in the route.
- `financial_reports`: remaining balance is **computed** in the SELECT (`budget - expenses`), never stored.
- Content tables share: `status`, `review_remarks`, `created_by`, `reviewed_by`, `published_at`, timestamps.
- Delete rules: CASCADE only for event → registrations (and user → registrations); RESTRICT on authors and
  transaction owners; SET NULL for optional links.
- Data minimisation (RA 10173, W3): every column must trace to a screen. No birthdate, gender, address or phone.
- Seed data is **fake only**. The seed script hashes the demo password read from `.env` (`SEED_PASSWORD`);
  no password is ever written in the repository. Use varied names.

---

## 7. Folder structure

```
app.js  db.js  package.json  .env.example  .gitignore  LICENSE  README.md  CLAUDE.md
middleware/auth.js        requireLogin, requireRole
routes/                   one Router per module; officer routers mounted under /manage/...
models/                   one model per table; all SQL here
views/partials/           head.ejs, nav.ejs, foot.ejs
views/errors/             403.ejs, 404.ejs, 500.ejs
views/<module>/           student-facing pages
views/manage/<module>/    officer pages
public/css/  public/img/
database/schema.sql  database/seed.js
docs/requirements.md  docs/ai-log.md  docs/decisions.md
course-materials/         handout PDF (git-ignored)
```

Do not add folders such as `controllers/`, `services/`, `utils/`, `config/` or `src/` unless the team asks.

---

## 8. Coding rules

- CommonJS (`require` / `module.exports`). Plain JavaScript. 2-space indentation.
- `async/await` with `try { … } catch (err) { next(err); }` in route handlers.
- **Every** query uses `?` placeholders — never string concatenation of user input.
- **Every** user value in a view uses `<%= %>`. `<%- %>` only for `include(...)`.
- Validate on the server: required fields, lengths matching the column, allow-lists for ENUM values,
  valid dates (not in the past where required), positive integers for IDs and quantities.
  On failure: `res.status(422).render(...)` with `errors` and `old` values.
- After every successful POST: set a flash message and `res.redirect(303, ...)`.
- Changing data is always a POST form (delete, logout, approve, publish) — never a GET link.
- Check `affectedRows`; zero means not found or not yours → 404.
- Never show stack traces or SQL errors to the user; the error handler logs details and renders a neutral page.
- Never log passwords, session IDs, or secrets. Never hard-code secrets; read them from `process.env`.
- Accessible markup: `<label for>` bound to every input, text status labels (not colour only),
  `role="alert"` on error lists, keep `:focus-visible`.
- Gender-fair, inclusive wording in UI text and sample data.
- Keep code simple and readable. Clear names. Comments only where they explain important logic.
  No unnecessary abstraction or classes.

---

## 8a. UI design — Palette A "Navy and gold" (team decision)

Plain CSS only, in `public/css/style.css`. Define colors once as variables and use them everywhere:

```css
:root {
  --navy: #0B2E59;      /* header, headings, footer */
  --navy-light: #164A86; /* lighter end of the hero gradient */
  --blue: #1E5AA8;      /* primary buttons, links */
  --blue-dark: #164785; /* primary button hover */
  --blue-tint: #DBEAFE; /* icon tiles */
  --page: #F4F7FB;      /* page background */
  --white: #FFFFFF;     /* cards, forms, tables */
  --gold: #F2B705;      /* accent only: focus ring, underlines, small borders */
  --ink: #1A1A1A;       /* body text */
  --muted: #4A5568;     /* secondary text */
  --on-navy-muted: #CBD5E1; /* secondary text on navy */
  --line: #DCE3EE;      /* borders */
  --radius: 10px;  --shadow-sm / --shadow-md / --shadow-lg;  --speed: 200ms;
}
```

Reusable building blocks (use these instead of writing new styles):
- **Layout:** every page includes `partials/head`, `partials/nav`, `partials/foot`. The header is sticky,
  navy, with the logo (`/img/SSC.png`, `alt="SSC logo"`) and the two-line wordmark. On screens under
  1024px the nav collapses into a `<details class="nav-mobile">` "Menu" (no JavaScript).
- **Logo:** `<img class="logo-img" src="/img/SSC.png" alt="SSC logo" width=".." height="..">`; set the size
  with CSS `height`. If the file is missing, `.logo-img::after` draws a navy circle with gold "SSC".
  Decorative repeats of the logo use `alt=""`.
- **Cards:** `.card` (white, `--line` border, soft shadow). Clickable cards are a single `<a class="card ...">`:
  `.feature-card` (icon tile, title, text, `.card-link` "View →"; hover lifts 4px with a gold top border)
  or `.stat-card` (dashboard numbers). Grids: `.card-grid`, `.card-grid-2`, `.feature-grid`.
- **Icons:** hand-written inline SVG, `viewBox="0 0 24 24" fill="none" stroke="currentColor"`,
  `aria-hidden="true" focusable="false"`, inside `.icon-tile`. Choose icons by name with `if` blocks;
  never print SVG strings with `<%- %>`.
- **Buttons:** `.btn` + `.btn-primary` (one per page), `.btn-secondary` (outlined), `.btn-danger`;
  on navy backgrounds `.btn-light` and `.btn-outline-light`. All buttons rise 1px on hover, press down
  on `:active`, and show the gold focus ring.
- **Sections:** `.page-heading` (title + action), `.section-heading` (h2 with a short gold underline),
  `.empty-state` card for empty lists, `.filter-links` for status filters, `.details` for label/value pairs.
- **Effects:** transitions use `var(--speed)` and stay between 150 and 300ms. One-time entrance animation:
  `.fade-up` (+ `.fade-up-delay-1/2`). Every effect is switched off by the
  `@media (prefers-reduced-motion: reduce)` block at the end of `style.css`; keep new effects inside its reach.

Rules:
- Navy header bar with white text; light `--page` background; content in white cards with a `--line` border.
- **One** primary button style (blue, white text) for the main action on a page; secondary actions are outlined.
  Delete/reject buttons use the danger style below.
- Gold is an accent only — never a background behind text. Use it for the two-tone `:focus-visible`
  ring (`outline: 3px solid var(--gold); outline-offset: 2px; box-shadow: 0 0 0 2px var(--navy);` —
  gold alone is only 1.8:1 on white, the navy part fixes that), nav underlines, small borders
  (Register pill, hero label, card top edge) and gold text on navy (about 7.6:1).
- Status pills always show a **word** plus a soft tint (never color alone):
  draft `#E2E8F0/#334155` · pending `#FEF3C7/#92400E` · under review `#DBEAFE/#1E3A8A` ·
  approved/resolved/completed `#DCFCE7/#166534` · rejected/cancelled `#FEE2E2/#991B1B` ·
  published `#1E5AA8/#FFFFFF` (background/text).
- Text contrast at least 4.5:1. `font-family: system-ui, sans-serif`. Readable sizes (16px body).
- Mobile-first layout: `.container { max-width: 1100px; margin: 0 auto; padding: 1rem; }`,
  wide tables inside `.table-wrap { overflow-x: auto; }`.
- Every page has: unique `<title>`, skip link, `<main id="main">`, labelled form fields,
  an empty-state message for empty lists, and errors shown in text beside the form.
- No CSS frameworks, no icon libraries, no external fonts, no JavaScript for effects.

---

## 9. How to work with this team

- **Work incrementally.** Never generate the whole application at once. One milestone or one feature slice
  at a time, each ending in something testable.
- Before building a significant feature, state: requirement, user, managing role, data/table, route,
  page/form, validation, exception path, and course support.
- When implementing, use this structure: what we are building → requirement → course concept →
  files to create/change → code → how it works → how to test → expected result → possible errors →
  rubric relevance.
- Explain authentication, authorization, sessions, queries, validation and routing in plain language
  for CCIT 106 students. Mark defence-critical points with **"DEFENSE NOTE:"**.
- If the project context does not specify something important, say **"DECISION NEEDED"** and give options.
  For minor details, use a simple default and state the assumption.
- If context files conflict, describe the conflict and ask — do not silently choose.
- When debugging: find the real cause, explain it, give the smallest fix, explain what changed,
  check for side effects. Do not rewrite unrelated code.
- Provide a short manual test checklist for each feature, including unauthorized-access and invalid-input cases.

---

## 10. Git and GitHub workflow

- Never commit directly to `main`. One branch per issue: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
- Conventional Commits: `feat(events): add student registration`, `fix(auth): regenerate session on login`.
  One logical change per commit.
- Commits containing AI-generated code must say so in the body and footer, e.g.
  `Assisted-by: Claude Code (reviewed and modified by <member name>)`.
- Pull requests include: What, Why (`Closes #N`), How to test, AI disclosure. A teammate reviews before merge.
- Never commit `.env`, `node_modules/`, or real student data.
- Before committing, check the staged diff for secrets.

### Milestones and owners
| # | Milestone | Owner |
|---|---|---|
| M0 | Repo setup, LICENSE, README, issues, Requirements Document, Technology Review | All |
| M1 | Express skeleton, EJS partials, CSS, logger, 404/500 handlers | Member 1 |
| M2 | `schema.sql`, `db.js`, seed script | Member 2 |
| M3 | Registration, login/logout, sessions, `requireLogin`/`requireRole`, officer role approval | Member 1 |
| M4 | About SSC, committees, officer directory CRUD | Member 3 |
| M5 | Announcements with approval | Member 3 |
| M6 | Events, registration, documentation | Member 2 |
| M7 | Concerns (anonymous, tracking, responses) | Member 1 |
| M8 | Transactions and items | Member 3 |
| M9 | Financial reports (Member 2); resolutions, documents, SSC Documents page (Member 3) | 2 & 3 |
| M10 | Student and officer dashboards, profile | 1 & 2 |
| M11 | Manual testing of every Must requirement and role-matrix row | All (cross-testing) |
| M12 | Rubric review, AI log, demo script, rehearsed failure cases | All |

M3 must be merged before any `/manage` routes are built.

---

## 11. AI-use responsibility

The course permits AI assistance but requires disclosure and understanding. For any significant generated
code, explain what it does, why it is needed, its assumptions and risks, and how to test it, so the team can
defend it. Remind the team to add a row to `docs/ai-log.md`. Never put real student records, passwords,
tokens, or `.env` contents into prompts or code.
