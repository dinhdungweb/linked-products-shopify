import { useEffect, useState } from "react";

export const APP_EMBED_HANDLE = "app-card-injector";
export const APP_EMBED_TARGET = "body";
const ACTIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_META = {
  checking: {
    label: "Checking",
    description: "Checking app embed setup from Shopify admin.",
  },
  active: {
    label: "Active",
    description: "App embed is active in the theme editor.",
  },
  available: {
    label: "Available",
    description: "App embed is available. Enable it in the theme editor.",
  },
  unavailable: {
    label: "Needs review",
    description: "Shopify could not confirm the app embed status. Review it in the theme editor.",
  },
  needs_review: {
    label: "Needs review",
    description: "Shopify could not confirm the app embed status. Review it in the theme editor.",
  },
};

function getCacheKey(handle, target) {
  return `linked-products:app-embed:${handle}:${target}`;
}

function getBrowserStorages() {
  if (typeof window === "undefined") return [];

  return [window.localStorage, window.sessionStorage].filter(Boolean);
}

function readCachedStatus(handle, target) {
  if (typeof window === "undefined") return null;

  try {
    const key = getCacheKey(handle, target);
    const cached = getBrowserStorages()
      .map((storage) => storage.getItem(key))
      .find(Boolean);

    if (!cached) return null;

    const parsed = JSON.parse(cached);
    if (parsed?.status !== "active") return null;
    if (!parsed.checkedAt || Date.now() - parsed.checkedAt > ACTIVE_CACHE_TTL_MS) return null;

    return {
      status: "active",
      ...STATUS_META.active,
    };
  } catch (_error) {
    return null;
  }
}

function writeCachedStatus(handle, target, status) {
  if (typeof window === "undefined") return;

  try {
    const key = getCacheKey(handle, target);

    if (status === "active") {
      const value = JSON.stringify({ status, checkedAt: Date.now() });
      getBrowserStorages().forEach((storage) => storage.setItem(key, value));
      return;
    }

    if (status === "available") {
      getBrowserStorages().forEach((storage) => storage.removeItem(key));
    }
  } catch (_error) {
    // Ignore storage failures in restricted browser contexts.
  }
}

function normalizeStatus(status) {
  if (status === "active" || status === "available" || status === "unavailable") {
    return status;
  }

  return "needs_review";
}

function matchesHandle(value, handle) {
  if (value === handle) return true;
  if (typeof value !== "string") return false;

  return value.endsWith(`/${handle}`) || value.endsWith(`.${handle}`) || value.endsWith(`:${handle}`);
}

function matchesTarget(value, target) {
  if (value === target) return true;
  if (typeof value !== "string") return false;

  return value.endsWith(`/${target}`) || value.endsWith(`.${target}`) || value.endsWith(`:${target}`);
}

function collectExtensionInfos(value, handle, matches = []) {
  if (!value || typeof value !== "object") return matches;

  if (Array.isArray(value)) {
    value.forEach((item) => collectExtensionInfos(item, handle, matches));
    return matches;
  }

  if (matchesHandle(value.handle, handle) && Array.isArray(value.activations)) {
    matches.push(value);
  }

  Object.values(value).forEach((item) => {
    if (item && typeof item === "object") {
      collectExtensionInfos(item, handle, matches);
    }
  });

  return matches;
}

function collectMatchingActivations(value, handle, target, matches = []) {
  if (!value || typeof value !== "object") return matches;

  if (Array.isArray(value)) {
    value.forEach((item) => collectMatchingActivations(item, handle, target, matches));
    return matches;
  }

  if (matchesHandle(value.handle, handle) && matchesTarget(value.target, target)) {
    matches.push(value);
  }

  Object.values(value).forEach((item) => {
    if (item && typeof item === "object") {
      collectMatchingActivations(item, handle, target, matches);
    }
  });

  return matches;
}

function getStatusFromActivationRecord(record) {
  const hasThemePlacements = Array.isArray(record.activations) && record.activations.length > 0;

  if (record.status) {
    const normalized = normalizeStatus(record.status);

    if (normalized === "active" || (normalized === "available" && hasThemePlacements)) {
      return "active";
    }

    return normalized;
  }

  return hasThemePlacements ? "active" : "available";
}

function buildStatus(status) {
  return {
    status,
    ...STATUS_META[status],
  };
}

export function getAppEmbedStatusFromExtensions(
  extensions,
  handle = APP_EMBED_HANDLE,
  target = APP_EMBED_TARGET,
) {
  const matches = collectMatchingActivations(extensions, handle, target);
  const activation = matches.find((item) => item.status === "active")
    || matches.find((item) => Array.isArray(item.activations) && item.activations.length > 0)
    || matches[0];

  if (activation) {
    return buildStatus(getStatusFromActivationRecord(activation));
  }

  const extensionInfo = collectExtensionInfos(extensions, handle)[0];
  if (extensionInfo) {
    const status = getStatusFromActivationRecord(extensionInfo);

    if (status !== "available") {
      return buildStatus(status);
    }

    const activations = extensionInfo.activations || [];
    const hasTargetActivation = activations.some((activation) => matchesTarget(activation.target, target));

    if (hasTargetActivation || activations.length > 0) {
      return buildStatus("active");
    }

    return buildStatus("available");
  }

  return buildStatus("unavailable");
}

export function useAppEmbedStatus(shopify, options = {}) {
  const { handle = APP_EMBED_HANDLE, target = APP_EMBED_TARGET } = options;
  const [state, setState] = useState({
    status: "checking",
    ...STATUS_META.checking,
  });

  useEffect(() => {
    let mounted = true;

    async function checkAppEmbed() {
      const cachedActive = readCachedStatus(handle, target);

      try {
        if (!shopify?.app || typeof shopify.app.extensions !== "function") {
          if (mounted) {
            setState(cachedActive || {
              status: "unavailable",
              ...STATUS_META.unavailable,
            });
          }
          return;
        }

        const extensions = await shopify.app.extensions();
        if (mounted) {
          const nextState = getAppEmbedStatusFromExtensions(extensions, handle, target);
          writeCachedStatus(handle, target, nextState.status);
          setState(
            nextState.status === "active" || nextState.status === "available"
              ? nextState
              : cachedActive || nextState,
          );
        }
      } catch (_error) {
        if (mounted) {
          setState(cachedActive || {
            status: "needs_review",
            ...STATUS_META.needs_review,
          });
        }
      }
    }

    checkAppEmbed();

    return () => {
      mounted = false;
    };
  }, [shopify, handle, target]);

  return state;
}

export function buildThemeEditorUrl(shop, apiKey, handle = APP_EMBED_HANDLE) {
  const store = (shop || "").split(".")[0];
  const activateAppId = [apiKey, handle].filter(Boolean).join("/");

  return `https://admin.shopify.com/store/${store}/themes/current/editor?context=apps&template=product&activateAppId=${activateAppId}`;
}

export function getAppEmbedTone(status) {
  if (status === "active") return "success";
  if (status === "available") return "warning";
  return "info";
}

export function getAppEmbedActionLabel(status) {
  if (status === "available") return "Enable App Embed";
  if (status === "checking") return "Open Theme Editor";
  return "Review Theme";
}
