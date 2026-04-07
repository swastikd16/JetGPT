const DEFAULT_SETTINGS = {
  enabled: true,
  visibleCount: 30,
};

const STATS_KEY = "cstStats";
const DEFAULT_STATS = {
  hiddenMessages: 0,
  totalMessages: 0,
  savedPercent: 0,
  autoDisabled: false,
};

const MIN_MESSAGES = 1;
const MAX_MESSAGES = 1000;
const PRESET_VALUES = [5, 10, 15];
const CHATGPT_HOME_URL = "https://chatgpt.com/";
const SUPPORTED_HOSTS = ["chatgpt.com", "chat.openai.com"];

const enabledInput = document.getElementById("enabled");
const visibleCountInput = document.getElementById("visibleCount");
const limitControls = document.getElementById("limitControls");
const supportedView = document.getElementById("supportedView");
const unsupportedView = document.getElementById("unsupportedView");
const preview = document.getElementById("preview");
const savedPercent = document.getElementById("savedPercent");
const totalMessages = document.getElementById("totalMessages");
const autoDisableNote = document.getElementById("autoDisableNote");
const showAllBtn = document.getElementById("showAllBtn");
const openChatgptBtn = document.getElementById("openChatgptBtn");
const presetButtons = Array.from(document.querySelectorAll(".preset-btn"));

const clampCount = (value) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.visibleCount;
  }

  return Math.max(MIN_MESSAGES, Math.min(MAX_MESSAGES, Math.round(value)));
};

const setActivePreset = (preset) => {
  const targetPreset = String(preset);
  presetButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === targetPreset);
  });
};

const renderPreview = (count) => {
  preview.textContent = `Keeping the last ${count} messages visible.`;
};

const renderStats = (stats) => {
  const percentValue = Number(stats?.savedPercent);
  const safePercent = Number.isFinite(percentValue) ? Math.max(0, Math.round(percentValue)) : 0;
  const safeTotal = Number.isFinite(Number(stats?.totalMessages)) ? Math.max(0, Math.round(Number(stats.totalMessages))) : 0;
  savedPercent.textContent = `${safePercent}%`;
  totalMessages.textContent = String(safeTotal);

  if (stats?.autoDisabled) {
    autoDisableNote.textContent = "Auto-disabled in this chat (8 or fewer messages). Set a lower count to hide anyway.";
  } else {
    autoDisableNote.textContent = "Auto-disables at 8 or fewer messages unless your limit is lower.";
  }
};

const syncControls = (count) => {
  const clamped = clampCount(count);
  visibleCountInput.value = String(clamped);
  renderPreview(clamped);

  if (PRESET_VALUES.includes(clamped)) {
    setActivePreset(clamped);
  } else {
    setActivePreset("custom");
  }
};

const saveSettings = async (settingsPatch) => {
  const nextPatch = {};

  if (Object.hasOwn(settingsPatch, "enabled")) {
    nextPatch.enabled = Boolean(settingsPatch.enabled);
  }

  if (Object.hasOwn(settingsPatch, "visibleCount")) {
    nextPatch.visibleCount = clampCount(Number(settingsPatch.visibleCount));
  }

  if (Object.keys(nextPatch).length > 0) {
    await chrome.storage.local.set(nextPatch);
  }
};

const setEnabledUI = (enabled) => {
  limitControls.classList.toggle("is-disabled", !enabled);
};

const isSupportedUrl = (urlString) => {
  if (!urlString) {
    return false;
  }

  try {
    const { hostname } = new URL(urlString);
    return SUPPORTED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
};

const isSupportedActiveTab = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return isSupportedUrl(tabs[0]?.url);
};

const setPopupMode = (isSupportedTab) => {
  supportedView.classList.toggle("is-hidden", !isSupportedTab);
  unsupportedView.classList.toggle("is-hidden", isSupportedTab);
};

const init = async () => {
  const isSupportedTab = await isSupportedActiveTab();
  setPopupMode(isSupportedTab);
  if (!isSupportedTab) {
    return;
  }

  const stored = await chrome.storage.local.get({
    ...DEFAULT_SETTINGS,
    [STATS_KEY]: DEFAULT_STATS,
  });

  const settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
  };

  enabledInput.checked = Boolean(settings.enabled);
  setEnabledUI(enabledInput.checked);
  syncControls(Number(settings.visibleCount));
  renderStats(stored[STATS_KEY] || DEFAULT_STATS);
};

enabledInput.addEventListener("change", async () => {
  const enabled = enabledInput.checked;
  setEnabledUI(enabled);
  await saveSettings({ enabled });
});

visibleCountInput.addEventListener("focus", () => {
  if (!PRESET_VALUES.includes(clampCount(Number(visibleCountInput.value)))) {
    setActivePreset("custom");
  }
});

visibleCountInput.addEventListener("input", () => {
  const rawValue = Number(visibleCountInput.value);
  if (!Number.isFinite(rawValue)) {
    setActivePreset("custom");
    return;
  }

  const count = clampCount(rawValue);
  renderPreview(count);

  if (PRESET_VALUES.includes(count)) {
    setActivePreset(count);
  } else {
    setActivePreset("custom");
  }
});

visibleCountInput.addEventListener("change", async () => {
  const count = clampCount(Number(visibleCountInput.value));
  syncControls(count);
  enabledInput.checked = true;
  setEnabledUI(true);
  await saveSettings({ enabled: true, visibleCount: count });
});

presetButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const preset = button.dataset.preset;
    if (preset === "custom") {
      setActivePreset("custom");
      visibleCountInput.focus();
      visibleCountInput.select();
      return;
    }

    const count = clampCount(Number(preset));
    syncControls(count);
    await saveSettings({ enabled: true, visibleCount: count });
  });
});

showAllBtn.addEventListener("click", async () => {
  enabledInput.checked = false;
  setEnabledUI(false);
  await saveSettings({ enabled: false });
});

openChatgptBtn.addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: CHATGPT_HOME_URL });
  } else {
    await chrome.tabs.create({ url: CHATGPT_HOME_URL });
  }
  window.close();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.enabled) {
    const enabled = Boolean(changes.enabled.newValue);
    enabledInput.checked = enabled;
    setEnabledUI(enabled);
  }

  if (changes.visibleCount) {
    syncControls(Number(changes.visibleCount.newValue));
  }

  if (changes[STATS_KEY]) {
    renderStats(changes[STATS_KEY].newValue || DEFAULT_STATS);
  }
});

init().catch((error) => {
  console.error("Failed to initialize popup", error);
});
