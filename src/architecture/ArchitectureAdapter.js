/**
 * 新架构集成适配器
 * 将四层新架构与现有 useVDTStore 连接
 */

import { SourceDataManager } from './layers/SourceDataManager';
import { FormulaEngine } from './layers/FormulaEngine';
import { AdjustmentManager } from './layers/AdjustmentManager';
import { ViewAdapter } from './layers/ViewAdapter';

export class ArchitectureAdapter {
  constructor() {
    // 初始化四层架构
    this.sourceDataManager = new SourceDataManager();
    // 先创建 FormulaEngine（不带 AdjustmentManager）
    this.formulaEngine = new FormulaEngine(this.sourceDataManager);
    // 再创建 AdjustmentManager（需要 FormulaEngine 引用）
    this.adjustmentManager = new AdjustmentManager(this.sourceDataManager, this.formulaEngine);
    // 关键修复：将 AdjustmentManager 设置到 FormulaEngine 中（解决循环依赖）
    this.formulaEngine.setAdjustmentManager(this.adjustmentManager);
    // 最后创建 ViewAdapter
    this.viewAdapter = new ViewAdapter(this.sourceDataManager, this.formulaEngine, this.adjustmentManager);

    // 回调函数
    this._onChange = null;
  }

  /**
   * 从 CSV 加载数据
   * @param {string} csvText - 数据 CSV
   * @param {string} formulaText - 公式表 CSV
   * @returns {Object} 加载结果
   */
  loadFromCSV(csvText, formulaText) {
    console.log('[ArchitectureAdapter] 开始加载数据...');

    // 获取现有节点（用于合并时间数据）
    const existingNodes = new Map(this.sourceDataManager.getAllNodes());
    console.log('[ArchitectureAdapter] 现有节点数:', existingNodes.size);

    // Layer 0: 加载原始数据（传递 existingNodes 用于合并时间数据）
    this.sourceDataManager.loadFromCSV(csvText, formulaText, existingNodes);
    console.log('[ArchitectureAdapter] Layer 0 完成，源数据节点数:', this.sourceDataManager.getAllNodes().size);

    // Layer 1: 计算所有节点（传入 Map 而不是 manager 本身）
    const sourceNodes = this.sourceDataManager.getAllNodes();
    console.log('[ArchitectureAdapter] 开始 Layer 1 计算...');
    const result = this.formulaEngine.calculateAll(sourceNodes);
    console.log('[ArchitectureAdapter] Layer 1 完成，计算节点数:', result.cache?.nodes?.size || this.formulaEngine._cache.nodes.size);

    console.log('[ArchitectureAdapter] 数据加载完成');

    // 保存基准快照（在第一次调整前）
    this.saveBaselineSnapshot();

    return {
      nodeCount: this.sourceDataManager.getAllNodes().size,
      timeDimension: this.sourceDataManager.getTimeDimension()
    };
  }

  /**
   * 从 Power BI 加载数据
   * @param {Map<string, Object>} nodesMap - 连接器返回的节点数据 Map
   * @returns {Object} 加载结果
   */
  loadFromPowerBI(nodesMap) {
    console.log('[ArchitectureAdapter] 从 Power BI 加载数据...');

    // Layer 0: 加载 PowerBI 数据
    this.sourceDataManager.loadFromPowerBI(nodesMap);
    console.log('[ArchitectureAdapter] Layer 0 完成，源数据节点数:', this.sourceDataManager.getAllNodes().size);

    // Layer 1: 计算所有节点
    const sourceNodes = this.sourceDataManager.getAllNodes();
    console.log('[ArchitectureAdapter] 开始 Layer 1 计算...');
    this.formulaEngine.calculateAll(sourceNodes);
    console.log('[ArchitectureAdapter] Layer 1 完成');

    console.log('[ArchitectureAdapter] Power BI 数据加载完成');

    // 保存基准快照
    this.saveBaselineSnapshot();

    return {
      nodeCount: this.sourceDataManager.getAllNodes().size,
      timeDimension: this.sourceDataManager.getTimeDimension()
    };
  }

