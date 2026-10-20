# Requirements Document

SSC Student Organization Management System · CCIT 106, Round 1

> The full Week 4 Requirements Document (scope, users, the other modules' functional requirements,
> constraints) is written by the team. This file currently holds the **Office duty** requirements
> (decision C25); add the other modules' sections in the same format.

## Office duty: Officer of the Day (OOTD)

### Functional requirements

| ID | Requirement | Who | Priority |
|---|---|---|---|
| FR-OD-01 | The President can add an officer to the weekly duty schedule with a weekday and a start time, and remove them. An officer can be on a given weekday only once; a day may have several officers. | President | Must |
| FR-OD-02 | Only officers (any role except student) can be scheduled. | System | Must |
| FR-OD-03 | The President can see the current office code and the full check-in link (for a printed QR code), and regenerate the code. The old code stops working immediately. | President | Must |
| FR-OD-04 | An officer can open the check-in page and see whether they are Officer of the Day today and from what time. Opening the page (including from a QR link) records nothing. | Officer | Must |
| FR-OD-05 | An officer can Time In with the office code and their password. The system records **duty** if they are scheduled today and have no duty log yet, otherwise **visit**. | Officer | Must |
| FR-OD-06 | A duty Time In more than 15 minutes after the scheduled start is marked late. | System | Must |
| FR-OD-07 | An officer can Time Out with the office code. Time In is refused while they are already checked in; Time Out is refused when they are not. | Officer | Must |
| FR-OD-08 | A wrong office code or wrong password refuses the Time In and saves nothing. | System | Must |
| FR-OD-09 | The President can see **Office Now**: who is in the office, on duty or visiting, since when and for how long, who is scheduled but not in yet, and who already left today, with directory photos. | President | Must |
| FR-OD-10 | The President can see **Officer Performance** for one officer and a date range: duties scheduled and completed, attendance rate, missed duties, late arrivals, missing time-outs, hours on duty and visiting, duties per month (bar chart) and every scheduled officer's attendance rate (bar chart). | President | Should |
| FR-OD-11 | Students cannot open any office duty page (403); the PRO and other officers cannot open the President's pages (403); visitors who are not logged in are sent to the login page. | System | Must |

### Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-OD-01 | **Attendance times come from the database server clock** (`NOW()`, `CURDATE()`, `DAYOFWEEK()`), never from the form or the browser, so a time cannot be faked with browser tools. |
| NFR-OD-02 | The officer recorded is always the logged-in user (`req.user.id`); no id or name is accepted from the form. |
| NFR-OD-03 | Recording attendance is always a POST followed by a 303 redirect (Post/Redirect/Get), so refreshing the page never records twice. |
| NFR-OD-04 | No new npm packages and no client-side JavaScript: bar graphs are HTML elements sized by the server, QR codes are made outside the app. |
| NFR-OD-05 | Bar graphs always print the number, so their meaning does not depend on colour alone. |
