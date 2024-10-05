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

    parse(content) {
        const lines = content.split('\n');
        let currentBlock = null;
        let currentHeaderLevel = 0;
        const blocks = [];
        let insideCodeBlock = false;
        let emptyLineCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            //console.log(line);
            if (this.isHeader(line)) { // When meet the # line
                console.log('+---isHeader');
                console.log(line);

                const newHeaderLevel = this.getHeaderLevel(line);
                console.log('new level:', newHeaderLevel);
                console.log('current level:', currentHeaderLevel);

                if (!currentBlock || (currentBlock && currentBlock.blockType !== 'header')) { // If the current block is not a header already
                    // Add the previously collected block before starting a new one
                    if (currentBlock) {
                        this.addBlock(blocks, currentBlock);
                        currentBlock = null
                    }
                    currentBlock = this.createBlock('header', [line], newHeaderLevel); // Start a new block
                    emptyLineCount = 0; // Reset empty line count
                } else {
                    // But we still to finalize currentBlock if it was header with lower header level than now
                     // Add the previously collected block if the new header level is greater than or equal to the current header level
                    if (newHeaderLevel < currentHeaderLevel) {
                        this.addBlock(blocks, currentBlock);
                        currentBlock = null
                        currentBlock = this.createBlock('header', [line], newHeaderLevel);
                        emptyLineCount = 0; // Reset empty line count
                    }
                    currentBlock.content.push(line); // Add to the current header block
                }

            } else if (this.isCallout(line)) { // When meet the > line
                if (currentBlock && currentBlock.blockType == 'header') continue; // Skip code block inside header

                if (!currentBlock || (currentBlock && currentBlock.blockType != 'callout')) { // If the current block is not a callout already
                    console.log('not inside of CalloutBlock');
                    // Add the previously collected block before starting a new one
                    if (currentBlock) {
                        this.addBlock(blocks, currentBlock);
                        currentBlock = null
                    }
                    currentBlock = this.createBlock('callout', [line]); // Start a new block
                } else {
                    currentBlock.content.push(line);
                }

            } else if (this.isCodeBlock(line)) { // When meet the ``` line
                if (currentBlock && currentBlock.blockType == 'header') continue; // Skip code block inside header

                if (!currentBlock || (currentBlock && currentBlock.blockType !== 'code')) { // If the current block is not a code block already
                    // Add the previously collected block before starting a new one
                    if (currentBlock) {
                        this.addBlock(blocks, currentBlock);
                        currentBlock = null
                    }
                    currentBlock = this.createBlock('code', [line]); // Start a new block
                } else {
                    currentBlock.content.push(line); // Add to the current header block
                }
            } else if (this.isMention(line)) {
                if (currentBlock && currentBlock.blockType == 'header') continue; // Skip code block inside header

                // Add the previously collected block before starting a new one
                // Mention block is always single-line, so no need to check if it is already a mention
                if (currentBlock) {
                    this.addBlock(blocks, currentBlock);
                    currentBlock = null
                }
                currentBlock = this.createBlock('mention', [line]); // Start a new block
            } else if (this.isTodoLine(line)) {
                if (currentBlock && currentBlock.blockType == 'header') continue; // Skip code block inside header

                if (!currentBlock || (currentBlock && currentBlock.blockType !== 'todo')) { // If the current block is not a todoLines block already
                    // Add the previously collected block before starting a new one
                    if (currentBlock) {
                        this.addBlock(blocks, currentBlock);
                        currentBlock = null
                    }
                    currentBlock = this.createBlock('todo', [line]); // Start a new block
                } else {
                    // If the current block is still a todoLines, we need just to add the line
                    currentBlock.content.push(line);
                }
            // Looking for the end of header block
            } else if (line.trim() === '') { // Empty line
                emptyLineCount++;
                if (emptyLineCount >= 2 && currentBlock && currentBlock.blockType === 'header') {
                    this.addBlock(blocks, currentBlock);
                    currentBlock = null;
                }
            } else if (line.trim() === '---') { // Horizontal rule
                if (currentBlock && currentBlock.blockType === 'header') {
                    this.addBlock(blocks, currentBlock);
                    currentBlock = null;
                }
                emptyLineCount = 0; // Reset empty line count
            } else {
                if (currentBlock) {
                    console.log(currentBlock);
                    currentBlock.content.push(line); // Add to the current block
                }
            }
        }

        // Add the last collected block
        this.addBlock(blocks, currentBlock);
        return blocks;
    }

    isCallout(line) {
        // Implement logic to check if the line is a callout
        return line.startsWith('>');
    }

    isCodeBlock(line) {
        return line.startsWith('```');
    }

    isHeader(line) {
        return /^#+\s/.test(line);
    }

    getHeaderLevel(line) {
        return line.match(/^#+/)[0].length;
    }

    isMention(line) {
        return /\[\[.*?\]\]/.test(line);
    }

    isTodoLine(line) {
        return line.startsWith('- [ ]') || line.startsWith('- [x]');
    }

    createBlock(type, data, headerLevel = 0) {
        return {
            page: '', // Placeholder, should be set appropriately
            blockType: type,
            content: data,
            mtime: Date.now(),
            level: headerLevel
        };
    }

    addBlock(blocks, block) {
        if (block) {
            blocks.push({
                page: '', // Add logic to determine the page link if necessary
                blockType: block.blockType,
                data: block.content.join('\n'),
                mtime: block.mtime, // Use actual modification time if available
                headerLevel: block.level || 0
            });
        }
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

