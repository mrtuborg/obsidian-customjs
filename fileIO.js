// Usage example:
// fileIO.saveFile(app, 'example.md', 'New content');

class fileIO {
    static async saveFile(app, filename, content) {
        const abstractFilePath = app.vault.getAbstractFileByPath(filename);
        if (!abstractFilePath) {
            console.error("File not found: ", page.path);
            return;
        }

        // Modify the file and force cache update
        await app.vault.modify(abstractFilePath, content);

        // Force cache update (if applicable)
        if (app.metadataCache) {
            await app.metadataCache.getFileCache(abstractFilePath);
        }

        // workaround
        await app.vault.modify(abstractFilePath, content);
    }

    static async loadPagesContent(dv, pages) {
        const pagesContent = [];
        for (const page of pages) {
            const content = await dv.io.load(page.path);
            pagesContent.push({ page, content });
        }
        return pagesContent;
    }
}