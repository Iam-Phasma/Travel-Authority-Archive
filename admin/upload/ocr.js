// ============================================
// OCR FUNCTIONALITY (Tesseract.js)
// ============================================

const initOCRModal = () => {
    const modal = document.getElementById('ocr-modal');
    const modalClose = document.getElementById('ocr-modal-close');
    const tabs = document.querySelectorAll('.ocr-tab-btn');
    const tabContents = document.querySelectorAll('.ocr-tab-content');
    const tabsNav = modal.querySelector('.ocr-tabs');

    // State management
    let ocrInstance = null;
    let currentImageFile = null;
    let currentImageData = null;
    let cropSel = null;   // { x, y, w, h } in canvas display coords
    let cropImg = null;   // HTMLImageElement of the currently loaded image
    let targetField = null; // ID of upload form field to auto-fill (e.g. 'destination', 'purpose')

    // Load and initialize Tesseract.js (using CDN)
    const loadTesseractLib = async () => {
        if (window.Tesseract) return window.Tesseract;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
            script.onload = () => resolve(window.Tesseract);
            script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
            document.head.appendChild(script);
        });
    };

    // Load PDF.js for rendering PDF pages to canvas
    const loadPDFLib = async () => {
        if (window.pdfjsLib) return window.pdfjsLib;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            script.onerror = () => reject(new Error('Failed to load PDF.js'));
            document.head.appendChild(script);
        });
    };

    // Render first PDF page to a PNG data URL
    const pdfToFirstPageImage = async (file) => {
        const pdfjsLib = await loadPDFLib();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return canvas.toDataURL('image/png');
    };

    // ---- CROP / REGION SELECT VIEW ----

    // Draw the preview canvas: image + dimmed overlay with bright selection cutout
    const redrawCrop = () => {
        if (!cropImg) return;
        const canvas = document.getElementById('ocr-preview-canvas');
        const ctx = canvas.getContext('2d');
        const cw = canvas.width, ch = canvas.height;
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(cropImg, 0, 0, cw, ch);

        if (cropSel && Math.abs(cropSel.w) > 4 && Math.abs(cropSel.h) > 4) {
            const x = cropSel.w < 0 ? cropSel.x + cropSel.w : cropSel.x;
            const y = cropSel.h < 0 ? cropSel.y + cropSel.h : cropSel.y;
            const w = Math.abs(cropSel.w);
            const h = Math.abs(cropSel.h);

            // Dim everything
            ctx.fillStyle = 'rgba(0,0,0,0.48)';
            ctx.fillRect(0, 0, cw, ch);

            // Reveal selected region at full brightness using clip
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.drawImage(cropImg, 0, 0, cw, ch);
            ctx.restore();

            // Selection border
            ctx.strokeStyle = '#2f6fe4';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(x, y, w, h);
        }
    };

    // Show the crop view with an image (data URL)
    const showCropView = (imageDataUrl) => {
        showOCRProgress(false);
        // Hide upload UI, results, error, footer
        tabsNav.setAttribute('hidden', '');
        tabContents.forEach(c => c.setAttribute('hidden', ''));
        document.getElementById('ocr-results').setAttribute('hidden', '');
        document.getElementById('ocr-error').setAttribute('hidden', '');
        document.getElementById('ocr-default-footer').setAttribute('hidden', '');
        document.getElementById('ocr-scan-region-btn').disabled = true;
        cropSel = null;

        const canvas = document.getElementById('ocr-preview-canvas');
        const img = new Image();
        img.onload = () => {
            cropImg = img;
            // Scale to fit within modal content width/height
            const maxW = 520, maxH = 440;
            const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
            canvas.width = Math.round(img.naturalWidth * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            document.getElementById('ocr-crop-view').removeAttribute('hidden');
        };
        img.src = imageDataUrl;
    };

    // Modal Control Functions
    const openOCRModal = async (targetFieldId = null) => {
        targetField = targetFieldId || null;
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        try {
            await loadTesseractLib();
        } catch (error) {
            console.warn('Tesseract.js preload failed (will attempt on first use):', error);
        }
    };

    const closeOCRModal = () => {
        modal.classList.remove('show');
        document.body.style.overflow = '';
        resetOCRModal();
    };

    const resetOCRModal = () => {
        currentImageFile = null;
        currentImageData = null;
        cropSel = null;
        cropImg = null;
        targetField = null;
        document.getElementById('ocr-file-input').value = '';
        document.getElementById('ocr-progress').setAttribute('hidden', '');
        document.getElementById('ocr-results').setAttribute('hidden', '');
        document.getElementById('ocr-error').setAttribute('hidden', '');
        document.getElementById('ocr-crop-view').setAttribute('hidden', '');
        document.getElementById('ocr-text-output').value = '';
        document.getElementById('ocr-default-footer').removeAttribute('hidden');
        // Restore tab nav
        tabsNav.removeAttribute('hidden');
        switchTab('upload-image');
    };

    // Tab Switching
    const switchTab = (tabName) => {
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `ocr-tab-${tabName}`);
        });
    };

    // File Handling — routes everything through the crop view
    const handleFileSelect = async (file) => {
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            showOCRError('File is too large. Maximum size is 10 MB.');
            return;
        }
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            showOCRError('Invalid file type. Please upload PNG, JPG, or PDF.');
            return;
        }

        currentImageFile = file;

        if (file.type === 'application/pdf') {
            showOCRProgress(true);
            updateOCRProgress(5, 'Rendering PDF page…');
            try {
                const dataUrl = await pdfToFirstPageImage(file);
                showOCRProgress(false);
                showCropView(dataUrl);
            } catch (error) {
                showOCRError('Failed to render PDF: ' + (error.message || 'Unknown error'));
            }
        } else {
            const reader = new FileReader();
            reader.onload = (e) => showCropView(e.target.result);
            reader.onerror = () => showOCRError('Failed to read file. Please try again.');
            reader.readAsDataURL(file);
        }
    };

    // Crop and run OCR on the selected canvas region
    const scanSelectedRegion = async () => {
        if (!cropSel || !cropImg) return;

        const canvas = document.getElementById('ocr-preview-canvas');
        // Normalize (handle right-to-left / bottom-to-top drags)
        const x = cropSel.w < 0 ? cropSel.x + cropSel.w : cropSel.x;
        const y = cropSel.h < 0 ? cropSel.y + cropSel.h : cropSel.y;
        const w = Math.abs(cropSel.w);
        const h = Math.abs(cropSel.h);

        if (w < 10 || h < 10) return;

        // Scale from display canvas coords → natural image coords
        const scaleX = cropImg.naturalWidth / canvas.width;
        const scaleY = cropImg.naturalHeight / canvas.height;

        const offscreen = document.createElement('canvas');
        offscreen.width = Math.round(w * scaleX);
        offscreen.height = Math.round(h * scaleY);
        offscreen.getContext('2d').drawImage(
            cropImg,
            x * scaleX, y * scaleY, w * scaleX, h * scaleY,
            0, 0, offscreen.width, offscreen.height
        );

        const croppedUrl = offscreen.toDataURL('image/png');
        currentImageData = croppedUrl;

        document.getElementById('ocr-crop-view').setAttribute('hidden', '');
        performOCR(croppedUrl);
    };

    // Main OCR Function
    const performOCR = async (imageData) => {
        showOCRProgress(true);
        updateOCRProgress(5, 'Loading OCR engine…');

        let worker = null;
        try {
            const Tesseract = await loadTesseractLib();
            worker = await Tesseract.createWorker('eng', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        const pct = Math.round(m.progress * 100);
                        updateOCRProgress(10 + Math.round(pct * 0.85), 'Recognizing text…');
                    } else if (m.status === 'loading tesseract core') {
                        updateOCRProgress(10, 'Loading OCR core…');
                    } else if (m.status === 'initializing tesseract') {
                        updateOCRProgress(20, 'Initializing…');
                    } else if (m.status === 'loading language traineddata') {
                        updateOCRProgress(30, 'Loading language data…');
                    } else if (m.status === 'initialized tesseract') {
                        updateOCRProgress(40, 'Ready — scanning…');
                    }
                }
            });

            updateOCRProgress(90, 'Processing results…');
            const result = await worker.recognize(imageData);
            await worker.terminate();
            worker = null;

            displayOCRResults(result.data.text, result.data.confidence);
        } catch (error) {
            console.error('OCR Error:', error);
            if (worker) { try { await worker.terminate(); } catch (_) {} }
            showOCRError(`OCR processing failed: ${error.message || 'Unknown error'}`);
        }
    };

    // UI Update Functions
    const showOCRProgress = (show) => {
        const progress = document.getElementById('ocr-progress');
        const results = document.getElementById('ocr-results');
        const errorDiv = document.getElementById('ocr-error');
        if (show) {
            progress.removeAttribute('hidden');
            results.setAttribute('hidden', '');
            errorDiv.setAttribute('hidden', '');
        } else {
            progress.setAttribute('hidden', '');
        }
    };

    const updateOCRProgress = (percent, text = null) => {
        document.getElementById('ocr-progress-fill').style.width = percent + '%';
        if (text) document.getElementById('ocr-progress-text').textContent = text;
    };

    const displayOCRResults = (text, confidence) => {
        showOCRProgress(false);

        const trimmedText = text.trim();
        document.getElementById('ocr-text-output').value = trimmedText;
        document.getElementById('ocr-char-count').textContent = `${trimmedText.length} characters`;
        document.getElementById('ocr-confidence').textContent = `Confidence: ${Math.round(confidence)}%`;

        // Auto-fill mode: write directly into the target upload field and close
        if (targetField) {
            const el = document.getElementById(targetField);
            if (el) {
                el.value = trimmedText;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const copyBtn = document.getElementById('ocr-copy-all-btn');
            const fieldLabel = targetField.charAt(0).toUpperCase() + targetField.slice(1);
            if (copyBtn) copyBtn.textContent = `✓ Filled ${fieldLabel}!`;
            setTimeout(() => closeOCRModal(), 1500);
            return;
        }

        document.getElementById('ocr-results').removeAttribute('hidden');
        const defaultFooter = document.getElementById('ocr-default-footer');
        if (defaultFooter) defaultFooter.setAttribute('hidden', '');
    };

    const showOCRError = (message) => {
        showOCRProgress(false);
        document.getElementById('ocr-error-message').textContent = message;
        document.getElementById('ocr-error').removeAttribute('hidden');
    };

    // ---- EVENT LISTENERS ----

    // Modal controls
    modalClose.addEventListener('click', closeOCRModal);
    const cancelBtn = document.getElementById('ocr-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeOCRModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeOCRModal(); });

    // Tab switching
    tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

    // Choose File button
    const chooseFileBtn = document.getElementById('ocr-choose-file-btn');
    const fileInput = document.getElementById('ocr-file-input');
    if (chooseFileBtn && fileInput) {
        chooseFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
        });
    }

    // Drag and Drop
    const dropZone = document.getElementById('ocr-drop-zone');
    const dragFileInput = document.getElementById('ocr-file-input-drag') || fileInput;
    if (dropZone) {
        dropZone.addEventListener('click', () => dragFileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
        });
        if (dragFileInput && dragFileInput.id === 'ocr-file-input-drag') {
            dragFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
            });
        }
    }

    // ---- CROP CANVAS MOUSE / TOUCH HANDLERS ----
    const cropCanvas = document.getElementById('ocr-preview-canvas');
    let isDrawing = false;
    let dragStartX = 0, dragStartY = 0;

    const getCanvasPos = (e) => {
        const rect = cropCanvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return {
            x: Math.round((touch.clientX - rect.left) * (cropCanvas.width / rect.width)),
            y: Math.round((touch.clientY - rect.top) * (cropCanvas.height / rect.height))
        };
    };

    cropCanvas.addEventListener('mousedown', (e) => {
        if (!cropImg) return;
        e.preventDefault();
        const pos = getCanvasPos(e);
        isDrawing = true;
        dragStartX = pos.x;
        dragStartY = pos.y;
        cropSel = { x: pos.x, y: pos.y, w: 0, h: 0 };
        document.getElementById('ocr-scan-region-btn').disabled = true;
    });

    cropCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const pos = getCanvasPos(e);
        cropSel.w = pos.x - dragStartX;
        cropSel.h = pos.y - dragStartY;
        redrawCrop();
    });

    const endDraw = () => {
        if (!isDrawing) return;
        isDrawing = false;
        const hasSelection = cropSel && Math.abs(cropSel.w) > 10 && Math.abs(cropSel.h) > 10;
        document.getElementById('ocr-scan-region-btn').disabled = !hasSelection;
    };
    cropCanvas.addEventListener('mouseup', endDraw);
    cropCanvas.addEventListener('mouseleave', endDraw);

    // Touch support
    cropCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        cropCanvas.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY }));
    }, { passive: false });
    cropCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        cropCanvas.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
    }, { passive: false });
    cropCanvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        cropCanvas.dispatchEvent(new MouseEvent('mouseup'));
    }, { passive: false });

    // Crop view buttons
    document.getElementById('ocr-scan-region-btn').addEventListener('click', scanSelectedRegion);

    document.getElementById('ocr-crop-back-btn').addEventListener('click', () => {
        document.getElementById('ocr-crop-view').setAttribute('hidden', '');
        resetOCRModal();
    });

    // Results buttons
    document.getElementById('ocr-scan-again-btn').addEventListener('click', () => {
        document.getElementById('ocr-results').setAttribute('hidden', '');
        if (cropImg) {
            // Return to crop view with the same image — reset selection only
            cropSel = null;
            const canvas = document.getElementById('ocr-preview-canvas');
            canvas.getContext('2d').drawImage(cropImg, 0, 0, canvas.width, canvas.height);
            document.getElementById('ocr-scan-region-btn').disabled = true;
            document.getElementById('ocr-crop-view').removeAttribute('hidden');
        } else {
            resetOCRModal();
        }
    });

    document.getElementById('ocr-copy-all-btn').addEventListener('click', () => {
        const text = document.getElementById('ocr-text-output').value;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('ocr-copy-all-btn');
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = orig; }, 2000);
        });
    });

    // Error retry — return to crop view if image is loaded, else reset
    document.getElementById('ocr-error-retry-btn').addEventListener('click', () => {
        document.getElementById('ocr-error').setAttribute('hidden', '');
        if (cropImg) {
            cropSel = null;
            const canvas = document.getElementById('ocr-preview-canvas');
            canvas.getContext('2d').drawImage(cropImg, 0, 0, canvas.width, canvas.height);
            document.getElementById('ocr-scan-region-btn').disabled = true;
            document.getElementById('ocr-crop-view').removeAttribute('hidden');
        } else {
            resetOCRModal();
        }
    });

    // Recent Files Tab
    tabs.forEach(tab => {
        if (tab.dataset.tab === 'use-recent') {
            tab.addEventListener('click', () => {
                const scanFileInput = document.getElementById('scan-file');
                const recentFilesDiv = document.getElementById('ocr-recent-files');
                if (!scanFileInput || !scanFileInput.files || scanFileInput.files.length === 0) {
                    recentFilesDiv.innerHTML = '<p class="ocr-empty-state">No recent files available. Upload an image first.</p>';
                    return;
                }
                const fileList = Array.from(scanFileInput.files)
                    .filter(f => f.type.startsWith('image/'))
                    .slice(0, 5);
                if (fileList.length === 0) {
                    recentFilesDiv.innerHTML = '<p class="ocr-empty-state">No recent image files available.</p>';
                    return;
                }
                recentFilesDiv.innerHTML = fileList.map((file, index) => `
                    <button class="ocr-file-item" type="button" data-file-index="${index}">
                        <span class="ocr-file-name">${file.name}</span>
                        <span class="ocr-file-size">${(file.size / 1024).toFixed(0)} KB</span>
                    </button>
                `).join('');
                recentFilesDiv.querySelectorAll('.ocr-file-item').forEach(btn => {
                    btn.addEventListener('click', () => {
                        handleFileSelect(fileList[parseInt(btn.dataset.fileIndex)]);
                    });
                });
            });
        }
    });

    // ---- AUTO-FILL (no modal) ----
    // Detect and extract a specific field's cell from the document automatically.
    // Uses Tesseract block-level bboxes: finds the block containing the keyword,
    // crops that region (extending to image right edge to avoid column bleed),
    // re-OCRs the crop, strips the label line, returns clean text.
    const autoFillField = async (fieldId, file) => {
        // 1. Render file to image data URL
        let imageDataUrl;
        if (file.type === 'application/pdf') {
            imageDataUrl = await pdfToFirstPageImage(file);
        } else {
            imageDataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        // 2. Init Tesseract
        await loadTesseractLib();
        const worker = await Tesseract.createWorker('eng', 1, { logger: () => {} });

        try {
            // 3. Full-page OCR — word-level bboxes give us per-word positions
            const { data } = await worker.recognize(imageDataUrl);

            // 4. Load image element for canvas crop
            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = imageDataUrl;
            });

            // 5. Per-field config
            //    labelTerms:      OCR words to locate the field header
            //    stopTerms:       first word below the cell (= bottom boundary of the cell)
            //    rightBoundTerms: label of the column immediately to the right — its x0 becomes cropX1
            //                     so we never bleed into the adjacent column
            //    leftFromLabel:   true = start crop at the label's own x0 (mid-page columns)
            //                     false = start from x=0 (full-width rows like purpose)
            const configs = {
                destination: {
                    labelTerms:      ['destination'],
                    stopTerms:       ['purpose'],
                    rightBoundTerms: ['period'],   // "Period of Travel" column is to its right
                    leftFromLabel:   true,
                },
                purpose: {
                    labelTerms:      ['purpose'],
                    stopTerms:       ['honorarium', 'transportation', 'allowance', 'reimbursement'],
                    rightBoundTerms: ['please', 'official', 'business', 'time'],  // checkbox column
                    leftFromLabel:   false,
                }
            };
            const cfg = configs[fieldId];
            if (!cfg) throw new Error(`Unknown field: ${fieldId}`);

            // 6. Find the label word using word-level bboxes
            const allWords = data.words || [];
            const labelWord = allWords.find(w =>
                cfg.labelTerms.some(t => w.text.toLowerCase().includes(t))
            );
            if (!labelWord) throw new Error(`Label "${fieldId}" not found in document`);

            const labelY0 = labelWord.bbox.y0;
            const labelY1 = labelWord.bbox.y1;
            const labelX0 = labelWord.bbox.x0;
            const labelX1 = labelWord.bbox.x1;

            // 7. Find right-column boundary — look for the right-bound term that appears
            //    to the RIGHT of the label (x0 > labelX1) and on roughly the same row (y overlaps)
            let cropX1 = img.naturalWidth;
            for (const w of allWords) {
                const sameRow = w.bbox.y0 < labelY1 + 60 && w.bbox.y1 > labelY0 - 60;
                const toTheRight = w.bbox.x0 > labelX1 + 20;
                if (sameRow && toTheRight && cfg.rightBoundTerms.some(t => w.text.toLowerCase().includes(t))) {
                    cropX1 = Math.min(cropX1, Math.max(0, w.bbox.x0 - 8));
                }
            }

            // 8. Find the bottom boundary — first stop-term word below the label
            let stopY = img.naturalHeight;
            const wordsBelow = allWords
                .filter(w => w.bbox.y0 > labelY1 + 20)
                .sort((a, b) => a.bbox.y0 - b.bbox.y0);
            for (const w of wordsBelow) {
                if (cfg.stopTerms.some(t => w.text.toLowerCase().includes(t))) {
                    stopY = w.bbox.y0;
                    break;
                }
            }

            // 9. Build crop bounds
            const cropX0 = cfg.leftFromLabel ? Math.max(0, labelX0 - 5) : 0;
            const cropY0 = Math.max(0, labelY1 - 5);
            const cropY1 = Math.min(img.naturalHeight, stopY + 5);
            if (cropY1 - cropY0 < 10) throw new Error('Detected cell region is too small');

            // 10. Crop and re-OCR the isolated cell
            const offscreen = document.createElement('canvas');
            offscreen.width  = cropX1 - cropX0;
            offscreen.height = cropY1 - cropY0;
            offscreen.getContext('2d').drawImage(
                img, cropX0, cropY0, offscreen.width, offscreen.height,
                0, 0, offscreen.width, offscreen.height
            );
            const croppedResult = await worker.recognize(offscreen.toDataURL('image/png'));
            const rawLines = croppedResult.data.text.split('\n').map(l => l.trim()).filter(Boolean);

            // 11. Clean up TA form noise
            //  a) Whole-line noise: checkbox rows, table headers, lone symbols/dates
            const noiseLinePattern = /official\s+business|official\s+time|please\s+check|cash\s+adv|reimburs|honorarium|transportation|travel\s+allow|period\s+of|^[|=\-\s\[\]xXmMICT\/\\_.,:;]+$/i;
            //  b) Strip known inline prefix noise (checkbox label text prepended to content)
            const checkboxPrefixPattern = /^[\s=|[\]xXmMICT\-_*]*\s*(official\s+business|official\s+time|please\s+check)\s*/i;
            //  c) Strip checkbox symbol clusters at line start: "|LX|", "| X |", "[X]", "=x" etc.
            //     — any run of pipes, brackets, spaces, and 1–3 uppercase/digit chars at the very start
            const symbolPrefixPattern = /^[\s|[\]()\-=_]*(x{1,2}|lx|i{1,3}|✓|✗|\d{1,2})[\s|[\]()\-=_]+/i;
            //  d) Inline suffix noise
            const checkboxSuffixPattern = /[\s\-]*\b(please\s+check|official\s+business|official\s+time)\b.*$/i;
            //  e) Leading stray fragment: "- a ", "- an ", "- the " at line start (column bleed artifact)
            const leadingFragmentPattern = /^[\-–—]+\s+\w{1,4}\s+/;
            //  f) Date/column bleed lines like "g March 11, -"
            const columnBleedPattern = /^[a-z]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d/i;

            const cleanLines = rawLines
                .map(l => l
                    .replace(checkboxPrefixPattern, '')
                    .replace(symbolPrefixPattern, '')
                    .replace(checkboxSuffixPattern, '')
                    .replace(leadingFragmentPattern, '')
                    .trim()
                )
                .filter(l => l.length > 2 && !noiseLinePattern.test(l) && !columnBleedPattern.test(l));

            const result = cleanLines.join(' ').trim();
            if (!result) throw new Error('No usable text found in cell region');
            return result;

        } finally {
            await worker.terminate();
        }
    };

    // Export
    window.openOCRModal = openOCRModal;
    window.autoFillFieldOCR = autoFillField;
    console.log('OCR modal initialized');
};

// Expose for deferred initialization (called by admin.html after modal HTML is fetched)
window.initOCRModal = initOCRModal;
