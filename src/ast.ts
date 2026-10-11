import type { SourceSpan } from "./diagnostics.js";

export interface TypeRef {
  name: string;
  args: TypeRef[];
  span: SourceSpan;
}

export interface Parameter {
  name: string;
  type: TypeRef;
  span: SourceSpan;
}

export interface EffectRef {
  name: string;
  span: SourceSpan;
}

export interface BindingRef {
  kind: "identifier" | "string";
  value: string;
  span: SourceSpan;
}

export interface CapabilityRequirement {
  effect: EffectRef;
  scope: BindingRef;
  span: SourceSpan;
}

export interface ApprovalRequirement {
  intent: string;
  args: BindingRef[];
  span: SourceSpan;
}

export type EnsureOperand =
  | {
      kind: "binding";
      binding: BindingRef;
      span: SourceSpan;
    }
  | {
      kind: "call";
      functionName: string;
      args: BindingRef[];
      span: SourceSpan;
    };

export type EnsureExpr =
  | {
      kind: "operand";
      operand: EnsureOperand;
      span: SourceSpan;
    }
  | {
      kind: "equals";
      left: EnsureOperand;
      right: EnsureOperand;
      span: SourceSpan;
    };

export interface OperationCall {
  operation: string;
  operationSpan: SourceSpan;
  args: BindingRef[];
  span: SourceSpan;
}

export interface OperationDecl {
  kind: "OperationDecl";
  name: string;
  params: Parameter[];
  returnType: TypeRef;
  effects: EffectRef[];
  capabilities: CapabilityRequirement[];
  approvals: ApprovalRequirement[];
  span: SourceSpan;
}

export interface TaskDecl {
  kind: "TaskDecl";
  name: string;
  params: Parameter[];
  returnType: TypeRef;
  effects: EffectRef[];
  capabilities: CapabilityRequirement[];
  approvals: ApprovalRequirement[];
  ensures: EnsureExpr[];
  calls: OperationCall[];
  span: SourceSpan;
}

export interface SyntheticCapabilityValueConstruction {
  kind: "SyntheticCapabilityValueConstruction";
  span: SourceSpan;
}

export interface SyntheticApprovalValueConstruction {
  kind: "SyntheticApprovalValueConstruction";
  span: SourceSpan;
}

export type Decl = OperationDecl | TaskDecl;
export type CheckerInput =
  | Program
  | SyntheticCapabilityValueConstruction
  | SyntheticApprovalValueConstruction;

export interface Program {
  kind: "Program";
  declarations: Decl[];
  span: SourceSpan;
}
