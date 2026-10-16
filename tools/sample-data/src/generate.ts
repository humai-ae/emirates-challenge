import { createRandom, type Random } from "./random.ts";

export const RULE_IDS = [
  "R-01",
  "R-02",
  "R-03",
  "R-04",
  "R-05",
  "R-06",
  "R-09",
  "R-10",
  "R-11",
  "R-12",
  "R-13",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface PackOptions {
  seed: number;
  employees: number;
  transactions: number;
}

export interface AnswerKeyRow {
  transactionId: string;
  ruleId: RuleId;
}

export interface SamplePack {
  files: {
    "transactions.csv": string;
    "employees.csv": string;
    "policy_rules.md": string;
    "finding_format.csv": string;
    "answer_key.csv": string;
  };
  answerKey: AnswerKeyRow[];
}

const YEAR = 2025;
const DAY_MS = 86_400_000;
const DEPARTMENTS = [
  "Cabin Services",
  "Engineering",
  "Ground Operations",
  "Flight Operations",
  "Cargo",
  "Catering",
  "Finance",
  "Human Resources",
  "Information Technology",
  "Sales",
] as const;
const LOCATIONS = ["Dubai", "Abu Dhabi", "Sharjah"] as const;
const TYPE_WEIGHTS = [
  ["allowance_change", 30],
  ["pay_change", 25],
  ["overtime", 20],
  ["promotion", 10],
  ["transfer", 10],
  ["exit", 5],
] as const;
type TransactionType = (typeof TYPE_WEIGHTS)[number][0];
const GRADE_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [13, 2],
  [12, 3],
  [11, 4],
  [10, 6],
  [9, 8],
  [8, 10],
  [7, 12],
  [6, 12],
  [5, 12],
  [4, 10],
  [3, 8],
  [2, 7],
  [1, 6],
];
const DOCUMENTS: Record<TransactionType, string> = {
  allowance_change: "allowance_form",
  pay_change: "pay_change_form",
  overtime: "timesheet",
  promotion: "promotion_form;performance_review",
  transfer: "transfer_form",
  exit: "resignation_letter;clearance_form",
};
const JUSTIFICATIONS = [
  "Annual performance review",
  "Market rate adjustment",
  "Retention after external offer",
  "Additional responsibilities",
  "Peak season cover",
  "Role scope increased",
  "Housing cost review",
  "Project delivery bonus",
] as const;

interface Employee {
  id: string;
  grade: number;
  department: string;
  location: string;
  managerId: string | null;
  hireDate: string;
  exitDate: string | null;
}

