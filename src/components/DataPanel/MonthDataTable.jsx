import React from 'react';
import { formatValue, aggregateTimeData, aggregateRatioIndicator, getDiffColorClass, isPositiveIndicator } from '../../utils/formatters';
import { FormulaParser } from '../../engine/FormulaParser';

const MonthDataTable = ({ nodes, onExportExcel }) => {
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

  // 处理每一行数据
  const tableRows = nodeList.map(node => {
    const isDriver = node.type === 'driver';
    const hasMonthlyFunction = !isDriver && FormulaParser.hasMonthlyFunction(node.formula);

    // 确定聚合方式
    let aggType = 'sum';
    if (isDriver) {
      aggType = node.aggregationType || (node.unit === '%' ? 'average' : 'sum');
    }

    // 如果是比率型指标，使用特殊的聚合逻辑
    let aggregated;
    if (node.isRatioIndicator && !isDriver) {
      aggregated = aggregateRatioIndicator(node, nodes, aggType);
    } else {
      aggregated = aggregateTimeData(node.timeData, aggType);
    }

    // 根据是否有 MONTHLY 函数来决定显示逻辑
    let actualTotal = aggregated.actualTotal;
    let forecastTotal = aggregated.forecastTotal;
    let actualPlusForecastTotal = aggregated.actualPlusForecastTotal;
    let targetTotal = aggregated.targetTotal;
    let diffVsTarget = aggregated.diffVsTarget;
    let diffPercentVsTarget = aggregated.diffPercentVsTarget;

    if (!isDriver) {
      if (hasMonthlyFunction) {
        // 有 MONTHLY 函数：实际+预测用 node.value，目标用 node.targetValue
        actualPlusForecastTotal = node.value ?? 0;
      }
      // 无论是否 MONTHLY，目标都用 node.targetValue
      if (node.targetValue !== undefined && node.targetValue !== null && !isNaN(node.targetValue)) {
        targetTotal = node.targetValue;
      }
      diffVsTarget = actualPlusForecastTotal - targetTotal;
      diffPercentVsTarget = targetTotal !== 0 ? (diffVsTarget / targetTotal) * 100 : null;
    }

    const diffColorClass = getDiffColorClass(diffVsTarget, node.direction, node.name);

    // 计算与初始值的差额
    const initialValue = node.initialBaseline;
    const diffVsInitial = initialValue !== null && initialValue !== undefined && !isNaN(initialValue)
      ? actualPlusForecastTotal - initialValue
      : null;
    const diffPercentVsInitial = diffVsInitial !== null && initialValue !== 0
      ? (diffVsInitial / initialValue) * 100
      : null;
    const diffVsInitialColorClass = getDiffColorClass(diffVsInitial, node.direction, node.name);

    return {
      node,
      aggregated,
      actualTotal,
      forecastTotal,
      actualPlusForecastTotal,
      targetTotal,
      diffVsTarget,
      diffPercentVsTarget,
      diffColorClass,
      initialValue,
      diffVsInitial,
      diffPercentVsInitial,
      diffVsInitialColorClass
    };
  });

  // 导出Excel数据
  const getExportData = () => {
    const data = [];
    // 表头
    const header = ['指标名称', '指标ID', '单位', '实际汇总', '预测汇总', '实际+预测', '目标汇总', '差额(vs目标)', '差额%(vs目标)', '初始值', '差额(vs初始)', '差额%(vs初始)'];
    data.push(header);

    // 数据行
    tableRows.forEach(row => {
      data.push([
        row.node.name,
        row.node.id,
        row.node.unit || '',
        row.actualTotal,
        row.forecastTotal,
        row.actualPlusForecastTotal,
        row.targetTotal,
        row.diffVsTarget,
        row.diffPercentVsTarget !== null ? row.diffPercentVsTarget.toFixed(2) + '%' : '',
        row.initialValue,
        row.diffVsInitial,
        row.diffPercentVsInitial !== null ? row.diffPercentVsInitial.toFixed(2) + '%' : ''
      ]);
    });

    return data;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h4 className="text-sm font-medium text-gray-700">汇总对比</h4>
        {onExportExcel && (
          <button
            onClick={() => onExportExcel(getExportData(), '数据面板_汇总表')}
            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
          >
            <span>📥</span>
            导出Excel
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto border border-gray-200 rounded">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-100 sticky top-0 z-30">
            <tr>
              <th className="w-52 px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200 sticky left-0 bg-gray-100 z-40">
                指标名称
              </th>
              <th className="w-28 px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200">
                指标ID
              </th>
              <th className="w-16 px-3 py-2 text-center font-medium text-gray-700 border-r border-gray-200">
                单位
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 border-r border-gray-200">
                实际汇总
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 border-r border-gray-200">
                预测汇总
              </th>
              <th className="px-3 py-2 text-right font-medium text-green-700 border-r border-gray-200">
                实际+预测
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 border-r border-gray-200">
                目标汇总
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 border-r border-gray-200">
                差额(vs目标)
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 border-r border-gray-200">
                差额%(vs目标)
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 border-r border-gray-200">
                初始值
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 border-r border-gray-200">
                差额(vs初始)
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">
                差额%(vs初始)
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tableRows.map((row) => (
              <tr key={row.node.id} className="hover:bg-gray-50">
                <td className="w-52 px-3 py-2 text-sm text-gray-900 font-medium border-r border-gray-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                  {row.node.name}
                </td>
                <td className="w-28 px-3 py-2 text-sm text-gray-500 font-mono border-r border-gray-200">
                  {row.node.id}
                </td>
                <td className="w-16 px-3 py-2 text-sm text-gray-500 text-center border-r border-gray-200">
                  {row.node.unit || '-'}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900 text-right font-mono border-r border-gray-200">
                  {row.actualTotal !== 0
                    ? formatNumber(row.actualTotal, row.node.format)
                    : '-'}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900 text-right font-mono border-r border-gray-200">
                  {row.forecastTotal !== 0
                    ? formatNumber(row.forecastTotal, row.node.format)
                    : '-'}
                </td>
                <td className="px-3 py-2 text-sm text-green-700 text-right font-mono font-semibold border-r border-gray-200">
                  {row.actualPlusForecastTotal !== 0
                    ? formatNumber(row.actualPlusForecastTotal, row.node.format)
                    : '-'}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900 text-right font-mono border-r border-gray-200">
                  {row.targetTotal !== 0
                    ? formatNumber(row.targetTotal, row.node.format)
                    : '-'}
                </td>
                <td className={"px-3 py-2 text-sm text-right font-mono font-medium border-r border-gray-200 " + row.diffColorClass}>
                  {row.targetTotal !== 0
                    ? `${getDiffArrow(row.diffVsTarget, row.node)} ${row.diffVsTarget > 0 ? '+' : ''}${formatNumber(row.diffVsTarget, row.node.format)}`
                    : '-'}
                </td>
                <td className={"px-3 py-2 text-sm text-right font-mono font-medium border-r border-gray-200 " + row.diffColorClass}>
                  {row.diffPercentVsTarget !== null
                    ? `${row.diffPercentVsTarget > 0 ? '+' : ''}${row.diffPercentVsTarget.toFixed(2)}%`
                    : '-'}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900 text-right font-mono border-r border-gray-200">
                  {row.initialValue !== null && row.initialValue !== undefined && row.initialValue !== 0
                    ? formatNumber(row.initialValue, row.node.format)
                    : '-'}
                </td>
                <td className={"px-3 py-2 text-sm text-right font-mono font-medium border-r border-gray-200 " + row.diffVsInitialColorClass}>
                  {row.diffVsInitial !== null
                    ? `${getDiffArrow(row.diffVsInitial, row.node)} ${row.diffVsInitial > 0 ? '+' : ''}${formatNumber(row.diffVsInitial, row.node.format)}`
                    : '-'}
                </td>
                <td className={"px-3 py-2 text-sm text-right font-mono font-medium " + row.diffVsInitialColorClass}>
                  {row.diffPercentVsInitial !== null
                    ? `${row.diffPercentVsInitial > 0 ? '+' : ''}${row.diffPercentVsInitial.toFixed(2)}%`
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthDataTable;
