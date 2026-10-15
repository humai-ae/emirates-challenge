export const uiEn = {
  appName: "HR Compliance Checker",
  syntheticData: "Synthetic data only",
  language: { label: "Language", en: "English", ar: "العربية" },
  nav: { label: "Main", switchRole: "Switch role", signOut: "Sign out" },
  roles: {
    admin: "Admin",
    analyst: "Compliance analyst",
    lead: "Ops team lead",
    auditor: "Internal auditor",
  },
  states: { loading: "Loading…", error: "Something went wrong. Try again." },
  audit: {
    title: "Audit log",
    subtitle:
      "Every action by people and by the system, newest first. Entries can't be edited or deleted.",
    columns: { when: "When", who: "Who", what: "What", object: "Object" },
    actions: {
      auth_sign_in: "signed in",
      auth_sign_out: "signed out",
      user_preferences_update: "changed language to {{locale}}",
      audit_integrity_check: "checked that the audit log is intact",
    },
    empty: "No entries yet.",
    checkIntegrity: "Check nothing has been changed",
    integrityOk: "All {{count}} entries are intact. Nothing has been changed or removed.",
    integrityBroken:
      "Entry {{eventId}} has been changed since it was written. Treat everything after it as unreliable.",
    reason: "Reason: {{reason}}",
    showMore: "Show more",
  },
} as const;
