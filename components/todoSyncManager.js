/**
 * Todo Sync Manager - Automatic todo synchronization between daily notes and activities
 *
 * Purpose: Trigger activity files to sync themselves via their DataviewJS blocks
 * before activities are copied to new daily notes, ensuring accurate todo states.
 *
 * Integration: Called by dailyNoteComposer before activitiesInProgress to ensure
 * activity files have current todo completion states from daily note interactions.
 */

class todoSyncManager {
  /**
   * Main entry point - trigger activity files to sync themselves via their DataviewJS blocks
   * @param {Object} app - Obsidian app instance
   */
  async run(app) {
    console.log(
      "TodoSyncManager: Starting sync by triggering activity file processing..."
    );

    // Get in-progress activities using same logic as activitiesInProgress
    const activities = await this.getInProgressActivities(app);
    console.log("TodoSyncManager: Found activities:", activities.length);
    if (activities.length === 0) return;

    // Trigger each activity file's DataviewJS processing to sync todos
    for (const activity of activities) {
      console.log(
        `TodoSyncManager: Triggering sync for activity: ${activity.path}`
      );
      await this.triggerActivitySync(app, activity.path);
    }

    console.log("TodoSyncManager: Sync completed");
  }

  /**
   * Trigger an activity file's DataviewJS processing to sync its todos
   * @param {Object} app - Obsidian app instance
   * @param {string} activityPath - Path to activity file
   */
  async triggerActivitySync(app, activityPath) {
    try {
      // Get the activity file
      const activityFile = app.vault.getAbstractFileByPath(activityPath);
      if (!activityFile) {
        console.warn(
          `TodoSyncManager: Activity file not found: ${activityPath}`
        );
        return;
      }

      // Read the current content
      const content = await app.vault.read(activityFile);

      // The activity file has DataviewJS that processes mentions and syncs todos
      // We can trigger this by simply "touching" the file (reading and writing back)
      // This will cause Obsidian to re-evaluate the DataviewJS blocks
      await app.vault.modify(activityFile, content);

      console.log(`TodoSyncManager: Triggered sync for ${activityPath}`);
    } catch (error) {
      console.error(
        `TodoSyncManager: Error triggering sync for ${activityPath}:`,
        error
      );
    }
  }

  /**
   * Get in-progress activities using same logic as activitiesInProgress
   * @param {Object} app - Obsidian app instance
   * @returns {Promise<Array>} Array of activity objects with path and stage
   */
  async getInProgressActivities(app) {
    try {
      // Get activitiesInProgress component
      const cjs = await cJS();
      const { activitiesInProgress } = cjs;

      // Reuse the migrated filterActivitiesWithTodos method
      const activities = await activitiesInProgress.filterActivitiesWithTodos(
        app
      );

      // Convert Block-based results to simple format for backward compatibility
      return activities.map((activity) => ({
        path: activity.path,
        stage: activity.stage,
      }));
    } catch (error) {
      console.error("Error getting in-progress activities:", error);
      return [];
    }
  }
}