interface Transaction {
  id: string;
  type: TransactionType;
  employee: Employee;
  amount: number | null;
  effectiveDate: string;
  requesterId: string;
  approverIds: [string, string];
  submittedAt: string;
  approvedAt: string;
  documents: string;
  justification: string;
  violation: RuleId | null;
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function at(random: Random, isoDate: string): string {
  const hour = String(random.int(8, 17)).padStart(2, "0");
  const minute = String(random.int(0, 59)).padStart(2, "0");
  return `${isoDate} ${hour}:${minute}`;
}

function makeEmployees(random: Random, count: number): Employee[] {
  const id = (n: number) => `E-${String(n).padStart(4, "0")}`;
  const hired = () => addDays("2005-01-01", random.int(0, 6900));
  const ceo: Employee = {
    id: id(1),
    grade: 15,
    department: "Executive Office",
    location: "Dubai",
    managerId: null,
    hireDate: "2005-01-01",
    exitDate: null,
  };
  const employees: Employee[] = [ceo];
  for (const department of DEPARTMENTS) {
    if (employees.length >= count) break;
    employees.push({
      id: id(employees.length + 1),
      grade: 14,
      department,
      location: random.pick(LOCATIONS),
      managerId: ceo.id,
      hireDate: hired(),
      exitDate: null,
    });
  }
  while (employees.length < count) {
    const department = random.pick(DEPARTMENTS);
    const grade = random.weighted(GRADE_WEIGHTS);
    const seniors = employees.filter(
      (person) => person.department === department && person.grade > grade,
    );
    const manager = seniors.length > 0 ? random.pick(seniors) : ceo;
    employees.push({
      id: id(employees.length + 1),
      grade,
      department,
      location: random.pick(LOCATIONS),
      managerId: manager.id,
      hireDate: hired(),
      exitDate: null,
    });
  }
  // About one in thirty people joined this year (at least one) and one in twenty-five leaves
  // during the year (at least two): never the CEO or a department head, and never the same person.
  const ordinary = employees.filter((person) => person.grade < 14);
  for (let index = ordinary.length - 1; index > 0; index -= 1) {
    const other = random.int(0, index);
    const [a, b] = [ordinary[index], ordinary[other]];
    if (a && b) [ordinary[index], ordinary[other]] = [b, a];
  }
  const joiners = Math.max(1, Math.round(ordinary.length * 0.03));
  const leavers = Math.max(2, Math.round(ordinary.length * 0.04));
  ordinary.forEach((person, index) => {
    if (index < joiners) person.hireDate = addDays(`${YEAR}-01-01`, random.int(0, 58));
    else if (index < joiners + leavers) {
      person.exitDate = addDays(`${YEAR}-01-01`, random.int(30, 360));
    }
  });
  return employees;
}

function amountFor(random: Random, type: TransactionType): number | null {
  switch (type) {
    case "allowance_change":
      return random.int(5, 200) * 100;
    case "pay_change":
      return random.int(10, 300) * 100;
    case "overtime":
      return random.int(1, 50) * 100;
    default:
      return null;
  }
}

function makeTransactions(random: Random, employees: Employee[], count: number): Transaction[] {
  const [ceo] = employees;
  if (!ceo) throw new Error("A pack needs at least one employee");
  const byId = new Map(employees.map((person) => [person.id, person]));
  const managerOf = (person: Employee) => byId.get(person.managerId ?? "") ?? ceo;
  /** The person's managers, nearest first. */
  const chainOf = (person: Employee): Employee[] => {
    const chain: Employee[] = [];
    let current = person;
    while (current.managerId) {
      const manager = byId.get(current.managerId);
      if (!manager || chain.includes(manager)) break;
      chain.push(manager);
      current = manager;
    }
    return chain;
  };
  const heads = new Map(
    employees.filter((person) => person.grade === 14).map((person) => [person.department, person]),
  );
  /**
   * Who raises a transaction: the employee's manager. A department head's manager is the CEO, who
   * approves it, so the head of HR raises it (the head of Finance for HR's own head).
   */
  const requesterOf = (employee: Employee): Employee => {
    const manager = managerOf(employee);
    if (manager.id !== ceo.id) return manager;
    const hr = heads.get("Human Resources");
    return (hr && hr.id !== employee.id ? hr : heads.get("Finance")) ?? manager;
  };
  const joinedThisYear = (person: Employee) => person.hireDate >= `${YEAR}-01-01`;
  const subjects = employees.filter((person) => person.grade < 15);
  const leavers = subjects.filter((person) => person.exitDate !== null);
  const seniors = employees.filter((person) => person.grade >= 12);
  const allowances = new Map<string, Transaction[]>();
  const payChanges = new Map<string, Transaction[]>();
  const withinAWeek = (a: string, b: string) =>
    Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) <= 7 * DAY_MS;
  /** Another pay change for the same person and amount within a week would make a duplicate. */
  const clashes = (
    employee: Employee,
    effectiveDate: string,
    amount: number | null,
    except?: Transaction,
  ) =>
    (payChanges.get(employee.id) ?? []).some(
      (other) =>
        other !== except &&
        other.amount === amount &&
        withinAWeek(other.effectiveDate, effectiveDate),
    );
  const pickOther = (pool: readonly Employee[], excluded: ReadonlySet<string>) => {
    const choices = pool.filter((person) => !excluded.has(person.id));
    return choices.length > 0 ? random.pick(choices) : ceo;
  };

