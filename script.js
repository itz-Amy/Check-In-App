/* Shared helpers ---------------------------------------------------- */
const STORE_KEY = "webtech-checkin-v2";
const CODE_KEY = "webtech-class-code";
const THEME_KEY = "webtech-theme";

const $ = (selector, root = document) => root.querySelector(selector);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  children.forEach(child => node.append(child));
  return node;
}

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}

function saveEntries(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; }
  catch { return false; }
}

/* The faculty code. Faculty generates it on the dashboard; students need it to check in. */
function getClassCode() {
  try { return localStorage.getItem(CODE_KEY) || ""; }
  catch { return ""; }
}

function setClassCode(code) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
    return true;
  } catch { return false; }
}

function normalizeCode(text) {
  return String(text).toUpperCase().replace(/[\s-]/g, "");
}

/* Six characters from an alphabet without look-alikes (no 0/O, 1/I). 32 symbols divide 256 evenly. */
function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(b => alphabet[b % alphabet.length]).join("");
}

function countVotes(entries) {
  const votes = {};
  entries.forEach(e => { if (e.discussion) votes[e.discussion] = (votes[e.discussion] || 0) + 1; });
  return votes;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch { /* storage blocked */ }
  if (!theme) theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;

  const button = $("#theme");
  if (!button) return;
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  });
}

