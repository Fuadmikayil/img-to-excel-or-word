"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

type FilterMode = "original" | "grayscale" | "bw" | "contrast";
type ExportKind = "word" | "excel" | "pdf" | "jpeg" | "txt";

type ScanItem = {
  id: string;
  name: string;
  createdAt: string;
  tags: string[];
  text: string;
  mimeType: string;
  sizeKB: string;
  width: number;
  height: number;
  imageDataUrl: string;
  accessCode?: string;
};

const OCR_LANGUAGE_PRESETS: { label: string; value: string }[] = [
  { label: "English", value: "eng" },
  { label: "Latin + Cyrillic", value: "eng+rus+aze" },
  { label: "Chinese + Japanese + Korean", value: "chi_sim+jpn+kor+eng" },
  { label: "Multilingual (broad)", value: "eng+rus+chi_sim+jpn+kor+aze" },
];

const STORAGE_KEY = "scanner_library_v1";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function stripExtension(name: string) {
  return name.replace(/\.[^/.]+$/, "");
}

async function getImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

async function applyImageFilter(dataUrl: string, mode: FilterMode) {
  if (mode === "original") return dataUrl;

  const img = new window.Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to process image"));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  if (mode === "grayscale") {
    ctx.filter = "grayscale(100%)";
  } else if (mode === "contrast") {
    ctx.filter = "contrast(170%) brightness(110%)";
  } else {
    ctx.filter = "grayscale(100%) contrast(250%)";
  }

  ctx.drawImage(img, 0, 0);

  if (mode === "bw") {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const v = avg > 145 ? 255 : 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [filteredImage, setFilteredImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrLanguage, setOcrLanguage] = useState("eng");
  const [filterMode, setFilterMode] = useState<FilterMode>("original");
  const [metadata, setMetadata] = useState<ScanItem | null>(null);

  const [tagInput, setTagInput] = useState("");
  const [annotationTextBox, setAnnotationTextBox] = useState("");
  const [highlightKeyword, setHighlightKeyword] = useState("");
  const [signature, setSignature] = useState("");
  const [accessCode, setAccessCode] = useState("");

  const [library, setLibrary] = useState<ScanItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as ScanItem[];
      setLibrary(parsed);
    } catch {
      setLibrary([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    if (!image) {
      setFilteredImage(null);
      return;
    }

    void (async () => {
      const next = await applyImageFilter(image, filterMode);
      setFilteredImage(next);
    })();
  }, [image, filterMode]);

  const visibleLibrary = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return library;
    return library.filter((doc) => {
      const hay = `${doc.name} ${doc.tags.join(" ")} ${doc.text}`.toLowerCase();
      return hay.includes(q);
    });
  }, [library, searchQuery]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    setSelectedFile(file);
    setIsDone(false);
    setOcrText("");

    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setImage(dataUrl);

      try {
        const dims = await getImageDimensions(dataUrl);
        setMetadata({
          id: crypto.randomUUID(),
          name: stripExtension(file.name),
          createdAt: new Date().toLocaleString(),
          tags: [],
          text: "",
          mimeType: file.type || "unknown",
          sizeKB: (file.size / 1024).toFixed(2),
          width: dims.width,
          height: dims.height,
          imageDataUrl: dataUrl,
          accessCode: accessCode.trim() || undefined,
        });
      } catch {
        setMetadata({
          id: crypto.randomUUID(),
          name: stripExtension(file.name),
          createdAt: new Date().toLocaleString(),
          tags: [],
          text: "",
          mimeType: file.type || "unknown",
          sizeKB: (file.size / 1024).toFixed(2),
          width: 0,
          height: 0,
          imageDataUrl: dataUrl,
          accessCode: accessCode.trim() || undefined,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const runOcr = async () => {
    if (!filteredImage || !metadata) {
      alert("Add an image first.");
      return "";
    }

    setIsProcessing(true);
    try {
      const result = await Tesseract.recognize(filteredImage, ocrLanguage);
      const text = result.data.text.trim() || "No readable text found in the image.";
      setOcrText(text);
      return text;
    } catch {
      alert("OCR failed. Try another image or language preset.");
      return "";
    } finally {
      setIsProcessing(false);
    }
  };

  const applyAnnotations = (baseText: string) => {
    let text = baseText || "No readable text found in the image.";

    if (highlightKeyword.trim()) {
      const escaped = highlightKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(${escaped})`, "gi");
      text = text.replace(re, "[[HIGHLIGHT:$1]]");
    }

    if (annotationTextBox.trim()) {
      text += `\n\n[ANNOTATION]\n${annotationTextBox.trim()}`;
    }

    if (signature.trim()) {
      text += `\n\n[SIGNATURE]\n${signature.trim()}`;
    }

    return text;
  };

  const saveToLibrary = (text: string) => {
    if (!metadata || !filteredImage) return;

    const tags = tagInput
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const item: ScanItem = {
      ...metadata,
      text,
      tags,
      imageDataUrl: filteredImage,
      accessCode: accessCode.trim() || undefined,
    };

    setLibrary((prev) => [item, ...prev]);
  };

  const exportWord = async (text: string) => {
    if (!metadata) return;

    const lines = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ text: "Scanned Document", heading: HeadingLevel.TITLE }),
            new Paragraph({ text: "Extracted Text", heading: HeadingLevel.HEADING_1 }),
            ...(lines.length
              ? lines.map((line) => new Paragraph({ children: [new TextRun(line)] }))
              : [new Paragraph("No readable text found in the image.")]),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Image Metadata", heading: HeadingLevel.HEADING_1 }),
            new Paragraph(`Name: ${metadata.name}`),
            new Paragraph(`MIME Type: ${metadata.mimeType}`),
            new Paragraph(`Size: ${metadata.sizeKB} KB`),
            new Paragraph(`Dimensions: ${metadata.width} x ${metadata.height}`),
            new Paragraph(`Scanned At: ${metadata.createdAt}`),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Image Description", heading: HeadingLevel.HEADING_1 }),
            new Paragraph(
              lines.length > 8
                ? `Document-like scan with ${lines.length} detected lines.`
                : `Short-form scan with ${lines.length} detected lines.`
            ),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${metadata.name || "scan"}.docx`);
  };

  const exportExcel = (text: string) => {
    if (!metadata) return;

    const rows = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => ({ Index: i + 1, Text: line }));

    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Index: "", Text: "No readable text found." }]);
    ws["!cols"] = [{ wch: 10 }, { wch: 80 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extracted Text");
    XLSX.writeFile(wb, `${metadata.name || "scan"}.xlsx`);
  };

  const exportPdf = async (text: string) => {
    if (!metadata || !filteredImage) return;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    page.drawText("Scanned Document", {
      x: 40,
      y: 800,
      size: 18,
      font,
      color: rgb(0.1, 0.2, 0.4),
    });

    page.drawText(`Name: ${metadata.name}`, { x: 40, y: 775, size: 10, font });
    page.drawText(`Type: ${metadata.mimeType} | Size: ${metadata.sizeKB} KB`, { x: 40, y: 760, size: 10, font });

    const lines = text.split("\n").slice(0, 38);
    let y = 735;
    for (const line of lines) {
      page.drawText(line || " ", { x: 40, y, size: 10, font });
      y -= 16;
    }

    if (accessCode.trim()) {
      page.drawText(`Access code set for app: ${accessCode.trim()}`, { x: 40, y: 90, size: 9, font });
      page.drawText("Note: Browser PDF export does not apply true file encryption in this implementation.", {
        x: 40,
        y: 75,
        size: 8,
        font,
      });
    }

    const bytes = await pdf.save();
    const safeBytes = new Uint8Array(bytes.length);
    safeBytes.set(bytes);
    downloadBlob(new Blob([safeBytes], { type: "application/pdf" }), `${metadata.name || "scan"}.pdf`);
  };

  const exportJpeg = async () => {
    if (!metadata || !filteredImage) return;

    const blob = await (await fetch(filteredImage)).blob();
    downloadBlob(blob, `${metadata.name || "scan"}.jpeg`);
  };

  const exportTxt = (text: string) => {
    if (!metadata) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${metadata.name || "scan"}.txt`);
  };

  const handleExport = async (kind: ExportKind) => {
    if (!metadata) {
      alert("Please upload a document first.");
      return;
    }

    const rawText = ocrText || (await runOcr());
    if (!rawText) return;

    const text = applyAnnotations(rawText);
    saveToLibrary(text);

    if (kind === "word") await exportWord(text);
    if (kind === "excel") exportExcel(text);
    if (kind === "pdf") await exportPdf(text);
    if (kind === "jpeg") await exportJpeg();
    if (kind === "txt") exportTxt(text);

    setIsDone(true);
  };

  const handleTakePicture = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      cameraInputRef.current?.click();
    } catch {
      alert("Camera permission is required to take a picture.");
    }
  };

  const handleReset = () => {
    setImage(null);
    setFilteredImage(null);
    setSelectedFile(null);
    setMetadata(null);
    setOcrText("");
    setIsDone(false);
  };

  const shareScan = async (item: ScanItem) => {
    const shareText = `Scanned document: ${item.name}\nTags: ${item.tags.join(", ")}\nExtract: ${item.text.slice(0, 300)}...`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: item.name,
          text: shareText,
        });
        return;
      } catch {
        // fallback below
      }
    }

    const mailto = `mailto:?subject=${encodeURIComponent(item.name)}&body=${encodeURIComponent(shareText)}`;
    window.open(mailto, "_blank");
  };

  const openDocument = (item: ScanItem) => {
    if (item.accessCode) {
      const entered = window.prompt("Enter document access code");
      if (entered !== item.accessCode) {
        alert("Access code is incorrect.");
        return;
      }
    }

    setImage(item.imageDataUrl);
    setFilteredImage(item.imageDataUrl);
    setOcrText(item.text);
    setMetadata(item);
    setIsDone(false);
    setTagInput(item.tags.join(", "));
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 via-cyan-50 to-indigo-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl bg-white shadow-xl overflow-hidden border border-slate-200">
          <div className="bg-linear-to-r from-cyan-600 via-blue-600 to-indigo-600 px-6 py-5 text-white">
            <h1 className="text-2xl font-bold">Document Scanner & Text Recognition</h1>
            <p className="text-sm text-cyan-100 mt-1">
              OCR over 183 language packs via Tesseract, with export to PDF, JPEG, Word, Excel, and TXT.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {!image && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleTakePicture}
                  className="rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5 text-left hover:bg-blue-100 transition"
                >
                  <p className="text-sm font-bold text-blue-700">Take Photo</p>
                  <p className="text-xs text-blue-500 mt-1">Capture from your phone camera</p>
                </button>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-5 text-left hover:bg-emerald-100 transition"
                >
                  <p className="text-sm font-bold text-emerald-700">Upload Image</p>
                  <p className="text-xs text-emerald-500 mt-1">Receipts, cards, books, handwritten notes</p>
                </button>
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageChange}
              className="hidden"
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />

            {image && (
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between bg-slate-50 border-b border-slate-200 px-4 py-2">
                  <p className="text-xs text-slate-600 font-medium truncate">{metadata?.name || "Current scan"}</p>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-xs text-red-500 hover:text-red-700 font-semibold"
                  >
                    Remove
                  </button>
                </div>
                <img src={filteredImage || image} alt="scan preview" className="w-full max-h-80 object-contain bg-slate-50" />
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                OCR Language Pack
                <select
                  value={ocrLanguage}
                  onChange={(e) => setOcrLanguage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {OCR_LANGUAGE_PRESETS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                Scan Filter
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="original">Original</option>
                  <option value="grayscale">Grayscale</option>
                  <option value="contrast">Color Corrected</option>
                  <option value="bw">Black & White</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                Tags (comma separated)
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="receipt, travel, 2026"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm text-slate-700">
                Access Code (app-level protection)
                <input
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="optional"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              PDF password encryption is not available with this browser-only stack. This app applies access-code protection inside the app and marks the PDF with a note when an access code is set.
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm text-slate-700 md:col-span-3">
                Annotation Text Box
                <textarea
                  value={annotationTextBox}
                  onChange={(e) => setAnnotationTextBox(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Optional note to append"
                />
              </label>
              <label className="text-sm text-slate-700">
                Highlight Keyword
                <input
                  value={highlightKeyword}
                  onChange={(e) => setHighlightKeyword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="invoice"
                />
              </label>
              <label className="text-sm text-slate-700 md:col-span-2">
                Signature
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Signed: John Doe"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runOcr()}
                className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
              >
                Run OCR
              </button>
              <button
                type="button"
                onClick={() => void handleExport("word")}
                className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700"
              >
                Export Word
              </button>
              <button
                type="button"
                onClick={() => void handleExport("excel")}
                className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700"
              >
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => void handleExport("pdf")}
                className="rounded-xl bg-rose-600 text-white px-4 py-2 text-sm font-semibold hover:bg-rose-700"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => void handleExport("jpeg")}
                className="rounded-xl bg-fuchsia-600 text-white px-4 py-2 text-sm font-semibold hover:bg-fuchsia-700"
              >
                Export JPEG
              </button>
              <button
                type="button"
                onClick={() => void handleExport("txt")}
                className="rounded-xl bg-slate-700 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800"
              >
                Export TXT
              </button>
            </div>

            {isProcessing && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                OCR processing in progress. Large documents and multilingual models can take longer.
              </div>
            )}

            {isDone && !isProcessing && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Scan processed and exported successfully.
              </div>
            )}

            {ocrText && (
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">
                  Real-time text search enabled in library and this extract
                </div>
                <pre className="p-4 text-xs text-slate-700 whitespace-pre-wrap max-h-56 overflow-y-auto">{ocrText}</pre>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-white shadow-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-bold text-slate-800">Document Library</h2>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setLibrary([]);
              }}
              className="text-xs text-red-500 font-semibold"
            >
              Clear all
            </button>
          </div>

          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, text, or tags"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm mb-4"
          />

          <div className="space-y-3 max-h-180 overflow-y-auto pr-1">
            {visibleLibrary.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No documents yet. Scan one to build your library.
              </div>
            )}

            {visibleLibrary.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">{item.name}</h3>
                    <p className="text-xs text-slate-500">{item.createdAt}</p>
                  </div>
                  {item.accessCode && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">
                      Protected
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 mt-2 line-clamp-3">{item.text}</p>

                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span key={`${item.id}-${tag}`} className="text-[10px] px-2 py-1 rounded-full bg-cyan-100 text-cyan-700">
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openDocument(item)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => void shareScan(item)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open("https://drive.google.com/drive/my-drive", "_blank")}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700"
                  >
                    Drive
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open("https://www.dropbox.com/home", "_blank")}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-100 text-indigo-700"
                  >
                    Dropbox
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
