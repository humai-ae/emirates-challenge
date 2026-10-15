import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { i18n as I18nInstance } from "i18next";
import { Direction } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";

export function AppProviders({
  i18n,
  queryClient,
  children,
}: {
  i18n: I18nInstance;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  const [dir, setDir] = useState(() => i18n.dir(i18n.language));
  useEffect(() => {
    const onChange = (lng: string) => setDir(i18n.dir(lng));
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, [i18n]);
  return (
    <I18nextProvider i18n={i18n}>
      <Direction.Provider dir={dir}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </Direction.Provider>
    </I18nextProvider>
  );
}
