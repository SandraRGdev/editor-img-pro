// ===== Application State =====
const state = {
    originalImage: null,
    currentImage: null,
    fileName: '',
    format: 'webp',
    quality: 90,
    width: null,
    height: null,
    maintainAspect: false,
    cropMode: false,
    cropData: null,
    // Batch mode (always enabled)
    batchMode: true,
    batchImages: [], // Array of {file, name, image, processed}
    processedImages: [], // Array of processed canvas data URLs
    // Focus point for cover mode (0-1, where 0.5 is center)
    focusX: 0.5,
    focusY: 0.5,
    // Batch Canvas State
    globalWidth: 800,
    globalHeight: 800,
    spacing: 20,
    selectedImageIndex: -1, // -1 means no selection (global mode)
    // Canvas size limits (to prevent browser crashes)
    maxCanvasSize: 16384, // Maximum canvas dimension (safe limit)
    previewScale: 0.1, // Scale factor for preview when many images
    thumbnailSize: 200, // Size for thumbnails in preview
    pendingCanvasUpdate: false // Prevent multiple canvas updates
};

// ===== DOM Elements =====
const elements = {
    uploadSection: document.getElementById('uploadSection'),
    editorSection: document.getElementById('editorSection'),
    uploadArea: document.getElementById('uploadArea'),
    uploadTitle: document.getElementById('uploadTitle'),
    uploadText: document.getElementById('uploadText'),
    fileInput: document.getElementById('fileInput'),
    selectFileBtn: document.getElementById('selectFileBtn'),
    canvas: document.getElementById('canvas'),
    ctx: document.getElementById('canvas').getContext('2d'),

    // Controls
    fileName: document.getElementById('fileName'),
    formatRadios: document.querySelectorAll('input[name="format"]'),
    qualitySlider: document.getElementById('qualitySlider'),
    qualityValue: document.getElementById('qualityValue'),
    globalQualityToggle: document.getElementById('globalQualityToggle'),
    widthInput: document.getElementById('widthInput'),
    heightInput: document.getElementById('heightInput'),
    maintainAspect: document.getElementById('maintainAspect'),



    // Batch mode elements

    batchQueueSection: document.getElementById('batchQueueSection'),
    batchQueue: document.getElementById('batchQueue'),
    batchCount: document.getElementById('batchCount'),
    processBatchBtn: document.getElementById('processBatchBtn'),
    downloadZipBtn: document.getElementById('downloadZipBtn'),
    processSelectedBtn: document.getElementById('processSelectedBtn'),
    clearBatchBtn: document.getElementById('clearBatchBtn'),
    batchProgress: document.getElementById('batchProgress'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),

    // File size estimate
    estimateValue: document.getElementById('estimateValue'),

    // Info
    imageInfo: document.getElementById('imageInfo'),
    previewContainer: document.getElementById('previewContainer'),

    // Batch Layout Controls
    batchLayoutControls: document.getElementById('batchLayoutControls'),
    globalWidthInput: document.getElementById('globalWidthInput'),
    globalHeightInput: document.getElementById('globalHeightInput'),

    // Resize Controls
    resizeControls: document.getElementById('resizeControls')
};

// ===== Event Listeners Setup =====
function initEventListeners() {
    // Upload events
    elements.selectFileBtn.addEventListener('click', () => elements.fileInput.click());
    elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    elements.uploadArea.addEventListener('dragover', handleDragOver);
    elements.uploadArea.addEventListener('dragleave', handleDragLeave);
    // Global drop handler to allow dropping anywhere
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', handleDrop);

    // Control events
    elements.fileName.addEventListener('input', (e) => {
        // En modo lotes, siempre es el prefijo base para todas las imágenes
        state.fileName = e.target.value;
    });

    elements.formatRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.format = e.target.value;
            updatePreview();
            updateFileSizeEstimate();
        });
    });

    elements.qualitySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);

        if (state.batchMode) {
            if (elements.globalQualityToggle && elements.globalQualityToggle.checked) {
                // Aplicar misma calidad a todas las imágenes del lote
                state.batchImages.forEach(img => {
                    img.quality = val;
                });
            } else if (state.selectedImageIndex !== -1) {
                // Actualizar solo la imagen seleccionada
                state.batchImages[state.selectedImageIndex].quality = val;
            } else {
                // Sin selección, solo actualizar valor global base
                state.quality = val;
            }
        } else {
            // Modo una sola imagen
            state.quality = val;
        }

        elements.qualityValue.textContent = val + '%';
        updatePreview();
        updateFileSizeEstimate();
    });

    if (elements.globalQualityToggle) {
        elements.globalQualityToggle.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (checked && state.batchMode) {
                const val = parseInt(elements.qualitySlider.value);
                state.batchImages.forEach(img => {
                    img.quality = val;
                });
                updatePreview();
                updateFileSizeEstimate();
            }
        });
    }

    elements.widthInput.addEventListener('input', handleDimensionChange);
    elements.heightInput.addEventListener('input', handleDimensionChange);
    elements.maintainAspect.addEventListener('change', (e) => {
        const val = e.target.checked;
        if (state.batchMode && state.selectedImageIndex !== -1) {
            state.batchImages[state.selectedImageIndex].maintainAspect = val;
        } else {
            state.maintainAspect = val;
        }
        elements.canvas.style.cursor = val ? 'default' : 'grab';
        updatePreview();
    });

    // Batch Layout Controls
    elements.globalWidthInput.addEventListener('input', handleGlobalLayoutChange);
    elements.globalHeightInput.addEventListener('input', handleGlobalLayoutChange);

    // Batch mode events
    elements.processBatchBtn.addEventListener('click', processBatchImages);
    elements.downloadZipBtn.addEventListener('click', downloadAsZip);
    elements.processSelectedBtn.addEventListener('click', processAndDownloadSelected);
    elements.clearBatchBtn.addEventListener('click', clearBatchQueue);

    // Canvas Interaction (Drag & Select)
    let isDragging = false;
    let dragStartX, dragStartY, startFocusX, startFocusY;

    elements.canvas.addEventListener('mousedown', (e) => {
        if (state.batchMode) {
            handleBatchCanvasClick(e);
            // If an image is selected, allow dragging its focus point
            if (state.selectedImageIndex !== -1) {
                const imgData = state.batchImages[state.selectedImageIndex];
                if (!imgData.maintainAspect) {
                    isDragging = true;
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;
                    startFocusX = imgData.focusX;
                    startFocusY = imgData.focusY;
                    elements.canvas.style.cursor = 'grabbing';
                }
            }
            return;
        }

        // Single Mode Dragging
        if (!state.currentImage || state.maintainAspect) return;

        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startFocusX = state.focusX;
        startFocusY = state.focusY;
        elements.canvas.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        if (state.batchMode) {
            if (state.selectedImageIndex === -1) return;
            const imgData = state.batchImages[state.selectedImageIndex];

            // Calculate delta relative to the *displayed* image size on canvas
            // This is tricky in batch mode because of scaling. 
            // For now, let's implement a simplified drag sensitivity.
            const sensitivity = 0.002;
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            imgData.focusX = Math.max(0, Math.min(1, startFocusX - deltaX * sensitivity));
            imgData.focusY = Math.max(0, Math.min(1, startFocusY - deltaY * sensitivity));

            updatePreview();
            return;
        }

        // Single Mode Logic
        const img = state.currentImage;
        const targetWidth = state.width || img.width;
        const targetHeight = state.height || img.height;
        const canvasRect = elements.canvas.getBoundingClientRect();
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        // Calculate which dimension has excess to crop
        const scaleX = targetWidth / img.width;
        const scaleY = targetHeight / img.height;
        const scale = Math.max(scaleX, scaleY);

        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        if (scaledWidth > targetWidth) {
            const sensitivity = 1 / canvasRect.width;
            state.focusX = Math.max(0, Math.min(1, startFocusX - deltaX * sensitivity));
        }

        if (scaledHeight > targetHeight) {
            const sensitivity = 1 / canvasRect.height;
            state.focusY = Math.max(0, Math.min(1, startFocusY - deltaY * sensitivity));
        }

        updatePreview();
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            elements.canvas.style.cursor = state.maintainAspect ? 'default' : 'grab';
        }
    });

    // Update cursor on image load
    elements.canvas.style.cursor = 'grab';
}




