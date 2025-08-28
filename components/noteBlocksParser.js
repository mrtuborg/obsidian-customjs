// Obsidian dataviewjs executable script
// Object-oriented noteBlocksParser using Block system with indentation-based hierarchy
// ---
// Parse note blocks and extract data as Block objects with hierarchy based on indentation
// The blocks could be of different types with flexible attributes:
// 1. Callouts
// 2. Code blocks
// 3. Headers and paragraphs under header. Header is a line starting with `#` and followed by a space.
// 4. Mentions: `[[Mention]]` or `[[Mention|Alias]]` with everything in between and after the mention.
// 5. Todo/Done items with indentation-based hierarchy
//
// HIERARCHY RULES:
// 1. Headers create hierarchy based on their level (# > ## > ###)
// 2. All elements following a header become its children until next header of same/higher level, 2 empty lines, or "----"
// 3. Within header sections, indentation (spaces) creates sub-hierarchy
// 4. Each 2-4 spaces of indentation creates a new hierarchy level
//
// Example:
// ### header 1
// - [ ] el 1          <- child of header 1
//   - [ ] el 1.1      <- child of el 1 (indented)
//   - [ ] el 1.2      <- child of el 1 (same indentation)
// - [ ] el 2          <- child of header 1 (back to base level)
//
// The output is a BlockCollection with Block objects having flexible attributes and hierarchy
// ---

class noteBlocksParser {
  async loadFile(app, filename) {
    const abstractFilePath = app.vault.getAbstractFileByPath(filename);
    if (!abstractFilePath) {
      console.error("File not found: ", filename);
      return null;
    }

    const content = await app.vault.read(abstractFilePath);
    return content;
  }

