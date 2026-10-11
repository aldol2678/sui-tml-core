import { readFileSync } from "node:fs";
import { analyze, check, resolveContracts, StructuralContractFailure } from "../dist/checker.js";
import { parse } from "../dist/parser.js";

const manifest = JSON.parse(readFileSync(new URL("../fixtures/manifest.json", import.meta.url), "utf8"));
const failures = [];
let semanticPass = 0;
let parserPass = 0;
let parserFailNoChecker = 0;

function normalizeDiagnostics(diagnostics) {
  return diagnostics.map(({ code, span }) => ({ code, span }));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

for (const fixture of manifest.fixtures) {
  if (fixture.kind === "negative-ast") {
    const input = JSON.parse(readFileSync(new URL(`../${fixture.path}`, import.meta.url), "utf8"));
    const actual = normalizeDiagnostics(check(input));
    if (!sameJson(actual, fixture.expectedDiagnostics)) {
      failures.push(`${fixture.id}: expected ${JSON.stringify(fixture.expectedDiagnostics)}, got ${JSON.stringify(actual)}`);
    } else semanticPass += 1;
    continue;
  }

  const source = readFileSync(new URL(`../${fixture.path}`, import.meta.url), "utf8");
  const parsed = parse(source);

  if (fixture.kind === "parser") {
    const expectedOk = fixture.expectedParse === "PASS";
    if (parsed.ok !== expectedOk) {
      failures.push(`${fixture.id}: expected parse ${fixture.expectedParse}, got ${parsed.ok ? "PASS" : "FAIL"}`);
      continue;
    }
    parserPass += 1;
    if (!parsed.ok) {
      parserFailNoChecker += 1;
      continue;
    }
    const resolution = resolveContracts(parsed.program);
    if (resolution.structuralErrors.length) {
      failures.push(`${fixture.id}: unexpected structural errors ${JSON.stringify(resolution.structuralErrors)}`);
      continue;
    }
    const actual = normalizeDiagnostics(check(parsed.program));
    if (actual.length !== 0) failures.push(`${fixture.id}: expected no diagnostics, got ${JSON.stringify(actual)}`);
    continue;
  }

  if (!parsed.ok) {
    failures.push(`${fixture.id}: source fixture failed to parse: ${parsed.message}@${parsed.startOffset}:${parsed.endOffset}`);
    continue;
  }

  const resolution = resolveContracts(parsed.program);
  if (resolution.structuralErrors.length) {
    failures.push(`${fixture.id}: unexpected structural errors ${JSON.stringify(resolution.structuralErrors)}`);
    continue;
  }

  const actual = normalizeDiagnostics(check(parsed.program));
  if (!sameJson(actual, fixture.expectedDiagnostics)) {
    failures.push(`${fixture.id}: expected ${JSON.stringify(fixture.expectedDiagnostics)}, got ${JSON.stringify(actual)}`);
  } else semanticPass += 1;
}

const structuralSmokes = [
  {
    name: "unknown operation",
    source: `task t(x: Text) -> Unit { call missing.op(x) }`,
  },
  {
    name: "unresolved task binding",
    source: `operation op(x: Text) -> Unit\ntask t(x: Text) -> Unit { call op(y) }`,
  },
  {
    name: "operation capability effect missing from effects",
    source: `operation op(x: Text) -> Unit\neffects []\nrequires [cap network.read(x)]`,
  },
];
let structuralPass = 0;
for (const smoke of structuralSmokes) {
  const parsed = parse(smoke.source);
  if (!parsed.ok) {
    failures.push(`structural smoke '${smoke.name}' failed to parse: ${parsed.message}`);
    continue;
  }
  const resolution = resolveContracts(parsed.program);
  if (resolution.structuralErrors.length === 0) failures.push(`structural smoke '${smoke.name}' expected STRUCTURAL_CONTRACT_ERROR`);
  else {
    structuralPass += 1;
    const result = analyze(parsed.program);
    if (result.status !== "STRUCTURAL_ERROR") {
      failures.push(`structural smoke '${smoke.name}' safe analysis must return STRUCTURAL_ERROR`);
    }
    try {
      check(parsed.program);
      failures.push(`structural smoke '${smoke.name}' check() must reject structural-invalid input`);
    } catch (error) {
      if (!(error instanceof StructuralContractFailure)) {
        failures.push(`structural smoke '${smoke.name}' check() threw unexpected error ${String(error)}`);
      }
    }
  }
}

if (semanticPass !== 12) failures.push(`semantic fixture count: expected 12/12, got ${semanticPass}/12`);
if (parserPass !== 3) failures.push(`parser fixture count: expected 3/3, got ${parserPass}/3`);
if (parserFailNoChecker !== 2) failures.push(`parser FAIL checker suppression: expected 2/2, got ${parserFailNoChecker}/2`);
if (structuralPass !== 3) failures.push(`structural smoke count: expected 3/3, got ${structuralPass}/3`);

if (failures.length) {
  console.error("R2 checker acceptance FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("R2 checker acceptance PASS");
console.log("- frozen semantic fixtures: 12/12");
console.log("- parser boundary fixtures: 3/3");
console.log("- parser FAIL semantic suppression: 2/2");
console.log("- structural contract smokes: 3/3");
