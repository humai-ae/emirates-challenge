export const webEn = {
  signIn: {
    title: "Sign in",
    subtitle: "Use your work email and password.",
    email: "Work email",
    password: "Password",
    submit: "Sign in",
  },
  nav: {
    home: "Home",
    report: "Daily report",
    inbox: "Exceptions inbox",
    fixChecks: "Fix checks",
    secondOpinions: "Second opinions",
    requests: "Request a rule",
    queue: "My team queue",
    overview: "Overview",
    findings: "Findings",
    auditLog: "Audit log",
    evidence: "Evidence",
    rules: "Rule register",
  },
  home: {
    greeting: "Welcome, {{name}}",
    intro: {
      analyst: "Review exceptions, check fixes and ask for new rules.",
      lead: "Fix confirmed issues for {{team}} and record what was done.",
      auditor: "Read-only access to evidence, trends and the audit trail.",
    },
    shortcuts: {
      report: "Today's summary, and where you start a check.",
      inbox: "Exceptions waiting for your decision.",
      fixChecks: "Fixes teams have marked done, waiting for your check.",
      secondOpinions: "Transactions where the AI disagrees with a rule check.",
      requests: "Ask for a rule the checks don't cover yet.",
      queue: "Confirmed issues for your team and what each one needs.",
      overview: "Readiness, open exceptions, hotspots and trends.",
      findings: "Every exception from every check, with its evidence.",
      auditLog: "Every action, and a check that nothing was changed.",
      evidence: "An evidence pack for each completed check.",
      rules: "Approved rules and every version of each.",
    },
  },
  pages: {
    report: {
      title: "Daily report",
      emptyTitle: "No check has run yet",
      emptyBody: "A summary appears here after an admin approves rules and a check runs.",
    },
    inbox: {
      title: "Exceptions inbox",
      emptyTitle: "No flags waiting",
      emptyBody: "No checks have run yet.",
    },
    fixChecks: {
      title: "Fix checks",
      emptyTitle: "Nothing to close",
      emptyBody: "When a team marks an issue fixed, it appears here for you to check.",
    },
    secondOpinions: {
      title: "Second opinions",
      emptyTitle: "No second opinions yet",
      emptyBody: "When the AI disagrees with a rule check, the transaction appears here.",
    },
    requests: {
      title: "Request a rule",
      emptyTitle: "You haven't requested any rules yet",
      emptyBody:
        "Seeing a problem the checks don't catch? Rule requests open once the policy is loaded.",
    },
    queue: {
      title: "My team queue",
      emptyTitle: "Nothing to fix",
      emptyBody: "Confirmed issues for {{team}} will appear here.",
    },
    overview: {
      title: "Readiness overview",
      emptyTitle: "No checks run yet",
      emptyBody: "Coverage, open exceptions, hotspots and trends appear after the first check.",
    },
    findings: {
      title: "Findings",
      emptyTitle: "No findings yet",
      emptyBody: "Every exception from every check is listed here with its full evidence.",
    },
    evidence: {
      title: "Evidence packs",
      emptyTitle: "Nothing to download yet",
      emptyBody: "An evidence pack is available for each completed check.",
    },
    rules: {
      title: "Rule register",
      emptyTitle: "No rules yet",
      emptyBody: "Approved rules and every version of each rule appear here.",
    },
  },
} as const;
