import type {
  ApprovalRequirement,
  BindingRef,
  CapabilityRequirement,
  CheckerInput,
  OperationCall,
  OperationDecl,
  Program,
  TaskDecl,
  TypeRef,
} from "./ast.js";
import type { Diagnostic, DiagnosticCode, SourceSpan } from "./diagnostics.js";
import { knownEffects } from "./registry.js";

const knownEffectSet = new Set<string>(knownEffects);

export interface StructuralContractError {
  outcome: "STRUCTURAL_CONTRACT_ERROR";
  declarationKind: "OperationDecl" | "TaskDecl";
  declarationName: string;
  span: SourceSpan;
  message: string;
}

export interface ContractResolution {
  structuralErrors: StructuralContractError[];
  invalidOperations: ReadonlySet<string>;
  invalidTasks: ReadonlySet<string>;
}

export type AnalysisResult =
  | {
      status: "STRUCTURAL_ERROR";
      structuralErrors: StructuralContractError[];
      diagnostics: Diagnostic[];
    }
  | {
      status: "CHECKED";
      structuralErrors: [];
      diagnostics: Diagnostic[];
    };

export class StructuralContractFailure extends Error {
  readonly structuralErrors: StructuralContractError[];

  constructor(structuralErrors: StructuralContractError[]) {
    super(`Structural contract validation failed with ${structuralErrors.length} error(s)`);
    this.name = "StructuralContractFailure";
    this.structuralErrors = structuralErrors;
  }
}

function diagnostic(code: DiagnosticCode, span: SourceSpan, message: string): Diagnostic {
  return { code, span, message };
}

function structuralError(
  declaration: OperationDecl | TaskDecl,
  span: SourceSpan,
  message: string,
): StructuralContractError {
  return {
    outcome: "STRUCTURAL_CONTRACT_ERROR",
    declarationKind: declaration.kind,
    declarationName: declaration.name,
    span,
    message,
  };
}

function typeEquals(left: TypeRef, right: TypeRef): boolean {
  if (left.name !== right.name || left.args.length !== right.args.length) return false;
  return left.args.every((arg, index) => typeEquals(arg, right.args[index]!));
}

function bindingEquals(left: BindingRef, right: BindingRef): boolean {
  return left.kind === right.kind && left.value === right.value;
}

function bindingArrayEquals(left: BindingRef[], right: BindingRef[]): boolean {
  return left.length === right.length && left.every((item, index) => bindingEquals(item, right[index]!));
}

