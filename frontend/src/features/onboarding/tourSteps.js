/**
 * Guided tour content and rules (issue #254).
 *
 * Pure data and functions, no React or DOM access, so they can be unit tested
 * with `node --test` (see frontend/tests/tour-steps.test.js). The tour engine
 * (components/GuidedTour.jsx) supplies an `env` object to the step callbacks:
 *
 *   env.view          id of the visible screen ("dashboard", "projects", ...)
 *   env.visible(sel)  is an element matching the selector on screen?
 *   env.setup         effective setup flags (see setupSteps.js effectiveSetup)
 *   env.role          "admin" | "editor" | "viewer"
 *
 * Step fields:
 *   id, chapter, title, body       text shown in the popup
 *   targets                        CSS selectors; the first visible one is highlighted.
 *                                  No targets = a centred popup.
 *   group                          highlight every visible match of `targets` together
 *                                  (e.g. a file picker and the text box under it)
 *   placement                      "side" to keep the popup beside a form, not over it
 *   when(setup, role)              include the step only for this setup (decided once,
 *                                  when the tour is built, so the step count is right)
 *   view                           screen to open first (via the app's navigateTo)
 *   skip(env)                      skip this step when it returns true
 *   waitFor(env)                   an action step: moves on by itself once true
 *   advanceOnClick                 an action step: moves on when the target is clicked
 *   pollSetup                      re-read the setup flags while waiting (slow jobs)
 *   link                           optional { href, label } shown under the body
 *   nextLabel                      label for the Next button on this step
 *   ensure                         named preparation the engine runs on entry
 *                                  ("featureList": show the project's feature list)
 *
 * Only stable ids from React-owned markup (features/*, layouts/*) and the
 * compat empty-state buttons are used as targets; nothing is added to compat/.
 */

import { SAMPLE_PRD_URL, normaliseRole } from "./setupSteps.js";

/** localStorage key: the welcome prompt was answered (started, skipped or finished). */
export const TOUR_SEEN_KEY = "wq_tour_seen";

const isEditorOrAdmin = (env) => env.role === "admin" || env.role === "editor";
// Screens that need a project: editors and admins will have one by the time the
// tour gets there (the project chapter comes first); viewers need one already.
const hasProjectSoon = (env) => isEditorOrAdmin(env) || env.setup.has_project;
const notInFeature = (env) => !env.visible("#detail-card");

/** Chapters in tour order, with their title, who gets them and when. */
export const CHAPTERS = [
  { id: "llm", title: "AI model", applies: (env) => env.role === "admin" && !env.setup.llm_configured },
  { id: "project", title: "Create a project", applies: (env) => isEditorOrAdmin(env) && !env.setup.has_project },
  { id: "generate", title: "Generate test cases", applies: (env) => isEditorOrAdmin(env) && !env.setup.has_test_cases },
  { id: "results", title: "Your results", applies: (env) => isEditorOrAdmin(env) },
  { id: "cases", title: "Test Cases library", applies: hasProjectSoon },
  { id: "code", title: "Code Analysis", applies: hasProjectSoon },
  { id: "mindmap", title: "Mind Map", applies: hasProjectSoon },
  { id: "testcycles", title: "Test Cycles", applies: hasProjectSoon },
  { id: "steps", title: "Step Library", applies: hasProjectSoon },
  { id: "repo", title: "Connect a repository", applies: (env) => isEditorOrAdmin(env) && !env.setup.has_repo },
  { id: "admin", title: "Administration", applies: (env) => env.role === "admin" },
  { id: "explore", title: "Find your way around", applies: () => true },
];

const CHAPTER_TITLE = Object.fromEntries(CHAPTERS.map((c) => [c.id, c.title]));

/** Map a checklist step id to the tour chapter that shows how to do it. */
export const CHECKLIST_TO_CHAPTER = {
  llm: "llm",
  project: "project",
  repo: "repo",
  generate: "generate",
};

