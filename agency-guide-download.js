/**
 * agency-guide-download.js
 * Maverick Administrators — Whillock Portal
 *
 * Dynamically injects the agency's ID into the Agency Guide PDF before download.
 * Uses pdf-lib (loaded via CDN) — no server required, works on GitHub Pages.
 *
 * HOW TO INTEGRATE
 * ────────────────
 * 1. Upload your broker's PDF as "agency-guide.pdf" in your GitHub repo root
 *    (the same file you already have there).
 *
 * 2. Add pdf-lib to your page's <head> (if not already present):
 *      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
 *
 * 3. Add this script anywhere after pdf-lib:
 *      <script src="agency-guide-download.js"></script>
 *
 * 4. Find your existing Download PDF anchor tag and replace it with:
 *      <a id="download-agency-guide" href="#" onclick="downloadAgencyGuide(event)">Download PDF</a>
 *
 *    Or if it's a button:
 *      <button id="download-agency-guide" onclick="downloadAgencyGuide(event)">Download PDF</button>
 *
 * 5. Make sure your agency-code lookup already sets a value the script can read.
 *    By default this script reads:
 *      - The element with id="agency-code-value"  ← the element that shows the code on screen
 *    If your site uses a different id or variable, update AGENCY_CODE_SELECTOR below.
 *
 * CONFIGURATION
 * ─────────────
 */

const AGENCY_GUIDE_CONFIG = {
  // Path to the PDF file (relative to the page, same as your current href)
  pdfPath: "agency-guide.pdf",

  // CSS selector for the element that displays the resolved agency code on screen.
  // Inspect your page and update this if needed.
  agencyCodeSelector: "#agency-code",  // <span class="code-pill" id="agency-code">ABC-123</span>

  // CSS selector for the element that displays the resolved agency name on screen.
  // Used for the downloaded filename (not the PDF content).
  agencyNameSelector: "#greeting-name",  // <span class="greeting-name" id="greeting-name">Happy Beginnings Surrogacy</span>

  // Fallback: JS variable name that holds the agency code (used if selector finds nothing).
  // Set to null to disable. Disabled here: the page's `agencyCode` identifier is a DOM
  // element reference, not the code string, so the selector above is authoritative.
  agencyCodeVariable: null,

  // Exact placeholder string in the PDF that will be replaced
  placeholder: "[YOUR AGENCY ID]",

  // PDF coordinates of the placeholder (pdf-lib uses bottom-left origin)
  // Page 3 (index 2), position derived from document analysis
  page: 2,           // 0-indexed
  x: 278.69,         // left edge of placeholder text
  y: 676.54,         // baseline in PDF coordinates (bottom-left origin)

  // Typography — must match the surrounding text in the PDF
  fontSize: 11,
  // Coral/salmon color matching the existing bold text: rgb(0.831, 0.353, 0.271)
  color: { r: 0.831, g: 0.353, b: 0.271 },
};

/**
 * Main entry point — called by onclick on your Download link/button.
 */
async function downloadAgencyGuide(event) {
  if (event) event.preventDefault();

  const agencyId = resolveAgencyCode();

  if (!agencyId) {
    alert("Agency code not found. Please search for your agency first.");
    return;
  }

  // Show a loading state on the trigger element
  const trigger = event && event.currentTarget;
  const originalText = trigger ? trigger.textContent : null;
  if (trigger) trigger.textContent = "Preparing PDF…";

  try {
    const pdfBytes = await buildPersonalizedPdf(agencyId);
    const agencyName = resolveAgencyName();
    const fileLabel = agencyName || agencyId; // fall back to code if name not found
    triggerDownload(pdfBytes, `Newborn_Insurance_Agency_Guide_${sanitizeFilename(fileLabel)}.pdf`);
  } catch (err) {
    console.error("Agency Guide PDF generation failed:", err);
    alert("Sorry, there was a problem generating the PDF. Please try again or contact Maverick Administrators.");
  } finally {
    if (trigger && originalText) trigger.textContent = originalText;
  }
}

/**
 * Fetches the base PDF, overlays the agency ID, and returns the modified bytes.
 */
async function buildPersonalizedPdf(agencyId) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const cfg = AGENCY_GUIDE_CONFIG;

  // Fetch the base PDF
  const response = await fetch(cfg.pdfPath);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  const existingPdfBytes = await response.arrayBuffer();

  // Load with pdf-lib
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  const page = pages[cfg.page];

  // pdf-lib cannot embed arbitrary OTF/TTF subset fonts from the existing PDF,
  // so we use Helvetica-Bold (a standard PDF font) which closely matches Calibri Bold.
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Cover the placeholder with a white rectangle first, then draw the real value.
  // This ensures the placeholder text is fully hidden even if pdf-lib draws over it.
  const placeholderWidth = 90; // wide enough to cover "[YOUR AGENCY ID]"
  const textHeight = cfg.fontSize + 1;

  page.drawRectangle({
    x: cfg.x - 1,
    y: cfg.y - 2,
    width: placeholderWidth,
    height: textHeight,
    color: rgb(1, 1, 1), // white
    opacity: 1,
  });

  // Draw the agency ID in the same coral color and similar weight
  page.drawText(agencyId, {
    x: cfg.x,
    y: cfg.y,
    size: cfg.fontSize,
    font,
    color: rgb(cfg.color.r, cfg.color.g, cfg.color.b),
  });

  return await pdfDoc.save();
}

/**
 * Resolves the agency code from the page — tries the DOM selector first,
 * then falls back to a global JS variable.
 */
function resolveAgencyCode() {
  const cfg = AGENCY_GUIDE_CONFIG;

  // Try DOM selector
  if (cfg.agencyCodeSelector) {
    const el = document.querySelector(cfg.agencyCodeSelector);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }

  // Try global variable
  if (cfg.agencyCodeVariable && window[cfg.agencyCodeVariable]) {
    return String(window[cfg.agencyCodeVariable]).trim();
  }

  return null;
}

/**
 * Resolves the agency name from the page via the DOM selector.
 * Used for the downloaded filename; returns null if not found.
 */
function resolveAgencyName() {
  const cfg = AGENCY_GUIDE_CONFIG;

  if (cfg.agencyNameSelector) {
    const el = document.querySelector(cfg.agencyNameSelector);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }

  return null;
}

/**
 * Triggers a browser file download from raw bytes.
 */
function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Strips characters unsafe for filenames.
 */
function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_\-]/g, "_");
}
