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
      // Load required modules - single cJS() call for efficiency
      const cjs = await cJS();
      const {
        fileIO,
        noteBlocksParser,
        attributesProcessor,
        mentionsProcessor,
      } = cjs;

      // Load current page content
      let currentPageContent = await fileIO.loadFile(app, currentPageFile.path);

      // Read all standard frontmatter fields from file content.
      // DataView's dv.current() and the metadata cache can both be stale during
      // a re-render triggered by a previous save, causing fields to revert to
      // defaults or wrong values. File content is always the ground truth.
      const STANDARD_FIELDS = new Set(["startDate", "stage", "responsible", "type", "position"]);

      let startDate = fileIO.parseFrontmatterField(currentPageContent, "startDate");
      if (!startDate) startDate = fileIO.todayDate();
      // Normalise to YYYY-MM-DD via moment (guards against e.g. ISO timestamps in the file)
      const normalizedDate = moment(startDate, "YYYY-MM-DD", true).isValid()
        ? startDate
        : moment(startDate).format("YYYY-MM-DD");
      if (normalizedDate && normalizedDate !== "Invalid date") startDate = normalizedDate;

      let currentStage = fileIO.parseFrontmatterField(currentPageContent, "stage") || "active";
      let currentType = fileIO.parseFrontmatterField(currentPageContent, "type") || null;

      // Responsible: parse inline YAML sequence [Name] or plain string
      const responsibleStr = fileIO.parseFrontmatterField(currentPageContent, "responsible");
      let responsible;
      if (responsibleStr && responsibleStr.startsWith("[") && responsibleStr.endsWith("]")) {
        const inner = responsibleStr.slice(1, -1);
        responsible = inner.length === 0
          ? ["Me"]
          : inner.split(",").map(s => s.trim()).filter(Boolean);
      } else {
        responsible = responsibleStr || "Me";
      }

      // Collect all custom frontmatter fields by parsing file content.
      // This avoids the metadata-cache timing race where the cache returns {} while
      // Obsidian is still processing a file that was just saved by this script.
      const extraFields = fileIO.parseExtraFrontmatterFields(currentPageContent, STANDARD_FIELDS);

      // dv.current() no longer needed for frontmatter — only dv.pages() is used below.

      // Generate initial frontmatter — standard fields + preserved custom fields
      let frontmatter = fileIO.generateActivityHeader(
        startDate,
        currentStage,
        responsible,
        currentType,
        extraFields
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
        journalPages.filter(
          (page) => !page.file.path.trim().includes(currentPageFile.name)
        ),
        "YYYY-MM-DD"
      );

      // Use BlockCollection directly - NEW APPROACH (removed compatibility layer)
      const blockCollection = allBlocks;

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
        type: currentType,
      };

      const processedContent = await attributesProcessor.processAttributes(
        frontmatterObj,
        contentAfterDataview
      );

      // Update values with the processed values
      currentStage = frontmatterObj.stage;
      startDate = frontmatterObj.startDate;

      // Update frontmatter with processed attributes (preserve custom fields)
      frontmatter = fileIO.generateActivityHeader(
        startDate,
        currentStage,
        responsible,
        currentType,
        extraFields
      );

      // Update contentAfterDataview with processed content (directives converted to comments)
      contentAfterDataview = processedContent;

      // Process mentions - using BlockCollection directly
      const tagId = currentPageFile.name;
      const mentions = await mentionsProcessor.run(
        contentAfterDataview,
        blockCollection,
        tagId,
        frontmatterObj
      );

      if (mentions && mentions.trim().length > 0) {
        contentAfterDataview = mentions;
      }

      // Update frontmatter again after mentions processing (preserve custom fields)
      frontmatter = fileIO.generateActivityHeader(
        frontmatterObj.startDate,
        frontmatterObj.stage,
        frontmatterObj.responsible,
        frontmatterObj.type,
        extraFields
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
