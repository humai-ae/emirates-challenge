export const webEn = {
  signIn: {
    title: "Who are you?",
    subtitle: "Pick a demo user. In the real product this comes from your organisation's sign-in.",
    continueAs: "Continue as {{name}}",
    disabled: "Demo sign-in is turned off. Use your organisation's sign-in.",
    roleHelp: {
      admin: "Uploads the data and policy, approves rules and runs checks.",
      analyst: "Reviews each exception and decides whether it is a real problem.",
      lead: "Fixes confirmed issues for their team and records what was done.",
      auditor: "Reviews evidence, trends and the audit trail. Read-only.",
    },
  },
  nav: {
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
