import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const D3Graph = ({ nodes, scale = 1, highlightedNodeId = null, affectedNodeIds = new Set(), downstreamNodeIds = new Set() }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !nodes) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const nodeMap = {};
    Object.values(nodes).forEach((node) => {
      nodeMap[node.id] = node;
    });

    const links = [];
    Object.values(nodes).forEach((node) => {
      if (node.dependsOn && node.dependsOn.length > 0) {
        node.dependsOn.forEach((depId) => {
          if (nodeMap[depId]) {
            links.push({
              source: nodeMap[depId],
              target: node,
              sourceId: depId,
              targetId: node.id
            });
          }
        });
      }
    });

    // 创建普通箭头
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#94a3b8');

    // 创建高亮箭头（蓝色 - 上游）
    svg.append('defs').append('marker')
      .attr('id', 'arrow-highlight')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#3b82f6');

    // 创建下游高亮箭头（紫色 - 下游）
    svg.append('defs').append('marker')
      .attr('id', 'arrow-downstream')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#8b5cf6');

    // 判断连线是否需要高亮（上游 - 蓝色）
    const isLinkHighlighted = (link) => {
      if (!highlightedNodeId) return false;
      // 高亮规则（affectedNodeIds 是上游节点）：
      // 从上游节点指向点击节点的连线，或上游节点之间的连线
      const isTargetInPath = link.targetId === highlightedNodeId || affectedNodeIds.has(link.targetId);
      const isSourceInPath = link.sourceId === highlightedNodeId || affectedNodeIds.has(link.sourceId);
      return isSourceInPath && isTargetInPath;
    };

    // 判断连线是否需要高亮（下游 - 紫色）
    const isLinkDownstream = (link) => {
      if (!highlightedNodeId) return false;
      if (isLinkHighlighted(link)) return false; // 上游连线优先
      // 高亮规则（downstreamNodeIds 是下游节点）：
      // 从点击节点指向下游节点的连线，或下游节点之间的连线
      const isTargetInPath = link.targetId === highlightedNodeId || downstreamNodeIds.has(link.targetId);
      const isSourceInPath = link.sourceId === highlightedNodeId || downstreamNodeIds.has(link.sourceId);
      return isSourceInPath && isTargetInPath;
    };

    svg.selectAll('.link')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', (d) => {
        if (isLinkHighlighted(d)) return '#3b82f6'; // 蓝色 - 上游
        if (isLinkDownstream(d)) return '#8b5cf6'; // 紫色 - 下游
        return '#94a3b8'; // 灰色 - 普通
      })
      .attr('stroke-width', (d) => {
        if (isLinkHighlighted(d)) return 4;
        if (isLinkDownstream(d)) return 4;
        return 2;
      })
      .attr('marker-end', (d) => {
        if (isLinkHighlighted(d)) return 'url(#arrow-highlight)';
        if (isLinkDownstream(d)) return 'url(#arrow-downstream)';
        return 'url(#arrow)';
      })
      .attr('opacity', (d) => highlightedNodeId && !isLinkHighlighted(d) && !isLinkDownstream(d) ? 0.2 : 1)
      .style('transition', 'stroke 0.3s, stroke-width 0.3s, opacity 0.3s')
      .attr('d', (d) => {
        const sourcePos = d.source.position || { x: 0, y: 0 };
        const targetPos = d.target.position || { x: 0, y: 0 };

        // 获取节点实际尺寸
        const sourceWidth = d.source.size?.width || 520;
        const sourceHeight = d.source.size?.height || 180;
        const targetWidth = d.target.size?.width || 520;
        const targetHeight = d.target.size?.height || 180;

        const sourceH = typeof sourceHeight === 'number' ? sourceHeight : 180;
        const targetH = typeof targetHeight === 'number' ? targetHeight : 180;

        // 计算中心点
        const sourceCenterX = sourcePos.x + sourceWidth / 2;
        const sourceCenterY = sourcePos.y + sourceH / 2;
        const targetCenterX = targetPos.x + targetWidth / 2;
        const targetCenterY = targetPos.y + targetH / 2;

        const dx = targetCenterX - sourceCenterX;
        const dy = targetCenterY - sourceCenterY;

        let x1, y1, x2, y2;

        // 判断相对位置，优先使用水平方向，如果水平接近则用垂直方向
        if (Math.abs(dx) > Math.abs(dy) * 0.5) {
          // 水平方向为主
          if (sourceCenterX < targetCenterX) {
            // 源在左边：从源右边连到目标左边
            x1 = sourcePos.x + sourceWidth;
            y1 = sourceCenterY;
            x2 = targetPos.x;
            y2 = targetCenterY;
          } else {
            // 源在右边：从源左边连到目标右边
            x1 = sourcePos.x;
            y1 = sourceCenterY;
            x2 = targetPos.x + targetWidth;
            y2 = targetCenterY;
          }
        } else {
          // 垂直方向为主
          if (sourceCenterY < targetCenterY) {
            // 源在上边：从源下边连到目标上边
            x1 = sourceCenterX;
            y1 = sourcePos.y + sourceH;
            x2 = targetCenterX;
            y2 = targetPos.y;
          } else {
            // 源在下边：从源上边连到目标下边
            x1 = sourceCenterX;
            y1 = sourcePos.y;
            x2 = targetCenterX;
            y2 = targetPos.y + targetH;
          }
        }

        // 贝塞尔曲线控制点 - 根据方向调整
        let cx1, cy1, cx2, cy2;

        if (Math.abs(dx) > Math.abs(dy) * 0.5) {
          // 水平方向：使用 S 形曲线
          const curveDx = x2 - x1;
          cx1 = x1 + curveDx * 0.5;
          cy1 = y1;
          cx2 = x1 + curveDx * 0.5;
          cy2 = y2;
        } else {
          // 垂直方向：使用更自然的曲线
          const curveDy = y2 - y1;
          cx1 = x1;
          cy1 = y1 + curveDy * 0.5;
          cx2 = x2;
          cy2 = y1 + curveDy * 0.5;
        }

        return 'M ' + x1 + ' ' + y1 + ' C ' + cx1 + ' ' + cy1 + ', ' + cx2 + ' ' + cy2 + ', ' + x2 + ' ' + y2;
      });

  }, [nodes, scale, highlightedNodeId, affectedNodeIds, downstreamNodeIds]);

  return (
    <svg
      ref={svgRef}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: 6000, height: 4000, zIndex: 1 }}
    />
  );
};

export default D3Graph;
