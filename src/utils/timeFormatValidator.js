/**
 * 时间格式校验工具
 * 支持年度、季度、月度、周度、日报五种时间维度的格式校验
 * 包含平年/闰年、大小月、日期范围等详细校验
 */

/**
 * 时间格式定义
 */
export const TIME_FORMATS = {
  year:   { pattern: /^\d{4}$/,              name: '年度',   example: '2026' },
  quarter:{ pattern: /^\d{4}Q[1-4]$/,        name: '季度',   example: '2026Q1' },
  month:  { pattern: /^\d{6}$/,              name: '月度',   example: '202601' },
  week:   { pattern: /^\d{4}WK\d{2}$/,       name: '周度',   example: '2026WK01' },
  day:    { pattern: /^\d{8}$/,              name: '日报',   example: '20260115' }
};

/**
 * 大月（31 天）：1,3,5,7,8,10,12 月
 * 小月（30 天）：4,6,9,11 月
 * 特殊月：2 月（平年 28 天，闰年 29 天）
 */
const BIG_MONTHS = [1, 3, 5, 7, 8, 10, 12];
const SMALL_MONTHS = [4, 6, 9, 11];

/**
 * 判断是否为闰年
 * @param {number} year - 年份
 * @returns {boolean} 是否闰年
 */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * 获取指定年份月份的最大天数
 * @param {number} year - 年份
 * @param {number} month - 月份（1-12）
 * @returns {number} 最大天数
 */
export function getMaxDaysInMonth(year, month) {
  if (BIG_MONTHS.includes(month)) return 31;
  if (SMALL_MONTHS.includes(month)) return 30;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return 0;
}

/**
 * 校验日期是否有效（包括年月日范围检查）
 * @param {number} year - 年份
 * @param {number} month - 月份
 * @param {number} day - 日期
 * @returns {{ valid: boolean, error?: string }}
 */
export function isValidDate(year, month, day) {
  if (month < 1 || month > 12) {
    return { valid: false, error: `月份${month}超出范围 (1-12)` };
  }

  const maxDays = getMaxDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    const leapInfo = month === 2 ? `（${year}年是${isLeapYear(year) ? '闰年' : '平年'}，2 月最多${maxDays}天）` : '';
    return { valid: false, error: `${year}年${month}月没有${day}日${leapInfo}，该月最多${maxDays}天` };
  }

  return { valid: true };
}

/**
 * 检测时间字符串的格式类型
 * @param {string} timeStr - 时间字符串
 * @returns {string|null} 格式类型：'year'|'quarter'|'month'|'week'|'day'，无法识别返回 null
 */
export function detectTimeFormat(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;

  const str = timeStr.trim();

  for (const [type, config] of Object.entries(TIME_FORMATS)) {
    if (config.pattern.test(str)) {
      return type;
    }
  }

  return null;
}

/**
 * 校验单个时间字符串是否符合指定格式
 * 包含详细的范围校验（月份 01-12、日期 01-31、季度 1-4、周 01-52 等）
 * @param {string} timeStr - 时间字符串
 * @param {string} expectedType - 期望的格式类型
 * @returns {{ valid: boolean, error?: string, detectedType?: string|null }}
 */
export function validateTimeFormat(timeStr, expectedType) {
  if (!timeStr || typeof timeStr !== 'string') {
    return {
      valid: false,
      error: '时间字符串为空或格式不正确',
      detectedType: null
    };
  }

  const detectedType = detectTimeFormat(timeStr);

  if (!detectedType) {
    return {
      valid: false,
      error: `无法识别的时间格式：${timeStr}`,
      detectedType: null
    };
  }

  if (expectedType && detectedType !== expectedType) {
    return {
      valid: false,
      error: `时间格式不匹配：期望${TIME_FORMATS[expectedType]?.name}（${TIME_FORMATS[expectedType]?.example}），实际检测到${TIME_FORMATS[detectedType]?.name}（${timeStr}）`,
      detectedType
    };
  }

  // 额外范围校验
  const rangeError = validateTimeRangeValue(timeStr, detectedType);
  if (rangeError) {
    return {
      valid: false,
      error: rangeError,
      detectedType
    };
  }

  return {
    valid: true,
    detectedType
  };
}

/**
 * 校验时间值的有效范围（月份、日期、季度、周数等）
 * @param {string} timeStr - 时间字符串
 * @param {string} type - 时间类型
 * @returns {string|null} 错误信息，无错误返回 null
 */
