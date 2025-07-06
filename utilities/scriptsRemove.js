// This script removes all scripts from the current file
// if the date in the filename matches today's date
// and the file is not a static page.
class scriptsRemove {
  async loadFile(app, filename) {
    const abstractFilePath = app.vault.getAbstractFileByPath(filename);
    if (!abstractFilePath) {
      console.error("File not found: ", filename);
      return null;
    }

    const content = await app.vault.read(abstractFilePath);
    return content;
  }

  async removeScripts(currentPageContent) {
    let currentLines = currentPageContent
      .trim()
      .split("\n")
      .filter((line) => {
        // Cannot handle 'undefined'
        return line !== undefined && line !== null && line.trim() !== "";
      });

    // Remove JavaScript code blocks
    let inCodeBlock = false;
    currentLines = currentLines.filter((line) => {
      if (line.trim().startsWith("```dataviewjs")) {
        inCodeBlock = true;
        return false; // Remove the start of the code block
      }
      if (inCodeBlock && line.trim() === "```") {
        inCodeBlock = false;
        return false; // Remove the end of the code block
      }
      return !inCodeBlock; // Remove lines within the code block
    });

    const newContent = currentLines.join("\n");
    return newContent;
  }

  async run(currentPageContent) {
    return await this.removeScripts(currentPageContent);
  }
}
