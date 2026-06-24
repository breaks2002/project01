import React, { useState, useMemo } from 'react';
import MonthDataTable from './MonthDataTable';
import MonthDetailTable from './MonthDetailTable';

// 检测时间维度类型
function detectTimeDimension(nodes) {
  if (!nodes) return 'month';

  const nodeList = Object.values(nodes);
  for (const node of nodeList) {
    if (node && node.timeData) {
      const keys = Object.keys(node.timeData);
      if (keys.length === 0) continue;

      const firstKey = keys[0];
      if (/^\d{4}WK\d{2}/.test(firstKey)) {
        return 'week';
      }
      if (/^\d{4}Q[1-4]/.test(firstKey)) {
        return 'quarter';
      }
      if (/^\d{4}$/.test(firstKey)) {
        return 'year';
      }
      if (/^\d{6}$/.test(firstKey)) {
        return 'month';
      }
      if (firstKey.includes('月')) {
        return 'month';
      }
      if (/^\d{4}-\d{2}/.test(firstKey)) {
        return 'month';
      }
    }
  }
  return 'month';
}

function getTimeDimensionName(timeDim) {
  const names = {
    year: '年度',
    quarter: '季度',
    month: '月份',
    week: '周度',
    day: '日度'
  };
  return names[timeDim] || '月份';
}

const FullscreenDataPanel = ({ nodes, onClose, currentScenarioName = '' }) => {
  const [activeTab, setActiveTab] = useState('summary');
  const timeDimension = useMemo(() => detectTimeDimension(nodes), [nodes]);
  const timeDimensionName = getTimeDimensionName(timeDimension);

  const periodRange = useMemo(() => {
    if (!nodes) return { actual: '', forecast: '', target: '', total: '' };

    const nodeList = Object.values(nodes);
    const allKeys = new Set();

    for (const node of nodeList) {
      if (node && node.timeData) {
        Object.keys(node.timeData).forEach(key => {
          const attr = key.split('-')[1];
          if (attr === 'AC' || attr === 'FC' || attr === 'BU') {
            allKeys.add(key.split('-')[0]);
          }
        });
      }
    }

    const sortedKeys = Array.from(allKeys).sort();
    if (sortedKeys.length === 0) {
      return { actual: '', forecast: '', target: '', total: '' };
    }

    const actualKeys = [];
    const forecastKeys = [];
    const targetKeys = [];

    for (const node of nodeList) {
      if (node && node.timeData) {
        Object.entries(node.timeData).forEach(([key]) => {
          const parts = key.split('-');
          if (parts.length === 2) {
            const [period, attr] = parts;
            if (attr === 'AC' && !actualKeys.includes(period)) actualKeys.push(period);
            if (attr === 'FC' && !forecastKeys.includes(period)) forecastKeys.push(period);
            if (attr === 'BU' && !targetKeys.includes(period)) targetKeys.push(period);
          }
        });
      }
    }

    actualKeys.sort();
    forecastKeys.sort();
    targetKeys.sort();

    const formatRange = (keys) => {
      if (keys.length === 0) return '';
      if (keys.length === 1) return keys[0];
      return `${keys[0]} ~ ${keys[keys.length - 1]}`;
    };

    const result = {
      actual: formatRange(actualKeys),
      forecast: formatRange(forecastKeys),
      target: formatRange(targetKeys),
      total: formatRange(sortedKeys)
    };

    console.log('[FullscreenDataPanel] periodRange 计算结果:', result);
    console.log('[FullscreenDataPanel] timeDimensionName:', timeDimensionName);

    return result;
  }, [nodes, timeDimensionName]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-800">📊 全屏数据面板 (已更新 v2)</h2>
          {currentScenarioName && (
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm rounded-full">
              {currentScenarioName}
            </span>
          )}
        </div>
        <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 flex items-center gap-2">
          关闭 ✕
        </button>
      </div>

      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab('summary')}
          className={"px-6 py-3 text-sm font-medium " + (activeTab === 'summary' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700')}
        >
          汇总对比
        </button>
        <button
          onClick={() => setActiveTab('detail')}
          className={"px-6 py-3 text-sm font-medium " + (activeTab === 'detail' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700')}
        >
          {timeDimensionName}明细
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'summary' ? (
          <div>
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-800 mb-3">说明</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• <span className="text-green-600 font-medium">实际汇总</span>：{periodRange.actual || '实际期'}{timeDimensionName}数合计</li>
                <li>• <span className="text-blue-600 font-medium">预测汇总</span>：{periodRange.forecast || '预测期'}{timeDimensionName}数合计</li>
                <li>• <span className="text-green-700 font-bold">实际 + 预测</span>：实际 + 预测合计</li>
                <li>• <span className="text-gray-600 font-medium">目标汇总</span>：{periodRange.target || '全期间'}{timeDimensionName}数合计</li>
                <li>• <span className="font-medium">差额 (vs 目标)</span>：(实际 + 预测) - 目标</li>
                <li>• <span className="font-medium">差额 (vs 初始)</span>：(实际 + 预测) - 初始值</li>
              </ul>
            </div>
            <MonthDataTable nodes={nodes} timeDimension={timeDimension} />
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-4">{timeDimensionName}明细数据</h3>
            <MonthDetailTable nodes={nodes} timeDimension={timeDimension} />
          </div>
        )}
      </div>
    </div>
  );
};

export default FullscreenDataPanel;