export const STEPS = [
  // ---- llm (admins, only while no working model) ----
  {
    id: "llm-setup",
    chapter: "llm",
    view: "config",
    targets: ["#cfg-llm-provider"],
    title: "Set up your AI model",
    body: "Choose Ollama or a hosted provider, enter a key if needed, and save. This powers test generation and analysis.",
  },

  // ---- project ----
  {
    id: "project-new",
    chapter: "project",
    view: "projects",
    targets: ["#project-cards-container .empty-state .go", "#proj-new-btn"],
    waitFor: (env) => env.visible("#proj-create-card"),
    title: "Start your first project",
    body: "Click New project. Only the project name is required; the other options can wait.",
  },
  {
    id: "project-save",
    chapter: "project",
    targets: ["#proj-create-save"],
    waitFor: (env) => env.view === "features",
    title: "Save the project",
    body: "Enter a name and click Create project. wardenIQ opens the project when it is ready.",
  },

  // ---- generate ----
  {
    id: "generate-open-project",
    chapter: "generate",
    view: "projects",
    skip: (env) => env.view === "features",
    targets: ["[data-project-card]"],
    waitFor: (env) => env.view === "features",
    title: "Open your project",
    body: "Open the project card to manage its features.",
  },
  {
    id: "generate-new-feature",
    chapter: "generate",
    when: (setup) => !setup.has_feature,
    targets: ["#feat-list .empty-state .go", "#feature-new-btn"],
    waitFor: (env) => env.visible("#feature-create-page"),
    title: "Add a feature",
    body: "Click New feature. Give it a short name and add the requirements.",
  },
  {
    id: "generate-open-feature",
    chapter: "generate",
    when: (setup) => setup.has_feature,
    targets: ["[data-feature-card]"],
    waitFor: (env) => env.visible("#detail-card"),
    title: "Open the feature",
    body: (env) =>
      env.setup.generating
        ? "Generation is already running. Open the feature to follow its progress."
        : "Open the feature to start or review generation.",
  },
  {
    id: "generate-regenerate",
    chapter: "generate",
    when: (setup) => setup.has_feature && !setup.generating,
    // #d-regen exists in the markup but the app never shows it, so the
    // new-version button (+) is the visible way to run generation again.
    targets: ["#d-regen", "#d-newver"],
    advanceOnClick: true,
    title: "Start a new version",
    body: "Click +, add the updated requirements, and generate a new test suite.",
  },
  {
    id: "generate-docs",
    chapter: "generate",
    when: (setup) => !setup.has_feature,
    targets: ["#f-file", "#f-text"],
    group: true,
    placement: "side",
    title: "Add your requirements",
    body: "Upload a document or paste the requirements. The default test mix is ready to use.",
    link: { href: SAMPLE_PRD_URL, label: "Open the sample PRD" },
  },
  {
    id: "generate-go",
    chapter: "generate",
    when: (setup) => !setup.has_feature,
    targets: ["#f-go"],
    advanceOnClick: true,
    title: "Generate test cases",
    body: "Click Generate test cases. wardenIQ creates a reusable test suite.",
  },
  {
    id: "generate-wait",
    chapter: "generate",
    targets: ["#f-status", "#f-log", "#d-genbanner"],
    group: true,
    pollSetup: true,
    waitFor: (env) => env.setup.has_test_cases,
    nextLabel: "Continue",
    title: "Generation is running",
    body: "Generation runs in the background. The tour continues when cases are ready.",
  },

  // ---- results ----
  {
    id: "results-feature",
    chapter: "results",
    view: "features",
    ensure: "featureList",
    targets: ["[data-feature-card]"],
    skip: (env) => (!env.setup.has_feature && !env.setup.has_test_cases) || env.visible("#detail-card"),
    waitFor: (env) => env.visible("#detail-card"),
    title: "Review your test cases",
    body: (env) =>
      env.setup.has_test_cases
        ? "Open the feature to see what wardenIQ generated."
        : "The case count will update when generation finishes. Open the feature to review the results.",
  },
  {
    id: "results-workspace",
    chapter: "results",
    skip: notInFeature,
    targets: ["#d-overview .feature-action-grid", "#d-overview"],
    title: "Work with a feature",
    body: "Each card opens a tool: Test cases to review, edit and record results, Validator to check the suite against the requirements, Test plan to build a plan document, and Gap analysis to compare the cases with the code.",
  },
  {
    id: "results-toolbar",
    chapter: "results",
    skip: notInFeature,
    targets: ["#d-newver", "#d-export", "#d-jira"],
    group: true,
    title: "Versions, export and Jira",
    body: "Click + when the requirements change: wardenIQ keeps, retires and adds cases in a new version. Export the suite to CSV or PDF, or push the cases to Jira.",
  },

  // ---- cases (Test Cases library) ----
  {
    id: "cases-filters",
    chapter: "cases",
    view: "cases",
    targets: [".case-filter-panel", "#tc-feat"],
    title: "Every test case in one place",
    body: "The Test Cases screen lists all cases in the project. Filter by feature, category, tag, status or latest result, or search by title or ID.",
  },
  {
    id: "cases-list",
    chapter: "cases",
    view: "cases",
    targets: ["#tc-list"],
    title: "Open, run and edit cases",
    body: (env) =>
      env.role === "viewer"
        ? "Open a title to read its full specification and latest result."
        : "Open a title for its full specification. Record a result from the list, edit the steps, or select several cases for bulk actions. + New test case adds one by hand.",
  },

  // ---- code (Code Analysis) ----
  {
    id: "code-repos",
    chapter: "code",
    view: "cycles",
    targets: ["#cyc-repos", "#cyc-add-git"],
    group: true,
    title: "What did recent commits touch?",
    body: (env) =>
      env.setup.has_repo
        ? "Code Analysis maps recent commits and pull requests to the test cases they affect. Tick the repositories to include and pick a branch for each."
        : "Code Analysis maps recent commits and pull requests to the test cases they affect. It needs a repository: use Add a repo from GitHub, or connect one under Projects & Repos.",
  },
  {
    id: "code-analyze",
    chapter: "code",
    view: "cycles",
    targets: ["#cyc-days", "#cyc-analyze"],
    group: true,
    title: "Analyze changes",
    body: "Choose how many days to look back and click Analyze changes. The impacted cases appear below with their evidence, and you can turn them into a regression cycle in one click.",
  },

  // ---- mindmap ----
  {
    id: "mindmap-analyze",
    chapter: "mindmap",
    view: "mindmap",
    targets: ["#mm-analyze"],
    title: "Does the code build each case?",
    body: "Mind Map reads the production code and marks every test case as covered, partial or uncovered, citing the files that prove it. Click Analyze codebase to build or refresh it.",
  },
  {
    id: "mindmap-graph",
    chapter: "mindmap",
    view: "mindmap",
    targets: ["#mm-graph-card"],
    title: "Explore the coverage map",
    body: "Zoom, expand a branch and click a case to see its status and evidence. Use full screen for large projects.",
  },

  // ---- testcycles ----
  {
    id: "testcycles-create",
    chapter: "testcycles",
    view: "testcycles",
    targets: ["#tcy-name", "#tcy-new"],
    group: true,
    title: "Plan a regression run",
    body: (env) =>
      env.role === "viewer"
        ? "Test cycles group the cases to retest for a release. Editors create them here."
        : "Name a cycle and click + New cycle, then add the cases you want to retest for the release.",
  },
  {
    id: "testcycles-list",
    chapter: "testcycles",
    view: "testcycles",
    targets: ["#cyc-list"],
    title: "Track each cycle",
    body: "Open a cycle to record passed, failed or blocked for each case and follow its progress. Saved templates let you start the next cycle with the same cases.",
  },

  // ---- steps (Step Library) ----
  {
    id: "steps-library",
    chapter: "steps",
    view: "steps",
    targets: ["#s-list-body"],
    title: "Reusable steps",
    body: "Test cases share their steps. Edit a step here once and every case that uses it is updated. Filter by type or by usage to find unused steps.",
  },

  // ---- repo (optional) ----
  {
    id: "repo-connect",
    chapter: "repo",
    view: "projects",
    targets: ["[data-project-card] .entity-menu-btn", "[data-project-card]"],
    skip: (env) => !env.setup.has_project,
    title: "Connect a repository (optional)",
    body: "Connect a GitHub or GitLab repository later to use Code Analysis and Mind Map. You can skip this step.",
  },

  // ---- admin ----
  {
    id: "admin-usage",
    chapter: "admin",
    view: "usage",
    targets: ["#usage-totals"],
    title: "LLM usage and cost",
    body: "See tokens and estimated cost by model and by project, and every recent call.",
  },
  {
    id: "admin-users",
    chapter: "admin",
    view: "users",
    targets: ["#u-email", "#u-role", "#u-invite"],
    group: true,
    placement: "side",
    title: "Invite your team",
    body: "Invite people by email as admin, editor or viewer, and limit them to chosen projects. Lower on this screen you can create API tokens for CI and read the audit log.",
  },
  {
    id: "admin-config",
    chapter: "admin",
    view: "config",
    targets: ["#cfg-llm-provider", "#view-config"],
    title: "Configuration",
    body: "Change the AI model and embeddings, and set up email (SMTP), Jira and Confluence, Figma, S3 storage and the database.",
  },

  // ---- explore ----
  {
    id: "explore-workspace",
    chapter: "explore",
    targets: ["#wq-help-launcher", 'nav button[data-view="projects"]'],
    title: "You're all set",
    body: "Use the sidebar to move between screens. The ? button replays this tour or reopens the setup checklist at any time.",
    nextLabel: "Finish",
  },
];

