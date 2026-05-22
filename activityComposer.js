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
      // dv.current() can return null when Dataview hasn't indexed the file yet
      // (e.g. immediately after rename or first render). Fall back to the active file.
      if (!currentPageFile) {
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
          console.warn("activityComposer: currentPageFile is null and no active file — skipping");
          return { success: false, error: "No current page file" };
        }
        currentPageFile = activeFile;
      }
      const initialMtime = this.getFileMtime(app, currentPageFile.path);

      // Load required modules - single cJS() call for efficiency
      const cjs = await cJS();
      const {
        fileIO,
        noteBlocksParser,
        attributesProcessor,
        mentionsProcessor,
        projectDescriptionInjector,
      } = cjs;

      // Load current page content
      let currentPageContent = await fileIO.loadFile(app, currentPageFile.path);

      // Standard fields known to fileIO.generateActivityHeader — must be kept
      // in sync with that method's signature so extra fields are not double-written.
      // Only fields that generateActivityHeader explicitly writes belong here.
      // "project" and "position" are intentionally NOT listed — they are not written
      // by generateActivityHeader and must flow through as extraFields so they are preserved.
      const STANDARD_FIELDS = new Set(["startDate", "stage", "responsible", "type"]);

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

      // Extract existing content structure. If the dataviewjs block is missing,
      // keep processing and recreate it so the Activity remains self-updating.
      const extractedParts = fileIO.extractFrontmatterAndDataviewJs(currentPageContent || "");
      let dataviewJsBlock = extractedParts.dataviewJsBlock || "";
      let contentAfterDataview = extractedParts.pageContent || "";
      if (!dataviewJsBlock || dataviewJsBlock.trim().length === 0) {
        dataviewJsBlock = [
          "```dataviewjs",
          "const {activityComposer} = await cJS();",
          "const currentPageFile = dv.current()?.file;",
          "await activityComposer.processActivity(app, dv, currentPageFile);",
          "```",
        ].join("\n");
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

      // Parse project blocks for description injection.
      // Use app.vault.getMarkdownFiles() instead of dv.pages() to avoid Dataview
      // indexing issues (dv.pages('"Projects"') can return 0 if Dataview hasn't
      // indexed the folder yet or excludes it).
      const projectFiles = app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith("Projects/") && f.basename !== "Inbox");
      const projectPages = projectFiles.map(f => ({ file: { path: f.path, name: f.basename } }));
      const projectBlocks = await noteBlocksParser.run(app, projectPages, "");

      // Use BlockCollection directly - NEW APPROACH (removed compatibility layer)
      const blockCollection = allBlocks;

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

      // ── Step 1: Inject project description into ## Description ──────────────
      // Projects/ is the authoritative source for the descriptive part of an
      // Activity (goal, context, done-when).  This runs BEFORE mentionsProcessor
      // so the injected content is visible when Journal mentions are processed.
      // run() always returns the updated body — even an empty description clears
      // stale content (replace-semantics, not append-semantics).
      // tagId = filename without .md extension (used to match activity headers in Project files).
      // dv.current()?.file.name already strips .md; app.workspace.getActiveFile().name does not.
      const tagId = currentPageFile.name.replace(/\.md$/i, "");
      if (!extraFields.project) {
        const inferredProjectRef = this.inferProjectRef(projectBlocks, tagId);
        if (inferredProjectRef) {
          extraFields.project = inferredProjectRef;
        }
      }
      contentAfterDataview = await projectDescriptionInjector.run(
        contentAfterDataview,
        projectBlocks,
        tagId
      );

      // ── Step 2: Process journal mentions into ## Journal ──────────────────
      // Process mentions - using BlockCollection directly
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
      const latestMtime = this.getFileMtime(app, currentPageFile.path);
      if (
        initialMtime !== null &&
        latestMtime !== null &&
        latestMtime !== initialMtime
      ) {
        console.warn(
          `activityComposer: concurrent update detected for "${currentPageFile.path}" (mtime ${initialMtime} -> ${latestMtime}), skipping save`
        );
        return {
          success: false,
          error: "Concurrent activity update detected; reopen the note to retry.",
        };
      }
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

  inferProjectRef(projectBlocks, tagId) {
    if (!projectBlocks || !Array.isArray(projectBlocks.blocks)) return null;

    const matchedProjects = new Set();
    for (const block of projectBlocks.blocks) {
      if ((block.page || "").startsWith("Projects/") && block.getAttribute("type") === "header") {
        if ((block.content || "").includes(tagId)) {
          matchedProjects.add(block.page);
        }
      }
    }

    if (matchedProjects.size > 1) {
      console.warn(
        `activityComposer: ambiguous project inference for "${tagId}" (${[...matchedProjects].join(", ")}); preserving existing project field`
      );
      return null;
    }
    if (matchedProjects.size !== 1) return null;
    return [...matchedProjects][0];
  }

  getFileMtime(app, filePath) {
    const file = app.vault.getAbstractFileByPath(filePath);
    return file?.stat?.mtime ?? null;
  }
}
