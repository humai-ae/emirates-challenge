import { type Evidence, type Expression, PRESET_CATALOGUE } from "@hrcc/shared";
import { FIRST_APPROVER } from "../dataset.js";
import {
  appliesToTypes,
  built,
  Columns,
  knownNumbers,
  numberOf,
  numberParam,
  rawList,
  rawOf,
  roleName,
  textParam,
} from "./common.js";
import type { PresetDefinition, RowContext } from "./types.js";

/** The approvers' grades, by the employees file's grade column. */
function approverGrades(row: RowContext): string {
  return `approvers[].${row.dataset.roleColumn("employees", "grade")?.name ?? "grade"}`;
}

/** "Allowance changes above AED 10,000 need an approver at Grade 10 or above." */
export const approverMinGrade: PresetDefinition = {
  id: "approver_min_grade",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.approver_min_grade.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const amount = columns.role("transactions", "amount");
    columns.role("transactions", "approver_ids");
    const grade = columns.role("employees", "grade");
    return built(columns, appliesToTypes(params, columns), {
      and: [
        { ">": [{ var: amount }, { param: "amount_limit" }] },
        {
          none: [
            { var: `approvers[].${grade}` },
            { ">=": [{ var: "" }, { param: "min_approver_grade" }] },
          ],
        },
      ],
    });
  },
  evidence(row) {
    const amount = roleName(row, "amount") ?? "amount";
    const grades = approverGrades(row);
    return [
      {
        field: amount,
        value: rawOf(row, amount),
        condition: `> ${numberParam(row.params, "amount_limit")}`,
      },
      {
        field: grades,
        value: rawList(row, grades),
        condition: `none >= ${numberParam(row.params, "min_approver_grade")}`,
      },
    ];
  },
  nearMiss(row) {
    const amountColumn = roleName(row, "amount");
    if (!amountColumn) return null;
    const grades = approverGrades(row);
    const amount = numberOf(row, amountColumn);
    const known = knownNumbers(row, grades);
    if (amount === null || known === null || known.length === 0) return null;
    const limit = numberParam(row.params, "amount_limit");
    const minimum = numberParam(row.params, "min_approver_grade");
    const best = Math.max(...known);
    const amountFact = (condition: string) => ({
      field: amountColumn,
      value: rawOf(row, amountColumn),
      condition,
    });
    const gradeFact = (condition: string) => ({
      field: grades,
      value: rawList(row, grades),
      condition,
    });
    if (amount <= limit && amount >= limit * 0.9 && best < minimum) {
      return {
        reason: "amount_just_under_limit",
        facts: [amountFact(`<= ${limit}`), gradeFact(`none >= ${minimum}`)],
      };
    }
    if (amount > limit && best === minimum) {
      return {
        reason: "approver_at_minimum_grade",
        facts: [amountFact(`> ${limit}`), gradeFact(`max == ${minimum}`)],
      };
    }
    return null;
  },
};

/** "Approver 1 must be the employee's line manager, or someone above them." */
export const approverIsManager: PresetDefinition = {
  id: "approver_is_manager",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.approver_is_manager.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const employee = columns.role("transactions", "employee_id");
    columns.role("transactions", "approver_ids");
    columns.role("employees", "manager_id");
    const staffId = columns.role("employees", "employee_id");
    const levels = textParam(params, "reach") === "line_manager" ? [1] : [];
    const inLine = (approver: Expression): Expression => ({
      in_manager_chain: [{ var: employee }, approver, ...levels],
    });
    // Any approver: each is read through the employees file, so one it doesn't know is named.
    const logic: Expression =
      textParam(params, "approver") === "first"
        ? { "!": inLine({ var: FIRST_APPROVER }) }
        : { none: [{ var: `approvers[].${staffId}` }, inLine({ var: "" })] };
    return built(columns, appliesToTypes(params, columns), logic);
  },
  evidence(row) {
    const employeeColumn = roleName(row, "employee_id") ?? "employee_id";
    const employeeId = rawOf(row, employeeColumn);
    const lineManager = textParam(row.params, "reach") === "line_manager";
    const chain = row.dataset.managerChain(employeeId) ?? [];
    const approvers = row.dataset.approverIds(row.rowIndex);
    const test = lineManager ? "line_manager" : "in reporting_line";
    const [first] = approvers;
    const named =
      textParam(row.params, "approver") === "first"
        ? {
            field: first?.key.name ?? FIRST_APPROVER,
            value: first?.id ?? "",
            condition: `not ${test}`,
          }
        : {
            field: "approvers[]",
            value: approvers.map((item) => item.id),
            condition: `none ${test}`,
          };
    return [
      { field: employeeColumn, value: employeeId, condition: "" },
      named,
      {
        field: lineManager ? "line_manager" : "reporting_line",
        value: lineManager ? chain.slice(0, 1) : [...chain],
        condition: "",
      },
    ];
  },
};

