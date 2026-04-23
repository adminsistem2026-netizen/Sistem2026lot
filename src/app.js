import { createClient } from '@insforge/sdk';

// ==================== InsForge Client ====================
const client = createClient({
    baseUrl: import.meta.env.VITE_INSFORGE_URL || 'https://e8cpb3g3.us-east.insforge.app',
    anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY || 'ik_1016f97bf745645904003df562a619b1',
});
const auth = client.auth;
const db = client.database;

// ==================== Global State ====================
let currentUser = null;
let currentProfile = null;
let lotteries = []; // [{id, name, code, draw_times:[{id, time_label}]}]
let drawTimesMap = {}; // {lotteryCode: [{id, time_label}]}

// UI state
let numbers = [];
let tickets = [];
let currentPreviewTicket = null;

// Printer state
let savedPrinterAddress = localStorage.getItem('printerAddress') || null;
let savedPrinterName = localStorage.getItem('printerName') || null;

let salesLimits = { chances: {}, billetes: {} };
let currentSales = { chances: {}, billetes: {} };

let sellerPercentage = 13;
let sellerName = 'XXXXX';

let activeTab = 'tiempos';
let menuOpen = false;
let currentActiveInput = null;
let keyboardVisible = false;
let html5QrcodeScanner = null;

// ==================== Loading Overlay ====================
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

// ==================== Auth ====================
async function checkPassword() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const errorEl = document.getElementById('loginError');
    errorEl.innerText = '';

    if (!email || !password) {
        errorEl.innerText = 'Ingrese correo y contraseña.';
        return;
    }

    showLoading();
    try {
        const { data, error } = await auth.signInWithPassword({ email, password });
        if (error || !data?.user) {
            errorEl.innerText = 'Correo o contraseña incorrectos.';
            return;
        }
        currentUser = data.user;
        await loadProfile();
        if (currentProfile?.is_active === false) {
            await auth.signOut();
            currentUser = null;
            currentProfile = null;
            errorEl.innerText = 'Tu cuenta está desactivada. Contacta al administrador.';
            return;
        }
        await initApp();
        showMainPage();
    } catch (err) {
        console.error('Login error:', err);
        errorEl.innerText = 'Error al iniciar sesión.';
    } finally {
        hideLoading();
    }
}

async function logout() {
    closeMenu();
    showLoading();
    try {
        await auth.signOut();
    } catch (e) {
        console.error('Logout error:', e);
    } finally {
        currentUser = null;
        currentProfile = null;
        hideLoading();
        showLoginPage();
    }
}

async function loadProfile() {
    if (!currentUser) return;
    try {
        const { data, error } = await db.from('profiles')
            .select('*')
            .eq('id', currentUser.id);
        if (!error && data && data.length > 0) {
            currentProfile = { ...data[0] };
            // Cargar columnas nuevas via RPC (evita bug schema cache de InsForge)
            try {
                const { data: codes } = await db.rpc('get_profile_codes', { p_user_id: currentUser.id });
                if (codes?.[0]) {
                    currentProfile = {
                        ...currentProfile,
                        seller_code: codes[0].seller_code,
                        parent_admin_id: codes[0].parent_admin_id,
                        admin_code: codes[0].admin_code,
                    };
                    const adminCode = codes[0].admin_code;
                    const baseName = currentProfile.full_name || currentProfile.name || 'Vendedor';
                    sellerName = adminCode ? `${adminCode} - ${baseName}` : (codes[0].seller_code || baseName);
                } else {
                    sellerName = currentProfile.full_name || currentProfile.name || sellerName;
                }
            } catch(_) {
                sellerName = currentProfile.full_name || currentProfile.name || sellerName;
            }
            if (currentProfile.seller_percentage != null) {
                sellerPercentage = currentProfile.seller_percentage;
            }
        }
    } catch (e) {
        console.error('loadProfile error:', e);
    }
}

function getAdminId() {
    if (currentProfile) return currentProfile.parent_admin_id || currentProfile.id;
    return currentUser?.id || null;
}

// ==================== Lotteries ====================
async function loadLotteries() {
    try {
        const adminId = getAdminId();
        const { data: lotData, error: lotError } = await db
            .from('lotteries')
            .select('*')
            .eq('admin_id', adminId);
        if (lotError) { console.error('lotteries error:', lotError); return; }

        const activeLotteries = (lotData || [])
            .filter(l => l.is_active !== false)
            .sort((a, b) => {
                const aRev = a.display_name.includes('REVENTADO') ? 1 : 0;
                const bRev = b.display_name.includes('REVENTADO') ? 1 : 0;
                if (aRev !== bRev) return aRev - bRev;
                return a.display_name.localeCompare(b.display_name);
            });

        if (activeLotteries.length === 0) {
            lotteries = [];
            populateLotteryDropdowns();
            return;
        }

        const { data: dtData, error: dtError } = await db
            .from('draw_times')
            .select('*');
        if (dtError) { console.error('draw_times error:', dtError); return; }

        // Fetch multipliers via RPC (InsForge schema cache ignores new columns with select('*'))
        const { data: mData, error: mError } = await db.rpc('get_lottery_billete_multipliers');
        if (mError) console.error('get_lottery_billete_multipliers RPC error:', mError);
        const mMap = {};
        (mData || []).forEach(r => { mMap[r.id] = r; });

        lotteries = activeLotteries.map(lot => ({
            ...lot,
            ...(mMap[lot.id] || {}),
            code: lot.id,
            name: lot.display_name,
            draw_times: (dtData || []).filter(dt => dt.lottery_id === lot.id),
        }));

        drawTimesMap = {};
        lotteries.forEach(lot => {
            drawTimesMap[lot.id] = lot.draw_times || [];
        });

        populateLotteryDropdowns();
    } catch (e) {
        console.error('loadLotteries error:', e);
    }
}

function populateLotteryDropdowns() {
    const selectIds = [
        'lotteryType',
        'filterLotteryType',
        'filterLottery',
        'limitChanceLotteryType',
        'limitBilleteLotteryType',
        'winnerLotteryType',
    ];

    selectIds.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;

        const isFilter = id.startsWith('filter') || id === 'filterLottery';
        const firstOptionText = isFilter ? 'Todas las Loterías' : 'Elegir loteria';
        sel.innerHTML = `<option value="">${firstOptionText}</option>`;

        const isTicketSelect = id === 'lotteryType';
        const lotList = isTicketSelect
            ? lotteries.filter(lot => (drawTimesMap[lot.id] || []).some(dt => !isDrawTimePast(dt)))
            : lotteries;
        lotList.forEach(lot => {
            const opt = document.createElement('option');
            opt.value = lot.id;           // value = DB id (uuid)
            opt.textContent = lot.display_name;
            sel.appendChild(opt);
        });
    });

    // Restaurar lotería y hora seleccionadas antes de salir de la app
    const savedLottery = localStorage.getItem('sel_lottery');
    if (savedLottery) {
        const lotterySelect = document.getElementById('lotteryType');
        if (lotterySelect && [...lotterySelect.options].some(o => o.value === savedLottery)) {
            lotterySelect.value = savedLottery;
            const timeSelect = document.getElementById('drawTimeSelect');
            populateDrawTimeSelect(timeSelect, savedLottery);
            const savedDrawTime = localStorage.getItem('sel_draw_time');
            if (savedDrawTime && [...timeSelect.options].some(o => o.value === savedDrawTime)) {
                timeSelect.value = savedDrawTime;
            }
        }
    }
}

// ==================== Draw times helpers ====================
function getDrawTimesForId(lotteryId) {
    return drawTimesMap[lotteryId] || [];
}

// Backward-compat alias
function getDrawTimesForCode(code) {
    return getDrawTimesForId(code);
}

function isDrawTimePast(dt) {
    if (!dt?.time_value) return false;
    const now = new Date();
    const [h, m] = dt.time_value.split(':').map(Number);
    return (now.getHours() * 60 + now.getMinutes()) >= (h * 60 + m);
}

function isDrawTimeBlocked(dt) {
    if (!dt?.time_value) return { blocked: false };
    const now = new Date();
    const [h, m] = dt.time_value.split(':').map(Number);
    const drawMinutes = h * 60 + m;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const diff = drawMinutes - nowMinutes;
    const cutoff = dt.cutoff_minutes_before ?? 1;
    const blockAfter = dt.block_minutes_after ?? 20;
    if (diff >= 0 && diff <= cutoff) return { blocked: true, reason: `Cierra en ${diff} min` };
    if (diff < 0 && Math.abs(diff) <= blockAfter) return { blocked: true, reason: `Bloqueado ${blockAfter - Math.abs(diff)} min más` };
    return { blocked: false };
}

function populateDrawTimeSelect(selectEl, lotteryId, defaultText = 'Hora de sorteo', filterPast = true) {
    selectEl.innerHTML = `<option value="">${defaultText}</option>`;
    if (!lotteryId) { selectEl.disabled = true; return; }
    const allTimes = getDrawTimesForId(lotteryId);
    const times = filterPast ? allTimes.filter(dt => !isDrawTimePast(dt)) : allTimes;
    if (times.length === 0) { selectEl.disabled = true; return; }
    times.forEach(dt => {
        const opt = document.createElement('option');
        opt.value = dt.id;            // value = draw_time DB id (uuid)
        opt.textContent = dt.time_label;
        selectEl.appendChild(opt);
    });
    selectEl.disabled = false;
}

// Get lottery object by id
function getLotteryById(id) {
    return lotteries.find(l => l.id === id) || null;
}

// Get draw_time object by id
function getDrawTimeById(id) {
    for (const lot of lotteries) {
        const dt = (lot.draw_times || []).find(d => d.id === id);
        if (dt) return dt;
    }
    return null;
}

// ==================== Lottery display helpers ====================
function isReventado(lotteryType) {
    return lotteryType && lotteryType.startsWith('REVENTADO_');
}

function getDisplayName(lotteryId) {
    const found = lotteries.find(l => l.id === lotteryId);
    return found ? found.display_name : lotteryId || '';
}

function getDrawTimeLabelById(drawTimeId) {
    if (!drawTimeId) return '';
    for (const dts of Object.values(drawTimesMap)) {
        const found = dts.find(dt => dt.id === drawTimeId);
        if (found) return found.time_label;
    }
    return '';
}

// ==================== Adapt DB ticket to UI format ====================
function adaptTicket(t) {
    return {
        id: t.id,
        dbId: t.id,
        ticketNumber: t.ticket_number || '',
        datetime: t.created_at || t.sale_date,
        saleDate: t.sale_date || '',
        lottery: getDisplayName(t.lottery_id),
        lotteryId: t.lottery_id || '',
        drawTime: getDrawTimeLabelById(t.draw_time_id),
        drawTimeId: t.draw_time_id || '',
        numbers: (t.ticket_numbers || []).map(n => ({
            number: n.number,
            pieces: n.pieces,
            subTotal: parseFloat(n.subtotal || 0),
        })),
        total: parseFloat(t.total_amount || 0),
        paid: t.is_paid || false,
        cancelled: t.is_cancelled || false,
        customerName: t.customer_name || '',
        seller_id: t.seller_id,
    };
}

// ==================== Tickets (DB) ====================
async function loadTickets(filters = {}) {
    try {
        const isSeller = currentProfile && currentProfile.parent_admin_id;
        const { data: ticketsData, error: ticketsError } = await db.rpc('get_user_tickets', {
            p_seller_id: isSeller ? currentProfile.id : null,
            p_admin_id:  isSeller ? null : (currentProfile?.id || null),
        });
        if (ticketsError) { console.error('loadTickets error:', ticketsError); return []; }

        const result = ticketsData || [];
        if (result.length === 0) return [];

        // Fetch ticket_numbers via RPC para evitar bug .in() de InsForge y traer solo los del usuario
        const { data: numsData } = await db.rpc('get_ticket_numbers_for_user', {
            p_seller_id: isSeller ? currentProfile.id : null,
            p_admin_id:  isSeller ? null : currentProfile?.id || null,
        });
        const numsByTicket = {};
        (numsData || []).forEach(n => {
            if (!numsByTicket[n.ticket_id]) numsByTicket[n.ticket_id] = [];
            numsByTicket[n.ticket_id].push(n);
        });

        return result.map(t => adaptTicket({ ...t, ticket_numbers: numsByTicket[t.id] || [] }));
    } catch (e) {
        console.error('loadTickets exception:', e);
        return [];
    }
}

async function forceLogoutSuspended() {
    try { await auth.signOut(); } catch (_) {}
    currentUser = null;
    currentProfile = null;
    showLoginPage();
    showNotification('Tu cuenta ha sido desactivada. Contacta al administrador.');
}

async function generateTicket() {
    if (numbers.length === 0) {
        showNotification('Agregue números al ticket');
        return;
    }

    // Verificar que la cuenta siga activa antes de registrar la venta
    try {
        const { data: profileCheck } = await db.from('profiles').select('is_active').eq('id', currentUser.id);
        if (profileCheck?.[0]?.is_active === false) {
            await forceLogoutSuspended();
            return;
        }
    } catch (_) { /* si falla la red, se deja pasar — el check periódico lo capturará */ }

    const lotteryType = document.getElementById('lotteryType').value;
    const drawTime = document.getElementById('drawTimeSelect').value;
    const customerName = document.getElementById('customerName').value;

    if (!lotteryType) {
        showNotification('Seleccione una lotería');
        return;
    }

    const lotteryObj = getSelectedLotteryObj();
    const drawTimeObj = getSelectedDrawTimeObj();
    const drawTimeLabel = drawTimeObj ? drawTimeObj.time_label : '';

    if (lotteryObj && lotteryObj.draw_times && lotteryObj.draw_times.length > 0 && !drawTime) {
        showNotification('Seleccione hora de sorteo');
        return;
    }

    if (!validarHorarioVenta()) {
        if (lotteryObj && lotteryObj.draw_times && lotteryObj.draw_times.length > 0) {
            const _dtObj = getSelectedDrawTimeObj();
            const _cut = _dtObj?.cutoff_minutes_before ?? 1;
            const _blk = _dtObj?.block_minutes_after ?? 20;
            showNotification(`No se puede generar el ticket. Ventas bloqueadas ${_cut} min antes y ${_blk} min después del sorteo.`, 'warning');
            return;
        }
    }

    const totalAmount = numbers.reduce((sum, item) => {
        const subTotal = typeof item.subTotal === 'number' ? item.subTotal : parseFloat(item.subTotal);
        return sum + (isNaN(subTotal) ? 0 : subTotal);
    }, 0);

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const ticketNumber = `TK-${dateStr}-${Math.random().toString(36).substring(2,8).toUpperCase()}`;

    showLoading();
    try {
        // Refrescar totales globales para capturar ventas de otros vendedores
        await calculateCurrentSales();

        // Re-validar cada número con datos frescos antes de guardar
        for (const num of numbers) {
            if (!checkLimits(num.number, num.pieces)) {
                return; // checkLimits ya muestra la notificación
            }
            // Acumular este número para que los siguientes en el mismo ticket lo vean
            updateCurrentSales(num.number, num.pieces, true);
        }

        // Guardar ticket + números en una sola transacción atómica via RPC
        const numberRows = numbers.map(n => ({
            number:      n.number,
            digit_count: n.number.length,
            pieces:      n.pieces,
            unit_price:  n.pieces > 0 ? parseFloat((n.subTotal / n.pieces).toFixed(4)) : 0,
            subtotal:    n.subTotal,
        }));

        const { data: rpcData, error: ticketError } = await db.rpc('save_ticket', {
            p_ticket_number:   ticketNumber,
            p_seller_id:       currentProfile ? currentProfile.id : currentUser?.id || null,
            p_admin_id:        currentProfile?.parent_admin_id || currentProfile?.id || currentUser?.id || null,
            p_lottery_id:      lotteryObj ? lotteryObj.id : null,
            p_draw_time_id:    drawTimeObj ? drawTimeObj.id : null,
            p_customer_name:   customerName || null,
            p_total_amount:    totalAmount,
            p_currency_symbol: currentProfile?.currency_symbol || lotteryObj?.currency_symbol || '$',
            p_sale_date:       dateStr,
            p_numbers:         numberRows,
        });
        if (ticketError) {
            console.error('Insert ticket error:', ticketError);
            showNotification('Error al guardar el ticket: ' + (ticketError.message || JSON.stringify(ticketError)), 'error', 6000);
            return;
        }

        const ticketId = rpcData || null;

        // Build local ticket object for preview
        const ticket = {
            id: ticketId,
            dbId: ticketId,
            ticketNumber: ticketNumber,
            datetime: new Date().toISOString(),
            lottery: lotteryType,
            lotteryName: lotteryObj?.display_name || lotteryType,
            drawTime: drawTimeLabel,
            numbers: JSON.parse(JSON.stringify(numbers)),
            total: totalAmount,
            paid: false,
            customerName: customerName,
            currencySymbol: currentProfile?.currency_symbol || lotteryObj?.currency_symbol || '$',
        };

        calculateCurrentSales();
        showTicketPreview(ticket);
        resetForm();

    } catch (err) {
        console.error('generateTicket error:', err);
        showNotification('Ha ocurrido un error al generar el ticket. Por favor, intente nuevamente.');
    } finally {
        hideLoading();
    }
}

