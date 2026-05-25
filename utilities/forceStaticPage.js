// This script removes all the scripts from the current file
// if the date in the filename matches today's date
// and the file is not a static page.
class forceStaticPage {
  // This function is the main entry point for the script
  async run(dv, app) {
    const currentFilePath = dv.current().file.path;
    const fileName = currentFilePath.split("/").pop();
    const fileDateMatch = fileName.match(/\d{4}-\d{2}-\d{2}/);

    if (!fileDateMatch) {
      console.log("No date found in filename.");
      return;
    }

    const fileDate = moment(fileDateMatch[0], "YYYY-MM-DD");
    const today = moment().startOf("day");

    if (!fileDate.isSame(today, "day")) {
      console.log("Today's date does not match the date in the filename.");
      return;
    }

    let currentFileContent = await dv.io.load(currentFilePath);
    const currentFileLines = currentFileContent.split("\n");

    let inJavaScriptBlock = false;
    const filteredLines = currentFileLines.filter((line) => {
      if (inJavaScriptBlock) {
        console.log(`Removing line: ${line}`);
      }
      if (/^\s*```\s*dataviewjs\s*$/.test(line)) {
        inJavaScriptBlock = true;
        return false;
      }
      if (/^\s*```\s*$/.test(line) && inJavaScriptBlock) {
        inJavaScriptBlock = false;
        return false;
      }
      return !inJavaScriptBlock;
    });

    await app.vault.modify(
      app.vault.getAbstractFileByPath(currentFilePath),
      filteredLines.join("\n")
    );
  }
}