/**
 * The ordered steps for a tour run.
 *
 * - Without `startChapter`: every chapter that applies to this user and setup.
 * - With `startChapter` (a checklist "Show me"): that chapter even if its
 *   condition says it is done, followed by the later chapters that apply,
 *   without earlier chapters.
 */
export function buildTour({ role, setup, startChapter = null }) {
  const env = { role: normaliseRole(role), setup: setup || {} };
  const startIdx = startChapter ? CHAPTERS.findIndex((c) => c.id === startChapter) : 0;
  if (startIdx < 0) return [];
  const chapters = CHAPTERS.slice(startIdx)
    // Repository setup is useful but optional, so keep it out of the main
    // linear tour. It remains available from the checklist's Show me action.
    .filter((c, i) => (startChapter && i === 0) || (c.id !== "repo" && c.applies(env)))
    .filter((c) => !(startChapter && c.id === "welcome"))
    .map((c) => c.id);
  return STEPS.filter(
    (s) => chapters.includes(s.chapter) && (!s.when || s.when(env.setup, env.role)),
  );
}

/**
 * Progress shown in the popup: which part of the tour (chapter) and which
 * step within it, e.g. "Part 2 of 5 · Create a project · step 1 of 3".
 */
export function tourProgress(steps, index) {
  const order = [];
  for (const s of steps) if (!order.includes(s.chapter)) order.push(s.chapter);
  const step = steps[index];
  if (!step) return null;
  const inPart = steps.filter((s) => s.chapter === step.chapter);
  return {
    part: order.indexOf(step.chapter) + 1,
    parts: order.length,
    title: CHAPTER_TITLE[step.chapter] || step.chapter,
    step: inPart.indexOf(step) + 1,
    steps: inPart.length,
  };
}

