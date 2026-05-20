/**
 * Daily Note Composer - Centralized daily note processing logic
 * Used by DailyNote-template.md for valid date format notes
 */

class dailyNoteComposer {
  /**
   * Process a daily note with full pipeline:
   * - Generate daily note frontmatter
   * - Parse journal blocks
   * - Sync activity todos (if today)
   * - Add activities in progress (if today)
   * - Process mentions
   * - Remove scripts (if today)
   * - Save combined content
   */
  async processDailyNote(app, dv, currentPageFile, title) {
    try {
      // Load required modules - single cJS() call for efficiency
      const cjs = await cJS();
      const {
        fileIO,
        noteBlocksParser,
        autoActivityCreator,
        activitiesInProgress,
        mentionsProcessor,
        scriptsRemove,
      } = cjs;

      // Load current page content
      let currentPageContent = await fileIO.loadFile(app, currentPageFile.path);

      // Generate daily note frontmatter
      let frontmatter = fileIO.generateDailyNoteHeader(title);

      // Remove the generated header from currentPageContent
      currentPageContent = currentPageContent.replace(frontmatter, "").trim();

      let dataviewJsBlock = "";
      let pageContent = "";

      // Extract existing content structure
      if (currentPageContent.trim().length > 0) {
        ({ dataviewJsBlock, pageContent } =
          fileIO.extractFrontmatterAndDataviewJs(currentPageContent));
      }

      // Check if this is today's note
      const currentPage = dv.current?.();
      const currentPageName = (currentPage?.name || currentPageFile.name || "").replace(
        /\.md$/,
        ""
      );
      const pageIsToday = currentPageName
        ? fileIO.isDailyNote(currentPageName)
        : false;

      // Parse journal blocks for processing.
      // Only include the last 90 days — older entries are never needed for
      // mention processing of a new note, and bounding the set prevents
      // unbounded growth as the vault accumulates daily notes over time.
      const cutoff = moment().subtract(90, "days").startOf("day");
      const journalPages = dv
        .pages('"Journal"')
        .filter((page) => {
          if (page.file.path.trim().includes(title)) return false;
          const d = moment(page.file.name, "YYYY-MM-DD", true);
          return d.isValid() && d.isSameOrAfter(cutoff);
        });
      const allBlocks = await noteBlocksParser.run(
        app,
        journalPages,
        "YYYY-MM-DD"
      );

      // Use BlockCollection directly - NEW APPROACH (removed compatibility layer)
      const blockCollection = allBlocks;

      // Add activities in progress (only for today's note)
      if (pageIsToday) {
        // Auto-create Activity files for any unresolved wikilinks in the
        // previous journal entry — handles the case where the user wrote a
        // mention but forgot to click it to create the file.
        await autoActivityCreator.run(app, dv);

        // todoSyncManager (vault.modify per activity) has been removed:
        //  • It triggered O(N × M) I/O (N activities × M journal reads each)
        //  • The async DataviewJS re-render was unreliable (not guaranteed to
        //    complete before activitiesInProgress.run)
        //  • activitiesInProgress now reads todo states directly from each
        //    Activity file's raw ## Journal section (calendar-principle), so
        //    no pre-sync step is needed.

        const activities = await activitiesInProgress.run(app);
        if (activities && activities.trim().length > 0) {
          pageContent = activities;
        }
      }

      // Process mentions - using BlockCollection directly
      const tagId = currentPageFile.name;
      const mentions = await mentionsProcessor.run(
        pageContent,
        blockCollection,
        tagId
      );
      if (mentions && mentions.trim().length > 0) {
        pageContent = mentions;
      }

      // Remove scripts from dataviewjs block (only for today's note)
      if (pageIsToday) {
        dataviewJsBlock = await scriptsRemove.run(dataviewJsBlock);
      }

      // Combine and save content
      const combinedContent = [frontmatter, dataviewJsBlock];
      if (!pageContent.includes("----")) {
        combinedContent.push("----");
      }
      combinedContent.push(pageContent);
      const combinedContentStr = combinedContent.join("\n");

      await fileIO.saveFile(app, currentPageFile.path, combinedContentStr);

      return {
        success: true,
        frontmatter: frontmatter,
        content: combinedContentStr,
        isToday: pageIsToday,
      };
    } catch (error) {
      console.error("DailyNoteComposer error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
