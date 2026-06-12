# ValQ 计算引擎架构设计

## 当前问题

1. **多层计算指标计算失败**：下层计算指标（如 `zhuanhualv_zong`）依赖上层计算指标（如 `zongshangjishu`），但计算结果为 0
2. **数据流复杂**：宽表/长表、多种周期（年/月/日/周/季）、滚动周期
3. **计算效率**：需要增量计算和缓存机制
4. **调整管理**：需要支持撤销/重做/方案对比

## 核心设计原则

### 1. 数据与计算分离
- **数据层**：存储原始数据和计算结果
- **计算层**：定义计算逻辑和依赖关系
- **视图层**：将数据转换为视图需要的格式

### 2. 拓扑排序驱动计算
- 构建依赖图
- 拓扑排序确定计算顺序
- 按顺序计算，确保依赖节点先计算

### 3. 增量计算与缓存
- 节点结果缓存
- 依赖节点变化时，只重新计算受影响的节点
- 支持撤销/重做

### 4. 周期无关设计
- 支持任意周期类型（年/月/日/周/季）
- 支持滚动周期（如 202602-202701）
- 周期配置与计算逻辑分离

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     应用层 (Application)                      │
│  - NodeCard (节点卡)                                         │
│  - TrendChart (趋势图)                                       │
│  - DataPanel (数据面板)                                      │
│  - AITuningPanel (AI 调参)                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   视图适配层 (View Adapter)                   │
│  - 将计算结果转换为视图格式                                   │
│  - 提供趋势图数据、表格数据                                   │
│  - 处理调整后的数据展示                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   拓扑计算层 (Topology Layer) ⭐新增          │
│  - 依赖图管理 (Dependency Graph)                             │
│  - 拓扑排序 (Topological Sort)                               │
│  - 计算顺序调度 (Computation Order)                          │
│  - 增量计算调度 (Incremental Computation)                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  公式引擎层 (Formula Engine)                  │
│  - 公式解析 (Formula Parser)                                 │
│  - 单期计算 (Single Period Calculation)                      │
│  - 累计计算 (Cumulative Calculation)                         │
│  - MONTHLY 函数处理                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   数据管理层 (Data Manager)                   │
│  - 原始数据存储 (Source Data)                                │
│  - 计算结果缓存 (Calculated Data Cache)                      │
│  - 调整记录存储 (Adjustment Records)                         │
│  - 周期配置管理 (Period Configuration)                       │
└─────────────────────────────────────────────────────────────┘
```

## 各层职责

### 1. 数据管理层 (Data Manager)
**职责**：
- 存储原始数据（驱动因子的每期值）
- 存储计算结果（计算指标的每期值）
- 管理周期配置（周期类型、周期列表、滚动周期）
- 提供数据访问接口

**数据结构**：
```typescript
interface PeriodConfig {
  type: 'year' | 'quarter' | 'month' | 'week' | 'day';
  periods: string[];  // 如 ['2026WK01', '2026WK02', ..., '2027WK01']
  isRolling: boolean;
  range: { start: string; end: string };
}

interface SourceDataNode {
  id: string;
  name: string;
  type: 'driver' | 'computed';
  periods: {  // 期数数据
    [period: string]: {
      AC: number | null;  // 实际值
      FC: number | null;  // 预测值
      BU: number | null;  // 目标值
    }
  };
  formula?: string;  // 计算指标才有
  level?: string;  // 层级
}
```

### 2. 公式引擎层 (Formula Engine)
**职责**：
- 解析公式，提取依赖
- 实现单期计算逻辑
- 实现 MONTHLY 函数
- 处理累计计算

**关键设计**：
- 单期计算：给定期间，计算该期的值
- 累计计算：从第一期累加到当前期
- MONTHLY 函数：根据函数类型（SUM/AVG/MAX/MIN/COUNT）聚合

### 3. 拓扑计算层 (Topology Layer) ⭐新增
**职责**：
- 构建依赖图
- 拓扑排序
- 调度计算顺序
- 管理增量计算

**核心接口**：
```typescript
interface TopologyLayer {
  // 构建依赖图
  buildDependencyGraph(nodes: Map<string, SourceDataNode>): void;
  
