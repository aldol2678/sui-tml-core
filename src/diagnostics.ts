export const diagnosticCodes = [
  "TYPE_MISMATCH",
  "EFFECT_UNDECLARED",
  "UNKNOWN_EFFECT",
  "CAPABILITY_REQUIREMENT_INVALID",
  "APPROVAL_REQUIREMENT_INVALID",
  "CAPABILITY_SCOPE_STRUCTURE_MISMATCH",
  "APPROVAL_SCOPE_STRUCTURE_MISMATCH",
  "CAPABILITY_FORGERY",
  "APPROVAL_FORGERY",
] as const;

export type DiagnosticCode = (typeof diagnosticCodes)[number];

export interface SourceSpan {
  startOffset: number;
  endOffset: number;
}

export interface Diagnostic {
  code: DiagnosticCode;
  span: SourceSpan;
  message: string;
}