  /**
   * 保存基准快照（在第一次调整前调用）
   */
  saveBaselineSnapshot() {
    console.log('[ArchitectureAdapter] 保存基准快照...');

    this._baselineSnapshot = {};

    // 驱动因子：从 SourceDataManager 获取
    this.sourceDataManager.getAllNodes().forEach((sourceNode, nodeId) => {
      const calculatedNode = this.formulaEngine.getCalculatedNode(nodeId);
      const node = calculatedNode || sourceNode;

      // 构建 originalTimeData（直接从 periods 获取）
      const originalTimeData = {};
      if (node.periods) {
        Object.entries(node.periods).forEach(([period, data]) => {
          if (data.AC !== null && data.AC !== undefined) originalTimeData[`${period}-AC`] = data.AC;
          if (data.FC !== null && data.FC !== undefined) originalTimeData[`${period}-FC`] = data.FC;
          if (data.BU !== null && data.BU !== undefined) originalTimeData[`${period}-BU`] = data.BU;
        });
      }

      // 驱动因子：从 sourceData.periods 计算初始值和目标值
      let acSum = 0, fcSum = 0, buSum = 0;
      Object.values(node.periods || {}).forEach(data => {
        if (data.AC) acSum += data.AC;
        if (data.FC) fcSum += data.FC;
        if (data.BU) buSum += data.BU;
      });

      this._baselineSnapshot[nodeId] = {
        value: node.value ?? (acSum + fcSum),
        targetValue: node.targetValue ?? buSum,
        initialBaseline: node.initialBaseline ?? (acSum + fcSum),
        baseline: node.baseline ?? buSum,
        originalTimeData
      };
    });

    // 计算指标：从 ViewAdapter 获取初始计算结果（不随调整变化）
    this.formulaEngine.getAllCalculatedNodes().forEach((calculatedNode, nodeId) => {
      const viewData = this.viewAdapter.getNodeViewData(nodeId);

      // 构建 originalTimeData
      const originalTimeData = {};
      if (calculatedNode.periods) {
        Object.entries(calculatedNode.periods).forEach(([period, data]) => {
          if (data.AC !== null && data.AC !== undefined) originalTimeData[`${period}-AC`] = data.AC;
          if (data.FC !== null && data.FC !== undefined) originalTimeData[`${period}-FC`] = data.FC;
          if (data.BU !== null && data.BU !== undefined) originalTimeData[`${period}-BU`] = data.BU;
        });
      }

      this._baselineSnapshot[nodeId] = {
        value: viewData?.initial?.summary?.actualPlusForecast ?? calculatedNode.value ?? 0,
        targetValue: viewData?.initial?.summary?.targetTotal ?? calculatedNode.summary?.budgetTotal ?? 0,
        initialBaseline: viewData?.initial?.summary?.actualPlusForecast ?? calculatedNode.value ?? 0,
        baseline: viewData?.initial?.summary?.targetTotal ?? calculatedNode.summary?.budgetTotal ?? 0,
        originalTimeData
      };
    });

    console.log('[ArchitectureAdapter] 基准快照节点数:', Object.keys(this._baselineSnapshot).length);

    // 将基准快照同步到 AdjustmentManager
    this.adjustmentManager.setBaselineSnapshot(this._baselineSnapshot);
  }

  /**
   * 获取基准快照中的节点值
   */
  getBaselineNodeValue(nodeId) {
    return this._baselineSnapshot?.[nodeId] || null;
  }

