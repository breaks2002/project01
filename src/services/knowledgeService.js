/**
 * 知识库服务
 * 负责知识库条目的 CRUD 操作和相似度检索
 */

// 本地存储的 Key
const STORAGE_KEY = 'vdt_knowledge_base';

/**
 * 知识库条目数据结构
 */
export class KnowledgeEntry {
  constructor(data) {
    this.id = data.id || this.generateId();
    this.title = data.title || '';
    this.description = data.description || '';
    this.industry = data.industry || '通用';
    this.scenario = data.scenario || '';
    this.factors = data.factors || [];
    this.embedding = data.embedding || [];
    this.sourceDocument = data.sourceDocument || null;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.usageCount = data.usageCount || 0;
    this.tags = data.tags || [];
  }

  generateId() {
    return `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      industry: this.industry,
      scenario: this.scenario,
      factors: this.factors,
      embedding: this.embedding,
      sourceDocument: this.sourceDocument,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      usageCount: this.usageCount,
      tags: this.tags
    };
  }
}

/**
 * 简化版 TF-IDF 向量化器
 * 用于将文本转换为向量表示
 */
class SimpleVectorEmbedding {
  constructor() {
    this.vocabulary = new Map();
    this.idf = new Map();
    this.documents = [];
  }

  /**
   * 训练向量化器
   * @param {string[]} documents - 文档文本数组
   */
  fit(documents) {
    this.documents = documents;
    this.vocabulary.clear();
    this.idf.clear();

    // 构建词表
    const docFreq = new Map();
    documents.forEach((doc, docIndex) => {
      const words = this._tokenize(doc);
      const uniqueWords = new Set(words);

      uniqueWords.forEach(word => {
        if (!this.vocabulary.has(word)) {
          this.vocabulary.set(word, this.vocabulary.size);
        }
        docFreq.set(word, (docFreq.get(word) || 0) + 1);
      });
    });

    // 计算 IDF
    const numDocs = documents.length;
    this.vocabulary.forEach((_, word) => {
      const df = docFreq.get(word) || 1;
      this.idf.set(word, Math.log((numDocs + 1) / (df + 1)) + 1);
    });

    return this;
  }

  /**
   * 将文本转换为向量
   * @param {string} text - 输入文本
   * @returns {number[]} 向量表示
   */
  transform(text) {
    const vocabSize = this.vocabulary.size;
    if (vocabSize === 0) return [];

    const vector = new Array(vocabSize).fill(0);
    const words = this._tokenize(text);

    // 计算词频
    const tf = new Map();
    words.forEach(word => {
      tf.set(word, (tf.get(word) || 0) + 1);
    });

    // 计算 TF-IDF 向量
    tf.forEach((count, word) => {
      const wordIndex = this.vocabulary.get(word);
      if (wordIndex !== undefined) {
        const tfidf = (count / words.length) * (this.idf.get(word) || 1);
        vector[wordIndex] = tfidf;
      }
    });

    // 归一化
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      return vector.map(v => v / norm);
    }
    return vector;
  }

  /**
   * 拟合并转换
   */
  fitTransform(documents) {
    this.fit(documents);
    return documents.map(doc => this.transform(doc));
  }

  /**
   * 文本分词
   */
  _tokenize(text) {
    if (!text) return [];
    // 简单分词：按标点和空格分割，转小写
    return text
      .toLowerCase()
      .split(/[\s,，.。;；:：!?！？、\/\[\]()（）]+/)
      .filter(word => word.length > 1 && word.length < 20);
  }
}

/**
 * 知识库服务类
 */
class KnowledgeService {
  constructor() {
    this.entries = [];
    this.embeddings = [];
    this.vectorizer = new SimpleVectorEmbedding();
    this.isInitialized = false;
    // AI 嵌入配置
    this.aiEmbeddingConfig = null;
    this.useAIEmbedding = false;
  }

  /**
   * 获取 AI 嵌入配置
   */
  _loadAIEmbeddingConfig() {
    try {
      const saved = localStorage.getItem('vdt_knowledge_ai_config');
      if (saved) {
        const config = JSON.parse(saved);
        if (config.enabled && config.url && config.apiKey) {
          // 解密 API Key
          try {
            config.apiKey = atob(config.apiKey); // 解密
          } catch (e) {
            // 如果不是 base64，可能是旧数据，保持原样
          }
          this.aiEmbeddingConfig = config;
          this.useAIEmbedding = true;
          console.log('[KnowledgeService] 使用 AI 嵌入配置');
          return config;
        }
      }
      // 尝试使用现有 AI 调参配置
      const aiConfig = localStorage.getItem('vdt_ai_config');
      if (aiConfig) {
        const config = JSON.parse(aiConfig);
        if (config.url && config.apiKey) {
          this.aiEmbeddingConfig = {
            url: config.url,
            apiKey: config.apiKey,
            model: config.model || 'text-embedding-ada-002',
            dimension: 1536
          };
          this.useAIEmbedding = true;
          console.log('[KnowledgeService] 使用现有 AI 调参配置进行嵌入');
          return this.aiEmbeddingConfig;
        }
      }
      console.log('[KnowledgeService] 使用 TF-IDF 向量化');
      this.useAIEmbedding = false;
      return null;
    } catch (error) {
      console.error('[KnowledgeService] 加载 AI 配置失败:', error);
      this.useAIEmbedding = false;
      return null;
    }
  }

  /**
   * 使用 AI 生成文本嵌入
   */
  async _generateAIEmbedding(text) {
    if (!this.aiEmbeddingConfig) return null;

    try {
      // 构建请求头
      const headers = {
        'Content-Type': 'application/json'
      };

      // 如果有 API Key，添加认证
      if (this.aiEmbeddingConfig.apiKey && this.aiEmbeddingConfig.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${this.aiEmbeddingConfig.apiKey}`;
      }

