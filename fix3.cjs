const fs = require('fs');

const filePath = 'src/components/DataPanel/AITuningPanel.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 使用更精确的匹配
const oldPattern = '<div className="flex items-center gap-2">\n            <svg className="w-5 h-5 text-white"';
const newPattern = `<div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-white"`;

if (content.includes(oldPattern)) {
  content = content.replace(oldPattern, newPattern);

  // 在</div>后添加按钮
  const oldEnd = '<span className="text-white font-medium">AI 智能调参</span>\n          </div>';
  const newEnd = `<span className="text-white font-medium">AI 智能调参</span>
            </div>
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
            </button>`;

  content = content.replace(oldEnd, newEnd);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ 标题栏修改完成');
} else {
  console.log('❌ 未找到目标字符串');
  console.log('Searching for gap-2...');
  if (content.includes('gap-2')) {
    const idx = content.indexOf('gap-2');
    console.log('Found at:', idx);
    console.log('Context:', content.substring(idx-20, idx+100));
  }
}
