class todoRollover {
    async saveFile(app, filename, content) {
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

    async rolloverTodos(app, dv, pages, removeOriginals) {
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

        let collectedTodos = [];
        const currentPage = dv.current().file;

        if (currentPage.name != new Date().toISOString().split('T')[0]) {
            console.log("This is not a daily note. Avoid collecting of remainings...");
            return;
        }

        const todayDate = moment(currentPage.name).format("YYYY-MM-DD");

        // Filter out the current file from the pages list
        pages = pages.filter(page => page.path !== currentPage.path);
        // Step 1:  Collect all non-finished todos from the provided pages
        for (const page of pages) {
            const content = await dv.io.load(page.path);
            const lines = content.split("\n");
            const pageDate = moment(page.name).format("YYYY-MM-DD");
            //console.log(`Checking page: ${page.name}`);
            for (const line of lines) {
                // Look for incomplete to-do items
                // - if recurrent actions was not done on previous period, then it should be done today as usual action
                if (line.match(/^\s*- \[ \]/) || line.match(/^> - \[ \]/)) {
                        //console.log(`incompleted todo: ${line}`);
                        collectedTodos.push({ line: line.trim(), page });
                } else if (line.match(/^\s*- \[x\]/) || line.match(/^> - \[x\]/)) {
                    // Completed to-do items are ignored
                    // but if it is a recurrence, then it should be moved to today's note as uncompleted todo item
                    // console.log(`completed todo: ${line}`);
                    const nextOccurence = this.processRecurrence(line, pageDate)
                    if (nextOccurence) { // Is a recurrence
                        // console.log(`Found a recurrence: ${line}`);
                        // Check if the next occurrence is today
                        if (moment(nextOccurence).isSame(todayDate, 'day')) {
                            // console.log(`Today is the next occurrence of the recurrence: ${line}`);
                            const newTodo = line.replace('[x]', '[ ]');
                            collectedTodos.push({ line: newTodo.trim(), page });
                        }
                    }
                }
            }
        }

        // Step 2: Sort collected todos by page name and line
        collectedTodos.sort((a, b) => {
            if (a.page.name < b.page.name) return -1;
            if (a.page.name > b.page.name) return 1;
            return a.line < b.line ? -1 : 1;
        });

        // Step 3: Open the current note
        const currentPageContent = await dv.io.load(currentPage.path);
        const currentLines = currentPageContent.split("\n");

        // Step 4: Find the last occurrence of "---"
        let insertIndex = currentLines.lastIndexOf("---") + 1;

        // Step 5: Insert the collected to-do elements after the frontmatter
        let newContent = "";
        const filteredTodos = collectedTodos
            .map(todo => {
                // Remove '>' and any optional space from the beginning of the line if it exists
                const todoLine = todo.line.replace(/^>\s*/, '').trim();
                console.log(`Checking for ${todo.line}`);
                if (!currentLines.some(line => line.includes(`${todo.line}`))) {
                    // console.log(`${todo.line} is not found`)
                    if (!removeOriginals) {
                        return `${todoLine} (from [[${todo.page.name}]])`;
                    }
                    return `> ${todoLine}`;
                }
                return null;
            })
            .filter(line => line !== null) // Avoid duplicates and null values

        if (filteredTodos.length === 0) return;

        //-let calloutContent = [
        //-    `> [!todo]- ${filteredTodos.length} Remaining(s)`,
        //-    ...filteredTodos
        //-].join("\n");

        newContent = [
            ...currentLines.slice(0, insertIndex),
            ...filteredTodos,
            ...currentLines.slice(insertIndex),
            '---'
        ].join("\n");

        // Ensure the file is not empty before saving
        await this.saveFile(app, currentPage.path, newContent);

        // Step 6: Remove the collected to-do elements from their original locations
        if (removeOriginals) {
            const uniquePages = new Set(collectedTodos.map(todo => todo.page.path));

            for (const pagePath of uniquePages) {
                const content = await dv.io.load(pagePath);
                const pageLines = content.split("\n");

                // Filter out only the collected to-do items and empty callouts from the original file
                const updatedPageLines = pageLines.filter((line, index) => {
                    // Check for empty callouts
                    //-if (line.startsWith("> [!todo]") && (index + 1 < pageLines.length && !pageLines[index + 1].startsWith(">"))) {
                    //-    console.log(`Skipping the empty callout line: ${line}`);
                    //_    return false; // Skip the empty callout line
                    //-} else {
                    //-    console.log(`Checking for ${line}`);
                    //-}
                    return !collectedTodos.some(todo => todo.page.path === pagePath && line.includes(todo.line));
                });

                const updatedPageContent = updatedPageLines.join("\n");
                // Ensure the file is not empty before saving
                if (updatedPageContent.trim().length > 0) {
                    await this.saveFile(app, pagePath, updatedPageContent);
                }
            }
        } // if (removeOriginals)
    }

    async run(app, dv, pagesList, removeOriginals = false) {
        const pages = pagesList.map(p => p.file);
        await this.rolloverTodos(app, dv, pages, removeOriginals);
    }
}