async function marcarComoPagado(ticketId) {
    showLoading();
    try {
        // ticketId here is the ticket_number string; find dbId from displayed tickets
        const allTickets = await loadTickets();
        const ticket = allTickets.find(t => t.id === ticketId);
        if (!ticket) {
            showNotification('❌ Ticket no encontrado', 'error');
            return;
        }

        const { error } = await db.from('tickets')
            .update({ is_paid: true })
            .eq('id', ticket.dbId);

        if (error) {
            showNotification('Error al marcar como pagado.', 'error');
            return;
        }

        showNotification('✅ Ticket marcado como pagado correctamente', 'success');
        const updatedTicket = { ...ticket, paid: true };
        showTicketPreview(updatedTicket);

        const salesPage = document.getElementById('salesPage');
        if (salesPage.style.display !== 'none') {
            displayTickets();
            const currentDate = document.getElementById('salesDate').value;
            if (currentDate) showSalesByDate(currentDate);
        }

        calculateCurrentSales();
    } catch (e) {
        console.error('marcarComoPagado error:', e);
        showNotification('Error al procesar.', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteTicket(ticketId) {
    const allTickets = await loadTickets();
    const ticketToDelete = allTickets.find(t => t.id === ticketId);

    if (!ticketToDelete) {
        showNotification('Ticket no encontrado', 'error');
        return;
    }

    const ticketDate = ticketToDelete.datetime ? new Date(ticketToDelete.datetime).toDateString() : null;
    if (ticketDate && ticketDate !== new Date().toDateString()) {
        showNotification('🚫 No se puede eliminar un ticket de días anteriores', 'warning', 5000);
        return;
    }

    const validationResult = validarHorarioEliminacion(ticketToDelete.lottery, ticketToDelete.drawTime);
    if (!validationResult.allowed) {
        const message = getEliminationBlockMessage(validationResult);
        showNotification(message, 'warning', 6000);
        return;
    }

    showConfirm('¿Está seguro de eliminar este ticket?', 'Eliminar Ticket', async () => {
        showLoading();
        try {
            const { error } = await db.from('tickets')
                .update({ is_cancelled: true, cancelled_at: new Date().toISOString(), cancelled_by: currentUser?.id || null })
                .eq('id', ticketToDelete.dbId);

            if (error) {
                showNotification('Error al eliminar el ticket.', 'error');
                return;
            }

            closeTicket();
            const currentDate = document.getElementById('salesDate').value;
            if (currentDate) showSalesByDate(currentDate);
            else { displayTickets(); }
            calculateCurrentSales();
            showNotification('Ticket eliminado correctamente', 'success');
        } catch (e) {
            console.error('deleteTicket error:', e);
        } finally {
            hideLoading();
        }
    });
}

// ==================== Sales Limits (DB) ====================
async function loadLimitsFromDB() {
    try {
        const adminId = getAdminId();
        if (!adminId) return;
        const { data, error } = await db.from('sales_limits')
            .select('*, draw_times(time_label)')
            .eq('admin_id', adminId);
        if (error) { console.error('loadLimitsFromDB error:', error); return; }
        salesLimits = { chances: {}, billetes: {} };
        (data || []).forEach(row => {
            const drawLabel = row.draw_times?.time_label || 'default';
            const key = row.lottery_id ? `${row.lottery_id}_${drawLabel}` : '__global__';
            const type = row.digit_type === 4 ? 'billetes' : 'chances';
            if (!salesLimits[type][key]) salesLimits[type][key] = { globalLimit: 0, numbers: {} };
            if (row.number === null) {
                salesLimits[type][key].globalLimit = row.max_pieces;
            } else {
                salesLimits[type][key].numbers[row.number] = row.max_pieces;
            }
        });
    } catch (e) {
        console.error('loadLimitsFromDB exception:', e);
    }
}

// ==================== Calculate current sales from DB ====================
// Carga el total vendido de TODOS los vendedores del admin (límite global compartido)
async function calculateCurrentSales() {
    currentSales = { chances: {}, billetes: {} };

    try {
        const adminId = getAdminId();
        if (!adminId) return;

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

        const { data, error } = await db.rpc('get_admin_daily_sales', {
            p_admin_id: adminId,
            p_date: todayStr,
        });

        if (error) {
            console.error('calculateCurrentSales error:', error);
            return;
        }

        (data || []).forEach(row => {
            const key = `${row.lottery_id}_${row.time_label || 'default'}`;
            const pieces = parseInt(row.total_pieces, 10);
            if (row.digit_count === 2) {
                if (!currentSales.chances[key]) currentSales.chances[key] = {};
                currentSales.chances[key][row.number] = (currentSales.chances[key][row.number] || 0) + pieces;
            } else if (row.digit_count === 4) {
                if (!currentSales.billetes[key]) currentSales.billetes[key] = {};
                currentSales.billetes[key][row.number] = (currentSales.billetes[key][row.number] || 0) + pieces;
            }
        });
    } catch (e) {
        console.error('calculateCurrentSales error:', e);
    }
}

// ==================== Seller config ====================
function openPercentageModal() {
    closeMenu();
    const modal = document.getElementById('percentageModal');
    document.getElementById('sellerPercentageInput').value = sellerPercentage;
    document.getElementById('sellerNameInput').value = sellerName;
    const errorElement = document.getElementById('percentageError');
    if (errorElement) errorElement.style.display = 'none';
    modal.style.display = 'block';
}

function closePercentageModal() {
    document.getElementById('percentageModal').style.display = 'none';
}

function saveSellerConfig() {
    const newPercentage = parseFloat(document.getElementById('sellerPercentageInput').value);
    const newName = document.getElementById('sellerNameInput').value.trim();
    const errorElement = document.getElementById('percentageError');

    if (!newName) {
        errorElement.textContent = 'Por favor ingrese el nombre del vendedor.';
        errorElement.style.display = 'block';
        return;
    }

    if (isNaN(newPercentage) || newPercentage < 0 || newPercentage > 100) {
        errorElement.textContent = 'Ingrese un porcentaje válido entre 0 y 100.';
        errorElement.style.display = 'block';
        return;
    }

    sellerPercentage = newPercentage;
    sellerName = newName;

    closePercentageModal();

    updateNumberSalesTable();
    updateBilletesSalesTable();

    showNotification(`Configuración actualizada:\nVendedor: ${sellerName}\nPorcentaje: ${sellerPercentage}%`);
}

// ==================== Init ====================
async function initApp() {
    updateDateTime();
    setInterval(updateDateTime, 1000);

    await loadLotteries();
    await loadLimitsFromDB();
    await calculateCurrentSales();

    // Refrescar totales globales cada 30 segundos para detectar ventas de otros vendedores
    setInterval(calculateCurrentSales, 30000);

    // Refrescar token JWT cada 3 minutos (expira en ~5 min en InsForge)
    setInterval(async () => {
        try {
            await auth.refreshSession();
        } catch (e) {
            console.warn('Token refresh failed:', e);
        }
    }, 3 * 60 * 1000);

    // Verificar estado de cuenta y loterías cada 60 segundos
    setInterval(async () => {
        if (!currentUser) return;
        try {
            const { data } = await db.from('profiles').select('is_active').eq('id', currentUser.id);
            if (data?.[0]?.is_active === false) {
                await forceLogoutSuspended();
                return;
            }
        } catch (e) {
            console.warn('Account status check failed:', e);
        }
        try {
            await loadLotteries();
        } catch (e) {
            console.warn('Lotteries refresh failed:', e);
        }
    }, 60 * 1000);

    initKeyboardEvents();

    // Activar menú sub_admin si aplica
    if (isSubAdmin()) {
        activateSubAdminMenu();
        loadSubAdminSellers(); // precarga vendedores para filtros
    }

    // Persistir hora de sorteo seleccionada en localStorage
    const drawTimeSelect = document.getElementById('drawTimeSelect');
    if (drawTimeSelect) {
        drawTimeSelect.addEventListener('change', function () {
            if (this.value) {
                localStorage.setItem('sel_draw_time', this.value);
            } else {
                localStorage.removeItem('sel_draw_time');
            }
        });
    }
}

function updateDateTime() {
    const el = document.getElementById('datetime');
    if (el) el.textContent = new Date().toLocaleString();
}

// ==================== Sub-Admin ====================
let subAdminSellers = [];    // vendedores de este sub_admin
let editingSubAdminSeller = null; // vendedor en edición

function isSubAdmin() {
    return currentProfile?.role === 'sub_admin';
}

function activateSubAdminMenu() {
    document.querySelectorAll('.sub-admin-only').forEach(el => el.style.display = 'flex');
}

// ---- Mis Vendedores ----
async function showMisVendedoresPage() {
    closeMenu();
    hideAllPages();
    document.getElementById('misVendedoresPage').style.display = 'block';
    await loadSubAdminSellers();
}

async function loadSubAdminSellers() {
    const lista = document.getElementById('subAdminSellersList');
    const limitEl = document.getElementById('subAdminSellersLimit');
    lista.innerHTML = '<p style="text-align:center;color:#888;padding:20px 0;">Cargando...</p>';

    try {
        const { data, error } = await db.rpc('get_subadmin_sellers', { p_sub_admin_id: currentProfile.id });
        if (error) throw error;
        subAdminSellers = data || [];

        // Verificar límite del plan del admin
        const adminId = currentProfile.parent_admin_id;
        if (adminId) {
            const { data: adminProfile } = await db.from('profiles').select('max_sellers, plan_expiry').eq('id', adminId);
            const ap = adminProfile?.[0];
            if (ap) {
                const { data: totalSellers } = await db.from('profiles').select('id').eq('parent_admin_id', adminId).eq('role', 'seller');
                const used = (totalSellers || []).length;
                const max = ap.max_sellers ?? 5;
                const expired = ap.plan_expiry && new Date(ap.plan_expiry) < new Date();
                if (expired) {
                    limitEl.style.display = 'block';
                    limitEl.textContent = '⚠️ El plan del admin está vencido. No puedes crear nuevos vendedores hasta que se renueve.';
                } else if (used >= max) {
                    limitEl.style.display = 'block';
                    limitEl.textContent = `⚠️ Límite alcanzado: ${used}/${max} vendedores usados. No se pueden crear más.`;
                } else {
                    limitEl.style.display = 'block';
                    limitEl.style.background = '#ecfdf5';
                    limitEl.style.borderColor = '#34d399';
                    limitEl.style.color = '#065f46';
                    limitEl.textContent = `Vendedores: ${used}/${max} usados`;
                }
            }
        }

        if (subAdminSellers.length === 0) {
            lista.innerHTML = '<p style="text-align:center;color:#888;padding:20px 0;">No tienes vendedores aún. Crea el primero.</p>';
            return;
        }

        const sym = currentProfile?.currency_symbol || '$';
        lista.innerHTML = subAdminSellers.map(s => `
            <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <div style="flex:1;min-width:0;">
                        <p style="margin:0;font-weight:700;color:#1e293b;font-size:0.95em;">${s.full_name}</p>
                        <p style="margin:2px 0 0;font-size:0.78em;color:#64748b;">${s.email}</p>
                        <span style="display:inline-block;margin-top:6px;font-size:0.72em;background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:999px;">Comisión ${s.seller_percentage}%</span>
                        <span style="display:inline-block;margin-top:6px;margin-left:4px;font-size:0.72em;padding:2px 8px;border-radius:999px;${s.is_active ? 'background:#dcfce7;color:#16a34a;' : 'background:#f1f5f9;color:#94a3b8;'}">${s.is_active ? 'Activo' : 'Inactivo'}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                        <button onclick="openEditarVendedorSubAdmin('${s.id}')" style="background:#4f46e5;border:none;border-radius:8px;color:white;padding:6px 12px;font-size:0.75em;font-weight:600;cursor:pointer;">Editar</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        lista.innerHTML = `<p style="text-align:center;color:#dc2626;padding:20px 0;">Error: ${e.message}</p>`;
    }
}

function openCrearVendedorSubAdmin() {
    editingSubAdminSeller = null;
    document.getElementById('subAdminVendedorModalTitle').textContent = 'Nuevo Vendedor';
    document.getElementById('svGuardarBtn').textContent = 'Crear Vendedor';
    document.getElementById('svNombre').value = '';
    document.getElementById('svEmail').value = '';
    document.getElementById('svPassword').value = '';
    document.getElementById('svPorcentaje').value = String(currentProfile?.seller_percentage ?? 13);
    document.getElementById('svPasswordLabel').textContent = 'Contraseña *';
    document.getElementById('svEmailRow').style.display = 'block';
    document.getElementById('svError').style.display = 'none';
    document.getElementById('subAdminVendedorModal').style.display = 'flex';
}

function openEditarVendedorSubAdmin(sellerId) {
    const s = subAdminSellers.find(x => x.id === sellerId);
    if (!s) return;
    editingSubAdminSeller = s;
    document.getElementById('subAdminVendedorModalTitle').textContent = 'Editar Vendedor';
    document.getElementById('svGuardarBtn').textContent = 'Guardar Cambios';
    document.getElementById('svNombre').value = s.full_name;
    document.getElementById('svEmail').value = s.email;
    document.getElementById('svPassword').value = '';
    document.getElementById('svPorcentaje').value = String(s.seller_percentage);
    document.getElementById('svPasswordLabel').textContent = 'Nueva contraseña (dejar vacío para no cambiar)';
    document.getElementById('svEmailRow').style.display = 'none';
    document.getElementById('svError').style.display = 'none';
    document.getElementById('subAdminVendedorModal').style.display = 'flex';
}

function closeSubAdminVendedorModal() {
    document.getElementById('subAdminVendedorModal').style.display = 'none';
    editingSubAdminSeller = null;
}

async function guardarVendedorSubAdmin() {
    const nombre = document.getElementById('svNombre').value.trim();
    const email  = document.getElementById('svEmail').value.trim();
    const pass   = document.getElementById('svPassword').value.trim();
    const pct    = parseFloat(document.getElementById('svPorcentaje').value);
    const errEl  = document.getElementById('svError');
    const btn    = document.getElementById('svGuardarBtn');

    errEl.style.display = 'none';
    if (!nombre) { errEl.textContent = 'El nombre es obligatorio'; errEl.style.display = 'block'; return; }
    if (!editingSubAdminSeller && !email) { errEl.textContent = 'El correo es obligatorio'; errEl.style.display = 'block'; return; }
    if (!editingSubAdminSeller && !pass) { errEl.textContent = 'La contraseña es obligatoria'; errEl.style.display = 'block'; return; }
    if (isNaN(pct) || pct < 0 || pct > 100) { errEl.textContent = 'Porcentaje inválido (0-100)'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
        if (editingSubAdminSeller) {
            // Editar: actualizar nombre y %
            await db.from('profiles').update({ full_name: nombre, seller_percentage: pct }).eq('id', editingSubAdminSeller.id);
            // Cambiar contraseña si se ingresó
            if (pass) {
                const { error: pwErr } = await db.rpc('change_user_password', {
                    p_user_id: editingSubAdminSeller.id,
                    p_new_password: pass,
                });
                if (pwErr) throw pwErr;
            }
        } else {
            // Crear: primero crear auth user con cliente temporal
            const tempClient = createClient({
                baseUrl: import.meta.env.VITE_INSFORGE_URL || 'https://e8cpb3g3.us-east.insforge.app',
                anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY || 'ik_1016f97bf745645904003df562a619b1',
            });
            const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({ email, password: pass, name: nombre });
            if (signUpErr) throw new Error(signUpErr.message || 'Error al crear usuario');
            if (!signUpData?.user?.id) throw new Error('No se recibió ID del usuario');

            const adminId = currentProfile.parent_admin_id;
            const { error: rpcErr } = await db.rpc('create_seller_for_subadmin', {
                p_user_id:        signUpData.user.id,
                p_full_name:      nombre,
                p_email:          email,
                p_seller_percentage: pct,
                p_parent_admin_id:   adminId,
                p_sub_admin_id:      currentProfile.id,
                p_currency_code:     currentProfile.currency_code || 'USD',
                p_currency_symbol:   currentProfile.currency_symbol || '$',
            });
            if (rpcErr) throw new Error(rpcErr.message || JSON.stringify(rpcErr));
        }
        closeSubAdminVendedorModal();
        showNotification(editingSubAdminSeller ? 'Vendedor actualizado' : 'Vendedor creado correctamente', 'success');
        await loadSubAdminSellers();
    } catch (e) {
        errEl.textContent = e.message || 'Error al guardar';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = editingSubAdminSeller ? 'Guardar Cambios' : 'Crear Vendedor';
    }
}

async function eliminarVendedorSubAdmin(sellerId, nombre) {
    showConfirm(`¿Eliminar a ${nombre}? Se borrarán todos sus tickets y datos.`, 'Eliminar Vendedor', async () => {
        showLoading();
        try {
            const { error } = await db.rpc('delete_seller_subadmin', {
                p_seller_id:    sellerId,
                p_sub_admin_id: currentProfile.id,
            });
            if (error) throw error;
            showNotification('Vendedor eliminado', 'success');
            await loadSubAdminSellers();
        } catch (e) {
            showNotification('Error al eliminar: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    });
}

// ---- Ventas mis vendedores ----
function populateSADrawTimes(selectId, lotId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Todos los horarios</option>';
    if (!lotId) return;
    const lot = lotteries.find(l => l.id === lotId);
    (lot?.draw_times || []).forEach(dt => {
        const o = document.createElement('option');
        o.value = dt.id; o.textContent = dt.time_label;
        sel.appendChild(o);
    });
}

function onVentasSALotChange() {
    const lotId = document.getElementById('ventasSALoteria')?.value || null;
    populateSADrawTimes('ventasSAHorario', lotId);
    loadVentasSubAdmin();
}

function onNumerosSALotChange() {
    const lotId = document.getElementById('numerosSALoteria')?.value || null;
    populateSADrawTimes('numerosSAHorario', lotId);
    loadNumerosSubAdmin();
}

async function showVentasSubAdminPage() {
    closeMenu();
    hideAllPages();
    document.getElementById('ventasSubAdminPage').style.display = 'block';
    const today = getTodayStr();
    const desdeEl = document.getElementById('ventasSADesde');
    const hastaEl = document.getElementById('ventasSAHasta');
    if (desdeEl && !desdeEl.value) desdeEl.value = today;
    if (hastaEl && !hastaEl.value) hastaEl.value = today;
    // Poblar loterías
    const lotSel = document.getElementById('ventasSALoteria');
    if (lotSel) {
        lotSel.innerHTML = '<option value="">Todas las loterías</option>';
        lotteries.forEach(l => {
            const o = document.createElement('option');
            o.value = l.id; o.textContent = l.display_name;
            lotSel.appendChild(o);
        });
    }
    // Poblar vendedores
    const vSel = document.getElementById('ventasSAVendedor');
    if (vSel) {
        vSel.innerHTML = '<option value="">Todos mis vendedores</option>';
        subAdminSellers.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = s.full_name;
            vSel.appendChild(o);
        });
    }
    await loadVentasSubAdmin();
}

async function loadVentasSubAdmin() {
    const lista  = document.getElementById('ventasSALista');
    const resEl  = document.getElementById('ventasSAResumen');
    const desde  = document.getElementById('ventasSADesde')?.value || null;
    const hasta  = document.getElementById('ventasSAHasta')?.value || null;
    const lotId  = document.getElementById('ventasSALoteria')?.value || null;
    const drawId = document.getElementById('ventasSAHorario')?.value || null;
    const vendId = document.getElementById('ventasSAVendedor')?.value || null;

    lista.innerHTML = '<p style="text-align:center;color:#888;padding:16px 0;">Cargando...</p>';
    resEl.style.display = 'none';

    try {
        const { data, error } = await db.rpc('get_subadmin_sales', {
            p_sub_admin_id:  currentProfile.id,
            p_date_from:     desde || null,
            p_date_to:       hasta || null,
            p_lottery_id:    lotId || null,
            p_draw_time_id:  drawId || null,
            p_seller_id:     vendId || null,
        });
        if (error) throw error;

        const rows = (data || []).filter(r => !r.is_cancelled);
        if (rows.length === 0) {
            lista.innerHTML = '<p style="text-align:center;color:#888;padding:16px 0;">No hay ventas para esta selección.</p>';
            return;
        }

        const sym = currentProfile?.currency_symbol || '$';
        const totalMonto = rows.reduce((a, r) => a + parseFloat(r.total || 0), 0);
        document.getElementById('ventasSATotalTickets').textContent = rows.length;
        document.getElementById('ventasSATotalMonto').textContent = `${sym}${totalMonto.toFixed(2)}`;
        resEl.style.display = 'block';

        const comisionRow = document.getElementById('ventasSAComisionRow');
        if (comisionRow) {
            if (vendId) {
                const seller = subAdminSellers.find(s => s.id === vendId);
                if (seller != null) {
                    const pct = parseFloat(seller.seller_percentage) || 0;
                    const ganancia = totalMonto * (pct / 100);
                    document.getElementById('ventasSAComisionPct').textContent = `${pct}%`;
                    document.getElementById('ventasSAGanancia').textContent = `${sym}${ganancia.toFixed(2)}`;
                    comisionRow.style.display = 'grid';
                } else {
                    comisionRow.style.display = 'none';
                }
            } else {
                comisionRow.style.display = 'none';
            }
        }

        lista.innerHTML = rows.map(r => `
            <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <p style="margin:0;font-size:0.85em;font-weight:600;color:#1e293b;">${r.ticket_number || String(r.ticket_id).slice(0,8)}</p>
                        <p style="margin:2px 0 0;font-size:0.75em;color:#64748b;">${r.seller_name} · ${r.lottery_name}${r.draw_label ? ' · ' + r.draw_label : ''}</p>
                    </div>
                    <p style="margin:0;font-weight:700;color:#16a34a;font-size:0.9em;">${sym}${parseFloat(r.total||0).toFixed(2)}</p>
                </div>
            </div>
        `).join('');
    } catch (e) {
        lista.innerHTML = `<p style="text-align:center;color:#dc2626;padding:16px 0;">Error: ${e.message}</p>`;
    }
}

// ---- Cobros mis vendedores ----
let selectedCobroSeller = null;
let editingCobro = null;

async function showCobrosSubAdminPage() {
    closeMenu();
    hideAllPages();
    selectedCobroSeller = null;
    document.getElementById('cobrosSubAdminPage').style.display = 'block';
    document.getElementById('cobrosSubAdminTitle').textContent = 'Cobros mis vendedores';
    document.getElementById('cobrosSubAdminLista').style.display = 'flex';
    document.getElementById('cobrosSubAdminDetalle').style.display = 'none';
    await loadCobrosSubAdmin();
}

async function loadCobrosSubAdmin() {
    const lista = document.getElementById('cobrosSubAdminLista');
    lista.innerHTML = '<p style="text-align:center;color:#888;padding:20px 0;">Cargando...</p>';
    try {
        const { data, error } = await db.rpc('get_subadmin_balances', { p_sub_admin_id: currentProfile.id });
        if (error) throw error;
        const rows = data || [];
        if (rows.length === 0) {
            lista.innerHTML = '<p style="text-align:center;color:#888;padding:20px 0;">Sin vendedores asignados.</p>';
            return;
        }
        const sym = currentProfile?.currency_symbol || '$';
        lista.innerHTML = rows.map(r => {
            const pct = parseFloat(r.seller_percentage || 0);
            const total = parseFloat(r.total_sales || 0);
            const paid  = parseFloat(r.total_paid  || 0);
            const commission = total * (pct / 100);
            const owes  = total - commission - paid;
            const color = owes > 0.005 ? '#dc2626' : '#16a34a';
            return `
                <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <p style="margin:0;font-weight:700;color:#1e293b;font-size:0.9em;">${r.seller_name}</p>
                        <span style="font-size:0.75em;background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:999px;">${pct}%</span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.78em;color:#475569;margin-bottom:10px;">
                        <div>Total ventas:<br><strong style="color:#1e293b;">${sym}${total.toFixed(2)}</strong></div>
                        <div>Su comisión:<br><strong style="color:#7c3aed;">${sym}${commission.toFixed(2)}</strong></div>
                        <div>Total pagado:<br><strong style="color:#16a34a;">${sym}${paid.toFixed(2)}</strong></div>
                        <div>Saldo pendiente:<br><strong style="color:${color};">${sym}${owes.toFixed(2)}</strong></div>
                    </div>
                    <button onclick="verDetalleCobroSubAdmin(${JSON.stringify(r).split('"').join('&quot;')})" style="width:100%;background:#4f46e5;border:none;border-radius:8px;color:white;padding:8px;font-size:0.82em;font-weight:600;cursor:pointer;">Ver detalle / Cobrar</button>
                </div>
            `;
        }).join('');
    } catch (e) {
        lista.innerHTML = `<p style="text-align:center;color:#dc2626;padding:20px 0;">Error: ${e.message}</p>`;
    }
}

async function verDetalleCobroSubAdmin(seller) {
    selectedCobroSeller = seller;
    document.getElementById('cobrosSubAdminTitle').textContent = seller.seller_name;
    document.getElementById('cobrosSubAdminLista').style.display = 'none';
    document.getElementById('cobrosSubAdminDetalle').style.display = 'block';
    renderCobroBalanceCard();
    await loadPagosSubAdmin();
}

function renderCobroBalanceCard() {
    const r = selectedCobroSeller;
    const pct = parseFloat(r.seller_percentage || 0);
    const total = parseFloat(r.total_sales || 0);
    const paid  = parseFloat(r.total_paid  || 0);
    const commission = total * (pct / 100);
    const owes  = total - commission - paid;
    const sym   = currentProfile?.currency_symbol || '$';
    const color = owes > 0.005 ? '#dc2626' : '#16a34a';
    document.getElementById('cobrosSubAdminBalanceCard').innerHTML = `
        <div style="background:linear-gradient(135deg,#6c63ff,#4f46e5);border-radius:14px;padding:14px;color:white;margin-bottom:4px;">
            <p style="margin:0 0 8px;font-size:0.7em;opacity:0.8;text-transform:uppercase;letter-spacing:1px;">${r.seller_name} — ${pct}% comisión</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px;text-align:center;">
                    <p style="margin:0;font-size:0.65em;opacity:0.8;">Total ventas</p>
                    <p style="margin:4px 0 0;font-size:1.1em;font-weight:bold;">${sym}${total.toFixed(2)}</p>
                </div>
                <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px;text-align:center;">
                    <p style="margin:0;font-size:0.65em;opacity:0.8;">Su comisión</p>
                    <p style="margin:4px 0 0;font-size:1.1em;font-weight:bold;">${sym}${commission.toFixed(2)}</p>
                </div>
                <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px;text-align:center;">
                    <p style="margin:0;font-size:0.65em;opacity:0.8;">Total pagado</p>
                    <p style="margin:4px 0 0;font-size:1.1em;font-weight:bold;">${sym}${paid.toFixed(2)}</p>
                </div>
                <div style="background:rgba(255,255,255,0.25);border-radius:10px;padding:10px;text-align:center;border:2px solid rgba(255,255,255,0.4);">
                    <p style="margin:0;font-size:0.65em;opacity:0.8;">Saldo pendiente</p>
                    <p style="margin:4px 0 0;font-size:1.1em;font-weight:bold;">${sym}${owes.toFixed(2)}</p>
                </div>
            </div>
        </div>
    `;
}

async function loadPagosSubAdmin() {
    const cont = document.getElementById('cobrosSubAdminPagos');
    cont.innerHTML = '<p style="text-align:center;color:#888;padding:12px 0;font-size:0.85em;">Cargando...</p>';
    try {
        const { data, error } = await db.rpc('get_subadmin_seller_payments', {
            p_seller_id:    selectedCobroSeller.seller_id,
            p_sub_admin_id: currentProfile.id,
        });
        if (error) throw error;
        const pagos = data || [];
        const sym = currentProfile?.currency_symbol || '$';
        if (pagos.length === 0) {
            cont.innerHTML = '<p style="text-align:center;color:#888;padding:12px 0;font-size:0.85em;">Sin cobros registrados.</p>';
            return;
        }
        cont.innerHTML = pagos.map(p => {
            const fecha = new Date(p.created_at).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
            return `
                <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <p style="margin:0;font-weight:700;color:#16a34a;font-size:0.9em;">${sym}${parseFloat(p.amount).toFixed(2)}</p>
                        <p style="margin:2px 0 0;font-size:0.72em;color:#64748b;">${fecha}${p.notes ? ' · ' + p.notes : ''}</p>
                    </div>
                    <button onclick="eliminarPagoSubAdmin('${p.id}')" style="background:#fee2e2;border:none;border-radius:8px;padding:6px 10px;color:#dc2626;font-size:0.75em;cursor:pointer;font-weight:600;">Eliminar</button>
                </div>
            `;
        }).join('');
    } catch (e) {
        cont.innerHTML = `<p style="text-align:center;color:#dc2626;padding:12px 0;font-size:0.85em;">Error: ${e.message}</p>`;
    }
}

function cobrosSubAdminBack() {
    if (selectedCobroSeller) {
        selectedCobroSeller = null;
        document.getElementById('cobrosSubAdminTitle').textContent = 'Cobros mis vendedores';
        document.getElementById('cobrosSubAdminLista').style.display = 'flex';
        document.getElementById('cobrosSubAdminDetalle').style.display = 'none';
        loadCobrosSubAdmin();
    } else {
        showMainPage();
    }
}

function openCobrarSubAdmin() {
    editingCobro = null;
    document.getElementById('cobrarSubAdminModalTitle').textContent = 'Registrar cobro';
    document.getElementById('cobrarSubAdminMonto').value = '';
    document.getElementById('cobrarSubAdminNota').value = '';
    document.getElementById('cobrarSubAdminError').style.display = 'none';
    document.getElementById('cobrarSubAdminModal').style.display = 'flex';
}

function closeCobrarSubAdminModal() {
    document.getElementById('cobrarSubAdminModal').style.display = 'none';
}

async function guardarCobrarSubAdmin() {
    const montoStr = document.getElementById('cobrarSubAdminMonto').value;
    const nota     = document.getElementById('cobrarSubAdminNota').value.trim();
    const errEl    = document.getElementById('cobrarSubAdminError');
    const btn      = document.getElementById('cobrarSubAdminBtn');
    const monto    = parseFloat(montoStr);

    if (!montoStr || isNaN(monto) || monto <= 0) {
        errEl.textContent = 'El monto debe ser mayor a 0';
        errEl.style.display = 'block';
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    errEl.style.display = 'none';
    try {
        const { error } = await db.from('payments').insert({
            seller_id:     selectedCobroSeller.seller_id,
            admin_id:      currentProfile.id,
            amount:        monto,
            notes:         nota || null,
            registered_by: currentProfile.id,
        });
        if (error) throw error;
        closeCobrarSubAdminModal();
        showNotification('Cobro registrado', 'success');
        // Recargar balance actualizado
        const { data } = await db.rpc('get_subadmin_balances', { p_sub_admin_id: currentProfile.id });
        const updated = (data || []).find(r => r.seller_id === selectedCobroSeller.seller_id);
        if (updated) { selectedCobroSeller = updated; renderCobroBalanceCard(); }
        await loadPagosSubAdmin();
    } catch (e) {
        errEl.textContent = e.message || 'Error al guardar';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
    }
}

async function eliminarPagoSubAdmin(paymentId) {
    showConfirm('¿Eliminar este cobro?', 'Eliminar cobro', async () => {
        showLoading();
        try {
            const { error } = await db.from('payments').delete().eq('id', paymentId);
            if (error) throw error;
            showNotification('Cobro eliminado', 'success');
            const { data } = await db.rpc('get_subadmin_balances', { p_sub_admin_id: currentProfile.id });
            const updated = (data || []).find(r => r.seller_id === selectedCobroSeller.seller_id);
            if (updated) { selectedCobroSeller = updated; renderCobroBalanceCard(); }
            await loadPagosSubAdmin();
        } catch (e) {
            showNotification('Error: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    });
}

// ---- Números mis vendedores ----
async function showNumerosSubAdminPage() {
    closeMenu();
    hideAllPages();
    document.getElementById('numerosSubAdminPage').style.display = 'block';
    const fechaEl = document.getElementById('numerosSAFecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = getTodayStr();
    const lotSel = document.getElementById('numerosSALoteria');
    if (lotSel) {
        lotSel.innerHTML = '<option value="">Todas las loterías</option>';
        lotteries.forEach(l => {
            const o = document.createElement('option');
            o.value = l.id; o.textContent = l.display_name;
            lotSel.appendChild(o);
        });
    }
    const vSel = document.getElementById('numerosSAVendedor');
    if (vSel) {
        vSel.innerHTML = '<option value="">Todos mis vendedores</option>';
        subAdminSellers.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = s.full_name;
            vSel.appendChild(o);
        });
    }
    await loadNumerosSubAdmin();
}

let _numerosSANums = [];
let _numerosSAContext = { lotId: null, drawId: null, totalAmt: 0, adminAmt: 0, sym: '$', hasVendor: false };

async function loadNumerosSubAdmin() {
    const contenido = document.getElementById('numerosSAContenido');
    const fecha  = document.getElementById('numerosSAFecha')?.value || null;
    const lotId  = document.getElementById('numerosSALoteria')?.value || null;
    const drawId = document.getElementById('numerosSAHorario')?.value || null;
    const vendId = document.getElementById('numerosSAVendedor')?.value || null;

    contenido.innerHTML = '<p style="text-align:center;color:#888;padding:16px 0;">Cargando...</p>';

    // Ocultar resumen y ganadores mientras carga
    const resumenEl = document.getElementById('numerosSAResumenCombinado');
    const ganadoresEl = document.getElementById('numerosSAGanadoresSection');
    if (resumenEl) resumenEl.style.display = 'none';
    if (ganadoresEl) ganadoresEl.style.display = 'none';

    try {
        const { data, error } = await db.rpc('get_subadmin_numbers', {
            p_sub_admin_id: currentProfile.id,
            p_date:         fecha || null,
            p_lottery_id:   lotId || null,
            p_draw_time_id: drawId || null,
            p_seller_id:    vendId || null,
        });
        if (error) throw error;
        const nums = data || [];
        _numerosSANums = nums;

        if (nums.length === 0) {
            contenido.innerHTML = '<p style="text-align:center;color:#888;padding:16px 0;">No hay números vendidos para esta selección.</p>';
            return;
        }

        const chances  = nums.filter(n => n.number?.length === 2).sort((a,b) => b.pieces - a.pieces);
        const billetes = nums.filter(n => n.number?.length === 4).sort((a,b) => b.pieces - a.pieces);
        const sym = currentProfile?.currency_symbol || '$';

        // ---- Resumen Total Combinado ----
        const lotObj   = lotId ? lotteries.find(l => l.id === lotId) : null;
        const price2d  = lotObj?.price_2_digits ?? 0;
        const price4d  = lotObj?.price_4_digits ?? 0;
        const chancePieces  = chances.reduce((a, n) => a + parseInt(n.pieces), 0);
        const billetePieces = billetes.reduce((a, n) => a + parseInt(n.pieces), 0);
        const chanceAmt  = chancePieces  * price2d;
        const billeteAmt = billetePieces * price4d;
        const totalAmt   = chanceAmt + billeteAmt;

        // Store context for prize payout calculations in verificarGanadoresSA
        {
            const s = vendId ? subAdminSellers.find(sv => sv.id === vendId) : null;
            const pct = s ? (parseFloat(s.seller_percentage) || 0) : 0;
            _numerosSAContext = {
                lotId, drawId, totalAmt, sym,
                adminAmt: s ? totalAmt * ((100 - pct) / 100) : 0,
                hasVendor: !!s,
            };
        }

        if (resumenEl) {
            document.getElementById('numerosSAChanceAmt').textContent  = `${sym}${chanceAmt.toFixed(2)}`;
            document.getElementById('numerosSABilleteAmt').textContent = `${sym}${billeteAmt.toFixed(2)}`;
            document.getElementById('numerosSATotalAmt').textContent   = `${sym}${totalAmt.toFixed(2)}`;

            const comisionRow = document.getElementById('numerosSAComisionRow');
            if (comisionRow) {
                if (vendId) {
                    const seller = subAdminSellers.find(s => s.id === vendId);
                    if (seller != null) {
                        const pct        = parseFloat(seller.seller_percentage) || 0;
                        const vendedorAmt = totalAmt * (pct / 100);
                        const adminAmt    = totalAmt - vendedorAmt;
                        document.getElementById('numerosSAVendedorLabel').textContent = `Vendedor (${pct}%)`;
                        document.getElementById('numerosSAVendedorAmt').textContent   = `${sym}${vendedorAmt.toFixed(2)}`;
                        document.getElementById('numerosSAAdminLabel').textContent    = `Admin (${100 - pct}%)`;
                        document.getElementById('numerosSAAdminAmt').textContent      = `${sym}${adminAmt.toFixed(2)}`;
                        comisionRow.style.display = 'grid';
                    } else {
                        comisionRow.style.display = 'none';
                    }
                } else {
                    comisionRow.style.display = 'none';
                }
            }

            resumenEl.style.display = 'block';
        }

        // ---- Sección ganadores ----
        if (ganadoresEl) {
            ganadoresEl.style.display = 'block';
            if (lotId && fecha) {
                await cargarGanadoresSA(lotId, drawId, fecha);
            } else {
                ['numerosSAPremio1','numerosSAPremio2','numerosSAPremio3'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                const inputsRow = document.getElementById('numerosSAInputsRow');
                if (inputsRow) inputsRow.style.display = 'grid';
                const displayEl = document.getElementById('numerosSAWinnersDisplay');
                if (displayEl) displayEl.innerHTML = '<p style="text-align:center;font-size:0.8em;color:#94a3b8;padding:4px 0;">Selecciona una lotería para cargar resultados automáticamente.</p>';
                const resultEl = document.getElementById('numerosSAGanadoresResult');
                if (resultEl) resultEl.innerHTML = '';
            }
        }

        // ---- Grid de números ----
        let html = '';
        if (chances.length > 0) {
            html += `<div style="margin-bottom:6px;padding:6px 10px;background:#e8f0fe;border-left:4px solid #4a6cf7;border-radius:4px;">
                <strong style="color:#4a6cf7;font-size:13px;">CHANCES — ${chancePieces} piezas</strong></div>`;
            html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:16px;">';
            chances.forEach(n => {
                html += `<div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:8px 4px;text-align:center;">
                    <div style="font-weight:700;font-size:14px;color:#1e293b;">${n.number}</div>
                    <div style="font-size:11px;color:#6366f1;">${n.pieces}</div></div>`;
            });
            html += '</div>';
        }
        if (billetes.length > 0) {
            html += `<div style="margin-bottom:6px;padding:6px 10px;background:#f3e8ff;border-left:4px solid #9333ea;border-radius:4px;">
                <strong style="color:#9333ea;font-size:13px;">BILLETES — ${billetePieces} piezas</strong></div>`;
            html += '<div style="display:flex;flex-direction:column;gap:4px;">';
            billetes.forEach(n => {
                html += `<div style="display:flex;justify-content:space-between;align-items:center;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;">
                    <span style="font-weight:700;color:#1e293b;font-size:14px;">${n.number}</span>
                    <span style="font-size:12px;color:#7c3aed;">${n.pieces} piezas</span></div>`;
            });
            html += '</div>';
        }
        contenido.innerHTML = html;
    } catch (e) {
        contenido.innerHTML = `<p style="text-align:center;color:#dc2626;padding:16px 0;">Error: ${e.message}</p>`;
    }
}

async function cargarGanadoresSA(lotId, drawId, fecha) {
    const displayEl = document.getElementById('numerosSAWinnersDisplay');
    const resultEl  = document.getElementById('numerosSAGanadoresResult');
    ['numerosSAPremio1','numerosSAPremio2','numerosSAPremio3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    if (displayEl) displayEl.innerHTML = '<p style="text-align:center;font-size:0.8em;color:#94a3b8;padding:4px 0;">Buscando resultados...</p>';
    if (resultEl) resultEl.innerHTML = '';

    try {
        let q = db.from('winning_numbers').select('*')
            .eq('lottery_id', lotId)
            .eq('draw_date', fecha);
        if (drawId) q = q.eq('draw_time_id', drawId);
        else q = q.is('draw_time_id', null);
        const { data } = await q.limit(1);

        if (!data || data.length === 0) {
            if (displayEl) displayEl.innerHTML = '<p style="text-align:center;font-size:0.8em;color:#94a3b8;padding:4px 0;">Sin resultados registrados. Puedes ingresarlos manualmente.</p>';
            const inputsRow = document.getElementById('numerosSAInputsRow');
            if (inputsRow) inputsRow.style.display = 'grid';
            return;
        }

        const row = data[0];
        const p1 = row.first_prize || '', p2 = row.second_prize || '', p3 = row.third_prize || '';
        const c1 = p1.slice(-2), c2 = p2.slice(-2), c3 = p3.slice(-2);

        // Ocultar inputs manuales — los premios ya se muestran en el display
        const inputsRow = document.getElementById('numerosSAInputsRow');
        if (inputsRow) inputsRow.style.display = 'none';

        if (displayEl) {
            const cols = ['#6366f1', '#22c55e', '#f59e0b'];
            displayEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;">
                ${[['1er', c1, p1, cols[0]], ['2do', c2, p2, cols[1]], ['3er', c3, p3, cols[2]]].map(([lbl, chance, full, col]) =>
                    `<div style="text-align:center;">
                        <div style="font-size:10px;color:#888;margin-bottom:3px;">${lbl} Premio</div>
                        <div style="font-size:20px;font-weight:bold;color:${col};background:#f8f8f8;border:2px solid ${col};border-radius:8px;padding:4px 0;">${chance || '—'}</div>
                        ${full && full !== chance ? `<div style="font-size:11px;color:#666;margin-top:2px;">${full}</div>` : ''}
                    </div>`
                ).join('')}
            </div>`;
        }

        const e1 = document.getElementById('numerosSAPremio1');
        const e2 = document.getElementById('numerosSAPremio2');
        const e3 = document.getElementById('numerosSAPremio3');
        if (e1) e1.value = c1;
        if (e2) e2.value = c2;
        if (e3) e3.value = c3;
        verificarGanadoresSA();
    } catch (e) {
        if (displayEl) displayEl.innerHTML = `<p style="text-align:center;font-size:0.8em;color:#dc2626;padding:4px 0;">Error: ${e.message}</p>`;
    }
}

function verificarGanadoresSA() {
    const p1 = (document.getElementById('numerosSAPremio1')?.value || '').replace(/\D/g,'').slice(0,2);
    const p2 = (document.getElementById('numerosSAPremio2')?.value || '').replace(/\D/g,'').slice(0,2);
    const p3 = (document.getElementById('numerosSAPremio3')?.value || '').replace(/\D/g,'').slice(0,2);
    const resultEl = document.getElementById('numerosSAGanadoresResult');
    if (!resultEl) return;

    const prizes = [p1, p2, p3].filter(p => p.length > 0);
    if (prizes.length === 0) { resultEl.innerHTML = ''; return; }

    const ganadores = _numerosSANums.filter(n => n.number?.length === 2 && prizes.includes(n.number));

    const { lotId, drawId, totalAmt, adminAmt, sym, hasVendor } = _numerosSAContext;
    const lotteryObj  = lotId ? lotteries.find(l => l.id === lotId) : null;
    const drawTimeObj = (drawId && lotId) ? (drawTimesMap[lotId] || []).find(dt => dt.id === drawId) || null : null;
    const mults = {
        [p1]: p1 ? getPrizeMultiplier(1, lotteryObj, drawTimeObj, false) : 0,
        [p2]: p2 ? getPrizeMultiplier(2, lotteryObj, drawTimeObj, false) : 0,
        [p3]: p3 ? getPrizeMultiplier(3, lotteryObj, drawTimeObj, false) : 0,
    };
    const labels = { [p1]: '1er Premio', [p2]: '2do Premio', [p3]: '3er Premio' };
    const colors  = { [p1]: '#6366f1',   [p2]: '#22c55e',   [p3]: '#f59e0b' };

    if (ganadores.length === 0) {
        let html = '<p style="text-align:center;color:#16a34a;font-size:13px;padding:6px 0;">✓ Sin coincidencias</p>';
        if (lotteryObj) {
            html += `<div style="margin-top:6px;padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;">
                ${hasVendor ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Total cobrado (admin):</span><strong>${sym}${adminAmt.toFixed(2)}</strong></div>` : ''}
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Total a pagar:</span><strong style="color:#16a34a;">${sym}0.00</strong></div>
                ${hasVendor ? `<div style="display:flex;justify-content:space-between;border-top:1px solid #bbf7d0;padding-top:6px;"><span>Resultado:</span><strong style="color:#16a34a;">GANANCIA ${sym}${adminAmt.toFixed(2)}</strong></div>` : ''}
            </div>`;
        }
        resultEl.innerHTML = html;
        return;
    }

    let totalPago = 0;
    const ganadoresConPago = ganadores.map(n => {
        const mult = mults[n.number] || 0;
        const pago = n.pieces * mult;
        totalPago += pago;
        return { ...n, mult, pago };
    });

    const resultado = adminAmt - totalPago;
    const resultColor = resultado >= 0 ? '#16a34a' : '#dc2626';

    const rows = ganadoresConPago.map(n => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:800;color:${colors[n.number] || '#dc2626'};font-size:1.2em;">${n.number}</span>
                <span style="font-size:0.72em;color:#ef4444;font-weight:600;">${labels[n.number] || ''}</span>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.75em;color:#7f1d1d;">${n.pieces} pz × ${n.mult}x</div>
                <div style="font-weight:700;color:#dc2626;">${sym}${n.pago.toFixed(2)}</div>
            </div>
        </div>`).join('');

    let summaryHtml = `<div style="margin-top:10px;padding:10px;background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;">`;
    if (hasVendor) {
        summaryHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Total cobrado (admin):</span><strong>${sym}${adminAmt.toFixed(2)}</strong></div>`;
    }
    summaryHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:${hasVendor ? '4' : '0'}px;"><span>Total a pagar:</span><strong style="color:#dc2626;">${sym}${totalPago.toFixed(2)}</strong></div>`;
    if (hasVendor) {
        summaryHtml += `<div style="display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;padding-top:6px;"><span>Resultado:</span><strong style="color:${resultColor};">${resultado >= 0 ? 'GANANCIA' : 'PÉRDIDA'} ${sym}${Math.abs(resultado).toFixed(2)}</strong></div>`;
    }
    summaryHtml += `</div>`;

    resultEl.innerHTML = `
        <p style="margin:0 0 8px;font-size:0.8em;font-weight:700;color:#dc2626;">⚠ Coincidencias:</p>
        <div style="display:flex;flex-direction:column;gap:4px;">${rows}</div>
        ${summaryHtml}`;
}

// ==================== Page navigation ====================
function hideAllPages() {
    ['loginPage','mainPage','salesPage','numberSalesPage','verifyWinnersPage','configPage','cobrosPage',
     'misVendedoresPage','ventasSubAdminPage','cobrosSubAdminPage','numerosSubAdminPage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function showLoginPage() {
    hideAllPages();
    // Ocultar items sub-admin al volver al login (por si hubo una sesión anterior)
    document.querySelectorAll('.sub-admin-only').forEach(el => el.style.display = 'none');
    document.getElementById('loginPage').style.display = 'flex';

    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            document.getElementById('loginError').innerText = '';
        });
    }
}

function showMainPage() {
    hideAllPages();
    document.getElementById('ticketPreview').style.display = 'none';
    document.getElementById('mainPage').style.display = 'block';

    document.getElementById('number').value = '';
    document.getElementById('pieces').value = '';
    document.getElementById('quickInput').value = '';
}

function showMainPageOnly() {
    hideAllPages();
    document.getElementById('mainPage').style.display = 'block';

    document.getElementById('number').value = '';
    document.getElementById('pieces').value = '';
    document.getElementById('quickInput').value = '';
}

function getTodayStr() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
}

function showSalesPage() {
    closeMenu();
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('salesPage').style.display = 'block';
    document.getElementById('numberSalesPage').style.display = 'none';
    const salesDateEl = document.getElementById('salesDate');
    if (salesDateEl && !salesDateEl.value) salesDateEl.value = getTodayStr();
    // Poblar filtro de loterías (todas, no filtrar por hora)
    const lotSel = document.getElementById('salesFilterLottery');
    if (lotSel) {
        lotSel.innerHTML = '<option value="">Todas las loterías</option>';
        lotteries.forEach(lot => {
            const o = document.createElement('option');
            o.value = lot.id; o.textContent = lot.display_name;
            lotSel.appendChild(o);
        });
        // Restaurar selección guardada
        const savedLot = localStorage.getItem('sales_filter_lottery');
        if (savedLot && [...lotSel.options].some(o => o.value === savedLot)) {
            lotSel.value = savedLot;
        }
    }
    const dtSel = document.getElementById('salesFilterDrawTime');
    dtSel.innerHTML = '<option value="">Todos los sorteos</option>';
    const restoredLot = lotSel?.value;
    if (restoredLot) {
        (drawTimesMap[restoredLot] || []).forEach(dt => {
            const o = document.createElement('option');
            o.value = dt.id; o.textContent = dt.time_label;
            dtSel.appendChild(o);
        });
        const savedDt = localStorage.getItem('sales_filter_draw_time');
        if (savedDt && [...dtSel.options].some(o => o.value === savedDt)) dtSel.value = savedDt;
    }
    showSalesByDate(document.getElementById('salesDate').value || getTodayStr());
}

function showNumberSalesPage() {
    closeMenu();
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('salesPage').style.display = 'none';
    document.getElementById('numberSalesPage').style.display = 'block';
    document.getElementById('verifyWinnersPage').style.display = 'none';
    const filterDateEl = document.getElementById('salesFilterDate');
    if (filterDateEl && !filterDateEl.value) filterDateEl.value = getTodayStr();
    // Restaurar filtros guardados
    const lotSel = document.getElementById('filterLotteryType');
    const savedLot = localStorage.getItem('num_filter_lottery');
    if (savedLot && lotSel && [...lotSel.options].some(o => o.value === savedLot)) {
        lotSel.value = savedLot;
        updateFilterDrawTimes(); // repoblar horarios sin guardar (lotería ya está guardada)
        const dtSel = document.getElementById('filterDrawTimeSelect');
        const savedDt = localStorage.getItem('num_filter_draw_time');
        if (savedDt && dtSel && [...dtSel.options].some(o => o.value === savedDt)) dtSel.value = savedDt;
    }
    displaySalesSummary(activeTab);
    applyFilters();
}

function showVerifyWinnersPage() {
    closeMenu();
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('salesPage').style.display = 'none';
    document.getElementById('numberSalesPage').style.display = 'none';
    document.getElementById('verifyWinnersPage').style.display = 'block';
    document.getElementById('winningTicketsResult').innerHTML = '';

    document.getElementById('filterLottery').onchange = updateWinnerDrawTimes;
    // Restaurar filtros guardados
    const lotSel = document.getElementById('filterLottery');
    const savedLot = localStorage.getItem('winners_filter_lottery');
    if (savedLot && [...lotSel.options].some(o => o.value === savedLot)) {
        lotSel.value = savedLot;
    }
    updateWinnerDrawTimes(); // repobla horarios con la lotería restaurada
    const dtSel = document.getElementById('filterDrawTime');
    const savedDt = localStorage.getItem('winners_filter_draw_time');
    if (savedDt && dtSel && [...dtSel.options].some(o => o.value === savedDt)) dtSel.value = savedDt;

    document.getElementById('firstPrize').value = '';
    document.getElementById('secondPrize').value = '';
    document.getElementById('thirdPrize').value = '';

    if (!document.getElementById('winnersFilterDate').value) {
        const today = new Date();
        document.getElementById('winnersFilterDate').value =
            `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
}

function showConfigPage() {
    closeMenu();
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('salesPage').style.display = 'none';
    document.getElementById('numberSalesPage').style.display = 'none';
    document.getElementById('verifyWinnersPage').style.display = 'none';
    document.getElementById('configPage').style.display = 'block';

    updateLimitDrawTimes();
    updateLimitBilleteDrawTimes();
    displayCurrentLimits('chances');
    displayCurrentLimits('billetes');
}

function showCobrosPage() {
    closeMenu();
    hideAllPages();
    document.getElementById('cobrosPage').style.display = 'block';
    loadCobros();
}

let cobrosAllPayments = [];

async function loadCobros() {
    const sym = currentProfile?.currency_symbol || '$';
    const histDiv = document.getElementById('cobrosHistorial');
    histDiv.innerHTML = '<p style="text-align:center;color:#888;padding:20px 0;">Cargando...</p>';

    // Limpiar filtros al recargar
    const fromEl = document.getElementById('cobrosFilterFrom');
    const toEl   = document.getElementById('cobrosFilterTo');
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value   = '';
    const clearBtn = document.getElementById('cobrosFilterClear');
    if (clearBtn) clearBtn.style.display = 'none';

    try {
        // Balance del vendedor
        const { data: balances } = await db.rpc('get_seller_balances', {
            p_admin_id: currentProfile.parent_admin_id,
        });
        const myBalance = (balances || []).find(b => b.seller_id === currentProfile.id);
        const totalSales = parseFloat(myBalance?.total_sales || 0);
        const pct = parseFloat(myBalance?.seller_percentage || currentProfile?.seller_percentage || 0);
        const commission = totalSales * (pct / 100);
        const owes = totalSales - commission;
        const paid = parseFloat(myBalance?.total_paid || 0);
        const balance = owes - paid;

        document.getElementById('cobrosTotal').textContent = `${sym}${totalSales.toFixed(2)}`;
        document.getElementById('cobrosComision').textContent = `${sym}${commission.toFixed(2)}`;
        document.getElementById('cobrosPagado').textContent = `${sym}${paid.toFixed(2)}`;
        const saldoEl = document.getElementById('cobrosSaldo');
        saldoEl.textContent = balance <= 0 ? '✓ Al día' : `${sym}${balance.toFixed(2)}`;
        saldoEl.style.color = balance <= 0 ? '#86efac' : '#fca5a5';

        // Historial de pagos
        const { data: payments } = await db.rpc('get_seller_payments', {
            p_seller_id: currentProfile.id,
        });

        cobrosAllPayments = payments || [];
        renderCobrosHistorial();
    } catch (e) {
        document.getElementById('cobrosHistorial').innerHTML = '<p style="text-align:center;color:red;padding:20px 0;">Error al cargar cobros</p>';
        console.error('loadCobros error:', e);
    }
}

function filterCobrosHistorial() {
    const clearBtn = document.getElementById('cobrosFilterClear');
    const from = document.getElementById('cobrosFilterFrom')?.value || '';
    const to   = document.getElementById('cobrosFilterTo')?.value   || '';
    if (clearBtn) clearBtn.style.display = (from || to) ? 'block' : 'none';
    renderCobrosHistorial();
}

function clearCobrosFilter() {
    const fromEl = document.getElementById('cobrosFilterFrom');
    const toEl   = document.getElementById('cobrosFilterTo');
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value   = '';
    const clearBtn = document.getElementById('cobrosFilterClear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderCobrosHistorial();
}

function renderCobrosHistorial() {
    const sym    = currentProfile?.currency_symbol || '$';
    const histDiv = document.getElementById('cobrosHistorial');
    const from   = document.getElementById('cobrosFilterFrom')?.value || '';
    const to     = document.getElementById('cobrosFilterTo')?.value   || '';

    const filtered = cobrosAllPayments.filter(p => {
        const d = p.created_at.slice(0, 10);
        if (from && d < from) return false;
        if (to   && d > to)   return false;
        return true;
    });

    if (filtered.length === 0) {
        histDiv.innerHTML = `<p style="text-align:center;color:#888;padding:20px 0;">${(from || to) ? 'Sin cobros en ese período' : 'Sin cobros registrados'}</p>`;
        return;
    }

    const totalFiltered = filtered.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const isFiltered = from || to;

    histDiv.innerHTML = filtered.map(p => `
        <div style="background:#f1f5f9;border-radius:12px;padding:12px 14px;border:1px solid #e2e8f0;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:1.1em;font-weight:bold;color:#16a34a;">${sym}${parseFloat(p.amount).toFixed(2)}</span>
                <span style="font-size:0.75em;color:#64748b;">${new Date(p.created_at).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'})} ${new Date(p.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>
            </div>
            ${p.notes ? `<p style="margin:4px 0 0;font-size:0.8em;color:#475569;">${p.notes}</p>` : ''}
        </div>
    `).join('') + `
        <div style="background:#e2e8f0;border-radius:12px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.85em;color:#475569;">${isFiltered ? 'Total en período' : 'Total abonado'}</span>
            <span style="font-weight:bold;color:#16a34a;">${sym}${totalFiltered.toFixed(2)}</span>
        </div>
    `;
}

// ==================== Draw time selects ====================
function updateDrawTimes() {
    const lotteryCode = document.getElementById('lotteryType').value;
    if (lotteryCode) {
        localStorage.setItem('sel_lottery', lotteryCode);
    } else {
        localStorage.removeItem('sel_lottery');
        localStorage.removeItem('sel_draw_time');
    }
    const timeSelect = document.getElementById('drawTimeSelect');
    populateDrawTimeSelect(timeSelect, lotteryCode);
}

function updateFilterDrawTimes() {
    const lotteryCode = document.getElementById('filterLotteryType').value;
    if (lotteryCode) localStorage.setItem('num_filter_lottery', lotteryCode);
    else { localStorage.removeItem('num_filter_lottery'); localStorage.removeItem('num_filter_draw_time'); }
    const timeSelect = document.getElementById('filterDrawTimeSelect');
    populateDrawTimeSelect(timeSelect, lotteryCode, 'Todas las Horas', false);
}

function onNumDrawTimeFilter() {
    const v = document.getElementById('filterDrawTimeSelect').value;
    if (v) localStorage.setItem('num_filter_draw_time', v);
    else localStorage.removeItem('num_filter_draw_time');
    applyFilters();
}

function updateWinnerDrawTimes() {
    const lotteryCode = document.getElementById('filterLottery').value;
    if (lotteryCode) localStorage.setItem('winners_filter_lottery', lotteryCode);
    else { localStorage.removeItem('winners_filter_lottery'); localStorage.removeItem('winners_filter_draw_time'); }
    const timeSelect = document.getElementById('filterDrawTime');
    populateDrawTimeSelect(timeSelect, lotteryCode, 'Todas las Horas', false);
}

function onWinnersDrawTimeFilter() {
    const v = document.getElementById('filterDrawTime').value;
    if (v) localStorage.setItem('winners_filter_draw_time', v);
    else localStorage.removeItem('winners_filter_draw_time');
}

function updateLimitDrawTimes() {
    const lotteryCode = document.getElementById('limitLotteryType').value;
    const timeSelect = document.getElementById('limitDrawTimeSelect');
    populateDrawTimeSelect(timeSelect, lotteryCode);
}

function updateLimitBilleteDrawTimes() {
    const lotteryCode = document.getElementById('limitBilleteLotteryType').value;
    const timeSelect = document.getElementById('limitBilleteDrawTimeSelect');
    populateDrawTimeSelect(timeSelect, lotteryCode);
}

// ==================== Ticket UI ====================
function validateNumber(number) {
    const numStr = number.toString();
    return numStr.length === 2 || numStr.length === 4;
}

// Helper: get selected lottery/drawtime objects from current form values
function getSelectedLotteryObj() {
    const id = document.getElementById('lotteryType').value;
    return lotteries.find(l => l.id === id) || null;
}
function getSelectedDrawTimeObj() {
    const drawTimeId = document.getElementById('drawTimeSelect').value;
    if (!drawTimeId) return null;
    const lot = getSelectedLotteryObj();
    if (!lot) return null;
    return (lot.draw_times || []).find(dt => dt.id === drawTimeId) || null;
}
function getSelectedDrawTimeLabel() {
    const dt = getSelectedDrawTimeObj();
    return dt ? dt.time_label : '';
}

function calculatePrice(number, pieces) {
    const numLength = number.toString().length;
    // Seller-level price override takes priority over lottery prices
    if (numLength === 4) {
        const price = currentProfile?.price_4_digits_override ?? getSelectedLotteryObj()?.price_4_digits ?? 1.00;
        return pieces * price;
    } else {
        const price = currentProfile?.price_2_digits_override ?? getSelectedLotteryObj()?.price_2_digits ?? 0.20;
        return pieces * price;
    }
}

function updateCurrentSales(number, pieces, isAddition) {
    const lotteryType = document.getElementById('lotteryType').value;
    const drawTimeObj = getSelectedDrawTimeObj();
    const drawTime = drawTimeObj ? drawTimeObj.time_label : 'default';
    const key = `${lotteryType}_${drawTime}`;
    const type = number.length === 2 ? 'chances' : 'billetes';

    if (!currentSales[type][key]) currentSales[type][key] = {};
    if (!currentSales[type][key][number]) currentSales[type][key][number] = 0;

    if (isAddition) {
        currentSales[type][key][number] += pieces;
    } else {
        currentSales[type][key][number] -= pieces;
        if (currentSales[type][key][number] < 0) currentSales[type][key][number] = 0;
    }
}

function updateNumbersList() {
    const tbody = document.getElementById('numbersTableBody');
    tbody.innerHTML = '';
    numbers.forEach((item, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${item.number}</td>
            <td><span id="pieces-${index}">${item.pieces}</span></td>
            <td><span id="subTotal-${index}">${currentProfile?.currency_symbol || getSelectedLotteryObj()?.currency_symbol || '$'}${item.subTotal.toFixed(2)}</span></td>
            <td class="ticket-actions">
                <button onclick="editPieces(${index})">Edit</button>
                <button onclick="removeNumber(${index})">X</button>
            </td>
        `;
    });
}

function editPieces(index) {
    const oldPieces = numbers[index].pieces;
    const number = numbers[index].number;
    const newPieces = prompt('Ingrese la nueva cantidad de tiempos:', oldPieces);

    if (newPieces !== null && !isNaN(newPieces)) {
        const pieces = parseInt(newPieces, 10);
        if (pieces > 0) {
            const difference = pieces - oldPieces;
            if (difference > 0 && !checkLimits(number, difference)) return;

            updateCurrentSales(number, oldPieces, false);
            updateCurrentSales(number, pieces, true);
            numbers[index].pieces = pieces;
            numbers[index].subTotal = calculatePrice(number, pieces);
            updateNumbersList();
            updateTotal();
        } else {
            showNotification('La cantidad de tiempos debe ser mayor que 0.');
        }
    } else {
        showNotification('Por favor, ingrese un número válido.');
    }
}

function removeNumber(index) {
    const currentLottery = document.getElementById('lotteryType').value;
    const validationResult = validarHorarioEliminacion(currentLottery, null);

    if (!validationResult.allowed) {
        showNotification(getEliminationBlockMessage(validationResult), 'warning', 6000);
        return;
    }

    const number = numbers[index].number;
    const pieces = numbers[index].pieces;
    numbers.splice(index, 1);
    updateNumbersList();
    updateTotal();
    updateCurrentSales(number, pieces, false);
}

function updateTotal() {
    const total = numbers.reduce((sum, item) => sum + item.subTotal, 0);
    const sym = currentProfile?.currency_symbol || getSelectedLotteryObj()?.currency_symbol || '$';
    document.getElementById('totalValue').textContent = `VALOR DE TICKET: ${sym}${total.toFixed(2)}`;
}

function resetForm() {
    document.getElementById('customerName').value = '';
    document.getElementById('number').value = '';
    document.getElementById('pieces').value = '';
    document.getElementById('quickInput').value = '';
    numbers = [];
    document.getElementById('numbersTableBody').innerHTML = '';
    document.getElementById('totalValue').innerText = 'VALOR DE TICKET: 0.00$';
}

function showTicketPreview(ticket) {
    currentPreviewTicket = ticket;
    const preview = document.getElementById('ticketPreview');
    const content = document.getElementById('ticketContent');

    // Format sale datetime like the printed ticket
    let formattedDateTime = ticket.saleDate || '';
    try {
        const d = new Date(ticket.datetime);
        if (!isNaN(d)) {
            const dd   = String(d.getDate()).padStart(2,'0');
            const mm   = String(d.getMonth()+1).padStart(2,'0');
            const yyyy = d.getFullYear();
            const hh   = String(d.getHours()).padStart(2,'0');
            const min  = String(d.getMinutes()).padStart(2,'0');
            formattedDateTime = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
        }
    } catch(e) {}

    const lotteryName = getDisplayName(ticket.lottery) || ticket.lottery || '';
    const currency = ticket.currencySymbol || '$';
    const divider = `<div style="border-bottom:1px dashed #000;margin:5px 0;"></div>`;

    content.innerHTML = `
    <div style="font-family:'Courier New',Courier,monospace;background:white;padding:14px 16px;max-width:320px;margin:0 auto;">

      <!-- Header -->
      <div style="text-align:center;font-size:1.5em;font-weight:bold;letter-spacing:1px;">${lotteryName}</div>
      ${ticket.drawTime ? `<div style="text-align:center;font-size:0.9em;">Sorteo: ${ticket.drawTime}</div>` : ''}
      <div style="text-align:center;font-size:0.9em;">Venta: ${formattedDateTime}</div>
      ${divider}

      <!-- Column headers -->
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin:3px 0;">
        <span style="font-size:1.1em;font-weight:bold;">CIFRA&nbsp;&nbsp;CANT</span>
        <span style="font-size:0.82em;">SUBTOTAL</span>
      </div>
      <div style="border-bottom:1px solid #000;margin-bottom:4px;"></div>

      <!-- Number rows -->
      ${ticket.numbers.map(n => `
        <div style="margin:4px 0 0 0;">
          <div style="font-size:1.25em;font-weight:bold;">*${n.number}*&nbsp;&nbsp;*${n.pieces}*</div>
          <div style="text-align:right;font-size:0.95em;">${currency}${parseFloat(n.subTotal||0).toFixed(2)}</div>
          ${divider}
        </div>
      `).join('')}

      <!-- Total -->
      <div style="text-align:right;font-size:1.35em;font-weight:bold;margin:4px 0;">TOTAL: ${currency}${parseFloat(ticket.total||0).toFixed(2)}</div>

      <!-- Footer -->
      <div style="font-size:0.85em;margin-top:4px;">Vendedor: ${sellerName}</div>
      ${ticket.customerName ? `<div style="font-size:0.85em;">Cliente: ${ticket.customerName}</div>` : ''}
      ${ticket.ticketNumber ? `<div style="font-size:0.8em;font-weight:bold;">#${ticket.ticketNumber}</div>` : ''}
      <div style="font-size:0.75em;word-break:break-all;color:#555;">${ticket.id}</div>
      <div style="font-size:0.85em;">SIN TICKET NO HAY RECLAMO</div>
    </div>
    `;

    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = '';
    new QRCode(qrDiv, {
        text: ticket.id,
        width: 100,
        height: 100,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H,
    });

    const actionsDiv = preview.querySelector('.ticket-actions');
    if (ticket.paid) {
        actionsDiv.innerHTML = `
            <button style="background: linear-gradient(135deg, #e74c3c 0%, #dc3545 100%) !important; color: white !important; cursor: not-allowed !important; border: 2px solid #c82333 !important;" disabled>PAGADO</button>
            <button onclick="copyTicket('${ticket.id}')">COPIAR</button>
            <button onclick="closeTicket()">CERRAR</button>
            <button onclick="compartirTicket()">COMPARTIR</button>
            <button onclick="printCurrentTicket()" style="background: linear-gradient(135deg, #6f42c1 0%, #563d7c 100%); color:white;">IMPRIMIR</button>
        `;
    } else {
        actionsDiv.innerHTML = `
            <button onclick="marcarComoPagado('${ticket.id}')" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);">COBRAR</button>
            <button onclick="copyTicket('${ticket.id}')">COPIAR</button>
            <button onclick="closeTicket()">CERRAR</button>
            <button onclick="compartirTicket()">COMPARTIR</button>
            <button onclick="printCurrentTicket()" style="background: linear-gradient(135deg, #6f42c1 0%, #563d7c 100%); color:white;">IMPRIMIR</button>
        `;
    }

    preview.style.display = 'block';
}

function closeTicket() {
    document.getElementById('ticketPreview').style.display = 'none';
    numbers = [];
    updateNumbersList();
    updateTotal();
}

function copyTicket(ticketId) {
    const lotteryType = document.getElementById('lotteryType').value;
    const lottery = lotteries.find(l => l.code === lotteryType);
    const needsDrawTime = lottery && lottery.draw_times && lottery.draw_times.length > 0;
    const drawTimeSelected = document.getElementById('drawTimeSelect')?.value;

    if (!lotteryType) {
        showNotification('Selecciona una lotería antes de copiar el ticket.', 'error', 4000);
        return;
    }
    if (needsDrawTime && !drawTimeSelected) {
        showNotification('Selecciona la hora de sorteo antes de copiar el ticket.', 'error', 4000);
        return;
    }

    loadTickets().then(allTickets => {
        const ticket = allTickets.find(t => t.id === ticketId);
        if (ticket) {
            const ticketPreview = document.getElementById('ticketPreview');
            if (ticketPreview && ticketPreview.style.display === 'block') closeTicket();

            numbers = [];
            let blocked = 0;
            for (const num of ticket.numbers) {
                if (!checkLimits(num.number, num.pieces)) {
                    blocked++;
                    continue;
                }
                const lotteryType = document.getElementById('lotteryType').value;
                numbers.push({
                    number: num.number,
                    pieces: num.pieces,
                    subTotal: calculatePrice(num.number, num.pieces, lotteryType),
                });
                updateCurrentSales(num.number, num.pieces, true);
            }
            updateNumbersList();
            updateTotal();
            showMainPage();
            if (blocked > 0) {
                showNotification(`Ticket copiado. ${blocked} número(s) no se agregaron por límite excedido.`, 'warning', 5000);
            } else {
                showNotification('Los números del ticket han sido copiados. Cambia la lotería y hora de sorteo antes de generar el nuevo ticket.');
            }
        } else {
            showNotification('Ticket no encontrado.');
        }
    });
}

function viewTicket(ticketId) {
    loadTickets().then(allTickets => {
        const ticket = allTickets.find(t => t.id === ticketId);
        if (ticket) {
            showMainPageOnly();
            showTicketPreview(ticket);
        }
    });
}

// ==================== Sales page ====================
function onSalesDrawTimeFilter() {
    const v = document.getElementById('salesFilterDrawTime').value;
    if (v) localStorage.setItem('sales_filter_draw_time', v);
    else localStorage.removeItem('sales_filter_draw_time');
    showSalesByDate(document.getElementById('salesDate').value || getTodayStr());
}

function onSalesLotteryFilter() {
    const lotteryId = document.getElementById('salesFilterLottery').value;
    if (lotteryId) localStorage.setItem('sales_filter_lottery', lotteryId);
    else { localStorage.removeItem('sales_filter_lottery'); localStorage.removeItem('sales_filter_draw_time'); }
    const dtSel = document.getElementById('salesFilterDrawTime');
    dtSel.innerHTML = '<option value="">Todos los sorteos</option>';
    localStorage.removeItem('sales_filter_draw_time'); // reset draw time when lottery changes
    if (lotteryId) {
        (drawTimesMap[lotteryId] || []).forEach(dt => {
            const o = document.createElement('option');
            o.value = dt.id; o.textContent = dt.time_label;
            dtSel.appendChild(o);
        });
    }
    showSalesByDate(document.getElementById('salesDate').value || getTodayStr());
}

function showSalesByDate(dateString) {
    const filterLottery = document.getElementById('salesFilterLottery')?.value || '';
    const filterDrawTime = document.getElementById('salesFilterDrawTime')?.value || '';
    loadTickets().then(allTickets => {
        let dayTickets = allTickets.filter(ticket => ticket.saleDate === dateString);
        if (filterLottery) dayTickets = dayTickets.filter(t => t.lotteryId === filterLottery);
        if (filterDrawTime) dayTickets = dayTickets.filter(t => t.drawTimeId === filterDrawTime);
        const activeTickets = dayTickets.filter(ticket => !ticket.cancelled);
        const totalAmount = activeTickets.reduce((sum, ticket) => sum + ticket.total, 0);
        document.getElementById('currentSalesDate').textContent = dateString;
        document.getElementById('totalTickets').textContent = activeTickets.length;
        document.getElementById('totalSales').textContent = totalAmount.toFixed(2);
        displayTickets(dayTickets);
    });
}

function showTodaySales() {
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    document.getElementById('salesDate').value = dateString;
    showSalesByDate(dateString);
}

// Initializes totals UI without overriding the ticket list
function initSalesTotals() {
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    document.getElementById('salesDate').value = dateString;
    loadTickets().then(allTickets => {
        const selectedDate = new Date(dateString + 'T00:00:00');
        const endDate = new Date(dateString + 'T23:59:59');
        const dayTickets = allTickets.filter(ticket => {
            const ticketDate = new Date(ticket.datetime);
            return ticketDate >= selectedDate && ticketDate <= endDate;
        });
        const activeDay = dayTickets.filter(t => !t.cancelled);
        const totalAmount = activeDay.reduce((sum, t) => sum + t.total, 0);
        document.getElementById('currentSalesDate').textContent = selectedDate.toLocaleDateString('es-ES');
        document.getElementById('totalTickets').textContent = activeDay.length;
        document.getElementById('totalSales').textContent = totalAmount.toFixed(2);
    });
}

async function displayTickets(ticketsToShow = null) {
    const ticketsList = document.getElementById('ticketsList');
    try {
        const raw = ticketsToShow ?? await loadTickets();
        const tickets = (raw || []).filter(t => !t.cancelled);
        if (!tickets || tickets.length === 0) {
            ticketsList.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">No hay tickets registrados</p>';
            return;
        }
        ticketsList.innerHTML = tickets.map(ticket => {
            const total = typeof ticket.total === 'number' && !isNaN(ticket.total) ? ticket.total.toFixed(2) : '0.00';
            const fecha = ticket.datetime ? new Date(ticket.datetime).toLocaleString() : '';
            const dtObj = ticket.drawTimeId ? getDrawTimeById(ticket.drawTimeId) : null;
            const ticketDate = ticket.datetime ? new Date(ticket.datetime).toDateString() : null;
            const isFromPreviousDay = ticketDate && ticketDate !== new Date().toDateString();
            const drawPast = isFromPreviousDay || (dtObj ? (isDrawTimeBlocked(dtObj).blocked || isDrawTimePast(dtObj)) : false);
            return `
            <div class="ticket-item" style="${ticket.paid ? 'background:#fff3e0;border-left:4px solid #ffb74d;' : ''}">
                <p><strong>ID:</strong> ${ticket.id}</p>
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Lotería:</strong> ${ticket.lottery || ''}</p>
                ${ticket.drawTime ? `<p><strong>Sorteo:</strong> ${ticket.drawTime}</p>` : ''}
                ${ticket.customerName ? `<p><strong>Cliente:</strong> ${ticket.customerName}</p>` : ''}
                <p><strong>Total:</strong> ${total}</p>
                <p><strong>Estado:</strong> ${ticket.paid ? '<span style="display:inline-block;background:#f57c00;color:#fff;font-weight:700;font-size:13px;padding:2px 10px;border-radius:20px;letter-spacing:1px;">✓ COBRADO</span>' : 'Pendiente'}</p>
                <div class="ticket-actions">
                    <button onclick="viewTicket('${ticket.id}')">Ver</button>
                    ${!drawPast ? `<button onclick="deleteTicket('${ticket.id}')" style="background:#e5e7eb;color:#374151;border:1px solid #d1d5db;">Clear</button>` : ''}
                    <button onclick="copyTicket('${ticket.id}')">Copy</button>
                    ${!ticket.paid ? `<button onclick="marcarComoPagado('${ticket.id}')" style="background:#e5e7eb;color:#374151;border:1px solid #d1d5db;">Cobrar</button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        console.error('displayTickets error:', e);
        if (ticketsList) ticketsList.innerHTML = '<p style="color:red;padding:20px;">Error al cargar tickets</p>';
    }
}

function searchTickets() {
    const searchValue = document.getElementById('searchInput').value.trim();
    if (!searchValue) return;
    loadTickets().then(allTickets => {
        const exact = allTickets.find(t => t.id.toLowerCase() === searchValue.toLowerCase());
        if (exact) {
            showMainPageOnly();
            setTimeout(() => showTicketPreview(exact), 200);
            return;
        }
        const filtered = allTickets.filter(t => t.id.toLowerCase().includes(searchValue.toLowerCase()));
        displayTickets(filtered);
    });
}

function deleteSalesByDate() {
    const selectedDate = document.getElementById('salesDate').value;
    if (!selectedDate) {
        showNotification('Por favor, seleccione una fecha primero', 'warning');
        return;
    }

    showConfirm(
        `¿Está seguro de borrar todas las ventas del ${selectedDate}? Esta acción no se puede deshacer.`,
        'Borrar Ventas del Día',
        async () => {
            showLoading();
            try {
                const allTickets = await loadTickets();
                const toCancel = allTickets.filter(t => t.saleDate === selectedDate);

                for (const ticket of toCancel) {
                    await db.from('tickets').update({ is_cancelled: true, cancelled_at: new Date().toISOString(), cancelled_by: currentUser?.id || null }).eq('id', ticket.dbId);
                }

                displayTickets();
                showSalesByDate(selectedDate);
                showNotification(`Todas las ventas del ${selectedDate} han sido borradas`, 'success');
            } catch (e) {
                console.error('deleteSalesByDate error:', e);
            } finally {
                hideLoading();
            }
        }
    );
}

function borrarTodasVentas() {
    showConfirm(
        '⚠️ ADVERTENCIA: Esta acción eliminará TODAS las ventas guardadas. Esta operación NO SE PUEDE deshacer. ¿Está absolutamente seguro de que desea borrar TODOS los tickets?',
        'Borrar TODAS las Ventas',
        async () => {
            showLoading();
            try {
                const allTickets = await loadTickets();
                for (const ticket of allTickets) {
                    await db.from('tickets').update({ is_cancelled: true, cancelled_at: new Date().toISOString(), cancelled_by: currentUser?.id || null }).eq('id', ticket.dbId);
                }
                currentSales = { chances: {}, billetes: {} };
                displayTickets();
                document.getElementById('totalTickets').textContent = '0';
                document.getElementById('totalSales').textContent = '0.00';
                showNotification('Todas las ventas han sido eliminadas permanentemente.', 'success', 5000);
            } catch (e) {
                console.error('borrarTodasVentas error:', e);
            } finally {
                hideLoading();
            }
        }
    );
}

// ==================== Quick input ====================
function processQuickInput() {
    const input = document.getElementById('quickInput').value.trim();
    if (!input) { showNotification('Por favor ingrese al menos un número en formato "número,tiempos"'); return; }

    const lotteryType = document.getElementById('lotteryType').value;
    if (!lotteryType) { showNotification('Por favor seleccione una lotería'); return; }

    const lottery = lotteries.find(l => l.code === lotteryType);
    if (lottery && lottery.draw_times && lottery.draw_times.length > 0) {
        const drawTime = document.getElementById('drawTimeSelect').value;
        if (!drawTime) { showNotification('Por favor seleccione hora de sorteo'); return; }
    }

    const matches = input.match(/\d+,\d+/g);
    if (!matches || matches.length === 0) { showNotification('No se encontraron números en formato válido (número,tiempos)'); return; }

    let processed = 0;
    for (const match of matches) {
        const [number, piecesStr] = match.split(',');
        if (validateNumber(number)) {
            const pieces = parseInt(piecesStr, 10);
            if (!isNaN(pieces) && pieces > 0) {
                if (!validarHorarioVenta()) continue;
                if (!checkLimits(number, pieces)) continue;
                const subTotal = calculatePrice(number, pieces, lotteryType);
                numbers.push({ number, pieces, subTotal });
                updateCurrentSales(number, pieces, true);
                processed++;
            }
        }
    }

    if (processed > 0) {
        updateNumbersList();
        updateTotal();
        document.getElementById('quickInput').value = '';
        showNotification(`Se procesaron ${processed} números correctamente.`);
    } else {
        showNotification('No se pudieron procesar los números debido a los límites establecidos, formato incorrecto o hora limite del sorteo.');
    }
}

// ==================== Number sales page ====================
function applyFilters() {
    updateNumberSalesTable();
    updateBilletesSalesTable();
    setTimeout(() => loadAndDisplayWinningNumbers(), 100);
}

function updateNumberSalesTable() {
    loadTickets().then(allTickets => {
        const filterLottery = document.getElementById('filterLotteryType').value;
        const filterTime = document.getElementById('filterDrawTimeSelect').value;
        const filterDate = document.getElementById('salesFilterDate').value;

        const numberSales = {};
        for (let i = 0; i <= 99; i++) {
            numberSales[i.toString().padStart(2, '0')] = 0;
        }

        allTickets.forEach(ticket => {
            let passes = true;
            if (filterLottery && ticket.lotteryId !== filterLottery) passes = false;
            if (filterTime && ticket.drawTimeId !== filterTime) passes = false;
            if (filterDate && ticket.saleDate !== filterDate) passes = false;

            if (passes) {
                ticket.numbers.forEach(num => {
                    if (num.number.length === 2) {
                        numberSales[num.number] = (numberSales[num.number] || 0) + parseInt(num.pieces, 10);
                    }
                });
            }
        });

        const grid = document.getElementById('numberSalesGrid');
        grid.innerHTML = '';
        for (let i = 0; i <= 99; i++) {
            const number = i.toString().padStart(2, '0');
            const div = document.createElement('div');
            div.className = 'number-item';
            if (numberSales[number] > 0) div.classList.add('highlight');
            div.innerHTML = `<span>${number}</span><span>${numberSales[number]}</span>`;
            grid.appendChild(div);
        }

        displaySalesSummary('tiempos');
    });
}

function updateBilletesSalesTable() {
    loadTickets().then(allTickets => {
        const filterLottery = document.getElementById('filterLotteryType').value;
        const filterTime = document.getElementById('filterDrawTimeSelect').value;
        const filterDate = document.getElementById('salesFilterDate').value;

        const billetesSales = {};
        allTickets.forEach(ticket => {
            let passes = true;
            if (filterLottery && ticket.lotteryId !== filterLottery) passes = false;
            if (filterTime && ticket.drawTimeId !== filterTime) passes = false;
            if (filterDate && ticket.saleDate !== filterDate) passes = false;

            if (passes) {
                ticket.numbers.forEach(num => {
                    if (num.number.length === 4) {
                        billetesSales[num.number] = (billetesSales[num.number] || 0) + parseInt(num.pieces, 10);
                    }
                });
            }
        });

        const grid = document.getElementById('billetesSalesGrid');
        grid.innerHTML = '';
        const sorted = Object.keys(billetesSales).sort();

        if (sorted.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px;">No hay billetes vendidos con los filtros seleccionados</div>';
        } else {
            sorted.forEach(billete => {
                if (billetesSales[billete] > 0) {
                    const div = document.createElement('div');
                    div.className = 'billete-item highlight';
                    div.innerHTML = `<span>${billete}</span><span>${billetesSales[billete]}</span>`;
                    grid.appendChild(div);
                }
            });
        }

        displaySalesSummary('billetes');
    });
}

function calculateSalesTotals(type) {
    return loadTickets().then(allTickets => {
        const filterLottery = document.getElementById('filterLotteryType').value;
        const filterTime = document.getElementById('filterDrawTimeSelect').value;
        const filterDate = document.getElementById('salesFilterDate').value;

        let totalTiempos = 0;
        let totalColones = 0;

        allTickets.forEach(ticket => {
            let passes = true;
            if (filterLottery && ticket.lotteryId !== filterLottery) passes = false;
            if (filterTime && ticket.drawTimeId !== filterTime) passes = false;
            if (filterDate && ticket.saleDate !== filterDate) passes = false;

            if (passes) {
                ticket.numbers.forEach(num => {
                    if ((type === 'tiempos' && num.number.length === 2) ||
                        (type === 'billetes' && num.number.length === 4)) {
                        totalTiempos += parseFloat(num.pieces);
                        totalColones += parseFloat(num.subTotal);
                    }
                });
            }
        });

        return { totalTiempos, totalColones };
    });
}

function displaySalesSummary(type) {
    calculateSalesTotals(type).then(totals => {
        const isChance = type === 'tiempos';
        const boxId     = isChance ? 'salesSummaryBox' : 'salesSummaryBoxBilletes';
        const piezasId  = isChance ? 'totalTiempos'    : 'totalBilletePiezas';
        const colonesId = isChance ? 'totalColones'     : 'totalBilleteColones';

        const summaryBox = document.getElementById(boxId);
        if (!summaryBox) return;
        summaryBox.style.display = 'block';

        const totalDisplay = totals.totalTiempos % 1 !== 0
            ? totals.totalTiempos.toFixed(1)
            : totals.totalTiempos.toString();

        document.getElementById(piezasId).textContent  = totalDisplay;
        document.getElementById(colonesId).textContent = '$' + totals.totalColones.toFixed(2);

        updateCombinedSummary();
        if (isChance) showWinningNumbersSection();
    });
}

function updateCombinedSummary() {
    const parseAmt = id => {
        const el = document.getElementById(id);
        return el ? parseFloat(el.textContent.replace('$', '') || 0) : 0;
    };
    const chanceAmt  = parseAmt('totalColones');
    const billeteAmt = parseAmt('totalBilleteColones');
    const total = chanceAmt + billeteAmt;

    const sellerAmt = (total * sellerPercentage) / 100;
    const adminAmt  = total - sellerAmt;

    const box = document.getElementById('combinedSummaryBox');
    if (!box) return;
    box.style.display = 'block';
    document.getElementById('combinedChanceColones').textContent  = '$' + chanceAmt.toFixed(2);
    document.getElementById('combinedBilleteColones').textContent = '$' + billeteAmt.toFixed(2);
    document.getElementById('combinedTotal').textContent          = '$' + total.toFixed(2);
    document.getElementById('combinedSellerAmt').textContent      = '$' + sellerAmt.toFixed(2);
    document.getElementById('combinedSellerLabel').textContent    = `${sellerName} (${sellerPercentage}%)`;
    document.getElementById('combinedAdminAmt').textContent       = '$' + adminAmt.toFixed(2);
    document.getElementById('combinedAdminLabel').textContent     = `Admin (${100 - sellerPercentage}%)`;
}

function addPercentageBreakdown(summaryBox, totalAmount) {
    const existingBreakdown = summaryBox.querySelector('.percentage-breakdown');
    if (existingBreakdown) existingBreakdown.remove();
    const existingButton = summaryBox.querySelector('.percentage-config-button');
    if (existingButton) existingButton.remove();

    const sellerAmount = (totalAmount * sellerPercentage) / 100;
    const adminAmount = totalAmount - sellerAmount;

    const breakdown = document.createElement('div');
    breakdown.className = 'percentage-breakdown';
    breakdown.innerHTML = `
    <div class="percentage-item seller">
        <div class="percentage-value">$${sellerAmount.toFixed(2)}</div>
        <div class="percentage-label">${sellerName} (${sellerPercentage}%)</div>
    </div>
    <div class="percentage-item admin">
        <div class="percentage-value">$${adminAmount.toFixed(2)}</div>
        <div class="percentage-label">Admin (${(100 - sellerPercentage)}%)</div>
    </div>
    `;
    summaryBox.appendChild(breakdown);
}

function switchTab(tabName) {
    // Tabs removed — both sections always visible
    applyFilters();
}

// ==================== Winning numbers section ====================
function getPrizeMultiplier(position, lotteryObj, drawTimeObj, isBillete = false) {
    const keys = { 1: '1st', 2: '2nd', 3: '3rd' };
    const k = keys[position];
    if (isBillete) {
        const defaults = { 1: 2000, 2: 600, 3: 300 };
        const val = parseFloat(lotteryObj?.[`billete_prize_${k}_multiplier`]);
        return val || defaults[position];
    }
    const dtVal = drawTimeObj?.[`custom_prize_${k}_multiplier`];
    if (dtVal != null) return parseFloat(dtVal);
    return parseFloat(lotteryObj?.[`prize_${k}_multiplier`]) || (position === 1 ? 11 : position === 2 ? 3 : 2);
}

function showWinningNumbersSection() {
    let winningSection = document.getElementById('independentWinningSection');
    if (!winningSection) {
        winningSection = document.createElement('div');
        winningSection.id = 'independentWinningSection';
        const screenshotButton = document.getElementById('screenshotButton');
        if (screenshotButton) screenshotButton.parentNode.insertBefore(winningSection, screenshotButton);
    }
    winningSection.innerHTML = `
    <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 16px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h4 style="margin: 0 0 12px 0; color: #333; font-size: 15px;">Números Ganadores</h4>
        <div id="winnersDisplay" style="text-align:center; color:#888; font-size:13px;">Cargando...</div>
        <div id="winnersTable" style="margin-top:12px;"></div>
    </div>`;
    winningSection.style.display = 'block';
    loadAndDisplayWinningNumbers();
}

function hideWinningNumbersSection() {
    const winningSection = document.getElementById('independentWinningSection');
    if (winningSection) winningSection.style.display = 'none';
}

async function loadAndDisplayWinningNumbers() {
    const filterLottery = document.getElementById('filterLotteryType').value;
    const filterTime = document.getElementById('filterDrawTimeSelect').value;
    const filterDate = document.getElementById('salesFilterDate').value;
    const displayEl = document.getElementById('winnersDisplay');
    const tableEl = document.getElementById('winnersTable');
    if (!displayEl) return;
    if (!filterLottery || !filterDate) { displayEl.textContent = 'Selecciona lotería y fecha.'; return; }

    try {
        let q = db.from('winning_numbers').select('*')
            .eq('lottery_id', filterLottery)
            .eq('draw_date', filterDate);
        if (filterTime) q = q.eq('draw_time_id', filterTime);
        else q = q.is('draw_time_id', null);
        const { data } = await q.limit(1);

        if (!data || data.length === 0) {
            displayEl.innerHTML = '<span style="color:#aaa;font-size:13px;">Sin resultados cargados para esta fecha.</span>';
            if (tableEl) tableEl.innerHTML = '';
            return;
        }

        const row = data[0];
        const p1 = row.first_prize || '';
        const p2 = row.second_prize || '';
        const p3 = row.third_prize || '';
        const c1 = p1.slice(-2), c2 = p2.slice(-2), c3 = p3.slice(-2);

        const lotteryObj = lotteries.find(l => l.id === filterLottery) || null;
        const isPale = lotteryObj?.lottery_type === 'pale';
        const pale1 = isPale && p1.length === 2 && p2.length === 2 ? p1 + p2 : null;
        const pale2 = isPale && p1.length === 2 && p3.length === 2 ? p1 + p3 : null;
        const pale3 = isPale && p2.length === 2 && p3.length === 2 ? p2 + p3 : null;

        const colors = ['#6366f1','#22c55e','#f59e0b'];
        // Mostrar siempre ambos formatos: chance (2 cifras) + completo
        displayEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:8px;">
            ${[['1er', c1, p1, colors[0]], ['2do', c2, p2, colors[1]], ['3er', c3, p3, colors[2]]].map(([lbl, chance, full, col]) =>
                `<div style="text-align:center;">
                    <div style="font-size:10px;color:#888;margin-bottom:3px;">${lbl} Premio</div>
                    <div style="font-size:22px;font-weight:bold;color:${col};background:#f8f8f8;border:2px solid ${col};border-radius:8px;padding:4px 0;">${chance || '—'}</div>
                    ${full && full !== chance ? `<div style="font-size:11px;color:#666;margin-top:2px;">${full}</div>` : ''}
                </div>`
            ).join('')}
        </div>`;

        const drawTimeObj = filterTime ? (drawTimesMap[filterLottery] || []).find(dt => dt.id === filterTime) || null : null;
        const cm1 = getPrizeMultiplier(1, lotteryObj, drawTimeObj, false);
        const cm2 = getPrizeMultiplier(2, lotteryObj, drawTimeObj, false);
        const cm3 = getPrizeMultiplier(3, lotteryObj, drawTimeObj, false);
        const bm1 = getPrizeMultiplier(1, lotteryObj, drawTimeObj, true);
        const bm2 = getPrizeMultiplier(2, lotteryObj, drawTimeObj, true);
        const bm3 = getPrizeMultiplier(3, lotteryObj, drawTimeObj, true);
        const sym = currentProfile?.currency_symbol || lotteryObj?.currency_symbol || '$';

        const allTickets = await loadTickets();
        let filtered = allTickets;
        if (filterLottery) filtered = filtered.filter(t => t.lotteryId === filterLottery);
        if (filterTime)    filtered = filtered.filter(t => t.drawTimeId === filterTime);
        if (filterDate)    filtered = filtered.filter(t => t.saleDate === filterDate);

        const winners = [];
        let totalPago = 0, totalCobrado = 0;
        const adminPct = (100 - (sellerPercentage || 0)) / 100;

        filtered.forEach(ticket => {
            ticket.numbers.forEach(num => {
                const isChance = num.number.length === 2;
                totalCobrado += num.subTotal || 0;

                let prizeLabel = null, multiplier = 0;
                if (isChance) {
                    if (c1 && num.number === c1) { prizeLabel = '1er Premio'; multiplier = cm1; }
                    else if (c2 && num.number === c2) { prizeLabel = '2do Premio'; multiplier = cm2; }
                    else if (c3 && num.number === c3) { prizeLabel = '3er Premio'; multiplier = cm3; }
                } else if (isPale) {
                    if (pale1 && num.number === pale1) { prizeLabel = '1er Palé'; multiplier = bm1; }
                    else if (pale2 && num.number === pale2) { prizeLabel = '2do Palé'; multiplier = bm2; }
                    else if (pale3 && num.number === pale3) { prizeLabel = '3er Palé'; multiplier = bm3; }
                } else {
                    if (p1 && num.number === p1) { prizeLabel = '1er Premio'; multiplier = bm1; }
                    else if (p2 && num.number === p2) { prizeLabel = '2do Premio'; multiplier = bm2; }
                    else if (p3 && num.number === p3) { prizeLabel = '3er Premio'; multiplier = bm3; }
                }

                if (prizeLabel) {
                    const pago = num.pieces * multiplier;
                    totalPago += pago;
                    winners.push({ number: num.number, prizeLabel, pieces: num.pieces, pago });
                }
            });
        });

        const adminCobrado = totalCobrado * adminPct;
        const resultado = adminCobrado - totalPago;

        if (!tableEl) return;
        if (winners.length === 0) {
            tableEl.innerHTML = `<p style="text-align:center;color:#28a745;font-size:13px;margin:8px 0;">No hay ganadores para esta selección.</p>
                <div style="margin-top:8px;padding:10px;background:#f9f9f9;border-radius:6px;font-size:13px;">
                    <div style="display:flex;justify-content:space-between;"><span>Total Cobrado (admin):</span><strong>${sym}${adminCobrado.toFixed(2)}</strong></div>
                    <div style="display:flex;justify-content:space-between;margin-top:4px;"><span>Total a Pagar:</span><strong style="color:#dc3545;">${sym}0.00</strong></div>
                    <div style="display:flex;justify-content:space-between;margin-top:4px;"><span>Resultado:</span><strong style="color:#28a745;">GANANCIA ${sym}${adminCobrado.toFixed(2)}</strong></div>
                </div>`;
        } else {
            const rows = winners.map(w =>
                `<tr>
                    <td style="padding:6px 8px;font-weight:bold;">${w.number}</td>
                    <td style="padding:6px 8px;color:#666;">${w.prizeLabel}</td>
                    <td style="padding:6px 8px;text-align:center;">${w.pieces}</td>
                    <td style="padding:6px 8px;text-align:right;font-weight:bold;color:#dc3545;">${sym}${w.pago.toFixed(2)}</td>
                </tr>`
            ).join('');
            const resultColor = resultado >= 0 ? '#28a745' : '#dc3545';
            tableEl.innerHTML = `
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead><tr style="background:#f5f5f5;">
                        <th style="padding:6px 8px;text-align:left;">Número</th>
                        <th style="padding:6px 8px;text-align:left;">Premio</th>
                        <th style="padding:6px 8px;text-align:center;">Tiempos</th>
                        <th style="padding:6px 8px;text-align:right;">Pago</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div style="margin-top:10px;padding:10px;background:#f9f9f9;border-radius:6px;font-size:13px;">
                    <div style="display:flex;justify-content:space-between;"><span>Total Cobrado (admin):</span><strong>${sym}${adminCobrado.toFixed(2)}</strong></div>
                    <div style="display:flex;justify-content:space-between;margin-top:4px;"><span>Total a Pagar:</span><strong style="color:#dc3545;">${sym}${totalPago.toFixed(2)}</strong></div>
                    <div style="display:flex;justify-content:space-between;margin-top:4px;border-top:1px solid #ddd;padding-top:6px;"><span>Resultado:</span><strong style="color:${resultColor};">${resultado >= 0 ? 'GANANCIA' : 'PÉRDIDA'} ${sym}${Math.abs(resultado).toFixed(2)}</strong></div>
                </div>`;
        }
    } catch (e) {
        if (displayEl) displayEl.textContent = 'Error al cargar resultados.';
        console.error('loadAndDisplayWinningNumbers error:', e);
    }
}

