const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al proceso de renderizado
contextBridge.exposeInMainWorld('electronAPI', {
  // Obtener impresoras disponibles
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  
  // Obtener configuración
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // Guardar configuración
  saveConfig: (configData) => ipcRenderer.invoke('save-config', configData),
  
  // Obtener ruta de imagen
  getImagePath: () => ipcRenderer.invoke('get-image-path'),
  
  // Imprimir orden/remito
  printOrder: (printData) => ipcRenderer.invoke('print-order', printData),
  
  // Imprimir orden de trabajo
  printOT: (printData) => ipcRenderer.invoke('print-ot', printData),
  
  // Escuchar estado del servidor
  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (event, data) => callback(data));
  },
  
  // Remover listener del servidor
  removeServerStatusListener: () => {
    ipcRenderer.removeAllListeners('server-status');
  },
  
  // Funciones para manejo de logo
  getCurrentLogo: () => ipcRenderer.invoke('get-current-logo'),
  saveLogo: (logoData) => ipcRenderer.invoke('save-logo', logoData),
  resizeImage: (imageData) => ipcRenderer.invoke('resize-image', imageData),
  
  // Obtener ruta del archivo de log
  getLogFile: () => ipcRenderer.invoke('get-log-file')
});
