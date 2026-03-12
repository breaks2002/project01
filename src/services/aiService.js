/**
 * AI服务层 - 封装大模型API调用
 * 支持OpenAI兼容格式的云服务和本地部署
 */

const PROVIDER_PRESETS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-20241022'
  },
  baidu: {
    url: 'https://qianfan.baidubce.com/v2/chat/completions',
    model: 'ernie-4.0-turbo-8k'
  },
  aliyun: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus'
  },
  xunfei: {
    url: 'https://spark-api-open.xf-yun.com/v1/chat/completions',
    model: 'generalv3.5'
  },
  zhipu: {
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash'
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat'
  },
  ollama: {
    url: 'http://localhost:11434/api/chat',
    model: 'llama3.1'
  },
  lmstudio: {
    url: 'http://localhost:1234/v1/chat/completions',
    model: 'local-model'
  },
  localai: {
    url: 'http://localhost:8080/v1/chat/completions',
    model: 'gpt-4'
  },
  custom: {
    url: '',
    model: ''
  }
};

/**
 * 获取预设厂商配置
 * @param {string} provider - 厂商key
 * @returns {Object} 预设配置
 */
export const getProviderPreset = (provider) => {
  return PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
};

/**
 * 获取所有支持的厂商列表
 * @returns {Array} 厂商列表
 */
export const getProviderList = () => [
  { key: 'openai', name: 'OpenAI', type: 'cloud' },
  { key: 'anthropic', name: 'Anthropic Claude', type: 'cloud' },
  { key: 'baidu', name: '百度文心', type: 'cloud' },
  { key: 'aliyun', name: '阿里通义', type: 'cloud' },
  { key: 'xunfei', name: '讯飞星火', type: 'cloud' },
  { key: 'zhipu', name: '智谱AI', type: 'cloud' },
  { key: 'deepseek', name: 'DeepSeek', type: 'cloud' },
  { key: 'ollama', name: 'Ollama (本地)', type: 'local' },
  { key: 'lmstudio', name: 'LM Studio (本地)', type: 'local' },
  { key: 'localai', name: 'LocalAI (本地)', type: 'local' },
  { key: 'custom', name: '自定义', type: 'custom' }
];

/**
 * 加密API Key（简单XOR加密）
 * @param {string} apiKey - 原始API Key
 * @param {string} secret - 加密密钥（使用固定值）
 * @returns {string} 加密后的字符串
 */
export const encryptApiKey = (apiKey) => {
  if (!apiKey) return '';
  const secret = 'vdt-ai-config-v1';
  let result = '';
  for (let i = 0; i < apiKey.length; i++) {
    result += String.fromCharCode(apiKey.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
  }
  return btoa(result);
};

/**
 * 解密API Key
 * @param {string} encrypted - 加密后的字符串
 * @returns {string} 原始API Key
 */
export const decryptApiKey = (encrypted) => {
  if (!encrypted) return '';
  try {
    const secret = 'vdt-ai-config-v1';
    const decoded = atob(encrypted);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
    }
    return result;
  } catch {
    return '';
  }
};

/**
 * 调用AI API
 * @param {Object} config - AI配置
 * @param {Array} messages - 消息数组 [{role, content}]
 * @returns {Promise<Object>} AI响应
 */
export const callAI = async (config, messages) => {
  const { url, apiKey, model, temperature = 0.7, maxTokens = 2000 } = config;

  if (!url) {
    throw new Error('请先配置AI API地址');
  }

  if (!apiKey && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error('请先配置API Key');
  }

  const isOllama = url.includes('ollama') || url.includes('/api/chat');

  const requestBody = isOllama
    ? {
        model,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens
        }
      }
    : {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `请求失败: ${response.status}`);
    }

    const data = await response.json();

    // 适配不同厂商的响应格式
    if (isOllama) {
      return {
        content: data.message?.content || '',
        usage: {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        }
      };
    }

    // 标准OpenAI格式
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接或API配置');
    }
    throw error;
  }
};

/**
 * 测试AI连接
 * @param {Object} config - AI配置
 * @returns {Promise<boolean>} 是否连接成功
 */
export const testAIConnection = async (config) => {
  try {
    const response = await callAI(config, [
      { role: 'user', content: '你好，请回复"连接成功"' }
    ]);
    return response.content.includes('连接成功') || response.content.length > 0;
  } catch (error) {
    return false;
  }
};
