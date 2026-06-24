import React from 'react';
import ScenarioManager from './ScenarioManager';
import useVDTStore from '../../store/useVDTStore';

const BTN_BASE = 'flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg whitespace-nowrap';
const BTN_HEIGHT = 'h-9';

const Toolbar = ({
  onOpenEditor,
  onExportJSON,
  onExportCSV,
  onExportImage,
  onExportDataTemplate,
  onExportFormulaTemplate,
  onLoadSample,
  onOpenCSVImport,
  onOpenPBIConnect,
  onRefreshPBI,
  pbiConfig,
  scenarios,
  currentScenarioId,
  onLoadScenario,
  onSaveScenario,
  onDeleteScenario,
  onRenameScenario,
  onDuplicateScenario,
  onCreateScenario,
  onOpenScenarioCompare,
  showScenarioCompare,
  isScenarioCompareMinimized,
  onOpenSensitivityAnalysis,
  showSensitivityAnalysis,
  isSensitivityAnalysisMinimized,
  onToggleNodeTreeList,
  showNodeTreeList,
  isNodeTreeListMinimized,
  onRestoreNodeTreeList,
  onOpenStdDevAnalysis,
  showStdDevAnalysis,
  isStdDevAnalysisMinimized,
  onOpenAIConfig,
  showAIConfig,
  onOpenAITuning,
  showAITuning,
  onOpenKnowledgeBase,
  showKnowledgeBase,
  onOpenScenarioSelector,
  onOpenRulePanel,
  showRulePanel,
  onOpenAliasPanel,
  showAliasPanel,
  licenseInfo,
  hasPermission,
  getDisableReason,
  isTrial,
  isDev,
  daysLeft,
  nodeCount,
  maxLevel,
  // 指标体系管理
  systems,
  currentSystemId,
  onOpenSystemManager,
  // 布局方向
  layoutDirection,
  onToggleLayoutDirection,
  // 帮助
  onOpenHelp,
}) => {
  const nodes = useVDTStore((s) => s.nodes);
  const hasModel = Object.keys(nodes).length > 0;

  const aiDisabled = hasPermission && !hasPermission('ai_decision');
  const exportDisabled = hasPermission && !hasPermission('export');
  const pbiDisabled = hasPermission && !hasPermission('powerbi');

  return (
    <div className="h-11 bg-white border-b px-3 flex items-center justify-between shadow-sm" style={{ flexShrink: 0 }}>
      {/* 左侧区域 */}
      <div className="flex items-center gap-2">
        {/* AIDM Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'system-ui,Segoe UI,Roboto,sans-serif', flexShrink: 0 }}>
          <div style={{ width: '28px', height: '28px', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, border: '2px solid #0066FF', borderRadius: '50%' }}></div>
            <div className="aidm-logo-spin" style={{ position: 'absolute', inset: '3px', border: '2px solid #0066FF', borderRadius: '50%', borderRightColor: 'transparent', borderBottomColor: 'transparent' }}></div>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '12px', height: '12px', transform: 'translate(-50%,-50%)' }}>
              <svg viewBox="0 0 24 24" fill="#0066FF">
                <path d="M12 2C9.04 2 6.6 3.65 5.36 6.23C3.86 6.79 2.9 8.24 2.9 9.5C2.9 11.26 4.24 12.6 5.99 12.6C6.16 12.6 6.33 12.58 6.5 12.55V13.5C6.5 15.26 7.74 16.5 9.5 16.5H10.5V17.5C10.5 19.26 11.74 20.5 13.5 20.5C15.26 20.5 16.5 19.26 16.5 17.5V16.14C18.03 15.13 19 13.45 19 11.5C19 7.91 15.86 5 12 5M13 3.05V5.08C15.5 5.5 17.5 7.6 17.5 11.5C17.5 13.43 16.5 15.13 15 16.14V17.5C15 18.33 14.33 19 13.5 19C12.67 19 12 18.33 12 17.5V16.5C12 15.67 12.67 15 13.5 15H14.5V14H13.5C11.67 14 10.5 15.67 10.5 17.5V16.5C9.67 16.5 8.5 15.33 8.5 13.5V12.5H9.5C10.33 12.5 11.5 10.83 11.5 9H10.5C9.67 9 8.5 10.67 8.5 12.5H7.5V11.5C7.5 9.67 6.33 8.5 4.5 8.5C3.67 8.5 2.9 9.17 2.9 10C2.9 10.83 3.67 11.5 4.5 11.5C5.33 11.5 6.5 9.83 6.5 8H7.5C8.33 8 9.5 9.67 9.5 11.5H10.5V10.5C10.5 8.67 11.67 7.5 13.5 7.5C15.33 7.5 16.5 5.83 16.5 4V3.05C14.88 2.33 13.44 2 12 2Z" />
              </svg>
            </div>
          </div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#121212', letterSpacing: '1px' }}>AIDM</div>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300" style={{ flexShrink: 0 }}></div>

        {/* 场景选择器 */}
        <div className="shrink-0">
          <ScenarioManager
            scenarios={scenarios}
            currentScenarioId={currentScenarioId}
            onLoadScenario={onLoadScenario}
            onSaveScenario={onSaveScenario}
            onDeleteScenario={onDeleteScenario}
            onRenameScenario={onRenameScenario}
            onDuplicateScenario={onDuplicateScenario}
            onCreateScenario={onCreateScenario}
            isTrial={isTrial}
            maxScenarios={2}
          />
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-gray-300" style={{ flexShrink: 0 }}></div>

        {/* 功能按钮 - 统一高度 h-9, 统一内边距 */}
        <button
          onClick={onToggleNodeTreeList}
          className={`${BTN_BASE} ${BTN_HEIGHT} px-3 ${
            showNodeTreeList && !isNodeTreeListMinimized
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
              : 'bg-gradient-to-r from-indigo-400 to-purple-400 text-white hover:from-indigo-500 hover:to-purple-500'
          }`}
        >
          <span>📋</span>
          <span>节点列表</span>
        </button>

        <button
          onClick={onOpenScenarioCompare}
          className={`${BTN_BASE} ${BTN_HEIGHT} px-3 ${
            showScenarioCompare && !isScenarioCompareMinimized
              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700'
              : 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-600 hover:to-cyan-600'
          }`}
        >
          <span>📊</span>
          <span>方案比选</span>
        </button>

        {/* 分析模块下拉菜单 */}
        <div className="relative group shrink-0">
          <button
            className={`${BTN_BASE} ${BTN_HEIGHT} px-3 ${
              showSensitivityAnalysis && !isSensitivityAnalysisMinimized || showStdDevAnalysis && !isStdDevAnalysisMinimized
                ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-700 hover:to-red-700'
                : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600'
            }`}
          >
            <span>🔍</span>
            <span>分析模块</span>
            <span className="text-xs">▼</span>
          </button>
          <div className="absolute top-full left-0 pt-1 bg-transparent min-w-52 z-50">
            <div className="bg-white border rounded-lg shadow-lg py-2 hidden group-hover:block">
              <button
                onClick={onOpenSensitivityAnalysis}
                className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <span>📈</span>
                <span>
                  <div className="font-medium">敏感性分析</div>
                  <div className="text-xs text-gray-500">驱动因子对目标的影响</div>
                </span>
              </button>
              <button
                onClick={onOpenStdDevAnalysis}
                className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <span>📐</span>
                <span>
                  <div className="font-medium">标准差分析</div>
                  <div className="text-xs text-gray-500">数据波动与离散程度</div>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* AI 决策 */}
      <div className="relative group shrink-0">
          <button
            className={`${BTN_BASE} ${BTN_HEIGHT} px-3 ${
              aiDisabled
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : showAIConfig || showAITuning
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                  : 'bg-gradient-to-r from-indigo-400 to-purple-400 text-white hover:from-indigo-500 hover:to-purple-500'
            }`}
            onClick={() => {
              if (aiDisabled) {
                if (getDisableReason) alert(getDisableReason('ai_decision'));
                return;
              }
            }}
            title={aiDisabled && getDisableReason ? getDisableReason('ai_decision') : ''}
          >
            <span></span>
            <span>AI 决策</span>
            <span className="text-xs">▼</span>
          </button>
          <div className="absolute top-full left-0 pt-1 bg-transparent min-w-48 z-50">
            <div className="bg-white border rounded-lg shadow-lg py-2 hidden group-hover:block">
            <div
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                aiDisabled ? 'opacity-50 cursor-not-allowed text-gray-400' : 'cursor-pointer hover:bg-gray-50'
              }`}
              onClick={() => { if (!aiDisabled) onOpenAIConfig(); }}
            >
              <span>⚙️</span>
              <span>
                <div className="font-medium">AI 配置</div>
                <div className="text-xs text-gray-500">配置 API、模型参数</div>
              </span>
            </div>
            <div
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 cursor-pointer ${
                (aiDisabled || !hasModel) ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50 text-gray-700'
              }`}
              onClick={() => {
                if (aiDisabled) { if (getDisableReason) alert(getDisableReason('ai_decision')); return; }
                if (!hasModel) return;
                onOpenAITuning();
              }}
              title={aiDisabled && getDisableReason ? getDisableReason('ai_decision') : (!hasModel ? '请先导入或创建指标模型' : '')}
            >
              <span>🎯</span>
              <span>
                <div className="font-medium">AI 调参</div>
                <div className="text-xs text-gray-500">智能调整驱动因子</div>
              </span>
            </div>
            <div className="border-t my-1" />
            <button
              onClick={() => {
                if (aiDisabled) { if (getDisableReason) alert(getDisableReason('ai_decision')); return; }
                onOpenKnowledgeBase();
              }}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                aiDisabled ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50'
              }`}
              title={aiDisabled && getDisableReason ? getDisableReason('ai_decision') : ''}
            >
              <span>📚</span>
              <span>
                <div className="font-medium">知识库</div>
                <div className="text-xs text-gray-500">管理历史案例</div>
              </span>
            </button>
            <button
              onClick={() => {
                if (aiDisabled) { if (getDisableReason) alert(getDisableReason('ai_decision')); return; }
                onOpenScenarioSelector();
              }}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                aiDisabled ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50'
              }`}
              title={aiDisabled && getDisableReason ? getDisableReason('ai_decision') : ''}
            >
              <span>🎬</span>
              <span>
                <div className="font-medium">场景选择</div>
                <div className="text-xs text-gray-500">管理 AI 场景模板</div>
              </span>
            </button>
            <button
              onClick={() => {
                if (aiDisabled) { if (getDisableReason) alert(getDisableReason('ai_decision')); return; }
                onOpenRulePanel();
              }}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                aiDisabled ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50'
              }`}
              title={aiDisabled && getDisableReason ? getDisableReason('ai_decision') : ''}
            >
              <span>📜</span>
              <span>
                <div className="font-medium">规则管理</div>
                <div className="text-xs text-gray-500">配置约束映射规则</div>
              </span>
            </button>
            <button
              onClick={() => {
                if (aiDisabled) { if (getDisableReason) alert(getDisableReason('ai_decision')); return; }
                onOpenAliasPanel();
              }}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                aiDisabled ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50'
              }`}
              title={aiDisabled && getDisableReason ? getDisableReason('ai_decision') : ''}
            >
              <span>🏷️</span>
              <span>
                <div className="font-medium">别名管理</div>
                <div className="text-xs text-gray-500">配置因子别名映射</div>
              </span>
            </button>
            </div>
          </div>
        </div>

        {/* 新建节点 */}
        <button
          onClick={() => onOpenEditor(null)}
          className={`${BTN_BASE} ${BTN_HEIGHT} px-3 bg-blue-600 text-white hover:bg-blue-700`}
        >
          <span>+</span>
          <span>新建节点</span>
        </button>
      </div>

      {/* 右侧：导入导出等操作 - 统一高度和样式 */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* 示例模型 */}
        <div className="relative group">
          <button className={`${BTN_BASE} ${BTN_HEIGHT} px-3 border border-gray-300 text-gray-700 hover:bg-gray-50`}>
            <span>📋</span>
            <span>示例模型</span>
          </button>
          <div className="absolute top-full right-0 pt-1 bg-transparent min-w-44 z-50">
            <div className="bg-white border rounded-lg shadow-lg py-2 hidden group-hover:block">
            <button
              onClick={() => onLoadSample('sales')}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
            >
              📊 销售漏斗模型
            </button>
            <button
              onClick={() => onLoadSample('profit')}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
            >
              💰 利润模型
            </button>
            <div className="border-t my-1" />
            <button
              onClick={onExportDataTemplate}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-blue-600"
            >
              📊 下载数据表模板
            </button>
            <button
              onClick={onExportFormulaTemplate}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm text-purple-600"
            >
              📝 下载公式表模板
            </button>
            </div>
          </div>
        </div>

        {/* 获取数据下拉菜单 */}
        <div className="relative group shrink-0">
          <button
            className={`${BTN_BASE} ${BTN_HEIGHT} px-3 ${
              pbiConfig
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                : 'border border-green-500 text-green-600 hover:bg-green-50'
            }`}
          >
            <span>📥</span>
            <span>获取数据</span>
            <span className="text-xs">▼</span>
          </button>
          <div className="absolute top-full left-0 pt-1 bg-transparent min-w-48 z-50">
            <div className="bg-white border rounded-lg shadow-lg py-2 hidden group-hover:block">
              <button
                onClick={onOpenCSVImport}
                className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <span>💾</span>
                <span>
                  <div className="font-medium">导入数据</div>
                  <div className="text-xs text-gray-500">从 CSV/Excel 文件导入</div>
                </span>
              </button>
              <div className="border-t my-1" />
              <button
                onClick={() => {
                  if (pbiDisabled) {
                    if (getDisableReason) alert(getDisableReason('powerbi'));
                    return;
                  }
                  onOpenPBIConnect();
                }}
                className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                  pbiDisabled ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50'
                }`}
                title={pbiDisabled && getDisableReason ? getDisableReason('powerbi') : ''}
              >
                <span>⚡</span>
                <span>
                  <div className="font-medium">PowerBI 连接</div>
                  <div className="text-xs text-gray-500">连接 Power BI 数据集</div>
                </span>
              </button>
              {pbiConfig && (
                <button
                  onClick={onRefreshPBI}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors"
                >
                  <span>🔄</span>
                  <span>
                    <div className="font-medium">刷新数据</div>
                    <div className="text-xs text-gray-500">从 Power BI 刷新</div>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 指标体系管理 */}
        <button
          onClick={onOpenSystemManager}
          className={`${BTN_BASE} ${BTN_HEIGHT} px-3 border border-gray-300 text-gray-700 hover:bg-gray-50`}
          title="管理多个指标体系"
        >
          <span>📂</span>
          <span>指标体系</span>
        </button>

        {/* 导出 */}
        <div className="relative group">
          <button
            onClick={() => {
              if (exportDisabled) {
                if (getDisableReason) alert(getDisableReason('export'));
              }
            }}
            className={`${BTN_BASE} ${BTN_HEIGHT} px-3 ${
              exportDisabled
                ? 'border border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            title={exportDisabled && getDisableReason ? getDisableReason('export') : ''}
          >
            <span>📤</span>
            <span>导出</span>
          </button>
          <div className={`absolute top-full right-0 pt-1 bg-transparent min-w-40 z-50 ${
            exportDisabled ? 'pointer-events-none' : ''
          }`}>
            <div className={`bg-white border rounded-lg shadow-lg py-2 hidden group-hover:block ${
              exportDisabled ? 'opacity-60' : ''
            }`}>
            <button
              onClick={() => {
                if (exportDisabled) {
                  if (getDisableReason) alert(getDisableReason('export'));
                  return;
                }
                onExportImage();
              }}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
            >
              🖼️ 导出图片
            </button>
            <div className="border-t my-1" />
            <button
              onClick={() => {
                if (exportDisabled) {
                  if (getDisableReason) alert(getDisableReason('export'));
                  return;
                }
                onExportJSON();
              }}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
            >
              📄 导出 JSON
            </button>
            <button
              onClick={() => {
                if (exportDisabled) {
                  if (getDisableReason) alert(getDisableReason('export'));
                  return;
                }
                onExportCSV();
              }}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
            >
              📊 导出 CSV
            </button>
            </div>
          </div>
        </div>

        {/* 布局方向切换 */}
        <button
          onClick={onToggleLayoutDirection}
          className={`${BTN_BASE} ${BTN_HEIGHT} px-3 border border-gray-300 text-gray-700 hover:bg-gray-50`}
          title={layoutDirection === 'horizontal' ? '切换为竖向布局' : '切换为横向布局'}
        >
          <span>{layoutDirection === 'horizontal' ? '↔' : '↕'}</span>
          <span>{layoutDirection === 'horizontal' ? '横版' : '竖版'}</span>
        </button>

        {/* 帮助 */}
        <button
          onClick={onOpenHelp}
          className={`${BTN_BASE} ${BTN_HEIGHT} px-3 border border-gray-300 text-gray-700 hover:bg-gray-50`}
          title="打开帮助文档"
        >
          <span>📖</span>
          <span>帮助</span>
        </button>
      </div>

    </div>
  );
};

export default Toolbar;
