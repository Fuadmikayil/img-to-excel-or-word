"use client";
import { useEffect, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';

type ExportFormat = 'excel' | 'word';

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('word');
  const [isConverting, setIsConverting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [isDone, setIsDone] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      setSelectedFile(file);
      setExtractedText('');
      setIsDone(false);
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const createExcelFile = (imageData: string) => {
    const ws = XLSX.utils.json_to_sheet([
      { Image: 'Added image' },
      { 'Image Data': imageData },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, 'imageData.xlsx');
  };

  const downloadWordBlob = (imageData: string, recognizedText: string) => {
    const escaped = recognizedText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const html = `<html>
<head><meta charset="utf-8" /></head>
<body>
  <h2>Extracted Text</h2>
  <pre style="white-space:pre-wrap;font-family:Calibri,sans-serif;font-size:14px;line-height:1.6">${escaped}</pre>
  <br/>
  <h3>Original Image</h3>
  <img src="${imageData}" style="max-width:500px;height:auto;" />
</body>
</html>`;

    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'imageData.doc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const createWordFile = async (imageData: string, imageFile: File) => {
    const ocrResult = await Tesseract.recognize(imageFile, 'eng');
    const recognizedText = ocrResult.data.text.trim() || 'No readable text found in the image.';
    setExtractedText(recognizedText);
    downloadWordBlob(imageData, recognizedText);
  };

  const handleAutoConvert = async (imageData: string, imageFile: File) => {
    setIsConverting(true);
    setIsDone(false);
    try {
      if (exportFormat === 'excel') {
        createExcelFile(imageData);
      } else {
        await createWordFile(imageData, imageFile);
      }
      setIsDone(true);
    } catch {
      alert('Conversion failed. Please try again.');
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
  };

  useEffect(() => {
    if (!image || !selectedFile) return;
    void handleAutoConvert(image, selectedFile);
  }, [image, selectedFile]);

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
              <h1 className="text-xl font-bold text-white">Image to Document</h1>
              <p className="text-blue-100 text-sm mt-0.5">Snap or upload — get a document instantly</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-7 space-y-7">

          {/* ── Step 1: Format ── */}
          <section>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Step 1 &mdash; Choose output format
            </p>
            <div className="grid grid-cols-2 gap-3">

              {/* Excel card */}
              <button
                type="button"
                onClick={() => setExportFormat('excel')}
                className={`relative flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150
                  ${exportFormat === 'excel'
                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                    : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40'}`}
              >
                <span className="text-2xl leading-none select-none">📊</span>
                <div>
                  <p className={`text-sm font-semibold ${exportFormat === 'excel' ? 'text-emerald-700' : 'text-gray-700'}`}>Excel</p>
                  <p className="text-[11px] text-gray-400">.xlsx spreadsheet</p>
                </div>
                {exportFormat === 'excel' && (
                  <svg className="w-4 h-4 text-emerald-500 absolute top-2.5 right-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {/* Word card */}
              <button
                type="button"
                onClick={() => setExportFormat('word')}
                className={`relative flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150
                  ${exportFormat === 'word'
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/40'}`}
              >
                <span className="text-2xl leading-none select-none">📝</span>
                <div>
                  <p className={`text-sm font-semibold ${exportFormat === 'word' ? 'text-blue-700' : 'text-gray-700'}`}>Word</p>
                  <p className="text-[11px] text-gray-400">.doc with OCR text</p>
                </div>
                {exportFormat === 'word' && (
                  <svg className="w-4 h-4 text-blue-500 absolute top-2.5 right-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </section>

          {/* ── Step 2: Add image (only when no image yet) ── */}
          {!image && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Step 2 &mdash; Add an image
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
                  <p className="text-xs font-medium text-gray-600 truncate">{selectedFile?.name ?? 'Image preview'}</p>
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
                  {exportFormat === 'word' ? 'Reading image text with OCR…' : 'Generating Excel file…'}
                </p>
                <p className="text-xs text-blue-400 mt-0.5">This may take a few seconds</p>
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
                  Your {exportFormat === 'excel' ? 'Excel (.xlsx)' : 'Word (.doc)'} file was downloaded.
                </p>
              </div>
              <button
                type="button"
                onClick={() => image && selectedFile && void handleAutoConvert(image, selectedFile)}
                className="text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 transition-colors shrink-0"
              >
                Download again
              </button>
            </div>
          )}

          {/* ── OCR text preview ── */}
          {extractedText && exportFormat === 'word' && !isConverting && (
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

        </div>
      </div>
    </div>
  );
}