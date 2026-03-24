import React, { useState, useEffect, useRef, useCallback } from 'react';
import useVDTStore from './store/useVDTStore';
import Toolbar from './components/Toolbar/Toolbar';
import Canvas from './components/Canvas/Canvas';
import NodeEditor from './components/Canvas/NodeEditor';
import DataImportModal from './components/Toolbar/DataImportModal';
import DataPanel from './components/DataPanel/DataPanel';
import FullscreenDataPanel from './components/DataPanel/FullscreenDataPanel';
import FormulaEditorPanel from './components/DataPanel/FormulaEditorPanel';
import ScenarioComparePanel from './components/DataPanel/ScenarioComparePanel';
import SensitivityAnalysisPanel from './components/DataPanel/SensitivityAnalysisPanel';
import StdDevAnalysisPanel from './components/DataPanel/StdDevAnalysisPanel';
import AIConfigPanel from './components/DataPanel/AIConfigPanel';
import AITuningPanel from './components/DataPanel/AITuningPanel';
import TrendChart from './components/Canvas/TrendChart';
import WaterfallChart from './components/Canvas/WaterfallChart';
import NodeTreeList from './components/NodeTreeList/NodeTreeList';
import KnowledgeBasePanel from './components/KnowledgeBase/KnowledgeBasePanel';
import ScenarioSelector from './components/KnowledgeBase/ScenarioSelector';
import ConstraintRulePanel from './components/DataPanel/ConstraintRulePanel';
import FactorAliasPanel from './components/DataPanel/FactorAliasPanel';
import { sampleSalesModel, sampleProfitModel } from './examples/sampleModel';
import html2canvas from 'html2canvas';