/**
 * The facts behind "the person in `role` is also an approver". When they aren't, the facts are
 * who they are and who approved, as the transaction has them.
 */
function approverEvidence(row: RowContext, role: "requester_id" | "employee_id"): Evidence[] {
  const person = roleName(row, role) ?? role;
  const personId = rawOf(row, person);
  const approvers = row.dataset.approverIds(row.rowIndex);
  const approver = approvers.find((item) => item.id === personId.trim())?.key.name;
  if (!approver) {
    return [
      { field: person, value: personId, condition: "" },
      { field: "approvers[]", value: approvers.map((item) => item.id), condition: "" },
    ];
  }
  return [
    { field: person, value: personId, condition: `== ${approver}` },
    { field: approver, value: personId, condition: `== ${person}` },
  ];
}

/** "The person who requests a transaction must not also approve it." */
export const requesterNotApprover: PresetDefinition = {
  id: "requester_not_approver",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.requester_not_approver.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const requester = columns.role("transactions", "requester_id");
    columns.role("transactions", "approver_ids");
    return built(columns, appliesToTypes(params, columns), {
      some: [{ var: "approvers[]" }, { same_person: [{ var: "" }, { var: requester }] }],
    });
  },
  evidence: (row) => approverEvidence(row, "requester_id"),
};

/** "Employees must not approve their own transactions, nor request them (leave excepted)." */
export const subjectNotApprover: PresetDefinition = {
  id: "subject_not_approver",
  checkKind: "structured",
  parameters: PRESET_CATALOGUE.subject_not_approver.parameters,
  build(params, dataset) {
    const columns = new Columns(dataset);
    const employee = columns.role("transactions", "employee_id");
    columns.role("transactions", "approver_ids");
    const approves: Expression = {
      some: [{ var: "approvers[]" }, { same_person: [{ var: "" }, { var: employee }] }],
    };
    if (params.get("not_requester") == null) {
      return built(columns, appliesToTypes(params, columns), approves);
    }
    const requester = columns.role("transactions", "requester_id");
    const type = columns.role("transactions", "type");
    return built(columns, appliesToTypes(params, columns), {
      or: [
        approves,
        {
          and: [
            { in: [{ var: type }, { param: "not_requester" }] },
            { same_person: [{ var: requester }, { var: employee }] },
          ],
        },
      ],
    });
  },
  evidence(row) {
    const employee = roleName(row, "employee_id") ?? "employee_id";
    const employeeId = rawOf(row, employee);
    const approves = row.dataset.approverIds(row.rowIndex).some((item) => item.id === employeeId);
    if (approves || row.params.get("not_requester") == null) {
      return approverEvidence(row, "employee_id");
    }
    const requester = roleName(row, "requester_id") ?? "requester_id";
    const type = roleName(row, "type") ?? "type";
    return [
      { field: employee, value: employeeId, condition: `== ${requester}` },
      { field: requester, value: rawOf(row, requester), condition: `== ${employee}` },
      { field: type, value: rawOf(row, type), condition: "in not_requester" },
    ];
  },
};
