import React, { useState } from 'react';
import MonthDataTable from './MonthDataTable';
import MonthDetailTable from './MonthDetailTable';

const FullscreenDataPanel = ({ nodes, onClose, currentScenarioName = '' }) => {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'detail'

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-800">📊 全屏数据面板</h2>
          {currentScenarioName && (
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm rounded-full">
              {currentScenarioName}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 flex items-center gap-2"
        >
          关闭 ✕
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab('summary')}
          className={"px-6 py-3 text-sm font-medium " +
            (activeTab === 'summary'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700')}
        >
          汇总对比
        </button>
        <button
          onClick={() => setActiveTab('detail')}
          className={"px-6 py-3 text-sm font-medium " +
            (activeTab === 'detail'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700')}
        >
          月份明细
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'summary' ? (
          <div>
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-800 mb-3">说明</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• <span className="text-green-600 font-medium">实际汇总</span>：1-8月实际数合计</li>
                <li>• <span className="text-blue-600 font-medium">预测汇总</span>：9-12月预测数合计</li>
                <li>• <span className="text-green-700 font-bold">实际+预测</span>：实际+预测合计</li>
                <li>• <span className="text-gray-600 font-medium">目标汇总</span>：1-12月目标数合计</li>
                <li>• <span className="font-medium">差额</span>：(实际+预测) - 目标</li>
              </ul>
            </div>
            <MonthDataTable nodes={nodes} />
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-4">月份明细数据</h3>
            <MonthDetailTable nodes={nodes} />
          </div>
        )}
      </div>
    </div>
  );
};

export default FullscreenDataPanel;
