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
        item.data.includes(tagId)
    );

    //console.log("Step 3: Open the current note\n");
    const currentLines = currentPageContent.split("\n");

    //console.log("Step 4: Find the last occurrence of '***'");
    let insertIndex = Math.max(
      currentLines.lastIndexOf("---"),
      currentLines.lastIndexOf("----")
    );

    // If neither is found, set insertIndex to the end of the lines
    insertIndex =
      insertIndex !== -1 ? insertIndex + 1 : currentLines.length + 1;
    //- const notesIndex =
    //-   currentLines.findIndex((line) => line.trim() === "### Notes:") + 1;

    //console.log("Step 5: Insert the collected mentions elements after the latest '---'");

    // Map to store mention blocks by their source file
    // Initialize mentionBlocksBySource from existing data
    let mentionBlocksBySource = {};

    mentionBlocks.forEach((mention) => {
      let mentionData = mention.data;
      let mentionPageLink = mention.page;
      console.log("mention", mention);
      const linkPart = mentionPageLink
        .toString()
        .replace(/.*\/|\.md.*/g, "")
        .trim();

      // Add the mention block to the map
      if (mentionData.length > 0 && mentionData.includes(tagId)) {
        const mentionLines = mentionData.split("\n");
        //-console.log("mentionLines: ", mentionLines);
        let isMentionDataNew = true;

        // Avoid adding duplicate mentions
        // Check if the mention data already exists in the current lines
        mentionLines.forEach((line) => {
          //console.log("---");
          //console.log("tagId: ", tagId);
          line = line.replace(tagId, "").replace(/\[\[.*?\]\]/g, "");
          //console.log("looks for line: ", line);
          if (currentLines.includes(line) && !currentLines.includes("```")) {
            //console.log("already here, skip");
            isMentionDataNew = false;
          }
        });

        if (isMentionDataNew) {
          //-console.log("new data: ", mentionData);
          // Initialize the array for the source file if it doesn't exist
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
    console.log("newContent: ", newContent);
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
