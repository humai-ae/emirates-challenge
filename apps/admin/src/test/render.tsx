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

export function renderWithProviders(ui: ReactElement, locale: "en" | "ar" = "en") {
  const i18n = createAppI18n(resources, locale);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AppProviders i18n={i18n} queryClient={queryClient}>
      {ui}
    </AppProviders>,
  );
}

/** Renders a component that uses router links, inside a throwaway router. */
export function renderInRouter(ui: ReactElement, locale: "en" | "ar" = "en") {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return renderWithProviders(<RouterProvider router={router} />, locale);
}
