import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import useVDTStore from '../../store/useVDTStore';
import { callAI } from '../../services/aiService';
import { buildSmartTuningPrompt, buildTuningPrompt, parseAIResponse } from '../../utils/aiPromptBuilder';
import { extractBusinessContext, parseTuningRequest, isNaturalTuningMode } from '../../utils/nlUnderstanding';
import { parseDocument, extractKeyInformation, isSupportedFileType } from '../../utils/DocumentParser';

/**
 * 智能调参面板 - 全新设计
 * 支持自然语言业务背景输入、数据洞察、智能建议
 */
const AITuningPanel = ({ onClose, onBringToFront }) => {
  const nodes = useVDTStore((s) => s.nodes);
  const aiConfig = useVDTStore((s) => s.aiConfig);
  const updateNode = useVDTStore((s) => s.updateNode);
  const saveScenario = useVDTStore((s) => s.saveScenario);

  // ===== 状态定义 =====

  // 输入区域
  const [businessContext, setBusinessContext] = useState('');
  const [isAnalyzingContext, setIsAnalyzingContext] = useState(false);
  const [parsedContext, setParsedContext] = useState(null);

  // 文档上传
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const fileInputRef = useRef(null);

  // AI分析
  const [isLoading, setIsLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [editableAdjustments, setEditableAdjustments] = useState([]);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [showAddFactorModal, setShowAddFactorModal] = useState(false);
  const [error, setError] = useState(null);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  // UI状态
  const [expandedSections, setExpandedSections] = useState({
    understanding: true,
    dataAnalysis: true,
    adjustments: false,
    impact: true,
    explanation: false
  });
  const containerRef = useRef(null);

  // 窗口拖拽
  const [position, setPosition] = useState({ x: 150, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // ===== 计算属性 =====

  const driverNodes = useMemo(() => {
    return Object.values(nodes).filter((n) => n.type === 'driver');
  }, [nodes]);

  const computedNodes = useMemo(() => {
    return Object.values(nodes).filter((n) => n.type === 'computed');
  }, [nodes]);

  // ===== 业务背景分析 =====

  // 自动分析业务背景
  useEffect(() => {
    const analyzeContext = async () => {
      if (!businessContext.trim() || businessContext.length < 10) {
        setParsedContext(null);
        return;
      }

      setIsAnalyzingContext(true);
      try {
        const parsed = extractBusinessContext(businessContext, nodes);
        setParsedContext(parsed);
      } catch (err) {
        console.error('解析业务背景失败:', err);
      } finally {
        setIsAnalyzingContext(false);
      }
    };

    const debounceTimer = setTimeout(analyzeContext, 500);
    return () => clearTimeout(debounceTimer);
  }, [businessContext, nodes]);

  // ===== 文档上传处理 =====

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!isSupportedFileType(file)) {
      setError(`不支持的文件格式。支持：PDF、Word、Excel、TXT、MD`);
      return;
    }

    setIsParsingFile(true);
    setError(null);

    try {
      const result = await parseDocument(file);
      if (result.success) {
        setUploadedFile(result);
        // 将文档内容追加到业务背景
        const newContext = businessContext
          ? `${businessContext}\n\n【文档内容：${result.fileName}】\n${result.content}`
          : `【文档内容：${result.fileName}】\n${result.content}`;
        setBusinessContext(newContext);
      } else {
        setError(`解析文档失败：${result.error}`);
      }
    } catch (err) {
      setError(`上传文件失败：${err.message}`);
    } finally {
      setIsParsingFile(false);
      // 清空input以允许重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
  };

  // ===== AI智能调参 =====

  // 验证目标达成情况
  const validateTargetAchievement = (adjustments, context) => {
    if (!adjustments || adjustments.length === 0) return;

    // 1. 从业务背景中提取目标
    const contextLower = context.toLowerCase();

    // 提取净利润目标（如"净利润达到350万"）
    const profitMatch = context.match(/净利润.*?达到|目标.*?([\d.]+)\s*万/);
    const targetProfit = profitMatch ? parseFloat(profitMatch[1]) : null;

    // 2. 获取调整后的值
    const revenue = adjustments.find(a => a.nodeName?.includes('收入'))?.recommendedValue;
    const cost = adjustments.find(a => a.nodeName?.includes('成本'))?.recommendedValue;
    const salesExpense = adjustments.find(a => a.nodeName?.includes('销售费用'))?.recommendedValue;
    const mgmtExpense = adjustments.find(a => a.nodeName?.includes('管理费用'))?.recommendedValue;

    console.log('目标验证: 收入', revenue, '成本', cost, '销售费用', salesExpense, '管理费用', mgmtExpense);

    // 3. 计算预期净利润（简化计算）
    if (revenue && cost && salesExpense && mgmtExpense) {
      const expectedProfit = revenue - cost - salesExpense - mgmtExpense;
      console.log('目标验证: 预期净利润', expectedProfit, '目标', targetProfit);

      // 4. 对比目标
      if (targetProfit) {
        const gap = expectedProfit - targetProfit;
        const status = gap >= 0 ? '达标' : '未达标';
        const gapText = gap >= 0 ? `超出${Math.round(gap)}万` : `差距${Math.round(Math.abs(gap))}万`;

        console.log(`目标验证结果: ${status}，${gapText}`);

        // 将验证结果添加到 adjustments 中显示
        const validationResult = {
          _id: `validation_${Date.now()}`,
          nodeName: '📊 目标验证',
          currentValue: expectedProfit,
          recommendedValue: targetProfit,
          changePercent: 0,
          changeReason: `预期净利润${Math.round(expectedProfit)}万，目标${targetProfit}万，${gapText}`,
          dataBasis: '基于调整方案联动计算',
          businessReason: `收入${revenue} - 成本${cost} - 费用${salesExpense + mgmtExpense} = 净利润${Math.round(expectedProfit)}`,
          riskWarning: gap < 0 ? `⚠️ 当前方案无法达成目标，建议调整` : '✅ 方案可达成目标',
          monthlyStrategy: '验证结果',
          monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          confidence: 0.9,
          isValidation: true
        };

        // 添加到 adjustments 开头
        setEditableAdjustments(prev => [validationResult, ...prev]);
      }
    }
  };

  const runAITuning = async () => {
    if (!aiConfig.url || !aiConfig.model) {
      setError('请先配置AI参数（在设置中配置）');
      return;
    }

    if (!businessContext.trim()) {
      setError('请先描述业务背景和目标');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAiResult(null);

    try {
      // 判断使用新模式还是传统模式
      const useSmartMode = isNaturalTuningMode(businessContext);

      let prompt;
      if (useSmartMode && parsedContext) {
        // 使用新的智能Prompt
        prompt = buildSmartTuningPrompt({
          nodes,
          businessContext: parsedContext,
          constraints: parsedContext.constraints
        });
      } else {
        // 使用传统Prompt（兼容旧模式）
        const legacyParsed = parseTuningRequest(businessContext, [], nodes);
        prompt = buildTuningPrompt({
          nodes,
          tuningMode: 'initial',
          userGoal: legacyParsed.aiDescription,
          targetNodeId: legacyParsed.goal?.targetNodeId,
          targetValue: legacyParsed.goal?.targetValue
        });
      }

      const response = await callAI(aiConfig, [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]);

      // 调试：打印原始响应
      console.log('AI原始响应:', response.content);

      const parsed = parseAIResponse(response.content, { originalContext: businessContext });

      if (!parsed.success) {
        throw new Error(parsed.error || 'AI响应解析失败');
      }

      setAiResult(parsed.data);

      // 初始化可编辑的调整方案（添加唯一ID）
      const adjustments = parsed.data.adjustments || parsed.data.recommendations || [];
      setEditableAdjustments(adjustments.map((adj, i) => ({ ...adj, _id: `adj_${i}_${Date.now()}` })));
      setIsEditingMode(true);

      // 验证目标达成情况
      validateTargetAchievement(adjustments, businessContext);

      // 默认展开关键区域
      setExpandedSections(prev => ({
        ...prev,
        impact: true,
        adjustments: true
      }));

    } catch (err) {
      setError(err.message || 'AI调参失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== 应用建议 =====

  const applyRecommendations = (mode = 'all') => {
    // 使用用户编辑后的调整方案
    const recommendations = editableAdjustments.length > 0 ? editableAdjustments :
                           (aiResult?.adjustments || aiResult?.recommendations || []);

    console.log('AI调参: 应用调整方案', recommendations);

    if (recommendations.length === 0) {
      console.warn('AI调参: 没有可用的调整建议', aiResult);
      setError('AI 没有返回具体的调整建议。可能原因：\n1. AI 模型未正确理解 Prompt\n2. 驱动因子数据不足\n3. 请尝试重新分析，或检查 AI 配置');
      return;
    }

    console.log('AI调参: 开始应用建议', recommendations);

    let appliedCount = 0;

    // 辅助函数：根据nodeName查找匹配的nodeId
    const findNodeIdByName = (nodeId, nodeName) => {
      // 首先尝试直接匹配nodeId
      if (nodes[nodeId]) return nodeId;

      // 如果直接匹配失败，尝试根据nodeName匹配
      if (nodeName) {
        const allNodes = Object.entries(nodes);

        // 1. 首先尝试精确匹配名称（最高优先级）
        for (const [id, node] of allNodes) {
          if (node.name === nodeName) {
            console.log('AI调参: 精确匹配到节点', id, node.name);
            return id;
          }
        }

        // 2. 尝试nodeName包含节点名（如"销售费用_华东"包含"销售费用"）
        for (const [id, node] of allNodes) {
          if (node.name?.includes(nodeName)) {
            console.log('AI调参: 包含匹配到节点', id, node.name, '包含', nodeName);
            return id;
          }
        }

        // 3. 尝试节点名包含nodeName（如"销售费用"被"华东销售费用"包含）
        for (const [id, node] of allNodes) {
          if (nodeName.includes(node.name)) {
            console.log('AI调参: 被包含匹配到节点', id, node.name, '被包含于', nodeName);
            return id;
          }
        }

        // 4. 如果有多个匹配，选择type为driver的节点（驱动因子优先）
        const driverMatches = [];
        for (const [id, node] of allNodes) {
          if (node.type === 'driver' && (node.name?.includes(nodeName) || nodeName.includes(node.name))) {
            driverMatches.push({id, node});
          }
        }
        if (driverMatches.length === 1) {
          console.log('AI调参: 唯一驱动因子匹配', driverMatches[0].id, driverMatches[0].node.name);
          return driverMatches[0].id;
        }
        if (driverMatches.length > 1) {
          // 多个驱动因子匹配，返回第一个并警告
          console.warn('AI调参: 多个驱动因子匹配', nodeName, driverMatches.map(m => ({id: m.id, name: m.node.name})));
          return driverMatches[0].id;
        }

        // 5. 最后尝试关键字匹配（最低优先级）
        const keywords = nodeName.split(/[\s\-_]/).filter(k => k.length > 1);
        for (const keyword of keywords) {
          for (const [id, node] of allNodes) {
            if (node.name?.includes(keyword) && node.type === 'driver') {
              console.log('AI调参: 关键字匹配到节点', id, node.name, '关键字:', keyword);
              return id;
            }
          }
        }
      }

      console.warn('AI调参: 无法匹配节点', nodeId, nodeName);
      return null;
    };

    recommendations.forEach((rec) => {
      console.log('AI调参: 处理调整项', rec.nodeId, rec.nodeName, '推荐值:', rec.recommendedValue);

      if (rec.recommendedValue !== undefined) {
        const numericValue = parseFloat(rec.recommendedValue);
        const currentValue = parseFloat(rec.currentValue) || 1;

        if (!isNaN(numericValue)) {
          // 智能匹配nodeId
          let matchedNodeId = findNodeIdByName(rec.nodeId, rec.nodeName);

          if (!matchedNodeId) {
            console.warn('AI调参: 找不到节点', rec.nodeId, rec.nodeName, '可用节点:', Object.keys(nodes).map(id => ({id, name: nodes[id]?.name})));
            return;
          }

          const node = nodes[matchedNodeId];
          console.log('AI调参: 找到节点', matchedNodeId, '名称:', node.name, '当前值:', node.value, 'timeData存在:', !!node.timeData);

          const updates = { value: numericValue };

          // 同步更新月度数据
          if (node?.timeData && currentValue !== 0) {
            const newTimeData = {};
            const existingKeys = Object.keys(node.timeData || {});

            // 优先使用 AI 返回的 monthlyFactors 进行策略性分配
            if (rec.monthlyFactors && Array.isArray(rec.monthlyFactors) && rec.monthlyFactors.length >= 12) {
              // 复制现有的 timeData，保留原有数据结构
              Object.assign(newTimeData, node.timeData);

              // 计算1-8月实际值总和（这部分应该保持不变）
              let actualValueSum = 0;
              const actualValues = {}; // 存储1-8月的实际值

              for (let monthNum = 1; monthNum <= 8; monthNum++) {
                const actualKey = existingKeys.find(k => k.includes(`${monthNum}月`) && k.includes('实际'));
                const monthOnlyKey = existingKeys.find(k => k === `${monthNum}月`);
                const targetKey = existingKeys.find(k => k.includes(`${monthNum}月`) && k.includes('目标'));
                const forecastKey = existingKeys.find(k => k.includes(`${monthNum}月`) && k.includes('预测'));

                let value = null;
                if (actualKey && node.timeData[actualKey]) {
                  value = parseFloat(node.timeData[actualKey]);
                } else if (monthOnlyKey && node.timeData[monthOnlyKey]) {
                  value = parseFloat(node.timeData[monthOnlyKey]);
                } else if (targetKey && node.timeData[targetKey]) {
                  value = parseFloat(node.timeData[targetKey]);
                }

                if (value && !isNaN(value)) {
                  actualValues[monthNum] = value;
                  actualValueSum += value;
                }
              }

              // 9-12月需要分配的目标值 = 总目标值 - 1-8月实际值
              const remainingForForecast = Math.max(0, numericValue - actualValueSum);

              // 计算9-12月的策略系数总和
              const forecastFactorSum = rec.monthlyFactors.slice(8, 12).reduce((sum, f) => sum + f, 0);

              // 9-12月：使用策略系数分配剩余目标值
              rec.monthlyFactors.slice(8, 12).forEach((factor, index) => {
                const monthNum = index + 9;

                // 根据策略系数比例分配
                const proportion = forecastFactorSum > 0 ? factor / forecastFactorSum : 0.25;
                const strategyValue = Math.round(remainingForForecast * proportion * 100) / 100;

                // 尝试找到对应月份的 key
                const forecastKey = existingKeys.find(k => k.includes(`${monthNum}月`) && k.includes('预测'));
                const monthOnlyKey = existingKeys.find(k => k === `${monthNum}月`);
                const targetKey = existingKeys.find(k => k.includes(`${monthNum}月`) && k.includes('目标'));

                if (forecastKey) {
                  newTimeData[forecastKey] = strategyValue;
                } else if (monthOnlyKey) {
                  newTimeData[monthOnlyKey] = strategyValue;
                } else if (targetKey) {
                  newTimeData[targetKey] = strategyValue;
                } else {
                  newTimeData[`${monthNum}月预测`] = strategyValue;
                }
              });

              console.log('AI调参: 智能月度分配', rec.nodeName,
                '目标总值:', numericValue,
                '1-8月实际总和:', actualValueSum,
                '9-12月剩余分配:', remainingForForecast,
                'factors:', rec.monthlyFactors.slice(8, 12),
                '生成的timeData:', newTimeData);
            } else {
              // 回退到比例法（统一比例）
              const ratio = numericValue / currentValue;
              Object.entries(node.timeData).forEach(([key, val]) => {
                const numVal = parseFloat(val);
                if (!isNaN(numVal)) {
                  newTimeData[key] = Math.round(numVal * ratio * 100) / 100;
                } else {
                  newTimeData[key] = val;
                }
              });
              console.log('AI调参: 使用比例法月度分配', rec.nodeName, 'ratio:', ratio);
            }

            updates.timeData = newTimeData;

            // 计算新的 initialBaseline（实际+预测的总和或平均值）
            // 注意：这里应该使用聚合后的总值，而不是重新计算
            // 对于 sum 类型：initialBaseline = 1-8月实际 + 9-12月预测
            // 对于 average 类型：initialBaseline = (1-8月实际 + 9-12月预测) / 12
            const aggType = node.aggregationType || (node.unit === '%' ? 'average' : 'sum');

            // 从新分配的 timeData 中计算
            let newActualTotal = 0;
            let newForecastTotal = 0;
            let actualCount = 0;
            let forecastCount = 0;

            Object.entries(newTimeData).forEach(([key, value]) => {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                if (key.includes('实际')) {
                  newActualTotal += numValue;
                  actualCount++;
                } else if (key.includes('预测')) {
                  newForecastTotal += numValue;
                  forecastCount++;
                } else if (key.includes('月') && !key.includes('目标')) {
                  // 对于没有明确标识的月份数据，根据月份判断
                  const monthMatch = key.match(/(\d+)月/);
                  if (monthMatch) {
                    const monthNum = parseInt(monthMatch[1]);
                    if (monthNum <= 8) {
                      newActualTotal += numValue;
                      actualCount++;
                    } else {
                      newForecastTotal += numValue;
                      forecastCount++;
                    }
                  }
                }
              }
            });

            const totalValue = newActualTotal + newForecastTotal;
            const totalCount = actualCount + forecastCount;

            if (totalCount > 0) {
              if (aggType === 'average') {
                updates.initialBaseline = Math.round(totalValue / totalCount * 100) / 100;
              } else {
                // sum 类型：直接使用总值
                updates.initialBaseline = Math.round(totalValue * 100) / 100;
              }
              console.log('AI调参: 重新计算initialBaseline', rec.nodeName,
                '实际:', newActualTotal, '预测:', newForecastTotal,
                '总计:', totalValue, '新基线:', updates.initialBaseline,
                '聚合方式:', aggType);
            } else {
              // 如果没有 timeData，直接使用目标值
              updates.initialBaseline = numericValue;
            }
          }

          updateNode(matchedNodeId, updates);
          appliedCount++;
          console.log('AI调参: 已更新节点', matchedNodeId, '从', rec.currentValue, '到', numericValue, 'updates:', updates);
        } else {
          console.warn('AI调参: 推荐值不是有效数字', rec.nodeId, rec.recommendedValue);
        }
      } else {
        console.warn('AI调参: 推荐值未定义', rec.nodeId, rec);
      }
    });

    console.log('AI调参: 共应用了', appliedCount, '条建议');
    setAppliedCount(appliedCount);

    // 显示保存提示，而不是立即关闭
    if (appliedCount > 0) {
      setShowSavePrompt(true);
    } else {
      onClose();
    }
  };

  const saveAsScenario = () => {
    const scenarioName = `AI优化_${new Date().toLocaleDateString()}`;
    saveScenario(scenarioName);
    setShowSavePrompt(false);
    onClose();
  };

  const skipSaveScenario = () => {
    setShowSavePrompt(false);
    onClose();
  };

  // ===== 可编辑调整方案相关函数 =====

  const handleUpdateAdjustment = (id, updated) => {
    setEditableAdjustments(prev => prev.map(adj =>
      adj._id === id ? { ...adj, ...updated } : adj
    ));
  };

  const handleDeleteAdjustment = (id) => {
    setEditableAdjustments(prev => prev.filter(adj => adj._id !== id));
  };

  const handleAddAdjustment = (nodeId, nodeName, currentValue) => {
    const node = nodes[nodeId];

    // 智能判断策略类型
    // 1. 如果是成本类因子（名称包含成本、费用等），且有子节点关联收入，使用比例跟随
    // 2. 否则使用平均分配
    const isCostFactor = /成本|费用|支出|Cost|Expense/i.test(nodeName);
    const hasRevenueChildren = node?.children?.some(childId => {
      const child = nodes[childId];
      return child && /收入|Revenue|Sales/i.test(child.name);
    });

    let monthlyStrategy, monthlyFactors, strategyBadge;

    if (isCostFactor && hasRevenueChildren) {
      // 比例跟随型 - 跟随收入波动
      monthlyStrategy = '比例跟随型';
      monthlyFactors = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3, 1.4];
      strategyBadge = '比例跟随';
    } else if (isCostFactor) {
      // 成本优化型 - 前低后高
      monthlyStrategy = '成本优化型';
      monthlyFactors = [1.1, 1.05, 1.0, 1.0, 0.95, 0.95, 0.9, 0.9, 0.85, 0.85, 0.8, 0.75];
      strategyBadge = '成本优化';
    } else if (/收入|Revenue|Sales/i.test(nodeName)) {
      // 收入增长型 - 前低后高（旺季在后面）
      monthlyStrategy = '收入增长型';
      monthlyFactors = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3, 1.4];
      strategyBadge = '收入增长';
    } else {
      // 默认平均分配
      monthlyStrategy = '平均分配';
      monthlyFactors = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
      strategyBadge = '平均分配';
    }

    const newAdjustment = {
      _id: `adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      nodeId,
      nodeName,
      currentValue,
      recommendedValue: currentValue,
      changePercent: 0,
      changeReason: '用户手动添加',
      dataBasis: `智能策略：${strategyBadge}`,
      businessReason: '补充调整方案',
      riskWarning: '需关注调整影响',
      monthlyStrategy,
      monthlyFactors,
      confidence: 0.7,
      isManualAdd: true
    };
    setEditableAdjustments(prev => [...prev, newAdjustment]);
  };

  // 关闭模态框的单独函数
  const closeAddFactorModal = () => {
    setShowAddFactorModal(false);
  };

  // ===== UI辅助函数 =====

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // ===== 拖拽逻辑 =====

  const handleMouseDown = (e) => {
    if (e.target.closest('.ai-tuning-content')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    onBringToFront?.();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(0, e.clientX - dragOffset.x),
        y: Math.max(0, e.clientY - dragOffset.y)
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // ===== 渲染辅助组件 =====

  const SectionHeader = ({ title, icon, expanded, onToggle, badge }) => (
    <div
      className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="font-medium text-gray-800">{title}</span>
        {badge && (
          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <svg
        className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );

  const InsightCard = ({ icon, title, value, subtitle, type = 'info' }) => {
    const colors = {
      info: 'bg-blue-50 text-blue-700 border-blue-200',
      success: 'bg-green-50 text-green-700 border-green-200',
      warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      danger: 'bg-red-50 text-red-700 border-red-200'
    };

    return (
      <div className={`p-3 rounded-lg border ${colors[type]}`}>
        <div className="flex items-center gap-2 mb-1">
          <span>{icon}</span>
          <span className="text-xs font-medium opacity-75">{title}</span>
        </div>
        <div className="text-lg font-semibold">{value}</div>
        {subtitle && <div className="text-xs opacity-75 mt-1">{subtitle}</div>}
      </div>
    );
  };

  // ===== 可编辑调整卡片组件 =====

  const EditableAdjustmentCard = ({ adjustment, index, isEditing, onUpdate, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [inputValue, setInputValue] = useState(String(adjustment.recommendedValue ?? adjustment.currentValue ?? 0));

    // 同步外部值到内部输入状态
    useEffect(() => {
      setInputValue(String(adjustment.recommendedValue ?? adjustment.currentValue ?? 0));
    }, [adjustment.recommendedValue, adjustment.currentValue]);

    const handleValueChange = (e) => {
      const rawValue = e.target.value;
      setInputValue(rawValue);

      // 尝试解析数字
      const numValue = parseFloat(rawValue);
      if (!isNaN(numValue)) {
        const changePercent = adjustment.currentValue !== 0
          ? ((numValue - adjustment.currentValue) / adjustment.currentValue) * 100
          : 0;
        onUpdate({
          recommendedValue: numValue,
          changePercent: Math.round(changePercent * 100) / 100
        });
      }
    };

    const handleBlur = () => {
      // 失去焦点时，如果输入无效则恢复为推荐值
      const numValue = parseFloat(inputValue);
      if (isNaN(numValue)) {
        setInputValue(String(adjustment.recommendedValue ?? adjustment.currentValue ?? 0));
      }
    };

    return (
      <div className={`p-3 border rounded-lg transition-colors ${adjustment.derived ? 'border-dashed border-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-300'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800">{adjustment.nodeName}</span>
            {adjustment.derived && (
              <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">AI推导</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <input
                type="number"
                step="any"
                value={adjustment.recommendedValue}
                onChange={(e) => {
                  const numValue = parseFloat(e.target.value);
                  if (!isNaN(numValue)) {
                    const changePercent = adjustment.currentValue !== 0
                      ? ((numValue - adjustment.currentValue) / adjustment.currentValue) * 100
                      : 0;
                    onUpdate({
                      recommendedValue: numValue,
                      changePercent: Math.round(changePercent * 100) / 100
                    });
                  }
                }}
                className="w-24 px-2 py-1 text-sm border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none text-right"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={`text-sm ${adjustment.changePercent > 0 ? 'text-red-600' : adjustment.changePercent < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                {adjustment.changePercent > 0 ? '+' : ''}{adjustment.changePercent?.toFixed(1)}%
              </span>
            )}
            <button
              onClick={() => onDelete()}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="删除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <span>{adjustment.currentValue?.toLocaleString()} → </span>
          <span className="font-semibold text-indigo-600">{adjustment.recommendedValue?.toLocaleString()}</span>
        </div>

        {/* 详细说明 - 可折叠 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {isExpanded ? '收起详情' : '查看详情'}
        </button>

        {isExpanded && (
          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
            {adjustment.dataBasis && (
              <div className="text-xs text-gray-500">
                <span className="font-medium">数据依据：</span>{adjustment.dataBasis}
              </div>
            )}
            {adjustment.businessReason && (
              <div className="text-xs text-gray-500">
                <span className="font-medium">业务理由：</span>{adjustment.businessReason}
              </div>
            )}
            {adjustment.riskWarning && (
              <div className="text-xs text-yellow-600">
                <span className="font-medium">⚠️ 风险提示：</span>{adjustment.riskWarning}
              </div>
            )}
          </div>
        )}

        {/* 月度策略 */}
        {adjustment.monthlyStrategy && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
              📅 {adjustment.monthlyStrategy}
            </span>
            {adjustment.confidence && (
              <span className="text-xs text-gray-400">
                置信度: {Math.round(adjustment.confidence * 100)}%
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  // ===== 添加因子模态框组件（支持多选和搜索） =====

  const AddFactorModal = ({ onClose, onAdd }) => {
    const [selectedNodes, setSelectedNodes] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    // 获取所有可调整的驱动因子（排除已在列表中的）
    const availableNodes = Object.values(nodes).filter(node =>
      node.type === 'driver' &&
      !editableAdjustments.some(adj => adj.nodeId === node.id)
    );

    // 根据搜索词过滤
    const filteredNodes = availableNodes.filter(node =>
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.id && node.id.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const toggleSelection = (nodeId) => {
      setSelectedNodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        return newSet;
      });
    };

    const handleAdd = () => {
      selectedNodes.forEach(nodeId => {
        const node = nodes[nodeId];
        if (node) {
          const currentValue = node.value ?? node.baseline ?? node.initialBaseline ?? 0;
          onAdd(node.id, node.name, currentValue);
        }
      });
      onClose();
    };

    const selectAll = () => {
      if (selectedNodes.size === filteredNodes.length) {
        setSelectedNodes(new Set());
      } else {
        setSelectedNodes(new Set(filteredNodes.map(n => n.id)));
      }
    };

    if (availableNodes.length === 0) {
      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={onClose}>
          <div className="bg-white rounded-lg p-6 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-2">添加驱动因子</h3>
            <p className="text-sm text-gray-500 mb-4">所有驱动因子已添加</p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              关闭
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={onClose}>
        <div className="bg-white rounded-lg p-6 w-[500px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">添加驱动因子</h3>
            <span className="text-sm text-gray-500">
              已选 {selectedNodes.size} 个
            </span>
          </div>

          {/* 搜索框 */}
          <div className="mb-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="搜索驱动因子..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* 全选按钮 */}
          <div className="flex items-center gap-2 mb-2 px-2">
            <input
              type="checkbox"
              checked={filteredNodes.length > 0 && selectedNodes.size === filteredNodes.length}
              onChange={selectAll}
              className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
            />
            <span className="text-sm text-gray-600">全选</span>
          </div>

          {/* 因子列表 */}
          <div className="flex-1 overflow-y-auto space-y-2 mb-4 max-h-80">
            {filteredNodes.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                未找到匹配的驱动因子
              </div>
            ) : (
              filteredNodes.map(node => (
                <div
                  key={node.id}
                  onClick={() => toggleSelection(node.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedNodes.has(node.id)
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedNodes.has(node.id)}
                    onChange={() => {}}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{node.name}</div>
                    <div className="text-xs text-gray-500">
                      当前值: {((node.value ?? node.baseline ?? node.initialBaseline ?? 0)).toLocaleString()} {node.unit || ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 底部按钮 */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              取消
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedNodes.size === 0}
              className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50"
            >
              添加 ({selectedNodes.size})
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===== 主渲染 =====

  return (
    <div
      ref={containerRef}
      className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 w-[800px] h-[85vh] max-h-[900px] flex flex-col resize overflow-auto"
      style={{ left: position.x, top: position.y, zIndex: 100, minWidth: '640px', minHeight: '500px' }}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-t-lg cursor-move shrink-0"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-white font-medium">AI智能调参</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto ai-tuning-content">
        {/* ===== 输入区域 ===== */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              描述业务背景和目标
            </label>
            <span className="text-xs text-gray-400">支持自然语言描述</span>
          </div>

          <textarea
            value={businessContext}
            onChange={(e) => setBusinessContext(e.target.value)}
            placeholder={"例如：Q4是销售旺季，公司计划加大市场推广力度，销售费用可以适当增加用于广告投放。同时我们希望优化管理费用，目标净利润增长20%。"}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none"
          />

          {/* 快捷提示 */}
          <div className="flex gap-2 mt-2">
            {['Q4旺季冲刺', '控制成本', '提升利润'].map((tip) => (
              <button
                key={tip}
                onClick={() => setBusinessContext(prev =>
                  prev ? `${prev}\n${tip}：` : `${tip}：`
                )}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
              >
                + {tip}
              </button>
            ))}
          </div>

          {/* 文档上传 */}
          <div className="mt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.xlsx,.xls,.docx,.doc,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsingFile}
              className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors border border-dashed border-indigo-300 hover:border-indigo-400"
            >
              {isParsingFile ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  解析中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  上传经营计划文档
                </>
              )}
            </button>
            <span className="text-xs text-gray-400 ml-2">支持 PDF、Word、Excel、TXT、MD</span>
          </div>

          {/* 上传的文件显示 */}
          {uploadedFile && (
            <div className="mt-2 p-2 bg-indigo-50 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-indigo-700">{uploadedFile.fileName}</span>
              </div>
              <button
                onClick={clearUploadedFile}
                className="text-indigo-400 hover:text-indigo-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ===== AI理解摘要（实时显示） ===== */}
        {(isAnalyzingContext || parsedContext) && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700">AI理解摘要</span>
              {isAnalyzingContext && (
                <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
            </div>
            {parsedContext?.summary && (
              <div className="text-sm text-gray-600 bg-white p-3 rounded-lg border border-gray-200">
                {parsedContext.summary}
              </div>
            )}
            {parsedContext?.goals?.length > 0 && (
              <div className="flex gap-2 mt-2">
                {parsedContext.goals.map((goal, i) => (
                  <span key={i} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                    🎯 {goal.description}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 开始分析按钮 ===== */}
        <div className="p-4">
          <button
            onClick={runAITuning}
            disabled={isLoading || !businessContext.trim()}
            className="w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                智能分析中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                开始智能分析
              </>
            )}
          </button>
        </div>

        {/* ===== 错误提示 ===== */}
        {error && (
          <div className="px-4 pb-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">{error}</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== AI分析结果 ===== */}
        {aiResult && (
          <div className="border-t border-gray-200">
            {/* 业务理解 */}
            {aiResult.understanding && (
              <div className="border-b border-gray-200">
                <SectionHeader
                  title="业务理解"
                  icon="📝"
                  expanded={expandedSections.understanding}
                  onToggle={() => toggleSection('understanding')}
                />
                {expandedSections.understanding && (
                  <div className="p-4 space-y-3">
                    <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                      {aiResult.understanding.businessContext}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {aiResult.understanding.keyGoals?.length > 0 && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">关键目标</div>
                          <div className="space-y-1">
                            {aiResult.understanding.keyGoals.map((goal, i) => (
                              <div key={i} className="text-sm text-green-700">• {goal}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {aiResult.understanding.constraints?.length > 0 && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">约束条件</div>
                          <div className="space-y-1">
                            {aiResult.understanding.constraints.map((c, i) => (
                              <div key={i} className="text-sm text-orange-700">• {c}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 数据洞察 */}
            {aiResult.dataAnalysis && (
              <div className="border-b border-gray-200">
                <SectionHeader
                  title="数据洞察"
                  icon="📊"
                  expanded={expandedSections.dataAnalysis}
                  onToggle={() => toggleSection('dataAnalysis')}
                />
                {expandedSections.dataAnalysis && (
                  <div className="p-4 space-y-4">
                    {/* 趋势 */}
                    {aiResult.dataAnalysis.trends?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">趋势分析</div>
                        <div className="space-y-2">
                          {aiResult.dataAnalysis.trends.map((trend, i) => (
                            <div key={i} className="flex items-center gap-3 p-2 bg-blue-50 rounded">
                              <span className="text-sm font-medium text-blue-800">{trend.factor}</span>
                              <span className="text-sm text-blue-600">{trend.pattern}</span>
                              {trend.seasonality && (
                                <span className="text-xs text-blue-500">📅 {trend.seasonality}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 敏感性 */}
                    {aiResult.dataAnalysis.sensitivity?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">敏感性分析</div>
                        <div className="grid grid-cols-1 gap-2">
                          {aiResult.dataAnalysis.sensitivity.slice(0, 3).map((s, i) => (
                            <div key={i} className="flex items-center justify-between p-2 bg-purple-50 rounded">
                              <span className="text-sm text-purple-800">{s.factor}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  s.impact === 'high' ? 'bg-red-100 text-red-700' :
                                  s.impact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {s.impact === 'high' ? '高影响' : s.impact === 'medium' ? '中影响' : '低影响'}
                                </span>
                                {s.elasticity && (
                                  <span className="text-xs text-purple-600">弹性: {s.elasticity}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 风险 */}
                    {aiResult.dataAnalysis.risks?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">风险提示</div>
                        <div className="space-y-2">
                          {aiResult.dataAnalysis.risks.map((risk, i) => (
                            <div key={i} className="flex items-start gap-2 p-2 bg-yellow-50 rounded">
                              <span className="text-yellow-600">⚠️</span>
                              <div>
                                <span className="text-sm font-medium text-yellow-800">{risk.factor}</span>
                                <p className="text-xs text-yellow-600">{risk.description}</p>
                                {risk.recommendation && (
                                  <p className="text-xs text-yellow-700 mt-1">💡 {risk.recommendation}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 预期效果 */}
            {aiResult.expectedImpact && (
              <div className="border-b border-gray-200">
                <SectionHeader
                  title="预期效果"
                  icon="✨"
                  expanded={expandedSections.impact}
                  onToggle={() => toggleSection('impact')}
                />
                {expandedSections.impact && (
                  <div className="p-4 space-y-4">
                    {/* 关键指标 */}
                    {aiResult.expectedImpact.keyMetrics?.length > 0 && (
                      <div className="grid grid-cols-1 gap-3">
                        {aiResult.expectedImpact.keyMetrics.map((metric, i) => (
                          <div key={i} className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-green-800">{metric.name}</span>
                              {metric.probability && (
                                <span className="text-xs text-green-600">概率: {metric.probability}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-gray-500">{metric.before?.toLocaleString()}</span>
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                              </svg>
                              <span className="text-xl font-bold text-green-700">{metric.after?.toLocaleString()}</span>
                              <span className="text-sm text-green-600">{metric.change}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 情景分析 */}
                    {aiResult.expectedImpact.sensitivityScenario?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">情景分析</div>
                        <div className="grid grid-cols-3 gap-2">
                          {aiResult.expectedImpact.sensitivityScenario.map((scenario, i) => (
                            <div key={i} className={`p-2 rounded text-center ${
                              scenario.scenario === '乐观' ? 'bg-green-50 text-green-700' :
                              scenario.scenario === '悲观' ? 'bg-red-50 text-red-700' :
                              'bg-blue-50 text-blue-700'
                            }`}>
                              <div className="text-xs opacity-75">{scenario.scenario}</div>
                              <div className="font-semibold">{scenario.profit?.toLocaleString()}</div>
                              {scenario.assumption && (
                                <div className="text-xs opacity-75 mt-1 truncate">{scenario.assumption}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiResult.expectedImpact.summary && (
                      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                        {aiResult.expectedImpact.summary}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 调整详情 */}
            {(editableAdjustments)?.length > 0 && (
              <div className="border-b border-gray-200">
                <SectionHeader
                  title="调整详情"
                  icon="🔧"
                  badge={`${editableAdjustments.length}项`}
                  expanded={expandedSections.adjustments}
                  onToggle={() => toggleSection('adjustments')}
                />
                {expandedSections.adjustments && (
                  <div className="p-4 space-y-3">
                    {/* 添加因子按钮 */}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => setShowAddFactorModal(true)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        添加驱动因子
                      </button>
                      {editableAdjustments.length > 0 && (
                        <button
                          onClick={() => setIsEditingMode(!isEditingMode)}
                          className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                            isEditingMode ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          {isEditingMode ? '完成编辑' : '编辑数值'}
                        </button>
                      )}
                    </div>

                    {editableAdjustments.map((adj, i) => (
                      <EditableAdjustmentCard
                        key={adj._id}
                        adjustment={adj}
                        index={i}
                        isEditing={isEditingMode}
                        onUpdate={(updated) => handleUpdateAdjustment(adj._id, updated)}
                        onDelete={() => handleDeleteAdjustment(adj._id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI完整推理 */}
            {aiResult.explanation && (
              <div className="border-b border-gray-200">
                <SectionHeader
                  title="AI完整推理"
                  icon="🧠"
                  expanded={expandedSections.explanation}
                  onToggle={() => toggleSection('explanation')}
                />
                {expandedSections.explanation && (
                  <div className="p-4">
                    <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                      {aiResult.explanation}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="p-4 bg-gray-50">
              {!showSavePrompt ? (
                // 默认按钮组
                <div className="flex gap-3">
                  <button
                    onClick={() => applyRecommendations('all')}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg font-medium transition-colors"
                  >
                    一键应用全部
                  </button>
                  <button
                    onClick={() => {
                      setAiResult(null);
                      setBusinessContext('');
                      setParsedContext(null);
                      setShowSavePrompt(false);
                    }}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors"
                  >
                    重新分析
                  </button>
                </div>
              ) : (
                // 应用后的提示
                <div className="space-y-3">
                  <div className="text-center text-sm text-gray-600">
                    <span className="font-medium text-green-600">✓</span> 已成功应用 {appliedCount} 个调整
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={saveAsScenario}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white rounded-lg font-medium transition-colors"
                    >
                      保存为新方案
                    </button>
                    <button
                      onClick={skipSaveScenario}
                      className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors"
                    >
                      不用保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 添加因子模态框 */}
        {showAddFactorModal && (
          <AddFactorModal
            onClose={() => setShowAddFactorModal(false)}
            onAdd={handleAddAdjustment}
          />
        )}
      </div>
    </div>
  );
};

export default AITuningPanel;
