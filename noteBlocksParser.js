// Obsidian dataviewjs executable script
// formet as a class for customJS plugin
// Use only API functions from dataviewjs
// ---
// Parse note blocks and extract data
// The blocks could be of three types:
// 1. Callouts
// 2. Code blocks
// 3. Headers and paragraphs under header. Header is a line starting with `#` and followed by a space.
//    This block finishes on the next header of the same or higher level, or on the splitter `---`, or on two empty lines.
// 4. Mentions: `[[Mention]]` or `[[Mention|Alias]]` with everything in between and after the mention.
//
// All blocks except headers are single-line.
// Headers can be multi-line. This block finishes on following rules:
// - the next header of the same or higher level
// - the splitter `---`
// - on two empty lines.
//
// The output is an array of objects with the following structure:
// {
//     page: string, // page link
//     blockType: string, // block type: 'callout', 'code', 'header', 'mention'
//     data: string, // block content
//     mtime: number, // modification time
//     headerLevel: number // header level if blockType is 'header'
// }
//
// Input: content of the note
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
    let currentBlock = null;
    let currentHeaderLevel = 0;
    const blocks = [];
    let insideCodeBlock = false;
    let emptyLineCount = 0;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (this.isHeader(line)) {
        // When meet the # line
        const newHeaderLevel = this.getHeaderLevel(line);

        if (
          !currentBlock ||
          (currentBlock && currentBlock.blockType !== "header")
        ) {
          // If the current block is not a header already
          // Add the previously collected block before starting a new one
          if (currentBlock) {
            this.addBlock(blocks, currentBlock);
            currentBlock = null;
          }
          currentBlock = this.createBlock(
            page,
            "header",
            [line],
            newHeaderLevel
          ); // Start a new block
          emptyLineCount = 0; // Reset empty line count
        } else {
          // But we still to finalize currentBlock if it was header with lower header level than now
          // Add the previously collected block if the new header level is greater than to the current header level
          if (newHeaderLevel > currentHeaderLevel) {
            this.addBlock(blocks, currentBlock);
            currentBlock = null;
            currentBlock = this.createBlock(
              page,
              "header",
              [line],
              newHeaderLevel
            );
            //- emptyLineCount = 0; // Reset empty line count
          }
          currentBlock.content.push(line); // Add to the current header block
        }
        emptyLineCount = 0; // Reset empty line count
      } else if (this.isCallout(line)) {
        // When meet the > line
        if (currentBlock && currentBlock.blockType == "header") continue; // Skip code block inside header

        if (
          !currentBlock ||
          (currentBlock && currentBlock.blockType != "callout")
        ) {
          // If the current block is not a callout already
          // Add the previously collected block before starting a new one
          if (currentBlock) {
            this.addBlock(blocks, currentBlock);
            currentBlock = null;
          }
          currentBlock = this.createBlock(page, "callout", [line]); // Start a new block
        } else {
          currentBlock.content.push(line);
        }
        emptyLineCount = 0; // Reset empty line count
      } else if (this.isCodeBlock(line)) {
        // When meet the ``` line
        if (currentBlock && currentBlock.blockType == "header") continue; // Skip code block inside header

        if (
          !currentBlock ||
          (currentBlock && currentBlock.blockType !== "code")
        ) {
          // If the current block is not a code block already
          // Add the previously collected block before starting a new one
          if (currentBlock) {
            this.addBlock(blocks, currentBlock);
            currentBlock = null;
          }
          currentBlock = this.createBlock(page, "code", [line]); // Start a new block
        } else {
          currentBlock.content.push(line); // Add to the current header block
        }
        emptyLineCount = 0; // Reset empty line count
      } else if (this.isMention(line)) {
        if (currentBlock && currentBlock.blockType == "header") continue; // Skip code block inside header

        // Add the previously collected block before starting a new one
        // Mention block is always single-line, so no need to check if it is already a mention
        if (currentBlock) {
          this.addBlock(blocks, currentBlock);
          currentBlock = null;
        }
        currentBlock = this.createBlock(page, "mention", [line]); // Start a new block
        emptyLineCount = 0; // Reset empty line count
      } else if (
        this.isTodoLine(line) &&
        currentBlock &&
        currentBlock.blockType !== "header"
      ) {
        // When meet the - [ ] line
        // Check if the line is a todo line

        // Current block is a collection of lines

        // Ignore todo block inside header
        if (currentBlock && currentBlock.blockType == "header") continue;

        // Remove the '>' symbol if it exists
        if (line.trim().startsWith(">")) {
          line = line.trim().substring(1).trim();
        }

        //if (!currentBlock || (currentBlock && currentBlock.blockType !== 'todo')) { // If the current block is not a todoLines block already
        // Add the previously collected block before starting a new one
        if (currentBlock) {
          // If collection is not empty -
          // Add the previously collected block before starting a new one
          this.addBlock(blocks, currentBlock);
          currentBlock = null;
        }

        // If current block is empty -
        // Initialize a new block "todo" with the current line
        // Todo is always a single line
        currentBlock = this.createBlock(page, "todo", [line]);
        this.addBlock(blocks, currentBlock);
        currentBlock = null;
        emptyLineCount = 0; // Reset empty line count
      } else if (
        this.isDoneLine(line) &&
        currentBlock &&
        currentBlock.blockType !== "header"
      ) {
        if (currentBlock && currentBlock.blockType == "header") continue;

        if (line.trim().startsWith(">")) {
          line = line.trim().substring(1).trim();
        }
        if (currentBlock) {
          this.addBlock(blocks, currentBlock);
          currentBlock = null;
        }
        currentBlock = this.createBlock(page, "done", [line]);
        emptyLineCount = 0; // Reset empty line count
        // Looking for the end of header block
      } else if (line.trim() === "") {
        // We need to count empty lines and finalize the block if there are two empty lines
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          emptyLineCount = 0; // Reset empty line count
          if (currentBlock) {
            // && currentBlock.blockType === "header") {

            this.addBlock(blocks, currentBlock);
            currentBlock = null;
          }
        }

        // To keep paragraph formatting, I need to add empty line to the current block
        // but somehow it breaks the block structure
        //+ if (currentBlock) {
        //+    console.log("Empty line in the block: ", currentBlock);
        //+    currentBlock.content.push('\n'); // Add to the current block
        //+}
      } else if (line.trim() === "---" || line.trim() === "----") {
        // Horizontal ruler
        if (currentBlock) {
          // && currentBlock.blockType === "header") {
          this.addBlock(blocks, currentBlock);
          currentBlock = null;
        }
        emptyLineCount = 0; // Reset empty line count
      } else {
        // If the line is not empty and not a header, callout, code block, or mention
        // just add it to the current block if it exists and reset the empty line count
        // since it is not an empty line
        if (currentBlock) {
          currentBlock.content.push(line); // Add to the current block
        }
        emptyLineCount = 0; // Reset empty line count
      }
    }

    // Add the last collected block
    this.addBlock(blocks, currentBlock);
    return blocks;
  }

  isCallout(line) {
    // Check if the line starts with '>'
    if (line.trim().startsWith(">")) {
      // Check if the line contains a todo marker after the '>'
      const trimmedLine = line.trim().substring(1).trim();
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
    return /\[\[.*?\]\]/.test(line);
  }

  isTodoLine(line) {
    return line.startsWith("- [ ]") || line.trim().startsWith("> - [ ]");
  }

  isDoneLine(line) {
    return line.startsWith("- [x]") || line.trim().startsWith("> - [x]");
  }

  createBlock(page, type, data, headerLevel = 0) {
    return {
      page: page, // Placeholder, should be set appropriately
      blockType: type,
      content: data,
      mtime: Date.now(),
      level: headerLevel,
    };
  }

  addBlock(blocks, block) {
    if (block) {
      // Check if the block already exists in the blocks array
      const isDuplicate = blocks.some(
        (existingBlock) =>
          existingBlock.page === block.page &&
          existingBlock.blockType === block.blockType &&
          existingBlock.data === block.content.join("\n") &&
          existingBlock.headerLevel === (block.level || 0)
      );

      // Only push the block if it is not a duplicate
      if (!isDuplicate) {
        blocks.push({
          page: block.page, // Add logic to determine the page link if necessary
          blockType: block.blockType,
          data: block.content.join("\n"),
          mtime: block.mtime, // Use actual modification time if available
          headerLevel: block.level || 0,
        });
      }
    }
  }

  async run(app, pages, namePattern = "") {
    let allBlocks = [];

    //console.log("Starting to process pages...");
    //console.log("Name pattern:", namePattern);

    for (const page of pages) {
      // If a namePattern is provided, check if the page name includes the pattern
      if (namePattern && !moment(page.file.name, namePattern, true).isValid()) {
        console.log(
          "Skipping file (does not match date format):",
          page.file.name
        );
        continue;
      }

      const content = await this.loadFile(app, page.file.path);
      const blocks = this.parse(page.file.path, content);
      blocks.forEach((block) => {
        block.page = page.file.path;
        allBlocks.push(block);
      });
    }

    //console.log("Finished processing pages. Parsed blocks:", allBlocks);
    return allBlocks;
  }
}

// Example usage:
// -----------------
// const content = `# Header 1
// Some paragraph text.
// > Callout text
// \`\`\`js
// console.log('Code block');
// \`\`\`
// [[Mention]]
// `;
//
// const parser = new NoteBlocksParser(content);
// const parsedBlocks = parser.parse();
// console.log(parsedBlocks);
// -----------------