  parse(page, content) {
    const lines = content.split("\n");
    const collection = new BlockCollection();
    let currentHeaderBlock = null; // Current header that can accept children
    let currentHeaderLevel = 0;
    let currentBlock = null; // Current block being built (for multi-line blocks)
    let emptyLineCount = 0;
    let headerStack = []; // Stack to track header hierarchy
    let indentationStack = []; // Stack to track indentation-based hierarchy

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const indentLevel = this.getIndentationLevel(line);
      const trimmedLine = line.trim();

      if (this.isHeader(line)) {
        // When meet the # line
        const newHeaderLevel = this.getHeaderLevel(line);

        // Finalize current block if exists and different from header
        if (currentBlock && currentBlock !== currentHeaderBlock) {
          this.finalizeBlock(collection, currentBlock);
          currentBlock = null;
        }

        // Finalize current header if new header level is same or higher
        if (currentHeaderBlock && newHeaderLevel <= currentHeaderLevel) {
          this.finalizeBlock(collection, currentHeaderBlock);
        }

        // Create new header block
        const headerBlock = new Block(page, line, Date.now());
        headerBlock.setAttribute("type", "header");
        headerBlock.setAttribute("level", newHeaderLevel);
        headerBlock.setAttribute("indentLevel", 0); // Headers are always at root level

        // Update header stack and find parent header
        this.updateHeaderStack(headerStack, headerBlock, newHeaderLevel);
        const parentHeader = this.findParentHeader(headerStack, newHeaderLevel);
        if (parentHeader) {
          parentHeader.addChild(headerBlock);
        }

        // Reset indentation stack for new header section
        indentationStack = [];

        // Set as current header that can accept children
        currentHeaderBlock = headerBlock;
        currentHeaderLevel = newHeaderLevel;
        currentBlock = headerBlock;
        emptyLineCount = 0;
      } else if (trimmedLine === "") {
        // Empty line - count for breaking parent-child link
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          // Break parent-child link - no more children for current header
          if (currentHeaderBlock) {
            this.finalizeBlock(collection, currentHeaderBlock);
            currentHeaderBlock = null;
            currentHeaderLevel = 0;
          }
          if (currentBlock && currentBlock !== currentHeaderBlock) {
            this.finalizeBlock(collection, currentBlock);
            currentBlock = null;
          }
          // Reset indentation stack
          indentationStack = [];
        }
      } else if (trimmedLine === "---" || trimmedLine === "----") {
        // Horizontal ruler - break parent-child link
        if (currentBlock) {
          this.finalizeBlock(collection, currentBlock);
          currentBlock = null;
        }
        if (currentHeaderBlock) {
          this.finalizeBlock(collection, currentHeaderBlock);
          currentHeaderBlock = null;
          currentHeaderLevel = 0;
        }
        // Reset indentation stack
        indentationStack = [];
        emptyLineCount = 0;
      } else if (this.isCallout(trimmedLine)) {
        // When meet the > line
        if (
          currentBlock &&
          currentBlock.isType("callout") &&
          this.isSameIndentLevel(currentBlock, indentLevel)
        ) {
          // Continue callout block at same indent level
          currentBlock.content += "\n" + line;
        } else {
          // Finalize previous block if exists
          if (currentBlock && currentBlock !== currentHeaderBlock) {
            this.finalizeBlock(collection, currentBlock);
          }

          // Start new callout block
          const calloutBlock = new Block(page, line, Date.now());
          calloutBlock.setAttribute("type", "callout");
          calloutBlock.setAttribute("indentLevel", indentLevel);

          // Find parent based on indentation hierarchy
          const parent = this.findParentByIndentation(
            indentationStack,
            currentHeaderBlock,
            indentLevel
          );
          if (parent) {
            parent.addChild(calloutBlock);
          }

          // Update indentation stack
          this.updateIndentationStack(
            indentationStack,
            calloutBlock,
            indentLevel
          );

          currentBlock = calloutBlock;
        }
        emptyLineCount = 0;
      } else if (this.isCodeBlock(trimmedLine)) {
        // When meet the ``` line
        if (currentBlock && currentBlock.isType("code")) {
          // End code block
          currentBlock.content += "\n" + line;
          this.finalizeBlock(collection, currentBlock);
          currentBlock = null;
        } else {
          // Finalize previous block if exists
          if (currentBlock && currentBlock !== currentHeaderBlock) {
            this.finalizeBlock(collection, currentBlock);
          }

          // Start new code block
          const codeBlock = new Block(page, line, Date.now());
          codeBlock.setAttribute("type", "code");
          codeBlock.setAttribute("indentLevel", indentLevel);

          // Find parent based on indentation hierarchy
          const parent = this.findParentByIndentation(
            indentationStack,
            currentHeaderBlock,
            indentLevel
          );
          if (parent) {
            parent.addChild(codeBlock);
          }

          // Update indentation stack
          this.updateIndentationStack(indentationStack, codeBlock, indentLevel);

          currentBlock = codeBlock;
        }
        emptyLineCount = 0;
      } else if (this.isMention(trimmedLine)) {
        // Finalize current block if not header
        if (currentBlock && currentBlock !== currentHeaderBlock) {
          this.finalizeBlock(collection, currentBlock);
        }

        // Create mention block
        const mentionBlock = new Block(page, line, Date.now());
        mentionBlock.setAttribute("type", "mention");
        mentionBlock.setAttribute("indentLevel", indentLevel);

        // Extract mention target and alias
        const mentionMatch = trimmedLine.match(
          /\[\[([^\]|]+)(\|([^\]]+))?\]\]/
        );
        if (mentionMatch) {
          mentionBlock.setAttribute("target", mentionMatch[1]);
          if (mentionMatch[3]) {
            mentionBlock.setAttribute("alias", mentionMatch[3]);
          }
        }

        // Find parent based on indentation hierarchy
        const parent = this.findParentByIndentation(
          indentationStack,
          currentHeaderBlock,
          indentLevel
        );
        if (parent) {
          parent.addChild(mentionBlock);
        }

        // Update indentation stack
        this.updateIndentationStack(
          indentationStack,
          mentionBlock,
          indentLevel
        );

        this.finalizeBlock(collection, mentionBlock);
        currentBlock = null;
        emptyLineCount = 0;
      } else if (this.isTodoLine(trimmedLine)) {
        // Create todo block
        const todoBlock = new Block(page, line, Date.now());
        todoBlock.setAttribute("type", "todo");
        todoBlock.setAttribute("indentLevel", indentLevel);

        // Add to current header content if exists
        if (currentHeaderBlock) {
          currentHeaderBlock.content += "\n" + line;
        }

        // Find parent based on indentation hierarchy
        const parent = this.findParentByIndentation(
          indentationStack,
          currentHeaderBlock,
          indentLevel
        );
        if (parent) {
          parent.addChild(todoBlock);
        }

        // Update indentation stack
        this.updateIndentationStack(indentationStack, todoBlock, indentLevel);

        this.finalizeBlock(collection, todoBlock);
        emptyLineCount = 0;
      } else if (this.isDoneLine(trimmedLine)) {
        // Create done block
        const doneBlock = new Block(page, line, Date.now());
        doneBlock.setAttribute("type", "done");
        doneBlock.setAttribute("indentLevel", indentLevel);

        // Add to current header content if exists
        if (currentHeaderBlock) {
          currentHeaderBlock.content += "\n" + line;
        }

        // Find parent based on indentation hierarchy
        const parent = this.findParentByIndentation(
          indentationStack,
          currentHeaderBlock,
          indentLevel
        );
        if (parent) {
          parent.addChild(doneBlock);
        }

        // Update indentation stack
        this.updateIndentationStack(indentationStack, doneBlock, indentLevel);

        this.finalizeBlock(collection, doneBlock);
        emptyLineCount = 0;
      } else {
        // Regular content line
        if (currentBlock && currentBlock !== currentHeaderBlock) {
          currentBlock.content += "\n" + line;
        } else if (trimmedLine.length > 0) {
          // Create a text block for content
          const textBlock = new Block(page, line, Date.now());
          textBlock.setAttribute("type", "text");
          textBlock.setAttribute("indentLevel", indentLevel);

          // Find parent based on indentation hierarchy
          const parent = this.findParentByIndentation(
            indentationStack,
            currentHeaderBlock,
            indentLevel
          );
          if (parent) {
            parent.addChild(textBlock);
          }

          // Update indentation stack
          this.updateIndentationStack(indentationStack, textBlock, indentLevel);

          this.finalizeBlock(collection, textBlock);
        }
        emptyLineCount = 0;
      }
    }

    // Finalize any remaining blocks
    if (currentBlock) {
      this.finalizeBlock(collection, currentBlock);
    }

    return collection;
  }

  // Get indentation level (number of leading spaces)
  getIndentationLevel(line) {
    const match = line.match(/^( *)/);
    return match ? match[1].length : 0;
  }

  // Check if block is at same indentation level
  isSameIndentLevel(block, indentLevel) {
    return block.getAttribute("indentLevel") === indentLevel;
  }

  // Find parent based on indentation hierarchy
  findParentByIndentation(indentationStack, currentHeaderBlock, indentLevel) {
    // If no indentation, parent is current header
    if (indentLevel === 0) {
      return currentHeaderBlock;
    }

    // Find the closest parent with lower indentation level
    for (let i = indentationStack.length - 1; i >= 0; i--) {
      const stackItem = indentationStack[i];
      if (stackItem.indentLevel < indentLevel) {
        return stackItem.block;
      }
    }

    // If no suitable parent found in stack, use current header
    return currentHeaderBlock;
  }

  // Update indentation stack
  updateIndentationStack(indentationStack, block, indentLevel) {
    // Remove items with indentation >= current level
    while (
      indentationStack.length > 0 &&
      indentationStack[indentationStack.length - 1].indentLevel >= indentLevel
    ) {
      indentationStack.pop();
    }

    // Add current block to stack
    indentationStack.push({
      block: block,
      indentLevel: indentLevel,
    });
  }

  // Helper method to update header stack for hierarchy
  updateHeaderStack(headerStack, headerBlock, level) {
    // Remove headers with level >= current level
    while (
      headerStack.length > 0 &&
      headerStack[headerStack.length - 1].getLevel() >= level
    ) {
      headerStack.pop();
    }
    // Add current header to stack
    headerStack.push(headerBlock);
  }

  // Helper method to find parent header
  findParentHeader(headerStack, level) {
    // Find the closest header with level < current level
    for (let i = headerStack.length - 1; i >= 0; i--) {
      if (headerStack[i].getLevel() < level) {
        return headerStack[i];
      }
    }
    return null;
  }

  // Helper method to finalize and add block to collection
  finalizeBlock(collection, block) {
    if (block && !collection.blocks.includes(block)) {
      collection.addBlock(block);
    }
  }

  isCallout(line) {
    // Check if the line starts with '>'
    if (line.startsWith(">")) {
      // Check if the line contains a todo marker after the '>'
      const trimmedLine = line.substring(1).trim();
      if (this.isTodoLine(trimmedLine)) {
        return false; // It's a todo element, not a callout
      }
      return true; // It's a callout
    }
    return false; // Not a callout
  }

  isCodeBlock(line) {
    return line.startsWith("```");
  }

  isHeader(line) {
    // A header is a line starting with one or more # characters, followed by at least one space or tab,
    // and then at least one non-whitespace character (text).
    const match = line.match(/^(#+)[ \t]+(.*)$/);
    if (match) {
      // match[2] is the text after the # and whitespace
      return match[2].trim().length > 0;
    }
    return false;
  }

  getHeaderLevel(line) {
    return line.match(/^#+/)[0].length;
  }

  isMention(line) {
    // Check if line contains [[...]] but exclude embedded files that start with ![[
    return /\[\[.*?\]\]/.test(line) && !line.trim().startsWith("![[");
  }

  isTodoLine(line) {
    return line.startsWith("- [ ]");
  }

  isDoneLine(line) {
    return line.startsWith("- [x]");
  }

  async run(app, pages, namePattern = "") {
    const allBlocks = new BlockCollection();

    console.log("NoteBlocksParser: Starting to process pages...");
    console.log("NoteBlocksParser: Name pattern:", namePattern);
    console.log("NoteBlocksParser: Total pages to process:", pages.length);

    for (const page of pages) {
      // If a namePattern is provided, check if the page name includes the pattern
      if (namePattern && !moment(page.file.name, namePattern, true).isValid()) {
        console.log(
          "NoteBlocksParser: Skipping file (does not match date format):",
          page.file.name
        );
        continue;
      }

      console.log("NoteBlocksParser: Processing page:", page.file.name);
      const content = await this.loadFile(app, page.file.path);
      const pageCollection = this.parse(page.file.path, content);

      console.log(
        "NoteBlocksParser: Found",
        pageCollection.blocks.length,
        "blocks in",
        page.file.name
      );
      console.log(
        "NoteBlocksParser: Block types:",
        pageCollection.blocks.map((b) => b.getAttribute("type"))
      );

      // Add all blocks from page to main collection
      for (const block of pageCollection.blocks) {
        allBlocks.addBlock(block);
      }
    }

    console.log(
      "NoteBlocksParser: Finished processing pages. Total parsed blocks:",
      allBlocks.blocks.length
    );

    const stats = allBlocks.getStats();
    console.log("NoteBlocksParser: Block type summary:", stats.types);
    console.log("NoteBlocksParser: Hierarchy stats:", {
      totalBlocks: stats.totalBlocks,
      rootBlocks: stats.rootBlocks,
      blocksWithParents: stats.totalBlocks - stats.rootBlocks,
    });

    return allBlocks;
  }
}

// Example usage with indentation hierarchy:
// -----------------
// const content = `### header 1
// - [ ] el 1
//   - [ ] el 1.1
//   - [ ] el 1.2
// - [ ] el 2
//
// ### header 2
// - [ ] el a
//   - [ ] el a1
//   - [ ] el a2
// - [ ] el b
// `;
//
// Result hierarchy:
// header 1
//   ├── el 1
//   │   ├── el 1.1
//   │   └── el 1.2
//   └── el 2
// header 2
//   ├── el a
//   │   ├── el a1
//   │   └── el a2
//   └── el b
// -----------------