// ===== File Handling =====
function handleFileSelect(e) {
    const files = e.target.files;
    // Batch mode: add all files to queue
    Array.from(files).forEach(file => {
        if (file && file.type.startsWith('image/')) {
            addToBatchQueue(file);
        }
    });
}

function handleDragOver(e) {
    e.preventDefault();
    elements.uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    elements.uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    // Batch mode: add all files to queue
    Array.from(files).forEach(file => {
        if (file && file.type.startsWith('image/')) {
            addToBatchQueue(file);
        }
    });
}

function loadImage(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            state.originalImage = img;
            state.currentImage = img;

            // Set initial filename
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            state.fileName = nameWithoutExt;
            elements.fileName.value = nameWithoutExt;

            // Set initial dimensions
            state.width = img.width;
            state.height = img.height;
            elements.widthInput.value = img.width;
            elements.heightInput.value = img.height;

            // Show editor
            elements.uploadSection.classList.add('hidden');
            elements.editorSection.classList.remove('hidden');

            updatePreview();
            updateImageInfo();
            updateFileSizeEstimate();

            // Set cursor for dragging in cover mode
            elements.canvas.style.cursor = state.maintainAspect ? 'default' : 'grab';

            // Optimize quality for 200KB target
            optimizeQualityForTargetSize(200);
        };
        img.src = e.target.result;
    };

    reader.readAsDataURL(file);
}

// ===== Dimension Handling =====
// ===== Dimension Handling =====
function handleDimensionChange(e) {
    const isWidth = e.target.id === 'widthInput';
    const value = parseInt(e.target.value);

    // Batch Mode Logic
    if (state.batchMode && state.selectedImageIndex !== -1) {
        const imgData = state.batchImages[state.selectedImageIndex];

        if (!value || value <= 0) return;

        // Use original image for aspect ratio if available
        const sourceImage = imgData.originalImage || imgData.image;

        if (imgData.maintainAspect) {
            const aspectRatio = sourceImage.width / sourceImage.height;
            if (isWidth) {
                imgData.width = value;
                imgData.height = Math.round(value / aspectRatio);
                elements.heightInput.value = imgData.height;
            } else {
                imgData.height = value;
                imgData.width = Math.round(value * aspectRatio);
                elements.widthInput.value = imgData.width;
            }
        } else {
            if (isWidth) imgData.width = value;
            else imgData.height = value;
        }
        updatePreview();
        return;
    }

    // Single Mode Logic
    if (!value || value <= 0) {
        if (state.originalImage) {
            if (isWidth) {
                state.width = state.originalImage.width;
                elements.widthInput.value = state.originalImage.width;
            } else {
                state.height = state.originalImage.height;
                elements.heightInput.value = state.originalImage.height;
            }
            updatePreview();
        }
        return;
    }

    if (state.maintainAspect && state.originalImage) {
        const aspectRatio = state.originalImage.width / state.originalImage.height;

        if (isWidth) {
            state.width = value;
            state.height = Math.round(value / aspectRatio);
            elements.heightInput.value = state.height;
        } else {
            state.height = value;
            state.width = Math.round(value * aspectRatio);
            elements.widthInput.value = state.width;
        }
    } else {
        if (isWidth) {
            state.width = value;
        } else {
            state.height = value;
        }
    }

    updatePreview();
    updateFileSizeEstimate();
}

async function processBatchImages() {
    if (state.batchImages.length === 0) return;

    elements.processBatchBtn.disabled = true;
    elements.downloadZipBtn.disabled = true;
    elements.batchProgress.classList.remove('hidden');
    state.processedImages = [];

    for (let i = 0; i < state.batchImages.length; i++) {
        const item = state.batchImages[i];

        // Update progress
        const percent = Math.round(((i + 1) / state.batchImages.length) * 100);
        elements.progressFill.style.width = `${percent}%`;
        elements.progressText.textContent = `Procesando ${i + 1} de ${state.batchImages.length}`;

        // Use original image for processing if available, otherwise use thumbnail
        const imgToProcess = item.originalImage || item.image;

        // Process image using its INDIVIDUAL settings
        const blob = await processSingleImage(imgToProcess, {
            width: item.width,
            height: item.height,
            quality: item.quality,
            maintainAspect: item.maintainAspect,
            focusX: item.focusX,
            focusY: item.focusY,
            format: state.format // Format is still global for now
        });

        state.processedImages.push({
            name: item.name,
            data: blob
        });

        item.processed = true;
    }

    elements.processBatchBtn.disabled = false;
    elements.downloadZipBtn.disabled = false;
    elements.progressText.textContent = '¡Procesamiento completado!';
}

