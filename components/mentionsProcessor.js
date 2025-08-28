// This script is looking for pages that mentioning the current page in the whole vault.
// It collects all the mentions and adds them to the current page.

class mentionsProcessor {
  // This function processes the mentions in the markdown file
  // It reads the file content, extracts the frontmatter, and processes each line
  // to update the mentions based on the specified operations.
  // Mentions are defined within double curly braces {} in the markdown file

  async processMentions(currentPageContent, blocks, tagId, frontmatterObj) {
    this.frontmatterObj = frontmatterObj;
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

    // Helper function to convert directives when copying from other files
    function processDirectiveLine(
      line,
      sourceFileName,
      currentPageContent,
      frontmatterObj,
      isCodeBlock = false
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
          console.log(
            `Skipping directive ${match} from ${sourceFileName} - already copied from this file`
          );
          return null; // Mark for removal
        }

        // Process the directive immediately before converting to comment
        console.log(
          `Processing directive from ${sourceFileName}: ${directive}`
        );
        processDirective(directive, frontmatterObj);

        console.log(`Converting directive: ${match} -> ${processedDirective}`);
        return processedDirective;
      });

      // If any directive was marked for removal (null), skip this line
      if (processedLine && processedLine.includes("null")) {
        return null;
      }

      return processedLine;
    }

    // Helper function to process a single directive
    function processDirective(directive, frontmatterObj) {
      // Parse the directive (same logic as attributesProcessor)
      const operations_sorted = ["-=", "+=", "=", ":"];
      const operation = operations_sorted.find((op) => directive.includes(op));

      if (!operation) return;

      const operationIndex = directive.indexOf(operation);
      const attributeName = directive.substring(0, operationIndex).trim();
      const value = directive
        .substring(operationIndex + operation.length)
        .trim();

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
              attributeValue = addToDate(attributeValue, value);
            } else {
              attributeValue = attributeValue
                ? `${attributeValue},${value}`
                : value;
            }
            break;
          case "-=":
            // Special handling for date fields
            if (attributeName === "startDate" && attributeValue) {
              attributeValue = subtractFromDate(attributeValue, value);
            } else {
              attributeValue = attributeValue
                .split(",")
                .filter((v) => v !== value)
                .join(",");
            }
            break;
        }
      }

      console.log(
        `mentionsProcessor: Setting frontmatter[${attributeName}] =`,
        attributeValue
      );
      frontmatterObj[attributeName] = attributeValue;
    }

    // Helper functions for date arithmetic (copied from attributesProcessor)
    function addToDate(dateString, value) {
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

    function subtractFromDate(dateString, value) {
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
            // Check if this is a code block
            const isCodeBlock = mention.blockType === "code";

            // Process directives in the filtered lines
            const processedLines = filteredNewLines
              .map((line) =>
                processDirectiveLine(
                  line,
                  linkPart,
                  currentPageContent,
                  this.frontmatterObj,
                  isCodeBlock
                )
              )
              .filter((line) => line !== null); // Remove lines marked for removal

            if (processedLines.length > 0) {
              const filteredMentionData = processedLines
                .join("\n")
                .replace(/(?<!\!)\[\[.*?\]\]/g, "");
              mentionBlocksBySource[linkPart].push(filteredMentionData);
              // Add normalized lines to the set to avoid duplicates
              processedLines.forEach((line) => {
                const normalizedLine = normalizeLine(line, tagId);
                addedMentionLines.add(normalizedLine);
              });
            }
          }
        }
      }
    });

    if (mentionBlocks.length === 0) return "";

    let newContent = [];

    // Sort mention blocks by date (chronological order: oldest → newest)
    //
    // SORTING DECISION: Chronological by date in linkPart (YYYY-MM-DD format)
    //
    // How it works:
    // - Extracts date from linkPart: "2025-07-26" → moment object
    // - Sorts by date: older dates first, newer dates after
    // - Non-date linkParts are sorted alphabetically at the end
    //
    // Examples of sort order in activity files:
    // - "[[2025-07-26]]" → comes FIRST (older date)
    // - "[[2025-08-25]]" → comes AFTER (newer date)
    // - "[[Non-Date-Link]]" → comes LAST (alphabetically)
    //
    // PROS of chronological sorting:
    // ✅ Timeline Order: Shows progression of work over time
    // ✅ Recent Context: Latest todos appear at bottom (most visible)
    // ✅ Historical View: Easy to see when work was added
    // ✅ Logical Flow: Natural chronological progression
    //
    // CONS of chronological sorting:
    // ❌ Recent Buried: Latest todos might be less prominent
    // ❌ Date Dependency: Requires YYYY-MM-DD format in linkPart
    // ❌ Mixed Content: Non-date links sorted separately
    //
    // User requirement: Chronological order (older dates first, newer dates after)
    const sortedLinkParts = Object.keys(mentionBlocksBySource).sort((a, b) => {
      // Check if both are valid dates in YYYY-MM-DD format
      const dateA = moment(a, "YYYY-MM-DD", true);
      const dateB = moment(b, "YYYY-MM-DD", true);

      if (dateA.isValid() && dateB.isValid()) {
        // Both are dates - sort chronologically (older first)
        return dateA.isBefore(dateB) ? -1 : dateA.isAfter(dateB) ? 1 : 0;
      } else if (dateA.isValid() && !dateB.isValid()) {
        // A is date, B is not - dates come first
        return -1;
      } else if (!dateA.isValid() && dateB.isValid()) {
        // A is not date, B is date - dates come first
        return 1;
      } else {
        // Neither are dates - sort alphabetically
        return a.localeCompare(b);
      }
    });

    sortedLinkParts.forEach((linkPart) => {
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

  async run(currentPageContent, collectedBlocks, mentionStr, frontmatterObj) {
    return await this.processMentions(
      currentPageContent,
      collectedBlocks,
      mentionStr,
      frontmatterObj
    );
  }
}
