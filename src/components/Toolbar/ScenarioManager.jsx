import React, { useState } from 'react';
import ScenarioModal from './ScenarioModal';

const ScenarioManager = ({
  scenarios,
  currentScenarioId,
  onLoadScenario,
  onSaveScenario,
  onDeleteScenario,
  onRenameScenario,
  onDuplicateScenario,
  onCreateScenario
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveAsInput, setShowSaveAsInput] = useState(false);

  const currentScenario = scenarios[currentScenarioId];

  // 关闭下拉菜单时重置状态
  const closeDropdown = () => {
    setShowDropdown(false);
    setShowSaveAsInput(false);
    setSaveAsName('');
  };

  const handleSaveCurrent = () => {
    if (!saveAsName.trim()) {
      alert('请输入方案名称');
      return;
    }
    const result = onSaveScenario(saveAsName.trim(), '', false);
    if (result.success) {
      closeDropdown();
    } else {
      alert(result.error);
    }
  };

  const handleOverwrite = () => {
    if (window.confirm(`确定要覆盖当前方案「${currentScenario?.name}」吗？`)) {
      const result = onSaveScenario(currentScenario?.name, '', true);
      if (!result.success) {
        alert(result.error);
      } else {
        closeDropdown();
      }
    }
  };

  const handleCreateNew = () => {
    const result = onCreateScenario();
    if (!result.success) {
      alert(result.error);
    } else {
      closeDropdown();
    }
  };

  const handleScenarioClick = (scenarioId) => {
    if (scenarioId === currentScenarioId) return;
    const result = onLoadScenario(scenarioId);
    if (!result.success) {
      alert(result.error);
    } else {
      closeDropdown();
    }
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 flex items-center gap-2 font-medium shadow-sm"
        >
          <span>📋</span>
          <span className="max-w-32 truncate">{currentScenario?.name || '方案'}</span>
          <span className="text-xs opacity-75">{showDropdown ? '▲' : '▼'}</span>
        </button>

        {/* 下拉菜单 */}
        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={closeDropdown}
            />
            <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg py-2 min-w-56 z-50">
              {/* 方案列表 */}
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">
                方案列表
              </div>
              <div className="max-h-48 overflow-y-auto">
                {Object.values(scenarios)
                  .sort((a, b) => a.createdAt - b.createdAt)
                  .map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => handleScenarioClick(scenario.id)}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between group ${
                        scenario.id === currentScenarioId
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {scenario.id === currentScenarioId && <span>✓</span>}
                        <span>{scenario.name}</span>
                      </span>
                    </button>
                  ))}
              </div>

              <div className="border-t my-1" />

              {/* 另存为新方案 */}
              {showSaveAsInput ? (
                <div className="px-3 py-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={saveAsName}
                      onChange={(e) => setSaveAsName(e.target.value)}
                      placeholder="输入方案名称"
                      className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCurrent();
                        if (e.key === 'Escape') {
                          setShowSaveAsInput(false);
                          setSaveAsName('');
                        }
                      }}
                    />
                    <button
                      onClick={handleSaveCurrent}
                      className="px-3 py-1 bg-indigo-500 text-white rounded text-sm hover:bg-indigo-600"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setSaveAsName('');
                    setShowSaveAsInput(true);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-2"
                >
                  <span>💾</span>
                  另存为新方案
                </button>
              )}

              {/* 覆盖当前方案 */}
              <button
                onClick={handleOverwrite}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-orange-600 flex items-center gap-2"
              >
                <span>📝</span>
                覆盖当前方案
              </button>

              {/* 新建方案 */}
              <button
                onClick={handleCreateNew}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-green-600 flex items-center gap-2"
              >
                <span>➕</span>
                新建方案
              </button>

              <div className="border-t my-1" />

              {/* 管理方案 */}
              <button
                onClick={() => {
                  setShowModal(true);
                  closeDropdown();
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-gray-600 flex items-center gap-2"
              >
                <span>⚙️</span>
                管理方案
              </button>
            </div>
          </>
        )}
      </div>

      {/* 方案管理弹窗 */}
      {showModal && (
        <ScenarioModal
          scenarios={scenarios}
          currentScenarioId={currentScenarioId}
          onClose={() => setShowModal(false)}
          onLoadScenario={onLoadScenario}
          onDeleteScenario={onDeleteScenario}
          onRenameScenario={onRenameScenario}
          onDuplicateScenario={onDuplicateScenario}
        />
      )}
    </>
  );
};

export default ScenarioManager;
