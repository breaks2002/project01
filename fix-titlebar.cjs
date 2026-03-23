const fs = require('fs');
const filePath = 'src/components/DataPanel/AITuningPanel.jsx';
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 修改第 2167 行 (索引 2166): gap-2 -> gap-3
if (lines[2166] && lines[2166].includes('gap-2')) {
  lines[2166] = lines[2166].replace('gap-2', 'gap-3');
  console.log('✓ 修改 gap-2 -> gap-3');
}

// 在第 2172 行之后插入按钮 (索引 2172)
if (lines[2171] && lines[2171].includes('</div>')) {
  const buttonLines = [
    '            </div>',
    '            <button',
    '              onClick={() => setShowRuleManager(true)}',
    '              className="text-white/80 hover:text-white text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 transition-colors"',
    '              title="规则映射管理"',
    '            >',
    '              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">',
    '                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />',
    '                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />',
    '              </svg>',
    '              规则管理',
    '            </button>',
    '            <div>'
  ];

  // 删除原来的 </div>
  lines.splice(2172, 1);
  // 插入按钮代码
  buttonLines.forEach((line, i) => {
    lines.splice(2172 + i, 0, line);
  });
  console.log('✓ 添加按钮');
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('✅ 标题栏修改完成');
