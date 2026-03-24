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
  showRulePanel,
  onOpenAliasPanel,
  showAliasPanel
}) => {
  // 获取模型数据检查是否已加载
  const nodes = useVDTStore((s) => s.nodes);
  const hasModel = Object.keys(nodes).length > 0;

  return (
    <div className="h-14 bg-white border-b px-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div style={{display:'flex',alignItems:'center',gap:'12px',fontFamily:'system-ui,Segoe UI,Roboto,sans-serif'}}>
          <div style={{width:'40px',height:'40px',position:'relative'}}>
            <div style={{position:'absolute',inset:0,border:'2px solid #0066FF',borderRadius:'50%'}}></div>
            <div className="aidm-logo-spin" style={{position:'absolute',inset:'5px',border:'2px solid #0066FF',borderRadius:'50%',borderRightColor:'transparent',borderBottomColor:'transparent'}}></div>
            <div style={{position:'absolute',top:'50%',left:'50%',width:'16px',height:'16px',transform:'translate(-50%,-50%)'}}>
              <svg viewBox="0 0 24 24" fill="#0066FF">
                <path d="M12 2C9.04 2 6.6 3.65 5.36 6.23C3.86 6.79 2.9 8.24 2.9 9.5C2.9 11.26 4.24 12.6 5.99 12.6C6.16 12.6 6.33 12.58 6.5 12.55V13.5C6.5 15.26 7.74 16.5 9.5 16.5H10.5V17.5C10.5 19.26 11.74 20.5 13.5 20.5C15.26 20.5 16.5 19.26 16.5 17.5V16.14C18.03 15.13 19 13.45 19 11.5C19 7.91 15.86 5 12 5M13 3.05V5.08C15.5 5.5 17.5 7.6 17.5 11.5C17.5 13.43 16.5 15.13 15 16.14V17.5C15 18.33 14.33 19 13.5 19C12.67 19 12 18.33 12 17.5V16.5C12 15.67 12.67 15 13.5 15H14.5V14H13.5C11.67 14 10.5 15.67 10.5 17.5V16.5C9.67 16.5 8.5 15.33 8.5 13.5V12.5H9.5C10.33 12.5 11.5 10.83 11.5 9H10.5C9.67 9 8.5 10.67 8.5 12.5H7.5V11.5C7.5 9.67 6.33 8.5 4.5 8.5C3.67 8.5 2.9 9.17 2.9 10C2.9 10.83 3.67 11.5 4.5 11.5C5.33 11.5 6.5 9.83 6.5 8H7.5C8.33 8 9.5 9.67 9.5 11.5H10.5V10.5C10.5 8.67 11.67 7.5 13.5 7.5C15.33 7.5 16.5 5.83 16.5 4V3.05C14.88 2.33 13.44 2 12 2Z" />
              </svg>
            </div>
          </div>
          <div style={{lineHeight:'1.2'}}>
            <div style={{fontSize:'24px',fontWeight:'700',color:'#121212',letterSpacing:'1px'}}>AIDM</div>
            <div style={{fontSize:'11px',color:'#666'}}>智能指标规划决策引擎</div>
          </div>
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
            <div className="border-t my-1" />
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
              onClick={onOpenScenarioSelector}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm flex items-center gap-2"
            >
              <span>📋</span>
              <span>
                <div className="font-medium">场景选择</div>
                <div className="text-xs text-gray-500">管理 AI 场景模板</div>
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
            <button
              onClick={onOpenAliasPanel}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm flex items-center gap-2"
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
