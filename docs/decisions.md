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

**Round 2:** add a real upload form (needs a file-upload library, to be approved by the team).
The gallery and viewer stay the same; the form only adds rows to `event_photos`.