function _legacySaveWinningNumbers() {
    const filterLottery = document.getElementById('filterLotteryType').value;
    const filterTime = document.getElementById('filterDrawTimeSelect').value;
    const filterDate = document.getElementById('salesFilterDate').value;
    const key = `winningNumbers_${filterLottery}_${filterTime}_${filterDate}`;

    const firstEl = document.getElementById('firstPrizeInput');
    const secondEl = document.getElementById('secondPrizeInput');
    const thirdEl = document.getElementById('thirdPrizeInput');

    const data = {
        first: firstEl ? firstEl.value : '',
        second: secondEl ? secondEl.value : '',
        third: thirdEl ? thirdEl.value : '',
    };
    localStorage.setItem(key, JSON.stringify(data));
}

function calculateWinnings() {
    const firstPrize = document.getElementById('firstPrizeInput') ? document.getElementById('firstPrizeInput').value.trim() : '';
    const secondPrize = document.getElementById('secondPrizeInput') ? document.getElementById('secondPrizeInput').value.trim() : '';
    const thirdPrize = document.getElementById('thirdPrizeInput') ? document.getElementById('thirdPrizeInput').value.trim() : '';

    saveWinningNumbers();

    const filterLottery = document.getElementById('filterLotteryType').value;
    const filterTime = document.getElementById('filterDrawTimeSelect').value;
    const filterDate = document.getElementById('salesFilterDate').value;

    loadTickets().then(allTickets => {
        let filtered = allTickets;
        if (filterLottery) filtered = filtered.filter(t => t.lotteryId === filterLottery);
        if (filterTime) filtered = filtered.filter(t => t.drawTimeId === filterTime);
        if (filterDate) filtered = filtered.filter(t => t.saleDate === filterDate);

        const prizes = [firstPrize, secondPrize, thirdPrize].filter(p => p);
        const winners = [];
        filtered.forEach(ticket => {
            ticket.numbers.forEach(num => {
                const twoDigit = num.number.slice(-2);
                if (prizes.includes(twoDigit) || prizes.includes(num.number)) {
                    winners.push({ id: ticket.id, number: num.number, pieces: num.pieces, lottery: ticket.lottery, drawTime: ticket.drawTime });
                }
            });
        });

        const resultDiv = document.getElementById('winningsResult');
        if (resultDiv) {
            if (winners.length === 0) {
                resultDiv.innerHTML = '<p style="color: #28a745;">No hay ganadores con estos números.</p>';
            } else {
                resultDiv.innerHTML = `<h4>Ganadores:</h4>` + winners.map(w =>
                    `<div style="padding: 8px; background: #f8fff9; border: 1px solid #28a745; border-radius: 4px; margin: 4px 0;">
                        <strong>${w.number}</strong> - ${w.pieces}T - Ticket: ${w.id}
                    </div>`
                ).join('');
            }
        }
    });
}