function processSingleImage(img, settings) {
    return new Promise((resolve) => {
        const tempCanvas = document.createElement('canvas');
        const targetWidth = settings.width;
        const targetHeight = settings.height;

        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Enable smooth scaling
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';

        const imgAspect = img.width / img.height;
        const targetAspect = targetWidth / targetHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (settings.maintainAspect) {
            if (imgAspect > targetAspect) {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imgAspect;
                offsetX = 0;
                offsetY = (targetHeight - drawHeight) / 2;
            } else {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imgAspect;
                offsetX = (targetWidth - drawWidth) / 2;
                offsetY = 0;
            }
        } else {
            // Cover mode
            if (imgAspect > targetAspect) {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imgAspect;
                const maxOffset = drawWidth - targetWidth;
                offsetX = -(maxOffset * settings.focusX);
                offsetY = 0;
            } else {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imgAspect;
                const maxOffset = drawHeight - targetHeight;
                offsetY = -(maxOffset * settings.focusY);
                offsetX = 0;
            }
        }

        tempCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        const mimeType = `image/${settings.format}`;
        const quality = settings.quality / 100;

        tempCanvas.toBlob((blob) => {
            resolve(blob);
        }, mimeType, quality);
    });
}

// ===== Canvas & Preview =====
function updatePreview() {
    if (state.batchMode) {
        drawBatchCanvas();
        return;
    }

    if (!state.currentImage) return;

    const img = state.currentImage;
    const targetWidth = state.width || img.width;
    const targetHeight = state.height || img.height;

    elements.canvas.width = targetWidth;
    elements.canvas.height = targetHeight;

    // Clear canvas
    elements.ctx.clearRect(0, 0, targetWidth, targetHeight);

    // Enable smooth scaling
    elements.ctx.imageSmoothingEnabled = true;
    elements.ctx.imageSmoothingQuality = 'high';

    // Calculate cover dimensions (like object-fit: cover)
    const imgAspect = img.width / img.height;
    const targetAspect = targetWidth / targetHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (state.maintainAspect) {
        // Maintain aspect ratio - fit entire image
        if (imgAspect > targetAspect) {
            drawWidth = targetWidth;
            drawHeight = targetWidth / imgAspect;
            offsetX = 0;
            offsetY = (targetHeight - drawHeight) / 2;
        } else {
            drawHeight = targetHeight;
            drawWidth = targetHeight * imgAspect;
            offsetX = (targetWidth - drawWidth) / 2;
            offsetY = 0;
        }
    } else {
        // Cover mode - fill entire area, use focus point
        if (imgAspect > targetAspect) {
            // Image is wider - fit height, crop width
            drawHeight = targetHeight;
            drawWidth = targetHeight * imgAspect;
            // Use focus point for horizontal positioning
            const maxOffset = drawWidth - targetWidth;
            offsetX = -(maxOffset * state.focusX);
            offsetY = 0;
        } else {
            // Image is taller - fit width, crop height
            drawWidth = targetWidth;
            drawHeight = targetWidth / imgAspect;
            offsetX = 0;
            // Use focus point for vertical positioning
            const maxOffset = drawHeight - targetHeight;
            offsetY = -(maxOffset * state.focusY);
        }
    }

    // Draw image
    elements.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

    updateImageInfo();
}

function drawBatchCanvas() {
    if (state.batchImages.length === 0) {
        // Clear canvas or show placeholder
        elements.canvas.width = 800;
        elements.canvas.height = 400;
        elements.ctx.clearRect(0, 0, 800, 400);
        elements.ctx.fillStyle = '#333';
        elements.ctx.font = '20px Inter';
        elements.ctx.textAlign = 'center';
        elements.ctx.fillText('Arrastra imágenes aquí para empezar', 400, 200);
        return;
    }

    const layout = calculateBatchLayout();

    // Calculate total canvas size needed
    let maxWidth = 0;
    let maxHeight = 0;

    layout.forEach(pos => {
        maxWidth = Math.max(maxWidth, pos.x + pos.width);
        maxHeight = Math.max(maxHeight, pos.y + pos.height);
    });

    // Add padding
    maxWidth += state.spacing;
    maxHeight += state.spacing;

    // Limit canvas size to prevent browser crashes
    // If canvas would be too large, scale down the layout
    let scaleFactor = 1;
    if (maxWidth > state.maxCanvasSize || maxHeight > state.maxCanvasSize) {
        scaleFactor = Math.min(
            state.maxCanvasSize / maxWidth,
            state.maxCanvasSize / maxHeight
        );
        maxWidth = Math.floor(maxWidth * scaleFactor);
        maxHeight = Math.floor(maxHeight * scaleFactor);
    }

    elements.canvas.width = maxWidth;
    elements.canvas.height = maxHeight;

    // Clear
    elements.ctx.fillStyle = '#1a1a1a'; // Dark background for batch canvas
    elements.ctx.fillRect(0, 0, maxWidth, maxHeight);

    // Show info message if canvas is scaled
    if (scaleFactor < 1) {
        elements.ctx.fillStyle = '#8b5cf6';
        elements.ctx.font = '14px Inter';
        elements.ctx.textAlign = 'center';
        elements.ctx.fillText(
            `Preview escalado (${Math.round(scaleFactor * 100)}%) - El procesamiento usa resolución completa`,
            maxWidth / 2,
            20
        );
    }

    // Draw images
    layout.forEach((pos, index) => {
        const imgData = state.batchImages[index];
        const img = imgData.image;

        // Apply scale factor if canvas was scaled down
        const scaledX = Math.floor(pos.x * scaleFactor);
        const scaledY = Math.floor(pos.y * scaleFactor);
        const scaledWidth = Math.floor(pos.width * scaleFactor);
        const scaledHeight = Math.floor(pos.height * scaleFactor);

        // Draw individual image logic (similar to single mode but at specific position)
        const targetWidth = scaledWidth;
        const targetHeight = scaledHeight;

        // Save context state
        elements.ctx.save();

        // Clip to the target area
        elements.ctx.beginPath();
        elements.ctx.rect(scaledX, scaledY, targetWidth, targetHeight);
        elements.ctx.clip();

        // Calculate drawing params (cover/contain)
        const imgAspect = img.width / img.height;
        const targetAspect = targetWidth / targetHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgData.maintainAspect) {
            if (imgAspect > targetAspect) {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imgAspect;
                offsetX = 0;
                offsetY = (targetHeight - drawHeight) / 2;
            } else {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imgAspect;
                offsetX = (targetWidth - drawWidth) / 2;
                offsetY = 0;
            }
        } else {
            // Cover mode
            if (imgAspect > targetAspect) {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imgAspect;
                const maxOffset = drawWidth - targetWidth;
                offsetX = -(maxOffset * imgData.focusX);
                offsetY = 0;
            } else {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imgAspect;
                const maxOffset = drawHeight - targetHeight;
                offsetY = -(maxOffset * imgData.focusY);
                offsetX = 0;
            }
        }

        elements.ctx.drawImage(img, scaledX + offsetX, scaledY + offsetY, drawWidth, drawHeight);

        elements.ctx.restore();

        // Draw selection highlight
        if (index === state.selectedImageIndex) {
            elements.ctx.strokeStyle = '#8b5cf6'; // Primary color
            elements.ctx.lineWidth = 4;
            elements.ctx.strokeRect(scaledX, scaledY, targetWidth, targetHeight);
        }
    });
}


