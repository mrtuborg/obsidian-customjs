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

    // Sort activities alphabetically by filename
    filteredActivities.sort((a, b) => {
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
