// BlockCollection class for managing collections of Block objects
// Separated from Block.js for proper CustomJS loading

class BlockCollection {
  constructor() {
    this.blocks = [];
  }

  // Factory method to create new BlockCollection instances
  createNew() {
    return new BlockCollection();
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