/* Page 1: check-in -------------------------------------------------- */
function initCheckin() {
  const form = $("#checkin-form");
  const nameInput = $("#name");
  const codeInput = $("#code");
  const lessonSelect = $("#lesson");
  const scoreBox = $("#scores");
  const classBox = $("#classquizzes");
  const classCount = $("#class-count");
  const discBox = $("#discussion");
  const prereqBox = $("#prereqs");
  const statusBox = $("#status");
  const errorBox = $("#error");
  const notice = $("#notice");
  const done = $("#done");

  $(".pass-note").textContent = PASS_MARK + "% or more counts as a pass.";
  $(".max-note").textContent = MAX_CLASS_QUIZZES;

  // Everything the student has entered that other sections depend on.
  const state = { raw: {}, picks: new Set(), discussion: null };

  const todayId = () => Number(lessonSelect.value) || 0;

  /* null = not entered, NaN = not a number from 0 to 100, otherwise the score. */
  function scoreOf(id) {
    const raw = state.raw[id];
    if (raw === undefined || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
  }
  const hasWritten = id => { const s = scoreOf(id); return s !== null && !Number.isNaN(s); };
  const hasPassed = id => hasWritten(id) && scoreOf(id) >= PASS_MARK;

  function badgeFor(id) {
    const s = scoreOf(id);
    if (s === null) return ["Not written", ""];
    if (Number.isNaN(s)) return ["Enter 0–100", " warn"];
    return s >= PASS_MARK ? ["Passed", " ok"] : ["Below " + PASS_MARK + "%", " warn"];
  }

  /* Drops choices that stopped being allowed (e.g. a score was cleared or the lesson changed). */
  function reconcile() {
    const today = todayId();
    [...state.picks].forEach(key => {
      const id = lessonOf(key);
      if (id > today || (key.startsWith("terminal-") && !hasWritten(id))) state.picks.delete(key);
    });
    if (state.discussion) {
      const id = lessonOf(state.discussion);
      if (id > today || !hasPassed(id)) state.discussion = null;
    }
  }

  /* Section 2: reading quiz scores */
  function renderScores() {
    scoreBox.replaceChildren();
    const today = todayId();
    if (!today) {
      scoreBox.append(el("p", { className: "hint", textContent: "Pick today's lesson first to see your reading quizzes." }));
      return;
    }
    LESSONS.filter(l => l.id <= today).forEach(l => {
      const input = el("input", {
        type: "number", id: "score-" + l.id, className: "score-input",
        min: 0, max: 100, step: "any", inputMode: "decimal", placeholder: "Score %",
        value: state.raw[l.id] === undefined ? "" : state.raw[l.id]
      });
      input.dataset.lesson = l.id;
      input.setAttribute("aria-label", itemLabel(readingKey(l.id)) + " score in percent");
      const [text, cls] = badgeFor(l.id);
      scoreBox.append(el("div", { className: "score-row" },
        el("label", { htmlFor: "score-" + l.id, className: "row-name", textContent: lessonName(l.id) }),
        input,
        el("span", { className: "pill" + cls, textContent: text })
      ));
    });
  }

  /* Section 3: quizzes to do in class (at most MAX_CLASS_QUIZZES) */
  function refreshClassBoxes() {
    const full = state.picks.size >= MAX_CLASS_QUIZZES;
    classBox.querySelectorAll('input[name="classquiz"]').forEach(box => {
      const locked = box.value.startsWith("terminal-") && !hasWritten(lessonOf(box.value));
      box.disabled = locked || (!box.checked && full);
    });
    classCount.textContent = state.picks.size + " of " + MAX_CLASS_QUIZZES + " selected";
    classCount.className = "pill" + (full ? " ok" : "");
  }

  function renderClassQuizzes() {
    classBox.replaceChildren();
    const today = todayId();
    if (!today) {
      classBox.append(el("p", { className: "hint", textContent: "Pick today's lesson first to see the quizzes." }));
      classCount.textContent = "";
      return;
    }
    LESSONS.filter(l => l.id <= today).forEach(l => {
      const chip = (key, text, locked) => {
        const box = el("input", { type: "checkbox", name: "classquiz", value: key, checked: state.picks.has(key) });
        const label = el("label", { className: "chip" + (locked ? " locked" : "") }, box, text);
        if (locked) label.title = "Enter your " + itemLabel(readingKey(l.id)) + " score first";
        return label;
      };
      classBox.append(el("div", { className: "qrow" },
        el("span", { className: "row-name", textContent: lessonName(l.id) }),
        chip(readingKey(l.id), "Reading quiz", false),
        chip(terminalKey(l.id), hasWritten(l.id) ? "Terminal quiz" : "Terminal quiz · locked", !hasWritten(l.id))
      ));
    });
    refreshClassBoxes();
  }

  /* Section 4: discussion vote, only for reading quizzes the student passed */
  function renderDiscussion() {
    discBox.replaceChildren();
    const today = todayId();
    if (!today) {
      discBox.append(el("p", { className: "hint", textContent: "Pick today's lesson first." }));
      return;
    }
    const eligible = LESSONS.filter(l => l.id <= today && hasPassed(l.id));
    if (eligible.length === 0) {
      discBox.append(el("p", { className: "hint", textContent: "Enter a reading quiz score of " + PASS_MARK + "% or more above to unlock the vote." }));
      return;
    }
    const votes = countVotes(loadEntries());
    const choices = el("div", { className: "choices" });
    eligible.forEach(l => {
      const key = readingKey(l.id);
      choices.append(el("label", { className: "choice" },
        el("input", { type: "radio", name: "discussion", value: key, checked: state.discussion === key }),
        el("span", { className: "choice-text", textContent: itemLabel(key) + " · " + lessonName(l.id).replace(/^Lesson \d+:\s*/, "") }),
        el("span", { className: "pill ok", textContent: "Score " + scoreOf(l.id) + "%" }),
        el("span", { className: "pill", textContent: plural(votes[key] || 0, "vote") })
      ));
    });
    const clear = el("button", { type: "button", className: "ghost small", textContent: "Clear my vote" });
    clear.addEventListener("click", () => { state.discussion = null; renderDiscussion(); });
    discBox.append(choices, el("div", { className: "tools" }, clear));
  }

  /* Section 5: prerequisites */
  function setAllPrereqs(checked) {
    form.querySelectorAll('input[name="prereq"]').forEach(box => { box.checked = checked; });
    updateStatus();
  }

  function renderPrereqs() {
    prereqBox.replaceChildren();
    const today = todayId();
    if (!today) {
      prereqBox.append(el("p", { className: "hint", textContent: "Pick today's lesson first to see its prerequisites." }));
      updateStatus();
      return;
    }
    const items = requiredItems(today);
    if (items.length === 0) {
      prereqBox.append(el("p", { className: "hint", textContent: "This lesson has no prerequisites, so there is nothing to declare." }));
      updateStatus();
      return;
    }

    const tickAll = el("button", { type: "button", className: "ghost small", textContent: "Tick all" });
    const clearAll = el("button", { type: "button", className: "ghost small", textContent: "Clear all" });
    tickAll.addEventListener("click", () => setAllPrereqs(true));
    clearAll.addEventListener("click", () => setAllPrereqs(false));
    prereqBox.append(el("div", { className: "tools" }, tickAll, clearAll));

    allPrereqs(today).forEach(pid => {
      const group = el("div", { className: "group" }, el("h3", { textContent: lessonName(pid) }));
      const choices = el("div", { className: "choices" });
      items.filter(item => item.lesson === pid).forEach(item => {
        choices.append(el("label", { className: "choice" },
          el("input", { type: "checkbox", name: "prereq", value: item.key }),
          el("span", { className: "choice-text", textContent: item.label })
        ));
      });
      group.append(choices);
      prereqBox.append(group);
    });
    updateStatus();
  }

  /* Compares what is required for the chosen lesson with what is ticked. */
  function currentCheck() {
    const today = todayId();
    if (!today) return null;
    const ticked = new Set([...form.querySelectorAll('input[name="prereq"]:checked')].map(box => box.value));
    const missing = requiredItems(today).filter(item => !ticked.has(item.key));
    return { id: today, ticked: [...ticked], missing, ready: missing.length === 0 };
  }

  function updateStatus() {
    const check = currentCheck();
    statusBox.className = "banner";
    statusBox.replaceChildren();
    if (!check) { statusBox.classList.add("hidden"); return; }

    if (check.ready) {
      statusBox.classList.add("ok");
      statusBox.textContent = "Cleared: you've met every prerequisite for this lesson's quizzes.";
    } else {
      statusBox.classList.add("warn");
      statusBox.append(
        el("strong", { textContent: "Not ready to start quizzes. Still missing " + plural(check.missing.length, "item") + ":" }),
        el("ul", {}, ...check.missing.map(item => el("li", { textContent: item.label })))
      );
    }
  }

  function renderAll() {
    reconcile();
    renderScores();
    renderClassQuizzes();
    renderDiscussion();
    renderPrereqs();
  }

  function updateNotice() { notice.classList.toggle("hidden", getClassCode() !== ""); }

  function fail(message, field) {
    errorBox.textContent = message;
    if (field) field.focus();
  }

  function showDone(entry, replaced) {
    form.classList.add("hidden");
    done.classList.remove("hidden");
    $("#done-title").textContent = replaced ? "Check-in updated" : "You're checked in";
    $("#done-text").replaceChildren(
      el("p", { textContent: entry.name + " · " + formatTime(entry.time) + " · Lesson " + entry.lesson }),
      el("p", { textContent: "In-class quizzes: " + (entry.classQuizzes.length ? entry.classQuizzes.map(itemLabel).join(", ") : "none chosen") }),
      el("p", { textContent: "Discussion vote: " + (entry.discussion ? itemLabel(entry.discussion) : "none") }),
      el("p", { textContent: entry.ready
        ? "You're cleared to start the quizzes."
        : "You're not ready to start quizzes yet: " + plural(entry.missing.length, "prerequisite") + " missing." })
    );
  }

  /* Events */
  lessonSelect.append(new Option("Choose today's lesson…", ""));
  LESSONS.forEach(l => lessonSelect.append(new Option(lessonName(l.id), l.id)));

  lessonSelect.addEventListener("change", renderAll);

  scoreBox.addEventListener("input", event => {
    const input = event.target;
    if (!input.dataset.lesson) return;
    state.raw[input.dataset.lesson] = input.value;
    const [text, cls] = badgeFor(Number(input.dataset.lesson));
    const badge = input.parentElement.querySelector(".pill");
    badge.textContent = text;
    badge.className = "pill" + cls;
    reconcile();
    renderClassQuizzes();
    renderDiscussion();
  });

  classBox.addEventListener("change", event => {
    const box = event.target;
    if (box.name !== "classquiz") return;
    if (box.checked) state.picks.add(box.value); else state.picks.delete(box.value);
    refreshClassBoxes();
  });

  discBox.addEventListener("change", event => {
    if (event.target.name === "discussion") state.discussion = event.target.value;
  });

  prereqBox.addEventListener("change", updateStatus);
  window.addEventListener("storage", updateNotice);

  // A stale error message disappears as soon as the student changes anything.
  form.addEventListener("input", () => { errorBox.textContent = ""; });
  form.addEventListener("change", () => { errorBox.textContent = ""; });

  form.addEventListener("submit", event => {
    event.preventDefault();
    errorBox.textContent = "";

    const name = nameInput.value.trim().replace(/\s+/g, " ");
    const typedCode = normalizeCode(codeInput.value);
    const expectedCode = normalizeCode(getClassCode());
    const check = currentCheck();

    if (!name) return fail("Please enter your name.", nameInput);
    if (!typedCode) return fail("Please enter the faculty code.", codeInput);
    if (!expectedCode) return fail("Check-in isn't open yet: your faculty hasn't generated today's code.");
    if (typedCode !== expectedCode) return fail("That code isn't right. Ask your faculty for today's code.", codeInput);
    if (!check) return fail("Please choose today's lesson.", lessonSelect);

    const today = check.id;
    for (let id = 1; id <= today; id++) {
      if (Number.isNaN(scoreOf(id))) {
        return fail(itemLabel(readingKey(id)) + " score must be a number from 0 to 100.", $("#score-" + id));
      }
    }

    reconcile();
    if (state.picks.size > MAX_CLASS_QUIZZES) return fail("Choose at most " + MAX_CLASS_QUIZZES + " quizzes for class.");

    const scores = {};
    for (let id = 1; id <= today; id++) if (hasWritten(id)) scores[id] = scoreOf(id);

    const entry = {
      name,
      time: new Date().toISOString(),
      lesson: today,
      scores,
      classQuizzes: [...state.picks].sort((a, b) => lessonOf(a) - lessonOf(b) || a.localeCompare(b)),
      discussion: state.discussion,
      ticked: check.ticked,
      missing: check.missing.map(item => item.label),
      ready: check.ready
    };

    // One check-in per name: a repeat submission replaces the earlier one.
    const existing = loadEntries();
    const others = existing.filter(e => e.name.toLowerCase() !== name.toLowerCase());
    const replaced = others.length !== existing.length;
    others.push(entry);

    if (!saveEntries(others)) return fail("Couldn't save. Your browser may be blocking local storage.");
    showDone(entry, replaced);
  });

  $("#another").addEventListener("click", () => {
    form.reset();
    lessonSelect.value = "";
    state.raw = {};
    state.picks.clear();
    state.discussion = null;
    errorBox.textContent = "";
    renderAll();
    done.classList.add("hidden");
    form.classList.remove("hidden");
    nameInput.focus();
  });

  updateNotice();
  renderAll();
}

/* Page 2: dashboard ------------------------------------------------- */
function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text; // stop spreadsheet formula injection
  return '"' + text.replace(/"/g, '""') + '"';
}

function scoresText(scores) {
  return Object.entries(scores || {}).map(([id, s]) => "Lesson " + id + ": " + s + "%").join("; ");
}

function exportCsv() {
  const entries = loadEntries();
  const header = ["Name", "Time", "Lesson", "Reading quiz scores", "In-class quizzes", "Discussion vote", "Status", "Missing prerequisites"];
  const rows = entries.map(e => [
    e.name,
    new Date(e.time).toLocaleString(),
    "Lesson " + e.lesson,
    scoresText(e.scores),
    e.classQuizzes.map(itemLabel).join("; "),
    e.discussion ? itemLabel(e.discussion) : "",
    e.ready ? "Cleared" : "Not ready",
    e.missing.join("; ")
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = el("a", { href: url, download: "class-checkin.csv" });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function initDashboard() {
  function renderCode() {
    const code = getClassCode();
    $("#code").textContent = code || "Closed";
    $("#code").classList.toggle("closed", !code);
    $("#code-help").textContent = code
      ? "Check-in is open. Share this code with the class."
      : "Check-in is closed. Generate a code to let students check in.";
    $("#close-code").disabled = !code;
  }

  function render() {
    renderCode();
    const entries = loadEntries().sort((a, b) => a.time.localeCompare(b.time));
    const ready = entries.filter(e => e.ready).length;

    $("#stat-total").textContent = entries.length;
    $("#stat-ready").textContent = ready;
    $("#stat-missing").textContent = entries.length - ready;

    // Vote results
    const votes = countVotes(entries);
    const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    const bars = $("#bars");
    const winner = $("#winner");
    bars.replaceChildren();

    if (ranked.length === 0) {
      winner.textContent = "No votes yet.";
    } else {
      const top = ranked[0][1];
      const leaders = ranked.filter(([, count]) => count === top).map(([key]) => itemLabel(key));
      winner.textContent = leaders.length === 1
        ? "Discussion today: " + leaders[0] + " (" + plural(top, "vote") + ")"
        : "Tie at " + plural(top, "vote") + ": " + leaders.join(" / ");

      ranked.forEach(([key, count]) => {
        const fill = el("div", { className: "bar-fill" });
        fill.style.width = (count / top * 100) + "%";
        bars.append(el("div", { className: "bar-row" + (count === top ? " top" : "") },
          el("span", { textContent: itemLabel(key) }),
          el("div", { className: "bar-track" }, fill),
          el("span", { className: "bar-count", textContent: count })
        ));
      });
    }

    // Attendance and readiness table
    const rows = $("#rows");
    rows.replaceChildren();
    $("#empty").classList.toggle("hidden", entries.length > 0);

    entries.forEach(e => {
      const status = el("td", {}, el("span", {
        className: "pill " + (e.ready ? "ok" : "warn"),
        textContent: e.ready ? "Cleared" : "Not ready"
      }));
      if (!e.ready) {
        status.append(el("ul", { className: "missing" }, ...e.missing.map(m => el("li", { textContent: m }))));
      }
      rows.append(el("tr", {},
        el("td", { textContent: e.name }),
        el("td", { textContent: formatTime(e.time) }),
        el("td", { textContent: "Lesson " + e.lesson }),
        el("td", { textContent: e.classQuizzes.length ? e.classQuizzes.map(itemLabel).join(", ") : "—" }),
        el("td", { textContent: e.discussion ? itemLabel(e.discussion) : "—" }),
        status
      ));
    });
  }

  $("#new-code").addEventListener("click", () => { setClassCode(generateCode()); render(); });
  $("#close-code").addEventListener("click", () => { setClassCode(""); render(); });
  $("#export").addEventListener("click", exportCsv);
  $("#reset").addEventListener("click", () => {
    if (confirm("Clear every check-in and close check-in for this class session? This can't be undone.")) {
      saveEntries([]);
      setClassCode("");
      render();
    }
  });

  window.addEventListener("storage", render); // updates when another tab checks someone in
  render();
}

/* Start-up ---------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  const page = document.body.dataset.page;
  if (page === "checkin") initCheckin();
  if (page === "dashboard") initDashboard();
});
