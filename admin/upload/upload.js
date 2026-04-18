// ============================================
// FILE PROCESSING UTILITIES (available immediately on script load)
// ============================================

const getCompressionRunState = () => {
    if (!window.__uploadCompressionRun) {
        window.__uploadCompressionRun = {
            pdfPreset: '',
            imagePresetCounts: {},
            imageCount: 0
        };
    }
    return window.__uploadCompressionRun;
};

const trackImagePresetUse = (presetName) => {
    const state = getCompressionRunState();
    state.imageCount += 1;
    state.imagePresetCounts[presetName] = (state.imagePresetCounts[presetName] || 0) + 1;
};

/**
 * Compress an image file using adaptive presets before embedding in a PDF.
 * Targets image payload around ~100KB while preserving readability first.
 * @param {File|Blob} file - The source image file (JPEG, PNG, etc.)
 * @returns {Promise<Blob>} A compressed JPEG blob
 */
const compressImageForPdf = async (file) => {
    console.log('compressImageForPdf called');
    const TARGET_IMAGE_SIZE_KB = 100;
    const READABLE_FALLBACK_MAX_KB = 35;
    const compressionPresets = [
        { maxDimension: 1800, jpegQuality: 0.82, name: 'Image High' },
        { maxDimension: 1800, jpegQuality: 0.72, name: 'Image High (Q72)' },
        { maxDimension: 1800, jpegQuality: 0.62, name: 'Image High (Q62)' },
        { maxDimension: 1600, jpegQuality: 0.56, name: 'Image Medium High' },
        { maxDimension: 1400, jpegQuality: 0.50, name: 'Image Medium' },
        { maxDimension: 1200, jpegQuality: 0.44, name: 'Image Standard' },
        { maxDimension: 1000, jpegQuality: 0.38, name: 'Image Compact' },
        { maxDimension: 900, jpegQuality: 0.34, name: 'Image Compact Plus' },
        { maxDimension: 800, jpegQuality: 0.30, name: 'Image Aggressive' }
    ];

    const url = URL.createObjectURL(file);

    try {
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Failed to load image for compression: ${file.name || file.type}`));
            image.src = url;
        });

        let lastCompressedBlob = null;
        let readableFallback = null;
        let readableFallbackPreset = '';

        for (const preset of compressionPresets) {
            let width = img.width;
            let height = img.height;

            if (width > preset.maxDimension || height > preset.maxDimension) {
                if (width >= height) {
                    height = Math.round(height * preset.maxDimension / width);
                    width = preset.maxDimension;
                } else {
                    width = Math.round(width * preset.maxDimension / height);
                    height = preset.maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBlob = await new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to compress image: canvas.toBlob returned null'));
                }, 'image/jpeg', preset.jpegQuality);
            });

            lastCompressedBlob = compressedBlob;
            const compressedSizeKB = compressedBlob.size / 1024;
            console.log(`Tried ${preset.name}: ${compressedSizeKB.toFixed(1)}KB (${width}x${height}, q=${preset.jpegQuality})`);

            if (!readableFallback && compressedSizeKB <= READABLE_FALLBACK_MAX_KB) {
                readableFallback = compressedBlob;
                readableFallbackPreset = preset.name;
            }

            if (compressedSizeKB <= TARGET_IMAGE_SIZE_KB) {
                console.log(`✓ Using ${preset.name} - under ${TARGET_IMAGE_SIZE_KB}KB image target`);
                trackImagePresetUse(preset.name);
                return compressedBlob;
            }
        }

        if (readableFallback) {
            console.warn(`Could not reach ${TARGET_IMAGE_SIZE_KB}KB image target, using readable fallback (${readableFallbackPreset})`);
            trackImagePresetUse(readableFallbackPreset);
            return readableFallback;
        }

        console.warn(`Could not reach ${TARGET_IMAGE_SIZE_KB}KB image target, using most compressed version`);
        if (compressionPresets.length > 0) {
            trackImagePresetUse(compressionPresets[compressionPresets.length - 1].name);
        }
        return lastCompressedBlob || file;
    } finally {
        URL.revokeObjectURL(url);
    }
};

/**
 * Re-compress a PDF by rendering each page to canvas and compressing as JPEG.
 * Targets file size under 600KB while maintaining readable quality.
 * @param {File|Blob} pdfFile - The PDF file to re-compress
 * @returns {Promise<Blob>} A new PDF with compressed pages (target < 600KB)
 */
const recompressPDF = async (pdfFile) => {
    const TARGET_SIZE_KB = 600;
    const { PDFDocument } = window.PDFLib;
    
    console.log('Starting PDF re-compression for file:', pdfFile.name || 'unnamed', `(${(pdfFile.size / 1024 / 1024).toFixed(2)}MB)`);
    
    // Load PDF with pdf.js for rendering
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
        console.warn('pdf.js not loaded, skipping PDF re-compression');
        return pdfFile;
    }
    
    // Quality presets to try (from best to most compressed)
    const qualityPresets = [
        { renderScale: 3.0, maxDimension: 2800, jpegQuality: 0.90, name: 'Very High Quality' },
        { renderScale: 2.6, maxDimension: 2400, jpegQuality: 0.84, name: 'High Quality' },
        { renderScale: 2.2, maxDimension: 2100, jpegQuality: 0.78, name: 'Good Quality' },
        { renderScale: 1.8, maxDimension: 1800, jpegQuality: 0.70, name: 'Medium Quality' },
        { renderScale: 1.4, maxDimension: 1500, jpegQuality: 0.62, name: 'Standard Quality' },
        { renderScale: 1.1, maxDimension: 1200, jpegQuality: 0.54, name: 'Compressed' },
    ];
    
    try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;
        
        console.log(`Re-compressing PDF with ${numPages} pages...`);
        
        let lastCompressedBlob = null;
        
        // Try each quality preset until we get under target size
        for (const preset of qualityPresets) {
            const newPdf = await PDFDocument.create();
            
            // Process each page with current preset
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const baseViewport = page.getViewport({ scale: preset.renderScale });

                // Fit to max dimension while keeping higher render DPI
                let dimensionScale = 1.0;
                if (baseViewport.width > preset.maxDimension || baseViewport.height > preset.maxDimension) {
                    dimensionScale = Math.min(
                        preset.maxDimension / baseViewport.width,
                        preset.maxDimension / baseViewport.height
                    );
                }

                const scaledViewport = page.getViewport({ scale: preset.renderScale * dimensionScale });
                
                // Render to canvas
                const canvas = document.createElement('canvas');
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;
                const context = canvas.getContext('2d');
                
                await page.render({
                    canvasContext: context,
                    viewport: scaledViewport
                }).promise;
                
                // Compress canvas to JPEG
                const compressedBlob = await new Promise((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Canvas to blob failed'));
                    }, 'image/jpeg', preset.jpegQuality);
                });
                
                // Add compressed image to new PDF
                const imgArrayBuffer = await compressedBlob.arrayBuffer();
                const img = await newPdf.embedJpg(imgArrayBuffer);
                
                // Create page with same dimensions as canvas
                const newPage = newPdf.addPage([canvas.width, canvas.height]);
                newPage.drawImage(img, {
                    x: 0,
                    y: 0,
                    width: canvas.width,
                    height: canvas.height
                });
            }
            
            // Check resulting size
            const pdfBytes = await newPdf.save();
            const compressedBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            lastCompressedBlob = compressedBlob; // Save this version
            
            const compressedSizeKB = compressedBlob.size / 1024;
            
            const originalSizeMB = (pdfFile.size / 1024 / 1024).toFixed(2);
            const compressedSizeMB = (compressedBlob.size / 1024 / 1024).toFixed(2);
            const reduction = ((1 - compressedBlob.size / pdfFile.size) * 100).toFixed(1);
            
            console.log(`Tried ${preset.name}: ${originalSizeMB}MB → ${compressedSizeMB}MB (${compressedSizeKB.toFixed(0)}KB, ${reduction}% reduction)`);
            
            // If under target, use this version
            if (compressedSizeKB <= TARGET_SIZE_KB) {
                console.log(`✓ Using ${preset.name} - under ${TARGET_SIZE_KB}KB target`);
                getCompressionRunState().pdfPreset = preset.name;
                return compressedBlob;
            }
        }
        
        // If all presets are still too large, use the most compressed one
        console.warn(`Could not achieve ${TARGET_SIZE_KB}KB target, using most compressed version`);
        if (qualityPresets.length > 0) {
            getCompressionRunState().pdfPreset = qualityPresets[qualityPresets.length - 1].name;
        }
        return lastCompressedBlob || pdfFile;
        
    } catch (error) {
        console.warn('PDF re-compression failed, using original:', error);
        return pdfFile;
    }
};

// Convert images and PDFs to a single combined PDF
const combineFilesToPDF = async (files, taNumber) => {
    const { PDFDocument } = window.PDFLib;
    const finalPdf = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.type === 'application/pdf') {
            // Re-compress PDF by rendering pages to canvas
            const recompressedPdf = await recompressPDF(file);
            const arrayBuffer = await recompressedPdf.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await finalPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => finalPdf.addPage(page));
        } else if (file.type.startsWith('image/')) {
            // Compress image before embedding
            const compressedBlob = await compressImageForPdf(file);

            // Handle image - add as new page
            const imgData = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(compressedBlob);
            });

            // Get image dimensions
            const img = await new Promise((resolve) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.src = imgData;
            });

            // Create a new page in A4 size
            const pageWidth = 595.28; // A4 width in points
            const pageHeight = 841.89; // A4 height in points
            const page = finalPdf.addPage([pageWidth, pageHeight]);

            // Embed compressed image (always JPEG after compression)
            const imageBytes = await fetch(imgData).then(res => res.arrayBuffer());
            const embeddedImage = await finalPdf.embedJpg(imageBytes);

            // Calculate scaling to fit image on page while maintaining aspect ratio
            const margin = 28.35; // 10mm margin in points
            const maxWidth = pageWidth - (margin * 2);
            const maxHeight = pageHeight - (margin * 2);

            let imgWidth = embeddedImage.width;
            let imgHeight = embeddedImage.height;
            const aspectRatio = imgWidth / imgHeight;

            if (imgWidth > imgHeight) {
                imgWidth = maxWidth;
                imgHeight = imgWidth / aspectRatio;
            } else {
                imgHeight = maxHeight;
                imgWidth = imgHeight * aspectRatio;
            }

            // Further scale down if still too large
            if (imgWidth > maxWidth) {
                imgWidth = maxWidth;
                imgHeight = imgWidth / aspectRatio;
            }
            if (imgHeight > maxHeight) {
                imgHeight = maxHeight;
                imgWidth = imgHeight * aspectRatio;
            }

            // Center image on page
            const x = (pageWidth - imgWidth) / 2;
            const y = (pageHeight - imgHeight) / 2;

            page.drawImage(embeddedImage, {
                x: x,
                y: y,
                width: imgWidth,
                height: imgHeight,
            });
        }
    }

    // Save the combined PDF
    const pdfBytes = await finalPdf.save({
        useObjectStreams: true,
        addDefaultPage: false
    });

    return new File([pdfBytes], `${taNumber}.pdf`, {
        type: 'application/pdf',
        lastModified: Date.now()
    });
};

const gzipBlob = async (blob) => {
    if (typeof CompressionStream !== 'function') {
        return null;
    }

    const gzipStream = new CompressionStream('gzip');
    const compressedStream = blob.stream().pipeThrough(gzipStream);
    return await new Response(compressedStream).blob();
};

window.prepareFileForStorage = async (file, taNumber) => {
    let storageBlob = file;
    let extension = '.pdf';
    let compressed = false;

    if (file.type === 'application/pdf') {
        try {
            const gzBlob = await gzipBlob(file);
            if (gzBlob && gzBlob.size > 0 && gzBlob.size < file.size) {
                storageBlob = gzBlob;
                extension = '.pdf.gz';
                compressed = true;
            }
        } catch (error) {
            console.warn('Gzip compression skipped due to error:', error);
        }
    }

    const mimeType = compressed ? 'application/gzip' : 'application/pdf';
    const storageName = `${taNumber}${extension}`;
    const storageFile = new File([storageBlob], storageName, {
        type: mimeType,
        lastModified: Date.now()
    });

    return {
        storageFile,
        extension,
        compressed,
        originalSize: file.size,
        storedSize: storageFile.size
    };
};

// Validate and process files (PDF and/or images combined)
window.validateAndProcessFiles = async (fileInput, taNumber) => {
    console.log('validateAndProcessFiles called');
    window.__uploadCompressionRun = {
        pdfPreset: '',
        imagePresetCounts: {},
        imageCount: 0
    };

    const files = Array.from(fileInput.files);
    
    if (files.length === 0) {
        throw new Error('No file selected');
    }

    // Validate: max 10 total files (PDFs + images combined)
    if (files.length > 10) {
        throw new Error('Maximum 10 files allowed (PDFs and images combined)');
    }

    // Check file types
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const invalidFiles = files.filter(f => !validTypes.includes(f.type));
    
    if (invalidFiles.length > 0) {
        throw new Error('Only PDF, JPEG, and PNG files are supported');
    }

    // Combine all files (PDFs and images) into one PDF
    return await combineFilesToPDF(files, taNumber);
};

// ============================================
// UPLOAD PANEL INITIALIZATION
// ============================================

// Upload panel initialization and management
window.initUploadPanel = function(supabase, selectedEmployees, employeesMultiSelect) {
    const uploadStatus = document.getElementById("upload-status");
    const taNumberInput = document.getElementById("ta-number");
    const purposeInput = document.getElementById("purpose");
    const destinationInput = document.getElementById("destination");

    // Auto-resize textareas as content grows (capped at 170px)
    const autoResizeTextarea = (el) => {
        if (!el || el.tagName !== 'TEXTAREA') return;
        el.style.height = 'auto';
        const minH = parseFloat(getComputedStyle(el).minHeight) || 0;
        const newH = Math.min(Math.max(el.scrollHeight, minH), 170);
        el.style.height = newH + 'px';
        el.style.overflowY = el.scrollHeight > 170 ? 'auto' : 'hidden';
    };
    [purposeInput, destinationInput].forEach(el => {
        if (el) el.addEventListener('input', () => autoResizeTextarea(el));
    });
    const travelDateInput = document.getElementById("travel-date");
    const travelUntilInput = document.getElementById("travel-until");
    const scanFileInput = document.getElementById("scan-file");
    const isDemoCheckbox = document.getElementById("is-demo-checkbox");

    // Use validation functions from global scope (defined in admin.html)
    const isValidTaNumber = window.isValidTaNumber;
    const bindTaFormatter = window.bindTaFormatter;

    // Initialize date pickers
    window.flatpickr(travelDateInput, {
        dateFormat: "Y-m-d",
        allowInput: true,
        disableMobile: true,
        static: false,
        monthSelectorType: 'static',
        position: 'auto center'
    });

    window.flatpickr(travelUntilInput, {
        dateFormat: "Y-m-d",
        allowInput: true,
        disableMobile: true,
        static: false,
        monthSelectorType: 'static',
        position: 'auto center'
    });

    // Bind TA number formatter
    bindTaFormatter(taNumberInput);

    // File input change handler
    scanFileInput.addEventListener("change", () => {
        if (scanFileInput.files.length > 0) {
            const fileCount = scanFileInput.files.length;
            const hasPdf = Array.from(scanFileInput.files).some(f => f.type === 'application/pdf');
            const hasImages = Array.from(scanFileInput.files).some(f => f.type.startsWith('image/'));
            
            if (fileCount === 1) {
                uploadStatus.textContent = `Selected: ${scanFileInput.files[0].name}`;
            } else {
                const fileTypes = [];
                if (hasPdf) fileTypes.push('PDF');
                if (hasImages) fileTypes.push('images');
                uploadStatus.textContent = `Selected: ${fileCount} files (${fileTypes.join(' + ')}) - will be combined into one PDF`;
            }
            
            // Show warning if too many files
            if (fileCount > 10) {
                uploadStatus.textContent = "⚠️ Maximum 10 files allowed";
                uploadStatus.classList.add("status--error");
            } else {
                uploadStatus.classList.remove("status--error");
            }
        } else {
            uploadStatus.textContent = "Complete the required fields.";
        }
    });

    // Demo checkbox handler
    if (isDemoCheckbox) {
        const disclaimerModal = document.getElementById("demo-disclaimer-modal");
        const undemoModal = document.getElementById("undemo-disclaimer-modal");
        const cancelBtn = document.getElementById("cancel-demo-disclaimer");
        const confirmBtn = document.getElementById("confirm-demo-disclaimer");
        const cancelUndemoBtn = document.getElementById("cancel-undemo-disclaimer");
        const confirmUndemoBtn = document.getElementById("confirm-undemo-disclaimer");
        
        let isCheckPending = false;
        
        isDemoCheckbox.addEventListener("change", () => {
            if (isDemoCheckbox.checked && !isCheckPending) {
                isCheckPending = true;
                if (disclaimerModal) {
                    disclaimerModal.classList.add("show");
                }
            } else if (!isDemoCheckbox.checked && !isCheckPending) {
                isCheckPending = true;
                if (undemoModal) {
                    undemoModal.classList.add("show");
                }
            }
            isCheckPending = false;
        });
        
        // Demo checkbox handlers
        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
                isDemoCheckbox.checked = false;
                if (disclaimerModal) {
                    disclaimerModal.classList.remove("show");
                }
            });
        }
        
        if (confirmBtn) {
            confirmBtn.addEventListener("click", () => {
                if (disclaimerModal) {
                    disclaimerModal.classList.remove("show");
                }
            });
        }
        
        if (disclaimerModal) {
            disclaimerModal.addEventListener("click", (e) => {
                if (e.target === disclaimerModal) {
                    isDemoCheckbox.checked = false;
                    disclaimerModal.classList.remove("show");
                }
            });
        }
        
        // Undemo checkbox handlers
        if (cancelUndemoBtn) {
            cancelUndemoBtn.addEventListener("click", () => {
                isDemoCheckbox.checked = true;
                if (undemoModal) {
                    undemoModal.classList.remove("show");
                }
            });
        }
        
        if (confirmUndemoBtn) {
            confirmUndemoBtn.addEventListener("click", () => {
                if (undemoModal) {
                    undemoModal.classList.remove("show");
                }
            });
        }
        
        if (undemoModal) {
            undemoModal.addEventListener("click", (e) => {
                if (e.target === undemoModal) {
                    isDemoCheckbox.checked = true;
                    undemoModal.classList.remove("show");
                }
            });
        }
    }

    // Real-time TA number validation for upload
    let taCheckTimer = null;
    taNumberInput.addEventListener("input", async () => {
        const taNumber = taNumberInput.value.trim();
        
        // Clear existing timer
        if (taCheckTimer) {
            clearTimeout(taCheckTimer);
        }
        
        // Only check if TA number is valid (matches pattern)
        if (isValidTaNumber(taNumber)) {
            // Debounce the database check by 500ms
            taCheckTimer = setTimeout(async () => {
                try {
                    const { data, error } = await supabase
                        .from("travel_authorities")
                        .select("ta_number")
                        .eq("ta_number", taNumber)
                        .maybeSingle();
                    
                    if (error && error.code !== 'PGRST116') {
                        // PGRST116 is "no rows returned" - that's expected if TA doesn't exist
                        console.error("Error checking TA number:", error);
                        return;
                    }
                    
                    if (data) {
                        // TA number already exists
                        if (window.showToast) {
                            window.showToast(`TA ${taNumber} already exists in the database.`, "warning");
                        }
                    }
                } catch (err) {
                    console.error("Error checking TA number:", err);
                }
            }, 500);
        }
    });

    // Upload button handler
    document.getElementById("upload-btn").addEventListener("click", async () => {
        const taNumber = taNumberInput.value.trim();
        const purpose = purposeInput.value.trim();
        const destination = destinationInput.value.trim();
        const travelDate = travelDateInput.value;
        let travelUntil = travelUntilInput.value;
        const employees = selectedEmployees.join(", ");
        const isDemo = isDemoCheckbox ? isDemoCheckbox.checked : false;

        if (!taNumber || !purpose || !destination || !travelDate || scanFileInput.files.length === 0 || selectedEmployees.length === 0) {
            uploadStatus.textContent = "Please fill in all required fields.";
            uploadStatus.classList.add("status--error");
            uploadStatus.classList.remove("status--shake");
            void uploadStatus.offsetWidth;
            uploadStatus.classList.add("status--shake");
            return;
        }

        if (!isValidTaNumber(taNumber)) {
            uploadStatus.textContent = "TA Number must be in the format 0000-00-0000.";
            uploadStatus.classList.add("status--error");
            uploadStatus.classList.remove("status--shake");
            void uploadStatus.offsetWidth;
            uploadStatus.classList.add("status--shake");
            return;
        }

        if (!travelUntil) {
            travelUntil = travelDate;
            travelUntilInput.value = travelDate;
        }

        if (travelUntil) {
            const start = new Date(`${travelDate}T00:00:00`);
            const end = new Date(`${travelUntil}T00:00:00`);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
                uploadStatus.textContent = "Please enter valid dates.";
                uploadStatus.classList.add("status--error");
                uploadStatus.classList.remove("status--shake");
                void uploadStatus.offsetWidth;
                uploadStatus.classList.add("status--shake");
                return;
            }

            if (start > end) {
                uploadStatus.textContent = "Travel date cannot be after travel end.";
                uploadStatus.classList.add("status--error");
                uploadStatus.classList.remove("status--shake");
                void uploadStatus.offsetWidth;
                uploadStatus.classList.add("status--shake");
                return;
            }
        }

        try {
            // Block early if TA number already exists — before any file processing or storage upload
            uploadStatus.textContent = 'Checking TA number...';
            uploadStatus.classList.remove("status--error");
            const { data: existingRows, error: checkError } = await supabase
                .from("travel_authorities")
                .select("ta_number")
                .eq("ta_number", taNumber)
                .limit(1);
            if (checkError) {
                throw new Error(`Could not verify TA number: ${checkError.message}`);
            }
            if (existingRows && existingRows.length > 0) {
                uploadStatus.textContent = `TA Number ${taNumber} already exists in the database.`;
                uploadStatus.classList.add("status--error");
                uploadStatus.classList.remove("status--shake");
                void uploadStatus.offsetWidth;
                uploadStatus.classList.add("status--shake");
                return;
            }

            // Validate and process files (PDF or images)
            uploadStatus.textContent = 'Compressing and processing files...';
            uploadStatus.classList.remove("status--error");

            const processedFile = await window.validateAndProcessFiles(scanFileInput, taNumber);
            const preparedUpload = await window.prepareFileForStorage(processedFile, taNumber);
            const BYTES_PER_MB = 1024 * 1024;
            const processedSizeKB = (preparedUpload.storedSize / 1024).toFixed(0);
            const processedSizeMB = (preparedUpload.storedSize / BYTES_PER_MB).toFixed(2);
            
            // Check if file is still too large
            const maxAllowedMB = 10;
            if (preparedUpload.storedSize > maxAllowedMB * BYTES_PER_MB) {
                uploadStatus.textContent = `File too large after compression: ${processedSizeMB}MB (max ${maxAllowedMB}MB). Please use fewer or smaller files.`;
                uploadStatus.classList.add("status--error");
                uploadStatus.classList.remove("status--shake");
                void uploadStatus.offsetWidth;
                uploadStatus.classList.add("status--shake");
                return;
            }

            const sizeLabel = preparedUpload.storedSize < BYTES_PER_MB
                ? `${processedSizeKB} KB`
                : `${processedSizeMB} MB`;

            const compressionState = window.__uploadCompressionRun || {};
            const detailParts = [];
            if (compressionState.pdfPreset) {
                detailParts.push(`PDF preset: ${compressionState.pdfPreset}`);
            }
            if (compressionState.imageCount > 0) {
                const imagePresetSummary = Object.entries(compressionState.imagePresetCounts || {})
                    .map(([name, count]) => `${name} x${count}`)
                    .join(', ');
                if (imagePresetSummary) {
                    detailParts.push(`Image preset: ${imagePresetSummary}`);
                }
            }
            const detailSuffix = detailParts.length ? ` • ${detailParts.join(' • ')}` : '';

            uploadStatus.textContent = preparedUpload.compressed
                ? `Uploading optimized file (${sizeLabel})${detailSuffix}...`
                : `Uploading file (${sizeLabel})...`;

            // Verify user is authenticated
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData?.session) {
                throw new Error("No active session. Please log in again.");
            }

            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                throw new Error("Not authenticated");
            }

            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("id, role")
                .eq("id", user.id)
                .maybeSingle();

            // Allow both admin AND super users to upload
            if (profileError || (profile?.role !== "admin" && profile?.role !== "super")) {
                throw new Error("Not authorized to upload.");
            }

            const safeTa = taNumber.replace(/[^a-z0-9-_]/gi, "_");
            const safeDate = travelDate.replace(/[^0-9-]/g, "-");
            
            // Extract file extension and rename file to TA number with timestamp
            const fileExtension = preparedUpload.extension;
            const timestamp = Date.now();
            const newFileName = `${taNumber}_${timestamp}${fileExtension}`;
            const filePath = `travel-authorities/${safeTa}/${safeDate}/${newFileName}`;

            const { error: uploadError } = await supabase
                .storage
                .from("ta-files")
                .upload(filePath, preparedUpload.storageFile, { upsert: false });

            if (uploadError) {
                throw new Error(`Storage upload failed: ${uploadError.message || "Unknown error"}`);
            }

            const { data: publicUrlData } = supabase
                .storage
                .from("ta-files")
                .getPublicUrl(filePath);

            const fileUrl = publicUrlData.publicUrl;

            // Mark timestamp BEFORE database operation to suppress own realtime notification
            window.adminRecentUploadTimestamp = Date.now();

            // Use minimal returning: some RLS setups allow INSERT but prevent RETURNING rows.
            const { error: insertError } = await supabase
                .from("travel_authorities")
                .insert(
                    [
                        {
                            ta_number: taNumber,
                            purpose: purpose,
                            destination: destination,
                            employees: employees,
                            travel_date: travelDate,
                            travel_until: travelUntil,
                            file_name: newFileName,
                            file_url: fileUrl,
                            is_demo: isDemo
                        }
                    ],
                    { returning: "minimal" }
                );

            if (insertError) {
                console.debug("[upload] insertError:", insertError);

                const errMsg = insertError.message || "";

                // If RETURNING is blocked by RLS
                if (errMsg.includes("no rows were returned after insert")) {
                    console.warn("[upload] INSERT returned no rows — likely RETURNING blocked by RLS. Attempting verification (best-effort).");
                    try {
                        const { data: verifyData, error: verifyError } = await supabase
                            .from("travel_authorities")
                            .select("ta_number")
                            .eq("ta_number", taNumber)
                            .maybeSingle();

                        console.debug("[upload] verification result:", { verifyData, verifyError });

                        if (verifyError) {
                            console.warn("[upload] verification SELECT failed (probably SELECT policy prevents reading):", verifyError);
                        } else if (verifyData) {
                            console.info("[upload] verification SELECT found the inserted row.");
                        } else {
                            console.warn("[upload] verification SELECT returned no row — this may be due to a restrictive SELECT policy.");
                        }
                    } catch (verifyErr) {
                        console.error("[upload] verification query threw:", verifyErr);
                    }

                    // UX fallback: treat as success
                    uploadStatus.textContent = "Upload complete (RETURNING blocked by RLS).";

                    if (typeof window.loadTravelAuthorities === "function") {
                        await window.loadTravelAuthorities(true);
                    }

                    const autoClearCheckbox = document.getElementById("auto-clear-checkbox");
                    if (autoClearCheckbox && autoClearCheckbox.checked) {
                        taNumberInput.value = "";
                        purposeInput.value = "";
                        destinationInput.value = "";
                        autoResizeTextarea(purposeInput);
                        autoResizeTextarea(destinationInput);
                        const hint1 = document.getElementById('ocr-group-hint');
                        if (hint1) hint1.textContent = 'Scan the uploaded TA to auto-fill both fields.';
                        travelDateInput.value = "";
                        travelUntilInput.value = "";
                        scanFileInput.value = "";
                        if (isDemoCheckbox) isDemoCheckbox.checked = false;
                        selectedEmployees.length = 0;
                        employeesMultiSelect.updateDisplay();
                        employeesMultiSelect.renderOptions();
                        uploadStatus.textContent = "Upload complete. Fields cleared.";
                    }

                    console.warn("[upload] NOTE: update the SELECT RLS policy for `travel_authorities` if you need INSERT ... RETURNING to return rows to the client.");
                    return;
                }

                // Non-RETURNING-related failures: cleanup and surface the error
                try {
                    const { error: removeError } = await supabase.storage.from("ta-files").remove([filePath]);
                    if (removeError) console.warn("Cleanup: failed to remove uploaded file after DB error:", removeError);
                } catch (cleanupErr) {
                    console.warn("Cleanup: unexpected error while removing uploaded file:", cleanupErr);
                }

                if (insertError.code === '23505' || insertError.message?.includes('duplicate key') || insertError.message?.includes('unique constraint')) {
                    throw new Error(`TA Number ${taNumber} already exists in the database.`);
                }

                console.error("Database insert error (travel_authorities):", insertError);
                throw new Error(`Database insert failed: ${insertError.message || "Unknown error"}`);
            }

            uploadStatus.textContent = "Upload complete.";
            
            // Clear fields after successful upload
            taNumberInput.value = "";
            purposeInput.value = "";
            destinationInput.value = "";
            autoResizeTextarea(purposeInput);
            autoResizeTextarea(destinationInput);
            const hint2 = document.getElementById('ocr-group-hint');
            if (hint2) hint2.textContent = 'Scan the uploaded TA to auto-fill both fields.';
            travelDateInput.value = "";
            travelUntilInput.value = "";
            scanFileInput.value = "";
            if (isDemoCheckbox) isDemoCheckbox.checked = false;
            selectedEmployees.length = 0;
            employeesMultiSelect.updateDisplay();
            employeesMultiSelect.renderOptions();
            uploadStatus.textContent = "Upload complete. Fields cleared.";

            // Reload travel authorities if function exists
            if (typeof window.loadTravelAuthorities === "function") {
                await window.loadTravelAuthorities(true);
            }
        } catch (error) {
            console.error("Upload error:", error);
            const message = error && error.message ? error.message : "Please try again.";
            uploadStatus.textContent = `Upload failed: ${message}`;
            uploadStatus.classList.add("status--error");
            uploadStatus.classList.remove("status--shake");
            void uploadStatus.offsetWidth;
            uploadStatus.classList.add("status--shake");
        }
    });

    // Clear upload fields button
    document.getElementById("clear-upload-btn").addEventListener("click", () => {
        taNumberInput.value = "";
        purposeInput.value = "";
        destinationInput.value = "";
        autoResizeTextarea(purposeInput);
        autoResizeTextarea(destinationInput);
        const hint3 = document.getElementById('ocr-group-hint');
        if (hint3) hint3.textContent = 'Scan the uploaded TA to auto-fill both fields.';
        travelDateInput.value = "";
        travelUntilInput.value = "";
        scanFileInput.value = "";
        if (isDemoCheckbox) isDemoCheckbox.checked = false;
        selectedEmployees.length = 0;
        employeesMultiSelect.updateDisplay();
        employeesMultiSelect.renderOptions();
        uploadStatus.textContent = "Fields cleared.";
        uploadStatus.classList.remove("status--error");
    });

    // Open OCR modal button — use late-bound call so it works regardless of init order
    const openOCRBtn = document.getElementById("open-ocr-btn");
    if (openOCRBtn) {
        openOCRBtn.addEventListener("click", () => {
            if (typeof window.openOCRModal === "function") {
                window.openOCRModal();
            } else {
                console.warn('[OCR] openOCRModal not ready yet');
            }
        });
    }

    // Single OCR button — scans the document and fills both Purpose and Destination at once
    const ocrFillBothBtn = document.getElementById('ocr-fill-both-btn');
    if (ocrFillBothBtn) {
        const runFillBoth = async (file) => {
            if (typeof window.autoFillFieldOCR !== 'function') return;
            const originalHTML = ocrFillBothBtn.innerHTML;
            ocrFillBothBtn.disabled = true;
            ocrFillBothBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="animation:ocr-spin .7s linear infinite"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg> Scanning\u2026';

            const results = await Promise.allSettled([
                window.autoFillFieldOCR('purpose', file),
                window.autoFillFieldOCR('destination', file)
            ]);

            let filled = 0;
            ['purpose', 'destination'].forEach((field, i) => {
                const r = results[i];
                if (r.status === 'fulfilled' && r.value) {
                    const el = document.getElementById(field);
                    if (el) {
                        el.value = r.value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        filled++;
                    }
                } else {
                    console.warn(`[OCR] ${field}: ${r.reason?.message || 'failed'}`);
                }
            });

            ocrFillBothBtn.innerHTML = filled === 2 ? '\u2713 Both filled!' : filled === 1 ? '\u2713 1 of 2 filled' : '\u2717 Not found — try another file?';            if (filled > 0) {
                const hint = document.getElementById('ocr-group-hint');
                if (hint) hint.textContent = 'Please review and correct any misscanned text before submitting.';
            }            setTimeout(() => { ocrFillBothBtn.innerHTML = originalHTML; ocrFillBothBtn.disabled = false; }, 2500);
        };

        ocrFillBothBtn.addEventListener('click', () => {
            const scanFileInput = document.getElementById('scan-file');
            const file = scanFileInput && scanFileInput.files && scanFileInput.files[0];
            if (file) {
                runFillBoth(file);
            } else {
                const tmp = document.createElement('input');
                tmp.type = 'file';
                tmp.accept = 'application/pdf,.pdf,image/jpeg,image/jpg,image/png';
                tmp.addEventListener('change', () => { if (tmp.files && tmp.files[0]) runFillBoth(tmp.files[0]); });
                tmp.click();
            }
        });
    }

    console.log("Upload panel initialized");
};