  /**
   * 获取所有节点（旧格式兼容）
   * @returns {Object} 节点对象
   */
  getAllNodes() {
    const nodes = {};

    // 1. 首先获取所有源数据节点（驱动因子）
    this.sourceDataManager.getAllNodes().forEach((sourceNode, nodeId) => {
      const calculatedNode = this.formulaEngine.getCalculatedNode(nodeId);
      const viewData = this.viewAdapter.getNodeViewData(nodeId);

      // 转换为旧格式兼容
      nodes[nodeId] = this._convertViewDataToOldFormat(viewData, sourceNode, calculatedNode);
    });

    // 2. 然后获取 FormulaEngine 中的计算指标节点（可能不在 sourceDataManager 中）
    this.formulaEngine.getAllCalculatedNodes().forEach((calculatedNode, nodeId) => {
      // 如果已经存在（从源数据来的），跳过
      if (nodes[nodeId]) return;

      const sourceNode = this.sourceDataManager.getSourceData(nodeId);
      const viewData = this.viewAdapter.getNodeViewData(nodeId);

      // 转换为旧格式兼容
      nodes[nodeId] = this._convertViewDataToOldFormat(viewData, sourceNode, calculatedNode);
    });

    return nodes;
  }

  /**
   * 获取单个节点（旧格式兼容）
   * @param {string} nodeId - 节点 ID
   * @returns {Object} 节点对象
   */
  getNode(nodeId) {
    const sourceNode = this.sourceDataManager.getSourceData(nodeId);
    const calculatedNode = this.formulaEngine.getCalculatedNode(nodeId);
    const viewData = this.viewAdapter.getNodeViewData(nodeId);

    if (!sourceNode && !calculatedNode) {
      return null;
    }

    return this._convertViewDataToOldFormat(viewData, sourceNode, calculatedNode);
  }

  /**
   * 应用调整
   * @param {string} nodeId - 节点 ID
   * @param {string} period - 期间
   * @param {'AC' | 'FC' | 'BU'} dataType - 数据类型
   * @param {number} value - 值
   * @returns {Object} 调整结果
   */
  applyAdjustment(nodeId, period, dataType, value) {
    console.log(`🔥 [ArchitectureAdapter] 应用调整：${nodeId} ${period}-${dataType} = ${value}`);

    // Layer 2: 应用调整
    const adjustment = this.adjustmentManager.applyAdjustment(nodeId, period, dataType, value);

    // Layer 1: 重新计算
    console.log('🔥 [ArchitectureAdapter] 开始重新计算...');
    const sourceNodes = this.sourceDataManager.getAllNodes();
    console.log('🔥 [ArchitectureAdapter] 源数据节点数:', sourceNodes instanceof Map ? sourceNodes.size : Object.keys(sourceNodes).length);

    const result = this.formulaEngine.calculateAll(sourceNodes, { incremental: false });

    console.log('🔥 [ArchitectureAdapter] 重新计算完成，缓存节点数:', result.cache?.nodes?.size || this.formulaEngine._cache.nodes.size);

    // 触发变更回调
    if (this._onChange) {
      this._onChange({ type: 'adjustment', adjustment, nodeId });
    }

    return adjustment;
  }

  /**
   * 批量应用调整（只记录调整，最后一次性重算）
   * @param {Array<{nodeId, period, dataType, value}>} adjustments
   */
  applyBatchAdjustments(adjustments) {
    adjustments.forEach(({ nodeId, period, dataType, value }) => {
      this.adjustmentManager.applyAdjustment(nodeId, period, dataType, value);
    });

    const sourceNodes = this.sourceDataManager.getAllNodes();
    this.formulaEngine.calculateAll(sourceNodes, { incremental: false });
  }

  /**
   * 撤销调整
   * @returns {Object | null} 撤销的调整
   */
  undo() {
    const adjustment = this.adjustmentManager.undo();
    if (adjustment) {
      // AdjustmentManager.undo 内部会更新源数据
      this.formulaEngine.calculateAll(this.sourceDataManager.getAllNodes(), { incremental: false });
      if (this._onChange) {
        this._onChange({ type: 'undo', adjustment });
      }
    }
    return adjustment;
  }

  /**
   * 重做调整
   * @returns {Object | null} 重做的调整
   */
  redo() {
    const adjustment = this.adjustmentManager.redo();
    if (adjustment) {
      // AdjustmentManager.redo 内部会更新源数据
      this.formulaEngine.calculateAll(this.sourceDataManager.getAllNodes(), { incremental: false });
      if (this._onChange) {
        this._onChange({ type: 'redo', adjustment });
      }
    }
    return adjustment;
  }

