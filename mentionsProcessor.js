class mentionsProcessor {

    async pagesWithMentionsRead(pageFile, dv, tagId, append) {
        var output = [];
        const content = await dv.io.load(pageFile.path);
        const lines = content.split('\n');
        let inCodeBlock = false;
        let codeBlock = [];
        let inHeaderSection = false;
        let headerSection = [];
        let startHeaderLevel = 0;
        let consecutiveNewLines = 0;

        for (const line of lines) {
            if (inCodeBlock) {
                codeBlock.push(line);
                if (line.trim() === '```') {
                    inCodeBlock = false;
                    output.push({
                        page: pageFile.link,
                        data: codeBlock.join('\n'),
                        mtime: pageFile.mtime
                    });
                    codeBlock = [];
                }
                continue;
            }

            if (inHeaderSection) {
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
        dv, app, tagId, pages, append) {

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

        // File preambule is frintmatter (until the first '---' line) and the next block with scripts (until the next '---' line)
        // So preamble block should be kept to save it later

        // Map to store mention blocks by their source file
        // Initialize mentionBlocksBySource from existing data
        let mentionBlocksBySource = {};
        let pageLink = null;
        let mentionData = [];

        let preamble = [];
        let isPreambleProcessed = true;
        let preambleEndCount = 0;

        currentFileLines.forEach(line => {
            if (isPreambleProcessed) {
                preamble.push(line);
                if (line === '---') {
                    preambleEndCount++;
                    if (preambleEndCount === 3) {
                        isPreambleProcessed = false;
                    }
                }
            } else {
            // rest of the file
                const linkPart = line.replace(/.*\/|\.md.*/g, '').trim();
                if (moment(linkPart, 'YYYY-MM-DD', true).isValid()) {
                    pageLink = linkPart;
                    mentionData = []; // line.replace(pageLink, '').trim()
                    if (!mentionBlocksBySource[pageLink]) {
                        mentionBlocksBySource[pageLink] = [];
                    }
                } else if (pageLink && line === '---') { // We met end of the block sign in the old data
                    if (mentionData.length > 0) {
                        mentionBlocksBySource[pageLink] = mentionData;
                    }
                } else if (pageLink) {
                    // Block is started, and not ended yet, so we are adding data to the block
                    mentionData.push(line);
                }
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
        fileLinesToWrite.push(preamble.join('\n'));
        Object.keys(mentionBlocksBySource).forEach(mentionPageLink => {
            fileLinesToWrite.push(`\n[[${mentionPageLink}]]`);
            mentionBlocksBySource[mentionPageLink].forEach(mention => {
                let mentionData = mention.replace(tagId, '');
                fileLinesToWrite.push(`${mentionData}`);
            });
            fileLinesToWrite.push(`\n---`);
        });

        await app.vault.modify(app.vault.getAbstractFileByPath(currentFilePath), fileLinesToWrite.join('\n'));
    }

    async run(dv, app, pagesList, mentionStr, append) {
        // const tagId = '[[' + mentionStr + ']]';
        const pages = pagesList.map(p => p.file);
        await this.processMentions(dv, app, mentionStr, pages, append);
    }
}