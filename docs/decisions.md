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
