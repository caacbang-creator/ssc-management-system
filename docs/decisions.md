# Team decisions

## C12 — Event photos use official SSC photos stored in the repository

**Date:** 2026-10-19

**Decision:** Completed events show a photo gallery. For Round 1 the photos are the
official photos the CSPC Supreme Student Council already published on its public page.
They are stored in `public/img/<number><EventName>/` and committed to the repository.
The `event_photos` table stores only the file path, the display order and an optional caption.

The same applies to news posters (official SSC pubmats) in `public/newsimg/<number><Post>/`,
stored in the `announcement_photos` table. Several posters on one post form a carousel.

**Why:**
- Decision C2 (no file uploads) still applies, so officers cannot upload photos yet.
  The team adds the files; `express.static` serves them.
- The photos were already made public by the SSC, so showing them on the SSC system
  does not reveal anything new.

**Conditions:**
- Only photos the SSC published officially. No private photos of students.
- If the SSC or a person in a photo asks, the photo is removed.
- Photos are not used anywhere else (no captions naming people without their consent).

**Update:** uploads were brought forward to Round 1 by C13. The seeded photos stay in the
repository; photos uploaded through the app go to `public/uploads/` (git-ignored).

## C13 — The PRO uploads event photos and news posters (changes C2)

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** The PRO (and the President) upload, caption, reorder and remove event photos
and news posters from the officer pages. This uses **multer**, which is **outside the CCIT 106
Weeks 2–9 boundary** (file uploads are a Round 2 topic). C2 still applies to financial reports,
resolutions and documents: those stay structured data, with no file uploads.

**Why the PRO:** the role matrix already gives the PRO "create/edit" for announcements and
"documentation" for events. Photos are part of both.

**How it is protected:**
- `requireRole('pro', 'president')` runs **before** multer, so a file is never saved for the wrong role.
- Only JPG, PNG and WebP: the browser's type is checked, then the file's first bytes (the
  type a browser sends can be faked).
- At most 10 files per upload, 5 MB each. The server names the file (time + random);
  the user's file name is never used, so it cannot overwrite or reach other folders.
- Uploaded files are saved in `public/uploads/events/` and `public/uploads/news/` (git-ignored).
- Removing a photo deletes the row, and the file too if it was uploaded.

**Simpler alternative we did not choose:** the team copies files into `public/img/` and the PRO
only picks, orders and captions them (no new library).

## C14 — Editing published content sends it back to Pending (keeps C3)

**Date:** 2026-10-20

**Decision:** The PRO may change published announcements (text or posters) and published
events. Saving a change moves the record from **Published back to Pending**: it is hidden from
the public until the VP Internal or the President approves it again. "Only drafts are edited"
now reads: drafts and published records can be edited; pending records are locked.

**Why:** fixing a mistake should not need an unpublish → edit → resubmit round trip, but
nothing reaches the public without an approver seeing it (C3).

**Exception:** photos of a **completed** event are documentation (like the write-up) and do not
need new approval.

## C15 — Seed the real SY 2026–2027 SSC officers (changes "seed data is fake only")

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** The seed script creates login accounts for the eight real SSC officers with their
school e-mails, and the public officer directory lists their real names and positions.
Student accounts stay fake.

| Position | Name | System role |
|---|---|---|
| President | Jester Carl SJ. Sumpay | president |
| VP for Internal Affairs | Ralph Joe Francis Abonal | vp_internal |
| VP for External Affairs | Jessil Martinez | student (no officer role) |
| Secretary | Ma. Lourdes Tulabot | secretary |
| Treasurer | Rj Patrick Sernal | treasurer |
| Auditor | Krystine Gospe | student (no officer role) |
| Public Information Officer | Camille Salvadora | pro (the PIO does the PRO's work) |
| Property Custodian | Luke Ronquillo | student (no officer role) |

**Risks we accept, and how they are limited:**
- Real names and school e-mails are personal data (RA 10173) and are now in the repository.
  Names and positions are already public on the SSC page. The e-mails are not on any public page;
  they appear only on the user's own profile and on officer-only lists (event registrants,
  officer requests).
