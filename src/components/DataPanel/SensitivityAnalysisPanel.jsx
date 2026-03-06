import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { formatValue, aggregateTimeData, isPositiveIndicator } from '../../utils/formatters';
import { FormulaParser } from '../../engine/FormulaParser';
import { Calculator } from '../../engine/Calculator';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

// ========== 可搜索下拉组件 ==========
const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder = '请选择...',
  searchPlaceholder = '搜索...',
  optionLabelKey = 'name',
  optionValueKey = 'id',
  className = '',
  minWidth = 'min-w-48'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // 过滤选项
  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) return options;
    const lowerSearch = searchText.toLowerCase();
    return options.filter(opt => {
      const label = typeof opt === 'object' ? opt[optionLabelKey] : opt;
      return String(label).toLowerCase().includes(lowerSearch);
    });
  }, [options, searchText, optionLabelKey]);

  // 获取当前选中的标签
  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const selected = options.find(opt => {
      const optValue = typeof opt === 'object' ? opt[optionValueKey] : opt;
      return optValue === value;
    });
    return selected ? (typeof selected === 'object' ? selected[optionLabelKey] : selected) : '';
  }, [options, value, optionLabelKey, optionValueKey]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchText('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* 选择框 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 border rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 ${minWidth} text-left flex items-center justify-between`}
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>
          {selectedLabel || placeholder}
        </span>
        <span className="ml-2 text-gray-400">▼</span>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b">
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                  setSearchText('');
                }
              }}
            />
          </div>

          {/* 选项列表 */}
          <div className="max-h-60 overflow-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const optValue = typeof opt === 'object' ? opt[optionValueKey] : opt;
                const optLabel = typeof opt === 'object' ? opt[optionLabelKey] : opt;
                const isSelected = optValue === value;
                return (
                  <button
                    key={optValue || idx}
                    type="button"
                    onClick={() => {
                      onChange(optValue);
                      setIsOpen(false);
                      setSearchText('');
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-orange-50 transition-colors ${isSelected ? 'bg-orange-100 text-orange-800' : 'text-gray-700'}`}
                  >
                    {optLabel}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                无匹配选项
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ========== 以下函数复制自 useVDTStore.js，确保计算逻辑一致 ==========

/**
 * 聚合月度值（与 useVDTStore.js 中的 aggregateMonthlyValues 一致）
 */
function aggregateMonthlyValues(values, aggregationType) {
  const validNumbers = values.filter(v => {
    const num = parseFloat(v);
    return !isNaN(num) && isFinite(num);
  }).map(v => parseFloat(v));

  switch (aggregationType.toUpperCase()) {
    case 'SUM':
      return validNumbers.reduce((a, b) => a + b, 0);
    case 'AVG':
    case 'AVERAGE':
      return validNumbers.length > 0
        ? validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length
        : 0;
    case 'MIN':
      return validNumbers.length > 0 ? Math.min(...validNumbers) : 0;
    case 'MAX':
      return validNumbers.length > 0 ? Math.max(...validNumbers) : 0;
    case 'COUNT':
      return validNumbers.length;
    case 'COUNT_NONZERO':
      return validNumbers.filter(v => v !== 0).length;
    case 'COUNT_EXISTS':
      return values.length;
    case 'DISTINCT':
      return new Set(validNumbers).size;
    default:
      return validNumbers.reduce((a, b) => a + b, 0);
  }
}

/**
 * 计算某个 MONTHLY 节点在指定月份的值（与 useVDTStore.js 一致）
 */
function calculateSingleMonthValueForMonthlyNode(monthlyNode, allNodes, allNodeIds, monthKey) {
  const detected = FormulaParser.detectMonthlyFunction(monthlyNode.formula);
  if (!detected) return monthlyNode.initialBaseline ?? monthlyNode.baseline ?? monthlyNode.value ?? 0;

  const innerDeps = FormulaParser.extractDependencies(detected.inner, allNodeIds);
  const innerCompileFn = FormulaParser.compile(detected.inner, allNodeIds);

  try {
    const monthValues = {};
    innerDeps.forEach(depId => {
      const depNode = allNodes[depId];
      if (depNode) {
        if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
          monthValues[depId] = calculateSingleMonthValueForMonthlyNode(depNode, allNodes, allNodeIds, monthKey);
        } else if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
          monthValues[depId] = depNode.timeData[monthKey];
        } else {
          monthValues[depId] = depNode.baseline ?? depNode.value ?? 0;
        }
      }
    });
    let innerValue = innerCompileFn(monthValues);

    const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(monthlyNode.formula);
    if (formulaWithPlaceholder !== placeholder) {
      try {
        const outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
        innerValue = outerCompileFn({ [placeholder]: innerValue });
      } catch (e) {
        // 忽略外层公式错误
      }
    }

    return innerValue;
  } catch (e) {
    return monthlyNode.initialBaseline ?? monthlyNode.baseline ?? monthlyNode.value ?? 0;
  }
}

/**
 * 计算带有 MONTHLY_* 函数的节点值（与 useVDTStore.js 中的 calculateMonthlyValue 一致）
 */
function calculateMonthlyValue(node, nodes, allNodeIds) {
  if (node.type === 'driver' || !node.formula) {
    return null;
  }

  if (!FormulaParser.hasMonthlyFunction(node.formula)) {
    return null;
  }

  const {
    formula: formulaWithPlaceholder,
    placeholder,
    inner: innerFormula,
    type: aggregationType
  } = FormulaParser.replaceMonthlyWithPlaceholder(node.formula);

  if (!innerFormula || !placeholder) {
    return null;
  }

  const innerDeps = FormulaParser.extractDependencies(innerFormula, allNodeIds);
  const monthKeys = new Set();
  innerDeps.forEach(depId => {
    const depNode = nodes[depId];
    if (depNode && depNode.timeData) {
      Object.keys(depNode.timeData).forEach(key => {
        if (!key.includes('目标')) {
          monthKeys.add(key);
        }
      });
    }
  });

  const innerCompileFn = FormulaParser.compile(innerFormula, allNodeIds);
  const timeData = {};
  const monthValuesArray = [];

  const hasOuterFormula = formulaWithPlaceholder !== placeholder;
  let outerCompileFn = null;
  if (hasOuterFormula) {
    try {
      outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
    } catch (e) {
      // 忽略外层公式编译错误
    }
  }

  monthKeys.forEach(monthKey => {
    try {
      const monthValues = {};
      innerDeps.forEach(depId => {
        const depNode = nodes[depId];
        if (depNode) {
          if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
            if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
              monthValues[depId] = depNode.timeData[monthKey];
            } else {
              monthValues[depId] = depNode.value ?? 0;
            }
          } else if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
            monthValues[depId] = depNode.timeData[monthKey];
          } else {
            monthValues[depId] = depNode.value ?? 0;
          }
        }
      });
      let monthValue = innerCompileFn(monthValues);

      if (hasOuterFormula && outerCompileFn) {
        try {
          monthValue = outerCompileFn({ [placeholder]: monthValue });
        } catch (e) {
          // 忽略外层公式错误
        }
      }

      timeData[monthKey] = monthValue;
      monthValuesArray.push(monthValue);
    } catch (e) {
      // 忽略计算失败的月份
    }
  });

  const innerTimeData = {};
  const innerMonthValuesArray = [];

  monthKeys.forEach(monthKey => {
    try {
      const monthValues = {};
      innerDeps.forEach(depId => {
        const depNode = nodes[depId];
        if (depNode) {
          if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
            if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
              monthValues[depId] = depNode.timeData[monthKey];
            } else {
              monthValues[depId] = depNode.value ?? 0;
            }
          } else if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
            monthValues[depId] = depNode.timeData[monthKey];
          } else {
            monthValues[depId] = depNode.value ?? 0;
          }
        }
      });
      const monthValue = innerCompileFn(monthValues);
      innerTimeData[monthKey] = monthValue;
      innerMonthValuesArray.push(monthValue);
    } catch (e) {
      // 忽略
    }
  });

  const innerAggregatedValue = aggregateMonthlyValues(innerMonthValuesArray, aggregationType);

  let finalValue = innerAggregatedValue;
  if (hasOuterFormula && outerCompileFn) {
    try {
      finalValue = outerCompileFn({ [placeholder]: innerAggregatedValue });
    } catch (e) {
      finalValue = innerAggregatedValue;
    }
  }

  return { total: isNaN(finalValue) ? 0 : finalValue, timeData };
}

const SensitivityAnalysisPanel = ({
  nodes,
  scenarios,
  currentScenarioId,
  onClose,
  isMinimized,
  onToggleMinimize,
  onBringToFront
}) => {
  // 导出图片处理函数
  const handleExportImage = useCallback(async () => {
    try {
      const element = document.getElementById('sensitivity-chart-container');
      if (!element) {
        throw new Error('未找到图表元素');
      }

      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });

      const targetName = nodes && selectedTargetNodeId && nodes[selectedTargetNodeId]
        ? nodes[selectedTargetNodeId].name
        : 'target';
      const safeName = String(targetName).replace(/[\\/:*?"<>|]/g, '_');

      const link = document.createElement('a');
      link.download = `敏感性分析_${safeName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      return true;
    } catch (error) {
      console.error('导出图片失败:', error);
      alert('导出图片失败，请重试');
      return false;
    }
  }, [nodes]);
  const [panelPosition, setPanelPosition] = useState({ x: 150, y: 100 });
  const [panelSize, setPanelSize] = useState({ width: 1500, height: 850 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [prevPanelState, setPrevPanelState] = useState(null);

  const [selectedTargetNodeId, setSelectedTargetNodeId] = useState(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState(currentScenarioId);
  const [variationPercent, setVariationPercent] = useState(10); // 默认变动 10%
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'monthly' | 'chart'
  const [selectedChartDriverId, setSelectedChartDriverId] = useState(null); // 当前选中的图表驱动因子

  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelStartPos = useRef({ x: 0, y: 0 });
  const panelStartSize = useRef({ width: 0, height: 0 });

  // 获取所有计算指标作为可选目标
  const targetNodes = useMemo(() => {
    return Object.values(nodes).filter(n => n.type === 'computed').sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes]);

  // 初始化选中第一个计算指标
  useEffect(() => {
    if (targetNodes.length > 0 && !selectedTargetNodeId) {
      setSelectedTargetNodeId(targetNodes[0].id);
    }
  }, [targetNodes, selectedTargetNodeId]);

  // 同步当前方案
  useEffect(() => {
    setSelectedScenarioId(currentScenarioId);
  }, [currentScenarioId]);

  // 获取指定场景的节点
  // 注意：对于当前场景，直接返回当前的 nodes（反映实时调整）
  const getScenarioNodes = useCallback((scenarioId) => {
    // 如果是当前场景，直接返回当前的 nodes（已经包含用户的调整）
    if (scenarioId === currentScenarioId) {
      return nodes;
    }
    // 否则返回方案中保存的节点
    const scenario = scenarios[scenarioId];
    if (!scenario) return nodes;
    return scenario.nodes || nodes;
  }, [scenarios, nodes, currentScenarioId]);

  // 找到目标节点的所有上游驱动因子（递归）
  const findAllDriverDependencies = useCallback((targetNodeId, nodeMap) => {
    const drivers = new Set();
    const visited = new Set();
    const allNodeIds = Object.keys(nodeMap);

    // 先构建一个完整的节点Map，确保所有计算指标都有 dependsOn
    const enrichedNodeMap = {};
    allNodeIds.forEach(id => {
      const node = nodeMap[id];
      if (node) {
        if (node.type !== 'driver') {
          // 确保计算指标有 dependsOn
          let deps = node.dependsOn || [];
          if (deps.length === 0 && node.formula) {
            deps = FormulaParser.extractDependencies(node.formula, allNodeIds);
          }
          enrichedNodeMap[id] = { ...node, dependsOn: deps };
        } else {
          enrichedNodeMap[id] = node;
        }
      }
    });

    const traverse = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = enrichedNodeMap[nodeId];
      if (!node) return;

      if (node.type === 'driver') {
        drivers.add(nodeId);
        return;
      }

      // 计算指标，继续遍历其依赖
      let deps = node.dependsOn || [];
      if (deps.length === 0 && node.formula) {
        deps = FormulaParser.extractDependencies(node.formula, allNodeIds);
      }
      deps.forEach(depId => {
        if (enrichedNodeMap[depId]) {
          traverse(depId);
        }
      });
    };

    traverse(targetNodeId);
    return Array.from(drivers);
  }, []);

  // 计算节点的汇总值（考虑 aggregationType）
  const calculateNodeTotal = useCallback((node, timeDataOverride = null) => {
    if (!node) return 0;
    const timeData = timeDataOverride || node.timeData;
    if (node.type === 'driver' && timeData) {
      let aggType = node.aggregationType;
      if (!aggType) {
        aggType = node.unit === '%' ? 'average' : 'sum';
      }
      const aggregated = aggregateTimeData(timeData, aggType);
      return aggregated.actualPlusForecastTotal ?? node.value ?? 0;
    }
    return node.value ?? 0;
  }, []);

  // 简单直接的：复制节点，并把某个驱动因子调整 variationPercent
  const adjustSingleDriver = useCallback((baseNodes, driverId, multiplier) => {
    const modifiedNodes = {};
    Object.keys(baseNodes).forEach(id => {
      modifiedNodes[id] = { ...baseNodes[id] };
      if (id === driverId && modifiedNodes[id].timeData) {
        const newTimeData = { ...modifiedNodes[id].timeData };
        Object.keys(newTimeData).forEach(key => {
          if (!key.includes('目标') && newTimeData[key] !== undefined && newTimeData[key] !== null && !isNaN(newTimeData[key])) {
            newTimeData[key] = newTimeData[key] * multiplier;
          }
        });
        modifiedNodes[id].timeData = newTimeData;
        modifiedNodes[id].value = (modifiedNodes[id].value ?? 0) * multiplier;
      }
    });
    return modifiedNodes;
  }, []);

  // 计算完整的节点值和 timeData（与 useVDTStore.js 的 _recalculate 逻辑一致）
  const calculateCompleteNodes = useCallback((inputNodes) => {
    const allNodeIds = Object.keys(inputNodes);
    const newNodes = {};

    // === 步骤 1: 先复制所有节点，更新 dependsOn ===
    allNodeIds.forEach((id) => {
      const node = inputNodes[id];
      if (node.type !== 'driver') {
        const deps = FormulaParser.extractDependencies(node.formula || '', allNodeIds);
        newNodes[id] = { ...node, dependsOn: deps };
      } else {
        newNodes[id] = { ...node };
      }
    });

    // === 步骤 2: 拓扑排序，确定计算顺序 ===
    const inDegree = {};
    const adjacency = {};
    allNodeIds.forEach(id => {
      inDegree[id] = 0;
      adjacency[id] = [];
    });
    allNodeIds.forEach(id => {
      const node = newNodes[id];
      if (node.type === 'driver') return;
      const deps = node.dependsOn || [];
      deps.forEach(depId => {
        if (adjacency[depId]) {
          adjacency[depId].push(id);
          inDegree[id]++;
        }
      });
    });

    const queue = [];
    const order = [];
    allNodeIds.forEach(id => {
      if (inDegree[id] === 0) queue.push(id);
    });
    while (queue.length > 0) {
      const nodeId = queue.shift();
      order.push(nodeId);
      adjacency[nodeId].forEach(nextId => {
        inDegree[nextId]--;
        if (inDegree[nextId] === 0) queue.push(nextId);
      });
    }

    // === 步骤 3: 先按 aggregationType 更新所有驱动因子的 value ===
    allNodeIds.forEach(id => {
      const node = newNodes[id];
      if (node.type === 'driver' && node.timeData) {
        let aggType = node.aggregationType;
        if (!aggType) {
          aggType = node.unit === '%' ? 'average' : 'sum';
        }
        const aggregated = aggregateTimeData(node.timeData, aggType);
        newNodes[id] = { ...node, value: aggregated.actualPlusForecastTotal };
      }
    });

    // === 步骤 4: 计算所有节点的 value（非 timeData）===
    const calculator = new Calculator();
    calculator.buildFromNodes(newNodes);
    const calculatorValues = calculator.computeAll(newNodes);

    const nodeValues = {};
    allNodeIds.forEach(id => {
      const node = newNodes[id];
      if (node.type === 'driver') {
        nodeValues[id] = node.value ?? 0;
      } else {
        nodeValues[id] = calculatorValues[id] ?? 0;
      }
    });

    // === 步骤 5: 按拓扑顺序计算所有节点的 timeData ===
    order.forEach(nodeId => {
      const node = newNodes[nodeId];
      if (!node || node.type === 'driver') return;
      if (FormulaParser.hasMonthlyFunction(node.formula)) return;

      const deps = node.dependsOn || [];
      const monthKeys = new Set();

      deps.forEach(depId => {
        const depNode = newNodes[depId];
        if (depNode && depNode.timeData) {
          Object.keys(depNode.timeData).forEach(key => monthKeys.add(key));
        }
      });

      const compileFn = FormulaParser.compile(node.formula, allNodeIds);
      const timeData = {};

      monthKeys.forEach(monthKey => {
        try {
          const monthValues = {};
          deps.forEach(depId => {
            const depNode = newNodes[depId];
            if (depNode) {
              if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
                monthValues[depId] = depNode.timeData[monthKey];
              } else {
                monthValues[depId] = nodeValues[depId] ?? 0;
              }
            }
          });
          timeData[monthKey] = compileFn(monthValues);
        } catch (e) {
          // 忽略
        }
      });

      newNodes[nodeId] = { ...node, timeData };
    });

    // === 步骤 6: 计算 MONTHLY 节点的 timeData 和 value ===
    order.forEach(nodeId => {
      const node = newNodes[nodeId];
      if (!node || node.type === 'driver') return;
      if (!FormulaParser.hasMonthlyFunction(node.formula)) return;

      const result = calculateMonthlyValue(node, newNodes, allNodeIds);
      if (result) {
        newNodes[nodeId] = { ...node, value: result.total, timeData: result.timeData };
        nodeValues[nodeId] = result.total;
      }
    });

    // === 步骤 7: 重新计算所有节点的最终 value ===
    order.forEach(nodeId => {
      const node = newNodes[nodeId];
      if (!node || node.type === 'driver') return;
      if (FormulaParser.hasMonthlyFunction(node.formula)) return;

      const compileFn = FormulaParser.compile(node.formula, allNodeIds);
      try {
        const newValue = compileFn(nodeValues);
        nodeValues[nodeId] = isNaN(newValue) ? 0 : newValue;
        newNodes[nodeId].value = nodeValues[nodeId];
      } catch (e) {
        // 忽略
      }
    });

    return { nodes: newNodes, nodeValues, order };
  }, []);

  // 计算单个场景下的敏感性
  const calculateSensitivityForScenario = useCallback((scenarioNodes, targetNodeId, driverIds) => {
    const allNodeIds = Object.keys(scenarioNodes);

    // 先计算完整的基准状态（包含正确的 value 和 timeData）
    const { nodes: baseNodesWithTimeData, nodeValues: baseNodeValues } = calculateCompleteNodes(scenarioNodes);
    const targetBaseValue = baseNodeValues[targetNodeId] ?? 0;

    // 变动幅度
    const multiplierUp = 1 + variationPercent / 100;
    const multiplierDown = 1 - variationPercent / 100;

    // 对每个驱动因子计算敏感性
    const results = driverIds.map(driverId => {
      const driverNode = baseNodesWithTimeData[driverId];
      if (!driverNode) return null;

      const driverBaseValue = calculateNodeTotal(driverNode);

      // ========== 关键修复：用两个方向的变动来确定正确的因果关系 ==========
      // 问题：当目标值为负数时，单方向的百分比计算会导致符号反转
      // 解决方案：
      // 1. 同时计算"驱动增加"和"驱动减少"两种情况
      // 2. 根据这两种情况来判断"驱动与目标的因果关系方向"
      // 3. 用更稳定的方式计算敏感性系数大小

      // 计算两种情况
      const modifiedNodesUp = adjustSingleDriver(baseNodesWithTimeData, driverId, multiplierUp);
      const { nodeValues: modifiedValuesUp } = calculateCompleteNodes(modifiedNodesUp);
      const targetValueUp = modifiedValuesUp[targetNodeId] ?? 0;

      const modifiedNodesDown = adjustSingleDriver(baseNodesWithTimeData, driverId, multiplierDown);
      const { nodeValues: modifiedValuesDown } = calculateCompleteNodes(modifiedNodesDown);
      const targetValueDown = modifiedValuesDown[targetNodeId] ?? 0;

      // ========== 步骤1：确定因果关系方向（这个是稳定的） ==========
      // 判断逻辑：
      // - 驱动增加时目标也增加，且驱动减少时目标也减少 → 正相关
      // - 驱动增加时目标减少，且驱动减少时目标也增加 → 负相关
      const driverUpTargetUp = targetValueUp > targetBaseValue;
      const driverDownTargetDown = targetValueDown < targetBaseValue;
      const driverUpTargetDown = targetValueUp < targetBaseValue;
      const driverDownTargetUp = targetValueDown > targetBaseValue;

      // 确定方向
      let isPositiveRelationship = true; // 默认正相关
      if ((driverUpTargetUp && driverDownTargetDown) ||
          (targetValueUp === targetBaseValue && driverDownTargetDown) ||
          (driverUpTargetUp && targetValueDown === targetBaseValue)) {
        isPositiveRelationship = true;
      } else if ((driverUpTargetDown && driverDownTargetUp) ||
                 (targetValueUp === targetBaseValue && driverDownTargetUp) ||
                 (driverUpTargetDown && targetValueDown === targetBaseValue)) {
        isPositiveRelationship = false;
      } else {
        // 如果方向判断不明确，用变动量更大的那个方向来判断
        const changeUp = Math.abs(targetValueUp - targetBaseValue);
        const changeDown = Math.abs(targetValueDown - targetBaseValue);
        if (changeUp >= changeDown) {
          isPositiveRelationship = targetValueUp >= targetBaseValue;
        } else {
          isPositiveRelationship = targetValueDown <= targetBaseValue;
        }
      }

      // ========== 步骤2：计算敏感性系数大小 ==========
      // 用"驱动增加"的情况来计算，但用上面判断的方向来修正符号
      let sensitivity = 0;
      const targetChangeAmount = targetValueUp - targetBaseValue;

      if (driverBaseValue !== 0 && targetBaseValue !== 0 && targetBaseValue !== null && targetBaseValue !== undefined) {
        // 计算简单敏感性系数
        const changePercent = (targetChangeAmount / targetBaseValue) * 100;
        const simpleSensitivity = changePercent / variationPercent;

        // 关键：如果简单计算的符号与我们判断的方向不一致，
        // 说明目标值是负数导致的符号反转，取绝对值并修正符号
        if ((simpleSensitivity >= 0 && isPositiveRelationship) ||
            (simpleSensitivity < 0 && !isPositiveRelationship)) {
          // 符号一致，直接用
          sensitivity = simpleSensitivity;
        } else {
          // 符号不一致，说明目标值是负数，取绝对值并用我们判断的方向
          sensitivity = Math.abs(simpleSensitivity) * (isPositiveRelationship ? 1 : -1);
        }
      } else if (driverBaseValue !== 0) {
        // 目标值为0的情况，用绝对变动来估算
        const driverChange = driverBaseValue * variationPercent / 100;
        if (driverChange !== 0) {
          sensitivity = (targetChangeAmount / driverChange) * (isPositiveRelationship ? 1 : -1);
        }
      }

      // ========== 分月敏感性计算 ==========
      const monthlySensitivity = {};
      const baseTargetNode = baseNodesWithTimeData[targetNodeId];
      const { nodes: modifiedNodesWithTimeDataUp } = calculateCompleteNodes(modifiedNodesUp);
      const modifiedTargetNode = modifiedNodesWithTimeDataUp[targetNodeId];

      if (baseTargetNode?.timeData && modifiedTargetNode?.timeData) {
        const monthKeys = Object.keys(baseTargetNode.timeData).filter(k => !k.includes('目标'));

        monthKeys.forEach(monthKey => {
          const baseMonthValue = baseTargetNode.timeData[monthKey];
          const newMonthValue = modifiedTargetNode.timeData[monthKey];

          if (baseMonthValue !== undefined && !isNaN(baseMonthValue) &&
              newMonthValue !== undefined && !isNaN(newMonthValue)) {

            const monthChangeAmount = newMonthValue - baseMonthValue;

            // 分月也用同样的逻辑
            let monthSensitivity = 0;

            if (baseMonthValue !== 0) {
              const simpleMonthSensitivity = ((monthChangeAmount / baseMonthValue) * 100) / variationPercent;

              // 判断该月的方向（简单判断：如果变动明显，用该月的方向；否则用总体方向）
              const monthIsPositive = monthChangeAmount >= 0;
              const monthChangeIsSignificant = Math.abs(monthChangeAmount) > Math.abs(baseMonthValue) * 0.001;

              const finalMonthIsPositive = monthChangeIsSignificant ? monthIsPositive : isPositiveRelationship;

              if ((simpleMonthSensitivity >= 0 && finalMonthIsPositive) ||
                  (simpleMonthSensitivity < 0 && !finalMonthIsPositive)) {
                monthSensitivity = simpleMonthSensitivity;
              } else {
                monthSensitivity = Math.abs(simpleMonthSensitivity) * (finalMonthIsPositive ? 1 : -1);
              }
            }

            monthlySensitivity[monthKey] = {
              baseValue: baseMonthValue,
              newValue: newMonthValue,
              changeAmount: monthChangeAmount,
              changePercent: baseMonthValue !== 0 ? (monthChangeAmount / baseMonthValue) * 100 : 0,
              sensitivity: monthSensitivity
            };
          }
        });
      }

      const targetChangePercent = targetBaseValue !== 0 ? (targetChangeAmount / targetBaseValue) * 100 : 0;

      // 即使 driverBaseValue 为 0，也返回驱动因子信息（sensitivity 为 0）
      return {
        driverId,
        driverName: driverNode.name,
        driverUnit: driverNode.unit || '',
        driverBaseValue,
        driverNewValue: driverBaseValue * multiplierUp,
        targetBaseValue,
        targetNewValue: targetValueUp,
        targetChangeAmount,
        targetChangePercent,
        sensitivity,
        isPositive: sensitivity >= 0 || (sensitivity === 0 && isPositiveRelationship),
        monthlySensitivity,
        driverNode,
        hasValidSensitivity: driverBaseValue !== 0 && targetBaseValue !== 0
      };
    }).filter(Boolean);

    return results;
  }, [variationPercent, calculateNodeTotal, adjustSingleDriver, calculateCompleteNodes]);

  // 获取所有驱动因子列表（用于趋势图选择，即使计算失败也显示）
  const allDriverOptions = useMemo(() => {
    if (!selectedTargetNodeId) return [];
    const baseScenarioNodes = getScenarioNodes(selectedScenarioId);
    // 先用 calculateCompleteNodes 确保所有节点都有正确的 dependsOn
    const { nodes: calculatedNodes } = calculateCompleteNodes(baseScenarioNodes);
    const driverIds = findAllDriverDependencies(selectedTargetNodeId, calculatedNodes);
    return driverIds.map(id => {
      const node = calculatedNodes[id];
      return { id, name: node?.name || id };
    });
  }, [selectedTargetNodeId, selectedScenarioId, getScenarioNodes, findAllDriverDependencies, calculateCompleteNodes]);

  // 主敏感性分析数据
  const sensitivityData = useMemo(() => {
    if (!selectedTargetNodeId) return { initial: [], adjusted: [], target: [], all: [], positive: [], negative: [] };

    const baseScenarioNodes = getScenarioNodes(selectedScenarioId);
    const targetNode = baseScenarioNodes[selectedTargetNodeId];
    if (!targetNode) return { initial: [], adjusted: [], target: [], all: [], positive: [], negative: [] };

    // 先用 calculateCompleteNodes 确保所有节点都有正确的 dependsOn 和计算结果
    const { nodes: calculatedNodes } = calculateCompleteNodes(baseScenarioNodes);

    // 用计算后的节点来查找依赖
    const driverIds = findAllDriverDependencies(selectedTargetNodeId, calculatedNodes);

    // 1. 构建初始值场景：所有驱动因子用 initialBaseline
    const initialNodes = {};
    Object.keys(baseScenarioNodes).forEach(id => {
      const node = baseScenarioNodes[id];
      if (node.type === 'driver') {
        initialNodes[id] = {
          ...node,
          value: node.initialBaseline ?? node.baseline ?? node.value ?? 0,
          timeData: node.originalTimeData ? { ...node.originalTimeData } : (node.timeData ? { ...node.timeData } : null)
        };
      } else {
        initialNodes[id] = { ...node };
      }
    });

    // 2. 调整后场景：直接用当前节点
    const adjustedNodes = baseScenarioNodes;

    // 3. 构建目标值场景：所有驱动因子用 targetValue
    const targetNodes = {};
    Object.keys(baseScenarioNodes).forEach(id => {
      const node = baseScenarioNodes[id];
      if (node.type === 'driver') {
        const targetVal = node.targetValue ?? node.initialBaseline ?? node.value ?? 0;
        const newTimeData = node.originalTimeData ? { ...node.originalTimeData } : (node.timeData ? { ...node.timeData } : null);
        // 简单按比例调整
        if (newTimeData && node.initialBaseline && node.initialBaseline !== 0 && targetVal !== 0) {
          const ratio = targetVal / node.initialBaseline;
          Object.keys(newTimeData).forEach(key => {
            if (!key.includes('目标') && newTimeData[key] !== undefined && newTimeData[key] !== null && !isNaN(newTimeData[key])) {
              newTimeData[key] = newTimeData[key] * ratio;
            }
          });
        }
        targetNodes[id] = {
          ...node,
          value: targetVal,
          timeData: newTimeData
        };
      } else {
        targetNodes[id] = { ...node };
      }
    });

    // 分别计算三个场景的敏感性
    const initialResults = calculateSensitivityForScenario(initialNodes, selectedTargetNodeId, driverIds);
    const adjustedResults = calculateSensitivityForScenario(adjustedNodes, selectedTargetNodeId, driverIds);
    const targetResults = calculateSensitivityForScenario(targetNodes, selectedTargetNodeId, driverIds);

    // 合并结果，用调整后的数据来确定相关性和排序
    const merged = adjustedResults.map(adj => {
      const initial = initialResults.find(i => i.driverId === adj.driverId);
      const target = targetResults.find(t => t.driverId === adj.driverId);
      return {
        ...adj,
        initialData: initial,
        targetData: target
      };
    });

    // 分为正相关和负相关，按敏感性绝对值降序排列
    const positive = merged
      .filter(r => r.isPositive)
      .sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity));

    const negative = merged
      .filter(r => !r.isPositive)
      .sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity));

    return {
      positive,
      negative,
      all: merged,
      initial: initialResults,
      adjusted: adjustedResults,
      target: targetResults
    };
  }, [selectedTargetNodeId, selectedScenarioId, variationPercent, getScenarioNodes, findAllDriverDependencies, calculateSensitivityForScenario]);

  // 获取月份列表
  const monthKeys = useMemo(() => {
    if (!selectedTargetNodeId) return [];
    const targetNode = nodes[selectedTargetNodeId];
    if (!targetNode?.timeData) return [];
    return Object.keys(targetNode.timeData).filter(k => !k.includes('目标'));
  }, [selectedTargetNodeId, nodes]);

  // ========== 趋势图相关函数 ==========

  // 颜色配置（与 TrendChart 一致，但适配敏感性分析）
  const CHART_COLORS = {
    initial: '#3b82f6',      // 蓝色 - 初始值（实线+虚线）
    adjusted: '#10b981',     // 绿色 - 调整后（虚线）
    target: '#f59e0b'         // 橙色 - 目标（双线）
  };

  // 绘制平滑曲线（使用 Catmull-Rom 样条插值）
  const createSmoothLinePath = (points, tension = 0.5) => {
    if (!points || points.length < 2) return '';
    try {
      const result = [];
      for (let i = 0; i < points.length; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[Math.min(points.length - 1, i + 1)];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        if (!p1 || p1.x === undefined || p1.y === undefined) continue;
        if (i === 0) {
          result.push(`M ${p1.x} ${p1.y}`);
        }
        if (i < points.length - 1 && p2 && p2.x !== undefined && p2.y !== undefined) {
          const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
          const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
          const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
          const cp2y = p2.y - (p3.y - p1.y) * tension / 6;
          result.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
        }
      }
      return result.join(' ');
    } catch (e) {
      if (points.length >= 2) {
        return points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
      }
      return '';
    }
  };

  // 绘制双线的函数
  const createDoubleLinePaths = (points, offset = 3) => {
    if (points.length < 2) return { upper: '', lower: '' };
    const upperPoints = points.map(p => ({ ...p, y: p.y - offset }));
    const lowerPoints = points.map(p => ({ ...p, y: p.y + offset }));
    return {
      upper: createSmoothLinePath(upperPoints, 0.4),
      lower: createSmoothLinePath(lowerPoints, 0.4)
    };
  };

  // 准备图表数据
  const chartData = useMemo(() => {
    if (!selectedChartDriverId || !sensitivityData.all) return null;
    const driverItem = sensitivityData.all.find(d => d.driverId === selectedChartDriverId);
    const driverOption = allDriverOptions.find(d => d.id === selectedChartDriverId);

    const months = monthKeys || [];
    if (months.length === 0) return null;

    // 提取三个场景的数据
    const initialData = [];
    const adjustedData = [];
    const targetData = [];

    if (driverItem) {
      months.forEach(month => {
        const initialMonthly = driverItem.initialData?.monthlySensitivity?.[month];
        const adjustedMonthly = driverItem.monthlySensitivity?.[month];
        const targetMonthly = driverItem.targetData?.monthlySensitivity?.[month];

        if (initialMonthly?.sensitivity !== undefined) {
          initialData.push({ month, value: initialMonthly.sensitivity });
        }
        if (adjustedMonthly?.sensitivity !== undefined) {
          adjustedData.push({ month, value: adjustedMonthly.sensitivity });
        }
        if (targetMonthly?.sensitivity !== undefined) {
          targetData.push({ month, value: targetMonthly.sensitivity });
        }
      });
    }

    return {
      months,
      initialData,
      adjustedData,
      targetData,
      driverName: driverItem?.driverName || driverOption?.name || selectedChartDriverId,
      hasValidData: driverItem?.hasValidSensitivity ?? false
    };
  }, [selectedChartDriverId, sensitivityData.all, allDriverOptions, monthKeys]);

  // 初始化选中第一个驱动因子
  useEffect(() => {
    if (allDriverOptions && allDriverOptions.length > 0 && !selectedChartDriverId) {
      setSelectedChartDriverId(allDriverOptions[0].id);
    }
  }, [allDriverOptions, selectedChartDriverId]);

  // 渲染趋势图
  const renderTrendChart = () => {
    if (!allDriverOptions || allDriverOptions.length === 0) {
      return (
        <div className="flex items-center justify-center h-80 text-gray-500">
          请选择一个目标指标查看驱动因素
        </div>
      );
    }

    if (!chartData || chartData.months.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-80 text-gray-500">
          <div className="mb-4 flex items-center gap-4 w-full">
            <span className="text-sm font-medium text-gray-700">📊 选择驱动因素:</span>
            <SearchableSelect
              options={allDriverOptions}
              value={selectedChartDriverId}
              onChange={setSelectedChartDriverId}
              placeholder="请选择驱动因素"
              searchPlaceholder="搜索驱动因素..."
              optionLabelKey="name"
              optionValueKey="id"
              minWidth="min-w-64"
            />
          </div>
          <div className="text-gray-400">暂无月份数据</div>
        </div>
      );
    }

    const { months, initialData, adjustedData, targetData, driverName, hasValidData } = chartData;

    // 图表尺寸
    const chartWidth = Math.max(600, panelSize.width - 120);
    const chartHeight = 380;
    const padding = { top: 60, right: 60, bottom: 100, left: 100 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom + 60;

    // 计算数据范围
    const allValues = [
      ...initialData.map(d => d.value),
      ...adjustedData.map(d => d.value),
      ...targetData.map(d => d.value)
    ].filter(v => !isNaN(v) && isFinite(v));

    let minValue = Math.min(...allValues);
    let maxValue = Math.max(...allValues);

    if (allValues.length === 0) {
      minValue = -1;
      maxValue = 1;
    } else {
      const range = maxValue - minValue || 2;
      minValue = minValue - range * 0.15;
      maxValue = maxValue + range * 0.15;
    }

    // 坐标转换函数
    const xScale = (index) => padding.left + (index / (months.length - 1 || 1)) * plotWidth;
    const yScale = (value) => {
      if (isNaN(value) || !isFinite(value)) return null;
      return padding.top + plotHeight - ((value - minValue) / (maxValue - minValue || 1)) * plotHeight;
    };

    // 转换数据为坐标点
    const getPoints = (data) => {
      if (!data) return [];
      return data.map((d) => {
        const monthIndex = months.indexOf(d.month);
        if (monthIndex === -1) return null;
        const y = yScale(d.value);
        if (y === null) return null;
        return { x: xScale(monthIndex), y, value: d.value, month: d.month };
      }).filter(p => p !== null);
    };

    const initialPoints = getPoints(initialData);
    const adjustedPoints = getPoints(adjustedData);
    const targetPoints = getPoints(targetData);

    // 创建数据点
    const createDataPoints = (points, color, isHollow = false) => {
      return points.map((p, i) => (
        <circle
          key={`point-${i}`}
          cx={p.x}
          cy={p.y}
          r={5}
          fill={isHollow ? 'white' : color}
          stroke={color}
          strokeWidth={2}
        />
      ));
    };

    // 创建数值标注（保留4位小数）
    const createValueLabels = (points, color, yOffset = -12) => {
      return points.map((p, i) => (
        <text
          key={`label-${i}`}
          x={p.x}
          y={p.y + yOffset}
          textAnchor="middle"
          fill={color}
          fontSize="10"
          fontWeight="600"
        >
          {p.value.toFixed(4)}
        </text>
      ));
    };

    return (
      <div className="flex flex-col h-full">
        {/* 驱动因子选择器 */}
        <div className="mb-4 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">📊 选择驱动因素:</span>
          <SearchableSelect
            options={allDriverOptions}
            value={selectedChartDriverId}
            onChange={setSelectedChartDriverId}
            placeholder="请选择驱动因素"
            searchPlaceholder="搜索驱动因素..."
            optionLabelKey="name"
            optionValueKey="id"
            minWidth="min-w-64"
          />
          <span className="text-sm text-gray-500">当前: <span className="font-medium text-orange-600">{driverName}</span></span>
          {chartData && !chartData.hasValidData && (
            <span className="text-sm text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
              ⚠️ 该驱动因素基准值为0，无法计算敏感性系数
            </span>
          )}
        </div>

        {/* 图例 */}
        <div className="flex flex-wrap gap-6 mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <svg width="24" height="16">
              <line x1="0" y1="8" x2="24" y2="8" stroke={CHART_COLORS.initial} strokeWidth="3" />
              <circle cx="12" cy="8" r="4" fill={CHART_COLORS.initial} />
            </svg>
            <span className="text-sm text-gray-700">📍 初始值（蓝）</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="16">
              <line x1="0" y1="8" x2="24" y2="8" stroke={CHART_COLORS.adjusted} strokeWidth="3" strokeDasharray="6,3" />
            </svg>
            <span className="text-sm text-gray-700">💡 调整后（绿虚线）</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="16">
              <line x1="0" y1="5" x2="24" y2="5" stroke={CHART_COLORS.target} strokeWidth="2" />
              <line x1="0" y1="11" x2="24" y2="11" stroke={CHART_COLORS.target} strokeWidth="2" />
              <circle cx="12" cy="8" r="4" fill="white" stroke={CHART_COLORS.target} strokeWidth="2" />
            </svg>
            <span className="text-sm text-gray-700">🎯 目标值（橙双线）</span>
          </div>
        </div>

        {/* SVG 图表 */}
        <div className="flex-1 overflow-auto">
          <svg width={chartWidth} height={chartHeight} style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
            {/* 网格线 */}
            {[0, 1, 2, 3, 4, 5].map(i => {
              const y = padding.top + (plotHeight / 5) * i;
              const value = maxValue - ((maxValue - minValue) / 5) * i;
              return (
                <g key={i}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#6b7280"
                    fontSize="11"
                  >
                    {value.toFixed(4)}
                  </text>
                </g>
              );
            })}

            {/* 目标曲线（橙色双线+空心点）*/}
            {targetPoints.length >= 2 && (
              <>
                <path
                  d={createDoubleLinePaths(targetPoints, 3).upper}
                  fill="none"
                  stroke={CHART_COLORS.target}
                  strokeWidth="2"
                />
                <path
                  d={createDoubleLinePaths(targetPoints, 3).lower}
                  fill="none"
                  stroke={CHART_COLORS.target}
                  strokeWidth="2"
                />
              </>
            )}
            {createDataPoints(targetPoints, CHART_COLORS.target, true)}
            {createValueLabels(targetPoints, CHART_COLORS.target, -18)}

            {/* 初始值曲线（蓝色实线+点）*/}
            {initialPoints.length >= 2 && (
              <path
                d={createSmoothLinePath(initialPoints, 0.4)}
                fill="none"
                stroke={CHART_COLORS.initial}
                strokeWidth="3"
              />
            )}
            {createDataPoints(initialPoints, CHART_COLORS.initial)}
            {createValueLabels(initialPoints, CHART_COLORS.initial, -14)}

            {/* 调整后曲线（绿色虚线）*/}
            {adjustedPoints.length >= 2 && (
              <path
                d={createSmoothLinePath(adjustedPoints, 0.4)}
                fill="none"
                stroke={CHART_COLORS.adjusted}
                strokeWidth="3"
                strokeDasharray="6,3"
              />
            )}
            {createDataPoints(adjustedPoints, CHART_COLORS.adjusted)}
            {createValueLabels(adjustedPoints, CHART_COLORS.adjusted, 10)}

            {/* X轴标签 */}
            {months.map((month, i) => (
              <text
                key={month}
                x={xScale(i)}
                y={padding.top + plotHeight + 25}
                textAnchor="middle"
                fill="#6b7280"
                fontSize="11"
              >
                {month}
              </text>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  // ========== 原有功能 ==========

  // 切换全屏
  const toggleFullscreen = () => {
    if (isFullscreen) {
      if (prevPanelState) {
        setPanelPosition(prevPanelState.position);
        setPanelSize(prevPanelState.size);
      }
      setIsFullscreen(false);
    } else {
      setPrevPanelState({
        position: { ...panelPosition },
        size: { ...panelSize }
      });
      setIsFullscreen(true);
    }
  };

  // 检查是否点击了滚动条
  const isScrollbarClick = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return false;
    const hasScrollbar = target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth;
    if (!hasScrollbar) return false;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isVerticalScrollbar = x > target.clientWidth - 20 && x <= rect.width;
    const isHorizontalScrollbar = y > target.clientHeight - 20 && y <= rect.height;
    return isVerticalScrollbar || isHorizontalScrollbar;
  };

  // 拖动窗口
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') ||
        e.target.closest('input') ||
        e.target.closest('select') ||
        e.target.closest('textarea') ||
        isScrollbarClick(e)) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartPos.current = { ...panelPosition };
    onBringToFront?.();
  }, [panelPosition, onBringToFront]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    setPanelPosition({
      x: Math.max(0, panelStartPos.current.x + deltaX),
      y: Math.max(0, panelStartPos.current.y + deltaY)
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 调整窗口大小
  const handleResizeStart = useCallback((e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeHandle(handle);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartSize.current = { ...panelSize };
    panelStartPos.current = { ...panelPosition };
    onBringToFront?.();
  }, [panelSize, panelPosition, onBringToFront]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !resizeHandle) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;

    let newWidth = panelStartSize.current.width;
    let newHeight = panelStartSize.current.height;

    if (resizeHandle.includes('right')) {
      newWidth = Math.max(1000, panelStartSize.current.width + deltaX);
    }
    if (resizeHandle.includes('bottom')) {
      newHeight = Math.max(600, panelStartSize.current.height + deltaY);
    }

    setPanelSize({ width: newWidth, height: newHeight });
  }, [isResizing, resizeHandle]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

  // 全局监听鼠标移动和抬起
  useEffect(() => {
    if (isDragging || isResizing) {
      const handleGlobalMouseMove = (e) => {
        if (isDragging) handleDragMove(e);
        if (isResizing) handleResizeMove(e);
      };
      const handleGlobalMouseUp = () => {
        if (isDragging) handleDragEnd();
        if (isResizing) handleResizeEnd();
      };
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, isResizing, handleDragMove, handleDragEnd]);

  // 导出 Excel
  const exportToExcel = () => {
    if (!selectedTargetNodeId) return;

    const targetNode = nodes[selectedTargetNodeId];
    const scenario = scenarios?.[selectedScenarioId];
    const scenarioName = scenario?.name || '当前方案';
    const safePositive = sensitivityData?.positive || [];
    const safeNegative = sensitivityData?.negative || [];
    const safeAll = sensitivityData?.all || [];

    const wb = XLSX.utils.book_new();

    // ========== Sheet 1: 汇总分析 ==========
    const summaryData = [];
    summaryData.push(['敏感性分析报告', '', '', '', '', '', '', '', '', '', '']);
    summaryData.push(['目标指标', targetNode?.name || '', '', '', '', '', '', '', '', '']);
    summaryData.push(['分析场景', scenarioName, '', '', '', '', '', '', '', '']);
    summaryData.push(['变动幅度', `${variationPercent}%`, '', '', '', '', '', '', '', '']);
    summaryData.push([]);

    // 表头
    summaryData.push(['因素名称', '相关性',
      '初始-基准值', '初始-目标变动%', '初始-敏感性系数',
      '调整后-基准值', '调整后-目标变动%', '调整后-敏感性系数',
      '目标-基准值', '目标-目标变动%', '目标-敏感性系数']);

    // 正相关因素
    if (safePositive.length > 0) {
      summaryData.push(['--- 正相关因素 ---', '', '', '', '', '', '', '', '', '', '']);
      safePositive.forEach(r => {
        summaryData.push([
          r?.driverName || '',
          '正相关',
          r?.initialData?.driverBaseValue ?? '',
          r?.initialData ? `${r.initialData.targetChangePercent >= 0 ? '+' : ''}${(r.initialData.targetChangePercent || 0).toFixed(2)}%` : '',
          r?.initialData?.sensitivity ? r.initialData.sensitivity.toFixed(4) : '',
          r?.driverBaseValue ?? '',
          r ? `${r.targetChangePercent >= 0 ? '+' : ''}${(r.targetChangePercent || 0).toFixed(2)}%` : '',
          r?.sensitivity ? r.sensitivity.toFixed(4) : '',
          r?.targetData?.driverBaseValue ?? '',
          r?.targetData ? `${r.targetData.targetChangePercent >= 0 ? '+' : ''}${(r.targetData.targetChangePercent || 0).toFixed(2)}%` : '',
          r?.targetData?.sensitivity ? r.targetData.sensitivity.toFixed(4) : ''
        ]);
      });
    }

    // 负相关因素
    if (safeNegative.length > 0) {
      summaryData.push(['--- 负相关因素 ---', '', '', '', '', '', '', '', '', '', '']);
      safeNegative.forEach(r => {
        summaryData.push([
          r?.driverName || '',
          '负相关',
          r?.initialData?.driverBaseValue ?? '',
          r?.initialData ? `${r.initialData.targetChangePercent >= 0 ? '+' : ''}${(r.initialData.targetChangePercent || 0).toFixed(2)}%` : '',
          r?.initialData?.sensitivity ? r.initialData.sensitivity.toFixed(4) : '',
          r?.driverBaseValue ?? '',
          r ? `${r.targetChangePercent >= 0 ? '+' : ''}${(r.targetChangePercent || 0).toFixed(2)}%` : '',
          r?.sensitivity ? r.sensitivity.toFixed(4) : '',
          r?.targetData?.driverBaseValue ?? '',
          r?.targetData ? `${r.targetData.targetChangePercent >= 0 ? '+' : ''}${(r.targetData.targetChangePercent || 0).toFixed(2)}%` : '',
          r?.targetData?.sensitivity ? r.targetData.sensitivity.toFixed(4) : ''
        ]);
      });
    }

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, '汇总分析');

    // ========== Sheet 2: 分月分析 ==========
    if (monthKeys && monthKeys.length > 0 && safeAll.length > 0) {
      const monthlyData = [];
      monthlyData.push(['分月敏感性分析报告', '', '', '', '', '', '', '', '', '', '']);
      monthlyData.push(['目标指标', targetNode?.name || '', '', '', '', '', '', '', '', '']);
      monthlyData.push(['分析场景', scenarioName, '', '', '', '', '', '', '', '']);
      monthlyData.push(['变动幅度', `${variationPercent}%`, '', '', '', '', '', '', '', '']);
      monthlyData.push([]);
      monthlyData.push(['说明：以下为各月份的敏感性系数（初始/调整/目标三个场景）']);
      monthlyData.push([]);

      // 表头行1：月份
      const headerRow1 = ['驱动因素', '相关性'];
      monthKeys.forEach(month => {
        headerRow1.push(month, '', '');
      });
      monthlyData.push(headerRow1);

      // 表头行2：场景
      const headerRow2 = ['', ''];
      monthKeys.forEach(() => {
        headerRow2.push('初始值', '调整后', '目标值');
      });
      monthlyData.push(headerRow2);

      // 正相关因素
      if (safePositive.length > 0) {
        monthlyData.push(['--- 正相关因素 ---']);
        safePositive.forEach(r => {
          const row = [r?.driverName || '', '正相关'];
          monthKeys.forEach(month => {
            const initialMonthly = r.initialData?.monthlySensitivity?.[month];
            const adjustedMonthly = r.monthlySensitivity?.[month];
            const targetMonthly = r.targetData?.monthlySensitivity?.[month];
            row.push(
              initialMonthly?.sensitivity !== undefined ? initialMonthly.sensitivity.toFixed(4) : '-',
              adjustedMonthly?.sensitivity !== undefined ? adjustedMonthly.sensitivity.toFixed(4) : '-',
              targetMonthly?.sensitivity !== undefined ? targetMonthly.sensitivity.toFixed(4) : '-'
            );
          });
          monthlyData.push(row);
        });
      }

      // 负相关因素
      if (safeNegative.length > 0) {
        monthlyData.push(['--- 负相关因素 ---']);
        safeNegative.forEach(r => {
          const row = [r?.driverName || '', '负相关'];
          monthKeys.forEach(month => {
            const initialMonthly = r.initialData?.monthlySensitivity?.[month];
            const adjustedMonthly = r.monthlySensitivity?.[month];
            const targetMonthly = r.targetData?.monthlySensitivity?.[month];
            row.push(
              initialMonthly?.sensitivity !== undefined ? initialMonthly.sensitivity.toFixed(4) : '-',
              adjustedMonthly?.sensitivity !== undefined ? adjustedMonthly.sensitivity.toFixed(4) : '-',
              targetMonthly?.sensitivity !== undefined ? targetMonthly.sensitivity.toFixed(4) : '-'
            );
          });
          monthlyData.push(row);
        });
      }

      const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyData);
      XLSX.utils.book_append_sheet(wb, wsMonthly, '分月分析');
    }

    XLSX.writeFile(wb, `敏感性分析_${targetNode?.name || 'target'}_${Date.now()}.xlsx`);
  };

  // 渲染汇总敏感性表格
  const renderSummaryTable = (items, title, colorClass) => {
    if (!items || items.length === 0) return null;
    const targetNode = nodes[selectedTargetNodeId];

    return (
      <div className="mb-6">
        <h3 className={`text-sm font-bold mb-2 px-3 py-1.5 rounded ${colorClass}`}>
          {title} ({items.length}个)
        </h3>
        <div className="overflow-auto max-h-72">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 w-40 sticky left-0 bg-gray-100 z-20 whitespace-nowrap">驱动因素</th>
                <th className="px-2 py-1.5 text-center font-semibold text-gray-600 w-16" colSpan="3">📍 初始值</th>
                <th className="px-2 py-1.5 text-center font-semibold text-gray-600 w-16" colSpan="3">💡 调整后</th>
                <th className="px-2 py-1.5 text-center font-semibold text-gray-600 w-16" colSpan="3">🎯 目标值</th>
              </tr>
              <tr>
                <th className="px-2 py-1 text-left font-semibold text-gray-600 w-40 sticky left-0 bg-gray-50 z-20 border-t whitespace-nowrap"></th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-20 border-t bg-blue-50">驱动基准</th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-16 border-t bg-blue-50">目标变动%</th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-16 border-t bg-blue-50">敏感性</th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-20 border-t bg-green-50">驱动基准</th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-16 border-t bg-green-50">目标变动%</th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-16 border-t bg-green-50">敏感性</th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-20 border-t bg-yellow-50">驱动基准</th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-16 border-t bg-yellow-50">目标变动%</th>
                <th className="px-2 py-1 text-right font-semibold text-gray-600 w-16 border-t bg-yellow-50">敏感性</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item, idx) => (
                <tr key={item.driverId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 text-left text-gray-800 font-medium sticky left-0 bg-inherit z-10 whitespace-nowrap">
                    {item.driverName}
                  </td>
                  {/* 初始值 */}
                  <td className="px-2 py-1 text-right text-gray-600 font-mono bg-blue-50">
                    {item.initialData ? formatValue(item.initialData.driverBaseValue, item.initialData.driverNode?.format, item.driverUnit) : '-'}
                  </td>
                  <td className={`px-2 py-1 text-right font-mono bg-blue-50 ${item.initialData?.targetChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.initialData ? `${item.initialData.targetChangePercent >= 0 ? '+' : ''}${(item.initialData.targetChangePercent || 0).toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-bold text-purple-600 bg-blue-50">
                    {item.initialData?.sensitivity.toFixed(4) ?? '-'}
                  </td>
                  {/* 调整后 */}
                  <td className="px-2 py-1 text-right text-gray-600 font-mono bg-green-50">
                    {formatValue(item.driverBaseValue, item.driverNode?.format, item.driverUnit)}
                  </td>
                  <td className={`px-2 py-1 text-right font-mono bg-green-50 ${item.targetChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.targetChangePercent >= 0 ? '+' : ''}{(item.targetChangePercent || 0).toFixed(2)}%
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-bold text-purple-600 bg-green-50">
                    {item.sensitivity.toFixed(4)}
                  </td>
                  {/* 目标值 */}
                  <td className="px-2 py-1 text-right text-gray-600 font-mono bg-yellow-50">
                    {item.targetData ? formatValue(item.targetData.driverBaseValue, item.targetData.driverNode?.format, item.driverUnit) : '-'}
                  </td>
                  <td className={`px-2 py-1 text-right font-mono bg-yellow-50 ${item.targetData?.targetChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.targetData ? `${item.targetData.targetChangePercent >= 0 ? '+' : ''}${(item.targetData.targetChangePercent || 0).toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-bold text-purple-600 bg-yellow-50">
                    {item.targetData?.sensitivity.toFixed(4) ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 渲染分月敏感性表格（单个区域）
  const renderMonthlyTableSection = (items, title, colorClass) => {
    if (!items || items.length === 0 || !monthKeys || monthKeys.length === 0) return null;

    return (
      <div className="mb-6">
        <h3 className={`text-sm font-bold mb-2 px-3 py-1.5 rounded ${colorClass}`}>
          {title} ({items.length}个)
        </h3>
        <div className="overflow-auto max-h-80">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 w-40 sticky left-0 bg-gray-100 z-20 whitespace-nowrap" rowSpan="2">驱动因素</th>
                {monthKeys.map(month => (
                  <th key={month} className="px-2 py-1.5 text-center font-semibold text-gray-600" colSpan="3">
                    {month}
                  </th>
                ))}
              </tr>
              <tr>
                {monthKeys.map(month => (
                  <React.Fragment key={`${month}-cols`}>
                    <th className="px-1 py-1 text-center font-semibold text-gray-600 w-14 border-t bg-blue-50">初始</th>
                    <th className="px-1 py-1 text-center font-semibold text-gray-600 w-14 border-t bg-green-50">调整</th>
                    <th className="px-1 py-1 text-center font-semibold text-gray-600 w-14 border-t bg-yellow-50">目标</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item, idx) => (
                <tr key={item.driverId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 text-left text-gray-800 font-medium sticky left-0 bg-inherit z-10 whitespace-nowrap">
                    {item.driverName}
                  </td>
                  {monthKeys.map(month => {
                    // 初始值场景
                    const initialMonthly = item.initialData?.monthlySensitivity?.[month];
                    // 调整后场景（当前）
                    const adjustedMonthly = item.monthlySensitivity?.[month];
                    // 目标值场景
                    const targetMonthly = item.targetData?.monthlySensitivity?.[month];

                    return (
                      <React.Fragment key={`${item.driverId}-${month}`}>
                        {/* 初始值 */}
                        <td className={`px-1 py-1 text-right font-mono bg-blue-50 ${initialMonthly ? (initialMonthly.sensitivity >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                          {initialMonthly?.sensitivity !== undefined ? initialMonthly.sensitivity.toFixed(3) : '-'}
                        </td>
                        {/* 调整后 */}
                        <td className={`px-1 py-1 text-right font-mono bg-green-50 ${adjustedMonthly ? (adjustedMonthly.sensitivity >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                          {adjustedMonthly?.sensitivity !== undefined ? adjustedMonthly.sensitivity.toFixed(3) : '-'}
                        </td>
                        {/* 目标值 */}
                        <td className={`px-1 py-1 text-right font-mono bg-yellow-50 ${targetMonthly ? (targetMonthly.sensitivity >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                          {targetMonthly?.sensitivity !== undefined ? targetMonthly.sensitivity.toFixed(3) : '-'}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 安全检查 scenarios
  const safeScenarios = React.useMemo(() => {
    if (!scenarios || typeof scenarios !== 'object') return [];
    return Object.values(scenarios).filter(s => s && s.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [scenarios]);

  // 最小化时不渲染内容
  if (isMinimized) {
    return null;
  }

  // 安全获取数据
  const safePositive = sensitivityData?.positive || [];
  const safeNegative = sensitivityData?.negative || [];
  const safeAll = sensitivityData?.all || [];
  const safeAdjusted = sensitivityData?.adjusted || [];
  const targetNode = nodes[selectedTargetNodeId];
  const adjustedResult = safeAdjusted?.[0];

  return (
    <div className="fixed inset-0 pointer-events-none">
      <div
        className={`bg-white ${isFullscreen ? '' : 'rounded-xl'} shadow-2xl flex flex-col overflow-hidden pointer-events-auto ${isDragging && !isFullscreen ? 'cursor-grabbing' : 'cursor-default'}`}
        style={isFullscreen ? {
          position: 'fixed',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh'
        } : {
          position: 'absolute',
          left: panelPosition.x,
          top: panelPosition.y,
          width: panelSize.width,
          height: panelSize.height
        }}
        onMouseDown={() => onBringToFront?.()}
      >
        {/* 调整大小的句柄 - 右侧只保留顶部和底部，给滚动条留出空间 */}
        {!isFullscreen && (
          <>
            <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
            <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
            <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
            <div className="absolute top-0 left-4 right-4 h-2 cursor-n-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'top')} />
            <div className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'bottom')} />
            {/* 右侧调整大小句柄：只保留顶部和底部各 40px，给滚动条留出中间空间 */}
            <div className="absolute right-0 top-4 w-2 h-10 cursor-e-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'right')} />
            <div className="absolute right-0 bottom-4 w-2 h-10 cursor-e-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'right')} />
          </>
        )}

        {/* 头部 */}
        <div
          className={`px-4 py-2 border-b flex items-center justify-between bg-gradient-to-r from-orange-50 to-red-50 flex-shrink-0 select-none ${!isFullscreen ? 'cursor-move' : ''}`}
          onMouseDown={!isFullscreen ? handleDragStart : undefined}
        >
          <div className="flex items-center gap-3 flex-1">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <span>📈</span>
              敏感性分析
            </h2>
            {!isFullscreen && (
              <span className="text-xs text-gray-500">(拖动标题栏移动窗口)</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 导出图片按钮 */}
            <button
              onClick={handleExportImage}
              className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 rounded text-blue-700 text-sm font-medium transition-colors flex items-center gap-1"
              title="导出图片"
            >
              🖼️ 导出
            </button>
            <button
              onClick={onToggleMinimize}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition-colors"
              title="最小化"
            >
              一
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition-colors"
              title={isFullscreen ? "退出全屏" : "全屏"}
            >
              {isFullscreen ? '⛶' : '⛶'}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 rounded text-red-600 font-medium transition-colors"
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 筛选区域 */}
        <div className="px-4 py-3 bg-gray-50 border-b flex flex-wrap items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">🎯 目标指标:</span>
            <SearchableSelect
              options={targetNodes}
              value={selectedTargetNodeId}
              onChange={setSelectedTargetNodeId}
              placeholder="请选择目标指标"
              searchPlaceholder="搜索目标指标..."
              optionLabelKey="name"
              optionValueKey="id"
              minWidth="min-w-48"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">📊 分析场景:</span>
            <select
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              className="px-3 py-1.5 border rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {safeScenarios.map(scenario => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">📏 变动幅度:</span>
            <input
              type="number"
              value={variationPercent}
              onChange={(e) => setVariationPercent(Math.max(1, Math.min(100, parseFloat(e.target.value) || 10)))}
              className="w-20 px-2 py-1.5 border rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              min="1"
              max="100"
            />
            <span className="text-sm text-gray-600">%</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex bg-white rounded border overflow-hidden">
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-3 py-1.5 text-xs font-medium ${activeTab === 'summary' ? 'bg-orange-500 text-white' : 'hover:bg-gray-100'}`}
              >
                📈 汇总分析
              </button>
              <button
                onClick={() => setActiveTab('monthly')}
                className={`px-3 py-1.5 text-xs font-medium ${activeTab === 'monthly' ? 'bg-orange-500 text-white' : 'hover:bg-gray-100'}`}
              >
                📅 分月分析
              </button>
              <button
                onClick={() => setActiveTab('chart')}
                className={`px-3 py-1.5 text-xs font-medium ${activeTab === 'chart' ? 'bg-orange-500 text-white' : 'hover:bg-gray-100'}`}
              >
                📉 趋势图
              </button>
            </div>
            <button
              onClick={exportToExcel}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm flex items-center gap-1.5"
            >
              <span>📥</span>
              导出Excel
            </button>
          </div>
        </div>

        {/* 摘要信息 */}
        <div className="px-4 py-3 bg-white border-b flex-shrink-0">
          {/* 第一行：目标指标信息 */}
          <div className="flex items-center gap-6 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">🎯 目标指标:</span>
              <span className="text-base font-bold text-gray-800">{targetNode?.name || '-'}</span>
            </div>
          </div>

          {/* 第二行：详细数据展示 */}
          <div className="flex flex-wrap items-center gap-4">
            {/* 目标值详情 */}
            {targetNode && (
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">值详情:</span>
                {/* 初始值 */}
                <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                  <span className="text-gray-600">📍 初始:</span>
                  <span className="font-mono ml-1">{formatValue(
                    sensitivityData.initial?.[0]?.targetBaseValue ?? 0,
                    targetNode.format,
                    targetNode.unit
                  )}</span>
                  {/* 调整后 vs 初始 */}
                  {(() => {
                    const initialVal = sensitivityData.initial?.[0]?.targetBaseValue ?? 0;
                    const adjustedVal = adjustedResult?.targetBaseValue ?? 0;
                    if (initialVal === 0 || initialVal === null || initialVal === undefined) return null;
                    const vsInitialAmount = adjustedVal - initialVal;
                    const vsInitialPercent = (vsInitialAmount / initialVal) * 100;
                    const isUp = vsInitialAmount > 0;
                    const isPosIndicator = isPositiveIndicator(targetNode.name);
                    const isGood = isPosIndicator ? vsInitialAmount > 0 : vsInitialAmount < 0;
                    const arrow = Math.abs(vsInitialAmount) < 0.0001 ? '-' : (isUp ? '▲' : '▼');
                    const colorClass = Math.abs(vsInitialAmount) < 0.0001 ? 'text-yellow-600' : (isGood ? 'text-blue-600' : 'text-orange-600');
                    return (
                      <span className={"ml-1 " + colorClass}>
                        {Math.abs(vsInitialAmount) > 0.0001 && <span className="mr-0.5">{arrow}</span>}
                        ({vsInitialAmount > 0 ? '+' : ''}{formatValue(vsInitialAmount, targetNode.format, targetNode.unit)}
                        <span className="ml-0.5">{vsInitialPercent > 0 ? '+' : ''}{vsInitialPercent.toFixed(2)}%</span>)
                      </span>
                    );
                  })()}
                </div>

                {/* 调整后 */}
                <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                  <span className="text-gray-600">💡 调整后:</span>
                  <span className="font-mono ml-1 font-bold">{formatValue(
                    adjustedResult?.targetBaseValue ?? 0,
                    targetNode.format,
                    targetNode.unit
                  )}</span>
                </div>

                {/* 目标值 */}
                <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                  <span className="text-gray-600">🎯 目标:</span>
                  <span className="font-mono ml-1">{formatValue(
                    sensitivityData.target?.[0]?.targetBaseValue ?? 0,
                    targetNode.format,
                    targetNode.unit
                  )}</span>
                  {/* 调整后 vs 目标 */}
                  {(() => {
                    const targetVal = sensitivityData.target?.[0]?.targetBaseValue ?? 0;
                    const adjustedVal = adjustedResult?.targetBaseValue ?? 0;
                    if (targetVal === 0 || targetVal === null || targetVal === undefined) return null;
                    const vsTargetAmount = adjustedVal - targetVal;
                    const vsTargetPercent = (vsTargetAmount / targetVal) * 100;
                    const isUp = vsTargetAmount > 0;
                    const isPosIndicator = isPositiveIndicator(targetNode.name);
                    const isGood = isPosIndicator ? vsTargetAmount > 0 : vsTargetAmount < 0;
                    const arrow = Math.abs(vsTargetAmount) < 0.0001 ? '-' : (isUp ? '▲' : '▼');
                    const colorClass = Math.abs(vsTargetAmount) < 0.0001 ? 'text-yellow-600' : (isGood ? 'text-green-600' : 'text-red-600');
                    return (
                      <span className={"ml-1 " + colorClass}>
                        {Math.abs(vsTargetAmount) > 0.0001 && <span className="mr-0.5">{arrow}</span>}
                        ({vsTargetAmount > 0 ? '+' : ''}{formatValue(vsTargetAmount, targetNode.format, targetNode.unit)}
                        <span className="ml-0.5">{vsTargetPercent > 0 ? '+' : ''}{vsTargetPercent.toFixed(2)}%</span>)
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 正负相关因素计数 */}
            <div className="flex items-center gap-4 ml-auto">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
                <span className="text-sm text-gray-600">正相关因素:</span>
                <span className="text-lg font-bold text-green-600">{safePositive.length}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg">
                <span className="text-sm text-gray-600">负相关因素:</span>
                <span className="text-lg font-bold text-red-600">{safeNegative.length}</span>
              </div>
            </div>
          </div>

          {/* 第三行：图例 */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-50 rounded border border-blue-200"></span> 初始值</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-50 rounded border border-green-200"></span> 调整后</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-50 rounded border border-yellow-200"></span> 目标值</span>
          </div>
        </div>

        {/* 主要内容 */}
        <div id="sensitivity-chart-container" className="flex-1 overflow-hidden flex bg-white">
          {activeTab === 'summary' ? (
            <>
              {/* 左侧：敏感性分析表格 */}
              <div className="flex-1 pr-6 pl-4 py-4 overflow-auto">
                {renderSummaryTable(safePositive, '📈 正相关因素（驱动↑ → 目标↑）', 'bg-green-100 text-green-800')}
                {renderSummaryTable(safeNegative, '📉 负相关因素（驱动↑ → 目标↓）', 'bg-red-100 text-red-800')}

                {safeAll.length === 0 && (
                  <div className="flex items-center justify-center h-40 text-gray-500">
                    请选择一个计算指标作为分析目标
                  </div>
                )}
              </div>

              {/* 分隔线 */}
              <div className="w-px bg-gray-200 flex-shrink-0" />

              {/* 右侧：TOP 5 最敏感因素 */}
              <div className="w-80 p-4 overflow-auto flex-shrink-0 bg-gray-50">
                <h3 className="text-sm font-bold text-gray-700 mb-3">📊 敏感性系数说明</h3>
                <div className="text-xs text-gray-600 mb-4 space-y-1">
                  <p>• <strong>敏感性系数</strong> = 目标指标变动% / 驱动因素变动%</p>
                  <p>• 例如：系数为 2.0 表示驱动因素每变动 1%，目标指标变动 2%</p>
                  <p>• 系数绝对值越大，说明该因素对目标的影响越大</p>
                  <p>• 系数为正表示正相关，系数为负表示负相关</p>
                </div>

                {safeAll.length > 0 && (
                  <>
                    {/* 正相关 TOP 5 */}
                    {safePositive.length > 0 && (
                      <>
                        <h3 className="text-sm font-bold text-gray-700 mb-3 mt-4">📈 正相关 TOP 5</h3>
                        <div className="space-y-2">
                          {[...safePositive]
                            .sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity))
                            .slice(0, 5)
                            .map((item, idx) => (
                              <div key={item.driverId} className={`p-2 rounded ${idx === 0 ? 'bg-green-100 border border-green-300' : 'bg-white'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-700">
                                    {idx === 0 && '🥇 '}
                                    {idx === 1 && '🥈 '}
                                    {idx === 2 && '🥉 '}
                                    {idx >= 3 && `${idx + 1}. `}
                                    {item.driverName}
                                  </span>
                                  <span className="text-sm font-bold font-mono text-green-600">
                                    {item.sensitivity.toFixed(3)}
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                                  <div
                                    className="h-full bg-green-500"
                                    style={{
                                      width: `${Math.min(100, Math.abs(item.sensitivity) * 10)}%`
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </>
                    )}

                    {/* 负相关 TOP 5 */}
                    {safeNegative.length > 0 && (
                      <>
                        <h3 className="text-sm font-bold text-gray-700 mb-3 mt-4">📉 负相关 TOP 5</h3>
                        <div className="space-y-2">
                          {[...safeNegative]
                            .sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity))
                            .slice(0, 5)
                            .map((item, idx) => (
                              <div key={item.driverId} className={`p-2 rounded ${idx === 0 ? 'bg-red-100 border border-red-300' : 'bg-white'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-700">
                                    {idx === 0 && '🥇 '}
                                    {idx === 1 && '🥈 '}
                                    {idx === 2 && '🥉 '}
                                    {idx >= 3 && `${idx + 1}. `}
                                    {item.driverName}
                                  </span>
                                  <span className="text-sm font-bold font-mono text-red-600">
                                    {item.sensitivity.toFixed(3)}
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                                  <div
                                    className="h-full bg-red-500"
                                    style={{
                                      width: `${Math.min(100, Math.abs(item.sensitivity) * 10)}%`
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          ) : activeTab === 'monthly' ? (
            // 分月分析
            <div className="flex-1 pr-6 pl-4 py-4 overflow-auto">
              <h3 className="text-sm font-bold text-gray-700 mb-3">📅 分月敏感性分析（敏感性系数）</h3>
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-50 rounded border border-blue-200"></span> 初始值</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-50 rounded border border-green-200"></span> 调整后</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-50 rounded border border-yellow-200"></span> 目标值</span>
              </div>
              {renderMonthlyTableSection(safePositive, '📈 正相关因素（驱动↑ → 目标↑）', 'bg-green-100 text-green-800')}
              {renderMonthlyTableSection(safeNegative, '📉 负相关因素（驱动↑ → 目标↓）', 'bg-red-100 text-red-800')}

              {safeAll.length === 0 && (
                <div className="flex items-center justify-center h-40 text-gray-500">
                  请选择一个计算指标作为分析目标
                </div>
              )}
            </div>
          ) : (
            // 趋势图
            <div className="flex-1 pr-6 pl-4 py-4 overflow-auto">
              <h3 className="text-sm font-bold text-gray-700 mb-3">📉 敏感性系数趋势图</h3>
              {renderTrendChart()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SensitivityAnalysisPanel;
