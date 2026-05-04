import {
  buildStoredZip,
  encodeUtf16BeWithBom,
  encodeUtf16LeWithBom,
  encodeUtf8,
  makeJpegBytes,
  makePdfBytes,
  makePngBytes,
  makeSqliteBytes,
  makeWasmBytes,
  makeWavBytes,
  makeWindowsExeBytes,
} from './fixtureBuilders'

export type FileTypeFixtureSample = Readonly<{
  id: string
  filename: string
  mime: string | null
  bytes: Uint8Array
  notes?: string
}>

const plainText = encodeUtf8('hello starverse\n')
const utf16leText = encodeUtf16LeWithBom('hello utf16le')
const utf16beText = encodeUtf16BeWithBom('hello utf16be')
const jsonText = encodeUtf8('{"ok":true,"count":2}\n')
const jsonlText = encodeUtf8('{"row":1}\n{"row":2}\n')
const csvText = encodeUtf8('name,age\nalice,30\nbob,20\n')
const tsvText = encodeUtf8('name\tage\nalice\t30\n')
const markdownText = encodeUtf8('# Title\n\n- item\n')
const htmlScript = encodeUtf8('<!doctype html><html><body><script>console.log(1)</script></body></html>')
const svgScript = encodeUtf8('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
const xmlXxeMarker = encodeUtf8('<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>')

const zipGeneric = buildStoredZip([
  { name: 'README.txt', data: encodeUtf8('zip fixture') },
])
const fakeDocxMissingContentTypes = buildStoredZip([
  { name: 'word/document.xml', data: encodeUtf8('<w:document/>') },
])
const docxMinimal = buildStoredZip([
  { name: '[Content_Types].xml', data: encodeUtf8('<Types/>') },
  { name: 'word/document.xml', data: encodeUtf8('<w:document/>') },
])
const docmMacro = buildStoredZip([
  { name: '[Content_Types].xml', data: encodeUtf8('<Types/>') },
  { name: 'word/document.xml', data: encodeUtf8('<w:document/>') },
  { name: 'word/vbaProject.bin', data: Uint8Array.from([1, 2, 3]) },
])
const xlsxMinimal = buildStoredZip([
  { name: '[Content_Types].xml', data: encodeUtf8('<Types/>') },
  { name: 'xl/workbook.xml', data: encodeUtf8('<workbook/>') },
])
const pptxMinimal = buildStoredZip([
  { name: '[Content_Types].xml', data: encodeUtf8('<Types/>') },
  { name: 'ppt/presentation.xml', data: encodeUtf8('<p:presentation/>') },
])
const epubMinimal = buildStoredZip([
  { name: 'mimetype', data: encodeUtf8('application/epub+zip') },
  { name: 'META-INF/container.xml', data: encodeUtf8('<container/>') },
])
const apkMinimal = buildStoredZip([
  { name: 'AndroidManifest.xml', data: encodeUtf8('<manifest/>') },
  { name: 'classes.dex', data: Uint8Array.from([0x64, 0x65, 0x78, 0x0a]) },
])
const zipSlipArchive = buildStoredZip([
  { name: '../evil.txt', data: encodeUtf8('x') },
  { name: 'safe.txt', data: encodeUtf8('ok') },
])
const duplicateEntryZip = buildStoredZip([
  { name: 'dup.txt', data: encodeUtf8('a') },
  { name: 'dup.txt', data: encodeUtf8('b') },
])

const exeRenamedAsPdf = makeWindowsExeBytes()
const pdfRenamedAsTxt = makePdfBytes('mismatch')
const unknownBinary = Uint8Array.from([0x01, 0x00, 0x02, 0xff, 0x13, 0x37, 0x00, 0x99])

export const STAGE_I_FIXTURE_SAMPLES: readonly FileTypeFixtureSample[] = [
  { id: 'plain_text', filename: 'note.txt', mime: 'text/plain', bytes: plainText },
  { id: 'utf8_text', filename: 'utf8.txt', mime: 'text/plain', bytes: plainText },
  { id: 'utf16le_text', filename: 'utf16le.txt', mime: 'text/plain', bytes: utf16leText },
  { id: 'utf16be_text', filename: 'utf16be.txt', mime: 'text/plain', bytes: utf16beText },
  { id: 'json', filename: 'data.json', mime: 'application/json', bytes: jsonText },
  { id: 'jsonl', filename: 'rows.jsonl', mime: 'application/x-ndjson', bytes: jsonlText },
  { id: 'csv', filename: 'table.csv', mime: 'text/csv', bytes: csvText },
  { id: 'tsv', filename: 'table.tsv', mime: 'text/tab-separated-values', bytes: tsvText },
  { id: 'markdown', filename: 'doc.md', mime: 'text/markdown', bytes: markdownText },
  { id: 'html_with_script', filename: 'page.html', mime: 'text/html', bytes: htmlScript },
  { id: 'svg_with_script', filename: 'vector.svg', mime: 'image/svg+xml', bytes: svgScript },
  { id: 'xml_external_entity_marker', filename: 'payload.xml', mime: 'application/xml', bytes: xmlXxeMarker },
  { id: 'pdf', filename: 'report.pdf', mime: 'application/pdf', bytes: makePdfBytes('fixture') },
  { id: 'png', filename: 'image.png', mime: 'image/png', bytes: makePngBytes() },
  { id: 'jpeg', filename: 'photo.jpg', mime: 'image/jpeg', bytes: makeJpegBytes() },
  { id: 'wav', filename: 'audio.wav', mime: 'audio/wav', bytes: makeWavBytes() },
  { id: 'sqlite', filename: 'db.sqlite', mime: 'application/vnd.sqlite3', bytes: makeSqliteBytes() },
  { id: 'wasm', filename: 'module.wasm', mime: 'application/wasm', bytes: makeWasmBytes() },
  { id: 'zip', filename: 'archive.zip', mime: 'application/zip', bytes: zipGeneric },
  { id: 'fake_docx_missing_content_types', filename: 'fake.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: fakeDocxMissingContentTypes },
  { id: 'docx_minimal', filename: 'real.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: docxMinimal },
  { id: 'docm_macro_marker', filename: 'macro.docm', mime: 'application/vnd.ms-word.document.macroenabled.12', bytes: docmMacro },
  { id: 'xlsx_minimal', filename: 'sheet.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: xlsxMinimal },
  { id: 'pptx_minimal', filename: 'deck.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: pptxMinimal },
  { id: 'epub_minimal', filename: 'book.epub', mime: 'application/epub+zip', bytes: epubMinimal },
  { id: 'apk_minimal', filename: 'mobile.apk', mime: 'application/vnd.android.package-archive', bytes: apkMinimal },
  { id: 'zip_slip_archive', filename: 'slip.zip', mime: 'application/zip', bytes: zipSlipArchive },
  { id: 'duplicate_entry_zip', filename: 'dup.zip', mime: 'application/zip', bytes: duplicateEntryZip },
  { id: 'exe_renamed_as_pdf', filename: 'evil.pdf', mime: 'application/pdf', bytes: exeRenamedAsPdf },
  { id: 'pdf_renamed_as_txt', filename: 'confused.txt', mime: 'text/plain', bytes: pdfRenamedAsTxt },
  { id: 'unknown_binary', filename: 'blob.bin', mime: 'application/octet-stream', bytes: unknownBinary },
] as const