function calculateReventadoWinnings() {
    const prize = document.getElementById('reventadoPrizeInput') ? document.getElementById('reventadoPrizeInput').value.trim() : '';
    if (!prize) { showNotification('Ingrese el número ganador del Reventado', 'warning'); return; }

    const filterLottery = document.getElementById('filterLotteryType').value;
    const filterTime = document.getElementById('filterDrawTimeSelect').value;
    const filterDate = document.getElementById('salesFilterDate').value;

    loadTickets().then(allTickets => {
        let filtered = allTickets;
        if (filterLottery) filtered = filtered.filter(t => t.lotteryId === filterLottery);
        if (filterTime) filtered = filtered.filter(t => t.drawTimeId === filterTime);
        if (filterDate) filtered = filtered.filter(t => t.saleDate === filterDate);

        const winners = [];
        filtered.forEach(ticket => {
            ticket.numbers.forEach(num => {
                if (num.number === prize) {
                    winners.push({ id: ticket.id, number: num.number, pieces: num.pieces });
                }
            });
        });

        const resultDiv = document.getElementById('reventadoWinningsResult');
        if (resultDiv) {
            if (winners.length === 0) {
                resultDiv.innerHTML = '<p style="color: #28a745;">No hay ganadores con este número.</p>';
            } else {
                resultDiv.innerHTML = `<h4>Ganadores:</h4>` + winners.map(w =>
                    `<div style="padding: 8px; background: #f8fff9; border: 1px solid #28a745; border-radius: 4px; margin: 4px 0;">
                        <strong>${w.number}</strong> - ${w.pieces}T - Ticket: ${w.id}
                    </div>`
                ).join('');
            }
        }
    });
}