function validateTimeRangeValue(timeStr, type) {
  switch (type) {
    case 'month': {
      // 月度格式：YYYYMM，校验月份 01-12
      const monthStr = timeStr.slice(4, 6);
      const month = parseInt(monthStr, 10);
      if (month < 1 || month > 12) {
        return `月份${monthStr}超出有效范围 (01-12)`;
      }
      return null;
    }

    case 'quarter': {
      // 季度格式：YYYYQ#，校验季度 1-4
      const quarterStr = timeStr.slice(5, 6);
      const quarter = parseInt(quarterStr, 10);
      if (quarter < 1 || quarter > 4) {
        return `季度${quarter}超出有效范围 (1-4)`;
      }
      return null;
    }

    case 'week': {
      // 周度格式：YYYYWK##，校验周数 01-53
      const weekStr = timeStr.slice(6, 8);
      const week = parseInt(weekStr, 10);
      if (week < 1 || week > 53) {
        return `周数${week}超出有效范围 (01-53)`;
      }
      return null;
    }

    case 'day': {
      // 日度格式：YYYYMMDD，校验完整的日期
      const yearStr = timeStr.slice(0, 4);
      const monthStr = timeStr.slice(4, 6);
      const dayStr = timeStr.slice(6, 8);

      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);

      // 校验月份
      if (month < 1 || month > 12) {
        return `月份${month}超出有效范围 (1-12)`;
      }

      // 校验日期（考虑平年/闰年、大小月）
      const maxDays = getMaxDaysInMonth(year, month);
      if (day < 1 || day > maxDays) {
        const isLeap = isLeapYear(year);
        if (month === 2) {
          return `${year}年是${isLeap ? '闰年' : '平年'}，2 月只有${maxDays}天，${dayStr}日无效`;
        } else if (BIG_MONTHS.includes(month)) {
          return `${year}年${month}月是大月，有${maxDays}天，${dayStr}日无效`;
        } else {
          return `${year}年${month}月是小月，只有${maxDays}天，${dayStr}日无效`;
        }
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * 校验时间范围的一致性
 * @param {string[]} periods - 时间字符串数组
 * @returns {{ valid: boolean, error?: string, warning?: string, timeType?: string, isRolling?: boolean, periodCount?: number, range?: { start: string, end: string } }}
 */
export function validateTimeRange(periods) {
  if (!periods || periods.length === 0) {
    return {
      valid: false,
      error: '时间范围为空'
    };
  }

  // 检测第一个时间的格式
  const firstType = detectTimeFormat(periods[0]);
  if (!firstType) {
    return {
      valid: false,
      error: `无法识别的时间格式：${periods[0]}`
    };
  }

  // 校验所有时间格式是否一致
  const timeType = firstType;
  const invalidPeriods = [];

  periods.forEach(period => {
    const result = validateTimeFormat(period, timeType);
    if (!result.valid) {
      invalidPeriods.push({ period, error: result.error });
    }
  });

  if (invalidPeriods.length > 0) {
    return {
      valid: false,
      error: `发现 ${invalidPeriods.length} 个时间格式错误：${invalidPeriods.slice(0, 3).map(p => p.period).join(', ')}${invalidPeriods.length > 3 ? '...' : ''}`,
      details: invalidPeriods
    };
  }

  // 检测是否跨年滚动
  const years = new Set();
  periods.forEach(period => {
    const year = period.slice(0, 4);
    years.add(year);
  });

  const isRolling = years.size > 1;

  // 返回校验结果
  return {
    valid: true,
    timeType,
    timeTypeName: TIME_FORMATS[timeType]?.name,
    isRolling,
    periodCount: periods.length,
    range: {
      start: periods[0],
      end: periods[periods.length - 1]
    },
    warning: isRolling ? `检测到跨年度滚动周期（${periods.length}期，${years.size}个年度）` : undefined
  };
}

/**
 * 从时间字符串提取年份
 * @param {string} timeStr - 时间字符串
 * @returns {number|null} 年份
 */
export function extractYear(timeStr) {
  const yearStr = timeStr.slice(0, 4);
  const year = parseInt(yearStr, 10);
  return isNaN(year) ? null : year;
}

/**
 * 从时间字符串提取季度（仅季度格式）
 * @param {string} timeStr - 时间字符串
 * @returns {number|null} 季度 1-4
 */
export function extractQuarter(timeStr) {
  if (detectTimeFormat(timeStr) !== 'quarter') return null;
  const qStr = timeStr.slice(5, 6);
  const q = parseInt(qStr, 10);
  return isNaN(q) ? null : q;
}

/**
 * 从时间字符串提取月份（月度/季度格式）
 * @param {string} timeStr - 时间字符串
 * @returns {number|null} 月份 1-12
 */
export function extractMonth(timeStr) {
  const type = detectTimeFormat(timeStr);

  if (type === 'month') {
    const mStr = timeStr.slice(4, 6);
    const m = parseInt(mStr, 10);
    return isNaN(m) ? null : m;
  }

  if (type === 'quarter') {
    const q = extractQuarter(timeStr);
    return q ? (q - 1) * 3 + 1 : null;
  }

  return null;
}

/**
 * 校验两个时间是否连续
 * @param {string} time1 - 时间 1
 * @param {string} time2 - 时间 2
 * @returns {{ continuous: boolean, gap?: number, error?: string }}
 */
export function isTimeContinuous(time1, time2) {
  const type1 = detectTimeFormat(time1);
  const type2 = detectTimeFormat(time2);

  if (!type1 || !type2) {
    return {
      continuous: false,
      error: '无法识别的时间格式'
    };
  }

  if (type1 !== type2) {
    return {
      continuous: false,
      error: '时间格式不一致'
    };
  }

  // 根据类型计算下一个时间
  const nextTime = getNextTime(time1, type1);

  if (nextTime === time2) {
    return { continuous: true };
  }

  // 计算间隔
  const gap = calculateTimeGap(time1, time2, type1);

  return {
    continuous: false,
    gap,
    error: gap > 0 ? `间隔${gap}个${TIME_FORMATS[type1].name}` : `时间顺序错误`
  };
}

/**
 * 获取下一个时间
 * @param {string} timeStr - 当前时间
 * @param {string} type - 时间类型
 * @returns {string} 下一个时间
 */
function getNextTime(timeStr, type) {
  switch (type) {
    case 'year': {
      const year = extractYear(timeStr);
      return String(year + 1);
    }
    case 'quarter': {
      const year = extractYear(timeStr);
      const quarter = extractQuarter(timeStr);
      if (quarter === 4) {
        return `${year + 1}Q1`;
      }
      return `${year}Q${quarter + 1}`;
    }
    case 'month': {
      const year = extractYear(timeStr);
      const month = extractMonth(timeStr);
      if (month === 12) {
        return `${year + 1}01`;
      }
      return `${year}${String(month + 1).padStart(2, '0')}`;
    }
    case 'week': {
      const year = extractYear(timeStr);
      const weekStr = timeStr.slice(6, 8);
      const week = parseInt(weekStr, 10);
      if (week >= 52) {
        return `${year + 1}WK01`;
      }
      return `${year}WK${String(week + 1).padStart(2, '0')}`;
    }
    case 'day': {
      const year = extractYear(timeStr);
      const month = extractMonth(timeStr);
      const dayStr = timeStr.slice(6, 8);
      const day = parseInt(dayStr, 10);

      // 简化处理：不考虑每月天数差异
      if (day >= 28) {
        if (month === 12) {
          return `${year + 1}0101`;
        }
        return `${year}${String(month + 1).padStart(2, '0')}01`;
      }
      return `${year}${String(month).padStart(2, '0')}${String(day + 1).padStart(2, '0')}`;
    }
    default:
      return timeStr;
  }
}

/**
 * 计算两个时间的间隔
 * @param {string} time1 - 时间 1
 * @param {string} time2 - 时间 2
 * @param {string} type - 时间类型
 * @returns {number} 间隔数（正数表示 time2 在 time1 之后，负数表示之前）
 */
function calculateTimeGap(time1, time2, type) {
  // 简化实现：转换为数值后相减
  const num1 = parseInt(time1.replace(/\D/g, ''), 10);
  const num2 = parseInt(time2.replace(/\D/g, ''), 10);

  switch (type) {
    case 'year':
      return num2 - num1;
    case 'quarter':
      return Math.floor((num2 - num1) / 100) * 4 + (num2 % 100 - num1 % 100);
    case 'month':
      return Math.floor((num2 - num1) / 100) * 12 + (num2 % 100 - num1 % 100);
    case 'week':
      return Math.floor((num2 - num1) / 100) * 52 + (num2 % 100 - num1 % 100);
    case 'day':
      return num2 - num1;
    default:
      return 0;
  }
}

/**
 * 时间格式校验工具类（链式调用）
 */
export class TimeFormatValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 校验单个时间
   * @param {string} timeStr - 时间字符串
   * @param {string} expectedType - 期望类型
   * @returns {TimeFormatValidator}
   */
  checkTime(timeStr, expectedType = null) {
    const result = validateTimeFormat(timeStr, expectedType);
    if (!result.valid) {
      this.errors.push(result.error);
    }
    return this;
  }

  /**
   * 校验时间范围
   * @param {string[]} periods - 时间数组
   * @returns {TimeFormatValidator}
   */
  checkRange(periods) {
    const result = validateTimeRange(periods);
    if (!result.valid) {
      this.errors.push(result.error);
    }
    if (result.warning) {
      this.warnings.push(result.warning);
    }
    return this;
  }

  /**
   * 获取校验结果
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  result() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  /**
   * 重置校验器
   * @returns {TimeFormatValidator}
   */
  reset() {
    this.errors = [];
    this.warnings = [];
    return this;
  }
}

/**
 * 快捷校验函数
 * @param {string[]} periods - 时间数组
 * @param {string} expectedType - 期望类型
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function quickValidate(periods, expectedType = null) {
  const validator = new TimeFormatValidator();

  if (expectedType) {
    periods.forEach(p => validator.checkTime(p, expectedType));
  }

  validator.checkRange(periods);

  return validator.result();
}
