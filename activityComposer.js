/**
 * Activity Composer - Centralized activity note processing logic
 * Used by both DailyNote-template.md and Activity-template.md
 */

class activityComposer {
  /**
   * Process an activity note with full pipeline:
   * - Generate frontmatter
   * - Process attributes
   * - Process mentions
   * - Save combined content
   */
  async processActivity(app, dv, currentPageFile) {
    try {
      // Load required modules
      const { fileIO } = await cJS();
      const { noteBlocksParser } = await cJS();
      const { attributesProcessor } = await cJS();
      const { mentionsProcessor } = await cJS();

      // Load current page content
      let currentPageContent = await fileIO.loadFile(app, currentPageFile.path);

      // Initialize frontmatter values
      const startDateRaw = dv.current().startDate;
      let startDate = startDateRaw?.toString().format("YYYY-MM-DD");
      if (!startDate) startDate = fileIO.todayDate();

      let responsible = dv.current().responsible?.toString();
      if (!responsible) responsible = "Me";
      let currentStage = dv.current().stage || "active";

      // Generate initial frontmatter
      let frontmatter = fileIO.generateActivityHeader(
        startDate,
        currentStage,
        responsible
      );

      // Remove the generated header from currentPageContent
      currentPageContent = currentPageContent.replace(frontmatter, "").trim();

      let dataviewJsBlock = "";
      let pageContent = "";

      // Extract existing content structure
      if (currentPageContent.trim().length > 0) {
        ({ dataviewJsBlock } =
          fileIO.extractFrontmatterAndDataviewJs(currentPageContent));
      }

      // Parse journal blocks for mentions processing
      const journalPages = dv.pages('"Journal"');
      const allBlocks = await noteBlocksParser.run(
        app,
        journalPages,
        "YYYY-MM-DD"
      );

      // Extract content after dataviewjs block for attribute processing
      let contentAfterDataview = "";
      if (currentPageContent.trim().length > 0) {
        const lines = currentPageContent.split("\n");
        let inDataviewBlock = false;
        let afterDataview = false;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("```dataviewjs")) {
            inDataviewBlock = true;
          } else if (lines[i].startsWith("```") && inDataviewBlock) {
            inDataviewBlock = false;
            afterDataview = true;
          } else if (afterDataview) {
            contentAfterDataview += lines[i] + "\n";
          }
        }
      }

      // Process attributes
      const frontmatterObj = {
        startDate: startDate,
        stage: currentStage,
        responsible: responsible,
      };

      const processedContent = await attributesProcessor.processAttributes(
        frontmatterObj,
        contentAfterDataview
      );

      // Update values with the processed values
      currentStage = frontmatterObj.stage;
      startDate = frontmatterObj.startDate;

      // Update frontmatter with processed attributes
      frontmatter = fileIO.generateActivityHeader(
        startDate,
        currentStage,
        responsible
      );

      // Update contentAfterDataview with processed content (directives converted to comments)
      contentAfterDataview = processedContent;

      // Process mentions
      const tagId = currentPageFile.name;
      const mentions = await mentionsProcessor.run(
        contentAfterDataview,
        allBlocks,
        tagId,
        frontmatterObj
      );

      if (mentions && mentions.trim().length > 0) {
        contentAfterDataview = mentions;
      }

      // Update frontmatter again after mentions processing (in case directives from other files changed it)
      frontmatter = fileIO.generateActivityHeader(
        frontmatterObj.startDate,
        frontmatterObj.stage,
        frontmatterObj.responsible
      );

      // Combine and save content
      const combinedContent = [
        frontmatter,
        dataviewJsBlock,
        contentAfterDataview,
      ].join("\n\n");
      await fileIO.saveFile(app, currentPageFile.path, combinedContent);

      return {
        success: true,
        frontmatter: frontmatter,
        content: combinedContent,
      };
    } catch (error) {
      console.error("ActivityComposer error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
