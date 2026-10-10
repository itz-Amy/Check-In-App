# Class Check-in (Web Tech)

A two-page web app that replaces several separate steps in class with one flow. No login.

## Check-in page (`index.html`)

1. **Attendance**: name, the **faculty code**, and today's lesson (30 lessons).
2. **Reading quiz results**: the student enters their score (%) for each reading quiz they've written, up to today's lesson. 65% or more is a pass.
3. **Quizzes to do in class**: at most **2**, reading or terminal. A terminal quiz is locked until the student has entered a score for that lesson's reading quiz.
4. **Quiz for discussion**: only reading quizzes the student has **passed (65%+)** can be voted for.
5. **Prerequisites**: tick the reading labs and terminal quizzes of earlier lessons that today's lesson builds on. The page says "Cleared" or lists exactly what is missing.

## Dashboard page (`dashboard.html`)

- **Faculty code**: generate a new code (or close check-in). Students can't check in without it.
- Attendance table with in-class quizzes, discussion vote and readiness, a vote chart, CSV export, and a reset for a new class.

## Files

| File | Purpose |
|---|---|
| `index.html` / `dashboard.html` | The two pages |
| `style.css` | Shared styling, light and dark themes |
| `data.js` | Lessons, prerequisites, pass mark and the 2-quiz limit |
| `script.js` | All logic |

## Run it

Open `dashboard.html`, click **Generate new code**, then open `index.html` in the same browser and check in with that code.

## How the prerequisite check works

Each lesson in `data.js` lists the lessons it depends on. The app walks backwards through that dependency graph (a depth-first search with a visited set) to collect every earlier lesson, then requires the reading lab and terminal quiz of each one.

## Data and limitations

Everything is saved in the browser's `localStorage`, so the code and check-ins are shared between the two pages on one device only. A real class would need a backend (for example Firebase or Google Sheets) so students on their own devices can check in against the faculty code, and so the code isn't readable from the browser. Reading scores and prerequisites are self-declared.

## Customising

Edit `data.js`: lesson titles (`TITLES`), prerequisites (`PREREQS`), `PASS_MARK` and `MAX_CLASS_QUIZZES`.
