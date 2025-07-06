# Scripts Directory Structure

This directory contains all JavaScript modules used by Obsidian templates and dataviewjs blocks. The scripts are organized into a hierarchical structure that reflects their architectural relationships.

## Directory Structure

```
Engine/Scripts/
├── activityComposer.js      # Main orchestrator for activity notes
├── dailyNoteComposer.js     # Main orchestrator for daily journal notes
├── components/              # Specialized processors used by orchestrators
├── utilities/               # Helper utilities and file operations
├── views/                  # UI and display components
└── README.md               # This documentation
```

## Main Orchestrators (Root Level)

**Main entry points** that templates use directly. These coordinate and orchestrate all other components:

- **`activityComposer.js`** - **Main orchestrator for activity notes**
  - Coordinates: fileIO, attributesProcessor, mentionsProcessor, noteBlocksParser
  - Generates activity frontmatter (startDate, stage, responsible)
  - Orchestrates the complete activity processing pipeline
  - Used by: Activity-template.md, DailyNote-template.md (for moved notes)

- **`dailyNoteComposer.js`** - **Main orchestrator for daily journal notes**
  - Coordinates: fileIO, noteBlocksParser, todoRollover, activitiesInProgress, mentionsProcessor, scriptsRemove
  - Generates daily note frontmatter
  - Orchestrates todo rollover, activities integration, mentions processing
  - Used by: DailyNote-template.md (for valid date notes)

## Components (`components/`)

**Specialized processors** that handle specific aspects of note processing. These are used by orchestrators:

### Content Processing Components
- **`attributesProcessor.js`** - Processes special directives in note content
  - Handles attribute modifications based on content directives
  - Updates frontmatter dynamically

- **`mentionsProcessor.js`** - Handles cross-note references and reminders
  - Processes date mentions between notes
  - Copies referenced content as reminders

- **`noteBlocksParser.js`** - Parses and extracts blocks from journal pages
  - Extracts todos, content blocks, and metadata
  - Provides data for other processors

### Feature Components
- **`todoRollover.js`** - Manages todo item rollover between days
  - Moves incomplete todos from previous days to today
  - Optionally removes todos from original locations

- **`activitiesInProgress.js`** - Integrates current activities into daily notes
  - Finds activities with "active" or "in-progress" status
  - Adds them to today's daily note

## Utilities (`utilities/`)

Helper modules that provide common functionality:

- **`fileIO.js`** - File operations and content management
  - File reading/writing operations
  - Frontmatter generation for different note types
  - Content extraction and parsing utilities

- **`scriptsRemove.js`** - Cleans up dataviewjs blocks
  - Removes processing scripts from finalized notes
  - Used to clean up daily notes after processing

- **`forceStaticPage.js`** - Static page utilities
  - Forces certain pages to be static (no dynamic processing)

## Views (`views/`)

UI and display components:

- **`timelineView.js`** - Timeline visualization component
  - Generates timeline views of activities and events

## Usage in Templates

### Importing Modules
All modules are available through the `cJS()` system:

```javascript
// Import a composer
const {activityComposer} = await cJS();

// Import a utility
const {fileIO} = await cJS();

// Import multiple modules
const {activityComposer, fileIO, mentionsProcessor} = await cJS();
```

### Template Examples

**Activity Template:**
```javascript
const {activityComposer} = await cJS();
const currentPageFile = dv.current().file;
await activityComposer.processActivity(app, dv, currentPageFile);
```

**Daily Note Template:**
```javascript
const {dailyNoteComposer} = await cJS();
const currentPageFile = dv.current().file;
await dailyNoteComposer.processDailyNote(app, dv, currentPageFile, title);
```

## Architecture Overview

The system follows a **hierarchical orchestration pattern**:

```
Templates
    ↓
Orchestrators (Main Entry Points)
    ↓
Components (Specialized Processors)
    ↓
Utilities (Common Functions)
```

### Dependency Flow
- **Templates** → Only call **Orchestrators**
- **Orchestrators** → Coordinate **Components** and **Utilities**
- **Components** → May use **Utilities** and other **Components**
- **Utilities** → Self-contained, minimal dependencies

This ensures:
- **Clear separation of concerns**
- **Single responsibility principle**
- **Easy testing and maintenance**
- **Predictable data flow**

## Adding New Scripts

When adding new scripts, follow this organization:

1. **Orchestrators** - If it's a main entry point that templates will use directly
2. **Components** - If it handles specialized processing used by orchestrators
3. **Utilities** - If it provides helper functions used by multiple modules
4. **Views** - If it generates UI components or visualizations

### Naming Conventions
- Use camelCase for file names
- End orchestrator files with `Composer.js`
- Use descriptive names that indicate the module's purpose
- Export a class and create an instance for the cJS() system

## Dependencies

Scripts follow strict dependency patterns:

### Orchestrators Dependencies
- **activityComposer.js** depends on: `fileIO`, `attributesProcessor`, `mentionsProcessor`, `noteBlocksParser`
- **dailyNoteComposer.js** depends on: `fileIO`, `noteBlocksParser`, `todoRollover`, `activitiesInProgress`, `mentionsProcessor`, `scriptsRemove`

### Component Dependencies
- **Components** may depend on **utilities** (especially `fileIO.js`)
- **Components** may depend on other **components**
- **Views** may depend on **utilities** for data access

### Utilities Dependencies
- **Utilities** should be self-contained with minimal dependencies

## Error Handling

All processors should include proper error handling:
- Try-catch blocks around main processing logic
- Console logging for debugging
- Return success/error status objects
