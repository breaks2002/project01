import React, { useState, useEffect, useRef } from 'react';
import promptTemplateService from '../../services/promptTemplateService';

/**
 * 场景选择面板 - 悬浮窗口（非模态，可拖动）
 * 支持多选场景模板
 */
const ScenarioSelector = ({ onClose, onSelectScenarios }) => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplates, setSelectedTemplates] = useState([]); // 支持多选
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [position, setPosition] = useState({ x: window.innerWidth - 916, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef(null);
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
    const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 900));
    const newY = Math.max(80, Math.min(e.clientY - dragOffset.y, window.innerHeight - 100));
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
  }, [isDragging, dragOffset]);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    await promptTemplateService.initialize();
    const allTemplates = promptTemplateService.getAllTemplates();
    setTemplates(allTemplates);

    // 恢复上次选中的模板
    const lastSelected = promptTemplateService.getSelectedTemplates();
    if (lastSelected && lastSelected.length > 0) {
      setSelectedTemplates(lastSelected);
      // 通知父组件（确保刷新页面后状态同步）
      if (onSelectScenarios) {
        onSelectScenarios(lastSelected);
      }
    }

    setIsLoading(false);
  };

  const handleToggleTemplate = (template) => {
    setSelectedTemplates(prev => {
      const exists = prev.find(t => t.id === template.id);
      let newSelected;
      if (exists) {
        // 取消选择
        newSelected = prev.filter(t => t.id !== template.id);
      } else {
        // 添加选择
        newSelected = [...prev, template];
      }

      // 通知父组件
      if (onSelectScenarios) {
        onSelectScenarios(newSelected);
      }

      // 保存到 localStorage
      promptTemplateService.setSelectedTemplates(newSelected.map(t => t.id));

      // 触发自定义事件，通知 AI 调参面板
      window.dispatchEvent(new Event('scenario-selection-changed'));

      return newSelected;
    });
  };

  const handleSelectAll = () => {
    if (selectedTemplates.length === templates.length) {
      // 取消全选
      setSelectedTemplates([]);
      if (onSelectScenarios) {
        onSelectScenarios([]);
      }
      promptTemplateService.setSelectedTemplates([]);
    } else {
      // 全选
      setSelectedTemplates(templates);
      if (onSelectScenarios) {
        onSelectScenarios(templates);
      }
      promptTemplateService.setSelectedTemplates(templates.map(t => t.id));
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      await promptTemplateService.importFromFile(file);
      await loadTemplates();
      alert('模板导入成功！');
    } catch (error) {
      alert(`导入失败：${error.message}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    promptTemplateService.exportToFile();
  };

  const handleDelete = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    if (template.isBuiltIn) {
      alert('内置模板不允许删除');
      return;
    }

    if (confirm(`确定要删除模板"${template.name}"吗？`)) {
      promptTemplateService.deleteTemplate(templateId);
      // 如果删除的是已选中的，从选中列表移除
      setSelectedTemplates(prev => {
        const newSelected = prev.filter(t => t.id !== templateId);
        promptTemplateService.setSelectedTemplates(newSelected.map(t => t.id));
        return newSelected;
      });
      loadTemplates();
    }
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleSaveEdit = async (templateData) => {
    await promptTemplateService.initialize();
    if (templateData.id) {
      const result = promptTemplateService.updateTemplate(templateData.id, templateData);
      if (result) console.log('[Scenario] 更新成功:', result.id);
    } else {
      const result = promptTemplateService.addTemplate(templateData);
      console.log('[Scenario] 新建成功:', result.id);
    }
    await loadTemplates();
    setShowEditor(false);
    setEditingTemplate(null);
    alert('保存成功！');
  };

  if (isLoading) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleDragStart}
      className="fixed bg-white rounded-xl shadow-2xl border z-[100] w-[900px] flex flex-col"
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
        className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800">📋 场景选择</h2>
            <p className="text-xs text-gray-500">💡 支持多选，拖动标题栏移动窗口</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
      </div>

      {/* 工具栏 */}
      <div className="px-6 py-3 border-b flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditingTemplate(null);
              setShowEditor(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
          >
            + 新建场景
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
          >
            📥 导入场景
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
          >
            📤 导出全部
          </button>
          <button
            onClick={handleSelectAll}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
          >
            {selectedTemplates.length === templates.length ? '❌ 取消全选' : '✅ 全选'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            已选 <span className="font-bold text-indigo-600">{selectedTemplates.length}</span> 个场景
          </span>
          {selectedTemplates.length > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
              <span className="text-xs text-gray-600">当前选中：</span>
              <span className="text-sm font-medium text-indigo-700">
                {selectedTemplates.map(t => t.name).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 场景模板列表 */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="grid grid-cols-2 gap-4">
          {templates.map(template => {
            const isSelected = selectedTemplates.find(t => t.id === template.id);
            return (
              <div
                key={template.id}
                onClick={() => handleToggleTemplate(template)}
                className={`border rounded-lg p-4 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                    : 'hover:border-indigo-300'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                    />
                    <h3 className="font-medium text-gray-800">{template.name}</h3>
                  </div>
                  {template.isBuiltIn && (
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">内置</span>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-1 mb-3">{template.description}</p>

                <div className="flex items-center gap-1 flex-wrap mb-3">
                  {template.keywords?.slice(0, 5).map((word, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded">
                      {word}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(template);
                    }}
                    className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
                  >
                    ✏️ 编辑
                  </button>
                  {!template.isBuiltIn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(template.id);
                      }}
                      className="px-3 py-1.5 bg-red-50 text-red-600 text-sm rounded hover:bg-red-100"
                    >
                      🗑️ 删除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 编辑器覆盖层 */}
      {showEditor && (
        <div className="absolute inset-0 bg-white bg-opacity-95 rounded-xl flex items-center justify-center p-8">
          <TemplateEditor
            template={editingTemplate}
            onSave={handleSaveEdit}
            onCancel={() => {
              setShowEditor(false);
              setEditingTemplate(null);
            }}
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.json"
        onChange={handleImportFile}
        className="hidden"
      />
    </div>
  );
};

/**
 * 模板编辑器组件
 */
const TemplateEditor = ({ template, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    id: template?.id || '',
    name: template?.name || '',
    description: template?.description || '',
    industry: template?.industry || '通用',
    scenario: template?.scenario || '',
    keywords: template?.keywords?.join(', ') || '',
    systemPrompt: template?.systemPrompt || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      keywords: formData.keywords.split(',').map(k => k.trim()).filter(k => k)
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-2xl border w-full max-w-4xl max-h-full overflow-y-auto">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h3 className="text-lg font-bold text-gray-800">
          {template ? '✏️ 编辑场景模板' : '➕ 新建场景模板'}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              场景名称 *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="如：财务场景、HR 场景"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              适用行业
            </label>
            <select
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="通用">通用</option>
              <option value="制造业">制造业</option>
              <option value="零售业">零售业</option>
              <option value="电商">电商</option>
              <option value="科技">科技</option>
              <option value="金融">金融</option>
              <option value="医疗">医疗</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            场景描述
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            placeholder="如：适用于成本优化、利润提升、收入增长等财务相关场景"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            匹配关键词（用逗号分隔）
          </label>
          <input
            type="text"
            value={formData.keywords}
            onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            placeholder="如：成本，利润，收入，费用，毛利，净利，财务"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            System Prompt（AI 角色指令）*
          </label>
          <textarea
            value={formData.systemPrompt}
            onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
            rows={15}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-sm"
            placeholder="你是一位资深的财务分析和规划专家..."
            required
          />
        </div>

        <div className="flex items-center gap-3 pt-4 border-t">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            💾 保存场景
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
};

export default ScenarioSelector;
