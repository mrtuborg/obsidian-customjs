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

    // if (mentionBlocks) console.log("mentionBlocks:", mentionBlocks);

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
        .replace(/(?<!\!)\[\[.*?\]\]/g, "")
        .trim();
    }

    // Helper function to check if a line is new
    function isLineNew(normalizedLine, normalizedCurrentLines) {
      // Treat empty lines as new to preserve them
      if (normalizedLine === "") return true;
      return !normalizedCurrentLines.includes(normalizedLine);
    }

    // Main processing logic
    let addedMentionLines = new Set();

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
          if (
            isLineNew(normalizedLine, normalizedCurrentLines) &&
            !addedMentionLines.has(normalizedLine)
          ) {
            console.log(
              `New mention found: ${normalizedLine} in ${mentionPageLink}`
            );
            isMentionDataNew = true;
          } else {
            console.log(
              `Existing mention found: ${normalizedLine} in ${mentionPageLink}`
            );
          }
        });

        if (isMentionDataNew) {
          if (!mentionBlocksBySource[linkPart]) {
            mentionBlocksBySource[linkPart] = [];
          }
          // Filter mentionLines to only include new lines not in addedMentionLines
          const filteredNewLines = mentionLines.filter((line) => {
            const normalizedLine = normalizeLine(line, tagId);
            return (
              isLineNew(normalizedLine, normalizedCurrentLines) &&
              !addedMentionLines.has(normalizedLine)
            );
          });
          if (filteredNewLines.length > 0) {
            const filteredMentionData = filteredNewLines
              .join("\n")
              .replace(/(?<!\!)\[\[.*?\]\]/g, "");
            mentionBlocksBySource[linkPart].push(filteredMentionData);
            // Add normalized lines to the set to avoid duplicates
            filteredNewLines.forEach((line) => {
              const normalizedLine = normalizeLine(line, tagId);
              addedMentionLines.add(normalizedLine);
            });
          }
        }
      }
    });

    if (mentionBlocks.length === 0) return "";

    let newContent = [];
    Object.keys(mentionBlocksBySource).forEach((linkPart) => {
      const blockDataLength = mentionBlocksBySource[linkPart]
        .join("\n")
        .trim().length;
      if (blockDataLength > 0) {
        // Filter mention data to remove non-meaningful headers but keep empty lines
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

    // console.log("mentionProcessor:", newContent);

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
