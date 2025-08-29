// Obsidian dataviewjs executable script
// Object-oriented Block system for noteBlocksParser
// ---
// Base Block class with generic attributes and simple parent-child hierarchy
// Designed for Daily Notes as database source with flexible block relationships
//
// Usage:
// const block = createBlockInstance();
// block.page = "test.md";
// block.content = "content";
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

  // Factory method to create new Block instances
  createNew(page, content, mtime) {
    return new Block(page, content, mtime);
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
