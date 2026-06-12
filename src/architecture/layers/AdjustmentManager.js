/**
 * 第二层：调整状态管理器
 * 管理用户调整操作，支持撤销/重做/方案对比
 */

export class AdjustmentManager {
  constructor(sourceDataManager, formulaEngine) {
    // 依赖注入
    this._sourceDataManager = sourceDataManager;
    this._formulaEngine = formulaEngine;

    // 方案存储
    this._scenarios = new Map();

    // 当前方案 ID
    this._currentScenarioId = null;

    // 调整历史（用于撤销/重做）
    this._adjustmentHistory = [];
    this._undoStack = [];
    this._redoStack = [];

    // 创建默认方案
    this._createDefaultScenario();

    // 基准数据快照（在第一次调整前保存）
    this._baselineSnapshot = null;
  }

  /**
   * 创建默认方案
   */
  _createDefaultScenario() {
    const defaultScenario = {
      id: 'scenario_default',
      name: '方案 1',
      description: '默认方案',
      adjustments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: true
    };

    this._scenarios.set(defaultScenario.id, defaultScenario);
    this._currentScenarioId = defaultScenario.id;
  }

  /**
   * 应用调整
   * @param {string} nodeId - 节点 ID
   * @param {string} period - 期间
   * @param {'AC' | 'FC' | 'BU'} dataType - 数据类型
   * @param {number} toValue - 调整后的值
   * @param {string} description - 调整描述（可选）
   * @returns {Adjustment} 调整记录
   */
  applyAdjustment(nodeId, period, dataType, toValue, description = '') {
    // 关键修复：fromValue 应该是原始值，不是调整后的值
    const fromValue = this.getOriginalValue(nodeId, period, dataType);

    // 创建调整记录
    const adjustment = {
      id: `adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      nodeId,
      period,
      dataType,
      fromValue,
      toValue,
      timestamp: Date.now(),
      scenarioId: this._currentScenarioId,
      description
    };

    // 添加到当前方案
    const currentScenario = this._scenarios.get(this._currentScenarioId);
    if (!currentScenario) {
      throw new Error(`方案 ${this._currentScenarioId} 不存在`);
    }

    // 查找是否已有相同调整（同一节点同一期间同一类型）
    const existingIndex = currentScenario.adjustments.findIndex(
      a => a.nodeId === nodeId && a.period === period && a.dataType === dataType
    );

    if (existingIndex !== -1) {
      // 更新现有调整 - 关键修复：保留原有的 fromValue（真正的原始值）
      const existingAdjustment = currentScenario.adjustments[existingIndex];
      currentScenario.adjustments[existingIndex] = {
        ...existingAdjustment,
        toValue,
        timestamp: Date.now(),
        scenarioId: this._currentScenarioId,
        description
      };
    } else {
      // 添加新调整
      currentScenario.adjustments.push(adjustment);
    }

    currentScenario.updatedAt = Date.now();

    // 添加到历史
    this._adjustmentHistory.push(adjustment);
    this._undoStack.push(adjustment);
    this._redoStack = [];  // 清空重做栈

    // 触发重新计算（失效缓存）
    // 注意：不修改源数据，FormulaEngine 会通过 getAdjustedValue 获取调整后的值
    this._formulaEngine.invalidateCache([nodeId]);
    // 不在这里调用 calculateAll，由 ArchitectureAdapter.applyAdjustment 统一调用

    console.log(`[AdjustmentManager] 应用调整：${nodeId} ${period}-${dataType} ${fromValue} → ${toValue}`);

    return adjustment;
  }

  /**
   * 获取原始值（未调整的）
   * @param {string} nodeId - 节点 ID
   * @param {string} period - 期间
   * @param {'AC' | 'FC' | 'BU'} dataType - 数据类型
   * @returns {number} 原始值
   */
  getOriginalValue(nodeId, period, dataType) {
    const sourceNode = this._sourceDataManager.getSourceData(nodeId);
    return sourceNode?.periods?.[period]?.[dataType] ?? 0;
  }

  /**
   * 撤销上一次调整
   * @returns {Adjustment | null} 撤销的调整
   */
  undo() {
    if (this._undoStack.length === 0) {
      console.log('[AdjustmentManager] 没有可撤销的调整');
      return null;
    }

    const adjustment = this._undoStack.pop();
    this._redoStack.push(adjustment);

    // 恢复原值
    const currentScenario = this._scenarios.get(this._currentScenarioId);
    const existingIndex = currentScenario.adjustments.findIndex(
      a => a.id === adjustment.id
    );

    if (existingIndex !== -1) {
      // 如果原值与当前值相同，说明这是最后一次调整，可以删除
      if (adjustment.fromValue === adjustment.toValue) {
        currentScenario.adjustments.splice(existingIndex, 1);
      } else {
        // 否则恢复原值
        currentScenario.adjustments[existingIndex] = {
          ...adjustment,
          toValue: adjustment.fromValue,
          fromValue: adjustment.toValue  // 交换，以便 redo
        };
      }
    }

    currentScenario.updatedAt = Date.now();

    // 触发重新计算
    this._formulaEngine.invalidateCache([adjustment.nodeId]);

    console.log(`[AdjustmentManager] 撤销调整：${adjustment.id}`);

    return adjustment;
  }

  /**
   * 重做上一次撤销的调整
   * @returns {Adjustment | null} 重做的调整
   */
  redo() {
    if (this._redoStack.length === 0) {
      console.log('[AdjustmentManager] 没有可重做的调整');
      return null;
    }

    const adjustment = this._redoStack.pop();
    this._undoStack.push(adjustment);

    // 恢复调整
    const currentScenario = this._scenarios.get(this._currentScenarioId);
    const existingIndex = currentScenario.adjustments.findIndex(
      a => a.id === adjustment.id
    );

    if (existingIndex === -1) {
      // 添加调整
      currentScenario.adjustments.push({
        ...adjustment,
        fromValue: adjustment.toValue,  // 交换，因为 undo 时已经交换了
        toValue: adjustment.fromValue
      });
    } else {
      // 更新调整
      currentScenario.adjustments[existingIndex] = {
        ...adjustment,
        fromValue: adjustment.toValue,
        toValue: adjustment.fromValue
      };
    }

    currentScenario.updatedAt = Date.now();

    // 触发重新计算
    this._formulaEngine.invalidateCache([adjustment.nodeId]);

    console.log(`[AdjustmentManager] 重做调整：${adjustment.id}`);

    return adjustment;
  }

  /**
   * 获取调整后的值
   * @param {string} nodeId - 节点 ID
   * @param {string} period - 期间
   * @param {'AC' | 'FC' | 'BU'} dataType - 数据类型
   * @returns {number} 调整后的值
   */
  getAdjustedValue(nodeId, period, dataType) {
    // 查找当前方案中是否有调整
    const currentScenario = this._scenarios.get(this._currentScenarioId);
    const adjustment = currentScenario.adjustments.find(
      a => a.nodeId === nodeId && a.period === period && a.dataType === dataType
    );

    if (adjustment) {
      console.log(`🔥 [AdjustmentManager.getAdjustedValue] ${nodeId} ${period}-${dataType}: 有调整，返回 ${adjustment.toValue}`);
      return adjustment.toValue;
    }

    // 返回原始值
    const sourceNode = this._sourceDataManager.getSourceData(nodeId);
    const originalValue = sourceNode?.periods?.[period]?.[dataType] ?? 0;
    console.log(`🔥 [AdjustmentManager.getAdjustedValue] ${nodeId} ${period}-${dataType}: 无调整，返回原始值 ${originalValue}`);
    return originalValue;
  }

  /**
   * 检查是否有调整记录
   * @param {string} nodeId - 节点 ID
   * @param {string} period - 期间
   * @param {'AC' | 'FC' | 'BU'} dataType - 数据类型
   * @returns {boolean} 是否有调整
   */
  hasAdjustment(nodeId, period, dataType) {
    const currentScenario = this._scenarios.get(this._currentScenarioId);
    return currentScenario.adjustments.some(
      a => a.nodeId === nodeId && a.period === period && a.dataType === dataType
    );
  }

  /**
   * 获取原始值（未调整的）
   * @param {string} nodeId - 节点 ID
   * @param {string} period - 期间
   * @param {'AC' | 'FC' | 'BU'} dataType - 数据类型
   * @returns {number} 原始值
   */
  getOriginalValue(nodeId, period, dataType) {
    const sourceNode = this._sourceDataManager.getSourceData(nodeId);
    return sourceNode?.periods?.[period]?.[dataType] ?? 0;
  }

  /**
   * 获取基准快照中的节点数据（第一次调整前的计算结果）
   * @param {string} nodeId - 节点 ID
   * @returns {Object | null} 基准节点数据
   */
  getBaselineNode(nodeId) {
    if (!this._baselineSnapshot) return null;
    return this._baselineSnapshot.get(nodeId) || null;
  }

  /**
   * 获取所有基准节点数据
   * @returns {Map | null} 基准节点数据 Map
   */
  getAllBaselineNodes() {
    return this._baselineSnapshot;
  }

  /**
   * 设置基准快照（由 ArchitectureAdapter 调用）
   * @param {Object} baselineSnapshot - 基准快照对象 { nodeId: { value, targetValue, initialBaseline, baseline, originalTimeData } }
   */
  setBaselineSnapshot(baselineSnapshot) {
    this._baselineSnapshot = new Map();
    Object.entries(baselineSnapshot).forEach(([nodeId, data]) => {
      this._baselineSnapshot.set(nodeId, data);
    });
    console.log('[AdjustmentManager] 基准快照已设置，节点数:', this._baselineSnapshot.size);
  }

  /**
   * 清除基准快照（用于重新导入数据等场景）
   */
  clearBaselineSnapshot() {
    this._baselineSnapshot = null;
  }

  /**
   * 创建新方案
   * @param {string} name - 方案名称
   * @param {string} description - 方案描述
   * @returns {Scenario} 新方案
   */
  createScenario(name, description = '') {
    const id = `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const scenario = {
      id,
      name,
      description,
      adjustments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: false
    };

    this._scenarios.set(id, scenario);

    console.log(`[AdjustmentManager] 创建新方案：${name} (${id})`);

    return scenario;
  }

  /**
   * 切换方案
   * @param {string} scenarioId - 方案 ID
   */
  switchScenario(scenarioId) {
    if (!this._scenarios.has(scenarioId)) {
      throw new Error(`方案 ${scenarioId} 不存在`);
    }

    this._currentScenarioId = scenarioId;
    this._undoStack = [];
    this._redoStack = [];

    console.log(`[AdjustmentManager] 切换到方案：${scenarioId}`);

    // 触发重新计算（因为调整数据变了）
    this._formulaEngine.clearCache();
  }

  /**
   * 获取当前方案
   * @returns {Scenario}
   */
  getCurrentScenario() {
    return this._scenarios.get(this._currentScenarioId);
  }

  /**
   * 获取所有方案
   * @returns {Scenario[]}
   */
  getAllScenarios() {
    return Array.from(this._scenarios.values());
  }

  /**
   * 删除方案
   * @param {string} scenarioId - 方案 ID
   */
  deleteScenario(scenarioId) {
    const scenario = this._scenarios.get(scenarioId);
    if (!scenario) return;

    if (scenario.isDefault) {
      throw new Error('不能删除默认方案');
    }

    this._scenarios.delete(scenarioId);

    // 如果删除的是当前方案，切换到默认方案
    if (this._currentScenarioId === scenarioId) {
      this._currentScenarioId = 'scenario_default';
    }

    console.log(`[AdjustmentManager] 删除方案：${scenarioId}`);
  }

  /**
   * 更新方案信息
   * @param {string} scenarioId - 方案 ID
   * @param {Object} updates - 更新内容
   */
  updateScenario(scenarioId, updates) {
    const scenario = this._scenarios.get(scenarioId);
    if (!scenario) return;

    if (updates.name) scenario.name = updates.name;
    if (updates.description) scenario.description = updates.description;
    scenario.updatedAt = Date.now();
  }

  /**
   * 获取所有调整
   * @param {string} scenarioId - 方案 ID（可选，默认当前方案）
   * @returns {Adjustment[]}
   */
  getAdjustments(scenarioId) {
    const targetScenarioId = scenarioId || this._currentScenarioId;
    const scenario = this._scenarios.get(targetScenarioId);
    return scenario ? scenario.adjustments : [];
  }

  /**
   * 清除当前方案的所有调整
   */
  clearAdjustments() {
    const currentScenario = this._scenarios.get(this._currentScenarioId);
    if (currentScenario) {
      console.log('🔥 [AdjustmentManager.clearAdjustments] 清除前调整数:', currentScenario.adjustments.length);
      currentScenario.adjustments = [];
      currentScenario.updatedAt = Date.now();
      console.log('🔥 [AdjustmentManager.clearAdjustments] 调整已清除');
    } else {
      console.log('🔥 [AdjustmentManager.clearAdjustments] 当前方案不存在');
    }

    this._undoStack = [];
    this._redoStack = [];

    // 触发重新计算
    this._formulaEngine.clearCache();

    console.log('[AdjustmentManager] 清除所有调整完成');
  }

  /**
   * 获取调整历史
   * @returns {Adjustment[]}
   */
  getAdjustmentHistory() {
    return [...this._adjustmentHistory];
  }

  /**
   * 是否有可撤销的调整
   * @returns {boolean}
   */
  canUndo() {
    return this._undoStack.length > 0;
  }

  /**
   * 是否有可重做的调整
   * @returns {boolean}
   */
  canRedo() {
    return this._redoStack.length > 0;
  }

  /**
   * 导出方案为 JSON
   * @param {string} scenarioId - 方案 ID（可选）
   * @returns {Object}
   */
  exportScenario(scenarioId) {
    const targetScenarioId = scenarioId || this._currentScenarioId;
    const scenario = this._scenarios.get(targetScenarioId);
    if (!scenario) return null;

    return JSON.parse(JSON.stringify(scenario));
  }

  /**
   * 从 JSON 导入方案
   * @param {Object} json - JSON 数据
   * @returns {Scenario}
   */
  importScenario(json) {
    const scenario = {
      id: json.id || `scenario_${Date.now()}`,
      name: json.name,
      description: json.description,
      adjustments: json.adjustments || [],
      createdAt: json.createdAt || Date.now(),
      updatedAt: json.updatedAt || Date.now(),
      isDefault: false
    };

    this._scenarios.set(scenario.id, scenario);
    return scenario;
  }
}
