// Obsidian dataviewjs executable script
// Object-oriented Block system for noteBlocksParser
// ---
// Base Block class with generic attributes and simple parent-child hierarchy
// Designed for Daily Notes as database source with flexible block relationships
//
// Usage:
// const block = new Block(page, content);
// block.setAttribute('type', 'header');
// block.setAttribute('level', 2);
// parent.addChild(block);
// ---

class Block {
  constructor(page, content, mtime) {
    this.page = page;
    this.content = content;
    this.mtime = mtime || Date.now();
    this.attributes = new Map(); // Generic key-value attributes for extensibility
    this.parent = null; // Single parent (simple hierarchy)
    this.children = []; // Multiple children
  }

  // Generic attribute system - extensible for future needs
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }

  getAttribute(key) {
    return this.attributes.get(key);
  }

  hasAttribute(key) {
    return this.attributes.has(key);
  }

  // Get all attributes as object for debugging/serialization
  getAllAttributes() {
    const obj = {};
    for (let [key, value] of this.attributes) {
      obj[key] = value;
    }
    return obj;
  }

  // Simple parent-child relationships
  setParent(parentBlock) {
    // Remove from old parent if exists
    if (this.parent && this.parent.children.includes(this)) {
      const index = this.parent.children.indexOf(this);
      this.parent.children.splice(index, 1);
    }

    this.parent = parentBlock;

    // Add to new parent's children if not already there
    if (parentBlock && !parentBlock.children.includes(this)) {
      parentBlock.children.push(this);
    }
  }

  addChild(childBlock) {
    if (!this.children.includes(childBlock)) {
      this.children.push(childBlock);
    }
    childBlock.setParent(this);
  }

  removeChild(childBlock) {
    const index = this.children.indexOf(childBlock);
    if (index > -1) {
      this.children.splice(index, 1);
      childBlock.parent = null;
    }
  }

  // Utility methods for common operations
  isType(type) {
    return this.getAttribute("type") === type;
  }

  getLevel() {
    return this.getAttribute("level") || 0;
  }

  getTarget() {
    return this.getAttribute("target");
  }

  // Check if this block is a descendant of another block
  isDescendantOf(ancestorBlock) {
    let current = this.parent;
    while (current) {
      if (current === ancestorBlock) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  // Get all descendants (children, grandchildren, etc.)
  getAllDescendants() {
    const descendants = [];

    function collectDescendants(block) {
      for (const child of block.children) {
        descendants.push(child);
        collectDescendants(child);
      }
    }

    collectDescendants(this);
    return descendants;
  }

  // Get path from root to this block
  getPath() {
    const path = [];
    let current = this;

    while (current) {
      path.unshift(current);
      current = current.parent;
    }

    return path;
  }

  // Debug representation
  toString() {
    const type = this.getAttribute("type") || "unknown";
    const level = this.getLevel();
    const preview = this.content.substring(0, 50).replace(/\n/g, " ");
    return `Block(${type}${level ? `:${level}` : ""}) "${preview}${
      this.content.length > 50 ? "..." : ""
    }"`;
  }
}

class BlockCollection {
  constructor() {
    this.blocks = [];
  }

  addBlock(block) {
    if (!this.blocks.includes(block)) {
      this.blocks.push(block);
    }
  }

  removeBlock(block) {
    const index = this.blocks.indexOf(block);
    if (index > -1) {
      this.blocks.splice(index, 1);
    }
  }

  // Query methods using generic attributes
  findByType(type) {
    return this.blocks.filter((block) => block.isType(type));
  }

  findByAttribute(key, value) {
    return this.blocks.filter((block) => block.getAttribute(key) === value);
  }

  findByAttributes(attributeMap) {
    return this.blocks.filter((block) => {
      for (let [key, value] of Object.entries(attributeMap)) {
        if (block.getAttribute(key) !== value) {
          return false;
        }
      }
      return true;
    });
  }

  // Get root blocks (no parent)
  getRootBlocks() {
    return this.blocks.filter((block) => !block.parent);
  }

  // Get blocks by page
  getBlocksByPage(page) {
    return this.blocks.filter((block) => block.page === page);
  }

  // Get hierarchy tree structure
  getHierarchy() {
    return this.getRootBlocks().map((block) => this.buildTree(block));
  }

  buildTree(block) {
    return {
      block: block,
      children: block.children.map((child) => this.buildTree(child)),
    };
  }

  // Get flat list of all blocks with their hierarchy level
  getFlatHierarchy() {
    const result = [];

    function traverse(block, depth) {
      result.push({ block, depth });
      for (const child of block.children) {
        traverse(child, depth + 1);
      }
    }

    for (const rootBlock of this.getRootBlocks()) {
      traverse(rootBlock, 0);
    }

    return result;
  }

  // Statistics and debugging
  getStats() {
    const stats = {
      totalBlocks: this.blocks.length,
      rootBlocks: this.getRootBlocks().length,
      types: {},
      pages: new Set(),
    };

    for (const block of this.blocks) {
      const type = block.getAttribute("type") || "unknown";
      stats.types[type] = (stats.types[type] || 0) + 1;
      stats.pages.add(block.page);
    }

    stats.uniquePages = stats.pages.size;
    return stats;
  }

  // Debug representation
  toString() {
    const stats = this.getStats();
    return `BlockCollection(${stats.totalBlocks} blocks, ${
      stats.uniquePages
    } pages, types: ${Object.keys(stats.types).join(", ")})`;
  }

  // Export for debugging - compatible with existing components
  toDebugArray() {
    return this.blocks.map((block) => ({
      page: block.page,
      content: block.content.substring(0, 100),
      attributes: block.getAllAttributes(),
      hasParent: !!block.parent,
      childrenCount: block.children.length,
    }));
  }

  // Compatibility method - convert to old array format for gradual migration
  toCompatibilityArray() {
    return this.blocks.map((block) => ({
      page: block.page,
      blockType: block.getAttribute("type") || "unknown",
      data: block.content,
      mtime: block.mtime,
      headerLevel: block.getAttribute("level") || 0,
    }));
  }
}
