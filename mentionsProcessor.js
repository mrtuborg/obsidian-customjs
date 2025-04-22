// This script is looking for pages that mentioning the current page in the whole vault.
// It collects all the mentions and adds them to the current page.

class mentionsProcessor {
  async saveFile(app, filename, content) {
    const abstractFilePath = app.vault.getAbstractFileByPath(filename);
    if (!abstractFilePath) {
      console.error("File not found: ", page.path);
      return;
    }

    if (content.trim().length == 0) return;

    // Modify the file and force cache update
    await app.vault.modify(abstractFilePath, content);

    // Force cache update (if applicable)
    if (app.metadataCache) {
      await app.metadataCache.getFileCache(abstractFilePath);
    }

    // workaround
    await app.vault.modify(abstractFilePath, content);
  }

  async loadFile(app, filename) {
    const abstractFilePath = app.vault.getAbstractFileByPath(filename);
    if (!abstractFilePath) {
      console.error("File not found: ", filename);
      return null;
    }

    const content = await app.vault.read(abstractFilePath);
    return content;
  }

  // This function processes the mentions in the markdown file
  // It reads the file content, extracts the frontmatter, and processes each line
  // to update the mentions based on the specified operations.
  // Mentions are defined within double curly braces {} in the markdown file

  async processMentions(app, dv, blocks, tagId) {
    //console.log(blocks);
    // This is async operation
    let mentionBlocks = blocks.filter(
      (item) =>
        (item.blockType === "mention" ||
          item.blockType === "header" ||
          item.blockType === "code") &&
        item.data.includes(tagId)
    );

    const currentPage = dv.current().file;

    //console.log("Step 3: Open the current note\n");
    const currentPageContent = await this.loadFile(app, currentPage.path);
    const currentLines = currentPageContent.split("\n");

    //console.log("Step 4: Find the last occurrence of '---'");
    let insertIndex = currentLines.lastIndexOf("---") + 1;
    const notesIndex =
      currentLines.findIndex((line) => line.trim() === "# Notes:") + 1;

    //console.log("Step 5: Insert the collected mentions elements after the latest '---'");

    // Map to store mention blocks by their source file
    // Initialize mentionBlocksBySource from existing data
    let mentionBlocksBySource = {};

    mentionBlocks.forEach((mention) => {
      let mentionData = mention.data;
      let mentionPageLink = mention.page;

      const linkPart = mentionPageLink
        .toString()
        .replace(/.*\/|\.md.*/g, "")
        .trim();

      // Add the mention block to the map
      if (mentionData.length > 0 && mentionData.includes(tagId)) {
        const mentionLines = mentionData.split("\n");
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
          //console.log("new data: ", mentionData);
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

    //console.log(mentionBlocksBySource);

    if (mentionBlocks.length === 0) return;

    let newContent = [];
    Object.keys(mentionBlocksBySource).forEach((linkPart) => {
      if (mentionBlocksBySource[linkPart].length > 0) {
        newContent.push(`\n[[${linkPart}]]`);
        mentionBlocksBySource[linkPart].forEach((mentionData) => {
          newContent.push(mentionData + "\n");
        });
      }
    });

    if (newContent.length === 0) return;

    newContent.push("\n---");

    // Insert the new mention blocks
    currentLines.splice(insertIndex, 0, ...newContent);
    newContent = currentLines.join("\n");

    // Save the new content to the current note
    // Ensure the file is not empty before saving
    await this.saveFile(app, currentPage.path, newContent);
  }

  async run(app, dv, collectedBlocks, mentionStr) {
    await this.processMentions(app, dv, collectedBlocks, mentionStr);
  }
}
