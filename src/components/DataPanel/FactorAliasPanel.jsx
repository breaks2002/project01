import React, { useState, useEffect, useRef } from 'react';

/**
 * 因子别名与后缀管理面板
 * 用于管理用户输入与模型因子名称的匹配映射
 */
const FactorAliasPanel = ({ onClose, position: initialPosition = { x: 200, y: 150 } }) => {
  const [activeTab, setActiveTab] = useState('aliases'); // 'aliases' | 'suffixes'
  const [aliases, setAliases] = useState([]);
  const [suffixes, setSuffixes] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [editingAlias, setEditingAlias] = useState(null);
  const [showAddAliasModal, setShowAddAliasModal] = useState(false);
  const [editingSuffix, setEditingSuffix] = useState(null);
  const [showAddSuffixModal, setShowAddSuffixModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // 搜索关键词
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editorPosition, setEditorPosition] = useState({ x: 150, y: 200 });
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
    const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 500));
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

  // 从 localStorage 加载别名
  useEffect(() => {
    const savedAliases = localStorage.getItem('vdt_factor_aliases');
    if (savedAliases) {
      try {
        setAliases(JSON.parse(savedAliases));
      } catch (e) {
        loadDefaultAliases();
      }
    } else {
      loadDefaultAliases();
    }
  }, []);

  // 从 localStorage 加载后缀
  useEffect(() => {
    const savedSuffixes = localStorage.getItem('vdt_factor_suffixes');
    if (savedSuffixes) {
      try {
        setSuffixes(JSON.parse(savedSuffixes));
      } catch (e) {
        loadDefaultSuffixes();
      }
    } else {
      loadDefaultSuffixes();
    }
  }, []);

  // 保存别名到 localStorage
  useEffect(() => {
    if (aliases.length > 0) {
      localStorage.setItem('vdt_factor_aliases', JSON.stringify(aliases));
    }
  }, [aliases]);

  // 保存后缀到 localStorage
  useEffect(() => {
    if (suffixes.length > 0) {
      localStorage.setItem('vdt_factor_suffixes', JSON.stringify(suffixes));
    }
  }, [suffixes]);

  // 加载默认别名
  const loadDefaultAliases = () => {
    const defaultAliases = [
      { id: 'alias_gross_margin', canonicalName: '毛利率', aliases: ['毛利点', '毛利%', '盈利点', '毛利率%'], enabled: true },
      { id: 'alias_gross_profit', canonicalName: '毛利润', aliases: ['毛利', '毛利润额'], enabled: true },
      { id: 'alias_revenue', canonicalName: '营业收入', aliases: ['收入', '营收', '销售额', '营业额', '销售收入'], enabled: true },
      { id: 'alias_net_profit', canonicalName: '净利润', aliases: ['利润', '净利', '纯利润', '赚钱', '利润额'], enabled: true },
      { id: 'alias_operating_cost', canonicalName: '营业成本', aliases: ['成本', '营业成本', '直接成本', '生产成本'], enabled: true },
      { id: 'alias_sales_expense', canonicalName: '销售费用', aliases: ['销售费', '推广费', '广告费', '市场费用', '营销费用'], enabled: true },
      { id: 'alias_admin_expense', canonicalName: '管理费用', aliases: ['管理费', '行政费', '办公费', '管理费用'], enabled: true },
      { id: 'alias_rd_expense', canonicalName: '研发费用', aliases: ['研发费', '开发费', '技术研究费', '研发支出'], enabled: true },
      { id: 'alias_finance_expense', canonicalName: '财务费用', aliases: ['财务费', '利息支出', '融资费用'], enabled: true },
      { id: 'alias_labor_cost', canonicalName: '人力成本', aliases: ['人工成本', '工资', '薪酬', '人工费', '人力费用'], enabled: true },
      { id: 'alias_productivity', canonicalName: '人均效能', aliases: ['人效', '人均产出', '人均贡献', '人均利润'], enabled: true },
      { id: 'alias_employee_count', canonicalName: '员工总数', aliases: ['员工数', '人数', '团队规模', '人员数量'], enabled: true },
      { id: 'alias_capacity', canonicalName: '产能', aliases: ['产量', '生产能力', '产出量'], enabled: true },
      { id: 'alias_yield_rate', canonicalName: '良率', aliases: ['良品率', '合格率', '质量合格率'], enabled: true },
      { id: 'alias_production_efficiency', canonicalName: '生产效率', aliases: ['效率', '产出效率', '单位时间产出'], enabled: true }
    ];
    setAliases(defaultAliases);
  };

  // 加载默认后缀（用于用户输入时分词识别）
  const loadDefaultSuffixes = () => {
    const defaultSuffixes = [
      { id: 'suffix_001', suffix: '费用', enabled: true, description: '费用类指标' },
      { id: 'suffix_002', suffix: '成本', enabled: true, description: '成本类指标' },
      { id: 'suffix_003', suffix: '收入', enabled: true, description: '收入类指标' },
      { id: 'suffix_004', suffix: '利润', enabled: true, description: '利润类指标' },
      { id: 'suffix_005', suffix: '利率', enabled: true, description: '利率类指标' },
      { id: 'suffix_006', suffix: '率', enabled: true, description: '比率类指标' },
      { id: 'suffix_007', suffix: '额', enabled: true, description: '金额类指标' },
      { id: 'suffix_008', suffix: '效能', enabled: true, description: '效能类指标' },
      { id: 'suffix_009', suffix: '产能', enabled: true, description: '产能类指标' },
      { id: 'suffix_010', suffix: '良率', enabled: true, description: '良率类指标' },
      { id: 'suffix_011', suffix: '效率', enabled: true, description: '效率类指标' },
      { id: 'suffix_012', suffix: '人数', enabled: true, description: '人数类指标' },
      { id: 'suffix_013', suffix: '金额', enabled: true, description: '金额类指标' },
      { id: 'suffix_014', suffix: '占比', enabled: true, description: '占比类指标' },
      { id: 'suffix_015', suffix: '毛利率', enabled: true, description: '毛利率指标' },
      { id: 'suffix_016', suffix: '净利率', enabled: true, description: '净利率指标' },
      { id: 'suffix_017', suffix: '利润率', enabled: true, description: '利润率指标' }
    ];
    setSuffixes(defaultSuffixes);
  };

  // 别名管理函数
  const toggleAliasEnabled = (aliasId) => setAliases(prev => prev.map(alias => alias.id === aliasId ? { ...alias, enabled: !alias.enabled } : alias));
  const deleteAlias = (aliasId) => { if (confirm('确定要删除这个别名吗？')) setAliases(prev => prev.filter(alias => alias.id !== aliasId)); };
  const saveAlias = (updatedAlias) => { setAliases(prev => prev.map(alias => alias.id === updatedAlias.id ? updatedAlias : alias)); setEditingAlias(null); };
  const addAlias = (newAlias) => { newAlias.id = `alias_${Date.now()}`; newAlias.enabled = true; setAliases(prev => [...prev, newAlias]); setShowAddAliasModal(false); };

  // 后缀管理函数
  const toggleSuffixEnabled = (suffixId) => setSuffixes(prev => prev.map(suffix => suffix.id === suffixId ? { ...suffix, enabled: !suffix.enabled } : suffix));
  const deleteSuffix = (suffixId) => { if (confirm('确定要删除这个后缀吗？')) setSuffixes(prev => prev.filter(suffix => suffix.id !== suffixId)); };
  const saveSuffix = (updatedSuffix) => { setSuffixes(prev => prev.map(suffix => suffix.id === updatedSuffix.id ? updatedSuffix : suffix)); setEditingSuffix(null); };
  const addSuffix = (newSuffix) => { newSuffix.id = `suffix_${Date.now()}`; newSuffix.enabled = true; setSuffixes(prev => [...prev, newSuffix]); setShowAddSuffixModal(false); };

  // 搜索过滤
  const matchesSearch = (text) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  // 按首字母分组显示别名（带搜索过滤）
  const groupedAliases = aliases.reduce((acc, alias) => {
    // 搜索过滤：检查标准名和所有别名
    const searchText = [alias.canonicalName, ...(alias.aliases || [])].join(' ');
    if (searchQuery && !matchesSearch(searchText)) return acc;
    const firstChar = alias.canonicalName.charAt(0);
    if (!acc[firstChar]) acc[firstChar] = [];
    acc[firstChar].push(alias);
    return acc;
  }, {});

  // 后缀过滤
  const filteredSuffixes = suffixes.filter(suffix => {
    if (!searchQuery.trim()) return true;
    const searchText = [suffix.suffix, suffix.description || ''].join(' ');
    return matchesSearch(searchText);
  });

  return (
    <div
      ref={containerRef}
      onMouseDown={handleDragStart}
      className="fixed bg-white rounded-xl shadow-2xl border z-[100] w-[500px] flex flex-col"
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
        className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 shrink-0 cursor-grab active:cursor-grabbing rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🏷️</span>
          <div>
            <h4 className="text-sm font-semibold text-gray-700">因子别名与后缀管理</h4>
            <p className="text-xs text-gray-500">💡 配置用户输入与模型因子的匹配映射</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'aliases' && (
            <button onClick={() => setShowAddAliasModal(true)} className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">➕ 添加</button>
          )}
          {activeTab === 'suffixes' && (
            <button onClick={() => setShowAddSuffixModal(true)} className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">➕ 添加</button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex border-b bg-gray-50">
        <button
          onClick={() => setActiveTab('aliases')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'aliases'
              ? 'bg-white text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          🏷️ 别名管理
        </button>
        <button
          onClick={() => setActiveTab('suffixes')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'suffixes'
              ? 'bg-white text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          🔤 后缀管理
        </button>
      </div>

      {/* 搜索框 */}
      <div className="px-3 py-2 border-b bg-gray-50">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'aliases' ? '搜索标准名、别名...' : '搜索后缀、描述...'}
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <svg className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 内容区 - 可滚动 */}
      <div className="p-3 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        {activeTab === 'aliases' && (
          <>
            <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-800">
              <strong>🏷️ 说明：</strong>别名用于匹配用户输入与模型因子名称<br/>
              <strong>💡 示例：</strong>用户输入"毛利" → 匹配标准名"毛利润"
            </div>

            {Object.entries(groupedAliases).map(([char, groupAliases]) => (
              <div key={char} className="mb-3">
                <button
                  onClick={() => setExpandedGroups(prev => ({ ...prev, [char]: !prev[char] }))}
                  className="w-full flex items-center justify-between px-2 py-1.5 bg-purple-100 hover:bg-purple-200 rounded text-xs font-medium text-purple-700"
                >
                  <span>{char} ({groupAliases.length}条)</span>
                  <svg className={`w-3 h-3 transition-transform ${expandedGroups[char] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {expandedGroups[char] && (
                  <div className="mt-2 space-y-1">
                    {groupAliases.map(alias => (
                      <div key={alias.id} className={`p-2 border rounded text-xs ${alias.enabled ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-200 opacity-70'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{alias.canonicalName}</span>
                            <span className="text-gray-500 text-xs">({alias.id})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditingAlias(alias)} className="text-indigo-600 hover:text-indigo-800 p-0.5" title="编辑"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                            <button onClick={() => deleteAlias(alias.id)} className="text-red-600 hover:text-red-800 p-0.5" title="删除"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            <label className="flex items-center gap-1 cursor-pointer ml-1"><input type="checkbox" checked={alias.enabled} onChange={() => toggleAliasEnabled(alias.id)} className="w-3 h-3 text-indigo-600 rounded" /><span className="text-gray-500">{alias.enabled ? '已启用' : '已禁用'}</span></label>
                          </div>
                        </div>
                        <div className="text-gray-500 text-xs mt-1">
                          <div><strong>别名列表：</strong>{alias.aliases.length > 0 ? alias.aliases.join('、') : '无别名'}</div>
                          <div><strong>别名数量：</strong>{alias.aliases.length}个</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
              <button onClick={() => { if (confirm('确定要重置为默认别名吗？')) loadDefaultAliases(); }} className="flex-1 px-2 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">重置默认</button>
              <button onClick={() => { const dataStr = JSON.stringify(aliases, null, 2); const dataBlob = new Blob([dataStr], { type: 'application/json' }); const url = URL.createObjectURL(dataBlob); const link = document.createElement('a'); link.href = url; link.download = `factor_aliases_${new Date().toISOString().split('T')[0]}.json`; link.click(); }} className="flex-1 px-2 py-1.5 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded">导出别名</button>
              <label className="flex-1 px-2 py-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded cursor-pointer text-center">
                导入别名
                <input type="file" accept=".json" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { try { const imported = JSON.parse(event.target.result); if (Array.isArray(imported)) { setAliases(imported); alert('✅ 导入成功！'); } } catch (err) { alert('❌ 导入失败：' + err.message); } }; reader.readAsText(file); } }} className="hidden" />
              </label>
            </div>
          </>
        )}

        {activeTab === 'suffixes' && (
          <>
            <div className="mb-3 p-2 bg-pink-50 border border-pink-200 rounded text-xs text-pink-800">
              <strong>🔤 说明：</strong>后缀用于从用户输入中识别潜在的因子词汇<br/>
              <strong>💡 示例：</strong>输入"管理费用" → 后缀"费用"匹配 → 提取候选词
            </div>

            <div className="space-y-2">
              {filteredSuffixes.map(suffix => (
                <div key={suffix.id} className={`p-2 border rounded text-xs ${suffix.enabled !== false ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-200 opacity-70'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">{suffix.suffix}</span>
                      <span className="text-gray-500 text-xs">({suffix.id})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingSuffix(suffix)} className="text-indigo-600 hover:text-indigo-800 p-0.5" title="编辑"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                      <button onClick={() => deleteSuffix(suffix.id)} className="text-red-600 hover:text-red-800 p-0.5" title="删除"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      <label className="flex items-center gap-1 cursor-pointer ml-1"><input type="checkbox" checked={suffix.enabled !== false} onChange={() => toggleSuffixEnabled(suffix.id)} className="w-3 h-3 text-indigo-600 rounded" /><span className="text-gray-500">{suffix.enabled !== false ? '已启用' : '已禁用'}</span></label>
                    </div>
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
                    <div><strong>说明：</strong>{suffix.description || '无描述'}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
              <button onClick={() => { if (confirm('确定要重置为默认后缀吗？')) loadDefaultSuffixes(); }} className="flex-1 px-2 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">重置默认</button>
              <button onClick={() => { const dataStr = JSON.stringify(suffixes, null, 2); const dataBlob = new Blob([dataStr], { type: 'application/json' }); const url = URL.createObjectURL(dataBlob); const link = document.createElement('a'); link.href = url; link.download = `factor_suffixes_${new Date().toISOString().split('T')[0]}.json`; link.click(); }} className="flex-1 px-2 py-1.5 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded">导出后缀</button>
              <label className="flex-1 px-2 py-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded cursor-pointer text-center">
                导入后缀
                <input type="file" accept=".json" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { try { const imported = JSON.parse(event.target.result); if (Array.isArray(imported)) { setSuffixes(imported); alert('✅ 导入成功！'); } } catch (err) { alert('❌ 导入失败：' + err.message); } }; reader.readAsText(file); } }} className="hidden" />
              </label>
            </div>
          </>
        )}
      </div>

      {/* 编辑器模态框 */}
      {editingAlias && <AliasEditor alias={editingAlias} onSave={saveAlias} onClose={() => setEditingAlias(null)} position={editorPosition} />}
      {showAddAliasModal && <AliasEditor alias={null} onSave={addAlias} onClose={() => setShowAddAliasModal(false)} position={editorPosition} />}
      {editingSuffix && <SuffixEditor suffix={editingSuffix} onSave={saveSuffix} onClose={() => setEditingSuffix(null)} position={editorPosition} />}
      {showAddSuffixModal && <SuffixEditor suffix={null} onSave={addSuffix} onClose={() => setShowAddSuffixModal(false)} position={editorPosition} />}
    </div>
  );
};

// ==================== 别名编辑器 ====================
const AliasEditor = ({ alias, onSave, onClose, position: initialPosition = { x: 150, y: 200 } }) => {
  const [formData, setFormData] = useState({
    canonicalName: alias?.canonicalName || '',
    aliases: alias?.aliases || [],
    enabled: alias?.enabled ?? true
  });
  const [aliasInput, setAliasInput] = useState('');
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const headerRef = useRef(null);

  // 处理拖动开始
  const handleDragStart = (e) => {
    if (headerRef.current && headerRef.current.contains(e.target)) {
      setIsDragging(true);
      const rect = containerRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  // 处理拖动移动
  const handleDragMove = (e) => {
    if (!isDragging) return;
    const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 500));
    const newY = Math.max(80, Math.min(e.clientY - dragOffset.y, window.innerHeight - 400));
    setPosition({ x: newX, y: newY });
  };

  // 处理拖动结束
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
  }, [isDragging, dragOffset]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(alias ? { ...alias, ...formData } : { ...formData, id: `alias_${Date.now()}` });
  };
  const addAliasItem = () => { if (aliasInput.trim()) { setFormData(prev => ({ ...prev, aliases: [...prev.aliases, aliasInput.trim()] })); setAliasInput(''); } };
  const removeAliasItem = (i) => { setFormData(prev => ({ ...prev, aliases: prev.aliases.filter((_, idx) => idx !== i) })); };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleDragStart}
      className="fixed bg-white rounded-lg shadow-2xl border z-[150] w-[500px] cursor-move"
      style={{ left: `${position.x}px`, top: `${position.y}px`, cursor: isDragging ? 'grabbing' : 'default' }}
    >
      {/* 头部 - 拖动区域 */}
      <div
        ref={headerRef}
        className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0 cursor-grab active:cursor-grabbing rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{alias ? '✏️' : '➕'}</span>
          <h3 className="text-base font-semibold text-gray-900">{alias ? '编辑别名' : '添加别名'}</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">标准因子名称</label>
          <input
            type="text"
            value={formData.canonicalName}
            onChange={(e) => setFormData(prev => ({ ...prev, canonicalName: e.target.value }))}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="例如：毛利润"
            required
          />
          <p className="text-xs text-gray-500 mt-1">💡 模型中因子的标准名称</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">别名列表</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAliasItem())}
              placeholder="输入后按回车添加"
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
            <button type="button" onClick={addAliasItem} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">添加</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {formData.aliases.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                {a}
                <button type="button" onClick={() => removeAliasItem(i)} className="hover:text-purple-900">×</button>
              </span>
            ))}
          </div>
          {formData.aliases.length === 0 && <p className="text-xs text-gray-400 mt-1">暂无别名</p>}
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="aliasEnabled" checked={formData.enabled} onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" />
          <label htmlFor="aliasEnabled" className="text-sm text-gray-700">启用此别名配置</label>
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200">取消</button>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">保存</button>
        </div>
      </form>
    </div>
  );
};

// ==================== 后缀编辑器 ====================
const SuffixEditor = ({ suffix, onSave, onClose, position: initialPosition = { x: 150, y: 200 } }) => {
  const [formData, setFormData] = useState({
    suffix: suffix?.suffix || '',
    description: suffix?.description || '',
    enabled: suffix?.enabled ?? true
  });
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const headerRef = useRef(null);

  // 处理拖动开始
  const handleDragStart = (e) => {
    if (headerRef.current && headerRef.current.contains(e.target)) {
      setIsDragging(true);
      const rect = containerRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  // 处理拖动移动
  const handleDragMove = (e) => {
    if (!isDragging) return;
    const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 500));
    const newY = Math.max(80, Math.min(e.clientY - dragOffset.y, window.innerHeight - 400));
    setPosition({ x: newX, y: newY });
  };

  // 处理拖动结束
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
  }, [isDragging, dragOffset]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(suffix ? { ...suffix, ...formData } : { ...formData, id: `suffix_${Date.now()}` });
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleDragStart}
      className="fixed bg-white rounded-lg shadow-2xl border z-[150] w-[500px] cursor-move"
      style={{ left: `${position.x}px`, top: `${position.y}px`, cursor: isDragging ? 'grabbing' : 'default' }}
    >
      {/* 头部 - 拖动区域 */}
      <div
        ref={headerRef}
        className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0 cursor-grab active:cursor-grabbing rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{suffix ? '✏️' : '➕'}</span>
          <h3 className="text-base font-semibold text-gray-900">{suffix ? '编辑后缀' : '添加后缀'}</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">后缀词汇</label>
          <input
            type="text"
            value={formData.suffix}
            onChange={(e) => setFormData(prev => ({ ...prev, suffix: e.target.value }))}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="例如：费用"
            required
          />
          <p className="text-xs text-gray-500 mt-1">💡 用于从用户输入中提取候选词的后缀</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">说明描述</label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="例如：费用类指标"
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="suffixEnabled" checked={formData.enabled} onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" />
          <label htmlFor="suffixEnabled" className="text-sm text-gray-700">启用此后缀</label>
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200">取消</button>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">保存</button>
        </div>
      </form>
    </div>
  );
};

export default FactorAliasPanel;
