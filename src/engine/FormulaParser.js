/**
 * 公式解析器
 * 解析类似 Excel 的公式字符串，提取依赖节点并生成可执行函数
 * 支持中文节点 ID
 */
export class FormulaParser {
  // 保留的函数名称列表
  static RESERVED_FUNCTIONS = [
    'SUM', 'AVG', 'AVERAGE', 'IF', 'MAX', 'MIN',
    'SQRT', 'POW', 'ABS', 'ROUND',
    'MONTHLY_SUM', 'MONTHLY_AVG',
    'MONTHLY_MIN', 'MONTHLY_MAX',
    'MONTHLY_COUNT', 'MONTHLY_COUNT_NONZERO', 'MONTHLY_COUNT_EXISTS', 'MONTHLY_DISTINCT'
  ];

  // MONTHLY 函数列表
  static MONTHLY_FUNCTIONS = [
    'MONTHLY_SUM',
    'MONTHLY_AVG',
    'MONTHLY_MIN',
    'MONTHLY_MAX',
    'MONTHLY_COUNT',
    'MONTHLY_COUNT_NONZERO',
    'MONTHLY_COUNT_EXISTS',
    'MONTHLY_DISTINCT'
  ];

  /**
   * 检测公式是否包含任意 MONTHLY 函数
   * @param {string} formula - 公式字符串
   * @returns {boolean} 是否包含 MONTHLY 函数
   */
  static hasMonthlyFunction(formula) {
    if (!formula) return false;
    return this.MONTHLY_FUNCTIONS.some(func =>
      new RegExp(`${func}\\s*\\(`, 'i').test(formula)
    );
  }

  /**
   * 检测公式包含哪个 MONTHLY 函数
   * @param {string} formula - 公式字符串
   * @returns {object|null} { type: 'SUM'|'AVG'|..., funcName: 'MONTHLY_SUM', inner: '...' }
   */
  static detectMonthlyFunction(formula) {
    if (!formula) return null;

    // 按长度从长到短排序，避免部分匹配
    const sortedFuncs = [...this.MONTHLY_FUNCTIONS].sort((a, b) => b.length - a.length);

    for (const funcName of sortedFuncs) {
      const regex = new RegExp(`${funcName}\\s*\\(`, 'i');
      const match = formula.match(regex);
      if (match) {
        const type = funcName.replace('MONTHLY_', '');
        const openParenIndex = match.index + match[0].length - 1;
        const closeParenIndex = this.findMatchingParenthesis(formula, openParenIndex);
        if (closeParenIndex !== -1) {
          const inner = formula.substring(openParenIndex + 1, closeParenIndex).trim();
          return { type, funcName, inner, match, openParenIndex, closeParenIndex };
        }
      }
    }
    return null;
  }