function duplicateNames(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function validateBinding(
  binding: BindingRef,
  allowedIdentifiers: ReadonlySet<string>,
): boolean {
  return binding.kind === "string" || allowedIdentifiers.has(binding.value);
}

function validateApprovalBindings(
  approval: ApprovalRequirement,
  allowedIdentifiers: ReadonlySet<string>,
): boolean {
  return approval.args.every((arg) => validateBinding(arg, allowedIdentifiers));
}

function validateCapabilityBinding(
  capability: CapabilityRequirement,
  allowedIdentifiers: ReadonlySet<string>,
): boolean {
  return validateBinding(capability.scope, allowedIdentifiers);
}

function ensureBindingsValid(task: TaskDecl, allowedIdentifiers: ReadonlySet<string>): boolean {
  const allowed = new Set(allowedIdentifiers);
  allowed.add("result");

  for (const expr of task.ensures) {
    const operands = expr.kind === "equals" ? [expr.left, expr.right] : [expr.operand];
    for (const operand of operands) {
      if (operand.kind === "binding") {
        if (!validateBinding(operand.binding, allowed)) return false;
      } else if (!operand.args.every((arg) => validateBinding(arg, allowed))) {
        return false;
      }
    }
  }
  return true;
}

export function resolveContracts(program: Program): ContractResolution {
  const structuralErrors: StructuralContractError[] = [];
  const invalidOperations = new Set<string>();
  const invalidTasks = new Set<string>();

  const operations = program.declarations.filter((decl): decl is OperationDecl => decl.kind === "OperationDecl");
  const tasks = program.declarations.filter((decl): decl is TaskDecl => decl.kind === "TaskDecl");

  const operationCounts = new Map<string, number>();
  for (const operation of operations) operationCounts.set(operation.name, (operationCounts.get(operation.name) ?? 0) + 1);
  const taskCounts = new Map<string, number>();
  for (const task of tasks) taskCounts.set(task.name, (taskCounts.get(task.name) ?? 0) + 1);

  for (const operation of operations) {
    if ((operationCounts.get(operation.name) ?? 0) > 1) {
      structuralErrors.push(structuralError(operation, operation.span, `Duplicate operation name '${operation.name}'`));
      invalidOperations.add(operation.name);
    }

    const params = new Set(operation.params.map((param) => param.name));
    if (params.size !== operation.params.length) {
      structuralErrors.push(structuralError(operation, operation.span, "Duplicate operation parameter name"));
      invalidOperations.add(operation.name);
    }

    const duplicateEffects = duplicateNames(operation.effects.map((effect) => effect.name));
    const duplicateCapabilities = duplicateNames(operation.capabilities.map((capability) => capability.effect.name));
    const duplicateApprovals = duplicateNames(operation.approvals.map((approval) => approval.intent));
    if (duplicateEffects.length || duplicateCapabilities.length || duplicateApprovals.length) {
      structuralErrors.push(structuralError(operation, operation.span, "Duplicate operation contract item"));
      invalidOperations.add(operation.name);
    }

    if (!operation.capabilities.every((capability) => validateCapabilityBinding(capability, params))) {
      structuralErrors.push(structuralError(operation, operation.span, "Operation capability binding is unresolved"));
      invalidOperations.add(operation.name);
    }
    if (!operation.approvals.every((approval) => validateApprovalBindings(approval, params))) {
      structuralErrors.push(structuralError(operation, operation.span, "Operation approval binding is unresolved"));
      invalidOperations.add(operation.name);
    }

    const effects = new Set(operation.effects.map((effect) => effect.name));
    if (!operation.capabilities.every((capability) => effects.has(capability.effect.name))) {
      structuralErrors.push(structuralError(operation, operation.span, "Operation capability effect must be declared in operation effects"));
      invalidOperations.add(operation.name);
    }
  }

  const operationMap = new Map<string, OperationDecl>();
  for (const operation of operations) {
    if ((operationCounts.get(operation.name) ?? 0) === 1) operationMap.set(operation.name, operation);
  }

  for (const task of tasks) {
    if ((taskCounts.get(task.name) ?? 0) > 1) {
      structuralErrors.push(structuralError(task, task.span, `Duplicate task name '${task.name}'`));
      invalidTasks.add(task.name);
    }

    const params = new Set(task.params.map((param) => param.name));
    if (params.size !== task.params.length) {
      structuralErrors.push(structuralError(task, task.span, "Duplicate task parameter name"));
      invalidTasks.add(task.name);
    }

    const duplicateEffects = duplicateNames(task.effects.map((effect) => effect.name));
    const duplicateCapabilities = duplicateNames(task.capabilities.map((capability) => capability.effect.name));
    const duplicateApprovals = duplicateNames(task.approvals.map((approval) => approval.intent));
    if (duplicateEffects.length || duplicateCapabilities.length || duplicateApprovals.length) {
      structuralErrors.push(structuralError(task, task.span, "Duplicate task contract item"));
      invalidTasks.add(task.name);
    }

    if (!task.capabilities.every((capability) => validateCapabilityBinding(capability, params))) {
      structuralErrors.push(structuralError(task, task.span, "Task capability binding is unresolved"));
      invalidTasks.add(task.name);
    }
    if (!task.approvals.every((approval) => validateApprovalBindings(approval, params))) {
      structuralErrors.push(structuralError(task, task.span, "Task approval binding is unresolved"));
      invalidTasks.add(task.name);
    }
    if (!ensureBindingsValid(task, params)) {
      structuralErrors.push(structuralError(task, task.span, "Task ensures binding is unresolved"));
      invalidTasks.add(task.name);
    }

    for (const call of task.calls) {
      const operation = operationMap.get(call.operation);
      if (!operation || invalidOperations.has(call.operation)) {
        structuralErrors.push(structuralError(task, call.operationSpan, `Unresolved operation '${call.operation}'`));
        invalidTasks.add(task.name);
        continue;
      }
      if (call.args.length !== operation.params.length) {
        structuralErrors.push(structuralError(task, call.operationSpan, `Argument count mismatch for '${call.operation}'`));
        invalidTasks.add(task.name);
      }
      if (!call.args.every((arg) => validateBinding(arg, params))) {
        structuralErrors.push(structuralError(task, call.span, `Call binding is unresolved for '${call.operation}'`));
        invalidTasks.add(task.name);
      }
    }
  }

  return { structuralErrors, invalidOperations, invalidTasks };
}

function parameterTypeMap(task: TaskDecl): Map<string, TypeRef> {
  return new Map(task.params.map((param) => [param.name, param.type]));
}

function bindingType(binding: BindingRef, taskTypes: ReadonlyMap<string, TypeRef>): TypeRef | null {
  if (binding.kind === "string") {
    return { name: "Text", args: [], span: binding.span };
  }
  return taskTypes.get(binding.value) ?? null;
}

function substituteBinding(
  binding: BindingRef,
  operation: OperationDecl,
  call: OperationCall,
): BindingRef {
  if (binding.kind === "string") return binding;
  const index = operation.params.findIndex((param) => param.name === binding.value);
  return index >= 0 ? call.args[index]! : binding;
}

function expectedCapabilities(operation: OperationDecl, call: OperationCall): CapabilityRequirement[] {
  return operation.capabilities.map((capability) => ({
    effect: capability.effect,
    scope: substituteBinding(capability.scope, operation, call),
    span: capability.span,
  }));
}

function expectedApprovals(operation: OperationDecl, call: OperationCall): ApprovalRequirement[] {
  return operation.approvals.map((approval) => ({
    intent: approval.intent,
    args: approval.args.map((arg) => substituteBinding(arg, operation, call)),
    span: approval.span,
  }));
}

function checkUnknownEffects(program: Program, invalidOperations: ReadonlySet<string>, invalidTasks: ReadonlySet<string>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const declaration of program.declarations) {
    if (declaration.kind === "OperationDecl" && invalidOperations.has(declaration.name)) continue;
    if (declaration.kind === "TaskDecl" && invalidTasks.has(declaration.name)) continue;

    for (const effect of declaration.effects) {
      if (!knownEffectSet.has(effect.name)) {
        diagnostics.push(diagnostic("UNKNOWN_EFFECT", effect.span, `Unknown effect '${effect.name}'`));
      }
    }
    for (const capability of declaration.capabilities) {
      if (!knownEffectSet.has(capability.effect.name)) {
        diagnostics.push(diagnostic("UNKNOWN_EFFECT", capability.effect.span, `Unknown effect '${capability.effect.name}'`));
      }
    }
  }
  return diagnostics;
}