- **No password is in the repository.** Every account gets `SEED_PASSWORD` from the git-ignored `.env`,
  so reading the repo does not let anyone log in.
- Student numbers are placeholders, not the officers' real numbers.

**Conditions:**
- Each officer is told and agrees to their school e-mail being used. If someone does not agree,
  their account goes back to a fake demo e-mail.
- Before any real deployment (Round 2), every officer sets their own password.
- Keep the GitHub repository private, or replace the e-mails with fake ones before making it public.

## C16 — Officer directory shows official portraits (changes "no photo column")

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** `officers` gets an optional `photo_path` column. The directory and the About page
show each officer's official SSC portrait; an officer without a photo shows their initials.

**How:** the originals (7–10 MB each, about 65 MB) stay in `public/directory/`, which is git-ignored.
Web copies resized to 600 × 900 px (about 60 KB each) are in `public/img/officers/` and committed.
The photos are not uploaded through the app; the team replaces the file to change a photo.

**Conditions:** same as C12 and C15: official SSC photos only, each officer agrees, and a photo is
removed if the officer asks.

## C17 — Resolutions have a photo and a signed PDF; the Secretary uploads them (changes C2)

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** Each resolution can have one **photo** (the pubmat) and one **PDF** (the signed copy).
The Documents page shows the photo with **Details**, **Preview** (opens the PDF) and **Download**
buttons; the resolution page also shows the PDF inside the page on wide screens.
The **Secretary** (and the President) upload, replace and remove the files on the officer page.
This changes C2, which kept resolutions as structured data only. Financial reports and other
documents are unchanged (no files).

**Workflow:** the President still publishes (C2-B). Files can be changed on drafts freely; changing
the files of a **published** resolution sends it back to **Pending** (same rule as C14), so the
President sees the new files before the public does. Pending resolutions are locked.