  /**
   * 清除所有调整
   */
  clearAdjustments() {
    this.adjustmentManager.clearAdjustments();
    this.formulaEngine.clearCache();
    this.formulaEngine.calculateAll(this.sourceDataManager.getAllNodes());
    if (this._onChange) {
      this._onChange({ type: 'clear' });
    }
  }

  /**
   * 获取趋势图数据
   * @param {string} nodeId - 节点 ID
   * @returns {Object} 趋势图数据
   */
  getTrendChartData(nodeId) {
    return this.viewAdapter.getTrendChartData(nodeId);
  }

  /**
   * 获取表格数据
   * @param {string} nodeId - 节点 ID
   * @returns {Object} 表格数据
   */
  getTableData(nodeId) {
    return this.viewAdapter.getTableData(nodeId);
  }

  /**
   * 获取月份明细表数据
   * @returns {Object} 月份明细表数据
   */
  getMonthDetailTableData() {
    return this.viewAdapter.getMonthDetailTableData();
  }

  /**
   * 获取所有方案
   * @returns {Array} 方案列表
   */
  getAllScenarios() {
    return this.adjustmentManager.getAllScenarios();
  }

  /**
   * 创建方案
   * @param {string} name - 方案名称
   * @param {string} description - 方案描述
   * @returns {Object} 新方案
   */
  createScenario(name, description) {
    return this.adjustmentManager.createScenario(name, description);
  }

  /**
   * 切换方案
   * @param {string} scenarioId - 方案 ID
   */
  switchScenario(scenarioId) {
    this.adjustmentManager.switchScenario(scenarioId);
    this.formulaEngine.clearCache();
    this.formulaEngine.calculateAll(this.sourceDataManager);
    if (this._onChange) {
      this._onChange({ type: 'scenarioSwitch', scenarioId });
    }
  }

  /**
   * 获取当前方案
   * @returns {Object} 当前方案
   */
  getCurrentScenario() {
    return this.adjustmentManager.getCurrentScenario();
  }

  /**
   * 设置变更回调
   * @param {Function} callback - 回调函数
   */
  setOnChange(callback) {
    this._onChange = callback;
  }

  /**
   * 获取数据版本
   * @returns {number} 版本号
   */
  getVersion() {
    return this.sourceDataManager.getVersion();
  }

  /**
   * 获取时间维度
   * @returns {Object} 时间维度配置
   */
  getTimeDimension() {
    return this.sourceDataManager.getTimeDimension();
  }

  /**
   * 获取节点数量
   * @returns {number} 节点数量
   */
  getNodeCount() {
    return this.sourceDataManager.getAllNodes().size;
  }

  /**
   * 获取调整数量
   * @returns {number} 调整数量
   */
  getAdjustmentCount() {
    return this.adjustmentManager.getAdjustments().length;
  }

  // ========== 内部辅助方法 ==========

