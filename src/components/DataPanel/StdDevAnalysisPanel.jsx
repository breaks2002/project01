import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import useVDTStore from '../../store/useVDTStore';
import { calculateAllStdDev, getNodeCategoryLabel } from '../../engine/StdDevCalculator';
import StdDevScatterChart from './StdDevScatterChart';
import StdDevDetailTable from './StdDevDetailTable';
import StdDevConfigPanel from './StdDevConfigPanel';
import StdDevLegend from './StdDevLegend';
import StdDevDataTable from './StdDevDataTable';
import { exportStdDevToExcel, exportChartToImage } from '../../utils/stdDevExport';

/**
 * 标准差分析主面板
 */
const StdDevAnalysisPanel = ({
  nodes,
  scenarios,
  currentScenarioId,
  onClose,
  isMinimized,
  onToggleMinimize,
  onBringToFront
}) => {
  // 从 store 获取状态
  const stdDevOptions = useVDTStore(s => s.stdDevOptions);
  const setStdDevOptions = useVDTStore(s => s.setStdDevOptions);
  const stdDevData = useVDTStore(s => s.stdDevData);
  const setStdDevData = useVDTStore(s => s.setStdDevData);
  const selectedStdDevNode = useVDTStore(s => s.selectedStdDevNode);
  const setSelectedStdDevNode = useVDTStore(s => s.setSelectedStdDevNode);

  // 窗口状态
  const [panelPosition, setPanelPosition] = useState({ x: 16, y: 64 });
  const [panelSize, setPanelSize] = useState({ width: 1200, height: 850 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [prevPanelState, setPrevPanelState] = useState(null);
  const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'table'
  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelStartPos = useRef({ x: 0, y: 0 });
  const panelStartSize = useRef({ width: 0, height: 0 });

  // 切换全屏
  const toggleFullscreen = () => {
    if (isFullscreen) {
      if (prevPanelState) {
        setPanelPosition(prevPanelState.position);
        setPanelSize(prevPanelState.size);
      }
      setIsFullscreen(false);
    } else {
      setPrevPanelState({
        position: { ...panelPosition },
        size: { ...panelSize }
      });
      setIsFullscreen(true);
    }
  };

  // 窗口拖动
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartPos.current = { ...panelPosition };
    onBringToFront?.();
  }, [panelPosition, onBringToFront]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    setPanelPosition({
      x: Math.max(0, panelStartPos.current.x + deltaX),
      y: Math.max(0, panelStartPos.current.y + deltaY)
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 窗口大小调整
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartSize.current = { ...panelSize };
    panelStartPos.current = { ...panelPosition };
    onBringToFront?.();
  }, [panelSize, panelPosition, onBringToFront]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;

    // 计算最大允许的尺寸，确保不超出视口
    const maxWidth = window.innerWidth - panelStartPos.current.x - 20;
    const maxHeight = window.innerHeight - panelStartPos.current.y - 20;

    const newWidth = Math.max(800, Math.min(panelStartSize.current.width + deltaX, maxWidth));
    const newHeight = Math.max(500, Math.min(panelStartSize.current.height + deltaY, maxHeight));

    setPanelSize({
      width: newWidth,
      height: newHeight
    });
  }, [isResizing, panelPosition]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // 添加全局事件监听
  useEffect(() => {
    if (isDragging || isResizing) {
      const moveHandler = isDragging ? handleDragMove : handleResizeMove;
      const upHandler = isDragging ? handleDragEnd : handleResizeEnd;

      window.addEventListener('mousemove', moveHandler);
      window.addEventListener('mouseup', upHandler);
      return () => {
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', upHandler);
      };
    }
  }, [isDragging, isResizing, handleDragMove, handleResizeMove, handleDragEnd, handleResizeEnd]);

  // 计算标准差数据
  const recalculateStdDev = useCallback(() => {
    const months = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月',
                    '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];

    // 将 nodes 对象转换为数组
    const nodesArray = nodes ? Object.values(nodes) : [];

    const results = calculateAllStdDev(nodesArray, scenarios, months, {
      dataMode: stdDevOptions.dataMode,
      minMonths: stdDevOptions.minMonths,
      thresholds: stdDevOptions.thresholds,
      compareInitial: stdDevOptions.compareInitial,
      selectedScenarios: stdDevOptions.selectedScenarios,
      currentScenarioId
    });

    setStdDevData(results);
  }, [
    nodes,
    scenarios,
    currentScenarioId,
    stdDevOptions.dataMode,
    stdDevOptions.minMonths,
    stdDevOptions.thresholds,
    stdDevOptions.compareInitial,
    stdDevOptions.selectedScenarios,
    setStdDevData
  ]);

  // 根据选中的指标筛选数据 - 直接匹配节点名称
  const filteredStdDevData = useMemo(() => {
    const selectedIndicators = stdDevOptions.selectedIndicators || [];
    // 如果没有选择指标，显示所有
    if (selectedIndicators.length === 0) return stdDevData;

    return stdDevData.filter(item => {
      if (!item.nodeName) return false;
      // 直接匹配节点名称，不做类别转换
      return selectedIndicators.includes(item.nodeName);
    });
  }, [stdDevData, stdDevOptions.selectedIndicators]);

  // 创建一个依赖字符串来检测 nodes 的 timeData 变化
  const nodesDependencyKey = useMemo(() => {
    if (!nodes) return '';
    // 提取每个节点的 timeData 实际值，确保能检测到数据变化
    const nodesSummary = Object.values(nodes).map(n => {
      // 提取 timeData 的所有值，用于检测变化
      let timeDataValues = {};
      if (n.timeData) {
        // 对 timeData 进行深拷贝，提取所有可序列化的值
        try {
          timeDataValues = JSON.parse(JSON.stringify(n.timeData));
        } catch (e) {
          // 如果序列化失败，只提取键名
          timeDataValues = { keys: Object.keys(n.timeData || {}).length };
        }
      }
      return {
        id: n.id,
        value: n.value,
        timeData: timeDataValues
      };
    });
    return JSON.stringify(nodesSummary);
  }, [nodes]);

  // 方案选择变化时重新计算
  const selectedScenariosKey = useMemo(() => {
    return JSON.stringify(stdDevOptions.selectedScenarios || []);
  }, [stdDevOptions.selectedScenarios]);

  // 监听数据变化，自动重算
  useEffect(() => {
    recalculateStdDev();
  }, [
    nodesDependencyKey,
    selectedScenariosKey,
    currentScenarioId,
    stdDevOptions.dataMode,
    stdDevOptions.thresholds.A,
    stdDevOptions.thresholds.B,
    stdDevOptions.compareInitial,
    stdDevOptions.selectedIndicators
  ]);

  // 导出 Excel
  const handleExportExcel = useCallback(() => {
    exportStdDevToExcel(stdDevData, stdDevOptions, '标准差分析.xlsx');
  }, [stdDevData, stdDevOptions]);

  // 导出图片
  const handleExportImage = useCallback(() => {
    exportChartToImage('std-dev-scatter-chart', '标准差分析图.png');
  }, []);

  // 查看趋势图
  const handleViewTrend = useCallback(() => {
    if (selectedStdDevNode) {
      // 触发全局事件，打开趋势图
      window.dispatchEvent(new CustomEvent('open-trend-chart', {
        detail: { nodeId: selectedStdDevNode.nodeId }
      }));
    }
  }, [selectedStdDevNode]);

  // 查看瀑布图
  const handleViewWaterfall = useCallback(() => {
    if (selectedStdDevNode) {
      // 触发全局事件，打开瀑布图
      window.dispatchEvent(new CustomEvent('open-waterfall-chart', {
        detail: { nodeId: selectedStdDevNode.nodeId }
      }));
    }
  }, [selectedStdDevNode]);

  // 最小化时不渲染
  if (isMinimized) {
    return null;
  }

  return (
    <div
      className={`bg-white ${isFullscreen ? '' : 'rounded-xl'} shadow-2xl flex flex-col overflow-hidden ${isDragging && !isFullscreen ? 'cursor-grabbing' : 'cursor-default'}`}
      style={isFullscreen ? {
        position: 'fixed',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999
      } : {
        position: 'absolute',
        left: panelPosition.x,
        top: panelPosition.y,
        width: panelSize.width,
        height: isMinimized ? 'auto' : panelSize.height,
        zIndex: 1000
      }}
      onClick={onBringToFront}
    >
      {/* 调整大小的句柄 - 右侧只保留顶部和底部，给滚动条留出空间（非全屏时显示） */}
      {!isMinimized && !isFullscreen && (
        <>
          <div className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
          <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
          <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
          <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
          <div className="absolute top-0 left-4 right-4 h-2 cursor-n-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
          <div className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
          <div className="absolute left-0 top-4 bottom-4 w-2 cursor-w-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
          {/* 右侧调整大小句柄：只保留顶部和底部各 40px，给滚动条留出中间空间 */}
          <div className="absolute right-0 top-4 w-2 h-10 cursor-e-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
          <div className="absolute right-0 bottom-4 w-2 h-10 cursor-e-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e)} />
        </>
      )}

      {/* 标题栏 */}
      <div
        className="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0 select-none"
        style={{ cursor: isFullscreen ? 'default' : 'move' }}
        onMouseDown={!isFullscreen ? handleDragStart : undefined}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            📐 标准差分析
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMinimize?.(); }}
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition-colors"
            title="最小化"
          >
            一
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition-colors"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            ⛶
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose?.(); }}
            className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 rounded text-red-600 font-medium transition-colors"
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* 配置面板 */}
          <StdDevConfigPanel
            options={stdDevOptions}
            scenarios={scenarios}
            nodes={nodes}
            onOptionsChange={setStdDevOptions}
            onRecalculate={recalculateStdDev}
            onExportExcel={handleExportExcel}
            onExportImage={handleExportImage}
          />

          {/* Tab 切换 */}
          <div className="flex border-b border-gray-200 flex-shrink-0">
            <button
              onClick={() => setActiveTab('chart')}
              className={"flex-1 px-4 py-2 text-sm font-medium " +
                (activeTab === 'chart'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700')}
            >
              📊 散点图分析
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={"flex-1 px-4 py-2 text-sm font-medium " +
                (activeTab === 'table'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700')}
            >
              📋 数据明细
            </button>
          </div>

          {/* 主内容区 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeTab === 'chart' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* 散点图（占据主要空间） */}
                <div className="flex-1 flex overflow-hidden" style={{ minHeight: '500px' }}>
                  {/* 左侧：散点图 */}
                  <div className="flex-1 flex flex-col border-r" style={{ minWidth: '600px' }}>
                    <div id="std-dev-scatter-chart" className="flex-1 p-4">
                      <StdDevScatterChart
                        data={filteredStdDevData}
                        thresholds={stdDevOptions.thresholds}
                        onNodeClick={setSelectedStdDevNode}
                        height="100%"
                      />
                    </div>
                  </div>

                  {/* 右侧：详情面板 */}
                  {selectedStdDevNode && (
                    <StdDevDetailTable
                      node={selectedStdDevNode}
                      onClose={() => setSelectedStdDevNode(null)}
                      onViewTrend={handleViewTrend}
                      onViewWaterfall={handleViewWaterfall}
                    />
                  )}
                </div>

                {/* 图例区域 */}
                <div className="border-t flex-shrink-0 overflow-y-auto" style={{ maxHeight: '100px' }}>
                  <StdDevLegend
                    scenarios={scenarios}
                    data={filteredStdDevData}
                    selectedIndicators={stdDevOptions.selectedIndicators}
                    onIndicatorToggle={(label) => {
                      const current = stdDevOptions.selectedIndicators || [];
                      let newSelected;
                      if (current.includes(label)) {
                        newSelected = current.filter(l => l !== label);
                      } else {
                        newSelected = [...current, label];
                      }
                      setStdDevOptions({ selectedIndicators: newSelected });
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* 数据表格 - 占据全部空间 */}
                <div className="flex-1 overflow-hidden p-4">
                  <StdDevDataTable data={filteredStdDevData} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default StdDevAnalysisPanel;