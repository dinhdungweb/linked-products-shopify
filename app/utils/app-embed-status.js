import { useEffect, useState } from "react";

export const APP_EMBED_HANDLE = "app-card-injector";
export const APP_EMBED_TARGET = "body";

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

function normalizeStatus(status) {
  if (status === "active" || status === "available" || status === "unavailable") {
    return status;
  }

  return "needs_review";
}

function collectMatchingActivations(value, handle, target, matches = []) {
  if (!value || typeof value !== "object") return matches;

  if (Array.isArray(value)) {
    value.forEach((item) => collectMatchingActivations(item, handle, target, matches));
    return matches;
  }

  if (value.handle === handle && value.target === target) {
    matches.push(value);
  }

  Object.values(value).forEach((item) => {
    if (item && typeof item === "object") {
      collectMatchingActivations(item, handle, target, matches);
    }
  });

  return matches;
}

export function getAppEmbedStatusFromExtensions(
  extensions,
  handle = APP_EMBED_HANDLE,
  target = APP_EMBED_TARGET,
) {
  const matches = collectMatchingActivations(extensions, handle, target);
  const activation = matches.find((item) => item.status === "active") || matches[0];

  if (!activation) {
    return {
      status: "unavailable",
      ...STATUS_META.unavailable,
    };
  }

  const status = normalizeStatus(activation.status);
  return {
    status,
    ...STATUS_META[status],
  };
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
      try {
        if (!shopify?.app || typeof shopify.app.extensions !== "function") {
          if (mounted) {
            setState({
              status: "unavailable",
              ...STATUS_META.unavailable,
            });
          }
          return;
        }

        const extensions = await shopify.app.extensions();
        if (mounted) {
          setState(getAppEmbedStatusFromExtensions(extensions, handle, target));
        }
      } catch (_error) {
        if (mounted) {
          setState({
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