  /**
   * 将 ViewData 转换为旧格式（向后兼容）
   */
  _convertViewDataToOldFormat(viewData, sourceNode, calculatedNode) {
    if (!viewData && !sourceNode) {
      return null;
    }

    const nodeId = viewData?.id || sourceNode?.id || calculatedNode?.id;

    // value 取值优先级：viewData adjusted > viewData initial > calculatedNode
    // 注意：使用 || 而不是 ??，因为 0 也是有效值
    const value = viewData?.adjusted?.summary?.actualPlusForecast
                  || viewData?.initial?.summary?.actualPlusForecast
                  || calculatedNode?.summary?.actualPlusForecast
                  || 0;

    // 目标值 - 从基准快照获取（不随调整变化）
    const baselineSnapshot = this._baselineSnapshot?.[nodeId];
    const targetValue = baselineSnapshot?.targetValue
      || sourceNode?.range?.target
      || viewData?.initial?.summary?.targetTotal
      || calculatedNode?.summary?.budgetTotal
      || 0;

    // 初始值 - 从基准快照获取（不随调整变化）
    // 初始 = AC + 原始FC（actualPlusForecast）
    const initialBaseline = baselineSnapshot?.initialBaseline
      || viewData?.initial?.summary?.actualPlusForecast
      || calculatedNode?.summary?.actualPlusForecast
      || 0;

    // baseline 值 - 从基准快照获取（不随调整变化）
    const baseline = baselineSnapshot?.baseline
      || viewData?.adjusted?.summary?.targetTotal
      || viewData?.initial?.summary?.targetTotal
      || calculatedNode?.summary?.budgetTotal
      || 0;

    // 使用 viewData 或 sourceNode 构建旧格式
    const node = {
      id: viewData?.id || sourceNode?.id || calculatedNode?.id,
      name: viewData?.name || sourceNode?.name || calculatedNode?.name,
      type: viewData?.type || sourceNode?.type || calculatedNode?.type,
      unit: viewData?.unit || sourceNode?.unit || calculatedNode?.unit || '',
      format: viewData?.format || sourceNode?.format || calculatedNode?.format || '#,##0',
      direction: viewData?.direction || sourceNode?.direction || calculatedNode?.direction || 'auto',
      level: sourceNode?.level || calculatedNode?.level || '1',
      formula: sourceNode?.formula || calculatedNode?.formula || null,
      dependsOn: calculatedNode?.dependencies || [],

      // 汇总值
      value: value,

      // 目标值 - 从基准快照获取（不随调整变化）
      targetValue: targetValue,

      // 初始值（用于显示）- 从基准快照获取（不随调整变化）
      initialBaseline: initialBaseline,

      baseline: baseline,

      // range: 驱动因子使用 sourceNode 中的配置值（不随调整变化），计算指标使用动态计算值
      // 关键：range 必须从原始 sourceNode 获取，不能用计算后的值
      range: sourceNode?.type === 'driver'
        ? (sourceNode?.range && sourceNode.range.max
            ? { min: sourceNode.range.min ?? 0, max: sourceNode.range.max }
            : { min: 0, max: 100 })
        : (calculatedNode ? {
            min: 0,
            max: calculatedNode.summary.actualTotal + calculatedNode.summary.forecastTotal
          } : { min: 0, max: 100 }),

      // 时间数据（旧格式）- 使用 adjusted 数据（包含调整后的值）
      timeData: this._buildTimeData(viewData, 'adjusted'),
      // 关键修复：计算指标的 originalTimeData 直接从 calculatedNode.periods 构建（不经过 ViewAdapter）
      // 这样确保 BU 数据来自 FormulaEngine 第一次计算的结果，不随调整变化
      originalTimeData: (viewData?.type === 'computed' && calculatedNode?.periods)
        ? this._buildTimeDataFromPeriods(calculatedNode.periods)
        : this._buildTimeData(viewData, 'initial'),

      // 期间明细 - 使用 adjusted 数据（但过滤掉 forecast 为 0 的 AC 期间）
      periodData: (() => {
        const adjustedPeriods = viewData?.adjusted?.periods || {};
        const filteredPeriods = {};
        Object.entries(adjustedPeriods).forEach(([key, data]) => {
          // 只有当 forecast 不为 0 时才包含该期间
          if (data?.forecast !== null && data?.forecast !== undefined && data?.forecast !== 0) {
            filteredPeriods[key] = data;
          } else {
            // AC 期间只包含 actual
            filteredPeriods[key] = {
              actual: data?.actual ?? null,
              forecast: null,
              target: data?.target ?? null
            };
          }
        });
        return filteredPeriods;
      })(),

      // 汇总统计
      // 关键修复：forecastTotal 使用 adjusted（调整后）的值，而不是 initial（初始）的值
      summary: {
        actualTotal: viewData?.initial?.summary?.actualTotal || calculatedNode?.summary?.actualTotal || 0,
        actualPeriods: viewData?.initial?.summary?.actualCount || calculatedNode?.summary?.actualCount || 0,
        forecastTotal: viewData?.adjusted?.summary?.forecastTotal || viewData?.initial?.summary?.forecastTotal || calculatedNode?.summary?.forecastTotal || 0,
        forecastPeriods: viewData?.adjusted?.summary?.forecastCount || viewData?.initial?.summary?.forecastCount || calculatedNode?.summary?.forecastCount || 0,
        actualPlusForecast: viewData?.adjusted?.summary?.actualPlusForecast || viewData?.initial?.summary?.actualPlusForecast || calculatedNode?.summary?.actualPlusForecast || 0
      },

      // 差额数据
      diffs: viewData?.diffs || {},

      // 时间维度
      timeDimension: this.sourceDataManager.getTimeDimension()
    };

    return node;
  }