function updateImageInfo() {
    if (!state.currentImage) return;

    const width = state.width || state.currentImage.width;
    const height = state.height || state.currentImage.height;
    const format = state.format.toUpperCase();

    elements.imageInfo.textContent = `${width} × ${height} px • ${format} • ${state.quality}%`;
}

function updateFileSizeEstimate() {
    // Check if we have an image to estimate
    const hasImage = state.currentImage || (state.batchMode && state.selectedImageIndex !== -1);

    if (!hasImage) {
        elements.estimateValue.textContent = 'Carga una imagen';
        return;
    }

    elements.estimateValue.textContent = 'Calculando...';

    // For batch mode with selected image, create a temporary canvas
    if (state.batchMode && state.selectedImageIndex !== -1) {
        const imgData = state.batchImages[state.selectedImageIndex];
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgData.width;
        tempCanvas.height = imgData.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw the image with its settings - use original image if available
        const img = imgData.originalImage || imgData.image;
        const targetWidth = imgData.width;
        const targetHeight = imgData.height;
        const imgAspect = img.width / img.height;
        const targetAspect = targetWidth / targetHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgData.maintainAspect) {
            if (imgAspect > targetAspect) {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imgAspect;
                offsetX = 0;
                offsetY = (targetHeight - drawHeight) / 2;
            } else {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imgAspect;
                offsetX = (targetWidth - drawWidth) / 2;
                offsetY = 0;
            }
        } else {
            if (imgAspect > targetAspect) {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imgAspect;
                const maxOffset = drawWidth - targetWidth;
                offsetX = -(maxOffset * imgData.focusX);
                offsetY = 0;
            } else {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imgAspect;
                const maxOffset = drawHeight - targetHeight;
                offsetY = -(maxOffset * imgData.focusY);
                offsetX = 0;
            }
        }

        tempCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        const mimeType = `image/${state.format}`;
        const quality = imgData.quality / 100;

        tempCanvas.toBlob((blob) => {
            if (blob) {
                const sizeInKB = blob.size / 1024;
                const sizeInMB = sizeInKB / 1024;

                let sizeText;
                if (sizeInMB >= 1) {
                    sizeText = `${sizeInMB.toFixed(2)} MB`;
                } else {
                    sizeText = `${sizeInKB.toFixed(1)} KB`;
                }

                elements.estimateValue.textContent = sizeText;

                // Add color coding based on size
                if (sizeInMB > 5) {
                    elements.estimateValue.style.color = 'var(--color-danger)';
                } else if (sizeInMB > 2) {
                    elements.estimateValue.style.color = 'var(--color-warning, #f59e0b)';
                } else {
                    elements.estimateValue.style.color = 'var(--color-success)';
                }
            }
        }, mimeType, quality);
        return;
    }

    // Single mode logic
    const mimeType = `image/${state.format}`;
    const quality = state.quality / 100;

    // Convert canvas to blob to get actual file size
    elements.canvas.toBlob((blob) => {
        if (blob) {
            const sizeInKB = blob.size / 1024;
            const sizeInMB = sizeInKB / 1024;

            let sizeText;
            if (sizeInMB >= 1) {
                sizeText = `${sizeInMB.toFixed(2)} MB`;
            } else {
                sizeText = `${sizeInKB.toFixed(1)} KB`;
            }

            elements.estimateValue.textContent = sizeText;

            // Add color coding based on size
            if (sizeInMB > 5) {
                elements.estimateValue.style.color = 'var(--color-danger)';
            } else if (sizeInMB > 2) {
                elements.estimateValue.style.color = 'var(--color-warning, #f59e0b)';
            } else {
                elements.estimateValue.style.color = 'var(--color-success)';
            }
        }
    }, mimeType, quality);
}

// ===== Auto Quality Optimization =====
async function optimizeQualityForTargetSize(targetKB) {
    if (!state.currentImage) return;

    elements.estimateValue.textContent = 'Optimizando...';

    // Binary search for the best quality
    let min = 1;
    let max = 100;
    let bestQuality = 90;
    let bestDiff = Infinity;

    // Helper to get size for a specific quality
    const getSizeForQuality = (q) => {
        return new Promise(resolve => {
            const mimeType = `image/${state.format}`;
            elements.canvas.toBlob(blob => {
                resolve(blob ? blob.size / 1024 : 0);
            }, mimeType, q / 100);
        });
    };

    // Perform binary search (max 7 steps for 1-100 range)
    for (let i = 0; i < 7; i++) {
        const mid = Math.floor((min + max) / 2);
        const size = await getSizeForQuality(mid);

        const diff = Math.abs(size - targetKB);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestQuality = mid;
        }

        if (size > targetKB) {
            max = mid - 1;
        } else {
            min = mid + 1;
            // If we are under target, this is a valid candidate (prefer higher quality if under target)
            bestQuality = mid;
        }

        if (min > max) break;
    }

    // Fallback logic: if best quality is too low (< 15%) or we are still way over target (> 300KB)
    // and the user prefers a default of 80% in these cases.
    // Also if the image is just huge, 80% is a safe "good quality" default.
    const finalSize = await getSizeForQuality(bestQuality);
    if (bestQuality < 15 || (finalSize > targetKB * 1.5)) {
        bestQuality = 80;
    }

    // Apply best quality
    state.quality = bestQuality;
    elements.qualitySlider.value = bestQuality;
    elements.qualityValue.textContent = bestQuality + '%';

    updateFileSizeEstimate();
}


