const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

// Configurar logging de errores
const logDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);

function logError(message, error = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}${error ? `\nError: ${error.message || error}\nStack: ${error.stack || 'N/A'}` : ''}\n---\n`;
  
  try {
    fs.appendFileSync(logFile, logMessage, 'utf8');
  } catch (err) {
    console.error('Error escribiendo en log:', err);
  }
  
  // También mostrar en consola
  console.error(`[ERROR] ${message}`, error || '');
}

// Mantener una referencia global del objeto window
let mainWindow;
let tray = null;
let isQuitting = false;
let httpServer = null;
const PORT = 8181;

// Serialize print jobs per printer to avoid mixed ESC/POS states
const printQueues = new Map();

function normalizePrinterKey(printerName) {
  const key = String(printerName || '').trim();
  return key.length ? key : '__unknown_printer__';
}

function enqueuePrintJob(printerName, jobFn) {
  const key = normalizePrinterKey(printerName);
  const prev = printQueues.get(key) || Promise.resolve();

  // Always continue the chain even if a job fails
  const next = prev
    .catch(() => undefined)
    .then(() => jobFn());

  printQueues.set(
    key,
    next.finally(() => {
      // Clean up if this is still the tail
      if (printQueues.get(key) === next) {
        printQueues.delete(key);
      }
    })
  );

  return next;
}

function escposInitialize(printer) {
  // ESC @ (initialize printer): clears buffer/modes on most ESC/POS compatibles
  try {
    printer.add(Buffer.from([0x1b, 0x40]));
  } catch (e) {
    // If a given interface/type doesn't support raw add, don't break printing
    console.warn('No se pudo inicializar ESC/POS (ESC @):', e?.message || e);
  }
}

/** Tras imprimir gráficos, forzar salida de modos raros (típico en térmicas viejas). */
function escposAfterImage(printer) {
  escposInitialize(printer);
  try {
    printer.setTextNormal();
    printer.alignLeft();
  } catch (e) {
    console.warn('escposAfterImage:', e?.message || e);
  }
}

function escposBeforeCut(printer) {
  // Defensive reset to avoid carrying weird modes across jobs
  escposInitialize(printer);
  try {
    printer.setTextNormal();
    printer.alignLeft();
  } catch (e) {
    console.warn('escposBeforeCut:', e?.message || e);
  }
}

function getPaperConfig(appConfig) {
  const paperWidthMm = Number(appConfig?.paperWidthMm || 58);
  const safePaperWidthMm = paperWidthMm === 80 ? 80 : 58;
  // Typical ESC/POS printable dot widths at 203dpi:
  // 58mm ≈ 384 dots, 80mm ≈ 576 dots
  const logoTargetWidthPx = safePaperWidthMm === 80 ? 576 : 384;
  // Text width is in characters (affects folding/tables). These are practical defaults.
  const textWidthChars = safePaperWidthMm === 80 ? 72 : 48;
  return { paperWidthMm: safePaperWidthMm, logoTargetWidthPx, textWidthChars };
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setSkipTaskbar(false);
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'images', 'logo', 'molab_app_logo.png');
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    logError('Tray: no se pudo cargar el icono', new Error(iconPath));
    return;
  }
  tray = new Tray(image);
  tray.setToolTip('Molab Printer');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Abrir Molab Printer',
        click: () => showMainWindow()
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  if (process.platform !== 'darwin') {
    tray.on('click', () => showMainWindow());
  }
}

const AUTO_START_ARG = '--molab-auto-start';

function shouldStartHiddenInTray() {
  if (process.argv.includes(AUTO_START_ARG)) return true;
  if (process.platform === 'darwin') {
    try {
      const s = app.getLoginItemSettings();
      return Boolean(s.wasOpenedAsHidden);
    } catch {
      return false;
    }
  }
  return false;
}

function ensureAutoLaunchOnLogin() {
  if (!app.isPackaged) return;
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: true,
        args: [AUTO_START_ARG]
      });
    } else {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true
      });
    }
  } catch (err) {
    logError('No se pudo registrar inicio automático con la sesión', err);
  }
}

function createWindow() {
  // Crear la ventana del navegador
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'renderer', 'preload.js')
    },
    icon: path.join(__dirname, 'images', 'logo', 'molab_app_logo.png'),
    title: 'Molab Printer - Sistema de Impresión Térmica',
    show: false // No mostrar hasta que esté listo
  });

  // Cargar el archivo HTML
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Mostrar la ventana cuando esté lista (oculta si el SO la lanzó al iniciar sesión)
  mainWindow.once('ready-to-show', () => {
    if (shouldStartHiddenInTray()) {
      mainWindow.hide();
      mainWindow.setSkipTaskbar(true);
    } else {
      mainWindow.show();
    }
  });

  // Abrir las herramientas de desarrollo en modo desarrollo
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Permitir abrir DevTools en producción con F12 o Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      mainWindow.setSkipTaskbar(true);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Función para iniciar el servidor HTTP
function startHttpServer() {
  try {
    const expressApp = express();
    
    // Configuración de CORS más completa
    const corsOptions = {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: false,
      optionsSuccessStatus: 200
    };
    
    // Aplicar CORS antes de otros middlewares
    expressApp.use(cors(corsOptions));
    
    // Middleware para manejar preflight OPTIONS requests
    expressApp.options('*', cors(corsOptions));
    
    // Middleware para parsear JSON
    expressApp.use(express.json());
    
    // CORS headers adicionales (por si acaso)
    expressApp.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      res.header("Access-Control-Max-Age", "3600");
      
      // Manejar preflight requests
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      
      next();
    });

    // Endpoint para obtener impresoras
    expressApp.get('/impresoras', (req, res) => {
      getPrinters().then(printers => {
        res.json({ printers });
      }).catch(error => {
        logError('Error en endpoint /impresoras', error);
        console.error('Error en /impresoras:', error);
        res.status(500).json({ 
          error: error.message || error.error || 'Error desconocido',
          details: error.details || {},
          logFile: logFile
        });
      });
    });

    // Endpoint para imprimir remito
    expressApp.post("/finish_order_print", async (req, res) => {
      try {
        const { _printer, orden, items } = req.body;
        const result = await enqueuePrintJob(_printer, () => printOrderData({ _printer, orden, items }));
        
        if (result.success) {
          res.json({ message: "Impresión enviada correctamente" });
        } else {
          res.status(500).json({ error: result.error });
        }
      } catch (error) {
        console.log("error", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Endpoint para imprimir OT
    expressApp.post("/print", async (req, res) => {
      try {
        const { _ot_id, _printer, doctor, paciente, items, fechasalida, prof } = req.body;
        const result = await enqueuePrintJob(_printer, () => printOTData({ _ot_id, _printer, doctor, paciente, items, fechasalida, prof }));
        
        if (result.success) {
          res.json({ message: "Impresión enviada correctamente" });
        } else {
          res.status(500).json({ error: result.error });
        }
      } catch (error) {
        console.log("error", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Endpoint de estado del servidor
    expressApp.get('/status', (req, res) => {
      res.json({ 
        status: 'running', 
        port: PORT,
        app: 'Molab Printer',
        version: '1.0.0'
      });
    });

    // Iniciar servidor
    httpServer = expressApp.listen(PORT, () => {
      console.log(`🚀 Servidor HTTP iniciado en puerto ${PORT}`);
      console.log(`📡 Acceso disponible en: http://localhost:${PORT}`);
      
      // Notificar a la interfaz que el servidor está corriendo
      if (mainWindow) {
        mainWindow.webContents.send('server-status', { 
          running: true, 
          port: PORT,
          url: `http://localhost:${PORT}`
        });
      }
    });

    httpServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`⚠️ Puerto ${PORT} ya está en uso`);
        const nextPort = PORT + 1;
        httpServer = expressApp.listen(nextPort, () => {
          console.log(`🚀 Servidor HTTP iniciado en puerto ${nextPort}`);
          console.log(`📡 Acceso disponible en: http://localhost:${nextPort}`);
        });
      } else {
        console.error('Error iniciando servidor:', error);
      }
    });

  } catch (error) {
    console.error('Error configurando servidor HTTP:', error);
  }
}

