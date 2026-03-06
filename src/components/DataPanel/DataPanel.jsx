import React, { useState, useRef, useCallback, useEffect } from 'react';
import MonthDataTable from './MonthDataTable';
import MonthDetailTable from './MonthDetailTable';
import * as XLSX from 'xlsx';

const DataPanel = ({ nodes, onClose, onOpenFullscreen, currentScenarioName = '', isMinimized, onToggleMinimize, onBringToFront }) => {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'detail'
  const [panelPosition, setPanelPosition] = useState({ x: 200, y: 80 });
  const [panelSize, setPanelSize] = useState({ width: 700, height: 650 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [prevPanelState, setPrevPanelState] = useState(null);

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

  // 检查是否点击了滚动条
  const isScrollbarClick = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return false;

    // 检查是否是可滚动元素
    const hasScrollbar = target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth;
    if (!hasScrollbar) return false;

    // 计算鼠标位置是否在滚动条区域
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 垂直滚动条通常在右侧 15px 范围内
    const isVerticalScrollbar = x > target.clientWidth - 20 && x <= rect.width;
    // 水平滚动条通常在底部 15px 范围内
    const isHorizontalScrollbar = y > target.clientHeight - 20 && y <= rect.height;

    return isVerticalScrollbar || isHorizontalScrollbar;
  };

  // 拖动窗口
  const handleDragStart = useCallback((e) => {
    // 检查是否点击了按钮、输入框、选择框或滚动条
    if (e.target.closest('button') ||
        e.target.closest('input') ||
        e.target.closest('select') ||
        e.target.closest('textarea') ||
        isScrollbarClick(e)) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartPos.current = { ...panelPosition };
    // 置顶窗口
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

  // 调整窗口大小
  const handleResizeStart = useCallback((e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeHandle(handle);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartSize.current = { ...panelSize };
    panelStartPos.current = { ...panelPosition };
    // 置顶窗口
    onBringToFront?.();
  }, [panelSize, panelPosition, onBringToFront]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !resizeHandle) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;

    let newWidth = panelStartSize.current.width;
    let newHeight = panelStartSize.current.height;
    let newX = panelStartPos.current.x;
    let newY = panelStartPos.current.y;

    if (resizeHandle.includes('right')) {
      newWidth = Math.max(500, panelStartSize.current.width + deltaX);
    }
    if (resizeHandle.includes('bottom')) {
      newHeight = Math.max(400, panelStartSize.current.height + deltaY);
    }
    if (resizeHandle.includes('left')) {
      newWidth = Math.max(500, panelStartSize.current.width - deltaX);
      newX = panelStartPos.current.x + deltaX;
    }
    if (resizeHandle.includes('top')) {
      newHeight = Math.max(400, panelStartSize.current.height - deltaY);
      newY = panelStartPos.current.y + deltaY;
    }

    setPanelSize({ width: newWidth, height: newHeight });
    setPanelPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
  }, [isResizing, resizeHandle]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

  // 导出Excel
  const handleExportExcel = (data, fileName) => {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  // 全局监听鼠标移动和抬起
  useEffect(() => {
    if (isDragging || isResizing) {
      const handleGlobalMouseMove = (e) => {
        if (isDragging) handleDragMove(e);
        if (isResizing) handleResizeMove(e);
      };
      const handleGlobalMouseUp = () => {
        if (isDragging) handleDragEnd();
        if (isResizing) handleResizeEnd();
      };
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, isResizing, handleDragMove, handleDragEnd, handleResizeMove, handleResizeEnd]);

  // 如果最小化，只返回一个占位
  if (isMinimized) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* 浮动窗口 */}
      <div
        className={`bg-white ${isFullscreen ? '' : 'rounded-xl'} shadow-2xl flex flex-col overflow-hidden pointer-events-auto ${isDragging && !isFullscreen ? 'cursor-grabbing' : 'cursor-default'}`}
        style={isFullscreen ? {
          position: 'fixed',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh'
        } : {
          position: 'absolute',
          left: panelPosition.x,
          top: panelPosition.y,
          width: panelSize.width,
          height: panelSize.height
        }}
        onMouseDown={() => onBringToFront?.()}
      >
        {/* 调整大小的句柄（非全屏时显示）- 降低 z-index 避免覆盖滚动条 */}
        {!isFullscreen && (
          <>
            <div className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize" style={{ zIndex: 5 }} onMouseDown={(e) => handleResizeStart(e, 'top-left')} />
            <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize" style={{ zIndex: 5 }} onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
            <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize" style={{ zIndex: 5 }} onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
            <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" style={{ zIndex: 5 }} onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
            <div className="absolute top-0 left-4 right-4 h-2 cursor-n-resize" style={{ zIndex: 5 }} onMouseDown={(e) => handleResizeStart(e, 'top')} />
            <div className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize" style={{ zIndex: 5 }} onMouseDown={(e) => handleResizeStart(e, 'bottom')} />
            <div className="absolute left-0 top-4 bottom-4 w-2 cursor-w-resize" style={{ zIndex: 5 }} onMouseDown={(e) => handleResizeStart(e, 'left')} />
            <div className="absolute right-0 top-4 bottom-4 w-2 cursor-e-resize" style={{ zIndex: 5 }} onMouseDown={(e) => handleResizeStart(e, 'right')} />
          </>
        )}

        {/* 头部 - 可拖动（非全屏时） */}
        <div
          className={`px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0 select-none ${!isFullscreen ? 'cursor-move' : ''}`}
          onMouseDown={!isFullscreen ? handleDragStart : undefined}
        >
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              📊 数据面板
            </h3>
            {currentScenarioName && (
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                {currentScenarioName}
              </span>
            )}
            {!isFullscreen && (
              <span className="text-xs text-gray-500">
                (拖动标题栏移动窗口)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleMinimize}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition-colors"
              title="最小化"
            >
              一
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition-colors"
              title={isFullscreen ? "退出全屏" : "全屏"}
            >
              ⛶
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 rounded text-red-600 font-medium transition-colors"
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('summary')}
            className={"flex-1 px-4 py-2 text-sm font-medium " +
              (activeTab === 'summary'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700')}
          >
            汇总对比
          </button>
          <button
            onClick={() => setActiveTab('detail')}
            className={"flex-1 px-4 py-2 text-sm font-medium " +
              (activeTab === 'detail'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700')}
          >
            月份明细
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 p-4 flex flex-col overflow-hidden">
          {activeTab === 'summary' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="mb-4 flex-shrink-0">
                <h4 className="text-sm font-medium text-gray-700 mb-2">说明</h4>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>• <span className="text-green-600">实际汇总</span>：1-8月实际数合计</li>
                  <li>• <span className="text-blue-600">预测汇总</span>：9-12月预测数合计</li>
                  <li>• <span className="text-green-700 font-semibold">实际+预测</span>：实际+预测合计</li>
                  <li>• <span className="text-gray-600">目标汇总</span>：1-12月目标数合计</li>
                  <li>• <span>差额(vs目标)</span>：(实际+预测) - 目标</li>
                  <li>• <span>差额(vs初始)</span>：(实际+预测) - 初始值</li>
                </ul>
              </div>
              <div className="flex-1 overflow-hidden">
                <MonthDataTable nodes={nodes} onExportExcel={handleExportExcel} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <MonthDetailTable nodes={nodes} onExportExcel={handleExportExcel} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataPanel;