  let exits = 0;
  const build = (
    type: TransactionType,
    employee: Employee,
    effectiveDate: string,
    amount: number | null,
  ): Transaction => {
    const requester = requesterOf(employee);
    const excluded = new Set([employee.id, requester.id]);
    let first = managerOf(requester);
    if (excluded.has(first.id)) first = pickOther(seniors, excluded);
    excluded.add(first.id);
    // Large amounts get a second, senior approver (grade 12+).
    const second = amount !== null && amount > 10_000 ? pickOther(seniors, excluded).id : "";
    const lead = random.int(5, 30);
    const submitted = addDays(effectiveDate, -lead);
    // Approved after submission and at least a day before the effective date.
    const approved = addDays(submitted, random.int(1, lead - 1));
    const needsReason = type === "allowance_change" || type === "pay_change" || type === "overtime";
    if (type === "exit") exits += 1;
    const letGo = type === "exit" && exits % 2 === 0;
    return {
      id: "",
      type,
      employee,
      amount,
      effectiveDate,
      requesterId: requester.id,
      approverIds: [first.id, second],
      submittedAt: at(random, submitted),
      approvedAt: at(random, approved),
      // Every other leaver was let go: a termination letter instead of a resignation letter.
      documents: letGo ? "termination_letter;clearance_form" : DOCUMENTS[type],
      justification: needsReason ? random.pick(JUSTIFICATIONS) : "",
      violation: null,
    };
  };

  const extraCount = Math.max(1, Math.round(count * 0.01));
  const transactions: Transaction[] = [];
  let nextLeaver = 0;
  // Room for the rows planted below: a third allowance change (R-05), a repeated pay change
  // (R-11) and an early pay change (R-12).
  while (transactions.length < count - extraCount * 3) {
    let type: TransactionType = random.weighted(TYPE_WEIGHTS);
    let employee = random.pick(subjects);
    if (type === "exit") {
      const leaver = leavers[nextLeaver];
      nextLeaver += 1;
      if (leaver) employee = leaver;
      else type = "overtime";
    }
    if (type === "allowance_change") {
      // At most two allowance changes per person, so base rows keep the frequency rule.
      for (
        let tries = 0;
        (allowances.get(employee.id)?.length ?? 0) >= 2 && tries < 20;
        tries += 1
      ) {
        employee = random.pick(subjects);
      }
      if ((allowances.get(employee.id)?.length ?? 0) >= 2) type = "overtime";
    }
    // People who joined this year get no pay change here: R-12 plants theirs.
    if (type === "pay_change" && joinedThisYear(employee)) type = "overtime";
    const effectiveDate =
      type === "exit" && employee.exitDate
        ? employee.exitDate
        : addDays(`${YEAR}-01-01`, random.int(14, 364));
    let amount = amountFor(random, type);
    while (type === "pay_change" && clashes(employee, effectiveDate, amount)) {
      amount = (amount ?? 0) + 100;
    }
    const transaction = build(type, employee, effectiveDate, amount);
    transactions.push(transaction);
    if (type === "allowance_change") {
      allowances.set(employee.id, [...(allowances.get(employee.id) ?? []), transaction]);
    }
    if (type === "pay_change") {
      payChanges.set(employee.id, [...(payChanges.get(employee.id) ?? []), transaction]);
    }
  }

