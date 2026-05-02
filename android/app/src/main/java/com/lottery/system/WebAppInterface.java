package com.lottery.system;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;

public class WebAppInterface {
    private final Context context;
    private final Activity activity;

    public WebAppInterface(Activity activity) {
        this.activity = activity;
        this.context = activity;
    }

    private boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private void requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ActivityCompat.requestPermissions(activity,
                    new String[]{ Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN },
                    1001);
        }
    }

    @JavascriptInterface
    public void shareTicketFromAndroid(String base64Image) {
        try {
            String base64Data = base64Image.contains("base64,")
                    ? base64Image.substring(base64Image.indexOf("base64,") + 7)
                    : base64Image;
            byte[] imageBytes = Base64.decode(base64Data, Base64.DEFAULT);

            File file = new File(context.getCacheDir(), "ticket.png");
            FileOutputStream fos = new FileOutputStream(file);
            fos.write(imageBytes);
            fos.close();

            android.net.Uri uri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    file
            );

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("image/png");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent chooser = Intent.createChooser(intent, "Compartir ticket");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(chooser);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @JavascriptInterface
    public void shareImageFromAndroid(String base64Image, String title) {
        try {
            String base64Data = base64Image.contains("base64,")
                    ? base64Image.substring(base64Image.indexOf("base64,") + 7)
                    : base64Image;
            byte[] imageBytes = Base64.decode(base64Data, Base64.DEFAULT);

            File file = new File(context.getCacheDir(), "reporte.png");
            FileOutputStream fos = new FileOutputStream(file);
            fos.write(imageBytes);
            fos.close();

            android.net.Uri uri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    file
            );

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("image/png");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.putExtra(Intent.EXTRA_TEXT, title);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent chooser = Intent.createChooser(intent, "Compartir");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(chooser);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @JavascriptInterface
    public void shareReportFromAndroid(String reportContent, String reportType) {
        try {
            String fileName = "reporte_" + reportType + "_vendidos.csv";
            File file = new File(context.getCacheDir(), fileName);
            FileOutputStream fos = new FileOutputStream(file);
            fos.write(reportContent.getBytes());
            fos.close();

            android.net.Uri uri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    file
            );

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/csv");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent chooser = Intent.createChooser(intent, "Compartir reporte");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(chooser);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    public String getPairedDevices() {
        try {
            if (!hasBluetoothPermission()) {
                requestBluetoothPermission();
                return "ERROR:permission_denied:Permiso Bluetooth denegado. Otórgalo en Configuración > Aplicaciones > Permisos.";
            }
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) return "ERROR:bluetooth_not_available";
            if (!adapter.isEnabled()) return "ERROR:bluetooth_disabled";
            Set<BluetoothDevice> paired = adapter.getBondedDevices();
            if (paired == null) return "ERROR:bonded_devices_null";
            JSONArray arr = new JSONArray();
            for (BluetoothDevice device : paired) {
                JSONObject obj = new JSONObject();
                obj.put("name", device.getName() != null ? device.getName() : "Desconocido");
                obj.put("address", device.getAddress());
                arr.put(obj);
            }
            return arr.toString();
        } catch (SecurityException e) {
            return "ERROR:permission_denied:" + e.getMessage();
        } catch (Exception e) {
            return "ERROR:" + e.getMessage();
        }
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    public String printTicket(String deviceAddress, String ticketJson) {
        BluetoothSocket socket = null;
        try {
            if (!hasBluetoothPermission()) {
                requestBluetoothPermission();
                return "Permiso Bluetooth denegado. Otórgalo en Configuración > Aplicaciones > Permisos.";
            }
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) return "Bluetooth no disponible";

            BluetoothDevice device = adapter.getRemoteDevice(deviceAddress);
            UUID sppUuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
            socket = device.createRfcommSocketToServiceRecord(sppUuid);
            adapter.cancelDiscovery();
            socket.connect();

            OutputStream out = socket.getOutputStream();
            byte[] data = buildEscPosTicket(ticketJson);
            out.write(data);
            out.flush();
            return "OK";
        } catch (Exception e) {
            return e.getMessage() != null ? e.getMessage() : "Error desconocido";
        } finally {
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }
    }

    private byte[] buildEscPosTicket(String ticketJson) throws Exception {
        JSONObject t = new JSONObject(ticketJson);
        String lotteryName  = t.optString("lotteryName", "");
        String drawTime     = t.optString("drawTime", "");
        String ticketId     = t.optString("ticketId", "");
        String sellerName   = t.optString("sellerName", "");
        String customerName = t.optString("customerName", "");
        String total        = t.optString("total", "0.00");
        String currency     = t.optString("currencySymbol", "$");
        String dayName      = t.optString("dayName", "");
        String dateStr      = t.optString("dateStr", "");
        String timeStr      = t.optString("timeStr", "");
        String chancePrice  = t.optString("chancePrice", "");
        String palePrice    = t.optString("palePrice", "");
        int totalPieces     = t.optInt("totalPieces", 0);
        JSONArray numbers   = t.optJSONArray("numbers");

        ByteArrayOutputStream bos = new ByteArrayOutputStream();

        // ESC @ — init printer
        bos.write(new byte[]{0x1B, 0x40});

        // ── HEADER: día, fecha, lotería+sorteo ───────────────
        bos.write(new byte[]{0x1B, 0x61, 0x01});                   // center
        bos.write(new byte[]{0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01}); // double size + bold
        if (!dayName.isEmpty())  writeStr(bos, dayName  + "\n");
        if (!dateStr.isEmpty())  writeStr(bos, dateStr  + "\n");
        bos.write(new byte[]{0x1D, 0x21, 0x10});                    // double width, bold still on
        writeStr(bos, lotteryName + (!drawTime.isEmpty() ? " " + drawTime : "") + "\n");
        bos.write(new byte[]{0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00}); // reset
        writeStr(bos, "--------------------------------\n");

        // ── INFO DEL PEDIDO ───────────────────────────────────
        bos.write(new byte[]{0x1B, 0x61, 0x00});                    // left
        writeStr(bos, "orderNo: " + ticketId + "\n");
        writeStr(bos, "Pedido: " + dateStr + (!timeStr.isEmpty() ? " " + timeStr : "") + "\n");
        StringBuilder pricesLine = new StringBuilder();
        if (!chancePrice.isEmpty() && !chancePrice.equals("0.00")) pricesLine.append("Chance ").append(chancePrice);
        if (!palePrice.isEmpty()   && !palePrice.equals("0.00")) {
            if (pricesLine.length() > 0) pricesLine.append("   ");
            pricesLine.append("Pale ").append(palePrice);
        }
        if (pricesLine.length() > 0) writeStr(bos, pricesLine.toString() + "\n");
        writeStr(bos, "--------------------------------\n");

        // ── CABECERA DE TABLA ─────────────────────────────────
        // 32 chars: Numero(12) | Cantidad(10) | Subtotal(10)
        bos.write(new byte[]{0x1B, 0x45, 0x01});                    // bold
        writeStr(bos, padRight("Numero", 12) + padCenter("Cantidad", 10) + padLeft("Subtotal", 10) + "\n");
        bos.write(new byte[]{0x1B, 0x45, 0x00});                    // no bold
        writeStr(bos, "--------------------------------\n");

        // ── FILAS DE NÚMEROS ──────────────────────────────────
        if (numbers != null) {
            for (int i = 0; i < numbers.length(); i++) {
                JSONObject n = numbers.getJSONObject(i);
                String num = "*" + n.optString("number", "") + "*";
                String pcs = n.optString("pieces", "");
                String sub = currency + n.optString("subtotal", "");
                bos.write(new byte[]{0x1B, 0x45, 0x01});                    // bold, tamaño normal
                writeStr(bos, padRight(num, 12) + padCenter(pcs, 10) + padLeft(sub, 10) + "\n");
                bos.write(new byte[]{0x1B, 0x45, 0x00});
                writeStr(bos, "--------------------------------\n");
            }
        }

        // ── TOTAL ─────────────────────────────────────────────
        String totalPiecesStr = totalPieces > 0 ? String.valueOf(totalPieces) : "";
        bos.write(new byte[]{0x1D, 0x21, 0x01, 0x1B, 0x45, 0x01}); // doble altura + bold
        writeStr(bos, padRight("Total", 12) + padCenter(totalPiecesStr, 10) + padLeft(currency + total, 10) + "\n");
        bos.write(new byte[]{0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00}); // reset

        // ── FOOTER ────────────────────────────────────────────
        writeStr(bos, "--------------------------------\n");
        bos.write(new byte[]{0x1B, 0x61, 0x01, 0x1B, 0x45, 0x01}); // center + bold
        if (!sellerName.isEmpty()) writeStr(bos, "-" + sellerName + "-\n");
        bos.write(new byte[]{0x1B, 0x61, 0x00, 0x1B, 0x45, 0x00}); // left + no bold
        if (!customerName.isEmpty()) writeStr(bos, customerName + "\n");

        // ── QR CODE ───────────────────────────────────────────
        writeStr(bos, "\n");
        bos.write(new byte[]{0x1B, 0x61, 0x01});                    // center
        writeQRCode(bos, ticketId);
        writeStr(bos, "\n");

        // ── MENSAJE FINAL ──────────────────────────────────────
        bos.write(new byte[]{0x1B, 0x61, 0x01});                    // center
        writeStr(bos, "Revisa su lista antes del sorteo\n");
        writeStr(bos, "\n");

        // Feed 4 líneas + corte parcial
        bos.write(new byte[]{0x1B, 0x64, 0x04});
        bos.write(new byte[]{0x1D, 0x56, 0x01});

        return bos.toByteArray();
    }

    private String padRight(String s, int width) {
        if (s == null) s = "";
        if (s.length() >= width) return s.substring(0, width);
        StringBuilder sb = new StringBuilder(s);
        while (sb.length() < width) sb.append(' ');
        return sb.toString();
    }

    private String padLeft(String s, int width) {
        if (s == null) s = "";
        if (s.length() >= width) return s;
        StringBuilder sb = new StringBuilder();
        for (int i = s.length(); i < width; i++) sb.append(' ');
        sb.append(s);
        return sb.toString();
    }

    private String padCenter(String s, int width) {
        if (s == null) s = "";
        if (s.length() >= width) return s;
        int totalPad = width - s.length();
        int leftPad  = totalPad / 2;
        int rightPad = totalPad - leftPad;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < leftPad;  i++) sb.append(' ');
        sb.append(s);
        for (int i = 0; i < rightPad; i++) sb.append(' ');
        return sb.toString();
    }

    private String sanitizeForPrinter(String s) {
        // Replace currency symbols not supported by ISO-8859-1 with ASCII equivalents
        return s
            .replace("\u20AC", "EUR")  // €
            .replace("\u20A1", "C/")   // ₡ Costa Rica colon
            .replace("\u20B2", "Gs.")  // ₲ Guarani
            .replace("\u20BA", "TL")   // ₺ Turkish lira
            .replace("\u20B9", "Rs.")  // ₹ Indian rupee
            .replace("\u20AA", "NIS")  // ₪ Israeli shekel
            .replace("\u20A6", "N")    // ₦ Nigerian naira
            .replace("\u20A8", "Rs.")  // ₨ Rupee
            .replace("\u0E3F", "BHT")  // ฿ Thai baht
            .replace("\u20BF", "BTC"); // ₿ Bitcoin
    }

    private void writeStr(ByteArrayOutputStream bos, String s) throws Exception {
        bos.write(sanitizeForPrinter(s).getBytes("ISO-8859-1"));
    }

    private void writeQRCode(ByteArrayOutputStream bos, String data) throws Exception {
        byte[] dataBytes = data.getBytes("UTF-8");
        int storeLen = dataBytes.length + 3;
        byte pL = (byte)(storeLen & 0xFF);
        byte pH = (byte)((storeLen >> 8) & 0xFF);

        // Select model 2
        bos.write(new byte[]{0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00});
        // Module size 4
        bos.write(new byte[]{0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x04});
        // Error correction level M
        bos.write(new byte[]{0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31});
        // Store data
        bos.write(new byte[]{0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30});
        bos.write(dataBytes);
        // Print
        bos.write(new byte[]{0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30});
    }
}