// ===== Crop Functionality =====
let cropState = {
    isDragging: false,
    isResizing: false,
    resizeHandle: null,
    startX: 0,
    startY: 0,
    cropX: 0,
    cropY: 0,
    cropWidth: 0,
    cropHeight: 0
};

function activateCropMode() {
    state.cropMode = true;
    elements.cropOverlay.classList.remove('hidden');
    elements.cropBtn.classList.add('hidden');
    elements.applyCropBtn.classList.remove('hidden');
    elements.cancelCropBtn.classList.remove('hidden');
    elements.cropSizeInputs.classList.remove('hidden');

    // Initialize crop box in center
    const canvasRect = elements.canvas.getBoundingClientRect();
    const containerRect = elements.previewContainer.getBoundingClientRect();

    // Use custom dimensions if specified, otherwise use default
    const customWidth = parseInt(elements.cropWidthInput.value);
    const customHeight = parseInt(elements.cropHeightInput.value);

    if (customWidth && customHeight && customWidth > 0 && customHeight > 0) {
        // Convert custom dimensions to display size
        const actualWidth = elements.canvas.width;
        const actualHeight = elements.canvas.height;
        const scaleX = canvasRect.width / actualWidth;
        const scaleY = canvasRect.height / actualHeight;

        cropState.cropWidth = Math.min(customWidth * scaleX, canvasRect.width);
        cropState.cropHeight = Math.min(customHeight * scaleY, canvasRect.height);
    } else {
        // Default size
        cropState.cropWidth = Math.min(300, canvasRect.width * 0.6);
        cropState.cropHeight = Math.min(300, canvasRect.height * 0.6);
    }

    cropState.cropX = (canvasRect.width - cropState.cropWidth) / 2;
    cropState.cropY = (canvasRect.height - cropState.cropHeight) / 2;

    updateCropBox();
    initCropEvents();
}

function updateCropBox() {
    elements.cropBox.style.left = cropState.cropX + 'px';
    elements.cropBox.style.top = cropState.cropY + 'px';
    elements.cropBox.style.width = cropState.cropWidth + 'px';
    elements.cropBox.style.height = cropState.cropHeight + 'px';

    // Update crop dimensions display
    const canvasRect = elements.canvas.getBoundingClientRect();
    const actualWidth = elements.canvas.width;
    const actualHeight = elements.canvas.height;
    const scaleX = actualWidth / canvasRect.width;
    const scaleY = actualHeight / canvasRect.height;

    const realWidth = Math.round(cropState.cropWidth * scaleX);
    const realHeight = Math.round(cropState.cropHeight * scaleY);

    elements.cropDimensions.textContent = `${realWidth} × ${realHeight} px`;
}

function initCropEvents() {
    // Crop box dragging
    elements.cropBox.addEventListener('mousedown', startDrag);

    // Handle resizing
    const handles = elements.cropBox.querySelectorAll('.crop-handle');
    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => startResize(e, handle));
    });

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDragResize);
}

function startDrag(e) {
    // Don't start drag if clicking on a handle
    if (e.target.classList.contains('crop-handle')) return;

    const containerRect = elements.previewContainer.getBoundingClientRect();
    cropState.isDragging = true;
    // Store the offset from mouse to crop box top-left corner
    cropState.startX = e.clientX - containerRect.left - cropState.cropX;
    cropState.startY = e.clientY - containerRect.top - cropState.cropY;
    e.preventDefault();
    e.stopPropagation();
}

function startResize(e, handle) {
    cropState.isResizing = true;
    cropState.resizeHandle = handle.className.split(' ')[1];
    cropState.startX = e.clientX;
    cropState.startY = e.clientY;
    e.stopPropagation();
    e.preventDefault();
}

function handleMouseMove(e) {
    if (!state.cropMode) return;

    const canvasRect = elements.canvas.getBoundingClientRect();
    const containerRect = elements.previewContainer.getBoundingClientRect();

    if (cropState.isDragging) {
        // Calculate new position based on mouse movement
        let newX = e.clientX - containerRect.left - cropState.startX;
        let newY = e.clientY - containerRect.top - cropState.startY;

        // Constrain to canvas bounds
        newX = Math.max(0, Math.min(newX, canvasRect.width - cropState.cropWidth));
        newY = Math.max(0, Math.min(newY, canvasRect.height - cropState.cropHeight));

        cropState.cropX = newX;
        cropState.cropY = newY;
        updateCropBox();
    } else if (cropState.isResizing) {
        const deltaX = e.clientX - cropState.startX;
        const deltaY = e.clientY - cropState.startY;

        const handle = cropState.resizeHandle;
        let newX = cropState.cropX;
        let newY = cropState.cropY;
        let newWidth = cropState.cropWidth;
        let newHeight = cropState.cropHeight;

        if (handle.includes('n')) {
            newY += deltaY;
            newHeight -= deltaY;
        }
        if (handle.includes('s')) {
            newHeight += deltaY;
        }
        if (handle.includes('w')) {
            newX += deltaX;
            newWidth -= deltaX;
        }
        if (handle.includes('e')) {
            newWidth += deltaX;
        }

        // Minimum size
        if (newWidth >= 50 && newHeight >= 50) {
            // Constrain to canvas
            if (newX >= 0 && newX + newWidth <= canvasRect.width) {
                cropState.cropX = newX;
                cropState.cropWidth = newWidth;
            }
            if (newY >= 0 && newY + newHeight <= canvasRect.height) {
                cropState.cropY = newY;
                cropState.cropHeight = newHeight;
            }

            cropState.startX = e.clientX;
            cropState.startY = e.clientY;
            updateCropBox();
        }
    }
}

function stopDragResize() {
    cropState.isDragging = false;
    cropState.isResizing = false;
    cropState.resizeHandle = null;
}

