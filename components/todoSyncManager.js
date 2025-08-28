/**
 * Todo Sync Manager - Automatic todo synchronization between daily notes and activities
 *
 * Purpose: Automatically sync completed todos from daily notes back to activity files
 * before activities are copied to new daily notes, ensuring accurate todo states.
 *
 * Integration: Called by dailyNoteComposer before activitiesInProgress to ensure
 * activity files have current todo completion states from daily note interactions.
 */

class todoSyncManager {
  /**
   * Main entry point - sync all in-progress activities with completed todos from daily notes
   * @param {Object} app - Obsidian app instance
   */
  async run(app) {
    // Get in-progress activities using same logic as activitiesInProgress
    const activities = await this.getInProgressActivities(app);
    if (activities.length === 0) return;

    // Find completed todos in daily notes that reference activities
    const completedTodos = await this.findCompletedTodosInDailyNotes(app);
    if (completedTodos.length === 0) return;

    // Update activity files with completed todo states
    for (const activity of activities) {
      await this.syncActivityTodos(app, activity.path, completedTodos);
    }
  }

  /**
   * Get in-progress activities - reuses exact same logic as activitiesInProgress.filterActivities()
   * @param {Object} app - Obsidian app instance
   * @returns {Array} Array of activity objects with path and document type
   */
  async getInProgressActivities(app) {
    const currentDate = new Date();
    const currentDateString = currentDate.toISOString().split("T")[0];

    const activitiesFolder = "Activities";
    const archiveFolder = activitiesFolder + "/Archive";
    const files = app.vault
      .getFiles()
      .filter(
        (file) =>
          file.path.startsWith(activitiesFolder) &&
          !file.path.startsWith(archiveFolder)
      );

    const filteredActivities = [];
    for (const file of files) {
      const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter || !frontmatter.stage) continue;

      // Check if the activity is in progress or not done
      // and if the start date is before or equal to the current date
      if (
        frontmatter.stage !== "done" &&
        moment(frontmatter.startDate, "YYYY-MM-DD").isSameOrBefore(
          currentDateString,
          "YYYY-MM-DD"
        )
      ) {
        filteredActivities.push({
          path: file.path,
          stage: frontmatter.stage,
        });
      }
    }

    if (filteredActivities.length === 0) return [];

    // Sort activities by document type, then by startDate (oldest first) - same as activitiesInProgress
    //
    // SORTING DECISION: Document type priority first, then chronological by startDate (oldest first)
    //
    // Document type hierarchy (lower number = higher priority = appears first):
    // 1. project - обычные проекты и активности (сортируются по дате, старые первыми)
    // 2. inbox - "План на сегодня.md" - ежедневные задачи (всегда в самом низу)
    // 3. done - завершенные (отфильтровываются и не попадают в sync)
    //
    // How it works:
    // 1. Document Type Priority: Earlier types appear higher in processing order
    // 2. Within same type: Sort by startDate (oldest activities first)
    //    - 2025-07-26 → comes BEFORE 2025-08-25 (older first)
    //
    // Examples of sort order:
    // - "project" type, startDate: 2025-07-26 → comes FIRST (project + oldest)
    // - "project" type, startDate: 2025-08-25 → comes SECOND (project + newer)
    // - "inbox" type → comes LAST ("План на сегодня.md" always at bottom)
    //
    // PROS of document type + date sorting:
    // ✅ Clear Separation: Projects vs daily tasks clearly separated
    // ✅ Long-running Context: Oldest activities appear first (longer-running projects)
    // ✅ Workflow Alignment: Matches natural work prioritization (finish old tasks first)
    // ✅ Special Handling: inbox tasks always at bottom for daily planning
    // ✅ Consistent: Same sorting logic as activitiesInProgress component
    //
    // CONS of document type + date sorting:
    // ❌ Complex Logic: More complex than simple alphabetical sorting
    // ❌ Date Dependency: Requires valid startDate in frontmatter
    // ❌ Type Detection: Requires logic to detect document type
    //
    // User requirement: Document type priority first, then oldest first, inbox always at bottom
    filteredActivities.sort((a, b) => {
      // Get frontmatter for both activities
      const frontmatterA = app.metadataCache.getFileCache(
        app.vault.getAbstractFileByPath(a.path)
      )?.frontmatter;
      const frontmatterB = app.metadataCache.getFileCache(
        app.vault.getAbstractFileByPath(b.path)
      )?.frontmatter;

      // Detect document type based on frontmatter type field
      const getDocumentType = (filePath, frontmatter) => {
        // Check type field in frontmatter first
        if (frontmatter?.type) {
          return frontmatter.type;
        }

        // Check stage field for backward compatibility
        if (frontmatter?.stage === "done") {
          return "done";
        }

        // Default: everything else is project type
        return "project";
      };

      // Define document type priority order (lower number = higher priority = appears first)
      const typePriority = {
        project: 1, // Обычные проекты и активности - в начале
        inbox: 999, // "План на сегодня.md" - всегда в конце
        // done: не попадает в sync (отфильтровывается)
      };

      const typeA = getDocumentType(a.path, frontmatterA);
      const typeB = getDocumentType(b.path, frontmatterB);
      const priorityA = typePriority[typeA] || 50; // Default priority for unknown types
      const priorityB = typePriority[typeB] || 50;

      // First sort by document type priority
      if (priorityA !== priorityB) {
        return priorityA - priorityB; // Lower priority number comes first
      }

      // Within same type, sort by startDate (oldest first)
      const startDateA = moment(frontmatterA?.startDate, "YYYY-MM-DD");
      const startDateB = moment(frontmatterB?.startDate, "YYYY-MM-DD");

      if (startDateA.isValid() && startDateB.isValid()) {
        // Both dates valid - older date comes first
        return startDateA.isBefore(startDateB)
          ? -1
          : startDateA.isAfter(startDateB)
          ? 1
          : 0;
      } else if (startDateA.isValid() && !startDateB.isValid()) {
        // A has valid date, B doesn't - A comes first
        return -1;
      } else if (!startDateA.isValid() && startDateB.isValid()) {
        // B has valid date, A doesn't - B comes first
        return 1;
      } else {
        // Neither has valid date - fallback to alphabetical by filename
        const filenameA = a.path
          .split("/")
          .pop()
          .replace(/\.[^/.]+$/, "")
          .toLowerCase();
        const filenameB = b.path
          .split("/")
          .pop()
          .replace(/\.[^/.]+$/, "")
          .toLowerCase();
        return filenameA.localeCompare(filenameB);
      }
    });

