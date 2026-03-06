import React, { useCallback, useMemo, useState, useRef } from 'react';
import { formatValue, getDiffColorClass } from '../../utils/formatters';
import useVDTStore from '../../store/useVDTStore';

/**
 * 节点树形列表组件
 * 显示树状结构的节点列表，支持展开/折叠
 */
const NodeTreeList = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  collapsedNodeIds,
  onToggleCollapse,
  onCenterNode,
  onClose,
  isMinimized,
  onToggleMinimize,
  onBringToFront,
  onOpenTrendChart,
  onOpenWaterfallChart
}) => {
  // 搜索状态
  const [searchTerm, setSearchTerm] = useState('');

  // 窗口状态
  const [panelPosition, setPanelPosition] = useState({ x: 16, y: 64 });
  const [panelSize, setPanelSize] = useState({ width: 400, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelStartPos = useRef({ x: 0, y: 0 });
  const panelStartSize = useRef({ width: 0, height: 0 });

  // 窗口拖动
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartPos.current = { ...panelPosition };
    if (onBringToFront) onBringToFront();
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
    if (onBringToFront) onBringToFront();
  }, [panelSize, onBringToFront]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    setPanelSize({
      width: Math.max(300, panelStartSize.current.width + deltaX),
      height: Math.max(400, panelStartSize.current.height + deltaY)
    });
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // 添加全局事件监听
  React.useEffect(() => {
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

  // 从 store 获取高亮相关状态
  const highlightedNodeId = useVDTStore(s => s.highlightedNodeId);
  const getAffectedNodes = useVDTStore(s => s.getAffectedNodes);
  const getDownstreamNodes = useVDTStore(s => s.getDownstreamNodes);
  const getDependencyNodes = useVDTStore(s => s.getDependencyNodes);

  // 计算高亮节点的相關节点
  // affectedNodeIds = 上游节点（高亮节点依赖的节点）
  const affectedNodeIds = useMemo(() => {
    if (!highlightedNodeId) return new Set();
    return getAffectedNodes(highlightedNodeId);
  }, [highlightedNodeId, getAffectedNodes]);

  // downstreamNodeIds = 下游节点（依赖高亮节点的节点）
  const downstreamNodeIds = useMemo(() => {
    if (!highlightedNodeId) return new Set();
    return getDownstreamNodes(highlightedNodeId);
  }, [highlightedNodeId, getDownstreamNodes]);

  // dependencyNodeIds = 依赖节点（与 affectedNodeIds 相同）
  const dependencyNodeIds = useMemo(() => {
    if (!highlightedNodeId) return new Set();
    return getDependencyNodes(highlightedNodeId);
  }, [highlightedNodeId, getDependencyNodes]);

  // 构建树形结构：支持多级嵌套（计算指标可以依赖其他计算指标）
  const treeData = useMemo(() => {
    const drivers = [];
    const computedNodes = [];

    Object.values(nodes).forEach(node => {
      if (node.type === 'driver') {
        drivers.push(node);
      } else {
        computedNodes.push(node);
      }
    });

    // 用于跟踪已访问的节点（检测共享节点）
    const visitedNodes = new Map();

    // 递归构建树节点
    const buildTreeNode = (node, visited = new Set()) => {
      if (visited.has(node.id)) {
        return { node, children: [], isCircular: true }; // 防止循环依赖
      }
      visited.add(node.id);

      // 检查是否是共享节点（之前已经访问过）
      const isShared = visitedNodes.has(node.id);
      if (!isShared) {
        visitedNodes.set(node.id, 1);
      } else {
        visitedNodes.set(node.id, visitedNodes.get(node.id) + 1);
      }

      const children = [];
      if (node.dependsOn) {
        node.dependsOn.forEach(depId => {
          const depNode = nodes[depId];
          if (depNode) {
            children.push(buildTreeNode(depNode, new Set(visited)));
          }
        });
      }
      return {
        node,
        children,
        isCollapsed: collapsedNodeIds.has(node.id),
        isShared // 标记是否为共享节点（第二次及以后出现）
      };
    };

    // 找到所有被依赖的节点 ID
    const allDepIds = new Set();
    computedNodes.forEach(computed => {
      if (computed.dependsOn) {
        computed.dependsOn.forEach(id => allDepIds.add(id));
      }
    });

    // 顶层计算指标：是计算指标，且没有被其他计算指标依赖
    const rootComputedNodes = computedNodes
      .filter(c => !allDepIds.has(c.id))
      .sort((a, b) => a.id.localeCompare(b.id)); // 按 ID 排序，确保顺序稳定

    // 独立的驱动因素：没有被任何计算指标依赖
    const independentDrivers = drivers.filter(d => !allDepIds.has(d.id));

    // 构建树
    const tree = rootComputedNodes.map(root => buildTreeNode(root));

    // 第二次遍历：标记所有共享节点（包括第一次出现的）
    // 如果一个节点被访问多次，所有出现都标记为共享
    const markAllShared = (treeItem) => {
      const { node, children, isCollapsed, isShared } = treeItem;

      // 如果这个节点被访问多次，或者子节点中有共享的
      const visitCount = visitedNodes.get(node.id) || 0;
      const shouldBeShared = visitCount > 1 || isShared;

      const processedChildren = children.map(markAllShared);

      return {
        node,
        children: processedChildren,
        isCollapsed,
        isShared: shouldBeShared
      };
    };

    const processedTree = tree.map(markAllShared);

    return {
      tree: processedTree,
      independentDrivers,
      totalNodes: Object.keys(nodes).length,
      totalDrivers: drivers.length,
      totalComputed: computedNodes.length,
      rootCount: rootComputedNodes.length,
      independentDriverCount: independentDrivers.length
    };
  }, [nodes, collapsedNodeIds]);

  // 搜索过滤 - 根据节点名称或 ID 过滤
  const filteredTreeData = useMemo(() => {
    if (!searchTerm.trim()) return treeData;

    const term = searchTerm.toLowerCase();

    // 递归检查节点是否匹配搜索条件
    const matchesSearch = (node) => {
      return node.name.toLowerCase().includes(term) ||
             node.id.toLowerCase().includes(term);
    };

    // 递归过滤树节点，保留匹配的节点及其父节点/子节点
    const filterTreeNode = (treeItem) => {
      const { node, children, isCollapsed } = treeItem;

      // 检查当前节点是否匹配
      const selfMatches = matchesSearch(node);

      // 递归过滤子节点
      const filteredChildren = children.map(filterTreeNode).filter(child => child !== null);

      // 如果自身匹配或有子节点匹配，保留该节点
      if (selfMatches || filteredChildren.length > 0) {
        return {
          node,
          children: filteredChildren,
          isCollapsed: selfMatches ? false : isCollapsed, // 如果父节点匹配，展开显示
          selfMatches
        };
      }
      return null;
    };

    // 过滤独立驱动因素
    const filteredIndependentDrivers = treeData.independentDrivers.filter(matchesSearch);

    // 过滤计算指标树
    const filteredTree = treeData.tree
      .map(filterTreeNode)
      .filter(item => item !== null);

    return {
      ...treeData,
      tree: filteredTree,
      independentDrivers: filteredIndependentDrivers,
      isSearchMode: true
    };
  }, [treeData, searchTerm]);

  // 处理节点点击
  const handleNodeClick = useCallback((nodeId, e) => {
    e.stopPropagation();
    onSelectNode(nodeId);
  }, [onSelectNode]);

  // 处理节点双击 - 中心定位节点
  const handleNodeDoubleClick = useCallback((nodeId, e) => {
    e.stopPropagation();
    if (onCenterNode) {
      onCenterNode(nodeId);
    }
  }, [onCenterNode]);

  // 处理展开/折叠
  const handleToggleCollapse = useCallback((nodeId, e) => {
    e.stopPropagation();
    onToggleCollapse(nodeId);
  }, [onToggleCollapse]);

  // 渲染节点行（支持递归）
  const renderNodeRow = (treeItem, level = 0) => {
    const node = treeItem.node;
    const children = treeItem.children || [];
    const isCollapsed = treeItem.isCollapsed;
    const isShared = treeItem.isShared || false;
    const hasChildren = children.length > 0;

    const isSelected = selectedNodeId === node.id;
    // isHighlighted = 当前高亮的节点本身（不是上下游）
    const isHighlighted = highlightedNodeId === node.id;
    // isAffected = 上游节点（驱动因素 - 绿色，计算指标 - 黄色）
    const isAffected = affectedNodeIds.has(node.id);
    // isDownstream = 下游节点（紫色）
    const isDownstream = downstreamNodeIds.has(node.id);
    // isDependency = 依赖节点（与 isAffected 相同）
    const isDependency = dependencyNodeIds.has(node.id);
    const isDriver = node.type === 'driver';

    // ========== 节点值计算 - 与 NodeCard 保持一致 ==========
    let nodeValue = node.value ?? 0;

    // ========== 目标值和差额计算 - 与 NodeCard 保持一致 ==========
    let displayBaseline;
    let changeAmount;
    let changePercent;

    if (!isDriver) {
      // 计算指标
      if (node.targetValue !== null && node.targetValue !== undefined && !isNaN(node.targetValue)) {
        displayBaseline = node.targetValue;
      } else if (node.baseline !== null && node.baseline !== undefined) {
        displayBaseline = node.baseline;
      } else {
        displayBaseline = 0;
      }
      if (displayBaseline === 0 && nodeValue !== 0) {
        displayBaseline = nodeValue;
      }
      changeAmount = nodeValue - displayBaseline;
      changePercent = displayBaseline !== 0 ? (changeAmount / displayBaseline) * 100 : null;
    } else {
      // 驱动因子
      let nodeBaseline = 0;
      if (node.targetValue !== null && node.targetValue !== undefined && !isNaN(node.targetValue)) {
        nodeBaseline = node.targetValue;
      } else if (node.baseline !== null && node.baseline !== undefined) {
        nodeBaseline = node.baseline;
      }
      displayBaseline = nodeBaseline;
      if (displayBaseline === 0 && nodeValue !== 0) {
        displayBaseline = nodeValue;
      }
      changeAmount = nodeValue - displayBaseline;
      changePercent = displayBaseline !== 0 ? (changeAmount / displayBaseline) * 100 : null;
    }

    // 与初始值的差额（用于显示变化和标记）
    const initialBaseline = node.initialBaseline ?? 0;
    const vsInitialAmount = initialBaseline !== null && initialBaseline !== 0 ? (nodeValue - initialBaseline) : 0;
    const vsInitialPercent = initialBaseline !== null && initialBaseline !== 0 ? (vsInitialAmount / initialBaseline) * 100 : 0;

    // 是否有变化（与节点卡片一致）
    const hasChanges = initialBaseline !== null && initialBaseline !== undefined && !isNaN(initialBaseline) && Math.abs(vsInitialAmount) > 0.0001;

    // 主数值颜色（与目标对比）
    const mainValueColorClass = getDiffColorClass(changeAmount, node.direction, node.name);

    // 背景色
    let bgColor = 'bg-white hover:bg-gray-50';
    if (isSelected) {
      bgColor = 'bg-blue-50 hover:bg-blue-50';
    } else if (isHighlighted) {
      bgColor = 'bg-blue-100 hover:bg-blue-100';
    } else if (isDownstream) {
      bgColor = 'bg-purple-50 hover:bg-purple-50';
    } else if (isAffected) {
      bgColor = isDriver ? 'bg-green-50 hover:bg-green-50' : 'bg-yellow-50 hover:bg-yellow-50';
    } else if (isDependency) {
      bgColor = isDriver ? 'bg-green-50 hover:bg-green-50' : 'bg-yellow-50 hover:bg-yellow-50';
    }

    // 左侧缩进
    const paddingLeft = level * 20 + 8;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-2 px-3 border-b border-gray-100 cursor-pointer ${bgColor} transition-colors`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={(e) => handleNodeClick(node.id, e)}
          onDoubleClick={(e) => handleNodeDoubleClick(node.id, e)}
        >
          {/* 展开/折叠按钮（有子节点时显示） */}
          {hasChildren && (
            <button
              onClick={(e) => handleToggleCollapse(node.id, e)}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 flex-shrink-0"
              title={isCollapsed ? '展开' : '折叠'}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          )}
          {!hasChildren && <div className="w-5 h-5" />}

          {/* 节点类型图标 */}
          <span className="text-sm flex-shrink-0">
            {isDriver ? '⚙️' : '📊'}
          </span>

          {/* 节点信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800 truncate">{node.name}</span>
              {isShared && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-600 flex-shrink-0" title="该节点在多处被引用">
                  🔗 共享
                </span>
              )}
              {hasChanges && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 animate-pulse flex-shrink-0">
                  ✨ 已修改
                </span>
              )}
            </div>

            {/* 数值信息 */}
            <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-gray-400">当前:</span>
                <span className={`font-mono font-medium ${mainValueColorClass}`}>
                  {formatValue(nodeValue, node.format, node.unit)}
                </span>
              </div>

              {initialBaseline !== null && initialBaseline !== 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-400">📍 初始:</span>
                  <span className="font-mono text-gray-600">
                    {formatValue(initialBaseline, node.format, node.unit)}
                  </span>
                  {hasChanges && (
                    <span className={`font-mono ${vsInitialAmount > 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                      ({vsInitialAmount > 0 ? '+' : ''}{formatValue(vsInitialAmount, node.format, node.unit)}
                      {vsInitialPercent !== null && ` ${vsInitialPercent > 0 ? '+' : ''}${vsInitialPercent.toFixed(1)}%`}
                      )
                    </span>
                  )}
                </div>
              )}

              {displayBaseline !== 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-400">🎯 目标:</span>
                  <span className="font-mono text-gray-600">
                    {formatValue(displayBaseline, node.format, node.unit)}
                  </span>
                  {Math.abs(changeAmount) > 0.0001 && (
                    <span className={`font-mono ${changeAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ({changeAmount > 0 ? '+' : ''}{formatValue(changeAmount, node.format, node.unit)}
                      {changePercent !== null && ` ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%`}
                      )
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 操作按钮：趋势图和因素分析 */}
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenTrendChart && onOpenTrendChart(node);
              }}
              className="text-gray-400 hover:text-blue-500 text-xs px-1.5 py-1 rounded hover:bg-blue-50 transition-colors"
              title="查看分月趋势"
            >
              📈
            </button>
            {!isDriver && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenWaterfallChart && onOpenWaterfallChart(node);
                }}
                className="text-gray-400 hover:text-purple-500 text-xs px-1.5 py-1 rounded hover:bg-purple-50 transition-colors"
                title="查看因素分析"
              >
                📊
              </button>
            )}
          </div>
        </div>

        {/* 渲染子节点 */}
        {hasChildren && !isCollapsed && (
          <div className="border-l-2 border-gray-100 ml-2">
            {children.map(child => renderNodeRow(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex flex-col bg-white shadow-xl border border-gray-200 rounded-lg overflow-hidden"
      style={{
        position: 'absolute',
        left: panelPosition.x,
        top: panelPosition.y,
        width: panelSize.width,
        height: isMinimized ? 'auto' : panelSize.height,
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onClick={onBringToFront}
    >
      {/* 头部栏 - 可拖动 */}
      <div
        className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-between select-none"
        style={{ cursor: 'grab', minHeight: '40px' }}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 flex-1">
          <h2 className="text-sm font-semibold text-white">📋 节点列表</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
            className="text-white hover:bg-white/20 rounded p-1"
            title={isMinimized ? '展开' : '最小化'}
          >
            {isMinimized ? '🔼' : '🔽'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-white hover:bg-white/20 rounded p-1"
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 搜索框和统计信息（仅在展开时显示） */}
      {!isMinimized && (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          {/* 搜索框 */}
          <div className="relative mb-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索节点名称或 ID..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pl-8"
            />
            <span className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
              🔍
            </span>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                title="清除搜索"
              >
                ✕
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500">
            共 {treeData.totalNodes} 个节点 | 📊 计算指标：{treeData.totalComputed} 个（顶层 {treeData.rootCount} 个）| ⚙️ 驱动因素：{treeData.totalDrivers} 个（独立 {treeData.independentDriverCount} 个）
          </p>
        </div>
      )}

      {/* 节点树 */}
      {!isMinimized && (
        <div className="flex-1 overflow-y-auto">
        {/* 独立的驱动因素 */}
        {filteredTreeData.independentDrivers.length > 0 && (
          <div className="py-2">
            <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-100">
              独立驱动因素
            </div>
            {filteredTreeData.independentDrivers.map(driver => renderNodeRow({ node: driver, children: [] }))}
          </div>
        )}

        {/* 计算指标树 */}
        {filteredTreeData.tree.length > 0 && (
          <div className="py-2">
            <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-100">
              计算指标 {filteredTreeData.isSearchMode && `(搜索：${searchTerm})`}
            </div>
            {filteredTreeData.tree.map(item => renderNodeRow(item))}
          </div>
        )}

        {/* 搜索无结果提示 */}
        {filteredTreeData.tree.length === 0 && filteredTreeData.independentDrivers.length === 0 && searchTerm && (
          <div className="py-8 text-center text-gray-500 text-sm">
            🔍 未找到匹配的节点
            <button
              onClick={() => setSearchTerm('')}
              className="ml-2 text-blue-600 hover:text-blue-800"
            >
              清除搜索
            </button>
          </div>
        )}
        </div>
      )}

      {/* 右下角调整大小手柄 */}
      {!isMinimized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize text-gray-400 hover:text-gray-600 select-none"
          onMouseDown={(e) => {
            e.stopPropagation();
            handleResizeStart(e);
          }}
          title="拖拽调整大小"
        >
          ◢
        </div>
      )}
    </div>
  );
};

export default NodeTreeList;
