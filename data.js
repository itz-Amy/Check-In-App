/* ------------------------------------------------------------------
   COURSE DATA — edit this file to match the course.
   ------------------------------------------------------------------ */

const PASS_MARK = 65;          // reading quiz score (%) that counts as a pass
const MAX_CLASS_QUIZZES = 2;   // most quizzes a student may choose to do in class
const TOTAL_LESSONS = 30;

/* Lesson titles. Lessons without a title show as "Lesson 12:" until named. */
const TITLES = {
  1: "Introduction",
  2: "Basic HTML syntax",
  3: "Emphasis and importance – Lists – Structuring documents",
  4: "Links – Tables – Images",
  5: "Forms – HTML APIs",
  6: "CSS",
  7: "The box model – Responsive web design",
  8: "Exploring JavaScript",
  9: "Expressions and Control Flow in JavaScript",
  10: "JavaScript Functions, Objects, and Arrays",
  11: "Using Asynchronous Communication"
};

/* Which earlier lessons each lesson builds on. A student must have completed
   the reading lab and terminal quiz of every lesson in this chain.
   PLACEHOLDER: replace with the real prerequisites. Lessons that are not
   listed here (12 onward) default to depending on lesson 11. */
const PREREQS = {
  1: [],
  2: [1],
  3: [2],
  4: [3],
  5: [4],
  6: [3],
  7: [6],
  8: [3],
  9: [8],
  10: [9],
  11: [10]
};

const LESSONS = Array.from({ length: TOTAL_LESSONS }, (_, i) => {
  const id = i + 1;
  return { id, title: TITLES[id] || "", prereqs: PREREQS[id] || (id > 11 ? [11] : []) };
});

const LESSON_BY_ID = Object.fromEntries(LESSONS.map(l => [l.id, l]));

/* "Lesson 4: Links – Tables – Images", or just "Lesson 12:" when unnamed. */
function lessonName(id) {
  const lesson = LESSON_BY_ID[id];
  return "Lesson " + id + ":" + (lesson.title ? " " + lesson.title : "");
}

/* Keys look like "reading-4", "terminal-4", "lab-4". */
const readingKey = id => "reading-" + id;
const terminalKey = id => "terminal-" + id;
const labKey = id => "lab-" + id;
const lessonOf = key => Number(String(key).split("-")[1]);

function itemLabel(key) {
  const type = String(key).split("-")[0];
  const names = { reading: "Reading Quiz ", terminal: "Terminal Quiz ", lab: "Reading Lab " };
  return names[type] ? names[type] + lessonOf(key) : String(key);
}

/* Every lesson that must come before `id`, following the chain backwards
   (a depth-first walk through the dependency graph). */
function allPrereqs(id) {
  const seen = new Set();
  (function walk(current) {
    LESSON_BY_ID[current].prereqs.forEach(p => {
      if (!seen.has(p)) { seen.add(p); walk(p); }
    });
  })(id);
  return [...seen].sort((a, b) => a - b);
}

/* The reading labs and terminal quizzes a student must have completed. */
function requiredItems(id) {
  return allPrereqs(id).flatMap(pid => [
    { key: labKey(pid), label: itemLabel(labKey(pid)), lesson: pid },
    { key: terminalKey(pid), label: itemLabel(terminalKey(pid)), lesson: pid }
  ]);
}
