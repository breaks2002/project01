import React, { useState, useEffect, useRef, useCallback } from 'react';
import useVDTStore from './store/useVDTStore';
import Toolbar from './components/Toolbar/Toolbar';
import Canvas from './components/Canvas/Canvas';
import NodeEditor from './components/Canvas/NodeEditor';
import DataImportModal from './components/Toolbar/DataImportModal';
import PowerBIConnectModal from './components/Toolbar/PowerBIConnectModal';
import { PowerBIDesktopConnector } from './services/dataConnectors/PowerBIDesktopConnector';
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
import LicensePanel from './components/LicensePanel';
import SystemModal from './components/Toolbar/SystemModal';
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
  const applyAdjustmentNew = useVDTStore(s => s.applyAdjustmentNew);
  const applyBatchAdjustmentsNew = useVDTStore(s => s.applyBatchAdjustmentsNew);
  const undoNew = useVDTStore(s => s.undoNew);
  const redoNew = useVDTStore(s => s.redoNew);
  const getScenariosNew = useVDTStore(s => s.getScenariosNew);
  const getAdjustmentsNew = useVDTStore(s => s.getAdjustmentsNew);
  const switchScenarioNew = useVDTStore(s => s.switchScenarioNew);
  // 指标体系管理
  const systems = useVDTStore(s => s.systems);
  const storeCurrentSystemId = useVDTStore(s => s.currentSystemId);
  const loadSystems = useVDTStore(s => s.loadSystems);
  const saveSystem = useVDTStore(s => s.saveSystem);
  const switchSystem = useVDTStore(s => s.switchSystem);
  const deleteSystemAction = useVDTStore(s => s.deleteSystem);
  const renameSystem = useVDTStore(s => s.renameSystem);
  const importSystem = useVDTStore(s => s.importSystem);
  const exportSystem = useVDTStore(s => s.exportSystem);
  // const canUndo = useVDTStore(s => s.canUndo);
  // const canRedo = useVDTStore(s => s.canRedo);

  // 授权状态
  const [licenseValid, setLicenseValid] = useState(false);
  const [showLicensePanel, setShowLicensePanel] = useState(true);
  const [licenseInfo, setLicenseInfo] = useState(null);

  // 指标体系管理
  const [showSystemModal, setShowSystemModal] = useState(false);

  // 加载体系列表
  useEffect(() => {
    const data = loadSystems();
    if (data.systems && Object.keys(data.systems).length > 0) {
      useVDTStore.setState({ systems: data.systems, currentSystemId: data.currentSystemId });
    }
  }, []);

  // 授权检查
  useEffect(() => {
    const checkLicense = async () => {
      if (window.electronAPI) {
        const result = await window.electronAPI.checkLicense();
        setLicenseValid(result.valid);
        setLicenseInfo(result);
        setShowLicensePanel(!result.valid);
      } else {
        // 开发模式默认有效
        setLicenseValid(true);
        setShowLicensePanel(false);
      }
    };
    checkLicense();
  }, []);

  const handleLicenseValid = (info) => {
    setLicenseValid(true);
    setLicenseInfo(info);
    setShowLicensePanel(false);
  };

  const handleOpenLicensePanel = useCallback(() => {
    setShowLicensePanel(true);
  }, []);

  const [showCopyrightInfo, setShowCopyrightInfo] = useState(false);
  const [showAuthDropdown, setShowAuthDropdown] = useState(false);

  // === 试用版权限检查 ===
  const isTrial = licenseInfo?.valid && licenseInfo?.type === 'trial';
  const isDev = licenseInfo?.type === 'dev';
  const daysLeft = licenseInfo?.daysLeft ?? null;
  const canExport = !isTrial || isDev; // 试用版不允许任何导出

  // 调试：打印授权信息
  React.useEffect(() => {
    console.log('[授权调试] licenseInfo:', JSON.stringify(licenseInfo, null, 2));
    console.log('[授权调试] isTrial:', isTrial, 'isDev:', isDev, 'daysLeft:', daysLeft);
  }, [licenseInfo]);

  // 获取最大指标体系数量（根据授权版本）
  const getMaxSystems = React.useCallback(() => {
    if (!licenseInfo || isDev) return Infinity; // 开发版无限制
    if (isTrial) return 2; // 试用版最多 2 个
    // 标准版最多 5 个，专业版无限制
    if (licenseInfo.type === 'standard') return 5;
    return Infinity;
  }, [licenseInfo, isTrial, isDev]);

  // 权限检查函数
  const hasPermission = React.useCallback((feature) => {
    if (!licenseInfo || isDev) return true;
    if (isTrial) {
      switch (feature) {
        case 'ai_decision': return false;
        case 'export': return false;
        case 'powerbi': return false;
        case 'add_node': return Object.keys(nodes).length < 30;
        default: return true;
      }
    }
    return true;
  }, [licenseInfo, nodes, isTrial, isDev]);

  // 获取禁用原因
  const getDisableReason = React.useCallback((feature) => {
    if (hasPermission(feature)) return null;
    switch (feature) {
      case 'ai_decision': return '试用版不支持 AI 决策功能，请升级专业版';
      case 'export': return '试用版不支持导出功能，请升级专业版';
      case 'powerbi': return '试用版不支持 PowerBI 连接，请升级专业版';
      case 'add_node': return `试用版最多支持 30 个节点（当前 ${Object.keys(nodes).length} 个），请升级专业版`;
      default: return '该功能在试用版中不可用';
    }
  }, [hasPermission, nodes]);

  // 节点数
  const nodeCount = Object.keys(nodes).length;

  // 计算最大层级
  const maxLevel = React.useMemo(() => {
    return Math.max(...Object.values(nodes).map(n => n.level || 1), 1);
  }, [nodes]);

  const [showEditor, setShowEditor] = useState(false);
  const [showDataImport, setShowDataImport] = useState(false);
  const [showPBIConnect, setShowPBIConnect] = useState(false);
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

    // 辅助函数：判断 key 的类型（支持新旧格式）
    const isActualKey = (key) => key.endsWith('-AC') || key.includes('实际');
    const isForecastKey = (key) => key.endsWith('-FC') || key.includes('预测');

    // 判断聚合方式：优先用节点显式指定的 aggregationType，否则根据 unit 判断
    let aggregationType = node.aggregationType;
    if (!aggregationType) {
      aggregationType = node.unit === '%' ? 'average' : 'sum';
    }
    const useAverage = aggregationType === 'average';

    // 批量收集所有调整，最后一次性提交（避免逐期重算导致卡顿）
    if (node.originalTimeData && node.initialBaseline && node.initialBaseline !== 0) {
      const batchAdjustments = [];

      if (useAverage) {
        // 平均模式：只调整预测数
        let originalActualSum = 0;
        let originalActualCount = 0;
        let originalForecastSum = 0;
        let originalForecastCount = 0;

        Object.entries(node.originalTimeData).forEach(([key, val]) => {
          const numVal = parseFloat(val);
          if (!isNaN(numVal)) {
            if (isActualKey(key)) {
              originalActualSum += numVal;
              originalActualCount++;
            }
            if (isForecastKey(key)) {
              originalForecastSum += numVal;
              originalForecastCount++;
            }
          }
        });

        const originalTotalCount = originalActualCount + originalForecastCount;

        const targetAvg = roundedValue;

        if (originalForecastCount > 0 && originalForecastSum !== 0) {
          const forecastSumNew = targetAvg * originalTotalCount - originalActualSum;
          const forecastRatio = forecastSumNew / originalForecastSum;

          Object.entries(node.originalTimeData).forEach(([key, val]) => {
            if (isForecastKey(key) && val !== undefined && val !== null) {
              const period = key.replace(/-FC$/, '');
              const originalVal = parseFloat(val);
              if (!isNaN(originalVal)) {
                const newVal = originalVal * forecastRatio;
                batchAdjustments.push({ nodeId, period, dataType: 'FC', value: Math.round(newVal * 100) / 100 });
              }
            }
          });
        }
      } else {
        // 加总模式：用差额分配到预测月份
        let originalActualTotal = 0;
        let originalForecastTotal = 0;
        Object.entries(node.originalTimeData).forEach(([key, val]) => {
          const numVal = parseFloat(val);
          if (!isNaN(numVal)) {
            if (isActualKey(key)) originalActualTotal += numVal;
            if (isForecastKey(key)) originalForecastTotal += numVal;
          }
        });

        const originalTotal = originalActualTotal + originalForecastTotal;
        const diffTotal = roundedValue - originalTotal;

        if (originalForecastTotal !== 0) {
          Object.entries(node.originalTimeData).forEach(([key, val]) => {
            if (isForecastKey(key) && val !== undefined && val !== null) {
              const numVal = parseFloat(val);
              if (!isNaN(numVal)) {
                const ratio = numVal / originalForecastTotal;
                const newValue = numVal + diffTotal * ratio;
                const period = key.replace(/-FC$/, '');
                batchAdjustments.push({ nodeId, period, dataType: 'FC', value: Math.round(newValue * 100) / 100 });
              }
            }
          });
        }
      }

      // 一次性提交所有调整，只触发一次重算和一次 React 渲染
      if (batchAdjustments.length > 0) {
        applyBatchAdjustmentsNew(batchAdjustments);
      }
    }

    // 2. 更新 node.value
    updateNode(nodeId, { value: roundedValue, ...extraUpdates });
  }, [nodes, updateNode, applyBatchAdjustmentsNew]);

  const handleUpdateMonthData = useCallback((nodeId, newTotal, monthEdits) => {
    const node = nodes[nodeId];
    if (!node || node.type !== 'driver') {
      console.warn('[handleUpdateMonthData] 节点不存在或不是驱动因子:', nodeId);
      return;
    }

    // 对新架构：逐期应用调整
    Object.entries(monthEdits).forEach(([key, value]) => {
      // 解析期间和数据类型（支持新旧格式）
      let period, dataType;
      if (key.includes('-')) {
        // 新格式：2026WK01-FC
        [period, dataType] = key.split('-');
      } else if (key.includes('预测')) {
        // 旧格式：2026WK01 预测
        period = key.replace(' 预测', '');
        dataType = 'FC';
      } else if (key.includes('实际')) {
        period = key.replace(' 实际', '');
        dataType = 'AC';
      } else {
        return;
      }

      // 只调整预测期（FC）
      if (dataType === 'FC') {
        const roundedValue = Math.round(value * 100) / 100;
        applyAdjustmentNew(nodeId, period, dataType, roundedValue);
      }
    });

    // 更新 node.value 为新计算的汇总值（newTotal 已按 aggregationType 正确计算）
    updateNode(nodeId, { value: Math.round(newTotal * 100) / 100 });
  }, [nodes, applyAdjustmentNew, updateNode]);

  const handleUpdateNodePosition = useCallback((id, position) => {
    updateNode(id, { position });
  }, [updateNode]);

  const handleResizeNode = useCallback((id, size) => {
    updateNode(id, { size });
  }, [updateNode]);

  const handleOpenEditor = useCallback((nodeId) => {
    // 试用版节点数限制（仅新建节点时检查）
    if (!nodeId && isTrial && nodeCount >= 30) {
      alert(getDisableReason('add_node'));
      return;
    }
    setEditingNode(nodeId ? nodes[nodeId] : null);
    setShowEditor(true);
  }, [nodes, isTrial, nodeCount, getDisableReason]);

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
    // 试用版层级限制
    if (isTrial && newNode.level > 3) {
      alert('试用版最多支持 3 层结构，请升级专业版');
      return;
    }

    console.log('🔥🔥 [handleSaveNode] 被调用！', {
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
      console.log('[handleSaveNode] ID 未变化，正常更新', {
        aggregationType: newNode.aggregationType
      });
      if (nodes[newNode.id]) {
        updateNode(newNode.id, newNode);
      } else {
        addNode(newNode);
      }
    }
    setShowEditor(false);
    setEditingNode(null);
  }, [nodes, editingNode, updateNode, addNode, deleteNode, isTrial]);

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

  // === 指标体系管理 ===
  const handleCreateSystem = useCallback((name) => {
    return saveSystem(name);
  }, [saveSystem]);

  const handleSwitchSystem = useCallback((systemId) => {
    const result = switchSystem(systemId);
    if (result.success) {
      setShowSystemModal(false);
    } else {
      alert(result.error);
    }
    return result;
  }, [switchSystem]);

  const handleDeleteSystem = useCallback((systemId) => {
    return deleteSystemAction(systemId);
  }, [deleteSystemAction]);

  const handleRenameSystem = useCallback((systemId, newName) => {
    return renameSystem(systemId, newName);
  }, [renameSystem]);

  const handleExportSystem = useCallback((systemId) => {
    return exportSystem(systemId);
  }, [exportSystem]);

  const handleImportSystem = useCallback((jsonData) => {
    return importSystem(jsonData);
  }, [importSystem]);

  // === 导出 JSON ===
  const handleExportJSON = useCallback(() => {
    const model = exportModel();
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AIDM-model-' + Date.now() + '.json';
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
    a.download = 'AIDM-data-' + Date.now() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes]);

  // === 导出数据表模板 ===
  const handleExportDataTemplate = useCallback(() => {
    // 生成18期滚动的期间列（当前年+下一年各6个月，共18期）
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    const periods = [];
    for (let i = 0; i < 18; i++) {
      const m = month + i;
      const y = year + Math.floor((m - 1) / 12);
      const mm = String(((m - 1) % 12) + 1).padStart(2, '0');
      periods.push(`${y}${mm}`);
    }

    const headers = ['指标ID', '指标名称', '属性', ...periods];
    const sampleRows = [
      ['yingyeshouru', '营业收入', 'AC', '1250000', '1380000', '1420000', '1560000', '1480000', '1620000', '1590000', '1710000', '', '', '', '', '', '', '', '', '', ''],
      ['yingyeshouru', '营业收入', 'FC', '', '', '', '', '', '', '', '', '1650000', '1750000', '1820000', '1900000', '1780000', '1850000', '1920000', '2000000', '1880000', '1950000'],
      ['yingyeshouru', '营业收入', 'BU', '1300000', '1450000', '1500000', '1650000', '1550000', '1700000', '1680000', '1800000', '1750000', '1850000', '1920000', '2000000', '1900000', '2000000', '2100000', '2200000', '2100000', '2200000'],
      ['yingyechengben', '营业成本', 'AC', '780000', '850000', '880000', '960000', '910000', '1000000', '980000', '1050000', '', '', '', '', '', '', '', '', '', ''],
      ['yingyechengben', '营业成本', 'FC', '', '', '', '', '', '', '', '', '1020000', '1080000', '1130000', '1180000', '1100000', '1150000', '1200000', '1250000', '1170000', '1220000'],
      ['yingyechengben', '营业成本', 'BU', '810000', '890000', '920000', '1010000', '950000', '1040000', '1020000', '1100000', '1080000', '1140000', '1190000', '1240000', '1170000', '1230000', '1280000', '1340000', '1260000', '1320000'],
    ];

    // 确保每行列数与 headers 一致
    const colCount = headers.length;
    const paddedRows = sampleRows.map(row => {
      while (row.length < colCount) row.push('');
      return row.slice(0, colCount);
    });

    const csvContent = [headers, ...paddedRows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AIDM-数据模板.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // === 导出公式表模板 ===
  const handleExportFormulaTemplate = useCallback(() => {
    const headers = ['指标ID', '指标名称', '节点类型', '公式', '最小值', '最大值', '单位', '显示格式', '指标方向', '层级', '汇总方式'];
    const sampleRows = [
      ['jinglirun', '净利润', 'computed', 'yingyelirun * 0.75', '', '', '元', '#,##0', 'auto', '1', 'sum'],
      ['yingyelirun', '营业利润', 'computed', 'maolirun - guanlifeiyong - xiaoshoufeiyong', '', '', '元', '#,##0', 'auto', '2', 'sum'],
      ['maolirun', '毛利润', 'computed', 'yingyeshouru - yingyechengben', '', '', '元', '#,##0', 'auto', '3.1', 'sum'],
      ['guanlifeiyong', '管理费用', 'driver', '', '1063000', '2700000', '元', '#,##0', 'negative', '3.2', 'sum'],
      ['xiaoshoufeiyong', '销售费用', 'driver', '', '1705000', '4600000', '元', '#,##0', 'negative', '3.3', 'sum'],
      ['yingyeshouru', '营业收入', 'driver', '', '12510000', '32000000', '元', '#,##0', 'auto', '4.1', 'sum'],
      ['yingyechengben', '营业成本', 'driver', '', '7760000', '20000000', '元', '#,##0', 'negative', '4.2', 'sum'],
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
    a.download = 'AIDM-公式模板.csv';
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

  const handleLoadSample = useCallback((type) => {
    const model = type === 'sales' ? sampleSalesModel : sampleProfitModel;
    importModel(model);
  }, [importModel]);

  // 处理 CSV 导入（支持追加/覆盖模式）- 使用新架构
  const handleCSVImport = useCallback(async ({ dataFile, formulaFile, mode = 'replace' }) => {
    const state = useVDTStore.getState();

    // 使用新架构导入
    if (state.loadFromCSVNew && dataFile) {
      try {
        const dataText = await dataFile.text();
        const formulaText = formulaFile ? await formulaFile.text() : null;
        state.loadFromCSVNew(dataText, formulaText);
        return;
      } catch (error) {
        console.error('新架构导入失败:', error);
      }
    }

    // 回退到旧方法
    if (state.importModel) {
      // 旧方法需要 nodes 对象，这里简化处理
      console.log('[handleCSVImport] 回退到旧方法');
    }
  }, []);

  // PBI 刷新处理
  const pbiConfig = useVDTStore(s => s.pbiConfig);
  const refreshFromPowerBI = useVDTStore(s => s.refreshFromPowerBI);
  const loadFromPowerBINew = useVDTStore(s => s.loadFromPowerBINew);
  const setPbiConfig = useVDTStore(s => s.setPbiConfig);

  const handleRefreshPBI = useCallback(async () => {
    if (!pbiConfig) return;

    const mode = window.confirm(
      '选择刷新模式：\n\n' +
      '点击「确定」→ 仅更新数据值（保留公式和调整）\n' +
      '点击「取消」→ 完全重新导入（清空现有模型）'
    );

    try {
      const connector = new PowerBIDesktopConnector();
      const available = await connector.checkAvailability();
      if (!available.available) {
        alert('代理服务未运行，请先启动 pbi-proxy.exe');
        return;
      }

      await connector.connect({ port: pbiConfig.port });
      const nodesMap = await connector.fetchData(pbiConfig.mapping);

      if (mode) {
        // 仅更新数据值
        const result = refreshFromPowerBI(nodesMap);
        setPbiConfig({ ...pbiConfig, lastRefresh: Date.now() });
        alert(`刷新完成！更新了 ${result.updatedCount} 个节点的数据`);
      } else {
        // 完全重新导入
        const result = loadFromPowerBINew(nodesMap);
        setPbiConfig({ ...pbiConfig, lastRefresh: Date.now() });
        alert(`重新导入完成！加载了 ${result.nodeCount} 个节点`);
      }
    } catch (e) {
      alert('刷新失败: ' + e.message);
    }
  }, [pbiConfig, refreshFromPowerBI, loadFromPowerBINew, setPbiConfig]);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 授权面板/版权信息 - 试用版想升级或查看版权时显示 */}
      {(showLicensePanel || showCopyrightInfo) && (
        <LicensePanel
          onClose={() => { setShowLicensePanel(false); setShowCopyrightInfo(false); }}
          onLicenseValid={handleLicenseValid}
          showCopyright={showCopyrightInfo}
        />
      )}

      {/* 指标体系管理面板 */}
      {showSystemModal && (
        <SystemModal
          systems={systems}
          currentSystemId={storeCurrentSystemId}
          onClose={() => setShowSystemModal(false)}
          onCreateSystem={handleCreateSystem}
          onSwitchSystem={handleSwitchSystem}
          onDeleteSystem={handleDeleteSystem}
          onRenameSystem={handleRenameSystem}
          onExportSystem={handleExportSystem}
          onImportSystem={handleImportSystem}
          maxSystems={getMaxSystems()}
          licenseType={licenseInfo?.type || (isDev ? 'dev' : isTrial ? 'trial' : 'unknown')}
        />
      )}

      {/* 主应用 - 授权有效时显示 */}
      {licenseValid && (
      <>
      <Toolbar
        onOpenEditor={handleOpenEditor}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onExportImage={handleExportImage}
        onExportDataTemplate={handleExportDataTemplate}
        onExportFormulaTemplate={handleExportFormulaTemplate}
        onLoadSample={handleLoadSample}
        onOpenCSVImport={() => setShowDataImport(true)}
        onOpenPBIConnect={() => setShowPBIConnect(true)}
        onRefreshPBI={handleRefreshPBI}
        pbiConfig={pbiConfig}
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
        showAliasPanel={showAliasPanel}
        licenseInfo={licenseInfo}
        hasPermission={hasPermission}
        getDisableReason={getDisableReason}
        isTrial={isTrial}
        isDev={isDev}
        daysLeft={daysLeft}
        nodeCount={nodeCount}
        maxLevel={maxLevel}
        // 指标体系管理
        systems={systems}
        currentSystemId={storeCurrentSystemId}
        onOpenSystemManager={() => setShowSystemModal(true)}
      />

      {/* 缩放控制栏 */}
      <div className="bg-white border-b border-gray-200 px-4 py-1.5 flex items-center justify-between" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">画布缩放:</span>
          <button
            onClick={handleZoomOut}
            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-sm"
            title="缩小"
          >
            −
          </button>
          <span className="text-sm font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={handleZoomIn}
            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-sm"
            title="放大"
          >
            +
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-sm"
            title="重置"
          >
            100%
          </button>
          <span className="text-xs text-gray-400 ml-2">Ctrl + 滚轮</span>
          {/* 授权菜单 - 所有授权类型都显示 */}
          {(licenseInfo && licenseInfo.valid) && (
            <div className="relative ml-3">
              <button
                onClick={() => setShowAuthDropdown(!showAuthDropdown)}
                className="px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded hover:bg-blue-200 transition-colors flex items-center gap-1"
              >
                {isTrial ? '🔑 试用版' : licenseInfo.type === 'pro' ? '🔑 专业版' : licenseInfo.type === 'standard' ? '🔑 标准版' : '🔑 授权'} <span className="text-xs">{showAuthDropdown ? '▲' : '▼'}</span>
              </button>
              {showAuthDropdown && (
                <div>
                  <div className="fixed inset-0 z-[9998]" onClick={() => setShowAuthDropdown(false)} />
                  <div className="absolute top-full left-0 pt-1 min-w-36 z-[9999]">
                    <div className="bg-white border rounded-lg shadow-lg py-1">
                      {/* 授权状态信息 */}
                      <div className="px-4 py-2 text-xs border-b border-gray-100">
                        <div className="font-medium text-gray-700">授权状态</div>
                        <div className="text-gray-500 mt-1">类型: {licenseInfo.type === 'trial' ? '试用版' : licenseInfo.type === 'pro' ? '专业版' : licenseInfo.type === 'standard' ? '标准版' : licenseInfo.type}</div>
                        <div className="text-gray-500">到期: {new Date(licenseInfo.expiresAt).toLocaleDateString('zh-CN')}</div>
                        <div className="text-gray-500">剩余: {licenseInfo.daysLeft} 天</div>
                      </div>
                      <button
                        onClick={() => { setShowCopyrightInfo(true); setShowAuthDropdown(false); }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-2"
                      >
                        <span>©️</span> 版权信息
                      </button>
                      {isTrial && (
                        <button
                          onClick={() => { handleOpenLicensePanel(); setShowAuthDropdown(false); }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-orange-600 flex items-center gap-2"
                        >
                          <span>⬆️</span> 升级专业版
                        </button>
                      )}
                      <button
                        onClick={() => { handleOpenLicensePanel(); setShowAuthDropdown(false); }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-blue-600 flex items-center gap-2"
                      >
                        <span>🔑</span> 管理授权
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* 统计信息 */}
        <div className="flex items-center gap-3 text-xs overflow-x-auto" style={{ maxWidth: '40%', flexShrink: 0 }}>
          {(() => {
            const allNodes = Object.values(nodes);
            const total = allNodes.length;
            const computed = allNodes.filter(n => n.type === 'computed').length;
            const drivers = allNodes.filter(n => n.type === 'driver').length;
            const changedComputed = allNodes.filter(n => n.type === 'computed' && n.value !== n.initialBaseline && n.initialBaseline !== null && n.initialBaseline !== undefined).length;
            const changedDrivers = allNodes.filter(n => n.type === 'driver' && n.value !== n.initialBaseline && n.initialBaseline !== null && n.initialBaseline !== undefined).length;
            const describedDrivers = allNodes.filter(n => n.type === 'driver' && n.adjustmentDescription && n.adjustmentDescription.trim() !== '').length;
            return (
              <>
                <span className="text-gray-600 flex items-center gap-1 shrink-0">
                  <span>总数</span><span className="font-semibold text-gray-800">{total}</span>
                </span>
                <span className="text-gray-600 flex items-center gap-1 shrink-0">
                  <span>计算</span><span className="font-semibold text-blue-600">{computed}</span>
                </span>
                <span className="text-gray-600 flex items-center gap-1 shrink-0">
                  <span>驱动</span><span className="font-semibold text-green-600">{drivers}</span>
                </span>
                {changedComputed > 0 && (
                  <span className="text-orange-600 flex items-center gap-1 shrink-0">
                    <span>变更计算</span><span className="font-semibold">{changedComputed}</span>
                  </span>
                )}
                {changedDrivers > 0 && (
                  <span className="text-orange-600 flex items-center gap-1 shrink-0">
                    <span>变更驱动</span><span className="font-semibold">{changedDrivers}</span>
                  </span>
                )}
                {describedDrivers > 0 && (
                  <span className="text-purple-600 flex items-center gap-1 shrink-0">
                    <span>描述</span><span className="font-semibold">{describedDrivers}</span>
                  </span>
                )}
              </>
            );
          })()}
        </div>
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
            canExport={canExport}
            isTrial={isTrial}
            getDisableReason={getDisableReason}
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

      {showPBIConnect && (
        <PowerBIConnectModal
          onClose={() => setShowPBIConnect(false)}
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
            canExport={canExport}
            isTrial={isTrial}
            getDisableReason={getDisableReason}
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
            canExport={canExport}
            isTrial={isTrial}
            getDisableReason={getDisableReason}
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
            canExport={canExport}
            isTrial={isTrial}
            getDisableReason={getDisableReason}
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
            canExport={canExport}
            isTrial={isTrial}
            getDisableReason={getDisableReason}
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
            canExport={canExport}
            isTrial={isTrial}
            getDisableReason={getDisableReason}
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
            canExport={canExport}
            getDisableReason={getDisableReason}
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
            canExport={canExport}
            getDisableReason={getDisableReason}
            getAdjustments={getAdjustmentsNew}
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

      {/* 试用版状态提示条 - 固定在屏幕底部 */}
      {isTrial && !isDev && (
        <div className="fixed bottom-0 left-0 right-0 bg-yellow-50 border-t border-yellow-200 px-4 py-1.5 flex items-center justify-between text-xs text-yellow-800 z-[999]">
          <span>
            试用版 | 剩余 {daysLeft} 天 | 节点 {nodeCount}/30 | 最大层级 {maxLevel}/3 | 方案 {Object.keys(scenarios).length}/2 | 指标体系 {Object.keys(systems).length}/2
          </span>
          <span className="text-yellow-600">
            AI决策 · 导出 · PowerBI · 多指标体系 功能已禁用
          </span>
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default App;
