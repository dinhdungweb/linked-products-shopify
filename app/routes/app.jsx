import { useEffect } from "react";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { scheduleCrispChatLoad } from "../utils/crisp-chat";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session?.shop || "",
  };
};

function CrispChatLoader({ shop }) {
  useEffect(() => {
    return scheduleCrispChatLoad({ shop });
  }, [shop]);

  return null;
}

export default function App() {
  const { apiKey, shop } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <CrispChatLoader shop={shop} />
      <NavMenu>
        <Link to="/app" rel="home">Dashboard</Link>
        <Link to="/app/groups">Product groups</Link>
        <Link to="/app/option-styles">Option styles</Link>
        <Link to="/app/automations">Automations</Link>
        <Link to="/app/settings">Settings</Link>
        <Link to="/app/pricing">Billing</Link>
        <Link to="/app/support">Support</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
