# Molab Printer - Aplicación de Escritorio para Impresión Térmica

Una aplicación de escritorio desarrollada con Electron para la impresión de tickets térmicos, remitos y órdenes de trabajo.

## 🚀 Características

- **Interfaz moderna**: Diseño elegante y fácil de usar
- **Impresión de remitos**: Genera tickets con información completa del cliente
- **Impresión de órdenes de trabajo**: Crea tickets para trabajos de laboratorio
- **Servidor HTTP integrado**: Escucha en puerto 8181 para solicitudes externas
- **API REST**: Endpoints para impresión desde navegadores y otras aplicaciones
- **Gestión de impresoras**: Detecta automáticamente impresoras térmicas disponibles
- **Configuración personalizable**: Ajusta información de contacto y empresa
- **Multiplataforma**: Funciona en Windows, macOS y Linux

## 📋 Requisitos

- Node.js 16 o superior
- Impresora térmica compatible con ESC/POS
- Windows (para detección automática de impresoras)

## 🛠️ Instalación

1. **Clona el repositorio**:
   ```bash
   git clone <url-del-repositorio>
   cd electron-escpos-printer
   ```

2. **Instala las dependencias**:
   ```bash
   npm install
   ```

3. **Ejecuta la aplicación en modo desarrollo**:
   ```bash
   npm run dev
   ```

4. **Para ejecutar la aplicación**:
   ```bash
   npm start
   ```

## 📦 Construcción y Distribución

### Desarrollo
```bash
npm run dev
```

### Construir para Windows
```bash
npm run build-win
```

### Construir para todas las plataformas
```bash
npm run build
```

Los archivos ejecutables se generarán en la carpeta `dist/`.

## 🖨️ Configuración de Impresoras

1. **Conecta tu impresora térmica** al sistema
2. **Comparte la impresora** en Windows:
   - Ve a Configuración > Dispositivos > Impresoras y escáneres
   - Selecciona tu impresora térmica
   - Haz clic en "Administrar" > "Propiedades de impresora"
   - Ve a la pestaña "Compartir" y marca "Compartir esta impresora"
3. **Abre la aplicación** y ve a la pestaña "Impresoras"
4. **Selecciona la impresora** deseada en los formularios

## 📝 Uso de la Aplicación

### Interfaz de Escritorio
La aplicación incluye una interfaz moderna con las siguientes pestañas:

#### Imprimir Remito
1. Ve a la pestaña "Imprimir Remito"
2. Selecciona la impresora térmica
3. Completa la información de la orden:
   - ID de orden y total
   - Datos del cliente (nombre, apellido, contacto, dirección)
   - Datos del profesional (opcional)
   - Datos del paciente
   - Productos/servicios con cantidades y precios
4. Haz clic en "Imprimir Remito"

#### Imprimir Orden de Trabajo (OT)
1. Ve a la pestaña "Imprimir OT"
2. Selecciona la impresora térmica
3. Completa la información:
   - ID de OT, doctor, paciente, profesional
   - Fecha de salida
   - Trabajos con descripción, cantidad, piezas y color
4. Haz clic en "Imprimir OT"

#### Servidor HTTP
1. Ve a la pestaña "Servidor HTTP"
2. Verifica que el servidor esté activo en el puerto 8181
3. Consulta los endpoints disponibles y ejemplos de uso

#### Configuración
1. Ve a la pestaña "Configuración"
2. Ajusta la información de la empresa:
   - Nombre de la aplicación
   - Contacto técnico
   - Contacto de laboratorio
   - Días de vencimiento
3. Haz clic en "Guardar Configuración"

## 🌐 Servidor HTTP y API REST

La aplicación incluye un servidor HTTP integrado que escucha en el puerto **8181** (o el siguiente disponible), permitiendo que otras aplicaciones o navegadores web envíen solicitudes de impresión.

### Endpoints Disponibles

#### `GET /status`
Obtiene el estado del servidor.
```bash
curl http://localhost:8181/status
```

#### `GET /impresoras`
Obtiene la lista de impresoras térmicas disponibles.
```bash
curl http://localhost:8181/impresoras
```

