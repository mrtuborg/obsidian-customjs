// This script is looking for pages that mentioning the current page in the whole vault.
// It collects all the mentions and adds them to the current page.

class mentionsProcessor {
  // This function processes the mentions in the markdown file
  // It reads the file content, extracts the frontmatter, and processes each line
  // to update the mentions based on the specified operations.
  // Mentions are defined within double curly braces {} in the markdown file

  async processMentions(currentPageContent, blocks, tagId) {
    // This is async operation
    let mentionBlocks = blocks.filter(
      (item) =>
        (item.blockType === "mention" ||
          item.blockType === "header" ||
          item.blockType === "code") &&
        item.data.includes(tagId) &&
        !currentPageContent.includes(tagId) // Exclude blocks from the current page
    );

    //console.log("Step 3: Open the current note\n");
    let currentLines = [];
    if (currentPageContent && currentPageContent.trim().length > 0)
      currentLines = currentPageContent.split("\n");

    //console.log("Step 4: Find the last occurrence of '***'");
    let insertIndex = Math.max(
      currentLines.lastIndexOf("---"),
      currentLines.lastIndexOf("----")
    );

    // If neither is found, set insertIndex to the end of the lines
    insertIndex =
      insertIndex !== -1 ? insertIndex + 1 : currentLines.length + 1;

    //console.log("Step 5: Insert the collected mentions elements after the latest '---'");

    // Map to store mention blocks by their source file
    // Initialize mentionBlocksBySource from existing data
    let mentionBlocksBySource = {};

    // Helper function to normalize a line
    function normalizeLine(line, tagId) {
      return line
        .replace(tagId, "")
        .replace(/\[\[.*?\]\]/g, "")
        .trim();
    }

    // Helper function to check if a line is new
    function isLineNew(normalizedLine, normalizedCurrentLines) {
      return !normalizedCurrentLines.includes(normalizedLine);
    }

    // Main processing logic
    mentionBlocks.forEach((mention) => {
      let mentionData = mention.data;
      let mentionPageLink = mention.page;

      const linkPart = mentionPageLink
        .toString()
        .replace(/.*\/|\.md.*/g, "")
        .trim();

      if (mentionData.length > 0 && mentionData.includes(tagId)) {
        const mentionLines = mentionData.split("\n");
        const normalizedCurrentLines = currentLines.map((l) => l.trim());
        let isMentionDataNew = false;

        mentionLines.forEach((line) => {
          const normalizedLine = normalizeLine(line, tagId);
          if (isLineNew(normalizedLine, normalizedCurrentLines)) {
            isMentionDataNew = true;
          }
        });

        if (isMentionDataNew) {
          if (!mentionBlocksBySource[linkPart]) {
            mentionBlocksBySource[linkPart] = [];
          }
          mentionBlocksBySource[linkPart].push(
            mentionData.replace(/\[\[.*?\]\]/g, "")
          );
        }
      }
    });

    console.log(mentionBlocksBySource);

    if (mentionBlocks.length === 0) return "";

    let newContent = [];
    Object.keys(mentionBlocksBySource).forEach((linkPart) => {
      const blockDataLength = mentionBlocksBySource[linkPart]
        .join("\n")
        .trim().length;
      if (blockDataLength > 0) {
        newContent.push(`\n[[${linkPart}]]`);
        mentionBlocksBySource[linkPart].forEach((mentionData) => {
          newContent.push(mentionData + "\n");
        });
      }
    });

    if (newContent.length === 0) return "";
    newContent.push("\n---");

    // Insert the new mention blocks
    currentLines.splice(insertIndex, 0, ...newContent);
    newContent = currentLines.join("\n");

    return newContent;
  }

  async run(currentPageContent, collectedBlocks, mentionStr) {
    return await this.processMentions(
      currentPageContent,
      collectedBlocks,
      mentionStr
    );
  }
}
