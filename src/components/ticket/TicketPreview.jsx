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
  const hours = date.getHours() % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
  const sym = ticket.currency_symbol || '$';
  const sellerName = profile?.seller_code || ticket.seller_name || profile?.full_name || '';

  async function captureTicket() {
    const el = ticketRef.current;
    if (!el) return null;
    const actionsEl = el.querySelector('[data-actions]');
    if (actionsEl) actionsEl.style.display = 'none';
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      if (actionsEl) actionsEl.style.display = '';
      return canvas;
    } catch {
      if (actionsEl) actionsEl.style.display = '';
      return null;
    }
  }

  async function handleShareWhatsapp() {
    const canvas = await captureTicket();
    if (!canvas) { showToast('Error al generar imagen', 'error'); return; }

    // Intentar compartir como imagen (Android abrirá sheet con WhatsApp)
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

    // Fallback Android nativo
    if (typeof Android !== 'undefined' && Android.shareTicketFromAndroid) {
      Android.shareTicketFromAndroid(canvas.toDataURL('image/png'));
      return;
    }

    // Fallback web: texto a WhatsApp
    const lines = [
      `*${ticket.lottery_display_name}* — ${ticket.draw_time_label}`,
      `📅 ${date.toLocaleDateString('es-ES')} ${hours}:${minutes} ${ampm}`,
      sellerName ? `👤 ${sellerName}` : '',
      `🎫 ${ticket.ticket_number}`,
      '---',
      ...(ticket.numbers || []).map(n =>
        `*${n.number}*/${n.pieces}T/${sym}${Number(n.subtotal).toFixed(2)}`
      ),
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
      `Fecha: ${date.toLocaleDateString('es-ES')} ${hours}:${minutes} ${ampm}`,
      `Ticket: ${ticket.ticket_number}`,
      sellerName ? `Vendedor: ${sellerName}` : '',
      '---',
      ...(ticket.numbers || []).map(n =>
        `*${n.number}*/${n.pieces}T/${sym}${Number(n.subtotal).toFixed(2)}`
      ),
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl max-h-[95vh] flex flex-col">

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Ticket scrollable */}
        <div className="overflow-y-auto flex-1">
          <div ref={ticketRef} className="bg-white px-5 pt-4 pb-2">

            {/* ══ HEADER ══ */}
            <div className="text-center pb-3 mb-3 border-b-2 border-dashed border-gray-400">
              <p className="text-3xl font-black tracking-widest text-gray-900">APM11</p>
              {sellerName && (
                <p className="text-sm font-bold text-gray-600 mt-0.5">{sellerName}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-1 tracking-wide">SIN TICKET NO HAY RECLAMO</p>
            </div>

            {/* ══ INFO ══ */}
            <div className="text-xs space-y-0.5 mb-3 font-mono">
              <div className="flex justify-between">
                <span className="text-gray-500">FECHA</span>
                <span className="font-bold text-gray-800">
                  {date.toLocaleDateString('es-ES')} {hours}:{minutes} {ampm}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">LOTERÍA</span>
                <span className="font-bold text-gray-800 text-right max-w-[60%] truncate">
                  {ticket.lottery_display_name}
                </span>
              </div>
              {ticket.draw_time_label && (
                <div className="flex justify-between">
                  <span className="text-gray-500">SORTEO</span>
                  <span className="font-bold text-gray-800">{ticket.draw_time_label}</span>
                </div>
              )}
              {ticket.customer_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">CLIENTE</span>
                  <span className="font-bold text-gray-800">{ticket.customer_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">ID</span>
                <span className="font-bold text-gray-700 text-[10px]">{ticket.ticket_number}</span>
              </div>
            </div>

            {/* ══ QR ══ */}
            <div className="flex justify-center my-3">
              <QRCodeSVG value={ticket.ticket_number} size={100} />
            </div>

            {/* ══ NÚMEROS ══ */}
            <div className="border-t-2 border-b-2 border-dashed border-gray-400 py-3 mb-3">
              {(ticket.numbers || []).map((n, i) => (
                <div key={i} className="flex justify-between items-baseline font-mono py-0.5">
                  <span className="text-xl font-black text-gray-900">*{n.number}*</span>
                  <span className="text-sm font-bold text-gray-500">{n.pieces}T</span>
                  <span className="text-base font-bold text-gray-800">
                    {sym}{Number(n.subtotal).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* ══ TOTAL ══ */}
            <div className="text-center pb-3 border-b-2 border-dashed border-gray-400 mb-1">
              <p className="text-xs text-gray-400 font-mono tracking-widest">TOTAL A PAGAR</p>
              <p className="text-3xl font-black text-gray-900 font-mono">
                {sym}{Number(ticket.total_amount).toFixed(2)}
              </p>
            </div>

            {/* ══ ACCIONES (ocultas en imagen) ══ */}
            <div data-actions className="pt-3 pb-2 space-y-2">
              {/* Fila 1: COBRAR + COPIAR */}
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

              {/* Fila 2: WHATSAPP (ancho completo) */}
              <button
                onClick={handleShareWhatsapp}
                className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wide bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white active:opacity-80"
              >
                📲 COMPARTIR WHATSAPP
              </button>

              {/* Fila 3: COMPARTIR + CERRAR */}
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

              {/* Imprimir */}
              {onPrint && (
                <button
                  onClick={() => onPrint(ticket)}
                  className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wide bg-gray-900 text-white active:opacity-80"
                >
                  🖨 IMPRIMIR
                </button>
              )}

              {/* Anular */}
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
    </div>
  );
}