#### `POST /finish_order_print`
Imprime un remito con la información proporcionada.
```bash
curl -X POST http://localhost:8181/finish_order_print \
  -H "Content-Type: application/json" \
  -d '{
    "_printer": "nombre_impresora",
    "orden": {
      "id": "12345",
      "total": "150.00",
      "cliente": {
        "nombre": "Juan",
        "apellido": "Pérez",
        "telefono": "123456789",
        "email": "juan@email.com",
        "direccion": "Calle 123",
        "localidad": "Ciudad",
        "provincia": {"nombre": "Provincia"}
      },
      "paciente": {
        "nombre": "María",
        "apellido": "González"
      }
    },
    "items": [
      {
        "cantidad": "2",
        "trabajo": {"descripcion": "Limpieza dental"},
        "precio": "75.00"
      }
    ]
  }'
```

#### `POST /print`
Imprime una orden de trabajo.
```bash
curl -X POST http://localhost:8181/print \
  -H "Content-Type: application/json" \
  -d '{
    "_ot_id": "OT-001",
    "_printer": "nombre_impresora",
    "doctor": "Dr. García",
    "paciente": "Ana López",
    "prof": "Prof. Martínez",
    "fechasalida": "2024-01-15",
    "items": [
      {
        "trabajo": {"descripcion": "Corona dental"},
        "cantidad": "1",
        "piezas": "1",
        "color": "A2"
      }
    ]
  }'
```

### Uso desde Navegador Web

Puedes usar JavaScript en cualquier página web para enviar solicitudes de impresión:

```javascript
// Ejemplo de impresión desde navegador
async function imprimirRemito(datosRemito) {
  try {
    const response = await fetch('http://localhost:8181/finish_order_print', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(datosRemito)
    });
    
    const result = await response.json();
    console.log('Impresión exitosa:', result.message);
  } catch (error) {
    console.error('Error al imprimir:', error);
  }
}
```

## 🏗️ Estructura del Proyecto

```
electron-escpos-printer/
├── main.js                 # Proceso principal de Electron
├── renderer/               # Proceso de renderizado
│   ├── index.html         # Interfaz principal
│   ├── styles.css         # Estilos de la aplicación
│   ├── app.js             # Lógica del frontend
│   └── preload.js         # Script de precarga seguro
├── images/                # Recursos de imagen
│   └── logo/              # Logos de la empresa
├── config.json            # Configuración de la aplicación
├── package.json           # Dependencias y scripts
└── README.md              # Este archivo
```

## 🔧 Tecnologías Utilizadas

- **Electron**: Framework para aplicaciones de escritorio
- **Node.js**: Runtime de JavaScript
- **node-thermal-printer**: Biblioteca para impresión térmica
- **HTML5/CSS3**: Interfaz de usuario moderna
- **JavaScript ES6+**: Lógica de la aplicación

## 📱 Características de la Interfaz

- **Diseño responsivo**: Se adapta a diferentes tamaños de ventana
- **Navegación por pestañas**: Organización clara de funcionalidades
- **Formularios intuitivos**: Campos organizados por secciones
- **Notificaciones**: Feedback visual para todas las acciones
- **Estados de carga**: Indicadores durante operaciones largas
- **Validación**: Verificación de datos antes del envío

## 🐛 Solución de Problemas

### La aplicación no detecta impresoras
- Verifica que la impresora esté conectada y encendida
- Asegúrate de que la impresora esté compartida en Windows
- Reinicia la aplicación después de conectar una nueva impresora

### Error al imprimir
- Verifica que la impresora esté seleccionada
- Comprueba que la impresora esté encendida y con papel
- Revisa que la impresora sea compatible con ESC/POS

### La aplicación no inicia
- Verifica que Node.js esté instalado correctamente
- Ejecuta `npm install` para instalar dependencias
- Revisa la consola para mensajes de error

## 📄 Licencia

Este proyecto está bajo la Licencia ISC.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📞 Soporte

Para soporte técnico o preguntas sobre la aplicación, contacta al equipo de desarrollo.

---

**Desarrollado con ❤️ para Molab**