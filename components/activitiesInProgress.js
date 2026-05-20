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
      const abstractFile = app.vault.getAbstractFileByPath(filePath);
      if (!abstractFile) continue;

      // Read raw file content once — used for both frontmatter and ## Journal
      // filtering.  Reading from disk (not metadataCache) makes this immune to
      // the cache timing race and ensures auto-created files (created in the
      // same pipeline run by autoActivityCreator) are visible immediately.
      const rawContent = await app.vault.read(abstractFile);
      const frontmatter = this.parseFrontmatterFromContent(rawContent);

      if (!frontmatter.stage) continue;

      // Check if the activity is in progress or not done
      if (
        frontmatter.stage !== "done" &&
        moment(frontmatter.startDate, "YYYY-MM-DD").isSameOrBefore(
          currentDateString,
          "YYYY-MM-DD"
        )
      ) {
        // Filter by remind field — controls which days this activity appears
        const remind = frontmatter.remind || "daily";
        const dayOfWeek = moment(currentDateString, "YYYY-MM-DD").day(); // 0=Sun, 1=Mon, ..., 6=Sat
        const visible = (() => {
          switch (remind) {
            case "weekdays": return dayOfWeek >= 1 && dayOfWeek <= 5;
            case "weekends": return dayOfWeek === 0 || dayOfWeek === 6;
            case "monday":   return dayOfWeek === 1;
            case "friday":   return dayOfWeek === 5;
            default:         return true; // "daily" or unknown value
          }
        })();
        if (!visible) continue;

        // Extract todos from this file's blocks
        const fileBlocks = blocksByFile[filePath];
        const todoBlocks = fileBlocks.filter(
          (block) => block.getAttribute("type") === "todo"
        );

        // Isolate the ## Journal section (raw text) — acceptance criteria in
        // "## Done when" are excluded; they are not recurring daily tasks.
        const journalHeadingIdx = rawContent.indexOf('\n## Journal');
        const journalSection = journalHeadingIdx >= 0
          ? rawContent.substring(journalHeadingIdx)
          : rawContent; // fallback: no Journal section, include all todos

        // Calendar-principle: for each task text, keep the state from the MOST
        // RECENT date-section in the Journal.  This lets recurring tasks reappear
        // after they are reopened on a later date.
        const latestStates = this.getLatestTodoStates(journalSection);

        // A task is shown when:
        //   • it has no recorded state at all (brand-new mention), OR
        //   • its most-recent state is open ([ ])
        const journalTodos = todoBlocks.filter((todoBlock) => {
          const taskName = this.extractTaskNameFromBlock(todoBlock);
          if (!taskName) return false;
          if (!journalSection.includes(todoBlock.content.trim())) return false;
          const entry = latestStates.get(taskName);
          return !entry || entry.state === "open";
        });

        // Store activity with its todos
        filteredActivities.push({
          path: filePath,
          stage: frontmatter.stage,
          frontmatter: frontmatter,
          todoBlocks: journalTodos,
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

    const userPriorityOrder = { high: 1, medium: 2, low: 3 };

    const activitiesWithMeta = filteredActivities.map((activity) => {
      const fm = activity.frontmatter;
      const docType = getDocumentType(fm);
      const priority = typePriority[docType] || 50;
      const userPriority = userPriorityOrder[fm?.priority?.toString()] ?? 2;
      const startDate = moment(fm?.startDate, "YYYY-MM-DD");
      const filename = activity.path
        .split("/")
        .pop()
        .replace(/\.[^/.]+$/, "")
        .toLowerCase();
      return { activity, priority, userPriority, startDate, filename };
    });

    activitiesWithMeta.sort((a, b) => {
      // First sort by document type priority (project vs inbox)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Second: sort by user priority (high → medium → low)
      if (a.userPriority !== b.userPriority) {
        return a.userPriority - b.userPriority;
      }

      // Within same type and priority, sort by startDate (oldest first)
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
   * Parses frontmatter fields directly from raw file content.
   * This avoids the metadataCache timing race and allows newly created files
   * (e.g. from autoActivityCreator) to be read in the same pipeline run.
   * @param {string} content - Raw file content
   * @returns {Object} Object with stage, startDate, remind, type, priority
   */
  parseFrontmatterFromContent(content) {
    if (!content) return {};
    const parseField = (name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = content.match(new RegExp(`^${escaped}:\\s*(.+)$`, "m"));
      return m ? m[1].trim() : null;
    };
    return {
      stage:     parseField("stage"),
      startDate: parseField("startDate"),
      remind:    parseField("remind"),
      type:      parseField("type"),
      priority:  parseField("priority"),
    };
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
   * Calendar-principle: parse the ## Journal section of an Activity file and
   * return the MOST RECENT state for every task.
   *
   * Rules:
   *  • The section is divided into date-buckets by `[[YYYY-MM-DD]]` anchor lines.
   *  • Later dates always win: if a task is `[x]` on May 1 but `[ ]` on May 10,
   *    it is treated as open (will appear in today's Activity list again).
   *  • Tasks that appear outside any date section get date epoch 0 (lowest priority).
   *  • Non-todo lines are ignored.
   *
   * @param {string} journalSection - The raw text from `## Journal` to end of section
   * @returns {Map<string, {state: 'open'|'done', date: number}>} Map keyed by task text
   */
  getLatestTodoStates(journalSection) {
    const DATE_ANCHOR = /\[\[(\d{4}-\d{2}-\d{2})\]\]/;
    const TODO_OPEN   = /^- \[ \] (.+)$/;
    const TODO_DONE   = /^- \[x\] (.+)$/i;

    const latestStates = new Map(); // taskText → { state, dateValue }
    let currentDateValue = 0; // epoch ms; 0 = "no date / oldest"

    for (const rawLine of journalSection.split("\n")) {
      const line = rawLine.trim();

      // Detect date anchor — update current date context
      const dateMatch = DATE_ANCHOR.exec(line);
      if (dateMatch) {
        const d = moment(dateMatch[1], "YYYY-MM-DD", true);
        currentDateValue = d.isValid() ? d.valueOf() : 0;
        continue;
      }

      // Detect open task
      const openMatch = TODO_OPEN.exec(line);
      if (openMatch) {
        const taskText = openMatch[1].trim();
        const existing = latestStates.get(taskText);
        if (!existing || currentDateValue >= existing.dateValue) {
          latestStates.set(taskText, { state: "open", dateValue: currentDateValue });
        }
        continue;
      }

      // Detect done task
      const doneMatch = TODO_DONE.exec(line);
      if (doneMatch) {
        const taskText = doneMatch[1].trim();
        const existing = latestStates.get(taskText);
        if (!existing || currentDateValue >= existing.dateValue) {
          latestStates.set(taskText, { state: "done", dateValue: currentDateValue });
        }
      }
    }

    return latestStates;
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
