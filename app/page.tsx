"use client";
import { useEffect, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

type ImageMetadata = {
  fileName: string;
  mimeType: string;
  fileSizeKB: string;
  width: number;
  height: number;
  uploadedAt: string;
};

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');

  const getImageDimensions = (dataUrl: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error('Could not read image dimensions'));
      img.src = dataUrl;
    });

  const buildDescription = (recognizedText: string, metadata: ImageMetadata) => {
    const lineCount = recognizedText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean).length;

    if (!recognizedText || recognizedText === 'No readable text found in the image.') {
      return `No clear readable text was detected. The uploaded image appears to be ${metadata.width}x${metadata.height}px and may be mostly graphical.`;
    }

    if (lineCount > 8) {
      return `The image appears to contain a document-style layout with multiple text lines (${lineCount} detected lines).`;
    }

    return `The image appears to contain short-form text content with ${lineCount} detected lines.`;
  };

  const downloadDocx = async (
    recognizedText: string,
    metadata: ImageMetadata,
    description: string
  ) => {
    const normalizedText = recognizedText.trim() || 'No readable text found in the image.';
    const lines = normalizedText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const extractedTextParagraphs = lines.length
      ? lines.map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line })],
            })
        )
      : [new Paragraph('No readable text found in the image.')];

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: 'Scanned Document Output',
              heading: HeadingLevel.TITLE,
            }),
            new Paragraph({
              text: 'Extracted Text',
              heading: HeadingLevel.HEADING_1,
            }),
            ...extractedTextParagraphs,
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'Image Metadata',
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph(`File Name: ${metadata.fileName}`),
            new Paragraph(`MIME Type: ${metadata.mimeType}`),
            new Paragraph(`File Size: ${metadata.fileSizeKB} KB`),
            new Paragraph(`Dimensions: ${metadata.width} x ${metadata.height} px`),
            new Paragraph(`Uploaded At: ${metadata.uploadedAt}`),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'Image Description',
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph(description),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scanned-document.docx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      setSelectedFile(file);
      setExtractedText('');
      setIsDone(false);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        setImage(dataUrl);
        try {
          const dimensions = await getImageDimensions(dataUrl);
          setImageMetadata({
            fileName: stripExtension(file.name),
            mimeType: file.type || 'unknown',
            fileSizeKB: (file.size / 1024).toFixed(2),
            width: dimensions.width,
            height: dimensions.height,
            uploadedAt: new Date().toLocaleString(),
          });
        } catch {
          setImageMetadata({
            fileName: stripExtension(file.name),
            mimeType: file.type || 'unknown',
            fileSizeKB: (file.size / 1024).toFixed(2),
            width: 0,
            height: 0,
            uploadedAt: new Date().toLocaleString(),
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAutoConvert = async (imageFile: File, metadata: ImageMetadata) => {
    setIsConverting(true);
    setIsDone(false);
    try {
      const ocrResult = await Tesseract.recognize(imageFile, 'eng');
      const recognizedText = ocrResult.data.text.trim() || 'No readable text found in the image.';
      setExtractedText(recognizedText);

      const description = buildDescription(recognizedText, metadata);
      await downloadDocx(recognizedText, metadata, description);
      setIsDone(true);
    } catch {
      alert('Scanning failed. Please try again.');
    } finally {
      setIsConverting(false);
    }
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
      alert('Camera permission is required to take a picture.');
    }
  };

  const handleReset = () => {
    setImage(null);
    setSelectedFile(null);
    setExtractedText('');
    setIsDone(false);
    setImageMetadata(null);
  };

  useEffect(() => {
    if (!selectedFile || !imageMetadata) return;
    void handleAutoConvert(selectedFile, imageMetadata);
  }, [selectedFile, imageMetadata]);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-linear-to-r from-blue-600 to-indigo-600 px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-xl p-2.5">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Image to Word Converter</h1>
              <p className="text-blue-100 text-sm mt-0.5">Upload a photo and automatically generate a Word document</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-7 space-y-7">

          {/* ── Step 1: Add image ── */}
          {!image && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Step 1 &mdash; Add an image
              </p>
              <div className="grid grid-cols-2 gap-3">

                {/* Camera button */}
                <button
                  type="button"
                  onClick={handleTakePicture}
                  className="flex flex-col items-center gap-2.5 py-6 px-4 rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-150 group"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-700">Take a Photo</p>
                    <p className="text-xs text-gray-400 mt-0.5">Open camera</p>
                  </div>
                </button>

                {/* Upload button */}
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex flex-col items-center gap-2.5 py-6 px-4 rounded-xl border-2 border-dashed border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all duration-150 group"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-700">Upload a File</p>
                    <p className="text-xs text-gray-400 mt-0.5">From gallery</p>
                  </div>
                </button>
              </div>
            </section>
          )}

          {/* Hidden file inputs */}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />
          <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />

          {/* ── Image preview ── */}
          {image && (
            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs font-medium text-gray-600 truncate">
                    {selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'Image preview'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors shrink-0"
                >
                  Remove
                </button>
              </div>
              <img src={image} alt="Preview" className="w-full max-h-64 object-contain bg-gray-50" />
            </div>
          )}

          {/* ── Converting spinner ── */}
          {isConverting && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3.5">
              <svg className="w-5 h-5 text-blue-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  Extracting text and generating Word file...
                </p>
                <p className="text-xs text-blue-400 mt-0.5">OCR and formatting in progress</p>
              </div>
            </div>
          )}

          {/* ── Success banner ── */}
          {isDone && !isConverting && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5">
              <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-700">Conversion complete!</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Saved as a <strong>Word document (.docx)</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => selectedFile && imageMetadata && void handleAutoConvert(selectedFile, imageMetadata)}
                className="text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 transition-colors shrink-0"
              >
                Download again
              </button>
            </div>
          )}

          {/* ── OCR text preview ── */}
          {extractedText && !isConverting && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs font-semibold text-gray-500">Extracted text preview</p>
              </div>
              <pre className="px-4 py-3.5 text-xs text-gray-600 whitespace-pre-wrap max-h-44 overflow-y-auto leading-relaxed font-sans">
                {extractedText}
              </pre>
            </div>
          )}

          {imageMetadata && !isConverting && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                <p className="text-xs font-semibold text-gray-500">Image metadata</p>
              </div>
              <div className="px-4 py-3 text-xs text-gray-600 space-y-1">
                <p><strong>Name:</strong> {imageMetadata.fileName}</p>
                <p><strong>MIME Type:</strong> {imageMetadata.mimeType}</p>
                <p><strong>Size:</strong> {imageMetadata.fileSizeKB} KB</p>
                <p><strong>Dimensions:</strong> {imageMetadata.width} x {imageMetadata.height} px</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}