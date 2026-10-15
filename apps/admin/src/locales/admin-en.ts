export const adminEn = {
  nav: {
    home: "Home",
    setup: "Set up",
    data: "Data",
    rules: "Rules",
    runs: "Runs",
    dashboard: "Dashboard",
    teams: "Teams",
    users: "Users",
    audit: "Audit log",
  },
  home: {
    greeting: "Welcome, {{name}}",
    intro: "Set up the checker, manage rules and people, and follow the results.",
    shortcuts: {
      setup: "Upload the four files and get the checker ready.",
      data: "Datasets, columns and data issues.",
      rules: "Review, approve and retire rules.",
      runs: "Start a check and follow its progress.",
      dashboard: "Hotspots and trends across checks.",
      teams: "Who owns each transaction type.",
      users: "Add people, reset passwords and deactivate accounts.",
      audit: "Every action, and a check that nothing was changed.",
    },
  },
  users: {
    title: "Users",
    subtitle: "Everyone who can sign in. New users choose their own password at first sign-in.",
    add: "Add user",
    columns: {
      name: "Name",
      email: "Email",
      role: "Role",
      team: "Team",
      status: "Status",
      actions: "Actions",
    },
    status: {
      active: "Active",
      inactive: "Deactivated",
      demo: "Demo",
      mustChange: "Must change password",
    },
    you: "You",
    deactivate: "Deactivate",
    reactivate: "Reactivate",
    resetPassword: "Reset password",
    created: "{{email}} can now sign in with the temporary password.",
    form: {
      title: "Add a user",
      displayName: "Full name",
      email: "Work email",
      role: "Role",
      team: "Team",
      chooseTeam: "Choose a team",
      language: "Language",
      password: "Temporary password",
      passwordHint:
        "At least 12 characters. Give it to the user; they choose their own at first sign-in.",
      submit: "Add user",
      cancel: "Cancel",
    },
    deactivateDialog: {
      title: "Deactivate {{name}}?",
      body: "They are signed out and can't sign in until reactivated. Their history stays.",
      confirm: "Deactivate",
      cancel: "Cancel",
    },
    resetDialog: {
      title: "Reset the password for {{name}}",
      body: "They are signed out everywhere and choose a new password at their next sign-in.",
      password: "New temporary password",
      submit: "Reset password",
      cancel: "Cancel",
    },
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
