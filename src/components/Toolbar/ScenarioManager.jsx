import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ScenarioModal from './ScenarioModal';

const ScenarioManager = ({
  scenarios,
  currentScenarioId,
  onLoadScenario,
  onSaveScenario,
  onDeleteScenario,
  onRenameScenario,
  onDuplicateScenario,
  onCreateScenario,
  // 试用版限制
  isTrial,
  maxScenarios = 2,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveAsInput, setShowSaveAsInput] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  const currentScenario = scenarios[currentScenarioId];

  // 计算下拉菜单位置
  useEffect(() => {
    if (showDropdown && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left
      });
    }
  }, [showDropdown]);

  // 实时检查方案名是否重名（忽略空格差异）
  const isDuplicateName = saveAsName.trim() !== '' &&
    Object.values(scenarios).some(s => s.name.replace(/\s+/g, '') === saveAsName.trim().replace(/\s+/g, ''));

  // 关闭下拉菜单时重置状态
  const closeDropdown = () => {
    setShowDropdown(false);
    setShowSaveAsInput(false);
    setSaveAsName('');
  };

  // 监听滚动和resize事件更新菜单位置
  useEffect(() => {
    if (!showDropdown) return;
    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 4,
          left: rect.left
        });
      }
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showDropdown]);

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
    // 试用版方案数量限制
    if (isTrial && Object.keys(scenarios).length >= maxScenarios) {
      alert(`试用版最多支持 ${maxScenarios} 个方案（当前 ${Object.keys(scenarios).length} 个），请升级专业版`);
      return;
    }
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
          ref={buttonRef}
          onClick={() => setShowDropdown(!showDropdown)}
          className="h-9 px-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 flex items-center gap-1.5 text-sm font-medium shadow-sm"
        >
          <span>📋</span>
          <span className="max-w-32 truncate">{currentScenario?.name || '方案'}</span>
          <span className="text-xs opacity-75">{showDropdown ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* 下拉菜单 - 用 Portal 渲染到 body 避免被裁剪 */}
      {showDropdown && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={closeDropdown}
          />
          <div
            className="fixed bg-white border rounded-lg shadow-lg py-2 min-w-56 z-[9999]"
            style={{ top: `${dropdownPosition.top}px`, left: `${dropdownPosition.left}px` }}
          >
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
                      className={`flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 ${isDuplicateName ? 'border-red-400 focus:ring-red-500' : 'focus:ring-indigo-500'}`}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isDuplicateName) handleSaveCurrent();
                        if (e.key === 'Escape') {
                          setShowSaveAsInput(false);
                          setSaveAsName('');
                        }
                      }}
                    />
                    <button
                      onClick={handleSaveCurrent}
                      disabled={isDuplicateName}
                      className={`px-3 py-1 rounded text-sm ${isDuplicateName ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}
                    >
                      保存
                    </button>
                  </div>
                  {isDuplicateName && (
                    <div className="text-xs text-red-500 mt-1">方案名称已存在</div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => {
                    // 试用版方案数量限制
                    if (isTrial && Object.keys(scenarios).length >= maxScenarios) {
                      alert(`试用版最多支持 ${maxScenarios} 个方案（当前 ${Object.keys(scenarios).length} 个），请升级专业版`);
                      return;
                    }
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
        </>,
        document.body
      )}

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
