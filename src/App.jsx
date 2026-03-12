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
      aiTuningZIndex
    ];
  }, [dataPanelZIndex, scenarioCompareZIndex, sensitivityAnalysisZIndex, formulaEditorZIndex, nodeEditorZIndex, nodeTreeListZIndex, stdDevAnalysisZIndex, trendChartZIndex, waterfallChartZIndex, aiConfigZIndex, aiTuningZIndex]);

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
  const handleUpdateNode = useCallback((id, value) => {
    const node = nodes[id];
    if (!node || node.type !== 'driver') return;

    // 确保 value 是两位小数 - 用整数法避免精度问题
    const roundedValue = Math.round(value * 100) / 100;

    // 如果有 originalTimeData，只调整预测数，不改变实际数
    const updates = { value: roundedValue };

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

  const handleSaveNode = useCallback((newNode) => {
    if (nodes[newNode.id]) {
      updateNode(newNode.id, newNode);
    } else {
      addNode(newNode);
    }
    setShowEditor(false);
  }, [nodes, updateNode, addNode]);

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm('确定要将所有驱动因子重置到初始值吗？')) {
                resetAllDrivers();
              }
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

      {/* AI调参面板 */}
      {showAITuning && (
        <div style={{ zIndex: aiTuningZIndex, position: 'relative' }} onClick={bringAITuningToFront}>
          <AITuningPanel
            onClose={() => setShowAITuning(false)}
            onBringToFront={bringAITuningToFront}
          />
        </div>
      )}
    </div>
  );
}

export default App;
