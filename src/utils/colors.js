/**
 * 颜色常量
 */

// 节点类型颜色
export const NODE_COLORS = {
  driver: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    header: 'bg-blue-100',
    text: 'text-blue-800'
  },
  computed: {
    bg: 'bg-white',
    border: 'border-gray-300',
    header: 'bg-gray-100',
    text: 'text-gray-800'
  },
  aggregate: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    header: 'bg-purple-100',
    text: 'text-purple-800'
  }
};

// 变化颜色
export const CHANGE_COLORS = {
  up: {
    text: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-300'
  },
  down: {
    text: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-300'
  },
  neutral: {
    text: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-300'
  }
};

// 连线颜色
export const EDGE_COLORS = {
  default: '#94a3b8',
  highlighted: '#3b82f6',
  affected: '#ef4444'
};
