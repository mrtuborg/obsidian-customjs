class timelineView {
    async extractDates(dv, filePath, app) {
        let fileContent = await dv.io.load(filePath);
        const lines = fileContent.split('\n');
        const results = [];

        let lastMentionSource = null;

        lines.forEach(line => {
            const bracketMatch = line.match(/\[\[(.*?)\]\]/);
            if (bracketMatch) {
                const bracketContent = bracketMatch[1];
                const dateMatch = bracketContent.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) {
                    const date = dateMatch[0];
                    let remainingText = line.replace(bracketMatch[0], '').trim();

                    // Remove list formatters and headers
                    const isHeader = remainingText.startsWith('#');
                    remainingText = remainingText.replace(/^(\d+\.\s|-+\s|#+\s)/, '').trim();

                    if (remainingText.length > 0) {
                        if (isHeader) {
                            remainingText = `**${remainingText}**`; // Make text bold if it's a header
                        }

                        results.push({ date, text: remainingText, source: lastMentionSource});
                    } else if (line.match(/\d{4}-\d{2}-\d{2}/)) { // Mention
                        lastMentionSource = line.trim();
                    }
                }
            }
        });

        return results;
    }

    async run(dv, app) {
        const data = await this.extractDates(dv, dv.current().file.path, app);

        // Sort data by date and then by text (bolded text last)
        data.sort((a, b) => {
            const dateA = new Date(a.date.replace(/\[\[|\]\]/g, ''));
            const dateB = new Date(b.date.replace(/\[\[|\]\]/g, ''));
            if (dateA - dateB !== 0) {
                return dateA - dateB;
            }
            const isBoldA = a.text.startsWith('**') && a.text.endsWith('**');
            const isBoldB = b.text.startsWith('**') && b.text.endsWith('**');
            return isBoldA - isBoldB;
        });

        // Create a table view
        dv.table(
            ["Checkpoint", "Action", "Source"], // Table headers
            data.map(item => ["[["+item.date+ "]]", item.text, item.source]) // Table rows
        );
    }
}