    return filteredActivities;
  }

  /**
   * Scan daily notes for completed todos that reference activities
   * @param {Object} app - Obsidian app instance
   * @returns {Array} Array of completed todo objects with text and activity path
   */
  async findCompletedTodosInDailyNotes(app) {
    const journalFolder = "Journal";
    const files = app.vault
      .getFiles()
      .filter(
        (file) =>
          file.path.startsWith(journalFolder) &&
          moment(file.name, "YYYY-MM-DD", true).isValid()
      );

    const completedTodos = [];
    for (const file of files) {
      const content = await app.vault.read(file);
      if (!content) continue;

      const lines = content.split("\n");

      for (const line of lines) {
        // Look for completed todos that reference activities
        if (line.includes("- [x]") && line.includes("[[Activities/")) {
          const todoText = this.extractTodoText(line);
          const activityPath = this.extractActivityPath(line);
          if (todoText && activityPath) {
            completedTodos.push({
              todoText,
              activityPath,
              sourceLine: line.trim(),
            });
          }
        }
      }
    }
    return completedTodos;
  }

  /**
   * Update activity file with completed todo states from daily notes
   * @param {Object} app - Obsidian app instance
   * @param {string} activityPath - Path to activity file
   * @param {Array} completedTodos - Array of completed todos
   */
  async syncActivityTodos(app, activityPath, completedTodos) {
    // Filter todos relevant to this activity
    const relevantTodos = completedTodos.filter(
      (todo) => todo.activityPath === activityPath
    );
    if (relevantTodos.length === 0) return;

    const file = app.vault.getAbstractFileByPath(activityPath);
    if (!file) return;

    let content = await app.vault.read(file);
    if (!content) return;

    let modified = false;
    const lines = content.split("\n");

    // Update todos in activity file based on completed todos from daily notes
    for (const todo of relevantTodos) {
      const normalizedTodoText = this.normalizeTodoText(todo.todoText);

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("- [ ]")) {
          const lineText = this.normalizeTodoText(lines[i]);
          if (lineText === normalizedTodoText) {
            lines[i] = lines[i].replace("- [ ]", "- [x]");
            modified = true;
            break; // Only update first match to avoid duplicates
          }
        }
      }
    }

    // Save updated content if any todos were modified
    if (modified) {
      const updatedContent = lines.join("\n");
      await app.vault.modify(file, updatedContent);
    }
  }

  /**
   * Extract todo text from a line containing a completed todo
   * @param {string} line - Line containing completed todo
   * @returns {string|null} Extracted todo text or null if not found
   */
  extractTodoText(line) {
    // Match pattern: - [x] some text [[Activities/...]]
    const match = line.match(/- \[x\]\s*(.+?)\s*\[\[Activities\//);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract activity path from a line containing activity reference
   * @param {string} line - Line containing activity reference
   * @returns {string|null} Activity path or null if not found
   */
  extractActivityPath(line) {
    // Match pattern: [[Activities/SomeActivity]] or [[Activities/SomeActivity|alias]]
    const match = line.match(/\[\[(Activities\/[^\]|]+)/);
    return match ? match[1] + ".md" : null;
  }

  /**
   * Normalize todo text for comparison by removing formatting and links
   * @param {string} text - Raw todo text
   * @returns {string} Normalized text for comparison
   */
  normalizeTodoText(text) {
    return text
      .replace(/^- \[[x ]\]\s*/, "") // Remove checkbox
      .replace(/\[\[.*?\]\]/g, "") // Remove all links
      .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold formatting
      .replace(/\*(.*?)\*/g, "$1") // Remove italic formatting
      .trim()
      .toLowerCase();
  }
}