function clearPrizeInputs() {
    const els = ['firstPrizeInput', 'secondPrizeInput', 'thirdPrizeInput'];
    els.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const winningsResult = document.getElementById('winningsResult');
    if (winningsResult) winningsResult.innerHTML = '';

    const filterLottery = document.getElementById('filterLotteryType').value;
    const filterTime = document.getElementById('filterDrawTimeSelect').value;
    const filterDate = document.getElementById('salesFilterDate').value;
    localStorage.removeItem(`winningNumbers_${filterLottery}_${filterTime}_${filterDate}`);
    showNotification('Premios limpiados', 'success');
}

function clearReventadoPrizeInput() {
    const el = document.getElementById('reventadoPrizeInput');
    if (el) el.value = '';
    const resultDiv = document.getElementById('reventadoWinningsResult');
    if (resultDiv) resultDiv.innerHTML = '';

    const filterLottery = document.getElementById('filterLotteryType').value;
    const filterTime = document.getElementById('filterDrawTimeSelect').value;
    const filterDate = document.getElementById('salesFilterDate').value;
    localStorage.removeItem(`reventadoWinningNumber_${filterLottery}_${filterTime}_${filterDate}`);
    showNotification('Premio limpiado', 'success');
}

// ==================== Check winning tickets ====================
function checkWinningTickets() {
    const firstPrize = document.getElementById('firstPrize').value.trim();
    const secondPrize = document.getElementById('secondPrize').value.trim();
    const thirdPrize = document.getElementById('thirdPrize').value.trim();

    if (!firstPrize || !secondPrize || !thirdPrize) {
        showNotification('Por favor, ingrese los números ganadores.');
        return;
    }

    const filterDateInput = document.getElementById('winnersFilterDate').value;
    const filterLottery = document.getElementById('filterLottery').value;
    const filterDrawTime = document.getElementById('filterDrawTime').value;

    loadTickets().then(allTickets => {
        let filtered = [...allTickets];

        if (filterDateInput) filtered = filtered.filter(t => t.saleDate === filterDateInput);
        if (filterLottery) filtered = filtered.filter(t => t.lotteryId === filterLottery);
        if (filterDrawTime) filtered = filtered.filter(t => t.drawTimeId === filterDrawTime);

        if (filtered.length === 0) {
            showNotification('No hay tickets que coincidan con los filtros seleccionados.');
            return;
        }

        const winningTickets = [];
        filtered.forEach(ticket => {
            ticket.numbers.forEach(num => {
                const ticketNumber = num.number;
                let prizeType = '';
                if (ticketNumber === firstPrize) prizeType = '1er Premio';
                else if (ticketNumber === secondPrize) prizeType = '2do Premio';
                else if (ticketNumber === thirdPrize) prizeType = '3er Premio';

                if (prizeType) {
                    const ticketDate = new Date(ticket.datetime);
                    winningTickets.push({
                        id: ticket.id,
                        lottery: ticket.lottery,
                        drawTime: ticket.drawTime,
                        date: `${ticketDate.getDate()}/${ticketDate.getMonth()+1}/${ticketDate.getFullYear()}`,
                        number: ticketNumber,
                        pieces: num.pieces,
                        prize: prizeType,
                    });
                }
            });
        });

        if (winningTickets.length > 0) {
            displayWinningTickets(winningTickets);
        } else {
            showNotification('No hay tickets ganadores con los números ingresados en los filtros seleccionados.');
        }
    });
}

