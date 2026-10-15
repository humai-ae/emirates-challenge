import { createRandom, type Random } from "./random.ts";

export const RULE_IDS = ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06"] as const;
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
  const hired = () => addDays("2005-01-01", random.int(0, 7300));
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
  // About one in twenty-five people leaves during the year; never the CEO or a department head.
  for (const person of employees) {
    if (person.grade < 14 && random.next() < 0.04) {
      person.exitDate = addDays(`${YEAR}-01-01`, random.int(30, 360));
    }
  }
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
  const subjects = employees.filter((person) => person.grade < 15);
  const leavers = subjects.filter((person) => person.exitDate !== null);
  const seniors = employees.filter((person) => person.grade >= 12);
  const juniors = employees.filter((person) => person.grade >= 5 && person.grade <= 9);
  const allowances = new Map<string, Transaction[]>();
  const pickOther = (pool: readonly Employee[], excluded: ReadonlySet<string>) => {
    const choices = pool.filter((person) => !excluded.has(person.id));
    return choices.length > 0 ? random.pick(choices) : ceo;
  };

  const build = (
    type: TransactionType,
    employee: Employee,
    effectiveDate: string,
    amount: number | null,
  ): Transaction => {
    const requester = managerOf(employee);
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
      documents: DOCUMENTS[type],
      justification: needsReason ? random.pick(JUSTIFICATIONS) : "",
      violation: null,
    };
  };

  const extraCount = Math.max(1, Math.round(count * 0.01));
  const transactions: Transaction[] = [];
  let nextLeaver = 0;
  while (transactions.length < count - extraCount) {
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
    const effectiveDate =
      type === "exit" && employee.exitDate
        ? employee.exitDate
        : addDays(`${YEAR}-01-01`, random.int(14, 364));
    const transaction = build(type, employee, effectiveDate, amountFor(random, type));
    transactions.push(transaction);
    if (type === "allowance_change") {
      allowances.set(employee.id, [...(allowances.get(employee.id) ?? []), transaction]);
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
  // Too few people with two allowance changes: fill up with overtime so the size is exact.
  while (transactions.length < count) {
    const employee = random.pick(subjects);
    const effectiveDate = addDays(`${YEAR}-01-01`, random.int(14, 364));
    transactions.push(build("overtime", employee, effectiveDate, amountFor(random, "overtime")));
  }

  const eligible = (predicate: (item: Transaction) => boolean) =>
    transactions.filter((item) => item.violation === null && predicate(item));
  // R-01: a large allowance change approved only by someone below grade 10.
  eligible((item) => item.type === "allowance_change" && (item.amount ?? 0) > 10_000).forEach(
    (item, index) => {
      if (index % 6 !== 2) return;
      item.approverIds = [pickOther(juniors, new Set([item.employee.id, item.requesterId])).id, ""];
      item.violation = "R-01";
    },
  );
  // R-02: the requester approves their own request.
  eligible((item) => item.type === "transfer" || item.type === "promotion").forEach(
    (item, index) => {
      if (index % 8 !== 1) return;
      item.approverIds = [item.requesterId, item.approverIds[1]];
      item.violation = "R-02";
    },
  );
  // R-03: an exit without its clearance form.
  eligible((item) => item.type === "exit").forEach((item, index) => {
    if (index % 4 !== 0) return;
    item.documents = "resignation_letter";
    item.violation = "R-03";
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
Every exit must have a resignation letter and a clearance form attached.

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
        "Exit is missing the clearance form",
        `documents=${item.documents}`,
        "HR Operations",
        "Attach the signed clearance form",
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
