import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import useVDTStore from '../../store/useVDTStore';
import { callAI } from '../../services/aiService';
import { buildSmartTuningPrompt, parseAIResponse } from '../../utils/aiPromptBuilder';
import { extractBusinessContext } from '../../utils/nlUnderstanding';
import { parseDocument, extractKeyInformation, isSupportedFileType } from '../../utils/DocumentParser';
import knowledgeService from '../../services/knowledgeService';
import { fallbackStrategyEngine } from '../../engine/FallbackStrategyEngine';
import { consistencyValidationEngine } from '../../engine/ConsistencyValidationEngine';
import { executeUnionDecision, convertToAIFORMat } from '../../engine/UnionDecisionEngine';
import { formatValue } from '../../utils/formatters';
import { parseConstraints } from '../../utils/constraintParser';
import NodeSelector from './NodeSelector';
import { TEST_VERSION } from '../../test-version';
import ConstraintRulePanel from './ConstraintRulePanel';
import FactorAliasPanel from './FactorAliasPanel';

// ===== 调试日志：验证代码加载 =====
console.log('[AITuningPanel] 模块加载成功！DEBUG-20260317-NEW'); console.warn('⚠️️⚠️ DEBUG LOG - 如果看到这个说明代码已加载 ⚠️️⚠️！时间:', new Date().toLocaleTimeString());
console.log('🔧 [AITuningPanel] TEST_VERSION:', TEST_VERSION);

/**
 * 智能调参面板 - 全新设计
 * 支持自然语言业务背景输入、数据洞察、智能建议
 */