function App() {
  const nodes = useVDTStore(s => s.nodes);
  const selectedNodeId = useVDTStore(s => s.selectedNodeId);
  const scale = useVDTStore(s => s.scale);
  const storeShowDataPanel = useVDTStore(s => s.showDataPanel);
  const hasLoadedFromStorage = useVDTStore(s => s.hasLoadedFromStorage);
  const scenarios = useVDTStore(s => s.scenarios);
  const currentScenarioId = useVDTStore(s => s.currentScenarioId);
  const collapsedNodeIds = useVDTStore(s => s.collapsedNodeIds);
  const toggleCollapse = useVDTStore(s => s.toggleCollapse);
  const setScale = useVDTStore(s => s.setScale);
  const storeToggleDataPanel = useVDTStore(s => s.toggleDataPanel);
  const addNode = useVDTStore(s => s.addNode);
  const updateNode = useVDTStore(s => s.updateNode);
  const deleteNode = useVDTStore(s => s.deleteNode);
  const setSelectedNode = useVDTStore(s => s.setSelectedNode);
  const importModel = useVDTStore(s => s.importModel);
  const exportModel = useVDTStore(s => s.exportModel);
  const resetAllDrivers = useVDTStore(s => s.resetAllDrivers);
  const clearStorage = useVDTStore(s => s.clearStorage);
  const rearrangeLayout = useVDTStore(s => s.rearrangeLayout);
  const loadScenario = useVDTStore(s => s.loadScenario);
  const saveScenario = useVDTStore(s => s.saveScenario);
  const deleteScenario = useVDTStore(s => s.deleteScenario);
  const renameScenario = useVDTStore(s => s.renameScenario);
  const duplicateScenario = useVDTStore(s => s.duplicateScenario);
  const createScenario = useVDTStore(s => s.createScenario);

  const [showEditor, setShowEditor] = useState(false);
  const [showDataImport, setShowDataImport] = useState(false);
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
  const [showFullscreenData, setShowFullscreenData] = useState(false);
  const [showFormulaEditor, setShowFormulaEditor] = useState(false);
  const [showDataPanelLocal, setShowDataPanelLocal] = useState(false);
  const [showNodeTreeList, setShowNodeTreeList] = useState(false);
  const [showScenarioCompare, setShowScenarioCompare] = useState(false);
  const [isScenarioCompareMinimized, setIsScenarioCompareMinimized] = useState(false);
  const [showSensitivityAnalysis, setShowSensitivityAnalysis] = useState(false);
  const [isSensitivityAnalysisMinimized, setIsSensitivityAnalysisMinimized] = useState(false);
  const [showStdDevAnalysis, setShowStdDevAnalysis] = useState(false);
  const [isStdDevAnalysisMinimized, setIsStdDevAnalysisMinimized] = useState(false);
  const [isDataPanelMinimized, setIsDataPanelMinimized] = useState(false);
  const [isFormulaEditorMinimized, setIsFormulaEditorMinimized] = useState(false);
  const [isNodeTreeListMinimized, setIsNodeTreeListMinimized] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [dataPanelZIndex, setDataPanelZIndex] = useState(40);
  const [scenarioCompareZIndex, setScenarioCompareZIndex] = useState(50);
  const [sensitivityAnalysisZIndex, setSensitivityAnalysisZIndex] = useState(52);
  const [formulaEditorZIndex, setFormulaEditorZIndex] = useState(45);
  const [nodeEditorZIndex, setNodeEditorZIndex] = useState(55);
  const [nodeTreeListZIndex, setNodeTreeListZIndex] = useState(35);
  const [stdDevAnalysisZIndex, setStdDevAnalysisZIndex] = useState(50);
  const [trendChartZIndex, setTrendChartZIndex] = useState(60);
  const [waterfallChartZIndex, setWaterfallChartZIndex] = useState(60);
  const [aiConfigZIndex, setAiConfigZIndex] = useState(55);
  const [aiTuningZIndex, setAiTuningZIndex] = useState(56);
  const [trendChartNodeId, setTrendChartNodeId] = useState(null);
  const [waterfallChartNodeId, setWaterfallChartNodeId] = useState(null);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [showAITuning, setShowAITuning] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showScenarioSelector, setShowScenarioSelector] = useState(false);
  const [showRulePanel, setShowRulePanel] = useState(false);
  const [showAliasPanel, setShowAliasPanel] = useState(false);
  const [rulePanelZIndex, setRulePanelZIndex] = useState(59);
  const [aliasPanelZIndex, setAliasPanelZIndex] = useState(60);
  const [knowledgeBaseZIndex, setKnowledgeBaseZIndex] = useState(57);
  const [scenarioSelectorZIndex, setScenarioSelectorZIndex] = useState(58);
  const [selectedScenarios, setSelectedScenarios] = useState([]); // 选中的场景
  // 选中的知识库不再在 App 状态中管理，由 KnowledgeBasePanel 内部通过 localStorage 处理
  const initializedRef = useRef(false);
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);

  // 中心定位节点
  const centerNode = useCallback((nodeId) => {
    // 通过 Canvas 内部的 containerRef 来滚动
    // 使用 DOM 选择器获取滚动容器
    const container = document.getElementById('vdt-canvas-scroll-container');
    if (!container) {
      console.error('[centerNode] 未找到滚动容器');
      return;
    }

    const node = nodes[nodeId];
    if (!node || !node.position) {
      console.error('[centerNode] 节点不存在或没有位置', nodeId);
      return;
    }

    const nodeX = node.position.x || 0;
    const nodeY = node.position.y || 0;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // 计算目标位置（节点居中）
    const targetX = nodeX * scale - containerWidth / 2;
    const targetY = nodeY * scale - containerHeight / 2;

    console.log(`[centerNode] 节点 "${node.name}" 位置：(${nodeX}, ${nodeY}), scale=${scale}, 目标滚动：(${targetX}, ${targetY})`);

    // 平滑滚动到目标位置
    container.scrollTo({
      left: targetX,
      top: targetY,
      behavior: 'smooth'
    });
  }, [nodes, scale]);

  // 窗口置顶功能 - 统一管理所有 z-index
  const getAllZIndexes = useCallback(() => {
    return [
      dataPanelZIndex,
      scenarioCompareZIndex,
      sensitivityAnalysisZIndex,
      formulaEditorZIndex,
      nodeEditorZIndex,
      nodeTreeListZIndex,
      stdDevAnalysisZIndex,
      trendChartZIndex,
      waterfallChartZIndex,
      aiConfigZIndex,
      aiTuningZIndex,
      knowledgeBaseZIndex
    ];
  }, [dataPanelZIndex, scenarioCompareZIndex, sensitivityAnalysisZIndex, formulaEditorZIndex, nodeEditorZIndex, nodeTreeListZIndex, stdDevAnalysisZIndex, trendChartZIndex, waterfallChartZIndex, aiConfigZIndex, aiTuningZIndex, knowledgeBaseZIndex]);

  const bringDataPanelToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setDataPanelZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringScenarioCompareToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setScenarioCompareZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringSensitivityAnalysisToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setSensitivityAnalysisZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringFormulaEditorToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setFormulaEditorZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringNodeEditorToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setNodeEditorZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringNodeTreeListToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setNodeTreeListZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringStdDevAnalysisToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setStdDevAnalysisZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringTrendChartToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setTrendChartZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringWaterfallChartToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setWaterfallChartZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringAIConfigToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setAiConfigZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringAITuningToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setAiTuningZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringKnowledgeBaseToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setKnowledgeBaseZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringScenarioSelectorToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setScenarioSelectorZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringRulePanelToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setRulePanelZIndex(maxZ);
  }, [getAllZIndexes]);

  const bringAliasPanelToFront = useCallback(() => {
    const maxZ = Math.max(...getAllZIndexes()) + 1;
    setAliasPanelZIndex(maxZ);
  }, [getAllZIndexes]);

  const handleSelectScenarios = useCallback((scenarios) => {
    setSelectedScenarios(scenarios);
    console.log('[App] 选中的场景:', scenarios);
  }, []);

  // 暴露全局 setter 函数给 AI 调参面板使用
  useEffect(() => {
    window.showScenarioSelectorSetter = setShowScenarioSelector;
    window.showKnowledgeBaseSetter = setShowKnowledgeBase;
    return () => {
      delete window.showScenarioSelectorSetter;
      delete window.showKnowledgeBaseSetter;
    };
  }, []);

  // 初始化时从 localStorage 恢复选中的场景
  useEffect(() => {
    console.log('[App] 开始恢复场景选择...');
    try {
      const savedScenarioIds = JSON.parse(localStorage.getItem('vdt_prompt_selected_template') || '[]');
      console.log('[App] localStorage 中的场景 ID:', savedScenarioIds);
      if (savedScenarioIds && savedScenarioIds.length > 0) {
        // 延迟读取，等待 promptTemplateService 初始化
        setTimeout(async () => {
          console.log('[App] 开始加载场景模板...');
          const { default: promptTemplateService } = await import('./services/promptTemplateService');
          await promptTemplateService.initialize();
          const allTemplates = promptTemplateService.getAllTemplates();
          console.log('[App] 所有场景模板:', allTemplates.map(t => ({ id: t.id, name: t.name })));
          const selected = allTemplates.filter(t => savedScenarioIds.includes(t.id));
          console.log('[App] 恢复选中的场景:', selected);
          if (selected.length > 0) {
            setSelectedScenarios(selected);
          }
        }, 100);
      } else {
        console.log('[App] localStorage 中没有选中的场景');
      }
    } catch (err) {
      console.error('恢复场景选择失败:', err);
    }
  }, []);

  // 初始化示例模型（仅当 localStorage 没有数据时）
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!hasLoadedFromStorage || Object.keys(nodes).length === 0) {
      importModel(sampleSalesModel);
    }
  }, [importModel, hasLoadedFromStorage, nodes]);

  // 确保 nodes 是去重后的对象
  const uniqueNodes = React.useMemo(() => {
    const unique = {};
    Object.values(nodes).forEach(node => {
      if (node && node.id) {
        unique[node.id] = node;
      }
    });
    return unique;
  }, [nodes]);

  // 处理缩放
  const handleZoomIn = useCallback(() => {
    setScale(scale + 0.1);
  }, [scale, setScale]);

  const handleZoomOut = useCallback(() => {
    setScale(scale - 0.1);
  }, [scale, setScale]);

  const handleZoomReset = useCallback(() => {
    setScale(1);
  }, [setScale]);

  // 处理 Ctrl + 滚轮缩放
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(Math.min(2, Math.max(0.5, scale + delta)));
    }
  }, [scale, setScale]);

  // 处理节点值变化（仅驱动因子）
  const handleUpdateNode = useCallback((id, value, extraUpdates = {}) => {
    const node = nodes[id];
    if (!node || node.type !== 'driver') return;

    const nodeId = id;
    // 确保 value 是两位小数 - 用整数法避免精度问题
    const roundedValue = Math.round(value * 100) / 100;

    // 如果有 originalTimeData，只调整预测数，不改变实际数
    const updates = { value: roundedValue, ...extraUpdates };

    // 判断聚合方式：优先用节点显式指定的 aggregationType，否则根据 unit 判断
    let aggregationType = node.aggregationType;
    if (!aggregationType) {
      aggregationType = node.unit === '%' ? 'average' : 'sum';
    }
    const useAverage = aggregationType === 'average';

    if (node.originalTimeData && node.initialBaseline && node.initialBaseline !== 0) {
      const newTimeData = { ...node.originalTimeData };

      if (useAverage) {
        // ======================================
        // 平均模式（百分比/比率类型）：只调整预测数
        // ======================================
        // 1. 先计算原始的实际平均和预测平均
        let originalActualSum = 0;
        let originalActualCount = 0;
        let originalForecastSum = 0;
        let originalForecastCount = 0;

        Object.entries(node.originalTimeData).forEach(([key, val]) => {
          const numVal = parseFloat(val);
          if (!isNaN(numVal)) {
            if (key.includes('实际')) {
              originalActualSum += numVal;
              originalActualCount++;
            }
            if (key.includes('预测')) {
              originalForecastSum += numVal;
              originalForecastCount++;
            }
          }
        });

        // 2. 计算原始整体平均
        const originalTotalCount = originalActualCount + originalForecastCount;
        const originalTotalAvg = originalTotalCount > 0
          ? (originalActualSum + originalForecastSum) / originalTotalCount
          : node.initialBaseline;

        // 3. 计算目标平均
        const targetAvg = roundedValue;

        if (originalForecastCount > 0) {
          // 有预测数据：保持实际数不变，只调整预测数
          // 解方程：(actualSum + forecastSumNew) / totalCount = targetAvg
          const forecastSumNew = targetAvg * originalTotalCount - originalActualSum;

          if (originalForecastSum !== 0) {
            const forecastRatio = forecastSumNew / originalForecastSum;

            Object.keys(newTimeData).forEach(key => {
              if (key.includes('预测') && newTimeData[key] !== undefined && newTimeData[key] !== null) {
                const originalVal = parseFloat(newTimeData[key]);
                if (!isNaN(originalVal)) {
                  const newVal = originalVal * forecastRatio;
                  newTimeData[key] = Math.round(newVal * 100) / 100;
                }
              }
              // 实际数保持不变！
            });
          }
        } else {
          // 没有预测数据（年度开始）：可以调整所有数据
          const ratio = originalTotalAvg !== 0 ? roundedValue / originalTotalAvg : 1;
          Object.keys(newTimeData).forEach(key => {
            if ((key.includes('实际') || key.includes('预测')) && newTimeData[key] !== undefined && newTimeData[key] !== null) {
              const originalVal = parseFloat(newTimeData[key]);
              if (!isNaN(originalVal)) {
                const newVal = originalVal * ratio;
                newTimeData[key] = Math.round(newVal * 100) / 100;
              }
            }
          });
        }
      } else {
        // ======================================
        // 加总模式（绝对值类型）：用差额分配逻辑
        // ======================================
        // 1. 计算原始数据中的实际总和、预测总和
        let originalActualTotal = 0;
        let originalForecastTotal = 0;
        Object.entries(node.originalTimeData).forEach(([key, val]) => {
          const numVal = parseFloat(val);
          if (!isNaN(numVal)) {
            if (key.includes('实际')) originalActualTotal += numVal;
            if (key.includes('预测')) originalForecastTotal += numVal;
          }
        });

        // 2. 计算需要调整的差额
        const originalTotal = originalActualTotal + originalForecastTotal;
        const diffTotal = roundedValue - originalTotal;

        // 3. 情况一：有预测数据 → 只把差额分配到预测月份
        if (originalForecastTotal !== 0) {
          // 收集所有预测月份
          const forecastMonths = [];
          Object.entries(node.originalTimeData).forEach(([key, val]) => {
            if (key.includes('预测') && val !== undefined && val !== null) {
              const numVal = parseFloat(val);
              if (!isNaN(numVal)) {
                forecastMonths.push({ key, originalValue: numVal });
              }
            }
          });

          if (forecastMonths.length > 0) {
            // 按比例分配差额到各个预测月份
            forecastMonths.forEach(({ key, originalValue }) => {
              const ratio = originalValue / originalForecastTotal;
              const newValue = originalValue + diffTotal * ratio;
              newTimeData[key] = Math.round(newValue * 100) / 100;
            });
          }
        }
        // 4. 情况二：没有预测数据（年度开始）→ 调整所有数据
        else {
          const ratio = node.initialBaseline !== 0 ? roundedValue / node.initialBaseline : 1;
          Object.keys(newTimeData).forEach(key => {
            if ((key.includes('实际') || key.includes('预测')) && newTimeData[key] !== undefined && newTimeData[key] !== null) {
              const originalVal = parseFloat(newTimeData[key]);
              if (!isNaN(originalVal)) {
                const newVal = originalVal * ratio;
                newTimeData[key] = Math.round(newVal * 100) / 100;
              }
            }
          });
        }
      }

      updates.timeData = newTimeData;
    } else if (node.timeData && node.initialBaseline && node.initialBaseline !== 0) {
      // 兼容没有 originalTimeData 的情况
      let aggregationType = node.aggregationType;
      if (!aggregationType) {
        aggregationType = node.unit === '%' ? 'average' : 'sum';
      }
      const ratio = node.initialBaseline !== 0 ? roundedValue / node.initialBaseline : 1;
      const newTimeData = { ...node.timeData };

      Object.keys(newTimeData).forEach(key => {
        if ((key.includes('实际') || key.includes('预测')) && newTimeData[key] !== undefined && newTimeData[key] !== null) {
          const oldVal = parseFloat(newTimeData[key]);
          if (!isNaN(oldVal)) {
            const newVal = oldVal * ratio;
            newTimeData[key] = Math.round(newVal * 100) / 100;
          }
        }
      });

      updates.timeData = newTimeData;
    }

    updateNode(id, updates);
  }, [nodes, updateNode]);

  // 处理月份数据更新（精细化调整）
  const handleUpdateMonthData = useCallback((nodeId, newTotal, monthEdits) => {
    const node = nodes[nodeId];
    if (!node || node.type !== 'driver') return;

    // 构建新的 timeData：保持实际数不变，只更新预测数
    const newTimeData = {
      ...node.timeData
    };

    // 更新预测月份
    Object.entries(monthEdits).forEach(([key, value]) => {
      if (key.includes('预测')) {
        newTimeData[key] = value;
      }
    });

    // 更新节点（会触发重算）
    const updates = {
      value: newTotal,
      timeData: newTimeData
    };

    // 如果没有 originalTimeData，创建一个
    if (!node.originalTimeData) {
      updates.originalTimeData = { ...node.timeData };
    }

    updateNode(nodeId, updates);
  }, [nodes, updateNode]);

  const handleUpdateNodePosition = useCallback((id, position) => {
    updateNode(id, { position });
  }, [updateNode]);

  const handleResizeNode = useCallback((id, size) => {
    updateNode(id, { size });
  }, [updateNode]);

  const handleOpenEditor = useCallback((nodeId) => {
    setEditingNode(nodeId ? nodes[nodeId] : null);
    setShowEditor(true);
  }, [nodes]);

  const handleEditNode = useCallback((nodeId) => {
    setEditingNode(nodes[nodeId]);
    setShowEditor(true);
  }, [nodes]);

  // 全部重置 - 仅重置数据
  const handleResetAllDataOnly = useCallback(() => {
    setShowResetAllConfirm(false);
    resetAllDrivers();
  }, [resetAllDrivers]);

  // 全部重置 - 数据和描述同步重置
  const handleResetAllDataAndDescription = useCallback(() => {
    setShowResetAllConfirm(false);
    // 重置所有驱动因子的值和描述
    Object.values(nodes).forEach(node => {
      if (node.type === 'driver') {
        if (node.initialBaseline !== null && node.initialBaseline !== undefined && !isNaN(node.initialBaseline)) {
          updateNode(node.id, {
            value: node.initialBaseline,
            adjustmentDescription: ''
          });
        }
      }
    });
    resetAllDrivers(); // 调用原有的重置逻辑
  }, [nodes, updateNode, resetAllDrivers]);

  // 辅助函数：转义正则表达式特殊字符
  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // 辅助函数：创建匹配 ID 的正则（支持中文 ID）
  const createIdRegex = (id) => {
    const escaped = escapeRegExp(id);
    // 中文没有单词边界，使用更通用的匹配方式
    // 匹配：ID 前后不是字母、数字、下划线、中文
    return new RegExp(`(^|[^a-zA-Z0-9_\u4e00-\u9fa5])${escaped}($|[^a-zA-Z0-9_\u4e00-\u9fa5])`, 'g');
  };

  // 辅助函数：替换 ID 时保留边界字符
  const replaceId = (formula, oldId, newId) => {
    const regex = createIdRegex(oldId);
    return formula.replace(regex, (match, before, after) => {
      return before + newId + after;
    });
  };

  const handleSaveNode = useCallback((newNode) => {
    console.log('🔥🔥🔥 [handleSaveNode] 被调用！', {
      editingNode: editingNode,
      editingNodeId: editingNode?.id,
      newNodeId: newNode.id,
      newNodeName: newNode.name
    });

    console.log('[handleSaveNode] 调用 save', {
      editingNode: editingNode,
      editingNodeId: editingNode?.id,
      newNodeId: newNode.id,
      newNodeName: newNode.name
    });

    // 如果 ID 发生变化，需要先更新依赖公式，再删除旧节点
    if (editingNode && editingNode.id && editingNode.id !== newNode.id) {
      const oldId = editingNode.id;
      const newId = newNode.id;

      console.log('[handleSaveNode] 检测到 ID 变化:', oldId, '→', newId);

      // 1. 先更新所有依赖该节点的公式（在当前 nodes 状态下查找）
      const currentNodes = Object.values(nodes);
      const formulasToUpdate = [];

      console.log('[handleSaveNode] 当前 nodes 数量:', currentNodes.length);
      console.log('[handleSaveNode] 旧 ID:', oldId);

      currentNodes.forEach(node => {
        if (node.type === 'computed' && node.formula) {
          console.log(`[handleSaveNode] 检查公式：${node.name} (${node.id}) - ${node.formula}`);

          // 使用新的替换函数
          if (node.formula.includes(oldId)) {
            const newFormula = replaceId(node.formula, oldId, newId);
            console.log(`[handleSaveNode] 正则匹配：true, 新公式：${newFormula}`);
            formulasToUpdate.push({ nodeId: node.id, newFormula });
            console.log(`[handleSaveNode] 待更新公式：${node.name} (${node.id}) - ${node.formula} → ${newFormula}`);
          } else {
            console.log(`[handleSaveNode] 正则匹配：false (公式中不包含旧 ID)`);
          }
        }
      });

      console.log('[handleSaveNode] 待更新公式数量:', formulasToUpdate.length);

      // 批量更新公式
      formulasToUpdate.forEach(({ nodeId, newFormula }) => {
        updateNode(nodeId, { formula: newFormula });
      });

      // 2. 删除旧节点，添加新节点
      console.log('[handleSaveNode] 删除旧节点:', oldId);
      deleteNode(oldId);
      console.log('[handleSaveNode] 添加新节点:', newId);
      addNode(newNode);

      console.log('[handleSaveNode] ID 变更完成，已更新', formulasToUpdate.length, '个公式');
    } else {
      // ID 未变化，正常更新
      console.log('[handleSaveNode] ID 未变化，正常更新');
      if (nodes[newNode.id]) {
        updateNode(newNode.id, newNode);
      } else {
        addNode(newNode);
      }
    }
    setShowEditor(false);
    setEditingNode(null);
  }, [nodes, editingNode, updateNode, addNode, deleteNode]);

  // 迁移公式：将所有公式中的 Name 替换为对应节点的 ID
  const migrateFormulas = useCallback(() => {
    console.log('[migrateFormulas] 开始迁移公式...');

    Object.values(nodes).forEach(node => {
      if (node.type === 'computed' && node.formula) {
        let newFormula = node.formula;
        let changed = false;

        // 查找所有节点，将公式中的 Name 替换为 ID
        // 按名称长度降序排序，避免短名称先替换导致长名称匹配失败
        const sortedNodes = Object.values(nodes).sort((a, b) => b.name.length - a.name.length);

        sortedNodes.forEach(targetNode => {
          if (targetNode.id && targetNode.name && targetNode.id !== targetNode.name) {
            // 使用单词边界匹配，避免部分匹配
            const nameRegex = new RegExp(`\\b${escapeRegExp(targetNode.name)}\\b`, 'g');
            if (nameRegex.test(newFormula)) {
              newFormula = newFormula.replace(nameRegex, targetNode.id);
              changed = true;
              console.log(`[migrateFormulas] 替换："${targetNode.name}" → "${targetNode.id}"`);
            }
          }
        });

        if (changed) {
          updateNode(node.id, { formula: newFormula });
          console.log(`[migrateFormulas] 更新节点 ${node.id} 的公式：${node.formula} → ${newFormula}`);
        }
      }
    });

    console.log('[migrateFormulas] 迁移完成');
  }, [nodes, updateNode]);

  const handleDeleteNode = useCallback((id) => {
    if (window.confirm('确定要删除这个节点吗？')) {
      deleteNode(id);
    }
  }, [deleteNode]);

  // === 导出 JSON ===
  const handleExportJSON = useCallback(() => {
    const model = exportModel();
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vdt-model-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportModel]);

  // === 导出 CSV ===
  const handleExportCSV = useCallback(() => {
    const headers = ['节点ID', '名称', '类型', '当前值', '基准值', '单位', '公式'];
    const rows = Object.values(nodes).map(node => [
      node.id,
      node.name,
      node.type === 'driver' ? '驱动因子' : '计算指标',
      node.value ?? '',
      node.baseline ?? '',
      node.unit ?? '',
      node.formula ?? ''
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vdt-data-' + Date.now() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes]);

  // === 导出数据表模板 ===
  const handleExportDataTemplate = useCallback(() => {
    const headers = ['指标名称', '指标ID', '1月实际', '2月实际', '3月实际', '4月实际', '5月实际', '6月实际', '7月实际', '8月实际', '9月预测', '10月预测', '11月预测', '12月预测'];
    const sampleRows = [
      ['营业收入', 'yingyeshouru', '100000', '110000', '120000', '', '', '', '', '', '', '', '', ''],
      ['变动成本', 'biandongchengben', '50000', '55000', '60000', '', '', '', '', '', '', '', '', ''],
      ['固定成本', 'gudingchengben', '30000', '30000', '30000', '', '', '', '', '', '', '', '', '']
    ];

    const csvContent = [headers, ...sampleRows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vdt-数据模板.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // === 导出公式表模板 ===
  const handleExportFormulaTemplate = useCallback(() => {
    const headers = ['指标ID', '指标名称', '节点类型', '公式', '最小值', '最大值', '单位', '显示格式', '指标方向', '层级', '汇总方式', '比率型指标'];
    const sampleRows = [
      ['yingyeshouru', '营业收入', 'driver', '', '0', '1000000', '万元', '#,##0', 'auto', '1', 'sum', 'FALSE'],
      ['chengbenzonge', '成本总额', 'driver', '', '0', '500000', '万元', '#,##0', 'negative', '2', 'sum', 'FALSE'],
      ['maolirun', '毛利润', 'computed', 'yingyeshouru - chengbenzonge', '', '', '万元', '#,##0', 'auto', '3', '', 'FALSE'],
      ['xiaoshouliang', '销售量', 'driver', '', '0', '10000', '件', '#,##0', 'auto', '4.1', 'sum', 'FALSE'],
      ['danjia', '单价', 'driver', '', '0', '1000', '元', '#,##0', 'auto', '4.2', 'average', 'FALSE'],
      ['lirunlv', '利润率', 'computed', 'maolirun / yingyeshouru * 100', '', '', '%', '0.00', 'positive', '5', '', 'TRUE']
    ];

    // 使用制表符分隔或者正确处理CSV格式，避免#,##0被解析
    const csvContent = [headers, ...sampleRows].map(row => {
      // 对包含逗号或特殊字符的字段加引号
      return row.map(cell => {
        const str = String(cell ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('#')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',');
    }).join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vdt-公式模板.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // === 导出画布为图片（简单版：导出当前可见区域） ===
  const handleExportImage = useCallback(async () => {
    try {
      // 获取滚动容器
      const scrollContainer = document.getElementById('vdt-canvas-scroll-container');
      if (!scrollContainer) {
        alert('无法获取画布容器');
        return;
      }

      // 获取当前方案名称
      const currentScenario = scenarios[currentScenarioId];
      const scenarioName = currentScenario?.name || '当前方案';
      const title = `${scenarioName}价值驱动树（VDT）`;

      // 先对画布进行截图
      const canvasWithoutTitle = await html2canvas(scrollContainer, {
        backgroundColor: '#f9fafb',
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        onclone: (clonedDoc) => {
          // 在克隆的文档中，把所有 input 替换成 span，避免文字倒过来的问题
          const inputs = clonedDoc.querySelectorAll('input[type="number"]');
          inputs.forEach(input => {
            const span = clonedDoc.createElement('span');
            span.textContent = input.value;
            span.style.display = 'inline-block';
            span.style.minWidth = '100px';
            span.style.padding = '4px 8px';
            span.style.border = '1px solid #d1d5db';
            span.style.borderRadius = '4px';
            span.style.backgroundColor = 'white';
            span.style.fontFamily = 'system-ui, -apple-system, sans-serif';
            span.style.fontSize = '14px';
            span.style.textAlign = 'left';
            span.style.direction = 'ltr';
            span.style.unicodeBidi = 'normal';
            // 把 input 替换成 span
            input.parentNode?.replaceChild(span, input);
          });
        }
      });

      // 创建新的 Canvas，在上面绘制标题和原图
      const finalCanvas = document.createElement('canvas');
      const titleHeight = 80; // 标题区域高度（像素）
      finalCanvas.width = canvasWithoutTitle.width;
      finalCanvas.height = canvasWithoutTitle.height + titleHeight * 2; // scale 是 2，所以要乘 2

      const ctx = finalCanvas.getContext('2d');
      if (!ctx) {
        alert('无法创建画布上下文');
        return;
      }

      // 填充背景
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

      // 绘制标题
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
      ctx.fillText(title, 40, 100); // 左侧留 40px 边距

      // 绘制一条分隔线
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 130);
      ctx.lineTo(finalCanvas.width - 40, 130);
      ctx.stroke();

      // 绘制原来的画布内容（在标题下方）
      ctx.drawImage(canvasWithoutTitle, 0, titleHeight * 2);

      // 下载图片
      const link = document.createElement('a');
      link.download = `vdt-${scenarioName}-${Date.now()}.png`;
      link.href = finalCanvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('导出图片失败:', error);
      alert('导出图片失败，请重试: ' + error.message);
    }
  }, [scenarios, currentScenarioId]);

  const handleImportJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const model = JSON.parse(event.target.result);
            if (model.nodes) {
              importModel(model);
            }
          } catch (err) {
            alert('导入失败：无效的 JSON 文件');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [importModel]);

  const handleLoadSample = useCallback((type) => {
    const model = type === 'sales' ? sampleSalesModel : sampleProfitModel;
    importModel(model);
  }, [importModel]);

  // 处理 CSV 导入（支持追加/覆盖模式）
  const handleCSVImport = useCallback(({ nodes, mode = 'replace' }) => {
    importModel({ nodes }, { append: mode === 'append' });
  }, [importModel]);

  return (
    (console.log('💥💥 [APP] RENDER START 💥💥💥 showAITuning=', showAITuning)),
    (console.log('💥 [APP] 当前时间:', new Date().toLocaleTimeString())),
    <div className="h-screen flex flex-col bg-gray-100">
      <Toolbar
        onOpenEditor={handleOpenEditor}
        onImportJSON={handleImportJSON}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onExportImage={handleExportImage}
        onExportDataTemplate={handleExportDataTemplate}
        onExportFormulaTemplate={handleExportFormulaTemplate}
        onLoadSample={handleLoadSample}
        onOpenCSVImport={() => setShowDataImport(true)}
        scenarios={scenarios}
        currentScenarioId={currentScenarioId}
        onLoadScenario={loadScenario}
        onSaveScenario={saveScenario}
        onDeleteScenario={deleteScenario}
        onRenameScenario={renameScenario}
        onDuplicateScenario={duplicateScenario}
        onCreateScenario={createScenario}
        onOpenScenarioCompare={() => {
          setShowScenarioCompare(true);
          setIsScenarioCompareMinimized(false);
        }}
        showScenarioCompare={showScenarioCompare}
        isScenarioCompareMinimized={isScenarioCompareMinimized}
        onOpenSensitivityAnalysis={() => {
          setShowSensitivityAnalysis(true);
          setIsSensitivityAnalysisMinimized(false);
        }}
        showSensitivityAnalysis={showSensitivityAnalysis}
        isSensitivityAnalysisMinimized={isSensitivityAnalysisMinimized}
        onToggleNodeTreeList={() => {
          setShowNodeTreeList(!showNodeTreeList);
          setIsNodeTreeListMinimized(false);
        }}
        showNodeTreeList={showNodeTreeList}
        isNodeTreeListMinimized={isNodeTreeListMinimized}
        onRestoreNodeTreeList={() => setIsNodeTreeListMinimized(false)}
        onOpenStdDevAnalysis={() => {
          setShowStdDevAnalysis(true);
          setIsStdDevAnalysisMinimized(false);
        }}
        showStdDevAnalysis={showStdDevAnalysis}
        isStdDevAnalysisMinimized={isStdDevAnalysisMinimized}
        onOpenAIConfig={() => setShowAIConfig(true)}
        showAIConfig={showAIConfig}
        onOpenAITuning={() => setShowAITuning(true)}
        showAITuning={showAITuning}
        onOpenKnowledgeBase={() => {
          setShowKnowledgeBase(true);
        }}
        showKnowledgeBase={showKnowledgeBase}
        onOpenScenarioSelector={() => {
          setShowScenarioSelector(true);
        }}
        onOpenRulePanel={() => {
          setShowRulePanel(true);
        }}
        onOpenAliasPanel={() => {
          setShowAliasPanel(true);
        }}
        showRulePanel={showRulePanel}
      />

      {/* 缩放控制栏 */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">画布缩放:</span>
          <button
            onClick={handleZoomOut}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
            title="缩小"
          >
            −
          </button>
          <span className="text-sm font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={handleZoomIn}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
            title="放大"
          >
            +
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm ml-2"
            title="重置"
          >
            100%
          </button>
          <span className="text-xs text-gray-400 ml-3">提示: Ctrl + 滚轮也可以缩放</span>
        </div>
        {/* 统计信息 */}        <div className="flex items-center gap-4 text-xs">          {(() => {            const allNodes = Object.values(nodes);            const total = allNodes.length;            const computed = allNodes.filter(n => n.type === 'computed').length;            const drivers = allNodes.filter(n => n.type === 'driver').length;            const changedComputed = allNodes.filter(n => n.type === 'computed' && n.value !== n.initialBaseline && n.initialBaseline !== null && n.initialBaseline !== undefined).length;            const changedDrivers = allNodes.filter(n => n.type === 'driver' && n.value !== n.initialBaseline && n.initialBaseline !== null && n.initialBaseline !== undefined).length;            const describedDrivers = allNodes.filter(n => n.type === 'driver' && n.adjustmentDescription && n.adjustmentDescription.trim() !== '').length;            return (              <>                <span className="text-gray-500">                  节点总数：<span className="font-medium text-gray-700">{total}</span>                </span>                <span className="text-gray-500">                  计算指标：<span className="font-medium text-blue-600">{computed}</span>                </span>                <span className="text-gray-500">                  驱动因子：<span className="font-medium text-green-600">{drivers}</span>                </span>                <span className="text-gray-500">                  已变更计算指标：<span className="font-medium text-orange-600">{changedComputed}</span>                </span>                <span className="text-gray-500">                  已变更驱动因子：<span className="font-medium text-orange-600">{changedDrivers}</span>                </span>                <span className="text-gray-500">                  已描述驱动因子：<span className="font-medium text-purple-600">{describedDrivers}</span>                </span>              </>            );          })()}        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowResetAllConfirm(true);
            }}
            className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm"
          >
            全部重置
          </button>
          <button
            onClick={() => {
              if (window.confirm('确定要清空所有数据吗？此操作不可恢复！')) {
                clearStorage();
              }
            }}
            className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
          >
            清空数据
          </button>
          <button
            onClick={rearrangeLayout}
            className="px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded text-sm"
          >
            布局整理
          </button>
          {showDataPanelLocal && isDataPanelMinimized && (
            <button
              onClick={() => setIsDataPanelMinimized(false)}
              className="px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 text-sm animate-pulse"
            >
              🔄 恢复数据面板
            </button>
          )}
          <button
            onClick={() => {
              setShowDataPanelLocal(!showDataPanelLocal);
              setIsDataPanelMinimized(false);
            }}
            className={`px-3 py-1 rounded text-sm ${showDataPanelLocal && !isDataPanelMinimized ? 'bg-blue-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
          >
            {showDataPanelLocal && !isDataPanelMinimized ? '隐藏数据面板' : '显示数据面板'}
          </button>

          {showFormulaEditor && isFormulaEditorMinimized && (
            <button
              onClick={() => setIsFormulaEditorMinimized(false)}
              className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 text-sm animate-pulse"
            >
              🔄 恢复公式编辑
            </button>
          )}
          <button
            onClick={() => {
              setShowFormulaEditor(!showFormulaEditor);
              setIsFormulaEditorMinimized(false);
            }}
            className={`px-3 py-1 rounded text-sm ${showFormulaEditor && !isFormulaEditorMinimized ? 'bg-purple-600 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'}`}
          >
            {showFormulaEditor && !isFormulaEditorMinimized ? '隐藏公式编辑' : '显示公式编辑'}
          </button>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex overflow-hidden" onWheel={handleWheel}>
        {/* 画布区域 */}
        <div ref={canvasContainerRef} className="flex-1 relative">
          <Canvas
            nodes={uniqueNodes}
            allNodes={uniqueNodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNode}
            onUpdateNode={handleUpdateNode}
            onMonthValueChange={handleUpdateMonthData}
            onDeleteNode={handleDeleteNode}
            onUpdateNodePosition={handleUpdateNodePosition}
            onEditNode={handleEditNode}
            onResizeNode={handleResizeNode}
            onOpenTrendChart={(node) => setTrendChartNodeId(node.id)}
            onOpenWaterfallChart={(node) => setWaterfallChartNodeId(node.id)}
            scale={scale}
            canvasRef={canvasRef}
          />
        </div>
      </div>

      {showEditor && (
        <div style={{ zIndex: nodeEditorZIndex }} onClick={bringNodeEditorToFront}>
          <NodeEditor
            node={editingNode}
            onSave={handleSaveNode}
            onClose={() => setShowEditor(false)}
            onBringToFront={bringNodeEditorToFront}
          />
        </div>
      )}

      {showFullscreenData && (
        <FullscreenDataPanel
          nodes={uniqueNodes}
          onClose={() => setShowFullscreenData(false)}
          currentScenarioName={scenarios[currentScenarioId]?.name}
        />
      )}

      {showDataImport && (
        <DataImportModal
          onClose={() => setShowDataImport(false)}
          onImport={handleCSVImport}
          existingNodesCount={Object.keys(nodes).length}
          existingNodes={uniqueNodes}
        />
      )}

      {showScenarioCompare && (
        <div style={{ zIndex: scenarioCompareZIndex }} onClick={bringScenarioCompareToFront}>
          <ScenarioComparePanel
            scenarios={scenarios}
            onClose={() => setShowScenarioCompare(false)}
            isMinimized={isScenarioCompareMinimized}
            onToggleMinimize={() => setIsScenarioCompareMinimized(!isScenarioCompareMinimized)}
            onBringToFront={bringScenarioCompareToFront}
          />
        </div>
      )}

      {/* 敏感性分析面板 */}
      {showSensitivityAnalysis && (
        <div style={{ zIndex: sensitivityAnalysisZIndex }} onClick={bringSensitivityAnalysisToFront}>
          <SensitivityAnalysisPanel
            nodes={uniqueNodes}
            scenarios={scenarios}
            currentScenarioId={currentScenarioId}
            onClose={() => setShowSensitivityAnalysis(false)}
            isMinimized={isSensitivityAnalysisMinimized}
            onToggleMinimize={() => setIsSensitivityAnalysisMinimized(!isSensitivityAnalysisMinimized)}
            onBringToFront={bringSensitivityAnalysisToFront}
          />
        </div>
      )}

      {/* 数据面板 - 浮动窗口 */}
      {showDataPanelLocal && (
        <div style={{ zIndex: dataPanelZIndex }} onClick={bringDataPanelToFront}>
          <DataPanel
            nodes={uniqueNodes}
            onClose={() => setShowDataPanelLocal(false)}
            onOpenFullscreen={() => setShowFullscreenData(true)}
            currentScenarioName={scenarios[currentScenarioId]?.name}
            isMinimized={isDataPanelMinimized}
            onToggleMinimize={() => setIsDataPanelMinimized(!isDataPanelMinimized)}
            onBringToFront={bringDataPanelToFront}
          />
        </div>
      )}

      {/* 公式编辑面板 - 浮动窗口 */}
      {showFormulaEditor && (
        <div style={{ zIndex: formulaEditorZIndex }} onClick={bringFormulaEditorToFront}>
          <FormulaEditorPanel
            nodes={uniqueNodes}
            onUpdateNode={updateNode}
            onAddNode={addNode}
            onDeleteNode={deleteNode}
            onClose={() => setShowFormulaEditor(false)}
            isMinimized={isFormulaEditorMinimized}
            onToggleMinimize={() => setIsFormulaEditorMinimized(!isFormulaEditorMinimized)}
            onMigrateFormulas={migrateFormulas}
            onBringToFront={bringFormulaEditorToFront}
          />
        </div>
      )}

      {/* 节点列表 - 浮动窗口 */}
      {showNodeTreeList && (
        <div
          style={{
            zIndex: nodeTreeListZIndex
          }}
          onClick={bringNodeTreeListToFront}
        >
          <NodeTreeList
            nodes={uniqueNodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNode}
            collapsedNodeIds={collapsedNodeIds}
            onToggleCollapse={toggleCollapse}
            onCenterNode={centerNode}
            onClose={() => setShowNodeTreeList(false)}
            isMinimized={isNodeTreeListMinimized}
            onToggleMinimize={() => setIsNodeTreeListMinimized(!isNodeTreeListMinimized)}
            onBringToFront={bringNodeTreeListToFront}
            onOpenTrendChart={(node) => setTrendChartNodeId(node.id)}
            onOpenWaterfallChart={(node) => setWaterfallChartNodeId(node.id)}
          />
        </div>
      )}

      {/* 标准差分析 - 浮动窗口 */}
      {showStdDevAnalysis && (
        <div
          style={{
            zIndex: stdDevAnalysisZIndex
          }}
          onClick={bringStdDevAnalysisToFront}
        >
          <StdDevAnalysisPanel
            nodes={nodes}
            scenarios={scenarios}
            currentScenarioId={currentScenarioId}
            onClose={() => setShowStdDevAnalysis(false)}
            isMinimized={isStdDevAnalysisMinimized}
            onToggleMinimize={() => setIsStdDevAnalysisMinimized(!isStdDevAnalysisMinimized)}
            onBringToFront={bringStdDevAnalysisToFront}
          />
        </div>
      )}

      {/* 趋势图弹窗 */}
      {trendChartNodeId && nodes[trendChartNodeId] && (
        <div style={{ zIndex: trendChartZIndex, position: 'relative' }} onClick={bringTrendChartToFront}>
          <TrendChart
            key={`trend-${trendChartNodeId}`}
            node={nodes[trendChartNodeId]}
            allNodes={nodes}
            scenarioName={scenarios[currentScenarioId]?.name}
            onClose={() => setTrendChartNodeId(null)}
          />
        </div>
      )}

      {/* 瀑布图弹窗 */}
      {waterfallChartNodeId && nodes[waterfallChartNodeId] && (
        <div style={{ zIndex: waterfallChartZIndex, position: 'relative' }} onClick={bringWaterfallChartToFront}>
          <WaterfallChart
            key={`waterfall-${waterfallChartNodeId}`}
            node={nodes[waterfallChartNodeId]}
            allNodes={nodes}
            scenarioName={scenarios[currentScenarioId]?.name}
            onClose={() => setWaterfallChartNodeId(null)}
          />
        </div>
      )}

      {/* AI配置面板 */}
      {showAIConfig && (
        <div style={{ zIndex: aiConfigZIndex, position: 'relative' }} onClick={bringAIConfigToFront}>
          <AIConfigPanel
            onClose={() => setShowAIConfig(false)}
            onBringToFront={bringAIConfigToFront}
          />
        </div>
      )}

      {/* AI 调参面板 */}
      {showAITuning && (() => {
        console.log("[App] 渲染 AITuningPanel, showAITuning=", showAITuning);
        return (
        <div style={{ zIndex: aiTuningZIndex, position: "relative" }} onClick={bringAITuningToFront}>
          <AITuningPanel
            onClose={() => setShowAITuning(false)}
            onBringToFront={bringAITuningToFront}
            selectedScenarios={selectedScenarios}
          />
        </div>
        );
      })()}

      {/* 知识库面板 */}
      {showKnowledgeBase && (
        <div style={{ zIndex: knowledgeBaseZIndex, position: 'relative' }} onClick={bringKnowledgeBaseToFront}>
          <KnowledgeBasePanel
            onClose={() => setShowKnowledgeBase(false)}
          />
        </div>
      )}

      {/* 场景选择 */}
      {showScenarioSelector && (
        <div style={{ zIndex: scenarioSelectorZIndex, position: 'relative' }} onClick={bringScenarioSelectorToFront}>
          <ScenarioSelector
            onClose={() => setShowScenarioSelector(false)}
            onSelectScenarios={handleSelectScenarios}
          />
        </div>
      )}

      {/* 规则管理面板 - 可拖动窗口 */}
      {showRulePanel && (
        <div
          style={{ zIndex: rulePanelZIndex }}
          className="fixed"
          onClick={bringRulePanelToFront}
        >
          <ConstraintRulePanel
            onClose={() => setShowRulePanel(false)}
            position={{ x: 200, y: 150 }}
          />
        </div>
      )}

      {/* 别名管理面板 - 可拖动窗口 */}
      {showAliasPanel && (
        <div
          style={{ zIndex: aliasPanelZIndex }}
          className="fixed"
          onClick={bringAliasPanelToFront}
        >
          <FactorAliasPanel
            onClose={() => setShowAliasPanel(false)}
            position={{ x: 250, y: 200 }}
          />
        </div>
      )}

      {/* 全部重置确认对话框 */}
      {showResetAllConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-4 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔄</span>
              <span className="font-medium text-gray-800">全部重置确认</span>
            </div>
            <div className="text-sm text-gray-600 mb-4">
              检测到当前存在调整描述，请选择重置方式：
            </div>
            <div className="space-y-2">
              <button
                onClick={handleResetAllDataOnly}
                className="w-full px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-medium"
              >
                📊 仅重置数据（保留描述）
              </button>
              <button
                onClick={handleResetAllDataAndDescription}
                className="w-full px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium"
              >
                🗑️ 数据和描述同步重置
              </button>
              <button
                onClick={() => setShowResetAllConfirm(false)}
                className="w-full px-3 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
