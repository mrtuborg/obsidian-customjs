#!/usr/bin/env python3
"""
PDF to Markdown Converter with Diagram-to-DSL Support
Converts technical datasheets (particularly nRF52840) to markdown with Mermaid diagrams
"""

import sys
import os
import json
import argparse
from pathlib import Path
from datetime import datetime

try:
    import pdfplumber
except ImportError:
    print("Error: pdfplumber not installed. Run: pip install pdfplumber")
    sys.exit(1)

try:
    from pdf2image import convert_from_path
except ImportError:
    print("Warning: pdf2image not installed. Image extraction will be limited.")
    print("To enable: pip install pdf2image pillow")
    convert_from_path = None

try:
    import pytesseract
except ImportError:
    pytesseract = None


class PDFToMarkdownConverter:
    """Convert PDF datasheet to Markdown with diagram support"""
    
    # Diagram detection patterns
    DIAGRAM_KEYWORDS = {
        'block_diagram': ['block diagram', 'architecture', 'system architecture', 'pinout', 'pin configuration'],
        'flowchart': ['flow', 'flowchart', 'sequence', 'state machine', 'state diagram'],
        'timing': ['timing', 'timing diagram', 'waveform', 'signal timing'],
        'electrical': ['circuit', 'schematic', 'electrical', 'connections', 'interconnect'],
    }
    
    def __init__(self, pdf_path, output_dir=None):
        self.pdf_path = Path(pdf_path)
        self.output_dir = Path(output_dir) if output_dir else self.pdf_path.parent
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.metadata = {}
        self.content = []
        self.diagrams = []
        
    def extract_metadata(self):
        """Extract PDF metadata"""
        with pdfplumber.open(self.pdf_path) as pdf:
            meta = pdf.metadata
            self.metadata = {
                'title': meta.get('Title', 'Datasheet'),
                'author': meta.get('Author', 'Unknown'),
                'subject': meta.get('Subject', ''),
                'pages': len(pdf.pages),
                'created': str(meta.get('CreationDate', datetime.now())),
            }
    
    def extract_text(self):
        """Extract and structure text from PDF"""
        with pdfplumber.open(self.pdf_path) as pdf:
            current_section = "Introduction"
            
            for page_num, page in enumerate(pdf.pages, 1):
                # Extract text
                text = page.extract_text()
                if not text:
                    continue
                
                # Try to identify sections and structure
                lines = text.split('\n')
                for line in lines:
                    if len(line) > 2:
                        # Simple heuristic: lines in caps + short are likely headers
                        if line.isupper() and len(line) < 80:
                            current_section = line
                            self.content.append({
                                'type': 'heading',
                                'level': 2,
                                'text': current_section,
                                'page': page_num
                            })
                        else:
                            self.content.append({
                                'type': 'paragraph',
                                'text': line.strip(),
                                'section': current_section,
                                'page': page_num
                            })
                
                # Extract tables
                tables = page.extract_tables()
                for table_idx, table in enumerate(tables or []):
                    self.content.append({
                        'type': 'table',
                        'data': table,
                        'section': current_section,
                        'page': page_num,
                        'table_num': table_idx
                    })
    
    def detect_diagram_types(self):
        """Identify diagram types from text"""
        for item in self.content:
            if item['type'] == 'paragraph':
                text_lower = item['text'].lower()
                for diag_type, keywords in self.DIAGRAM_KEYWORDS.items():
                    if any(keyword in text_lower for keyword in keywords):
                        self.diagrams.append({
                            'type': diag_type,
                            'description': item['text'],
                            'page': item['page'],
                            'section': item['section']
                        })
    
    def generate_diagram_placeholder(self, diagram):
        """Generate Mermaid diagram placeholder based on type"""
        diag_type = diagram['type']
        section = diagram['section']
        
        if diag_type == 'block_diagram':
            return f"""```mermaid
graph LR
    A["MCU<br/>nRF52840"] --> B["Memory<br/>RAM/FLASH"]
    A --> C["Peripherals<br/>UART/SPI/I2C"]
    A --> D["Radio<br/>2.4GHz"]
    C --> E["External Components"]
    D --> F["Antenna"]
    style A fill:#e1f5ff
    style D fill:#fff3e0
```
**Note:** This is a placeholder. The actual block diagram from page {diagram['page']} should be refined based on the datasheet visualization."""
        
        elif diag_type == 'flowchart':
            return f"""```mermaid
flowchart TD
    A["Start"] --> B["Process"]
    B --> C["Decision"]
    C -->|Yes| D["Action 1"]
    C -->|No| E["Action 2"]
    D --> F["End"]
    E --> F
```
**Note:** This is a template. Specific flow from section '{section}' page {diagram['page']} should be detailed."""
        
        elif diag_type == 'timing':
            return """```mermaid
timing
    title Timing Diagram
    section Clock
    CLK : 0, 1, 0, 1, 0, 1, 0, 1
    section Data
    DATA : 0, 2, 3, 2, 3, 3, 2, 0
    section Output
    OUT : 0, 0, 4, 4, 4, 0, 0, 0
```
**Note:** Placeholder timing diagram. Replace with actual signal timings from datasheet."""
        
        elif diag_type == 'electrical':
            return f"""```mermaid
graph LR
    VDD["VDD<br/>3.3V"] --> REG["Regulator"]
    REG --> CORE["Core<br/>1.3V"]
    CORE --> PERIPH["Peripherals"]
    GND["GND"] --> PERIPH
    PERIPH --> IO["I/O Pads"]
    IO --> EXT["External<br/>Components"]
    style REG fill:#ffe0b2
    style CORE fill:#b3e5fc
```
**Note:** Power distribution diagram placeholder from page {diagram['page']}."""
        
        else:
            return f"""**Diagram placeholder for {diag_type}** from page {diagram['page']}\nSection: {section}\nDescription: {diagram['description']}"""
    
    def generate_markdown(self):
        """Generate markdown output"""
        md_lines = []
        
        # Frontmatter
        md_lines.append("---")
        md_lines.append(f"title: \"{self.metadata.get('title', 'Datasheet')}\"")
        md_lines.append(f"author: \"{self.metadata.get('author', 'Unknown')}\"")
        md_lines.append(f"pages: {self.metadata.get('pages', 0)}")
        md_lines.append(f"converted: {datetime.now().isoformat()}")
        md_lines.append(f"source: \"{self.pdf_path.name}\"")
        md_lines.append("---")
        md_lines.append("")
        
        # Title
        md_lines.append(f"# {self.metadata.get('title', 'Datasheet')}")
        md_lines.append("")
        
        # Table of Contents
        md_lines.append("## Table of Contents")
        md_lines.append("")
        
        sections = set()
        for item in self.content:
            if item['type'] == 'heading' and item.get('section'):
                sections.add(item.get('section'))
        
        for i, section in enumerate(sorted(sections), 1):
            anchor = section.lower().replace(' ', '-').replace('/', '')
            md_lines.append(f"{i}. [{section}](#{anchor})")
        md_lines.append("")
        
        # Content
        current_section = None
        for item in self.content:
            if item['type'] == 'heading':
                current_section = item['text']
                md_lines.append(f"## {item['text']}")
                md_lines.append("")
            
            elif item['type'] == 'paragraph':
                if item['text'].strip():
                    md_lines.append(item['text'])
                md_lines.append("")
            
            elif item['type'] == 'table':
                md_lines.extend(self.table_to_markdown(item['data']))
                md_lines.append("")
        
        # Diagrams section
        if self.diagrams:
            md_lines.append("## Diagrams and Architecture")
            md_lines.append("")
            
            for idx, diagram in enumerate(self.diagrams, 1):
                md_lines.append(f"### {diagram['type'].replace('_', ' ').title()} #{idx}")
                md_lines.append(f"*Page {diagram['page']}, Section: {diagram['section']}*")
                md_lines.append("")
                md_lines.append(self.generate_diagram_placeholder(diagram))
                md_lines.append("")
        
        # Footer
        md_lines.append("---")
        md_lines.append(f"**Generated from:** `{self.pdf_path.name}`")
        md_lines.append(f"**Generated on:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        md_lines.append("")
        md_lines.append("> **Note:** Diagrams are placeholders generated from text detection.")
        md_lines.append("> Please review the original PDF for precise technical specifications.")
        
        return '\n'.join(md_lines)
    
    @staticmethod
    def table_to_markdown(table):
        """Convert extracted table to markdown format"""
        lines = []
        if not table:
            return lines
        
        # Header
        header = table[0]
        lines.append("| " + " | ".join(str(cell or "").strip() for cell in header) + " |")
        lines.append("|" + "|".join(["---" for _ in header]) + "|")
        
        # Rows
        for row in table[1:]:
            lines.append("| " + " | ".join(str(cell or "").strip() for cell in row) + " |")
        
        return lines
    
    def convert(self):
        """Run full conversion process"""
        print(f"📖 Converting PDF: {self.pdf_path}")
        
        print("  → Extracting metadata...")
        self.extract_metadata()
        
        print("  → Extracting text and tables...")
        self.extract_text()
        
        print("  → Detecting diagram types...")
        self.detect_diagram_types()
        
        print("  → Generating markdown...")
        markdown_content = self.generate_markdown()
        
        # Save markdown
        output_file = self.output_dir / f"{self.pdf_path.stem}.md"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        
        print(f"✅ Success! Created: {output_file}")
        
        # Save metadata
        metadata_file = self.output_dir / f"{self.pdf_path.stem}_metadata.json"
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump({
                'source': str(self.pdf_path),
                'metadata': self.metadata,
                'diagrams_detected': self.diagrams,
                'conversion_date': datetime.now().isoformat()
            }, f, indent=2)
        
        print(f"📊 Metadata: {metadata_file}")
        
        return output_file, metadata_file


def main():
    parser = argparse.ArgumentParser(description='Convert PDF datasheet to Markdown with Mermaid diagrams')
    parser.add_argument('pdf_file', help='Path to PDF file')
    parser.add_argument('-o', '--output', help='Output directory', default=None)
    
    args = parser.parse_args()
    
    if not os.path.exists(args.pdf_file):
        print(f"❌ Error: File not found: {args.pdf_file}")
        sys.exit(1)
    
    converter = PDFToMarkdownConverter(args.pdf_file, args.output)
    md_file, meta_file = converter.convert()
    
    print(f"\n📋 Summary:")
    print(f"   Pages: {converter.metadata['pages']}")
    print(f"   Sections: {len(set(item.get('section') for item in converter.content))}")
    print(f"   Diagrams detected: {len(converter.diagrams)}")
    print(f"\n✨ Conversion complete!")


if __name__ == '__main__':
    main()
