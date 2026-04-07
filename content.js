const DEFAULT_SETTINGS = {
  enabled: true,
  visibleCount: 30,
};

const HIDDEN_CLASS = "cst-hidden-turn";
const STYLE_ID = "cst-hidden-style";
const STATS_KEY = "cstStats";
const LOW_MESSAGE_THRESHOLD = 8;

let currentSettings = { ...DEFAULT_SETTINGS };
let applyTimer = null;
let lastHref = location.href;
let lastStatsSignature = "";

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
  const selectors = [
    "main article[data-testid^='conversation-turn-']",
    "main [data-testid^='conversation-turn-']",
    "main [data-message-author-role]",
    "main [data-message-id]",
  ];

  for (const selector of selectors) {
    const nodes = unique(Array.from(document.querySelectorAll(selector)));
    if (nodes.length > 1) {
      return nodes;
    }
  }

  return [];
};

const resetHiddenState = () => {
  document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => {
    el.classList.remove(HIDDEN_CLASS);
  });
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

const applyLimit = () => {
  resetHiddenState();
  const turns = getTurns();
  let hiddenMessages = 0;
  const visibleCount = Math.max(1, Number(currentSettings.visibleCount) || DEFAULT_SETTINGS.visibleCount);
  const autoDisabled = turns.length > 0
    && turns.length <= LOW_MESSAGE_THRESHOLD
    && visibleCount >= turns.length;

  if (currentSettings.enabled && !autoDisabled) {
    if (turns.length > visibleCount) {
      hiddenMessages = turns.length - visibleCount;
      for (let i = 0; i < hiddenMessages; i += 1) {
        turns[i].classList.add(HIDDEN_CLASS);
      }
    }
  }

  publishStats(turns.length, hiddenMessages, autoDisabled && currentSettings.enabled);
};

const scheduleApply = () => {
  if (applyTimer) {
    clearTimeout(applyTimer);
  }

  applyTimer = setTimeout(() => {
    applyLimit();
  }, 120);
};

const onMutations = () => {
  if (location.href !== lastHref) {
    lastHref = location.href;
  }

  scheduleApply();
};

const observeDomChanges = () => {
  const observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

const init = async () => {
  ensureStyle();
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  currentSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
  };

  applyLimit();
  observeDomChanges();

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

    if (shouldReapply) {
      scheduleApply();
    }
  });
};

init().catch((error) => {
  console.error("JetGPT initialization failed", error);
});
