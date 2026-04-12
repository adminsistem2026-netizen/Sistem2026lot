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
        String saleDate     = t.optString("saleDate", "");
        String datetime     = t.optString("datetime", "");
        String ticketId     = t.optString("ticketId", "");
        String sellerName   = t.optString("sellerName", "");
        String customerName = t.optString("customerName", "");
        String total        = t.optString("total", "0.00");
        String currency     = t.optString("currencySymbol", "$");
        JSONArray numbers   = t.optJSONArray("numbers");

        // Format datetime to local date + time string
        String formattedDateTime = saleDate;
        if (!datetime.isEmpty()) {
            try {
                String clean = datetime.length() > 19 ? datetime.substring(0, 19) : datetime;
                SimpleDateFormat inFmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());
                inFmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date date = inFmt.parse(clean);
                SimpleDateFormat outFmt = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault());
                outFmt.setTimeZone(TimeZone.getDefault());
                formattedDateTime = outFmt.format(date);
            } catch (Exception ignored) {}
        }

        ByteArrayOutputStream bos = new ByteArrayOutputStream();

        // ESC @ — init
        bos.write(new byte[]{0x1B, 0x40});

        // Lottery name — center, double width, bold
        bos.write(new byte[]{0x1B, 0x61, 0x01, 0x1D, 0x21, 0x10, 0x1B, 0x45, 0x01});
        writeStr(bos, lotteryName + "\n");
        bos.write(new byte[]{0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00});
        if (!drawTime.isEmpty()) writeStr(bos, "Sorteo: " + drawTime + "\n");
        writeStr(bos, "Venta: " + formattedDateTime + "\n");
        writeStr(bos, "--------------------------------\n");

        // Headers mirror data row format
        // Row 1: CIFRA + CANT in double width, left-aligned
        bos.write(new byte[]{0x1B, 0x61, 0x00, 0x1D, 0x21, 0x10});
        writeStr(bos, "CIFRA   CANT\n");
        // Row 2: SUBTOTAL right-aligned, normal size
        bos.write(new byte[]{0x1D, 0x21, 0x00, 0x1B, 0x61, 0x02});
        writeStr(bos, "SUBTOTAL\n");
        bos.write(new byte[]{0x1B, 0x61, 0x00});
        writeStr(bos, "--------------------------------\n");

        if (numbers != null) {
            for (int i = 0; i < numbers.length(); i++) {
                JSONObject n = numbers.getJSONObject(i);
                String num = "*" + n.optString("number", "") + "*";
                String pcs = "*" + n.optString("pieces", "") + "*";
                String sub = currency + n.optString("subtotal", "");
                writeStr(bos, "\n");
                // Line 1: number + pieces — double width, no bold
                bos.write(new byte[]{0x1D, 0x21, 0x10});
                writeStr(bos, num + "  " + pcs + "\n");
                // Line 2: subtotal — normal size, right-aligned, no bold
                bos.write(new byte[]{0x1D, 0x21, 0x00, 0x1B, 0x61, 0x02});
                writeStr(bos, sub + "\n");
                bos.write(new byte[]{0x1B, 0x61, 0x00});
                writeStr(bos, "\n");
                writeStr(bos, "--------------------------------\n");
            }
        }


        // TOTAL — right-aligned, double width, bold
        bos.write(new byte[]{0x1B, 0x61, 0x02, 0x1D, 0x21, 0x10, 0x1B, 0x45, 0x01});
        writeStr(bos, "TOTAL: " + currency + total + "\n");
        bos.write(new byte[]{0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00});

        // Left — footer
        bos.write(new byte[]{0x1B, 0x61, 0x00});
        if (!customerName.isEmpty()) writeStr(bos, "Cliente: " + customerName + "\n");
        writeStr(bos, "Vendedor: " + sellerName + "\n");
        writeStr(bos, "ID: " + ticketId + "\n");
        writeStr(bos, "SIN TICKET NO HAY RECLAMO\n");
        writeStr(bos, "\n");

        // QR code centered
        bos.write(new byte[]{0x1B, 0x61, 0x01});
        writeQRCode(bos, ticketId);
        writeStr(bos, "\n");

        // Feed 4 lines + partial cut
        bos.write(new byte[]{0x1B, 0x64, 0x04});  // ESC d 4
        bos.write(new byte[]{0x1D, 0x56, 0x01});  // GS V 1 — partial cut

        return bos.toByteArray();
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
