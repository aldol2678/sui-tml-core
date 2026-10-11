import type {
  ApprovalRequirement,
  BindingRef,
  CapabilityRequirement,
  Decl,
  EffectRef,
  EnsureExpr,
  EnsureOperand,
  OperationCall,
  OperationDecl,
  Parameter,
  Program,
  TaskDecl,
  TypeRef,
} from "./ast.js";
import type { SourceSpan } from "./diagnostics.js";
import { reservedKeywords, tokenize, TokenizeError, type Token } from "./tokenizer.js";

export interface ParseSuccess {
  ok: true;
  program: Program;
}

export interface ParseFailure {
  ok: false;
  message: string;
  startOffset: number;
  endOffset: number;
}

export type ParseResult = ParseSuccess | ParseFailure;

class ParseError extends Error {
  readonly startOffset: number;
  readonly endOffset: number;

  constructor(message: string, token: Token) {
    super(message);
    this.name = "ParseError";
    this.startOffset = token.startOffset;
    this.endOffset = token.endOffset;
  }
}

interface NamedSpan {
  name: string;
  span: SourceSpan;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseProgram(): Program {
    const declarations: Decl[] = [];
    const startOffset = this.current().startOffset;

    while (!this.atEof()) {
      if (this.at("operation")) {
        declarations.push(this.parseOperationDecl());
      } else if (this.at("task")) {
        declarations.push(this.parseTaskDecl());
      } else {
        throw this.error(`Unsupported top-level form '${this.current().value}'`);
      }
    }

    return {
      kind: "Program",
      declarations,
      span: { startOffset, endOffset: this.current().endOffset },
    };
  }

  private parseOperationDecl(): OperationDecl {
    const start = this.expect("operation").startOffset;
    const name = this.parseQualifiedName();
    this.expect("(");
    const params = this.at(")") ? [] : this.parseParamList();
    this.expect(")");
    this.expect("->");
    const returnType = this.parseTypeRef();

    let effects: EffectRef[] = [];
    let capabilities: CapabilityRequirement[] = [];
    let approvals: ApprovalRequirement[] = [];
    const seen = new Set<string>();

    while (this.at("effects") || this.at("requires") || this.at("approvals")) {
      const clause = this.current().value;
      if (seen.has(clause)) throw this.error(`Duplicate '${clause}' clause`);
      seen.add(clause);

      if (clause === "effects") effects = this.parseEffectsClause();
      else if (clause === "requires") capabilities = this.parseCapabilityClause();
      else approvals = this.parseApprovalClause();
    }

    return {
      kind: "OperationDecl",
      name: name.name,
      params,
      returnType,
      effects,
      capabilities,
      approvals,
      span: { startOffset: start, endOffset: this.previous().endOffset },
    };
  }

  private parseTaskDecl(): TaskDecl {
    const start = this.expect("task").startOffset;
    const name = this.expectIdentifier("task name");
    this.expect("(");
    const params = this.at(")") ? [] : this.parseParamList();
    this.expect(")");
    this.expect("->");
    const returnType = this.parseTypeRef();
    this.expect("{");

    let effects: EffectRef[] = [];
    let capabilities: CapabilityRequirement[] = [];
    let approvals: ApprovalRequirement[] = [];
    let ensures: EnsureExpr[] = [];
    const calls: OperationCall[] = [];
    const seen = new Set<string>();

    while (!this.at("}")) {
      if (this.atEof()) throw this.error("Unclosed task body; expected '}'");

      if (this.at("call")) {
        calls.push(this.parseCallStmt());
        continue;
      }

      const clause = this.current().value;
      if (clause !== "effects" && clause !== "requires" && clause !== "approvals" && clause !== "ensures") {
        throw this.error(`Unsupported task member '${clause}'`);
      }
      if (seen.has(clause)) throw this.error(`Duplicate '${clause}' clause`);
      seen.add(clause);

      if (clause === "effects") effects = this.parseEffectsClause();
      else if (clause === "requires") capabilities = this.parseCapabilityClause();
      else if (clause === "approvals") approvals = this.parseApprovalClause();
      else ensures = this.parseEnsuresClause();
    }

    const close = this.expect("}");
    return {
      kind: "TaskDecl",
      name: name.value,
      params,
      returnType,
      effects,
      capabilities,
      approvals,
      ensures,
      calls,
      span: { startOffset: start, endOffset: close.endOffset },
    };
  }

  private parseParamList(): Parameter[] {
    const params: Parameter[] = [];
    do {
      const name = this.expectIdentifier("parameter name");
      this.expect(":");
      const type = this.parseTypeRef();
      params.push({
        name: name.value,
        type,
        span: { startOffset: name.startOffset, endOffset: type.span.endOffset },
      });
    } while (this.consumeIf(","));
    return params;
  }

  private parseTypeRef(): TypeRef {
    const named = this.parseQualifiedName();
    const args: TypeRef[] = [];
    let endOffset = named.span.endOffset;

    if (this.consumeIf("<")) {
      if (this.at(">")) throw this.error("Generic TypeRef requires at least one type argument");
      do {
        args.push(this.parseTypeRef());
      } while (this.consumeIf(","));
      endOffset = this.expect(">").endOffset;
    }

    return { name: named.name, args, span: { startOffset: named.span.startOffset, endOffset } };
  }

  private parseEffectsClause(): EffectRef[] {
    this.expect("effects");
    this.expect("[");
    const effects: EffectRef[] = [];
    if (!this.at("]")) {
      do {
        const effect = this.parseQualifiedName();
        effects.push({ name: effect.name, span: effect.span });
      } while (this.consumeIf(","));
    }
    this.expect("]");
    return effects;
  }