function checkTask(
  task: TaskDecl,
  operationMap: ReadonlyMap<string, OperationDecl>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const taskTypes = parameterTypeMap(task);
  const taskEffects = new Set(task.effects.filter((effect) => knownEffectSet.has(effect.name)).map((effect) => effect.name));
  const taskCapabilities = new Map(task.capabilities.filter((cap) => knownEffectSet.has(cap.effect.name)).map((cap) => [cap.effect.name, cap]));
  const taskApprovals = new Map(task.approvals.map((approval) => [approval.intent, approval]));

  const requiredCapabilityEffects = new Set<string>();
  const requiredApprovalIntents = new Set<string>();

  for (const call of task.calls) {
    const operation = operationMap.get(call.operation)!;

    let callHasTypeMismatch = false;
    for (let index = 0; index < call.args.length; index += 1) {
      const actual = bindingType(call.args[index]!, taskTypes)!;
      const expected = operation.params[index]!.type;
      if (!typeEquals(actual, expected)) {
        diagnostics.push(
          diagnostic(
            "TYPE_MISMATCH",
            call.args[index]!.span,
            `Argument ${index + 1} of '${call.operation}' expects ${expected.name}, got ${actual.name}`,
          ),
        );
        callHasTypeMismatch = true;
      }
    }

    const operationUnknownEffects = new Set(
      [...operation.effects, ...operation.capabilities.map((capability) => capability.effect)]
        .filter((effect) => !knownEffectSet.has(effect.name))
        .map((effect) => effect.name),
    );

    for (const effect of operation.effects) {
      if (operationUnknownEffects.has(effect.name)) continue;
      if (!taskEffects.has(effect.name)) {
        diagnostics.push(
          diagnostic("EFFECT_UNDECLARED", call.operationSpan, `Task '${task.name}' does not declare effect '${effect.name}'`),
        );
      }
    }

    for (const expected of expectedCapabilities(operation, call)) {
      if (!knownEffectSet.has(expected.effect.name)) continue;
      requiredCapabilityEffects.add(expected.effect.name);
      const actual = taskCapabilities.get(expected.effect.name);
      if (!actual) {
        diagnostics.push(
          diagnostic(
            "CAPABILITY_REQUIREMENT_INVALID",
            call.operationSpan,
            `Task '${task.name}' is missing capability '${expected.effect.name}' required by '${call.operation}'`,
          ),
        );
        continue;
      }
      if (!bindingEquals(actual.scope, expected.scope)) {
        diagnostics.push(
          diagnostic(
            "CAPABILITY_SCOPE_STRUCTURE_MISMATCH",
            actual.span,
            `Capability '${expected.effect.name}' scope does not match '${call.operation}'`,
          ),
        );
      }
    }

    for (const expected of expectedApprovals(operation, call)) {
      requiredApprovalIntents.add(expected.intent);
      const actual = taskApprovals.get(expected.intent);
      if (!actual) {
        diagnostics.push(
          diagnostic(
            "APPROVAL_REQUIREMENT_INVALID",
            call.operationSpan,
            `Task '${task.name}' is missing approval '${expected.intent}' required by '${call.operation}'`,
          ),
        );
        continue;
      }
      if (!callHasTypeMismatch && !bindingArrayEquals(actual.args, expected.args)) {
        diagnostics.push(
          diagnostic(
            "APPROVAL_SCOPE_STRUCTURE_MISMATCH",
            actual.span,
            `Approval '${expected.intent}' arguments do not match '${call.operation}'`,
          ),
        );
      }
    }
  }

  for (const capability of task.capabilities) {
    if (!knownEffectSet.has(capability.effect.name)) continue;
    if (!requiredCapabilityEffects.has(capability.effect.name)) {
      diagnostics.push(
        diagnostic(
          "CAPABILITY_REQUIREMENT_INVALID",
          capability.span,
          `Task '${task.name}' declares unused capability '${capability.effect.name}'`,
        ),
      );
    }
  }

  for (const approval of task.approvals) {
    if (!requiredApprovalIntents.has(approval.intent)) {
      diagnostics.push(
        diagnostic(
          "APPROVAL_REQUIREMENT_INVALID",
          approval.span,
          `Task '${task.name}' declares unused approval '${approval.intent}'`,
        ),
      );
    }
  }

  return diagnostics;
}

