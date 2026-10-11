export type TokenKind = "identifier" | "string" | "symbol" | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  startOffset: number;
  endOffset: number;
}

export class TokenizeError extends Error {
  readonly startOffset: number;
  readonly endOffset: number;

  constructor(message: string, startOffset: number, endOffset: number) {
    super(message);
    this.name = "TokenizeError";
    this.startOffset = startOffset;
    this.endOffset = endOffset;
  }
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_\uAC00-\uD7A3]/u.test(char);
}

function isIdentifierContinue(char: string): boolean {
  return /[A-Za-z0-9_\uAC00-\uD7A3]/u.test(char);
}

export const reservedKeywords = new Set(["task", "operation", "effects", "requires", "approvals", "ensures", "call", "cap", "approve"]);

const singleSymbols = new Set(["{", "}", "(", ")", "[", "]", "<", ">", ",", ":", ".", "="]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;

  while (offset < source.length) {
    const char = source[offset]!;

    if (/\s/u.test(char)) {
      offset += 1;
      continue;
    }

    if (char === "/" && source[offset + 1] === "/") {
      offset += 2;
      while (offset < source.length && source[offset] !== "\n") offset += 1;
      continue;
    }

    if (char === '"') {
      const start = offset;
      offset += 1;
      const valueStart = offset;
      while (offset < source.length && source[offset] !== '"') offset += 1;
      if (offset >= source.length) {
        throw new TokenizeError("Unterminated string literal", start, source.length);
      }
      const value = source.slice(valueStart, offset);
      offset += 1;
      tokens.push({ kind: "string", value, startOffset: start, endOffset: offset });
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = offset;
      offset += 1;
      while (offset < source.length && isIdentifierContinue(source[offset]!)) offset += 1;
      tokens.push({
        kind: "identifier",
        value: source.slice(start, offset),
        startOffset: start,
        endOffset: offset,
      });
      continue;
    }

    const twoChar = source.slice(offset, offset + 2);
    if (twoChar === "->" || twoChar === "==") {
      tokens.push({
        kind: "symbol",
        value: twoChar,
        startOffset: offset,
        endOffset: offset + 2,
      });
      offset += 2;
      continue;
    }

    if (singleSymbols.has(char)) {
      tokens.push({
        kind: "symbol",
        value: char,
        startOffset: offset,
        endOffset: offset + 1,
      });
      offset += 1;
      continue;
    }

    throw new TokenizeError(`Unexpected character '${char}'`, offset, offset + 1);
  }

  tokens.push({ kind: "eof", value: "<eof>", startOffset: source.length, endOffset: source.length });
  return tokens;
}
