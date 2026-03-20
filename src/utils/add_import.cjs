const fs = require('fs');
let content = fs.readFileSync('utils/aiPromptBuilder.js', 'utf8');

// 在文件头部添加 import 语句
const importStatement = "// 导入兜底策略引擎（用于 AI 返回不足 1 个 adjustment 时的后备策略）\nimport { generateFallbackStrategy } from '../engine/FallbackStrategyEngine.js';\n\n";

// 在文件开头添加
content = importStatement + content;

fs.writeFileSync('utils/aiPromptBuilder.js', content);
console.log('✅ 添加 import 语句成功');
