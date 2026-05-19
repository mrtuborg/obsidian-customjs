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
      console.error("File not found: ", filename);
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
    const today = moment().format("YYYY-MM-DD");
    console.log("Checking isDailyNote:", fileName, "vs today:", today);
    return fileName === today;
  }

  todayDate() {
    const currentDate = new Date();
    return currentDate.toISOString().split("T")[0];
  }

  generateActivityHeader(date, stage, responsible, type = null, extraFields = {}) {
    // Convert date to proper format
    let formattedDate = moment(date).format("YYYY-MM-DD");

    // Ensure formatting was successful
    if (!formattedDate || formattedDate === "Invalid date") {
      throw new Error(`Failed to format date: ${date}`);
    }

    // Validate formatted date
    if (!moment(formattedDate, "YYYY-MM-DD", true).isValid()) {
      throw new Error(
        `Invalid date format ${formattedDate}. Expected YYYY-MM-DD.`
      );
    }

    // Validate stage
    if (typeof stage !== "string" || !["active", "done"].includes(stage)) {
      throw new Error(`Invalid stage ${stage}. Expected 'active' or 'done'.`);
    }

    // Ensure responsible is always an array
    if (typeof responsible === "string") {
      responsible = [responsible]; // Convert string into an array with one element
    }

    // Validate responsible: Ensure it's an array and all elements are strings
    if (
      !Array.isArray(responsible) ||
      !responsible.every((r) => typeof r === "string")
    ) {
      throw new Error(
        `Invalid responsible ${JSON.stringify(
          responsible
        )}. Expected an array of strings.`
      );
    }

    let headerLines = ["---", `startDate: ${formattedDate}`, `stage: ${stage}`];

    // Add type field if provided
    if (type && typeof type === "string") {
      headerLines.push(`type: ${type}`);
    }

    headerLines.push(`responsible: [${responsible}]`);

    // Append extra custom fields (priority, remind, context_refs, wiki, etc.)
    // These are preserved as-is so no known fields are silently dropped.
    for (const [key, value] of Object.entries(extraFields)) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value)) {
        if (value.length === 0) {
          headerLines.push(`${key}: []`);
        } else {
          headerLines.push(`${key}:`);
          value.forEach((v) => headerLines.push(`  - ${v}`));
        }
      } else {
        headerLines.push(`${key}: ${value}`);
      }
    }

    headerLines.push("---");

    return headerLines.join("\n");
  }

  // Function to generate the header
  generateDailyNoteHeader(title) {
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

  /**
   * Parse a single frontmatter field value from raw file content.
   * Returns the raw string value, or null if not found.
   * More reliable than metadata cache which may be stale during DataviewJS re-render.
   */
  parseFrontmatterField(content, fieldName) {
    if (!content || typeof content !== "string") return null;
    const lines = content.split("\n");
    if (!lines[0] || lines[0].trim() !== "---") return null;
    // Escape regex meta-characters in field name
    const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escapedName}:\\s*(.+)$`);
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") break;
      const match = lines[i].match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  /**
   * Parse non-standard frontmatter fields from raw file content.
   * Handles scalar values, inline YAML sequences ([a, b]), and block YAML lists (- item).
   * More reliable than metadata cache which may be stale during DataviewJS re-render.
   *
   * @param {string} content - Raw file content
   * @param {Set} standardFields - Field names to exclude (they are managed explicitly)
   * @returns {Object} Map of extra field names to their values (string or string[])
   */
  parseExtraFrontmatterFields(content, standardFields) {
    if (!content || typeof content !== "string") return {};
    const lines = content.split("\n");
    const extraFields = {};

    if (!lines[0] || lines[0].trim() !== "---") return extraFields;

    let endLine = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") { endLine = i; break; }
    }
    if (endLine === -1) return extraFields;

    let currentKey = null;
    let currentIsArray = false;

    for (let i = 1; i < endLine; i++) {
      const line = lines[i];

      // Block list item (indented with spaces/tabs, starts with "- ")
      if (currentIsArray && currentKey && /^\s+-\s/.test(line)) {
        const itemVal = line.replace(/^\s+-\s/, "").trim();
        if (!Array.isArray(extraFields[currentKey])) extraFields[currentKey] = [];
        extraFields[currentKey].push(itemVal);
        continue;
      }

      // Key: value line
      const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (!kvMatch) {
        // Non-key, non-list-item line resets array state
        currentIsArray = false;
        currentKey = null;
        continue;
      }

      const key = kvMatch[1];
      const rawVal = kvMatch[2].trim();

      currentIsArray = false;
      currentKey = null;

      if (standardFields.has(key)) continue;

      if (rawVal === "") {
        // Possibly a block list — peek at the next line to decide
        const nextLine = i + 1 < endLine ? lines[i + 1] : "";
        if (/^\s+-\s/.test(nextLine)) {
          // Next line is a list item → start collecting as array
          extraFields[key] = [];
          currentKey = key;
          currentIsArray = true;
        } else {
          // Empty scalar (null-like) → preserve as empty string, not array
          extraFields[key] = "";
        }
      } else if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        // Inline YAML sequence: [Me] or [tag1, tag2]
        const inner = rawVal.slice(1, -1);
        extraFields[key] = inner.length === 0
          ? []
          : inner.split(",").map(s => s.trim()).filter(Boolean);
      } else {
        extraFields[key] = rawVal;
        currentKey = key;
      }
    }

    return extraFields;
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
    // The closing line must be exactly ``` (no language tag) to avoid matching
    // nested code fences inside the dataviewjs script.
    if (pageContent.startsWith("```dataviewjs")) {
      const dataviewLines = pageContent.split("\n");
      let blockStart = -1;
      let blockEnd = -1;

      for (let i = 0; i < dataviewLines.length; i++) {
        if (dataviewLines[i].startsWith("```dataviewjs") && blockStart === -1) {
          blockStart = i;
        } else if (blockStart !== -1 && dataviewLines[i].trim() === "```") {
          // Only a bare ``` line closes the dataviewjs block
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
