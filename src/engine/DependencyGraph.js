/**
 * 依赖图
 * 构建有向无环图(DAG)，用于表示节点间的依赖关系
 */
export class DependencyGraph {
  constructor() {
    // 邻接表：key 是节点 ID，value 是依赖该节点的节点列表（反向依赖）
    this.adjacency = {};
    // 入度表：key 是节点 ID，value 是该节点依赖的节点数量
    this.inDegree = {};
    // 正向依赖：key 是节点 ID，value 是该节点依赖的节点列表
    this.dependencies = {};
  }

  /**
   * 添加一个节点及其依赖
   * @param {string} nodeId - 节点 ID
   * @param {Array<string>} dependsOn - 该节点依赖的节点 ID 列表
   */
  addNode(nodeId, dependsOn = []) {
    // 初始化邻接表和入度表
    if (!this.adjacency[nodeId]) {
      this.adjacency[nodeId] = [];
    }
    if (this.inDegree[nodeId] === undefined) {
      this.inDegree[nodeId] = 0;
    }
    this.dependencies[nodeId] = [...dependsOn];

    // 构建依赖关系
    dependsOn.forEach((depId) => {
      // 确保依赖节点也在图中
      if (!this.adjacency[depId]) {
        this.adjacency[depId] = [];
      }
      if (this.inDegree[depId] === undefined) {
        this.inDegree[depId] = 0;
      }

      // 添加边：depId -> nodeId（depId 变化会影响 nodeId）
      this.adjacency[depId].push(nodeId);
      this.inDegree[nodeId]++;
    });
  }

  /**
   * 检测是否存在环形依赖
   * @returns {boolean} 是否有环
   */
  hasCycle() {
    const inDegreeCopy = { ...this.inDegree };
    const queue = [];

    // 找到所有入度为 0 的节点
    Object.keys(inDegreeCopy).forEach((nodeId) => {
      if (inDegreeCopy[nodeId] === 0) {
        queue.push(nodeId);
      }
    });

    let count = 0;

    while (queue.length > 0) {
      const node = queue.shift();
      count++;

      // 遍历该节点的所有邻居
      (this.adjacency[node] || []).forEach((neighbor) => {
        inDegreeCopy[neighbor]--;
        if (inDegreeCopy[neighbor] === 0) {
          queue.push(neighbor);
        }
      });
    }

    // 如果处理的节点数不等于总节点数，说明存在环
    return count !== Object.keys(this.inDegree).length;
  }

  /**
   * 拓扑排序（使用 Kahn 算法）
   * @returns {Array<string> | null} 拓扑排序后的节点列表，有环则返回 null
   */
  topologicalSort() {
    const inDegreeCopy = { ...this.inDegree };
    const queue = [];
    const result = [];

    // 找到所有入度为 0 的节点
    Object.keys(inDegreeCopy).forEach((nodeId) => {
      if (inDegreeCopy[nodeId] === 0) {
        queue.push(nodeId);
      }
    });

    while (queue.length > 0) {
      const node = queue.shift();
      result.push(node);

      // 遍历该节点的所有邻居
      (this.adjacency[node] || []).forEach((neighbor) => {
        inDegreeCopy[neighbor]--;
        if (inDegreeCopy[neighbor] === 0) {
          queue.push(neighbor);
        }
      });
    }

    // 检查是否有环
    if (result.length !== Object.keys(this.inDegree).length) {
      console.warn('检测到环形依赖！');
      return null;
    }

    return result;
  }

  /**
   * 获取受影响的节点链（从某个节点开始，所有依赖它的节点）
   * @param {string} nodeId - 起始节点 ID
   * @returns {Set<string>} 受影响的节点集合
   */
  getAffectedNodes(nodeId) {
    const affected = new Set();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      (this.adjacency[current] || []).forEach((neighbor) => {
        if (!affected.has(neighbor)) {
          affected.add(neighbor);
          queue.push(neighbor);
        }
      });
    }

    return affected;
  }
}
