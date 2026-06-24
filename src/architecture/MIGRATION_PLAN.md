# 数据迁移方案

## 概述

本文档描述如何从旧的数据结构迁移到新的四层架构数据结构。

## 旧数据结构

```javascript
// 节点结构
{
  id: 'fangwenliuliang',
  name: '访问流量',
  type: 'driver',
  unit: '人次',
  format: '#,##0',
  value: 1234567,  // AC+FC 汇总
  baseline: 1500000,  // BU 汇总
  range: { min: ..., max: ... },
  timeData: {
    '2026WK01-AC': 50000,
    '2026WK01-FC': null,
    '2026WK01-BU': 55000,
    '2026WK13-AC': null,
    '2026WK13-FC': 72000,
    '2026WK13-BU': 80000
  },
  originalTimeData: {
    // 与 timeData 类似，但包含初始值
  },
  timeDimension: {
    type: 'week',
    periodCount: 18,
    isRolling: false
  }
}
```

## 新数据结构

### Layer 0: SourceDataNode

```javascript
{
  id: 'fangwenliuliang',
  name: '访问流量',
  type: 'driver',
  unit: '人次',
  format: '#,##0',
  direction: 'auto',
  periods: {
    '2026WK01': { AC: 50000, FC: null, BU: 55000 },
    '2026WK13': { AC: null, FC: 72000, BU: 80000 }
  },
  formula: null,
  source: 'csv',
  createdAt: 1712000000000,
  updatedAt: 1712000000000
}
```

### Layer 1: CalculatedNode

```javascript
{
  id: 'fangwenliuliang',
  name: '访问流量',
  type: 'driver',
  formula: null,
  dependencies: [],
  periods: {
    '2026WK01': { AC: 50000, FC: null, BU: 55000 }
  },
  summary: {
    actualTotal: 721000,
    forecastTotal: 560000,
    actualPlusForecast: 1281000
  }
}
```

### Layer 2: Adjustment

```javascript
{
  id: 'adj_xxx',
  nodeId: 'fangwenliuliang',
  period: '2026WK13',
  dataType: 'FC',
  fromValue: 72000,
  toValue: 80000,
  timestamp: 1712000000000,
  scenarioId: 'scenario_xxx',
  description: '增加访问量预测'
}
```

### Layer 3: NodeViewData

```javascript
{
  id: 'fangwenliuliang',
  name: '访问流量',
  type: 'driver',
  unit: '人次',
  format: '#,##0',
  direction: 'auto',
  initial: {
    periods: {
      '2026WK01': { actual: 50000, forecast: null, target: 55000 }
    },
    summary: {
      actualTotal: 721000,
      forecastTotal: 560000,
      actualPlusForecast: 1281000
    }
  },
  adjusted: {
    periods: {
      '2026WK13': { actual: null, forecast: 80000, target: 80000 }
    }
  },
  diffs: {
    '2026WK13': {
      adjustedForecastVsInitial: 8000
    }
  }
}
```

## 迁移步骤

### 步骤 1: 从旧节点创建 SourceDataNode

```javascript
function migrateToSourceDataNode(oldNode) {
  const periods = {};

  // 从 originalTimeData 提取
  if (oldNode.originalTimeData) {
    Object.entries(oldNode.originalTimeData).forEach(([key, value]) => {
      const match = key.match(/^(.+)-(AC|FC|BU)$|^(.+)(实际 | 预测 | 目标)$/);
      if (!match) return;

      const period = match[1] || match[3];
      const type = match[2] ||
        (match[4] === '实际' ? 'AC' : match[4] === '预测' ? 'FC' : 'BU');

      if (!periods[period]) {
        periods[period] = { AC: null, FC: null, BU: null };
      }

      periods[period][type] = value;
    });
  }

  return {
    id: oldNode.id,
    name: oldNode.name,
    type: oldNode.type,
    unit: oldNode.unit,
    format: oldNode.format,
    direction: oldNode.direction,
    periods,
    formula: oldNode.formula,
    source: 'csv',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
```

### 步骤 2: 创建 FormulaEngine 并计算

