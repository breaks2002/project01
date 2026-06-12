import React, { useState, useEffect, useRef } from 'react';
import knowledgeService, { KnowledgeEntry } from '../../services/knowledgeService';
import KnowledgeUploader from './KnowledgeUploader';
import KnowledgeList from './KnowledgeList';

/**
 * 知识库面板组件
 * 提供知识库的完整管理功能：上传、检索、查看、编辑
 */
const KnowledgeBasePanel = ({ onClose }) => {
  const [entries, setEntries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState([]); // 支持多选
  const [showUploader, setShowUploader] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [position, setPosition] = useState({ x: 16, y: 80 }); // 面板位置
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);
  const headerRef = useRef(null);
  const initialLoadRef = useRef(true); // 标记是否是首次加载
  const hasSelectedRef = useRef(false); // 标记是否曾经有过选中

  // 选中状态持久化
  useEffect(() => {
    // 跳过首次加载（避免用初始空数组覆盖 localStorage）
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    // 只有当用户有操作时才保存
    if (hasSelectedRef.current || selectedEntries.length > 0) {
      hasSelectedRef.current = true;
      const selectedIds = selectedEntries.map(e => e.id);
      localStorage.setItem('vdt_knowledge_selected_ids', JSON.stringify(selectedIds));
      // 触发自定义事件，通知 AI 调参面板
      window.dispatchEvent(new Event('knowledge-selection-changed'));
    }
  }, [selectedEntries]);

  // 初始化加载知识库
  useEffect(() => {
    loadKnowledgeBase();
  }, []);

  // 处理拖动开始
  const handleDragStart = (e) => {
    if (headerRef.current && headerRef.current.contains(e.target)) {
      setIsDragging(true);
      const rect = panelRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  // 处理拖动移动
  const handleDragMove = (e) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // 限制在窗口范围内
      const maxX = window.innerWidth - 800;
      const maxY = window.innerHeight - 100;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(80, Math.min(newY, maxY))
      });
    }
  };

  // 处理拖动结束
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // 添加全局鼠标事件监听
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

  /**
   * 加载知识库
   */
  const loadKnowledgeBase = async () => {
    setIsLoading(true);
    try {
      await knowledgeService.initialize();
      const allEntries = knowledgeService.getAllEntries();
      setEntries(allEntries);

      // 恢复上次选中的条目
      const savedIdsJson = localStorage.getItem('vdt_knowledge_selected_ids');
      if (savedIdsJson) {
        const savedIds = JSON.parse(savedIdsJson);
        if (savedIds.length > 0) {
          const existingIds = new Set(allEntries.map(e => e.id));
          const validIds = savedIds.filter(id => existingIds.has(id));
          const savedSelected = allEntries.filter(e => validIds.includes(e.id));
          setSelectedEntries(savedSelected);
          hasSelectedRef.current = true;
        }
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 搜索知识库
   */
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      await knowledgeService.initialize();
      const results = await knowledgeService.search(searchQuery, 10, 0.1);
      setSearchResults(results);
    } catch (error) {
      console.error('搜索失败:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * 删除条目
   */
  const handleDelete = async (entryId) => {
    if (!confirm('确定要删除这条知识吗？')) return;

    try {
      const success = knowledgeService.deleteEntry(entryId);
      if (success) {
        setEntries(entries.filter(e => e.id !== entryId));
        // 从选中列表中移除
        setSelectedEntries(prev => prev.filter(e => e.id !== entryId));
      }
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  /**
   * 处理上传完成
   */
  const handleUploadComplete = async (newEntries) => {
    await loadKnowledgeBase();
    setShowUploader(false);
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setShowEditor(true);
  };

  const handleSaveEdit = async (updatedData) => {
    try {
      const updated = knowledgeService.updateEntry(editingEntry.id, updatedData);
      if (updated) {
        await loadKnowledgeBase();
        // 更新选中列表中的对应条目
        setSelectedEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
        setShowEditor(false);
        setEditingEntry(null);
        alert('保存成功！');
      }
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  };

  /**
   * 导出知识库
   */
  const handleExport = () => {
    // 如果有选中的条目，导出选中的；否则导出全部
    const entriesToExport = selectedEntries.length > 0 ? selectedEntries : entries;

    if (entriesToExport.length === 0) {
      alert('知识库为空，没有可导出的内容');
      return;
    }

    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      entries: entriesToExport.map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        industry: e.industry,
        scenario: e.scenario,
        tags: e.tags,
        factors: e.factors,
        createdAt: e.createdAt,
        usageCount: e.usageCount
      })),
      count: entriesToExport.length
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = selectedEntries.length > 0
      ? `knowledge_export_${new Date().toISOString().split('T')[0]}.json`
      : `knowledge_base_${new Date().toISOString().split('T')[0]}.json`;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    if (selectedEntries.length > 0) {
      alert(`已导出 ${selectedEntries.length} 条知识库条目`);
    } else {
      alert(`已导出全部 ${entries.length} 条知识库条目`);
    }
  };

  /**
   * 导入知识库（支持 JSON 导入和文档导入）
   */
  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const fileName = file.name;

    // JSON 文件：作为知识库备份导入
    if (ext === '.json') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          knowledgeService.import(data);
          await loadKnowledgeBase();
          alert(`✅ 知识库导入成功！\n共导入 ${data.entries?.length || 0} 条知识`);
        } catch (error) {
          alert('❌ 导入失败：' + error.message);
        }
      };
      reader.onerror = () => {
        alert('❌ 读取文件失败');
      };
      reader.readAsText(file);
    } else {
      // 其他格式：打开上传器上传文档
      const fileTypes = {
        '.txt': '文本文件',
        '.md': 'Markdown 文档',
        '.csv': 'CSV 数据文件',
        '.doc': 'Word 文档',
        '.docx': 'Word 文档',
        '.pdf': 'PDF 文档',
        '.xls': 'Excel 文件',
        '.xlsx': 'Excel 文件'
      };

      const confirmUpload = confirm(
        `📄 文件：${fileName}\n` +
        `📋 类型：${fileTypes[ext] || '未知类型'}\n\n` +
        `将上传到知识库，是否继续？`
      );

      if (confirmUpload) {
        setShowUploader(true);
        // 延迟触发，等待上传器渲染完成
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('knowledge-upload-file', { detail: file }));
        }, 200);
      }
    }

    // 清空 input 以允许重复选择同一文件
    event.target.value = '';
  };

  return (
    <div
      ref={panelRef}
      className="fixed w-[900px] bg-white rounded-xl shadow-2xl border z-[55] overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: 'calc(100vh - 100px)',
        cursor: isDragging ? 'grabbing' : 'default'
      }}
    >
      {/* 头部 - 拖动区域 */}
      <div
        ref={headerRef}
        className="px-6 py-3 border-b bg-gradient-to-r from-indigo-50 to-purple-50 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center text-white text-lg">
              📚
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">知识库</h2>
              <p className="text-xs text-gray-500">积累调参经验，智能复用历史案例</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 mr-2">💡 拖动标题栏移动窗口</span>
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              className="p-2 hover:bg-white rounded-lg transition-colors"
              title={viewMode === 'list' ? '切换到网格视图' : '切换到列表视图'}
            >
              {viewMode === 'list' ? '▦' : '☰'}
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-2 text-sm hover:bg-white rounded-lg transition-colors relative group"
              title=""
            >
              📤 导出
              <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                导出选中的条目或全部知识库（JSON 格式）
              </div>
            </button>
            <label className="px-3 py-2 text-sm hover:bg-white rounded-lg transition-colors cursor-pointer relative group">
              📥 导入
              <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                <div className="font-bold mb-1">支持两种格式：</div>
                <div>• JSON - 知识库备份文件</div>
                <div>• 文档 - TXT、MD、CSV、Word、Excel、PDF</div>
              </div>
              <input
                type="file"
                accept=".json,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.pdf"
                onChange={handleImport}
                className="hidden"
              />
            </label>
            <button
              onClick={() => setShowUploader(true)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all text-sm font-medium"
            >
              ➕ 上传文档
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white rounded-lg transition-colors text-gray-500"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-6 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索知识库，例如：Q4 旺季、利润增长、销售费用..."
              className="w-full px-4 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              🔍
            </span>
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSearching ? '搜索中...' : '搜索'}
          </button>
          {searchResults.length > 0 && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              清空
            </button>
          )}
        </div>
      </div>

      {/* 主体内容 */}
      <div className="flex" style={{ height: 'calc(100vh - 220px)' }}>
        {/* 左侧：知识列表/搜索结果 */}
        <div className="w-1/2 border-r overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              加载中...
            </div>
          ) : searchResults.length > 0 ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-600">
                  搜索结果：{searchResults.length} 条相关
                </div>
                <button
                  onClick={() => setSelectedEntries(selectedEntries.length === searchResults.length ? [] : [...searchResults])}
                  className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                >
                  {selectedEntries.length === searchResults.length ? '取消全选' : '全选'}
                </button>
              </div>
              {searchResults.map((result) => {
                const isSelected = selectedEntries.find(e => e.id === result.id);
                return (
                  <div
                    key={result.id}
                    onClick={() => {
                      setSelectedEntries(prev => {
                        const exists = prev.find(e => e.id === result.id);
                        return exists ? prev.filter(e => e.id !== result.id) : [...prev, result];
                      });
                    }}
                    className={`p-3 mb-2 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'hover:border-indigo-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <h3 className="font-medium text-gray-800 flex-1">{result.title}</h3>
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                        相似度 {(result.similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate ml-6">{result.description}</p>
                    <div className="flex items-center gap-2 mt-2 ml-6">
                      <span className="text-xs text-gray-500">{result.industry}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">{result.scenario}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
              <div className="text-6xl mb-4">📚</div>
              <p className="text-center mb-2">知识库还是空的</p>
              <p className="text-center text-sm text-gray-400 mb-4">上传第一个文档来积累经验吧！</p>
              <button
                onClick={() => setShowUploader(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                上传文档
              </button>
            </div>
          ) : (
            <KnowledgeList
              entries={entries}
              selectedEntries={selectedEntries}
              onSelectEntries={setSelectedEntries}
              onDelete={handleDelete}
              viewMode={viewMode}
            />
          )}
        </div>

        {/* 右侧：详情预览 */}
        <div className="w-1/2 overflow-y-auto bg-gray-50">
          {selectedEntries.length > 0 ? (
            <div className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">
                  已选 {selectedEntries.length} 条知识
                </h3>
                <button
                  onClick={() => setSelectedEntries([])}
                  className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  清空选择
                </button>
              </div>
              <div className="space-y-3">
                {selectedEntries.map((entry) => (
                  <div key={entry.id} className="bg-white rounded-lg shadow p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-800">{entry.title}</h4>
                      <button
                        onClick={() => setSelectedEntries(prev => prev.filter(e => e.id !== entry.id))}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        {entry.industry}
                      </span>
                      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                        {entry.scenario || '未分类'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {entry.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="text-6xl mb-4">👈</div>
              <p>从左侧选择一个知识库条目</p>
              <p className="text-sm mt-2">查看详细信息和历史案例</p>
            </div>
          )}
        </div>
      </div>

      {/* 上传弹窗 */}
      {showUploader && (
        <KnowledgeUploader
          onClose={() => setShowUploader(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {/* 编辑弹窗 */}
      {showEditor && editingEntry && (
        <KnowledgeEditor
          entry={editingEntry}
          onClose={() => {
            setShowEditor(false);
            setEditingEntry(null);
          }}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
};

/**
 * 知识库条目编辑器组件
 */
const KnowledgeEditor = ({ entry, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: entry.title || '',
    description: entry.description || '',
    industry: entry.industry || '通用',
    scenario: entry.scenario || '',
    tags: entry.tags?.join(', ') || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean)
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">编辑知识库条目</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">行业</label>
            <select
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="通用">通用</option>
              <option value="零售/电商">零售/电商</option>
              <option value="制造业">制造业</option>
              <option value="互联网/科技">互联网/科技</option>
              <option value="金融">金融</option>
              <option value="医疗">医疗</option>
              <option value="教育">教育</option>
              <option value="服务业">服务业</option>
              <option value="其他">其他</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">场景描述</label>
            <input
              type="text"
              value={formData.scenario}
              onChange={(e) => setFormData({ ...formData, scenario: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="例如：Q4 旺季促销、利润提升计划"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述/摘要</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标签（用逗号分隔）</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Q4, 旺季，利润增长"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              保存修改
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KnowledgeBasePanel;
