import type { ApiClient, User } from "@hrcc/shared";
import { readStoredLocale, setSignedInUser } from "@hrcc/ui/app";
import type { QueryClient } from "@tanstack/react-query";
import type { i18n as I18nInstance } from "i18next";

export async function completeSignIn({
  api,
  queryClient,
  i18n,
  userId,
}: {
  api: ApiClient;
  queryClient: QueryClient;
  i18n: I18nInstance;
  userId: string;
}): Promise<User> {
  const { user: signedIn } = await api.demoLogin(userId);
  const chosen = readStoredLocale();
  const user =
    chosen && chosen !== signedIn.locale
      ? (await api.updatePreferences({ locale: chosen })).user
      : signedIn;
  setSignedInUser(queryClient, user);
  await i18n.changeLanguage(user.locale);
  return user;
}

export async function signOut({
  api,
  queryClient,
}: {
  api: ApiClient;
  queryClient: QueryClient;
}): Promise<void> {
  try {
    await api.logout();
  } finally {
    setSignedInUser(queryClient, null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
  }
}
