import React, { useMemo } from 'react';
import { formatValue, getDiffColorClass, isPositiveIndicator } from '../../utils/formatters';
import { FormulaParser } from '../../engine/FormulaParser';

const MonthDetailTable = ({ nodes, onExportExcel }) => {
  // 按 node.id 去重，防止重复渲染
  const uniqueNodes = {};
  Object.values(nodes).forEach(node => {
    if (node && node.id) {
      uniqueNodes[node.id] = node;
    }
  });
  const nodeList = Object.values(uniqueNodes);

  if (nodeList.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        暂无数据，请先导入或创建节点
      </div>
    );
  }

  // 收集所有月份标签，解析并去重排序
  const monthData = new Map(); // key: 月份(如"1月"), value: { actual: "1月实际", forecast: "1月预测", target: "1月目标" }

  nodeList.forEach(node => {
    if (node.timeData) {
      Object.keys(node.timeData).forEach(key => {
        // 解析月份和类型：格式如"1月实际"、"1月预测"、"1月目标"
        const match = key.match(/^(\d+月)(实际|预测|目标)$/);
        if (match) {
          const month = match[1];
          const type = match[2];
          if (!monthData.has(month)) {
            monthData.set(month, { actual: null, forecast: null, target: null });
          }
          monthData.get(month)[type === '实际' ? 'actual' : type === '预测' ? 'forecast' : 'target'] = key;
        }
      });
    }
  });

  // 排序月份
  const sortedMonths = Array.from(monthData.keys()).sort((a, b) => {
    const monthA = parseInt(a);
    const monthB = parseInt(b);
    return monthA - monthB;
  });

  // 格式化数值（不带单位）
  const formatNumber = (value, format) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '-';
    }

    let formatted = value;

    if (format.includes('#,##0')) {
      formatted = value.toLocaleString('zh-CN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0
      });
    } else if (format.includes('0.00')) {
      formatted = value.toFixed(2);
    } else if (format.includes('0%')) {
      // 百分比格式，直接显示数值
      formatted = value.toFixed(1);
    } else {
      formatted = Number(value).toLocaleString('zh-CN', {
        maximumFractionDigits: 2
      });
    }

    return formatted;
  };

  // 获取差额箭头符号
  const getDiffArrow = (diff, node) => {
    if (diff === null || diff === undefined || isNaN(diff) || Math.abs(diff) < 0.0001) {
      return '';
    }
    const isPositive = node.direction === 'positive' ||
      (node.direction === 'auto' && isPositiveIndicator(node.name));
    const isPositiveDiff = diff > 0;
    if ((isPositive && isPositiveDiff) || (!isPositive && !isPositiveDiff)) {
      return '↑';
    } else {
      return '↓';
    }
  };

  // 计算每个节点的初始月度值（用于差额对比）
  const getNodeInitialMonthValue = (node, monthKey) => {
    if (!node.originalTimeData) return null;
    if (node.originalTimeData[monthKey] !== undefined && node.originalTimeData[monthKey] !== null) {
      return node.originalTimeData[monthKey];
    }
    return null;
  };

  // 构建导出数据
  const getExportData = () => {
    const data = [];

    // 构建表头
    const header = ['指标名称', '指标ID', '单位', '月份'];
    sortedMonths.forEach(month => {
      header.push(`${month}实际`);
      header.push(`${month}预测`);
      header.push(`${month}目标`);
      header.push(`${month}差额(vs初始)`);
      header.push(`${month}差额%(vs初始)`);
      header.push(`${month}差额(vs目标)`);
      header.push(`${month}差额%(vs目标)`);
    });
    data.push(header);

    // 数据行
    nodeList.forEach(node => {
      const row = [node.name, node.id, node.unit || '', ''];

      sortedMonths.forEach(month => {
        const types = monthData.get(month);
        const actualValue = types.actual ? node.timeData?.[types.actual] : null;
        const forecastValue = types.forecast ? node.timeData?.[types.forecast] : null;
        const targetValue = types.target ? node.timeData?.[types.target] : null;

        // 当前值：预测值优先，无预测用实际值
        const currentValue = forecastValue !== null && forecastValue !== undefined ? forecastValue : actualValue;

        // vs 初始值差额
        const initialValue = getNodeInitialMonthValue(node, types.forecast || types.actual);
        let diffVsInitial = null;
        let diffPercentVsInitial = null;
        if (currentValue !== null && currentValue !== undefined && initialValue !== null && initialValue !== undefined) {
          diffVsInitial = currentValue - initialValue;
          if (initialValue !== 0) {
            diffPercentVsInitial = (diffVsInitial / initialValue) * 100;
          }
        }

        // vs 目标值差额
        let diffVsTarget = null;
        let diffPercentVsTarget = null;
        if (currentValue !== null && currentValue !== undefined && targetValue !== null && targetValue !== undefined) {
          diffVsTarget = currentValue - targetValue;
          if (targetValue !== 0) {
            diffPercentVsTarget = (diffVsTarget / targetValue) * 100;
          }
        }

        row.push(actualValue !== null && actualValue !== undefined ? actualValue : '');
        row.push(forecastValue !== null && forecastValue !== undefined ? forecastValue : '');
        row.push(targetValue !== null && targetValue !== undefined ? targetValue : '');
        row.push(diffVsInitial !== null ? diffVsInitial : '');
        row.push(diffPercentVsInitial !== null ? diffPercentVsInitial.toFixed(2) + '%' : '');
        row.push(diffVsTarget !== null ? diffVsTarget : '');
        row.push(diffPercentVsTarget !== null ? diffPercentVsTarget.toFixed(2) + '%' : '');
      });

      data.push(row);
    });

    return data;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h4 className="text-sm font-medium text-gray-700">月份明细数据</h4>
        {onExportExcel && (
          <button
            onClick={() => onExportExcel(getExportData(), '数据面板_月份明细表')}
            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
          >
            <span>📥</span>
            导出Excel
          </button>
        )}
      </div>
      <div className="border border-gray-200 rounded flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-100 sticky top-0 z-30">
              <tr>
                <th rowSpan={2} className="w-52 px-2 py-1.5 text-left font-medium text-gray-700 border-r border-gray-200 whitespace-nowrap bg-gray-100 sticky left-0 z-40">
                  指标名称
                </th>
                <th rowSpan={2} className="w-32 px-2 py-1.5 text-left font-medium text-gray-700 border-r border-gray-200 whitespace-nowrap bg-gray-100">
                  指标ID
                </th>
                <th rowSpan={2} className="w-20 px-2 py-1.5 text-center font-medium text-gray-700 border-r border-gray-200 whitespace-nowrap bg-gray-100">
                  单位
                </th>
                {sortedMonths.map(month => (
                  <th key={month} colSpan={7} className="px-2 py-1.5 text-center font-medium text-gray-700 border-b border-r border-gray-200 bg-gray-100">
                    {month}
                  </th>
                ))}
              </tr>
              <tr>
                {sortedMonths.map(month => (
                  <React.Fragment key={month + "-cols"}>
                    <th className="w-20 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      实际
                    </th>
                    <th className="w-20 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      预测
                    </th>
                    <th className="w-20 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      目标
                    </th>
                    <th className="w-24 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      差额(初)
                    </th>
                    <th className="w-20 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      差额%(初)
                    </th>
                    <th className="w-24 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      差额(目)
                    </th>
                    <th className="w-20 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      差额%(目)
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {nodeList.map(node => (
                <tr key={node.id} className="hover:bg-gray-50">
                  <td className="w-52 px-2 py-1.5 text-sm text-gray-900 border-r border-gray-200 font-medium sticky left-0 bg-white z-10 whitespace-nowrap">
                    {node.name}
                  </td>
                  <td className="w-32 px-2 py-1.5 text-sm text-gray-500 border-r border-gray-200 font-mono whitespace-nowrap">
                    {node.id}
                  </td>
                  <td className="w-20 px-2 py-1.5 text-sm text-gray-500 border-r border-gray-200 text-center whitespace-nowrap">
                    {node.unit || '-'}
                  </td>
                  {sortedMonths.map(month => {
                    const types = monthData.get(month);
                    const actualValue = types.actual ? node.timeData?.[types.actual] : null;
                    const forecastValue = types.forecast ? node.timeData?.[types.forecast] : null;
                    const targetValue = types.target ? node.timeData?.[types.target] : null;

                    // 当前值：预测值优先，无预测用实际值
                    const currentValue = forecastValue !== null && forecastValue !== undefined ? forecastValue : actualValue;

                    // vs 初始值差额
                    const initialValue = getNodeInitialMonthValue(node, types.forecast || types.actual);
                    let diffVsInitial = null;
                    let diffPercentVsInitial = null;
                    let diffVsInitialColorClass = '';
                    if (currentValue !== null && currentValue !== undefined && initialValue !== null && initialValue !== undefined) {
                      diffVsInitial = currentValue - initialValue;
                      if (initialValue !== 0) {
                        diffPercentVsInitial = (diffVsInitial / initialValue) * 100;
                      }
                      diffVsInitialColorClass = getDiffColorClass(diffVsInitial, node.direction, node.name);
                    }

                    // vs 目标值差额
                    let diffVsTarget = null;
                    let diffPercentVsTarget = null;
                    let diffVsTargetColorClass = '';
                    if (currentValue !== null && currentValue !== undefined && targetValue !== null && targetValue !== undefined) {
                      diffVsTarget = currentValue - targetValue;
                      if (targetValue !== 0) {
                        diffPercentVsTarget = (diffVsTarget / targetValue) * 100;
                      }
                      diffVsTargetColorClass = getDiffColorClass(diffVsTarget, node.direction, node.name);
                    }

                    return (
                      <React.Fragment key={month + "-data"}>
                        {/* 实际 */}
                        <td className="w-20 px-1 py-1.5 text-sm text-gray-900 text-right font-mono border-r border-gray-200 whitespace-nowrap">
                          {actualValue !== undefined && actualValue !== null && actualValue !== ''
                            ? formatNumber(actualValue, node.format)
                            : '-'}
                        </td>
                        {/* 预测 */}
                        <td className="w-20 px-1 py-1.5 text-sm text-gray-900 text-right font-mono border-r border-gray-200 whitespace-nowrap">
                          {forecastValue !== undefined && forecastValue !== null && forecastValue !== ''
                            ? formatNumber(forecastValue, node.format)
                            : '-'}
                        </td>
                        {/* 目标 */}
                        <td className="w-20 px-1 py-1.5 text-sm text-gray-900 text-right font-mono border-r border-gray-200 whitespace-nowrap">
                          {targetValue !== undefined && targetValue !== null && targetValue !== ''
                            ? formatNumber(targetValue, node.format)
                            : '-'}
                        </td>
                        {/* 差额(vs初始) */}
                        <td className={"w-24 px-1 py-1.5 text-sm text-right font-mono border-r border-gray-200 font-medium whitespace-nowrap " + diffVsInitialColorClass}>
                          {diffVsInitial !== null
                            ? `${getDiffArrow(diffVsInitial, node)} ${diffVsInitial > 0 ? '+' : ''}${formatNumber(diffVsInitial, node.format)}`
                            : '-'}
                        </td>
                        {/* 差额%(vs初始) */}
                        <td className={"w-20 px-1 py-1.5 text-sm text-right font-mono border-r border-gray-200 font-medium whitespace-nowrap " + diffVsInitialColorClass}>
                          {diffPercentVsInitial !== null
                            ? `${diffPercentVsInitial > 0 ? '+' : ''}${diffPercentVsInitial.toFixed(2)}%`
                            : '-'}
                        </td>
                        {/* 差额(vs目标) */}
                        <td className={"w-24 px-1 py-1.5 text-sm text-right font-mono border-r border-gray-200 font-medium whitespace-nowrap " + diffVsTargetColorClass}>
                          {diffVsTarget !== null
                            ? `${getDiffArrow(diffVsTarget, node)} ${diffVsTarget > 0 ? '+' : ''}${formatNumber(diffVsTarget, node.format)}`
                            : '-'}
                        </td>
                        {/* 差额%(vs目标) */}
                        <td className={"w-20 px-1 py-1.5 text-sm text-right font-mono border-r border-gray-200 font-medium whitespace-nowrap " + diffVsTargetColorClass}>
                          {diffPercentVsTarget !== null
                            ? `${diffPercentVsTarget > 0 ? '+' : ''}${diffPercentVsTarget.toFixed(2)}%`
                            : '-'}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MonthDetailTable;
