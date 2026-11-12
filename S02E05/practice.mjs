import { check } from "./agent/src/policy.js";
const practice = JSON.parse(process.argv[2]);
console.log(JSON.stringify(practice.map((p) => ({ id: p.id, ...check(p.text) }))));