```javascript
const sourceDataManager = new SourceDataManager();
const formulaEngine = new FormulaEngine();

// 加载数据
sourceDataManager.loadFromCSV(csvText, formulaText);

// 计算所有节点
const cache = formulaEngine.calculateAll(sourceDataManager);
```

### 步骤 3: 创建 AdjustmentManager

```javascript
const adjustmentManager = new AdjustmentManager(sourceDataManager, formulaEngine);
```

### 步骤 4: 创建 ViewAdapter

```javascript
const viewAdapter = new ViewAdapter(sourceDataManager, formulaEngine, adjustmentManager);

// 获取视图数据
const viewData = viewAdapter.getNodeViewData('fangwenliuliang');
```

## 向后兼容

为了保证现有功能正常工作，需要在 `useVDTStore.js` 中创建适配器：

```javascript
// 旧 API → 新架构
function createBackwardCompatLayer() {
  const sourceDataManager = new SourceDataManager();
  const formulaEngine = new FormulaEngine();
  const adjustmentManager = new AdjustmentManager(sourceDataManager, formulaEngine);
  const viewAdapter = new ViewAdapter(sourceDataManager, formulaEngine, adjustmentManager);

  return {
    // 加载数据
    loadFromCSV: (csvText, formulaText) => {
      sourceDataManager.loadFromCSV(csvText, formulaText);
      formulaEngine.calculateAll(sourceDataManager);
    },

    // 获取节点（旧格式）
    getNode: (nodeId) => {
      const viewData = viewAdapter.getNodeViewData(nodeId);
      return convertViewDataToOldFormat(viewData);
    },

    // 应用调整
    applyAdjustment: (nodeId, period, type, value) => {
      adjustmentManager.applyAdjustment(nodeId, period, type, value);
      formulaEngine.invalidateCache([nodeId]);
    }
  };
}
```

## 迁移验证

### 验证 1: 数据完整性

```javascript
function verifyDataIntegrity(oldNodes, newSourceData) {
  const oldIds = Object.keys(oldNodes);
  const newIds = Array.from(newSourceData.keys());

  console.assert(oldIds.length === newIds.length, '节点数量应相同');

  oldIds.forEach(id => {
    console.assert(newSourceData.has(id), `节点 ${id} 应存在`);
  });
}
```

### 验证 2: 期间数据

```javascript
function verifyPeriodData(oldNode, newSourceNode) {
  // AC 值验证
  Object.entries(oldNode.originalTimeData || {})
    .filter(([key]) => key.endsWith('-AC') || key.includes('实际'))
    .forEach(([key, value]) => {
      const period = key.split('-')[0].replace('实际', '');
      console.assert(
        newSourceNode.periods[period]?.AC === value,
        `${period} AC 值应相同`
      );
    });
}
```

### 验证 3: 计算结果

```javascript
function verifyCalculationResults(oldNodes, formulaEngine) {
  Object.values(oldNodes).forEach(node => {
    if (node.type === 'computed') {
      const calculatedNode = formulaEngine.getCalculatedNode(node.id);
      console.assert(calculatedNode, `计算指标 ${node.id} 应存在`);
    }
  });
}
```

## 迁移测试

使用现有的测试数据进行验证：

```bash
# 运行 Layer 0 测试
node src/architecture/tests/layer0.test.js

# 运行 Layer 1 测试
node src/architecture/tests/layer1.test.js

# 运行 Layer 2 & 3 测试
node src/architecture/tests/layer2-3.test.js
```

## 注意事项

1. **保留原数据**: 迁移前务必备份所有数据
2. **渐进式迁移**: 先在新架构中运行，验证正确后再替换旧代码
3. **测试覆盖**: 确保所有现有测试通过
4. **性能考虑**: 新架构可能会增加内存使用（多层数据），需要监控
5. **版本控制**: 增加数据版本号，支持回滚

## 后续工作

1. 实现 PowerBI 数据源接入
2. 实现增量计算优化
3. 实现撤销/重做持久化
4. 实现多方案对比
5. 集成 AI 调参功能
