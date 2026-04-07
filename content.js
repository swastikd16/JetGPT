const DEFAULT_SETTINGS = {
  enabled: true,
  visibleCount: 30,
  aggressiveMode: false,
};

const HIDDEN_CLASS = "cst-hidden-turn";
const STYLE_ID = "cst-hidden-style";
const STATS_KEY = "cstStats";
const LOW_MESSAGE_THRESHOLD = 8;
const APPLY_DEBOUNCE_MS = 180;
const MIN_APPLY_INTERVAL_MS = 120;
const MUTATION_SKIP_WINDOW_MS = 80;
const TURN_SELECTORS = [
  "main article[data-testid^='conversation-turn-']",
  "main [data-testid^='conversation-turn-']",
  "main [data-message-author-role]",
  "main [data-message-id]",
];

let currentSettings = { ...DEFAULT_SETTINGS };
let applyTimer = null;
let lastHref = location.href;
let lastStatsSignature = "";
let aggressiveRemovedCount = 0;
let selectedTurnSelector = null;
let domObserver = null;
let suppressMutationsUntil = 0;
let isApplying = false;
let pendingApply = false;
let lastApplyAt = 0;

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${HIDDEN_CLASS} {
      display: none !important;
    }
  `;

  document.head.appendChild(style);
};

const unique = (elements) => Array.from(new Set(elements));

const getTurns = () => {
  if (selectedTurnSelector) {
    const cached = unique(Array.from(document.querySelectorAll(selectedTurnSelector)));
    if (cached.length > 1) {
      return cached;
    }
    selectedTurnSelector = null;
  }

  for (const selector of TURN_SELECTORS) {
    const nodes = unique(Array.from(document.querySelectorAll(selector)));
    if (nodes.length > 1) {
      selectedTurnSelector = selector;
      return nodes;
    }
  }

  return [];
};

const resetHiddenState = (turns) => {
  for (const turn of turns) {
    if (turn.classList.contains(HIDDEN_CLASS)) {
      turn.classList.remove(HIDDEN_CLASS);
    }
  }
};

const publishStats = (totalMessages, hiddenMessages, autoDisabled) => {
  const safeTotal = Math.max(0, Number(totalMessages) || 0);
  const safeHidden = Math.max(0, Math.min(Number(hiddenMessages) || 0, safeTotal));
  const savedPercent = safeTotal > 0 ? Math.round((safeHidden / safeTotal) * 100) : 0;

  const stats = {
    totalMessages: safeTotal,
    hiddenMessages: safeHidden,
    savedPercent,
    autoDisabled: Boolean(autoDisabled),
  };

  const signature = `${stats.totalMessages}:${stats.hiddenMessages}:${stats.savedPercent}:${stats.autoDisabled}`;
  if (signature === lastStatsSignature) {
    return;
  }

  lastStatsSignature = signature;
  chrome.storage.local.set({ [STATS_KEY]: stats });
};

const startObserver = () => {
  if (!domObserver) {
    domObserver = new MutationObserver(onMutations);
  }

  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

const stopObserver = () => {
  if (domObserver) {
    domObserver.disconnect();
  }
};

const withObserverPaused = (callback) => {
  stopObserver();
  try {
    callback();
  } finally {
    suppressMutationsUntil = Date.now() + MUTATION_SKIP_WINDOW_MS;
    startObserver();
  }
};

const isTurnLikeNode = (node) => {
  if (!(node instanceof Element)) {
    return false;
  }

  if (node.matches("[data-testid^='conversation-turn-'], [data-message-author-role], [data-message-id]")) {
    return true;
  }

  return Boolean(node.querySelector("[data-testid^='conversation-turn-'], [data-message-author-role], [data-message-id]"));
};

const hasRelevantMutation = (records) => {
  for (const record of records) {
    if (record.type !== "childList") {
      continue;
    }

    for (const node of record.addedNodes) {
      if (isTurnLikeNode(node)) {
        return true;
      }
    }

    for (const node of record.removedNodes) {
      if (isTurnLikeNode(node)) {
        return true;
      }
    }
  }

  return false;
};

const applyLimit = () => {
  const turns = getTurns();
  const visibleCount = Math.max(1, Number(currentSettings.visibleCount) || DEFAULT_SETTINGS.visibleCount);
  let totalMessages = currentSettings.aggressiveMode ? turns.length + aggressiveRemovedCount : turns.length;
  let hiddenMessages = currentSettings.aggressiveMode ? aggressiveRemovedCount : 0;
  resetHiddenState(turns);

  // When aggressive mode has removed turns, include them in the effective total for auto-disable logic.
  const effectiveTotalMessages = totalMessages;
  const autoDisabled = effectiveTotalMessages > 0
    && effectiveTotalMessages <= LOW_MESSAGE_THRESHOLD
    && visibleCount >= effectiveTotalMessages;

  if (currentSettings.enabled && !autoDisabled) {
    if (currentSettings.aggressiveMode) {
      if (turns.length > visibleCount) {
        const toRemove = turns.length - visibleCount;
        withObserverPaused(() => {
          for (let i = 0; i < toRemove; i += 1) {
            turns[i].remove();
          }
        });
        aggressiveRemovedCount += toRemove;
      }
      const remainingTurns = getTurns();
      totalMessages = remainingTurns.length + aggressiveRemovedCount;
      hiddenMessages = aggressiveRemovedCount;
    } else if (turns.length > visibleCount) {
      hiddenMessages = turns.length - visibleCount;
      for (let i = 0; i < hiddenMessages; i += 1) {
        turns[i].classList.add(HIDDEN_CLASS);
      }
    }
  }

  publishStats(totalMessages, hiddenMessages, autoDisabled && currentSettings.enabled);
};

const runApplyCycle = () => {
  applyTimer = null;

  if (isApplying) {
    pendingApply = true;
    return;
  }

  const now = Date.now();
  const waitTime = Math.max(0, MIN_APPLY_INTERVAL_MS - (now - lastApplyAt));
  if (waitTime > 0) {
    applyTimer = setTimeout(runApplyCycle, waitTime);
    return;
  }

  isApplying = true;
  try {
    applyLimit();
  } finally {
    isApplying = false;
    lastApplyAt = Date.now();
    if (pendingApply) {
      pendingApply = false;
      scheduleApply();
    }
  }
};

const scheduleApply = (immediate = false) => {
  if (applyTimer) {
    clearTimeout(applyTimer);
  }

  applyTimer = setTimeout(runApplyCycle, immediate ? 0 : APPLY_DEBOUNCE_MS);
};

const onMutations = (records) => {
  if (Date.now() < suppressMutationsUntil) {
    return;
  }

  if (location.href !== lastHref) {
    lastHref = location.href;
    aggressiveRemovedCount = 0;
    selectedTurnSelector = null;
    scheduleApply(true);
    return;
  }

  if (!hasRelevantMutation(records)) {
    return;
  }

  scheduleApply();
};

const init = async () => {
  ensureStyle();
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  currentSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
  };

  scheduleApply(true);
  startObserver();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    let shouldReapply = false;

    if (changes.enabled) {
      currentSettings.enabled = Boolean(changes.enabled.newValue);
      shouldReapply = true;
    }

    if (changes.visibleCount) {
      currentSettings.visibleCount = Number(changes.visibleCount.newValue);
      shouldReapply = true;
    }

    if (changes.aggressiveMode) {
      const previous = currentSettings.aggressiveMode;
      currentSettings.aggressiveMode = Boolean(changes.aggressiveMode.newValue);
      if (previous && !currentSettings.aggressiveMode) {
        aggressiveRemovedCount = 0;
      }
      shouldReapply = true;
    }

    if (shouldReapply) {
      scheduleApply(true);
    }
  });
};

init().catch((error) => {
  console.error("JetGPT initialization failed", error);
});