  /**
   * 检测公式是否包含 MONTHLY_SUM 函数（向后兼容）
   * @param {string} formula - 公式字符串
   * @returns {boolean} 是否包含 MONTHLY_SUM
   */
  static hasMonthlySum(formula) {
    if (!formula) return false;
    return /MONTHLY_SUM\s*\(/i.test(formula);
  }

  /**
   * 找到匹配的括号位置
   * @param {string} str - 字符串
   * @param {number} startIndex - 左括号位置
   * @returns {number} 匹配的右括号位置
   */
  static findMatchingParenthesis(str, startIndex) {
    let count = 1;
    let i = startIndex + 1;
    while (i < str.length && count > 0) {
      if (str[i] === '(') count++;
      if (str[i] === ')') count--;
      i++;
    }
    return count === 0 ? i - 1 : -1;
  }

  /**
   * 提取 MONTHLY_SUM 内部的表达式
   * 正确处理嵌套括号
   * @param {string} formula - 完整公式
   * @returns {string|null} 内部表达式，或 null 没找到
   */
  static extractMonthlySumInner(formula) {
    if (!formula) return null;

    const match = formula.match(/MONTHLY_SUM\s*\(/i);
    if (!match) return null;

    const openParenIndex = match.index + match[0].length - 1;
    const closeParenIndex = this.findMatchingParenthesis(formula, openParenIndex);

    if (closeParenIndex === -1) return null;

    return formula.substring(openParenIndex + 1, closeParenIndex).trim();
  }

  /**
   * 提取指定 MONTHLY 函数的内部表达式
   * @param {string} formula - 完整公式
   * @param {string} funcName - 函数名，如 'MONTHLY_SUM'
   * @returns {string|null} 内部表达式
   */
  static extractMonthlyInner(formula, funcName) {
    if (!formula) return null;

    const regex = new RegExp(`${funcName}\\s*\\(`, 'i');
    const match = formula.match(regex);
    if (!match) return null;

    const openParenIndex = match.index + match[0].length - 1;
    const closeParenIndex = this.findMatchingParenthesis(formula, openParenIndex);

    if (closeParenIndex === -1) return null;

    return formula.substring(openParenIndex + 1, closeParenIndex).trim();
  }

  /**
   * 用占位符替换 MONTHLY 函数部分
   * 返回 { formula: 替换后的公式, placeholder: 占位符, inner: 内部表达式, type: 'SUM'|... }
   * @param {string} formula - 完整公式
   * @returns {object} 替换结果
   */
  static replaceMonthlyWithPlaceholder(formula) {
    if (!formula) return { formula, placeholder: null, inner: null, type: null };

    const detected = this.detectMonthlyFunction(formula);
    if (!detected) return { formula, placeholder: null, inner: null, type: null };

    const placeholder = `__MONTHLY_${detected.type}_RESULT__`;
    const before = formula.substring(0, detected.match.index);
    const after = formula.substring(detected.closeParenIndex + 1);
    const newFormula = before + placeholder + after;

    return {
      formula: newFormula,
      placeholder,
      inner: detected.inner,
      type: detected.type,
      funcName: detected.funcName
    };
  }

  /**
   * 用占位符替换 MONTHLY_SUM 部分（向后兼容）
   * 返回 { formula: 替换后的公式, placeholder: 占位符, inner: 内部表达式 }
   * @param {string} formula - 完整公式
   * @returns {object} 替换结果
   */
  static replaceMonthlySumWithPlaceholder(formula) {
    if (!formula) return { formula, placeholder: null, inner: null };

    const match = formula.match(/MONTHLY_SUM\s*\(/i);
    if (!match) return { formula, placeholder: null, inner: null };

    const openParenIndex = match.index + match[0].length - 1;
    const closeParenIndex = this.findMatchingParenthesis(formula, openParenIndex);

    if (closeParenIndex === -1) return { formula, placeholder: null, inner: null };

    const inner = formula.substring(openParenIndex + 1, closeParenIndex).trim();
    const placeholder = '__MONTHLY_SUM_RESULT__';
    const before = formula.substring(0, match.index);
    const after = formula.substring(closeParenIndex + 1);
    const newFormula = before + placeholder + after;

    return { formula: newFormula, placeholder, inner };
  }

  /**
   * 解析公式字符串，提取依赖的节点 ID
   * @param {string} formula - 公式字符串
   * @param {Array<string>} allNodeIds - 所有可用的节点 ID 列表
   * @returns {Array<string>} 依赖的节点 ID 列表
   */
  static extractDependencies(formula, allNodeIds = []) {
    if (!formula) return [];

    let dependencies = [];

    // 如果有所有节点 ID 列表，直接用这个来匹配（最可靠）
    if (allNodeIds && allNodeIds.length > 0) {
      dependencies = allNodeIds.filter(id => {
        if (!id) return false;
        if (this.RESERVED_FUNCTIONS.includes(id.toUpperCase())) return false;
        // 检查公式中是否包含这个 ID（作为完整单词）
        const regex = new RegExp(this.escapeRegex(id), 'g');
        return regex.test(formula);
      });
    } else {
      // 没有节点列表时，尝试匹配中文/英文混合 ID
      // 匹配：中文、英文、数字、下划线的组合
      const regex = /[\p{L}\p{N}_]+/gu;
      const matches = formula.match(regex) || [];

      dependencies = [...new Set(matches)].filter(
        (name) => !this.RESERVED_FUNCTIONS.includes(name.toUpperCase())
      );
    }

    return dependencies;
  }

  /**
   * 转义正则表达式特殊字符
   */
  static escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 将公式转换为可执行的 JavaScript 函数
   * @param {string} formula - 公式字符串
   * @param {Array<string>} allNodeIds - 所有可用的节点 ID
   * @returns {Function} 执行函数，接收节点值对象作为参数
   */
  static compile(formula, allNodeIds = []) {
    if (!formula) {
      return () => 0;
    }

    // 提取依赖
    const dependencies = this.extractDependencies(formula, allNodeIds);

    // 构建执行函数
    return (nodeValues) => {
      try {
        // 简单直接的替换方式
        let expr = formula;

        // 按长度从长到短排序，避免部分匹配问题
        const sortedDeps = [...dependencies].sort((a, b) => b.length - a.length);

        // 替换每个节点 ID 为它的值
        sortedDeps.forEach((dep) => {
          const value = nodeValues[dep] ?? 0;
          const regex = new RegExp(this.escapeRegex(dep), 'g');
          expr = expr.replace(regex, `(${value})`);
        });

        // 现在处理运算符和函数

        // 1. 替换指数运算符：^ 或 ** 都转为 JavaScript 的 **
        expr = expr.replace(/\^/g, '**');

        // 2. 替换数学函数（不区分大小写）
        // SQRT(x) -> Math.sqrt(x)
        expr = expr.replace(/SQRT\s*\(/gi, 'Math.sqrt(');
        // POW(x, y) -> Math.pow(x, y)
        expr = expr.replace(/POW\s*\(/gi, 'Math.pow(');
        // ABS(x) -> Math.abs(x)
        expr = expr.replace(/ABS\s*\(/gi, 'Math.abs(');
        // MAX(x, y, ...) -> Math.max(x, y, ...)
        expr = expr.replace(/MAX\s*\(/gi, 'Math.max(');
        // MIN(x, y, ...) -> Math.min(x, y, ...)
        expr = expr.replace(/MIN\s*\(/gi, 'Math.min(');
        // ROUND(x, d) -> Math.round(x * 10^d) / 10^d 或者简单用 Math.round
        // 先处理 ROUND(x, d) 形式
        expr = expr.replace(/ROUND\s*\(([^,]+),\s*([^)]+)\)/gi, 'Math.round(($1) * Math.pow(10, $2)) / Math.pow(10, $2)');
        // 再处理 ROUND(x) 形式
        expr = expr.replace(/ROUND\s*\(([^)]+)\)/gi, 'Math.round($1)');

        // 3. 替换 IF 函数：IF(condition, trueVal, falseVal) -> (condition) ? (trueVal) : (falseVal)
        // 简单的 IF 替换，处理嵌套可能复杂，这里处理简单情况
        let ifExpr = expr;
        let maxIterationsIf = 10;
        let iteration = 0;
        while (/IF\s*\(/i.test(ifExpr) && iteration < maxIterationsIf) {
          ifExpr = ifExpr.replace(/IF\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi, '(($1) ? ($2) : ($3))');
          iteration++;
        }
        expr = ifExpr;

        // 4. 处理 SUM 和 AVG/AVERAGE 函数
        // 简单的聚合函数（注意：这些函数在普通计算模式下只是简单的数学函数）
        // SUM(a, b, c) -> (a) + (b) + (c)
        // AVG(a, b, c) -> ((a) + (b) + (c)) / 3
        expr = this.replaceAggregateFunctions(expr);

        // 5. 移除 MONTHLY_* 包装（在普通计算模式下，直接计算内部表达式）
        // MONTHLY_SUM(...) -> (...)
        // MONTHLY_AVG(...) -> (...)
        // 等等...
        // 注意：对于 Calculator.compile 调用，我们实际上不需要真正计算 MONTHLY 函数
        // 因为 MONTHLY 节点会在 _recalculate 中被单独处理
        // 这里简单地把 MONTHLY 函数替换成内部表达式即可
        let tempExpr = expr;
        this.MONTHLY_FUNCTIONS.forEach(funcName => {
          // 简单替换：MONTHLY_SUM(xxx) -> (xxx)
          const regex = new RegExp(`${funcName}\\s*\\(`, 'gi');
          tempExpr = tempExpr.replace(regex, '(');
        });
        expr = tempExpr;

        // 现在 expr 变成了纯数字公式，比如 "(10000) * (0.05)"
        // eslint-disable-next-line no-new-func
        const fn = new Function(`return ${expr}`);
        const result = fn();
        return isNaN(result) ? 0 : result;
      } catch (e) {
        console.error('公式执行错误:', e, formula);
        return 0;
      }
    };
  }

  /**
   * 替换聚合函数 SUM、AVG、AVERAGE
   */
  static replaceAggregateFunctions(expr) {
    let result = expr;

    // 处理 SUM
    let sumMatch;
    let maxIterations = 10;
    let iteration = 0;
    while ((sumMatch = result.match(/SUM\s*\(([^)]+)\)/i)) && iteration < maxIterations) {
      const args = sumMatch[1].split(',').map(s => s.trim());
      const sumExpr = args.map(a => `(${a})`).join(' + ');
      result = result.replace(sumMatch[0], `(${sumExpr})`);
      iteration++;
    }

    // 处理 AVG 和 AVERAGE
    const avgRegex = /AVG\s*\(([^)]+)\)|AVERAGE\s*\(([^)]+)\)/i;
    iteration = 0;
    let avgMatch;
    while ((avgMatch = result.match(avgRegex)) && iteration < maxIterations) {
      const argsStr = avgMatch[1] || avgMatch[2];
      const args = argsStr.split(',').map(s => s.trim());
      const sumExpr = args.map(a => `(${a})`).join(' + ');
      const avgExpr = `((${sumExpr}) / ${args.length})`;
      result = result.replace(avgMatch[0], avgExpr);
      iteration++;
    }

    return result;
  }
}
