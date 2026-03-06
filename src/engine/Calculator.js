import { DependencyGraph } from './DependencyGraph';
import { FormulaParser } from './FormulaParser';

/**
 * 计算器引擎
 * 基于依赖图的拓扑排序，高效计算所有节点值
 */
export class Calculator {
  constructor() {
    this.graph = new DependencyGraph();
    this.compiledFormulas = {};
    this.nodeTypes = {};
    this.allNodeIds = [];
  }

  /**
   * 从节点数据重建计算引擎
   */
  buildFromNodes(nodes) {
    this.graph = new DependencyGraph();
    this.compiledFormulas = {};
    this.nodeTypes = {};

    this.allNodeIds = Object.keys(nodes);

    Object.values(nodes).forEach((node) => {
      this.nodeTypes[node.id] = node.type;

      if (node.type === 'computed' || node.type === 'aggregate') {
        const formula = node.formula || '';
        const dependencies = FormulaParser.extractDependencies(formula, this.allNodeIds);

        this.graph.addNode(node.id, dependencies);
        this.compiledFormulas[node.id] = FormulaParser.compile(formula, this.allNodeIds);
      } else {
        this.graph.addNode(node.id, []);
      }
    });
  }

  /**
   * 计算所有节点值
   */
  computeAll(nodes) {
    const result = {};
    const nodeMap = {};

    // 先收集驱动因子的值
    Object.values(nodes).forEach((node) => {
      nodeMap[node.id] = node;
      if (node.type === 'driver') {
        result[node.id] = node.value ?? node.baseline ?? 0;
      }
    });

    const order = this.graph.topologicalSort();
    if (!order) {
      console.error('无法计算：存在环形依赖');
      return result;
    }

    order.forEach((nodeId) => {
      const node = nodeMap[nodeId];
      if (!node) return;

      if (node.type === 'driver') {
        return;
      }

      const compileFn = this.compiledFormulas[nodeId];
      if (compileFn) {
        try {
          result[nodeId] = compileFn(result);
        } catch (e) {
          console.error(`计算节点 ${nodeId} 时出错:`, e);
          result[nodeId] = 0;
        }
      } else {
        result[nodeId] = 0;
      }
    });

    return result;
  }

  hasCycle() {
    return this.graph.hasCycle();
  }

  getComputeOrder() {
    return this.graph.topologicalSort();
  }
}
