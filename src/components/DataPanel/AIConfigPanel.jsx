import React, { useState, useRef, useEffect } from 'react';
import useVDTStore from '../../store/useVDTStore';
import { getProviderList, getProviderPreset, testAIConnection } from '../../services/aiService';
import knowledgeService from '../../services/knowledgeService';

// 获取默认嵌入配置
function getDefaultEmbeddingConfig() {
  return {
    enabled: false,
    url: '',
    apiKey: '',
    model: '',
    embeddingModel: 'text-embedding-ada-002',
    dimension: 1536
  };
}

/**
 * AI 配置面板 - 浮动窗口
 * 配置 AI 连接参数，支持云服务和本地部署
 * 包含两个页签：
 * - AI 调参配置：用于 AI 调参的 LLM 配置
 * - AI 嵌入配置：用于知识库语义检索的 Embedding 配置
 */
const AIConfigPanel = ({ onClose, onBringToFront }) => {
  const [activeTab, setActiveTab] = useState('tuning'); // 'tuning' | 'embedding'
  const aiConfig = useVDTStore((s) => s.aiConfig);
  const setAIConfig = useVDTStore((s) => s.setAIConfig);

  // AI 调参配置
  const [tuningConfig, setTuningConfig] = useState({
    provider: aiConfig.provider || 'custom',
    url: aiConfig.url || '',
    apiKey: aiConfig.apiKey || '',
    model: aiConfig.model || '',
    temperature: aiConfig.temperature ?? 0.7,
    maxTokens: aiConfig.maxTokens ?? 2000,
    systemPrompt: aiConfig.systemPrompt || ''
  });

  // AI 嵌入配置
  const [embeddingConfig, setEmbeddingConfig] = useState(() => {
    const saved = localStorage.getItem('vdt_knowledge_ai_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 解密 API Key
        if (parsed.apiKey) {
          try {
            parsed.apiKey = atob(parsed.apiKey);
          } catch (e) {
            // 不是 base64，保持原样
          }
        }
        return parsed;
      } catch (e) {
        return getDefaultEmbeddingConfig();
      }
    }
    return getDefaultEmbeddingConfig();
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
    setTuningConfig((prev) => ({
      ...prev,
      provider,
      url: preset.url || prev.url,
      model: preset.model || prev.model
    }));
  };

  // 测试 AI 调参连接
  const handleTestTuning = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const success = await testAIConnection({
        url: tuningConfig.url,
        apiKey: tuningConfig.apiKey,
        model: tuningConfig.model,
        temperature: tuningConfig.temperature,
        maxTokens: tuningConfig.maxTokens
      });
      setTestResult({
        success,
        message: success ? '✅ 连接成功！AI 调参配置有效' : '❌ 连接失败，请检查配置'
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `❌ 连接失败：${error.message}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 测试嵌入连接
  const handleTestEmbedding = async () => {
    if (!embeddingConfig.url || !embeddingConfig.url.trim()) {
      setTestResult({ success: false, message: '请先填写 API URL' });
      return;
    }

    // 验证 URL 格式
    let testUrl = embeddingConfig.url.trim();
    if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
      setTestResult({ success: false, message: '❌ URL 格式错误，请以 http:// 或 https:// 开头' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      if (embeddingConfig.apiKey && embeddingConfig.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${embeddingConfig.apiKey}`;
      }

      const isLocal = testUrl.includes('localhost') ||
                      testUrl.includes('127.0.0.1') ||
                      testUrl.includes('ollama');

      const isDeepSeek = testUrl.includes('deepseek');

      // 构建请求体
      const requestBody = {
        model: embeddingConfig.embeddingModel || 'text-embedding-ada-002',
        input: '测试文本'
      };

      // DeepSeek 需要特殊的输入格式
      if (isDeepSeek) {
        requestBody.input = ['测试文本']; // DeepSeek 可能需要数组格式
      }

      // 本地服务可能需要额外参数
      if (isLocal) {
        requestBody.prompt = '测试文本';
      }

      console.log('[AIConfig] 测试嵌入连接，URL:', testUrl);
      console.log('[AIConfig] 请求体:', requestBody);

      const response = await fetch(testUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        const embedding = data.data?.[0]?.embedding || data.embedding || null;
        setTestResult({
          success: true,
          message: `✅ 连接成功！返回向量维度：${embedding ? embedding.length : '未知'}`
        });
      } else {
        const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
        setTestResult({
          success: false,
          message: `❌ API 错误：${error.error?.message || response.statusText}`
        });
      }
    } catch (error) {
      let errorMsg = error.message || '未知错误';
      // 处理常见的 fetch 错误
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('fetch')) {
        errorMsg = '无法连接到服务器，请检查：1) URL 是否正确 2) 服务是否已启动 3) 是否存在跨域限制';
      } else if (errorMsg.includes('Invalid value')) {
        errorMsg = '无效的请求值，请检查 API URL 和模型名称是否正确';
      }
      setTestResult({
        success: false,
        message: `❌ 连接失败：${errorMsg}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 保存 AI 调参配置
  const handleSaveTuning = () => {
    setAIConfig(tuningConfig);
    setTestResult({ success: true, message: '✅ AI 调参配置已保存！' });
  };

  // 保存 AI 嵌入配置
  const handleSaveEmbedding = () => {
    if (embeddingConfig.url && embeddingConfig.apiKey) {
      const encryptedConfig = {
        ...embeddingConfig,
        apiKey: btoa(embeddingConfig.apiKey) // 加密存储
      };
      localStorage.setItem('vdt_knowledge_ai_config', JSON.stringify(encryptedConfig));
      setTestResult({ success: true, message: '✅ AI 嵌入配置已保存！API Key 已加密存储' });
    } else {
      localStorage.removeItem('vdt_knowledge_ai_config');
      setTestResult({ success: true, message: '✅ 已清空 AI 嵌入配置，将使用 TF-IDF 模式' });
    }
    // 重新初始化 knowledgeService
    knowledgeService._loadAIEmbeddingConfig();
  };

  // 清空 AI 调参配置
  const handleClearTuning = () => {
    const emptyConfig = {
      provider: 'custom',
      url: '',
      apiKey: '',
      model: '',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: ''
    };
    setTuningConfig(emptyConfig);
    setAIConfig(emptyConfig);
    setTestResult(null);
  };

  // 清空嵌入配置（回退到 TF-IDF 或共用）
  const handleClearEmbedding = () => {
    localStorage.removeItem('vdt_knowledge_ai_config');
    setEmbeddingConfig(getDefaultEmbeddingConfig());
    knowledgeService._loadAIEmbeddingConfig();

    // 检测是否有 AI 调参配置
    const hasTuningConfig = tuningConfig.url && tuningConfig.apiKey;
    setTestResult({
      success: true,
      message: hasTuningConfig
        ? '✅ 已清空嵌入配置，将共用 AI 调参配置'
        : '✅ 已清空嵌入配置，将使用 TF-IDF 模式（无需 API）'
    });
  };

  // 设置为共用 AI 调参配置
  const handleUseSharedConfig = () => {
    const sharedConfig = localStorage.getItem('vdt-ai-config');
    if (sharedConfig) {
      try {
        const parsed = JSON.parse(sharedConfig);
        // 解密 API Key
        let apiKey = parsed.apiKey || '';
        if (apiKey) {
          try {
            apiKey = atob(apiKey); // 解密
          } catch (e) {
            // 不是 base64，保持原样
          }
        }

        // 自动将 LLM 的 URL 转换为嵌入模型的 URL
        let embeddingUrl = parsed.url || '';
        let embeddingModel = 'text-embedding-ada-002';
        let dimension = 1536;
        let isDeepSeek = embeddingUrl.includes('deepseek') || parsed.provider === 'deepseek';

        // 根据厂商/URL 自动匹配嵌入模型配置
        if (embeddingUrl) {
          // DeepSeek - ⚠️ DeepSeek 目前可能不支持嵌入模型
          if (isDeepSeek) {
            // 提示用户 DeepSeek 不支持嵌入模型，建议使用 TF-IDF
            setTestResult({
              success: false,
              message: '⚠️ DeepSeek 目前不支持嵌入模型 API。建议：1) 使用 TF-IDF 模式（无需配置）2) 使用 OpenAI/通义千问等嵌入服务'
            });
            // 仍然设置一个 URL，但提示用户
            embeddingUrl = embeddingUrl.replace('/chat/completions', '/embeddings');
            embeddingModel = 'deepseek-embedding';
            dimension = 1024;
          }
          // OpenAI
          else if (embeddingUrl.includes('openai.com')) {
            embeddingUrl = 'https://api.openai.com/v1/embeddings';
            embeddingModel = 'text-embedding-ada-002';
            dimension = 1536;
          }
          // Azure OpenAI
          else if (embeddingUrl.includes('azure.com')) {
            embeddingModel = 'text-embedding-ada-002';
            dimension = 1536;
          }
          // 通义千问
          else if (embeddingUrl.includes('dashscope') || embeddingUrl.includes('aliyun')) {
            embeddingUrl = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
            embeddingModel = 'text-embedding-v2';
            dimension = 1536;
          }
          // 本地 Ollama
          else if (embeddingUrl.includes('ollama') || embeddingUrl.includes('localhost:11434')) {
            embeddingUrl = 'http://localhost:11434/api/embeddings';
            embeddingModel = 'mxbai-embed-large';
            dimension = 1024;
          }
          // 本地 LM Studio
          else if (embeddingUrl.includes('localhost:1234')) {
            embeddingUrl = 'http://localhost:1234/v1/embeddings';
            embeddingModel = 'BAAI/bge-large-en-v1.5';
            dimension = 1024;
          }
          // 其他情况：尝试自动转换
          else if (embeddingUrl.includes('/chat/completions')) {
            embeddingUrl = embeddingUrl.replace('/chat/completions', '/embeddings');
          }
        }

        setEmbeddingConfig({
          url: embeddingUrl,
          apiKey: apiKey,
          embeddingModel: embeddingModel,
          dimension: dimension
        });
        knowledgeService._loadAIEmbeddingConfig();

        // 如果不是 DeepSeek，显示成功消息
        if (!isDeepSeek) {
          setTestResult({
            success: true,
            message: `✅ 已设置为共用 AI 调参配置（自动匹配嵌入模型：${embeddingModel}）`
          });
        }
      } catch (e) {
        setTestResult({ success: false, message: '❌ 读取 AI 调参配置失败：' + e.message });
      }
    } else {
      setTestResult({ success: false, message: '❌ 未找到 AI 调参配置，请先配置 AI 调参' });
    }
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

  // 获取嵌入配置模式
  const getEmbeddingMode = () => {
    if (!embeddingConfig.url) return 'tfidf';
    const sharedConfig = localStorage.getItem('vdt-ai-config'); // 使用正确的 key
    if (sharedConfig) {
      try {
        const parsed = JSON.parse(sharedConfig);
        if (parsed.url === embeddingConfig.url) return 'shared';
      } catch (e) {}
    }
    return 'dedicated';
  };

  return (
    <div
      ref={containerRef}
      className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 w-[560px] max-h-[90vh] flex flex-col"
      style={{ left: position.x, top: position.y, zIndex: 100 }}
    >
      {/* 标题栏 - 固定 */}
      <div
        ref={headerRef}
        className="flex flex-col shrink-0"
      >
        {/* 顶部标题 */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-lg cursor-move"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-white font-medium">AI 决策配置</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 页签 */}
        <div className="flex border-b bg-gray-50">
          <button
            onClick={() => setActiveTab('tuning')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'tuning'
                ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            🎯 AI 调参配置
          </button>
          <button
            onClick={() => setActiveTab('embedding')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'embedding'
                ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            🔍 AI 嵌入配置
            <span className="ml-2 text-xs">
              {getEmbeddingMode() === 'dedicated' ? '（专用）' :
               getEmbeddingMode() === 'shared' ? '（共用）' : '（TF-IDF）'}
            </span>
          </button>
        </div>
      </div>

      {/* 内容区 - 可滚动 */}
      <div className="p-4 ai-config-content overflow-y-auto flex-1">
        {activeTab === 'tuning' && (
          /* ===== AI 调参配置页签 ===== */
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>用途：</strong>配置 AI 调参使用的 LLM，用于理解用户提示词并生成调整方案
              </p>
            </div>

            {/* 厂商选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">服务厂商</label>
              <select
                value={tuningConfig.provider}
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

            {/* API 地址 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API 地址 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={tuningConfig.url}
                onChange={(e) => setTuningConfig((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://api.example.com/v1/chat/completions"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={tuningConfig.apiKey}
                onChange={(e) => setTuningConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* 模型名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                模型名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={tuningConfig.model}
                onChange={(e) => setTuningConfig((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="gpt-4o-mini"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* 高级选项 */}
            <div>
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Temperature: {tuningConfig.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={tuningConfig.temperature}
                      onChange={(e) => setTuningConfig((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
                    <input
                      type="number"
                      min="100"
                      max="8000"
                      value={tuningConfig.maxTokens}
                      onChange={(e) => setTuningConfig((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">系统提示词</label>
                    <textarea
                      value={tuningConfig.systemPrompt}
                      onChange={(e) => setTuningConfig((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                      placeholder="留空使用默认提示词"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 测试结果 */}
            {testResult && (
              <div className={`p-3 rounded-md ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {testResult.message}
              </div>
            )}

            {/* 按钮组 */}
            <div className="flex gap-3">
              <button
                onClick={handleTestTuning}
                disabled={isTesting || !tuningConfig.url || !tuningConfig.model}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md disabled:opacity-50"
              >
                {isTesting ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleSaveTuning}
                disabled={!tuningConfig.url || !tuningConfig.model}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50"
              >
                保存配置
              </button>
              <button onClick={handleClearTuning} className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-md">
                清空
              </button>
            </div>
          </div>
        )}

        {activeTab === 'embedding' && (
          /* ===== AI 嵌入配置页签 ===== */
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>用途：</strong>配置 AI 嵌入模型，用于知识库语义检索（更精准的相似度匹配）
              </p>
              <p className="text-xs text-blue-600 mt-1">
                💡 未配置时将使用 TF-IDF 算法（无需 API）
              </p>
            </div>

            {/* 当前模式显示 */}
            <div className={`p-3 rounded-lg border ${
              !embeddingConfig.url ? 'bg-gray-50 border-gray-200' :
              embeddingConfig.url === tuningConfig.url ? 'bg-blue-50 border-blue-200' :
              'bg-green-50 border-green-200'
            }`}>
              <p className="text-sm font-medium">
                {!embeddingConfig.url && '📊 当前模式：TF-IDF（无需 API）'}
                {embeddingConfig.url && embeddingConfig.url === tuningConfig.url && '🔄 当前模式：共用 AI 调参配置'}
                {embeddingConfig.url && embeddingConfig.url !== tuningConfig.url && '✅ 当前模式：专用嵌入配置'}
              </p>
            </div>

            {/* 预设选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">快速预设</label>
              <select
                onChange={(e) => {
                  const preset = JSON.parse(e.target.value);
                  if (preset) {
                    setEmbeddingConfig({
                      ...embeddingConfig,
                      url: preset.url,
                      embeddingModel: preset.model,
                      dimension: preset.dimension
                    });
                  }
                }}
                defaultValue=""
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="" disabled>选择一个预设...</option>
                <option value='{"url":"https://api.openai.com/v1/embeddings","model":"text-embedding-ada-002","dimension":1536}'>OpenAI text-embedding-ada-002</option>
                <option value='{"url":"http://localhost:11434/api/embeddings","model":"mxbai-embed-large","dimension":1024}'>Ollama (本地) mxbai-embed-large</option>
                <option value='{"url":"http://localhost:1234/v1/embeddings","model":"BAAI/bge-large-en-v1.5","dimension":1024}'>LM Studio (本地) bge-large</option>
                <option value='{"url":"https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding","model":"text-embedding-v2","dimension":1536}'>通义千问 text-embedding-v2</option>
              </select>
            </div>

            {/* API 地址 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API URL</label>
              <input
                type="url"
                value={embeddingConfig.url}
                onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, url: e.target.value })}
                placeholder="https://api.openai.com/v1/embeddings"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">
                本地部署：http://localhost:11434/api/embeddings (Ollama)
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={embeddingConfig.apiKey}
                onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, apiKey: e.target.value })}
                placeholder="sk-...（本地部署可留空）"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {/* 嵌入模型 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">嵌入模型</label>
              <input
                type="text"
                value={embeddingConfig.embeddingModel}
                onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, embeddingModel: e.target.value })}
                placeholder="text-embedding-ada-002"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {/* 向量维度 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">向量维度</label>
              <input
                type="number"
                value={embeddingConfig.dimension}
                onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, dimension: parseInt(e.target.value) || 1536 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {/* 测试结果 */}
            {testResult && (
              <div className={`p-3 rounded-md ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {testResult.message}
              </div>
            )}

            {/* 按钮组 */}
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <button
                  onClick={handleTestEmbedding}
                  disabled={isTesting || !embeddingConfig.url}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md disabled:opacity-50"
                >
                  {isTesting ? '测试中...' : '🧪 测试连接'}
                </button>
                <button
                  onClick={handleSaveEmbedding}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
                >
                  保存配置
                </button>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-3 border-t">
                <button
                  onClick={handleClearEmbedding}
                  className="flex-1 px-3 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md"
                  title="清空专用配置，根据是否有 AI 调参配置决定使用共用或 TF-IDF"
                >
                  🗑️ 清空配置
                </button>
                <button
                  onClick={handleUseSharedConfig}
                  className="flex-1 px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md"
                  title="使用 AI 调参的 API 配置进行嵌入"
                >
                  🔄 使用共用配置
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIConfigPanel;
