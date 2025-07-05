// This script processes attributes in a markdown file, allowing for dynamic updates
// to the frontmatter based on specific operations.
// It supports operations like setting, incrementing, and decrementing numeric values, as well
// as appending and removing strings from lists.
// It also handles frontmatter parsing and file saving in the Obsidian vault.

class attributesProcessor {
  // This function saves the modified content back to the file
  // It first checks if the file exists in the vault, and if so, modifies it.
  // It also forces a cache update to ensure the changes are reflected in the app.
  // The function takes the filename and content as parameters.
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

  // This function processes the attributes in the markdown file
  // It reads the file content, extracts the frontmatter, and processes each line
  // to update the attributes based on the specified operations.
  // Attributes are defined within curly braces {} in the markdown file and associated with
  // specific operations. The function handles these operations and updates the frontmatter.
  // Attribute values are stored in the frontmatter of the markdown file.
  // Supported operations include:
  // - "=": Set the attribute to a specific value
  // - "+=": Increment the attribute by a specific value
  // - "-=": Decrement the attribute by a specific value
  // - ":": Set the attribute to a specific string value

  async processAttributes(frontmatter, bodyContent) {
    // console.log(
    //   "attributesProcessor: Processing content:",
    //   JSON.stringify(bodyContent)
    // );
    const lines = bodyContent.split("\n");
    let inCodeBlock = false;

    lines.forEach((line) => {
      //console.log(
      //  "attributesProcessor: Processing line:",
      //  JSON.stringify(line)
      //);
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
      }

      if (!inCodeBlock) {
        const startIdx = line.indexOf("{");
        const endIdx = line.indexOf("}");

        if (startIdx !== -1 && endIdx !== -1) {
          const expression = line.slice(startIdx + 1, endIdx).trim();
          // console.log("attributesProcessor: Found expression:", expression);
          // Find the operation
          // Define the possible operations
          const operations = ["=", "+=", "-=", ":"];

          // Find the operation in the expression
          const operation = operations.find((op) => expression.includes(op));
          // console.log("attributesProcessor: Found operation:", operation);

          let attributeName;
          let value;
          if (operation) {
            // Split the expression based on the operation
            [attributeName, value] = expression
              .split(operation)
              .map((str) => str.trim());
            // console.log(
            //   "attributesProcessor: attributeName:",
            //   attributeName,
            //   "value:",
            //   value
            // );
          }
          let attributeValue = frontmatter[attributeName];

          if (attributeValue === undefined) {
            attributeValue = isNaN(value) ? "" : 0;
            frontmatter[attributeName] = attributeValue;
          }

          // Check if the value is numeric
          const isNumeric = !isNaN(value) && !isNaN(parseFloat(value));
          // console.log(
          //   "attributesProcessor: isNumeric check for value '" + value + "':",
          //   isNumeric
          // );

          if (isNumeric && operation != ":") {
            // Handle numeric operations
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
            // Handle string operations
            switch (operation) {
              case ":":
                attributeValue = value;
                break;
              case "+=":
                attributeValue = attributeValue
                  ? `${attributeValue},${value}`
                  : value;
                break;
              case "-=":
                attributeValue = attributeValue
                  .split(",")
                  .filter((v) => v !== value)
                  .join(",");
                break;
            }
          }
          console.log(
            "attributesProcessor: Setting frontmatter[" + attributeName + "] =",
            attributeValue
          );
          frontmatter[attributeName] = attributeValue;
        }
      }
    });

    // Convert frontmatter object to string
    let frontmatterString = "---\n";
    for (const key in frontmatter) {
      if (frontmatter.hasOwnProperty(key)) {
        frontmatterString += `${key}: ${frontmatter[key]}\n`;
      }
    }
    frontmatterString += "---\n";

    //await this.saveFile(page.path, frontmatterString + "\n" + bodyContent);
  }

  // This function is the main entry point for the script
  async run(app, dv, page) {
    await this.processAttributes(app, dv, page);
  }
}
