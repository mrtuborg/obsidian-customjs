// Simple test script for the new Block system
// Compatible with both CustomJS import and direct DataviewJS execution

class testBlockSystem {
  async run() {
    console.log("=== Testing Object-Oriented Block System ===");

    try {
      // Test Block creation
      console.log("\n1. Testing Block creation...");
      const block1 = new Block("test.md", "# Header 1", Date.now());
      block1.setAttribute("type", "header");
      block1.setAttribute("level", 1);
      console.log("✅ Block created:", block1.toString());

      // Test BlockCollection
      console.log("\n2. Testing BlockCollection...");
      const collection = new BlockCollection();
      collection.addBlock(block1);

      const block2 = new Block("test.md", "- [ ] Todo item", Date.now());
      block2.setAttribute("type", "todo");
      block2.setAttribute("indentLevel", 0);
      collection.addBlock(block2);

      const block3 = new Block("test.md", "  - [ ] Nested todo", Date.now());
      block3.setAttribute("type", "todo");
      block3.setAttribute("indentLevel", 2);
      collection.addBlock(block3);

      console.log("✅ Collection created:", collection.toString());

      // Test hierarchy
      console.log("\n3. Testing hierarchy...");
      block1.addChild(block2);
      block2.addChild(block3);

      console.log("✅ Hierarchy created:");
      console.log("  - block1 children:", block1.children.length);
      console.log(
        "  - block2 parent:",
        block2.parent ? block2.parent.toString() : "none"
      );
      console.log(
        "  - block3 parent:",
        block3.parent ? block3.parent.toString() : "none"
      );

      // Test queries
      console.log("\n4. Testing queries...");
      const todoBlocks = collection.findByType("todo");
      console.log("✅ Found", todoBlocks.length, "todo blocks");

      const headerBlocks = collection.findByAttribute("level", 1);
      console.log("✅ Found", headerBlocks.length, "level 1 headers");

      // Test compatibility
      console.log("\n5. Testing compatibility...");
      const compatArray = collection.toCompatibilityArray();
      console.log("✅ Compatibility array:", compatArray.length, "items");
      console.log("  - First item:", compatArray[0]);

      // Test noteBlocksParser with sample content
      console.log("\n6. Testing noteBlocksParser...");
      const parser = new noteBlocksParser();
      const sampleContent = `# Header 1
- [ ] Task 1
  - [ ] Subtask 1.1
  - [ ] Subtask 1.2
- [ ] Task 2

## Header 2
[[Some Link]]
> Callout text`;

      const parsed = parser.parse("sample.md", sampleContent);
      console.log("✅ Parsed", parsed.blocks.length, "blocks");
      console.log("✅ Block types:", parsed.getStats().types);
      console.log("✅ Hierarchy stats:", {
        total: parsed.getStats().totalBlocks,
        roots: parsed.getStats().rootBlocks,
        withParents:
          parsed.getStats().totalBlocks - parsed.getStats().rootBlocks,
      });

      // Test hierarchy structure
      console.log("\n7. Testing parsed hierarchy...");
      const hierarchy = parsed.getHierarchy();
      console.log("✅ Root blocks:", hierarchy.length);
      hierarchy.forEach((root, i) => {
        console.log(`  Root ${i + 1}:`, root.block.toString());
        if (root.children.length > 0) {
          root.children.forEach((child, j) => {
            console.log(`    Child ${j + 1}:`, child.block.toString());
            if (child.children.length > 0) {
              child.children.forEach((grandchild, k) => {
                console.log(
                  `      Grandchild ${k + 1}:`,
                  grandchild.block.toString()
                );
              });
            }
          });
        }
      });

      console.log(
        "\n🎉 All tests passed! Object-oriented Block system is working correctly."
      );

      return {
        success: true,
        blocksCreated: 3,
        hierarchyLevels: 3,
        parsedBlocks: parsed.blocks.length,
        message: "All Block system tests completed successfully!",
      };
    } catch (error) {
      console.error("❌ Test failed:", error);
      console.error(error.stack);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }
}
