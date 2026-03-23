import React from 'react';
import ScenarioManager from './ScenarioManager';
import useVDTStore from '../../store/useVDTStore';
import ConstraintRulePanel from '../DataPanel/ConstraintRulePanel';

const Toolbar = ({
  onOpenEditor,
  onImportJSON,
  onExportJSON,
  onExportCSV,
  onExportImage,
  onExportDataTemplate,
  onExportFormulaTemplate,
  onLoadSample,
  onOpenCSVImport,
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
  showRulePanel
}) => {
  // 获取模型数据检查是否已加载
  const nodes = useVDTStore((s) => s.nodes);
  const hasModel = Object.keys(nodes).length > 0;

  return (
    <div className="h-14 bg-white border-b px-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
          V
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-800">VDT</h1>
          <p className="text-xs text-gray-500">驱动型业务规划工具</p>
        </div>

        {/* 方案管理器 */}
        <div className="ml-4 shrink-0">
          <ScenarioManager
            scenarios={scenarios}
            currentScenarioId={currentScenarioId}
            onLoadScenario={onLoadScenario}
            onSaveScenario={onSaveScenario}
            onDeleteScenario={onDeleteScenario}
            onRenameScenario={onRenameScenario}
            onDuplicateScenario={onDuplicateScenario}
            onCreateScenario={onCreateScenario}
          />
        </div>

        {/* 节点列表按钮 */}
        <button
          onClick={onToggleNodeTreeList}
          className={`shrink-0 px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm whitespace-nowrap ${
            showNodeTreeList && !isNodeTreeListMinimized
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
              : 'bg-gradient-to-r from-indigo-400 to-purple-400 text-white hover:from-indigo-500 hover:to-purple-500'
          }`}
        >
          <span>📋</span>
          <span>节点列表</span>
        </button>

        {/* 方案比选按钮 */}
        <button
          onClick={onOpenScenarioCompare}
          className={`shrink-0 px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm whitespace-nowrap ${
            showScenarioCompare && !isScenarioCompareMinimized
              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700'
              : 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-600 hover:to-cyan-600'
          }`}
        >
          <span>📊</span>
          <span>方案比选</span>
        </button>

        {/* 敏感性分析按钮 */}
        <button
          onClick={onOpenSensitivityAnalysis}
          className={`shrink-0 px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm whitespace-nowrap ${
            showSensitivityAnalysis && !isSensitivityAnalysisMinimized
              ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-700 hover:to-red-700'
              : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600'
          }`}
        >
          <span>📈</span>
          <span>敏感性分析</span>
        </button>

        {/* 标准差分析按钮 */}
        <button
          onClick={onOpenStdDevAnalysis}
          className={`shrink-0 px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm whitespace-nowrap ${
            showStdDevAnalysis && !isStdDevAnalysisMinimized
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700'
              : 'bg-gradient-to-r from-emerald-400 to-teal-400 text-white hover:from-emerald-500 hover:to-teal-500'
          }`}
        >
          <span>📐</span>
          <span>标准差分析</span>
        </button>

        {/* AI 配置按钮 */}
        <div className="relative group">
          <button className={`shrink-0 px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm whitespace-nowrap ${
            showAIConfig || showAITuning
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
              : 'bg-gradient-to-r from-indigo-400 to-purple-400 text-white hover:from-indigo-500 hover:to-purple-500'
          }`}>
            <span>🤖</span>
            <span>AI 决策</span>
            <span className="text-xs">▼</span>
          </button>
          {/* 下拉菜单：添加 invisible bridge 防止消失 */}
          <div className="absolute top-full left-0 pt-1 bg-transparent min-w-48 z-50">
            <div className="bg-white border rounded-lg shadow-lg py-2 hidden group-hover:block">
            <button
              onClick={onOpenAIConfig}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm flex items-center gap-2"
            >
              <span>⚙️</span>
              <span>
                <div className="font-medium">AI 配置</div>
                <div className="text-xs text-gray-500">配置 API、模型参数</div>
              </span>
            </button>
            <button
              onClick={onOpenAITuning}
              disabled={!hasModel}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                hasModel
                  ? 'hover:bg-gray-50 text-gray-700'
                  : 'opacity-50 cursor-not-allowed text-gray-400'
              }`}
              title={!hasModel ? '请先导入或创建指标模型' : ''}
            >
              <span>🎯</span>
              <span>
                <div className="font-medium">AI 调参</div>
                <div className="text-xs text-gray-500">智能调整驱动因子</div>
              </span>
            </button>
            <button
              onClick={onOpenKnowledgeBase}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm flex items-center gap-2"
            >
              <span>📚</span>
              <span>
                <div className="font-medium">知识库</div>
                <div className="text-xs text-gray-500">管理历史案例</div>
              </span>
            </button>
            <button
              onClick={onOpenRulePanel}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm flex items-center gap-2"
            >
              <span>📋</span>
              <span>
                <div className="font-medium">规则管理</div>
                <div className="text-xs text-gray-500">配置约束映射规则</div>
              </span>
            </button>
            <div className="border-t my-1" />
            <button
              onClick={onOpenScenarioSelector}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm flex items-center gap-2"
            >
              <span>📋</span>
              <span>
                <div className="font-medium">场景选择</div>
                <div className="text-xs text-gray-500">管理 AI 场景模板</div>
              </span>
            </button>
            </div>
          </div>
        </div>

        {/* 隐藏单独的知识库按钮，已整合到下拉菜单 */}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onOpenEditor(null)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
        >
          <span>+</span>
          创建节点
        </button>

        <div className="w-px h-8 bg-gray-200 mx-2" />

        <div className="relative group">
          <button className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
            📋
            示例模型
          </button>
          <div className="absolute top-full left-0 pt-1 bg-transparent min-w-48 z-50">
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

        <div className="w-px h-8 bg-gray-200 mx-2" />

        <button
          onClick={onOpenCSVImport}
          className="px-3 py-2 border border-green-500 text-green-600 rounded-lg hover:bg-green-50 flex items-center gap-2"
        >
          📊
          导入数据
        </button>
        <button
          onClick={onImportJSON}
          className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          📥
          导入 JSON
        </button>

        <div className="relative group">
          <button className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
            📤
            导出
          </button>
          <div className="absolute top-full right-0 pt-1 bg-transparent min-w-40 z-50">
            <div className="bg-white border rounded-lg shadow-lg py-2 hidden group-hover:block">
            <button
              onClick={onExportImage}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
            >
              🖼️ 导出图片
            </button>
            <div className="border-t my-1" />
            <button
              onClick={onExportJSON}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
            >
              📄 导出 JSON
            </button>
            <button
              onClick={onExportCSV}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
            >
              📊 导出 CSV
            </button>
            </div>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500">
        提示：双击节点可编辑，调整滑块看实时计算
      </div>
    </div>
  );
};

export default Toolbar;
