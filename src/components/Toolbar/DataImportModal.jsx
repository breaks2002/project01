import React, { useState, useCallback } from 'react';
import { parseCSV, csvToNodes, detectCSVStructure, isFormulaTable, validateFormulaTable, formulaTableToNodes } from '../../utils/csvParser';
import { parseExcel, excelToNodes, detectExcelStructure, isExcelFormulaTable, validateExcelFormulaTable, excelFormulaTableToNodes } from '../../utils/excelParser';

const DataImportModal = ({ onClose, onImport, existingNodesCount = 0, existingNodes = {} }) => {
  const [step, setStep] = useState(1);
  const [rawData, setRawData] = useState([]);
  const [structure, setStructure] = useState(null);
  const [selectedNameColumn, setSelectedNameColumn] = useState('');
  const [selectedValueColumns, setSelectedValueColumns] = useState([]);
  const [isFormulaMode, setIsFormulaMode] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [importMode, setImportMode] = useState('append'); // 'append' 或 'replace'
  const [fileType, setFileType] = useState(null); // 'csv' 或 'excel'
  const [loading, setLoading] = useState(false);

  // 第二个文件：数据表（当导入公式表时可选）
  const [dataRawData, setDataRawData] = useState([]);
  const [dataFileType, setDataFileType] = useState(null);

  // 判断文件类型
  const getFileType = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'csv') return 'csv';
    if (ext === 'xlsx' || ext === 'xls') return 'excel';
    return null;
  };

  const handleFileUpload = useCallback(async (e, isDataTable = false) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const type = getFileType(file.name);

    try {
      let data;

      if (type === 'csv') {
        // CSV 解析
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        data = parseCSV(text);
      } else if (type === 'excel') {
        // Excel 解析
        data = await parseExcel(file);
      } else {
        alert('不支持的文件格式，请使用 .csv, .xlsx 或 .xls 文件');
        setLoading(false);
        return;
      }

      if (isDataTable) {
        setDataRawData(data);
        setDataFileType(type);
      } else {
        setRawData(data);
        setFileType(type);

        // 检测是否为公式表
        const isFormula = type === 'excel' ? isExcelFormulaTable(data) : isFormulaTable(data);
        setIsFormulaMode(isFormula);

        if (isFormula) {
          // 公式表模式：直接校验
          const validation = type === 'excel'
            ? validateExcelFormulaTable(data)
            : validateFormulaTable(data);
          setValidationResult(validation);
          setStep(2);
        } else {
          // 数据表模式：列映射流程
          const detected = type === 'excel' ? detectExcelStructure(data) : detectCSVStructure(data);
          setStructure(detected);
          if (detected) {
            setSelectedNameColumn(detected.nameColumn);
            setSelectedValueColumns(detected.valueColumns);
          }
          setStep(2);
        }
      }
    } catch (error) {
      alert('文件解析失败：' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNext = () => {
    setStep(3);
  };

  const handleImport = () => {
    let nodes;

    if (isFormulaMode) {
      // 公式表导入
      if (dataRawData.length > 0) {
        // 有数据表，合并导入
        nodes = fileType === 'excel'
          ? excelFormulaTableToNodes(rawData, dataRawData, existingNodes)
          : formulaTableToNodes(rawData, dataRawData, existingNodes);
      } else {
        // 只有公式表，传入现有节点用于追加
        nodes = fileType === 'excel'
          ? excelFormulaTableToNodes(rawData, null, existingNodes)
          : formulaTableToNodes(rawData, null, existingNodes);
      }
    } else {
      // 数据表导入
      nodes = fileType === 'excel'
        ? excelToNodes(rawData, selectedNameColumn, selectedValueColumns)
        : csvToNodes(rawData, selectedNameColumn, selectedValueColumns);
    }

    onImport({ nodes, mode: importMode });
    onClose();
  };

  const toggleValueColumn = (col) => {
    if (selectedValueColumns.includes(col)) {
      setSelectedValueColumns(selectedValueColumns.filter(c => c !== col));
    } else {
      setSelectedValueColumns([...selectedValueColumns, col]);
    }
  };

  const resetAndBack = () => {
    setStep(1);
    setIsFormulaMode(false);
    setValidationResult(null);
    setRawData([]);
    setDataRawData([]);
    setFileType(null);
    setDataFileType(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-4/5 max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            {isFormulaMode ? '📝 导入公式表' : '📄 导入数据'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* 步骤 1: 选择文件 */}
          {step === 1 && (
            <div className="text-center py-10">
              <div className="text-6xl mb-4">{isFormulaMode ? '📝' : '📄'}</div>
              <p className="text-gray-600 mb-4">
                选择 CSV 或 Excel 文件导入
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload(e, false)}
                disabled={loading}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              {loading && <p className="mt-4 text-blue-600">正在解析文件...</p>}
              <div className="mt-6 text-left text-sm text-gray-500 bg-gray-50 p-4 rounded">
                <p className="font-medium mb-2">支持两种模式：</p>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="font-medium text-blue-700">📊 数据表模式</p>
                    <pre className="text-xs mt-1">
指标名称,1月实际,2月实际,...,8月实际,9月预测,...
营业收入,100000,110000,...
</pre>
                  </div>
                  <div className="bg-purple-50 p-3 rounded">
                    <p className="font-medium text-purple-700">📝 公式表模式</p>
                    <pre className="text-xs mt-1">
指标ID,指标名称,节点类型,公式,最小值,最大值,...
yingyeshouru,营业收入,driver,,0,10000,...
maolirun,毛利润,computed,yingyeshouru-yingyechengben,...
</pre>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="font-medium text-gray-700">📋 支持的文件格式：</p>
                  <ul className="list-disc list-inside mt-2">
                    <li><strong>.csv</strong> - CSV 逗号分隔文本文件</li>
                    <li><strong>.xlsx</strong> - Excel 2007+ 工作簿</li>
                    <li><strong>.xls</strong> - Excel 97-2003 工作簿</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 步骤 2: 公式表校验 / 数据表列映射 */}
          {step === 2 && (
            <div>
              {isFormulaMode ? (
                /* 公式表校验 */
                <div>
                  <h3 className="font-medium mb-4">📋 公式表校验结果</h3>

                  {validationResult && (
                    <>
                      {/* 错误信息 */}
                      {validationResult.errors.length > 0 && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
                          <p className="font-medium text-red-700 mb-2">❌ 错误 ({validationResult.errors.length})</p>
                          <ul className="text-sm text-red-600 list-disc list-inside">
                            {validationResult.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 警告信息 */}
                      {validationResult.warnings.length > 0 && (
                        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                          <p className="font-medium text-yellow-700 mb-2">⚠️ 警告 ({validationResult.warnings.length})</p>
                          <ul className="text-sm text-yellow-600 list-disc list-inside">
                            {validationResult.warnings.map((warn, i) => (
                              <li key={i}>{warn}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 成功 */}
                      {validationResult.valid && (
                        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
                          <p className="font-medium text-green-700">✅ 校验通过！共 {rawData.length} 个节点</p>
                        </div>
                      )}

                      {/* 可选：上传数据表 */}
                      <div className="mt-6 p-4 bg-gray-50 rounded">
                        <p className="font-medium text-gray-700 mb-2">📊 可选：上传数据表（时间序列数据）</p>
                        {dataRawData.length > 0 ? (
                          <p className="text-sm text-green-600">✅ 已加载数据表：{dataRawData.length} 行</p>
                        ) : (
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={(e) => handleFileUpload(e, true)}
                            disabled={loading}
                            className="block w-full text-sm text-gray-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-md file:border-0
                              file:text-sm file:font-semibold
                              file:bg-green-50 file:text-green-700
                              hover:file:bg-green-100"
                          />
                        )}
                        {loading && <p className="mt-2 text-blue-600 text-sm">正在解析文件...</p>}
                      </div>

                      {/* 数据预览 */}
                      <div className="mt-4">
                        <p className="text-sm text-gray-600 mb-2">公式表预览（前 5 行）：</p>
                        <div className="overflow-auto border rounded max-h-60">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-100 sticky top-0">
                              <tr>
                                {Object.keys(rawData[0]).map(col => (
                                  <th key={col} className="px-2 py-1 border text-left font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rawData.slice(0, 5).map((row, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  {Object.keys(rawData[0]).map(col => (
                                    <td key={col} className="px-2 py-1 border">{row[col]}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="mt-6 flex gap-3 justify-end">
                    <button onClick={resetAndBack} className="px-4 py-2 border rounded hover:bg-gray-50">返回</button>
                    <button
                      onClick={handleNext}
                      disabled={!validationResult?.valid}
                      className={`px-4 py-2 rounded ${validationResult?.valid ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                    >
                      下一步
                    </button>
                  </div>
                </div>
              ) : (
                /* 数据表列映射 */
                <div>
                  <h3 className="font-medium mb-4">列映射设置</h3>

                  {structure && (
                    <>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">指标名称列</label>
                        <select
                          value={selectedNameColumn}
                          onChange={(e) => setSelectedNameColumn(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          {structure.allColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">数值列（可多选）</label>
                        <div className="grid grid-cols-4 gap-2">
                          {structure.allColumns.filter(c => c !== selectedNameColumn).map(col => (
                            <label key={col} className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={selectedValueColumns.includes(col)}
                                onChange={() => toggleValueColumn(col)}
                              />
                              <span className="text-sm">{col}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-sm text-gray-600 mb-2">数据预览（前 5 行）：</p>
                        <div className="overflow-auto border rounded">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                {structure.allColumns.map(col => (
                                  <th key={col} className="px-2 py-1 border text-left font-medium">
                                    {col}
                                    {col === selectedNameColumn && <span className="text-blue-600 ml-1">📛</span>}
                                    {selectedValueColumns.includes(col) && <span className="text-green-600 ml-1">✅</span>}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rawData.slice(0, 5).map((row, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  {structure.allColumns.map(col => (
                                    <td key={col} className="px-2 py-1 border">{row[col]}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="mt-6 flex gap-3 justify-end">
                    <button onClick={resetAndBack} className="px-4 py-2 border rounded hover:bg-gray-50">返回</button>
                    <button onClick={handleNext} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">下一步</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 步骤 3: 确认导入 */}
          {step === 3 && (
            <div>
              <h3 className="font-medium mb-4">确认导入</h3>

              {isFormulaMode ? (
                <div>
                  <p className="text-gray-600 mb-4">
                    将导入 <span className="font-bold text-purple-600">{rawData.length}</span> 个节点
                    {dataRawData.length > 0 && (
                      <span>，并合并 <span className="font-bold text-blue-600">{dataRawData.length}</span> 行时间序列数据</span>
                    )}
                  </p>

                  <div className="mt-4 p-4 bg-gray-50 rounded">
                    <p className="text-sm text-gray-600">📋 节点类型统计：</p>
                    <div className="flex gap-6 mt-2">
                      <span className="text-blue-600">⚙️ 驱动因子: {rawData.filter(r => r['节点类型'] !== 'computed').length}</span>
                      <span className="text-purple-600">📊 计算指标: {rawData.filter(r => r['节点类型'] === 'computed').length}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-600 mb-4">
                  将创建 <span className="font-bold text-blue-600">{rawData.length}</span> 个节点，
                  使用 <span className="font-medium">{selectedNameColumn}</span> 作为名称，
                  {selectedValueColumns.length > 0 && (
                    <span>
                      {' '}<span className="font-medium">{selectedValueColumns.length} 列</span> 作为数值列
                    </span>
                  )}
                </p>
              )}

              {/* 导入模式选择 */}
              {existingNodesCount > 0 && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                  <p className="font-medium text-blue-700 mb-2">📥 导入模式</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="importMode"
                        value="append"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                      />
                      <span className="text-sm">追加（保留现有节点，添加新节点）</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                      />
                      <span className="text-sm">覆盖（清除现有节点，全部替换）</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-3 justify-end">
                <button onClick={() => setStep(2)} className="px-4 py-2 border rounded hover:bg-gray-50">返回</button>
                <button onClick={handleImport} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                  {importMode === 'replace' && existingNodesCount > 0 ? '覆盖导入' : '导入'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataImportModal;
