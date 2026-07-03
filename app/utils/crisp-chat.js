const CRISP_WEBSITE_ID = "b882709c-9f60-4bf7-b823-0f6bc6196f4a";
const CRISP_SCRIPT_SELECTOR = 'script[data-crisp-chat="true"]';
const CRISP_LOAD_DELAY_MS = 5000;
const CRISP_IDLE_TIMEOUT_MS = 8000;

let crispLoadPromise;

function canUseDOM() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function setCrispGlobals(arg) {
  window.$crisp = window.$crisp || [];
  window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;

  const shop = typeof arg === "string" ? arg : (arg && typeof arg === "object" && typeof arg.shop === "string" ? arg.shop : undefined);
  const targetShop = shop || window.__crispShop;
  if (targetShop && window.__crispShop !== targetShop) {
    window.$crisp.push(["set", "session:data", [[["shop", targetShop]]]]);
    window.__crispShop = targetShop;
  }
}

export function prepareCrispChat(arg) {
  if (!canUseDOM()) return null;
  setCrispGlobals(arg);
  return window.$crisp;
}

export function loadCrispChat(arg = {}) {
  if (!canUseDOM()) return Promise.resolve(false);

  setCrispGlobals(arg);

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

export function scheduleCrispChatLoad(arg = {}) {
  if (!canUseDOM()) return () => {};

  setCrispGlobals(arg);

  let timeoutId;
  let idleCallbackId;

  const loadWhenReady = () => {
    loadCrispChat(arg).catch(() => {});
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

export function openCrispChat(arg = {}) {
  if (!canUseDOM()) return;

  setCrispGlobals(arg);
  window.$crisp.push(["do", "chat:open"]);
  loadCrispChat(arg).catch(() => {});
}
