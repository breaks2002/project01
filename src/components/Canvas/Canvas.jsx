import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import NodeCard from './NodeCard';
import D3Graph from './D3Graph';
import useVDTStore from '../../store/useVDTStore';

const Canvas = ({
  nodes,
  allNodes,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onMonthValueChange,
  onDeleteNode,
  onUpdateNodePosition,
  onEditNode,
  onResizeNode,
  onOpenTrendChart,
  onOpenWaterfallChart,
  scale = 1,
  canvasRef
}) => {
  const [draggingNode, setDraggingNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggingPosition, setDraggingPosition] = useState(null); // 拖拽时的实时位置（本地状态）
  const [frontNodeId, setFrontNodeId] = useState(null);
  const internalCanvasRef = useRef(null);
  const containerRef = useRef(null);

  // 使用传入的 ref 或内部 ref
  const canvasRefToUse = canvasRef || internalCanvasRef;
  const collapsedNodeIds = useVDTStore(s => s.collapsedNodeIds);
  const toggleCollapse = useVDTStore(s => s.toggleCollapse);
  const highlightedNodeId = useVDTStore(s => s.highlightedNodeId);
  const setHighlightedNode = useVDTStore(s => s.setHighlightedNode);
  const getAffectedNodes = useVDTStore(s => s.getAffectedNodes);
  const getDownstreamNodes = useVDTStore(s => s.getDownstreamNodes);
  const getDependencyNodes = useVDTStore(s => s.getDependencyNodes);

  // 计算可见的节点
  const visibleNodes = useMemo(() => {
    const result = {};

    // 递归获取所有被折叠节点隐藏的子节点
    const hiddenNodeIds = new Set();

    // 先收集所有被折叠的计算指标
    const collectHidden = (startId) => {
      const node = nodes[startId];
      if (!node) return;
      // 收集这个节点的所有依赖
      if (node.dependsOn) {
        node.dependsOn.forEach(depId => {
          if (!hiddenNodeIds.has(depId)) {
            hiddenNodeIds.add(depId);
            collectHidden(depId); // 递归
          }
        });
      }
    };

    collapsedNodeIds.forEach(id => collectHidden(id));

    // 所有节点都可见，除了被隐藏的依赖节点
    Object.entries(nodes).forEach(([id, node]) => {
      if (!hiddenNodeIds.has(id)) {
        result[id] = node;
      }
    });

    return result;
  }, [nodes, collapsedNodeIds]);

  // 计算受影响的节点（上游）和下游节点
  const affectedNodeIds = useMemo(() => {
    return getAffectedNodes(highlightedNodeId);
  }, [highlightedNodeId, getAffectedNodes]);

  const downstreamNodeIds = useMemo(() => {
    return getDownstreamNodes(highlightedNodeId);
  }, [highlightedNodeId, getDownstreamNodes]);

  const dependencyNodeIds = useMemo(() => {
    return getDependencyNodes(highlightedNodeId);
  }, [highlightedNodeId, getDependencyNodes]);

  // 处理节点点击 - 同时处理选中和高亮
  const handleNodeClick = useCallback((nodeId) => {
    // 如果点击同一个节点，清除高亮；否则设置高亮
    if (highlightedNodeId === nodeId) {
      setHighlightedNode(null);
    } else {
      setHighlightedNode(nodeId);
    }
    // 仍然保持原来的选中行为
    onSelectNode(nodeId);
  }, [highlightedNodeId, setHighlightedNode, onSelectNode]);

  // 节点拖动开始
  const handleNodeMouseDown = useCallback((nodeId, e) => {
    const node = visibleNodes[nodeId];
    if (!node) return;

    setDraggingNode(nodeId);
    setDraggingPosition({ x: node.position?.x || 0, y: node.position?.y || 0 });
    setDragOffset({
      x: e.clientX,
      y: e.clientY
    });
    e.preventDefault();
    e.stopPropagation();
  }, [visibleNodes]);

  // 网格大小
  const GRID_SIZE = 20;

  // 计算显示用的节点（包含拖拽时的实时位置）
  const displayNodes = useMemo(() => {
    const result = {};
    Object.values(visibleNodes).forEach(node => {
      const isDraggingCurrent = draggingNode === node.id;
      if (isDraggingCurrent && draggingPosition) {
        result[node.id] = { ...node, position: draggingPosition };
      } else {
        result[node.id] = node;
      }
    });
    return result;
  }, [visibleNodes, draggingNode, draggingPosition]);

  // 鼠标移动 - 使用 transform 实现顺滑拖拽，不频繁更新 store
  const handleMouseMove = useCallback((e) => {
    if (!draggingNode) return;

    const node = visibleNodes[draggingNode];
    if (!node) return;

    // 计算相对于起始位置的偏移
    const deltaX = (e.clientX - dragOffset.x) / scale;
    const deltaY = (e.clientY - dragOffset.y) / scale;

    // 新的位置（对齐网格）
    const newX = Math.round(((node.position?.x || 0) + deltaX) / GRID_SIZE) * GRID_SIZE;
    const newY = Math.round(((node.position?.y || 0) + deltaY) / GRID_SIZE) * GRID_SIZE;

    // 只更新本地状态，不触发 store 更新
    setDraggingPosition({ x: newX, y: newY });
  }, [draggingNode, dragOffset, visibleNodes, scale]);

  // 鼠标释放 - 拖拽结束时才更新 store
  const handleMouseUp = useCallback(() => {
    if (draggingNode && draggingPosition) {
      const node = visibleNodes[draggingNode];
      if (node) {
        const finalX = draggingPosition.x;
        const finalY = draggingPosition.y;
        // 只有位置真正改变时才更新
        if (finalX !== node.position?.x || finalY !== node.position?.y) {
          onUpdateNodePosition(draggingNode, { x: finalX, y: finalY });
        }
      }
    }
    setDraggingNode(null);
    setDraggingPosition(null);
  }, [draggingNode, draggingPosition, visibleNodes, onUpdateNodePosition]);

  // 把事件绑定到 window，确保拖动更顺滑
  useEffect(() => {
    if (draggingNode) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNode, handleMouseMove, handleMouseUp]);

  const handleCanvasClick = useCallback((e) => {
    // 检查点击的是否是节点或连线，如果是则不取消选中
    const clickedOnNode = e.target.closest('[data-node-id]');
    const clickedOnEdge = e.target.tagName === 'path' || e.target.tagName === 'line' || e.target.tagName === 'circle';

    if (!clickedOnNode && !clickedOnEdge) {
      onSelectNode(null);
      setHighlightedNode(null);
    }
  }, [onSelectNode, setHighlightedNode]);

  // 将节点置顶
  const bringNodeToFront = useCallback((nodeId) => {
    setFrontNodeId(nodeId);
  }, []);

  // 处理 Ctrl + 滚轮缩放
  const handleWheel = useCallback((e) => {
    // 由父组件处理缩放
  }, []);

  return (
    <div
      id="vdt-canvas-scroll-container"
      ref={containerRef}
      className="absolute inset-0 bg-gray-50 overflow-auto"
      onWheel={handleWheel}
    >
      <div
        ref={canvasRefToUse}
        id="vdt-canvas-inner"
        className="relative"
        style={{
          width: 6000,
          height: 4000,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
        onClick={handleCanvasClick}
      >
        {/* 网格背景 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
        />

        {/* 连线层 - zIndex:5 确保在节点后面但在网格上面 */}
        <D3Graph
          nodes={displayNodes}
          scale={scale}
          highlightedNodeId={highlightedNodeId}
          affectedNodeIds={affectedNodeIds}
          downstreamNodeIds={downstreamNodeIds}
        />

        {/* 节点卡片层 */}
        {Object.values(visibleNodes).map((node) => {
          const isDraggingCurrent = draggingNode === node.id;
          const displayNode = displayNodes[node.id];

          return (
            <NodeCard
              key={node.id}
              node={displayNode}
              allNodes={allNodes}
              isSelected={selectedNodeId === node.id}
              isDragging={isDraggingCurrent}
              onSelect={handleNodeClick}
              onValueChange={onUpdateNode}
              onMonthValueChange={onMonthValueChange}
              onDelete={onDeleteNode}
              onEdit={onEditNode}
              onResize={onResizeNode}
              onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
              isCollapsed={collapsedNodeIds.has(node.id)}
              onToggleCollapse={() => toggleCollapse(node.id)}
              isHighlighted={highlightedNodeId === node.id}
              isAffected={affectedNodeIds.has(node.id)}
              isDownstream={downstreamNodeIds.has(node.id)}
              isDependency={dependencyNodeIds.has(node.id)}
              onOpenTrendChart={onOpenTrendChart}
              onOpenWaterfallChart={onOpenWaterfallChart}
              onBringNodeToFront={() => bringNodeToFront(node.id)}
              isFront={frontNodeId === node.id}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Canvas;
