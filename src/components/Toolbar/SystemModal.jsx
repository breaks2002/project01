import React, { useState } from 'react';

const SystemModal = ({
  systems,
  currentSystemId,
  onClose,
  onCreateSystem,
  onSwitchSystem,
  onDeleteSystem,
  onRenameSystem,
  onExportSystem,
  onImportSystem,
  maxSystems = Infinity,
  licenseType = 'dev',
}) => {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [creatingName, setCreatingName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleStartEdit = (system) => {
    setEditingId(system.id);
    setEditName(system.name);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) {
      alert('体系名称不能为空');
      return;
    }
    const result = onRenameSystem(editingId, editName.trim());
    if (result.success) {
      setEditingId(null);
      setEditName('');
    } else {
      alert(result.error);
    }
  };

  const handleDelete = (system) => {
    if (window.confirm(`确定要删除指标体系「${system.name}」吗？${system.id === currentSystemId ? '\n（删除后将自动切换到其他体系）' : ''}`)) {
      const result = onDeleteSystem(system.id);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  const handleExport = (systemId) => {
    const data = onExportSystem(systemId);
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const system = systems[systemId];
      a.download = `AIDM-体系-${system?.name || systemId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const jsonData = JSON.parse(event.target.result);
            if (!jsonData.nodes) {
              alert('导入失败：无效的指标体系文件');
              return;
            }
            onImportSystem(jsonData);
          } catch (err) {
            alert('导入失败：无效的 JSON 文件');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleCreate = () => {
    if (!creatingName.trim()) {
      alert('请输入体系名称');
      return;
    }
    const result = onCreateSystem(creatingName.trim());
    if (result.success) {
      setShowCreateInput(false);
      setCreatingName('');
    } else {
      alert(result.error);
    }
  };

  const sortedSystems = Object.values(systems).sort((a, b) => b.createdAt - a.createdAt);
  const systemCount = sortedSystems.length;
  const limitReached = systemCount >= maxSystems;
  const isUnlimited = maxSystems === Infinity;

  const getLicenseLabel = () => {
    switch (licenseType) {
      case 'trial': return '试用版';
      case 'standard': return '标准版';
      case 'pro': return '专业版';
      case 'dev': return '开发模式';
      default: return licenseType;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span></span>
            指标体系管理
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-600 font-medium transition-colors">
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-6">
          {/* 创建新体系 */}
          <div className="mb-6">
            {showCreateInput ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={creatingName}
                  onChange={(e) => setCreatingName(e.target.value)}
                  placeholder="输入体系名称（将从当前状态克隆）"
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setShowCreateInput(false); setCreatingName(''); }
                  }}
                />
                <button onClick={handleCreate} className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-sm font-medium">
                  创建
                </button>
                <button onClick={() => { setShowCreateInput(false); setCreatingName(''); }} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm">
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (limitReached) {
                    alert(`当前版本最多支持 ${maxSystems} 个指标体系（已保存 ${systemCount} 个），请升级后继续创建`);
                    return;
                  }
                  setShowCreateInput(true);
                }}
                disabled={limitReached}
                className={`w-full px-4 py-3 border-2 border-dashed rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  limitReached
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50'
                }`}
              >
                <span>➕</span>
                新建指标体系（从当前状态克隆）
              </button>
            )}
          </div>

          {/* 导入按钮 */}
          <div className="mb-4">
            <button
              onClick={() => {
                if (limitReached) {
                  alert(`当前版本最多支持 ${maxSystems} 个指标体系（已保存 ${systemCount} 个），请先删除部分体系后再导入`);
                  return;
                }
                handleImport();
              }}
              disabled={limitReached}
              className={`w-full px-4 py-2 border rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                limitReached
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>📥</span>
              从 JSON 文件导入
            </button>
          </div>

          {/* 分隔线 */}
          <div className="border-t my-4" />

          {/* 体系列表 */}
          <div className="text-xs font-semibold text-gray-500 uppercase mb-3">
            已保存的体系 ({sortedSystems.length})
          </div>

          {sortedSystems.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              暂无保存的指标体系
            </div>
          ) : (
            <div className="space-y-2">
              {sortedSystems.map((system) => {
                const isCurrent = system.id === currentSystemId;
                const isEditing = editingId === system.id;

                return (
                  <div
                    key={system.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      isCurrent
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {/* 左侧：名称和信息 */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isCurrent && (
                          <span className="text-indigo-500 font-bold text-sm">✓</span>
                        )}
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') { setEditingId(null); }
                              }}
                            />
                            <button onClick={handleSaveEdit} className="px-3 py-1 bg-indigo-500 text-white rounded text-xs hover:bg-indigo-600">
                              保存
                            </button>
                            <button onClick={() => { setEditingId(null); }} className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300">
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isCurrent ? 'text-indigo-700' : 'text-gray-800'}`}>
                                {system.name}
                              </span>
                              {isCurrent && (
                                <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded font-medium">
                                  当前
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {formatDate(system.updatedAt)} · {Object.keys(system.scenarios || {}).length} 个方案
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 右侧：操作按钮 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isCurrent && (
                          <button
                            onClick={() => onSwitchSystem(system.id)}
                            className="px-3 py-1.5 bg-indigo-500 text-white rounded text-xs hover:bg-indigo-600 font-medium"
                            title="切换到此体系"
                          >
                            切换
                          </button>
                        )}
                        <button
                          onClick={() => handleStartEdit(system)}
                          className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-500"
                          title="重命名"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleExport(system.id)}
                          className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700 transition-colors"
                          title="导出为 JSON"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(system)}
                          className="w-7 h-7 flex items-center justify-center bg-red-50 hover:bg-red-100 rounded text-red-400 hover:text-red-600 transition-colors"
                          title="删除"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-6 py-3 border-t bg-gray-50 text-xs text-gray-400 flex-shrink-0 flex items-center justify-between">
          <span>💡 指标体系包含完整的节点定义、公式和方案数据。新建体系会从当前状态克隆。</span>
          {!isUnlimited && (
            <span className="shrink-0 ml-4 font-medium">
              {getLicenseLabel()}：最多 {maxSystems} 个（已保存 {systemCount} 个）
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemModal;
