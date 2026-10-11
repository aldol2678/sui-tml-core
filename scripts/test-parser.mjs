import { readFileSync } from "node:fs";
import { parse } from "../dist/parser.js";

const manifest = JSON.parse(readFileSync(new URL("../fixtures/manifest.json", import.meta.url), "utf8"));

let parserPass = 0;
let sourceSmokePass = 0;
const failures = [];

for (const fixture of manifest.fixtures) {
  if (!fixture.path.endsWith(".sui")) continue;
  const source = readFileSync(new URL(`../${fixture.path}`, import.meta.url), "utf8");
  const result = parse(source);

  if (fixture.kind === "parser") {
    const expectedOk = fixture.expectedParse === "PASS";
    if (result.ok === expectedOk) parserPass += 1;
    else failures.push(`${fixture.id}: expected parse ${fixture.expectedParse}, got ${result.ok ? "PASS" : `FAIL (${result.message})`}`);
    continue;
  }

  if (result.ok) sourceSmokePass += 1;
  else failures.push(`${fixture.id}: source fixture must parse before semantic checking: ${result.message}@${result.startOffset}:${result.endOffset}`);
}

const p2Source = readFileSync(new URL("../fixtures/positive/p2-storage-write.sui", import.meta.url), "utf8");
const p2 = parse(p2Source);
if (!p2.ok) {
  failures.push(`AST smoke: p2 failed to parse: ${p2.message}`);
} else {
  const task = p2.program.declarations.find((decl) => decl.kind === "TaskDecl");
  if (!task || task.kind !== "TaskDecl") failures.push("AST smoke: TaskDecl missing");
  else if (task.ensures.length !== 2 || task.ensures[1]?.kind !== "equals") failures.push("AST smoke: ensures operand/equality structure not preserved");
  else if (task.calls.length !== 1 || task.calls[0]?.operation !== "drive.save") failures.push("AST smoke: operation call structure not preserved");
}


const contractSmokes = [
  {
    name: "Korean identifier + generic TypeRef + comment",
    source: `// comment\ntask 조사(값: Result<Text, Error>) -> Unit { effects [] }`,
    expectedOk: true,
  },
  {
    name: "reserved keyword rejected as task name",
    source: `task effects() -> Unit {}`,
    expectedOk: false,
  },
  {
    name: "bare qualified ensures binding rejected",
    source: `task t(x: Text) -> Unit { ensures [x.value] }`,
    expectedOk: false,
  },
];

for (const smoke of contractSmokes) {
  const result = parse(smoke.source);
  if (result.ok !== smoke.expectedOk) {
    failures.push(`contract smoke: ${smoke.name}: expected ${smoke.expectedOk ? "PASS" : "FAIL"}`);
  }
}

if (parserPass !== 3) failures.push(`parser boundary count: expected 3/3, got ${parserPass}/3`);
if (sourceSmokePass !== 10) failures.push(`source parse smoke: expected 10/10, got ${sourceSmokePass}/10`);

if (failures.length > 0) {
  console.error("R2 parser test FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("R2 parser test PASS");
console.log("- parser boundary: 3/3");
console.log("- positive + negative source parse smoke: 10/10");
console.log("- AST structure smoke: PASS");
console.log("- lexical/grammar contract smokes: 3/3");
