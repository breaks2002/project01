import React, { useCallback, useMemo, useState, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, ReferenceArea } from 'recharts';

/**
 * 标准差分析散点图
 * 象限定义（与 StdDevCalculator 一致）：
 * - 理想区 (IV)：cvA ≤ A 且 cvB ≤ B（绿色）- 左下
 * - 稳定区 (III)：cvA ≤ A 且 cvB > B（蓝色）- 左上
 * - 风险区 (II)：cvA > A 且 cvB ≤ B（黄色）- 右下
 * - 改进区 (I)：cvA > A 且 cvB > B（红色）- 右上
 * 注意：Recharts Y轴从左下角向上增加
 */
const StdDevScatterChart = ({
  data,
  thresholds,
  onThresholdDragEnd,
  onNodeClick,
  width = '100%',
  height = 600
}) => {
  const [isDraggingThreshold, setIsDraggingThreshold] = useState(null);
  const chartContainerRef = useRef(null);

  // 过滤掉数据不足的节点
  const validData = useMemo(() => {
    return data.filter(d => !d.isInsufficient);
  }, [data]);

  // 计算数据范围，确保包含阈值
  const chartDomain = useMemo(() => {
    if (validData.length === 0) {
      return {
        x: [0, Math.max(0.5, thresholds.A * 2)],
        y: [0, Math.max(0.5, thresholds.B * 2)]
      };
    }
    const maxA = Math.max(...validData.map(d => d.cvA), thresholds.A * 2);
    const maxB = Math.max(...validData.map(d => d.cvB), thresholds.B * 2);
    return {
      x: [0, Math.max(maxA, 0.1)],
      y: [0, Math.max(maxB, 0.1)]
    };
  }, [validData, thresholds]);

  // 自定义符号渲染，添加偏移来避免重叠
  const renderCustomSymbol = useCallback((props) => {
    const { cx, cy, payload, index } = props;
    if (!cx || !cy) return null;

    console.log('[StdDevScatterChart] renderCustomSymbol payload:', payload);

    // 注意：payload 在这里是散点数据项本身，不是 { payload: ... }
    const dataItem = payload;
    const visual = dataItem?.visual;

    if (!visual) {
      console.log('[StdDevScatterChart] No visual property found!');
      return (
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill="#9ca3af"
        />
      );
    }

    const { color, symbol, fill } = visual;
    const size = 8;
    const isLight = fill === 'light';

    console.log('[StdDevScatterChart] Rendering symbol:', { symbol, color, fill, isLight });

    // 根据索引添加微小偏移，避免完全重叠的点
    const offsetAngle = (index * 45) * Math.PI / 180;
    const offsetDistance = (index % 4) * 3;
    const offsetX = Math.cos(offsetAngle) * offsetDistance;
    const offsetY = Math.sin(offsetAngle) * offsetDistance;

    const finalCx = cx + offsetX;
    const finalCy = cy + offsetY;

    // 绘制符号
    switch (symbol) {
      case 'triangle':
        return (
          <path
            d={`M${finalCx},${finalCy - size} L${finalCx + size},${finalCy + size} L${finalCx - size},${finalCy + size} Z`}
            fill={color}
            fillOpacity={isLight ? 0.4 : 0.9}
            stroke={color}
            strokeWidth={2}
          />
        );
      case 'square':
        return (
          <path
            d={`M${finalCx - size},${finalCy - size} L${finalCx + size},${finalCy - size} L${finalCx + size},${finalCy + size} L${finalCx - size},${finalCy + size} Z`}
            fill={color}
            fillOpacity={isLight ? 0.4 : 0.9}
            stroke={color}
            strokeWidth={2}
          />
        );
      case 'diamond':
        return (
          <path
            d={`M${finalCx},${finalCy - size} L${finalCx + size},${finalCy} L${finalCx},${finalCy + size} L${finalCx - size},${finalCy} Z`}
            fill={color}
            fillOpacity={isLight ? 0.4 : 0.9}
            stroke={color}
            strokeWidth={2}
          />
        );
      case 'circle':
      default:
        return (
          <circle
            cx={finalCx}
            cy={finalCy}
            r={size}
            fill={color}
            fillOpacity={isLight ? 0.4 : 0.9}
            stroke={color}
            strokeWidth={2}
          />
        );
    }
  }, []);

  // 阈值拖动开始
  const handleThresholdMouseDown = useCallback((axis) => {
    setIsDraggingThreshold(axis);
  }, []);

  // 阈值拖动结束
  const handleThresholdMouseUp = useCallback(() => {
    setIsDraggingThreshold(null);
  }, []);

  // 自定义 Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg text-xs">
          <p className="font-semibold text-gray-800 mb-1">{data.nodeName}</p>
          <p className="text-gray-600">方案：{data.scenarioName || data.scenarioId}</p>
          <p className="text-gray-600">版本：{data.isInitialVersion ? '初始' : '当前'}</p>
          <p className="text-gray-600">A (波动性): {data.cvA?.toFixed(4)}</p>
          <p className="text-gray-600">B (偏离度): {data.cvB?.toFixed(4)}</p>
          <p className="text-gray-600">象限：{data.quadrant?.name}</p>
          <p className="text-gray-600 mt-1 font-medium">{data.insight?.title}</p>
        </div>
      );
    }
    return null;
  };

  if (validData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        暂无数据，请调整配置或导入数据
      </div>
    );
  }

  const [xMin, xMax] = chartDomain.x;
  const [yMin, yMax] = chartDomain.y;
  const { A: thresholdA, B: thresholdB } = thresholds;

  return (
    <div className="relative" style={{ width, height: height === '100%' ? '100%' : height, minHeight: '500px' }} ref={chartContainerRef}>
      {/* 四象限标签 - 放到四个角，更大气 */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
        {/* I 改进区 - 右上角 */}
        <div
          className="absolute text-2xl font-bold"
          style={{
            right: '20px',
            top: '20px',
            color: '#991b1b',
            textShadow: '0 1px 2px rgba(255,255,255,0.8)'
          }}
        >
          I 改进区
        </div>
        {/* II 风险区 - 右下角 */}
        <div
          className="absolute text-2xl font-bold"
          style={{
            right: '20px',
            bottom: '20px',
            color: '#92400e',
            textShadow: '0 1px 2px rgba(255,255,255,0.8)'
          }}
        >
          II 风险区
        </div>
        {/* III 稳定区 - 左上角 */}
        <div
          className="absolute text-2xl font-bold"
          style={{
            left: '20px',
            top: '20px',
            color: '#1e40af',
            textShadow: '0 1px 2px rgba(255,255,255,0.8)'
          }}
        >
          III 稳定区
        </div>
        {/* IV 理想区 - 左下角 */}
        <div
          className="absolute text-2xl font-bold"
          style={{
            left: '20px',
            bottom: '20px',
            color: '#065f46',
            textShadow: '0 1px 2px rgba(255,255,255,0.8)'
          }}
        >
          IV 理想区
        </div>
      </div>

      <ResponsiveContainer>
        <ScatterChart
          margin={{ top: 60, right: 60, bottom: 70, left: 80 }}
        >
          {/* 四象限背景 - 修正Y轴方向，更大气 */}
          {/* 理想区：cvA ≤ A 且 cvB ≤ B（绿色）- 左下 */}
          <ReferenceArea
            x1={xMin}
            x2={thresholdA}
            y1={yMin}
            y2={thresholdB}
            fill="#dcfce7"
            fillOpacity={0.5}
          />
          {/* 稳定区：cvA ≤ A 且 cvB > B（蓝色）- 左上 */}
          <ReferenceArea
            x1={xMin}
            x2={thresholdA}
            y1={thresholdB}
            y2={yMax}
            fill="#dbeafe"
            fillOpacity={0.5}
          />
          {/* 风险区：cvA > A 且 cvB ≤ B（黄色）- 右下 */}
          <ReferenceArea
            x1={thresholdA}
            x2={xMax}
            y1={yMin}
            y2={thresholdB}
            fill="#fef9c3"
            fillOpacity={0.5}
          />
          {/* 改进区：cvA > A 且 cvB > B（红色）- 右上 */}
          <ReferenceArea
            x1={thresholdA}
            x2={xMax}
            y1={thresholdB}
            y2={yMax}
            fill="#fee2e2"
            fillOpacity={0.5}
          />

          {/* 坐标轴 - 更大气 */}
          <XAxis
            type="number"
            dataKey="cvA"
            name="波动性 (CV)"
            domain={chartDomain.x}
            tickFormatter={(value) => value.toFixed(2)}
            label={{
              value: 'A: 波动性 (变异系数)',
              position: 'insideBottom',
              offset: -15,
              className: 'text-sm fill-gray-700 font-medium'
            }}
            tick={{ className: 'text-sm' }}
            axisLine={{ stroke: '#6b7280', strokeWidth: 2 }}
            tickLine={{ stroke: '#9ca3af' }}
          />
          <YAxis
            type="number"
            dataKey="cvB"
            name="偏离度 (CV)"
            domain={chartDomain.y}
            tickFormatter={(value) => value.toFixed(2)}
            label={{
              value: 'B: 目标偏离度 (变异系数)',
              angle: -90,
              position: 'insideLeft',
              offset: -15,
              className: 'text-sm fill-gray-700 font-medium'
            }}
            tick={{ className: 'text-sm' }}
            axisLine={{ stroke: '#6b7280', strokeWidth: 2 }}
            tickLine={{ stroke: '#9ca3af' }}
          />

          {/* 阈值线 - 更醒目 */}
          <ReferenceLine
            x={thresholds.A}
            stroke="#4b5563"
            strokeDasharray="5 5"
            strokeWidth={2.5}
          />
          <ReferenceLine
            y={thresholds.B}
            stroke="#4b5563"
            strokeDasharray="5 5"
            strokeWidth={2.5}
          />

          {/* 散点 */}
          <Scatter
            data={validData}
            onClick={(node) => onNodeClick?.(node)}
            style={{ cursor: 'pointer' }}
            shape={(props) => {
              // 找到对应的数据项
              const dataIndex = props.index;
              const entry = validData[dataIndex];
              return renderCustomSymbol({ ...props, payload: entry, index: dataIndex });
            }}
          />

          {/* Tooltip */}
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
        </ScatterChart>
      </ResponsiveContainer>

      {/* 阈值拖动提示 */}
      {isDraggingThreshold && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-3 py-1 rounded text-xs">
          拖动调整阈值，松开应用
        </div>
      )}
    </div>
  );
};

export default StdDevScatterChart;
