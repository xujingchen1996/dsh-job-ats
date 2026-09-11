// dsh-job-ats export engine: markdown-lite resume → themed DOCX / HTML.
// PDF is produced by the caller (lib/index.js) via headless Chrome from the
// themed HTML, so both formats share one visual identity per theme.

import { zipSync, strToU8 } from "fflate"

export const THEMES = {
  minimal: {
    id: "minimal",
    label: "简洁",
    desc: "黑白灰、留白多，最稳妥的默认风格",
    fontAscii: "Inter",
    fontEast: "PingFang SC",
    headingColor: "1a1a1a",
    accent: "444444",
    bodyColor: "222222",
    h1Size: 22,
    h2Size: 14,
    bodySize: 10.5,
    lineSpacing: 1.45,
    pageMarginMm: 18,
    headingRule: false,
  },
  modern: {
    id: "modern",
    label: "现代",
    desc: "蓝色点缀、清爽有科技感，适合互联网岗位",
    fontAscii: "SF Pro Display",
    fontEast: "PingFang SC",
    headingColor: "1d4ed8",
    accent: "2563eb",
    bodyColor: "1f2937",
    h1Size: 23,
    h2Size: 14,
    bodySize: 10.5,
    lineSpacing: 1.45,
    pageMarginMm: 18,
    headingRule: true,
  },
  classic: {
    id: "classic",
    label: "经典",
    desc: "衬线宋体、传统稳重，适合国企/传统行业",
    fontAscii: "Georgia",
    fontEast: "Songti SC",
    headingColor: "333333",
    accent: "8a6d3b",
    bodyColor: "1a1a1a",
    h1Size: 22,
    h2Size: 14.5,
    bodySize: 11,
    lineSpacing: 1.5,
    pageMarginMm: 20,
    headingRule: false,
  },
  compact: {
    id: "compact",
    label: "紧凑",
    desc: "行距字号偏小，一页塞下更多内容",
    fontAscii: "Helvetica Neue",
    fontEast: "PingFang SC",
    headingColor: "111111",
    accent: "333333",
    bodyColor: "1f1f1f",
    h1Size: 20,
    h2Size: 13,
    bodySize: 9.5,
    lineSpacing: 1.25,
    pageMarginMm: 14,
    headingRule: false,
  },
  academic: {
    id: "academic",
    label: "学术",
    desc: "深绿标题、疏朗版式，适合研究/技术岗",
    fontAscii: "Palatino",
    fontEast: "Songti SC",
    headingColor: "14532d",
    accent: "166534",
    bodyColor: "1f2937",
    h1Size: 22,
    h2Size: 14,
    bodySize: 10.5,
    lineSpacing: 1.5,
    pageMarginMm: 20,
    headingRule: true,
  },
}

const DPI = 96
const PX_PER_PT = 96 / 72

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

// ── markdown-lite parsing ──────────────────────────────────────────────────

function parseInline(text) {
  const runs = []
  const pattern = /(\*\*[^*]+\*\*)/g
  let last = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), bold: false })
    runs.push({ text: match[1].slice(2, -2), bold: true })
    last = match.index + match[1].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false })
  return runs.length ? runs : [{ text: "", bold: false }]
}

/**
 * Parse a resume in markdown-lite form into export blocks:
 *   # title → h1 ; ## x → h2 ; - x → li ; blank → spacer ; else → p
 */
