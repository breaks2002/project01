import React, { useMemo, useState } from 'react';
import { formatValue } from '../../utils/formatters';

/**
 * 标准差分析数据表格
 */
const StdDevDataTable = ({ data }) => {
  const [sortField, setSortField] = useState('cvA');
  const [sortOrder, setSortOrder] = useState('asc');

  // 过滤掉数据不足的节点
  const validData = useMemo(() => {
    return data.filter(d => !d.isInsufficient);
  }, [data]);

  // 排序
  const sortedData = useMemo(() => {
    return [...validData].sort((a, b) => {
      const aVal = a[sortField] || 0;
      const bVal = b[sortField] || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [validData, sortField, sortOrder]);

  // 切换排序
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // 获取排序图标
  const getSortIcon = (field) => {
    if (sortField !== field) return '⇅';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-700 border-b">节点名称</th>
            <th className="px-4 py-3 text-left font-medium text-gray-700 border-b">方案</th>
            <th className="px-4 py-3 text-left font-medium text-gray-700 border-b">版本</th>
            <th
              className="px-4 py-3 text-right font-medium text-gray-700 border-b cursor-pointer hover:bg-gray-200"
              onClick={() => handleSort('cvA')}
            >
              {getSortIcon('cvA')} A (波动性)
            </th>
            <th
              className="px-4 py-3 text-right font-medium text-gray-700 border-b cursor-pointer hover:bg-gray-200"
              onClick={() => handleSort('cvB')}
            >
              {getSortIcon('cvB')} B (偏离度)
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-700 border-b">象限</th>
            <th className="px-4 py-3 text-left font-medium text-gray-700 border-b">洞察</th>
            <th className="px-4 py-3 text-right font-medium text-gray-700 border-b">月数</th>
            <th className="px-4 py-3 text-left font-medium text-gray-700 border-b">数据构成</th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, index) => (
            <tr
              key={`${row.nodeId}-${row.scenarioId}-${row.isInitialVersion ? 'initial' : 'current'}`}
              className={`border-t hover:bg-gray-50 ${
                row.isInsufficient ? 'bg-gray-100 text-gray-400' : ''
              }`}
            >
              <td className="px-4 py-3 text-gray-800 font-medium">{row.nodeName}</td>
              <td className="px-4 py-3 text-gray-600">{row.scenarioName || row.scenarioId}</td>
              <td className="px-4 py-3 text-gray-600">
                {row.isInitialVersion ? '初始' : '当前'}
              </td>
              <td className={`px-4 py-3 text-right font-mono ${
                row.cvA <= 0.1 ? 'text-green-600' : 'text-red-600'
              }`}>
                {row.cvA?.toFixed(4) || '-'}
              </td>
              <td className={`px-4 py-3 text-right font-mono ${
                row.cvB <= 0.1 ? 'text-green-600' : 'text-red-600'
              }`}>
                {row.cvB?.toFixed(4) || '-'}
              </td>
              <td className="px-4 py-3">
                {row.quadrant && (
                  <span className={`px-3 py-1 rounded text-sm ${
                    row.quadrant.id === 1 ? 'bg-red-100 text-red-800' :
                    row.quadrant.id === 2 ? 'bg-amber-100 text-amber-800' :
                    row.quadrant.id === 3 ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {row.quadrant.name}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-64 truncate" title={row.insight?.title}>
                {row.insight?.title || '-'}
              </td>
              <td className="px-4 py-3 text-right text-gray-600">
                {row.totalMonths || row.dataComposition?.actualCount + row.dataComposition?.forecastCount || 0}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {row.dataComposition && (
                  <span className="text-sm">
                    实{row.dataComposition.actualCount} + 预{row.dataComposition.forecastCount}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {validData.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          暂无数据，请调整配置或导入数据
        </div>
      )}
    </div>
  );
};

export default StdDevDataTable;
