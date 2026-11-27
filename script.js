"use strict";

const SESSION_PREFIX = "ultiReviewerSessionV1:";
const LEGACY_STORAGE_KEY = "ccnaEnsaReviewerSessionV1";
const SOUND_KEY = "ccnaEnsaReviewerSoundV1";

const app = {
  courses: [],
  activeCourse: null,
  questions: [],
  byId: new Map(),
  selectedMode: "all",
  quizType: "all",
  allShuffle: false,
  session: null,
  reviewContext: "bank",
  showAnswers: true,
  expandAll: false,
  soundEnabled: localStorage.getItem(SOUND_KEY) === "true"
};

const $ = (id) => document.getElementById(id);
const screens = ["loadingScreen", "subjectsScreen", "menuScreen", "quizScreen", "resultsScreen", "reviewScreen", "errorScreen"];

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  updateSoundButton();

  try {
    if (!Array.isArray(window.ULTI_COURSES) || window.ULTI_COURSES.length === 0) throw new Error("The course catalog is missing.");
    app.courses = window.ULTI_COURSES;
    renderSubjects();
    showScreen("subjectsScreen");
  } catch (error) {
    $("errorMessage").textContent = `Check course-data.js and the course question files, then try again. ${error.message}`;
    showScreen("errorScreen");
    console.error(error);
  }
}

function validateQuestionBank(data) {
  if (!Array.isArray(data) || data.length === 0) throw new Error("The question bank is empty or is not an array.");
  const ids = new Set();
  data.forEach((question, index) => {
    const label = `Question at index ${index}`;
    if (!Number.isInteger(question.id) || ids.has(question.id)) throw new Error(`${label} has a missing or duplicate numeric id.`);
    ids.add(question.id);
    if (typeof question.question !== "string" || !question.question.trim()) throw new Error(`${label} has no question text.`);
    if (!['single', 'multiple'].includes(question.type)) throw new Error(`${label} has an invalid type.`);
    if (!Array.isArray(question.options) || question.options.length < 2) throw new Error(`${label} needs at least two options.`);
    const optionIds = new Set(question.options.map((option) => option.id));
    if (optionIds.size !== question.options.length) throw new Error(`${label} has duplicate option ids.`);
    if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length === 0) throw new Error(`${label} has no correct answer.`);
    if (question.correctAnswers.some((id) => !optionIds.has(id))) throw new Error(`${label} references a missing correct option.`);
    if (question.type === "single" && question.correctAnswers.length !== 1) throw new Error(`${label} is single-answer but has multiple correct ids.`);
  });
}

function bindEvents() {
  $("homeButton").addEventListener("click", showSubjects);
  $("changeSubjectButton").addEventListener("click", showSubjects);
  $("soundButton").addEventListener("click", toggleSound);
  $("startButton").addEventListener("click", startQuiz);
  $("continueButton").addEventListener("click", continueQuiz);
  $("resetButton").addEventListener("click", resetSavedProgress);
  $("bankButton").addEventListener("click", () => openReview("bank"));
  $("exitQuizButton").addEventListener("click", exitQuiz);
  $("answerForm").addEventListener("submit", submitAnswer);
  $("nextButton").addEventListener("click", nextQuestion);
  $("resultsHomeButton").addEventListener("click", returnHome);
  $("reviewAllButton").addEventListener("click", () => openReview("session"));
  $("reviewMistakesButton").addEventListener("click", () => openReview("mistakes"));
  $("retryButton").addEventListener("click", retryQuiz);
  $("reviewBackButton").addEventListener("click", closeReview);
  $("reviewSearch").addEventListener("input", renderReviewList);
  $("reviewFilter").addEventListener("change", renderReviewList);
  $("numberFilter").addEventListener("input", renderReviewList);
  $("answerToggle").addEventListener("click", toggleReviewAnswers);
  $("expandButton").addEventListener("click", toggleExpandAll);
  document.addEventListener("keydown", handleKeyboard);
}