export function mdParse(markdown) {
  const blocks = []
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n")
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^#\s+/.test(line)) {
      blocks.push({ type: "h1", text: line.replace(/^#\s+/, "").trim() })
    } else if (/^##\s+/.test(line)) {
      blocks.push({ type: "h2", text: line.replace(/^##\s+/, "").trim() })
    } else if (/^###\s+/.test(line)) {
      blocks.push({ type: "h2", text: line.replace(/^###\s+/, "").trim() })
    } else if (/^[-*•]\s+/.test(line)) {
      blocks.push({ type: "li", text: line.replace(/^[-*•]\s+/, "") })
    } else if (line.trim().length === 0) {
      const prev = blocks[blocks.length - 1]
      if (prev && prev.type !== "spacer") blocks.push({ type: "spacer", text: "" })
    } else {
      blocks.push({ type: "p", text: line.trim() })
    }
  }
  return blocks
}

// ── DOCX (OOXML via fflate) ────────────────────────────────────────────────

function ptToTwips(pt) {
  return Math.round(pt * 20)
}

function runsXml(runs, theme, sizePt, color) {
  return runs
    .map((run) => {
      const props = [
        `<w:rFonts w:ascii="${escapeXml(theme.fontAscii)}" w:hAnsi="${escapeXml(theme.fontAscii)}" w:eastAsia="${escapeXml(theme.fontEast)}"/>`,
        run.bold ? "<w:b/>" : "",
        `<w:color w:val="${color}"/>`,
        `<w:sz w:val="${ptToTwips(sizePt)}"/>`,
        `<w:szCs w:val="${ptToTwips(sizePt)}"/>`,
      ].join("")
      return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`
    })
    .join("")
}

function paragraphXml(block, theme) {
  const spacing = `<w:spacing w:before="${theme.type === "compact" ? 40 : 80}" w:after="${theme.type === "compact" ? 40 : 80}" w:line="${Math.round(theme.lineSpacing * 240)}" w:lineRule="auto"/>`
  if (block.type === "spacer") {
    return `<w:p><w:pPr>${spacing}</w:pPr></w:p>`
  }
  if (block.type === "h1") {
    return `<w:p><w:pPr>${spacing}<w:jc w:val="center"/></w:pPr>${runsXml(parseInline(block.text), theme, theme.h1Size, theme.headingColor)}</w:p>`
  }
  if (block.type === "h2") {
    const border = theme.headingRule
      ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${theme.accent}"/></w:pBdr>`
      : ""
    return `<w:p><w:pPr>${spacing}${border}</w:pPr>${runsXml(parseInline(block.text), theme, theme.h2Size, theme.headingColor)}</w:p>`
  }
  if (block.type === "li") {
    const indent = `<w:ind w:left="420" w:hanging="210"/>`
    return `<w:p><w:pPr>${spacing}${indent}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="${escapeXml(theme.fontAscii)}" w:eastAsia="${escapeXml(theme.fontEast)}"/><w:color w:val="${theme.accent}"/><w:sz w:val="${ptToTwips(theme.bodySize)}"/></w:rPr><w:t xml:space="preserve">•  </w:t></w:r>${runsXml(parseInline(block.text), theme, theme.bodySize, theme.bodyColor)}</w:p>`
  }
  return `<w:p><w:pPr>${spacing}</w:pPr>${runsXml(parseInline(block.text), theme, theme.bodySize, theme.bodyColor)}</w:p>`
}

const A4_TWIPS = { w: 11906, h: 16838 }

export function buildDocx(markdown, meta, theme, extraMarkdown) {
  const blocks = mdParse(markdown)
  const extraBlocks = typeof extraMarkdown === "string" && extraMarkdown.trim().length > 0 ? mdParse(extraMarkdown) : []
  const pageBreak = extraBlocks.length > 0
    ? `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
    : ""
  const body = blocks.map((block) => paragraphXml(block, theme)).join("") +
    pageBreak +
    extraBlocks.map((block) => paragraphXml(block, theme)).join("")
  const marginTwips = Math.round(((theme.pageMarginMm || 18) / 25.4) * 1440)
  const title = String((meta && meta.title) || "简历").slice(0, 200)
  const created = new Date().toISOString()

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${escapeXml(theme.fontAscii)}" w:hAnsi="${escapeXml(theme.fontAscii)}" w:eastAsia="${escapeXml(theme.fontEast)}"/><w:sz w:val="${ptToTwips(theme.bodySize)}"/><w:szCs w:val="${ptToTwips(theme.bodySize)}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="${Math.round(theme.lineSpacing * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${body}
<w:sectPr><w:pgSz w:w="${A4_TWIPS.w}" w:h="${A4_TWIPS.h}"/><w:pgMar w:top="${marginTwips}" w:right="${marginTwips}" w:bottom="${marginTwips}" w:left="${marginTwips}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escapeXml(title)}</dc:title><dc:creator>dsh-job-ats</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
</cp:coreProperties>`

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>dsh-job-ats</Application></Properties>`

  const files = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "word/document.xml": strToU8(document),
    "word/_rels/document.xml.rels": strToU8(docRels),
    "word/styles.xml": strToU8(styles),
    "docProps/core.xml": strToU8(core),
    "docProps/app.xml": strToU8(app),
  }
  return zipSync(files, { level: 6 })
}

// ── themed HTML (also the PDF print source) ────────────────────────────────

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function inlineHtml(text) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? `<strong>${escapeHtml(part.slice(2, -2))}</strong>` : escapeHtml(part)))
    .join("")
}

export function buildHtml(markdown, meta, theme, extraMarkdown) {
  const blocks = mdParse(markdown)
  const extraBlocks = typeof extraMarkdown === "string" && extraMarkdown.trim().length > 0 ? mdParse(extraMarkdown) : []
  const title = String((meta && meta.title) || "简历")
  const renderBlocks = (list) => list
    .map((block) => {
      if (block.type === "spacer") return `<div class="spacer"></div>`
      if (block.type === "h1") return `<h1>${inlineHtml(block.text)}</h1>`
      if (block.type === "h2") return `<h2>${inlineHtml(block.text)}</h2>`
      if (block.type === "li") return `<div class="li"><span class="bullet">•</span><span>${inlineHtml(block.text)}</span></div>`
      return `<p>${inlineHtml(block.text)}</p>`
    })
    .join("\n")
  const bodyHtml = renderBlocks(blocks) +
    (extraBlocks.length > 0 ? `\n<div class="page-break"></div>\n` + renderBlocks(extraBlocks) : "")

  const mm = theme.pageMarginMm || 18
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: ${mm}mm; }
  :root {
    --accent: #${theme.accent};
    --heading: #${theme.headingColor};
    --body: #${theme.bodyColor};
    --font: "${theme.fontAscii}", "${theme.fontEast}", "Microsoft YaHei", sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: var(--font);
    color: var(--body);
    font-size: ${theme.bodySize}pt;
    line-height: ${theme.lineSpacing};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: 210mm; margin: 0 auto; padding: ${mm}mm ${mm}mm 8mm; }
  h1 {
    font-size: ${theme.h1Size}pt;
    color: var(--heading);
    text-align: center;
    margin: 0 0 14pt;
    letter-spacing: .5px;
  }
  h2 {
    font-size: ${theme.h2Size}pt;
    color: var(--heading);
    margin: 16pt 0 6pt;
    padding-bottom: 3pt;
    ${theme.headingRule ? `border-bottom: 1.2pt solid var(--accent);` : `border-bottom: .6pt solid color-mix(in srgb, var(--heading) 25%, transparent);`}
  }
  p { margin: 0 0 4pt; text-align: justify; }
  .li { display: flex; gap: 6pt; margin: 0 0 2pt; }
  .bullet { color: var(--accent); flex: none; }
  .spacer { height: 4pt; }
  .page-break { page-break-before: always; break-before: page; height: 0; margin: 0; }
  strong { color: inherit; }
  .toolbar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; }
  .toolbar button {
    font-family: var(--font); font-size: 12px; padding: 6px 14px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--heading) 30%, transparent);
    background: #fff; color: var(--body); cursor: pointer;
  }
  .toolbar button:hover { border-color: var(--accent); color: var(--accent); }
  @media print { .toolbar { display: none; } }
</style>
</head>
<body>
<div class="page">${bodyHtml}</div>
<div class="toolbar">
  <button onclick="window.print()">打印 / 另存为 PDF</button>
</div>
</body>
</html>`
}