  private parseCapabilityClause(): CapabilityRequirement[] {
    this.expect("requires");
    this.expect("[");
    const requirements: CapabilityRequirement[] = [];
    if (!this.at("]")) {
      do {
        const start = this.expect("cap").startOffset;
        const effect = this.parseQualifiedName();
        this.expect("(");
        const scope = this.parseBindingRef();
        const close = this.expect(")");
        requirements.push({
          effect: { name: effect.name, span: effect.span },
          scope,
          span: { startOffset: start, endOffset: close.endOffset },
        });
      } while (this.consumeIf(","));
    }
    this.expect("]");
    return requirements;
  }

  private parseApprovalClause(): ApprovalRequirement[] {
    this.expect("approvals");
    this.expect("[");
    const requirements: ApprovalRequirement[] = [];
    if (!this.at("]")) {
      do {
        const start = this.expect("approve").startOffset;
        const intent = this.parseQualifiedName();
        this.expect("(");
        const args = this.at(")") ? [] : this.parseArgList();
        const close = this.expect(")");
        requirements.push({
          intent: intent.name,
          args,
          span: { startOffset: start, endOffset: close.endOffset },
        });
      } while (this.consumeIf(","));
    }
    this.expect("]");
    return requirements;
  }

  private parseEnsuresClause(): EnsureExpr[] {
    this.expect("ensures");
    this.expect("[");
    const expressions: EnsureExpr[] = [];
    if (!this.at("]")) {
      do {
        expressions.push(this.parseEnsureExpr());
      } while (this.consumeIf(","));
    }
    this.expect("]");
    return expressions;
  }

  private parseEnsureExpr(): EnsureExpr {
    const left = this.parseEnsureOperand();
    if (this.consumeIf("==")) {
      const right = this.parseEnsureOperand();
      return {
        kind: "equals",
        left,
        right,
        span: { startOffset: left.span.startOffset, endOffset: right.span.endOffset },
      };
    }
    return { kind: "operand", operand: left, span: left.span };
  }

  private parseEnsureOperand(): EnsureOperand {
    if (this.current().kind === "string") {
      const binding = this.parseBindingRef();
      return { kind: "binding", binding, span: binding.span };
    }

    const named = this.parseQualifiedName();
    if (this.consumeIf("(")) {
      const args = this.at(")") ? [] : this.parseArgList();
      const close = this.expect(")");
      return {
        kind: "call",
        functionName: named.name,
        args,
        span: { startOffset: named.span.startOffset, endOffset: close.endOffset },
      };
    }

    if (named.name.includes(".")) {
      throw new ParseError("Bare ensures binding must be a single Identifier", {
        kind: "identifier",
        value: named.name,
        startOffset: named.span.startOffset,
        endOffset: named.span.endOffset,
      });
    }

    const binding: BindingRef = {
      kind: "identifier",
      value: named.name,
      span: named.span,
    };
    return { kind: "binding", binding, span: named.span };
  }

  private parseCallStmt(): OperationCall {
    const start = this.expect("call").startOffset;
    const operation = this.parseQualifiedName();
    this.expect("(");
    const args = this.at(")") ? [] : this.parseArgList();
    const close = this.expect(")");
    return {
      operation: operation.name,
      operationSpan: operation.span,
      args,
      span: { startOffset: start, endOffset: close.endOffset },
    };
  }

  private parseArgList(): BindingRef[] {
    const args: BindingRef[] = [];
    do {
      args.push(this.parseBindingRef());
    } while (this.consumeIf(","));
    return args;
  }

  private parseBindingRef(): BindingRef {
    const token = this.current();
    if (token.kind === "string") {
      this.index += 1;
      return {
        kind: "string",
        value: token.value,
        span: { startOffset: token.startOffset, endOffset: token.endOffset },
      };
    }
    const identifier = this.expectIdentifier("binding reference");
    return {
      kind: "identifier",
      value: identifier.value,
      span: { startOffset: identifier.startOffset, endOffset: identifier.endOffset },
    };
  }

  private parseQualifiedName(): NamedSpan {
    const first = this.expectIdentifier("qualified name");
    let name = first.value;
    let endOffset = first.endOffset;

    while (this.consumeIf(".")) {
      const next = this.expectIdentifier("qualified name segment");
      name += `.${next.value}`;
      endOffset = next.endOffset;
    }

    return { name, span: { startOffset: first.startOffset, endOffset } };
  }

  private current(): Token {
    return this.tokens[this.index]!;
  }

  private previous(): Token {
    return this.tokens[Math.max(0, this.index - 1)]!;
  }

  private at(value: string): boolean {
    return this.current().value === value;
  }

  private atEof(): boolean {
    return this.current().kind === "eof";
  }

  private consumeIf(value: string): boolean {
    if (!this.at(value)) return false;
    this.index += 1;
    return true;
  }

  private expect(value: string): Token {
    const token = this.current();
    if (token.value !== value) throw this.error(`Expected '${value}', found '${token.value}'`);
    this.index += 1;
    return token;
  }

  private expectIdentifier(context: string): Token {
    const token = this.current();
    if (token.kind !== "identifier" || reservedKeywords.has(token.value)) {
      throw this.error(`Expected ${context}, found '${token.value}'`);
    }
    this.index += 1;
    return token;
  }

  private error(message: string): ParseError {
    return new ParseError(message, this.current());
  }
}

export function parse(source: string): ParseResult {
  try {
    const program = new Parser(tokenize(source)).parseProgram();
    return { ok: true, program };
  } catch (error) {
    if (error instanceof ParseError || error instanceof TokenizeError) {
      return {
        ok: false,
        message: error.message,
        startOffset: error.startOffset,
        endOffset: error.endOffset,
      };
    }
    throw error;
  }
}