function showScreen(screenId) {
  screens.forEach((id) => $(id).classList.toggle("hidden", id !== screenId));
  $("app").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSubjects() {
  const totalQuestions = app.courses.reduce((total, course) => total + course.questions.length, 0);
  $("subjectSummary").textContent = `${app.courses.length} subjects • ${totalQuestions} available questions`;
  $("subjectGrid").innerHTML = app.courses.map((course) => {
    const saved = readStoredSession(course.id);
    const progress = saved ? saved.completed ? "Last quiz completed" : `Saved quiz: ${saved.currentIndex + 1}/${saved.order.length}` : "";
    return `<button class="subject-card" type="button" data-course-id="${escapeHtml(course.id)}" style="--subject-accent:${escapeHtml(course.accent)}">
      <span class="subject-icon">${escapeHtml(course.icon)}</span>
      <span class="subject-code">${escapeHtml(course.code)}</span>
      <h2>${escapeHtml(course.name)}</h2>
      <span class="subject-subtitle">${escapeHtml(course.subtitle)}</span>
      <p>${escapeHtml(course.description)}</p>
      ${course.note ? `<span class="subject-note">${escapeHtml(course.note)}</span>` : ""}
      ${progress ? `<span class="subject-progress">${escapeHtml(progress)}</span>` : ""}
      <span class="subject-card-footer"><span class="subject-count">${course.questions.length} questions</span><span class="subject-arrow">→</span></span>
    </button>`;
  }).join("");
  document.querySelectorAll(".subject-card").forEach((card) => card.addEventListener("click", () => selectCourse(card.dataset.courseId)));
}

async function selectCourse(courseId) {
  const course = app.courses.find((item) => item.id === courseId);
  if (!course) return;
  showScreen("loadingScreen");
  try {
    const data = await loadCourseQuestions(course);
    const prepared = data.map((question) => ({ ...question, category: question.category || networkCategory(question.id) }));
    validateQuestionBank(prepared);
    app.activeCourse = course;
    app.questions = prepared;
    app.byId = new Map(prepared.map((question) => [question.id, question]));
    app.quizType = "all";
    app.selectedMode = String(course.modes[0]);
    app.session = loadSession();
    document.title = `${course.code} ${course.name} • ULTI REVIEWER`;
    renderMenu();
    showScreen("menuScreen");
  } catch (error) {
    $("errorMessage").textContent = `Could not load ${course.code}. ${error.message}`;
    showScreen("errorScreen");
    console.error(error);
  }
}

async function loadCourseQuestions(course) {
  if (location.protocol !== "file:") {
    try {
      const response = await fetch(course.jsonPath, { cache: "no-store" });
      if (!response.ok) throw new Error(`The server returned ${response.status}.`);
      return await response.json();
    } catch (error) {
      if (!Array.isArray(course.questions)) throw error;
    }
  }
  if (!Array.isArray(course.questions)) throw new Error("No local fallback question bank is available.");
  return course.questions;
}

function networkCategory(id) {
  if (id <= 10) return "Routing and OSPF";
  if (id <= 20) return "Gateway and LAN Security";
  if (id <= 27) return "Access Control Lists";
  if (id <= 35) return "VPN and Wireless";
  if (id <= 46) return "QoS and Network Services";
  return "Automation and APIs";
}

function showSubjects() {
  if (app.session && !app.session.completed) saveSession();
  document.title = "ULTI REVIEWER";
  renderSubjects();
  showScreen("subjectsScreen");
}

function availableQuestions() {
  return app.quizType === "all" ? app.questions : app.questions.filter((question) => question.category === app.quizType);
}

function renderMenu() {
  const pool = availableQuestions();
  const course = app.activeCourse;
  $("courseBreadcrumb").textContent = `${course.code} • ${course.name}`;
  $("courseEyebrow").textContent = `${course.subtitle} • No timer`;
  $("courseCodeTitle").textContent = course.code;
  $("courseNameTitle").textContent = course.name;
  $("courseSubtitle").textContent = course.description;
  $("bankCardTitle").textContent = `${course.code} Question Bank`;
  $("questionCount").textContent = pool.length;

  const categories = [...new Set(app.questions.map((question) => question.category))];
  $("quizTypeSelect").innerHTML = `<option value="all">Mixed Practice • All Topics</option>` + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  $("quizTypeSelect").value = app.quizType;
  $("quizTypeSelect").onchange = (event) => {
    app.quizType = event.target.value;
    const newPool = availableQuestions();
    if (app.selectedMode !== "all" && newPool.length < Number(app.selectedMode)) app.selectedMode = "all";
    renderMenu();
  };

  const modes = course.modes.map((mode) => mode === "all"
    ? { id: "all", icon: "∞", title: "All in Quiz Type", text: `Use all ${pool.length} questions in this quiz type.`, required: 1 }
    : { id: String(mode), icon: String(mode), title: `${mode} Questions`, text: mode <= 10 ? "A focused quick review." : mode <= 20 ? "A standard practice session." : "A full-length randomized challenge.", required: mode });

  $("modeGrid").innerHTML = modes.map((mode) => {
    const disabled = pool.length < mode.required;
    const message = disabled ? `Only ${pool.length} questions are available in this quiz type; ${mode.required} are required.` : mode.text;
    return `<button class="mode-card ${app.selectedMode === mode.id ? "selected" : ""}" type="button" data-mode="${mode.id}" ${disabled ? "disabled" : ""} aria-pressed="${app.selectedMode === mode.id}">
      <span class="mode-icon">${mode.icon}</span><span class="check">✓</span>
      <h2>${mode.title}</h2><p>${escapeHtml(message)}</p>
    </button>`;
  }).join("") + `<div class="all-order ${app.selectedMode === "all" ? "" : "hidden"}">
    <span><strong>All Questions order</strong><small>Keep bank order or mix the whole set.</small></span>
    <label><input id="allShuffle" type="checkbox" ${app.allShuffle ? "checked" : ""}> Shuffle all questions</label>
  </div>`;

  document.querySelectorAll(".mode-card").forEach((card) => card.addEventListener("click", () => {
    app.selectedMode = card.dataset.mode;
    renderMenu();
  }));
  $("allShuffle")?.addEventListener("change", (event) => { app.allShuffle = event.target.checked; });

  const hasSession = Boolean(app.session && Array.isArray(app.session.order) && app.session.order.length);
  $("continueButton").classList.toggle("hidden", !hasSession);
  $("resetButton").classList.toggle("hidden", !hasSession);
  if (hasSession) $("continueButton").textContent = app.session.completed ? "View Last Results" : `Continue Previous Quiz (${app.session.currentIndex + 1}/${app.session.order.length})`;
}

function startQuiz() {
  const pool = availableQuestions();
  const count = app.selectedMode === "all" ? pool.length : Number(app.selectedMode);
  if (pool.length < count) return;
  if (app.session && !app.session.completed && !confirm("Start a new quiz and replace the saved session?")) return;

  let ids = pool.map((question) => question.id);
  if (app.selectedMode !== "all") ids = shuffle(ids).slice(0, count);
  else if (app.allShuffle) ids = shuffle(ids);

  const optionOrders = {};
  ids.forEach((id) => { optionOrders[id] = shuffle(app.byId.get(id).options.map((option) => option.id)); });
  app.session = {
    version: 1,
    courseId: app.activeCourse.id,
    category: app.quizType,
    mode: app.selectedMode,
    allShuffle: app.allShuffle,
    order: ids,
    optionOrders,
    currentIndex: 0,
    currentStreak: 0,
    bestStreak: 0,
    firstTryCorrect: 0,
    secondTryCorrect: 0,
    incorrectAfterTwo: 0,
    records: {},
    selections: {},
    completed: false,
    startedAt: new Date().toISOString()
  };
  saveSession();
  showScreen("quizScreen");
  renderQuestion();
}

function continueQuiz() {
  if (!app.session) return;
  if (app.session.completed) renderResults();
  else {
    showScreen("quizScreen");
    renderQuestion();
  }
}

function loadSession() {
  const storageKey = `${SESSION_PREFIX}${app.activeCourse.id}`;
  try {
    let saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved && app.activeCourse.id === "it0103") {
      saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
      if (saved) {
        saved.courseId = "it0103";
        localStorage.setItem(storageKey, JSON.stringify(saved));
      }
    }
    if (!saved || saved.version !== 1 || !Array.isArray(saved.order)) return null;
    if (saved.order.some((id) => !app.byId.has(id))) return null;
    saved.records ||= {};
    saved.selections ||= {};
    saved.optionOrders ||= {};
    return saved;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

function saveSession() {
  if (app.session && app.activeCourse) localStorage.setItem(`${SESSION_PREFIX}${app.activeCourse.id}`, JSON.stringify(app.session));
}

function readStoredSession(courseId) {
  try {
    return JSON.parse(localStorage.getItem(`${SESSION_PREFIX}${courseId}`));
  } catch {
    return null;
  }
}

function resetSavedProgress() {
  if (!confirm("Delete the saved quiz and all its progress?")) return;
  localStorage.removeItem(`${SESSION_PREFIX}${app.activeCourse.id}`);
  app.session = null;
  renderMenu();
}

function currentQuestion() {
  return app.byId.get(app.session.order[app.session.currentIndex]);
}

function currentRecord(create = true) {
  const id = currentQuestion().id;
  if (!app.session.records[id] && create) app.session.records[id] = { attempts: [], status: null, confirmed: false };
  return app.session.records[id];
}

function renderQuestion() {
  const question = currentQuestion();
  const record = currentRecord();
  const current = app.session.currentIndex + 1;
  const total = app.session.order.length;
  const selected = app.session.selections[question.id] || [];
  const required = question.correctAnswers.length;

  const sessionType = app.session.category === "all" ? "Mixed Practice" : app.session.category;
  const sessionLength = app.session.mode === "all" ? "All Questions" : `${app.session.mode}-Question Quiz`;
  $("quizModeLabel").textContent = `${app.activeCourse.code} • ${sessionType} • ${sessionLength}`;
  $("questionPosition").textContent = `Question ${current} of ${total}`;
  $("progressBar").style.width = `${((current - 1) / total) * 100}%`;
  $("currentStreak").textContent = `${app.session.currentStreak} 🔥`;
  $("bestStreak").textContent = `${app.session.bestStreak} 🏆`;
  $("firstTryCount").textContent = app.session.firstTryCorrect;
  $("incorrectFirstCount").textContent = countIncorrectFirstAttempts();
  $("questionTypeBadge").textContent = question.type === "multiple" ? `Choose ${required} answers` : "Single answer";
  $("attemptBadge").textContent = record.attempts.length >= 2 && !record.confirmed ? "Correct confirmation required" : record.confirmed ? "Completed" : `Attempt ${record.attempts.length + 1} of 2`;
  $("questionText").textContent = question.question;
  $("selectionHelp").classList.toggle("hidden", question.type !== "multiple");
  $("selectionHelp").textContent = question.type === "multiple" ? `Select exactly ${required} answers before submitting.` : "";
  $("questionImage").classList.toggle("hidden", !question.image);
  if (question.image) $("questionImage").src = question.image;

  const order = app.session.optionOrders[question.id] || question.options.map((option) => option.id);
  $("optionsList").innerHTML = order.map((optionId, index) => {
    const option = question.options.find((item) => item.id === optionId);
    const classes = optionClasses(option.id, question, record, selected);
    const inputType = question.type === "multiple" ? "checkbox" : "radio";
    return `<label class="option ${question.type === "multiple" ? "multiple" : ""} ${classes}" data-option-id="${escapeHtml(option.id)}">
      <input type="${inputType}" name="answer" value="${escapeHtml(option.id)}" ${selected.includes(option.id) ? "checked" : ""} ${record.confirmed ? "disabled" : ""}>
      <span class="option-key">${index + 1}</span><span class="option-text">${escapeHtml(option.text)}</span><span class="option-indicator" aria-hidden="true"></span>
    </label>`;
  }).join("");

  $("optionsList").querySelectorAll("input").forEach((input) => input.addEventListener("change", updateSelection));
  $("feedback").className = "feedback hidden";
  $("feedback").innerHTML = "";
  $("submitButton").classList.toggle("hidden", record.confirmed);
  $("nextButton").classList.toggle("hidden", !record.confirmed);
  $("nextButton").textContent = current === total ? "View Results →" : "Next Question →";

  if (record.confirmed) showCompletionFeedback(question, record);
  else if (record.attempts.length === 2) showRevealFeedback(question);
  else if (record.attempts.length === 1) showFeedback("incorrect", "Incorrect! You have one more chance.", "Try a different answer. The correct answer has not been revealed.");
}

function optionClasses(optionId, question, record, selected) {
  const classes = [];
  if (selected.includes(optionId)) classes.push("selected");
  if (record.confirmed || record.attempts.length >= 2) {
    if (question.correctAnswers.includes(optionId)) classes.push("correct");
    const wrongAttempts = record.attempts.flat().filter((id) => !question.correctAnswers.includes(id));
    if (wrongAttempts.includes(optionId)) classes.push("incorrect");
  } else if (record.attempts.length === 1 && record.attempts[0].includes(optionId)) {
    classes.push("incorrect");
  }
  if (record.confirmed) classes.push("locked");
  return classes.join(" ");
}

function updateSelection() {
  const question = currentQuestion();
  app.session.selections[question.id] = [...$("optionsList").querySelectorAll("input:checked")].map((input) => input.value);
  saveSession();
  renderOptionSelectionOnly();
}

function renderOptionSelectionOnly() {
  const question = currentQuestion();
  const record = currentRecord();
  const selected = app.session.selections[question.id] || [];
  $("optionsList").querySelectorAll(".option").forEach((label) => {
    ["selected", "correct", "incorrect", "locked"].forEach((name) => label.classList.remove(name));
    optionClasses(label.dataset.optionId, question, record, selected).split(" ").filter(Boolean).forEach((name) => label.classList.add(name));
  });
}

function submitAnswer(event) {
  event.preventDefault();
  const question = currentQuestion();
  const record = currentRecord();
  const selected = sortedUnique(app.session.selections[question.id] || []);
  const correct = sortedUnique(question.correctAnswers);

  if (selected.length === 0) {
    showFeedback("info", "Choose an answer first.", question.type === "multiple" ? `Select ${correct.length} choices before submitting.` : "Select one choice before submitting.");
    return;
  }
  const isCorrect = arraysEqual(selected, correct);
  if (record.attempts.length >= 2) {
    if (!isCorrect) {
      showFeedback("incorrect", "That is not the revealed correct combination.", "Select the green answer choice or choices, then submit again to confirm.");
      playTone(false);
      return;
    }
    record.confirmed = true;
    saveSession();
    playTone(true);
    renderQuestion();
    return;
  }

  record.attempts.push([...selected]);
  if (isCorrect) {
    if (record.attempts.length === 1) {
      record.status = "first";
      app.session.firstTryCorrect += 1;
      app.session.currentStreak += 1;
      app.session.bestStreak = Math.max(app.session.bestStreak, app.session.currentStreak);
      if (app.session.currentStreak > 0 && app.session.currentStreak % 5 === 0) showStreakToast(app.session.currentStreak);
    } else {
      record.status = "second";
      app.session.secondTryCorrect += 1;
    }
    record.confirmed = true;
    playTone(true);
  } else {
    if (record.attempts.length === 1) {
      app.session.currentStreak = 0;
    } else {
      record.status = "missed";
      app.session.incorrectAfterTwo += 1;
    }
    app.session.selections[question.id] = [];
    playTone(false);
  }
  saveSession();
  renderQuestion();
}

function showCompletionFeedback(question, record) {
  if (record.status === "first") showFeedback("correct", "Correct Answer!", question.explanation);
  else if (record.status === "second") showFeedback("correct", "Correct! You got it on your second try.", question.explanation);
  else showFeedback("info", "Correct answer confirmed. You can continue.", question.explanation);
}

function showRevealFeedback(question) {
  const answerText = answerLabels(question, question.correctAnswers);
  showFeedback("info", `The correct answer is ${answerText}.`, `Select the green answer${question.correctAnswers.length > 1 ? "s" : ""} and submit once more to confirm. This confirmation will not count toward your score.${question.explanation ? `<br><br>${escapeHtml(question.explanation)}` : ""}`);
}

function showFeedback(type, title, detail = "") {
  $("feedback").className = `feedback ${type}`;
  $("feedback").innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<p>${detail.startsWith("Select the green") ? detail : escapeHtml(detail)}</p>` : ""}`;
}

function nextQuestion() {
  const record = currentRecord();
  if (!record.confirmed) return;
  if (app.session.currentIndex >= app.session.order.length - 1) {
    app.session.completed = true;
    app.session.completedAt = new Date().toISOString();
    saveSession();
    renderResults();
    return;
  }
  $("questionCard").classList.add("transitioning");
  setTimeout(() => {
    app.session.currentIndex += 1;
    saveSession();
    renderQuestion();
    $("questionCard").classList.remove("transitioning");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 160);
}

function renderResults() {
  if (!app.session) returnHome();
  const total = app.session.order.length;
  const accuracy = total ? Math.round((app.session.firstTryCorrect / total) * 100) : 0;
  $("accuracyText").textContent = `${accuracy}%`;
  $("scorePercent").textContent = `${accuracy}%`;
  $("scoreRing").style.setProperty("--score", accuracy);
  $("resultTotal").textContent = total;
  $("resultFirst").textContent = app.session.firstTryCorrect;
  $("resultSecond").textContent = app.session.secondTryCorrect;
  $("resultMissed").textContent = app.session.incorrectAfterTwo;
  $("resultStreak").textContent = app.session.bestStreak;
  $("breakdownBar").innerHTML = [
    [app.session.firstTryCorrect, "Correct on first try"],
    [app.session.secondTryCorrect, "Correct on second try"],
    [app.session.incorrectAfterTwo, "Incorrect after two tries"]
  ].map(([count, label]) => `<span style="width:${(count / total) * 100}%" title="${label}: ${count}"></span>`).join("");
  showScreen("resultsScreen");
}

function retryQuiz() {
  if (!confirm("Retry this quiz with the same questions in a new random order?")) return;
  app.selectedMode = app.session.mode;
  const oldIds = [...app.session.order];
  const mode = app.session.mode;
  const category = app.session.category || "all";
  const optionOrders = {};
  const ids = shuffle(oldIds);
  ids.forEach((id) => { optionOrders[id] = shuffle(app.byId.get(id).options.map((option) => option.id)); });
  app.session = {
    version: 1, courseId: app.activeCourse.id, category, mode, allShuffle: true, order: ids, optionOrders, currentIndex: 0,
    currentStreak: 0, bestStreak: 0, firstTryCorrect: 0, secondTryCorrect: 0,
    incorrectAfterTwo: 0, records: {}, selections: {}, completed: false, startedAt: new Date().toISOString()
  };
  saveSession();
  showScreen("quizScreen");
  renderQuestion();
}

function exitQuiz() {
  saveSession();
  renderMenu();
  showScreen("menuScreen");
}

function returnHome() {
  if (!app.activeCourse) return showSubjects();
  if (!$("quizScreen").classList.contains("hidden") && app.session && !app.session.completed) saveSession();
  renderMenu();
  showScreen("menuScreen");
}

function openReview(context) {
  if (context !== "bank" && !app.session?.completed) return;
  app.reviewContext = context;
  app.showAnswers = true;
  app.expandAll = false;
  $("reviewSearch").value = "";
  $("numberFilter").value = "";
  $("numberFilter").classList.toggle("hidden", context !== "bank");
  $("reviewEyebrow").textContent = context === "bank" ? `${app.activeCourse.code} • Study mode • no score changes` : `${app.activeCourse.code} • Completed session`;
  $("reviewTitle").textContent = context === "bank" ? `${app.activeCourse.name} Question Bank` : context === "mistakes" ? "Review Mistakes" : "Review All Answers";
  $("answerToggle").textContent = "Hide Answers";
  $("expandButton").textContent = "Expand All";

  if (context === "bank") {
    const categories = [...new Set(app.questions.map((question) => question.category))];
    $("reviewFilter").innerHTML = `<option value="all">All questions</option>` + categories.map((category) => `<option value="category:${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("") + `<option value="single">Single answer</option><option value="multiple">Multiple answer</option><option value="image">Image questions</option>`;
  } else {
    $("reviewFilter").innerHTML = `<option value="all">All results</option><option value="first">First-try correct</option><option value="second">Second-try correct</option><option value="missed">Incorrect after two tries</option>`;
  }
  showScreen("reviewScreen");
  renderReviewList();
}

function closeReview() {
  if (app.reviewContext === "bank") returnHome();
  else renderResults();
}

function renderReviewList() {
  const search = $("reviewSearch").value.trim().toLowerCase();
  const filter = $("reviewFilter").value;
  const requestedNumber = Number($("numberFilter").value);
  let entries;

  if (app.reviewContext === "bank") {
    entries = app.questions.map((question, index) => ({ question, displayNumber: index + 1, record: null }));
    if (filter.startsWith("category:")) entries = entries.filter((entry) => entry.question.category === filter.slice(9));
    if (filter === "single" || filter === "multiple") entries = entries.filter((entry) => entry.question.type === filter);
    if (filter === "image") entries = entries.filter((entry) => Boolean(entry.question.image));
    if (requestedNumber) entries = entries.filter((entry) => entry.displayNumber === requestedNumber);
  } else {
    entries = app.session.order.map((id, index) => ({ question: app.byId.get(id), displayNumber: index + 1, record: app.session.records[id] }));
    if (app.reviewContext === "mistakes") entries = entries.filter((entry) => entry.record?.status !== "first");
    if (filter !== "all") entries = entries.filter((entry) => entry.record?.status === filter);
  }
  if (search) entries = entries.filter(({ question }) => `${question.question} ${question.options.map((option) => option.text).join(" ")} ${question.explanation}`.toLowerCase().includes(search));

  $("reviewCount").textContent = `Showing ${entries.length} of ${app.reviewContext === "bank" ? app.questions.length : app.session.order.length} questions`;
  $("reviewList").classList.toggle("answers-hidden", !app.showAnswers);
  $("reviewList").innerHTML = entries.map(renderReviewItem).join("");
  $("emptyReview").classList.toggle("hidden", entries.length !== 0);
}

function renderReviewItem({ question, displayNumber, record }) {
  const result = record?.status || "bank";
  const resultText = { first: "First-try correct", second: "Second-try correct", missed: "Incorrect after two", bank: question.type === "multiple" ? "Multiple answer" : "Single answer" }[result];
  const attempts = record?.attempts || [];
  const wrongIds = attempts.flat().filter((id) => !question.correctAnswers.includes(id));
  const image = question.image ? `<img class="question-image" src="${escapeHtml(question.image)}" alt="Diagram for question ${displayNumber}">` : "";
  const options = question.options.map((option) => {
    const classes = [question.correctAnswers.includes(option.id) ? "correct" : "", wrongIds.includes(option.id) ? "wrong-choice" : ""].filter(Boolean).join(" ");
    const check = question.correctAnswers.includes(option.id) ? " ✓" : "";
    return `<div class="review-option ${classes}"><strong>${escapeHtml(option.id)}.</strong> ${escapeHtml(option.text)}${check}</div>`;
  }).join("");
  let attemptDetails = "";
  if (record) {
    attemptDetails = `<div class="answer-details">
      <div><strong>Correct answer:</strong> ${escapeHtml(answerLabels(question, question.correctAnswers))}</div>
      <div><strong>Your first answer:</strong> ${escapeHtml(attempts[0]?.length ? answerLabels(question, attempts[0]) : "Not submitted")}</div>
      ${attempts[1] ? `<div><strong>Your second answer:</strong> ${escapeHtml(answerLabels(question, attempts[1]))}</div>` : ""}
      <div><strong>Result:</strong> ${escapeHtml(resultText)}</div>
    </div>`;
  } else {
    attemptDetails = `<div class="answer-details"><div><strong>Correct answer:</strong> ${escapeHtml(answerLabels(question, question.correctAnswers))}</div></div>`;
  }
  return `<details class="review-item" ${app.expandAll ? "open" : ""}>
    <summary><span class="review-number">${displayNumber}</span><span class="review-summary-question">${escapeHtml(question.question)}</span><span class="result-pill ${result}">${resultText}</span></summary>
    <div class="review-body">${image}<div class="review-options">${options}</div>${attemptDetails}
      ${question.explanation ? `<div class="explanation"><strong>Explanation:</strong><br>${escapeHtml(question.explanation)}</div>` : ""}
      <div class="source-note">Source: ${escapeHtml(question.source || "Not specified")}</div>
    </div>
  </details>`;
}

function toggleReviewAnswers() {
  app.showAnswers = !app.showAnswers;
  $("answerToggle").textContent = app.showAnswers ? "Hide Answers" : "Show Answers";
  $("reviewList").classList.toggle("answers-hidden", !app.showAnswers);
}

function toggleExpandAll() {
  app.expandAll = !app.expandAll;
  $("expandButton").textContent = app.expandAll ? "Collapse All" : "Expand All";
  document.querySelectorAll(".review-item").forEach((item) => { item.open = app.expandAll; });
}

function answerLabels(question, ids) {
  return ids.map((id) => {
    const option = question.options.find((item) => item.id === id);
    return option ? `${option.id}. ${option.text}` : id;
  }).join("; ");
}

function countIncorrectFirstAttempts() {
  return Object.values(app.session.records).filter((record) => record.attempts?.[0] && record.status !== "first").length;
}

function handleKeyboard(event) {
  if ($("quizScreen").classList.contains("hidden")) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  if (/^[1-6]$/.test(event.key)) {
    const inputs = [...$("optionsList").querySelectorAll("input:not(:disabled)")];
    const input = inputs[Number(event.key) - 1];
    if (input) {
      event.preventDefault();
      if (input.type === "radio") input.checked = true;
      else input.checked = !input.checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (!$("nextButton").classList.contains("hidden")) nextQuestion();
    else $("answerForm").requestSubmit();
  }
}

function showStreakToast(streak) {
  $("streakToast").textContent = `🔥 ${streak}-answer streak! Great work!`;
  $("streakToast").classList.remove("hidden");
  setTimeout(() => $("streakToast").classList.add("hidden"), 2400);
}

function toggleSound() {
  app.soundEnabled = !app.soundEnabled;
  localStorage.setItem(SOUND_KEY, String(app.soundEnabled));
  updateSoundButton();
}

function updateSoundButton() {
  $("soundButton").classList.toggle("active", app.soundEnabled);
  $("soundButton").textContent = app.soundEnabled ? "♫" : "♪";
  $("soundButton").title = app.soundEnabled ? "Feedback sounds on" : "Feedback sounds off";
}

function playTone(correct) {
  if (!app.soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = correct ? 620 : 190;
  oscillator.type = correct ? "sine" : "triangle";
  gain.gain.setValueAtTime(.07, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .18);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + .18);
  oscillator.addEventListener("ended", () => context.close());
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function sortedUnique(items) {
  return [...new Set(items)].sort();
}

function arraysEqual(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}