  // R-05: a third allowance change, later than the person's two others, breaks the frequency rule.
  let planted = 0;
  for (const [employeeId, existing] of allowances) {
    if (planted >= extraCount) break;
    if (existing.length !== 2) continue;
    const latest =
      existing
        .map((item) => item.effectiveDate)
        .sort()
        .at(-1) ?? `${YEAR}-12-31`;
    const effectiveDate = addDays(latest, random.int(10, 40));
    const employee = byId.get(employeeId);
    if (!employee || effectiveDate > `${YEAR}-12-31`) continue;
    const extra = build("allowance_change", employee, effectiveDate, random.int(5, 90) * 100);
    extra.violation = "R-05";
    transactions.push(extra);
    planted += 1;
  }
  // R-11: a pay change repeated a few days later for the same person and amount, submitted after
  // the first.
  let repeats = 0;
  for (const original of transactions.filter((item) => item.type === "pay_change")) {
    if (repeats >= extraCount) break;
    const effectiveDate = addDays(original.effectiveDate, random.int(0, 7));
    if (effectiveDate > `${YEAR}-12-31`) continue;
    if (clashes(original.employee, effectiveDate, original.amount, original)) continue;
    const copy = build("pay_change", original.employee, effectiveDate, original.amount);
    const submitted = addDays(original.submittedAt, 1);
    copy.submittedAt = at(random, submitted);
    copy.approvedAt = at(random, addDays(submitted, 1));
    copy.violation = "R-11";
    transactions.push(copy);
    payChanges.set(original.employee.id, [...(payChanges.get(original.employee.id) ?? []), copy]);
    repeats += 1;
  }
  // R-12: a pay change for someone who joined this year, before 180 days of service.
  let early = 0;
  for (const joiner of subjects.filter(joinedThisYear)) {
    if (early >= extraCount) break;
    const effectiveDate = addDays(joiner.hireDate, random.int(30, 150));
    const extra = build("pay_change", joiner, effectiveDate, amountFor(random, "pay_change"));
    extra.violation = "R-12";
    transactions.push(extra);
    payChanges.set(joiner.id, [extra]);
    early += 1;
  }
  // Too few people with two allowance changes: fill up with overtime so the size is exact.
  while (transactions.length < count) {
    const employee = random.pick(subjects);
    const effectiveDate = addDays(`${YEAR}-01-01`, random.int(14, 364));
    transactions.push(build("overtime", employee, effectiveDate, amountFor(random, "overtime")));
  }

  const eligible = (predicate: (item: Transaction) => boolean) =>
    transactions.filter((item) => item.violation === null && predicate(item));
  const inLine = (item: Transaction, id: string) =>
    chainOf(item.employee).some((person) => person.id === id);
  // R-01: a large allowance change approved only by someone in the reporting line below grade 10.
  const juniorIn = (item: Transaction) =>
    chainOf(item.employee).find((person) => person.grade < 10 && person.id !== item.requesterId);
  eligible(
    (item) => item.type === "allowance_change" && (item.amount ?? 0) > 10_000 && !!juniorIn(item),
  ).forEach((item, index) => {
    const junior = juniorIn(item);
    if (index % 3 !== 0 || !junior) return;
    item.approverIds = [junior.id, ""];
    item.violation = "R-01";
  });
  // R-02: the requester, someone in the employee's reporting line, approves their own request.
  eligible((item) => item.type === "transfer" || item.type === "promotion").forEach(
    (item, index) => {
      if (index % 8 !== 1 || !inLine(item, item.requesterId)) return;
      item.approverIds = [item.requesterId, item.approverIds[1]];
      item.violation = "R-02";
    },
  );
  // R-03: an exit without its clearance form, or with neither a resignation nor a termination
  // letter.
  eligible((item) => item.type === "exit").forEach((item, index) => {
    if (index % 4 === 0) {
      item.documents = "resignation_letter";
      item.violation = "R-03";
    } else if (index % 4 === 2) {
      item.documents = "clearance_form";
      item.violation = "R-03";
    }
  });
  // R-04: a pay change approved after it took effect.
  eligible((item) => item.type === "pay_change").forEach((item, index) => {
    if (index % 16 !== 3) return;
    item.approvedAt = at(random, addDays(item.effectiveDate, random.int(1, 10)));
    item.violation = "R-04";
  });
  // R-06: a pay change above AED 5,000 without a justification.
  eligible((item) => item.type === "pay_change" && (item.amount ?? 0) > 5_000).forEach(
    (item, index) => {
      if (index % 12 !== 5) return;
      item.justification = "";
      item.violation = "R-06";
    },
  );

