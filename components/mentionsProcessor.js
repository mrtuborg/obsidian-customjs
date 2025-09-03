// This script is looking for pages that mentioning the current page in the whole vault.
// It collects all the mentions and adds them to the current page.
// MIGRATED TO BLOCK SYSTEM: Now uses Block objects for processing and todo state synchronization

class mentionsProcessor {
  // This function processes the mentions in the markdown file
  // It reads the file content, extracts the frontmatter, and processes each line
  // to update the mentions based on the specified operations.
  // Mentions are defined within double curly braces {} in the markdown file
  // MIGRATION: Now fully uses Block system for processing and todo state synchronization

  async processMentions(currentPageContent, blocks, tagId, frontmatterObj) {
    this.frontmatterObj = frontmatterObj;

    // Ensure we have a BlockCollection
    if (!blocks || typeof blocks.findByType !== "function") {
      console.warn(
        "mentionsProcessor: Expected BlockCollection, received:",
        typeof blocks
      );
      return "";
    }

    // Find mention blocks using Block system - include ALL block types
    let mentionBlocks = blocks.blocks; // Get all blocks, not just specific types

    // Filter blocks that contain the tagId OR are children of blocks that contain tagId
    // and are not from current page
    mentionBlocks = mentionBlocks.filter((block) => {
      const blockContent = block.content;

      // Skip blocks from current page (check if current page is the activity being processed)
      // We need to be more specific about what constitutes "current page"
      const currentPagePath = currentPageContent
        ? "current-activity"
        : "unknown";

      // STAGE FILTERING: Only include blocks from activities that are in progress
      // Skip blocks from activities with stage="done" to avoid processing completed activities
      if (
        this.isBlockFromCompletedActivity &&
        this.isBlockFromCompletedActivity(block)
      ) {
        console.log(
          `mentionsProcessor: Skipping block from completed activity: ${block.page}`
        );
        return false;
      }

      // DATE FILTERING: Skip blocks from activities with future startDate
      // Don't show activities in daily notes if their startDate is in the future
      if (
        this.isBlockFromFutureActivity &&
        this.isBlockFromFutureActivity(block, tagId)
      ) {
        console.log(
          `mentionsProcessor: Skipping block from future activity: ${block.page}`
        );
        return false;
      }

      // DEBUG: Log all blocks being considered for date-based tagIds
      if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.warn(
          `🔍 DAILY NOTE DEBUG: Checking block from ${
            block.page
          } for tagId "${tagId}": "${blockContent.trim().substring(0, 100)}"`
        );
      }

      // Include blocks that directly contain the tagId
      if (blockContent.includes(tagId)) {
        if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
          console.warn(
            `🎯 DAILY NOTE DEBUG: Found direct mention in ${
              block.page
            }: "${blockContent.trim()}"`
          );
        }
        return true;
      }

      // Include ONLY blocks that are children of headers containing the SPECIFIC tagId
      // This fixes the over-collection issue by being more specific about which activity header
      const isUnderSpecificActivityHeader =
        this.isBlockUnderSpecificActivityHeader(block, tagId);
      if (isUnderSpecificActivityHeader) {
        const blockType = block.getAttribute("type") || "unknown";
        if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
          console.warn(
            `🏗️ DAILY NOTE DEBUG: Found hierarchical ${blockType} under specific activity header in ${
              block.page
            }: "${blockContent.trim()}"`
          );
        }
        return true;
      }
      return false;
    });

    if (mentionBlocks.length === 0) return "";

    // Parse current page content into blocks for comparison
    const currentLines = currentPageContent
      ? currentPageContent.split("\n")
      : [];

    // Find insertion point
    let insertIndex = Math.max(
      currentLines.lastIndexOf("---"),
      currentLines.lastIndexOf("----")
    );
    insertIndex =
      insertIndex !== -1 ? insertIndex + 1 : currentLines.length + 1;

    // Group mention blocks by source file for processing
    let mentionBlocksBySource = {};
    let addedMentionLines = new Set();

    // Process each mention block using Block system
    for (const mentionBlock of mentionBlocks) {
      const sourceFile = mentionBlock.page;
      const linkPart = sourceFile
        .toString()
        .replace(/.*\/|\.md.*/g, "")
        .trim();

      if (!mentionBlocksBySource[linkPart]) {
        mentionBlocksBySource[linkPart] = [];
      }

      // Process block content based on type
      const processedContent = await this.processBlockContent(
        mentionBlock,
        tagId,
        linkPart,
        currentPageContent,
        currentLines,
        addedMentionLines
      );

      if (processedContent && processedContent.length > 0) {
        mentionBlocksBySource[linkPart].push(...processedContent);
      }
    }

    // CRITICAL: Todo state synchronization using Block system
    await this.synchronizeTodoStates(currentLines, mentionBlocks, tagId);

    if (Object.keys(mentionBlocksBySource).length === 0) return "";

    let newContent = [];

    // Sort mention blocks by date (chronological order: oldest → newest)
    const sortedLinkParts = Object.keys(mentionBlocksBySource).sort((a, b) => {
      const dateA = moment(a, "YYYY-MM-DD", true);
      const dateB = moment(b, "YYYY-MM-DD", true);

      if (dateA.isValid() && dateB.isValid()) {
        return dateA.isBefore(dateB) ? -1 : dateA.isAfter(dateB) ? 1 : 0;
      } else if (dateA.isValid() && !dateB.isValid()) {
        return -1;
      } else if (!dateA.isValid() && dateB.isValid()) {
        return 1;
      } else {
        return a.localeCompare(b);
      }
    });

    // Build new content from processed blocks
    sortedLinkParts.forEach((linkPart) => {
      const blockDataLength = mentionBlocksBySource[linkPart]
        .join("\n")
        .trim().length;

      if (blockDataLength > 0) {
        const filteredMentions = mentionBlocksBySource[linkPart].filter(
          (mentionData) => {
            const trimmed = mentionData.trim();
            return !/^(#+)[ \t]*$/.test(trimmed);
          }
        );

        if (filteredMentions.length > 0) {
          newContent.push(`\n[[${linkPart}]]`);
          filteredMentions.forEach((mentionData) => {
            newContent.push(mentionData + "\n");
          });
        }
      }
    });

    if (newContent.length === 0) return "";
    newContent.push("\n----");

    // Insert the new mention blocks
    currentLines.splice(insertIndex, 0, ...newContent);
    return currentLines.join("\n");
  }

  // NEW: Block-based content processing
  async processBlockContent(
    mentionBlock,
    tagId,
    sourceFileName,
    currentPageContent,
    currentLines,
    addedMentionLines
  ) {
    const blockContent = mentionBlock.content;
    const blockType = mentionBlock.getAttribute("type");

    // For hierarchical content (todos, text, code, etc.), we don't need the content to include tagId directly
    // The hierarchy relationship is what matters - ONLY blocks under the SPECIFIC activity header should be processed
    const isHierarchicalContent = this.isBlockUnderSpecificActivityHeader(
      mentionBlock,
      tagId
    );

    if (
      !blockContent ||
      (!blockContent.includes(tagId) && !isHierarchicalContent)
    ) {
      return [];
    }

    const mentionLines = blockContent.split("\n");
    const normalizedCurrentLines = currentLines.map((l) => l.trim());
    let processedLines = [];

    for (const line of mentionLines) {
      // For hierarchical content, we need different normalization logic for COMPARISON ONLY
      // Don't remove tagId from hierarchical content since it might not contain it directly
      const normalizedLine = isHierarchicalContent
        ? line.replace(/(?<!\!)\[\[.*?\]\]/g, "").trim() // Remove ALL links for comparison only
        : this.normalizeLine(line, tagId);

      if (
        this.isLineNew(normalizedLine, normalizedCurrentLines) &&
        !addedMentionLines.has(normalizedLine)
      ) {
        // Only log new mentions for date-based tagIds (daily notes debugging)
        if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
          console.log(
            `New ${
              isHierarchicalContent ? "hierarchical" : "direct"
            } mention found: ${normalizedLine} in ${mentionBlock.page}`
          );
        }

        // Process directives in the line
        const isCodeBlock = blockType === "code";
        const processedLine = this.processDirectiveLine(
          line,
          sourceFileName,
          currentPageContent,
          this.frontmatterObj,
          isCodeBlock,
          tagId
        );

        if (processedLine !== null) {
          // For hierarchical content, convert ONLY self-references to plain text, keep other links
          const filteredLine = isHierarchicalContent
            ? this.convertLinksToPlainText(processedLine, tagId)
            : processedLine.replace(/(?<!\!)\[\[.*?\]\]/g, "");
          processedLines.push(filteredLine);
          addedMentionLines.add(normalizedLine);
        }
      } else {
        // Only log existing mentions for date-based tagIds (daily notes debugging)
        if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
          console.log(
            `Existing ${
              isHierarchicalContent ? "hierarchical" : "direct"
            } mention found: ${normalizedLine} in ${mentionBlock.page}`
          );
        }
      }
    }

    return processedLines;
  }

  // NEW: Todo state synchronization using Block system
  async synchronizeTodoStates(currentLines, mentionBlocks, tagId) {
    // Find completed todos in mention blocks that reference this activity
    // This includes both direct references and todos that are children of activity headers
    const completedTodos = [];

    for (const block of mentionBlocks) {
      if (block.getAttribute("type") === "done") {
        // Check if todo directly contains activity reference
        if (block.content.includes(tagId)) {
          completedTodos.push(block);
        } else {
          // Check if todo is a child of a header that contains activity reference
          if (this.isTodoUnderActivityHeader(block, tagId)) {
            completedTodos.push(block);
          }
        }
      }
    }

    if (completedTodos.length === 0) {
      return;
    }

    // Only log synchronization details for date-based tagIds (daily notes debugging)
    if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
      console.log(
        `mentionsProcessor: Found ${completedTodos.length} completed todos to sync (including hierarchical)`
      );
    }

    // Process each completed todo
    for (const completedTodo of completedTodos) {
      const todoContent = completedTodo.content;
      const todoText = this.extractTodoText(todoContent, tagId);

      if (todoText) {
        // Find and update corresponding incomplete todo in current content
        this.updateTodoState(currentLines, todoText, completedTodo.page, tagId);
      }
    }
  }

  // NEW: Check if ANY block is under an activity header using Block hierarchy
  isBlockUnderActivityHeader(block, tagId) {
    // Walk up the parent chain to find if any parent header is an activity header
    let currentParent = block.parent;

    while (currentParent) {
      // Check if parent is a header that looks like an activity header
      // Activity headers typically contain [[Activities/...]] or [[People/...]] patterns
      if (currentParent.getAttribute("type") === "header") {
        const headerContent = currentParent.content;

        // Check if this is an activity header (contains [[Activities/...]] or [[People/...]])
        const isActivityHeader =
          headerContent.includes("[[Activities/") ||
          headerContent.includes("[[People/");

        if (isActivityHeader) {
          // Only log for date-based tagIds to reduce noise
          //if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
          //  const blockType = block.getAttribute("type") || "unknown";
          //  console.warn(
          //    `🏗️ DAILY NOTE DEBUG: Found ${blockType} "${block.content.trim()}" under activity header "${headerContent.trim()}"`
          //  );
          //}
          return true;
        }
      }
      // Move up the hierarchy
      currentParent = currentParent.parent;
    }

    return false;
  }

  // NEW: Check if a block is under the SPECIFIC activity header containing the tagId
  isBlockUnderSpecificActivityHeader(block, tagId) {
    // Walk up the parent chain to find if any parent header contains the specific tagId
    let currentParent = block.parent;

    while (currentParent) {
      // Check if parent is a header
      if (currentParent.getAttribute("type") === "header") {
        const headerContent = currentParent.content;

        // Check if this header contains the specific tagId we're looking for
        if (headerContent.includes(tagId)) {
          return true;
        }
      }
      // Move up the hierarchy
      currentParent = currentParent.parent;
    }

    return false;
  }

  // NEW: Check if a todo is under an activity header using Block hierarchy (for backward compatibility)
  isTodoUnderActivityHeader(todoBlock, tagId) {
    return this.isBlockUnderActivityHeader(todoBlock, tagId);
  }

  // NEW: Extract todo text without activity reference
  extractTodoText(todoContent, tagId) {
    // Remove the activity reference and extract clean todo text
    let todoText = todoContent
      .replace(/^\s*-\s*\[x\]\s*/, "") // Remove completed checkbox
      .replace(/^\s*-\s*\[\s\]\s*/, "") // Remove incomplete checkbox
      .replace(new RegExp(`\\[\\[.*?${tagId}.*?\\]\\]`, "g"), "") // Remove activity links
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();

    return todoText;
  }

  // NEW: Update todo state in current content
  updateTodoState(currentLines, todoText, sourcePage, tagId) {
    for (let i = 0; i < currentLines.length; i++) {
      const line = currentLines[i];

      // Check if this line is an incomplete todo that matches our completed todo
      if (line.match(/^\s*-\s*\[\s\]\s*/) && line.includes(todoText)) {
        // Update from [ ] to [x]
        const updatedLine = line.replace(/^\s*-\s*\[\s\]\s*/, "- [x] ");
        currentLines[i] = updatedLine;

        // Only log todo updates for date-based tagIds (daily notes debugging)
        //if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
        //  console.log(
        //    `mentionsProcessor: Updated todo state: "${todoText}" from ${sourcePage}`
        //  );
        //}
        break;
      }
    }
  }

  // Helper function to normalize a line
  normalizeLine(line, tagId) {
    return line
      .replace(tagId, "")
      .replace(/(?<!\!)\[\[.*?\]\]/g, "")
      .trim();
  }

  // Helper function to convert links to plain text (preserves display text or filename)
  // Special handling: Remove self-references to avoid recursion, keep other links
  convertLinksToPlainText(line, currentTagId) {
    return line.replace(
      /(?<!\!)\[\[([^\]|]+)(\|([^\]]+))?\]\]/g,
      (match, target, pipe, displayText) => {
        // Extract the target filename for comparison
        const targetFilename = target.replace(/.*\//, "").replace(/\.md$/, "");

        // If this is a self-reference (mentions the same activity), convert to plain text
        if (currentTagId && targetFilename === currentTagId) {
          if (displayText) {
            return displayText;
          } else {
            return targetFilename;
          }
        }

        // For other mentions, keep the original link
        return match;
      }
    );
  }

  // Helper function to check if a line is new
  isLineNew(normalizedLine, normalizedCurrentLines) {
    if (normalizedLine === "") return true;
    return !normalizedCurrentLines.includes(normalizedLine);
  }

  // Helper function to convert directives when copying from other files
  processDirectiveLine(
    line,
    sourceFileName,
    currentPageContent,
    frontmatterObj,
    isCodeBlock = false,
    tagId = null
  ) {
    // Skip directive processing for code blocks (especially DataviewJS)
    if (isCodeBlock) {
      return line;
    }

    // Convert {command} to (command from filename) when copying from other files
    const directiveRegex = /\{([^}]+)\}/g;
    let processedLine = line.replace(directiveRegex, (match, directive) => {
      const processedDirective = `(${directive} from ${sourceFileName})`;
      // Check if current page already has this exact directive from this file
      if (currentPageContent.includes(processedDirective)) {
        // Only log directive skipping for date-based tagIds (daily notes debugging)
        if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
          console.log(
            `Skipping directive ${match} from ${sourceFileName} - already copied from this file`
          );
        }
        return null; // Mark for removal
      }

      // Process the directive immediately before converting to comment
      // Only log directive processing for date-based tagIds (daily notes debugging)
      if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.log(
          `Processing directive from ${sourceFileName}: ${directive}`
        );
      }
      this.processDirective(directive, frontmatterObj, tagId);

      // Only log directive conversion for date-based tagIds (daily notes debugging)
      if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.log(`Converting directive: ${match} -> ${processedDirective}`);
      }
      return processedDirective;
    });

    // If any directive was marked for removal (null), skip this line
    if (processedLine && processedLine.includes("null")) {
      return null;
    }

    return processedLine;
  }

  // Helper function to process a single directive
  processDirective(directive, frontmatterObj, tagId = null) {
    // Ensure frontmatterObj exists
    if (!frontmatterObj) {
      console.warn(
        "mentionsProcessor: frontmatterObj is undefined, skipping directive processing"
      );
      return;
    }

    // Parse the directive (same logic as attributesProcessor)
    const operations_sorted = ["-=", "+=", "=", ":"];
    const operation = operations_sorted.find((op) => directive.includes(op));

    if (!operation) return;

    const operationIndex = directive.indexOf(operation);
    const attributeName = directive.substring(0, operationIndex).trim();
    const value = directive.substring(operationIndex + operation.length).trim();

    // Safely get the current attribute value, defaulting to undefined
    let attributeValue = frontmatterObj[attributeName];

    // Check if the value is numeric
    const isNumeric = !isNaN(value) && !isNaN(parseFloat(value));

    if (isNumeric && operation != ":") {
      // Handle numeric operations
      const numericValue = parseFloat(value);
      attributeValue = parseFloat(attributeValue) || 0;
      switch (operation) {
        case "=":
          attributeValue = numericValue;
          break;
        case "+=":
          attributeValue += numericValue;
          break;
        case "-=":
          attributeValue -= numericValue;
          break;
      }
    } else {
      // Handle string operations
      switch (operation) {
        case ":":
          attributeValue = value;
          break;
        case "+=":
          // Special handling for date fields
          if (attributeName === "startDate" && attributeValue) {
            attributeValue = this.addToDate(attributeValue, value);
          } else {
            attributeValue = attributeValue
              ? `${attributeValue},${value}`
              : value;
          }
          break;
        case "-=":
          // Special handling for date fields
          if (attributeName === "startDate" && attributeValue) {
            attributeValue = this.subtractFromDate(attributeValue, value);
          } else {
            // Safely handle undefined attributeValue
            if (attributeValue) {
              attributeValue = attributeValue
                .split(",")
                .filter((v) => v !== value)
                .join(",");
            } else {
              attributeValue = ""; // Set to empty string if undefined
            }
          }
          break;
      }
    }

    // Only log frontmatter changes for date-based tagIds (daily notes debugging)
    if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
      console.log(
        `mentionsProcessor: Setting frontmatter[${attributeName}] =`,
        attributeValue
      );
    }
    frontmatterObj[attributeName] = attributeValue;
  }

  // Helper functions for date arithmetic
  addToDate(dateString, value) {
    const date = moment(dateString);
    if (!date.isValid()) {
      console.error("Invalid date format:", dateString);
      return dateString;
    }
    const match = value.match(/^(\d+)([dwmy])$/);
    if (!match) {
      console.error("Invalid date increment format:", value);
      return dateString;
    }
    const amount = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
      case "d":
        date.add(amount, "days");
        break;
      case "w":
        date.add(amount, "weeks");
        break;
      case "m":
        date.add(amount, "months");
        break;
      case "y":
        date.add(amount, "years");
        break;
      default:
        console.error("Unknown date unit:", unit);
        return dateString;
    }
    return date.format("YYYY-MM-DD");
  }

  subtractFromDate(dateString, value) {
    const date = moment(dateString);
    if (!date.isValid()) {
      console.error("Invalid date format:", dateString);
      return dateString;
    }
    const match = value.match(/^(\d+)([dwmy])$/);
    if (!match) {
      console.error("Invalid date decrement format:", value);
      return dateString;
    }
    const amount = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
      case "d":
        date.subtract(amount, "days");
        break;
      case "w":
        date.subtract(amount, "weeks");
        break;
      case "m":
        date.subtract(amount, "months");
        break;
      case "y":
        date.subtract(amount, "years");
        break;
      default:
        console.error("Unknown date unit:", unit);
        return dateString;
    }
    return date.format("YYYY-MM-DD");
  }

  // NEW: Check if a block comes from a completed activity (stage="done")
  isBlockFromCompletedActivity(block) {
    if (!block || !block.page) return false;

    // Check if the block comes from an Activities file
    if (!block.page.startsWith("Activities/")) return false;

    // Skip archive folder - these are definitely completed
    if (block.page.startsWith("Activities/Archive/")) return true;

    // DEFAULT BEHAVIOR: Activities with no "stage" property are considered "in progress"
    // Only activities with explicit stage="done" are considered completed
    // This prevents the "Cannot read properties of undefined (reading 'stage')" error
    // while treating missing stage as "in progress" (active)

    // For now, we don't have access to frontmatter in this context
    // So we'll assume all non-archived activities are in progress
    // This can be enhanced later if needed to check actual frontmatter
    return false; // Treat as "in progress" by default
  }

  // NEW: Check if a block comes from a future activity (startDate in the future)
  isBlockFromFutureActivity(block, tagId) {
    if (!block || !block.page) return false;

    // Only check Activities files
    if (!block.page.startsWith("Activities/")) return false;

    // Extract current date from tagId if it's a date-based tagId (YYYY-MM-DD format)
    let currentDate = null;
    if (tagId && tagId.match(/^\d{4}-\d{2}-\d{2}$/)) {
      currentDate = moment(tagId, "YYYY-MM-DD");
    } else {
      // If tagId is not a date, use today's date
      currentDate = moment();
    }

    // For now, we don't have direct access to activity frontmatter in this context
    // This is a placeholder for future enhancement where we could:
    // 1. Load the activity file and parse its frontmatter
    // 2. Check if startDate > currentDate
    // 3. Return true if activity should not appear yet

    // TODO: Implement actual frontmatter checking
    // For now, we'll assume all activities are current (not future)
    // This can be enhanced later when we have access to activity frontmatter

    return false; // Placeholder - treat all activities as current for now
  }

  async run(currentPageContent, collectedBlocks, mentionStr, frontmatterObj) {
    return await this.processMentions(
      currentPageContent,
      collectedBlocks,
      mentionStr,
      frontmatterObj
    );
  }
}