  /**
   * 构建 timeData（旧格式：key 为 period-type）
   */
  _buildTimeData(viewData, dataType) {
    const timeData = {};

    if (!viewData?.[dataType]?.periods) {
      return timeData;
    }

    Object.entries(viewData[dataType].periods).forEach(([period, data]) => {
      if (data.actual !== null && data.actual !== undefined) {
        timeData[`${period}-AC`] = data.actual;
      }
      if (data.forecast !== null && data.forecast !== undefined) {
        timeData[`${period}-FC`] = data.forecast;
      }
      if (data.target !== null && data.target !== undefined) {
        timeData[`${period}-BU`] = data.target;
      }
      // 添加累计值字段
      if (data.actual_cumulative !== null && data.actual_cumulative !== undefined) {
        timeData[`${period}-AC_cumulative`] = data.actual_cumulative;
      }
      if (data.forecast_cumulative !== null && data.forecast_cumulative !== undefined) {
        timeData[`${period}-FC_cumulative`] = data.forecast_cumulative;
      }
      if (data.target_cumulative !== null && data.target_cumulative !== undefined) {
        timeData[`${period}-BU_cumulative`] = data.target_cumulative;
      }
    });

    return timeData;
  }

  /**
   * 从 FormulaEngine periods 直接构建 timeData（用于计算指标的 originalTimeData）
   * 直接从 calculatedNode.periods 获取，不经过 ViewAdapter
   */
  _buildTimeDataFromPeriods(periods) {
    const timeData = {};

    if (!periods) {
      return timeData;
    }

    Object.entries(periods).forEach(([period, data]) => {
      if (data.AC !== null && data.AC !== undefined) {
        timeData[`${period}-AC`] = data.AC;
      }
      if (data.FC !== null && data.FC !== undefined) {
        timeData[`${period}-FC`] = data.FC;
      }
      if (data.BU !== null && data.BU !== undefined) {
        timeData[`${period}-BU`] = data.BU;
      }
      if (data.AC_cumulative !== null && data.AC_cumulative !== undefined) {
        timeData[`${period}-AC_cumulative`] = data.AC_cumulative;
      }
      if (data.FC_cumulative !== null && data.FC_cumulative !== undefined) {
        timeData[`${period}-FC_cumulative`] = data.FC_cumulative;
      }
      if (data.BU_cumulative !== null && data.BU_cumulative !== undefined) {
        timeData[`${period}-BU_cumulative`] = data.BU_cumulative;
      }
    });

    return timeData;
  }

  /**
   * 计算 AC+FC 汇总
   */
  _calculateSum(periods) {
    let sum = 0;
    Object.values(periods).forEach(p => {
      if (p.AC !== null && p.AC !== undefined) sum += p.AC;
      if (p.FC !== null && p.FC !== undefined) sum += p.FC;
    });
    return sum;
  }

  /**
   * 计算 BU 汇总
   */
  _calculateBudgetSum(periods) {
    let sum = 0;
    Object.values(periods).forEach(p => {
      if (p.BU !== null && p.BU !== undefined) sum += p.BU;
    });
    return sum;
  }
}
