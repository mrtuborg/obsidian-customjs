class mentionsProcessor {

    async pagesWithMentionsRead(pageFile, dv, tagId) {
        const content = await dv.io.load(pageFile.path);
        const lines = content.split('\n');

        let output = [];
        let collectedLines = [];
        let mentionBlock = [];

        let inCodeBlock = false;
        let codeBlock = [];
        let inHeaderSection = false;

        let headerSection = [];
        let startHeaderLevel = 0;
        let consecutiveNewLines = 0;

        for (const line of lines) {

            if (inCodeBlock) {
                collectedLines.push(line);
                if (line.trim() === '```') {
                    inCodeBlock = false;
                    mentionBlock = collectedLines;
                    collectedLines = [];
                }
                continue;
            } else if (line.trim().startsWith('```')) {
                inCodeBlock = true;
                collectedLines = [];
                continue;
            }

            if (inHeaderSection) {
                // Processeing mention as a section under header

                // Section end happens on these 3 conditions:
                // 1) if we have met header the same or higher level,
                if (line.startsWith('#')) {
                    const currentHeaderLevel = line.split(' ')[0].length;
                    if (currentHeaderLevel <= startHeaderLevel) {
                        inHeaderSection = false;
                        output.push({
                            page: pageFile.link,
                            data: headerSection.join('\n'),
                            mtime: pageFile.mtime
                        });
                        headerSection = [];
                    }
                }

                // 2) if we have met splitter `---`
                if (line === '---') {
                    inHeaderSection = false;
                    output.push({
                        page: pageFile.link,
                        data: headerSection.join('\n'),
                        mtime: pageFile.mtime
                    });
                    headerSection = [];
                }

                // 3) if we have met sequence of two empty lines
                if (line.trim() === '') {
                    consecutiveNewLines++;
                    if (consecutiveNewLines >= 2) {
                        inHeaderSection = false;
                        output.push({
                            page: pageFile.link,
                            data: headerSection.join('\n'),
                            mtime: pageFile.mtime
                        });
                        headerSection = [];
                    }
                } else {
                    consecutiveNewLines = 0;
                }

                if (inHeaderSection) {
                    headerSection.push(line);
                }
                continue;
            }

            if (line.includes('[[') && line.includes(']]') && line.includes(tagId)) {
                // Remove [[, ]] and all that in between from the line
                const cleanLine = line.replace(new RegExp(`\\[\\[.*?${tagId}.*?\\]\\]`, 'g'), '');

                if (cleanLine.startsWith('#')) {
                    startHeaderLevel = cleanLine.split(' ')[0].length;
                    inHeaderSection = true;
                    headerSection.push(cleanLine);
                } else if (cleanLine.trim().startsWith('```')) {
                    inCodeBlock = true;
                    codeBlock.push(cleanLine);
                } else {
                    output.push({
                        page: pageFile.link,
                        data: cleanLine,
                        mtime: pageFile.mtime
                    });
                }
            }
        }

        if (headerSection.length > 0) {
            output.push({
                page: pageFile.link,
                data: headerSection.join('\n'),
                mtime: pageFile.mtime
            });
        }

        return output;
    }

    async processMentions(
        dv, app, tagId, pages) {

        const mentionsPromises =
            pages.map(
                    page =>
                    this.pagesWithMentionsRead(
                        page, dv, tagId));
        const mentionsArray = await Promise.all(mentionsPromises);

        const flattenedMentions = mentionsArray.flat();

        const currentFilePath = dv.current().file.path;
        let currentFileContent = await dv.io.load(currentFilePath);
        const currentFileLines = currentFileContent.split('\n');
        let fileLinesToWrite = [];

        // File preamble is frontmatter (until the first '---' line) and the next block with scripts (until the next '---' line)
        // So preamble block should be kept to save it later

        // Map to store mention blocks by their source file
        // Initialize mentionBlocksBySource from existing data
        let mentionBlocksBySource = {};
        let pageLink = null;
        let mentionData = [];

        let keepContent = [];
        let isPreambleProcessed = false;
        let preambleEndCount = 0;
        let notesSectionFound = false;
        let notesContent = [];

        currentFileLines.forEach(line => {
            if (!isPreambleProcessed) {
                if (line != '\n') {
                    keepContent.push(line);
                }

                if (line === '---') {
                    preambleEndCount++;
                    if (preambleEndCount === 3) {
                        isPreambleProcessed = true;
                    }
                }
            } else {
                if (line.startsWith('>')) {
                    keepContent.push(line);
                }
                if (line.startsWith('# Notes:')) {
                    notesSectionFound = true;
                } else if (notesSectionFound) {
                    notesContent.push(line);
                }
            //- rest of the file
            //-    let linkPart = line.replace(/.*\/|\.md.*/g, '').replace('[[', '').replace(']]', '').trim();
            //-    if (moment(linkPart, 'YYYY-MM-DD', true).isValid()) {
            //-        pageLink = linkPart; // Assign to pageLink if valid date
            //-        mentionData = []; // line.replace(pageLink, '').trim()
            //-        if (!mentionBlocksBySource[pageLink]) {
            //-            mentionBlocksBySource[pageLink] = [];
            //-        }
            //-    }
            }
        });

        flattenedMentions.forEach(mention => {
            let mentionData = mention.data.replace(tagId, '');
            let mentionPageLink = mention.page;

            const linkPart = mentionPageLink.toString().replace(/.*\/|\.md.*/g, '').trim();
            // Initialize the array for the source file if it doesn't exist
            if (!mentionBlocksBySource[linkPart]) {
                mentionBlocksBySource[linkPart] = [];
            }

            // Add the mention block to the map
            if (mentionData.length > 0) {
                mentionBlocksBySource[linkPart].push(mentionData);
            }

        });

        // Add new mention blocks
        fileLinesToWrite.push(keepContent.join('\n'));

        // Sort the keys of mentionBlocksBySource based on the date format YYYY-MM-DD
        const sortedKeys = Object.keys(mentionBlocksBySource).sort((a, b) => {
            return new Date(a) - new Date(b);
        });

        sortedKeys.forEach(key => {
            if (mentionBlocksBySource[key].length > 0)
                fileLinesToWrite.push(`\n[[${key}]]`);

            mentionBlocksBySource[key].forEach(mention => {
                let mentionData = mention.replace(tagId, '');
                fileLinesToWrite.push(`${mentionData}`);
            });
        });

        if (fileLinesToWrite.length > 0) {
            fileLinesToWrite.push("\n---");
            if (notesSectionFound) {
                fileLinesToWrite.push('# Notes:');
                fileLinesToWrite.push(notesContent.join('\n'));
            }
        }
        await app.vault.modify(app.vault.getAbstractFileByPath(currentFilePath), fileLinesToWrite.join('\n'));
    }

    async run(dv, app, pagesList, mentionStr) {
        const pages = pagesList.map(p => p.file);
        await this.processMentions(dv, app, mentionStr, pages);
    }
}