app.on('second-instance', () => {
  showMainWindow();
});

app.on('will-quit', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.whenReady().then(() => {
  ensureAutoLaunchOnLogin();
  createWindow();
  createTray();
  startHttpServer();
});

// Salir cuando todas las ventanas estén cerradas
app.on('window-all-closed', () => {
  // Cerrar el servidor HTTP
  if (httpServer) {
    httpServer.close(() => {
      console.log('🔌 Servidor HTTP cerrado');
    });
  }
  
  // En macOS es común que las aplicaciones permanezcan activas hasta que
  // se cierre explícitamente con Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  showMainWindow();
});

// Función para obtener impresoras disponibles
function getPrinters() {
  return new Promise((resolve, reject) => {
    // Verificar que estamos en Windows
    if (process.platform !== 'win32') {
      const errorMsg = 'Esta función solo está disponible en Windows';
      logError('getPrinters: Plataforma no soportada', new Error(errorMsg));
      reject({ error: errorMsg });
      return;
    }

    exec('wmic printer get Name,DriverName,Shared', { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        logError('Error ejecutando wmic para obtener impresoras', error);
        console.error('Error ejecutando wmic:', error);
        console.error('stderr:', stderr);
        
        // Si wmic falla, intentar con PowerShell como alternativa
        exec('powershell -Command "Get-Printer | Select-Object Name, DriverName, Shared | Format-Table -HideTableHeaders"', 
          { timeout: 10000 }, 
          (psError, psStdout, psStderr) => {
            if (psError) {
              const errorMsg = `Error obteniendo impresoras. wmic falló: ${error.message}. PowerShell falló: ${psError.message}`;
              logError('Error obteniendo impresoras (ambos métodos fallaron)', { wmic: error, powershell: psError });
              reject({ 
                error: errorMsg,
                details: {
                  wmicError: error.message,
                  powershellError: psError.message,
                  wmicStderr: stderr,
                  powershellStderr: psStderr
                }
              });
              return;
            }
            
            try {
              const lines = psStdout.split("\n").map(line => line.trim()).filter(line => line && line.length > 0);
              const printers = [];
              
              lines.forEach(line => {
                const parts = line.split(/\s{2,}/).filter(p => p.trim());
                if (parts.length >= 3) {
                  printers.push({
                    name: parts[0],
                    driver: parts[1],
                    shared: parts[2] === 'True' || parts[2] === 'TRUE'
                  });
                }
              });

              const thermalPrinters = printers.filter(p => p.shared).map((item) => item.driver);
              logError(`Impresoras obtenidas vía PowerShell: ${thermalPrinters.length} encontradas`);
              resolve(thermalPrinters.length > 0 ? thermalPrinters : []);
            } catch (parseError) {
              const errorMsg = `Error parseando resultado de PowerShell: ${parseError.message}`;
              logError('Error parseando resultado de PowerShell', parseError);
              reject({ error: errorMsg, details: { stdout: psStdout, parseError: parseError.message } });
            }
          }
        );
        return;
      }

      try {
        const lines = stdout.split("\n").slice(1).map(line => line.trim()).filter(line => line);
        const printers = lines.map(line => {
          const parts = line.split(/\s{2,}/).filter(p => p.trim());
          if (parts.length >= 3) {
            return {
              name: parts[0],
              driver: parts[1],
              shared: parts[2] === 'TRUE' || parts[2] === 'True'
            };
          }
          return null;
        }).filter(p => p !== null);

        const thermalPrinters = printers.filter(p => p.shared).map((item) => item.driver);
        logError(`Impresoras obtenidas vía wmic: ${thermalPrinters.length} encontradas`);
        resolve(thermalPrinters.length > 0 ? thermalPrinters : []);
      } catch (parseError) {
        const errorMsg = `Error parseando resultado de wmic: ${parseError.message}`;
        logError('Error parseando resultado de wmic', parseError);
        reject({ error: errorMsg, details: { stdout: stdout, parseError: parseError.message } });
      }
    });
  });
}