function displayWinningTickets(winningTickets) {
    const resultDiv = document.getElementById('winningTicketsResult');
    resultDiv.innerHTML = `
        <h3>Tickets Ganadores</h3>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th style="border: 1px solid #ccc; padding: 8px;">ID Ticket</th>
                    <th style="border: 1px solid #ccc; padding: 8px;">Fecha</th>
                    <th style="border: 1px solid #ccc; padding: 8px;">Lotería</th>
                    <th style="border: 1px solid #ccc; padding: 8px;">Hora Sorteo</th>
                    <th style="border: 1px solid #ccc; padding: 8px;">Número</th>
                    <th style="border: 1px solid #ccc; padding: 8px;">Tiempos</th>
                    <th style="border: 1px solid #ccc; padding: 8px;">Premio</th>
                </tr>
            </thead>
            <tbody>
                ${winningTickets.map(ticket => `
                    <tr>
                        <td style="border: 1px solid #ccc; padding: 8px;">${ticket.id}</td>
                        <td style="border: 1px solid #ccc; padding: 8px;">${ticket.date}</td>
                        <td style="border: 1px solid #ccc; padding: 8px;">${ticket.lottery}</td>
                        <td style="border: 1px solid #ccc; padding: 8px;">${ticket.drawTime || 'N/A'}</td>
                        <td style="border: 1px solid #ccc; padding: 8px;">${ticket.number}</td>
                        <td style="border: 1px solid #ccc; padding: 8px;">${ticket.pieces}</td>
                        <td style="border: 1px solid #ccc; padding: 8px;">${ticket.prize}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ==================== Bluetooth Printer ====================
function showPrinterConfig() {
    closeMenu();
    document.getElementById('printerConfigModal').style.display = 'block';
    loadPairedDevices();
}

function closePrinterConfig() {
    document.getElementById('printerConfigModal').style.display = 'none';
}

function loadPairedDevices() {
    const infoEl = document.getElementById('currentPrinterInfo');
    const listEl = document.getElementById('pairedDevicesList');

    infoEl.innerHTML = savedPrinterName
        ? `<strong>Impresora actual:</strong> ${savedPrinterName}<br><small>${savedPrinterAddress}</small>`
        : '<em>Sin impresora configurada</em>';

    if (typeof Android === 'undefined') {
        listEl.innerHTML = '<p style="color:#888;">Bluetooth no disponible en este entorno.</p>';
        return;
    }

    listEl.innerHTML = '<p style="color:#888;">Buscando dispositivos...</p>';
    try {
        const devicesJson = Android.getPairedDevices();
        if (devicesJson.startsWith('ERROR:')) {
            listEl.innerHTML = '<p style="color:red;">Error: ' + devicesJson + '</p>';
            return;
        }
        const devices = JSON.parse(devicesJson);
        if (!devices.length) {
            listEl.innerHTML = '<p style="color:#888;">No hay dispositivos emparejados. Empareja la impresora en Ajustes &gt; Bluetooth.</p>';
            return;
        }
        listEl.innerHTML = '';
        devices.forEach(device => {
            const isSelected = device.address === savedPrinterAddress;
            const item = document.createElement('div');
            item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;';
            item.style.cursor = 'pointer';
            item.onclick = () => selectPrinter(device.address, device.name);
            item.innerHTML = `
                <div>
                    <div style="font-weight:600;">${device.name}</div>
                    <div style="font-size:0.8em; color:#888;">${device.address}</div>
                </div>
                <input type="checkbox" ${isSelected ? 'checked' : ''} style="width:22px;height:22px;accent-color:#28a745;pointer-events:none;" />`;
            listEl.appendChild(item);
        });
    } catch (e) {
        listEl.innerHTML = '<p style="color:red;">Error al obtener dispositivos: ' + e.message + '</p>';
    }
}

function selectPrinter(address, name) {
    savedPrinterAddress = address;
    savedPrinterName = name;
    localStorage.setItem('printerAddress', address);
    localStorage.setItem('printerName', name);
    loadPairedDevices();
    showNotification('Impresora "' + name + '" configurada', 'success');
}

function printCurrentTicket() {
    if (!savedPrinterAddress) {
        showNotification('No hay impresora configurada. Ve al menú > Configurar Impresora', 'warning', 4000);
        return;
    }
    if (!currentPreviewTicket) {
        showNotification('No hay ticket para imprimir', 'warning');
        return;
    }
    if (typeof Android === 'undefined') {
        showNotification('Impresión no disponible en este entorno', 'warning');
        return;
    }

    const t = currentPreviewTicket;
    const ticketData = {
        lotteryName: getDisplayName(t.lottery) || t.lottery || '',
        drawTime: t.drawTime || '',
        saleDate: t.saleDate || '',
        datetime: t.datetime || '',
        ticketId: t.id || '',
        sellerName: sellerName || '',
        customerName: t.customerName || '',
        numbers: (t.numbers || []).map(n => ({
            number: n.number,
            pieces: String(n.pieces),
            subtotal: parseFloat(n.subTotal || 0).toFixed(2),
        })),
        total: parseFloat(t.total || 0).toFixed(2),
        currencySymbol: t.currencySymbol || '$',
    };

    showLoading();
    try {
        const result = Android.printTicket(savedPrinterAddress, JSON.stringify(ticketData));
        if (result === 'OK') {
            showNotification('Ticket impreso correctamente', 'success');
        } else {
            showNotification('Error al imprimir: ' + result, 'error', 5000);
        }
    } catch (e) {
        showNotification('Error al imprimir: ' + e.message, 'error', 5000);
    } finally {
        hideLoading();
    }
}

// ==================== Share / capture ====================
async function captureAndShareScreen() {
    try {
        const button = document.getElementById('screenshotButton');
        button.disabled = true;
        button.classList.add('capturing');
        button.textContent = 'Capturando...';

        const container = document.getElementById('numberSalesPage');
        const canvas = await html2canvas(container, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
        });

        const base64 = canvas.toDataURL('image/png');
        if (typeof Android !== 'undefined') {
            Android.shareImageFromAndroid(base64);
        } else {
            const link = document.createElement('a');
            link.href = base64;
            link.download = 'ventas_reporte.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch (error) {
        console.error('Error al capturar pantalla:', error);
        showNotification('Error al capturar la pantalla.', 'error');
    } finally {
        const button = document.getElementById('screenshotButton');
        button.disabled = false;
        button.classList.remove('capturing');
        button.textContent = 'Compartir por WhatsApp';
    }
}

async function compartirTicket() {
    try {
        const ticketElement = document.getElementById('ticketPreview');
        const actionButtons = ticketElement.querySelector('.ticket-actions');
        actionButtons.style.display = 'none';
        actionButtons.style.visibility = 'hidden';

        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(ticketElement, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            allowTaint: true,
        });

        actionButtons.style.display = 'grid';
        actionButtons.style.visibility = 'visible';

        const base64 = canvas.toDataURL('image/png');
        if (typeof Android !== 'undefined') {
            Android.shareTicketFromAndroid(base64);
        }
    } catch (error) {
        console.error('Error al compartir:', error);
        showNotification('No se pudo compartir el ticket. Intente de nuevo.');
        const ticketElement = document.getElementById('ticketPreview');
        const actionButtons = ticketElement.querySelector('.ticket-actions');
        if (actionButtons) {
            actionButtons.style.display = 'grid';
            actionButtons.style.visibility = 'visible';
        }
    }
}

