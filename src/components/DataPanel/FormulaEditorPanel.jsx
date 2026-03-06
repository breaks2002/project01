import React, { useState, useRef, useCallback, useEffect } from 'react';
import { generateId, aggregateTimeData } from '../../utils/formatters';

// 函数定义
const FUNCTION_DEFINITIONS = [
  // 数学函数
  { name: 'SQRT', tip: '平方根', category: 'math', desc: '计算一个数的平方根，例如 SQRT(16) = 4' },
  { name: 'POW', tip: '幂运算 POW(a,b)', category: 'math', desc: '计算 a 的 b 次方，例如 POW(2,3) = 8' },
  { name: 'ABS', tip: '绝对值', category: 'math', desc: '计算绝对值，例如 ABS(-100) = 100' },
  { name: 'ROUND', tip: '四舍五入', category: 'math', desc: '四舍五入到指定位数，例如 ROUND(3.1415,2) = 3.14' },

  // 聚合函数
  { name: 'MAX', tip: '最大值', category: 'aggregate', desc: '取多个值中的最大值，例如 MAX(10,20,30) = 30' },
  { name: 'MIN', tip: '最小值', category: 'aggregate', desc: '取多个值中的最小值，例如 MIN(10,20,30) = 10' },
  { name: 'SUM', tip: '求和', category: 'aggregate', desc: '对多个值求和，例如 SUM(10,20,30) = 60' },
  { name: 'AVG', tip: '平均值', category: 'aggregate', desc: '计算多个值的平均值，例如 AVG(10,20,30) = 20' },

  // 条件函数
  { name: 'IF', tip: '条件判断 IF(cond,true,false)', category: 'conditional', desc: '条件判断：IF(条件, 真值, 假值)，例如 IF(A>100, A, 100)' },

  // MONTHLY 月度函数
  { name: 'MONTHLY_SUM', tip: '月度求和', category: 'monthly', desc: '先计算每个月的表达式值，再求和所有月份' },
  { name: 'MONTHLY_AVG', tip: '月度平均值', category: 'monthly', desc: '先计算每个月的表达式值，再求平均值' },
  { name: 'MONTHLY_MIN', tip: '月度最小值', category: 'monthly', desc: '先计算每个月的表达式值，再取最小值' },
  { name: 'MONTHLY_MAX', tip: '月度最大值', category: 'monthly', desc: '先计算每个月的表达式值，再取最大值' },
  { name: 'MONTHLY_COUNT', tip: '月度计数（含0）', category: 'monthly', desc: '统计有效月份数（包含0，排除空值）' },
  { name: 'MONTHLY_COUNT_NONZERO', tip: '月度计数（不含0）', category: 'monthly', desc: '统计非零月份数（排除0和空值）' },
  { name: 'MONTHLY_COUNT_EXISTS', tip: '月度计数（所有）', category: 'monthly', desc: '统计所有存在的月份数（包括空值）' },
  { name: 'MONTHLY_DISTINCT', tip: '月度非重复计数', category: 'monthly', desc: '统计不同值的数量（相同值只算一次）' }
];

const FUNCTION_CATEGORIES = {
  math: { label: '📐 数学函数', order: 1 },
  aggregate: { label: '🔢 聚合函数', order: 2 },
  conditional: { label: '🔀 条件函数', order: 3 },
  monthly: { label: '📅 月度函数', order: 4 }
};

