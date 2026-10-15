export const adminEn = {
  nav: {
    setup: "Set up",
    data: "Data",
    rules: "Rules",
    runs: "Runs",
    dashboard: "Dashboard",
    teams: "Teams",
    audit: "Audit log",
  },
  pages: {
    setup: {
      title: "Set up the checker",
      emptyTitle: "Upload the four files to get started",
      emptyBody:
        "You'll upload transactions.csv, employees.csv, policy_rules.md and finding_format.csv from the data pack here.",
    },
    data: {
      title: "Data",
      emptyTitle: "No data loaded yet",
      emptyBody: "Upload transactions and employees to see row counts, columns and data issues.",
    },
    rules: {
      title: "Rules",
      emptyTitle: "No rules yet",
      emptyBody:
        "Upload a policy document or write a rule. Load data first so rules can be matched to your columns.",
    },
    runs: {
      title: "Runs",
      emptyTitle: "No checks run yet",
      emptyBody: "Approve at least one rule first.",
    },
    dashboard: {
      title: "Dashboard: hotspots and trends",
      emptyTitle: "No checks run yet",
      emptyBody: "Hotspots and trends appear after the first check.",
    },
    teams: {
      title: "Teams and routing",
      emptyTitle: "No teams proposed yet",
      emptyBody:
        "After the first upload, the system proposes a team for each transaction type for you to confirm.",
    },
  },
} as const;
