import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const destination=path.join(root,"release/tml-oss-core");
const files=JSON.parse(fs.readFileSync(path.join(root,"scripts/public-files.json"),"utf8")).files;
if(fs.existsSync(destination)) throw Error("export destination already exists; preserve it and inspect before retrying");
fs.mkdirSync(destination,{recursive:true});
const lines=[];
for(const p of files){
  if(p.startsWith("/") || p.includes("..") || p.split("/").includes(".git")) throw Error("untrusted export path: "+p);
  const source=path.join(root,p), target=path.join(destination,p);
  if(!fs.statSync(source).isFile() || fs.lstatSync(source).isSymbolicLink()) throw Error("non-file export: "+p);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
  const sourceDigest=crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
  const targetDigest=crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
  if(sourceDigest!==targetDigest) throw Error("export SHA mismatch: "+p);
  lines.push(sourceDigest+"  "+p);
}
fs.writeFileSync(path.join(destination,"SHA256SUMS.txt"),lines.join("\n")+"\n");
if(fs.existsSync(path.join(destination,".git"))) throw Error("git history leaked");
console.log("Clean export PASS: "+files.length+" files in release/tml-oss-core (no git history).");
console.log("To publish separately, initialize a new Git repository inside that directory.");
