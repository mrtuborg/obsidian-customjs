/**
 * Project Description Injector
 *
 * Finds blocks written under an Activity's header in Project files and injects
 * them into the `## Description` section of the Activity file.
 *
 * Semantic contract:
 *   - Projects/ is the AUTHORITATIVE source for Activity descriptions.
 *   - `## Description` is fully REPLACED on every Activity open (not appended).
 *   - Journal/ remains the authoritative source for `## Journal` (handled by mentionsProcessor).
 *
 * Typical Project file structure:
 *
 *   ##### [[Activities/Fix WiFi driver.md|Fix WiFi driver]]
 *   **Goal:** Fix WiFi crash during module load on i.MX8MP
 *   **Context:** Affects all RoomBoard units since kernel 5.15
 *   **Done when:**
 *   - [ ] 100 clean boots with no crash
 *
 * The blocks under that header are extracted and placed into Activity's ## Description.
 *
 * If an Activity is mentioned in multiple Project files, descriptions from all
 * of them are concatenated (separated by the project file name as a sub-heading).
 */

class projectDescriptionInjector {
  /**
   * Main entry point.
   *
   * @param {string} contentAfterDataview - current Activity body text (after the dataviewjs block)
   * @param {BlockCollection} projectBlocks - all blocks parsed from Projects/ files
   * @param {string} tagId - Activity filename without extension (e.g. "Fix WiFi driver")
   * @returns {string} updated contentAfterDataview, or "" if nothing changed
   */
  async run(contentAfterDataview, projectBlocks, tagId) {
    if (!projectBlocks || typeof projectBlocks.findByType !== "function") {
      // Can't process at all — return content unchanged (don't clear valid existing content)
      return contentAfterDataview;
    }

    // Always inject — even if descriptionContent is null/empty — to clear stale content.
    // This enforces the "replace-semantics" contract: ## Description reflects the current
    // state of Projects/ on every open.
    const descriptionContent = this.buildDescription(projectBlocks, tagId) ?? "";

    return this.injectIntoDescription(contentAfterDataview, descriptionContent);
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  /**
   * Collects blocks from Project files that sit under this Activity's header,
   * grouped by source project file.
   *
   * Returns a formatted markdown string ready to be placed inside ## Description,
   * or null if no project description was found.
   */
  buildDescription(projectBlocks, tagId) {
    // Group description blocks by project source file
    const byProject = new Map(); // projectFilename → string[]

    console.log(`[PDI] buildDescription: tagId="${tagId}", total blocks=${projectBlocks.blocks.length}`);

    for (const block of projectBlocks.blocks) {
      if (!this.isDescriptionBlock(block, tagId)) continue;

      console.log(`[PDI] matched block: page=${block.page}, content="${(block.content||"").substring(0,60)}"`);


      const projectFile = this.extractProjectFilename(block.page);
      if (!byProject.has(projectFile)) {
        byProject.set(projectFile, []);
      }

      const content = block.content ? block.content.trim() : "";
      if (content && content.length > 0) {
        byProject.get(projectFile).push(content);
      }
    }

    if (byProject.size === 0) {
      console.log(`[PDI] no description blocks found for tagId="${tagId}"`);
      return null;
    }

    const lines = [];

    if (byProject.size === 1) {
      // Single project: no sub-heading needed
      const [, blockLines] = [...byProject.entries()][0];
      lines.push(...blockLines);
    } else {
      // Multiple projects: add source sub-heading for clarity
      for (const [projectFile, blockLines] of byProject.entries()) {
        lines.push(`###### ${projectFile}`);
        lines.push(...blockLines);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Returns true if `block` should be included in the Activity's description.
   *
   * A block qualifies when:
   *   1. It comes from a Projects/ file (not Journal, not Activities itself)
   *   2. It is a child of a header that contains this Activity's tagId
   *   3. It is not the header block itself (we don't copy the `##### [[…]]` line)
   *   4. It is not a separator
   */
  isDescriptionBlock(block, tagId) {
    const page = block.page || "";

    // Must originate from Projects/ folder
    if (!page.startsWith("Projects/")) return false;

    const blockType = block.getAttribute("type");

    // Skip separators
    if (blockType === "separator") return false;

    // Skip the Activity header itself (the ##### [[Activities/…]] line)
    if (blockType === "header" && block.content.includes(tagId)) return false;

    // Must be under the specific Activity header
    return this.isBlockUnderActivityHeader(block, tagId);
  }

  /**
   * Walks the Block parent chain looking for a header that contains tagId.
   * Reuses the same traversal logic as mentionsProcessor.isBlockUnderSpecificActivityHeader.
   */
  isBlockUnderActivityHeader(block, tagId) {
    let current = block.parent;
    while (current) {
      if (current.getAttribute("type") === "header" && current.content.includes(tagId)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Extracts a human-readable project name from a vault path.
   * "Projects/Platform Rewrite.md" → "Platform Rewrite"
   */
  extractProjectFilename(page) {
    return (page || "")
      .replace(/^.*\//, "")   // strip directory
      .replace(/\.md$/, ""); // strip extension
  }

  /**
   * Replaces the content of the `## Description` section in `content` with
   * `descriptionContent`.
   *
   * If no `## Description` section exists, it is inserted immediately before
   * `## Journal` (or prepended if Journal is also absent).
   *
   * The section boundary ends at the next `## ` heading or a `----` separator.
   */
  injectIntoDescription(content, descriptionContent) {
    const lines = content.split("\n");

    const descStart = lines.findIndex((l) => /^## Description\s*$/.test(l));
    const journalStart = lines.findIndex((l) => /^## Journal\s*$/.test(l));

    if (descStart !== -1) {
      // Found existing ## Description — find where it ends
      let descEnd = lines.length;
      for (let i = descStart + 1; i < lines.length; i++) {
        if (/^## /.test(lines[i]) || /^----\s*$/.test(lines[i])) {
          descEnd = i;
          break;
        }
      }

      // Replace everything between ## Description and its end marker
      const newLines = [
        ...lines.slice(0, descStart + 1),
        "",
        descriptionContent,
        "",
        ...lines.slice(descEnd),
      ];
      return newLines.join("\n");
    }

    // No ## Description section yet — insert before ## Journal (or prepend)
    const insertAt = journalStart !== -1 ? journalStart : 0;
    const newLines = [
      ...lines.slice(0, insertAt),
      "## Description",
      "",
      descriptionContent,
      "",
      "----",
      "",
      ...lines.slice(insertAt),
    ];
    return newLines.join("\n");
  }
}
