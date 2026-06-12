/**
 * VDT Store - 新架构版本 (最终版)
 * 使用四层架构：SourceData → FormulaEngine → AdjustmentManager → ViewAdapter
 */

// 🔥🔥🔥 文件加载确认日志 - 如果看到这条日志，说明文件已被正确加载
console.log('🔥🔥 [useVDTStore.js] 文件已加载！版本：20260417-1800');

import { create } from 'zustand';
import { ArchitectureAdapter } from '../architecture/ArchitectureAdapter';
import { encryptApiKey, decryptApiKey } from '../services/aiService';

// ========== 辅助函数 ==========

// 解析层级字符串，返回 { column: number, order: number }
function parseLevel(levelStr) {
  if (!levelStr && levelStr !== 0) return { column: 1, order: 0 };
  const parts = String(levelStr).split('.');
  return {
    column: parseInt(parts[0]) || 1,
    order: parseInt(parts[1]) || 0
  };
}

// 比较两个层级字符串
function compareLevels(a, b) {
  const pa = parseLevel(a);
  const pb = parseLevel(b);
  if (pa.column !== pb.column) return pa.column - pb.column;
  return pa.order - pb.order;
}

// 检查方案名称是否重复（忽略空格差异）
function isNameDuplicate(scenarios, name, excludeId = null) {
  const normalize = s => s.replace(/\s+/g, '');
  return Object.entries(scenarios).some(([id, s]) => id !== excludeId && normalize(s.name) === normalize(name));
}

// localStorage key
const STORAGE_KEY = 'vdt-store-data-v2';
const AI_CONFIG_KEY = 'vdt-ai-config';
const SYSTEMS_KEY = 'vdt-systems';

