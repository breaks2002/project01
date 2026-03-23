import React, { useState, useEffect, useCallback } from 'react';

/**
 * 特殊约束规则映射管理组件
 * 允许用户查看和编辑特殊约束的规则映射表
 */
const ConstraintRuleManager = ({ onClose, onBringToFront }) => {
  // 窗口拖拽
  const [position, setPosition] = useState({ x: 200, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // 规则数据
  const [rules, setRules] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [editingRule, setEditingRule] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // 从 localStorage 加载规则
  useEffect(() => {
    const savedRules = localStorage.getItem('vdt_constraint_rules');
    if (savedRules) {
      try {
        setRules(JSON.parse(savedRules));
      } catch (e) {
        console.error('加载规则失败:', e);
        loadDefaultRules();
      }
    } else {
      loadDefaultRules();
    }
  }, []);

  // 加载默认规则
  const loadDefaultRules = () => {
    const defaultRules = [
      {
        id: 'allow_override',
        name: '允许超出',
        category: 'allow',
        keywords: ['允许', '可', '可以', '能', '容许'],
        triggerWords: ['超出', '超过', '超支', '超预算', '突破'],
        symbols: ['>', '≥'],
        actionType: 'max_override',
        enabled: true
      },
      {
        id: 'control_limit',
        name: '控制限制',
        category: 'allow',
        keywords: ['控制在', '不超过', '最多', '至多', '不大于', '不高于', '封顶', '以内'],
        triggerWords: [],
        symbols: ['<', '≤'],
        actionType: 'max_limit',
        enabled: true
      },
      {
        id: 'increase',
        name: '增加/增长',
        category: 'change',
        keywords: ['增加', '增长', '提升', '提高', '拉升', '拉动', '往上拉', '上调'],
        triggerWords: [],
        symbols: ['>', '≥', '↑'],
        actionType: 'increase',
        enabled: true
      },
      {
        id: 'decrease',
        name: '降低/减少',
        category: 'change',
        keywords: ['降低', '减少', '削减', '压缩', '下降', '下调', '缩减'],
        triggerWords: [],
        symbols: ['<', '≤', '↓'],
        actionType: 'decrease',
        enabled: true
      },
      {
        id: 'must_reduce',
        name: '必须降低',
        category: 'must',
        keywords: ['必须', '需要', '要', '务必', '力争', '力求'],
        triggerWords: ['降低', '减少', '削减', '压缩', '下降'],
        symbols: [],
        actionType: 'must_reduce',
        enabled: true
      },
      {
        id: 'must_reach',
        name: '必须达到',
        category: 'must',
        keywords: ['必须', '需要', '要', '务必', '力争', '力求'],
        triggerWords: ['达到', '达成', '完成', '实现', '不低于', '不少于'],
        symbols: [],
        actionType: 'must_reach',
        enabled: true
      }
    ];
    setRules(defaultRules);
  };

  // 保存规则到 localStorage
  useEffect(() => {
    if (rules.length > 0) {
      localStorage.setItem('vdt_constraint_rules', JSON.stringify(rules));
    }
  }, [rules]);

  // 窗口拖拽处理
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // 切换分类展开/折叠
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // 切换规则启用状态
  const toggleRuleEnabled = (ruleId) => {
    setRules(prev => prev.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  // 删除规则
  const deleteRule = (ruleId) => {
    if (confirm('确定要删除这条规则吗？')) {
      setRules(prev => prev.filter(rule => rule.id !== ruleId));
    }
  };

  // 保存编辑的规则
  const saveRule = (updatedRule) => {
    setRules(prev => prev.map(rule =>
      rule.id === updatedRule.id ? updatedRule : rule
    ));
    setEditingRule(null);
  };

  // 添加新规则
  const addRule = (newRule) => {
    newRule.id = `custom_${Date.now()}`;
    newRule.enabled = true;
    setRules(prev => [...prev, newRule]);
    setShowAddModal(false);
  };

  // 导出规则
  const exportRules = () => {
    const dataStr = JSON.stringify(rules, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `constraint_rules_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  // 导入规则
  const importRules = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedRules = JSON.parse(event.target.result);
        if (Array.isArray(importedRules)) {
          setRules(importedRules);
          alert('✅ 规则导入成功！');
        } else {
          alert('❌ 导入格式错误，应为 JSON 数组');
        }
      } catch (err) {
        alert('❌ 导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // 重置为默认规则
  const resetToDefault = () => {
    if (confirm('确定要重置为默认规则吗？当前自定义规则将丢失。')) {
      loadDefaultRules();
    }
  };

  // 按分类分组
  const groupedRules = rules.reduce((acc, rule) => {
    if (!acc[rule.category]) {
      acc[rule.category] = [];
    }
    acc[rule.category].push(rule);
    return acc;
  }, {});

  const categoryNames = {
    allow: '允许类',
    control: '控制类',
    change: '变化类',
    must: '必须类'
  };

  return (
    <div
      className="fixed z-[60] bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: '900px',
        maxHeight: '80vh'
      }}
    >
      {/* 标题栏 */}
      <div
        className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between cursor-move"
        onMouseDown={handleMouseDown}
      >
        <h3 className="text-white font-semibold flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          特殊约束规则映射管理
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加规则
        </button>
        <button
          onClick={exportRules}
          className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition-colors"
        >
          导出规则
        </button>
        <label className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition-colors cursor-pointer">
          导入规则
          <input
            type="file"
            accept=".json"
            onChange={importRules}
            className="hidden"
          />
        </label>
        <button
          onClick={resetToDefault}
          className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition-colors"
        >
          重置默认
        </button>
        <div className="flex-1" />
        <div className="text-sm text-gray-500">
          共 {rules.length} 条规则，{rules.filter(r => r.enabled).length} 条已启用
        </div>
      </div>

      {/* 内容区 */}
      <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 140px)' }}>
        {/* 使用说明 */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-900 mb-1">📖 使用说明</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• 规则映射表用于定义如何从用户输入中识别特殊约束</li>
            <li>• 每个规则包含：关键词、触发词、符号、动作类型</li>
            <li>• 系统会匹配因子名称 + 关键词 + 数值 + 单位的组合</li>
            <li>• 例如："管理费用允许超出 10%" → 匹配"允许超出"规则 → 设置为最大允许值</li>
            <li>• 可以禁用不需要的规则，或添加自定义规则</li>
          </ul>
        </div>

        {/* 规则列表 */}
        {Object.entries(groupedRules).map(([category, categoryRules]) => (
          <div key={category} className="mb-4">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <span className="font-medium text-gray-700">
                {categoryNames[category] || category}
                <span className="ml-2 text-sm text-gray-500">({categoryRules.length}条)</span>
              </span>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${expandedCategories[category] ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedCategories[category] && (
              <div className="mt-2 space-y-2">
                {categoryRules.map(rule => (
                  <div
                    key={rule.id}
                    className={`p-3 border rounded-lg transition-all ${
                      rule.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900">{rule.name}</span>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {rule.actionType}
                          </span>
                          {!rule.enabled && (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-500 rounded">
                              已禁用
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-gray-600 space-y-1">
                          {rule.keywords.length > 0 && (
                            <div>
                              <span className="text-gray-500">关键词：</span>
                              <span className="text-indigo-600">{rule.keywords.join('、')}</span>
                            </div>
                          )}
                          {rule.triggerWords.length > 0 && (
                            <div>
                              <span className="text-gray-500">触发词：</span>
                              <span className="text-purple-600">{rule.triggerWords.join('、')}</span>
                            </div>
                          )}
                          {rule.symbols.length > 0 && (
                            <div>
                              <span className="text-gray-500">符号：</span>
                              <span className="text-green-600">{rule.symbols.join('、')}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingRule(rule)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="编辑"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleRuleEnabled(rule.id)}
                          className={`p-1.5 rounded transition-colors ${
                            rule.enabled
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          title={rule.enabled ? '禁用' : '启用'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {rule.enabled ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            )}
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="删除"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 编辑规则模态框 */}
      {editingRule && (
        <RuleEditor
          rule={editingRule}
          onSave={saveRule}
          onClose={() => setEditingRule(null)}
        />
      )}

      {/* 添加规则模态框 */}
      {showAddModal && (
        <RuleEditor
          rule={null}
          onSave={addRule}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
};

/**
 * 规则编辑器组件
 */
const RuleEditor = ({ rule, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: rule?.name || '',
    category: rule?.category || 'allow',
    actionType: rule?.actionType || 'max_override',
    keywords: rule?.keywords || [],
    triggerWords: rule?.triggerWords || [],
    symbols: rule?.symbols || [],
    enabled: rule?.enabled ?? true
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');
  const [symbolInput, setSymbolInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...rule,
      ...formData
    });
  };

  const addKeyword = () => {
    if (keywordInput.trim()) {
      setFormData(prev => ({
        ...prev,
        keywords: [...prev.keywords, keywordInput.trim()]
      }));
      setKeywordInput('');
    }
  };

  const removeKeyword = (index) => {
    setFormData(prev => ({
      ...prev,
      keywords: prev.keywords.filter((_, i) => i !== index)
    }));
  };

  const addTrigger = () => {
    if (triggerInput.trim()) {
      setFormData(prev => ({
        ...prev,
        triggerWords: [...prev.triggerWords, triggerInput.trim()]
      }));
      setTriggerInput('');
    }
  };

  const removeTrigger = (index) => {
    setFormData(prev => ({
      ...prev,
      triggerWords: prev.triggerWords.filter((_, i) => i !== index)
    }));
  };

  const addSymbol = () => {
    if (symbolInput.trim()) {
      setFormData(prev => ({
        ...prev,
        symbols: [...prev.symbols, symbolInput.trim()]
      }));
      setSymbolInput('');
    }
  };

  const removeSymbol = (index) => {
    setFormData(prev => ({
      ...prev,
      symbols: prev.symbols.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {rule ? '编辑规则' : '添加规则'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              规则名称
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              >
                <option value="allow">允许类</option>
                <option value="control">控制类</option>
                <option value="change">变化类</option>
                <option value="must">必须类</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                动作类型
              </label>
              <select
                value={formData.actionType}
                onChange={(e) => setFormData(prev => ({ ...prev, actionType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              >
                <option value="max_override">允许超出</option>
                <option value="max_limit">控制限制</option>
                <option value="increase">增加</option>
                <option value="decrease">降低</option>
                <option value="must_reduce">必须降低</option>
                <option value="must_reach">必须达到</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              关键词（用于匹配用户输入）
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                placeholder="输入关键词后按回车添加"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              />
              <button
                type="button"
                onClick={addKeyword}
                className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                添加
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.keywords.map((kw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 text-sm rounded"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeyword(i)}
                    className="hover:text-indigo-900"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              触发词（可选，与关键词组合使用）
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={triggerInput}
                onChange={(e) => setTriggerInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTrigger())}
                placeholder="输入触发词后按回车添加"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              />
              <button
                type="button"
                onClick={addTrigger}
                className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                添加
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.triggerWords.map((tw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-sm rounded"
                >
                  {tw}
                  <button
                    type="button"
                    onClick={() => removeTrigger(i)}
                    className="hover:text-purple-900"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              符号（可选，如 &gt;, &lt;, ≥, ≤）
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSymbol())}
                placeholder="输入符号后按回车添加"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              />
              <button
                type="button"
                onClick={addSymbol}
                className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                添加
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.symbols.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-sm rounded"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSymbol(i)}
                    className="hover:text-green-900"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="enabled" className="text-sm text-gray-700">
              启用此规则
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConstraintRuleManager;
