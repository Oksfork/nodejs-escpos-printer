const express = require("express");
const { exec } = require("child_process");
const cors = require("cors");
const os = require("os");
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");


const app = express();

app.use(express.json());
app.use(cors());


app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

const PORT = 8181;

const getPrinters = (callback) => {
  exec('wmic printer get Name,DriverName,Shared', (error, stdout) => {
    if (error) {
      callback({ error: error.message });
      return;
    }

    const lines = stdout.split("\n").slice(1).map(line => line.trim()).filter(line => line);
    const printers = lines.map(line => {
      const [name, driverName, shared] = line.split(/\s{2,}/);
      return {
        name,
        driver: driverName,
        shared: shared === 'TRUE'
      };
    });

    const thermalPrinters = printers.filter(p => p.shared).map((item) => item.driver);

    callback(thermalPrinters);
  });
};

app.get('/impresoras', (req, res) => {
  getPrinters(printers => res.json({ printers }));
});

app.post("/print", async (req, res) => {
    try {
        console.log("body", req.body);
        const { _ot_id, _printer, doctor, paciente, caso, cantidad } = req.body;

        // Obtener el hostname del equipo local
        const hostname = os.hostname();

        let printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            interface: `\\\\${hostname}\\${_printer}`,
            driver: "printer"
        });

        printer.alignCenter();
        printer.setTypeFontB();
        printer.setTextDoubleHeight();
        printer.setTextDoubleWidth();
        printer.println(`OT: ${_ot_id}`);

        printer.drawLine();
        printer.setTextNormal();
        printer.setTypeFontA();
        printer.println(`Dr/a: ${doctor}`);
        printer.println(`Paciente: ${paciente}`);
        printer.bold(true);
        printer.println(`Caso: ${caso}`);
        printer.bold(false);
        printer.println(`Cantidad: ${cantidad}`);
        printer.newLine();
        printer.cut();

        let execute = await printer.execute();
        console.log("✅ Impresión completada");

        return res.json({ message: "Impresión enviada correctamente" });

    } catch (error) {
        console.error("❌ Error en la impresión:", error);
        return res.status(500).json({ error: "Error al imprimir" });
    }
});


app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
