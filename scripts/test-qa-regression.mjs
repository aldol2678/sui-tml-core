import { analyze, check, StructuralContractFailure } from "../dist/checker.js";
import { parse } from "../dist/parser.js";

const failures = [];

const cases = [
  {
    name: "unresolved operation cannot false-pass",
    source: `task t(x: Text) -> Unit { call missing.op(x) }`,
  },
  {
    name: "duplicate task cannot false-pass",
    source: `task t(x: Text) -> Unit {} task t(y: Text) -> Unit {}`,
  },
];

for (const testCase of cases) {
  const parsed = parse(testCase.source);
  if (!parsed.ok) {
    failures.push(`${testCase.name}: expected parse PASS, got ${parsed.message}`);
    continue;
  }

  const result = analyze(parsed.program);
  if (result.status !== "STRUCTURAL_ERROR" || result.structuralErrors.length === 0) {
    failures.push(`${testCase.name}: analyze() must expose STRUCTURAL_ERROR with errors`);
  }

  try {
    const diagnostics = check(parsed.program);
    failures.push(`${testCase.name}: check() false-passed with ${JSON.stringify(diagnostics)}`);
  } catch (error) {
    if (!(error instanceof StructuralContractFailure)) {
      failures.push(`${testCase.name}: check() threw unexpected ${String(error)}`);
    }
  }
}

const valid = parse(`task ok(x: Text) -> Unit { effects [] }`);
if (!valid.ok) failures.push(`valid control failed to parse: ${valid.message}`);
else {
  const result = analyze(valid.program);
  if (result.status !== "CHECKED") failures.push("valid control analyze() must return CHECKED");
  else if (result.diagnostics.length !== 0) failures.push(`valid control expected [], got ${JSON.stringify(result.diagnostics)}`);
}

if (failures.length) {
  console.error("B-QA-01 regression FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("B-QA-01 regression PASS");
console.log("- structural-invalid analyze(): explicit STRUCTURAL_ERROR 2/2");
console.log("- structural-invalid check(): rejected 2/2");
console.log("- structurally valid control: CHECKED + [] 1/1");
