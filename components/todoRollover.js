class todoRollover {
  async saveFile(app, filename, content) {
    const abstractFilePath = app.vault.getAbstractFileByPath(filename);
    if (!abstractFilePath) {
      console.error("File not found: ", page.path);
      return;
    }

    if (typeof content !== "string") {
      throw new TypeError("Content must be a string");
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

  async removeTodosFromOriginalPages(app, filteredTodos) {
    // console.log("Step 7: Remove the collected to-do elements from their original locations");
    const uniquePages = new Set(filteredTodos.map((todo) => todo.page));

    // Helper function to normalize lines by removing the callout symbol
    function normalizeLine(line) {
      return line.trim().startsWith(">")
        ? line.trim().substring(1).trim()
        : line.trim();
    }

    for (const pagePath of uniquePages) {
      const content = await this.loadFile(app, pagePath);
      const pageLines = content.split("\n");

      // Filter out only the collected to-do items from the original file
      const updatedPageLines = pageLines.filter((line, index) => {
        const normalizedLine = normalizeLine(line);
        const shouldRemove = filteredTodos.some((todo) => {
          const isMatch =
            todo.page === pagePath &&
            normalizedLine.includes(normalizeLine(todo.line));
          return isMatch;
        });
        return !shouldRemove;
      });

      const updatedPageContent = updatedPageLines.join("\n");
      // Ensure the file is not empty before saving
      if (updatedPageContent.trim().length > 0) {
        await this.saveFile(app, pagePath, updatedPageContent);
      }
    }
  }

  /*
    Process row in each daily journal `processingDate`:
        1. Mention [[Review/Daily]]
            next+=1d
        2. Mention [[Review/Weekly]]
            next+=1w
        3. Mention [[Review/Monthly]]
            next+=1m

    If current "daily note" (curDate - processingDate - offset == next), copy to-do item with mentioning
    If current "daily note" (curDate - processingDate - offset > next) and is not completed, move to-do item with mentioning, adding { offset=`curDate` - `processingDate` - `next`}

*/
  /**
   * Check if a todo is related to an activity (should NOT be rolled over)
   * Activity todos are those that appear under headers with [[Activity/...]] links
   */
  isActivityRelatedTodo(todoData) {
    // Check if the todo data contains activity-related patterns
    const activityPatterns = [
      /\[\[Activities\//, // [[Activities/...]]
      /\[\[MyObsidian\]\]/, // [[MyObsidian]]
      /##### \[\[Activities\//, // ##### [[Activities/...]]
      /##### \[\[MyObsidian/, // ##### [[MyObsidian...]]
    ];

    // If the todo itself contains activity references, it's activity-related
    return activityPatterns.some((pattern) => pattern.test(todoData));
  }

  processRecurrence(todoLine, noteDate) {
    // it contain mention to [[Review/Daily]], [[Review/Weekly]], [[Review/Monthly]]
    const daily = todoLine.includes("[[Review/Daily");
    const weekly = todoLine.includes("[[Review/Weekly");
    const monthly = todoLine.includes("[[Review/Monthly");

    if (!daily && !weekly && !monthly) {
      return null;
    }

    const nextDate = new Date(noteDate);

    if (daily) {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (weekly) {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (monthly) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

    return nextDate;
  }

  async rolloverTodos(
    app,
    blocks,
    todayDate,
    currentPageContent,
    removeOriginals
  ) {
    console.log("TodoRollover: Starting rollover process");
    console.log("TodoRollover: Today's date:", todayDate);
    console.log("TodoRollover: Total blocks received:", blocks.length);
    console.log(
      "TodoRollover: Current page content length:",
      currentPageContent.length
    );

    // Filter out blocks from future dates AND exclude activity-related todos
    let todoBlocks = blocks.filter((item) => {
      // Extract date from file path (e.g., "Journal/2025/07.July/2025-07-05.md" -> "2025-07-05")
      const dateMatch = item.page.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) {
        console.log(
          "TodoRollover: Could not extract date from path:",
          item.page
        );
        return false;
      }

      const blockDate = moment(dateMatch[1], "YYYY-MM-DD");
      const isBeforeToday = blockDate.isBefore(todayDate);
      const isTodo = item.blockType === "todo";

      // CRITICAL: Only include standalone todos, NOT activity todos
      const isActivityTodo = this.isActivityRelatedTodo(item.data);

      if (isTodo) {
        console.log(
          "TodoRollover: Found todo block from",
          item.page,
          "- extracted date:",
          dateMatch[1],
          "- before today:",
          isBeforeToday,
          "- is activity todo:",
          isActivityTodo
        );
      }

      return isTodo && isBeforeToday && !isActivityTodo;
    });

    let doneBlocks = blocks.filter((item) => {
      // Extract date from file path
      const dateMatch = item.page.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) return false;

      const blockDate = moment(dateMatch[1], "YYYY-MM-DD");
      return item.blockType === "done" && blockDate.isBefore(todayDate);
    });

    console.log("TodoRollover: Filtered todo blocks:", todoBlocks.length);
    console.log("TodoRollover: Filtered done blocks:", doneBlocks.length);

    let currentLines = [];

    if (currentPageContent.length > 0) {
      // Split the content into lines and filter out empty lines
      currentLines = currentPageContent
        .trim()
        .split("\n")
        .filter((line) => {
          // Cannot handle 'undefined'
          return line !== undefined && line !== null && line.trim() !== "";
        });
    }

    // console.log("Step 4: Find the last occurrence of '---'");
    // Handle insertIndex: point to the last line if "---" is not found
    let insertIndex = Math.max(
      currentLines.lastIndexOf("---"),
      currentLines.lastIndexOf("----")
    );

    // If neither is found, set insertIndex to the end of the lines
    insertIndex =
      insertIndex !== -1 ? insertIndex + 1 : currentLines.length + 1;

    // console.log("Step 5: Insert the collected to-do elements after the frontmatter");
    let newContent = "";
    let filteredTodos = [];
    let newTodos = [];

    // Extract lines from the data field of each todo block and combine them into filteredTodos
    todoBlocks.forEach((block) => {
      const lines = block.data.split("\n");
      lines.forEach((line) => {
        filteredTodos.push({
          line: line.replace(/^>\s*/, "").trim(), // Remove '>' and any optional space from the beginning of the line
          page: block.page,
        });
      });
    });

    // Extract lines from the data field of each done block and combine them into doneTodos
    let doneTodos = [];
    doneBlocks.forEach((block) => {
      const lines = block.data.split("\n");
      lines.forEach((line) => {
        doneTodos.push({
          line: line.replace(/^>\s*/, "").trim(), // Remove '>' and any optional space from the beginning of the line
          page: block.page,
        });
      });
    });

    // Avoid adding todos if they are already present in the current note
    filteredTodos
      .map((todo) => {
        const todoLine = todo.line
          .replace(/^>\s*/, "")
          .replace(/^- \[.\]\s*/, "")
          .trim();

        if (
          !currentLines.some(
            (line) =>
              line
                .replace(/^>\s*/, "")
                .replace(/^- \[.\]\s*/, "")
                .trim() === todoLine
          )
        ) {
          newTodos.push(todoLine);
        }
        return null;
      })
      .filter((todo) => todo !== null); // Avoid null and undefined values

    if (newTodos.length === 0) return currentPageContent;

    // Insert todos at the correct position
    const todosToInsert = filteredTodos.map((todo) => todo.line);
    console.log("TodoRollover: Inserting todos at index:", insertIndex);
    console.log("TodoRollover: Todos to insert:", todosToInsert);

    currentLines.splice(insertIndex, 0, ...todosToInsert);
    newContent = currentLines.join("\n");

    console.log("TodoRollover: New content length:", newContent.length);
    console.log(
      "TodoRollover: New content preview:",
      newContent.substring(0, 300) + "..."
    );

    if (removeOriginals) this.removeTodosFromOriginalPages(app, filteredTodos);
    return newContent;
  }

  async run(
    app,
    collectedBlocks,
    dailyNoteDate,
    currentPageContent,
    RemoveOriginals = false
  ) {
    return await this.rolloverTodos(
      app,
      collectedBlocks,
      dailyNoteDate,
      currentPageContent,
      RemoveOriginals
    );
  }
}
