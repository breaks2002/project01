# 渐进式集成指南

## 概述

本文档描述如何逐步将四层新架构集成到现有的 `useVDTStore.js` 中，采用渐进式策略，确保现有功能不受影响。

## 集成策略

采用 **"适配器模式" + "绞杀者模式"**：
1. 创建 `ArchitectureAdapter` 作为新旧架构之间的桥梁
2. 在 `useVDTStore.js` 中逐步调用新架构
3. 验证每一步的正确性
4. 最终完全替换旧代码

## 阶段一：数据加载集成（已完成）

### 状态
- ✅ `ArchitectureAdapter` 已创建
- ✅ `SourceDataManager` 已实现
- ✅ `FormulaEngine` 已实现

### 下一步

在 `useVDTStore.js` 中添加新架构集成点：

```javascript
// src/store/useVDTStore.js

import { ArchitectureAdapter } from '../architecture/ArchitectureAdapter';

// ... 在 store 中 ...

// 新增：新架构适配器实例
architectureAdapter: null,

// 新增：初始化新架构
_initArchitecture: () => {
  const state = get();
  if (state.architectureAdapter) return;
  
  const adapter = new ArchitectureAdapter();
  set({ architectureAdapter: adapter });
},

// 新增：使用新架构加载数据
loadFromCSVWithNewArch: (csvText, formulaText) => {
  const state = get();
  if (!state.architectureAdapter) {
    get()._initArchitecture();
  }
  
  const result = state.architectureAdapter.loadFromCSV(csvText, formulaText);
  
  // 同步到旧 nodes 状态（向后兼容）
  const nodes = state.architectureAdapter.getAllNodes();
  set({ nodes });
  
  return result;
},
```

## 阶段二：调整功能集成

### 修改 `useVDTStore.js`

```javascript
// 新增：应用调整（使用新架构）
applyAdjustmentNew: (nodeId, period, dataType, value) => {
  const state = get();
  if (!state.architectureAdapter) return;
  
  // 使用新架构应用调整
  const adjustment = state.architectureAdapter.applyAdjustment(
    nodeId, period, dataType, value
  );
  
  // 同步到旧 nodes 状态
  const nodes = state.architectureAdapter.getAllNodes();
  set({ nodes });
  
  return adjustment;
},

// 新增：撤销调整
undoNew: () => {
  const state = get();
  if (!state.architectureAdapter) return null;
  
  const adjustment = state.architectureAdapter.undo();
  
  // 同步到旧 nodes 状态
  const nodes = state.architectureAdapter.getAllNodes();
  set({ nodes });
  
  return adjustment;
},
```

## 阶段三：视图组件集成

### 修改 `TrendChart.jsx`

```jsx
// src/components/Canvas/TrendChart.jsx

// 旧代码：
// const actualData = node.timeData ? ... : [];

// 新代码：
const getTrendChartData = () => {
  const { architectureAdapter, currentScenarioId } = useVDTStore();
  
  if (architectureAdapter && node) {
    return architectureAdapter.getTrendChartData(node.id);
  }
  
  // 回退到旧逻辑
  return null;
};

// 在组件中使用：
const trendChartData = getTrendChartData();
if (trendChartData) {
  // 使用新架构数据
  renderWithNewData(trendChartData);
} else {
  // 使用旧架构数据
  renderWithOldData();
}
```

## 阶段四：完全替换

当所有测试通过后，移除旧代码：

```javascript
// 移除旧的 _recalculate
// 移除旧的 calculateMonthlyValue
// 移除旧的 calculateMonthlyInitialValue

// 使用新架构
_recalculate: () => {
  const state = get();
  if (state.architectureAdapter) {
    state.architectureAdapter.formulaEngine.calculateAll(
      state.architectureAdapter.sourceDataManager
    );
    const nodes = state.architectureAdapter.getAllNodes();
    set({ nodes });
  }
},
```

## 集成检查清单

### 数据加载
- [ ] 导入 CSV 数据
- [ ] 导入公式表
- [ ] 解析驱动因子
- [ ] 解析计算指标
- [ ] 解析 MONTHLY 函数节点

### 计算引擎
- [ ] 简单公式计算
- [ ] 比率型指标计算
- [ ] MONTHLY 函数计算
- [ ] 嵌套 MONTHLY 函数计算
- [ ] 依赖图拓扑排序
- [ ] 缓存机制

### 调整功能
- [ ] 应用调整
- [ ] 撤销调整
- [ ] 重做调整
- [ ] 方案管理
- [ ] 方案切换

### 视图显示
- [ ] 节点卡显示
- [ ] 趋势图显示
- [ ] 数据详情表格
- [ ] 月份明细表
- [ ] 差额计算

## 测试验证

### 单元测试
```bash
# Layer 0 测试
node src/architecture/tests/layer0.test.js

# Layer 1 测试
node src/architecture/tests/layer1.test.js

# Layer 2 & 3 测试
node src/architecture/tests/layer2-3.test.js

# 集成测试
# 在浏览器中打开 src/architecture/test.html
```

### 端到端测试
1. 打开应用
2. 导入 `docs/测试数据/周度销售漏斗测试数据.csv`
3. 导入 `docs/测试数据/周度销售漏斗测试数据 - 公式表.csv`
4. 验证节点卡显示正确
5. 调整驱动因子（如 `访问流量` 2026WK13 预测）
6. 验证计算指标联动更新
7. 验证趋势图显示正确
8. 验证撤销/重做功能

## 已知问题

### 问题 1: MONTHLY 函数计算

**现象**: MONTHLY 节点的计算结果可能不正确

**原因**: `FormulaEngine._calculateMonthlyNode` 中对于周度数据的处理需要特殊逻辑

**解决**: 根据时间维度类型（week/month/quarter）调整 MONTHLY 函数计算逻辑

### 问题 2: 数据格式兼容

**现象**: 旧格式节点与新格式节点的字段不完全一致

**解决**: 在 `ArchitectureAdapter._convertViewDataToOldFormat` 中进行字段转换

## 回滚方案

如果集成过程中出现问题，可以快速回滚到旧架构：

```javascript
// 在 useVDTStore.js 中保留旧代码
// 通过配置开关切换新旧架构

const USE_NEW_ARCHITECTURE = false;  // 设置为 false 回滚

if (USE_NEW_ARCHITECTURE) {
  // 使用新架构
} else {
  // 使用旧架构
}
```

## 性能优化建议

1. **懒加载**: 只在需要时初始化新架构
2. **增量计算**: 只重新计算受影响的节点
3. **缓存**: 使用 FormulaEngine 的缓存机制
4. **Web Worker**: 将计算密集型任务移到 Web Worker

## 下一步行动

1. **在浏览器中测试**: 打开 `src/architecture/test.html` 验证基本功能
2. **集成到 useVDTStore**: 按上述步骤逐步集成
3. **组件重构**: 重构 TrendChart、NodeCard 等组件
4. **端到端测试**: 完整测试所有功能
5. **性能优化**: 根据测试结果优化性能
