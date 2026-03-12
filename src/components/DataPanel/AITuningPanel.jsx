import React, { useState, useRef, useEffect, useMemo } from 'react';
import useVDTStore from '../../store/useVDTStore';
import { callAI } from '../../services/aiService';
import { buildTuningPrompt, parseAIResponse } from '../../utils/aiPromptBuilder';
import { parseTuningRequest, getParsedDescription } from '../../utils/nlUnderstanding';
import { Calculator } from '../../engine/Calculator';

/**
 * 可搜索下拉组件
 */
const SearchableSelect = ({ options, value, onChange, placeholder = '请选择...' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const containerRef = useRef(null);

  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) return options;
    const lower = searchText.toLowerCase();
    return options.filter((opt) => opt.name.toLowerCase().includes(lower));
  }, [options, searchText]);

  const selectedLabel = useMemo(() => {
    const selected = options.find((opt) => opt.id === value);
    return selected ? selected.name : '';
  }, [options, value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md cursor-pointer bg-white hover:border-indigo-400 flex items-center justify-between"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {selectedLabel || placeholder}
        </span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索..."
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">无匹配选项</div>
          ) : (
            filteredOptions.map((opt) => (
              <div
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                  setSearchText('');
                }}
                className={`px-3 py-2 cursor-pointer hover:bg-indigo-50 ${
                  value === opt.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'
                }`}
              >
                <div className="font-medium">{opt.name}</div>
                <div className="text-xs text-gray-500">
                  当前值: {opt.value?.toLocaleString() || 0} {opt.unit || ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

/**
 * AI调参面板 - 浮动窗口
 * 支持三种调参模式：初始方案、部分调整、智能扫描
 */
const AITuningPanel = ({ onClose, onBringToFront }) => {
  const nodes = useVDTStore((s) => s.nodes);
  const aiConfig = useVDTStore((s) => s.aiConfig);
  const updateNode = useVDTStore((s) => s.updateNode);
  const saveScenario = useVDTStore((s) => s.saveScenario);

  // 调参模式
  const [tuningMode, setTuningMode] = useState('initial');

  // 目标设置
  const [userGoal, setUserGoal] = useState('');
  const [targetNodeId, setTargetNodeId] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [optimizationDirection, setOptimizationDirection] = useState('reach'); // reach, maximize, minimize

  // 约束条件
  const [constraints, setConstraints] = useState([]);
  const [newConstraint, setNewConstraint] = useState('');

  // 锁定节点（部分调整模式）
  const [lockedNodes, setLockedNodes] = useState(new Set());

  // AI调参状态
  const [isLoading, setIsLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState(null);

  // 解析结果预览
  const [parsedPreview, setParsedPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // 窗口位置和拖拽
  const [position, setPosition] = useState({ x: 150, y: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // 计算指标选项
  const computedNodeOptions = useMemo(() => {
    return Object.values(nodes)
      .filter((n) => n.type === 'computed')
      .map((n) => ({
        id: n.id,
        name: n.name,
        value: n.value,
        unit: n.unit
      }));
  }, [nodes]);

  // 驱动因子列表
  const driverNodes = useMemo(() => {
    return Object.values(nodes).filter((n) => n.type === 'driver');
  }, [nodes]);

  // 切换节点锁定状态
  const toggleLockedNode = (nodeId) => {
    setLockedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // 添加约束条件
  const addConstraint = () => {
    if (newConstraint.trim()) {
      setConstraints((prev) => [...prev, newConstraint.trim()]);
      setNewConstraint('');
    }
  };

  // 删除约束条件
  const removeConstraint = (index) => {
    setConstraints((prev) => prev.filter((_, i) => i !== index));
  };

  // 自动解析用户输入
  useEffect(() => {
    const parsed = parseTuningRequest(userGoal, constraints, nodes);

    // 自动同步提取的目标到UI
    if (parsed.goal.targetNodeId && !targetNodeId) {
      setTargetNodeId(parsed.goal.targetNodeId);
    }
    if (parsed.goal.targetValue !== null && !targetValue) {
      setTargetValue(parsed.goal.targetValue.toString());
    }
    if (parsed.goal.direction) {
      setOptimizationDirection(parsed.goal.direction);
    }

    setParsedPreview(parsed);
    setShowPreview(parsed.isValid);
  }, [userGoal, constraints, nodes]);

  // 执行AI调参
  const runAITuning = async () => {
    if (!aiConfig.url || !aiConfig.model) {
      setError('请先配置AI参数');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAiResult(null);

    try {
      // 使用解析后的目标信息
      const finalTargetNodeId = targetNodeId || parsedPreview?.goal?.targetNodeId || '';
      const finalTargetValue = targetValue
        ? parseFloat(targetValue)
        : parsedPreview?.goal?.targetValue || null;

      const prompt = buildTuningPrompt({
        nodes,
        tuningMode,
        userGoal: parsedPreview?.aiDescription || userGoal,
        targetNodeId: finalTargetNodeId,
        targetValue: finalTargetValue,
        lockedNodes: Array.from(lockedNodes),
        constraints
      });

      const response = await callAI(aiConfig, [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]);

      const parsed = parseAIResponse(response.content);

      if (!parsed.success) {
        throw new Error(parsed.error || 'AI响应解析失败');
      }

      // 验证AI建议
      const validatedResult = validateAIResult(parsed.data, nodes);
      setAiResult(validatedResult);
    } catch (err) {
      setError(err.message || '调参失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 验证AI结果
  const validateAIResult = (data, allNodes) => {
    if (!data.recommendations || !Array.isArray(data.recommendations)) {
      return { ...data, recommendations: [] };
    }

    // 为每个建议添加当前实际值和默认status
    const validatedRecommendations = data.recommendations.map((rec) => {
      const node = allNodes[rec.nodeId];
      if (!node) return rec;

      const currentValue = node.value ?? node.baseline ?? 0;
      const recommendedValue = parseFloat(rec.recommendedValue);

      // 自动判断status：如果有推荐值且与当前值不同，则为adjusted
      let status = rec.status;
      if (!status) {
        if (!isNaN(recommendedValue) && Math.abs(recommendedValue - currentValue) > 0.001) {
          status = 'adjusted';
        } else {
          status = 'optimal';
        }
      }

      return {
        ...rec,
        currentValue,
        nodeName: node.name,
        unit: node.unit || '',
        status,
        recommendedValue: isNaN(recommendedValue) ? currentValue : recommendedValue
      };
    });

    return {
      ...data,
      recommendations: validatedRecommendations
    };
  };

  // 应用AI建议
  const applyRecommendations = () => {
    if (!aiResult?.recommendations) {
      console.log('AI调参: 没有recommendations', aiResult);
      return;
    }

    console.log('AI调参: 开始应用建议', aiResult.recommendations);

    aiResult.recommendations.forEach((rec) => {
      console.log('AI调参: 处理推荐', rec.nodeId, rec.status, rec.recommendedValue);
      if (rec.status === 'adjusted' && rec.recommendedValue !== undefined) {
        // 确保推荐值是数字
        const numericValue = parseFloat(rec.recommendedValue);
        const currentValue = parseFloat(rec.currentValue) || 1;
        if (!isNaN(numericValue)) {
          console.log('AI调参: 更新节点', rec.nodeId, '从', rec.currentValue, '到', numericValue);

          // 获取节点的 timeData 以进行同步更新
          const node = nodes[rec.nodeId];
          const updates = { value: numericValue };

          // 如果节点有 timeData，按比例更新月度数据
          if (node?.timeData && currentValue !== 0) {
            const ratio = numericValue / currentValue;
            const newTimeData = {};

            Object.entries(node.timeData).forEach(([key, val]) => {
              const numVal = parseFloat(val);
              if (!isNaN(numVal)) {
                // 按比例调整每个月的值
                newTimeData[key] = Math.round(numVal * ratio * 100) / 100;
              } else {
                newTimeData[key] = val;
              }
            });

            updates.timeData = newTimeData;
            console.log('AI调参: 同步更新 timeData', node.timeData, '->', newTimeData);
          }

          updateNode(rec.nodeId, updates);
        } else {
          console.warn('AI调参: 推荐值不是有效数字', rec.nodeId, rec.recommendedValue);
        }
      }
    });

    onClose();
  };

  // 保存为新方案
  const saveAsNewScenario = () => {
    if (!aiResult?.recommendations) return;

    // 先应用建议（同步更新 timeData）
    aiResult.recommendations.forEach((rec) => {
      if (rec.status === 'adjusted' && rec.recommendedValue !== undefined) {
        const numericValue = parseFloat(rec.recommendedValue);
        const currentValue = parseFloat(rec.currentValue) || 1;
        if (!isNaN(numericValue)) {
          const node = nodes[rec.nodeId];
          const updates = { value: numericValue };

          // 如果节点有 timeData，按比例更新月度数据
          if (node?.timeData && currentValue !== 0) {
            const ratio = numericValue / currentValue;
            const newTimeData = {};

            Object.entries(node.timeData).forEach(([key, val]) => {
              const numVal = parseFloat(val);
              if (!isNaN(numVal)) {
                newTimeData[key] = Math.round(numVal * ratio * 100) / 100;
              } else {
                newTimeData[key] = val;
              }
            });

            updates.timeData = newTimeData;
          }

          updateNode(rec.nodeId, updates);
        }
      }
    });

    // 保存为新方案
    saveScenario(`AI优化方案_${new Date().toLocaleTimeString()}`);
    onClose();
  };

  // 拖拽逻辑
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

  // 获取模式说明
  const getModeDescription = () => {
    switch (tuningMode) {
      case 'initial':
        return '从零开始，AI生成最优的驱动因子配置';
      case 'partial':
        return '锁定满意的驱动因子，AI只调整其他因子';
      case 'scan':
        return '全局扫描检查是否还有优化空间';
      default:
        return '';
    }
  };

  return (
    <div
      className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 w-[560px] max-h-[90vh] flex flex-col"
      style={{ left: position.x, top: position.y, zIndex: 100 }}
    >
      {/* 标题栏 - 固定 */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-t-lg cursor-move shrink-0"
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

      {/* 内容区 - 可滚动 */}
      <div className="p-4 ai-tuning-content space-y-4 overflow-y-auto">
        {/* 调参模式选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">调参模式</label>
          <div className="flex gap-2">
            {[
              { key: 'initial', label: '初始方案', icon: '🎯' },
              { key: 'partial', label: '部分调整', icon: '🔒' },
              { key: 'scan', label: '智能扫描', icon: '🔍' }
            ].map((mode) => (
              <button
                key={mode.key}
                onClick={() => setTuningMode(mode.key)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  tuningMode === mode.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="mr-1">{mode.icon}</span>
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">{getModeDescription()}</p>
        </div>

        {/* 目标设置 */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">优化目标</label>

          {/* 自然语言输入 */}
          <textarea
            value={userGoal}
            onChange={(e) => setUserGoal(e.target.value)}
            placeholder="用自然语言描述你的优化目标，例如：我想把净利润提升到280万，同时销售费用增加不超过20万..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />

          {/* 解析结果预览 */}
          {showPreview && parsedPreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">🤖 AI理解结果</span>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-blue-400 hover:text-blue-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="text-sm text-blue-700 whitespace-pre-wrap">
                {getParsedDescription(parsedPreview)}
              </div>
              {!parsedPreview.validation.hasGoal && userGoal && (
                <div className="mt-2 text-xs text-orange-600">
                  ⚠️ 未能从目标文本中提取到指标名称，请手动选择下方"目标指标"
                </div>
              )}
              {parsedPreview.validation.hasGoal && !parsedPreview.validation.hasTargetValue && (
                <div className="mt-2 text-xs text-orange-600">
                  ⚠️ 未能提取到目标数值，请手动填写下方"目标值"
                </div>
              )}
            </div>
          )}

          {/* 目标指标选择 - 强化说明 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              目标指标 {parsedPreview?.goal?.targetNodeName && !targetNodeId && (
                <span className="text-blue-600">（已从文本识别：{parsedPreview.goal.targetNodeName}）</span>
              )}
            </label>
            <SearchableSelect
              options={computedNodeOptions}
              value={targetNodeId}
              onChange={setTargetNodeId}
              placeholder="选择要优化的指标..."
            />
          </div>

          {/* 目标值和优化方向 */}
          {targetNodeId && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">优化方向</label>
                <select
                  value={optimizationDirection}
                  onChange={(e) => setOptimizationDirection(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="reach">达到目标值</option>
                  <option value="maximize">最大化</option>
                  <option value="minimize">最小化</option>
                </select>
              </div>
              {optimizationDirection === 'reach' && (
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">
                    目标值 {parsedPreview?.goal?.targetValue !== null && !targetValue && (
                      <span className="text-blue-600">（已从文本识别：{parsedPreview.goal.targetValue.toLocaleString()}）</span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder="输入目标值"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 约束条件 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">约束条件</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newConstraint}
              onChange={(e) => setNewConstraint(e.target.value)}
              placeholder="例如：成本不超过100万"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              onKeyPress={(e) => e.key === 'Enter' && addConstraint()}
            />
            <button
              onClick={addConstraint}
              disabled={!newConstraint.trim()}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm disabled:opacity-50"
            >
              添加
            </button>
          </div>
          {constraints.length > 0 && (
            <div className="space-y-1">
              {constraints.map((c, i) => {
                const parsedConstraint = parsedPreview?.constraints?.[i];
                return (
                  <div key={i} className="flex items-start justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                    <div className="flex-1">
                      <span className="text-gray-700">{c}</span>
                      {parsedConstraint?.parsed && (
                        <div className="text-xs text-blue-600 mt-0.5">
                          ✓ 识别：{parsedConstraint.nodeName}
                          {parsedConstraint.type === 'increase_max' && `（增加不超过${parsedConstraint.amount?.toLocaleString()}）`}
                          {parsedConstraint.type === 'increase_min' && `（增加至少${parsedConstraint.amount?.toLocaleString()}）`}
                          {parsedConstraint.type === 'decrease_max' && `（减少不超过${parsedConstraint.amount?.toLocaleString()}）`}
                          {parsedConstraint.type === 'decrease_min' && `（减少至少${parsedConstraint.amount?.toLocaleString()}）`}
                          {parsedConstraint.type === 'max_value' && `（不超过${parsedConstraint.value?.toLocaleString()}）`}
                          {parsedConstraint.type === 'min_value' && `（不低于${parsedConstraint.value?.toLocaleString()}）`}
                          {parsedConstraint.type === 'range' && `（在${parsedConstraint.minValue?.toLocaleString()}-${parsedConstraint.maxValue?.toLocaleString()}之间）`}
                          {parsedConstraint.type === 'must_reach' && `（必须达到${parsedConstraint.targetValue?.toLocaleString()}）`}
                          {parsedConstraint.type === 'must_exceed' && `（必须超过${parsedConstraint.targetValue?.toLocaleString()}）`}
                        </div>
                      )}
                      {parsedConstraint && !parsedConstraint.parsed && parsedConstraint.nodeName && (
                        <div className="text-xs text-orange-500 mt-0.5">
                          ? 识别到节点：{parsedConstraint.nodeName}，但未理解约束类型
                        </div>
                      )}
                      {parsedConstraint && !parsedConstraint.parsed && !parsedConstraint.nodeName && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          未能识别，将作为自然语言约束传递给AI
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeConstraint(i)}
                      className="text-gray-400 hover:text-red-500 ml-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 部分调整模式：锁定节点 */}
        {tuningMode === 'partial' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              锁定驱动因子 <span className="text-xs text-gray-500">（AI不会调整这些）</span>
            </label>
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
              {driverNodes.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">暂无驱动因子</div>
              ) : (
                <div className="space-y-1">
                  {driverNodes.map((node) => (
                    <div
                      key={node.id}
                      onClick={() => toggleLockedNode(node.id)}
                      className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            lockedNodes.has(node.id)
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-gray-300'
                          }`}
                        >
                          {lockedNodes.has(node.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm text-gray-700">{node.name}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {node.value ?? node.baseline ?? 0} {node.unit || ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center gap-2 text-red-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* AI结果预览 */}
        {aiResult && (
          <div className="border border-blue-200 rounded-md overflow-hidden">
            <div className="bg-blue-50 px-4 py-2 border-b border-blue-200">
              <h4 className="font-medium text-blue-800">AI调参建议</h4>
            </div>
            <div className="p-4 space-y-4">
              {/* 预期效果 */}
              {aiResult.expectedResult && (
                <div className="bg-green-50 p-3 rounded-md">
                  <div className="text-sm font-medium text-green-800 mb-1">预期效果</div>
                  <div className="text-sm text-green-700">
                    {aiResult.expectedResult.targetNodeName || '目标指标'}:
                    <span className="font-medium">
                      {' '}
                      {aiResult.expectedResult.currentValue?.toLocaleString()} →{' '}
                      {aiResult.expectedResult.predictedValue?.toLocaleString()}
                    </span>
                    {aiResult.expectedResult.improvementPercent && (
                      <span className="text-green-600 ml-1">
                        (+{aiResult.expectedResult.improvementPercent}%)
                      </span>
                    )}
                  </div>
                  {/* 目标差距 */}
                  {aiResult.expectedResult.gapClosed !== undefined && (
                    <div className="mt-2 text-sm">
                      <span className="text-gray-600">目标差距关闭：</span>
                      <span className={`font-medium ${aiResult.expectedResult.gapClosed >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                        {aiResult.expectedResult.gapClosed.toFixed(1)}%
                      </span>
                      {aiResult.expectedResult.gapClosed < 100 && (
                        <span className="text-xs text-gray-500 ml-2">(还有 {Math.round(100 - aiResult.expectedResult.gapClosed)}% 差距)</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 约束满足状态 */}
              {aiResult.constraintStatus && (
                <div className={`p-3 rounded-md ${aiResult.constraintStatus.allSatisfied ? 'bg-blue-50' : 'bg-yellow-50'}`}>
                  <div className={`text-sm font-medium ${aiResult.constraintStatus.allSatisfied ? 'text-blue-800' : 'text-yellow-800'}`}>
                    {aiResult.constraintStatus.allSatisfied ? '✓ 所有约束已满足' : '⚠ 约束未完全满足'}
                  </div>
                  {aiResult.constraintStatus.violations?.length > 0 && (
                    <div className="mt-2 text-sm text-yellow-700">
                      <div className="font-medium">违反的约束：</div>
                      <ul className="list-disc list-inside mt-1">
                        {aiResult.constraintStatus.violations.map((v, i) => (
                          <li key={i}>
                            {v.nodeName}: {v.recommended} (超出{v.type === 'above_max' ? '上限' : '下限'} {v.limit})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiResult.constraintStatus.notes && (
                    <div className="mt-1 text-sm text-gray-600">{aiResult.constraintStatus.notes}</div>
                  )}
                </div>
              )}

              {/* 优化空间评估 */}
              {aiResult.optimizationSpace && tuningMode === 'scan' && (
                <div className={`p-3 rounded-md ${
                  aiResult.optimizationSpace === '充足' ? 'bg-green-50 text-green-800' :
                  aiResult.optimizationSpace === '有限' ? 'bg-yellow-50 text-yellow-800' :
                  aiResult.optimizationSpace === '不足' ? 'bg-orange-50 text-orange-800' :
                  'bg-gray-50 text-gray-800'
                }`}>
                  <div className="text-sm font-medium">优化空间：{aiResult.optimizationSpace}</div>
                </div>
              )}

              {/* 智能扫描结果 */}
              {tuningMode === 'scan' && aiResult.isOptimal && (
                <div className="bg-green-50 p-3 rounded-md text-center">
                  <div className="text-lg font-medium text-green-800">✓ 当前配置已最优</div>
                  <div className="text-sm text-green-600 mt-1">
                    {aiResult.explanation || 'AI扫描未发现可优化空间'}
                  </div>
                </div>
              )}

              {/* 扫描模式：未达到目标警告 */}
              {tuningMode === 'scan' && !aiResult.isOptimal && aiResult.expectedResult?.gapClosed !== undefined && aiResult.expectedResult.gapClosed < 100 && (
                <div className="bg-orange-50 p-3 rounded-md">
                  <div className="text-sm font-medium text-orange-800">⚠ 尚未达到目标</div>
                  <div className="text-sm text-orange-600 mt-1">
                    当前配置还有 {Math.round(100 - aiResult.expectedResult.gapClosed)}% 的差距需要弥补
                  </div>
                </div>
              )}

              {/* 建议调整列表 */}
              {aiResult.recommendations?.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">建议调整</div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">驱动因子</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">初始→当前</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">建议值</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">变化</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {aiResult.recommendations
                        .filter((r) => r.status === 'adjusted')
                        .map((rec) => (
                          <tr key={rec.nodeId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-700">
                              {rec.nodeName}
                              {rec.monthlyAdjustment && (
                                <div className="text-xs text-blue-600 mt-0.5">
                                  📅 {rec.monthlyAdjustment.strategy}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500">
                              <div>{rec.currentValue?.toLocaleString()} {rec.unit}</div>
                              {rec.initialValue !== undefined && rec.initialValue !== rec.currentValue && (
                                <div className="text-xs text-gray-400">
                                  (初始: {rec.initialValue?.toLocaleString()})
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-blue-600">
                              {rec.recommendedValue?.toLocaleString()} {rec.unit}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span
                                className={`text-xs ${
                                  rec.changePercent > 0
                                    ? 'text-green-600'
                                    : rec.changePercent < 0
                                      ? 'text-red-600'
                                      : 'text-gray-500'
                                }`}
                              >
                                {rec.changePercent > 0 ? '+' : ''}
                                {rec.changePercent?.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>

                  {/* 月度调整详情 */}
                  {aiResult.recommendations.some((r) => r.monthlyAdjustment) && (
                    <div className="mt-3 bg-blue-50 p-3 rounded-md">
                      <div className="text-sm font-medium text-blue-800 mb-2">月度调整建议</div>
                      <div className="space-y-1">
                        {aiResult.recommendations
                          .filter((r) => r.monthlyAdjustment)
                          .map((rec) => (
                            <div key={rec.nodeId} className="text-sm text-blue-700">
                              <span className="font-medium">{rec.nodeName}:</span>
                              <span className="ml-1">{rec.monthlyAdjustment.strategy}</span>
                              {rec.monthlyAdjustment.notes && (
                                <span className="text-blue-600 ml-1">({rec.monthlyAdjustment.notes})</span>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* 锁定/已最优/受约束限制的说明 */}
                  {aiResult.recommendations.some((r) => r.status === 'locked' || r.status === 'optimal' || r.status === 'constrained') && (
                    <div className="mt-2 text-xs text-gray-500 space-y-1">
                      {aiResult.recommendations.some((r) => r.status === 'locked') && (
                        <div>
                          <span className="font-medium">已锁定：</span>
                          {aiResult.recommendations
                            .filter((r) => r.status === 'locked')
                            .map((r) => r.nodeName)
                            .join('、')}
                        </div>
                      )}
                      {aiResult.recommendations.some((r) => r.status === 'optimal') && (
                        <div>
                          <span className="font-medium">已达最优：</span>
                          {aiResult.recommendations
                            .filter((r) => r.status === 'optimal')
                            .map((r) => r.nodeName)
                            .join('、')}
                        </div>
                      )}
                      {aiResult.recommendations.some((r) => r.status === 'constrained') && (
                        <div>
                          <span className="font-medium">受约束限制：</span>
                          {aiResult.recommendations
                            .filter((r) => r.status === 'constrained')
                            .map((r) => `${r.nodeName}(${r.reason || ''})`)
                            .join('、')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 额外建议 */}
              {aiResult.suggestions?.length > 0 && (
                <div className="bg-indigo-50 p-3 rounded-md">
                  <div className="text-sm font-medium text-indigo-800 mb-2">额外建议</div>
                  <ul className="list-disc list-inside space-y-1">
                    {aiResult.suggestions.map((suggestion, i) => (
                      <li key={i} className="text-sm text-indigo-700">{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 说明 - 只要explanation存在就显示 */}
              {aiResult.explanation && (
                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                  <span className="font-medium">AI说明：</span>
                  {aiResult.explanation}
                </div>
              )}

              {/* 置信度 */}
              {aiResult.confidence && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">置信度：</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-600"
                      style={{ width: `${aiResult.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600">{Math.round(aiResult.confidence * 100)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-2">
          {!aiResult ? (
            <button
              onClick={runAITuning}
              disabled={isLoading || (!userGoal.trim() && !targetNodeId)}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  AI调参中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  获取AI建议
                </>
              )}
            </button>
          ) : (
            <>
              <button
                onClick={() => setAiResult(null)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
              >
                重新调参
              </button>
              <button
                onClick={applyRecommendations}
                disabled={!aiResult.recommendations?.some((r) => r.status === 'adjusted')}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-md disabled:opacity-50"
              >
                应用建议
              </button>
              <button
                onClick={saveAsNewScenario}
                disabled={!aiResult.recommendations?.some((r) => r.status === 'adjusted')}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md disabled:opacity-50"
              >
                保存为新方案
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AITuningPanel;
