import React, { useState, useEffect, useRef } from 'react';

/**
 * 规则映射管理面板 - 增强版（可拖动、可调整大小）
 * 用于在 AI 调参窗口内显示规则管理功能
 */
const ConstraintRulePanel = ({ onClose, position: initialPosition = { x: 200, y: 150 } }) => {
  const [activeTab, setActiveTab] = useState('rules'); // 'rules' | 'units'
  const [rules, setRules] = useState([]);
  const [units, setUnits] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [editingRule, setEditingRule] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const headerRef = useRef(null);

  // 处理拖动
  const handleDragStart = (e) => {
    if (headerRef.current && headerRef.current.contains(e.target)) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 400));
    const newY = Math.max(80, Math.min(e.clientY - dragOffset.y, window.innerHeight - 200));
    setPosition({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, dragOffset, position]);

  // 从 localStorage 加载规则
  useEffect(() => {
    const savedRules = localStorage.getItem('vdt_constraint_rules');
    if (savedRules) {
      try {
        setRules(JSON.parse(savedRules));
      } catch (e) {
        loadDefaultRules();
      }
    } else {
      loadDefaultRules();
    }
  }, []);

  // 从 localStorage 加载单位
  useEffect(() => {
    const savedUnits = localStorage.getItem('vdt_constraint_units');
    if (savedUnits) {
      try {
        setUnits(JSON.parse(savedUnits));
      } catch (e) {
        loadDefaultUnits();
      }
    } else {
      loadDefaultUnits();
    }
  }, []);

  // 保存到 localStorage
  useEffect(() => {
    if (rules.length > 0) {
      localStorage.setItem('vdt_constraint_rules', JSON.stringify(rules));
    }
  }, [rules]);

  // 保存单位到 localStorage
  useEffect(() => {
    if (units.length > 0) {
      localStorage.setItem('vdt_constraint_units', JSON.stringify(units));
    }
  }, [units]);

  // 加载默认规则
  const loadDefaultRules = () => {
    const defaultRules = [
      { id: 'allow_override', name: '允许超出', category: 'allow', keywords: ['允许', '可', '可以', '能'], triggerWords: ['超出', '超过', '超支', '超预算'], actionType: 'max_override', enabled: true },
      { id: 'control_limit', name: '控制限制', category: 'allow', keywords: ['控制在', '不超过', '最多', '至多', '以内'], triggerWords: [], actionType: 'max_limit', enabled: true },
      { id: 'increase', name: '增加/增长', category: 'change', keywords: ['增加', '增长', '提升', '提高', '拉升'], triggerWords: [], actionType: 'increase', enabled: true },
      { id: 'decrease', name: '降低/减少', category: 'change', keywords: ['降低', '减少', '削减', '压缩', '下降'], triggerWords: [], actionType: 'decrease', enabled: true },
      { id: 'must_reduce', name: '必须降低', category: 'must', keywords: ['必须', '需要', '务必'], triggerWords: ['降低', '减少', '削减'], actionType: 'must_reduce', enabled: true }
    ];
    setRules(defaultRules);
  };

  // 加载默认单位
  const loadDefaultUnits = () => {
    const defaultUnits = [
      { id: 'percentage_point', name: '百分点', keywords: ['个百分点', '个点', 'pp', 'PP'], multiplier: 1, type: 'ratio' },
      { id: 'percent', name: '百分比', keywords: ['%', '百分之', 'percent'], multiplier: 0.01, type: 'ratio' },
      { id: 'ten_thousand', name: '万元', keywords: ['万', '万元'], multiplier: 1, type: 'absolute' },
      { id: 'yuan', name: '元', keywords: ['元', '块钱'], multiplier: 0.0001, type: 'absolute' },
      { id: 'million', name: '百万元', keywords: ['百万'], multiplier: 100, type: 'absolute' },
      { id: 'hundred_million', name: '亿元', keywords: ['亿', '亿元'], multiplier: 10000, type: 'absolute' }
    ];
    setUnits(defaultUnits);
  };

  const toggleCategory = (category) => setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  const toggleRuleEnabled = (ruleId) => setRules(prev => prev.map(rule => rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule));
  const deleteRule = (ruleId) => { if (confirm('确定要删除这条规则吗？')) setRules(prev => prev.filter(rule => rule.id !== ruleId)); };
  const saveRule = (updatedRule) => { setRules(prev => prev.map(rule => rule.id === updatedRule.id ? updatedRule : rule)); setEditingRule(null); };
  const addRule = (newRule) => { newRule.id = `rule_${Date.now()}`; newRule.enabled = true; setRules(prev => [...prev, newRule]); setShowAddModal(false); };

  // 单位管理函数
  const toggleUnitEnabled = (unitId) => setUnits(prev => prev.map(unit => unit.id === unitId ? { ...unit, enabled: !unit.enabled } : unit));
  const deleteUnit = (unitId) => { if (confirm('确定要删除这个单位吗？')) setUnits(prev => prev.filter(unit => unit.id !== unitId)); };
  const saveUnit = (updatedUnit) => { setUnits(prev => prev.map(unit => unit.id === updatedUnit.id ? updatedUnit : unit)); setEditingUnit(null); };
  const addUnit = (newUnit) => { newUnit.id = `unit_${Date.now()}`; newUnit.enabled = true; setUnits(prev => [...prev, newUnit]); setShowAddUnitModal(false); };

  const groupedRules = rules.reduce((acc, rule) => { if (!acc[rule.category]) acc[rule.category] = []; acc[rule.category].push(rule); return acc; }, {});
  const categoryNames = { allow: '允许类', control: '控制类', change: '变化类', must: '必须类' };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleDragStart}
      className="fixed bg-white rounded-xl shadow-2xl border z-[100] w-[450px] flex flex-col"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: 'calc(100vh - 80px)',
        cursor: isDragging ? 'grabbing' : 'default'
      }}
    >
      {/* 头部 - 拖动区域 */}
      <div
        ref={headerRef}
        className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 shrink-0 cursor-grab active:cursor-grabbing rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <div>
            <h4 className="text-sm font-semibold text-gray-700">规则映射管理</h4>
            <p className="text-xs text-gray-500">💡 拖动标题栏移动窗口</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'rules' && (
            <button onClick={() => setShowAddModal(true)} className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">➕ 添加</button>
          )}
          {activeTab === 'units' && (
            <button onClick={() => setShowAddUnitModal(true)} className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">➕ 添加</button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex border-b bg-gray-50">
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'rules'
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          📝 规则管理
        </button>
        <button
          onClick={() => setActiveTab('units')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'units'
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          📏 单位管理
        </button>
      </div>

      {/* 内容区 - 可滚动 */}
      <div className="p-3 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {activeTab === 'rules' && (
          <>
            <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
              <strong>📖 说明：</strong>规则映射表用于从用户输入中识别特殊约束<br/>
              <strong>💡 示例：</strong>"管理费用允许超出 10%" → 匹配"允许超出"规则
            </div>

            {Object.entries(groupedRules).map(([category, categoryRules]) => (
              <div key={category} className="mb-3">
                <button onClick={() => toggleCategory(category)} className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium text-gray-700">
                  <span>{categoryNames[category] || category} ({categoryRules.length}条)</span>
                  <svg className={`w-3 h-3 transition-transform ${expandedCategories[category] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {expandedCategories[category] && (
                  <div className="mt-2 space-y-1">
                    {categoryRules.map(rule => (
                      <div key={rule.id} className={`p-2 border rounded text-xs ${rule.enabled ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-200 opacity-70'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900">{rule.name}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditingRule(rule)} className="text-indigo-600 hover:text-indigo-800 p-0.5" title="编辑"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                            <button onClick={() => deleteRule(rule.id)} className="text-red-600 hover:text-red-800 p-0.5" title="删除"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            <label className="flex items-center gap-1 cursor-pointer ml-1"><input type="checkbox" checked={rule.enabled} onChange={() => toggleRuleEnabled(rule.id)} className="w-3 h-3 text-indigo-600 rounded" /><span className="text-gray-500">{rule.enabled ? '已启用' : '已禁用'}</span></label>
                          </div>
                        </div>
                        <div className="text-gray-500 text-xs mt-1">
                          {rule.keywords.length > 0 && <div><strong>关键词：</strong>{rule.keywords.join('、')}</div>}
                          {rule.triggerWords.length > 0 && <div><strong>触发词：</strong>{rule.triggerWords.join('、')}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
              <button onClick={() => { if (confirm('确定要重置为默认规则吗？')) loadDefaultRules(); }} className="flex-1 px-2 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">重置默认</button>
              <button onClick={() => { const dataStr = JSON.stringify(rules, null, 2); const dataBlob = new Blob([dataStr], { type: 'application/json' }); const url = URL.createObjectURL(dataBlob); const link = document.createElement('a'); link.href = url; link.download = `constraint_rules_${new Date().toISOString().split('T')[0]}.json`; link.click(); }} className="flex-1 px-2 py-1.5 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded">导出规则</button>
              <label className="flex-1 px-2 py-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded cursor-pointer text-center">
                导入规则
                <input type="file" accept=".json" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { try { const imported = JSON.parse(event.target.result); if (Array.isArray(imported)) { setRules(imported); alert('✅ 导入成功！'); } } catch (err) { alert('❌ 导入失败：' + err.message); } }; reader.readAsText(file); } }} className="hidden" />
              </label>
            </div>
          </>
        )}

        {activeTab === 'units' && (
          <>
            <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
              <strong>📏 说明：</strong>单位用于识别用户输入中的计量单位<br/>
              <strong>💡 示例：</strong>"100 万" → 单位"万" → 转换倍率 1 → 值 100
            </div>

            <div className="space-y-2">
              {units.map(unit => (
                <div key={unit.id} className={`p-2 border rounded text-xs ${unit.enabled !== false ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-200 opacity-70'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{unit.name}</span>
                      <span className="text-gray-500">({unit.id})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingUnit(unit)} className="text-indigo-600 hover:text-indigo-800 p-0.5" title="编辑"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                      <button onClick={() => deleteUnit(unit.id)} className="text-red-600 hover:text-red-800 p-0.5" title="删除"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      <label className="flex items-center gap-1 cursor-pointer ml-1"><input type="checkbox" checked={unit.enabled !== false} onChange={() => toggleUnitEnabled(unit.id)} className="w-3 h-3 text-indigo-600 rounded" /><span className="text-gray-500">{unit.enabled !== false ? '已启用' : '已禁用'}</span></label>
                    </div>
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
                    <div><strong>关键词：</strong>{unit.keywords.join('、')}</div>
                    <div><strong>类型：</strong>{unit.type === 'ratio' ? '比率' : '绝对额'}</div>
                    <div><strong>转换倍率：</strong>{unit.multiplier}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
              <button onClick={() => { if (confirm('确定要重置为默认单位吗？')) loadDefaultUnits(); }} className="flex-1 px-2 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">重置默认</button>
              <button onClick={() => { const dataStr = JSON.stringify(units, null, 2); const dataBlob = new Blob([dataStr], { type: 'application/json' }); const url = URL.createObjectURL(dataBlob); const link = document.createElement('a'); link.href = url; link.download = `constraint_units_${new Date().toISOString().split('T')[0]}.json`; link.click(); }} className="flex-1 px-2 py-1.5 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded">导出单位</button>
              <label className="flex-1 px-2 py-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded cursor-pointer text-center">
                导入单位
                <input type="file" accept=".json" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { try { const imported = JSON.parse(event.target.result); if (Array.isArray(imported)) { setUnits(imported); alert('✅ 导入成功！'); } } catch (err) { alert('❌ 导入失败：' + err.message); } }; reader.readAsText(file); } }} className="hidden" />
              </label>
            </div>
          </>
        )}
      </div>
      {editingRule && <RuleEditor rule={editingRule} onSave={saveRule} onClose={() => setEditingRule(null)} />}
      {showAddModal && <RuleEditor rule={null} onSave={addRule} onClose={() => setShowAddModal(false)} />}
      {editingUnit && <UnitEditor unit={editingUnit} onSave={saveUnit} onClose={() => setEditingUnit(null)} />}
      {showAddUnitModal && <UnitEditor unit={null} onSave={addUnit} onClose={() => setShowAddUnitModal(false)} />}
    </div>
  );
};

const RuleEditor = ({ rule, onSave, onClose }) => {
  const [formData, setFormData] = useState({ name: rule?.name || '', category: rule?.category || 'allow', actionType: rule?.actionType || 'max_override', keywords: rule?.keywords || [], triggerWords: rule?.triggerWords || [], enabled: rule?.enabled ?? true });
  const [keywordInput, setKeywordInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');

  const handleSubmit = (e) => { e.preventDefault(); onSave(rule ? { ...rule, ...formData } : formData); };
  const addKeyword = () => { if (keywordInput.trim()) { setFormData(prev => ({ ...prev, keywords: [...prev.keywords, keywordInput.trim()] })); setKeywordInput(''); } };
  const removeKeyword = (i) => { setFormData(prev => ({ ...prev, keywords: prev.keywords.filter((_, idx) => idx !== i) })); };
  const addTrigger = () => { if (triggerInput.trim()) { setFormData(prev => ({ ...prev, triggerWords: [...prev.triggerWords, triggerInput.trim()] })); setTriggerInput(''); } };
  const removeTrigger = (i) => { setFormData(prev => ({ ...prev, triggerWords: prev.triggerWords.filter((_, idx) => idx !== i) })); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{rule ? '编辑规则' : '添加规则'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">规则名称</label><input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">分类</label><select value={formData.category} onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"><option value="allow">允许类</option><option value="control">控制类</option><option value="change">变化类</option><option value="must">必须类</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">动作类型</label><select value={formData.actionType} onChange={(e) => setFormData(prev => ({ ...prev, actionType: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"><option value="max_override">允许超出</option><option value="max_limit">控制限制</option><option value="increase">增加</option><option value="decrease">降低</option><option value="must_reduce">必须降低</option><option value="must_reach">必须达到</option></select></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关键词</label>
            <div className="flex gap-2 mb-2"><input type="text" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())} placeholder="输入后按回车添加" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /><button type="button" onClick={addKeyword} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">添加</button></div>
            <div className="flex flex-wrap gap-1">{formData.keywords.map((kw, i) => (<span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">{kw}<button type="button" onClick={() => removeKeyword(i)} className="hover:text-indigo-900">×</button></span>))}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">触发词</label>
            <div className="flex gap-2 mb-2"><input type="text" value={triggerInput} onChange={(e) => setTriggerInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTrigger())} placeholder="输入后按回车添加" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /><button type="button" onClick={addTrigger} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">添加</button></div>
            <div className="flex flex-wrap gap-1">{formData.triggerWords.map((tw, i) => (<span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">{tw}<button type="button" onClick={() => removeTrigger(i)} className="hover:text-purple-900">×</button></span>))}</div>
          </div>
          <div className="flex items-center gap-2"><input type="checkbox" id="enabled" checked={formData.enabled} onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" /><label htmlFor="enabled" className="text-sm text-gray-700">启用此规则</label></div>
          <div className="flex justify-end gap-3 pt-3 border-t"><button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200">取消</button><button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">保存</button></div>
        </form>
      </div>
    </div>
  );
};

const UnitEditor = ({ unit, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: unit?.name || '',
    id: unit?.id || '',
    keywords: unit?.keywords || [],
    multiplier: unit?.multiplier || 1,
    type: unit?.type || 'absolute',
    enabled: unit?.enabled ?? true
  });
  const [keywordInput, setKeywordInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, id: unit?.id || `unit_${Date.now()}` });
  };
  const addKeyword = () => { if (keywordInput.trim()) { setFormData(prev => ({ ...prev, keywords: [...prev.keywords, keywordInput.trim()] })); setKeywordInput(''); } };
  const removeKeyword = (i) => { setFormData(prev => ({ ...prev, keywords: prev.keywords.filter((_, idx) => idx !== i) })); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{unit ? '编辑单位' : '添加单位'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">单位 ID</label><input type="text" value={formData.id} onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="例如：ten_thousand" disabled={!!unit} required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">单位名称</label><input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="例如：万元" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">类型</label><select value={formData.type} onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"><option value="ratio">比率</option><option value="absolute">绝对额</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">转换倍率</label><input type="number" step="0.0001" value={formData.multiplier} onChange={(e) => setFormData(prev => ({ ...prev, multiplier: parseFloat(e.target.value) }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="例如：1" required /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关键词</label>
            <div className="flex gap-2 mb-2"><input type="text" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())} placeholder="输入后按回车添加" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" /><button type="button" onClick={addKeyword} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">添加</button></div>
            <div className="flex flex-wrap gap-1">{formData.keywords.map((kw, i) => (<span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">{kw}<button type="button" onClick={() => removeKeyword(i)} className="hover:text-indigo-900">×</button></span>))}</div>
          </div>
          <div className="flex items-center gap-2"><input type="checkbox" id="unitEnabled" checked={formData.enabled} onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" /><label htmlFor="unitEnabled" className="text-sm text-gray-700">启用此单位</label></div>
          <div className="flex justify-end gap-3 pt-3 border-t"><button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200">取消</button><button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">保存</button></div>
        </form>
      </div>
    </div>
  );
};

export default ConstraintRulePanel;
