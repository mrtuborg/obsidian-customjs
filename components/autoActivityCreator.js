/**
 * Auto Activity Creator
 *
 * Scans two sources for unresolved wikilinks and automatically creates
 * Activity files for any that are missing:
 *
 *   1. The most recent Journal entry before today — activities mentioned in
 *      yesterday's note but never "clicked" still get created so they appear
 *      in today's Daily Note activitiesInProgress section.
 *
 *   2. ALL files in Projects/ — project files are permanent and define the
 *      authoritative set of activities for each project.  Any activity
 *      mentioned in a project file that has no corresponding vault file is
 *      created here so it is immediately available.
 *
 * Created files are tagged with a `project:` frontmatter field:
 *   - Activities created from Journal  → project: inbox
 *   - Activities created from Projects → project: "Projects/Name.md"
 *
 * Link resolution rules:
 *   [[Activities/Name.md|Display]] → Activities/Name.md
 *   [[People/Name]]                → People/Name.md
 *   [[Name]]  (no folder prefix)   → Activities/Name.md  (default)
 *   [[2026-05-19]] (date pattern)  → skipped
 *   [[2026-W14]], [[2026-04]]      → skipped
 *   [[Projects/…]] links           → skipped (project files are not activities)
 */

class autoActivityCreator {
  // Date-like patterns that should never trigger Activity creation
  static DATE_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}$/,   // YYYY-MM-DD
    /^\d{4}-W\d{2}$/,         // YYYY-Www
    /^\d{4}-\d{2}$/,          // YYYY-MM
    /^\d{4}$/,                 // YYYY
  ];

  /**
   * Main entry point. Scans Journal (previous entry) and all Projects/ files
   * for unresolved wikilinks, then creates the missing Activity files.
   * @param {Object} app - Obsidian app instance
   * @param {Object} dv  - DataviewJS API
   */
  async run(app, dv) {
    const today = moment().format("YYYY-MM-DD");

    // ── Source 1: most recent Journal entry before today ──────────────────────
    const prevContent = await this.findPreviousJournalContent(app, dv, today);
    if (prevContent) {
      const missingFromJournal = this.extractMissingActivityPaths(app, prevContent);
      if (missingFromJournal.length > 0) {
        console.log(
          `autoActivityCreator: ${missingFromJournal.length} unresolved link(s) from Journal — creating`
        );
        for (const path of missingFromJournal) {
          await this.createActivityFile(app, path, today, "inbox");
        }
      }
    } else {
      console.log("autoActivityCreator: No previous journal found");
    }

    // ── Source 2: all Projects/ files ─────────────────────────────────────────
    const projectSources = await this.findAllProjectSources(app, dv);
    for (const { projectPath, content } of projectSources) {
      const missingFromProject = this.extractMissingActivityPaths(app, content);
      if (missingFromProject.length > 0) {
        console.log(
          `autoActivityCreator: ${missingFromProject.length} unresolved link(s) from ${projectPath} — creating`
        );
        for (const path of missingFromProject) {
          await this.createActivityFile(app, path, today, projectPath);
        }
      }
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Returns all Projects/ files as { projectPath, content } objects.
   * Skips Projects/Inbox.md (it is a view, not a project definition).
   */
  async findAllProjectSources(app, dv) {
    const results = [];
    const projectPages = dv
      .pages('"Projects"')
      .array()
      .filter((p) => p.file.name !== "Inbox");

    for (const page of projectPages) {
      const file = app.vault.getAbstractFileByPath(page.file.path);
      if (!file) continue;
      const content = await app.vault.read(file);
      results.push({ projectPath: page.file.path, content });
    }
    return results;
  }

  /**
   * Returns raw content of the most recent journal entry before today,
   * or null if none exists.
   */
  async findPreviousJournalContent(app, dv, today) {
    const journalPages = dv
      .pages('"Journal"')
      .array()
      .filter((p) => {
        const name = (p.file?.name || "").replace(/\.md$/, "");
        return moment(name, "YYYY-MM-DD", true).isValid() && name < today;
      })
      .sort((a, b) => {
        const na = a.file.name.replace(/\.md$/, "");
        const nb = b.file.name.replace(/\.md$/, "");
        return nb.localeCompare(na); // descending — most recent first
      });

    if (journalPages.length === 0) return null;

    const file = app.vault.getAbstractFileByPath(journalPages[0].file.path);
    if (!file) return null;

    return await app.vault.read(file);
  }

  /**
   * Extracts all wikilinks from content, resolves their vault paths,
   * and returns only those whose files do not yet exist.
   * Skips links pointing to Projects/ (project files are not activities).
   */
  extractMissingActivityPaths(app, content) {
    // Match [[Target]] and [[Target|Alias]] — capture the target part only
    const regex = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;
    const seen = new Set();
    const missing = [];

    let match;
    while ((match = regex.exec(content)) !== null) {
      const raw = match[1].trim();

      // Skip empty
      if (!raw) continue;

      // Skip date-like targets
      if (autoActivityCreator.DATE_PATTERNS.some((re) => re.test(raw))) continue;

      // Skip links that point to Projects/ (project files are not activities)
      if (raw.startsWith("Projects/")) continue;

      // Resolve to a vault path with .md extension
      const path = this.resolveActivityPath(raw);

      if (seen.has(path)) continue;
      seen.add(path);

      // Only include if the file does not already exist
      if (!app.vault.getAbstractFileByPath(path)) {
        missing.push(path);
      }
    }

    return missing;
  }

  /**
   * Determines the vault path for an activity link target.
   *
   * [[Activities/Fix WiFi driver.md|…]] → Activities/Fix WiFi driver.md
   * [[People/Ivan]]                      → People/Ivan.md
   * [[Fix WiFi driver]]                  → Activities/Fix WiFi driver.md
   */
  resolveActivityPath(raw) {
    // Strip .md if already present so we can add it back consistently
    let path = raw.endsWith(".md") ? raw.slice(0, -3) : raw;

    // If there is no folder separator, default to Activities/
    if (!path.includes("/")) {
      path = "Activities/" + path;
    }

    return path + ".md";
  }

  /**
   * Creates a new Activity file at the given vault path with default template
   * content so it is immediately usable by activitiesInProgress in the same
   * pipeline run (before the metadata cache has a chance to index it).
   *
   * @param {Object} app       - Obsidian app instance
   * @param {string} path      - vault-relative path for the new file
   * @param {string} today     - today's date as YYYY-MM-DD
   * @param {string} projectRef - "inbox" or path to the owning project file
   */
  async createActivityFile(app, path, today, projectRef = "inbox") {
    try {
      // Ensure the parent folder exists
      const folderPath = path.substring(0, path.lastIndexOf("/"));
      if (folderPath && !app.vault.getAbstractFileByPath(folderPath)) {
        await app.vault.createFolder(folderPath);
      }

      await app.vault.create(path, this.generateDefaultContent(today, projectRef));
      console.log(`autoActivityCreator: Created "${path}"`);
    } catch (err) {
      // Another process (e.g. Templater) may have created the file in the same
      // tick — not a real error, just log and continue.
      if (err.message?.includes("already exists")) {
        console.log(`autoActivityCreator: "${path}" already exists — skipping`);
      } else {
        console.error(`autoActivityCreator: Failed to create "${path}":`, err);
      }
    }
  }

  /**
   * Generates default Activity file content.
   * Mirrors Activity-template.md defaults so the file is immediately valid.
   * The DataviewJS block is included so activityComposer will run on first
   * render and populate ## Journal with any existing journal history.
   *
   * @param {string} today      - today's date as YYYY-MM-DD
   * @param {string} projectRef - "inbox" or path to owning project (e.g. "Projects/Platform.md")
   */
  generateDefaultContent(today, projectRef = "inbox") {
    return [
      "---",
      `startDate: ${today}`,
      "stage: active",
      "responsible: [Me]",
      "priority: medium",
      "remind: weekdays",
      "quality: draft",
      "context_refs: []",
      'wiki: ""',
      `project: ${projectRef}`,
      "---",
      "```dataviewjs",
      "const {activityComposer} = await cJS();",
      "const currentPageFile = dv.current()?.file;",
      "await activityComposer.processActivity(app, dv, currentPageFile);",
      "```",
      "",
      "## Description",
      "",
      "----",
      "",
      "## Journal",
      "",
      "----",
    ].join("\n");
  }
}
