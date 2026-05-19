/**
 * Auto Activity Creator
 *
 * Scans the most recent journal entry before today for unresolved wikilinks
 * and automatically creates Activity files for any that are missing.
 *
 * This ensures that activities mentioned in the previous journal but never
 * "clicked" by the user still get created before today's activitiesInProgress
 * scan, so they appear in today's Daily Note as expected.
 *
 * Link resolution rules:
 *   [[Activities/Name.md|Display]] → Activities/Name.md
 *   [[People/Name]]                → People/Name.md
 *   [[Name]]  (no folder prefix)   → Activities/Name.md  (default)
 *   [[2026-05-19]] (date pattern)  → skipped
 *   [[2026-W14]], [[2026-04]]      → skipped
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
   * Main entry point. Finds the most recent journal before today, extracts
   * unresolved wikilinks, and creates the missing Activity files.
   * @param {Object} app - Obsidian app instance
   * @param {Object} dv  - DataviewJS API
   */
  async run(app, dv) {
    const today = moment().format("YYYY-MM-DD");

    const prevContent = await this.findPreviousJournalContent(app, dv, today);
    if (!prevContent) {
      console.log("autoActivityCreator: No previous journal found");
      return;
    }

    const missingPaths = this.extractMissingActivityPaths(app, prevContent);
    if (missingPaths.length === 0) return;

    console.log(
      `autoActivityCreator: Found ${missingPaths.length} unresolved link(s) — creating Activity files`
    );

    for (const path of missingPaths) {
      await this.createActivityFile(app, path, today);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

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
   */
  async createActivityFile(app, path, today) {
    try {
      // Ensure the parent folder exists
      const folderPath = path.substring(0, path.lastIndexOf("/"));
      if (folderPath && !app.vault.getAbstractFileByPath(folderPath)) {
        await app.vault.createFolder(folderPath);
      }

      await app.vault.create(path, this.generateDefaultContent(today));
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
   */
  generateDefaultContent(today) {
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
      "---",
      "```dataviewjs",
      "const {activityComposer} = await cJS();",
      "const currentPageFile = dv.current().file;",
      "await activityComposer.processActivity(app, dv, currentPageFile);",
      "```",
      "",
      "## Goal",
      "",
      "## Done when",
      "- [ ] ",
      "",
      "## Status",
      `> ${today}: Draft.`,
      "",
      "## Journal",
      "",
      "----",
    ].join("\n");
  }
}
