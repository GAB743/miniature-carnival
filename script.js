const API_URL = "https://script.google.com/macros/s/AKfycbzhBtz9ySLMdxbOwNW5sKBXvhzrU-h7OSz6t619C8Yic6D1JxBksk2euiqcPVjerplTwA/exec";

let globalData = { formResponses: [], catalogue: [], treasury: [], delivery: [], mailing: [], templates: [] };

const warningSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-left:5px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
const clockSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
const bankSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="12" rx="2" ry="2"></rect><path d="M2 10l10-8 10 8"></path><line x1="12" y1="14" x2="12" y2="18"></line><line x1="8" y1="14" x2="8" y2="18"></line><line x1="16" y1="14" x2="16" y2="18"></line></svg>`;
const trashSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

const CONDITIONS = [
    { id: "paid", label: "Payment Fully Settled (Paid)", defSubj: "Payment Confirmed: Order #{refNumber}", defBody: "Dear {name},\n\nWe received ₱{amountPaid} for {quantity}x {item} (Ref: {refNumber})." },
    { id: "underpaid", label: "Partial Payment Verified (Underpaid)", defSubj: "Action Required: Partial Payment for #{refNumber}", defBody: "Dear {name},\n\nWe received a partial deposit of ₱{amountPaid} toward your order of {quantity}x {item} (Total Due: ₱{amountDue}).\n\nYou currently have a remaining outstanding balance of ₱{balance}." },
    { id: "overpaid", label: "Excess Payment Verified (Overpaid)", defSubj: "Overpayment Notice: Order #{refNumber}", defBody: "Dear {name},\n\nWe received ₱{amountPaid} which exceeds your due amount. Your overpayment is ₱{balance}." },
    { id: "unpaid", label: "Payment Not Detected (Unpaid)", defSubj: "Reminder: Unpaid Order #{refNumber}", defBody: "Dear {name},\n\nWe have not yet detected payment for {quantity}x {item}." },
    { id: "delivered", label: "Order Handed Over (Delivered)", defSubj: "Order Delivered: #{refNumber}", defBody: "Dear {name},\n\nYour {item} has been delivered to {organization}!" },
    { id: "pending", label: "Delivery Scheduled (Pending)", defSubj: "Delivery Scheduled: #{refNumber}", defBody: "Dear {name},\n\nYour delivery is scheduled." }
];
let activeConditionId = "paid";

// ================= AUTHENTICATION ================= //
window.verifyPin = function() {
    const pin = document.getElementById('officer-pin').value;
    if (!pin) return;
    
    sessionStorage.setItem('officerPin', pin);
    initApp();
}

window.logout = function() {
    sessionStorage.removeItem('officerPin');
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('officer-pin').value = '';
}

function initApp() {
    if (sessionStorage.getItem('officerPin')) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        loadGoogleSheetData();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
}

// Wrapper for all fetch calls to inject PIN automatically and handle errors
async function secureFetch(payloadObj) {
    payloadObj.pin = sessionStorage.getItem('officerPin');
    const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payloadObj),
        headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
    const data = await res.json();
    if (data.status === "error") {
        if(data.message.includes("Unauthorized")) {
            alert("Invalid PIN. Logging you out.");
            logout();
            throw new Error("Unauthorized");
        } else {
            alert("Error: " + data.message);
            throw new Error(data.message);
        }
    }
    return data;
}

// ================= CORE DATA LOAD ================= //
async function loadGoogleSheetData() {
    try {
        const response = await fetch(API_URL);
        globalData = await response.json();
        
        document.getElementById('cat-count-badge').textContent = globalData.catalogue.length;
        document.getElementById('mail-badge').textContent = globalData.mailing.length;
        document.getElementById('tab2-badge').textContent = globalData.treasury.length;
        document.getElementById('tab1-badge').textContent = globalData.formResponses.length;
        
        populateFilters();
        renderLedger();
        renderTreasury();
        renderDelivery();
        renderForms();
        renderCatalogGrid();
        initTemplateEditor();
        renderMailLog();
    } catch (error) { console.error("Error loading data:", error); }
}

window.switchTab = function(tabId, btnElement) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btnElement.classList.add('active');
};

function populateFilters() {
    const orgSelect = document.getElementById('filter-org');
    const itemSelect = document.getElementById('filter-item');
    const delOrgSelect = document.getElementById('filter-delivery-org');
    
    const uniqueOrgs = [...new Set(globalData.formResponses.map(o => o["Organization/ School"]))].filter(Boolean);
    const uniqueItems = [...new Set(globalData.catalogue.map(o => o["Item"]))].filter(Boolean);
    
    orgSelect.innerHTML = '<option value="all">All Organizations</option>';
    delOrgSelect.innerHTML = '<option value="all">All Organizations</option>';
    itemSelect.innerHTML = '<option value="all">All Items</option>';
    
    uniqueOrgs.forEach(org => {
        orgSelect.innerHTML += `<option value="${org}">${org}</option>`;
        delOrgSelect.innerHTML += `<option value="${org}">${org}</option>`;
    });
    
    uniqueItems.forEach(item => {
        itemSelect.innerHTML += `<option value="${item}">${item}</option>`;
    });
}

// ================= TAB 1: LEDGER ================= //
function renderLedger() {
    const tbody = document.getElementById('ledger-body');
    tbody.innerHTML = '';
    
    const filterStatus = document.getElementById('filter-status').value;
    const filterOrg = document.getElementById('filter-org').value;
    const filterItem = document.getElementById('filter-item').value;
    const searchQuery = document.getElementById('search-ledger').value.toLowerCase();

    let statBilled = 0, statCollected = 0, statBalance = 0;
    let cntPaid = 0, cntUnpaid = 0, cntTransit = 0, cntDelivered = 0;

    let compiledLedger = globalData.formResponses.map(order => {
        const ref = order["Reference Number"];
        const qty = Number(order["Quanity"]) || 0;
        const catItem = globalData.catalogue.find(c => c["Item"] === order["Item"]);
        const price = catItem ? Number(catItem["Price"]) : 0;
        const amountDue = qty * price;
        const payments = globalData.treasury.filter(t => t["Reference Number"] == ref);
        const amountPaid = payments.reduce((sum, p) => sum + Number(p["Amount Received"] || 0), 0);
        const balance = amountDue - amountPaid;

        let paymentStatus = "Unpaid";
        if (amountPaid > 0 && balance > 0) paymentStatus = "Underpaid";
        if (amountPaid > 0 && balance === 0) paymentStatus = "Paid";
        if (amountPaid > 0 && balance < 0) paymentStatus = "Overpaid";

        const delRecord = globalData.delivery.find(d => d["Reference Number"] == ref);
        const deliveryStatus = delRecord ? delRecord["Status"] : "Pending Delivery";

        statBilled += amountDue;
        statCollected += amountPaid;
        statBalance += Math.max(0, balance);
        if (paymentStatus === 'Paid' || paymentStatus === 'Overpaid') cntPaid++; else cntUnpaid++;
        if (deliveryStatus === 'Delivered') cntDelivered++; else cntTransit++;

        return { ...order, amountDue, amountPaid, balance, paymentStatus, deliveryStatus, price };
    });

    document.getElementById('stat-billed').textContent = `₱${statBilled.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('stat-orders').textContent = compiledLedger.length;
    document.getElementById('stat-collected').textContent = `₱${statCollected.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('stat-balance').textContent = `₱${statBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById('cnt-paid').textContent = cntPaid;
    document.getElementById('cnt-unpaid').textContent = cntUnpaid;
    document.getElementById('cnt-transit').textContent = cntTransit;
    document.getElementById('cnt-delivered').textContent = cntDelivered;

    compiledLedger = compiledLedger.filter(item => {
        const matchesStatus = filterStatus === 'all' || item.paymentStatus === filterStatus;
        const matchesOrg = filterOrg === 'all' || item["Organization/ School"] === filterOrg;
        const matchesItem = filterItem === 'all' || item["Item"] === filterItem;
        const searchTarget = `${item["Full Name"]} ${item["Email Address"]} ${item["Reference Number"]}`.toLowerCase();
        
        return matchesStatus && matchesOrg && matchesItem && searchTarget.includes(searchQuery);
    });

    document.getElementById('record-count').textContent = `Showing ${compiledLedger.length} of ${globalData.formResponses.length} records`;

    if (compiledLedger.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No matching records found.</td></tr>';
        return;
    }

    compiledLedger.forEach(row => {
        let payBg = "#ffe4e6", payCol = "#be123c", payBdr = "#fecdd3", payIcon = warningSvg;
        if (row.paymentStatus === 'Paid') { payBg = "#d1fae5"; payCol = "#047857"; payBdr = "#a7f3d0"; payIcon = ""; }
        if (row.paymentStatus === 'Underpaid') { payBg = "#fef3c7"; payCol = "#b45309"; payBdr = "#fde68a"; payIcon = clockSvg; }
        if (row.paymentStatus === 'Overpaid') { payBg = "#e0f2fe"; payCol = "#0369a1"; payBdr = "#bae6fd"; payIcon = ""; }
        let balColor = row.balance > 0 ? "#be123c" : (row.balance === 0 ? "#047857" : "#0369a1");
        
        let delBg = row.deliveryStatus === 'Delivered' ? "#d1fae5" : "white";
        let delCol = row.deliveryStatus === 'Delivered' ? "#047857" : "#d97706";

        // EXPLICITLY LOOK FOR EXACT FORM HEADERS FOR SIZES
        let size = row["Size(T-shirt)"] || row["Size (T-shirt)"] || row["Sizes"] || row["Size"] || "";
        let displayItem = size ? `${row["Item"]} (${size})` : row["Item"];

        tbody.innerHTML += `
            <tr>
                <td><strong style="color:#111827;">${row["Full Name"] || '-'}</strong><br><span style="font-size:0.9em; color:#6b7280;">${row["Email Address"] || '-'}</span><br><span style="font-size:0.9em; color:#047857; font-weight:600;">${row["Organization/ School"] || '-'}</span></td>
                <td><div style="background:#f3f4f6; padding:6px 10px; border-radius:6px; border:1px solid #e5e7eb; display:inline-block; font-size:0.95em;"><span style="color:#111827;">${displayItem || '-'} × ${row["Quanity"] || 0}</span><br><span style="color:#6b7280; font-size:0.9em;">@₱${row.price.toFixed(2)} each</span></div></td>
                <td style="font-weight:700;">${row["Reference Number"] || '-'}</td>
                <td style="font-weight:600;">₱${row.amountDue.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="color:#047857; font-weight:700;">₱${row.amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td><span class="pill" style="background:${payBg}; color:${payCol}; border-color:${payBdr};">${payIcon} ${row.paymentStatus}</span></td>
                <td><span class="pill" style="background:${delBg}; color:${delCol}; border-color:#f59e0b;">${clockSvg} ${row.deliveryStatus}</span></td>
                <td style="color:${balColor}; font-weight:700;">₱${row.balance.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td>
                    <button class="icon-btn" style="border:none; background:transparent;" onclick="openPaymentModal(this)" 
                        data-ref="${row["Reference Number"] || ''}" 
                        data-name="${(row["Full Name"] || '').replace(/"/g, '&quot;')}" 
                        data-item="${(displayItem || '').replace(/"/g, '&quot;')}" 
                        data-balance="${row.balance}">
                        ${bankSvg}
                    </button>
                </td>
            </tr>
        `;
    });
}

function renderTreasury() {
    const tbody = document.getElementById('treasury-body');
    tbody.innerHTML = '';
    document.getElementById('treasury-count').textContent = globalData.treasury.length;

    if (globalData.treasury.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No payments logged.</td></tr>`; return; }

    globalData.treasury.forEach(row => {
        let isMatched = globalData.formResponses.some(f => f["Reference Number"] == row["Reference Number"]);
        let matchPill = isMatched ? `<span style="color:#047857; background:#d1fae5; padding:4px 10px; border-radius:12px; font-size:0.85em; font-weight:600;">Matched</span>` : `<span style="color:#be123c; background:#ffe4e6; padding:4px 10px; border-radius:12px; font-size:0.85em; font-weight:600;">Unmatched</span>`;
        tbody.innerHTML += `
            <tr>
                <td><strong style="color:#111827;">${row["Reference Number"] || '-'}</strong></td>
                <td style="color:#047857; font-weight:700;">₱${Number(row["Amount Received"] || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td>${row["Payment Channel"] || '-'}</td>
                <td style="color:#6b7280;">${row["Verification Info"] || '-'}</td>
                <td>${matchPill}</td>
                <td><button class="icon-btn danger" style="border:none; background:transparent;" onclick="deleteTreasuryRow('${row["Reference Number"]}', ${row["Amount Received"]})">${trashSvg}</button></td>
            </tr>
        `;
    });
}

// ================= TAB 3: MAILING ================= //
window.toggleTemplateEditor = function() {
    const ed = document.getElementById('template-editor');
    ed.style.display = (ed.style.display === 'none' || ed.style.display === '') ? 'block' : 'none';
}

function initTemplateEditor() {
    const grid = document.getElementById('condition-pills');
    grid.innerHTML = '';
    CONDITIONS.forEach(cond => {
        const btn = document.createElement('button');
        btn.className = `status-pill ${cond.id === activeConditionId ? 'active' : ''}`;
        btn.textContent = cond.label;
        btn.onclick = () => { activeConditionId = cond.id; initTemplateEditor(); };
        grid.appendChild(btn);
    });
    const cond = CONDITIONS.find(c => c.id === activeConditionId);
    document.getElementById('tpl-active-name').textContent = cond.label;
    
    const saved = globalData.templates.find(t => t["Case"] === cond.label);
    document.getElementById('tpl-subject').value = saved ? saved["Email Subject"] : cond.defSubj;
    document.getElementById('tpl-body').value = saved ? saved["Email Content"] : cond.defBody;
}

window.insertToken = function(token) {
    const textarea = document.getElementById('tpl-body');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + token + text.substring(end);
    textarea.focus();
}

window.resetTemplate = function() {
    const cond = CONDITIONS.find(c => c.id === activeConditionId);
    document.getElementById('tpl-subject').value = cond.defSubj;
    document.getElementById('tpl-body').value = cond.defBody;
}

window.saveTemplate = function() {
    const cond = CONDITIONS.find(c => c.id === activeConditionId);
    const subj = document.getElementById('tpl-subject').value;
    const body = document.getElementById('tpl-body').value;
    
    let existing = globalData.templates.find(t => t["Case"] === cond.label);
    if(existing) { existing["Email Subject"] = subj; existing["Email Content"] = body; }
    else { globalData.templates.push({"Case": cond.label, "Email Subject": subj, "Email Content": body}); }

    secureFetch({ action: "save_template", condition: cond.label, subject: subj, body: body })
        .then(() => alert("Template Saved to Sheets!"));
}

function parseTemplate(templateString, orderData) {
    let parsed = templateString;
    parsed = parsed.replace(/\{name\}/g, orderData.name);
    parsed = parsed.replace(/\{item\}/g, orderData.item);
    parsed = parsed.replace(/\{quantity\}/g, orderData.qty);
    parsed = parsed.replace(/\{amountDue\}/g, orderData.amountDue);
    parsed = parsed.replace(/\{amountPaid\}/g, orderData.amountPaid);
    parsed = parsed.replace(/\{balance\}/g, orderData.balance);
    parsed = parsed.replace(/\{refNumber\}/g, orderData.ref);
    parsed = parsed.replace(/\{organization\}/g, orderData.org);
    return parsed;
}

function renderMailLog() {
    const tbody = document.getElementById('mailing-body');
    tbody.innerHTML = '';
    const query = document.getElementById('search-mail').value.toLowerCase();
    const statusFilter = document.getElementById('filter-mail-status').value;

    let filtered = globalData.mailing.filter(m => {
        const textMatch = `${m["Recipient & Organization"]} ${m["Order Ref & Item"]}`.toLowerCase().includes(query);
        const statusMatch = statusFilter === 'all' || m["Dispatch Status"] === statusFilter;
        return textMatch && statusMatch;
    });

    document.getElementById('mail-count-total').textContent = filtered.length;
    if(filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No mail notification records.</td></tr>`; return; }

    filtered.forEach(row => {
        let statusColor = row["Dispatch Status"] === "Sent" ? "#047857" : "#d97706";
        let statusBg = row["Dispatch Status"] === "Sent" ? "#d1fae5" : "#fef3c7";
        
        let rawRef = (row["Order Ref & Item"]||'').split('|')[0].trim();
        let recipientName = (row["Recipient & Organization"]||'').split('|')[0].trim();
        let conditionName = row["Status Transition"];

        tbody.innerHTML += `
            <tr>
                <td><strong>${recipientName}</strong><br><span style="font-size:0.85em; color:var(--text-muted);">${(row["Recipient & Organization"]||'').split('|')[1] || ''}</span></td>
                <td><strong>${rawRef}</strong><br><span style="font-size:0.85em; color:var(--text-muted);">${(row["Order Ref & Item"]||'').split('|')[1] || ''}</span></td>
                <td><span style="background:#e0e7ff; color:var(--indigo-primary); padding:4px 8px; border-radius:4px; font-size:0.85em; font-weight:600;">${conditionName}</span></td>
                <td style="font-size:0.9em; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${row["Subject Preview"]}</td>
                <td><span style="background:${statusBg}; color:${statusColor}; padding:4px 8px; border-radius:12px; font-size:0.85em; font-weight:600;">${row["Dispatch Status"]}</span></td>
                <td>
                    <button class="btn" style="font-size:0.75em; padding:4px 8px; background:white; color:var(--text-dark); border:1px solid var(--border-color);" 
                            onclick="openEmailModal(this)"
                            data-ref="${rawRef}"
                            data-cond="${conditionName}">
                        Send
                    </button>
                </td>
            </tr>
        `;
    });
}

// EMAIL DISPATCH MODAL LOGIC
let currentEmailPayload = { subject: "", body: "", to: "", recipientInfo: "", orderInfo: "", condition: "" };

window.openEmailModal = function(btnElement) {
    const ref = btnElement.getAttribute('data-ref');
    const conditionName = btnElement.getAttribute('data-cond');
    
    const orderData = globalData.formResponses.find(o => o["Reference Number"] == ref);
    if(!orderData) { alert("Source order data not found."); return; }

    const qty = Number(orderData["Quanity"]) || 0;
    const catItem = globalData.catalogue.find(c => c["Item"] === orderData["Item"]);
    const price = catItem ? Number(catItem["Price"]) : 0;
    const amountDue = qty * price;
    const payments = globalData.treasury.filter(t => t["Reference Number"] == ref);
    const amountPaid = payments.reduce((sum, p) => sum + Number(p["Amount Received"] || 0), 0);
    
    // EXPLICITLY LOOK FOR EXACT FORM HEADERS FOR SIZES
    let size = orderData["Size(T-shirt)"] || orderData["Size (T-shirt)"] || orderData["Sizes"] || orderData["Size"] || "";
    let displayItem = size ? `${orderData["Item"]} (${size})` : orderData["Item"];

    const contextData = {
        name: orderData["Full Name"],
        item: displayItem, // Uses the updated string with size
        qty: qty,
        amountDue: amountDue.toLocaleString('en-US', {minimumFractionDigits: 2}),
        amountPaid: amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2}),
        balance: (amountDue - amountPaid).toLocaleString('en-US', {minimumFractionDigits: 2}),
        ref: ref,
        org: orderData["Organization/ School"]
    };

    let saved = globalData.templates.find(t => t["Case"] === conditionName);
    let defaultCond = CONDITIONS.find(c => c.label === conditionName) || CONDITIONS[0];
    
    let rawSubj = saved ? saved["Email Subject"] : defaultCond.defSubj;
    let rawBody = saved ? saved["Email Content"] : defaultCond.defBody;

    currentEmailPayload.subject = parseTemplate(rawSubj, contextData);
    currentEmailPayload.body = parseTemplate(rawBody, contextData);
    currentEmailPayload.to = orderData["Email Address"];
    currentEmailPayload.recipientInfo = `${orderData["Full Name"]} | ${orderData["Email Address"]}`;
    currentEmailPayload.orderInfo = `${ref} | ${displayItem}`; 
    currentEmailPayload.condition = conditionName;

    document.getElementById('email-modal-name').textContent = contextData.name;
    document.getElementById('email-modal-ref').textContent = contextData.ref;
    document.getElementById('email-modal-address').textContent = currentEmailPayload.to;
    document.getElementById('email-modal-subject').textContent = currentEmailPayload.subject;
    document.getElementById('email-modal-body').textContent = currentEmailPayload.body;

    document.getElementById('email-modal').style.display = 'flex';
}

window.sendMailViaGoogle = function() {
    const btn = document.getElementById('btn-send-mail');
    btn.textContent = "Sending...";
    btn.disabled = true;

    secureFetch({
        action: "send_email",
        to: currentEmailPayload.to,
        subject: currentEmailPayload.subject,
        body: currentEmailPayload.body,
        recipientInfo: currentEmailPayload.recipientInfo,
        orderInfo: currentEmailPayload.orderInfo,
        condition: currentEmailPayload.condition
    })
    .then(() => {
        alert("Email sent successfully!");
        closeModal('email-modal');
        loadGoogleSheetData(); 
    })
    .finally(() => {
        btn.textContent = "Send Mail (via Google)";
        btn.disabled = false;
    });
}

window.copyFullEmail = function() {
    navigator.clipboard.writeText(`To: ${currentEmailPayload.to}\nSubject: ${currentEmailPayload.subject}\n\n${currentEmailPayload.body}`);
    alert("Full email details copied to clipboard!");
}

window.scanMissingEmails = function() {
    const btn = document.getElementById('btn-scan-emails');
    btn.textContent = "Scanning...";
    btn.disabled = true;

    const statusMap = {
        "Paid": "Payment Fully Settled (Paid)",
        "Underpaid": "Partial Payment Verified (Underpaid)",
        "Overpaid": "Excess Payment Verified (Overpaid)",
        "Delivered": "Order Handed Over (Delivered)"
    };

    let newEmails = [];

    let compiledLedger = globalData.formResponses.map(order => {
        const ref = order["Reference Number"];
        const qty = Number(order["Quanity"]) || 0;
        const catItem = globalData.catalogue.find(c => c["Item"] === order["Item"]);
        const price = catItem ? Number(catItem["Price"]) : 0;
        const amountDue = qty * price;
        const payments = globalData.treasury.filter(t => t["Reference Number"] == ref);
        const amountPaid = payments.reduce((sum, p) => sum + Number(p["Amount Received"] || 0), 0);
        const balance = amountDue - amountPaid;

        let paymentStatus = "Unpaid";
        if (amountPaid > 0 && balance > 0) paymentStatus = "Underpaid";
        if (amountPaid > 0 && balance === 0) paymentStatus = "Paid";
        if (amountPaid > 0 && balance < 0) paymentStatus = "Overpaid";

        const delRecord = globalData.delivery.find(d => d["Reference Number"] == ref);
        const deliveryStatus = delRecord ? delRecord["Status"] : "Pending Delivery";

        return { ...order, paymentStatus, deliveryStatus };
    });

    compiledLedger.forEach(order => {
        const ref = order["Reference Number"];
        const recipientInfo = `${order["Full Name"]} | ${order["Email Address"]}`;

        // EXPLICITLY LOOK FOR EXACT FORM HEADERS FOR SIZES
        let size = order["Size(T-shirt)"] || order["Size (T-shirt)"] || order["Sizes"] || order["Size"] || "";
        let displayItem = size ? `${order["Item"]} (${size})` : order["Item"];
        const orderInfo = `${ref} | ${displayItem}`;

        if (order.paymentStatus !== "Unpaid") {
            let cond = statusMap[order.paymentStatus];
            let alreadyQueued = globalData.mailing.some(m => (m["Order Ref & Item"] || "").includes(ref) && m["Status Transition"] === cond);
            if (!alreadyQueued) {
                newEmails.push({ recipientInfo: recipientInfo, orderInfo: orderInfo, statusTransition: cond, preview: `Auto-Detected Payment: ${ref}`, status: "Pending" });
            }
        }
        if (order.deliveryStatus === "Delivered") {
            let cond = statusMap[order.deliveryStatus];
            let alreadyQueued = globalData.mailing.some(m => (m["Order Ref & Item"] || "").includes(ref) && m["Status Transition"] === cond);
            if (!alreadyQueued) {
                newEmails.push({ recipientInfo: recipientInfo, orderInfo: orderInfo, statusTransition: cond, preview: `Auto-Detected Delivery: ${ref}`, status: "Pending" });
            }
        }
    });

    if (newEmails.length === 0) {
        alert("No missing emails found! Everything is up to date.");
        btn.textContent = "🔍 Scan Sheets for Missing Emails";
        btn.disabled = false;
        return;
    }

    if(!confirm(`Found ${newEmails.length} missing email notifications from manually pasted data. Queue them now?`)) {
        btn.textContent = "🔍 Scan Sheets for Missing Emails";
        btn.disabled = false;
        return;
    }

    secureFetch({ action: "batch_queue_emails", emails: newEmails })
    .then(() => {
        alert(`Successfully queued ${newEmails.length} emails!`);
        loadGoogleSheetData();
    })
    .finally(() => {
        btn.textContent = "🔍 Scan Sheets for Missing Emails";
        btn.disabled = false;
    });
}

// ================= TAB 4: DELIVERY ================= //
function renderDelivery() {
    const tbody = document.getElementById('delivery-body');
    tbody.innerHTML = '';
    const query = document.getElementById('search-delivery').value.toLowerCase();
    const filterOrg = document.getElementById('filter-delivery-org').value;

    let filtered = globalData.formResponses.filter(item => {
        const matchesOrg = filterOrg === 'all' || item["Organization/ School"] === filterOrg;
        const searchTarget = `${item["Full Name"]} ${item["Reference Number"]}`.toLowerCase();
        return matchesOrg && searchTarget.includes(query);
    });

    if (filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>`; return; }

    filtered.forEach(row => {
        const ref = row["Reference Number"];
        const deliveryLog = globalData.delivery.find(d => d["Reference Number"] == ref);
        const currentStatus = deliveryLog ? deliveryLog["Status"] : "Pending Delivery";

        let delBg = currentStatus === 'Delivered' ? "#d1fae5" : "white";
        let delCol = currentStatus === 'Delivered' ? "#047857" : "#d97706";

        tbody.innerHTML += `
            <tr>
                <td><strong>${ref || '-'}</strong></td>
                <td>${row["Full Name"] || '-'}</td>
                <td>${row["Organization/ School"] || '-'}</td>
                <td><span class="pill" style="background:${delBg}; color:${delCol}; border-color:#f59e0b;">${currentStatus}</span></td>
                <td>
                    ${currentStatus !== 'Delivered' ? 
                    `<button class="btn" style="font-size:0.8em; padding:6px 12px;" onclick="updateDelivery(this)" data-ref="${ref}" data-name="${(row["Full Name"] || '').replace(/"/g, '&quot;')}">Mark Delivered</button>` : 
                    `<span style="color:gray; font-size:0.8em;">Completed</span>`}
                </td>
            </tr>
        `;
    });
}

window.updateDelivery = function(btnElement) {
    const ref = btnElement.getAttribute('data-ref');
    const name = btnElement.getAttribute('data-name');
    if(!confirm(`Mark order for ${name} (Ref: ${ref}) as Delivered?`)) return;
    
    const orderData = globalData.formResponses.find(o => o["Reference Number"] == ref);
    const recipientInfo = orderData ? `${orderData["Full Name"]} | ${orderData["Email Address"]}` : `${name} | Unknown`;
    
    // EXPLICITLY LOOK FOR EXACT FORM HEADERS FOR SIZES
    let size = orderData ? (orderData["Size(T-shirt)"] || orderData["Size (T-shirt)"] || orderData["Sizes"] || orderData["Size"] || "") : "";
    let displayItem = orderData ? (size ? `${orderData["Item"]} (${size})` : orderData["Item"]) : "Unknown";
    const orderInfo = `${ref} | ${displayItem}`;

    secureFetch({ 
        action: "update_delivery", 
        refNumber: ref, 
        buyerName: name, 
        status: "Delivered",
        recipientInfo: recipientInfo,
        orderInfo: orderInfo,
        statusTransition: "Order Handed Over (Delivered)"
    }).then(() => loadGoogleSheetData());
}

function renderForms() {
    const tbody = document.getElementById('forms-body');
    tbody.innerHTML = '';
    globalData.formResponses.forEach(row => {
        
        // EXPLICITLY LOOK FOR EXACT FORM HEADERS FOR SIZES
        let size = row["Size(T-shirt)"] || row["Size (T-shirt)"] || row["Sizes"] || row["Size"] || "";
        let displayItem = size ? `${row["Item"]} (${size})` : row["Item"];
        
        tbody.innerHTML += `<tr>
            <td>${new Date(row["Timestamp"]).toLocaleDateString()}</td>
            <td>${row["Email Address"]}</td>
            <td>${row["Full Name"]}</td>
            <td>${row["Organization/ School"]}</td>
            <td>${displayItem}</td>
            <td>${row["Quanity"]}</td>
            <td>${row["Reference Number"]}</td>
        </tr>`;
    });
}

window.toggleCatalogManager = function() {
    const cat = document.getElementById('catalog-manager');
    cat.style.display = (cat.style.display === 'none' || cat.style.display === '') ? 'block' : 'none';
}

function renderCatalogGrid() {
    const grid = document.getElementById('catalog-grid');
    grid.innerHTML = '';
    globalData.catalogue.forEach(item => {
        grid.innerHTML += `
            <div class="cat-item-card">
                <div class="form-group" style="margin-bottom:10px;">
                    <label style="font-size:0.75em; color:var(--text-muted); text-transform:uppercase;">Item Name</label>
                    <input type="text" class="form-control" value="${item["Item"]}" readonly style="background:#f9fafb;">
                </div>
                <div class="form-group" style="margin-bottom:0; display:flex; gap:10px; align-items:flex-end;">
                    <div style="flex:1;">
                        <label style="font-size:0.75em; color:var(--text-muted); text-transform:uppercase;">Unit Price (₱)</label>
                        <div style="display:flex; align-items:center; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; padding-left:10px;">
                            <span style="color:#6b7280; font-size:0.9em;">₱</span>
                            <input type="text" class="form-control" value="${item["Price"]}" readonly style="border:none; background:transparent;">
                        </div>
                    </div>
                    <button class="icon-btn danger" style="border:none; padding:10px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px;" onclick="deleteCatalogItem(this)" data-item="${(item["Item"]||'').replace(/"/g, '&quot;')}">
                        ${trashSvg}
                    </button>
                </div>
            </div>
        `;
    });
}

window.addCatalogItem = function() {
    const name = document.getElementById('new-cat-name').value;
    const price = document.getElementById('new-cat-price').value;
    const btn = document.getElementById('btn-add-cat');
    if(!name || !price) return alert("Item Name and Price are required.");
    btn.textContent = "Adding..."; btn.disabled = true;
    
    secureFetch({ action: "add_catalog", item: name, price: price })
    .then(() => {
        document.getElementById('new-cat-name').value = "";
        document.getElementById('new-cat-price').value = "";
        btn.textContent = "+ Add to Catalog"; btn.disabled = false;
        loadGoogleSheetData();
    });
}

window.deleteCatalogItem = function(btnElement) {
    const itemName = btnElement.getAttribute('data-item');
    if(!confirm(`Remove ${itemName} from the Price Catalog?`)) return;
    secureFetch({ action: "delete_catalog", item: itemName }).then(() => loadGoogleSheetData());
}

window.openPaymentModal = function(btnElement) {
    let ref = "", name = "", item = "", balance = "";
    if(btnElement && btnElement.getAttribute) {
        ref = btnElement.getAttribute('data-ref') || "";
        name = btnElement.getAttribute('data-name') || "";
        item = btnElement.getAttribute('data-item') || "";
        balance = btnElement.getAttribute('data-balance') || "";
    }
    document.getElementById('payment-modal').style.display = 'flex';
    document.getElementById('modal-ref').value = ref;
    document.getElementById('modal-amount').value = balance > 0 ? balance : "";
    document.getElementById('modal-notes').value = name ? `Verified full settlement for ${name} (${item})` : "";
    document.getElementById('modal-ref').readOnly = (ref !== "");
    document.getElementById('modal-ref').style.background = (ref !== "") ? "#f3f4f6" : "white";
}

window.closeModal = function(modalId) { document.getElementById(modalId).style.display = 'none'; }

window.submitPayment = function() {
    const ref = document.getElementById('modal-ref').value;
    const amount = document.getElementById('modal-amount').value;
    const channel = document.getElementById('modal-channel').value;
    const verifier = document.getElementById('modal-verifier').value;
    const notesBase = document.getElementById('modal-notes').value;
    const btn = document.getElementById('modal-submit');
    
    if (!ref || !amount || amount <= 0) return alert("Valid Reference Number and Amount required.");
    btn.textContent = "Processing..."; btn.disabled = true;
    
    const orderData = globalData.formResponses.find(o => o["Reference Number"] == ref);
    const recipientInfo = orderData ? `${orderData["Full Name"]} | ${orderData["Email Address"]}` : "Unknown | Unknown";
    
    // EXPLICITLY LOOK FOR EXACT FORM HEADERS FOR SIZES
    let size = orderData ? (orderData["Size(T-shirt)"] || orderData["Size (T-shirt)"] || orderData["Sizes"] || orderData["Size"] || "") : "";
    let displayItem = orderData ? (size ? `${orderData["Item"]} (${size})` : orderData["Item"]) : "Unknown";
    const orderInfo = `${ref} | ${displayItem}`;

    const prevPayments = globalData.treasury.filter(t => t["Reference Number"] == ref).reduce((sum, p) => sum + Number(p["Amount Received"] || 0), 0);
    const qty = orderData ? Number(orderData["Quanity"]) : 0;
    const catItem = orderData ? globalData.catalogue.find(c => c["Item"] === orderData["Item"]) : null;
    const amountDue = qty * (catItem ? Number(catItem["Price"]) : 0);
    const newTotal = prevPayments + Number(amount);
    
    let statusTransition = "Payment Not Detected (Unpaid)";
    if(newTotal > 0 && newTotal < amountDue) statusTransition = "Partial Payment Verified (Underpaid)";
    if(newTotal > 0 && newTotal === amountDue) statusTransition = "Payment Fully Settled (Paid)";
    if(newTotal > amountDue) statusTransition = "Excess Payment Verified (Overpaid)";

    secureFetch({ 
        action: "log_payment", refNumber: ref, amount: amount, channel: channel, notes: `[${verifier}] ${notesBase}`,
        recipientInfo: recipientInfo, orderInfo: orderInfo, statusTransition: statusTransition
    }).then(() => { 
        closeModal('payment-modal'); 
        loadGoogleSheetData(); 
        btn.textContent = "Confirm & Validate Deposit"; btn.disabled = false; 
    });
}

window.deleteTreasuryRow = function(ref, amount) {
    if(!confirm(`Delete treasury record for Ref: ${ref} (₱${amount})?`)) return;
    secureFetch({ action: "delete_treasury", refNumber: ref, amount: amount }).then(() => loadGoogleSheetData());
}

window.syncDashboardToSheet = async function() {
    const btn = document.getElementById('sync-btn');
    btn.textContent = "Syncing & Refreshing...";
    btn.disabled = true;

    const syncData = globalData.formResponses.map(order => {
        const ref = order["Reference Number"];
        const qty = Number(order["Quanity"]) || 0;
        const price = (globalData.catalogue.find(c => c["Item"] === order["Item"]) || {Price: 0}).Price;
        const amountDue = qty * price;
        const amountPaid = globalData.treasury.filter(t => t["Reference Number"] == ref).reduce((sum, p) => sum + Number(p["Amount Received"] || 0), 0);
        const balance = amountDue - amountPaid;
        let paymentStatus = "Unpaid";
        if (amountPaid > 0 && balance > 0) paymentStatus = "Underpaid";
        if (amountPaid > 0 && balance === 0) paymentStatus = "Paid";
        if (amountPaid > 0 && balance < 0) paymentStatus = "Overpaid";
        const delRecord = globalData.delivery.find(d => d["Reference Number"] == ref);
        const deliveryStatus = delRecord ? delRecord["Status"] : "Pending Delivery";

        // EXPLICITLY LOOK FOR EXACT FORM HEADERS FOR SIZES
        let size = order["Size(T-shirt)"] || order["Size (T-shirt)"] || order["Sizes"] || order["Size"] || "";
        let displayItem = size ? `${order["Item"]} (${size})` : order["Item"];

        return [ order["Full Name"] || "-", order["Organization/ School"] || "-", `${displayItem} x ${order["Quanity"]}`, ref, amountDue, amountPaid, paymentStatus, deliveryStatus ];
    });

    try {
        await secureFetch({ action: "sync_dashboard", data: syncData });
        await loadGoogleSheetData(); 
        alert("Dashboard Synced and App Refreshed!");
    } catch (err) {
        // secureFetch handles the alert
    } finally {
        btn.textContent = "Sync Ledger & Refresh App";
        btn.disabled = false;
    }
}

window.addEventListener('DOMContentLoaded', initApp);
