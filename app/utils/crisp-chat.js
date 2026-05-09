const CRISP_WEBSITE_ID = "b882709c-9f60-4bf7-b823-0f6bc6196f4a";
const CRISP_SCRIPT_SELECTOR = 'script[data-crisp-chat="true"]';
const CRISP_LOAD_DELAY_MS = 5000;
const CRISP_IDLE_TIMEOUT_MS = 8000;

let crispLoadPromise;

function canUseDOM() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function setCrispGlobals() {
  window.$crisp = window.$crisp || [];
  window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
}

export function loadCrispChat() {
  if (!canUseDOM()) return Promise.resolve(false);

  setCrispGlobals();

  if (document.querySelector(CRISP_SCRIPT_SELECTOR)) {
    return Promise.resolve(true);
  }

  if (crispLoadPromise) return crispLoadPromise;

  crispLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    script.dataset.crispChat = "true";
    script.onload = () => resolve(true);
    script.onerror = () => {
      crispLoadPromise = undefined;
      reject(new Error("Failed to load Crisp chat"));
    };

    document.head.appendChild(script);
  });

  return crispLoadPromise;
}

export function scheduleCrispChatLoad() {
  if (!canUseDOM()) return () => {};

  let timeoutId;
  let idleCallbackId;

  const loadWhenReady = () => {
    loadCrispChat().catch(() => {});
  };

  if ("requestIdleCallback" in window) {
    idleCallbackId = window.requestIdleCallback(loadWhenReady, {
      timeout: CRISP_IDLE_TIMEOUT_MS,
    });
  } else {
    timeoutId = window.setTimeout(loadWhenReady, CRISP_LOAD_DELAY_MS);
  }

  return () => {
    if (idleCallbackId && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleCallbackId);
    }

    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  };
}

export function openCrispChat() {
  if (!canUseDOM()) return;

  setCrispGlobals();
  window.$crisp.push(["do", "chat:open"]);
  loadCrispChat().catch(() => {});
}
