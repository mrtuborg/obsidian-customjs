class todoRollover {
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

    async removeTodosFromOriginalPages(app, filteredTodos) {
        // console.log("Step 7: Remove the collected to-do elements from their original locations");
        const uniquePages = new Set(filteredTodos.map(todo => todo.page));

        // Helper function to normalize lines by removing the callout symbol
        function normalizeLine(line) {
            return line.trim().startsWith('>') ? line.trim().substring(1).trim() : line.trim();
        }

        for (const pagePath of uniquePages) {
            const content = await this.loadFile(app, pagePath);
            const pageLines = content.split("\n");

            // Filter out only the collected to-do items from the original file
            const updatedPageLines = pageLines.filter((line, index) => {
                const normalizedLine = normalizeLine(line);
                const shouldRemove = filteredTodos.some(todo => {
                    const isMatch = (todo.page === pagePath && normalizedLine.includes(normalizeLine(todo.line)));
                    //d: if (isMatch) {
                    //d:    console.log(`Removing line from page ${pagePath}:`, line);
                    //d:}
                    return isMatch;
                });
                return !shouldRemove;
            });

            const updatedPageContent = updatedPageLines.join("\n");
            // Ensure the file is not empty before saving
            if (updatedPageContent.trim().length > 0) {
                await this.saveFile(app, pagePath, updatedPageContent);
                //d: console.log("New content for page", pagePath, ":", updatedPageContent);
            }
        }
    }

/*
    Process row in each daily journal `processingDate`:
        1. Mention [[Review/Daily]]
            next+=1d
        2. Mention [[Review/Weekly]]
            next+=1w
        3. Mention [[Review/Monthly]]
            next+=1m

    If current "daily note" (curDate - processingDate - offset == next), copy to-do item with mentioning
    If current "daily note" (curDate - processingDate - offset > next) and is not completed, move to-do item with mentioning, adding { offset=`curDate` - `processingDate` - `next`}

*/
    processRecurrence(todoLine, noteDate) {
        // it contain mention to [[Review/Daily]], [[Review/Weekly]], [[Review/Monthly]]
        const daily   = todoLine.includes("[[Review/Daily");
        const weekly  = todoLine.includes("[[Review/Weekly");
        const monthly = todoLine.includes("[[Review/Monthly");

        if (!daily && !weekly && !monthly) {
            return null;
        }

        const todayDate = new Date();
        const nextDate = new Date(noteDate);

        if (daily) {
            nextDate.setDate(nextDate.getDate() + 1);
        } else if (weekly) {
            nextDate.setDate(nextDate.getDate() + 7);
        } else if (monthly) {
            nextDate.setMonth(nextDate.getMonth() + 1);
        }

        console.log(`Next date: ${moment(nextDate).format("YYYY-MM-DD")}`);
        return nextDate;
    }

    async rolloverTodos(app, dv, blocks, removeOriginals) {
        /* Not sure if this block is still needed
        const waitForCurrent = async (timeout) => {
            const interval = 100; // Check every 100ms
            const maxAttempts = timeout / interval;
            let attempts = 0;

            while (!dv.current() && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, interval));
                attempts++;
            }

            return dv.current();
        };
        const current = await waitForCurrent(5000); // Wait up to 5 seconds
        if (!current) return;
        */

        const currentPage = dv.current().file;

        if (currentPage.name != new Date().toISOString().split('T')[0]) {
            console.log("This is not a daily note. Avoid collecting of remainings...");
            return;
        }

        const todayDate = moment(currentPage.name).format("YYYY-MM-DD");

        // Filter out blocks from future dates
        let todoBlocks = blocks.filter(item => {
            const blockDate = moment(item.page, "YYYY-MM-DD");
            return ((item.blockType === 'todo') && blockDate.isSameOrBefore(todayDate));
        });

        // Log filtered blocks for debugging
        todoBlocks.forEach(block => {
            console.log("Processing block from page:", block.page);
        });

        // console.log("Step 3: Open the current note\n");


        const currentPageContent = await this.loadFile(app, currentPage.path);
        let currentLines = currentPageContent.trim().split("\n")
            .filter(line => {
                // Cannot handle 'undefined'
                // console.log("line:", line);
                // console.log("line.length:", line.length);
                return line !== undefined && line !== null && line.trim() !== "";
            });

        // console.log("Step 4: Find the last occurrence of '---'");
        let insertIndex = currentLines.lastIndexOf("---") + 1;

        // console.log("Step 5: Insert the collected to-do elements after the frontmatter");
        let newContent = ""
        let filteredTodos = [];
        let newTodos = [];
        let uniqueTodos = [];

        // Extract lines from the data field of each todo block and combine them into filteredTodos
        todoBlocks.forEach(block => {
                const lines = block.data.split('\n');
                lines.forEach(line => {
                    filteredTodos.push({
                        line: line.replace(/^>\s*/, '').trim(), // Remove '>' and any optional space from the beginning of the line
                        page: block.page
                    });
                });
                console.log(block.page);
        });
        // Avoid adding todos if they are already present in the current note
        filteredTodos.map(todo => {
            const todoLine = todo.line.replace(/^>\s*/, '').trim().toLowerCase();
            console.log("todoLine:", todoLine);
            if (!currentLines.some(line => line.replace(/^>\s*/, '').trim().toLowerCase() === todoLine)) {
                newTodos.push(todoLine);
            }
            return null;
            })
            .filter(todo => todo !== null) // Avoid null and undefined values

        const notesIndex = currentLines.findIndex(line => line.trim() === "# Notes:") + 1;

        if (newTodos.length === 0) return;

        // Create a Map to ensure unique lines while retaining both line and page properties
        const uniqueTodosMap = new Map();
        newTodos.forEach(todo => {
            console.log("uniqueTodosMap todo:", todo);
            if (todo && todo.line !== undefined && todo.line !== null) {
                if (!uniqueTodosMap.has(todo.line)) {
                    uniqueTodosMap.set(todo.line, todo);
                }
            }
        });

        // Convert the Map back to an array
        uniqueTodos = Array.from(uniqueTodosMap.values());
        uniqueTodos.push("---");

        currentLines.splice(insertIndex, 0, ...filteredTodos.map(todo => todo.line)).filter(line => line.trim().length > 0);
        newContent = currentLines.join('\n');

        // Save the new content to the current note
        // Ensure the file is not empty before saving
        await this.saveFile(app, currentPage.path, newContent);

        if (removeOriginals) this.removeTodosFromOriginalPages(app, filteredTodos);
    }


    async run(app, dv, collectedBlocks, RemoveOriginals = false) {
        await this.rolloverTodos(app, dv, collectedBlocks, RemoveOriginals);
    }
}