  // R-09: the first approver is a senior from outside the employee's reporting line.
  eligible((item) => item.type === "overtime").forEach((item, index) => {
    if (index % 25 !== 4) return;
    const line = new Set([
      ...chainOf(item.employee).map((person) => person.id),
      item.employee.id,
      item.requesterId,
    ]);
    const outsiders = seniors.filter((person) => !line.has(person.id));
    if (outsiders.length === 0) return;
    item.approverIds = [random.pick(outsiders).id, item.approverIds[1]];
    item.violation = "R-09";
  });
  // R-10: approved before it was submitted.
  eligible((item) => item.type === "transfer" || item.type === "promotion").forEach(
    (item, index) => {
      if (index % 10 !== 3) return;
      item.approvedAt = at(random, addDays(item.submittedAt, -random.int(1, 3)));
      item.violation = "R-10";
    },
  );
  // R-13: the employee requests their own allowance change or promotion, or approves their own
  // transfer.
  eligible((item) => item.type === "allowance_change" || item.type === "promotion").forEach(
    (item, index) => {
      if (index % 20 !== 7) return;
      item.requesterId = item.employee.id;
      item.violation = "R-13";
    },
  );
  eligible((item) => item.type === "transfer").forEach((item, index) => {
    if (index % 12 !== 5) return;
    item.approverIds = [item.approverIds[0], item.employee.id];
    item.violation = "R-13";
  });
  // Allowed, not a break: people may request their own overtime.
  eligible((item) => item.type === "overtime").forEach((item, index) => {
    if (index % 30 === 11) item.requesterId = item.employee.id;
  });

  // Data issues for the upload to report, on overtime rows that break no rule.
  const overtime = eligible((item) => item.type === "overtime");
  overtime.forEach((item, index) => {
    if (index % 40 === 3) item.approverIds = [`E-9${String(index).padStart(3, "0")}`, ""];
    if (index % 60 === 7) item.approverIds = ["", ""];
  });

  transactions.sort((a, b) =>
    a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : 0,
  );
  transactions.forEach((item, index) => {
    item.id = `TX-${String(index + 1).padStart(6, "0")}`;
  });
  const [, , , , , , , , , , original, duplicate] = overtime;
  if (original && duplicate) duplicate.id = original.id;
  return transactions;
}