**Safety:** same middleware rules as C13. The photo must be a real JPG, PNG or WebP and the PDF a real
PDF (both checked by the file's first bytes), up to 10 MB each, server-chosen file names, saved in
`public/uploads/resolutions/` (git-ignored). `requireRole('secretary', 'president')` runs before the upload.

**Seed data:** the five official resolutions, s. 2025–2026 (No. 001–005), with their pubmats and
signed PDFs, are committed in `public/img/resolutions/` and `public/files/resolutions/`. They are
public SSC documents; they name officers and an adviser, so the C12 conditions apply.
Resolution titles may now be up to 255 characters (the official titles are long).

## C18 — One annual budget; liquidation reports list their receipts and sales

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** The SSC has **one budget for the whole school year** (₱1,000,000 for 2026–2027), stored in
`annual_budgets`. A financial report is a **liquidation report**: its receipts are rows in
`financial_report_expenses` and the products sold are rows in `financial_report_sales`.
The old per-report `budget` and `expenses` fields are removed.

**Everything is computed, nothing is typed twice** (this keeps the old rule "the remaining balance is
computed, never stored"):
- report total expenses = sum of its receipt lines
- report total sales = sum of quantity × unit price; net income = sales − expenses
- the year's spending = expenses of that year's **published** reports; left = budget − spending

**Who:** the Treasurer (and the President) add, edit and remove lines on **draft** reports and set the
annual budget; the President still publishes (C2-B). VP Internal can view. Lines are locked once a
report is pending or published (checked inside the SQL).

**Seed data:** the SSC's liquidation reports for SSC SaurBETes and ORSEM 2026 (August 4–5, 2026),
copied line by line; their totals match the paper reports (₱6,446.00 / ₱6,930.00 / ₱484.00 and ₱5,731.00).

## C19 — Property Custodian role: items, availability and the borrowing log

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** A new role, `property_custodian`, is given to the Property Custodian (Luke Ronquillo in the seed)
and can be requested at registration. The custodian and the President now manage items; **the PRO no
longer does** (this changes the Items row of the role matrix).

**What the custodian does:**
- marks each item **Available** or **Not available** with a reason students can see ("Under repair");
  not-available items cannot be requested (checked in the dropdown AND on the server)
- on the **Borrowing desk**: hands over approved Item Borrowing requests, records **walk-in loans**
  (borrower found by student number; they must have an account), and marks loans **returned** with the
  condition (good, damaged, lost). Returning a request-based loan also completes that request.
- sees each item's **last borrower** and full **borrowing log** (who, how many, when out, due, returned,
  by which officer, condition, notes)

**Data:** new table `item_loans` (one row per handover); `items` gets `status` and `status_note`.
Units out and overdue loans are **computed**, never stored. A handover locks the item row
(`SELECT ... FOR UPDATE`) so the units lent can never exceed the stock. Items or users with loan history
cannot be deleted (RESTRICT), so the log is never lost; mark the item "Not available" instead.

**Privacy:** students see availability only, never who borrowed an item.

**Request workflow is unchanged:** PRO reviews, VP Internal or President approve/reject (C4).

## C20 — The PRO may post events that already happened

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** An event's date may be in the past, so the PRO can post an event after it happened
(e.g. to document it with photos). This replaces "dates must not be in the past" for events only;
transaction dates still cannot be in the past (C11).

**What stays the same:** a past event still goes Draft → Pending → Published and needs the VP Internal
or the President (C3). Students cannot register for it, because registration requires a published
event dated today or later (checked in the route and inside the SQL). After approval the PRO marks it
**completed** to add the write-up and photos, and it appears under "Past events".

## C21 — The PRO uploads videos to events and announcements

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** The PRO (and the President) can upload videos to **completed events** and to
**announcements**, on the same pages as photos and posters. Same rules as photos (C13, C14): event videos
need no new approval; adding or removing a video on a **published** announcement sends it back to Pending.

**Limits and safety:** MP4, WebM or MOV (iPhone), **one video per upload, up to 250 MB**, checked by type
AND by the file's first bytes (`ftyp` for MP4/MOV, `1A45DFA3` for WebM). Server-chosen file names, saved in
`public/uploads/` (git-ignored). `requireRole` runs before multer. A **title is required** (it names the
video for screen readers). Node's request time limit is raised to 30 minutes so a large upload on slow
Wi-Fi is not cut off.

**Playback:** the browser's built-in player (`<video controls preload="metadata">`), no JavaScript.
`preload="metadata"` loads only the first frame and length until someone presses play.
`express.static` supports Range requests, so viewers can jump to any point.

**Known limit:** no captions file (subtitles) yet; videos with speech should get captions in Round 2.

**Update (2026-10-20):** event photos and videos can also be uploaded while the event is a **draft**,
so the PRO can prepare them before sending it for approval (useful for past events, C20). They are still
shown publicly only after the event is completed. Pending and published events are locked. Deleting a
draft also deletes its uploaded files. The event page always shows a "Photos and videos" box that
explains when uploading is open.

## C22 — Event venue and capacity are optional

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** `events.venue` and `events.capacity` may be empty (NULL).
- No venue → pages show **"Venue to be announced"**.
- No capacity → **no limit**: registration stays open (still only for published events dated today or
  later); cards say "Open to all" and officer pages show "N registered (no limit)".
A capacity that is given must still be 1–9999 and cannot go below the number already registered.
The registration transaction treats NULL as "never full", so the old capacity lock still works for
events that have one.

## C23 — The President may permanently delete published news and public events

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** This changes the default "published content is unpublished, not deleted". The **President only**
can permanently delete a **published announcement**, or an event that is **published, completed or cancelled**.
Everyone else keeps the safer options: Unpublish (news) and Cancel (events).

**Safeguards:**
- `requireRole('president')` on both the confirmation page and the delete; a typed URL from any other role gets 403.
- A **confirmation page** first (no JavaScript): it lists what will be lost (registrations, photos, posters,
  videos) and points to Unpublish / Cancel as the safer choice. Only its POST button deletes.
- The allowed statuses are checked inside the SQL (`WHERE id = ? AND status IN (...)`); drafts keep using
  "Delete draft", pending items cannot be deleted.
- Registrations, photos and videos rows go with the record (ON DELETE CASCADE) and their uploaded files are
  deleted from disk. Concerns and transactions are still never deleted.

## C24 — News posts show a date the PRO chooses

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** `announcements.news_date` is the date shown on a post (e.g. the day the pubmat was posted
or the news happened). The PRO sets it on the form; it defaults to today, may be in the past, and cannot be
in the future. The News page, the dashboard and the post page show and sort by it. `published_at` still
records when it was approved on this website (shown to officers as "published here").
Changing the date of a live post sends it back for approval, like any other edit (C14).
Existing posts started with their news date = the day they were published.

## C25 — Office duty schedule and check-in replace biometrics and a QR scanner

**Date:** 2026-10-20 · **Status:** chosen by caacbang-creator; the other two members confirm in the PR review.

**Decision:** The SSC's weekly **Officer of the Day (OOTD)** duty is managed in the system: a
President-managed duty schedule, office **check-in / check-out** for officers, an **Office Now** page and an
**Officer Performance** page with CSS bar graphs.

**Why not biometrics or a QR scanner:** fingerprint (WebAuthn) and in-browser QR scanning need browser APIs
and libraries outside the CCIT 106 Weeks 2–9 boundary. Instead, identity is proven by the officer's **own
login**, **re-entering their password**, and an **office code that is only visible at the SSC office**. The
President can put the check-in link (with the code) in a printed QR code; the phone's normal camera app opens
it, so the app has **no QR, camera or chart code at all**. **No new npm packages** (only Node's built-in
`crypto`).

**Defaults:**
- A day may have more than one officer on duty. Each schedule row has a start time; Time In **more than
  15 minutes** after it counts as **late** (computed in SQL).
- The schedule, the office code, Office Now and Performance are **President only**
  (`requireRole('president')` at the mount).
- **One** office code for the whole office, set by the **President**: either **their own code** (4–10
  letters or numbers, saved in capitals so case does not matter; no spaces or symbols because it is typed
  on phones and goes into the printed link) or a **random** 6-character code without look-alikes
  (no 0/O, no 1/I). The old code stops working at once.
- **Time In** needs the office code **and** the officer's password; **Time Out** needs only the code.
- **One open log at a time**, and only for **today**: a log without a time-out from an earlier day is a
  "missing time-out" and never blocks a new Time In.
- Only users whose role is **not student** can check in (`requireOfficer`) or be scheduled.
- **Duty or visit is decided on the server** from the schedule, never from the form. A second Time In on a
  duty day, after timing out, is a visit.
- Photos come from the directory (C16) through the new optional, unique `officers.user_id` link; no photo or
  no link shows initials.
- **Times come from the database clock** (`NOW()`, `CURDATE()`, `DAYOFWEEK()`), never from the form or the
  browser. The officer is always `req.user.id`. Recording attendance is always a **POST**; `GET
  /office/check-in?code=` only shows the form, because link previewers and scanners open GET links.
- Performance counts a weekday's duties **from the day it was added to the schedule** up to today (future
  days cannot be missed; today counts once the officer has timed in). The attendance rate shows "–" when
  nothing was scheduled. Bar sizes are whole percents clamped to 0–100.

**Sample data:** the seed adds six weeks of **made-up** attendance for the seeded officers (some late, one
missing time-out, one missed duty). It is not their real record; tell the officers before a demo.
