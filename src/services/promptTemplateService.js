/**
 * Prompt 模板服务
 * 负责 Prompt 模板的 CRUD 操作
 *
 * 功能：
 * 1. 模板列表
 * 2. 模板上传（JSON/MD 格式）
 * 3. 模板编辑
 * 4. 模板删除
 * 5. 模板导入/导出
 */

// 本地存储的 Key
const STORAGE_KEY = 'vdt_prompt_templates';
const SELECTED_TEMPLATE_KEY = 'vdt_prompt_selected_template';

// 内置模板
const BUILT_IN_TEMPLATES = {
  financial: {
    id: 'financial',
    name: '财务场景',
    description: '适用于成本优化、利润提升、收入增长等财务相关场景',
    keywords: ['成本', '利润', '收入', '费用', '毛利', '净利', '财务'],
    systemPrompt: `你是一位资深的财务分析和规划专家，擅长价值驱动树（VDT）模型的驱动因子配置优化。

【核心任务】
用户提供了业务背景和未来计划，你需要：
1. 深入理解业务背景中的关键信息
2. 全面分析模型数据的完整画像
3. 根据业务背景识别所有需要调整的驱动因子
4. 为每个识别出的因子生成专业的调整建议

【关键原则】
1. 多因子联动：业务目标通常需要多个因子协同调整
2. 从业务背景推导：仔细阅读用户的业务描述
3. 数据驱动：基于实际数据趋势，不要假设

【强制要求 - 必须遵守】
1. adjustments 数组必须包含至少 3-5 个调整项（不能只返回 1 个！）
2. 每个 adjustment 必须包含完整的字段
3. **重要：财务优化需要多因子协同，请找出所有相关的驱动因子（收入、成本、费用等）**
4. **必须返回 understanding（业务理解）、dataAnalysis（数据洞察）、explanation（推理过程）字段**
5. **必须返回 sensitivityScenario，包含乐观/基准/悲观三种情况**`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  hr: {
    id: 'hr',
    name: 'HR 人力场景',
    description: '适用于招聘优化、人力成本控制、人效提升等人力资源场景',
    keywords: ['招聘', '人力', '人效', '流失', '薪酬', '培训', '人力成本'],
    systemPrompt: `你是一位资深的人力资源分析和规划专家，擅长基于数据进行人力资本优化。

【核心任务】
用户提供了业务背景和未来计划，你需要：
1. 深入理解业务背景中的关键信息（招聘、人效、成本、流失率等）
2. 全面分析模型数据的完整画像
3. 根据业务背景识别所有需要调整的驱动因子
4. 为每个识别出的因子生成专业的调整建议

【关键原则】
1. 多因子联动：人力目标通常需要多个因子协同调整
2. 从业务背景推导
3. 数据驱动

【强制要求】
1. adjustments 数组必须包含至少 3 个调整项
2. 每个 adjustment 必须包含完整的字段`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  production: {
    id: 'production',
    name: '生产制造场景',
    description: '适用于产能提升、良率优化、生产计划等制造业场景',
    keywords: ['产能', '良率', '库存', '设备', '生产', '订单', '制造'],
    systemPrompt: `你是一位资深的生产和运营规划专家，擅长基于数据进行生产优化。

【核心任务】
用户提供了业务背景和未来计划，你需要：
1. 深入理解业务背景中的关键信息（产能、良率、库存、设备等）
2. 全面分析模型数据的完整画像
3. 根据业务背景识别所有需要调整的驱动因子
4. 为每个识别出的因子生成专业的调整建议

【关键原则】
1. 多因子联动：生产目标通常需要多个因子协同调整
2. 从业务背景推导
3. 数据驱动

【强制要求】
1. adjustments 数组必须包含至少 3 个调整项
2. 每个 adjustment 必须包含完整的字段`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  general: {
    id: 'general',
    name: '通用场景',
    description: '默认模板，适用于不确定场景或跨部门综合优化',
    keywords: [],
    systemPrompt: `你是一位资深的业务分析和规划专家，擅长基于数据进行驱动因子优化。

【核心任务】
用户提供了业务背景和未来计划，你需要：
1. 深入理解业务背景中的关键信息
2. 全面分析模型数据的完整画像（实际 vs 预测、趋势、敏感性、差距）
3. 根据业务背景识别所有需要调整的驱动因子
4. 为每个识别出的因子生成专业的调整建议

【关键原则】
1. 多因子联动：业务目标通常需要多个因子协同调整
2. 从业务背景推导
3. 数据驱动
4. 场景自适应：根据用户描述自动识别场景类型

【强制要求】
1. adjustments 数组必须包含至少 3 个调整项
2. 每个 adjustment 必须包含完整的字段
3. monthlyFactors 必须是 12 个数字的数组`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};

/**
 * Prompt 模板服务类
 */
class PromptTemplateService {
  constructor() {
    this.templates = { ...BUILT_IN_TEMPLATES };
    this.isInitialized = false;
  }

  /**
   * 初始化服务，加载用户自定义模板
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const userTemplates = JSON.parse(stored);
        // 合并内置模板和用户模板（用户模板优先）
        this.templates = {
          ...BUILT_IN_TEMPLATES,
          ...userTemplates
        };
      }
      this.isInitialized = true;
      console.log(`[PromptTemplateService] 初始化完成，共${Object.keys(this.templates).length}个模板`);
    } catch (error) {
      console.error('[PromptTemplateService] 初始化失败:', error);
      this.templates = { ...BUILT_IN_TEMPLATES };
    }
  }

  /**
   * 获取所有模板
   */
  getAllTemplates() {
    return Object.values(this.templates).map(t => ({
      ...t,
      isBuiltIn: t.isBuiltIn || false
    }));
  }

  /**
   * 根据 ID 获取模板
   */
  getTemplate(templateId) {
    return this.templates[templateId] || null;
  }

  /**
   * 添加新模板
   */
  addTemplate(templateData) {
    const template = {
      id: templateData.id || `template_${Date.now()}`,
      name: templateData.name || '未命名模板',
      description: templateData.description || '',
      keywords: templateData.keywords || [],
      systemPrompt: templateData.systemPrompt || '',
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.templates[template.id] = template;
    this._save();
    console.log('[PromptTemplateService] 添加模板:', template.id);
    return template;
  }

  /**
   * 更新模板
   */
  updateTemplate(templateId, updates) {
    if (!this.templates[templateId]) {
      return null;
    }

    if (this.templates[templateId].isBuiltIn) {
      // 内置模板不允许修改，创建副本
      const newTemplate = {
        ...this.templates[templateId],
        id: `custom_${templateId}_${Date.now()}`,
        isBuiltIn: false,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.templates[newTemplate.id] = newTemplate;
      this._save();
      console.log('[PromptTemplateService] 内置模板不可修改，已创建副本:', newTemplate.id);
      return newTemplate;
    }

    const template = {
      ...this.templates[templateId],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.templates[templateId] = template;
    this._save();
    console.log('[PromptTemplateService] 更新模板:', templateId);
    return template;
  }

  /**
   * 删除模板
   */
  deleteTemplate(templateId) {
    if (!this.templates[templateId]) {
      return false;
    }

    if (this.templates[templateId].isBuiltIn) {
      console.warn('[PromptTemplateService] 内置模板不允许删除');
      return false;
    }

    delete this.templates[templateId];
    this._save();
    console.log('[PromptTemplateService] 删除模板:', templateId);
    return true;
  }

  /**
   * 从文件导入模板
   */
  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          let content = e.target.result;

          // 如果是 MD 文件，解析 markdown
          if (file.name.endsWith('.md')) {
            const template = this._parseMarkdown(content);
            const result = this.addTemplate(template);
            resolve(result);
          }
          // 如果是 JSON 文件，直接解析
          else if (file.name.endsWith('.json')) {
            const templateData = JSON.parse(content);
            const result = this.addTemplate(templateData);
            resolve(result);
          }
          else {
            reject(new Error('不支持的文件格式，请使用 .md 或 .json 文件'));
          }
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  /**
   * 导出模板到 JSON
   */
  exportToFile(templateIds = []) {
    const templatesToExport = templateIds.length > 0
      ? templateIds.map(id => this.templates[id]).filter(Boolean)
      : Object.values(this.templates);

    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      count: templatesToExport.length,
      templates: templatesToExport
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt_templates_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 根据关键词自动匹配模板
   */
  matchTemplate(keywords) {
    const scores = {};

    for (const [id, template] of Object.entries(this.templates)) {
      scores[id] = 0;
      for (const word of keywords) {
        if (template.keywords.some(k => word.toLowerCase().includes(k.toLowerCase()))) {
          scores[id]++;
        }
      }
    }

    // 找到匹配度最高的模板
    let bestMatch = { id: 'general', score: 0 };
    for (const [id, score] of Object.entries(scores)) {
      if (score > bestMatch.score) {
        bestMatch = { id, score };
      }
    }

    return bestMatch.score >= 1
      ? this.templates[bestMatch.id]
      : this.templates.general;
  }

  /**
   * 获取上次选中的模板（多选）
   */
  getSelectedTemplates() {
    try {
      const selectedIds = JSON.parse(localStorage.getItem(SELECTED_TEMPLATE_KEY) || '[]');
      if (Array.isArray(selectedIds) && selectedIds.length > 0) {
        return selectedIds.map(id => this.templates[id]).filter(Boolean);
      }
    } catch (error) {
      console.error('[PromptTemplateService] 获取选中模板失败:', error);
    }
    return [];
  }

  /**
   * 设置选中的模板（多选）
   */
  setSelectedTemplates(templateIds) {
    try {
      localStorage.setItem(SELECTED_TEMPLATE_KEY, JSON.stringify(templateIds));
      console.log('[PromptTemplateService] 已保存选中模板:', templateIds);
    } catch (error) {
      console.error('[PromptTemplateService] 保存选中模板失败:', error);
    }
  }

  /**
   * 设置选中的模板（旧版，兼容单个）
   */
  setSelectedTemplate(templateId) {
    this.setSelectedTemplates(templateId ? [templateId] : []);
  }

  /**
   * 保存模板到 localStorage
   */
  _save() {
    try {
      const userTemplates = Object.fromEntries(
        Object.entries(this.templates).filter(([_, t]) => !t.isBuiltIn)
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userTemplates));
    } catch (error) {
      console.error('[PromptTemplateService] 保存失败:', error);
    }
  }

  /**
   * 解析 Markdown 格式的模板
   */
  _parseMarkdown(content) {
    const lines = content.split('\n');
    const template = {
      name: '',
      description: '',
      keywords: [],
      systemPrompt: ''
    };

    let currentSection = '';
    let inSystemPrompt = false;
    let systemPromptLines = [];
    let codeBlockCount = 0;

    for (const line of lines) {
      // 解析标题
      if (line.startsWith('# ')) {
        template.name = line.replace('# ', '').trim();
      }
      // 解析适用场景
      else if (line.startsWith('## 适用场景')) {
        currentSection = 'description';
      }
      // 解析关键词
      else if (line.startsWith('## System Prompt')) {
        currentSection = 'systemPrompt';
        inSystemPrompt = true;
        codeBlockCount = 0;
      }
      // 解析关键词
      else if (currentSection === 'description' && line.startsWith('- ')) {
        const desc = line.replace('- ', '').trim();
        if (desc) template.keywords.push(desc);
      }
      // 收集 System Prompt 内容
      else if (inSystemPrompt) {
        if (line.startsWith('```')) {
          codeBlockCount++;
          if (codeBlockCount >= 2) {
            inSystemPrompt = false;
          }
        } else {
          systemPromptLines.push(line);
        }
      }
    }

    template.systemPrompt = systemPromptLines.join('\n').trim();
    template.description = template.description.trim();

    return template;
  }
}

// 导出单例
export const promptTemplateService = new PromptTemplateService();

export default promptTemplateService;