function shareReport(type) {
    loadTickets().then(allTickets => {
        const filterLottery = document.getElementById('filterLotteryType').value;
        const filterTime = document.getElementById('filterDrawTimeSelect').value;
        const filterDate = document.getElementById('salesFilterDate').value;

        const sales = {};
        allTickets.forEach(ticket => {
            let passes = true;
            if (filterLottery && ticket.lotteryId !== filterLottery) passes = false;
            if (filterTime && ticket.drawTimeId !== filterTime) passes = false;
            if (filterDate && ticket.saleDate !== filterDate) passes = false;

            if (passes) {
                ticket.numbers.forEach(num => {
                    if ((type === 'tiempos' && num.number.length === 2) ||
                        (type === 'billetes' && num.number.length === 4)) {
                        if (!sales[num.number]) sales[num.number] = 0;
                        sales[num.number] += parseInt(num.pieces, 10);
                    }
                });
            }
        });

        let reportContent = `Reporte de ${type === 'tiempos' ? 'Tiempos' : 'Billetes'} Vendidos\n`;
        reportContent += `Lotería: ${filterLottery || 'Todas'}\n`;
        reportContent += `Hora de Sorteo: ${filterTime || 'Todas'}\n`;
        reportContent += `Fecha: ${filterDate || 'Todas'}\n\n`;
        reportContent += type === 'tiempos' ? 'Número,Tiempos Vendidos\n' : 'Billete,Cantidad Vendida\n';

        Object.keys(sales).sort().forEach(number => {
            if (sales[number] > 0) reportContent += `${number},${sales[number]}\n`;
        });

        if (typeof Android !== 'undefined') {
            Android.shareReportFromAndroid(reportContent, type);
        }
    });
}

// ==================== Scanner ====================
let _qrModal = null;
let _qrSales = null;

const QR_CONFIG = { fps: 10, qrbox: { width: 230, height: 230 } };
const QR_CAMERA = { facingMode: 'environment' };

function _qrErrorFilter(err) {
    if (typeof err === 'string' && (err.includes('NotFoundException') || err.includes('No MultiFormat'))) return;
    if (err && err.message && (err.message.includes('NotFoundException') || err.message.includes('No MultiFormat'))) return;
}

async function _stopQr(instance) {
    if (!instance) return;
    try {
        if (instance.isScanning) await instance.stop();
        instance.clear();
    } catch (e) {}
}

async function openScannerModal() {
    document.getElementById('scannerModal').classList.add('active');
    // Clear previous element content
    document.getElementById('readerModal').innerHTML = '';
    try {
        _qrModal = new Html5Qrcode('readerModal');
        await _qrModal.start(QR_CAMERA, QR_CONFIG,
            async (decodedText) => {
                await _stopQr(_qrModal);
                _qrModal = null;
                document.getElementById('scannerModal').classList.remove('active');
                const allTickets = await loadTickets();
                const ticket = allTickets.find(t => t.id === decodedText || t.ticketNumber === decodedText);
                if (ticket) {
                    showTicketPreview(ticket);
                } else {
                    showNotification('❌ Ticket no encontrado', 'error');
                }
            },
            _qrErrorFilter
        );
    } catch (e) {
        console.error('Error iniciando scanner:', e);
        showNotification('❌ No se pudo acceder a la cámara', 'error');
        document.getElementById('scannerModal').classList.remove('active');
    }
}

async function closeScannerModal() {
    await _stopQr(_qrModal);
    _qrModal = null;
    document.getElementById('scannerModal').classList.remove('active');
}

async function toggleScanner() {
    const scannerContainer = document.getElementById('scannerContainer');
    if (scannerContainer.style.display === 'none' || !scannerContainer.style.display) {
        scannerContainer.style.display = 'block';
        document.getElementById('reader').innerHTML = '';
        try {
            _qrSales = new Html5Qrcode('reader');
            await _qrSales.start(QR_CAMERA, QR_CONFIG,
                async (decodedText) => {
                    await _stopQr(_qrSales);
                    _qrSales = null;
                    scannerContainer.style.display = 'none';
                    const allTickets = await loadTickets();
                    const ticket = allTickets.find(t => t.id === decodedText || t.ticketNumber === decodedText);
                    if (ticket) {
                        verificarTicket(ticket);
                    } else {
                        showNotification('❌ Ticket no encontrado en el sistema', 'error');
                    }
                },
                _qrErrorFilter
            );
        } catch (e) {
            console.error('Error iniciando scanner:', e);
            showNotification('❌ No se pudo acceder a la cámara', 'error');
            scannerContainer.style.display = 'none';
        }
    } else {
        await _stopQr(_qrSales);
        _qrSales = null;
        scannerContainer.style.display = 'none';
    }
}

function verificarTicket(ticket) {
    if (ticket.paid) {
        showNotification('⚠️ Este ticket ya ha sido pagado anteriormente', 'warning');
    } else {
        showNotification('📄 Ticket encontrado', 'success');
    }
    showMainPageOnly();
    setTimeout(() => showTicketPreview(ticket), 200);
}

// ==================== Sales limits (localStorage still used for limits) ====================
function initLimitsAndSales() {
    loadLimitsFromDB();
    calculateCurrentSales();
}

function checkLimits(number, pieces) {
    const lotteryType = document.getElementById('lotteryType').value;
    const drawTimeObj = getSelectedDrawTimeObj();
    const drawTime = drawTimeObj ? drawTimeObj.time_label : 'default';
    const key = `${lotteryType}_${drawTime}`;
    const fallbackKey = `${lotteryType}_default`;
    const isChance = number.length === 2;
    const type = isChance ? 'chances' : 'billetes';
    const limitsMap = isChance ? salesLimits.chances : salesLimits.billetes;
    const limits = limitsMap[key] || limitsMap[fallbackKey] || limitsMap['__global__'];

    if (!limits) return true;

    if (!currentSales[type][key]) currentSales[type][key] = {};
    const currentNumberSales = currentSales[type][key][number] || 0;

    if (limits.numbers && limits.numbers[number] !== undefined) {
        if (currentNumberSales + pieces > limits.numbers[number]) {
            showNotification(`¡Límite excedido! Solo puede vender ${limits.numbers[number]} tiempos del número ${number} y ya ha vendido ${currentNumberSales}.`);
            return false;
        }
    } else if (limits.globalLimit) {
        if (currentNumberSales + pieces > limits.globalLimit) {
            showNotification(`¡Límite excedido! Solo puede vender ${limits.globalLimit} tiempos del número ${number} y ya ha vendido ${currentNumberSales}.`);
            return false;
        }
    }
    return true;
}

function setGlobalLimit(type) {
    let lottery, drawTime, globalLimit;

    if (type === 'chances') {
        lottery = document.getElementById('limitLotteryType').value;
        drawTime = document.getElementById('limitDrawTimeSelect').value || 'default';
        globalLimit = parseInt(document.getElementById('globalChancesLimit').value, 10);
    } else {
        lottery = document.getElementById('limitBilleteLotteryType').value;
        drawTime = document.getElementById('limitBilleteDrawTimeSelect').value || 'default';
        globalLimit = parseInt(document.getElementById('globalBilletesLimit').value, 10);
    }

    if (!lottery) { showNotification('Por favor seleccione una lotería'); return; }
    if (isNaN(globalLimit) || globalLimit < 0) { showNotification('Por favor ingrese un límite válido (número positivo)'); return; }

    const key = `${lottery}_${drawTime}`;
    if (!salesLimits[type][key]) salesLimits[type][key] = { globalLimit: 0, numbers: {} };
    salesLimits[type][key].globalLimit = globalLimit;

    localStorage.setItem('lotteryLimits', JSON.stringify(salesLimits));
    displayCurrentLimits(type);
    showNotification(`Límite global de ${globalLimit} tiempos establecido para cada número de ${lottery} - ${drawTime}`);
}

function setIndividualLimit(type) {
    let lottery, drawTime, number, limit;

    if (type === 'chances') {
        lottery = document.getElementById('limitLotteryType').value;
        drawTime = document.getElementById('limitDrawTimeSelect').value || 'default';
        number = document.getElementById('chanceNumber').value.padStart(2, '0');
        limit = parseInt(document.getElementById('chanceLimit').value, 10);
        if (!lottery) { showNotification('Por favor seleccione una lotería'); return; }
        if (!number || number.length !== 2 || isNaN(parseInt(number, 10))) { showNotification('Por favor ingrese un número válido de 2 cifras (00-99)'); return; }
    } else {
        lottery = document.getElementById('limitBilleteLotteryType').value;
        drawTime = document.getElementById('limitBilleteDrawTimeSelect').value || 'default';
        number = document.getElementById('billeteNumber').value.padStart(4, '0');
        limit = parseInt(document.getElementById('billeteLimit').value, 10);
        if (!lottery) { showNotification('Por favor seleccione una lotería'); return; }
        if (!number || number.length !== 4 || isNaN(parseInt(number, 10))) { showNotification('Por favor ingrese un número válido de 4 cifras (0000-9999)'); return; }
    }

    if (isNaN(limit) || limit < 0) { showNotification('Por favor ingrese un límite válido (número positivo)'); return; }

    const key = `${lottery}_${drawTime}`;
    if (!salesLimits[type][key]) salesLimits[type][key] = { globalLimit: 0, numbers: {} };
    if (!salesLimits[type][key].numbers) salesLimits[type][key].numbers = {};
    salesLimits[type][key].numbers[number] = limit;

    localStorage.setItem('lotteryLimits', JSON.stringify(salesLimits));
    displayCurrentLimits(type);

    if (type === 'chances') {
        document.getElementById('chanceNumber').value = '';
        document.getElementById('chanceLimit').value = '';
    } else {
        document.getElementById('billeteNumber').value = '';
        document.getElementById('billeteLimit').value = '';
    }

    showNotification(`Límite de ${limit} tiempos establecido para el número ${number} - ${lottery} - ${drawTime}`);
}

function displayCurrentLimits(type) {
    const container = document.getElementById(type === 'chances' ? 'currentChancesLimits' : 'currentBilletesLimits');
    container.innerHTML = '';
    const limits = type === 'chances' ? salesLimits.chances : salesLimits.billetes;

    if (!limits || Object.keys(limits).length === 0) {
        container.innerHTML = '<p>No hay límites configurados actualmente.</p>';
        return;
    }

    let html = '';
    for (const key in limits) {
        const parts = key.split('_');
        const lottery = parts[0];
        const drawTime = parts.slice(1).join('_');
        html += `<div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">`;
        html += `<h5>${lottery} - ${drawTime === 'default' ? 'Todos los sorteos' : drawTime}</h5>`;
        if (limits[key].globalLimit) {
            html += `<p><strong>Límite Global para cada número:</strong> ${limits[key].globalLimit} tiempos</p>`;
        }
        const nums = limits[key].numbers || {};
        if (Object.keys(nums).length > 0) {
            html += `<p><strong>Límites Individuales:</strong></p>`;
            html += `<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px;">`;
            for (const number in nums) {
                html += `<div style="border: 1px solid #ddd; padding: 5px; text-align: center;">${number}: ${nums[number]}</div>`;
            }
            html += `</div>`;
        } else {
            html += `<p>No hay límites individuales configurados.</p>`;
        }
        html += `<button onclick="removeLimitConfig('${type}', '${key}')"
                  style="margin-top: 10px; background-color: #ff4d4d; color: white;">
                  Eliminar Configuración
                </button>`;
        html += `</div>`;
    }
    container.innerHTML = html;
}

