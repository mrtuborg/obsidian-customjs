class scriptsRemove {
    async saveFile(app, filename, content) {
        const abstractFilePath = app.vault.getAbstractFileByPath(filename);
        if (!abstractFilePath) {
            console.error("File not found: ", page.path);
            return;
        }

        if (typeof content !== 'string') {
            throw new TypeError('Content must be a string');
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

    async removeScripts(app, dv) {

        const currentPage = dv.current().file;

        if (currentPage.name != new Date().toISOString().split('T')[0]) {
            console.log("This is not a daily note. Avoid scripts removal...");
            return;
        }

        const currentPageContent = await this.loadFile(app, currentPage.path);
        let currentLines = currentPageContent.trim().split("\n")
            .filter(line => {
                // Cannot handle 'undefined'
                return line !== undefined && line !== null && line.trim() !== "";
            });

        // Remove JavaScript code blocks
        let inCodeBlock = false;
        currentLines = currentLines.filter(line => {
            if (line.trim().startsWith("```dataviewjs")) {
                inCodeBlock = true;
                return false; // Remove the start of the code block
            }
            if (inCodeBlock && line.trim() === "```") {
                inCodeBlock = false;
                return false; // Remove the end of the code block
            }
            return !inCodeBlock; // Remove lines within the code block
        });

        const newContent = currentLines.join("\n");
        await this.saveFile(app, currentPage.path, newContent);

    }


    async run(app, dv) {
        await this.removeScripts(app, dv);
    }
}