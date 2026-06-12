import React, { useMemo } from 'react';
import { formatValue, getDiffColorClass, isPositiveIndicator } from '../../utils/formatters';
import { FormulaParser } from '../../engine/FormulaParser';

const MonthDetailTable = ({ nodes, onExportExcel, timeDimension = 'month', canExport, getDisableReason }) => {
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

  // 获取时间维度的显示名称
  const getTimeDimensionDisplayName = () => {
    const names = {
      year: '年度',
      quarter: '季度',
      month: '月份',
      week: '周度',
      day: '日度'
    };
    return names[timeDimension] || '期间';
  };

  // 格式化期间显示（去掉 -AC/-FC/-BU 后缀）
  const formatPeriodKey = (key) => {
    return key.split('-')[0];
  };

  // 收集所有期间标签
  const periodData = new Map();

  nodeList.forEach(node => {
    if (node.timeData) {
      Object.keys(node.timeData).forEach(key => {
        // 提取期间部分（去掉 -AC/-FC/-BU 后缀）
        const periodKey = formatPeriodKey(key);

        // 判断类型
        let type = null;
        if (key.endsWith('-AC') || key.includes('实际')) {
          type = 'actual';
        } else if (key.endsWith('-FC') || key.includes('预测')) {
          type = 'forecast';
        } else if (key.endsWith('-BU') || key.includes('目标')) {
          type = 'target';
        }

        if (type && !periodData.has(periodKey)) {
          periodData.set(periodKey, { actual: null, forecast: null, target: null });
        }
        if (type) {
          periodData.get(periodKey)[type] = key;
        }
      });
    }
  });

  // 排序期间
  const sortedPeriods = Array.from(periodData.keys()).sort((a, b) => {
    return a.localeCompare(b);
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

  // 计算每个节点的初始期间值（用于差额对比）
  const getNodeInitialPeriodValue = (node, periodKey) => {
    if (!node.originalTimeData) return null;
    // 尝试多种可能的 key 格式
    const possibleKeys = [
      `${periodKey}-AC`, `${periodKey}-FC`, `${periodKey}-BU`,
      `${periodKey}实际`, `${periodKey}预测`, `${periodKey}目标`
    ];
    for (const key of possibleKeys) {
      if (node.originalTimeData[key] !== undefined && node.originalTimeData[key] !== null) {
        return node.originalTimeData[key];
      }
    }
    return null;
  };

  // 构建导出数据
  const getExportData = () => {
    const data = [];

    const header = ['指标名称', '指标 ID', '单位', '期间'];
    sortedPeriods.forEach(period => {
      header.push(`${period}实际`);
      header.push(`${period}预测`);
      header.push(`${period}目标`);
      header.push(`${period}差额 (vs 初始)`);
      header.push(`${period}差额%(vs 初始)`);
      header.push(`${period}差额 (vs 目标)`);
      header.push(`${period}差额%(vs 目标)`);
    });
    data.push(header);

    nodeList.forEach(node => {
      const row = [node.name, node.id, node.unit || '', ''];

      sortedPeriods.forEach(period => {
        const types = periodData.get(period);
        const actualValue = types?.actual ? node.timeData?.[types.actual] : null;
        const forecastValue = types?.forecast ? node.timeData?.[types.forecast] : null;
        const targetValue = types?.target ? node.timeData?.[types.target] : null;

        const currentValue = forecastValue !== null && forecastValue !== undefined ? forecastValue : actualValue;

        const initialValue = getNodeInitialPeriodValue(node, period);
        let diffVsInitial = null;
        let diffPercentVsInitial = null;
        if (currentValue !== null && currentValue !== undefined && initialValue !== null && initialValue !== undefined) {
          diffVsInitial = currentValue - initialValue;
          if (initialValue !== 0) {
            diffPercentVsInitial = (diffVsInitial / initialValue) * 100;
          }
        }

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
        <h4 className="text-sm font-medium text-gray-700">{getTimeDimensionDisplayName ()}明细数据</h4>
        {onExportExcel && (
          <button
            onClick={() => {
              if (!canExport) {
                alert(getDisableReason('export'));
                return;
              }
              onExportExcel(getExportData(), '数据面板_月份明细表');
            }}
            className={`px-3 py-1 rounded text-xs flex items-center gap-1 ${
              !canExport
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
            title={!canExport && getDisableReason ? getDisableReason('export') : ''}
          >
            <span>📥</span>
            导出 Excel
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
                  指标 ID
                </th>
                <th rowSpan={2} className="w-20 px-2 py-1.5 text-center font-medium text-gray-700 border-r border-gray-200 whitespace-nowrap bg-gray-100">
                  单位
                </th>
                {sortedPeriods.map(period => (
                  <th key={period} colSpan={7} className="px-2 py-1.5 text-center font-medium text-gray-700 border-b border-r border-gray-200 bg-gray-100">
                    {period}
                  </th>
                ))}
              </tr>
              <tr>
                {sortedPeriods.map(period => (
                  <React.Fragment key={period + "-cols"}>
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
                      差额 (初)
                    </th>
                    <th className="w-20 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      差额%(初)
                    </th>
                    <th className="w-24 px-1 py-1 text-right font-medium text-gray-700 border-r border-gray-200 bg-gray-50 whitespace-nowrap">
                      差额 (目)
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
                  {sortedPeriods.map(period => {
                    const types = periodData.get(period);
                    const actualValue = types?.actual ? node.timeData?.[types.actual] : null;
                    const forecastValue = types?.forecast ? node.timeData?.[types.forecast] : null;
                    const targetValue = types?.target ? node.timeData?.[types.target] : null;

                    const currentValue = forecastValue !== null && forecastValue !== undefined ? forecastValue : actualValue;

                    const initialValue = getNodeInitialPeriodValue(node, period);
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
                      <React.Fragment key={period + "-data"}>
                        <td className="w-20 px-1 py-1.5 text-sm text-gray-900 text-right font-mono border-r border-gray-200 whitespace-nowrap">
                          {actualValue !== undefined && actualValue !== null && actualValue !== ''
                            ? formatNumber(actualValue, node.format)
                            : '-'}
                        </td>
                        <td className="w-20 px-1 py-1.5 text-sm text-gray-900 text-right font-mono border-r border-gray-200 whitespace-nowrap">
                          {forecastValue !== undefined && forecastValue !== null && forecastValue !== ''
                            ? formatNumber(forecastValue, node.format)
                            : '-'}
                        </td>
                        <td className="w-20 px-1 py-1.5 text-sm text-gray-900 text-right font-mono border-r border-gray-200 whitespace-nowrap">
                          {targetValue !== undefined && targetValue !== null && targetValue !== ''
                            ? formatNumber(targetValue, node.format)
                            : '-'}
                        </td>
                        <td className={`w-24 px-1 py-1.5 text-sm text-right font-mono border-r border-gray-200 font-medium whitespace-nowrap ${diffVsInitialColorClass}`}>
                          {diffVsInitial !== null
                            ? `${getDiffArrow(diffVsInitial, node)} ${diffVsInitial > 0 ? '+' : ''}${formatNumber(diffVsInitial, node.format)}`
                            : '-'}
                        </td>
                        <td className={`w-20 px-1 py-1.5 text-sm text-right font-mono border-r border-gray-200 font-medium whitespace-nowrap ${diffVsInitialColorClass}`}>
                          {diffPercentVsInitial !== null
                            ? `${diffPercentVsInitial > 0 ? '+' : ''}${diffPercentVsInitial.toFixed(2)}%`
                            : '-'}
                        </td>
                        <td className={`w-24 px-1 py-1.5 text-sm text-right font-mono border-r border-gray-200 font-medium whitespace-nowrap ${diffVsTargetColorClass}`}>
                          {diffVsTarget !== null
                            ? `${getDiffArrow(diffVsTarget, node)} ${diffVsTarget > 0 ? '+' : ''}${formatNumber(diffVsTarget, node.format)}`
                            : '-'}
                        </td>
                        <td className={`w-20 px-1 py-1.5 text-sm text-right font-mono border-r border-gray-200 font-medium whitespace-nowrap ${diffVsTargetColorClass}`}>
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
