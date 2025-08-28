class activitiesInProgress {
  async filterActivities(app) {
    const currentDate = new Date();

    const currentDateString = currentDate.toISOString().split("T")[0];

    const activitiesFolder = "Activities"; // Replace with the exact folder name in your vault
    const archiveFolder = activitiesFolder + "/Archive"; // Folder to exclude
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
        // done: не попадает в Daily Notes (отфильтровывается)
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

  async analyzeActivityFileContentForTodos(filePath) {
    const fileContent = await app.vault.read(
      app.vault.getAbstractFileByPath(filePath)
    );
    // Check if fileContent is undefined or empty
    if (!fileContent) {
      console.warn(`No content found for file: ${filePath}`);
      return [];
    }

    if (fileContent.length === 0) {
      console.warn(`File is empty: ${filePath}`);
      return [];
    }
    // Split the content into lines and filter out empty lines
    const lines = fileContent
      .trim()
      .split("\n")
      .filter((line) => line.trim() !== "");

    // Extract lines that start with '- [ ]' or '- [x]'
    const allTodoLines = lines.filter(
      (line) => line.startsWith("- [ ]") || line.startsWith("- [x]")
    );

    // Extract task names from completed todos (- [x])
    const completedTaskNames = new Set();
    allTodoLines.forEach((line) => {
      if (line.startsWith("- [x]")) {
        // Extract task name by removing "- [x] " prefix
        const taskName = line.substring(6).trim();
        completedTaskNames.add(taskName);
      }
    });

    // Filter out any task (both incomplete and complete) if it has a completed version
    const todoLines = allTodoLines.filter((line) => {
      let taskName;
      if (line.startsWith("- [ ]")) {
        taskName = line.substring(6).trim();
      } else if (line.startsWith("- [x]")) {
        taskName = line.substring(6).trim();
      }

      // Exclude this line if the task name exists in completed tasks
      return !completedTaskNames.has(taskName);
    });

    return todoLines;
  }

  async insertActivitiesIntoDailyNote(currentPageContent, activities) {
    let currentLines = [];
    if (currentPageContent && currentPageContent.length > 0) {
      // Split the content into lines and filter out empty lines
      currentLines = currentPageContent
        .trim()
        .split("\n")
        .filter((line) => {
          // Cannot handle 'undefined'
          return line !== undefined && line !== null && line.trim() !== "";
        });
    }

    // Prepare the activities to be added
    const activityLinesArrays = await Promise.all(
      activities.map(async (activity) => {
        // Extract the filename without path and extension
        const filename = activity.path
          .split("/")
          .pop()
          .replace(/\.[^/.]+$/, "");

        let activityToDos = await this.analyzeActivityFileContentForTodos(
          activity.path
        );

        if (activityToDos.length > 0) {
          return [
            `##### [[${activity.path}|${filename}]]`,
            ...activityToDos,
            `----`,
          ];
        } else {
          return [`##### [[${activity.path}|${filename}]]`, `----`];
        }
      })
    );

    const activityLines = activityLinesArrays.flat();

    // Append the activities to the end of the note
    const newContent = [
      ...currentLines,
      `----`,
      ``,
      `### Activities:`,
      `----`,
      ``,
      ...activityLines,
      ``,
    ].join(`\n`);

    return newContent;
  }

  async run(app, currentPageContent) {
    console.log("Running activitiesInProgress script...");
    return await this.insertActivitiesIntoDailyNote(
      currentPageContent,
      await this.filterActivities(app)
    );
  }
}
