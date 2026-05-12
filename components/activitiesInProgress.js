class activitiesInProgress {
  /**
   * OPTIMIZED: Parse all activity files once and filter activities with their todos
   * @param {Object} app - Obsidian app instance
   * @returns {Promise<Array>} Array of activity objects with parsed todos
   */
  async filterActivitiesWithTodos(app) {
    const currentDate = new Date();
    const currentDateString = currentDate.toISOString().split("T")[0];

    // Get all activity files using vault API
    const activitiesFolder = "Activities";
    const archiveFolder = activitiesFolder + "/Archive";
    const activityFiles = app.vault
      .getFiles()
      .filter(
        (file) =>
          file.path.startsWith(activitiesFolder) &&
          !file.path.startsWith(archiveFolder)
      );

    if (activityFiles.length === 0) return [];

    // Parse all activity files into Blocks ONCE - OPTIMIZED APPROACH
    const cjs = await cJS();
    const noteBlocksParser = cjs.createnoteBlocksParserInstance();
    const allActivityBlocks = await noteBlocksParser.run(
      app,
      activityFiles.map((file) => ({ file })),
      null // No date format restriction for activity files
    );

    // Group blocks by file path for efficient processing
    const blocksByFile = {};
    for (const block of allActivityBlocks.blocks) {
      if (!blocksByFile[block.page]) {
        blocksByFile[block.page] = [];
      }
      blocksByFile[block.page].push(block);
    }

    // Filter activities and extract todos in one pass
    const filteredActivities = [];

    for (const filePath of Object.keys(blocksByFile)) {
      // Get frontmatter for this activity file
      const frontmatter = app.metadataCache.getFileCache(
        app.vault.getAbstractFileByPath(filePath)
      )?.frontmatter;

      if (!frontmatter || !frontmatter.stage) continue;

      // Check if the activity is in progress or not done
      if (
        frontmatter.stage !== "done" &&
        moment(frontmatter.startDate, "YYYY-MM-DD").isSameOrBefore(
          currentDateString,
          "YYYY-MM-DD"
        )
      ) {
        // Extract todos from this file's blocks
        const fileBlocks = blocksByFile[filePath];
        const todoBlocks = fileBlocks.filter(
          (block) => block.getAttribute("type") === "todo"
        );
        const doneBlocks = fileBlocks.filter(
          (block) => block.getAttribute("type") === "done"
        );

        // Filter out completed todos
        const completedTaskNames = new Set();
        doneBlocks.forEach((doneBlock) => {
          const taskName = this.extractTaskNameFromBlock(doneBlock);
          if (taskName) {
            completedTaskNames.add(taskName);
          }
        });

        const incompleteTodoBlocks = todoBlocks.filter((todoBlock) => {
          const taskName = this.extractTaskNameFromBlock(todoBlock);
          return taskName && !completedTaskNames.has(taskName);
        });

        // Store activity with its todos
        filteredActivities.push({
          path: filePath,
          stage: frontmatter.stage,
          frontmatter: frontmatter,
          todoBlocks: incompleteTodoBlocks,
        });
      }
    }

    if (filteredActivities.length === 0) return [];

    // Sort activities by document type, then by startDate (oldest first)
    //
    // SORTING DECISION: Document type priority first, then chronological by startDate (oldest first)
    //
    // Document type hierarchy (lower number = higher priority = appears first in Daily Notes):
    // 1. project - обычные проекты и активности (сортируются по дате, старые первыми)
    // 2. inbox - "План на сегодня.md" - ежедневные задачи (всегда в самом низу)
    // 3. done - завершенные (отфильтровываются и не попадают в Daily Notes)
    //
    // How it works:
    // 1. Document Type Priority: Earlier types appear higher in Daily Notes
    // 2. Within same type: Sort by startDate (oldest activities first)
    //    - 2025-07-26 → comes BEFORE 2025-08-25 (older first)
    //
    // Examples of sort order in Daily Notes:
    // - "project" type, startDate: 2025-07-26 → comes FIRST (project + oldest)
    // - "project" type, startDate: 2025-08-25 → comes SECOND (project + newer)
    // - "inbox" type → comes LAST ("План на сегодня.md" always at bottom)
    //
    // PROS of document type + date sorting:
    // ✅ Clear Separation: Projects vs daily tasks clearly separated
    // ✅ Long-running Context: Oldest activities appear first (longer-running projects)
    // ✅ Workflow Alignment: Matches natural work prioritization (finish old tasks first)
    // ✅ Special Handling: inbox tasks always at bottom for daily planning
    // ✅ Semantic Clarity: Document type is more intuitive than stage
    //
    // CONS of document type + date sorting:
    // ❌ Complex Logic: More complex than simple alphabetical sorting
    // ❌ Date Dependency: Requires valid startDate in frontmatter
    // ❌ Type Detection: Requires logic to detect document type
    //
    // Pre-fetch metadata for all activities before sorting to avoid
    // O(n²) cache lookups inside the sort comparator.
    const getDocumentType = (frontmatter) => {
      if (frontmatter?.type) return frontmatter.type;
      if (frontmatter?.stage === "done") return "done";
      return "project";
    };

    const typePriority = {
      project: 1,
      inbox: 999,
    };

    const activitiesWithMeta = filteredActivities.map((activity) => {
      const fm = activity.frontmatter;
      const docType = getDocumentType(fm);
      const priority = typePriority[docType] || 50;
      const startDate = moment(fm?.startDate, "YYYY-MM-DD");
      const filename = activity.path
        .split("/")
        .pop()
        .replace(/\.[^/.]+$/, "")
        .toLowerCase();
      return { activity, priority, startDate, filename };
    });

    activitiesWithMeta.sort((a, b) => {
      // First sort by document type priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Within same type, sort by startDate (oldest first)
      if (a.startDate.isValid() && b.startDate.isValid()) {
        return a.startDate.isBefore(b.startDate)
          ? -1
          : a.startDate.isAfter(b.startDate)
          ? 1
          : 0;
      } else if (a.startDate.isValid() && !b.startDate.isValid()) {
        return -1;
      } else if (!a.startDate.isValid() && b.startDate.isValid()) {
        return 1;
      } else {
        return a.filename.localeCompare(b.filename);
      }
    });

    return activitiesWithMeta.map((item) => item.activity);
  }

  /**
   * Helper method to extract task name from Block content
   * @param {Block} block - Block object containing todo/done content
   * @returns {string|null} Extracted task name or null
   */
  extractTaskNameFromBlock(block) {
    if (!block || !block.content) return null;

    const content = block.content.trim();

    // Handle both todo and done patterns
    if (content.startsWith("- [ ]")) {
      return content.substring(6).trim();
    } else if (content.startsWith("- [x]")) {
      return content.substring(6).trim();
    }

    return null;
  }

  /**
   * OPTIMIZED: Generate clean activities list using pre-parsed todos
   * @param {Array} activities - Array of activity objects with pre-parsed todoBlocks
   * @returns {Promise<string>} Clean activities content
   */
  async generateActivitiesList(activities) {
    // Generate fresh activities content using pre-parsed todos - OPTIMIZED APPROACH
    const activityLinesArrays = activities.map((activity) => {
      const filename = activity.path
        .split("/")
        .pop()
        .replace(/\.[^/.]+$/, "");

      if (activity.todoBlocks.length > 0) {
        const todoLines = activity.todoBlocks.map((block) => block.content);
        return [`##### [[${activity.path}|${filename}]]`, ...todoLines, `----`];
      } else {
        return [`##### [[${activity.path}|${filename}]]`, `----`];
      }
    });

    const activityLines = activityLinesArrays.flat();

    // Generate clean activities content
    const activitiesContent = [
      `----`,
      ``,
      `### Activities:`,
      `----`,
      ``,
      ...activityLines,
      ``,
    ].join(`\n`);

    return activitiesContent;
  }

  async run(app) {
    console.log("Running activitiesInProgress script...");
    return await this.generateActivitiesList(
      await this.filterActivitiesWithTodos(app)
    );
  }
}
