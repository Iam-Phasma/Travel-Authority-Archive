// ============================================
// FILE PROCESSING UTILITIES (available immediately on script load)
// ============================================

/**
 * Compress an image file using canvas before embedding in a PDF.
 * Images are scaled down to at most MAX_DIMENSION pixels on the longest side
 * and re-encoded as JPEG at JPEG_QUALITY, significantly reducing file size.
 * @param {File|Blob} file - The source image file (JPEG, PNG, etc.)
 * @returns {Promise<Blob>} A compressed JPEG blob
 */
const compressImageForPdf = (file) => new Promise((resolve, reject) => {
    const MAX_DIMENSION = 1200;
    const JPEG_QUALITY = 0.6;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width >= height) {
                height = Math.round(height * MAX_DIMENSION / width);
                width = MAX_DIMENSION;
            } else {
                width = Math.round(width * MAX_DIMENSION / height);
                height = MAX_DIMENSION;
            }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to compress image: canvas.toBlob returned null'));
        }, 'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load image for compression: ${file.name || file.type}`));
    };
    img.src = url;
});

// Convert images and PDFs to a single combined PDF
const combineFilesToPDF = async (files, taNumber) => {
    const { PDFDocument } = window.PDFLib;
    const finalPdf = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.type === 'application/pdf') {
            // Handle PDF - copy all pages
            const arrayBuffer = await file.arrayBuffer();
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

// Validate and process files (PDF and/or images combined)
window.validateAndProcessFiles = async (fileInput, taNumber) => {
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
            // Validate and process files (PDF or images)
            uploadStatus.textContent = 'Compressing and processing files...';
            uploadStatus.classList.remove("status--error");

            const processedFile = await window.validateAndProcessFiles(scanFileInput, taNumber);
            const BYTES_PER_MB = 1024 * 1024;
            const processedSizeKB = (processedFile.size / 1024).toFixed(0);
            const processedSizeMB = (processedFile.size / BYTES_PER_MB).toFixed(2);
            
            // Check if file is still too large
            const maxAllowedMB = 10;
            if (processedFile.size > maxAllowedMB * BYTES_PER_MB) {
                uploadStatus.textContent = `File too large after compression: ${processedSizeMB}MB (max ${maxAllowedMB}MB). Please use fewer or smaller files.`;
                uploadStatus.classList.add("status--error");
                uploadStatus.classList.remove("status--shake");
                void uploadStatus.offsetWidth;
                uploadStatus.classList.add("status--shake");
                return;
            }

            const sizeLabel = processedFile.size < BYTES_PER_MB
                ? `${processedSizeKB} KB`
                : `${processedSizeMB} MB`;
            uploadStatus.textContent = `Uploading compressed file (${sizeLabel})...`;

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
            const fileExtension = processedFile.name.substring(processedFile.name.lastIndexOf('.'));
            const timestamp = Date.now();
            const newFileName = `${taNumber}_${timestamp}${fileExtension}`;
            const filePath = `travel-authorities/${safeTa}/${safeDate}/${newFileName}`;

            const { error: uploadError } = await supabase
                .storage
                .from("ta-files")
                .upload(filePath, processedFile, { upsert: false });

            if (uploadError) {
                throw new Error(`Storage upload failed: ${uploadError.message || "Unknown error"}`);
            }

            const { data: publicUrlData } = supabase
                .storage
                .from("ta-files")
                .getPublicUrl(filePath);

            const fileUrl = publicUrlData.publicUrl;

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

    console.log("Upload panel initialized");
};
