import { AppProviders, createAppI18n } from "@hrcc/ui/app";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { resources } from "../i18n";

/** Renders a component that uses router links, inside a throwaway router. */
export function renderInRouter(ui: ReactElement, locale: "en" | "ar" = "en") {
  const i18n = createAppI18n(resources, locale);
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <AppProviders i18n={i18n} queryClient={new QueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}
