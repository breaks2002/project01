import React from 'react';
import { formatValue } from '../../utils/formatters';

/**
 * 标准差分析详情面板
 */
const StdDevDetailTable = ({ node, onClose, onViewTrend, onViewWaterfall }) => {
  if (!node) return null;

  return (
    <div className="w-80 border-l bg-white overflow-y-auto">
      <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{node.nodeName}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* 基本信息 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">方案</span>
            <span className="text-gray-800 font-medium">{node.scenarioId}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">版本</span>
            <span className="text-gray-800 font-medium">
              {node.isInitialVersion ? '初始' : '当前'}
            </span>
          </div>
        </div>

        {/* 标准差数据 */}
        <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">A (波动性)</span>
            <span className={`font-mono font-medium ${node.cvA <= 0.1 ? 'text-green-600' : 'text-red-600'}`}>
              {node.cvA?.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">A (解释)</span>
            <span className="text-gray-700">{node.insight?.cvAInterp}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">B (偏离度)</span>
            <span className={`font-mono font-medium ${node.cvB <= 0.1 ? 'text-green-600' : 'text-red-600'}`}>
              {node.cvB?.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">B (解释)</span>
            <span className="text-gray-700">{node.insight?.cvBInterp}</span>
          </div>
        </div>

        {/* 象限信息 */}
        {node.quadrant && (
          <div className={`border rounded-lg p-3 ${node.quadrant.color} space-y-2`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-700 font-medium">象限</span>
              <span className="text-gray-800 font-semibold">{node.quadrant.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-700">标签</span>
              <span className="text-gray-800">{node.quadrant.label}</span>
            </div>
          </div>
        )}

        {/* 洞察建议 */}
        {node.insight && (
          <div className="border rounded-lg p-3 bg-white">
            <p className="text-xs font-semibold text-gray-800 mb-1">
              💡 {node.insight.title}
            </p>
            <p className="text-xs text-gray-600">
              {node.insight.desc}
            </p>
            <p className="text-xs mt-2">
              <span className={`px-2 py-0.5 rounded ${
                node.insight.priority === 'high' ? 'bg-red-100 text-red-800' :
                node.insight.priority === 'medium' ? 'bg-amber-100 text-amber-800' :
                'bg-green-100 text-green-800'
              }`}>
                优先级：{node.insight.priority === 'high' ? '高' : node.insight.priority === 'medium' ? '中' : '低'}
              </span>
            </p>
          </div>
        )}

        {/* 数据构成 */}
        {node.dataComposition && (
          <div className="border rounded-lg p-3 bg-gray-50 space-y-1">
            <p className="text-xs font-medium text-gray-700">数据构成</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">实际月数</span>
              <span className="text-gray-700">{node.dataComposition.actualCount} 个月</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">预测月数</span>
              <span className="text-gray-700">{node.dataComposition.forecastCount} 个月</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">是否混合</span>
              <span className="text-gray-700">{node.isMixed ? '是' : '否'}</span>
            </div>
          </div>
        )}

        {/* 月度明细 */}
        {node.monthlyData && node.monthlyData.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-100 border-b">
              <p className="text-xs font-medium text-gray-700">月度明细</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left text-gray-500">月份</th>
                    <th className="px-2 py-1 text-right text-gray-500">值</th>
                    <th className="px-2 py-1 text-right text-gray-500">目标</th>
                    <th className="px-2 py-1 text-right text-gray-500">差额</th>
                  </tr>
                </thead>
                <tbody>
                  {node.monthlyData.map((month, index) => (
                    <tr key={index} className="border-t hover:bg-gray-50">
                      <td className="px-2 py-1 text-gray-700">{month.month}</td>
                      <td className="px-2 py-1 text-right text-gray-800">
                        {formatValue(month.value, 0)}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-800">
                        {formatValue(month.target, 0)}
                      </td>
                      <td className={`px-2 py-1 text-right ${
                        month.deviation >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatValue(month.deviation, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 pt-2 border-t">
          {onViewTrend && (
            <button
              onClick={onViewTrend}
              className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              📈 趋势图
            </button>
          )}
          {onViewWaterfall && (
            <button
              onClick={onViewWaterfall}
              className="flex-1 px-3 py-1.5 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
            >
              💹 瀑布图
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StdDevDetailTable;