function applyCrop() {
    if (!state.currentImage) return;

    // Save user-defined dimensions BEFORE cropping
    const savedWidth = state.width;
    const savedHeight = state.height;
    const savedMaintainAspect = state.maintainAspect;

    // Calculate crop coordinates relative to actual canvas size
    const displayWidth = elements.canvas.offsetWidth;
    const displayHeight = elements.canvas.offsetHeight;
    const actualWidth = elements.canvas.width;
    const actualHeight = elements.canvas.height;

    const scaleX = actualWidth / displayWidth;
    const scaleY = actualHeight / displayHeight;

    const cropX = cropState.cropX * scaleX;
    const cropY = cropState.cropY * scaleY;
    const cropWidth = cropState.cropWidth * scaleX;
    const cropHeight = cropState.cropHeight * scaleY;

    // Create new canvas with cropped image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropWidth;
    tempCanvas.height = cropHeight;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(
        elements.canvas,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
    );

    // Convert to image
    const croppedImg = new Image();
    croppedImg.onload = () => {
        state.currentImage = croppedImg;

        // RESTORE user-defined dimensions instead of using cropped dimensions
        state.width = savedWidth;
        state.height = savedHeight;
        state.maintainAspect = savedMaintainAspect;

        // Keep the input fields showing the user's desired dimensions
        elements.widthInput.value = savedWidth;
        elements.heightInput.value = savedHeight;

        cancelCrop();
        updatePreview();
    };
    croppedImg.src = tempCanvas.toDataURL();
}

function cancelCrop() {
    state.cropMode = false;
    elements.cropOverlay.classList.add('hidden');
    elements.cropBtn.classList.remove('hidden');
    elements.applyCropBtn.classList.add('hidden');
    elements.cancelCropBtn.classList.add('hidden');
    elements.cropSizeInputs.classList.add('hidden');
}

function applyCropSize() {
    const customWidth = parseInt(elements.cropWidthInput.value);
    const customHeight = parseInt(elements.cropHeightInput.value);

    if (!customWidth || !customHeight || customWidth <= 0 || customHeight <= 0) {
        alert('Por favor ingresa dimensiones válidas');
        return;
    }

    // Convert custom dimensions to display size
    const canvasRect = elements.canvas.getBoundingClientRect();
    const actualWidth = elements.canvas.width;
    const actualHeight = elements.canvas.height;
    const scaleX = canvasRect.width / actualWidth;
    const scaleY = canvasRect.height / actualHeight;

    let newWidth = customWidth * scaleX;
    let newHeight = customHeight * scaleY;

    // Ensure crop box fits within canvas
    if (newWidth > canvasRect.width) {
        newWidth = canvasRect.width;
    }
    if (newHeight > canvasRect.height) {
        newHeight = canvasRect.height;
    }

    // Update crop box size and center it
    cropState.cropWidth = newWidth;
    cropState.cropHeight = newHeight;

    // Center the crop box, ensuring it stays within bounds
    cropState.cropX = Math.max(0, Math.min((canvasRect.width - newWidth) / 2, canvasRect.width - newWidth));
    cropState.cropY = Math.max(0, Math.min((canvasRect.height - newHeight) / 2, canvasRect.height - newHeight));

    updateCropBox();
}


function resetToOriginal() {
    if (!state.originalImage) return;

    // Restore original image
    state.currentImage = state.originalImage;

    // Reset dimensions to original
    state.width = state.originalImage.width;
    state.height = state.originalImage.height;
    elements.widthInput.value = state.originalImage.width;
    elements.heightInput.value = state.originalImage.height;

    // Update preview
    updatePreview();
    updateImageInfo();
    updateFileSizeEstimate();
}


// ===== Download =====
function downloadImage() {
    if (!elements.canvas) return;

    const mimeType = `image/${state.format}`;
    const quality = state.quality / 100;

    elements.canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.fileName || 'image'}.${state.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, mimeType, quality);
}

// ===== Reset =====
function reset() {
    state.originalImage = null;
    state.currentImage = null;
    state.fileName = '';
    state.format = 'webp';
    state.quality = 90;
    state.width = null;
    state.height = null;
    state.cropMode = false;

    elements.uploadSection.classList.remove('hidden');
    elements.editorSection.classList.add('hidden');
    elements.fileInput.value = '';
    elements.qualitySlider.value = 90;
    elements.qualityValue.textContent = '90%';

    cancelCrop();
}

// ===== Batch Mode Functions =====



function updateBatchQueueUIOnly() {
    elements.batchQueue.innerHTML = '';
    elements.batchCount.textContent = state.batchImages.length;

    state.batchImages.forEach((item, index) => {
        const batchItem = document.createElement('div');
        batchItem.className = 'batch-item' + (item.processed ? ' processed' : '');
        batchItem.dataset.index = index;

        batchItem.innerHTML = `
            <img src="${item.image.src}" class="batch-item-thumbnail" alt="${item.name}">
            <div class="batch-item-info">
                <div class="batch-item-name">${item.name}</div>
                <div class="batch-item-size">${(item.file.size / 1024).toFixed(1)} KB</div>
            </div>
            <button class="batch-item-remove" data-index="${index}">✕</button>
        `;

        // Click to preview
        batchItem.addEventListener('click', (e) => {
            if (!e.target.classList.contains('batch-item-remove')) {
                previewBatchImage(index);
            }
        });

        batchItem.querySelector('.batch-item-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(e.target.dataset.index);
            state.batchImages.splice(idx, 1);
            updateBatchQueueUI();
        });

        elements.batchQueue.appendChild(batchItem);
    });

    // Show editor section if we have images
    if (state.batchImages.length > 0) {
        elements.uploadSection.classList.add('hidden');
        elements.editorSection.classList.remove('hidden');
    }
}

function updateBatchQueueUI() {
    updateBatchQueueUIOnly();

    // Show editor section if we have images
    if (state.batchImages.length > 0) {
        elements.uploadSection.classList.add('hidden');
        elements.editorSection.classList.remove('hidden');

        // Preview first image by default
        previewBatchImage(0);
    }
}