function checkWithResolution(input: CheckerInput, resolution: ContractResolution | null): Diagnostic[] {
  if (input.kind === "SyntheticCapabilityValueConstruction") {
    return [diagnostic("CAPABILITY_FORGERY", input.span, "Capability values cannot be constructed by the program")];
  }
  if (input.kind === "SyntheticApprovalValueConstruction") {
    return [diagnostic("APPROVAL_FORGERY", input.span, "Approval values cannot be constructed by the program")];
  }

  const resolved = resolution ?? resolveContracts(input);
  const diagnostics = checkUnknownEffects(input, resolved.invalidOperations, resolved.invalidTasks);
  const operationMap = new Map<string, OperationDecl>();
  for (const declaration of input.declarations) {
    if (declaration.kind === "OperationDecl" && !resolved.invalidOperations.has(declaration.name)) {
      operationMap.set(declaration.name, declaration);
    }
  }

  for (const declaration of input.declarations) {
    if (declaration.kind !== "TaskDecl" || resolved.invalidTasks.has(declaration.name)) continue;
    diagnostics.push(...checkTask(declaration, operationMap));
  }

  return diagnostics;
}

/**
 * Safe public analysis entrypoint. Structural validity is explicit in the
 * discriminated result, so callers cannot infer PASS from an empty diagnostic
 * list while structural errors are present.
 */
export function analyze(input: CheckerInput): AnalysisResult {
  if (input.kind !== "Program") {
    return { status: "CHECKED", structuralErrors: [], diagnostics: checkWithResolution(input, null) };
  }

  const resolution = resolveContracts(input);
  const diagnostics = checkWithResolution(input, resolution);
  if (resolution.structuralErrors.length > 0) {
    return {
      status: "STRUCTURAL_ERROR",
      structuralErrors: resolution.structuralErrors,
      diagnostics,
    };
  }

  return { status: "CHECKED", structuralErrors: [], diagnostics };
}

/**
 * Diagnostic-only convenience API for structurally valid input.
 * Structural-invalid programs are rejected instead of returning a PASS-like [].
 */
export function check(input: CheckerInput): Diagnostic[] {
  const result = analyze(input);
  if (result.status === "STRUCTURAL_ERROR") {
    throw new StructuralContractFailure(result.structuralErrors);
  }
  return result.diagnostics;
}
