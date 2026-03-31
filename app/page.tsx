"use client";
import { useEffect, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';

type ExportFormat = 'excel' | 'word';

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel');
  const [isConverting, setIsConverting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      setSelectedFile(file);
      setExtractedText('');
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const createExcelFile = (imageData: string) => {
    const ws = XLSX.utils.json_to_sheet([
      { Image: 'Added image' },
      { ImagePath: imageData },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, 'imageData.xlsx');
  };

  const createWordFile = async (imageData: string, imageFile: File) => {
    const ocrResult = await Tesseract.recognize(imageFile, 'eng');
    const recognizedText = ocrResult.data.text.trim() || 'No readable text found in the image.';
    setExtractedText(recognizedText);

    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <h2>Extracted Text From Image</h2>
          <pre style="white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${recognizedText}</pre>
          <h3>Original Image</h3>
          <img src="${imageData}" style="max-width: 500px; height: auto;" />
        </body>
      </html>
    `;

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

  const handleAutoConvert = async (imageData: string, imageFile: File) => {
    setIsConverting(true);

    try {
      if (exportFormat === 'excel') {
        createExcelFile(imageData);
        return;
      }

      await createWordFile(imageData, imageFile);
    } catch {
      alert('Could not read the image text for Word conversion. Please try again.');
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
      stream.getTracks().forEach((track) => track.stop());
      cameraInputRef.current?.click();
    } catch {
      alert('Camera permission is required to take a picture.');
    }
  };

  useEffect(() => {
    if (!image || !selectedFile) {
      return;
    }

    void handleAutoConvert(image, selectedFile);
  }, [image, selectedFile]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 px-4">
      <h1 className="text-3xl font-bold mb-3 text-center">Add an Image</h1>
      <p className="text-gray-600 mb-6 text-center">Choose how you want to add your picture.</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6 w-full max-w-md">
        <button
          type="button"
          className="flex-1 bg-blue-500 text-white p-3 rounded hover:bg-blue-600 transition"
          onClick={handleTakePicture}
        >
          Take a Picture
        </button>
        <button
          type="button"
          className="flex-1 bg-emerald-500 text-white p-3 rounded hover:bg-emerald-600 transition"
          onClick={() => uploadInputRef.current?.click()}
        >
          Upload a Picture
        </button>
      </div>

      <div className="flex items-center gap-6 mb-6">
        <label className="flex items-center gap-2 text-gray-700">
          <input
            type="radio"
            name="export-format"
            value="excel"
            checked={exportFormat === 'excel'}
            onChange={() => setExportFormat('excel')}
          />
          Excel
        </label>
        <label className="flex items-center gap-2 text-gray-700">
          <input
            type="radio"
            name="export-format"
            value="word"
            checked={exportFormat === 'word'}
            onChange={() => setExportFormat('word')}
          />
          Word
        </label>
      </div>

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
        <div className="mb-6">
          <img src={image} alt="Uploaded" className="max-w-xs max-h-96" />
        </div>
      )}
      {isConverting && (
        <p className="text-sm text-blue-700 text-center mb-2">
          Reading image and converting to {exportFormat}...
        </p>
      )}
      {extractedText && exportFormat === 'word' && (
        <div className="w-full max-w-md bg-white border border-gray-200 rounded p-3 mb-3">
          <p className="text-sm font-semibold text-gray-700 mb-2">Extracted preview</p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{extractedText}</p>
        </div>
      )}
      <p className="text-sm text-gray-600 text-center">
        After adding an image, it is automatically converted to the selected format.
      </p>
    </div>
  );
}