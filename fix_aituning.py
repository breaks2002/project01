import re

with open('src/components/DataPanel/AITuningPanel.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 添加导入
if 'import ConstraintRuleManager' not in content:
    content = content.replace(
        "import { TEST_VERSION } from '../../test-version';",
        "import { TEST_VERSION } from '../../test-version';\nimport ConstraintRuleManager from './ConstraintRuleManager';"
    )

# 2. 添加状态
if 'showRuleManager' not in content:
    content = content.replace(
        'const [appliedCount, setAppliedCount] = useState(0);',
        'const [appliedCount, setAppliedCount] = useState(0);\n  const [showRuleManager, setShowRuleManager] = useState(false);'
    )

# 3. 添加弹窗渲染
if 'ConstraintRuleManager' not in content.split('{showAddFactorModal')[0]:
    content = content.replace(
        '{/* 添加因子模态框 */}\n        {showAddFactorModal && (',
        '{/* 规则映射管理 */}\n        {showRuleManager && (\n          <ConstraintRuleManager\n            onClose={() => setShowRuleManager(false)}\n          />\n        )}\n\n        {/* 添加因子模态框 */}\n        {showAddFactorModal && ('
    )

with open('src/components/DataPanel/AITuningPanel.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ 修改完成')