function previewBatchImage(index) {
    if (!state.batchImages[index]) return;

    // Set the selected image index
    state.selectedImageIndex = index;

    // Update controls to show this image's settings
    updateBatchControls();

    // Update preview
    updatePreview();

    // Highlight selected item in queue
    document.querySelectorAll('.batch-item').forEach((el, i) => {
        if (i === index) {
            el.style.background = 'var(--bg-elevated)';
            el.style.borderLeft = '3px solid var(--color-primary)';
        } else {
            el.style.background = '';
            el.style.borderLeft = '';
        }
    });
}

function clearBatchQueue() {
    // Confirm action if there are images
    if (state.batchImages.length > 0) {
        if (!confirm('¿Estás seguro de que quieres borrar todo y empezar de nuevo?')) {
            return;
        }
    }

    state.batchImages = [];
    state.processedImages = [];
    state.selectedImageIndex = -1;

    updateBatchQueueUI();
    elements.batchProgress.classList.add('hidden');
    elements.downloadZipBtn.disabled = false;

    // Reset to upload screen
    elements.uploadSection.classList.remove('hidden');
    elements.editorSection.classList.add('hidden');

    // Reset file input so same files can be selected again if needed
    elements.fileInput.value = '';

    // Reset preview
    elements.estimateValue.textContent = 'Carga una imagen';
}


function processImage(img, name) {
    return new Promise((resolve) => {
        const targetWidth = state.width || img.width;
        const targetHeight = state.height || img.height;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Enable smooth scaling
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';

        // Calculate cover dimensions
        const imgAspect = img.width / img.height;
        const targetAspect = targetWidth / targetHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgAspect > targetAspect) {
            drawHeight = targetHeight;
            drawWidth = img.width * (targetHeight / img.height);
            offsetX = (targetWidth - drawWidth) / 2;
            offsetY = 0;
        } else {
            drawWidth = targetWidth;
            drawHeight = img.height * (targetWidth / img.width);
            offsetX = 0;
            offsetY = (targetHeight - drawHeight) / 2;
        }

        tempCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        const mimeType = `image/${state.format}`;
        const quality = state.quality / 100;

        tempCanvas.toBlob((blob) => {
            resolve(blob);
        }, mimeType, quality);
    });
}

