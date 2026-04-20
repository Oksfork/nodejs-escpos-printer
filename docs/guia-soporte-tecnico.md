# Guía de soporte técnico — Molab Printer

Documento operativo para equipo interno y partners. Puedes copiar este contenido a **Google Docs** (pegar directamente o importar el archivo `.md`).

---

## 1. Objetivo de esta guía

Reducir el soporte **a ciegas** cuando hay problemas con **impresoras térmicas** o con la **app Molab Printer**. Establece qué pedir al cliente, qué revisar primero y cuándo escalar.

---

## 2. Datos que siempre pedir al abrir un ticket

| Dato | Por qué importa |
|------|------------------|
| **Versión de la app** | Pantalla Configuración / Acerca de (si existe) o carpeta de instalación. |
| **Sistema operativo** | Windows 10 / 11, 64 bits. |
| **Tipo de conexión de la impresora** | USB directa al PC, o impresora **compartida** (`\\NOMBRE-PC\NombreImpresora`). |
| **Nombre exacto de la impresora en Windows** | Como aparece en “Impresoras y escáneres”. |
| **Modelo de la térmica** | Foto de la etiqueta del equipo. |
| **Foto del ticket problemático** | Si sale basura, cortado raro o muy angosto. |
| **¿Pasa siempre o a veces?** | Intermitente vs reproducible. |
| **¿Usan logo en el ticket?** | Si pueden probar con **Imprimir sin logo** (Configuración). |

---

## 3. Cómo está pensada la app (contexto rápido)

- Es una app **Electron** que expone un **servidor HTTP local** (puerto por defecto **8181**) para recibir órdenes de impresión.
- Las impresoras se listan desde Windows (**compartidas** / visibles al sistema).
- El ticket puede incluir **logo (PNG)** o, si está activado, **solo texto** con el nombre de empresa.
- Al cerrar la ventana, la app puede seguir en **bandeja del sistema**; el servidor sigue activo hasta **Salir** desde el icono de bandeja.

---

## 4. Checklist de primer nivel (antes de escalar)

1. **Reiniciar la impresora** (apagar y encender). Muchos fallos de “bloques” o jeroglíficos se corrigen así.
2. **Cola de impresión**: abrir la impresora en Windows → cancelar trabajos atascados → reintentar un ticket de prueba.
3. **Probar “Imprimir sin logo”** en Configuración. Si el problema desaparece, sospechar del **bloque gráfico / logo**.
4. **Cable USB** / puerto (otro puerto, sin hub inestable). Desactivar **ahorro de energía USB** en Windows si hay desconexiones raras.
5. Si es **red compartida**: comprobar que el PC que **comparte** la impresora esté encendido y estable.
6. Comprobar que **solo una instancia** de la app esté en uso (evitar confusiones con el servidor).

---

## 5. Problemas frecuentes y respuestas orientativas

### 5.1 Ticket con “jeroglíficos” o franjas largas de bloques

- **Causa probable:** desfase en modo **gráfico** (logo) o estado interno de la impresora.
- **Acciones:** reinicio de térmica; activar **Imprimir sin logo**; revisar tamaño/formato del PNG; actualizar la app si el cliente tiene versión vieja (mejoras de `ESC @` / reset tras logo).
- **Nota:** si Windows **no** reporta error, la app puede haber enviado el trabajo “bien” y aun así el papel salir mal; no hay detección automática 100 % fiable.

### 5.2 Impresión muy angosta (no usa todo el ancho del papel)

- **Causa probable:** ancho del **PNG del logo** en píxeles menor que el ancho útil del papel (p. ej. 80 mm vs imagen ~300 px).
- **Acciones:** explicar que el ancho visual del logo sigue el archivo; valorar opción futura de papel 58/80 mm o resize; mientras tanto, logo más ancho en px según manual de térmica.

### 5.3 Windows dice que la app es “peligrosa” al instalar

- **Causa:** **SmartScreen** por instalador **sin firma de código** o poca reputación del archivo.
- **Acciones:** “Más información” → Ejecutar de todas formas si confían en el origen; a medio plazo: **certificado de firma de código** para el instalador.

### 5.4 “No imprime” / error al imprimir

- Pedir **mensaje de error exacto** o captura.
- Revisar **logs** de la app (carpeta de datos de usuario / logs si el cliente puede enviarlos).
- Verificar que el **puerto 8181** no esté bloqueado por firewall local (si el origen es otra app en la misma máquina, suele ser localhost).

### 5.5 La ventana se cierra pero algo sigue corriendo

- **Esperado:** modo bandeja. **Salir** desde el menú del icono de bandeja para cerrar del todo.

### 5.6 La app abre sola al iniciar sesión

- **Esperado** en build instalado: registro de inicio automático. El usuario puede desactivarlo en **Configuración de Windows → Aplicaciones → Inicio**.

---

## 6. Qué la app **sí** puede registrar vs qué **no**

| Sí suele poder registrarse / mostrarse | No es fiable sin más datos |
|----------------------------------------|----------------------------|
| Errores al llamar a imprimir (`execute`, excepciones). | Ticket “feo” cuando Windows marca el trabajo como correcto. |
| Fallos al listar impresoras. | Fallos físicos intermitentes sin error en software. |
| Configuración (sin logo, nombre empresa, etc.). | Calidad del cable red/USB sin prueba en sitio. |

---

## 7. Escalado sugerido

1. **Nivel 1:** checklist + probar sin logo + reinicio impresora + foto del ticket.  
2. **Nivel 2:** revisar cola, driver, otro PC de prueba, logs.  
3. **Nivel 3:** acceso remoto (solo con permiso del cliente y políticas claras).

---

## 8. Mejoras recomendadas al producto (backlog de soporte)

- Botón **“Exportar diagnóstico”** (logs + versión + lista de impresoras + config anonimizada).  
- Pantalla **Acerca de** con versión y enlace a soporte.  
- Opción de **ancho de papel** 58 / 80 mm para redimensionar logo de forma coherente.

---

## 9. Contacto y revisión del documento

- Mantener esta guía actualizada cuando cambie un comportamiento importante de la app.  
- Última referencia de funciones: bandeja, instancia única, inicio con sesión, sin logo, reset ESC/POS en impresión, corte con `verticalTabAmount: 1`.

---

*Fin del documento.*
