// This class is responsible for file input/output operations for my javaScript files.
// It provides methods to save and load files, as well as to process attributes in the frontmatter of markdown files.
//

// Usage example:
// fileIO.saveFile(app, 'example.md', 'New content');

class fileIO {
  // This function processes the attributes in the markdown file
  async saveFile(app, filename, content) {
    const abstractFilePath = app.vault.getAbstractFileByPath(filename);
    if (!abstractFilePath) {
      console.error("File not found: ", page.path);
      return;
    }

    if (typeof content !== "string") {
      throw new TypeError("Content must be a string");
    }

    // Check if content is empty
    if (content.trim().length == 0) return;

    // Modify the file and force cache update
    // await app.vault.modify(abstractFilePath, content);

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

  // This function loads the content of a file
  static async loadPagesContent(dv, pages) {
    const pagesContent = [];
    for (const page of pages) {
      const content = await dv.io.load(page.path);
      pagesContent.push({ page, content });
    }
    return pagesContent;
  }

  // This function checks file name against current date
  isDailyNote(fileName) {
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split("T")[0];
    return fileName === formattedDate;
  }

  // Function to generate the header
  generateHeader(title) {
    const year = moment(title, "YYYY-MM-DD").format("YYYY");
    const month = moment(title, "YYYY-MM-DD").format("YYYY-MM");
    const monthStr = moment(title, "YYYY-MM-DD").format("MMMM");
    const week = moment(title, "YYYY-MM-DD").format("YYYY-[W]W");
    const weekNum = moment(title, "YYYY-MM-DD").format("WW");
    const dayStr = moment(title, "YYYY-MM-DD").format("DD");

    let headerLines = [
      "---",
      "---",
      `### ${dayStr} [[${month}|${monthStr}]] [[${year}]]`,
      `#### Week: [[${week}|${weekNum}]]`,
    ];

    return headerLines.join("\n");
  }

  extractFrontmatterAndDataviewJs(content) {
    const lines = content.split("\n");
    let frontmatter = "";
    let dataviewJsBlock = "";
    let pageContent = content.trim();

    // Extract frontmatter
    if (lines[0] === "---") {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === "---") {
          frontmatter = lines
            .slice(0, i + 1)
            .join("\n")
            .trim();
          pageContent = lines
            .slice(i + 1)
            .join("\n")
            .trim();
          break;
        }
      }
    }

    // Extract dataviewjs block
    if (pageContent.startsWith("```dataviewjs")) {
      const dataviewLines = pageContent.split("\n");
      let blockStart = -1;
      let blockEnd = -1;

      for (let i = 0; i < dataviewLines.length; i++) {
        if (dataviewLines[i].startsWith("```dataviewjs") && blockStart === -1) {
          blockStart = i;
        } else if (dataviewLines[i].startsWith("```") && blockStart !== -1) {
          blockEnd = i;
          break;
        }
      }

      if (blockStart !== -1 && blockEnd !== -1) {
        dataviewJsBlock = dataviewLines
          .slice(blockStart, blockEnd + 1)
          .join("\n")
          .trim();

        pageContent = dataviewLines
          .slice(blockEnd + 1)
          .join("\n")
          .trim();
      }
    }

    // Ensure all values are defined and not undefined
    frontmatter = frontmatter || "";
    dataviewJsBlock = dataviewJsBlock || "";
    pageContent = pageContent || "";

    return { frontmatter, dataviewJsBlock, pageContent };
  }
}
