import { createContext, useContext, useRef, useState } from 'react';
import BluetoothPrinter from '../lib/bluetooth-printer';
import { db } from '../lib/insforge';
import { useAuth } from './AuthContext';

const PrinterContext = createContext(null);

export function PrinterProvider({ children }) {
  const printerRef = useRef(new BluetoothPrinter());
  const [isConnected, setIsConnected] = useState(false);
  const [printerName, setPrinterName] = useState(null);
  const { profile } = useAuth();

  async function connect() {
    const printer = printerRef.current;
    printer.onDisconnect = () => {
      setIsConnected(false);
      setPrinterName(null);
    };

    const result = await printer.connect();
    if (result.success) {
      setIsConnected(true);
      setPrinterName(result.deviceName);

      // Guardar en perfil
      if (profile?.id) {
        await db.from('profiles').update({
          printer_name: result.deviceName,
          printer_id: result.deviceId,
        }).eq('id', profile.id);
      }
    }
    return result;
  }

  async function printTicket(ticket, options = {}) {
    const opts = {
      currencySymbol: ticket.currency_symbol || '$',
      sellerName: profile?.full_name || '',
      paperWidth: profile?.printer_paper_width || 58,
      ...options,
    };
    await printerRef.current.printTicket(ticket, opts);

    // Actualizar flag de impresión en BD
    if (ticket.id) {
      await db.from('tickets').update({
        was_printed: true,
        print_count: (ticket.print_count || 0) + 1,
        last_printed_at: new Date().toISOString(),
      }).eq('id', ticket.id);
    }
  }

  async function printReport(reportData, options = {}) {
    const opts = {
      currencySymbol: profile?.currency_symbol || '$',
      paperWidth: profile?.printer_paper_width || 58,
      ...options,
    };
    await printerRef.current.printSalesReport(reportData, opts);
  }

  function disconnect() {
    printerRef.current.disconnect();
    setIsConnected(false);
    setPrinterName(null);
  }

  return (
    <PrinterContext.Provider value={{
      printer: printerRef.current,
      connect,
      disconnect,
      isConnected,
      printerName,
      printTicket,
      printReport,
    }}>
      {children}
    </PrinterContext.Provider>
  );
}

export function usePrinter() {
  const ctx = useContext(PrinterContext);
  if (!ctx) throw new Error('usePrinter debe usarse dentro de PrinterProvider');
  return ctx;
}
