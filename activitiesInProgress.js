class activitiesInProgress {
  async filterActivities(app) {
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

      if (frontmatter && frontmatter.stage && frontmatter.stage !== "done") {
        filteredActivities.push({
          path: file.path,
          stage: frontmatter.stage,
        });
      }
    }

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
    const activityLines = activities.flatMap((activity) => {
      // Extract the filename without path and extension
      const filename = activity.path
        .split("/")
        .pop()
        .replace(/\.[^/.]+$/, "");
      return [`##### [[${activity.path}|${filename}]]`, ``, `----`];
    });

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
    return await this.insertActivitiesIntoDailyNote(
      currentPageContent,
      await this.filterActivities(app)
    );
  }
}
