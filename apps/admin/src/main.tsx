import { ApiError } from "@hrcc/shared";
import { AppProviders, ME_QUERY_KEY, setSignedInUser } from "@hrcc/ui/app";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { WEB_SIGN_IN_URL } from "./config";
import { i18n } from "./i18n";
import "./index.css";
import { routeTree } from "./routeTree.gen";

/** An ended session sends the admin to the web sign-in page; a required change to that page. */
function onApiError(error: unknown): void {
  if (!(error instanceof ApiError)) return;
  if (error.body.code === "unauthenticated") {
    setSignedInUser(queryClient, null);
    window.location.assign(WEB_SIGN_IN_URL);
  } else if (error.body.code === "password_change_required") {
    void queryClient
      .invalidateQueries({ queryKey: ME_QUERY_KEY })
      .then(() => router.navigate({ to: "/account/password" }));
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  context: { queryClient, api },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders i18n={i18n} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
