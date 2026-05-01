import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../common/Toast';

export default function TicketPreview({ ticket, onClose, onMarkPaid, onCancel, onPrint }) {
  const ticketRef = useRef(null);
  const { profile } = useAuth();
  const showToast = useToast();

  if (!ticket) return null;

  const date = new Date(ticket.created_at);
  const sym = ticket.currency_symbol || '$';
  const sellerName = profile?.seller_code || ticket.seller_name || profile?.full_name || '';
  const numbers = ticket.numbers || [];

  const dayOfWeek = date.toLocaleDateString('es-ES', { weekday: 'long' });
  const dayCapitalized = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

  const unitPriceOf = (n) => Number(n.unitPrice ?? n.unit_price ?? 0);
  const chanceNum = numbers.find(n => n.number.length === 2);
  const paleNum   = numbers.find(n => n.number.length === 4);
  const chancePrice = chanceNum ? unitPriceOf(chanceNum) : null;
  const palePrice   = paleNum   ? unitPriceOf(paleNum)   : null;
  const totalPieces = numbers.reduce((s, n) => s + Number(n.pieces), 0);

  async function captureTicket() {
    const el = ticketRef.current;
    if (!el) return null;
    try {
      return await html2canvas(el, {
        scale: 3,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
    } catch {
      return null;
    }
  }

  async function handleShareWhatsapp() {
    const canvas = await captureTicket();
    if (!canvas) { showToast('Error al generar imagen', 'error'); return; }

    try {
      if (navigator.canShare) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const file = new File([blob], `ticket-${ticket.ticket_number}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Ticket de lotería' });
          return;
        }
      }
    } catch { /* continúa con fallback */ }

    if (typeof Android !== 'undefined' && Android.shareTicketFromAndroid) {
      Android.shareTicketFromAndroid(canvas.toDataURL('image/png'));
      return;
    }

    // Fallback web: texto a WhatsApp
    const hours = date.getHours() % 12 || 12;
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
    const lines = [
      `*${ticket.lottery_display_name}* — ${ticket.draw_time_label}`,
      `📅 ${date.toLocaleDateString('es-ES')} ${hours}:${minutes} ${ampm}`,
      sellerName ? `👤 ${sellerName}` : '',
      `🎫 ${ticket.ticket_number}`,
      '---',
      ...numbers.map(n => `*${n.number}*/${n.pieces}T/${sym}${Number(n.subtotal).toFixed(2)}`),
      '---',
      `*TOTAL: ${sym}${Number(ticket.total_amount).toFixed(2)}*`,
      '_SIN TICKET NO HAY RECLAMO_',
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  }

  async function handleShare() {
    const canvas = await captureTicket();
    if (!canvas) { showToast('Error al generar imagen', 'error'); return; }
    if (typeof Android !== 'undefined' && Android.shareTicketFromAndroid) {
      Android.shareTicketFromAndroid(canvas.toDataURL('image/png'));
    } else {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `ticket-${ticket.ticket_number}.png`;
      a.click();
    }
  }

  async function handleCopy() {
    const lines = [
      `LOTERÍA — ${ticket.lottery_display_name}`,
      `Sorteo: ${ticket.draw_time_label}`,
      `Fecha: ${dateStr} ${timeStr}`,
      `Ticket: ${ticket.ticket_number}`,
      sellerName ? `Vendedor: ${sellerName}` : '',
      '---',
      ...numbers.map(n => `*${n.number}*/${n.pieces}T/${sym}${Number(n.subtotal).toFixed(2)}`),
      '---',
      `TOTAL: ${sym}${Number(ticket.total_amount).toFixed(2)}`,
      'SIN TICKET NO HAY RECLAMO',
    ].filter(Boolean);

    const text = lines.join('\n');
    try {
      if (typeof Android !== 'undefined' && Android.copyToClipboard) {
        Android.copyToClipboard(text);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Copiado al portapapeles', 'success');
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  }

  /* ─── inline styles para garantizar render fiel en html2canvas ─── */
  const S = {
    ticket: {
      backgroundColor: '#ffffff',
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: '#000000',
      width: '100%',
    },
    borderSolid: { borderBottom: '1.5px solid #000000' },
    borderTop:   { borderTop:    '1.5px solid #000000' },
    borderTop2:  { borderTop:    '2.5px solid #000000' },
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl max-h-[95vh] flex flex-col">

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ══ TICKET IMPRIMIBLE ══ */}
          <div ref={ticketRef} style={S.ticket}>

            {/* HEADER: día / fecha / lotería */}
            <div style={{ textAlign: 'center', padding: '14px 12px 12px', ...S.borderSolid }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', lineHeight: '1.25', color: '#000' }}>
                {dayCapitalized}
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', lineHeight: '1.25', color: '#000' }}>
                {dateStr}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', lineHeight: '1.3', color: '#000', marginTop: '2px' }}>
                {ticket.lottery_display_name}
                {ticket.draw_time_label ? ` ${ticket.draw_time_label}` : ''}
              </div>
            </div>

            {/* INFO: orderNo / Pedido / precios */}
            <div style={{ padding: '10px 14px', ...S.borderSolid, fontSize: '14px', lineHeight: '1.7', color: '#000' }}>
              <div>orderNo: <strong>{ticket.ticket_number}</strong></div>
              <div>Pedido: {dateStr} {timeStr}</div>
              {(chancePrice || palePrice) && (
                <div style={{ marginTop: '2px' }}>
                  {chancePrice > 0 && `Chance ${chancePrice.toFixed(2)}`}
                  {chancePrice > 0 && palePrice > 0 && '  '}
                  {palePrice > 0 && `Pale ${palePrice.toFixed(2)}`}
                </div>
              )}
            </div>

            {/* TABLA DE NÚMEROS */}
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#000' }}>
              <thead>
                <tr style={S.borderSolid}>
                  <th style={{ padding: '8px 14px', textAlign: 'left',   fontWeight: '600', fontSize: '15px' }}>Numero</th>
                  <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: '600', fontSize: '15px' }}>Cantidad</th>
                  <th style={{ padding: '8px 14px', textAlign: 'right',  fontWeight: '600', fontSize: '15px' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '6px 14px', textAlign: 'left',   fontWeight: 'bold', fontSize: '18px' }}>*{n.number}*</td>
                    <td style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 'bold', fontSize: '18px' }}>{n.pieces}</td>
                    <td style={{ padding: '6px 14px', textAlign: 'right',  fontWeight: 'bold', fontSize: '18px' }}>{Number(n.subtotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={S.borderTop2}>
                  <td style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '17px' }}>Total</td>
                  <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 'bold', fontSize: '17px' }}>{totalPieces}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right',  fontWeight: 'bold', fontSize: '17px' }}>
                    {sym}{Number(ticket.total_amount).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* VENDEDOR / CLIENTE */}
            <div style={{ ...S.borderTop, padding: '10px 14px' }}>
              {sellerName && (
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px', color: '#000' }}>
                  -{sellerName}-
                </div>
              )}
              {ticket.customer_name && (
                <div style={{ textAlign: 'left', fontSize: '14px', marginTop: '4px', color: '#000' }}>
                  {ticket.customer_name}
                </div>
              )}
            </div>

            {/* QR */}
            <div style={{ ...S.borderTop, padding: '14px 12px', display: 'flex', justifyContent: 'center' }}>
              <QRCodeSVG value={ticket.ticket_number} size={120} />
            </div>

            {/* FOOTER */}
            <div style={{ ...S.borderTop, padding: '10px 14px', textAlign: 'center' }}>
              <span style={{ color: '#3b82f6', fontSize: '13px', fontWeight: '500' }}>
                Revisa su lista antes del sorteo
              </span>
            </div>

          </div>
          {/* fin ticket imprimible */}

          {/* ══ ACCIONES ══ */}
          <div className="px-4 pt-3 pb-4 space-y-2">

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onMarkPaid(ticket)}
                disabled={ticket.is_paid}
                className={`py-3 rounded-xl text-sm font-bold uppercase tracking-wide ${
                  ticket.is_paid
                    ? 'bg-gray-100 text-gray-400'
                    : 'bg-gradient-to-br from-[#28a745] to-[#20c997] text-white active:opacity-80'
                }`}
              >
                {ticket.is_paid ? '✓ COBRADO' : 'COBRAR'}
              </button>
              <button
                onClick={handleCopy}
                className="py-3 rounded-xl text-sm font-bold uppercase tracking-wide bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white active:opacity-80"
              >
                COPIAR
              </button>
            </div>

            <button
              onClick={handleShareWhatsapp}
              className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wide bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white active:opacity-80"
            >
              📲 COMPARTIR WHATSAPP
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleShare}
                className="py-3 rounded-xl text-sm font-bold uppercase tracking-wide bg-gradient-to-br from-[#007bff] to-[#0056b3] text-white active:opacity-80"
              >
                COMPARTIR
              </button>
              <button
                onClick={onClose}
                className="py-3 rounded-xl text-sm font-bold uppercase tracking-wide bg-gray-100 text-gray-700 active:bg-gray-200"
              >
                CERRAR
              </button>
            </div>

            {onPrint && (
              <button
                onClick={() => onPrint(ticket)}
                className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wide bg-gray-900 text-white active:opacity-80"
              >
                🖨 IMPRIMIR
              </button>
            )}

            {!ticket.is_cancelled && !ticket.is_paid && onCancel && (
              <button
                onClick={() => onCancel(ticket)}
                className="w-full py-2 rounded-xl text-xs text-red-400 active:text-red-600 font-semibold"
              >
                Anular ticket
              </button>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
