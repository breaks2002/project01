/**
 * VDT Store - 新架构版本
 * 使用四层架构：SourceData → FormulaEngine → AdjustmentManager → ViewAdapter
 */

import { create } from 'zustand';
import { ArchitectureAdapter } from '../architecture/ArchitectureAdapter';
import { encryptApiKey, decryptApiKey } from '../services/aiService';

// localStorage key
const STORAGE_KEY = 'vdt-store-data-v2';
const AI_CONFIG_KEY = 'vdt-ai-config';

const useVDTStore = create((set, get) => {
  // 初始化架构适配器
  const adapter = new ArchitectureAdapter();

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

  return {
    // 状态
    nodes: {},
    selectedNodeId: null,
    scale: 1,
    showDataPanel: true,
    collapsedNodeIds: new Set(),
    scenarios: {},
    currentScenarioId: 'default',
    aiConfig: initialAIConfig,

    // 架构适配器
    architectureAdapter: adapter,

    // 初始化
    _initArchitecture: () => {
      console.log('[useVDTStore] 架构已初始化');
    },

    // 使用新架构加载 CSV
    loadFromCSVNew: (csvText, formulaText) => {
      const state = get();
      const result = state.architectureAdapter.loadFromCSV(csvText, formulaText);
      const nodes = state.architectureAdapter.getAllNodes();
      set({ nodes });
      return result;
    },

    // 应用调整
    applyAdjustmentNew: (nodeId, period, dataType, value) => {
      const state = get();
      const adjustment = state.architectureAdapter.applyAdjustment(nodeId, period, dataType, value);
      const nodes = state.architectureAdapter.getAllNodes();
      set({ nodes });
      return adjustment;
    },

    // 撤销
    undoNew: () => {
      const state = get();
      const adjustment = state.architectureAdapter.undo();
      const nodes = state.architectureAdapter.getAllNodes();
      set({ nodes });
      return adjustment;
    },

    // 重做
    redoNew: () => {
      const state = get();
      const adjustment = state.architectureAdapter.redo();
      const nodes = state.architectureAdapter.getAllNodes();
      set({ nodes });
      return adjustment;
    },

    // 获取趋势图数据
    getTrendChartDataNew: (nodeId) => {
      const state = get();
      return state.architectureAdapter.getTrendChartData(nodeId);
    },

    // 获取表格数据
    getTableDataNew: (nodeId) => {
      const state = get();
      return state.architectureAdapter.getTableData(nodeId);
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
    }
  };
});

export default useVDTStore;
