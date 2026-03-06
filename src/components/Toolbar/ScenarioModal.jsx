import React, { useState } from 'react';

const ScenarioModal = ({
  scenarios,
  currentScenarioId,
  onClose,
  onLoadScenario,
  onDeleteScenario,
  onRenameScenario,
  onDuplicateScenario
}) => {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [duplicateId, setDuplicateId] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleStartEdit = (scenario) => {
    setEditingId(scenario.id);
    setEditName(scenario.name);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) {
      alert('方案名称不能为空');
      return;
    }
    const result = onRenameScenario(editingId, editName.trim());
    if (result.success) {
      setEditingId(null);
      setEditName('');
    } else {
      alert(result.error);
    }
  };

  const handleDelete = (scenario) => {
    if (window.confirm(`确定要删除方案「${scenario.name}」吗？`)) {
      const result = onDeleteScenario(scenario.id);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  const handleStartDuplicate = (scenario) => {
    setDuplicateId(scenario.id);
    setDuplicateName(`${scenario.name} (副本)`);
  };

  const handleConfirmDuplicate = () => {
    if (!duplicateName.trim()) {
      alert('方案名称不能为空');
      return;
    }
    const result = onDuplicateScenario(duplicateId, duplicateName.trim());
    if (result.success) {
      setDuplicateId(null);
      setDuplicateName('');
    } else {
      alert(result.error);
    }
  };

  const handleLoad = (scenarioId) => {
    if (scenarioId === currentScenarioId) return;
    const result = onLoadScenario(scenarioId);
    if (!result.success) {
      alert(result.error);
    }
  };

  const sortedScenarios = Object.values(scenarios).sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">
            <span className="mr-2">📋</span>
            方案管理
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-3">
            {sortedScenarios.map((scenario) => (
              <div
                key={scenario.id}
                className={`p-4 rounded-lg border ${
                  scenario.id === currentScenarioId
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {editingId === scenario.id ? (
                  // 编辑模式
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') {
                            setEditingId(null);
                            setEditName('');
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditName('');
                        }}
                        className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="px-3 py-1 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : duplicateId === scenario.id ? (
                  // 复制模式
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>复制自：</span>
                      <span className="font-medium text-gray-800">{scenario.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={duplicateName}
                        onChange={(e) => setDuplicateName(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="新方案名称"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmDuplicate();
                          if (e.key === 'Escape') {
                            setDuplicateId(null);
                            setDuplicateName('');
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setDuplicateId(null);
                          setDuplicateName('');
                        }}
                        className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleConfirmDuplicate}
                        className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        复制
                      </button>
                    </div>
                  </div>
                ) : (
                  // 显示模式
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-800">{scenario.name}</h3>
                        {scenario.id === currentScenarioId && (
                          <span className="px-2 py-0.5 bg-indigo-500 text-white text-xs rounded">
                            当前
                          </span>
                        )}
                      </div>
                      {scenario.description && (
                        <p className="text-sm text-gray-500 mt-1">{scenario.description}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-gray-400">
                        <span>创建：{formatDate(scenario.createdAt)}</span>
                        <span>更新：{formatDate(scenario.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      {scenario.id !== currentScenarioId && (
                        <button
                          onClick={() => handleLoad(scenario.id)}
                          className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                        >
                          切换
                        </button>
                      )}
                      <button
                        onClick={() => handleStartEdit(scenario)}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => handleStartDuplicate(scenario)}
                        className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                      >
                        复制
                      </button>
                      {scenario.id !== currentScenarioId && (
                        <button
                          onClick={() => handleDelete(scenario)}
                          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScenarioModal;