// Función para obtener configuración
// Busca primero en userData (donde se guarda en producción) y luego en __dirname (desarrollo)
function getConfig() {
  try {
    // Primero buscar en userData (funciona en desarrollo y producción)
    const userDataConfigPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(userDataConfigPath)) {
      const config = JSON.parse(fs.readFileSync(userDataConfigPath, 'utf8'));
      return config || { appName: "Molab Impresiones" };
    }
    
    // Si no existe en userData, buscar en __dirname (solo desarrollo)
    const devConfigPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(devConfigPath)) {
      const config = JSON.parse(fs.readFileSync(devConfigPath, 'utf8'));
      return config || { appName: "Molab Impresiones" };
    }
    
    // Si no existe ningún archivo, retornar valores por defecto
    return { appName: "Molab Impresiones" };
  } catch (err) {
    logError('Error leyendo configuración', err);
    console.error("Error leyendo configuración:", err);
    return { appName: "Molab Impresiones" };
  }
}

// Función para guardar configuración
function saveConfig(newConfig) {
  try {
    // Guardar en userData (funciona en desarrollo y producción)
    const configPath = path.join(app.getPath('userData'), 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    console.log("✅ Configuración guardada correctamente en:", configPath);
    logError(`Configuración guardada exitosamente en: ${configPath}`);
    return { success: true, path: configPath };
  } catch (error) {
    logError('Error guardando configuración', error);
    console.error("Error guardando configuración:", error);
    return { success: false, error: error.message };
  }
}

// Función helper para obtener la ruta del logo
// Busca primero en userData (donde se guarda en producción) y luego en __dirname (desarrollo)
function getLogoPath() {
  // Primero buscar en userData (funciona en desarrollo y producción)
  const userDataLogoPath = path.join(app.getPath('userData'), 'images', 'logo', 'logo.png');
  if (fs.existsSync(userDataLogoPath)) {
    return userDataLogoPath;
  }
  
  // Si no existe en userData, buscar en __dirname (solo desarrollo)
  const devLogoPath = path.join(__dirname, "images", "logo", "logo.png");
  if (fs.existsSync(devLogoPath)) {
    return devLogoPath;
  }
  
  return null;
}

// Función para obtener ruta de imagen
function getImagePath() {
  const imagePath = getLogoPath();
  
  if (!imagePath) {
    return { ok: false, reason: "no_logo" };
  }
  
  try {
    // Verificar que el archivo no esté vacío
    const stats = fs.statSync(imagePath);
    if (stats.size === 0) {
      console.warn("El archivo logo.png existe pero está vacío");
      return { ok: false, reason: "empty_file" };
    }
    
    // Verificar que sea un PNG válido leyendo la firma del archivo
    const fileBuffer = fs.readFileSync(imagePath);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    if (fileBuffer.length < 8 || !fileBuffer.slice(0, 8).equals(pngSignature)) {
      console.warn("El archivo logo.png no es un PNG válido");
      return { ok: false, reason: "invalid_png" };
    }
    
    return { ok: true, path: imagePath };
  } catch (error) {
    console.error("Error validando logo:", error);
    return { ok: false, reason: "validation_error", error: error.message };
  }
}

// Manejar comunicación IPC
ipcMain.handle('get-printers', async () => {
  try {
    const printers = await getPrinters();
    console.log('Impresoras encontradas:', printers);
    return { success: true, printers: printers || [] };
  } catch (error) {
    logError('Error en get-printers handler', error);
    console.error('Error en get-printers handler:', error);
    const errorMessage = error?.error || error?.message || 'Error desconocido al obtener impresoras';
    const errorDetails = error?.details || {};
    return { 
      success: false, 
      error: errorMessage,
      details: errorDetails,
      logFile: logFile // Incluir ruta del archivo de log para referencia
    };
  }
});

ipcMain.handle('get-config', async () => {
  try {
    const config = getConfig();
    return { success: true, config };
  } catch (error) {
    logError('Error en get-config handler', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-config', async (event, configData) => {
  try {
    const result = saveConfig(configData);
    return result;
  } catch (error) {
    logError('Error en save-config handler', error);
    return { success: false, error: error.message };
  }
});

// Handler para obtener la ruta del archivo de log
ipcMain.handle('get-log-file', async () => {
  return { success: true, logFile: logFile };
});

ipcMain.handle('get-image-path', async () => {
  try {
    const imagePath = getImagePath();
    return { success: true, imagePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('print-order', async (event, printData) => {
  return await enqueuePrintJob(printData?._printer, () => printOrderData(printData));
});

ipcMain.handle('print-ot', async (event, printData) => {
  return await enqueuePrintJob(printData?._printer, () => printOTData(printData));
});

// Handlers para manejo de logo
ipcMain.handle('get-current-logo', async () => {
  try {
    const logoPath = getLogoPath();
    if (logoPath && fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      return { 
        success: true, 
        logo: logoBuffer.toString('base64'),
        path: logoPath 
      };
    } else {
      return { success: false, reason: "no_logo" };
    }
  } catch (error) {
    logError('Error en get-current-logo', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('resize-image', async (event, imageData) => {
  try {
    const sharp = require('sharp');
    const { imageBuffer, width = 300, height = 110 } = imageData;
    
    if(!imageBuffer || imageBuffer.length === 0) {
      throw new Error("El buffer de imagen está vacío");
    }

    // Convertir base64 a Buffer
    const buffer = Buffer.from(imageBuffer, 'base64');
    
    // Redimensionar con sharp (mantiene proporciones automáticamente)
    const resizedBuffer = await sharp(buffer)
      .resize(width, height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toBuffer();
    
    return {
      success: true,
      resizedImage: resizedBuffer.toString('base64'),
      width: width,
      height: height
    };
  } catch (error) {
    console.error('Error en resize-image:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-logo', async (event, logoData) => {
  try {
    const { imageBuffer } = logoData;
    
    // Validar que el buffer no esté vacío
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error("El buffer de imagen está vacío");
    }
    
    // Convertir de base64 a buffer
    const buffer = Buffer.from(imageBuffer, 'base64');
    
    // Validar que sea un PNG válido
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (buffer.length < 8 || !buffer.slice(0, 8).equals(pngSignature)) {
      throw new Error("El archivo no es un PNG válido");
    }
    
    // Guardar en userData (funciona en desarrollo y producción)
    // En producción, __dirname está en un .asar de solo lectura
    const logoDir = path.join(app.getPath('userData'), 'images', 'logo');
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }
    
    // Guardar el logo
    const logoPath = path.join(logoDir, "logo.png");
    fs.writeFileSync(logoPath, buffer);
    
    console.log("✅ Logo guardado correctamente en:", logoPath);
    console.log("✅ Tamaño del archivo:", buffer.length, "bytes");
    
    // Log para debugging
    logError(`Logo guardado exitosamente en: ${logoPath}`);
    
    return { success: true, path: logoPath };
  } catch (error) {
    logError('Error guardando logo', error);
    console.error("Error guardando logo:", error);
    return { success: false, error: error.message };
  }
});

// Función auxiliar para formatear números
function formatNumber(value, maxLength = 6) {
  const num = Number(value ?? 0);
  const formatted = num.toFixed(2);
  if (formatted.length <= maxLength) {
    return formatted.padStart(maxLength);
  } else {
    return formatted.slice(0, maxLength - 1) + '…';
  }
}

// Función para imprimir datos de orden (usado por HTTP y IPC)
async function printOrderData(printData) {
  try {
    const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
    const dayjs = require('dayjs');
    
    const { _printer, orden, items } = printData;
    const hostname = os.hostname();
    const result = await getImagePath();
    const appConfig = await getConfig();
    const paper = getPaperConfig(appConfig);
    
    let printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      width: paper.textWidthChars,
      interface: `\\\\${hostname}\\${_printer}`,
      driver: "printer"
    });

    // Start from a known printer state (helps with "jeroglíficos" after graphics)
    escposInitialize(printer);

    const companyName = appConfig.appName || "Molab Impresiones";
    const skipLogo = appConfig.imprimirSinLogo === true;

    console.log("Resultado de la imagen:", result);
    console.log("Ruta del logo:", result.path, "imprimirSinLogo:", skipLogo, "paperWidthMm:", paper.paperWidthMm, "logoWidthPx:", paper.logoTargetWidthPx);

    function printCompanyHeaderText() {
      printer.setTypeFontB();
      printer.setTextDoubleHeight();
      printer.setTextDoubleWidth();
      printer.println(companyName);
    }

    if (!skipLogo && result.ok && result.path && fs.existsSync(result.path)) {
      const stats = fs.statSync(result.path);
      console.log("Tamaño del archivo logo:", stats.size, "bytes");
      let logoPrinted = false;
      try {
        // Always preprocess logo to a safe width for the configured paper size
        const Jimp = require('jimp');
        const imageBuffer = fs.readFileSync(result.path);
        const image = await Jimp.read(imageBuffer);
        console.log("Dimensiones originales:", image.getWidth(), "x", image.getHeight());

        const maxHeight = 200;
        const targetWidth = paper.logoTargetWidthPx;
        if (image.getWidth() !== targetWidth) {
          image.resize(targetWidth, Jimp.AUTO, Jimp.RESIZE_BEZIER);
        }
        if (image.getHeight() > maxHeight) {
          image.resize(Jimp.AUTO, maxHeight, Jimp.RESIZE_BEZIER);
        }
        image.greyscale();

        const tempImagePath = path.join(app.getPath('userData'), "images", "logo", `logo_print_${paper.paperWidthMm}.png`);
        await image.writeAsync(tempImagePath);
        console.log("Logo preparado para impresión:", tempImagePath, "->", image.getWidth(), "x", image.getHeight());

        await printer.printImage(tempImagePath);
        console.log("✅ Logo enviado a la impresora");
        logoPrinted = true;
      } catch (imageError) {
        logError("Error imprimiendo logo, fallback solo texto", imageError);
        console.error("Stack trace:", imageError.stack);
        escposInitialize(printer);
        printCompanyHeaderText();
      }
      if (logoPrinted) {
        escposAfterImage(printer);
      }
    } else {
      if (skipLogo) {
        console.log("Imprimir sin logo (configuración)");
      } else {
        console.log("No hay logo válido, usando texto. Razón:", result.reason);
      }
      printCompanyHeaderText();
    }

    printer.setTypeFontB();
    printer.setTextDoubleHeight();
    printer.setTextDoubleWidth();
    printer.println(`Remito: ${orden?.id} `);
    printer.setTextNormal();
    printer.println(`Fecha: ${dayjs().format('DD/MM/YYYY')}`);
    printer.newLine();
    printer.setTypeFontB();
    printer.setTextDoubleHeight();
    printer.setTextDoubleWidth();
    printer.alignCenter();
    printer.println(`X`);
    printer.alignLeft();
    printer.setTextNormal();
    printer.println("Documento NO Valido como factura");
    printer.println("------------------------------");
    printer.println(`TD/LAB: ${orden?.cliente?.apellido} ${orden?.cliente?.nombre}`);
    printer.setTextNormal();
    printer.println(`${orden?.cliente?.telefono ?? 'S/Telefono'} - ${orden?.cliente?.email ?? 'Sin email'}`); 
    printer.println(`${orden?.cliente?.direccion ?? 'S/Direccion'} ${orden?.cliente?.localidad ?? 'Sin Localidad'}`); 
    printer.println(`${orden?.cliente?.provincia?.nombre ?? 'S/Provincia'}`);
    
    if(orden?.profesional){
      printer.println(`Prof: ${orden?.profesional?.nombre ?? ''} ${orden?.profesional?.apellido ?? ''}`);
      printer.println(`${orden?.profesional?.telefono ?? 'S/Telefono'}`);
      printer.println(`${orden?.profesional?.email ?? 'S/Email'}`);
    } else {
      printer.println('Prof: N/Profesional');
    }
    
    printer.setTextNormal();
    if(orden?.paciente){
      printer.println(`Pac: ${orden?.paciente?.apellido} ${orden?.paciente?.nombre}`);
      printer.println("------------------------------");
    }
    else{
      printer.println('Pac: N/Paciente');
    }
    printer.println("------------------------------");
    if (Array.isArray(items) && items.length > 0) {
      items.map(item => {
        printer.println(`${item?.cantidad} ${item?.trabajo?.descripcion}`);
        printer.println(`$${formatNumber(Number(item?.cantidad) * Number(item?.precio), 10) ?? '-'}`)
      });
    }
    
    printer.drawLine();
    printer.bold(true);
    printer.println(`Prec. Total: ${orden?.total}`);
    printer.bold(false);
    
    if(appConfig.contactoTecnico || appConfig.contactoLaboratorio || appConfig.diasVencimiento){
      printer.println("----------> Mensajes <--------");
    }
    if (appConfig.diasVencimiento) {
      printer.println(String(appConfig.diasVencimiento));
    }
    if(appConfig.contactoTecnico){
      printer.println(`Cto Tecnico: ${appConfig.contactoTecnico}`);
    }
    if(appConfig.contactoLaboratorio){
      printer.println(`Laboratorio: ${appConfig.contactoLaboratorio}`);
    }
    if(appConfig.contactoLaboratorio || appConfig.contactoTecnico || appConfig.diasVencimiento){
      printer.println("------------------------------");
    }

    escposBeforeCut(printer);
    printer.cut({ verticalTabAmount: 1 });
    let execute = await printer.execute();
    console.log("✅ Impresión completada");
    
    return { success: true, message: "Impresión enviada correctamente" };
    
  } catch (error) {
    console.log("error", error);
    return { success: false, error: error.message };
  }
}

// Función para imprimir datos de OT (usado por HTTP y IPC)
async function printOTData(printData) {
  try {
    const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
    const dayjs = require('dayjs');
    require('dayjs/locale/es');
    dayjs.locale('es'); 
    
    const { _ot_id, _printer, doctor, paciente, items, fechasalida, prof } = printData;
    const hostname = os.hostname();
    const fechaFormateada = dayjs(fechasalida).format('dddd, DD/MM/YYYY');
    const appConfig = await getConfig();
    const paper = getPaperConfig(appConfig);

    let printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      width: paper.textWidthChars,
      interface: `\\\\${hostname}\\${_printer}`,
      driver: "printer",
    });

    // Start from a known printer state
    escposInitialize(printer);
    
    printer.alignLeft();
    printer.setTypeFontB();
    printer.setTextDoubleHeight();
    printer.setTextDoubleWidth();
    printer.println(`OT: ${_ot_id}`);
    
    printer.setTextNormal();
    printer.println(`Dr/a: ${doctor}`);
    printer.println(`Paciente: ${paciente}`);
    printer.println(`Profesional: ${prof}`);
    printer.newLine();
    
    if (Array.isArray(items) && items.length > 0) {
      items.map(item => {
        printer.bold(true);
        printer.println(`Caso: ${item?.trabajo?.descripcion}`);
        printer.bold(false);
        printer.tableCustom([
          { text:`Cant: ${item?.cantidad ?? '-'}`, align:"LEFT", width:0.20 },
          { text:`Pza: ${item?.piezas ?? '-'}`, align:"LEFT", width:0.20 },
          { text:`Col: ${item?.color ?? '-'}`, align:"LEFT", width: 0.20 }
        ]);
        printer.newLine();
      });
    } else {
      console.error('items no es un array válido o está vacío:', items);
    }
    
    printer.newLine();
    printer.println(`Cntrl: ${fechaFormateada}`)
    escposBeforeCut(printer);
    printer.cut({ verticalTabAmount: 1 });

    let execute = await printer.execute();
    return { success: true, message: "Impresión enviada correctamente" };

  } catch (error) {
    console.log("error", error);
    return { success: false, error: error.message };
  }
}
