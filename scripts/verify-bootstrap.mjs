import fs from "node:fs";
import path from "node:path";

const manifest = JSON.parse(fs.readFileSync("fixtures/manifest.json", "utf8"));
const expected = {positive:3, negativeSource:7, negativeAst:2, parser:3, total:15};
for (const [k,v] of Object.entries(expected)) {
  if (manifest.counts[k] !== v) throw new Error(`count mismatch ${k}: ${manifest.counts[k]} !== ${v}`);
}
if (manifest.fixtures.length !== 15) throw new Error(`manifest fixtures=${manifest.fixtures.length}`);
if (!manifest.frozenBeforeImplementation) throw new Error("fixtures are not frozen");
const ids = new Set();
for (const f of manifest.fixtures) {
  if (ids.has(f.id)) throw new Error(`duplicate fixture id: ${f.id}`);
  ids.add(f.id);
  if (!fs.existsSync(f.path)) throw new Error(`missing fixture: ${f.path}`);
  if (f.kind === "negative-source") {
    const source = fs.readFileSync(f.path,"utf8");
    if (f.expectedDiagnostics.length !== 1 || f.allowAdditionalDiagnostics !== false) throw new Error(`weak oracle: ${f.id}`);
    const {startOffset,endOffset} = f.expectedDiagnostics[0].span;
    if (!(startOffset >= 0 && endOffset > startOffset && endOffset <= source.length)) throw new Error(`bad span: ${f.id}`);
  }
  if (f.kind === "negative-ast" && f.expectedDiagnostics.length !== 1) throw new Error(`synthetic oracle: ${f.id}`);
}
const forbiddenRuntimeCodes = ["CAPABILITY_MISSING_AT_EXECUTION","APPROVAL_MISSING_AT_EXECUTION","APPROVAL_REPLAY","POSTCONDITION_FAILED","POSTCONDITION_UNKNOWN"];
const diagnosticSource = fs.readFileSync("src/diagnostics.ts","utf8");
for (const code of forbiddenRuntimeCodes) if (diagnosticSource.includes(`"${code}"`)) throw new Error(`runtime code leaked into R2: ${code}`);
console.log("bootstrap contract PASS: 15 fixtures frozen; runtime diagnostic leakage=0");
