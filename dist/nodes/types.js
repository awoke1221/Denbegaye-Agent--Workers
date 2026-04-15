"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeRegistry = exports.NodeRegistry = void 0;
/**
 * Registry for all available nodes
 */
class NodeRegistry {
    constructor() {
        this.nodes = new Map();
    }
    register(node) {
        this.nodes.set(node.type, node);
    }
    get(type) {
        return this.nodes.get(type);
    }
    getAll() {
        return Array.from(this.nodes.values());
    }
    getByCategory(category) {
        return this.getAll().filter((node) => node.category === category);
    }
}
exports.NodeRegistry = NodeRegistry;
// Global node registry instance
exports.nodeRegistry = new NodeRegistry();