function removeLimitConfig(type, key) {
    if (confirm('¿Está seguro de eliminar esta configuración de límites?')) {
        if (type === 'chances') delete salesLimits.chances[key];
        else delete salesLimits.billetes[key];
        localStorage.setItem('lotteryLimits', JSON.stringify(salesLimits));
        displayCurrentLimits(type);
    }
}

function saveConfigAndReturn() {
    document.getElementById('configPage').style.display = 'none';
    showMainPage();
}

function switchLimitTab(tab) {
    document.getElementById('chancesLimitTab').classList.toggle('active', tab === 'chances');
    document.getElementById('billetesLimitTab').classList.toggle('active', tab === 'billetes');
    document.getElementById('chancesLimitContainer').style.display = tab === 'chances' ? 'block' : 'none';
    document.getElementById('billetesLimitContainer').style.display = tab === 'billetes' ? 'block' : 'none';
    displayCurrentLimits(tab);
}

// ==================== Schedule validation ====================
function validarHorarioVenta() {
    const dt = getSelectedDrawTimeObj();
    if (!dt?.time_value) return false;

    const cutoff = dt.cutoff_minutes_before ?? 1;
    const blockAfter = dt.block_minutes_after ?? 20;

    const ahora = new Date();
    const [hora, minutos] = dt.time_value.split(':').map(Number);
    const horaSorteoEnMinutos = hora * 60 + minutos;
    const horaActualEnMinutos = ahora.getHours() * 60 + ahora.getMinutes();
    const diferencia = horaSorteoEnMinutos - horaActualEnMinutos;

    if (diferencia >= 0 && diferencia <= cutoff) return false;
    if (diferencia < 0) return Math.abs(diferencia) > blockAfter;
    return true;
}

function validarHorarioEliminacion(lotteryType = null, drawTime = null) {
    if (!lotteryType) lotteryType = document.getElementById('lotteryType').value;
    if (!drawTime) drawTime = getSelectedDrawTimeObj()?.time_label || '';
    if (!drawTime) return { allowed: true };

    const ahora = new Date();
    let [tiempo, periodo] = drawTime.split(' ');
    let [hora, minutos] = tiempo.split(':').map(Number);

    if (periodo === 'PM' && hora !== 12) hora += 12;
    else if (periodo === 'AM' && hora === 12) hora = 0;

    const horaSorteoEnMinutos = hora * 60 + minutos;
    const horaActualEnMinutos = ahora.getHours() * 60 + ahora.getMinutes();
    const diferencia = horaSorteoEnMinutos - horaActualEnMinutos;

    if (diferencia <= 1 && diferencia >= 0) {
        return { allowed: false, reason: 'pre_sorteo', drawTime, minutesLeft: Math.max(0, diferencia) };
    }
    if (diferencia < 0) {
        const minutosPasados = Math.abs(diferencia);
        if (minutosPasados <= 10) {
            return { allowed: false, reason: 'post_sorteo', drawTime, minutesLeft: 10 - minutosPasados };
        }
    }
    return { allowed: true };
}

function getEliminationBlockMessage(validationResult) {
    const { reason, drawTime, minutesLeft } = validationResult;
    if (reason === 'pre_sorteo') {
        if (minutesLeft === 0) return `🚫 ELIMINACIÓN BLOQUEADA\n\nEl sorteo de las ${drawTime} está a punto de iniciar.`;
        return `🚫 ELIMINACIÓN BLOQUEADA\n\nFalta ${Math.ceil(minutesLeft)} minuto(s) para el sorteo de las ${drawTime}.`;
    } else if (reason === 'post_sorteo') {
        return `🚫 ELIMINACIÓN BLOQUEADA\n\nEl sorteo de las ${drawTime} ya ocurrió.\n\nDebes esperar ${Math.ceil(minutesLeft)} minuto(s) más para eliminar tickets.`;
    }
    return 'No se puede eliminar el ticket en este momento.';
}

// ==================== Notifications ====================
function showNotification(message, type = 'info', duration = 4000) {
    document.querySelectorAll('.custom-notification').forEach(n => n.remove());
    const notification = document.createElement('div');
    notification.className = `custom-notification ${type}`;
    notification.innerHTML = `
    <span>${message}</span>
    <button class="notification-close" onclick="closeNotification(this)">&times;</button>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => hideNotification(notification), duration);
}

function hideNotification(notification) {
    notification.classList.remove('show');
    setTimeout(() => { if (notification && notification.parentNode) notification.parentNode.removeChild(notification); }, 400);
}

function closeNotification(closeBtn) {
    hideNotification(closeBtn.closest('.custom-notification'));
}

function showConfirm(message, title = 'Confirmar acción', onConfirm = null, onCancel = null) {
    const modal = document.getElementById('customConfirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;

    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newConfirmBtn.onclick = () => { modal.style.display = 'none'; if (onConfirm) onConfirm(); };
    newCancelBtn.onclick = () => { modal.style.display = 'none'; if (onCancel) onCancel(); };
    modal.onclick = (e) => { if (e.target === modal) { modal.style.display = 'none'; if (onCancel) onCancel(); } };
    modal.style.display = 'block';
}

function confirmAsync(message, title = 'Confirmar acción') {
    return new Promise(resolve => showConfirm(message, title, () => resolve(true), () => resolve(false)));
}

// ==================== Keyboard ====================
function showKeyboard(inputElement) {
    currentActiveInput = inputElement;
    const keyboard = document.getElementById('customKeyboard');
    const keyboardTitle = document.querySelector('.keyboard-title');

    if (inputElement.id === 'number') keyboardTitle.textContent = 'Ingresa el número';
    else if (inputElement.id === 'pieces') keyboardTitle.textContent = 'Ingresa los tiempos';

    document.querySelectorAll('.input-group input').forEach(input => input.classList.remove('keyboard-active'));
    inputElement.classList.add('keyboard-active');
    keyboard.classList.add('show');
    document.body.classList.add('keyboard-open');
    keyboardVisible = true;
    inputElement.setAttribute('readonly', 'readonly');
}

function hideKeyboard() {
    const keyboard = document.getElementById('customKeyboard');
    keyboard.classList.remove('show');
    document.body.classList.remove('keyboard-open');
    keyboardVisible = false;
    document.querySelectorAll('.input-group input').forEach(input => {
        input.classList.remove('keyboard-active');
        input.removeAttribute('readonly');
    });
    currentActiveInput = null;
}

function addDigit(digit) {
    if (!currentActiveInput) return;
    const maxLength = currentActiveInput.id === 'number' ? 4 : 10;
    if (currentActiveInput.value.length < maxLength) {
        currentActiveInput.value += digit;
    }
}

function deleteDigit() {
    if (!currentActiveInput) return;
    currentActiveInput.value = currentActiveInput.value.slice(0, -1);
}

function submitNumber() {
    if (!currentActiveInput) return;
    const numberInput = document.getElementById('number');
    const piecesInput = document.getElementById('pieces');

    if (currentActiveInput === numberInput) {
        if (numberInput.value.trim()) {
            showKeyboard(piecesInput);
            piecesInput.focus();
        } else {
            showNotification('Por favor ingrese un número', 'warning');
        }
    } else if (currentActiveInput === piecesInput) {
        if (numberInput.value.trim() && piecesInput.value.trim()) {
            const number = numberInput.value;
            const pieces = parseInt(piecesInput.value, 10);
            const lotteryType = document.getElementById('lotteryType').value;

            if (!validateNumber(number)) { showNotification('El número debe tener 2 o 4 cifras', 'warning'); return; }
            if (!lotteryType) { showNotification('Por favor seleccione una lotería', 'warning'); return; }

            const lottery = lotteries.find(l => l.code === lotteryType);
            if (lottery && lottery.draw_times && lottery.draw_times.length > 0) {
                const drawTime = document.getElementById('drawTimeSelect').value;
                if (!drawTime) { showNotification('Por favor seleccione hora de sorteo', 'warning'); return; }
            }

            if (!validarHorarioVenta()) {
                const _dt3 = getSelectedDrawTimeObj();
                const _cut3 = _dt3?.cutoff_minutes_before ?? 1;
                const _blk3 = _dt3?.block_minutes_after ?? 20;
                showNotification(`No se pueden vender números. Ventas bloqueadas ${_cut3} min antes y ${_blk3} min después del sorteo.`, 'warning');
                return;
            }

            if (!checkLimits(number, pieces)) return;

            const subTotal = calculatePrice(number, pieces, lotteryType);
            numbers.push({ number, pieces, subTotal, lotteryType });
            updateNumbersList();
            updateTotal();
            updateCurrentSales(number, pieces, true);

            numberInput.value = '';
            piecesInput.value = '';
            showKeyboard(numberInput);
            numberInput.focus();
        } else if (!piecesInput.value.trim()) {
            showNotification('Por favor ingrese la cantidad de tiempos', 'warning');
        } else {
            showNotification('Por favor complete el número', 'warning');
        }
    }
}

function initKeyboardEvents() {
    const numberInput = document.getElementById('number');
    const piecesInput = document.getElementById('pieces');

    if (!numberInput || !piecesInput) return;

    numberInput.addEventListener('focus', function () { showKeyboard(this); });
    piecesInput.addEventListener('focus', function () { showKeyboard(this); });
    numberInput.addEventListener('click', function () { showKeyboard(this); });
    piecesInput.addEventListener('click', function () { showKeyboard(this); });

    document.addEventListener('click', function (e) {
        const keyboard = document.getElementById('customKeyboard');
        if (keyboardVisible &&
            !keyboard.contains(e.target) &&
            e.target !== numberInput &&
            e.target !== piecesInput) {
            hideKeyboard();
        }
    });

    [numberInput, piecesInput].forEach(input => {
        input.addEventListener('keydown', function (e) {
            if (keyboardVisible) {
                e.preventDefault();
                if (e.key >= '0' && e.key <= '9') addDigit(e.key);
                else if (e.key === 'Backspace') deleteDigit();
                else if (e.key === 'Enter') submitNumber();
                else if (e.key === 'Escape') hideKeyboard();
            }
        });
    });
}

// ==================== Menu ====================
function toggleMenu() {
    if (menuOpen) closeMenu();
    else openMenu();
}

function openMenu() {
    document.getElementById('menuDropdown').classList.add('show');
    document.getElementById('menuOverlay').classList.add('show');
    document.getElementById('hamburgerIcon').classList.add('open');
    menuOpen = true;
}

function closeMenu() {
    document.getElementById('menuDropdown').classList.remove('show');
    document.getElementById('menuOverlay').classList.remove('show');
    document.getElementById('hamburgerIcon').classList.remove('open');
    menuOpen = false;
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) closeMenu();
});

// ==================== Seguidilla modal ====================
function openSeguidillaModal() {
    const lotteryType = document.getElementById('lotteryType').value;
    if (!lotteryType) { showNotification('Por favor seleccione una loteria primero', 'warning'); return; }

    const lottery = lotteries.find(l => l.code === lotteryType);
    if (lottery && lottery.draw_times && lottery.draw_times.length > 0) {
        const drawTime = document.getElementById('drawTimeSelect').value;
        if (!drawTime) { showNotification('Por favor seleccione hora de sorteo primero', 'warning'); return; }
    }

    const modal = document.getElementById('seguidillaModal');
    modal.style.display = 'block';
    document.getElementById('seguidillaDesde').value = '';
    document.getElementById('seguidillaHasta').value = '';
    document.getElementById('seguidillaTiempos').value = '';
}

function closeSeguidillaModal() {
    document.getElementById('seguidillaModal').style.display = 'none';
}

function addSeguidilla() {
    const desde = parseInt(document.getElementById('seguidillaDesde').value);
    const hasta = parseInt(document.getElementById('seguidillaHasta').value);
    const tiempos = parseInt(document.getElementById('seguidillaTiempos').value);
    const lotteryType = document.getElementById('lotteryType').value;

    if (isNaN(desde) || isNaN(hasta) || isNaN(tiempos)) { showNotification('Por favor complete todos los campos', 'warning'); return; }
    if (desde < 0 || desde > 99 || hasta < 0 || hasta > 99) { showNotification('Los numeros deben estar entre 00 y 99', 'warning'); return; }
    if (desde > hasta) { showNotification('El numero "Desde" debe ser menor o igual al "Hasta"', 'warning'); return; }
    if (tiempos <= 0) { showNotification('Los tiempos deben ser mayor que 0', 'warning'); return; }
    if (!validarHorarioVenta()) {
        const _dtObj2 = getSelectedDrawTimeObj();
        const _cut2 = _dtObj2?.cutoff_minutes_before ?? 1;
        const _blk2 = _dtObj2?.block_minutes_after ?? 20;
        showNotification(`No se pueden agregar numeros. Ventas bloqueadas ${_cut2} min antes y ${_blk2} min despues del sorteo.`, 'warning');
        return;
    }

    let processed = 0;
    let blocked = 0;

    for (let i = desde; i <= hasta; i++) {
        const number = i.toString().padStart(2, '0');
        if (checkLimits(number, tiempos)) {
            const subTotal = calculatePrice(number, tiempos, lotteryType);
            numbers.push({ number, pieces: tiempos, subTotal });
            updateCurrentSales(number, tiempos, true);
            processed++;
        } else {
            blocked++;
        }
    }

    if (processed > 0) {
        updateNumbersList();
        updateTotal();
        let message = `Seguidilla agregada: ${processed} numeros procesados`;
        if (blocked > 0) message += ` (${blocked} bloqueados por limites)`;
        showNotification(message, 'success');
        closeSeguidillaModal();
    } else {
        showNotification('No se pudieron agregar numeros debido a los limites establecidos', 'warning');
    }
}

window.addEventListener('click', function (event) {
    if (event.target === document.getElementById('seguidillaModal')) closeSeguidillaModal();
    if (event.target === document.getElementById('percentageModal')) closePercentageModal();
});

// ==================== CSV ====================
function convertTicketsToCSV(ticketsList) {
    const headers = ['ID', 'Fecha', 'Loteria', 'Hora de sorteo', 'Numero', 'Pedazos', 'Total', 'Pagado'];
    let allRows = [];
    ticketsList.forEach(ticket => {
        const firstRow = [
            ticket.id,
            new Date(ticket.datetime).toLocaleString(),
            ticket.lottery,
            ticket.drawTime || 'N/A',
            ticket.numbers[0] ? ticket.numbers[0].number : '',
            ticket.numbers[0] ? ticket.numbers[0].pieces : '',
            ticket.total.toFixed(2),
            ticket.paid ? 'Si' : 'No',
        ];
        allRows.push(firstRow);
        for (let i = 1; i < ticket.numbers.length; i++) {
            allRows.push(['', '', ticket.lottery, ticket.drawTime || 'N/A', ticket.numbers[i].number, ticket.numbers[i].pieces, '', '']);
        }
    });
    return [headers.join(','), ...allRows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
}

function exportSalesToCSV(dateFilter = null) {
    loadTickets().then(allTickets => {
        if (allTickets.length === 0) { showNotification('No hay ventas para exportar.'); return; }
        let ticketsToExport = allTickets;
        let filename = `ventas_todas_${new Date().toISOString().split('T')[0]}.csv`;
        if (dateFilter) {
            const start = new Date(dateFilter + 'T00:00:00');
            const end = new Date(dateFilter + 'T23:59:59');
            ticketsToExport = allTickets.filter(t => {
                const d = new Date(t.datetime);
                return d >= start && d <= end;
            });
            if (ticketsToExport.length === 0) { showNotification('No hay ventas para la fecha seleccionada.'); return; }
            filename = `ventas_${dateFilter}.csv`;
        }
        const csvContent = convertTicketsToCSV(ticketsToExport);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

// ==================== Expose globals ====================
// All functions need to be accessible from inline onclick handlers
Object.assign(window, {
    checkPassword, logout,
    showMainPage, showSalesPage, showNumberSalesPage, showVerifyWinnersPage, showConfigPage,
    updateDrawTimes, updateFilterDrawTimes, updateWinnerDrawTimes, updateLimitDrawTimes, updateLimitBilleteDrawTimes,
    generateTicket, marcarComoPagado, deleteTicket, copyTicket, viewTicket, closeTicket,
    compartirTicket, captureAndShareScreen, shareReport, toggleScanner, openScannerModal, closeScannerModal,
    searchTickets, showSalesByDate, showTodaySales, onSalesLotteryFilter, displayTickets, deleteSalesByDate, borrarTodasVentas,
    processQuickInput, editPieces, removeNumber,
    applyFilters, switchTab, updateNumberSalesTable, updateBilletesSalesTable,
    checkWinningTickets,
    calculateWinnings, calculateReventadoWinnings, clearPrizeInputs, clearReventadoPrizeInput,
    setGlobalLimit, setIndividualLimit, removeLimitConfig, saveConfigAndReturn, switchLimitTab,
    showPrinterConfig, closePrinterConfig, loadPairedDevices, selectPrinter, printCurrentTicket,
    openPercentageModal, closePercentageModal, saveSellerConfig,
    showCobrosPage, loadCobros, filterCobrosHistorial, clearCobrosFilter,
    showNotification, closeNotification, showConfirm,
    showKeyboard, hideKeyboard, addDigit, deleteDigit, submitNumber,
    toggleMenu, openMenu, closeMenu,
    openSeguidillaModal, closeSeguidillaModal, addSeguidilla,
    exportSalesToCSV,
});

// ==================== Boot ====================
document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        let session = auth.tokenManager.getSession();

        // Si no hay token en memoria, intentar refrescar usando la cookie de sesión
        if (!session?.user) {
            const { data } = await auth.refreshSession();
            if (data?.user) {
                session = { user: data.user };
            }
        }

        if (session?.user) {
            currentUser = session.user;
            await loadProfile();
            if (currentProfile?.is_active === false) {
                await auth.signOut();
                currentUser = null;
                currentProfile = null;
                showLoginPage();
                return;
            }
            await initApp();
            showMainPage();
        } else {
            showLoginPage();
        }
    } catch (e) {
        console.error('Boot error:', e);
        showLoginPage();
    } finally {
        hideLoading();
    }
});

// Exponer funciones sub_admin en scope global para onclick handlers del HTML
window.showMisVendedoresPage       = showMisVendedoresPage;
window.showVentasSubAdminPage      = showVentasSubAdminPage;
window.showCobrosSubAdminPage      = showCobrosSubAdminPage;
window.showNumerosSubAdminPage     = showNumerosSubAdminPage;
window.openCrearVendedorSubAdmin   = openCrearVendedorSubAdmin;
window.openEditarVendedorSubAdmin  = openEditarVendedorSubAdmin;
window.closeSubAdminVendedorModal  = closeSubAdminVendedorModal;
window.guardarVendedorSubAdmin     = guardarVendedorSubAdmin;
window.eliminarVendedorSubAdmin    = eliminarVendedorSubAdmin;
window.loadVentasSubAdmin          = loadVentasSubAdmin;
window.onVentasSALotChange         = onVentasSALotChange;
window.onNumerosSALotChange        = onNumerosSALotChange;
window.loadCobrosSubAdmin          = loadCobrosSubAdmin;
window.loadNumerosSubAdmin         = loadNumerosSubAdmin;
window.verificarGanadoresSA        = verificarGanadoresSA;
window.verDetalleCobroSubAdmin     = verDetalleCobroSubAdmin;
window.cobrosSubAdminBack          = cobrosSubAdminBack;
window.openCobrarSubAdmin          = openCobrarSubAdmin;
window.closeCobrarSubAdminModal    = closeCobrarSubAdminModal;
window.guardarCobrarSubAdmin       = guardarCobrarSubAdmin;
window.eliminarPagoSubAdmin        = eliminarPagoSubAdmin;
window.onSalesDrawTimeFilter       = onSalesDrawTimeFilter;
window.onNumDrawTimeFilter         = onNumDrawTimeFilter;
window.onWinnersDrawTimeFilter     = onWinnersDrawTimeFilter;