      // 检测是否是本地部署（Ollama 等）
      const isLocal = this.aiEmbeddingConfig.url.includes('localhost') ||
                      this.aiEmbeddingConfig.url.includes('127.0.0.1') ||
                      this.aiEmbeddingConfig.url.includes('ollama');

      const requestBody = isLocal
        ? {
            // Ollama / LM Studio 格式
            model: this.aiEmbeddingConfig.embeddingModel,
            prompt: text,
            input: text
          }
        : {
            // OpenAI 标准格式
            model: this.aiEmbeddingConfig.embeddingModel || 'text-embedding-ada-002',
            input: text
          };

      const response = await fetch(this.aiEmbeddingConfig.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`AI API 错误：${response.statusText}`);
      }

      const data = await response.json();

      // 兼容不同 API 格式
      const embedding = data.data?.[0]?.embedding ||   // OpenAI 格式
                        data.embedding ||                // Ollama 格式
                        null;

      return embedding;
    } catch (error) {
      console.error('[KnowledgeService] AI 嵌入失败:', error);
      return null;
    }
  }

  /**
   * 初始化知识库
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // 加载 AI 嵌入配置
      this._loadAIEmbeddingConfig();

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // 将纯 JSON 对象转换为 KnowledgeEntry 实例
        this.entries = (data.entries || []).map(e => new KnowledgeEntry(e));
        this.embeddings = data.embeddings || [];
      }

      // 如果使用 AI 嵌入，不需要训练 TF-IDF
      if (this.useAIEmbedding) {
        console.log('[KnowledgeService] 使用 AI 嵌入模式');
      } else {
        // 重新训练向量化器（TF-IDF 模式）
        if (this.entries.length > 0) {
          const documents = this.entries.map(e => this._entryToText(e));
          this.vectorizer.fit(documents);
        }
      }

      this.isInitialized = true;
      console.log(`[KnowledgeService] 初始化完成，共${this.entries.length}条知识，模式：${this.useAIEmbedding ? 'AI 嵌入' : 'TF-IDF'}`);
    } catch (error) {
      console.error('[KnowledgeService] 初始化失败:', error);
      this.entries = [];
      this.embeddings = [];
    }
  }

  /**
   * 保存知识库到本地存储
   */
  _save() {
    try {
      const data = {
        entries: this.entries.map(e => {
          // 如果是 KnowledgeEntry 实例，调用 toJSON()
          // 否则直接返回（已经是纯对象）
          return typeof e.toJSON === 'function' ? e.toJSON() : e;
        }),
        embeddings: this.embeddings,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[KnowledgeService] 保存失败:', error);
    }
  }

  /**
   * 将知识库条目转换为文本（用于向量化）
   */
  _entryToText(entry) {
    const parts = [
      entry.title,
      entry.description,
      entry.industry,
      entry.scenario,
      entry.tags ? entry.tags.join(' ') : '',
      entry.factors ? entry.factors.map(f => `${f.factorName}:${f.factorType}`).join(' ') : ''
    ];
    return parts.filter(p => p).join(' ');
  }

  /**
   * 添加知识库条目
   * @param {Object} entryData - 条目数据
   * @returns {KnowledgeEntry} 新条目
   */
  async addEntry(entryData) {
    const entry = new KnowledgeEntry(entryData);

    // 如果没有 embedding，重新计算所有向量化
    if (!entryData.embedding || entryData.embedding.length === 0) {
      this.entries.push(entry);

      // 使用 AI 嵌入或 TF-IDF
      if (this.useAIEmbedding) {
        await this._recomputeAIEmbeddings();
      } else {
        this._recomputeEmbeddings();
      }
    } else {
      this.entries.push(entry);
      this.embeddings.push(entry.embedding);
    }

    this._save();
    console.log('[KnowledgeService] 添加条目:', entry.id);
    return entry;
  }

  /**
   * 使用 AI 重新计算所有嵌入
   */
  async _recomputeAIEmbeddings() {
    console.log('[KnowledgeService] 使用 AI 重新计算嵌入...');
    this.embeddings = [];

    for (const entry of this.entries) {
      const text = this._entryToText(entry);
      const embedding = await this._generateAIEmbedding(text);
      if (embedding) {
        this.embeddings.push(embedding);
      } else {
        // 降级为零向量
        this.embeddings.push(new Array(this.aiEmbeddingConfig?.dimension || 1536).fill(0));
      }
    }

    this._save();
  }

  /**
   * 更新知识库条目
   * @param {string} entryId - 条目 ID
   * @param {Object} updates - 更新内容
   * @returns {KnowledgeEntry|null} 更新后的条目
   */
  updateEntry(entryId, updates) {
    const index = this.entries.findIndex(e => e.id === entryId);
    if (index === -1) return null;

    const entry = this.entries[index];
    Object.assign(entry, updates, { updatedAt: new Date().toISOString() });
    this.entries[index] = entry;

    // 重新计算向量化
    this._recomputeEmbeddings();
    this._save();

    console.log('[KnowledgeService] 更新条目:', entryId);
    return entry;
  }

  /**
   * 删除知识库条目
   * @param {string} entryId - 条目 ID
   * @returns {boolean} 是否成功删除
   */
  deleteEntry(entryId) {
    const index = this.entries.findIndex(e => e.id === entryId);
    if (index === -1) return false;

    this.entries.splice(index, 1);
    this.embeddings.splice(index, 1);

    this._recomputeEmbeddings();
    this._save();

    console.log('[KnowledgeService] 删除条目:', entryId);
    return true;
  }

  /**
   * 获取所有知识库条目
   * @returns {KnowledgeEntry[]} 条目列表
   */
  getAllEntries() {
    return [...this.entries];
  }

  /**
   * 根据 ID 获取条目
   * @param {string} entryId - 条目 ID
   * @returns {KnowledgeEntry|null}
   */
  getEntry(entryId) {
    return this.entries.find(e => e.id === entryId) || null;
  }

  /**
   * 相似度检索
   * @param {string} query - 查询文本
   * @param {number} topK - 返回数量
   * @param {number} threshold - 相似度阈值
   * @returns {Array} 检索结果（带相似度分数）
   */
  async search(query, topK = 3, threshold = 0.1) {
    if (this.entries.length === 0) return [];

    let queryVector;

    // 使用 AI 嵌入或 TF-IDF
    if (this.useAIEmbedding) {
      // 使用 AI 生成查询向量
      queryVector = await this._generateAIEmbedding(query);
      if (!queryVector) {
        console.warn('[KnowledgeService] AI 嵌入失败，降级到 TF-IDF');
        // 降级到 TF-IDF
        queryVector = this.vectorizer.transform(this._entryToText({
          title: query,
          description: query,
          scenario: query,
          factors: []
        }));
      }
    } else {
      // 使用 TF-IDF
      queryVector = this.vectorizer.transform(this._entryToText({
        title: query,
        description: query,
        scenario: query,
        factors: []
      }));
    }

    if (queryVector.length === 0) return [];

    // 计算余弦相似度
    const results = [];
    this.embeddings.forEach((embedding, index) => {
      const similarity = this._cosineSimilarity(queryVector, embedding);
      if (similarity >= threshold) {
        results.push({
          ...this.entries[index].toJSON(),
          similarity: similarity
        });
      }
    });

    // 按相似度降序排序
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, topK);
  }

  /**
   * 从文档内容创建知识库条目
   * @param {string} content - 文档内容
   * @param {Object} metadata - 元数据（文件名、类型等）
   * @returns {KnowledgeEntry} 创建的条目
   */
  createEntryFromDocument(content, metadata = {}) {
    // 简单解析：提取标题和关键信息
    const lines = content.split('\n').filter(l => l.trim());
    const title = lines[0]?.substring(0, 50) || metadata.filename || '未命名知识';

    // 提取场景关键词（简单实现）
    const scenarioKeywords = this._extractKeywords(content);

    const entry = new KnowledgeEntry({
      title: title,
      description: content.substring(0, 500),
      industry: metadata.industry || '通用',
      scenario: scenarioKeywords.join(', '),
      factors: [], // 需要 AI 进一步解析
      sourceDocument: {
        filename: metadata.filename,
        type: metadata.type,
        size: metadata.size,
        uploadedAt: new Date().toISOString()
      },
      tags: scenarioKeywords
    });

    return this.addEntry(entry);
  }

  /**
   * 从文本中提取关键词
   * 智能模式：基于用户模型中的指标/因子名称进行匹配提取
   * @param {string} text - 输入文本
   * @param {Object} options - 选项
   * @param {Array} options.modelFactors - 用户模型中的驱动因子列表（用于匹配）
   * @param {Array} options.modelIndicators - 用户模型中的计算指标列表（用于匹配）
   * @returns {string[]} 提取的关键词
   */
  _extractKeywords(text, options = {}) {
    const keywords = [];
    const { modelFactors = [], modelIndicators = [], customKeywords = [] } = options;

    // 1. 优先匹配用户模型中的指标/因子名称（最重要！）
    const modelNames = [
      ...modelFactors.map(f => f.name || f.factorName || f),
      ...modelIndicators.map(i => i.name || i.indicatorName || i)
    ];

    modelNames.forEach(name => {
      if (name && text.toLowerCase().includes(name.toLowerCase())) {
        keywords.push(name);
      }
    });

    // 2. 用户自定义关键词
    if (customKeywords && Array.isArray(customKeywords)) {
      keywords.push(...customKeywords);
    }

    // 3. 基础兜底：通用业务关键词（只在没有模型数据时使用）
    if (modelNames.length === 0) {
      const genericPatterns = [
        /Q[1-4]/g,
        /季度 | 旺季 | 淡季 | 年初 | 年中 | 年末/g,
        /增长 | 提升 | 降低 | 优化 | 改善 | 下滑/g,
        /利润 | 收入 | 成本 | 费用 | 毛利 | 净利/g,
        /销售 | 营销 | 推广 | 广告 | 渠道 | 客户/g,
        /研发 | 产品 | 技术 | 创新/g,
        /管理 | 行政 | 人力 | 组织 | 流程/g,
        /财务 | 资金 | 融资 | 投资 | 现金流/g
      ];

      genericPatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          keywords.push(...[...new Set(matches)]);
        }
      });
    }

    // 4. 动态关键词：从文本中自动提取高频词（补充）
    const wordFreq = new Map();
    const words = text
      .toLowerCase()
      .split(/[\s,，.。;；:：!?！？、\/\[\]()（）]+/)
      .filter(word => word.length > 1 && word.length < 20);

    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // 取高频词 Top 5 作为补充
    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    keywords.push(...topWords);

    // 去重并限制数量
    return [...new Set(keywords)].slice(0, 30);
  }

  /**
   * 使用 AI 智能提取知识库元数据
   * @param {string} content - 文档内容
   * @param {Object} modelData - 用户模型数据（包含指标和因子）
   * @param {Object} aiService - AI 服务实例
   * @returns {Promise<Object>} 提取的元数据
   */
  async extractMetadataWithAI(content, modelData, aiService) {
    if (!aiService) {
      // 降级方案：使用基础提取
      return this._extractBasicMetadata(content, modelData);
    }

    const prompt = `请分析以下文档内容，并提取与用户指标模型相关的信息。

【用户模型结构】
驱动因子：${JSON.stringify(modelData.factors || [])}
计算指标：${JSON.stringify(modelData.indicators || [])}

【文档内容】
${content.substring(0, 5000)}

请按以下 JSON 格式返回：
{
  "title": "文档标题（简洁概括）",
  "scenario": "业务场景描述（如 Q4 旺季促销、利润提升计划等）",
  "relatedFactors": ["与文档相关的因子名称列表"],
  "adjustmentSuggestions": [
    {
      "factorName": "因子名称",
      "adjustmentType": "increase|decrease|maintain",
      "reason": "调整理由"
    }
  ],
  "tags": ["关键词标签"]
}`;

    try {
      const response = await aiService.callAI({
        system: '你是一个专业的业务知识提取助手，擅长从文档中识别与用户指标模型相关的信息。',
        user: prompt,
        temperature: 0.3
      });

      // 尝试解析 JSON 响应
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return this._extractBasicMetadata(content, modelData);
    } catch (error) {
      console.error('[KnowledgeService] AI 提取失败:', error);
      return this._extractBasicMetadata(content, modelData);
    }
  }

  /**
   * 基础元数据提取（降级方案）
   */
  _extractBasicMetadata(content, modelData = {}) {
    const lines = content.split('\n').filter(l => l.trim());
    const scenarioKeywords = this._extractKeywords(content, {
      modelFactors: modelData.factors || [],
      modelIndicators: modelData.indicators || []
    });

    return {
      title: lines[0]?.substring(0, 50) || '未命名文档',
      scenario: scenarioKeywords.slice(0, 5).join(', '),
      relatedFactors: [],
      adjustmentSuggestions: [],
      tags: scenarioKeywords
    };
  }

  /**
   * 重新计算所有条目的向量化
   */
  _recomputeEmbeddings() {
    const documents = this.entries.map(e => this._entryToText(e));
    this.embeddings = this.vectorizer.fitTransform(documents);
  }

  /**
   * 计算余弦相似度
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 清空知识库
   */
  clear() {
    this.entries = [];
    this.embeddings = [];
    this.vectorizer = new SimpleVectorEmbedding();
    localStorage.removeItem(STORAGE_KEY);
    console.log('[KnowledgeService] 知识库已清空');
  }

  /**
   * 导出知识库
   * @returns {Object} JSON 数据
   */
  export() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      entries: this.entries.map(e => e.toJSON()),
      count: this.entries.length
    };
  }

  /**
   * 导入知识库
   * @param {Object} data - 导入的数据
   */
  import(data) {
    if (!data.entries || !Array.isArray(data.entries)) {
      throw new Error('无效的导入数据格式');
    }

    this.entries = data.entries.map(e => new KnowledgeEntry(e));
    this._recomputeEmbeddings();
    this._save();
    console.log(`[KnowledgeService] 导入${this.entries.length}条知识`);
  }
}

// 导出单例
export const knowledgeService = new KnowledgeService();

// 工具函数：计算两个文本的相似度
export const computeTextSimilarity = async (text1, text2) => {
  const localVectorizer = new SimpleVectorEmbedding();
  localVectorizer.fit([text1, text2]);
  const v1 = localVectorizer.transform(text1);
  const v2 = localVectorizer.transform(text2);

  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export default knowledgeService;
