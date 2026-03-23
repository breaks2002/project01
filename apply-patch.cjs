const fs = require('fs');

const filePath = 'src/components/DataPanel/AITuningPanel.jsx';
let content = fs.readFileSync(filePath, 'utf8');

let modified = false;

// 1. 添加导入 - 在 TEST_VERSION 之后
if (!content.includes('ConstraintRuleManager')) {
  content = content.replace(
    "import { TEST_VERSION } from '../../test-version';",
    "import { TEST_VERSION } from '../../test-version';\nimport ConstraintRuleManager from './ConstraintRuleManager';"
  );
  console.log('✓ 添加导入');
  modified = true;
}

// 2. 添加状态 - 在 appliedCount 之后
if (!content.includes('showRuleManager')) {
  const stateLine = 'const [appliedCount, setAppliedCount] = useState(0);';
  if (content.includes(stateLine)) {
    content = content.replace(
      stateLine,
      stateLine + '\n  const [showRuleManager, setShowRuleManager] = useState(false);'
    );
    console.log('✓ 添加状态');
    modified = true;
  }
}

// 3. 修改标题栏 - 在 gap-2 后添加新按钮
// 找到 </div>\n          <button onClick={onClose} 的位置
const closeBtnPattern = '</div>\n          <button onClick={onClose} className="text-white/80 hover:text-white">';
if (content.includes(closeBtnPattern) && !content.includes('规则管理')) {
  const buttonCode = `</div>
            <button
              onClick={() => setShowRuleManager(true)}
              className="text-white/80 hover:text-white text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 transition-colors"
              title="规则映射管理"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              规则管理
            </button>
            <div>`;

  content = content.replace(closeBtnPattern, buttonCode);
  console.log('✓ 添加按钮');
  modified = true;
}

// 4. 添加弹窗渲染 - 在 showAddFactorModal 之前
const modalMarker = '{/* 添加因子模态框 */}';
if (content.includes(modalMarker) && !content.includes('showRuleManager &&')) {
  const modalCode = `{/* 规则映射管理 */}
        {showRuleManager && (
          <ConstraintRuleManager
            onClose={() => setShowRuleManager(false)}
          />
        )}

        ${modalMarker}`;

  content = content.replace(modalMarker, modalCode);
  console.log('✓ 添加弹窗');
  modified = true;
}

if (modified) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('\n✅ 修改完成！请刷新浏览器测试。');
} else {
  console.log('\n⚠️ 文件似乎已经被修改过或未找到匹配项');
}

// 验证修改
const checks = {
  '导入': content.includes('ConstraintRuleManager'),
  '状态': content.includes('showRuleManager'),
  '按钮': content.includes('规则管理'),
  '弹窗': content.includes('showRuleManager &&')
};

console.log('\n验证结果:');
Object.entries(checks).forEach(([name, passed]) => {
  console.log(`  ${passed ? '✓' : '✗'} ${name}`);
});
