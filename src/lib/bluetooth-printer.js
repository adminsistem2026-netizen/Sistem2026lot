/**
 * Clase para impresión en impresoras térmicas Bluetooth vía Web Bluetooth API.
 * Compatible con impresoras ESC/POS de 58mm y 80mm.
 *
 * IMPORTANTE: Web Bluetooth API solo funciona en:
 * - Chrome/Edge en Android
 * - Chrome en desktop (con flag habilitado)
 * - NO funciona en iOS Safari
 *
 * Para Android WebView (Capacitor), se usa el plugin de Bluetooth nativo.
 */
class BluetoothPrinter {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.paperWidth = 58;
    // UUID primario para impresoras térmicas Bluetooth SPP
    this.SERVICE_UUID_PRIMARY = '000018f0-0000-1000-8000-00805f9b34fb';
    this.CHARACTERISTIC_UUID_PRIMARY = '00002af1-0000-1000-8000-00805f9b34fb';
    // UUID alternativo (algunas impresoras)
    this.SERVICE_UUID_ALT = '0000ffe0-0000-1000-8000-00805f9b34fb';
    this.CHARACTERISTIC_UUID_ALT = '0000ffe1-0000-1000-8000-00805f9b34fb';

    this.onDisconnect = null;
  }

  async connect() {
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [this.SERVICE_UUID_PRIMARY] },
          { services: [this.SERVICE_UUID_ALT] },
        ],
        optionalServices: [this.SERVICE_UUID_PRIMARY, this.SERVICE_UUID_ALT],
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.isConnected = false;
        this.characteristic = null;
        this.onDisconnect?.();
      });

      this.server = await this.device.gatt.connect();

      // Intentar UUID primario, luego alternativo
      try {
        const service = await this.server.getPrimaryService(this.SERVICE_UUID_PRIMARY);
        this.characteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID_PRIMARY);
      } catch {
        const service = await this.server.getPrimaryService(this.SERVICE_UUID_ALT);
        this.characteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID_ALT);
      }

      this.isConnected = true;
      return { success: true, deviceName: this.device.name, deviceId: this.device.id };
    } catch (error) {
      console.error('Error conectando impresora:', error);
      return { success: false, error: error.message };
    }
  }

  async reconnect() {
    return this.connect();
  }

  async sendData(data) {
    if (!this.characteristic) throw new Error('Impresora no conectada');
    const CHUNK_SIZE = 100;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await this.characteristic.writeValueWithResponse(new Uint8Array(chunk));
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // ── Comandos ESC/POS ──
  ESC = 0x1b;
  GS = 0x1d;

  cmd_init() { return [this.ESC, 0x40]; }
  cmd_align(n) { return [this.ESC, 0x61, n]; }
  cmd_bold(on) { return [this.ESC, 0x45, on ? 1 : 0]; }
  cmd_textSize(width, height) {
    const n = ((width - 1) << 4) | (height - 1);
    return [this.GS, 0x21, n];
  }
  cmd_feed(lines) { return [this.ESC, 0x64, lines]; }
  cmd_cut() { return [this.GS, 0x56, 0x00]; }
  cmd_separator(char = '-', cols = 32) {
    return Array.from(new TextEncoder().encode(char.repeat(cols) + '\n'));
  }
  text(str) { return Array.from(new TextEncoder().encode(str)); }

  // ── Imprimir ticket de lotería ──
  async printTicket(ticket, options = {}) {
    const {
      currencySymbol = '$',
      sellerName = '',
      headerText = 'APM11',
      footerText = 'SIN TICKET NO HAY RECLAMO',
      paperWidth = this.paperWidth,
    } = options;

    const cols = paperWidth === 80 ? 48 : 32;
    const ticketDate = new Date(ticket.created_at);
    const hours = ticketDate.getHours() % 12 || 12;
    const minutes = ticketDate.getMinutes().toString().padStart(2, '0');
    const ampm = ticketDate.getHours() >= 12 ? 'PM' : 'AM';

    let data = [];
    data.push(...this.cmd_init());

    // Encabezado
    data.push(...this.cmd_align(1));
    data.push(...this.cmd_textSize(2, 2));
    data.push(...this.cmd_bold(1));
    data.push(...this.text(headerText + '\n'));
    data.push(...this.cmd_textSize(1, 1));
    data.push(...this.cmd_bold(0));
    data.push(...this.cmd_separator('=', cols));

    // Info del ticket
    data.push(...this.cmd_align(0));
    data.push(...this.text(`Fecha: ${ticketDate.toLocaleDateString('es-ES')}\n`));
    data.push(...this.text(`Hora:  ${hours}:${minutes} ${ampm}\n`));
    data.push(...this.text(`Lot:   ${ticket.lottery_display_name}\n`));
    if (ticket.draw_time_label) data.push(...this.text(`Sort:  ${ticket.draw_time_label}\n`));
    if (sellerName) data.push(...this.text(`Vend:  ${sellerName}\n`));
    data.push(...this.text(`ID:    ${ticket.ticket_number}\n`));
    data.push(...this.cmd_separator('-', cols));

    // Números
    data.push(...this.cmd_align(1));
    data.push(...this.cmd_bold(1));
    data.push(...this.cmd_textSize(1, 2));
    for (const num of ticket.numbers) {
      const line = `*${num.number}* / ${num.pieces}T / ${currencySymbol}${num.subtotal.toFixed(2)}`;
      data.push(...this.text(line + '\n'));
    }
    data.push(...this.cmd_textSize(1, 1));
    data.push(...this.cmd_bold(0));
    data.push(...this.cmd_separator('-', cols));

    // Total
    data.push(...this.cmd_align(1));
    data.push(...this.cmd_textSize(2, 2));
    data.push(...this.cmd_bold(1));
    data.push(...this.text(`TOTAL: ${currencySymbol}${ticket.total_amount.toFixed(2)}\n`));
    data.push(...this.cmd_textSize(1, 1));
    data.push(...this.cmd_bold(0));

    if (ticket.customer_name) data.push(...this.text(`Cliente: ${ticket.customer_name}\n`));

    // Footer
    data.push(...this.cmd_separator('=', cols));
    data.push(...this.cmd_align(1));
    data.push(...this.text(footerText + '\n'));
    data.push(...this.text(headerText + '\n'));
    data.push(...this.cmd_feed(4));
    data.push(...this.cmd_cut());

    await this.sendData(data);
  }

  // ── Imprimir reporte de ventas ──
  async printSalesReport(reportData, options = {}) {
    const { currencySymbol = '$', paperWidth = this.paperWidth } = options;
    const cols = paperWidth === 80 ? 48 : 32;

    let data = [];
    data.push(...this.cmd_init());
    data.push(...this.cmd_align(1));
    data.push(...this.cmd_textSize(2, 1));
    data.push(...this.cmd_bold(1));
    data.push(...this.text('REPORTE DE VENTAS\n'));
    data.push(...this.cmd_textSize(1, 1));
    data.push(...this.cmd_bold(0));
    data.push(...this.cmd_separator('=', cols));

    data.push(...this.cmd_align(0));
    data.push(...this.text(`Fecha: ${reportData.date}\n`));
    data.push(...this.text(`Loteria: ${reportData.lottery || 'Todas'}\n`));
    data.push(...this.text(`Sorteo: ${reportData.drawTime || 'Todos'}\n`));
    if (reportData.sellerName) data.push(...this.text(`Vendedor: ${reportData.sellerName}\n`));
    data.push(...this.cmd_separator('-', cols));

    data.push(...this.cmd_bold(1));
    data.push(...this.text(`Total Tiempos: ${reportData.totalPieces}\n`));
    data.push(...this.text(`Total Ventas:  ${currencySymbol}${reportData.totalAmount.toFixed(2)}\n`));

    if (reportData.sellerAmount !== undefined) {
      data.push(...this.cmd_separator('-', cols));
      data.push(...this.text(`Vendedor (${reportData.sellerPct}%): ${currencySymbol}${reportData.sellerAmount.toFixed(2)}\n`));
      data.push(...this.text(`Admin (${reportData.adminPct}%):    ${currencySymbol}${reportData.adminAmount.toFixed(2)}\n`));
    }

    data.push(...this.cmd_bold(0));
    data.push(...this.cmd_feed(4));
    data.push(...this.cmd_cut());

    await this.sendData(data);
  }

  disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.isConnected = false;
    this.characteristic = null;
  }
}

export default BluetoothPrinter;