const useVDTStore = create((set, get) => {
  // 初始化架构适配器
  const adapter = new ArchitectureAdapter();

  // 设置变更回调 - 当数据变化时同步到 Zustand 状态
  adapter.setOnChange((event) => {
    const newNodes = adapter.getAllNodes();
    const currentScenario = adapter.getCurrentScenario();

    console.log('[useVDTStore.onChange] 数据变化事件:', event);
    console.log('[useVDTStore.onChange] 新节点数:', Object.keys(newNodes).length);

    // 使用函数式更新，确保获取最新的 state
    set((state) => {
      console.log('[useVDTStore.onChange] 合并节点位置，当前节点数:', Object.keys(state.nodes).length);

      // 保留原有节点的位置、size、range 等 UI 属性
      const mergedNodes = {};
      Object.entries(newNodes).forEach(([nodeId, newNode]) => {
        const existingNode = state.nodes[nodeId];
        mergedNodes[nodeId] = {
          ...newNode,
          position: existingNode?.position || { x: 0, y: 0 },
          size: existingNode?.size || { width: 520, height: 'auto' },
          // 强制保留用户配置的 range
          range: existingNode?.range?.max
            ? { min: existingNode.range.min ?? 0, max: existingNode.range.max }
            : (newNode.range || { min: 0, max: 100 }),
          // 保留用户设置的 aggregationType（架构层 _convertViewDataToOldFormat 不包含此字段）
          aggregationType: existingNode?.aggregationType !== undefined ? existingNode.aggregationType : newNode.aggregationType,
          // 关键修复：保留计算指标的 originalTimeData（趋势图需要它来显示初始值）
          // 驱动因子的 originalTimeData 由架构层管理，不需要保留
          ...(existingNode?.type === 'computed' && existingNode?.originalTimeData
            ? { originalTimeData: existingNode.originalTimeData }
            : {})
        };
        if (nodeId === 'fangwenliuliang') {
          console.log('[useVDTStore.onChange] 访问流量 range:', {
            existing: existingNode?.range,
            merged: mergedNodes[nodeId].range
          });
        }
      });

      console.log('[useVDTStore.onChange] 合并完成，访问流量 range:', mergedNodes['fangwenliuliang']?.range);

      return {
        nodes: mergedNodes
      };
    });
  });

  // 加载 AI 配置
  const loadAIConfig = () => {
    try {
      const stored = localStorage.getItem(AI_CONFIG_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        return {
          url: config.url || '',
          apiKey: config.apiKey ? decryptApiKey(config.apiKey) : '',
          model: config.model || '',
          provider: config.provider || 'custom',
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens ?? 2000,
          systemPrompt: config.systemPrompt || ''
        };
      }
    } catch (e) {
      console.warn('加载 AI 配置失败:', e);
    }
    return {
      url: '',
      apiKey: '',
      model: '',
      provider: 'custom',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: ''
    };
  };

  const initialAIConfig = loadAIConfig();

  // 从 localStorage 加载数据
  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.csvText && data.formulaText) {
          adapter.loadFromCSV(data.csvText, data.formulaText);
          return adapter.getAllNodes();
        }
      }
    } catch (e) {
      console.warn('加载存储数据失败:', e);
    }
    return {};
  };

  const initialNodes = loadFromStorage();

  return {
    // 状态
    nodes: initialNodes,
    selectedNodeId: null,
    highlightedNodeId: null,
    scale: 0.6,
    showDataPanel: true,
    pbiConfig: null, // { port, mapping, dax, autoRefreshInterval }
    collapsedNodeIds: new Set(),
    scenarios: {
      default: { id: 'default', name: '方案1', nodes: JSON.parse(JSON.stringify(initialNodes)), createdAt: Date.now(), updatedAt: Date.now() }
    },
    currentScenarioId: 'default',
    aiConfig: initialAIConfig,

    // 指标体系管理
    systems: {}, // { system_id: { id, name, createdAt, updatedAt, nodes, scenarios, currentScenarioId } }
    currentSystemId: null,

    // 架构适配器
    architectureAdapter: adapter,

    // 初始化
    _initArchitecture: () => {
      console.log('[useVDTStore] 架构已初始化');
    },

    // 使用新架构加载 CSV（供 App.jsx 调用）
    loadFromCSVNew: (csvText, formulaText) => {
      console.log('[loadFromCSVNew] 开始加载...', { csvLength: csvText?.length, formulaLength: formulaText?.length });

      const result = adapter.loadFromCSV(csvText, formulaText);
      const nodes = adapter.getAllNodes();

      console.log('[loadFromCSVNew] 加载完成，节点数:', Object.keys(nodes).length);
      console.log('[loadFromCSVNew] 节点列表:', Object.keys(nodes));

      // 保存到 localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          csvText,
          formulaText,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('保存数据失败:', e);
      }

      set({ nodes });
      return result;
    },

    // 从 Power BI 加载数据
    loadFromPowerBINew: (nodesMap) => {
      console.log('[loadFromPowerBINew] 开始加载...', { nodeCount: nodesMap.size });

      const result = adapter.loadFromPowerBI(nodesMap);
      const nodes = adapter.getAllNodes();

      console.log('[loadFromPowerBINew] 加载完成，节点数:', Object.keys(nodes).length);

      set({ nodes });
      return result;
    },

    // 保存 PBI 连接配置
    setPbiConfig: (config) => {
      set({ pbiConfig: config });
    },

    // 从 Power BI 刷新数据（仅更新数据值，保留公式和调整）
    refreshFromPowerBI: (nodesMap) => {
      console.log('[refreshFromPowerBI] 刷新数据...', { nodeCount: nodesMap.size });

      // 更新 SourceDataManager 中的 periods 数据，保留公式等其他信息
      const sourceDataManager = adapter.sourceDataManager;
      let updatedCount = 0;

      nodesMap.forEach((newNode, nodeId) => {
        const existingNode = sourceDataManager.getSourceData(nodeId);
        if (existingNode) {
          // 只更新 periods 数据
          existingNode.periods = newNode.periods;
          existingNode.updatedAt = Date.now();
          updatedCount++;
        }
      });

      // 版本号递增触发缓存失效
      sourceDataManager._version++;

      // 重新计算所有节点
      const sourceNodes = sourceDataManager.getAllNodes();
      adapter.formulaEngine.clearCache();
      adapter.formulaEngine.calculateAll(sourceNodes);

      // 重新保存基准快照
      adapter.saveBaselineSnapshot();

      const nodes = adapter.getAllNodes();
      console.log('[refreshFromPowerBI] 刷新完成，更新了', updatedCount, '个节点');

      // 保留原有节点的位置、size、range 等 UI 属性
      set((state) => {
        const mergedNodes = {};
        Object.entries(nodes).forEach(([nodeId, newNode]) => {
          const existingNode = state.nodes[nodeId];
          const hasUserRange = existingNode?.range && existingNode.range.max !== undefined && existingNode.range.max !== 100;
          const finalRange = hasUserRange
            ? { min: existingNode.range.min ?? 0, max: existingNode.range.max }
            : (newNode.range || { min: 0, max: 100 });

          const existingAggType = existingNode?.aggregationType !== undefined ? existingNode.aggregationType : newNode.aggregationType;
          mergedNodes[nodeId] = {
            ...newNode,
            position: existingNode?.position || { x: 0, y: 0 },
            size: existingNode?.size || { width: 520, height: 'auto' },
            range: finalRange,
            aggregationType: existingAggType,
            ...(existingNode?.type === 'computed' && existingNode?.originalTimeData
              ? { originalTimeData: existingNode.originalTimeData }
              : {})
          };
        });

        return { nodes: mergedNodes };
      });

      return { updatedCount, nodeCount: Object.keys(nodes).length };
    },

    // 应用调整
    applyAdjustmentNew: (nodeId, period, dataType, value) => {
      const adjustment = adapter.applyAdjustment(nodeId, period, dataType, value);
      const newNodes = adapter.getAllNodes();

      set((state) => {
        const mergedNodes = {};
        Object.entries(newNodes).forEach(([nodeId, newNode]) => {
          const existingNode = state.nodes[nodeId];
          const hasUserRange = existingNode?.range && existingNode.range.max !== undefined && existingNode.range.max !== 100;
          const finalRange = hasUserRange
            ? { min: existingNode.range.min ?? 0, max: existingNode.range.max }
            : (newNode.range || { min: 0, max: 100 });

          const existingAggType = existingNode?.aggregationType !== undefined ? existingNode.aggregationType : newNode.aggregationType;
          mergedNodes[nodeId] = {
            ...newNode,
            position: existingNode?.position || { x: 0, y: 0 },
            size: existingNode?.size || { width: 520, height: 'auto' },
            range: finalRange,
            // 保留用户设置的 aggregationType（架构层 _convertViewDataToOldFormat 不包含此字段）
            aggregationType: existingAggType,
            // 关键修复：保留计算指标的 originalTimeData（趋势图需要它来显示初始值）
            // 驱动因子的 originalTimeData 由架构层正确管理，不需要保留
            ...(existingNode?.type === 'computed' && existingNode?.originalTimeData
              ? { originalTimeData: existingNode.originalTimeData }
              : {})
          };
        });

        return { nodes: mergedNodes };
      });

      return adjustment;
    },

    // 批量应用调整（一次性重算，避免逐期重算导致卡顿）
    applyBatchAdjustmentsNew: (adjustments) => {
      adapter.applyBatchAdjustments(adjustments);
      const newNodes = adapter.getAllNodes();

      set((state) => {
        const mergedNodes = {};
        Object.entries(newNodes).forEach(([nodeId, newNode]) => {
          const existingNode = state.nodes[nodeId];
          const hasUserRange = existingNode?.range && existingNode.range.max !== undefined && existingNode.range.max !== 100;
          const finalRange = hasUserRange
            ? { min: existingNode.range.min ?? 0, max: existingNode.range.max }
            : (newNode.range || { min: 0, max: 100 });

          const existingAggType = existingNode?.aggregationType !== undefined ? existingNode.aggregationType : newNode.aggregationType;
          mergedNodes[nodeId] = {
            ...newNode,
            position: existingNode?.position || { x: 0, y: 0 },
            size: existingNode?.size || { width: 520, height: 'auto' },
            range: finalRange,
            aggregationType: existingAggType,
            ...(existingNode?.type === 'computed' && existingNode?.originalTimeData
              ? { originalTimeData: existingNode.originalTimeData }
              : {})
          };
        });

        return { nodes: mergedNodes };
      });
    },

    // 撤销
    undoNew: () => {
      const adjustment = adapter.undo();
      const newNodes = adapter.getAllNodes();

      // 关键修复：保留原有节点的 range 等 UI 属性
      set((state) => {
        const mergedNodes = {};
        Object.entries(newNodes).forEach(([nodeId, newNode]) => {
          const existingNode = state.nodes[nodeId];

          // 强制使用用户配置的 range（如果存在）
          const finalRange = existingNode?.range?.max
            ? { min: existingNode.range.min ?? 0, max: existingNode.range.max }
            : (newNode.range || { min: 0, max: 100 });

          mergedNodes[nodeId] = {
            ...newNode,
            position: existingNode?.position || { x: 0, y: 0 },
            size: existingNode?.size || { width: 520, height: 'auto' },
            range: finalRange,
            // 保留用户设置的 aggregationType
            aggregationType: existingNode?.aggregationType !== undefined ? existingNode.aggregationType : newNode.aggregationType
          };
        });

        return { nodes: mergedNodes };
      });

      return adjustment;
    },

    // 重做
    redoNew: () => {
      const adjustment = adapter.redo();
      const newNodes = adapter.getAllNodes();

      // 关键修复：保留原有节点的 range 等 UI 属性
      set((state) => {
        const mergedNodes = {};
        Object.entries(newNodes).forEach(([nodeId, newNode]) => {
          const existingNode = state.nodes[nodeId];

          // 强制使用用户配置的 range（如果存在）
          const finalRange = existingNode?.range?.max
            ? { min: existingNode.range.min ?? 0, max: existingNode.range.max }
            : (newNode.range || { min: 0, max: 100 });

          mergedNodes[nodeId] = {
            ...newNode,
            position: existingNode?.position || { x: 0, y: 0 },
            size: existingNode?.size || { width: 520, height: 'auto' },
            range: finalRange,
            // 保留用户设置的 aggregationType
            aggregationType: existingNode?.aggregationType !== undefined ? existingNode.aggregationType : newNode.aggregationType
          };
        });

        return { nodes: mergedNodes };
      });

      return adjustment;
    },

    // 是否可以撤销
    canUndo: () => {
      return adapter.adjustmentManager?.canUndo() ?? false;
    },

    // 是否可以重做
    canRedo: () => {
      return adapter.adjustmentManager?.canRedo() ?? false;
    },

    // 获取所有方案
    getScenariosNew: () => {
      return adapter.getAllScenarios();
    },

    // 获取调整列表（用于 WaterfallChart 判断驱动因子是否被调整）
    getAdjustmentsNew: () => {
      const adjustments = adapter.adjustmentManager?.getAdjustments() || [];
      console.log('[useVDTStore.getAdjustmentsNew] 返回调整:', adjustments.length, adjustments);
      return adjustments;
    },

    // 切换方案
    switchScenarioNew: (scenarioId) => {
      adapter.switchScenario(scenarioId);
      const nodes = adapter.getAllNodes();
      // 切换方案后重新保存基准快照（对应新方案的初始状态）
      adapter.saveBaselineSnapshot();
      set({ nodes, currentScenarioId: scenarioId });
    },

    // 创建方案
    createScenarioNew: (name, description) => {
      const scenario = adapter.createScenario(name, description);
      set({ scenarios: { [scenario.id]: scenario } });
      return scenario;
    },

    // 获取趋势图数据
    getTrendChartDataNew: (nodeId) => {
      return adapter.getTrendChartData(nodeId);
    },

    // 获取表格数据
    getTableDataNew: (nodeId) => {
      return adapter.getTableData(nodeId);
    },

    // 获取月份明细表数据
    getMonthDetailTableDataNew: () => {
      return adapter.getMonthDetailTableData();
    },

    // 设置 AI 配置
    setAIConfig: (config) => {
      const newConfig = { ...get().aiConfig, ...config };
      set({ aiConfig: newConfig });
      try {
        localStorage.setItem(AI_CONFIG_KEY, JSON.stringify({
          url: newConfig.url,
          apiKey: newConfig.apiKey ? encryptApiKey(newConfig.apiKey) : '',
          model: newConfig.model,
          provider: newConfig.provider,
          temperature: newConfig.temperature,
          maxTokens: newConfig.maxTokens,
          systemPrompt: newConfig.systemPrompt
        }));
      } catch (e) {
        console.warn('保存 AI 配置失败:', e);
      }
    },

    // ===== 兼容性方法（保持与旧代码兼容）=====

    importModel: (modelData, options = {}) => {
      const { append = false } = options;
      const nodes = modelData.nodes || {};

      // v2.1 格式：包含 scenarios 和 currentScenarioId
      const scenarios = modelData.scenarios;
      const currentScenarioId = modelData.currentScenarioId;

      if (append) {
        // 追加模式：合并到现有节点
        const currentNodes = get().nodes;
        const mergedNodes = { ...currentNodes, ...nodes };
        set({ nodes: mergedNodes });
      } else {
        // 覆盖模式：清空并重新设置
        // v2.1 格式恢复 scenarios 和 currentScenarioId
        if (scenarios && modelData.version === '2.1') {
          set({ nodes, scenarios, currentScenarioId: currentScenarioId || 'default' });
        } else {
          // v2.0 格式：仅恢复 nodes，scenarios 保持默认
          set({ nodes });
        }

        // 等待状态更新后，触发架构适配器的重新计算
        setTimeout(() => {
          const state = get();
          if (state.architectureAdapter) {
            // 从当前 nodes 重建 SourceData
            const sourceNodes = new Map();
            const allPeriodKeys = new Set(); // 收集所有 period key 用于检测时间维度

            Object.values(nodes).forEach(node => {
              // 转换为新架构的 SourceDataNode 格式
              const periods = {};

              // 辅助函数：从 timeData key 中提取 period 和 type
              const extractPeriods = (dataObj) => {
                if (!dataObj) return;
                Object.entries(dataObj).forEach(([key, value]) => {
                  // 跳过累计值（cumulative）键，这些是派生数据
                  if (key.includes('_cumulative')) return;
                  // 解析 key 格式：如 "202601-AC"、"20260101-FC"、"2026WK01-BU"、"1月实际"
                  const match = key.match(/^(.+)-(AC|FC|BU)$|^(.+)(实际|预测|目标)$/);
                  if (match) {
                    const period = match[1] || match[3];
                    const type = match[2] ||
                      (match[4] === '实际' ? 'AC' : match[4] === '预测' ? 'FC' : 'BU');
                    if (!periods[period]) {
                      periods[period] = { AC: null, FC: null, BU: null };
                    }
                    // 赋值（不覆盖已有值）
                    if (periods[period][type] === null || periods[period][type] === undefined) {
                      periods[period][type] = value;
                    }
                    allPeriodKeys.add(period);
                  }
                });
              };

              // 优先从 originalTimeData 提取（包含 BU 数据和调整前原始值）
              extractPeriods(node.originalTimeData);
              // 再从 timeData 补充（可能有调整后的 AC/FC 值）
              extractPeriods(node.timeData);

              sourceNodes.set(node.id, {
                id: node.id,
                name: node.name,
                type: node.type || 'driver',
                formula: node.formula || null,
                periods,
                unit: node.unit || '',
                format: node.format || '#,##0',
                direction: node.direction || 'auto',
                level: node.level || '1',
                aggregationType: node.aggregationType || null,
                range: node.range || null
              });
            });

            // 自动检测时间维度
            let detectedTimeDimension = { type: 'month', periodCount: allPeriodKeys.size, isRolling: false };
            if (allPeriodKeys.size > 0) {
              const sampleKey = Array.from(allPeriodKeys)[0];
              if (/^\d{8}$/.test(sampleKey)) {
                detectedTimeDimension.type = 'day';
              } else if (/^\d{4}WK\d{2}$/.test(sampleKey)) {
                detectedTimeDimension.type = 'week';
              } else if (/^\d{4}Q[1-4]$/.test(sampleKey)) {
                detectedTimeDimension.type = 'quarter';
              } else if (/^\d{4}$/.test(sampleKey)) {
                detectedTimeDimension.type = 'year';
              } else if (/^\d{6}$/.test(sampleKey)) {
                detectedTimeDimension.type = 'month';
              }
            }

            // 将 sourceNodes 写入 SourceDataManager（使趋势图等组件能获取到数据）
            state.architectureAdapter.sourceDataManager._sourceData = sourceNodes;
            state.architectureAdapter.sourceDataManager._timeDimension = detectedTimeDimension;
            state.architectureAdapter.sourceDataManager._version++;

            // 清除调整状态
            state.architectureAdapter.adjustmentManager.clearAdjustments();

            // 使用 FormulaEngine 重新计算
            state.architectureAdapter.formulaEngine.calculateAll(sourceNodes);
            const calculatedNodes = state.architectureAdapter.getAllNodes();

            // 保存基准快照（在第一次调整前）
            state.architectureAdapter.saveBaselineSnapshot();

            // 合并原始节点的 position、size 等 UI 属性到计算结果中
            Object.keys(calculatedNodes).forEach(nodeId => {
              const originalNode = nodes[nodeId];
              if (originalNode?.position) {
                calculatedNodes[nodeId].position = originalNode.position;
              }
              if (originalNode?.size) {
                calculatedNodes[nodeId].size = originalNode.size;
              }
            });

            // 同步回状态
            set({ nodes: calculatedNodes });
            console.log('[importModel] 新架构重新计算完成，共', Object.keys(calculatedNodes).length, '个节点，时间维度:', detectedTimeDimension.type);
          }
        }, 100);
      }
    },

    exportModel: () => {
      const state = get();
      return {
        modelName: 'VDT Model',
        version: '2.1',
        createdAt: new Date().toISOString(),
        nodes: state.nodes,
        scenarios: state.scenarios,
        currentScenarioId: state.currentScenarioId
      };
    },

    // ========== 指标体系管理 ==========

    /** 从 localStorage 加载体系列表 */
    loadSystems: () => {
      try {
        const stored = localStorage.getItem(SYSTEMS_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          return data;
        }
      } catch (e) {
        console.warn('加载指标体系失败:', e);
      }
      return { systems: {}, currentSystemId: null };
    },

    /** 保存当前状态为新体系 */
    saveSystem: (name) => {
      const state = get();
      const systemId = 'sys_' + Date.now();
      const newSystem = {
        id: systemId,
        name: name || '未命名体系',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nodes: state.nodes,
        scenarios: state.scenarios,
        currentScenarioId: state.currentScenarioId
      };
      const newSystems = { ...state.systems, [systemId]: newSystem };
      localStorage.setItem(SYSTEMS_KEY, JSON.stringify({
        systems: newSystems,
        currentSystemId: systemId
      }));
      set({ systems: newSystems, currentSystemId: systemId });
      return { success: true, system: newSystem };
    },

    /** 切换到指定体系 */
    switchSystem: (systemId) => {
      const { systems } = get();
      const system = systems[systemId];
      if (!system) return { success: false, error: '体系不存在' };

      // 加载体系数据到当前状态
      set({
        nodes: system.nodes || {},
        scenarios: system.scenarios || { default: { id: 'default', name: '方案1', nodes: system.nodes || {}, createdAt: Date.now(), updatedAt: Date.now() } },
        currentScenarioId: system.currentScenarioId || 'default',
        currentSystemId: systemId
      });

      // 触发架构适配器重新计算（与 importModel 相同的逻辑）
      setTimeout(() => {
        const state = get();
        if (state.architectureAdapter && state.nodes) {
          const sourceNodes = new Map();
          const allPeriodKeys = new Set();

          Object.values(state.nodes).forEach(node => {
            const periods = {};
            const extractPeriods = (dataObj) => {
              if (!dataObj) return;
              Object.entries(dataObj).forEach(([key, value]) => {
                if (key.includes('_cumulative')) return;
                const match = key.match(/^(.+)-(AC|FC|BU)$|^(.+)(实际|预测|目标)$/);
                if (match) {
                  const period = match[1] || match[3];
                  const type = match[2] || (match[4] === '实际' ? 'AC' : match[4] === '预测' ? 'FC' : 'BU');
                  if (!periods[period]) periods[period] = { AC: null, FC: null, BU: null };
                  if (periods[period][type] === null || periods[period][type] === undefined) {
                    periods[period][type] = value;
                  }
                  allPeriodKeys.add(period);
                }
              });
            };
            extractPeriods(node.originalTimeData);
            extractPeriods(node.timeData);

            sourceNodes.set(node.id, {
              id: node.id, name: node.name, type: node.type || 'driver',
              formula: node.formula || null, periods,
              unit: node.unit || '', format: node.format || '#,##0',
              direction: node.direction || 'auto', level: node.level || '1',
              aggregationType: node.aggregationType || null, range: node.range || null
            });
          });

          let detectedTimeDimension = { type: 'month', periodCount: allPeriodKeys.size, isRolling: false };
          if (allPeriodKeys.size > 0) {
            const sampleKey = Array.from(allPeriodKeys)[0];
            if (/^\d{8}$/.test(sampleKey)) detectedTimeDimension.type = 'day';
            else if (/^\d{4}WK\d{2}$/.test(sampleKey)) detectedTimeDimension.type = 'week';
            else if (/^\d{4}Q[1-4]$/.test(sampleKey)) detectedTimeDimension.type = 'quarter';
            else if (/^\d{4}$/.test(sampleKey)) detectedTimeDimension.type = 'year';
            else if (/^\d{6}$/.test(sampleKey)) detectedTimeDimension.type = 'month';
          }

          state.architectureAdapter.sourceDataManager._sourceData = sourceNodes;
          state.architectureAdapter.sourceDataManager._timeDimension = detectedTimeDimension;
          state.architectureAdapter.sourceDataManager._version++;
          state.architectureAdapter.adjustmentManager.clearAdjustments();
          state.architectureAdapter.formulaEngine.calculateAll(sourceNodes);
          const calculatedNodes = state.architectureAdapter.getAllNodes();
          state.architectureAdapter.saveBaselineSnapshot();

          Object.keys(calculatedNodes).forEach(nodeId => {
            const originalNode = state.nodes[nodeId];
            if (originalNode?.position) calculatedNodes[nodeId].position = originalNode.position;
            if (originalNode?.size) calculatedNodes[nodeId].size = originalNode.size;
          });

          set({ nodes: calculatedNodes });
        }
      }, 100);

      return { success: true };
    },

    /** 删除体系（允许删除当前体系，删除后自动切换到其他体系） */
    deleteSystem: (systemId) => {
      const { systems, currentSystemId } = get();
      const { [systemId]: _, ...rest } = systems;

      // 如果删除的是当前体系，自动切换到其他体系
      let newCurrentId = currentSystemId;
      if (systemId === currentSystemId) {
        const remainingIds = Object.keys(rest);
        newCurrentId = remainingIds.length > 0 ? remainingIds[0] : null;
        // 如果有新体系可切换，加载它
        if (newCurrentId) {
          get().switchSystem(newCurrentId);
        }
      }

      localStorage.setItem(SYSTEMS_KEY, JSON.stringify({ systems: rest, currentSystemId: newCurrentId }));
      set({ systems: rest, currentSystemId: newCurrentId });
      return { success: true };
    },

    /** 重命名体系 */
    renameSystem: (systemId, newName) => {
      const { systems } = get();
      const system = systems[systemId];
      if (!system) return { success: false, error: '体系不存在' };
      const updated = { ...system, name: newName, updatedAt: Date.now() };
      const newSystems = { ...systems, [systemId]: updated };
      localStorage.setItem(SYSTEMS_KEY, JSON.stringify({ systems: newSystems, currentSystemId: get().currentSystemId }));
      set({ systems: newSystems });
      return { success: true };
    },

    /** 从 JSON 数据导入为新体系 */
    importSystem: (jsonData, name) => {
      const state = get();
      const systemId = 'sys_' + Date.now();
      const newSystem = {
        id: systemId,
        name: name || jsonData.modelName || '导入的体系',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nodes: jsonData.nodes || {},
        scenarios: jsonData.scenarios || { default: { id: 'default', name: '方案1', nodes: jsonData.nodes || {}, createdAt: Date.now(), updatedAt: Date.now() } },
        currentScenarioId: jsonData.currentScenarioId || 'default'
      };
      const newSystems = { ...state.systems, [systemId]: newSystem };
      localStorage.setItem(SYSTEMS_KEY, JSON.stringify({
        systems: newSystems,
        currentSystemId: systemId
      }));
      set({ systems: newSystems, currentSystemId: systemId });

      // 同时加载到当前状态
      get().importModel(jsonData);

      return { success: true, system: newSystem };
    },

    /** 导出指定体系为 JSON 文件 */
    exportSystem: (systemId) => {
      const { systems } = get();
      const system = systems[systemId];
      if (!system) return { success: false, error: '体系不存在' };
      return {
        modelName: 'VDT Model',
        version: '2.1',
        createdAt: new Date().toISOString(),
        nodes: system.nodes,
        scenarios: system.scenarios,
        currentScenarioId: system.currentScenarioId
      };
    },

    // ========== 体系管理结束 ==========

    setScale: (scale) => {
      set({ scale: Math.max(0.5, Math.min(2, scale)) });
    },

    toggleDataPanel: () => {
      set((state) => ({ showDataPanel: !state.showDataPanel }));
    },

    setSelectedNode: (nodeId) => {
      set({ selectedNodeId: nodeId });
    },

    toggleCollapse: (nodeId) => {
      set((state) => {
        const newSet = new Set(state.collapsedNodeIds);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        return { collapsedNodeIds: newSet };
      });
    },

    setHighlightedNode: (nodeId) => {
      set({ highlightedNodeId: nodeId });
    },

    addNode: (node) => {
      set((state) => ({
        nodes: { ...state.nodes, [node.id]: node }
      }));
    },

    updateNode: (nodeId, updates) => {
      set((state) => ({
        nodes: {
          ...state.nodes,
          [nodeId]: { ...state.nodes[nodeId], ...updates }
        }
      }));
    },

    deleteNode: (nodeId) => {
      set((state) => {
        const { [nodeId]: _, ...rest } = state.nodes;
        return { nodes: rest };
      });
    },

    // 获取受影响的节点（上游依赖）
    getAffectedNodes: (nodeId) => {
      if (!nodeId) return new Set();
      const state = get();
      const node = state.nodes[nodeId];
      if (!node || !node.dependsOn) return new Set();

      const affected = new Set();
      const collect = (id) => {
        const n = state.nodes[id];
        if (!n) return;
        if (n.dependsOn) {
          n.dependsOn.forEach(depId => {
            if (!affected.has(depId)) {
              affected.add(depId);
              collect(depId);
            }
          });
        }
      };
      collect(nodeId);
      return affected;
    },

    // 获取下游节点
    getDownstreamNodes: (nodeId) => {
      if (!nodeId) return new Set();
      const state = get();
      const downstream = new Set();

      Object.values(state.nodes).forEach(n => {
        if (n.dependsOn && n.dependsOn.includes(nodeId)) {
          downstream.add(n.id);
        }
      });

      return downstream;
    },

    // 获取依赖节点
    getDependencyNodes: (nodeId) => {
      if (!nodeId) return new Set();
      const state = get();
      const node = state.nodes[nodeId];
      if (!node) return new Set();
      return new Set(node.dependsOn || []);
    },

    // 清除存储
    clearStorage: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({ nodes: {} });
      adapter.sourceDataManager.clear();
      adapter.formulaEngine.clearCache();
    },

    resetAllDrivers: () => {
      console.log('🔥 [useVDTStore] resetAllDrivers - 清除所有调整并重新计算');

      // 1. 清除调整记录
      adapter.adjustmentManager.clearAdjustments();
      console.log('🔥 [useVDTStore] 调整已清除，剩余调整数:', adapter.adjustmentManager.getAdjustments().length);

      // 2. 清除缓存
      adapter.formulaEngine.clearCache();
      console.log('🔥 [useVDTStore] 缓存已清除');

      // 3. 重新计算（使用原始数据）
      const sourceNodes = adapter.sourceDataManager.getAllNodes();
      console.log('🔥 [useVDTStore] 开始重新计算，源数据节点数:', sourceNodes instanceof Map ? sourceNodes.size : Object.keys(sourceNodes).length);

      adapter.formulaEngine.calculateAll(sourceNodes);

      // 4. 重新获取节点
      const newNodes = adapter.getAllNodes();
      console.log('🔥 [useVDTStore] 重新计算完成:', {
        nodeCount: Object.keys(newNodes).length,
        sampleNode: newNodes['zhuanhualv_xiansuo']?.value,
        sampleNodePeriods: newNodes['zhuanhualv_xiansuo']?.periods?.['2026WK13']
      });

      // 5. 保留旧节点的 position 和 size
      const oldNodes = get().nodes;
      Object.keys(newNodes).forEach(id => {
        if (oldNodes[id]) {
          if (oldNodes[id].position) newNodes[id].position = oldNodes[id].position;
          if (oldNodes[id].size) newNodes[id].size = oldNodes[id].size;
        }
      });

      // 6. 重新保存基准快照（重置后恢复初始状态）
      adapter.saveBaselineSnapshot();

      set({ nodes: newNodes, currentScenarioId: 'default' });
    },

    saveScenario: (name, description = '', overwrite = false) => {
      const state = get();
      const currentNodes = state.nodes;

      if (overwrite) {
        // 覆盖当前方案
        const currentScenario = state.scenarios[state.currentScenarioId];
        if (!currentScenario) return { success: false, error: '当前方案不存在' };
        const updatedScenario = {
          ...currentScenario,
          nodes: JSON.parse(JSON.stringify(currentNodes)),
          updatedAt: Date.now()
        };
        set({
          scenarios: { ...state.scenarios, [state.currentScenarioId]: updatedScenario }
        });
        return { success: true };
      }

      // 另存为新方案
      if (!name || !name.trim()) return { success: false, error: '方案名称不能为空' };
      if (isNameDuplicate(state.scenarios, name.trim())) {
        return { success: false, error: `方案名称「${name.trim()}」已存在` };
      }
      const newId = 'scenario_' + Date.now();
      const newScenario = {
        id: newId,
        name: name.trim(),
        description: description || '',
        nodes: JSON.parse(JSON.stringify(currentNodes)),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      set({
        scenarios: { ...state.scenarios, [newId]: newScenario },
        currentScenarioId: newId
      });
      return { success: true };
    },

    loadScenario: (scenarioId) => {
      const state = get();
      const scenario = state.scenarios[scenarioId];
      if (!scenario) return { success: false, error: '方案不存在' };
      if (!scenario.nodes || Object.keys(scenario.nodes).length === 0) {
        return { success: false, error: '方案数据为空' };
      }

      // 先保存当前方案的节点快照（不直接修改 state，构建新的 scenarios 对象）
      const updatedScenarios = { ...state.scenarios };
      const currentScenario = updatedScenarios[state.currentScenarioId];
      if (currentScenario) {
        updatedScenarios[state.currentScenarioId] = {
          ...currentScenario,
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          updatedAt: Date.now()
        };
      }

      // 加载目标方案
      const loadedNodes = JSON.parse(JSON.stringify(scenario.nodes));
      set({
        nodes: loadedNodes,
        currentScenarioId: scenarioId,
        scenarios: updatedScenarios
      });
      return { success: true };
    },

    deleteScenario: (scenarioId) => {
      const state = get();
      if (scenarioId === state.currentScenarioId) {
        return { success: false, error: '不能删除当前正在使用的方案' };
      }
      const { [scenarioId]: _, ...rest } = state.scenarios;
      set({ scenarios: rest });
      return { success: true };
    },

    renameScenario: (scenarioId, newName) => {
      const state = get();
      const scenario = state.scenarios[scenarioId];
      if (!scenario) return { success: false, error: '方案不存在' };
      if (!newName || !newName.trim()) return { success: false, error: '名称不能为空' };
      if (isNameDuplicate(state.scenarios, newName.trim(), scenarioId)) {
        return { success: false, error: `方案名称「${newName.trim()}」已存在` };
      }
      const updated = { ...scenario, name: newName.trim(), updatedAt: Date.now() };
      set({ scenarios: { ...state.scenarios, [scenarioId]: updated } });
      return { success: true };
    },

    duplicateScenario: (scenarioId) => {
      const state = get();
      const scenario = state.scenarios[scenarioId];
      if (!scenario) return { success: false, error: '方案不存在' };
      const newId = 'scenario_' + Date.now();
      let newName = scenario.name + ' (副本)';
      let counter = 2;
      while (isNameDuplicate(state.scenarios, newName)) {
        newName = scenario.name + ` (副本${counter})`;
        counter++;
      }
      const newScenario = {
        id: newId,
        name: newName,
        description: scenario.description || '',
        nodes: JSON.parse(JSON.stringify(scenario.nodes || state.nodes)),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      set({ scenarios: { ...state.scenarios, [newId]: newScenario } });
      return { success: true };
    },

    createScenario: () => {
      const state = get();
      let name = '新方案';
      let counter = 1;
      while (isNameDuplicate(state.scenarios, name)) {
        counter++;
        name = `新方案 ${counter}`;
      }
      const newId = 'scenario_' + Date.now();
      const newScenario = {
        id: newId,
        name,
        description: '',
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      set({
        scenarios: { ...state.scenarios, [newId]: newScenario },
        currentScenarioId: newId
      });
      return { success: true };
    },

    rearrangeLayout: () => {
      const state = get();
      const nodesArray = Object.values(state.nodes);

      // 1. 按 level 的整数部分分组节点（默认 level 为 1）
      const nodesByColumn = {};
      nodesArray.forEach(node => {
        const parsed = parseLevel(node.level);
        const columnLevel = parsed.column;
        if (!nodesByColumn[columnLevel]) {
          nodesByColumn[columnLevel] = [];
        }
        nodesByColumn[columnLevel].push(node);
      });

      // 2. 获取所有列层级并排序（从小到大）
      const columnLevels = Object.keys(nodesByColumn).map(Number).sort((a, b) => a - b);

      // 3. 网格参数
      const columnWidth = 620;           // 每列宽度（节点 520 + 间距 100）
      const computedRowHeight = 220;     // 计算指标行高
      const driverRowHeight = 320;       // 驱动因子行高
      const startX = 100;                 // 起始 X
      const startY = 100;                 // 起始 Y

      const newNodes = { ...state.nodes };

      // 4. 按列排列（整数 level 小的在左边）
      columnLevels.forEach((columnLevel, columnIndex) => {
        const columnNodes = nodesByColumn[columnLevel];

        // 对同一列内的节点排序：先按完整 level 值，再按类型（计算指标在上）
        const sortedNodes = [...columnNodes].sort((a, b) => {
          const levelCmp = compareLevels(a.level, b.level);
          if (levelCmp !== 0) return levelCmp;
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'computed' ? -1 : 1;
        });

        // 排列节点 - 根据节点类型使用不同的行高
        let currentY = startY;
        sortedNodes.forEach((node) => {
          newNodes[node.id] = {
            ...newNodes[node.id],
            position: {
              x: startX + columnIndex * columnWidth,
              y: currentY
            }
          };
          // 根据节点类型累加不同的行高
          currentY += node.type === 'driver' ? driverRowHeight : computedRowHeight;
        });
      });

      set({ nodes: newNodes });
      // 保存到 localStorage
      try {
        const state = get();
        if (state.architectureAdapter) {
          const csvText = localStorage.getItem(STORAGE_KEY);
          if (csvText) {
            const data = JSON.parse(csvText);
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
              ...data,
              timestamp: Date.now()
            }));
          }
        }
      } catch (e) {
        console.warn('[rearrangeLayout] 保存失败:', e);
      }
    }
  };
});

export default useVDTStore;