const AITuningPanel = ({ onClose, onBringToFront, selectedScenarios = [] }) => {
  console.log('🔥 [AITuningPanel] 组件被渲染！时间:', new Date().toLocaleTimeString());
  console.log('🔥 [AITuningPanel] selectedScenarios:', selectedScenarios);

  const nodes = useVDTStore((s) => s.nodes);
  const aiConfig = useVDTStore((s) => s.aiConfig);
  const updateNode = useVDTStore((s) => s.updateNode);
  const saveScenario = useVDTStore((s) => s.saveScenario);

  // 检查模型是否已加载
  const hasModel = useMemo(() => {
    const nodeCount = Object.keys(nodes).length;
    if (nodeCount === 0) {
      console.warn('[AITuningPanel] 模型未加载，无法执行 AI 调参');
      return false;
    }

    // 检查是否有计算指标（用于公式计算）
    const computedNodes = Object.values(nodes).filter(n => n.type === 'computed');
    const driverNodes = Object.values(nodes).filter(n => n.type === 'driver');

    console.log('[AITuningPanel] 模型检查:', {
      totalNodes: nodeCount,
      driverNodes: driverNodes.length,
      computedNodes: computedNodes.length,
      hasModel: true
    });

    return nodeCount > 0;
  }, [nodes]);

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
  const [validationResult, setValidationResult] = useState(null); // 目标验证结果（单独存储，不显示在调整列表中）
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [showAddFactorModal, setShowAddFactorModal] = useState(false);
  const [error, setError] = useState(null);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [showRulePanel, setShowRulePanel] = useState(false); // 规则管理面板
  const [showAliasPanel, setShowAliasPanel] = useState(false); // 别名管理面板
  const [enableAIFallback, setEnableAIFallback] = useState(true); // AI 语义兜底，默认启用

  // 节点选择状态
  const [nodeSelectorMode, setNodeSelectorMode] = useState('auto');
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [conflictWarnings, setConflictWarnings] = useState([]);

  // 冲突检测：当业务背景或选择变化时，检测冲突
  useEffect(() => {
    if (nodeSelectorMode !== 'manual' || !businessContext) {
      setConflictWarnings([]);
      return;
    }

    const warnings = [];

    // 从业务背景中提取提到的因子
    const mentionedFactors = [];
    const driverNodes = Object.values(nodes).filter(n => n.type === 'driver');

    driverNodes.forEach(node => {
      if (businessContext.includes(node.name)) {
        mentionedFactors.push({ id: node.id, name: node.name });
      }
    });

    // 检查是否有提到的因子不在选择范围内
    const unselectedFactors = mentionedFactors.filter(
      f => !selectedDrivers.includes(f.id)
    );

    if (unselectedFactors.length > 0) {
      warnings.push({
        type: 'factor_conflict',
        message: `业务背景中提到了"${unselectedFactors.map(f => f.name).join('、')}"，但您未选择这些因子作为可调整范围。是否添加？`,
        confirmText: '添加选中的因子',
        onConfirm: () => {
          const newDrivers = [...new Set([...selectedDrivers, ...unselectedFactors.map(f => f.id)])];
          setSelectedDrivers(newDrivers);
          setConflictWarnings([]);
        }
      });
    }

    setConflictWarnings(warnings);
  }, [businessContext, selectedDrivers, nodeSelectorMode, nodes]);

  // 知识库选中状态
  const [selectedKnowledgeEntries, setSelectedKnowledgeEntries] = useState([]);
  const [restoredScenarios, setRestoredScenarios] = useState([]); // 从 localStorage 恢复的场景

  // ===== 即时检测功能：因子匹配检测 =====
  const [factorDetection, setFactorDetection] = useState({
    detected: false,
    matched: [],      // 已匹配的因子
    unmatched: [],    // 未匹配的因子（模型无此指标）
    rawFactors: []    // 从输入中提取的原始因子名称
  });

  // 读取 localStorage 中的知识库选中状态
  const loadSelectedKnowledge = useCallback(() => {
    const savedIds = JSON.parse(localStorage.getItem('vdt_knowledge_selected_ids') || '[]');
    if (savedIds.length > 0) {
      knowledgeService.initialize().then(() => {
        const allEntries = knowledgeService.getAllEntries();
        const selected = allEntries.filter(e => savedIds.includes(e.id));
        setSelectedKnowledgeEntries(selected);
      });
    } else {
      setSelectedKnowledgeEntries([]);
    }
  }, []);

  // 读取 localStorage 中的场景选中状态
  const loadSelectedScenarios = useCallback(async () => {
    try {
      const savedIds = JSON.parse(localStorage.getItem('vdt_prompt_selected_template') || '[]');
      console.log('[AITuningPanel] localStorage 中的场景 ID:', savedIds);
      if (savedIds.length > 0) {
        const { default: promptTemplateService } = await import('../../services/promptTemplateService');
        await promptTemplateService.initialize();
        const allTemplates = promptTemplateService.getAllTemplates();
        console.log('[AITuningPanel] 所有场景模板:', allTemplates.map(t => ({ id: t.id, name: t.name, hasSystemPrompt: !!t.systemPrompt })));
        const selected = allTemplates.filter(t => savedIds.includes(t.id));
        console.log('[AITuningPanel] 恢复的场景:', selected.map(t => ({ id: t.id, name: t.name, hasSystemPrompt: !!t.systemPrompt })));
        setRestoredScenarios(selected);
      } else {
        console.log('[AITuningPanel] localStorage 中没有选中的场景，清空场景列表');
        // ⚠️ 重要：必须清空场景列表，否则界面会显示已选
        setRestoredScenarios([]);
      }
    } catch (err) {
      console.error('[AITuningPanel] 恢复场景失败:', err);
      setRestoredScenarios([]);
    }
  }, []);

  // ===== 因子匹配检测函数 =====
  const detectFactorsInInput = useCallback((inputText) => {
    if (!inputText || inputText.trim().length === 0) {
      setFactorDetection({ detected: false, matched: [], unmatched: [], rawFactors: [] });
      return;
    }

    // 获取模型中所有因子名称（用于匹配）
    const allModelFactors = Object.values(nodes).map(n => n.name);

    // 从输入中提取可能的因子名称
    const rawFactors = [];

    // 方法 1：直接匹配模型中的因子名称
    allModelFactors.forEach(factorName => {
      if (inputText.includes(factorName)) {
        rawFactors.push(factorName);
      }
    });

    // 方法 2：从模型因子中提取共同后缀，用于识别未匹配的因子
    // 例如：模型中有"管理费用"、"销售费用"，则"费用"是后缀
    const factorSuffixes = new Set();
    allModelFactors.forEach(factor => {
      // 提取 2-3 字的后缀（如"费用"、"成本"、"利率"）
      if (factor.length >= 3) {
        factorSuffixes.add(factor.slice(-2));  // 后 2 字
        factorSuffixes.add(factor.slice(-3));  // 后 3 字
      }
    });

    // 方法 2.5：添加常见的财务/业务因子后缀作为兜底（不硬编码具体因子名称）
    const commonSuffixes = ['费用', '成本', '收入', '利润', '利率', '利润率', '毛利率', '净利率', '效能', '产能', '良率', '效率', '人数', '金额', '占比', '率', '额'];
    commonSuffixes.forEach(suffix => factorSuffixes.add(suffix));

    // 方法 3：直接从输入中查找包含后缀的词组
    // 例如：输入"毛利率增加"，后缀有"率"、"毛利率"，则提取"毛利率"
    const foundWords = new Set();

    // 遍历所有后缀，在输入中查找以该后缀结尾的词
    factorSuffixes.forEach(suffix => {
      // 正则：匹配后缀前面 0-2 个中文字符
      const regex = new RegExp(`[\\u4e00-\\u9fa5]{0,2}${suffix}`, 'g');
      const matches = inputText.match(regex) || [];
      matches.forEach(match => {
        // 只保留 2-4 字的词
        if (match.length >= 2 && match.length <= 4) {
          foundWords.add(match);
        }
      });
    });

    console.log('[因子检测] 通过后缀找到的词:', Array.from(foundWords));

    // 将找到的词与模型因子比对
    foundWords.forEach(word => {
      if (allModelFactors.includes(word)) {
        if (!rawFactors.includes(word)) {
          rawFactors.push(word);
        }
      } else {
        // 检查是否已存在类似的未匹配因子（避免重复）
        const exists = rawFactors.some(f => !allModelFactors.includes(f) && f === word);
        if (!exists) {
          rawFactors.push(word);
        }
      }
    });

    // 分类：已匹配 vs 未匹配
    const matched = rawFactors.filter(f => allModelFactors.includes(f));
    const unmatched = rawFactors.filter(f => !allModelFactors.includes(f));

    console.log('[因子检测] 输入文本:', inputText.substring(0, 50) + '...');
    console.log('[因子检测] 提取到的因子:', rawFactors);
    console.log('[因子检测] 已匹配:', matched);
    console.log('[因子检测] 未匹配:', unmatched);

    setFactorDetection({
      detected: true,
      matched: matched.map(name => ({ name, node: allModelFactors.find(n => n === name) })),
      unmatched: unmatched.map(name => ({ name })),
      rawFactors
    });
  }, [nodes]);

  // 防抖处理：输入停止 500ms 后才检测
  useEffect(() => {
    const timer = setTimeout(() => {
      detectFactorsInInput(businessContext);
    }, 500);

    return () => clearTimeout(timer);
  }, [businessContext, detectFactorsInInput]);

  useEffect(() => {
    loadSelectedKnowledge();
    loadSelectedScenarios();

    // 监听 storage 变化，当知识库/场景选择变化时自动刷新
    const handleStorageChange = (e) => {
      if (e.key === 'vdt_knowledge_selected_ids') {
        console.log('[AITuningPanel] 检测到知识库选择变化');
        loadSelectedKnowledge();
      }
      if (e.key === 'vdt_prompt_selected_template') {
        console.log('[AITuningPanel] 检测到场景选择变化');
        loadSelectedScenarios();
      }
    };

    // 也监听自定义事件（当同页面内修改时）
    const handleKnowledgeChange = () => loadSelectedKnowledge();
    const handleScenarioChange = () => loadSelectedScenarios();

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('knowledge-selection-changed', handleKnowledgeChange);
    window.addEventListener('scenario-selection-changed', handleScenarioChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('knowledge-selection-changed', handleKnowledgeChange);
      window.removeEventListener('scenario-selection-changed', handleScenarioChange);
    };
  }, []);

  // 使用选中的场景（优先使用恢复的，其次使用 props 传入的）
  const activeScenarios = restoredScenarios.length > 0 ? restoredScenarios : selectedScenarios;

  // UI状态
  const [expandedSections, setExpandedSections] = useState({
    understanding: true,
    dataAnalysis: true,
    adjustments: false,
    impact: true,
    explanation: false,
    validation: true // 目标验证默认展开
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

  // 验证目标达成情况（基于模型公式计算）
  const validateTargetAchievement = (adjustments, context, aiResult = null) => {
    if (!adjustments || adjustments.length === 0) return;

        // 1. 从业务背景中提取目标指标和目标值（动态识别 + 兜底）
    // 首先从模型中提取所有计算指标名称，用于动态匹配
    const metricNames = computedNodes.map(n => n.name).filter(Boolean);
    const uniqueMetricNames = [...new Set(metricNames)];

    // 构建动态正则表达式（基于模型中的实际指标名称）
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&');
    const metricPattern = uniqueMetricNames.length > 0
      ? '(' + uniqueMetricNames.map(escapeRegex).join('|') + ')'
      : '(净利润 | 营业利润 | 利润总额 | 毛利 | 净利 | 利润 | 收入 | 成本 | 费用)'; // 兜底模式

    const targetPatterns = [
      // 模式 1: 指标名 + 达到 + 数字 + 万（允许左右/以上/以下等后缀）
      new RegExp(metricPattern + '.*?达到.*?([\\d.]+)\\s*万', 'i'),
      // 模式 2: 指标名 + 目标 + 数字 + 万
      new RegExp(metricPattern + '.*?目标.*?([\\d.]+)\\s*万', 'i'),
      // 模式 3: 目标 + 指标名 + 数字 + 万
      new RegExp('目标.*?' + metricPattern + '.*?([\\d.]+)\\s*万', 'i'),
      // 模式 4: 实现 + 指标名 + 数字 + 万
      new RegExp('实现.*?' + metricPattern + '.*?([\\d.]+)\\s*万', 'i'),
      // 模式 5: 数字 + 万 + 指标名（如"达到 350 万净利润"）
      new RegExp('([\\d.]+)\\s*万.*?' + metricPattern, 'i'),
      // 模式 6: 指标名 + 达到 + 数字（不要求万字，允许"350 左右"）
      new RegExp(metricPattern + '.*?达到.*?([\\d.]+)', 'i'),
      // 模式 7: 指标名 + 目标 + 数字
      new RegExp(metricPattern + '.*?目标.*?([\\d.]+)', 'i'),
    ];

    let targetMetricName = null;
    let targetValue = null;

    for (const pattern of targetPatterns) {
      const match = context.match(pattern);
      if (match) {
        const source = pattern.source;
        // 模式 5: 数字在前（如"350 万净利润"）
        if (source.includes('([\\\\d.]+)\\\\s\\\\*万') || source.match(/\[\\d\.\]\+.*\\.\*\\?.*\$\)/)) {
          targetValue = parseFloat(match[1]);
          targetMetricName = match[2];
        }
        // 模式 6-7: 指标名 + 达到/目标 + 数字（允许"左右"等后缀）
        else if (source.includes('.*?达到.*?([\\\\d.]+)') || source.includes('.*?目标.*?([\\\\d.]+)')) {
          targetMetricName = match[1];
          targetValue = parseFloat(match[2]);
        }
        // 模式 1-4: 标准格式（数字后面有万字）
        else {
          targetMetricName = match[1];
          targetValue = parseFloat(match[2]);
        }
        console.log('目标验证：模式匹配成功，使用模式:', source.substring(0, 50));
        break;
      }
    }

    // 如果还是没有找到，尝试从 AI 返回的 explanation 中提取
    if (!targetValue && aiResult && aiResult.explanation) {
      // 使用动态指标名称构建正则
      const expMetricPattern = uniqueMetricNames.length > 0
        ? '(' + uniqueMetricNames.join('|') + ')'
        : '(?:净利润 | 营业利润 | 利润总额 | 毛利)';

      const explanationPatterns = [
        new RegExp(expMetricPattern + '.*?([\\d.]+)\\s*万', 'i'),
        new RegExp('目标.*?([\\d.]+)\\s*万', 'i'),
      ];
      for (const expPattern of explanationPatterns) {
        const expMatch = aiResult.explanation.match(expPattern);
        if (expMatch) {
          targetValue = parseFloat(expMatch[1]);
          // 尝试从 explanation 中提取指标名
          const metricNameRegex = new RegExp(expMetricPattern, 'i');
          const metricMatch = aiResult.explanation.match(metricNameRegex);
          if (metricMatch) {
            targetMetricName = metricMatch[1];
          }
          console.log('目标验证：从 AI explanation 中提取到目标值', targetValue, '指标', targetMetricName);
          break;
        }
      }
    }

    // 如果还是没有找到，尝试从业务背景的纯数字中提取（兜底）
    if (!targetValue) {
      const defaultMatch = context.match(/目标.*?([\d.]+)\s*万/i);
      if (defaultMatch) {
        targetValue = parseFloat(defaultMatch[1]);
        console.log('目标验证：从默认模式中提取到目标值', targetValue);
        // 尝试从上下文中提取指标名（使用动态指标名称）
        const metricNameRegex = new RegExp(uniqueMetricNames.join('|'), 'i');
        const metricMatch = context.match(metricNameRegex);
        if (metricMatch) {
          targetMetricName = metricMatch[1];
          console.log('目标验证：从上下文中提取到指标名', targetMetricName);
        }
      }
    }

    // 如果还是没有找到，从模型中查找有目标值的计算指标
    if (!targetValue) {
      const metricWithTarget = computedNodes.find(n => n.targetValue !== null && n.targetValue !== undefined);
      if (metricWithTarget) {
        targetValue = metricWithTarget.targetValue;
        targetMetricName = metricWithTarget.name;
        console.log('目标验证：从模型目标值中获取', targetMetricName, '=', targetValue);
      }
    }

    if (!targetValue) {
      console.log('目标验证：未找到明确的目标值，无法验证');
      return;
    }

    console.log('目标验证：识别到目标', targetMetricName, '→', targetValue, '万');

    // 2. 在模型中查找对应的计算指标
    const targetNode = targetMetricName ? computedNodes.find(node =>
      node.name === targetMetricName ||
      node.name?.includes(targetMetricName) ||
      (targetMetricName && node.name && targetMetricName.includes(node.name))
    ) : null;

    if (!targetNode) {
      console.log('目标验证：模型中未找到指标"', targetMetricName, '"');
    }

    // 3. 使用 calculateAdjustedMetrics 计算所有计算指标的值
    console.log('目标验证：调用 calculateAdjustedMetrics 计算调整后的指标值...');
    const adjustedMetrics = calculateAdjustedMetrics(adjustments, nodes);

    // 4. 计算预期值（优先使用模型公式）
    let expectedValue = null;
    let calculationLogic = '';

    if (targetNode && targetNode.formula) {
      console.log('目标验证：使用模型公式计算', targetNode.name);

      // 首先尝试使用已计算的调整值
      if (adjustedMetrics[targetNode.id] !== undefined) {
        expectedValue = adjustedMetrics[targetNode.id];
        calculationLogic = targetNode.formula + ' = ' + Math.round(expectedValue);
        console.log('目标验证：使用 calculateAdjustedMetrics 计算结果', targetNode.name, '=', expectedValue);
      }

      // 如果失败，尝试直接计算公式
      if (expectedValue === null || isNaN(expectedValue)) {
        console.log('目标验证：直接计算目标节点公式...');

        // 提取公式中的依赖（支持中文和英文 ID）
        const formulaDeps = targetNode.formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[\u4e00-\u9fa5]+[a-zA-Z0-9_]*/g) || [];
        console.log('  提取到的依赖:', formulaDeps);

        // 构建替换映射
        const replaceMap = {};
        formulaDeps.forEach(depCode => {
          // 跳过纯数字
          if (/^[\d.]+$/.test(depCode)) return;

          const depNode = nodes[depCode];
          if (depNode) {
            // 优先使用计算后的值
            const value = adjustedMetrics[depNode.id] ?? depNode.value ?? 0;
            replaceMap[depCode] = value;
            console.log('  依赖:', depNode.name, '=', value);
          } else {
            console.log('  未找到依赖节点:', depCode);
          }
        });

        console.log('  替换映射:', replaceMap);

        // 替换公式中的变量为数值（按长度降序排序）
        let calcExpression = targetNode.formula;
        const sortedKeys = Object.keys(replaceMap).sort((a, b) => b.length - a.length);
        sortedKeys.forEach(key => {
          const value = replaceMap[key];
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedKey, 'g');
          calcExpression = calcExpression.replace(regex, value);
          console.log('  替换:', key, '→', value);
        });

        console.log('  替换后的表达式:', calcExpression);

        // 清理表达式（移除空格）
        const sanitized = calcExpression.replace(/\s+/g, '');

        try {
          expectedValue = Function('"use strict";return (' + sanitized + ')')();
          calculationLogic = targetNode.formula + ' = ' + Math.round(expectedValue);
          console.log('目标验证：公式计算结果', expectedValue);
        } catch (e) {
          console.log('目标验证：公式计算失败', e.message);
        }
      }
    }

    // 5. 如果公式计算失败，使用兜底逻辑（基于模型中的一级指标）
    if (expectedValue === null || isNaN(expectedValue)) {
      console.log('目标验证：使用兜底逻辑');

      // 兜底逻辑：从模型中查找与目标指标名称最相似的计算指标
      const similarMetric = computedNodes.find(n =>
        n.name && targetMetricName &&
        (n.name.includes(targetMetricName) || targetMetricName.includes(n.name))
      );

      if (similarMetric) {
        expectedValue = similarMetric.value ?? 0;
        calculationLogic = '使用模型中"' + similarMetric.name + '"的当前值';
        console.log('目标验证：使用模型指标值', similarMetric.name, '=', expectedValue);
      } else {
        // 如果找不到，使用第一个计算指标的值
        const firstMetric = computedNodes.find(n => n.type === 'computed' && n.value !== null);
        if (firstMetric) {
          expectedValue = firstMetric.value ?? 0;
          calculationLogic = '使用模型中"' + firstMetric.name + '"的当前值（兜底）';
          console.log('目标验证：使用第一个计算指标', firstMetric.name, '=', expectedValue);
        } else {
          console.log('目标验证：兜底计算也失败，没有可用的指标数据');
          return;
        }
      }

      if (expectedValue === null || isNaN(expectedValue)) {
        console.log('目标验证：兜底计算也失败');
        return;
      }
    }

    // 6. 对比目标
    const gap = expectedValue - targetValue;  // 正值表示超出目标，负值表示未达目标
    const changePercent = Math.abs(expectedValue) !== 0 ? (expectedValue - targetValue) / Math.abs(targetValue) : 0;  // 相对于目标的百分比变化
    const status = gap >= 0 ? '达标' : '未达标';

    // 7. 获取目标节点的格式设置
    const targetNodeFormat = targetNode?.format || '';
    const targetNodeUnit = targetNode?.unit || '万';
    const formattedExpected = formatValue(expectedValue, targetNodeFormat, targetNodeUnit);
    const formattedTarget = formatValue(targetValue, targetNodeFormat, targetNodeUnit);
    const formattedGap = formatValue(Math.abs(gap), targetNodeFormat, targetNodeUnit);
    const formattedChangePercent = (changePercent * 100).toFixed(1) + '%';

    // 8. 构建验证结果
    const validationResult = {
      _id: 'validation_' + Date.now(),
      nodeName: '📊 目标验证',
      metricName: targetMetricName,
      currentValue: expectedValue,
      recommendedValue: targetValue,
      changePercent: changePercent,
      formattedValue: formattedExpected,
      formattedTarget: formattedTarget,
      formattedGap: formattedGap,
      formattedChangePercent: formattedChangePercent,
      gap: gap,
      unit: targetNodeUnit,
      changeReason: '预期' + targetMetricName + formattedExpected + '，目标' + formattedTarget + '，' + (gap >= 0 ? '超出' : '差距') + formattedGap,
      dataBasis: calculationLogic,
      businessReason: calculationLogic,
      riskWarning: gap < 0 ? '⚠️ 当前方案无法达成' + targetMetricName + '目标，建议调整' : '✅ 方案可达成' + targetMetricName + '目标',
      monthlyStrategy: '验证结果',
      monthlyFactors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      confidence: 0.9,
      isValidation: true
    };

    setValidationResult(validationResult);
  };


  /**
   * 根据 AI 调整后的驱动因子值，计算所有计算指标的预期值
   * @param {Array} adjustments - AI 调整建议
   * @param {Object} nodes - 所有节点
   * @returns {Object} 计算后的指标值映射
   */
  const calculateAdjustedMetrics = (adjustments, nodes) => {
    console.log('[calculateAdjustedMetrics] 开始计算调整后的指标值...');

    // 1. 构建调整后的驱动因子值映射
    const adjustedDriversMap = {};
    adjustments.forEach(adj => {
      let nodeId = adj.nodeId;

      // 如果没有 nodeId，尝试从 nodeName 查找
      if (!nodeId && adj.nodeName) {
        const foundNode = Object.values(nodes).find(n =>
          n.name === adj.nodeName || n.name?.includes(adj.nodeName) || adj.nodeName?.includes(n.name)
        );
        if (foundNode) {
          nodeId = foundNode.id;
          console.log('[calculateAdjustedMetrics] 从 nodeName 找到 nodeId:', adj.nodeName, '→', nodeId);
        }
      }

      if (nodeId) {
        const node = nodes[nodeId];
        if (node && node.type === 'driver') {
          adjustedDriversMap[nodeId] = adj.recommendedValue;
          console.log('[calculateAdjustedMetrics] 驱动因子调整:', node.name, '=', adj.recommendedValue);
        } else if (node && node.type === 'computed') {
          // 如果是计算指标，直接存入 computedValues（但这里只处理 driver）
          console.log('[calculateAdjustedMetrics] 跳过计算指标（将在递归中计算）:', node.name);
        } else {
          console.log('[calculateAdjustedMetrics] 未找到节点或类型不匹配:', nodeId, node?.type);
        }
      } else {
        console.warn('[calculateAdjustedMetrics] 无法识别的调整项:', adj);
      }
    });

    // 2. 递归计算所有计算指标的值
    const computedValues = {};
    const visited = new Set();

    const calculateMetric = (nodeId, depth = 0) => {
      if (visited.has(nodeId)) return computedValues[nodeId];
      visited.add(nodeId);

      const node = nodes[nodeId];
      if (!node || !node.formula) {
        console.log('[calculateAdjustedMetrics] 跳过（无公式）:', nodeId);
        return null;
      }

      console.log('[calculateAdjustedMetrics] 计算:', node.name, '公式:', node.formula);

      // 提取公式中的依赖（支持中文和英文 ID）
      // 匹配：英文标识符（如 revenue_01）或 中文标识符（如 营业收入 01）
      const formulaDeps = node.formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[\u4e00-\u9fa5]+[a-zA-Z0-9_]*/g) || [];

      console.log('  提取到的依赖:', formulaDeps);

      // 构建替换映射并计算
      const replaceMap = {};
      formulaDeps.forEach(depCode => {
        // 跳过纯数字或运算符
        if (/^[\d.]+$/.test(depCode)) return;

        const depNode = nodes[depCode];
        if (depNode) {
          // 优先使用调整后的值，其次使用已计算的子节点值，最后使用原始值
          if (depNode.type === 'driver') {
            replaceMap[depCode] = adjustedDriversMap[depNode.id] ?? depNode.value ?? 0;
            console.log('  驱动因子:', depNode.name, '=', replaceMap[depCode], '(from adjustedDriversMap)');
          } else if (depNode.type === 'computed') {
            // 递归计算子节点
            calculateMetric(depNode.id, depth + 1);
            replaceMap[depCode] = computedValues[depNode.id] ?? depNode.value ?? 0;
            console.log('  计算指标:', depNode.name, '=', replaceMap[depCode], '(from computedValues)');
          } else {
            replaceMap[depCode] = depNode.value ?? 0;
            console.log('  其他:', depNode.name, '=', replaceMap[depCode]);
          }
        } else {
          console.warn('  未找到依赖节点:', depCode);
        }
      });

      console.log('  替换映射:', replaceMap);

      // 替换公式中的变量（按长度降序排序，避免短名称先替换导致长名称匹配失败）
      let calcExpression = node.formula;
      const sortedKeys = Object.keys(replaceMap).sort((a, b) => b.length - a.length);
      sortedKeys.forEach(key => {
        const value = replaceMap[key];
        // 使用全局替换，转义特殊字符
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKey, 'g');
        calcExpression = calcExpression.replace(regex, value);
        console.log('  替换:', key, '→', value);
      });

      console.log('  替换后的表达式:', calcExpression);

      // 清理并计算（移除空格，但保留负号和数字）
      const sanitized = calcExpression.replace(/\s+/g, '');
      try {
        const result = Function('"use strict";return (' + sanitized + ')')();
        computedValues[nodeId] = result;
        console.log('  结果:', node.name, '=', result);
        return result;
      } catch (e) {
        console.warn('公式计算失败:', node.name, node.formula, '替换后:', calcExpression, '错误:', e.message);
        return node.value ?? 0;
      }
    };

    // 计算所有计算指标
    Object.values(nodes).forEach(node => {
      if (node.type === 'computed' && node.formula) {
        calculateMetric(node.id);
      }
    });

    console.log('[calculateAdjustedMetrics] 计算完成，结果:', computedValues);
    return computedValues;
  };

  const runAITuning = async () => {
    console.log('🚀 [AITuningPanel] runAITuning 被调用！');
    console.log('🚀 [AITuningPanel] businessContext:', businessContext);
    console.log('🚀 [AITuningPanel] activeScenarios:', activeScenarios);
    console.log('🚀 [AITuningPanel] knowledgeResults will be loaded...');
    if (!aiConfig.url || !aiConfig.model) {
      setError('请先配置AI参数（在设置中配置）');
      return;
    }

    // 输入验证：检查业务背景是否为空或无意义
    const trimmedContext = businessContext.trim();
    if (!trimmedContext) {
      setError('请先描述业务背景和目标');
      return;
    }

    // 检查输入是否过短（至少 10 个字符）
    if (trimmedContext.length < 10) {
      setError('请输入有效的业务背景描述（至少 10 个字符）');
      return;
    }

    // 检查是否是明显的无意义输入（纯数字、纯字母、纯符号）
    const isOnlyNumbers = /^d+$/.test(trimmedContext);
    const isOnlyLetters = /^[a-zA-Z]+$/.test(trimmedContext);
    const isOnlySymbols = /^[^a-zA-Z一-龥d]+$/.test(trimmedContext);

    if (isOnlyNumbers || isOnlyLetters || isOnlySymbols) {
      setError('请输入有意义的业务背景描述（中文、数字、字母混合）');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAiResult(null);

    try {
      // 步骤 1：使用选中的知识库或检索知识库
      let knowledgeResults = [];

      // 从 localStorage 读取选中的知识库条目
      const savedKnowledgeIds = JSON.parse(localStorage.getItem('vdt_knowledge_selected_ids') || '[]');

      if (savedKnowledgeIds && savedKnowledgeIds.length > 0) {
        // 使用用户选中的知识库条目
        console.log('[AI 调参] 使用选中的知识库:', savedKnowledgeIds.length, '条');

        // 初始化 knowledgeService 并获取选中的条目
        await knowledgeService.initialize();
        const allEntries = knowledgeService.getAllEntries();
        const selectedEntries = allEntries.filter(e => savedKnowledgeIds.includes(e.id));

        knowledgeResults = selectedEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          description: entry.description,
          industry: entry.industry,
          scenario: entry.scenario,
          factors: entry.factors,
          tags: entry.tags,
          similarity: 1.0 // 选中的条目相似度设为 100%
        }));
      } else {
        // 自动检索知识库
        try {
          await knowledgeService.initialize();
          if (knowledgeService.useAIEmbedding || knowledgeService.entries.length > 0) {
            console.log('[AI 调参] 检索知识库...');
            knowledgeResults = await knowledgeService.search(businessContext, 3, 0.3);
            console.log('[AI 调参] 知识库命中:', knowledgeResults.length, '条');
          }
        } catch (err) {
          console.warn('[AI 调参] 知识库检索失败:', err);
          knowledgeResults = [];
        }
      }

      // 步骤 1.5：一致性验证（新增）
      let consistencyResult = null;
      try {
        console.log('[AI 调参] 执行一致性验证...');
        consistencyResult = consistencyValidationEngine.validateAll({
          userInput: businessContext,
          knowledgeEntries: knowledgeResults.length > 0 ? knowledgeResults : null,
          nodes: nodes,
          selectedScenario: activeScenarios
        });

        if (!consistencyResult.isConsistent) {
          console.warn('[AI 调参] 一致性验证失败:', consistencyResult.warnings);
          // 不阻断流程，但将警告传递给 AI Prompt
        } else {
          console.log('[AI 调参] 一致性验证通过');
        }
      } catch (err) {
        console.warn('[AI 调参] 一致性验证失败:', err);
        consistencyResult = null;
      }

      // 步骤 1.6：特殊约束解析（新增）- 使用规则引擎解析用户约束
      let specialConstraints = [];
      try {
        console.log('[特殊约束解析] 开始解析业务背景中的约束...');
        // 传递所有节点（包括计算指标），因为用户可能说"毛利率增加 5%"
        const allNodes = Object.values(nodes);
        const constraintResult = await parseConstraints(
          businessContext,
          allNodes,
          aiConfig,
          enableAIFallback, // 使用用户配置的 AI 兜底开关
          callAI
        );
        specialConstraints = constraintResult.constraints;
        console.log('[特殊约束解析] 解析完成，约束数量:', specialConstraints.length, '来源:', constraintResult.source);
      } catch (err) {
        console.warn('[特殊约束解析] 失败:', err);
        specialConstraints = [];
      }

      // 步骤 2：构建 AI Prompt（使用 aiPromptBuilder.js 中的 buildSmartTuningPrompt）
      // 这个函数包含完整的 System Prompt 和输出格式要求（多因子强制、详细推理过程等）

      console.log('[AI 调参] 节点选择模式:', nodeSelectorMode);
      console.log('[AI 调参] 选择的指标:', selectedMetrics);
      console.log('[AI 调参] 选择的驱动因子:', selectedDrivers);

      let prompt = buildSmartTuningPrompt({
        nodes,
        businessContext: businessContext,
        knowledgeResults: knowledgeResults,
        selectedScenarios: activeScenarios,
        consistencyResult: consistencyResult, // 传递一致性验证结果
        // 节点选择
        selectedMetrics: nodeSelectorMode === 'manual' ? selectedMetrics : [],
        selectedDrivers: nodeSelectorMode === 'manual' ? selectedDrivers : [],
        nodeSelectorMode: nodeSelectorMode,
        enableAIFallback: enableAIFallback, // 传递 AI 语义兜底开关
        specialConstraints: specialConstraints // 传递特殊约束（规则引擎解析结果）
      });

      console.log('[AI 调参] Prompt 构建完成，system 长度:', prompt.system?.length);

      const response = await callAI(aiConfig, [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]);

      // 调试：打印原始响应
      console.log('AI原始响应:', response.content);
      console.log('AI 响应长度:', response.content.length);
      console.log('AI 响应最后 100 字符:', response.content.substring(response.content.length - 100));

      const parsed = parseAIResponse(response.content, { originalContext: businessContext });

      if (!parsed.success) {
        throw new Error(parsed.error || 'AI响应解析失败');
      }

      // 初始化 finalData
      let finalData = parsed.data;

      // 检查 AI 返回的数据是否足够
      const aiAdjustments = finalData.adjustments || finalData.recommendations || [];

      // 如果 AI 返回的 adjustments 不足 2 个，触发并集决策引擎融合知识库和兜底策略
      if (aiAdjustments.length < 2) {
        console.log('⚠️ AI 返回的调整方案不足 2 个，触发并集决策引擎...');

        // 根据用户选择的模式决定兜底范围
        let driverIds = null;
        if (nodeSelectorMode === 'manual' && selectedDrivers.length > 0) {
          // 用户指定了范围，只兜底这些因子
          driverIds = selectedDrivers;
          console.log('[兜底策略] 用户指定范围，只兜底:', driverIds);
        }

        const fallbackResult = fallbackStrategyEngine.execute({
          nodes,
          positiveTopN: 5,
          negativeTopN: 5,
          driverIds: driverIds // 新增参数，限制兜底范围
        });

        if (fallbackResult.success && fallbackResult.allAdjustments.length > 0) {
          // 使用并集决策引擎融合知识库和兜底策略
          console.log('[并集决策] 开始融合知识库和兜底策略...');

          // 将知识库结果转换为决策引擎格式
          const knowledgeCandidates = knowledgeResults.map(k => {
            // 尝试从 factors 中获取 nodeId，或者用 title 匹配节点
            let nodeId = k.factors?.[0]?.factorId || k.factors?.[0]?.id;
            if (!nodeId) {
              // 尝试用标题匹配节点名称
              const matchedNode = Object.values(nodes).find(n =>
                n.name === k.title || n.name?.includes(k.title) || k.title?.includes(n.name)
              );
              if (matchedNode) nodeId = matchedNode.id;
            }

            return {
              nodeId,
              nodeName: k.title,
              currentValue: 0, // 知识库条目没有当前值
              recommendedValue: 0,
              changePercent: 0,
              changeReason: `知识库案例：${k.title}`,
              dataBasis: `历史经验：${k.scenario || '未指定'}`,
              businessReason: k.description || '基于历史案例',
              confidence: k.similarity || 0.6,
              similarity: k.similarity,
              source: 'knowledge',
              raw: k
            };
          }).filter(k => k.nodeId); // 过滤掉没有 nodeId 的条目

          console.log('[并集决策] 知识库候选:', knowledgeCandidates.length, '个，兜底候选:', fallbackResult.allAdjustments.length, '个');

          // 执行并集决策
          const unionResult = executeUnionDecision(
            knowledgeCandidates,
            fallbackResult.allAdjustments,
            {
              maxFactors: 5,
              knowledgeBaseWeight: 0.7,
              fallbackWeight: 0.3,
              crossBoost: 1.1,
              minPriorityThreshold: 0.5
            }
          );

          console.log('[并集决策] 决策完成:', unionResult.summary);

          // 转换为 AI 格式
          const fusedAdjustments = convertToAIFORMat(unionResult);

          if (fusedAdjustments.length > 0) {
            console.log('并集决策生成成功，共', fusedAdjustments.length, '个调整方案');
            finalData = {
              ...finalData,
              adjustments: fusedAdjustments,
              recommendations: fusedAdjustments,
              _unionDecisionUsed: true,
              _unionDecisionMetadata: unionResult
            };
          }
        }
      }

      // 如果数据被截断（缺少 expectedImpact 或 explanation），发起第二次请求补充
      if (!finalData.expectedImpact || !finalData.explanation) {
        console.log('⚠️ 检测到数据被截断，发起第二次请求补充详细信息...');
        finalData = await supplementDetailedInfo(finalData, aiConfig, businessContext, nodes, knowledgeResults, activeScenarios);
      }

      // 修正 expectedImpact.keyMetrics 中的数据（使用实际模型数据）
      if (finalData.expectedImpact && finalData.expectedImpact.keyMetrics) {
        console.log('[AI 调参] 修正 keyMetrics 数据...');

        // 先计算调整后的指标值
        const adjustments = finalData.adjustments || finalData.recommendations || [];
        const adjustedMetrics = calculateAdjustedMetrics(adjustments, nodes);

        finalData.expectedImpact.keyMetrics = finalData.expectedImpact.keyMetrics.map(metric => {
          // 从实际模型中查找匹配的指标
          const actualNode = Object.values(nodes).find(n =>
            n.name === metric.name ||
            n.name?.includes(metric.name) ||
            metric.name?.includes(n.name)
          );

          if (actualNode) {
            console.log('[AI 调参] 找到匹配节点:', metric.name, '→', actualNode.name,
                        '当前值:', actualNode.value, '目标值:', actualNode.targetValue,
                        '类型:', actualNode.type, '公式:', actualNode.formula);

            // 使用计算后的预期值（优先）
            let expectedValue = metric.after;

            if (adjustedMetrics[actualNode.id] !== undefined) {
              expectedValue = adjustedMetrics[actualNode.id];
              console.log('[AI 调参] 使用 calculateAdjustedMetrics 计算结果:', actualNode.name, '=', expectedValue);
            } else if (actualNode.type === 'computed' && actualNode.formula) {
              // 如果 calculateAdjustedMetrics 没有计算出结果，尝试直接计算公式
              console.log('[AI 调参] calculateAdjustedMetrics 无结果，尝试直接计算公式...');

              // 提取公式中的依赖（支持中文和英文 ID）
              const formulaDeps = actualNode.formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[\u4e00-\u9fa5]+[a-zA-Z0-9_]*/g) || [];
              console.log('  提取到的依赖:', formulaDeps);

              const replaceMap = {};
              formulaDeps.forEach(depCode => {
                // 跳过纯数字
                if (/^[\d.]+$/.test(depCode)) return;

                const depNode = nodes[depCode];
                if (depNode) {
                  let value = depNode.value ?? 0;

                  // 如果是驱动因子，使用调整后的值
                  if (depNode.type === 'driver' && adjustedDriversMap[depNode.id] !== undefined) {
                    value = adjustedDriversMap[depNode.id];
                    console.log('  驱动因子（调整后）:', depNode.name, '=', value);
                  }
                  // 如果是计算指标，递归获取其值
                  else if (depNode.type === 'computed' && adjustedMetrics[depNode.id] !== undefined) {
                    value = adjustedMetrics[depNode.id];
                    console.log('  计算指标（已计算）:', depNode.name, '=', value);
                  } else {
                    console.log('  使用原始值:', depNode.name, '=', value);
                  }

                  replaceMap[depCode] = value;
                } else {
                  console.log('  未找到依赖节点:', depCode);
                }
              });

              console.log('  替换映射:', replaceMap);

              // 替换并计算（按长度降序排序）
              let calcExpression = actualNode.formula;
              const sortedKeys = Object.keys(replaceMap).sort((a, b) => b.length - a.length);
              sortedKeys.forEach(key => {
                const value = replaceMap[key];
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedKey, 'g');
                calcExpression = calcExpression.replace(regex, value);
                console.log('  替换:', key, '→', value);
              });

              console.log('  替换后的表达式:', calcExpression);

              // 清理（移除空格）
              const sanitized = calcExpression.replace(/\s+/g, '');
              try {
                expectedValue = Function('"use strict";return (' + sanitized + ')')();
                console.log('[AI 调参] 直接公式计算结果:', actualNode.name, '=', expectedValue);
              } catch (e) {
                console.warn('[AI 调参] 公式计算失败:', actualNode.name, actualNode.formula, e.message);
              }
            } else {
              console.log('[AI 调参] 使用 AI 返回的预期值:', metric.name, '=', expectedValue);
            }

            return {
              ...metric,
              name: actualNode.name, // 使用实际的指标名称
              before: actualNode.value ?? metric.before, // 使用实际当前值
              target: actualNode.targetValue ?? metric.target, // 使用实际目标值
              after: expectedValue // 使用计算后的预期值
            };
          }

          // 如果找不到匹配的节点，尝试从 computed 指标中查找
          const computedNode = Object.values(nodes).find(n =>
            n.type === 'computed' &&
            (n.name === metric.name || n.name?.includes(metric.name))
          );

          if (computedNode) {
            console.log('[AI 调参] 找到 computed 节点:', metric.name, '→', computedNode.name,
                        '公式:', computedNode.formula);

            // 使用计算后的预期值
            let expectedValue = metric.after;

            if (adjustedMetrics[computedNode.id] !== undefined) {
              expectedValue = adjustedMetrics[computedNode.id];
              console.log('[AI 调参] 使用 calculateAdjustedMetrics 计算结果:', computedNode.name, '=', expectedValue);
            } else if (computedNode.formula) {
              // 尝试直接计算公式
              console.log('[AI 调参] calculateAdjustedMetrics 无结果，尝试直接计算公式...');

              // 提取公式中的依赖（支持中文和英文 ID）
              const formulaDeps = computedNode.formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[\u4e00-\u9fa5]+[a-zA-Z0-9_]*/g) || [];
              console.log('  提取到的依赖:', formulaDeps);

              const replaceMap = {};
              formulaDeps.forEach(depCode => {
                // 跳过纯数字
                if (/^[\d.]+$/.test(depCode)) return;

                const depNode = nodes[depCode];
                if (depNode) {
                  let value = depNode.value ?? 0;

                  // 如果是驱动因子，使用调整后的值
                  if (depNode.type === 'driver' && adjustedDriversMap[depNode.id] !== undefined) {
                    value = adjustedDriversMap[depNode.id];
                    console.log('  驱动因子（调整后）:', depNode.name, '=', value);
                  }
                  // 如果是计算指标，递归获取其值
                  else if (depNode.type === 'computed' && adjustedMetrics[depNode.id] !== undefined) {
                    value = adjustedMetrics[depNode.id];
                    console.log('  计算指标（已计算）:', depNode.name, '=', value);
                  } else {
                    console.log('  使用原始值:', depNode.name, '=', value);
                  }

                  replaceMap[depCode] = value;
                } else {
                  console.log('  未找到依赖节点:', depCode);
                }
              });

              console.log('  替换映射:', replaceMap);

              // 替换并计算（按长度降序排序）
              let calcExpression = computedNode.formula;
              const sortedKeys = Object.keys(replaceMap).sort((a, b) => b.length - a.length);
              sortedKeys.forEach(key => {
                const value = replaceMap[key];
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedKey, 'g');
                calcExpression = calcExpression.replace(regex, value);
                console.log('  替换:', key, '→', value);
              });

              console.log('  替换后的表达式:', calcExpression);

              // 清理（移除空格）
              const sanitized = calcExpression.replace(/\s+/g, '');
              try {
                expectedValue = Function('"use strict";return (' + sanitized + ')')();
                console.log('[AI 调参] 直接公式计算结果:', computedNode.name, '=', expectedValue);
              } catch (e) {
                console.warn('[AI 调参] 公式计算失败:', computedNode.name, computedNode.formula, e.message);
              }
            }

            return {
              ...metric,
              name: computedNode.name,
              before: computedNode.value ?? metric.before,
              target: computedNode.targetValue ?? metric.target,
              after: expectedValue
            };
          }

          // 都找不到，标记为"模型无此指标"
          console.warn('[AI 调参] 无法匹配模型数据，使用 AI 生成的指标:', metric.name);
          return {
            ...metric,
            notInModel: true,  // 标记该指标不在模型中
            before: null,
            after: null,
            target: null
          };
        });
        console.log('[AI 调参] 修正后的 keyMetrics:', finalData.expectedImpact.keyMetrics);
      }

      // 等待所有数据完成后再更新 UI
      // 添加规则引擎解析的约束（用于显示，替代 AI 返回的可能不准确的约束）
      finalData.ruleConstraints = specialConstraints || [];
      setAiResult(finalData);
      // 调试：打印 AI 返回的完整数据结构
      console.log('[AI 调参] AI 返回的完整数据:', JSON.stringify(finalData, null, 2));
      console.log('[AI 调参] understanding:', finalData?.understanding);
      console.log('[AI 调参] dataAnalysis:', finalData?.dataAnalysis);
      console.log('[AI 调参] expectedImpact:', finalData?.expectedImpact);
      console.log('[AI 调参] explanation:', finalData?.explanation);

      // 初始化可编辑的调整方案（添加唯一ID）
      const adjustments = finalData.adjustments || finalData.recommendations || [];
      setEditableAdjustments(adjustments.map((adj, i) => ({
        ...adj,
        _id: `adj_${i}_${Date.now()}`,
        isAIRecommend: adj.isFallback ? false : true // 标记是否来自 AI
      })));
      setIsEditingMode(true);

      // 验证目标达成情况（传入 aiResult 以便从中提取目标）
      validateTargetAchievement(adjustments, businessContext, finalData);

      // 默认展开关键区域（包括业务理解和 AI 推理过程）
      setExpandedSections(prev => ({
        ...prev,
        understanding: true, // 展开业务理解
        dataAnalysis: true,
        impact: true,
        adjustments: true,
        explanation: true // 展开 AI 推理过程
      }));

    } catch (err) {
      setError(err.message || 'AI调参失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== 应用建议 =====

  /**
   * 第二次请求：补充详细信息（expectedImpact、explanation）
   * @returns {Promise<Object>} 合并后的完整数据
   */
  const supplementDetailedInfo = async (partialData, aiConfig, businessContext, nodes, knowledgeResults, activeScenarios) => {
    try {
      console.log('🔄 开始补充详细信息...');

      // 构建简短的 Prompt，补充预期效果、explanation、dataAnalysis 和每个 adjustment 的详细信息
      const supplementPrompt = `
基于以下已确定的调整方案，请补充预期效果分析、数据洞察和详细推理过程。

【已确定的调整方案】
${JSON.stringify(partialData.adjustments, null, 2)}

【模型数据】
${JSON.stringify({
  drivers: Object.values(nodes).filter(n => n.type === 'driver').map(n => ({
    id: n.id,
    name: n.name,
    value: n.value,
    baseline: n.baseline,
    targetValue: n.targetValue,
    timeData: n.timeData // 添加时间序列数据用于趋势分析
  }))
}, null, 2)}

【业务背景】
${businessContext}

【输出格式要求】
只返回以下 JSON 格式（不要包含 adjustments）：
{
  "dataAnalysis": {
    "trends": [
      {"factor": "因子名称", "pattern": "基于实际数据的趋势描述", "seasonality": "季节性特征（如有）"}
    ],
    "sensitivity": [
      {"factor": "因子名称", "impact": "high|medium|low", "correlation": "positive|negative", "elasticity": 数值}
    ],
    "risks": [
      {"factor": "因子名称", "riskLevel": "高 | 中|低", "description": "风险描述", "recommendation": "建议"}
    ]
  },
  "expectedImpact": {
    "keyMetrics": [
      {"name": "净利润", "before": 数值，"after": 数值，"change": "+XX%", "probability": "XX%"}
    ],
    "sensitivityScenario": [
      {"scenario": "乐观", "result": 数值，"assumption": "假设说明"},
      {"scenario": "基准", "result": 数值，"assumption": "假设说明"},
      {"scenario": "悲观", "result": 数值，"assumption": "假设说明"}
    ],
    "summary": "整体影响说明"
  },
  "explanation": "详细的调整思路和多因子协同逻辑",
  "adjustmentDetails": [
    {
      "nodeId": "因子节点 ID",
      "dataBasis": "数据依据",
      "businessReason": "业务理由",
      "riskWarning": "风险提示",
      "factorLinkage": "因子联动"
    }
  ]
}

注意：
1. 只返回 JSON，不要包含 markdown 代码块
2. dataAnalysis 必须基于实际模型数据和时间序列数据分析
3. trends 至少包含 1 个有实际数据支撑的趋势
4. sensitivity 至少包含 1 个因子的敏感性分析
5. adjustmentDetails 数组必须包含每个调整因子的详细信息
`;

      const response = await callAI(aiConfig, [
        { role: 'system', content: '你是一位专业的业务分析专家，请补充调整方案的预期效果和推理过程。' },
        { role: 'user', content: supplementPrompt }
      ]);

      console.log('🔄 补充响应:', response.content);

      // 解析补充的响应
      const supplementParsed = parseAIResponse(response.content);
      if (supplementParsed.success) {
        console.log('🔄 补充数据解析成功:', supplementParsed.data);

        // 合并 adjustmentDetails 到 adjustments 中
        let mergedAdjustments = [...partialData.adjustments];

        if (supplementParsed.data.adjustmentDetails && Array.isArray(supplementParsed.data.adjustmentDetails)) {
          console.log('🔄 合并 adjustmentDetails:', supplementParsed.data.adjustmentDetails.length, '个');
          console.log('🔄 原始 adjustments:', mergedAdjustments.map(a => ({ nodeId: a.nodeId, nodeName: a.nodeName })));

          // 将 adjustmentDetails 合并到对应的 adjustment 中
          supplementParsed.data.adjustmentDetails.forEach(detail => {
            console.log('🔄 尝试合并 detail:', detail.nodeId, detail.nodeName);

            // 尝试多种匹配方式：nodeId 精确匹配 或 nodeName 名称匹配
            const idx = mergedAdjustments.findIndex(adj =>
              adj.nodeId === detail.nodeId ||           // nodeId 精确匹配
              adj.nodeName === detail.nodeId ||         // nodeName 与 detail.nodeId 匹配（AI 可能返回名称）
              adj.nodeName === detail.nodeName ||       // nodeName 精确匹配
              (adj.nodeName && adj.nodeName.includes(detail.nodeId)) || // 包含匹配
              (detail.nodeName && adj.nodeName?.includes(detail.nodeName))
            );

            if (idx !== -1) {
              console.log('✅ 找到匹配，索引:', idx, mergedAdjustments[idx].nodeName);
              mergedAdjustments[idx] = {
                ...mergedAdjustments[idx],
                dataBasis: detail.dataBasis || mergedAdjustments[idx].dataBasis,
                businessReason: detail.businessReason || mergedAdjustments[idx].businessReason,
                riskWarning: detail.riskWarning || mergedAdjustments[idx].riskWarning,
                factorLinkage: detail.factorLinkage || mergedAdjustments[idx].factorLinkage
              };
            } else {
              console.warn('⚠️ 未找到匹配的 adjustment:', detail);
              console.warn('  可用 adjustments:', mergedAdjustments.map(a => ({ nodeId: a.nodeId, nodeName: a.nodeName })));
            }
          });
        } else {
          console.log('🔄 无 adjustmentDetails，检查是否是第一次请求直接返回的数据');
        }

        // 合并数据
        const mergedData = {
          ...partialData,
          adjustments: mergedAdjustments,
          recommendations: mergedAdjustments,
          dataAnalysis: supplementParsed.data.dataAnalysis || partialData.dataAnalysis,
          expectedImpact: supplementParsed.data.expectedImpact || partialData.expectedImpact,
          explanation: supplementParsed.data.explanation || partialData.explanation,
          _supplemented: true
        };

        console.log('🔄 数据合并成功:', mergedData);
        // 不再在这里调用 setAiResult，由主流程统一处理
        return mergedData;
      } else {
        console.warn('⚠️ 补充数据解析失败:', supplementParsed);
      }
    } catch (err) {
      console.error('⚠️ 补充详细信息出错:', err);
    }
    // 失败时返回原始数据
    return partialData;
  };

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

      console.log('AI 调参：rec 完整数据', rec);
      console.log('AI 调参：businessReason=', rec.businessReason, 'dataBasis=', rec.dataBasis, 'riskWarning=', rec.riskWarning);
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

                // 根据策略系数比例分配（默认平均分配）
                const proportion = forecastFactorSum > 0 ? factor / forecastFactorSum : 1 / 4; // 9-12 月平均分配
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

          // 生成 AI 决策描述（整合所有详细信息）
          // 注意：手工添加的因子不自动生成描述，由用户自行编辑
          if (!rec.isManualAdd) {
            const aiReasonParts = [];

            // 添加 AI 决策前缀
            aiReasonParts.push(`🤖 AI 决策：`);

            // 1. 业务理由
            if (rec.businessReason) {
              aiReasonParts.push(`【业务理由】${rec.businessReason}`);
            }

            // 2. 数据依据
            if (rec.dataBasis) {
              aiReasonParts.push(`【数据依据】${rec.dataBasis}`);
            }

            // 3. 风险提示（兼容 risks 和 riskWarning 字段）
            const riskText = rec.risks || rec.riskWarning;
            if (riskText) {
              aiReasonParts.push(`【风险提示】${riskText}`);
            }

            // 4. 因子联动
            if (rec.factorLinkage) {
              aiReasonParts.push(`【因子联动】${rec.factorLinkage}`);
            }

            // 5. 如果以上都没有，使用通用描述
            if (aiReasonParts.length === 1) { // 只有 AI 决策前缀
              aiReasonParts.push(`基于业务目标和敏感性分析，建议调整${node.name}从${formatValue(currentValue, node.format, node.unit)}到${formatValue(numericValue, node.format, node.unit)}`);
            }

            updates.adjustmentDescription = aiReasonParts.join('\n\n');
          }
          // 如果是手工添加的因子，不设置 adjustmentDescription

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
      monthlyFactors = Array.from({ length: 12 }, (_, i) => Math.round((0.7 + i * 0.06) * 100) / 100); // 动态生成增长序列 [0.7, 0.76, ..., 1.36]
      strategyBadge = '比例跟随';
    } else if (isCostFactor) {
      // 成本优化型 - 前低后高
      monthlyStrategy = '成本优化型';
      monthlyFactors = Array.from({ length: 12 }, (_, i) => Math.round((1.1 - i * 0.025) * 100) / 100); // 动态生成递减序列 [1.1, 1.075, ..., 0.825]
      strategyBadge = '成本优化';
    } else if (/收入|Revenue|Sales/i.test(nodeName)) {
      // 收入增长型 - 前低后高（旺季在后面）
      monthlyStrategy = '收入增长型';
      monthlyFactors = Array.from({ length: 12 }, (_, i) => Math.round((0.7 + i * 0.06) * 100) / 100); // 动态生成增长序列 [0.7, 0.76, ..., 1.36]
      strategyBadge = '收入增长';
    } else {
      // 默认平均分配
      monthlyStrategy = '平均分配';
      monthlyFactors = Array(12).fill(1.0); // 平均分配
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
            {adjustment.isAIRecommend && (
              

              <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">AI推导</span>
            )}
            {adjustment.isManualAdd && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                ✏️ 手工添加
              </span>
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {isExpanded ? '收起详情' : '查看详情'}
        </button>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
            {/* 数据依据 */}
            {adjustment.dataBasis ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="font-medium text-blue-800 text-xs">数据依据</span>
                </div>
                <div className="text-xs text-blue-700 leading-relaxed">{adjustment.dataBasis}</div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center">
                <span className="text-xs text-gray-400">数据依据：等待补充...</span>
              </div>
            )}

            {/* 业务理由 */}
            {adjustment.businessReason ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span className="font-medium text-green-800 text-xs">业务理由</span>
                </div>
                <div className="text-xs text-green-700 leading-relaxed">{adjustment.businessReason}</div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center">
                <span className="text-xs text-gray-400">业务理由：等待补充...</span>
              </div>
            )}

            {/* 风险提示 */}
            {adjustment.riskWarning ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="font-medium text-amber-800 text-xs">风险提示</span>
                </div>
                <div className="text-xs text-amber-700 leading-relaxed">{adjustment.riskWarning}</div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center">
                <span className="text-xs text-gray-400">风险提示：暂无</span>
              </div>
            )}

            {/* 因子联动说明 */}
            {adjustment.factorLinkage ? (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="font-medium text-purple-800 text-xs">因子联动</span>
                </div>
                <div className="text-xs text-purple-700 leading-relaxed">{adjustment.factorLinkage}</div>
              </div>
            ) : null}

            {/* 月度分配详情 */}
            {adjustment.monthlyFactors && adjustment.monthlyFactors.length === 12 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium text-gray-700 text-xs">月度分配详情</span>
                  </div>
                  <span className="text-xs text-indigo-600 font-medium">{adjustment.monthlyStrategy || '策略'}</span>
                </div>
                {/* 月度系数柱状图 */}
                <div className="flex items-end justify-between gap-1 h-20 pb-1">
                  {adjustment.monthlyFactors.map((factor, idx) => {
                    const maxFactor = Math.max(...adjustment.monthlyFactors);
                    const heightPercent = maxFactor > 0 ? Math.min(100, Math.max(10, (factor / maxFactor) * 100)) : 10;
                    const isAboveAvg = factor > 1;
                    return (
                      <div key={idx} className="flex-1 min-w-0 flex flex-col items-center gap-1 group relative">
                        <div
                          className="w-full rounded-t-sm transition-all hover:opacity-80"
                          style={{
                            height: `${(heightPercent / 100) * 64}px`,
                            background: isAboveAvg
                              ? 'linear-gradient(to top, rgb(99 102 241), rgb(168 85 247))'
                              : 'linear-gradient(to top, rgb(156 163 175), rgb(209 213 219))'
                          }}
                          title={`${idx + 1}月：${factor}`}
                        />
                        <span className="text-[8px] text-gray-500 leading-none">{idx + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 mt-2 text-center">
                <span className="text-xs text-gray-400">
                  月度数据：{adjustment.monthlyFactors ? `长度${adjustment.monthlyFactors.length}` : '无'}
                </span>
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

  // 如果模型未加载，显示提示
  if (!hasModel) {
    return (
      <div
        ref={containerRef}
        className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 w-[800px] h-[400px] flex flex-col resize overflow-auto"
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
            <span className="text-white font-medium">AI 智能调参</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">指标模型未加载</h3>
            <p className="text-sm text-gray-500 mb-6 max-w-md">
              AI 调参功能需要指标模型才能运行。请先导入或创建指标模型（包含初始数据和计算关系）。
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  onClose();
                  // 触发导入事件
                  window.dispatchEvent(new CustomEvent('vdt-open-import'));
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                导入指标模型
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

          {/* 因子匹配检测结果 */}
          {factorDetection.detected && (factorDetection.matched.length > 0 || factorDetection.unmatched.length > 0) && (
            <div className="mt-2 p-3 rounded-lg border text-sm">
              {factorDetection.matched.length > 0 && (
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-green-800 font-medium">已匹配模型因子 ({factorDetection.matched.length})：</span>
                </div>
              )}
              {factorDetection.matched.length > 0 && (
                <div className="pl-6 flex flex-wrap gap-1 mb-2">
                  {factorDetection.matched.map((f, i) => (
                    <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">{f.name}</span>
                  ))}
                </div>
              )}

              {factorDetection.unmatched.length > 0 && (
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-amber-800 font-medium">模型无此指标 ({factorDetection.unmatched.length})：</span>
                </div>
              )}
              {factorDetection.unmatched.length > 0 && (
                <div className="pl-6 flex flex-wrap gap-1">
                  {factorDetection.unmatched.map((f, i) => (
                    <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">⚠️ {f.name}</span>
                  ))}
                </div>
              )}
            </div>
          )}

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

          {/* 节点选择器 */}
          <div className="mt-4">
            <NodeSelector
              nodes={nodes}
              selectedMetrics={selectedMetrics}
              selectedDrivers={selectedDrivers}
              targetMetric={selectedMetrics.length > 0 ? selectedMetrics[0] : null}
              mode={nodeSelectorMode}
              onChange={(selection) => {
                setSelectedMetrics(selection.metrics);
                setSelectedDrivers(selection.drivers);
                setNodeSelectorMode(selection.mode);
                if (selection.enableAIFallback !== undefined) {
                  setEnableAIFallback(selection.enableAIFallback);
                }
              }}
            />
          </div>

          {/* 冲突警告 */}
          {conflictWarnings.length > 0 && (
            <div className="mt-3 space-y-2">
              {conflictWarnings.map((warning, i) => (
                <div key={i} className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">⚠️</span>
                    <div className="text-sm text-yellow-800">{warning.message}</div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => warning.onConfirm?.()}
                      className="text-xs px-2 py-1 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded"
                    >
                      {warning.confirmText || '确认'}
                    </button>
                    <button
                      onClick={() => {
                        const newWarnings = [...conflictWarnings];
                        newWarnings.splice(i, 1);
                        setConflictWarnings(newWarnings);
                      }}
                      className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded"
                    >
                      忽略
                    </button>
                  </div>
                </div>
              ))}
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

        {/* ===== 已选场景和知识库 ===== */}
        <div className="px-4 pb-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
          {/* 规则管理面板 - 展开/收起 */}
          {showRulePanel && (
            <div className="mb-3 mx-2">
              <ConstraintRulePanel onClose={() => setShowRulePanel(false)} />
            </div>
          )}
          {/* 别名管理面板 - 展开/收起 */}
          {showAliasPanel && (
            <div className="mb-3 mx-2">
              <FactorAliasPanel onClose={() => setShowAliasPanel(false)} />
            </div>
          )}

          <div className="flex items-center gap-4">
            {/* 已选场景 */}
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">📋 已选场景</div>
              <div className="flex items-center gap-2">
                {activeScenarios.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {activeScenarios.map(s => (
                      <span key={s.id} className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded">
                        {s.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-orange-500 font-medium">⚠️ 未选择</span>
                )}
              </div>
            </div>
            {/* 已选知识库 */}
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">📚 已选知识库</div>
              <div className="flex items-center gap-2">
                {selectedKnowledgeEntries.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedKnowledgeEntries.map(e => (
                      <span key={e.id} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                        {e.title?.substring(0, 10) || e.scenario || '知识库'}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-orange-500 font-medium">⚠️ 未选择</span>
                )}
              </div>
            </div>
            {/* 快速入口按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // 通过触发 Toolbar 中的按钮来打开场景选择
                  const event = new MouseEvent('click', { bubbles: true });
                  const scenarioBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                    btn.textContent.includes('选择场景') || btn.textContent.includes('场景选择')
                  );
                  // 如果找不到，尝试调用 window 上的方法
                  if (window.showScenarioSelectorSetter) {
                    window.showScenarioSelectorSetter(true);
                  } else if (scenarioBtn) {
                    scenarioBtn.click();
                  } else {
                    alert('请通过顶部工具栏「AI 决策」→「场景选择」打开');
                  }
                }}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
              >
                选择场景
              </button>
              <button
                onClick={() => {
                  const kbBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                    btn.textContent.includes('选择知识库') || btn.textContent.includes('知识库')
                  );
                  if (window.showKnowledgeBaseSetter) {
                    window.showKnowledgeBaseSetter(true);
                  } else if (kbBtn) {
                    kbBtn.click();
                  } else {
                    alert('请通过顶部工具栏「AI 决策」→「知识库」打开');
                  }
                }}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                选择知识库
              </button>
              <button
                onClick={() => setShowRulePanel(!showRulePanel)}
                className="px-3 py-1.5 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                规则管理
              </button>
              <button
                onClick={() => setShowAliasPanel(!showAliasPanel)}
                className="px-3 py-1.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
              >
                别名管理
              </button>
            </div>
          </div>
        </div>

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
                    {/* 场景类型显示 */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-500">📋 场景类型:</span>
                      <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded font-medium">
                        {aiResult.understanding.scenarioType || '自动识别'}
                      </span>
                      {activeScenarios.length > 0 && (
                        <span className="text-xs text-gray-400">
                          (已选：{activeScenarios.map(s => s.name).join(', ')})
                        </span>
                      )}
                    </div>
                    {/* 业务背景理解 */}
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
                      {aiResult.ruleConstraints?.length > 0 && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">用户指定约束（规则引擎解析）</div>
                          <div className="space-y-1">
                            {aiResult.ruleConstraints.map((c, i) => (
                              <div key={i} className="text-sm text-green-700">• {c.description}</div>
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
                        {aiResult.expectedImpact.keyMetrics.map((metric, i) => {
                          // 检查是否是不在模型中的指标
                          if (metric.notInModel) {
                            return (
                              <div key={i} className="p-3 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-800">{metric.name}</span>
                                  <span className="text-xs text-gray-500">概率：{metric.probability || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-sm text-gray-400">⚠️ 模型无此指标</span>
                                </div>
                              </div>
                            );
                          }

                          // 动态计算百分比变化
                          const changePercent = metric.before && metric.after
                            ? ((metric.after - metric.before) / Math.abs(metric.before)) * 100
                            : 0;
                          const changeText = changePercent >= 0 ? `+${changePercent.toFixed(1)}%` : `${changePercent.toFixed(1)}%`;

                          return (
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
                              <span className={`text-sm ${changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{changeText}</span>
                            </div>
                          </div>
                          );
                        })}
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

            {/* 目标验证结果（单独显示，不在调整列表中） */}
            {validationResult && (
              <div className="border-b border-gray-200">
                <SectionHeader
                  title="📊 目标验证"
                  icon=""
                  badge={validationResult.riskWarning?.includes('✅') ? '达标' : '未达标'}
                  badgeColor={validationResult.riskWarning?.includes('✅') ? 'green' : 'orange'}
                  expanded={expandedSections.validation}
                  onToggle={() => toggleSection('validation')}
                />
                {expandedSections.validation && (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm text-gray-600">预期{validationResult.metricName || '净利润'}</div>
                        <div className="text-2xl font-bold text-gray-900">{validationResult.formattedValue || validationResult.currentValue}</div>
                      </div>
                      <div className="text-gray-400">→</div>
                      <div>
                        <div className="text-sm text-gray-600">目标{validationResult.metricName || '净利润'}</div>
                        <div className="text-2xl font-bold text-gray-900">{validationResult.formattedTarget || validationResult.recommendedValue}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">差距</div>
                        <div className={`text-xl font-bold ${
                          validationResult.gap >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {validationResult.gap >= 0 ? '超出' : '差距'}
                          {validationResult.formattedGap || Math.round(Math.abs(validationResult.currentValue - validationResult.recommendedValue))}
                          {validationResult.formattedChangePercent && (
                            <span className={`text-sm ml-1 ${
                              validationResult.gap >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              ({validationResult.gap >= 0 ? '+' : '-'}{validationResult.formattedChangePercent})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          变化额：{validationResult.gap >= 0 ? '+' : ''}{Math.round(validationResult.gap)}{validationResult.unit || '万'}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      <strong>计算逻辑：</strong>{validationResult.businessReason}
                    </div>
                    <div className={`text-sm p-2 rounded ${validationResult.riskWarning?.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                      {validationResult.riskWarning}
                    </div>
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