const FormulaEditorPanel = ({ nodes, onUpdateNode, onAddNode, onDeleteNode, onClose, isMinimized, onToggleMinimize }) => {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [functionSearchQuery, setFunctionSearchQuery] = useState('');
  const [showFunctionList, setShowFunctionList] = useState(false);
  const [originalFormData, setOriginalFormData] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'driver',
    level: '1',
    unit: '',
    formula: '',
    value: 0,
    min: 0,
    max: 100,
    format: '',
    direction: 'auto',
    aggregationType: '',
    isRatioIndicator: false
  });
  const [userHasModifiedMin, setUserHasModifiedMin] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ x: 150, y: 60 });
  const [panelSize, setPanelSize] = useState({ width: 900, height: 700 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [prevPanelState, setPrevPanelState] = useState(null);

  const formulaTextareaRef = useRef(null);
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

  // 拖动窗口
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') ||
        e.target.closest('input') ||
        e.target.closest('select') ||
        e.target.closest('textarea')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartPos.current = { ...panelPosition };
  }, [panelPosition]);

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
  }, [panelSize, panelPosition]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !resizeHandle) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;

    let newWidth = panelStartSize.current.width;
    let newHeight = panelStartSize.current.height;
    let newX = panelStartPos.current.x;
    let newY = panelStartPos.current.y;

    if (resizeHandle.includes('right')) {
      newWidth = Math.max(600, panelStartSize.current.width + deltaX);
    }
    if (resizeHandle.includes('bottom')) {
      newHeight = Math.max(500, panelStartSize.current.height + deltaY);
    }
    if (resizeHandle.includes('left')) {
      newWidth = Math.max(600, panelStartSize.current.width - deltaX);
      newX = panelStartPos.current.x + deltaX;
    }
    if (resizeHandle.includes('top')) {
      newHeight = Math.max(500, panelStartSize.current.height - deltaY);
      newY = panelStartPos.current.y + deltaY;
    }

    setPanelSize({ width: newWidth, height: newHeight });
    setPanelPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
  }, [isResizing, resizeHandle]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

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

  // 显示保存成功提示
  const showSaveSuccess = () => {
    setSaveMessage('✓ 保存成功');
    setTimeout(() => setSaveMessage(null), 2000);
  };

  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null;

  // 左侧节点列表搜索状态
  const [nodeListSearchQuery, setNodeListSearchQuery] = useState('');

  const sortedNodes = Object.values(nodes).sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'driver' ? -1 : 1;
  });

  // 根据搜索查询过滤左侧节点列表
  const filteredSortedNodes = sortedNodes.filter(n =>
    !nodeListSearchQuery ||
    n.id.toLowerCase().includes(nodeListSearchQuery.toLowerCase()) ||
    n.name.toLowerCase().includes(nodeListSearchQuery.toLowerCase())
  );

  // 计算节点的实际数汇总
  const getActualTotal = (node) => {
    if (!node) return 0;
    const aggregated = aggregateTimeData(node.timeData);
    return aggregated.actualTotal > 0 ? aggregated.actualTotal : (node.value ?? 0);
  };

  // 当选中节点变化时，更新表单数据
  useEffect(() => {
    if (selectedNode) {
      const initialValue = selectedNode.initialBaseline ?? selectedNode.value ?? 0;
      const actualTotal = getActualTotal(selectedNode);

      const newFormData = {
        id: selectedNode.id || '',
        name: selectedNode.name || '',
        type: selectedNode.type || 'driver',
        level: String(selectedNode.level ?? '1'),
        unit: selectedNode.unit || '',
        formula: selectedNode.formula || '',
        value: initialValue, // 默认值 = initialBaseline（初始值）
        min: actualTotal, // 总是用实际数作为默认值，不管原来的 range.min
        max: selectedNode.range?.max ?? 100,
        format: selectedNode.format || '',
        direction: selectedNode.direction || 'auto',
        aggregationType: selectedNode.aggregationType || '',
        isRatioIndicator: selectedNode.isRatioIndicator || false
      };

      setFormData(newFormData);
      setOriginalFormData(newFormData);
      setUserHasModifiedMin(false); // 选中新节点时重置标记
    } else {
      const newFormData = {
        id: '',
        name: '',
        type: 'driver',
        level: '1',
        unit: '',
        formula: '',
        value: 0,
        min: 0,
        max: 100,
        format: '',
        direction: 'auto',
        aggregationType: '',
        isRatioIndicator: false
      };
      setFormData(newFormData);
      setOriginalFormData(null);
      setUserHasModifiedMin(false);
    }
  }, [selectedNode]);

  // 当名称变化时，自动更新 ID（仅新节点）
  const handleNameChange = (e) => {
    const name = e.target.value;
    let newId = formData.id;
    if (!selectedNode || !formData.id) {
      newId = name;
    }
    setFormData({ ...formData, name, id: newId });
  };

  // 处理 value 变化 - 最小值不再跟随变化，保持为实际数
  const handleValueChange = (e) => {
    const newVal = parseFloat(e.target.value) || 0;
    setFormData(prev => ({
      ...prev,
      value: newVal
    }));
  };

  // 处理 min 手动修改
  const handleMinChange = (e) => {
    setUserHasModifiedMin(true);
    setFormData({ ...formData, min: parseFloat(e.target.value) || 0 });
  };

  // 在光标位置插入节点
  const insertNodeAtCursor = (nodeId) => {
    const textarea = formulaTextareaRef.current;
    if (!textarea) {
      setFormData({
        ...formData,
        formula: formData.formula + nodeId + ' '
      });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = formData.formula;
    const newValue = value.substring(0, start) + nodeId + ' ' + value.substring(end);

    setFormData({ ...formData, formula: newValue });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + nodeId.length + 1, start + nodeId.length + 1);
    }, 0);
  };

  // 插入运算符
  const insertOperator = (op) => {
    const textarea = formulaTextareaRef.current;
    if (!textarea) {
      setFormData({
        ...formData,
        formula: formData.formula + op
      });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = formData.formula;
    const newValue = value.substring(0, start) + op + value.substring(end);

    setFormData({ ...formData, formula: newValue });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + op.length, start + op.length);
    }, 0);
  };

  // 插入函数
  const insertFunction = (funcName) => {
    const textarea = formulaTextareaRef.current;
    if (!textarea) {
      setFormData({
        ...formData,
        formula: formData.formula + funcName + '()'
      });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = formData.formula;
    const newValue = value.substring(0, start) + funcName + '()' + value.substring(end);

    setFormData({ ...formData, formula: newValue });

    setTimeout(() => {
      textarea.focus();
      const cursorPos = start + funcName.length + 1;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  // 保存节点
  const handleSave = () => {
    if (!formData.name) return;

    const nodeId = formData.id || selectedNode?.id || generateId();

    let finalMin = formData.min;
    if (!userHasModifiedMin && selectedNode) {
      finalMin = getActualTotal(selectedNode);
    }

    const newNode = {
      ...selectedNode,
      id: nodeId,
      name: formData.name || '未命名节点',
      type: formData.type,
      level: formData.level || '1',
      unit: formData.unit,
      aggregationType: formData.aggregationType,
      formula: formData.type !== 'driver' ? formData.formula : '',
      value: formData.type === 'driver' ? formData.value : (selectedNode?.value ?? 0),
      baseline: formData.type === 'driver' ? formData.value : (selectedNode?.baseline ?? 0),
      range: formData.type === 'driver' ? {
        min: finalMin,
        max: formData.max
      } : undefined,
      format: formData.format,
      direction: formData.direction,
      isRatioIndicator: formData.type !== 'driver' ? formData.isRatioIndicator : false,
      position: selectedNode?.position || {
        x: 100 + Math.random() * 300,
        y: 100 + Math.random() * 300
      },
      size: selectedNode?.size || { width: 520, height: 'auto' },
      timeData: selectedNode?.timeData || {},
      dependsOn: selectedNode?.dependsOn || []
    };

    if (selectedNode) {
      if (nodeId !== selectedNodeId) {
        onDeleteNode(selectedNodeId);
        onAddNode(newNode);
        setSelectedNodeId(nodeId);
      } else {
        onUpdateNode(nodeId, newNode);
      }
    } else {
      onAddNode(newNode);
      setSelectedNodeId(nodeId);
    }

    setOriginalFormData({ ...formData });
    showSaveSuccess();
  };

  // 删除节点
  const handleDelete = () => {
    if (selectedNode && window.confirm('确定要删除这个节点吗？')) {
      onDeleteNode(selectedNodeId);
      setSelectedNodeId(null);
    }
  };

  // 创建新节点
  const handleCreateNew = () => {
    setSelectedNodeId(null);
    const newFormData = {
      id: '',
      name: '',
      type: 'driver',
      level: '1',
      unit: '',
      formula: '',
      value: 0,
      min: 0,
      max: 100,
      format: '',
      direction: 'auto',
      aggregationType: '',
      isRatioIndicator: false
    };
    setFormData(newFormData);
    setOriginalFormData(null);
    setUserHasModifiedMin(false);
  };

  // 取消编辑：重置到原始数据
  const handleCancel = () => {
    if (originalFormData) {
      setFormData({ ...originalFormData });
      setUserHasModifiedMin(false);
    } else {
      handleCreateNew();
    }
  };

  // 获取可用节点列表（用于公式参考）
  const availableNodes = Object.values(nodes).filter(n => n.id !== selectedNodeId);

  // 根据搜索查询过滤节点
  const filteredNodes = availableNodes.filter(n =>
    n.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 分组节点：驱动因子和计算指标
  const driverNodes = filteredNodes.filter(n => n.type === 'driver');
  const computedNodes = filteredNodes.filter(n => n.type === 'computed');

  // 如果最小化，只返回一个占位
  if (isMinimized) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
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
      >
        {/* 调整大小的句柄（非全屏时显示） */}
        {!isFullscreen && (
          <>
            <div className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-30" onMouseDown={(e) => handleResizeStart(e, 'top-left')} />
            <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-30" onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
            <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-30" onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
            <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-30" onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
            <div className="absolute top-0 left-4 right-4 h-2 cursor-n-resize z-20" onMouseDown={(e) => handleResizeStart(e, 'top')} />
            <div className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize z-20" onMouseDown={(e) => handleResizeStart(e, 'bottom')} />
            <div className="absolute left-0 top-4 bottom-4 w-2 cursor-w-resize z-20" onMouseDown={(e) => handleResizeStart(e, 'left')} />
            <div className="absolute right-0 top-4 bottom-4 w-2 cursor-e-resize z-20" onMouseDown={(e) => handleResizeStart(e, 'right')} />
          </>
        )}

        {/* 头部 - 可拖动（非全屏时） */}
        <div
          className={`px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-gray-50 flex-shrink-0 select-none ${!isFullscreen ? 'cursor-move' : ''}`}
          onMouseDown={!isFullscreen ? handleDragStart : undefined}
        >
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              📝 公式编辑面板
            </h3>
            {!isFullscreen && (
              <span className="text-xs text-gray-500">
                (拖动标题栏移动窗口)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateNew}
              className="text-sm px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
              title="新建节点"
            >
              + 新建
            </button>
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

        <div className="flex-1 flex overflow-hidden">
          {/* 左侧节点列表 */}
          <div className="w-1/3 border-r border-gray-200 flex flex-col">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">节点列表</span>
                <span className="text-xs text-gray-400">
                  {filteredSortedNodes.length}/{sortedNodes.length}
                </span>
              </div>
              <input
                type="text"
                value={nodeListSearchQuery}
                onChange={(e) => setNodeListSearchQuery(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="🔍 搜索节点..."
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredSortedNodes.length > 0 ? (
                filteredSortedNodes.map(node => (
                  <div
                    key={node.id}
                    className={`px-3 py-2 cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${selectedNodeId === node.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">
                        {node.type === 'driver' ? '⚙️' : '📊'}
                      </span>
                      <span className="text-sm font-medium text-gray-800 truncate flex-1">
                        {node.name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 font-mono truncate">
                      {node.id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                  <p className="text-sm">没有找到匹配的节点</p>
                </div>
              )}
            </div>
          </div>

          {/* 右侧编辑表单 */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedNodeId || formData.name ? (
              <div className="space-y-4">
                {/* 节点 ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    节点 ID（公式中使用）
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    placeholder="例如：总收入"
                  />
                </div>

                {/* 节点名称 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    显示名称 *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={handleNameChange}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：总收入"
                  />
                </div>

                {/* 节点类型 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    节点类型
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="driver">⚙️ 驱动因子（可调整的输入值）</option>
                    <option value="computed">📊 计算指标（由公式计算）</option>
                  </select>
                </div>

                {/* 层级 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    层级（用于布局整理）
                  </label>
                  <input
                    type="text"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：1、3.1、3.100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    整数部分决定列位置（1 最左），小数点后决定同一列内顺序，支持 3.100 等格式
                  </p>
                </div>

                {/* 指标方向 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    指标方向
                  </label>
                  <select
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="auto">自动判断</option>
                    <option value="positive">正向指标（增长好）</option>
                    <option value="negative">反向指标（增长不好）</option>
                  </select>
                </div>

                {/* 单位 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    单位（可选）
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：￥、%、件"
                  />
                </div>

                {/* 聚合方式（仅驱动因子） */}
                {formData.type === 'driver' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      月度数据汇总方式
                    </label>
                    <select
                      value={formData.aggregationType}
                      onChange={(e) => setFormData({ ...formData, aggregationType: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">自动判断（%用平均，其他用加总）</option>
                      <option value="sum">📊 加总（适用于收入、数量等绝对值）</option>
                      <option value="average">📈 平均（适用于转化率、比率等百分比）</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      选择月度数据的汇总方式，影响卡片显示和滑块调整逻辑
                    </p>
                  </div>
                )}

                {/* 比率型指标（仅计算指标） */}
                {formData.type !== 'driver' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isRatioIndicator"
                      checked={formData.isRatioIndicator}
                      onChange={(e) => setFormData({ ...formData, isRatioIndicator: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isRatioIndicator" className="text-sm font-medium text-gray-700">
                      📊 比率型指标（如毛利率 = 毛利润/营业收入）
                    </label>
                  </div>
                )}
                {formData.type !== 'driver' && formData.isRatioIndicator && (
                  <p className="text-xs text-gray-500 -mt-2 ml-6">
                    启用后，汇总时先分别聚合分子和分母，再计算比率（公式格式：分子 / 分母）
                  </p>
                )}

                {/* 显示格式 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    显示格式（可选）
                  </label>
                  <select
                    value={formData.format}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">默认格式</option>
                    <option value="#,##0">千分位分隔</option>
                    <option value="0.00">两位小数</option>
                    <option value="0%">百分比</option>
                  </select>
                </div>

                {/* 驱动因子专用字段 */}
                {formData.type === 'driver' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        初始值
                      </label>
                      <input
                        type="number"
                        value={formData.value}
                        onChange={handleValueChange}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          最小值（实际数）
                        </label>
                        <input
                          type="number"
                          value={formData.min}
                          onChange={handleMinChange}
                          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          最大值
                        </label>
                        <input
                          type="number"
                          value={formData.max}
                          onChange={(e) => setFormData({ ...formData, max: parseFloat(e.target.value) || 100 })}
                          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    {!userHasModifiedMin && selectedNode && (
                      <p className="text-xs text-gray-400">
                        💡 最小值默认等于实际数（历史已发生：{getActualTotal(selectedNode).toLocaleString()}），您可以手动修改
                      </p>
                    )}
                  </>
                )}

                {/* 计算节点专用字段 */}
                {formData.type !== 'driver' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      公式
                    </label>

                    {/* 运算符快捷按钮 */}
                    <div className="flex gap-1 mb-2 flex-wrap">
                      {['+', '-', '*', '/', '^', '(', ')'].map(op => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => insertOperator(op)}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-mono text-sm"
                          title={op === '^' ? '指数运算 (a^b = a的b次方)' : ''}
                        >
                          {op}
                        </button>
                      ))}
                    </div>

                    {/* 函数快捷按钮 + 搜索 */}
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          type="button"
                          onClick={() => setShowFunctionList(!showFunctionList)}
                          className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded flex items-center gap-1"
                        >
                          {showFunctionList ? '▼' : '▶'} 更多函数
                        </button>
                        {showFunctionList && (
                          <input
                            type="text"
                            value={functionSearchQuery}
                            onChange={(e) => setFunctionSearchQuery(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="🔍 搜索函数..."
                          />
                        )}
                      </div>

                      {/* 常用函数快捷按钮 */}
                      <div className="flex gap-1 flex-wrap mb-1">
                        {[
                          { name: 'SQRT', tip: '平方根' },
                          { name: 'POW', tip: '幂运算' },
                          { name: 'ABS', tip: '绝对值' },
                          { name: 'ROUND', tip: '四舍五入' },
                          { name: 'MAX', tip: '最大值' },
                          { name: 'MIN', tip: '最小值' },
                          { name: 'IF', tip: '条件判断' },
                          { name: 'MONTHLY_SUM', tip: '月度求和' },
                          { name: 'MONTHLY_AVG', tip: '月度平均' },
                          { name: 'MONTHLY_COUNT', tip: '月度计数' }
                        ].map(func => (
                          <button
                            key={func.name}
                            type="button"
                            onClick={() => insertFunction(func.name)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-mono text-xs"
                            title={func.tip}
                          >
                            {func.name}()
                          </button>
                        ))}
                      </div>

                      {/* 完整函数列表（展开时显示） */}
                      {showFunctionList && (
                        <div className="border rounded bg-gray-50 p-2 max-h-40 overflow-y-auto">
                          {(() => {
                            const filteredFuncs = FUNCTION_DEFINITIONS.filter(f =>
                              !functionSearchQuery ||
                              f.name.toLowerCase().includes(functionSearchQuery.toLowerCase()) ||
                              f.tip.toLowerCase().includes(functionSearchQuery.toLowerCase()) ||
                              f.desc.toLowerCase().includes(functionSearchQuery.toLowerCase())
                            );

                            const grouped = {};
                            filteredFuncs.forEach(f => {
                              if (!grouped[f.category]) grouped[f.category] = [];
                              grouped[f.category].push(f);
                            });

                            const categories = Object.keys(grouped).sort(
                              (a, b) => FUNCTION_CATEGORIES[a].order - FUNCTION_CATEGORIES[b].order
                            );

                            if (categories.length === 0) {
                              return (
                                <p className="text-xs text-gray-400 text-center py-2">
                                  没有找到匹配的函数
                                </p>
                              );
                            }

                            return categories.map(cat => (
                              <div key={cat} className="mb-2 last:mb-0">
                                <p className="text-xs font-medium text-gray-600 mb-1">
                                  {FUNCTION_CATEGORIES[cat].label}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {grouped[cat].map(func => (
                                    <button
                                      key={func.name}
                                      type="button"
                                      onClick={() => {
                                        insertFunction(func.name);
                                      }}
                                      className="px-2 py-0.5 bg-white hover:bg-blue-50 border border-gray-200 rounded font-mono text-xs text-blue-700 hover:text-blue-800 shadow-sm"
                                      title={`${func.tip}\n${func.desc}`}
                                    >
                                      {func.name}()
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>

                    <textarea
                      ref={formulaTextareaRef}
                      value={formData.formula}
                      onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
                      rows={4}
                      placeholder="例如：营业收入 - 营业成本 或 MONTHLY_SUM(净现金流量 * 折现率)"
                      disabled={formData.type === 'driver'}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      支持 + - * / ^ ( ) 运算符，以及数学函数、聚合函数、条件函数和 MONTHLY 月度函数
                    </p>

                    {/* 可用节点列表 */}
                    {availableNodes.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-600 mb-1">可用节点（点击插入）：</p>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="🔍 搜索节点..."
                        />
                        <div className="max-h-48 overflow-y-auto p-2 bg-gray-50 rounded space-y-3">
                          {driverNodes.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                                <span>⚙️</span> 驱动因子
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {driverNodes.map(n => (
                                  <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => insertNodeAtCursor(n.id)}
                                    className="text-xs px-2 py-1 bg-white hover:bg-blue-50 border border-gray-200 rounded font-mono text-blue-700 hover:text-blue-800 shadow-sm"
                                    title={n.name}
                                  >
                                    {n.id}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {computedNodes.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                                <span>📊</span> 计算指标
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {computedNodes.map(n => (
                                  <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => insertNodeAtCursor(n.id)}
                                    className="text-xs px-2 py-1 bg-white hover:bg-blue-50 border border-gray-200 rounded font-mono text-blue-700 hover:text-blue-800 shadow-sm"
                                    title={n.name}
                                  >
                                    {n.id}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {filteredNodes.length === 0 && searchQuery && (
                            <p className="text-xs text-gray-400 text-center py-2">
                              没有找到匹配的节点
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-4 items-center">
                  {saveMessage && (
                    <span className="text-green-600 text-sm font-medium">{saveMessage}</span>
                  )}
                  {selectedNode && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50"
                    >
                      删除
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 border rounded-md hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <p className="text-4xl mb-4">📝</p>
                <p>选择左侧节点或点击「新建」</p>
                <p>开始编辑公式</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormulaEditorPanel;
