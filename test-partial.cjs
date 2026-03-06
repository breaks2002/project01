const fs = require("fs");
const original = fs.readFileSync("src/store/useVDTStore.js", "utf8");
const allLines = original.split("\n");

for (let endLine = 1200; endLine <= 1250; endLine++) {
  const testLines = allLines.slice(0, endLine);
  const testContent = testLines
    .join("\n")
    .replace(/^import \{ create \} from 'zustand';$/gm, "const create = () => {};")
    .replace(/^import \{ Calculator \} from '\.\.\/engine\/Calculator';$/gm, "const Calculator = class {};")
    .replace(/^import \{ FormulaParser \} from '\.\.\/engine\/FormulaParser';$/gm, "const FormulaParser = {};")
    .replace(/^import \{ aggregateTimeData \} from '\.\.\/utils\/formatters';$/gm, "const aggregateTimeData = () => {};")
    + "\n// DUMMY END"; // 补全可能不完整的块

  try {
    new Function(testContent);
    console.log(`OK up to line ${endLine}`);
  } catch (e) {
    console.log(`FAIL up to line ${endLine}: ${e.message.substring(0, 50)}`);
  }
}