/** Resolve a step field that may be a function of env. */
export function resolveText(value, env) {
  return typeof value === "function" ? value(env) : value;
}

/** Is this an action step (the user must do something on the page)? */
export function isActionStep(step) {
  return Boolean(step && (step.waitFor || step.advanceOnClick));
}

/**
 * Keyboard handling for the tour popup. Returns "close", "next", "back" or
 * null. Arrow keys are ignored while the user is typing in a field, so the
 * tour never steals keys from the form it is pointing at.
 */
export function keyAction(key, { typing = false, actionStep = false } = {}) {
  if (key === "Escape") return "close";
  if (typing) return null;
  if (key === "ArrowRight" && !actionStep) return "next";
  if (key === "ArrowLeft") return "back";
  return null;
}

/**
 * Where to put the popup next to the highlighted element.
 * `rect` is the target's bounding box (or null for a centred popup), `pop` the
 * popup size and `vp` the viewport size. Prefers below, then above, then the
 * side with more room (with `prefer: "side"`, the sides come first, so the
 * popup does not cover the rest of a form); always clamped inside the viewport.
 */
export function popoverPosition(rect, pop, vp, { gap = 12, margin = 12, prefer = null } = {}) {
  const clampX = (x) => Math.max(margin, Math.min(x, vp.width - pop.width - margin));
  const clampY = (y) => Math.max(margin, Math.min(y, vp.height - pop.height - margin));
  if (!rect) {
    return {
      placement: "center",
      left: clampX((vp.width - pop.width) / 2),
      top: clampY((vp.height - pop.height) / 2),
    };
  }
  const centeredX = clampX(rect.left + rect.width / 2 - pop.width / 2);
  const centeredY = clampY(rect.top + rect.height / 2 - pop.height / 2);
  if (prefer === "side") {
    if (rect.right + gap + pop.width <= vp.width - margin) {
      return { placement: "right", left: rect.right + gap, top: centeredY };
    }
    if (rect.left - gap - pop.width >= margin) {
      return { placement: "left", left: rect.left - gap - pop.width, top: centeredY };
    }
  }
  if (rect.bottom + gap + pop.height <= vp.height - margin) {
    return { placement: "bottom", left: centeredX, top: rect.bottom + gap };
  }
  if (rect.top - gap - pop.height >= margin) {
    return { placement: "top", left: centeredX, top: rect.top - gap - pop.height };
  }
  const roomRight = vp.width - rect.right;
  if (roomRight >= rect.left && rect.right + gap + pop.width <= vp.width - margin) {
    return { placement: "right", left: rect.right + gap, top: centeredY };
  }
  if (rect.left - gap - pop.width >= margin) {
    return { placement: "left", left: rect.left - gap - pop.width, top: centeredY };
  }
  return { placement: "over", left: centeredX, top: clampY(vp.height - pop.height - margin) };
}
