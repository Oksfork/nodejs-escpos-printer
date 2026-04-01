// Estado de la aplicación
let currentTab = 'printers'; // Pestaña activa por defecto
let printers = [];
let config = {};

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
    setupEventListeners();
    // Inicializar la pestaña activa
    initializeActiveTab();
    loadPrinters();
    loadConfig();
    loadCurrentLogo();
});

// Inicializar la aplicación
async function initializeApp() {
    try {
        // Configurar fecha actual para OT (solo si existe el elemento)
        const otDateElement = document.getElementById('otDate');
        if (otDateElement) {
            const today = new Date().toISOString().split('T')[0];
            otDateElement.value = today;
        }
        
        // No mostrar toast de éxito al inicio para no molestar
        // showToast('Aplicación iniciada correctamente', 'success');
    } catch (error) {
        console.error('Error inicializando la aplicación:', error);
        showToast('Error al inicializar la aplicación', 'error');
    }
}

// Inicializar la pestaña activa
function initializeActiveTab() {
    // Encontrar la pestaña activa en el HTML
    const activeNavItem = document.querySelector('.nav-item.active');
    if (activeNavItem) {
        const tabName = activeNavItem.dataset.tab;
        if (tabName) {
            // Usar switchTab para asegurar que todo se configure correctamente
            switchTab(tabName);
        }
    } else {
        // Si no hay pestaña activa, activar "printers" por defecto
        switchTab('printers');
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Navegación por pestañas
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);
        });
    });

    // Formulario de remito (si existe)
    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', handleOrderSubmit);
    }

    // Formulario de OT (si existe)
    const otForm = document.getElementById('otForm');
    if (otForm) {
        otForm.addEventListener('submit', handleOTSubmit);
    }

    // Cargar impresoras en ambos formularios (si existen)
    const orderPrinter = document.getElementById('orderPrinter');
    if (orderPrinter) {
        orderPrinter.addEventListener('change', updatePrinterSelection);
    }

    const otPrinter = document.getElementById('otPrinter');
    if (otPrinter) {
        otPrinter.addEventListener('change', updatePrinterSelection);
    }

    // Event listeners para manejo de logo
    setupLogoEventListeners();
}