async function downloadAsZip() {
    if (state.processedImages.length === 0) {
        alert('Primero debes procesar las imágenes');
        return;
    }

    elements.downloadZipBtn.disabled = true;
    elements.progressText.textContent = 'Descargando imágenes...';

    // Get custom filename from input (prefijo base)
    const baseName = elements.fileName.value.trim();

    // Download each image individually with a small delay to avoid browser blocking
    for (let i = 0; i < state.processedImages.length; i++) {
        const item = state.processedImages[i];
        let fileName;

        if (baseName) {
            // Usar prefijo base + número secuencial
            fileName = `${baseName}${i + 1}.${state.format}`;
        } else {
            // Sin prefijo: usar el nombre original de la imagen
            const originalName = state.batchImages[i]?.name || 'imagen';
            fileName = `${originalName}.${state.format}`;
        }

        // Create download link
        const url = URL.createObjectURL(item.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Small delay between downloads to avoid browser blocking
        if (i < state.processedImages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    elements.downloadZipBtn.disabled = false;
    elements.progressText.textContent = `Completado: ${state.processedImages.length} imágenes descargadas`;
}

async function processAndDownloadSelected() {
    if (state.selectedImageIndex === -1) return;

    const item = state.batchImages[state.selectedImageIndex];
    if (!item) return;

    elements.processSelectedBtn.disabled = true;
    const originalText = elements.processSelectedBtn.innerHTML;
    elements.processSelectedBtn.textContent = 'Procesando...';

    try {
        // Use original image for processing if available, otherwise use thumbnail
        const imgToProcess = item.originalImage || item.image;

        // Process the single image
        const blob = await processSingleImage(imgToProcess, {
            width: item.width,
            height: item.height,
            quality: item.quality,
            maintainAspect: item.maintainAspect,
            focusX: item.focusX,
            focusY: item.focusY,
            format: state.format
        });

        // Generate filename
        const baseName = elements.fileName.value.trim();
        let fileName;

        if (baseName) {
            // Usar prefijo base + índice + 1
            fileName = `${baseName}${state.selectedImageIndex + 1}.${state.format}`;
        } else {
            // Sin prefijo: nombre original de esa imagen
            const originalName = item.name || 'imagen';
            fileName = `${originalName}.${state.format}`;
        }

        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Error processing image:', error);
        alert('Hubo un error al procesar la imagen.');
    } finally {
        elements.processSelectedBtn.disabled = false;
        elements.processSelectedBtn.innerHTML = originalText;
    }
}

// ===== Batch Mode Logic =====

function handleGlobalLayoutChange(e) {
    if (!state.batchMode) return;

    const val = parseInt(e.target.value);
    if (!val || val <= 0) return;

    if (e.target.id === 'globalWidthInput') {
        state.globalWidth = val;
    } else if (e.target.id === 'globalHeightInput') {
        state.globalHeight = val;
    } else if (e.target.id === 'spacingInput') {
        state.spacing = val;
    }

    // Update all images to use global settings (unless we want to support mixed settings later)
    state.batchImages.forEach(img => {
        if (e.target.id === 'globalWidthInput') img.width = val;
        if (e.target.id === 'globalHeightInput') img.height = val;
    });

    updatePreview();
}

function handleBatchCanvasClick(e) {
    const rect = elements.canvas.getBoundingClientRect();
    // Calculate click position relative to the canvas element
    // Note: If canvas is scaled via CSS (max-height), we need to map client coordinates to canvas coordinates.
    // However, drawBatchCanvas sets canvas.width/height to the full grid size.
    // If CSS constrains it, we need to account for that scale.

    const scaleX = elements.canvas.width / rect.width;
    const scaleY = elements.canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const layout = calculateBatchLayout();

    // Calculate the scale factor that was applied to the canvas
    let scaleFactor = 1;
    let maxWidth = 0;
    let maxHeight = 0;

    layout.forEach(pos => {
        maxWidth = Math.max(maxWidth, pos.x + pos.width);
        maxHeight = Math.max(maxHeight, pos.y + pos.height);
    });

    maxWidth += state.spacing;
    maxHeight += state.spacing;

    if (maxWidth > state.maxCanvasSize || maxHeight > state.maxCanvasSize) {
        scaleFactor = Math.min(
            state.maxCanvasSize / maxWidth,
            state.maxCanvasSize / maxHeight
        );
    }

    let clickedIndex = -1;
    layout.forEach((pos, index) => {
        const scaledX = pos.x * scaleFactor;
        const scaledY = pos.y * scaleFactor;
        const scaledWidth = pos.width * scaleFactor;
        const scaledHeight = pos.height * scaleFactor;

        if (x >= scaledX && x <= scaledX + scaledWidth &&
            y >= scaledY && y <= scaledY + scaledHeight) {
            clickedIndex = index;
        }
    });

    state.selectedImageIndex = clickedIndex;
    updateBatchControls();
    updatePreview();
}

function updateBatchControls() {
    if (state.selectedImageIndex !== -1) {
        // Show controls for selected image
        const imgData = state.batchImages[state.selectedImageIndex];

        elements.widthInput.value = imgData.width;
        elements.heightInput.value = imgData.height;
        elements.qualitySlider.value = imgData.quality;
        elements.qualityValue.textContent = imgData.quality + '%';
        elements.maintainAspect.checked = imgData.maintainAspect;
        // NO actualizar el campo de nombre - mantener el prefijo base
        // elements.fileName.value = imgData.name; // ELIMINADO

        elements.maintainAspect.checked = imgData.maintainAspect;
        // NO actualizar el campo de nombre - mantener el prefijo base
        // elements.fileName.value = imgData.name; // ELIMINADO

        elements.batchLayoutControls.classList.add('opacity-50');
        elements.processSelectedBtn.disabled = false;

        // Update file size estimate for this specific image
        updateFileSizeEstimate();
    } else {
        // Global mode
        elements.widthInput.value = '';
        elements.heightInput.value = '';
        elements.batchLayoutControls.classList.remove('opacity-50');
        elements.estimateValue.textContent = 'Selecciona una imagen';
        elements.processSelectedBtn.disabled = true;
    }
}

function calculateBatchLayout() {
    const count = state.batchImages.length;
    if (count === 0) return [];

    // For preview, use smaller dimensions when there are many images
    // to prevent canvas size issues
    const useThumbnails = count > 12;
    const maxThumbSize = useThumbnails ? state.thumbnailSize : Infinity;

    // Simple grid: try to make a square-ish grid
    const cols = Math.ceil(Math.sqrt(count));

    const positions = [];
    let currentX = state.spacing;
    let currentY = state.spacing;
    let currentRowHeight = 0;

    for (let i = 0; i < count; i++) {
        const img = state.batchImages[i];
        let w = img.width;
        let h = img.height;

        // Scale down for preview if using thumbnails
        if (useThumbnails) {
            const aspect = w / h;
            if (w > h) {
                w = Math.min(w, maxThumbSize);
                h = w / aspect;
            } else {
                h = Math.min(h, maxThumbSize);
                w = h * aspect;
            }
            // Round to integers
            w = Math.round(w);
            h = Math.round(h);
        }

        // Grid position
        const col = i % cols;

        if (col === 0 && i > 0) {
            currentX = state.spacing;
            currentY += currentRowHeight + state.spacing;
            currentRowHeight = 0;
        }

        positions.push({
            x: currentX,
            y: currentY,
            width: w,
            height: h,
            originalWidth: img.width,
            originalHeight: img.height
        });

        currentX += w + state.spacing;
        currentRowHeight = Math.max(currentRowHeight, h);
    }

    return positions;
}

function addToBatchQueue(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Create a thumbnail for preview to save memory
            const thumbnailCanvas = document.createElement('canvas');
            const maxSize = 400; // Reduced from 800 to 400 for better performance
            let thumbWidth = img.width;
            let thumbHeight = img.height;

            // Scale down if image is too large
            if (thumbWidth > maxSize || thumbHeight > maxSize) {
                const aspect = thumbWidth / thumbHeight;
                if (thumbWidth > thumbHeight) {
                    thumbWidth = maxSize;
                    thumbHeight = maxSize / aspect;
                } else {
                    thumbHeight = maxSize;
                    thumbWidth = maxSize * aspect;
                }
            }

            thumbnailCanvas.width = thumbWidth;
            thumbnailCanvas.height = thumbHeight;
            const thumbCtx = thumbnailCanvas.getContext('2d');
            thumbCtx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

            const thumbnailImg = new Image();
            thumbnailImg.onload = () => {
                const isFirstImage = state.batchImages.length === 0;

                state.batchImages.push({
                    file: file,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    image: thumbnailImg, // Use thumbnail for preview
                    originalImage: img, // Keep original for processing
                    // Por defecto, usar el tamaño original de la imagen
                    width: img.width,
                    height: img.height,
                    originalWidth: img.width,
                    originalHeight: img.height,
                    quality: state.quality,
                    maintainAspect: state.maintainAspect,
                    focusX: 0.5,
                    focusY: 0.5,
                    processed: false
                });

                // Update the batch queue UI (but don't redraw canvas yet)
                updateBatchQueueUIOnly();

                // For first image, select it and update preview
                if (isFirstImage) {
                    state.selectedImageIndex = 0;
                    updateBatchControls();
                    // Delay canvas redraw to avoid freezing
                    requestAnimationFrame(() => {
                        updatePreview();
                    });
                } else if (!state.pendingCanvasUpdate) {
                    // Delay canvas redraw to avoid freezing
                    state.pendingCanvasUpdate = true;
                    requestAnimationFrame(() => {
                        updatePreview();
                        state.pendingCanvasUpdate = false;
                    });
                }
            };
            thumbnailImg.src = thumbnailCanvas.toDataURL('image/jpeg', 0.8);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}



// ===== Initialize Batch Mode UI =====
function initBatchMode() {
    // Update file input to allow multiple files
    elements.fileInput.multiple = true;

    // Update UI text for batch mode
    elements.uploadTitle.textContent = 'Arrastra tus imágenes aquí';
    elements.uploadText.textContent = 'o haz clic para seleccionar múltiples';
    elements.selectFileBtn.textContent = 'Seleccionar Imágenes';

    // Show batch mode UI elements
    elements.batchLayoutControls.classList.remove('hidden');
    elements.resizeControls.classList.add('hidden');
    elements.globalWidthInput.value = state.globalWidth;
    elements.globalHeightInput.value = state.globalHeight;
}

// ===== Initialize Application =====
initEventListeners();
initBatchMode();