function csv(
  header: readonly string[],
  rows: ReadonlyArray<readonly (string | number | null)[]>,
): string {
  const lines = [header, ...rows].map((row) =>
    row
      .map((value) => {
        const text = value === null ? "" : String(value);
        if (/[",\n]/.test(text))
          throw new Error(`Sample values must not contain commas or quotes: ${text}`);
        return text;
      })
      .join(","),
  );
  return `${lines.join("\n")}\n`;
}

const POLICY = `# HR transaction policy (synthetic sample)

## R-01 Approval of large allowance changes
Allowance changes above AED 10,000 must be approved by at least one approver at Grade 10 or above.

## R-02 No self-approval
The person who requests a transaction must not also approve it.

## R-03 Exit documents
Every exit must have a resignation letter or a termination letter, and a clearance form attached.

## R-04 Pay changes approved before they take effect
Pay changes must be approved on or before their effective date.

## R-05 Frequency of allowance changes
An employee may have at most 2 allowance changes in any 12-month period.

## R-06 Justification for pay changes
Pay changes above AED 5,000 must include a justification.

## R-07 Quality of justifications
Justifications for pay changes above AED 5,000 must give a clear business reason.

## R-08 Timely submission
Transactions must be submitted no later than 30 days after their effective date.

## R-09 Approval in the reporting line
The first approver must be the employee's line manager or someone above them in the reporting line.

## R-10 Approval after submission
A transaction must not be approved before it was submitted.

## R-11 Duplicate pay changes
Two pay changes for the same employee with the same amount and effective dates 7 days or less apart are duplicates; the one submitted later is flagged.

## R-12 No early pay changes
Pay changes must not take effect less than 180 days after the employee's hire date.

## R-13 No self-service
Employees must not approve their own transactions or request them, except overtime, which they may request themselves.
`;

function finding(item: Transaction, grades: ReadonlyMap<string, number>): (string | number)[] {
  const approverGrades = item.approverIds
    .filter(Boolean)
    .map((approver) => grades.get(approver) ?? "unknown")
    .join(";");
  switch (item.violation) {
    case "R-01":
      return [
        item.id,
        "R-01",
        "High",
        `Allowance change of AED ${item.amount} approved without a Grade 10 or above approver`,
        `amount=${item.amount}; approver grades=${approverGrades}`,
        "Payroll & Compensation",
        "Get approval from a Grade 10 or above manager and record it",
      ];
    case "R-02":
      return [
        item.id,
        "R-02",
        "High",
        `Requester ${item.requesterId} also approved the transaction`,
        `requester=${item.requesterId}; approver=${item.approverIds[0]}`,
        "HR Operations",
        "Have a different manager approve the transaction",
      ];
    case "R-03":
      return [
        item.id,
        "R-03",
        "Medium",
        item.documents.includes("clearance_form")
          ? "Exit has neither a resignation nor a termination letter"
          : "Exit is missing the clearance form",
        `documents=${item.documents}`,
        "HR Operations",
        item.documents.includes("clearance_form")
          ? "Attach the resignation or termination letter"
          : "Attach the signed clearance form",
      ];
    case "R-04":
      return [
        item.id,
        "R-04",
        "Medium",
        "Pay change approved after its effective date",
        `approved_at=${item.approvedAt}; effective_date=${item.effectiveDate}`,
        "Payroll & Compensation",
        "Confirm the late approval and record the reason",
      ];
    default:
      return [
        item.id,
        item.violation ?? "",
        "Low",
        `Third allowance change for ${item.employee.id} within 12 months`,
        "allowance changes in window=3",
        "Payroll & Compensation",
        "Review the allowance history with the line manager",
      ];
  }
}

export function generatePack(options: PackOptions): SamplePack {
  const random = createRandom(options.seed);
  const employees = makeEmployees(random, options.employees);
  const transactions = makeTransactions(random, employees, options.transactions);
  const grades = new Map(employees.map((person) => [person.id, person.grade]));
  const answerKey: AnswerKeyRow[] = transactions
    .flatMap((item) => (item.violation ? [{ transactionId: item.id, ruleId: item.violation }] : []))
    .sort((a, b) =>
      a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : 0,
    );
  const examples = (["R-01", "R-02", "R-03", "R-04", "R-05"] as const).flatMap((ruleId) => {
    const item = transactions.find((candidate) => candidate.violation === ruleId);
    return item ? [item] : [];
  });
  return {
    files: {
      "transactions.csv": csv(
        [
          "transaction_id",
          "type",
          "employee_id",
          "grade",
          "department",
          "amount",
          "currency",
          "effective_date",
          "requester_id",
          "approver_1_id",
          "approver_2_id",
          "submitted_at",
          "approved_at",
          "documents",
          "justification",
        ],
        transactions.map((item) => [
          item.id,
          item.type,
          item.employee.id,
          item.employee.grade,
          item.employee.department,
          item.amount,
          item.amount === null ? "" : "AED",
          item.effectiveDate,
          item.requesterId,
          item.approverIds[0],
          item.approverIds[1],
          item.submittedAt,
          item.approvedAt,
          item.documents,
          item.justification,
        ]),
      ),
      "employees.csv": csv(
        ["employee_id", "grade", "department", "location", "manager_id", "hire_date", "exit_date"],
        employees.map((person) => [
          person.id,
          person.grade,
          person.department,
          person.location,
          person.managerId ?? "",
          person.hireDate,
          person.exitDate ?? "",
        ]),
      ),
      "policy_rules.md": POLICY,
      "finding_format.csv": csv(
        [
          "finding_id",
          "transaction_id",
          "rule_id",
          "severity",
          "description",
          "evidence",
          "owner",
          "recommended_action",
        ],
        examples.map((item, index) => [
          `F-${String(index + 1).padStart(4, "0")}`,
          ...finding(item, grades),
        ]),
      ),
      "answer_key.csv": csv(
        ["transaction_id", "rule_id"],
        answerKey.map((row) => [row.transactionId, row.ruleId]),
      ),
    },
    answerKey,
  };
}
