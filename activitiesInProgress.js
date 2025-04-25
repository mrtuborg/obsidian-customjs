class activitiesInProgress {
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
      const fileContent = await app.vault.read(file);
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

  async insertActivitiesIntoDailyNote(app, dv, activities) {
    const currentPage = dv.current().file;

    if (!currentPage) {
      console.error("No current page found.");
      return;
    }

    const currentPageContent = await this.loadFile(app, currentPage.path);
    let currentLines = currentPageContent.trim().split("\n");

    // Prepare the activities to be added
    const activityLines = activities.flatMap((activity) => {
      // Extract the filename without path and extension
      const filename = activity.path
        .split("/")
        .pop()
        .replace(/\.[^/.]+$/, "");
      return [`## [[${activity.path}|${filename}]]`, ``, `----`];
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

    console.log(newContent);

    // Save the updated content back to the current note
    await this.saveFile(app, currentPage.path, newContent);
  }

  async run(app, dv) {
    return await this.insertActivitiesIntoDailyNote(
      app,
      dv,
      await this.filterActivities(app)
    );
  }
}
