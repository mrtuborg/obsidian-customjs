/**
 * Daily Note Composer - Centralized daily note processing logic
 * Used by DailyNote-template.md for valid date format notes
 */

class dailyNoteComposer {
  /**
   * Process a daily note with full pipeline:
   * - Generate daily note frontmatter
   * - Parse journal blocks
   * - Todo rollover (if today)
   * - Add activities in progress (if today)
   * - Process mentions
   * - Remove scripts (if today)
   * - Save combined content
   */
  async processDailyNote(app, dv, currentPageFile, title) {
    try {
      // Load required modules
      const { fileIO } = await cJS();
      const { noteBlocksParser } = await cJS();
      const { todoRollover } = await cJS();
      const { activitiesInProgress } = await cJS();
      const { mentionsProcessor } = await cJS();
      const { scriptsRemove } = await cJS();

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
      const pageIsToday = fileIO.isDailyNote(currentPageFile.name);
      const dailyNoteDate = moment(dv.current().name).format("YYYY-MM-DD");

      // Parse journal blocks for processing
      const journalPages = dv
        .pages('"Journal"')
        .filter((page) => !page.file.path.trim().includes(title));
      const allBlocks = await noteBlocksParser.run(
        app,
        journalPages,
        "YYYY-MM-DD"
      );

      // Todo Rollover (only for today's note)
      if (pageIsToday) {
        //try {
        const remove = true;
        console.log("Starting todo rollover for:", dailyNoteDate);
        console.log("Total blocks found:", allBlocks.length);
        console.log(
          "Todo blocks:",
          allBlocks.filter((b) => b.blockType === "todo").length
        );

        const todos = await todoRollover.run(
          app,
          allBlocks,
          dailyNoteDate,
          pageContent,
          remove
        );

        console.log(
          "Todo rollover result:",
          typeof todos,
          todos ? todos.length : 0
        );

        if (todos && typeof todos === "string" && todos.trim().length > 0) {
          pageContent = todos; // FIXED: Direct assignment instead of concatenation
          console.log("Todo rollover completed successfully");
        } else {
          console.log("No todos to rollover or empty result");
        }
        //} catch (error) {
        //  console.error("Todo rollover failed:", error);
        //}
      }

      // Add activities in progress (only for today's note)
      if (pageIsToday) {
        const activities = await activitiesInProgress.run(app, pageContent);
        if (activities && activities.trim().length > 0) {
          pageContent = activities;
        }
      }

      // Process mentions
      const tagId = currentPageFile.name;
      const mentions = await mentionsProcessor.run(
        pageContent,
        allBlocks,
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
