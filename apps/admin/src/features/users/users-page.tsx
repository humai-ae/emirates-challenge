import type { ApiClient, ManagedUser, User } from "@hrcc/shared";
import { apiErrorMessage, Button, Card, PageHeader, Tag } from "@hrcc/ui";
import { useLocaleSwitch } from "@hrcc/ui/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateUserForm } from "./create-user-form";
import { DeactivateDialog } from "./deactivate-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

export const USERS_QUERY_KEY = ["users"] as const;

const COLUMNS = ["name", "email", "role", "team", "status", "actions"] as const;
const CELL = "border-b border-line px-2.5 py-2";

export function UsersPage({ api, currentUser }: { api: ApiClient; currentUser: User }) {
  const { t } = useTranslation("admin");
  const { t: tUi } = useTranslation("ui");
  const { locale } = useLocaleSwitch();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const users = useQuery({ queryKey: USERS_QUERY_KEY, queryFn: () => api.listUsers() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
  const reactivate = useMutation({
    mutationFn: (id: string) => api.reactivateUser(id),
    onSuccess: refresh,
  });

  const teamName = (user: ManagedUser) =>
    user.team ? (locale === "ar" ? (user.team.nameAr ?? user.team.nameEn) : user.team.nameEn) : "—";

  return (
    <>
      <PageHeader
        title={t("users.title")}
        subtitle={t("users.subtitle")}
        actions={
          adding ? null : (
            <Button
              variant="primary"
              onClick={() => {
                setAdding(true);
                setNotice(null);
              }}
            >
              {t("users.add")}
            </Button>
          )
        }
      />
      {notice ? (
        <output className="mb-4 block rounded-[10px] bg-ok-bg px-3.5 py-2.5 text-sm text-ok">
          {notice}
        </output>
      ) : null}
      {adding ? (
        <Card className="mb-4">
          <h2 className="mb-3 text-lg font-bold">{t("users.form.title")}</h2>
          <CreateUserForm
            api={api}
            onCancel={() => setAdding(false)}
            onCreated={(user) => {
              setAdding(false);
              setNotice(t("users.created", { email: user.email }));
              refresh();
            }}
          />
        </Card>
      ) : null}
      <Card>
        {users.isPending ? <p className="text-muted">{tUi("states.loading")}</p> : null}
        {users.isError ? <p className="text-high">{tUi("states.error")}</p> : null}
        {reactivate.isError ? (
          <p role="alert" className="mb-3 text-high">
            {apiErrorMessage(reactivate.error, tUi)}
          </p>
        ) : null}
        {users.data ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    className={`${CELL} text-start text-sm font-semibold text-muted`}
                  >
                    {t(`users.columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.data.users.map((user) => (
                <tr key={user.id} data-testid="user-row" className="align-top">
                  <td className={`${CELL} font-semibold`}>
                    <bdi>{user.displayName}</bdi>
                  </td>
                  <td className={`${CELL} text-sm`}>
                    <bdi>{user.email}</bdi>
                  </td>
                  <td className={CELL}>{tUi(`roles.${user.role}`)}</td>
                  <td className={CELL}>
                    <bdi>{teamName(user)}</bdi>
                  </td>
                  <td className={CELL}>
                    <div className="flex flex-wrap gap-1">
                      <Tag tone={user.isActive ? "ok" : "neutral"}>
                        {t(user.isActive ? "users.status.active" : "users.status.inactive")}
                      </Tag>
                      {user.isDemo ? <Tag tone="info">{t("users.status.demo")}</Tag> : null}
                      {user.mustChangePassword ? (
                        <Tag tone="warn">{t("users.status.mustChange")}</Tag>
                      ) : null}
                    </div>
                  </td>
                  <td className={CELL}>
                    {user.id === currentUser.id ? (
                      <span className="text-sm text-muted">{t("users.you")}</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <ResetPasswordDialog api={api} user={user} onDone={refresh} />
                        {user.isActive ? (
                          <DeactivateDialog api={api} user={user} onDone={refresh} />
                        ) : (
                          <Button
                            disabled={reactivate.isPending}
                            onClick={() => reactivate.mutate(user.id)}
                          >
                            {t("users.reactivate")}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    </>
  );
}
