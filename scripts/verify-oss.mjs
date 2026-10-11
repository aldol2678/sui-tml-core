import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const allowed = JSON.parse(fs.readFileSync(path.join(root, "scripts/public-files.json"), "utf8")).files;
const paths = new Set(allowed);
const forbiddenNames = /(?:^|\/)(?:\.env(?:\..+)?|\.git|\.npmrc|id_rsa|id_ed25519)(?:\/|$)/i;
const redFlags = [
  {name:"credential marker", re:/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{18,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{20,}/},
  {name:"personal email", re:/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i},
  {name:"external document link", re:/https?:\/\/(?:docs|drive)\.google\.com\//i},
  {name:"live external resource reference", re:/(?:drive-folder:|drive-doc:|slack-channel:)|\b1[A-Za-z0-9_-]{28,}\b/i}
];
function walk(dir, rel="") {
  const out=[];
  for (const d of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=rel?rel+"/"+d.name:d.name;
    if (["node_modules","dist","release",".git"].includes(d.name) && d.isDirectory()) continue;
    if (d.isSymbolicLink()) throw Error("symbolic link forbidden: "+p);
    if(d.isDirectory()) out.push(...walk(path.join(dir,d.name),p));
    else out.push(p);
  }
  return out;
}
const actual = walk(root).filter(p=>p!=="SHA256SUMS.txt");
for (const p of actual) if(!paths.has(p)) throw Error("unexpected public file: "+p);
for (const p of allowed) {
  if (forbiddenNames.test(p) || p.startsWith("/") || p.includes("..")) throw Error("unsafe path: "+p);
  const absolute=path.join(root,p);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw Error("missing public file: "+p);
  const source=fs.readFileSync(absolute,"utf8");
  // npm integrity values are base64 digests, not Drive resource IDs; inspect all other fields.
  const scanned=p==="package-lock.json" ? source.replace(/("integrity"\s*:\s*")[^"]+(")/g,"$1$2") : source;
  for(const flag of redFlags) {
    if(p==="scripts/verify-oss.mjs") continue; // scanner patterns are literal source in this file
    if(flag.re.test(scanned)) throw Error(flag.name+" in "+p);
  }
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
const lock=JSON.parse(fs.readFileSync(path.join(root,"package-lock.json"),"utf8"));
if(pkg.license!=="Apache-2.0" || lock.packages[""].license!==pkg.license) throw Error("license mismatch");
if(pkg.devDependencies.typescript!==lock.packages["node_modules/typescript"].version) throw Error("typescript lock mismatch");
if(!fs.readFileSync(path.join(root,"LICENSE"),"utf8").includes("APPENDIX: How to apply the Apache License")) throw Error("incomplete license");
const readme=fs.readFileSync(path.join(root,"README.md"),"utf8");
if(!readme.includes("effects [network.read]") || !readme.includes("requires [cap network.read(query)]")) throw Error("README example drift");
console.log("OSS source audit PASS: "+allowed.length+" allowlisted files; no unexpected files; license, lock and example contract verified");