  // 获取计算顺序
  getComputeOrder(): string[];
  
  // 计算指定节点（按拓扑顺序）
  computeNode(nodeId: string): CalculatedNode;
  
  // 计算所有节点
  computeAll(): Map<string, CalculatedNode>;
  
  // 增量计算（只计算受影响的节点）
  computeAffected(nodeIds: string[]): Map<string, CalculatedNode>;
  
  // 获取依赖图
  getDependencyGraph(): Map<string, string[]>;
  
  // 检测环形依赖
  hasCycle(): boolean;
}
```

### 4. 视图适配层 (View Adapter)
**职责**：
- 将计算结果转换为视图格式
- 提供趋势图数据
- 提供表格数据
- 处理差额计算

### 5. 应用层 (Application)
**职责**：
- UI 组件
- 用户交互
- 状态管理（Zustand）

## 数据流

```
用户导入 CSV
    ↓
数据管理层：解析 CSV，存储原始数据
    ↓
拓扑计算层：构建依赖图，拓扑排序
    ↓
公式引擎层：按拓扑顺序计算每个节点
    ↓
视图适配层：转换为视图格式
    ↓
应用层：显示节点卡、趋势图
```

## 增量计算流程

```
用户调整某期的 FC 值
    ↓
数据管理层：更新原始数据，标记节点为"已修改"
    ↓
拓扑计算层：找到所有依赖该节点的节点（上游）
    ↓
拓扑计算层：按拓扑顺序重新计算受影响的节点
    ↓
视图适配层：更新视图数据
    ↓
应用层：刷新 UI
```

## 缓存策略

```typescript
interface CalculationCache {
  // 节点计算结果缓存
  nodes: Map<string, CalculatedNode>;
  
  // 数据版本号
  sourceDataVersion: number;
  
  // 缓存版本号
  cacheVersion: number;
  
  // 依赖图快照
  dependencyGraph: Map<string, string[]>;
  
  // 计算顺序快照
  computeOrder: string[];
}

// 增量计算时，检查缓存是否有效
function needsRecalculation(cache: CalculationCache, sourceData: SourceDataManager): boolean {
  return cache.sourceDataVersion !== sourceData.getVersion();
}
```

## 周期处理

**周期配置**：
```typescript
// 从数据表头检测周期类型
function detectPeriodType(headers: string[]): PeriodConfig {
  // 匹配 WK → 周度
  // 匹配 Q → 季度
  // 匹配 年月 → 月度
  // 匹配 日 → 日度
  // 检查是否滚动（跨年）
}
```

**滚动周期支持**：
- 周期列表存储所有期间（如 202602-202701 共 12 期）
- 计算时使用周期列表，不硬编码 12 期
- UI 显示时根据周期类型格式化

## 实施步骤

### 阶段 1：修复当前问题
1. 修复 `_calculateSimpleNode` 处理计算指标依赖的逻辑
2. 修复 ViewAdapter 的 `actual_cumulative` 取值逻辑

### 阶段 2：引入拓扑层
1. 创建 `TopologyLayer` 类
2. 迁移 `FormulaEngine` 的依赖图逻辑到拓扑层
3. 重构 `FormulaEngine` 只负责单期计算

### 阶段 3：优化缓存
1. 实现增量计算
2. 实现版本管理
3. 实现撤销/重做

### 阶段 4：支持多周期
1. 重构周期检测逻辑
2. 支持 PowerBI 长表格式
3. 支持滚动周期配置

## 当前问题修复

**问题**：`_calculateSimpleNode` 在计算 `zhuanhualv_zong = zongshangjishu/zongxiansuoshu` 时，依赖节点是计算指标，它们的 `periods` 结构是每期都有 AC 值（单期值），而 `_calculateSimpleNode` 累加了所有期的 AC 值，导致结果错误。

**修复方案**：
1. 对于计算指标依赖，应该取依赖节点的 `summary.actualTotal`（已汇总的值）
2. 或者，在计算比率型公式时，直接使用依赖节点的汇总值，而不是重新累加
