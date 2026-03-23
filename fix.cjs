const fs = require('fs');

const filePath = 'src/components/DataPanel/AITuningPanel.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. 添加导入 (在 TEST_VERSION 之后)
if (!content.includes('ConstraintRuleManager')) {
  content = content.replace(
    "import { TEST_VERSION } from '../../test-version';",
    "import { TEST_VERSION } from '../../test-version';\nimport ConstraintRuleManager from './ConstraintRuleManager';"
  );
  console.log('✓ 添加导入');
}

// 2. 添加状态
if (!content.includes('showRuleManager')) {
  content = content.replace(
    'const [appliedCount, setAppliedCount] = useState(0);',
    'const [appliedCount, setAppliedCount] = useState(0);\n  const [showRuleManager, setShowRuleManager] = useState(false);'
  );
  console.log('✓ 添加状态');
}

// 3. 添加弹窗渲染
const modalPattern = '{/* 添加因子模态框 */}\n        {showAddFactorModal && (';
const replacement = `{/* 规则映射管理 */}
        {showRuleManager && (
          <ConstraintRuleManager
            onClose={() => setShowRuleManager(false)}
          />
        )}

        {/* 添加因子模态框 */}
        {showAddFactorModal && (`;

if (content.includes(modalPattern) && !content.includes('ConstraintRuleManager')) {
  content = content.replace(modalPattern, replacement);
  console.log('✓ 添加弹窗渲染');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ 修改完成');
