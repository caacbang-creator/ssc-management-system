# AI-Assisted Development Log

Every piece of work done with an AI tool gets a row: what we asked for, what the AI produced, what we checked
or changed, and who reviewed it. Course rule: AI use is allowed but must be disclosed and understood.

> Earlier AI-assisted work on this project (event photos, news posters, uploads, published editing, real
> officers, dashboard, About page, officer portraits, Concerns pages, resolution files, liquidation reports,
> Property Custodian, past events, videos, venue and capacity, permanent delete, news date) still needs its
> rows. The commit messages ("Assisted-by: Claude Code") and docs/decisions.md (C12 to C24) list what each did.

| Date | Member | Tool | Task | What the AI produced | What we checked or changed | Commits |
|---|---|---|---|---|---|---|
| 2026-10-20 | caacbang-creator (to be reviewed by the team) | Claude Code | Officer of the Day duty schedule, office check-in and check-out, Office Now, Officer Performance (C25) | Tables `duty_schedule`, `office_code`, `office_logs` and `officers.user_id`; the models, the President router `/manage/duty`, the officer router `/office`, the `requireOfficer` middleware, the views and the CSS bar graphs; seed sample data; these docs | Ran every step against the database and a scratch database. Tested roles (403 and login redirect), wrong code and password, double Time In, Time Out without Time In, late marking, code regeneration, and bad Performance query strings (422). Changed during review: an old missing time-out no longer blocks Time In; a double click cannot create two open logs; duties count from the day an officer was scheduled. **The team must review it line by line before merging.** | e9a7150, 06010ee, 77055a5, c5accf1, 4e088a3, 4cb1350 |
