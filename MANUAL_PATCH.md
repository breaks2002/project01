## AITuningPanel.jsx 手动修改指南

由于文件包含中文字符，自动化脚本无法正确修改。请手动应用以下补丁：

### 修改 1：添加导入（第 13 行之后）

在文件开头找到：
```javascript
import { TEST_VERSION } from '../../test-version';
```

在其后添加：
```javascript
import ConstraintRuleManager from './ConstraintRuleManager';
```

### 修改 2：添加状态（约第 87 行）

找到：
```javascript
const [appliedCount, setAppliedCount] = useState(0);
```

在其后添加：
```javascript
const [showRuleManager, setShowRuleManager] = useState(false);
```

### 修改 3：修改标题栏（约第 2167 行）

找到：
```javascript
<div className="flex items-center gap-2">
  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
  <span className="text-white font-medium">AI 智能调参</span>
</div>
```

替换为：
```javascript
<div className="flex items-center gap-3">
  <div className="flex items-center gap-2">
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
    <span className="text-white font-medium">AI 智能调参</span>
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
  </button>
</div>
```

### 修改 4：添加弹窗渲染（约第 2910 行）

找到：
```javascript
{/* 添加因子模态框 */}
{showAddFactorModal && (
```

在其前添加：
```javascript
{/* 规则映射管理 */}
{showRuleManager && (
  <ConstraintRuleManager
    onClose={() => setShowRuleManager(false)}
  />
)}

```

### 完成

保存文件后刷新浏览器，应该能看到"规则管理"按钮。