// Cambiar pestaña activa
function switchTab(tabName) {
    // Actualizar navegación
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const navItem = document.querySelector(`[data-tab="${tabName}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }

    // Actualizar contenido
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
    }

    currentTab = tabName;

    // Acciones específicas por pestaña
    if (tabName === 'printers') {
        refreshPrinters();
    }
}

// Cargar impresoras disponibles (solo actualiza el array, no la UI)
async function loadPrinters() {
    try {
        // Verificar que electronAPI esté disponible
        if (!window.electronAPI || !window.electronAPI.getPrinters) {
            throw new Error('API de Electron no disponible');
        }
        
        const result = await window.electronAPI.getPrinters();
        
        if (result && result.success) {
            printers = result.printers || [];
            updatePrinterSelects();
            
            // Solo mostrar toast si estamos en la pestaña de impresoras
            if (currentTab === 'printers') {
                if (printers.length > 0) {
                    showToast(`${printers.length} impresora(s) encontrada(s)`, 'success');
                } else {
                    showToast('No se encontraron impresoras térmicas compartidas', 'warning');
                }
            }
        } else {
            const errorMsg = result?.error || 'Error desconocido';
            const errorDetails = result?.details || {};
            const logFile = result?.logFile || '';
            
            console.error('Error en getPrinters:', errorMsg);
            console.error('Detalles del error:', errorDetails);
            if (logFile) {
                console.error('Archivo de log:', logFile);
            }
            
            // Solo mostrar toast si estamos en la pestaña de impresoras
            if (currentTab === 'printers') {
                showToast('Error al cargar impresoras: ' + errorMsg, 'error');
            }
            printers = [];
        }
    } catch (error) {
        console.error('Error cargando impresoras:', error);
        // Solo mostrar toast si estamos en la pestaña de impresoras
        if (currentTab === 'printers') {
            showToast('Error al cargar impresoras: ' + (error.message || 'Error desconocido'), 'error');
        }
        printers = [];
    }
}

// Actualizar selects de impresoras
function updatePrinterSelects() {
    const orderSelect = document.getElementById('orderPrinter');
    const otSelect = document.getElementById('otPrinter');
    
    // Verificar que los elementos existan antes de usarlos
    if (orderSelect) {
        // Limpiar opciones existentes
        orderSelect.innerHTML = '<option value="">Seleccionar impresora...</option>';
        
        // Agregar impresoras
        printers.forEach(printer => {
            const option = new Option(printer, printer);
            orderSelect.add(option);
        });
    }
    
    if (otSelect) {
        // Limpiar opciones existentes
        otSelect.innerHTML = '<option value="">Seleccionar impresora...</option>';
        
        // Agregar impresoras
        printers.forEach(printer => {
            const option = new Option(printer, printer);
            otSelect.add(option);
        });
    }
}

// Actualizar selección de impresora
function updatePrinterSelection(event) {
    const selectedPrinter = event.target.value;
    const otherSelect = event.target.id === 'orderPrinter' ? 
        document.getElementById('otPrinter') : 
        document.getElementById('orderPrinter');
    
    // Sincronizar selección entre ambos formularios
    otherSelect.value = selectedPrinter;
}

// Cargar configuración
async function loadConfig() {
    try {
        const result = await window.electronAPI.getConfig();
        
        if (result.success) {
            config = result.config;
            updateConfigForm();
        } else {
            console.error('Error cargando configuración:', result.error);
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

// Actualizar formulario de configuración
function updateConfigForm() {
    document.getElementById('appName').value = config.appName || '';
    document.getElementById('contactoTecnico').value = config.contactoTecnico || '';
    document.getElementById('contactoLaboratorio').value = config.contactoLaboratorio || '';
    document.getElementById('diasVencimiento').value = config.diasVencimiento || '';
}

// Manejar envío del formulario de remito
async function handleOrderSubmit(event) {
    event.preventDefault();
    
    try {
        showLoading(true);
        
        const formData = new FormData(event.target);
        const printData = {
            _printer: formData.get('printer'),
            orden: {
                id: formData.get('orderId'),
                total: formData.get('total'),
                cliente: {
                    nombre: formData.get('clientName'),
                    apellido: formData.get('clientLastName'),
                    telefono: formData.get('clientPhone'),
                    email: formData.get('clientEmail'),
                    direccion: formData.get('clientAddress'),
                    localidad: formData.get('clientCity'),
                    provincia: {
                        nombre: formData.get('clientProvince')
                    }
                },
                profesional: {
                    nombre: formData.get('profName'),
                    apellido: formData.get('profLastName'),
                    telefono: formData.get('profPhone'),
                    email: formData.get('profEmail')
                },
                paciente: {
                    nombre: formData.get('patientName'),
                    apellido: formData.get('patientLastName')
                }
            },
            items: getOrderItems()
        };

        const result = await window.electronAPI.printOrder(printData);
        
        if (result.success) {
            showToast('Remito impreso correctamente', 'success');
            clearForm();
        } else {
            showToast('Error al imprimir: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error imprimiendo remito:', error);
        showToast('Error al imprimir remito', 'error');
    } finally {
        showLoading(false);
    }
}

// Manejar envío del formulario de OT
async function handleOTSubmit(event) {
    event.preventDefault();
    
    try {
        showLoading(true);
        
        const formData = new FormData(event.target);
        const printData = {
            _ot_id: formData.get('otId'),
            _printer: formData.get('printer'),
            doctor: formData.get('doctor'),
            paciente: formData.get('patient'),
            prof: formData.get('prof'),
            fechasalida: formData.get('fechasalida'),
            items: getOTItems()
        };

        const result = await window.electronAPI.printOT(printData);
        
        if (result.success) {
            showToast('OT impresa correctamente', 'success');
            clearOTForm();
        } else {
            showToast('Error al imprimir: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error imprimiendo OT:', error);
        showToast('Error al imprimir OT', 'error');
    } finally {
        showLoading(false);
    }
}

// Obtener items del formulario de remito
function getOrderItems() {
    const items = [];
    const itemRows = document.querySelectorAll('#itemsContainer .item-row');
    
    itemRows.forEach(row => {
        const quantity = row.querySelector('input[name="itemQuantity"]').value;
        const description = row.querySelector('input[name="itemDescription"]').value;
        const price = row.querySelector('input[name="itemPrice"]').value;
        
        if (description && quantity && price) {
            items.push({
                cantidad: quantity,
                trabajo: { descripcion: description },
                precio: price
            });
        }
    });
    
    return items;
}

// Obtener items del formulario de OT
function getOTItems() {
    const items = [];
    const itemRows = document.querySelectorAll('#otItemsContainer .ot-item-row');
    
    itemRows.forEach(row => {
        const description = row.querySelector('input[name="otItemDescription"]').value;
        const quantity = row.querySelector('input[name="otItemQuantity"]').value;
        const pieces = row.querySelector('input[name="otItemPieces"]').value;
        const color = row.querySelector('input[name="otItemColor"]').value;
        
        if (description && quantity) {
            items.push({
                trabajo: { descripcion: description },
                cantidad: quantity,
                piezas: pieces,
                color: color
            });
        }
    });
    
    return items;
}

// Agregar item al formulario de remito
function addItem() {
    const container = document.getElementById('itemsContainer');
    const itemRow = document.createElement('div');
    itemRow.className = 'item-row';
    
    itemRow.innerHTML = `
        <div class="form-group">
            <label>Cantidad:</label>
            <input type="number" name="itemQuantity" min="1" value="1">
        </div>
        <div class="form-group">
            <label>Descripción:</label>
            <input type="text" name="itemDescription" placeholder="Descripción del trabajo">
        </div>
        <div class="form-group">
            <label>Precio:</label>
            <input type="number" name="itemPrice" step="0.01" min="0">
        </div>
        <button type="button" class="btn-remove-item" onclick="removeItem(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(itemRow);
}

// Remover item del formulario de remito
function removeItem(button) {
    button.parentElement.remove();
}

// Agregar item al formulario de OT
function addOTItem() {
    const container = document.getElementById('otItemsContainer');
    const itemRow = document.createElement('div');
    itemRow.className = 'ot-item-row';
    
    itemRow.innerHTML = `
        <div class="form-group">
            <label>Descripción:</label>
            <input type="text" name="otItemDescription" placeholder="Descripción del trabajo">
        </div>
        <div class="form-group">
            <label>Cantidad:</label>
            <input type="number" name="otItemQuantity" min="1" value="1">
        </div>
        <div class="form-group">
            <label>Piezas:</label>
            <input type="text" name="otItemPieces" placeholder="Piezas">
        </div>
        <div class="form-group">
            <label>Color:</label>
            <input type="text" name="otItemColor" placeholder="Color">
        </div>
        <button type="button" class="btn-remove-item" onclick="removeOTItem(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(itemRow);
}

// Remover item del formulario de OT
function removeOTItem(button) {
    button.parentElement.remove();
}

// Limpiar formulario de remito
function clearForm() {
    document.getElementById('orderForm').reset();
    const itemsContainer = document.getElementById('itemsContainer');
    itemsContainer.innerHTML = `
        <div class="item-row">
            <div class="form-group">
                <label>Cantidad:</label>
                <input type="number" name="itemQuantity" min="1" value="1">
            </div>
            <div class="form-group">
                <label>Descripción:</label>
                <input type="text" name="itemDescription" placeholder="Descripción del trabajo">
            </div>
            <div class="form-group">
                <label>Precio:</label>
                <input type="number" name="itemPrice" step="0.01" min="0">
            </div>
            <button type="button" class="btn-remove-item" onclick="removeItem(this)">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
}

// Limpiar formulario de OT
function clearOTForm() {
    document.getElementById('otForm').reset();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('otDate').value = today;
    
    const itemsContainer = document.getElementById('otItemsContainer');
    itemsContainer.innerHTML = `
        <div class="ot-item-row">
            <div class="form-group">
                <label>Descripción:</label>
                <input type="text" name="otItemDescription" placeholder="Descripción del trabajo">
            </div>
            <div class="form-group">
                <label>Cantidad:</label>
                <input type="number" name="otItemQuantity" min="1" value="1">
            </div>
            <div class="form-group">
                <label>Piezas:</label>
                <input type="text" name="otItemPieces" placeholder="Piezas">
            </div>
            <div class="form-group">
                <label>Color:</label>
                <input type="text" name="otItemColor" placeholder="Color">
            </div>
            <button type="button" class="btn-remove-item" onclick="removeOTItem(this)">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
}

// Actualizar lista de impresoras
async function refreshPrinters() {
    const printersList = document.getElementById('printersList');
    
    if (!printersList) {
        console.error('Elemento printersList no encontrado');
        return;
    }
    
    // Mostrar estado de carga
    printersList.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Cargando impresoras...</span>
        </div>
    `;
    
    try {
        // Verificar que electronAPI esté disponible
        if (!window.electronAPI || !window.electronAPI.getPrinters) {
            throw new Error('API de Electron no disponible');
        }
        
        // Cargar impresoras
        const result = await window.electronAPI.getPrinters();
        
        if (result && result.success) {
            printers = result.printers || [];
            
            // Actualizar la lista visual
            if (printers.length > 0) {
                printersList.innerHTML = '';
                printers.forEach(printer => {
                    const printerItem = document.createElement('div');
                    printerItem.className = 'printer-item';
                    printerItem.innerHTML = `
                        <div class="printer-info">
                            <i class="fas fa-print"></i>
                            <span class="printer-name">${printer}</span>
                        </div>
                        <span class="printer-status available">Disponible</span>
                    `;
                    printersList.appendChild(printerItem);
                });
                
                showToast(`${printers.length} impresora(s) encontrada(s)`, 'success');
            } else {
                printersList.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>No se encontraron impresoras térmicas compartidas. Asegúrate de compartir las impresoras en Windows.</span>
                    </div>
                `;
                showToast('No se encontraron impresoras térmicas compartidas', 'warning');
            }
        } else {
            const errorMsg = result?.error || 'Error desconocido';
            const errorDetails = result?.details || {};
            const logFile = result?.logFile || '';
            
            console.error('Error en getPrinters:', errorMsg);
            console.error('Detalles del error:', errorDetails);
            if (logFile) {
                console.error('Archivo de log:', logFile);
            }
            
            printers = [];
            printersList.innerHTML = `
                <div class="loading">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div style="text-align: left; padding: 10px;">
                        <p style="margin-bottom: 10px;"><strong>Error al cargar impresoras</strong></p>
                        <p style="margin-bottom: 5px; color: #d32f2f;">${errorMsg}</p>
                        <p style="margin-bottom: 5px;">Para ver más detalles del error:</p>
                        <ul style="margin-left: 20px; margin-top: 5px;">
                            <li>Presiona <strong>F12</strong> o <strong>Ctrl+Shift+I</strong> para abrir DevTools</li>
                            <li>Revisa la pestaña <strong>Console</strong> para ver el error completo</li>
                        </ul>
                        ${logFile ? `<p style="margin-top: 10px; font-size: 0.9em; color: #666;">Log guardado en: ${logFile}</p>` : ''}
                    </div>
                </div>
            `;
            showToast('Error al cargar impresoras: ' + errorMsg, 'error');
        }
    } catch (error) {
        console.error('Error en refreshPrinters:', error);
        printers = [];
        printersList.innerHTML = `
            <div class="loading">
                <i class="fas fa-exclamation-triangle"></i>
                <div style="text-align: left; padding: 10px;">
                    <p style="margin-bottom: 10px;"><strong>Error al cargar impresoras</strong></p>
                    <p style="margin-bottom: 5px;">Para ver más detalles del error:</p>
                    <ul style="margin-left: 20px; margin-top: 5px;">
                        <li>Presiona <strong>F12</strong> o <strong>Ctrl+Shift+I</strong> para abrir DevTools</li>
                        <li>Revisa la pestaña <strong>Console</strong> para ver el error completo</li>
                    </ul>
                    <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
                        El error también se ha guardado en un archivo de log.
                    </p>
                </div>
            </div>
        `;
        showToast('Error al cargar impresoras: ' + (error.message || 'Error desconocido'), 'error');
    }
}

// Guardar configuración
async function saveSettings() {
    try {
        showLoading(true);
        
        const newConfig = {
            appName: document.getElementById('appName').value,
            contactoTecnico: document.getElementById('contactoTecnico').value,
            contactoLaboratorio: document.getElementById('contactoLaboratorio').value,
            diasVencimiento: document.getElementById('diasVencimiento').value
        };
        
        // Verificar que electronAPI esté disponible
        if (!window.electronAPI || !window.electronAPI.saveConfig) {
            throw new Error('API de Electron no disponible');
        }
        
        // Guardar la configuración
        const result = await window.electronAPI.saveConfig(newConfig);
        
        if (result && result.success) {
            // Actualizar el objeto local
            config = { ...config, ...newConfig };
            showToast('Configuración guardada correctamente', 'success');
        } else {
            const errorMsg = result?.error || 'Error desconocido';
            console.error('Error guardando configuración:', errorMsg);
            showToast('Error al guardar configuración: ' + errorMsg, 'error');
        }
    } catch (error) {
        console.error('Error guardando configuración:', error);
        showToast('Error al guardar configuración: ' + (error.message || 'Error desconocido'), 'error');
    } finally {
        showLoading(false);
    }
}

// Mostrar/ocultar loading
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
    }
}

// Mostrar toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = toast.querySelector('.toast-message');
    
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Manejar errores globales
window.addEventListener('error', (event) => {
    console.error('Error global:', event.error);
    console.error('Stack trace:', event.error?.stack);
    showToast('Ha ocurrido un error inesperado. Presiona F12 para ver detalles.', 'error');
});

// Manejar errores de promesas no capturadas
window.addEventListener('unhandledrejection', (event) => {
    console.error('Promesa rechazada:', event.reason);
    console.error('Stack trace:', event.reason?.stack);
    showToast('Error en operación asíncrona. Presiona F12 para ver detalles.', 'error');
});

// Agregar información sobre cómo ver errores
console.log('%c=== MOLAB PRINTER - DEBUG INFO ===', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
console.log('%cPara ver errores en producción:', 'color: #2196F3; font-weight: bold;');
console.log('1. Presiona F12 o Ctrl+Shift+I para abrir DevTools');
console.log('2. Revisa la pestaña Console para ver errores detallados');
console.log('3. Los errores también se guardan en un archivo de log');
console.log('%c====================================', 'color: #4CAF50; font-weight: bold;');

// ==================== FUNCIONES DE MANEJO DE LOGO ====================

// Configurar event listeners para el logo
function setupLogoEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('logoFileInput');
    const saveBtn = document.getElementById('saveLogoBtn');
    const cancelBtn = document.getElementById('cancelLogoBtn');

    // Click en área de upload
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelection(files[0]);
        }
    });

    // Selección de archivo
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    // Botones de acción
    saveBtn.addEventListener('click', saveLogo);
    cancelBtn.addEventListener('click', cancelLogoUpload);
}

// Cargar logo actual
async function loadCurrentLogo() {
    try {
        const result = await window.electronAPI.getCurrentLogo();
        
        if (result.success) {
            displayCurrentLogo(result.logo);
        } else {
            hideCurrentLogo();
        }
    } catch (error) {
        console.error('Error cargando logo actual:', error);
        hideCurrentLogo();
    }
}

// Mostrar logo actual
function displayCurrentLogo(logoBase64) {
    const logoImage = document.getElementById('currentLogoImage');
    const noLogoMessage = document.getElementById('noLogoMessage');
    
    logoImage.src = `data:image/png;base64,${logoBase64}`;
    logoImage.style.display = 'block';
    noLogoMessage.style.display = 'none';
}

// Ocultar logo actual
function hideCurrentLogo() {
    const logoImage = document.getElementById('currentLogoImage');
    const noLogoMessage = document.getElementById('noLogoMessage');
    
    logoImage.style.display = 'none';
    noLogoMessage.style.display = 'flex';
}

// Manejar selección de archivo
async function handleFileSelection(file) {
    // Validar tipo de archivo
    if (!file.type.includes('png')) {
        showToast('Solo se aceptan archivos PNG', 'error');
        return;
    }

    // Validar tamaño (máximo 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('El archivo es demasiado grande. Máximo 10MB', 'error');
        return;
    }

    try {
        showUploadProgress(0, 'Leyendo archivo...');
        
        // Leer archivo como base64
        const reader = new FileReader();

        reader.onerror = (error) => {
            console.error('Error leyendo archivo:', error);
            showToast('Error leyendo el archivo. Por favor, intenta de nuevo.', 'error');
            resetUploadArea();
        };

        reader.onload = async (e) => {
            try {
                if (!e.target.result || typeof e.target.result !== 'string') {
                    throw new Error('Formato de archivo inválido');
                }
                const parts = e.target.result.split(',');
                if (parts.length < 2) {
                    throw new Error('No se pudo extraer la imagen del archivo');
                }
                
                const imageBuffer = parts[1]; // Remover data:image/png;base64,
                
                // Validar que el buffer no esté vacío
                if (!imageBuffer || imageBuffer.length === 0) {
                    throw new Error('El archivo está vacío');
                }
                
                showUploadProgress(30, 'Procesando imagen...');
                
                // Redimensionar imagen
                const resizeResult = await window.electronAPI.resizeImage({
                    imageBuffer: imageBuffer,
                    width: 300,
                    height: 110
                });
                
                if (resizeResult.success) {
                    showUploadProgress(70, 'Preparando vista previa...');
                    
                    // Mostrar vista previa
                    displayLogoPreview(resizeResult.resizedImage);
                    
                    showUploadProgress(100, 'Listo para guardar');
                    
                    // Mostrar botones de acción
                    showUploadActions();
                    
                    // Guardar datos para el guardado
                    window.currentLogoData = {
                        imageBuffer: resizeResult.resizedImage,
                        originalFile: file.name
                    };
                    
                } else {
                    throw new Error(resizeResult.error || 'Error al redimensionar la imagen');
                }
                
            } catch (error) {
                console.error('Error procesando archivo:', error);
        showToast('Error procesando el archivo: ' + error.message, 'error');
        resetUploadArea();
            }
        };
        
        reader.readAsDataURL(file);
        
    } catch (error) {
        console.error('Error procesando archivo:', error);
        showToast('Error procesando el archivo: ' + error.message, 'error');
        resetUploadArea();
    }
}

// Mostrar vista previa del logo
function displayLogoPreview(imageBase64) {
    const logoPreview = document.getElementById('logoPreview');
    const logoImage = document.getElementById('currentLogoImage');
    const noLogoMessage = document.getElementById('noLogoMessage');
    
    logoImage.src = `data:image/png;base64,${imageBase64}`;
    logoImage.style.display = 'block';
    noLogoMessage.style.display = 'none';
}

// Mostrar progreso de upload
function showUploadProgress(percentage, text) {
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    uploadProgress.style.display = 'block';
    progressFill.style.width = percentage + '%';
    progressText.textContent = text;
}

// Mostrar botones de acción
function showUploadActions() {
    const uploadActions = document.getElementById('uploadActions');
    uploadActions.style.display = 'flex';
}

// Ocultar elementos de upload
function hideUploadElements() {
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadActions').style.display = 'none';
}

// Resetear área de upload
function resetUploadArea() {
    hideUploadElements();
    document.getElementById('logoFileInput').value = '';
    window.currentLogoData = null;
}

// Guardar logo
async function saveLogo() {
    if (!window.currentLogoData) {
        showToast('No hay logo para guardar', 'error');
        return;
    }

    try {
        showLoading(true);
        
        const result = await window.electronAPI.saveLogo(window.currentLogoData);
        
        if (result.success) {
            showToast('Logo guardado correctamente', 'success');
            resetUploadArea();
            
            // Actualizar vista del logo actual
            await loadCurrentLogo();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error guardando logo:', error);
        showToast('Error guardando logo: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Cancelar upload de logo
function cancelLogoUpload() {
    resetUploadArea();
    
    // Restaurar logo actual
    loadCurrentLogo();
    
    showToast('Carga de logo cancelada', 'warning');
}
