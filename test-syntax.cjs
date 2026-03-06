const fs = require("fs");
const path = require("path");

const original = fs.readFileSync("src/store/useVDTStore.js", "utf8");

// 替换 import 为简单赋值，这样就能用 CommonJS 解析了
const testContent = original
  .replace(/^import \{ create \} from 'zustand';$/gm, "const create = () => {};")
  .replace(/^import \{ Calculator \} from '\.\.\/engine\/Calculator';$/gm, "const Calculator = class {};")
  .replace(/^import \{ FormulaParser \} from '\.\.\/engine\/FormulaParser';$/gm, "const FormulaParser = {};")
  .replace(/^import \{ aggregateTimeData \} from '\.\.\/utils\/formatters';$/gm, "const aggregateTimeData = () => {};")
  .replace(/^export default useVDTStore;$/gm, "// export default useVDTStore;");

try {
  const vm = require("vm");
  new vm.Script(testContent, { filename: "test.js" });
  console.log("Syntax OK!");
} catch (e) {
  console.log("\nError:", e.message);
  console.log("Stack:", e.stack);
  // Try to get line number
  const match = e.stack && e.stack.match(/test\.js:(\d+)/);
  if (match) {
    const lineNum = parseInt(match[1]);
    console.log("\nError around line", lineNum);
    const lines = testContent.split("\n");
    for (let i = Math.max(0, lineNum-20); i < Math.min(lines.length, lineNum+5); i++) {
      const marker = i === lineNum-1 ? ">>>" : "   ";
      console.log(`${marker} ${String(i+1).padStart(4)}: ${lines[i].substring(0, 100)}`);
    }
  }
}
