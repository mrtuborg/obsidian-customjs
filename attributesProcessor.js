class attributesProcessor {
    async saveFile(filename, content) {
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

    async processAttributes(app, dv, page) {
        const content = await dv.io.load(page.path);
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

        let frontmatter = {};
        let bodyContent = content;

        if (frontmatterMatch) {
            const frontmatterLines = frontmatterMatch[1].split('\n');
            frontmatterLines.forEach(line => {
                const [key, ...rest] = line.split(':');
                frontmatter[key.trim()] = rest.join(':').trim();
            });
            // Remove frontmatter from content
            bodyContent = content.slice(frontmatterMatch[0].length);
        }

        const lines = bodyContent.split('\n');
        let inCodeBlock = false;

        lines.forEach(line => {
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }

            if (!inCodeBlock) {
                const startIdx = line.indexOf('{');
                const endIdx = line.indexOf('}');

                if (startIdx !== -1 && endIdx !== -1) {
                    const expression = line.slice(startIdx + 1, endIdx).trim();
                    // Find the operation
                    // Define the possible operations
                    const operations = ['=', '+=', '-=', ':'];

                    // Find the operation in the expression
                    const operation = operations.find(op => expression.includes(op));

                    let attributeName;
                    let value;
                    if (operation) {
                        // Split the expression based on the operation
                        [attributeName, value] = expression.split(operation).map(str => str.trim());
                    }
                    let attributeValue = frontmatter[attributeName];

                    if (attributeValue === undefined) {
                        attributeValue = isNaN(value) ? "" : 0;
                        frontmatter[attributeName] = attributeValue;
                    }


                    // Check if the value is numeric
                    const isNumeric = !isNaN(value) && !isNaN(parseFloat(value));


                    if (isNumeric && operation != ":") {
                        const numericValue = parseFloat(value);
                        attributeValue = parseFloat(attributeValue) || 0; // Ensure attributeValue is a number
                        switch (operation) {
                            case "=":
                                attributeValue = numericValue;
                                break;
                            case "+=":
                                attributeValue += numericValue;
                                break;
                            case "-=":
                                attributeValue -= numericValue;
                                break;
                        }
                    } else {
                        switch (operation) {
                            case ":":
                                attributeValue = value;
                                break;
                            case "+=":
                                attributeValue = attributeValue ? `${attributeValue},${value}` : value;
                                break;
                            case "-=":
                                attributeValue = attributeValue.split(',').filter(v => v !== value).join(',');
                                break;
                        }
                    }
                    frontmatter[attributeName] = attributeValue;
                }
            }
        });

        // Convert frontmatter object to string
        let frontmatterString = '---\n';
        for (const key in frontmatter) {
            if (frontmatter.hasOwnProperty(key)) {
                frontmatterString += `${key}: ${frontmatter[key]}\n`;
            }
        }
        frontmatterString += '---\n';

        await this.saveFile(page.path, frontmatterString + '\n' + bodyContent);
    }
    async run(app, dv, page) {
        await this.processAttributes(app, dv, page);
    }
}