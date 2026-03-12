import React, { useState, useRef, useEffect } from 'react';
import useVDTStore from '../../store/useVDTStore';
import { getProviderList, getProviderPreset, testAIConnection } from '../../services/aiService';

/**
 * AI配置面板 - 浮动窗口
 * 配置AI连接参数，支持云服务和本地部署
 */
const AIConfigPanel = ({ onClose, onBringToFront }) => {
  const aiConfig = useVDTStore((s) => s.aiConfig);
  const setAIConfig = useStore((s) => s.setAIConfig);

  const [formData, setFormData] = useState({
    provider: aiConfig.provider || 'custom',
    url: aiConfig.url || '',
    apiKey: aiConfig.apiKey || '',
    model: aiConfig.model || '',
    temperature: aiConfig.temperature ?? 0.7,
    maxTokens: aiConfig.maxTokens ?? 2000,
    systemPrompt: aiConfig.systemPrompt || ''
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const providers = getProviderList();

  // 处理厂商选择
  const handleProviderChange = (e) => {
    const provider = e.target.value;
    const preset = getProviderPreset(provider);
    setFormData((prev) => ({
      ...prev,
      provider,
      url: preset.url || prev.url,
      model: preset.model || prev.model
    }));
  };

  // 测试连接
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const success = await testAIConnection({
        url: formData.url,
        apiKey: formData.apiKey,
        model: formData.model,
        temperature: formData.temperature,
        maxTokens: formData.maxTokens
      });
      setTestResult({
        success,
        message: success ? '连接成功！' : '连接失败，请检查配置'
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error.message || '连接失败'
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 保存配置
  const handleSave = () => {
    setAIConfig(formData);
    onClose();
  };

  // 清空配置
  const handleClear = () => {
    const emptyConfig = {
      provider: 'custom',
      url: '',
      apiKey: '',
      model: '',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: ''
    };
    setFormData(emptyConfig);
    setAIConfig(emptyConfig);
    setTestResult(null);
  };
  const handleMouseDown = (e) => {
    if (e.target.closest('.ai-config-content')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    onBringToFront?.();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(0, e.clientX - dragOffset.x),
        y: Math.max(0, e.clientY - dragOffset.y)
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <div
      ref={containerRef}
      className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 w-[480px] max-h-[90vh] flex flex-col"
      style={{ left: position.x, top: position.y, zIndex: 100 }}
    >
      {/* 标题栏 - 固定 */}
      <div
        ref={headerRef}
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-lg cursor-move shrink-0"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-white font-medium">AI配置</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeJoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 内容区 - 可滚动 */}
      <div className="p-4 ai-config-content overflow-y-auto">
        {/* 厂商选择 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">服务厂商</label>
          <select
            value={formData.provider}
            onChange={handleProviderChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <optgroup label="云服务">
              {providers.filter((p) => p.type === 'cloud').map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="本地部署">
              {providers.filter((p) => p.type === 'local').map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </optgroup>
            <option value="custom">自定义</option>
          </select>
        </div>

        {/* API地址 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API地址 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.url}
            onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
            placeholder="https://api.example.com/v1/chat/completions"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">支持OpenAI兼容格式的API端点</p>
        </div>

        {/* API Key */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <input
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
            placeholder="sk-..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">本地部署可留空，云服务必须填写</p>
        </div>

        {/* 模型名称 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            模型名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.model}
            onChange={(e) => setFormData((prev) => ({ ...prev, model: e.target.value }))}
            placeholder="gpt-4o-mini"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* 高级选项 */}
        <div className="mb-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            高级选项
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 p-3 bg-gray-50 rounded-md">
              {/* Temperature */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temperature: {formData.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>精确</span>
                  <span>创造性</span>
                </div>
              </div>

              {/* Max Tokens */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
                <input
                  type="number"
                  min="100"
                  max="8000"
                  value={formData.maxTokens}
                  onChange={(e) => setFormData((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              {/* 系统提示词 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">自定义系统提示词</label>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder="留空使用默认提示词"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div
            className={`mb-4 p-3 rounded-md ${
              testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-sm">{testResult.message}</span>
            </div>
          </div>
        )}

        {/* 按钮组 */}
        <div className="flex gap-3">
          <button
            onClick={handleTestConnection}
            disabled={isTesting || !formData.url || !formData.model}
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? '测试中...' : '测试连接'}
          </button>
          <button
            onClick={handleSave}
            disabled={!formData.url || !formData.model}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存配置
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-md"
            title="清空所有配置（包括API Key）"
          >
            清空
          </button>
        </div>
      </div>
    </div>
  );
};

// 修复useStore引用
const useStore = useVDTStore;

export default AIConfigPanel;
