const { jsPDF } = window.jspdf;
localforage.config({ name: 'ElecnorApp_v24', storeName: 'inspecciones_db' });

function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}



function calcularEquiposUnicos(allReports) {
    const uniqueEquip = {};
    allReports.forEach(ins => {
        const baseId = ins.id.split('-R')[0];
        const sub = ins.subDisciplina || 'MEC';
        const uniqueKey = `${ins.disciplina}-${sub}-${baseId}`;
        const rev = ins.revision || 0;
        if (!uniqueEquip[uniqueKey] || rev >= (uniqueEquip[uniqueKey].revision || 0)) uniqueEquip[uniqueKey] = ins;
    });
    return Object.values(uniqueEquip);
}

function calcularKPIs(uniqueList) {
    let stOk = 0, stNok = 0, stInc = 0;
    uniqueList.forEach(ins => {
        if (!ins.checklist) return;
        const hasPend = ins.checklist.some(c => c.estado === 'PENDIENTE');
        const hasNok = ins.checklist.some(c => c.estado === 'NOK');
        if (hasPend) stInc++;
        else if (hasNok) stNok++;
        else stOk++;
    });
    return { stOk, stNok, stInc, total: uniqueList.length };
}

function calcularRitmo7Dias(uniqueList) {
    const hace7DiasObj = new Date();
    hace7DiasObj.setDate(hace7DiasObj.getDate() - 7);
    const fechaLimite = hace7DiasObj.toISOString().split('T')[0];
    let aprobadosSemana = 0;
    uniqueList.forEach(ins => {
        if (!ins.checklist) return;
        const isOk = !ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE');
        if (isOk && fechaGte(ins.fecha, fechaLimite)) aprobadosSemana++;
    });
    return { ritmoDiario: aprobadosSemana / 7, aprobadosSemana };
}

function parseFecha(str) {
    if (!str) return null;
    const partes = str.split('-').map(Number);
    if (partes.length !== 3) return null;
    return new Date(partes[0], partes[1] - 1, partes[2]);
}
function fechaGte(a, b) {
    const da = parseFecha(a), db = parseFecha(b);
    if (!da || !db) return false;
    return da >= db;
}
function fechaLte(a, b) {
    const da = parseFecha(a), db = parseFecha(b);
    if (!da || !db) return false;
    return da <= db;
}

let chartTendencia = null, chartZonas = null, chartDoughnut = null, chartSuper = null, chartDefMEC = null, chartDefCIV = null, chartDefELE = null;
let listSortCol = 'idInterno'; let listSortDir = -1; let listPage = 1; let listPerPage = 25; let listLastFiltered = [];

async function initApp() {
    const savedConfig = await localforage.getItem('config_pdf');
    if (savedConfig) {
        // Recuperamos los datos básicos
        configGeneral.proyecto = savedConfig.proyecto || configGeneral.proyecto;
        configGeneral.cliente = savedConfig.cliente || configGeneral.cliente;
        configGeneral.logo = savedConfig.logo || configGeneral.logo;
        
        // Recuperamos las metas de obra de forma inteligente sin machacar con ceros
        if (savedConfig.baselines) {
            Object.keys(configGeneral.baselines).forEach(key => {
                if (savedConfig.baselines[key]) {
                    configGeneral.baselines[key] = savedConfig.baselines[key];
                }
            });
        }
        
        if(configGeneral.logo) { 
            document.querySelectorAll('.img-logo-elecnor').forEach(img => { 
                img.src = configGeneral.logo; 
                img.style.display = 'block'; 
            }); 
        }
    }
    irInicio(); renderListado(); initAnotacion(); 
}
function abrirAjustes() {
    document.getElementById('conf-proyecto').value = configGeneral.proyecto || "";
    document.getElementById('conf-cliente').value = configGeneral.cliente || "";
    Object.keys(subMap).forEach(key => {
        const bdKey = subMap[key];
        if (!configGeneral.baselines[bdKey]) configGeneral.baselines[bdKey] = [0,0,0,0,0];
        for(let i=0; i<5; i++) {
            const inputEl = document.getElementById(`b-${bdKey}-${i}`);
            if(inputEl) inputEl.value = configGeneral.baselines[bdKey][i] || 0;
        }
    });
    if(configGeneral.logo) { document.getElementById('conf-logo-preview').src = configGeneral.logo; document.getElementById('conf-logo-preview').style.display = 'inline-block'; }
    document.getElementById('modalAjustes').style.display = 'flex';
}

function cargarLogoAjustes(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('conf-logo-preview');
            preview.src = e.target.result;
            preview.style.display = 'inline-block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function guardarAjustes() {
    configGeneral.proyecto = document.getElementById('conf-proyecto').value;
    configGeneral.cliente = document.getElementById('conf-cliente').value;
    Object.keys(subMap).forEach(key => {
        const bdKey = subMap[key];
        for(let i=0; i<5; i++) {
            const inputEl = document.getElementById(`b-${bdKey}-${i}`);
            if(inputEl) configGeneral.baselines[bdKey][i] = parseInt(inputEl.value) || 0;
        }
    });
    const preview = document.getElementById('conf-logo-preview');
    if(preview.src && preview.src.startsWith('data:image')) configGeneral.logo = preview.src;
    await localforage.setItem('config_pdf', configGeneral);
    document.getElementById('modalAjustes').style.display = 'none';
}

function abrirAuthDashboard() { document.getElementById('input-pin').value = ''; document.getElementById('modalAuth').style.display = 'flex'; }
async function verificarPin() { 
    const pinIngresado = document.getElementById('input-pin').value;
    let pinGuardado = await localforage.getItem('dash_pin_hash');
    if (!pinGuardado) {
        pinGuardado = await sha256("2013");
        await localforage.setItem('dash_pin_hash', pinGuardado);
    }
    const hashIngresado = await sha256(pinIngresado);
    if (hashIngresado === pinGuardado) { 
        document.getElementById('modalAuth').style.display = 'none'; 
        renderDashboard(); 
    } else alert("PIN Incorrecto."); 
}



async function renderDashboard() {
    document.getElementById('portada').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';

    const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('dash-fecha').innerText = today;
    const projTitle = document.getElementById('dash-proyecto-title');
    if (projTitle) projTitle.innerText = (configGeneral.proyecto || 'PROYECTO') + ' — ' + (configGeneral.cliente || '');

    const fZona = document.getElementById('dash-filtro-zona').value;
    const fDisc = document.getElementById('dash-filtro-disc').value;
    const fDesde = document.getElementById('dash-filtro-desde').value;
    const fHasta = document.getElementById('dash-filtro-hasta').value;

    const dataObj = await localforage.getItem('inspecciones_data') || {};
    let allReports = Object.values(dataObj);

    allReports = allReports.filter(ins => {
        if (fZona !== 'TODOS' && ins.zona !== fZona) return false;
        if (fDisc !== 'TODOS' && ins.disciplina !== fDisc) return false;
        if (fDesde && ins.fecha < fDesde) return false;
        if (fHasta && ins.fecha > fHasta) return false;
        return true;
    });

    const uniqueList = calcularEquiposUnicos(allReports);

    const kpi = calcularKPIs(uniqueList);
    let stOk = kpi.stOk, stNok = kpi.stNok, stInc = kpi.stInc;

    const defectMEC = {}, defectCIV = {}, defectELE = {};

    uniqueList.forEach(ins => {
        if (ins.checklist) {
            ins.checklist.forEach(c => {
                if (c.estado === 'NOK') {
                    const defKey = `${c.titulo.replace(/^Poste \d+ - |^Vano \d+-\d+: /, '').substring(0, 40)}`;
                    if (ins.disciplina === 'MEC') defectMEC[defKey] = (defectMEC[defKey] || 0) + 1;
                    if (ins.disciplina === 'CIV') defectCIV[defKey] = (defectCIV[defKey] || 0) + 1;
                    if (ins.disciplina === 'ELE') defectELE[defKey] = (defectELE[defKey] || 0) + 1;
                }
            });
        }
    });

    // Recalculate supervisor OK counts correctly
    const supOkCounts = {};
    uniqueList.forEach(ins => {
        if (!ins.checklist) return;
        const isOk = !ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE');
        if (isOk && ins.supervisor) supOkCounts[ins.supervisor] = (supOkCounts[ins.supervisor] || 0) + 1;
    });

    const totalU = uniqueList.length;
    const tasaAprobacion = totalU > 0 ? Math.round((stOk / totalU) * 100) : 0;

    // KPIs Producción
    const elKpiProg = document.getElementById('kpi-real-prog');
    const elKpiOk = document.getElementById('kpi-ok');
    const elKpiPend = document.getElementById('kpi-pendientes-prod');
    const elKpiInf = document.getElementById('kpi-total-informes');
    // KPIs Calidad
    const elKpiNok = document.getElementById('kpi-nok-active');
    const elKpiQ = document.getElementById('kpi-quality');
    const elKpiInc = document.getElementById('kpi-inc');
    const elKpiTasa = document.getElementById('kpi-tasa-aprobacion');

    // PRODUCCIÓN: Tabla avance por sub-disciplina
    const mapZonas = { 'ARCO1': 0, 'ARCO2': 1, 'ARCO3': 2, 'ARCO4': 3, 'ARCO5': 4 };
    const zonasLabels = ['ARCO1', 'ARCO2', 'ARCO3', 'ARCO4', 'ARCO5'];
    let indicesBaselines = fZona === 'TODOS' ? [0, 1, 2, 3, 4] : [mapZonas[fZona]];
    let totalMetaGlobal = 0, totalOkGlobal = 0;
    let tbodyAlcance = '';
    const subMapInv = { 'MEC': 'MEC', 'CIV-Vallado': 'Vallado', 'CIV-Drenajes': 'Drenajes', 'CIV-Caminos': 'Caminos', 'ELE-Zanjas': 'Apertura de zanjas tendido de cable', 'ELE-Cables': 'Tendido y conexionado de cable solar', 'ELE-CB': 'Montaje de combiner box', 'ELE-MT': 'Conexionado cables MT' };

    Object.keys(configGeneral.baselines).forEach(bdKey => {
        const discPrefix = bdKey.split('-')[0];
        if (fDisc !== 'TODOS' && discPrefix !== fDisc) return;
        let totalObj = 0;
        indicesBaselines.forEach(idx => { totalObj += configGeneral.baselines[bdKey][idx] || 0; });
        let compOk = 0;
        const subNameStr = subMapInv[bdKey];
        uniqueList.forEach(ins => {
            if ((bdKey === 'MEC' && ins.disciplina === 'MEC') || (ins.disciplina === discPrefix && ins.subDisciplina === subNameStr)) {
                if (!ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE')) compOk++;
            }
        });
        const pct = totalObj > 0 ? (compOk / totalObj * 100).toFixed(1) : '0.0';
        const pend = Math.max(0, totalObj - compOk);
        totalMetaGlobal += totalObj; totalOkGlobal += compOk;
        const pctNum = parseFloat(pct);
        const barColor = pctNum < 20 ? '#dc3545' : pctNum < 80 ? '#ff9800' : '#28a745';
        if (totalObj > 0 || compOk > 0) {
            tbodyAlcance += `<tr>
                <td><strong>${bdKey}</strong></td>
                <td style="text-align:center; font-weight:bold;">${totalObj}</td>
                <td style="text-align:center; color:var(--success-green); font-weight:bold;">${compOk}</td>
                <td style="text-align:center; color:var(--warning-orange); font-weight:bold;">${pend}</td>
                <td style="min-width:140px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="flex-grow:1; background:#e9ecef; border-radius:6px; height:14px; overflow:hidden;">
                            <div style="background:${barColor}; height:100%; width:${pct}%; transition:width 1s ease; border-radius:6px;"></div>
                        </div>
                        <span style="font-size:11px; font-weight:bold; color:${barColor}; min-width:36px;">${pct}%</span>
                    </div>
                </td>
            </tr>`;
        }
    });
    document.querySelector('#dash-tabla-alcance tbody').innerHTML = tbodyAlcance || '<tr><td colspan="5" style="text-align:center; color:#999; padding:20px;">Configura los Totales en Ajustes ⚙️</td></tr>';

    const pctGlobal = totalMetaGlobal > 0 ? (totalOkGlobal / totalMetaGlobal * 100).toFixed(2) : '0.00';
    if (elKpiProg) elKpiProg.innerText = pctGlobal + '%';
    if (elKpiOk) elKpiOk.innerText = stOk;
    if (elKpiPend) elKpiPend.innerText = Math.max(0, totalMetaGlobal - totalOkGlobal);
    if (elKpiInf) elKpiInf.innerText = allReports.length;
    const fillEl = document.getElementById('fill-real-prog');
    if (fillEl) fillEl.style.width = pctGlobal + '%';

    if (elKpiNok) elKpiNok.innerText = stNok;
    if (elKpiQ) elKpiQ.innerText = totalU > 0 ? (allReports.length / totalU).toFixed(2) : '0.0';
    if (elKpiInc) elKpiInc.innerText = stInc;
    if (elKpiTasa) elKpiTasa.innerText = tasaAprobacion + '%';

// === INICIO MEJORA: CÁLCULO DE VELOCIDAD Y FECHA ESTIMADA ===
    const { ritmoDiario } = calcularRitmo7Dias(uniqueList);
    const unidadesPendientes = Math.max(0, totalMetaGlobal - totalOkGlobal);
    let textoFechaFin = "---";

    if (ritmoDiario > 0 && unidadesPendientes > 0) {
        const diasParaTerminar = Math.ceil(unidadesPendientes / ritmoDiario);
        const fechaFinEstimada = new Date();
        fechaFinEstimada.setDate(fechaFinEstimada.getDate() + diasParaTerminar);
        
        textoFechaFin = "Fin est: " + fechaFinEstimada.toLocaleDateString('es-ES', { 
            day: '2-digit', month: 'short', year: 'numeric' 
        });
    } else if (unidadesPendientes === 0 && totalMetaGlobal > 0) {
        textoFechaFin = "¡Objetivo alcanzado!";
    }

    const divVelocidad = document.getElementById('kpi-velocidad');
    const divFechaFin = document.getElementById('kpi-fecha-fin');
    if (divVelocidad) divVelocidad.innerText = ritmoDiario.toFixed(1) + " eq/día";
    if (divFechaFin) divFechaFin.innerText = textoFechaFin;
    // === FIN MEJORA: CÁLCULO DE VELOCIDAD ===

    // ── CHART 1: Evolución de Calidad (First Time Yield) ─────────────────
    const okByDate = {};
    const nokByDate = {};
    
    // Preparar el calendario de los últimos 30 días
    for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const localDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        okByDate[localDate] = 0;
        nokByDate[localDate] = 0;
    }

    // Llenar datos separando OK y NOK/Incompletos
    uniqueList.forEach(ins => {
        if(okByDate[ins.fecha] !== undefined) {
            const isOk = !ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE');
            if (isOk) {
                okByDate[ins.fecha]++;
            } else {
                nokByDate[ins.fecha]++; // Se cuenta como retrabajo (Rework)
            }
        }
    });

    const trendLabels = Object.keys(okByDate).map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });
    const dataOk = Object.values(okByDate);
    const dataNok = Object.values(nokByDate);

    if (chartTendencia) chartTendencia.destroy();
    const ctxT = document.getElementById('chart-tendencia');
    if (ctxT) {
        chartTendencia = new Chart(ctxT.getContext('2d'), {
            type: 'bar',
            data: {
                labels: trendLabels,
                datasets: [
                    {
                        label: 'Aprobados (OK)',
                        data: dataOk,
                        backgroundColor: '#28a745',
                        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }
                    },
                    {
                        label: 'Rechazos / Rework',
                        data: dataNok,
                        backgroundColor: '#dc3545',
                        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { boxWidth: 10, font: {size: 10, family: 'Segoe UI'} } },
                    tooltip: { mode: 'index', intersect: false } // Muestra ambos datos al pasar el ratón
                },
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 12, color: '#888' } },
                    y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { stepSize: 1, font: { size: 11 }, color: '#555' } }
                }
            }
        });
    }

    // ── CHART 2: Avance por Zona (Horizontal Bar) ──────────────────────
    const zonaVals = [], zonaMetas = [], zonaColors = [];
    for (let z = 0; z < 5; z++) {
        let metaZ = 0, okZ = 0;
        Object.keys(configGeneral.baselines).forEach(bdKey => {
            if (fDisc === 'TODOS' || bdKey.startsWith(fDisc)) metaZ += configGeneral.baselines[bdKey][z] || 0;
        });
        uniqueList.forEach(ins => {
            if (ins.zona === zonasLabels[z] && (fDisc === 'TODOS' || ins.disciplina === fDisc)) {
                if (!ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE')) okZ++;
            }
        });
        const pZ = metaZ > 0 ? Math.round((okZ / metaZ) * 100) : 0;
        zonaVals.push(pZ);
        zonaMetas.push(metaZ);
        zonaColors.push(pZ < 20 ? '#dc3545' : pZ < 80 ? '#ff9800' : '#28a745');
    }
    if (chartZonas) chartZonas.destroy();
    const ctxZ = document.getElementById('chart-zonas');
    if (ctxZ) {
        chartZonas = new Chart(ctxZ.getContext('2d'), {
            type: 'bar',
            data: {
                labels: zonasLabels,
                datasets: [{
                    label: 'Avance %',
                    data: zonaVals,
                    backgroundColor: zonaColors,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: 28
                }, {
                    label: 'Restante',
                    data: zonaVals.map(v => Math.max(0, 100 - v)),
                    backgroundColor: 'rgba(0,0,0,0.06)',
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: 28
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => item.datasetIndex === 0 ? ` Avance: ${item.raw}%` : '',
                            afterLabel: (item) => item.datasetIndex === 0 ? ` Meta: ${zonaMetas[item.dataIndex]} equipos` : ''
                        },
                        filter: (item) => item.datasetIndex === 0
                    }
                },
                scales: {
                    x: { stacked: true, max: 100, ticks: { callback: v => v + '%', font: { size: 11 }, color: '#666' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { stacked: true, ticks: { font: { size: 12, weight: 'bold' }, color: '#333' }, grid: { display: false } }
                }
            }
        });
    }

    // ── CHART 3: Doughnut Salud ────────────────────────────────────────
    if (chartDoughnut) chartDoughnut.destroy();
    const ctxD = document.getElementById('chart-doughnut');
    if (ctxD) {
        chartDoughnut = new Chart(ctxD.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Aprobados (OK)', 'Con Fallos (NOK)', 'Incompletos'],
                datasets: [{
                    data: [stOk, stNok, stInc],
                    backgroundColor: ['#28a745', '#dc3545', '#adb5bd'],
                    borderColor: '#fff',
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 16, font: { size: 12 }, usePointStyle: true, pointStyleWidth: 10 }
                    },
                    tooltip: { callbacks: { label: (item) => ` ${item.label}: ${item.raw} (${totalU > 0 ? Math.round((item.raw / totalU) * 100) : 0}%)` } }
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw(chart) {
                    const { ctx, chartArea: { top, bottom, left, right } } = chart;
                    const cx = (left + right) / 2, cy = (top + bottom) / 2;
                    const pct = totalU > 0 ? Math.round((stOk / totalU) * 100) : 0;
                    ctx.save();
                    ctx.font = 'bold 28px Segoe UI';
                    ctx.fillStyle = '#28a745';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(pct + '%', cx, cy - 10);
                    ctx.font = '11px Segoe UI';
                    ctx.fillStyle = '#999';
                    ctx.fillText('Aprobados', cx, cy + 16);
                    ctx.restore();
                }
            }]
        });
    }

    // ── CHART 4: Supervisores (Horizontal Bar) ─────────────────────────
    if (chartSuper) chartSuper.destroy();
    const ctxS = document.getElementById('chart-super');
    if (ctxS) {
        const supSorted = Object.entries(supOkCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);
        if (supSorted.length > 0) {
            chartSuper = new Chart(ctxS.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: supSorted.map(e => e[0].length > 18 ? e[0].substring(0, 18) + '…' : e[0]),
                    datasets: [{
                        label: 'Equipos Aprobados',
                        data: supSorted.map(e => e[1]),
                        backgroundColor: '#005596',
                        borderRadius: 5,
                        borderSkipped: false,
                        barThickness: 22
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (item) => ` ${item.raw} equipo(s) aprobado(s)` } }
                    },
                    scales: {
                        x: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 }, color: '#666' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                        y: { ticks: { font: { size: 11, weight: 'bold' }, color: '#333' }, grid: { display: false } }
                    }
                }
            });
        } else {
            ctxS.parentElement.innerHTML = '<p style="text-align:center; color:#bbb; padding:40px 20px; font-size:13px;">Sin datos de supervisores a&#250;n.</p>';
        }
    }

    // ── CHARTS 5-7: Top Defectos por Disciplina ────────────────────────
    renderDefectChart('chart-def-mec', defectMEC, '#dc3545');
    renderDefectChart('chart-def-civ', defectCIV, '#ff9800');
    renderDefectChart('chart-def-ele', defectELE, '#6f42c1');
// === INICIO MEJORA: MAPA DE CALOR DE DEFECTOS ===
    // 1. Calcular los rangos de fechas de las últimas 4 semanas
    const weekRanges = [];
    const baseDate = new Date();
    const getLocalD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    for (let i = 0; i < 4; i++) {
        let fin = new Date(baseDate);
        fin.setDate(fin.getDate() - (i * 7));
        let inicio = new Date(baseDate);
        inicio.setDate(inicio.getDate() - (i * 7) - 6); // 7 días hacia atrás
        
        // Etiqueta visual (Ej: 10/05 al 16/05)
        let label = inicio.getDate() + "/" + (inicio.getMonth()+1) + " - " + fin.getDate() + "/" + (fin.getMonth()+1);
        weekRanges.push({ label: label, inicio: getLocalD(inicio), fin: getLocalD(fin) });
    }
    weekRanges.reverse(); // Ordenamos de la semana más antigua a la más actual (hoy)

    // 2. Preparar los datos por zona (Arcos)
    const zonasHeat = ['ARCO1', 'ARCO2', 'ARCO3', 'ARCO4', 'ARCO5'];
    const heatmapData = {};
    zonasHeat.forEach(z => heatmapData[z] = [0, 0, 0, 0]);

    // 3. Contar los defectos (NOK) asignándolos a su semana correspondiente
    uniqueList.forEach(ins => {
        if (!ins.checklist) return;
        const hasNok = ins.checklist.some(c => c.estado === 'NOK');
        if (hasNok && heatmapData[ins.zona]) {
            for (let w = 0; w < 4; w++) {
                if (fechaGte(ins.fecha, weekRanges[w].inicio) && fechaLte(ins.fecha, weekRanges[w].fin)) {
                    heatmapData[ins.zona][w]++;
                    break;
                }
            }
        }
    });

    // 4. Encontrar el valor máximo para calcular la intensidad de los colores
    let maxNok = 1;
    zonasHeat.forEach(z => {
        heatmapData[z].forEach(val => { if(val > maxNok) maxNok = val; });
    });

    // 5. Construir la tabla HTML
    let htmlHeatmap = `<table class="exec-table" style="text-align: center; font-size: 12px;"><thead><tr><th style="text-align:left; background:#003d70; color:white; width: 20%;">ZONA</th>`;
    weekRanges.forEach(w => { htmlHeatmap += `<th style="background:#003d70; color:white; width: 20%;">${w.label}</th>`; });
    htmlHeatmap += `</tr></thead><tbody>`;

    zonasHeat.forEach(z => {
        htmlHeatmap += `<tr><td style="text-align:left; font-weight:bold; border: 1px solid #e0e4ea;">${z}</td>`;
        heatmapData[z].forEach(val => {
            let bgColor = '#d4edda'; // Por defecto Verde (OK)
            let textColor = '#155724';
            
            if (val > 0) {
                // Regla de 3 para calcular lo grave que es el número
                const gravedad = Math.min(1, val / maxNok);
                if (gravedad <= 0.35) { bgColor = '#fff3cd'; textColor = '#856404'; } // Amarillo
                else if (gravedad <= 0.70) { bgColor = '#ffeeba'; textColor = '#856404'; } // Naranja
                else { bgColor = '#f8d7da'; textColor = '#721c24'; } // Rojo intenso
            }
            
            htmlHeatmap += `<td style="background-color: ${bgColor}; color: ${textColor}; font-weight: bold; border: 1px solid white;">${val} defectos</td>`;
        });
        htmlHeatmap += `</tr>`;
    });
    htmlHeatmap += `</tbody></table>`;
    
    // 6. Inyectar en la tarjeta del HTML
    const heatContainer = document.getElementById('heatmap-container');
    if (heatContainer) heatContainer.innerHTML = htmlHeatmap;
    // === FIN MEJORA: MAPA DE CALOR DE DEFECTOS ===
// === INICIO: CÁLCULOS DE LIBERACIONES PARA LA WEB ===
    let totalMec = 0, totalLib = 0, totalApt = 0, totalBloq = 0, totalProg = 0;
    
    const zonasNombres = ['ARCO1', 'ARCO2', 'ARCO3', 'ARCO4', 'ARCO5'];
    const zonasLib = [0,0,0,0,0], zonasApt = [0,0,0,0,0], zonasBloq = [0,0,0,0,0], zonasProg = [0,0,0,0,0];

    uniqueList.forEach(ins => {
        if (!ins.checklist || ins.disciplina !== 'MEC') return;
        totalMec++;
        
        let tieneFallo = ins.checklist.some(c => c.estado === 'NOK');
        const b1 = ins.checklist.filter(c => c.bloque.startsWith('1.'));
        const b2 = ins.checklist.filter(c => c.bloque.startsWith('2.'));
        const b3 = ins.checklist.filter(c => c.bloque.startsWith('3.'));
        const b4 = ins.checklist.filter(c => c.bloque.startsWith('4.'));
        const b5 = ins.checklist.filter(c => c.bloque.startsWith('5.'));

        const todoOk = (arr) => arr.length > 0 && !arr.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE');
        const b5_estruct = b5.filter(c => !/módulos|d-box|sbc/i.test(c.titulo));
        const b5_modulos = b5.filter(c => /módulos/i.test(c.titulo));

        let h1 = todoOk(b1);
        let h2 = todoOk(b2) && (b3.length === 0 || todoOk(b3)) && todoOk(b5_estruct);
        let h3 = todoOk(b4) && todoOk(b5_modulos);

        let zIndex = zonasNombres.indexOf(ins.zona);
        if(zIndex === -1) zIndex = 0;

        if (tieneFallo) { 
            totalBloq++; zonasBloq[zIndex]++;
        } else if (h1 && h2 && h3) { 
            totalLib++; zonasLib[zIndex]++;
        } else if (h1 && h2) { 
            totalApt++; zonasApt[zIndex]++;
        } else {
            totalProg++; zonasProg[zIndex]++;
        }
    });

    if (document.getElementById('kpi-lib-total')) document.getElementById('kpi-lib-total').innerText = totalMec;
    if (document.getElementById('kpi-lib-ok'))    document.getElementById('kpi-lib-ok').innerText    = totalLib;
    if (document.getElementById('kpi-lib-apt'))   document.getElementById('kpi-lib-apt').innerText   = totalApt;
    if (document.getElementById('kpi-lib-nok'))   document.getElementById('kpi-lib-nok').innerText   = totalBloq;

    // --- DIBUJAR DONUT ---
    const ctxLibDoughnut = document.getElementById('chart-lib-doughnut');
    if (ctxLibDoughnut) {
        let existingChart = Chart.getChart(ctxLibDoughnut);
        if (existingChart) existingChart.destroy();
        new Chart(ctxLibDoughnut.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Liberado Total', 'Aptos Paneles', 'Bloqueados', 'En Progreso'],
                datasets: [{
                    data: [totalLib, totalApt, totalBloq, totalProg],
                    backgroundColor: ['#28a745', '#00b0f0', '#dc3545', '#ff9800']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom' } } }
        });
    }

    // --- DIBUJAR BARRAS ---
    const ctxLibZonas = document.getElementById('chart-lib-zonas');
    if (ctxLibZonas) {
        let existingChart = Chart.getChart(ctxLibZonas);
        if (existingChart) existingChart.destroy();
        new Chart(ctxLibZonas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: zonasNombres,
                datasets: [
                    { label: 'Liberados', data: zonasLib, backgroundColor: '#28a745' },
                    { label: 'Aptos Paneles', data: zonasApt, backgroundColor: '#00b0f0' },
                    { label: 'Bloqueados', data: zonasBloq, backgroundColor: '#dc3545' },
                    { label: 'En Progreso', data: zonasProg, backgroundColor: '#ff9800' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
        });
    }
    // === FIN: CÁLCULOS DE LIBERACIONES ===

}

function renderDefectChart(canvasId, dataMap, color) {
    const sorted = Object.entries(dataMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const container = canvas.parentElement;

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    const msgKey = 'defect-empty-msg';
    const oldMsg = container.querySelector('.' + msgKey);
    if (sorted.length === 0) {
        canvas.style.display = 'none';
        if (!oldMsg) {
            const msg = document.createElement('p');
            msg.className = msgKey;
            msg.style.cssText = 'text-align:center; color:#bbb; padding:20px; font-size:12px;';
            msg.textContent = 'Sin defectos registrados.';
            container.appendChild(msg);
        }
        return;
    }
    if (oldMsg) oldMsg.remove();
    canvas.style.display = 'block';

    const labels = sorted.map(e => e[0].length > 30 ? e[0].substring(0, 30) + '…' : e[0]);
    const values = sorted.map(e => e[1]);

    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: color + 'cc',
                borderColor: color,
                borderWidth: 1.5,
                borderRadius: 4,
                borderSkipped: false,
                barThickness: 18
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (item) => ` ${item.raw} ocurrencia(s)` } }
            },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 }, color: '#888' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                y: { ticks: { font: { size: 10 }, color: '#444' }, grid: { display: false } }
            }
        }
    });
}

function cambiarPestanaDash(tab) {
    // 1. Mostramos la pestaña elegida y ocultamos las otras
    if(document.getElementById('tab-prod')) document.getElementById('tab-prod').style.display = (tab === 'prod' ? 'block' : 'none');
    if(document.getElementById('tab-cal'))  document.getElementById('tab-cal').style.display  = (tab === 'cal'  ? 'block' : 'none');
    if(document.getElementById('tab-lib'))  document.getElementById('tab-lib').style.display  = (tab === 'lib'  ? 'block' : 'none');

    // 2. Pintamos el botón activo
    if(document.getElementById('btn-tab-prod')) document.getElementById('btn-tab-prod').className = 'dash-tab' + (tab === 'prod' ? ' dash-tab-active' : '');
    if(document.getElementById('btn-tab-cal'))  document.getElementById('btn-tab-cal').className  = 'dash-tab' + (tab === 'cal'  ? ' dash-tab-active' : '');
    if(document.getElementById('btn-tab-lib'))  document.getElementById('btn-tab-lib').className  = 'dash-tab' + (tab === 'lib'  ? ' dash-tab-active' : '');
}
function imprimirDashboard() { window.print(); }

function mostrarCarga(mensaje = 'Procesando...') {
    const overlay = document.createElement('div');
    overlay.id = 'overlay-carga';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;color:white;font-size:1.5rem;font-family:Segoe UI,sans-serif;';
    overlay.textContent = mensaje;
    document.body.appendChild(overlay);
}
function ocultarCarga() {
    const overlay = document.getElementById('overlay-carga');
    if (overlay) overlay.remove();
}


function irInicio() { document.getElementById('checklist').style.display='none'; document.getElementById('listado').style.display='none'; document.getElementById('dashboard-view').style.display='none'; document.getElementById('portada').style.display='flex'; }
function mostrarHistorial() { document.getElementById('portada').style.display='none'; document.getElementById('dashboard-view').style.display='none'; document.getElementById('listado').style.display='block'; renderListado(); }
function obtenerGPS() { 
    if (navigator.geolocation) { 
        document.getElementById('ins-gps').value = "Calculando..."; 
        navigator.geolocation.getCurrentPosition(
            (pos) => { 
                document.getElementById('ins-gps').value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`; 
            }, 
            (err) => { 
                document.getElementById('ins-gps').value = "Error / Sin Señal"; 
                alert("No se pudo obtener la ubicación. Comprueba que el GPS esté encendido y tenga permisos.");
            },
            { timeout: 10000, maximumAge: 0 } // Le damos 10 segundos máximo para buscar
        ); 
    } else {
        alert("Tu navegador no soporta geolocalización.");
    }
}
const pads = {};
let padsTocados = { 'pad-supervisor': false, 'pad-propiedad': false };

function initPads() {
    ['pad-supervisor', 'pad-propiedad'].forEach(id => {
        const canvas = document.getElementById(id);
        const ctx = canvas.getContext('2d');
        let drawing = false;
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = 150;
        ctx.lineWidth = 2;
        const getX = (e) => (e.touches ? e.touches[0].clientX : e.clientX) - canvas.getBoundingClientRect().left;
        const getY = (e) => (e.touches ? e.touches[0].clientY : e.clientY) - canvas.getBoundingClientRect().top;
        
        canvas.addEventListener('mousedown', (e) => { drawing=true; padsTocados[id]=true; ctx.beginPath(); ctx.moveTo(getX(e), getY(e)); });
        canvas.addEventListener('mousemove', (e) => { if(!drawing) return; ctx.lineTo(getX(e), getY(e)); ctx.stroke(); });
        window.addEventListener('mouseup', () => drawing=false);
        
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing=true; padsTocados[id]=true; ctx.beginPath(); ctx.moveTo(getX(e), getY(e)); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if(!drawing) return; ctx.lineTo(getX(e), getY(e)); ctx.stroke(); }, { passive: false });
        canvas.addEventListener('touchend', () => drawing=false);
        
        pads[id] = { canvas, ctx };
    });
}

function clearSig(id) { 
    const pad = pads[id];
    if (!pad) return;
    pad.ctx.clearRect(0, 0, pad.canvas.width, pad.canvas.height); 
    pad.ctx.beginPath(); 
    padsTocados[id] = false;
}
function actualizarProgreso() {
    const total = document.querySelectorAll('.inspeccion-item').length;
    const okRadio = document.querySelectorAll('input[value="ok"]:checked').length;
    const nokRadio = document.querySelectorAll('input[value="nok"]:checked').length;
    const naRadio = document.querySelectorAll('input[value="na"]:checked').length;
    
    const selects = Array.from(document.querySelectorAll('select.select-estado'));
    const okSelect = selects.filter(s => s.value === 'OK').length;
    const nokSelect = selects.filter(s => s.value === 'NOK').length;
    const naSelect = selects.filter(s => s.value === 'NA').length;

    const autoNas = selects.filter(s => s.style.display === 'none' && s.value === 'NA').length;

    const ok = okRadio + okSelect;
    const nok = nokRadio + nokSelect;
    const naEfectivo = (naRadio + naSelect) - autoNas;
    const totalEfectivo = total - autoNas;

    const res = ok + nok + naEfectivo;
    const porc = totalEfectivo > 0 ? Math.round((res / totalEfectivo) * 100) : 0;
    
    document.getElementById('progreso-bar').style.width = porc + "%";
    document.getElementById('txt-progreso').innerText = porc + "% Completado";
    document.getElementById('res-ok').innerText = ok;
    document.getElementById('res-nok').innerText = nok;
    document.getElementById('res-inc').innerText = totalEfectivo - res;
}

function cambioDisciplinaMecanica() {
    const modelo = document.getElementById('ins-modelo-mec').value;
    const filaSelect = document.getElementById('ins-fila-mec');
    if(modelo.includes('MONOLINE')) {
        filaSelect.value = 'MONOFILA';
        for(let option of filaSelect.options) option.disabled = option.value !== 'MONOFILA';
    } else {
        if(filaSelect.value === 'MONOFILA') filaSelect.value = 'MOTORA';
        for(let option of filaSelect.options) option.disabled = option.value === 'MONOFILA';
    }
    cambioDisciplina();
}

function cambioZona() {
    actualizarID();
    if (document.getElementById('ins-disciplina').value === 'MEC') {
        cargarChecklist(extraerDatosActuales());
    }
}

function cambioDisciplina() { 
    actualizarEtiquetasEquipo(); 
    if (document.getElementById('ins-disciplina').value === 'MEC') {
        const modelo = document.getElementById('ins-modelo-mec').value;
        const fila = document.getElementById('ins-fila-mec').value;
        const numPostesInput = document.getElementById('ins-num-postes');
        const matchDuo = modelo.match(/\((\d+)P\+(\d+)P\)/i);
        if (matchDuo) numPostesInput.value = (fila === 'MOTORA') ? matchDuo[1] : matchDuo[2];
        else if (modelo.includes('MONOLINE 60M')) numPostesInput.value = 11;
    }
    actualizarID(); 
    cargarChecklist(); 
}

function actualizarEtiquetasEquipo() { 
    const d = document.getElementById('ins-disciplina').value; 
    document.getElementById('div-sub-civil').style.display = d==='CIV'?'flex':'none'; 
    document.getElementById('div-sub-ele').style.display = d==='ELE'?'flex':'none'; 
    document.getElementById('div-sub-mec').style.display = d==='MEC'?'block':'none';
    if(d === 'MEC') {
        const fila = document.getElementById('ins-fila-mec').value;
        document.getElementById('lbl-equipo').innerText = `Tracker (${fila === 'MOTORA' ? 'Mot.' : (fila === 'GEMELA' ? 'Gem.' : 'Mono')})`;
    } else document.getElementById('lbl-equipo').innerText = (d==='CIV'?'Equipo':'Circuito');
}

function actualizarID() { 
    const rev = parseInt(document.getElementById('ins-revision').value) || 0; 
    const d = document.getElementById('ins-disciplina').value;
    let cod = `${d}-${document.getElementById('ins-zona').value}-${(document.getElementById('ins-equipo').value || 'EQ').toUpperCase()}`; 
    if(d === 'MEC') {
        const filaStr = document.getElementById('ins-fila-mec').value;
        cod += `-${filaStr === 'MONOFILA' ? 'MONO' : filaStr.substring(0,3)}`;
    }
    const final = rev > 0 ? `${cod}-R${rev}` : cod; 
    document.getElementById('id-generado').innerText = final; 
    return final; 
}

function toggleBloque(id) { 
    const el = document.getElementById(id);
    if(el) el.style.display = el.style.display === 'block' ? 'none' : 'block'; 
}

function marcarTodoOk(b) { 
    const bId = 'bloque-' + b.replace(/[.\s]+/g, '');
    const cont = document.getElementById(bId);
    if(cont) {
        // Solo marcamos OK en inputs/selects que NO estén junto a un input numérico vacío
        cont.querySelectorAll('.inspeccion-item').forEach(item => {
            const numInput = item.querySelector('input[type="number"]');
            
            // Si hay un input numérico y está vacío, NO le ponemos OK automáticamente
            if (numInput && !numInput.value) {
                return; 
            }

            const okRadio = item.querySelector('input[value="ok"]');
            if(okRadio) okRadio.checked = true;

            const select = item.querySelector('select.select-estado:not([data-auto="true"])');
            if(select && select.value !== 'NA') {
                select.value = 'OK';
                select.className = 'select-estado ok';
            }
        });
        actualizarProgreso();
    }
}
function evaluarVano(idx) {
    const nom = parseFloat(document.getElementById('nom-'+idx).value) || 0;
    const tol = parseFloat(document.getElementById('tol-'+idx).value) || 0;
    const realInput = document.getElementById('real-'+idx);
    const realStr = realInput.value;
    const selObj = document.getElementById('sel-'+idx);

    if(!realStr.trim()) {
        selObj.value = 'PENDIENTE';
        selObj.className = 'select-estado';
    } else {
        const real = parseFloat(realStr);
        const diff = Math.abs(real - nom);
        
        if(diff <= tol) {
            selObj.value = 'OK';
            selObj.className = 'select-estado ok';
        } else {
            selObj.value = 'NOK';
            selObj.className = 'select-estado nok';
        }
    }
    actualizarProgreso();

    if (realInput) {
        const tbody = realInput.closest('tbody');
        if (tbody) {
            let sumaReal = 0;
            const rows = tbody.querySelectorAll('tr.inspeccion-item');
            rows.forEach(tr => {
                const input = tr.querySelector('input[type="number"]');
                const tdAcumulado = tr.querySelector('.td-acumulado');
                const teorico = tr.getAttribute('data-acum-teorico');

                if (input && input.value) {
                    sumaReal += parseFloat(input.value) || 0;
                    if (tdAcumulado && teorico) {
                        tdAcumulado.innerHTML = `<span style="color:var(--elecnor-blue)">${parseFloat(sumaReal.toFixed(2))}</span> <span style="color:#999">/ ${teorico}</span>`;
                    }
                } else {
                    if (tdAcumulado && teorico) {
                        tdAcumulado.innerHTML = `<span style="color:#ccc">-</span> <span style="color:#999">/ ${teorico}</span>`;
                    }
                }
            });
        }
    }
}

function evaluarVerifNum(idx, min, max) {
    const input = document.getElementById('real-verif-'+idx);
    const selObj = document.getElementById('sel-'+idx);
    const val = parseFloat(input.value);

    if(isNaN(val)) {
        selObj.value = 'PENDIENTE';
        selObj.className = 'select-estado';
        input.style.borderColor = '#ccc';
        input.style.color = '#333';
    } else {
        if (val >= min && val <= max) {
            selObj.value = 'OK';
            selObj.className = 'select-estado ok';
            input.style.borderColor = 'var(--success-green)';
            input.style.color = 'var(--success-green)';
        } else {
            selObj.value = 'NOK';
            selObj.className = 'select-estado nok';
            input.style.borderColor = 'var(--danger-red)';
            input.style.color = 'var(--danger-red)';
        }
    }
    actualizarProgreso();
}

function cargarChecklist(datosExistentes = null, esSubsanacion = false) {
    const contenedor = document.getElementById('contenedor-bloques'); 
    contenedor.innerHTML = ''; 
    let contador = 0;
    const disciplina = document.getElementById('ins-disciplina').value; 
    let estructura = {};

    if (disciplina === 'CIV') {
        const sub = document.getElementById('ins-sub-civil').value;
        if(checklistCivil[sub]) estructura = {"1. Inspección General": checklistCivil[sub]};
    }
    else if (disciplina === 'ELE') {
        const sub = document.getElementById('ins-sub-ele').value;
        estructura = Array.isArray(checklistElectrica[sub]) ? {"1. Inspección General": checklistElectrica[sub]} : checklistElectrica[sub];
    } else if (disciplina === 'MEC') {
        const mod = document.getElementById('ins-modelo-mec').value;
        const fila = document.getElementById('ins-fila-mec').value;
        if(checklistMecanica[mod] && checklistMecanica[mod][fila]) {
            const raw = JSON.parse(JSON.stringify(checklistMecanica[mod][fila]));
            const numPostes = parseInt(document.getElementById('ins-num-postes').value) || 0;
            const isLegacy = datosExistentes && datosExistentes.some(d => d.bloque === "1. Postes - Hincado" && !d.titulo.startsWith("Poste "));
            
            const finalMec = {};
            for(let key in raw) {
                if (raw[key].subgrupos) {
                    finalMec[key] = { subgrupos: {} };
                    for (let subKey in raw[key].subgrupos) {
                        if (subKey === "1.1 Estado de las hincas" && !isLegacy) {
                            finalMec[key].subgrupos[subKey] = { isTable: true, items: raw[key].subgrupos[subKey], postes: numPostes };
                            if (numPostes > 1) {
                                finalMec[key].subgrupos["1.2 Distancias entre hincas"] = { isVanosTable: true, postes: numPostes };
                            }
                        } else if (subKey === "2.1 Post head (piruletas)" && !isLegacy) {
                            finalMec[key].subgrupos[subKey] = { isTable: true, items: raw[key].subgrupos[subKey], postes: numPostes };
                        } else {
                            finalMec[key].subgrupos[subKey] = raw[key].subgrupos[subKey];
                        }
                    }
                } else if (key === "5. Pares de apriete" && !isLegacy) {
                    finalMec[key] = { isTorqueTable: true, items: raw[key], postes: numPostes };
                } else if (key === "6. Verificaciones finales" && !isLegacy) {
                    const processedItems = raw[key].map(item => {
                        if (item.dynamicRef === "pitch") {
                            const zona = document.getElementById('ins-zona').value;
                            const nom = (zona === 'ARCO4') ? 5800 : 6000;
                            return {
                                ...item,
                                ref: nom.toString(),
                                rango: `${nom - 20} - ${nom + 20}`,
                                min: nom - 20,
                                max: nom + 20
                            };
                        }
                        return item;
                    });
                    finalMec[key] = { isVerificacionesTable: true, items: processedItems, postes: numPostes };
                } else {
                    finalMec[key] = raw[key];
                }
            }
            estructura = finalMec;
        }
    }

    for (const bloquePrincipal in estructura) {
        let itemsHTML = '';

        const procesarSeccion = (bloqueLogico, dataObj) => {
            let html = '';
            
            if (dataObj && dataObj.isTable) {
                const numPostes = dataObj.postes;
                const itemsHincado = dataObj.items;
                
                html += `<div class="table-responsive" style="margin: 0; padding: 0;"><table class="table-hincado">`;
                html += `<thead><tr><th class="item-desc" style="z-index: 3;">Ítem a verificar</th>`;
                for(let p=1; p<=numPostes; p++) html += `<th>P ${p}</th>`;
                html += `</tr></thead><tbody>`;

                itemsHincado.forEach((itemDesc, rowIdx) => {
                    const sharedObsId = `shared-obs-${bloqueLogico.replace(/\s/g,'')}-${rowIdx}`;
                    const sharedImgId = `shared-img-${bloqueLogico.replace(/\s/g,'')}-${rowIdx}`;
                    const sharedFileId = `shared-file-${bloqueLogico.replace(/\s/g,'')}-${rowIdx}`;
                    
                    let firstObs = '';
                    let firstFoto = '';

                    html += `<tr><td class="item-desc">${esc(itemDesc)}</td>`;
                    for(let p=1; p<=numPostes; p++) {
                        const desc = `Poste ${p} - ${itemDesc}`;
                        let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                        if(datosExistentes) {
                            const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                            if(f) {
                                resp = f;
                                if(!firstObs && f.obs) firstObs = f.obs;
                                if(!firstFoto && f.foto) firstFoto = f.foto;
                            }
                        }

                        const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                        html += `<td style="padding: 2px;">
                            <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0;">
                                <select class="select-estado ${selColorClass}" onchange="this.className='select-estado '+this.value.toLowerCase(); actualizarProgreso();">
                                    <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                    <option value="OK" ${resp.estado==='OK'?'selected':''}>OK</option>
                                    <option value="NOK" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                    <option value="NA" ${resp.estado==='NA'?'selected':''}>N/A</option>
                                </select>
                            </div>
                        </td>`;
                        contador++; 
                    }
                    html += `</tr>`;
                    
                    html += `<tr class="row-obs">
                        <td colspan="${numPostes + 1}" style="text-align: left; padding: 6px;">
                            <div style="display:flex; gap: 8px; align-items:center;">
                                <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs. Global:</span>
                                <textarea id="${sharedObsId}" placeholder="Anotar observaciones que apliquen a todos los pilares de este ítem...">${esc(firstObs)}</textarea>
                                <div style="flex-shrink:0;">
                                    <input type="file" accept="image/*" style="display:none;" id="${sharedFileId}" onchange="procesarFotoParaAnotar(this, '${sharedImgId}')">
                                    <button type="button" onclick="document.getElementById('${sharedFileId}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                                </div>
                            </div>
                            <div id="status-${sharedImgId}" style="display:${firstFoto?'block':'none'}; color:var(--success-green); font-size:11px; font-weight:bold; margin-top:5px; background:#e9f7ef; padding:4px 8px; border-radius:4px; border:1px solid #c3e6cb; width:fit-content;">
                                ✅ Archivo incluido
                            </div>
                            <img src="${esc(firstFoto)}" class="foto-preview" id="${sharedImgId}" style="display:none;" onclick="verGrande(this.src)">
                        </td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;

            } else if (dataObj && dataObj.isVanosTable) {
                const numPostes = dataObj.postes;
                const mod = document.getElementById('ins-modelo-mec').value;
                const fila = document.getElementById('ins-fila-mec').value;

                html += `<div class="table-responsive" style="margin: 0; padding: 0;">
                    <table class="table-hincado" style="min-width: 100%;">
                        <thead>
                            <tr>
                                <th style="z-index: 1; width: 90px; font-size: 9px; padding: 4px;">DISTANCIAS ENTRE PILARES</th>
                                <th style="width: 50px; font-size: 9px; padding: 4px;">NOM.<br>(mm)</th>
                                <th style="width: 45px; font-size: 9px; padding: 4px;">TOL.<br>(mm)</th>
                                <th style="width: 80px; font-size: 9px; padding: 4px;">MEDIDA<br>REAL (mm)</th>
                                <th style="width: 60px; font-size: 9px; padding: 4px;">ESTADO</th>
                                <th style="width: 100px; font-size: 9px; padding: 4px;">ACUMULADO<br>Real / Teórico (mm)</th>
                            </tr>
                        </thead>
                        <tbody>`;

                let acumulado = 0;
                let acumuladoReal = 0;
                const sharedObsId = `shared-obs-vanos`;
                const sharedImgId = `shared-img-vanos`;
                const sharedFileId = `shared-file-vanos`;
                let firstObs = '';
                let firstFoto = '';

                for(let p=1; p<numPostes; p++) {
                    const desc = `Vano ${p}-${p+1}: Medición de distancia`;
                    const vIdx = p - 1;

                    let nom = 0, tol = 20;
                    if(configVanosPVH[mod] && configVanosPVH[mod][fila] && configVanosPVH[mod][fila].vanos && configVanosPVH[mod][fila].vanos[vIdx]) {
                        nom = configVanosPVH[mod][fila].vanos[vIdx].nominal;
                        tol = configVanosPVH[mod][fila].vanos[vIdx].tolerancia;
                    } else if(configVanosPVH[mod] && configVanosPVH[mod][fila]) {
                        nom = configVanosPVH[mod][fila].nominal || 0;
                        tol = configVanosPVH[mod][fila].tolerancia || 20;
                    }

                    acumulado += nom;

                    let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                    if(datosExistentes) {
                        const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                        if(f) {
                            resp = f;
                            const rMatch = f.obs.match(/Medida Real: ([\d.]+) mm \| (.*)/);
                            if(rMatch) {
                                if(!firstObs && rMatch[2]) firstObs = rMatch[2];
                            } else {
                                if(!firstObs && !f.obs.includes("Medida Real:")) firstObs = f.obs;
                            }
                        }
                    }

                    let realVal = '';
                    if(resp.obs) {
                        const rMatch = resp.obs.match(/Medida Real: ([\d.]+)/);
                        if(rMatch) realVal = rMatch[1];
                    }

                    if (realVal) {
                        acumuladoReal += parseFloat(realVal);
                    }

                    const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                    html += `<tr class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" data-acum-teorico="${acumulado}" style="display: table-row !important; border-bottom:1px solid #ccc;">
                        <td class="item-desc" style="text-align:center; font-size:9px; white-space:normal; padding:2px;">Vano ${p} - ${p+1}</td>
                        <td style="padding:4px;text-align:center;">${nom}</td>
                        <td style="padding:4px;text-align:center;">± ${tol}</td>
                        <td style="padding:4px;text-align:center;">
                            <input type="hidden" id="nom-${contador}" value="${nom}">
                            <input type="hidden" id="tol-${contador}" value="${tol}">
                            <input type="number" id="real-${contador}" value="${realVal}" oninput="evaluarVano(${contador})" placeholder="..." style="width:65px; padding:4px; text-align:center; font-weight:bold; border:2px solid var(--elecnor-blue); border-radius:4px; font-size:11px;">
                        </td>
                        <td style="padding:4px;text-align:center;">
                            <select id="sel-${contador}" class="select-estado ${selColorClass}" data-auto="true" style="pointer-events:none; width:60px;" tabindex="-1">
                                <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                <option value="OK" ${resp.estado==='OK'?'selected':''}>OK</option>
                                <option value="NOK" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                            </select>
                        </td>
                        <td class="td-acumulado" style="padding:4px;text-align:center;font-weight:bold;font-size:11px;">
                            ${realVal ? `<span style="color:var(--elecnor-blue)">${parseFloat(acumuladoReal.toFixed(2))}</span>` : `<span style="color:#ccc">-</span>`} <span style="color:#999">/ ${acumulado}</span>
                        </td>
                    </tr>`;
                    contador++;
                }

                html += `<tr class="row-obs">
                    <td colspan="6" style="text-align: left; padding: 6px;">
                        <div style="display:flex; gap: 8px; align-items:center;">
                            <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs. Global:</span>
                            <textarea id="${sharedObsId}" placeholder="Anotar observaciones sobre las distancias de hincas...">${esc(firstObs)}</textarea>
                            <div style="flex-shrink:0;">
                                <input type="file" accept="image/*" style="display:none;" id="${sharedFileId}" onchange="procesarFotoParaAnotar(this, '${sharedImgId}')">
                                <button type="button" onclick="document.getElementById('${sharedFileId}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                            </div>
                        </div>
                        <div id="status-${sharedImgId}" style="display:${firstFoto?'block':'none'}; color:var(--success-green); font-size:11px; font-weight:bold; margin-top:5px; background:#e9f7ef; padding:4px 8px; border-radius:4px; border:1px solid #c3e6cb; width:fit-content;">
                            ✅ Archivo incluido
                        </div>
                        <img src="${esc(firstFoto)}" class="foto-preview" id="${sharedImgId}" style="display:none;" onclick="verGrande(this.src)">
                    </td>
                </tr>`;

                html += `</tbody></table></div>`;

            } else if (dataObj && dataObj.isTorqueTable) {
                const numPostes = dataObj.postes;
                const itemsTorque = dataObj.items;
                
                html += `<div class="table-responsive" style="margin: 0; padding: 0;"><table class="table-hincado">`;
                html += `<thead><tr><th class="item-desc" style="z-index: 3; width: 170px;">Elemento y Especificaciones</th>`;
                for(let p=1; p<=numPostes; p++) html += `<th>P ${p}</th>`;
                html += `</tr></thead><tbody>`;

                itemsTorque.forEach((item, rowIdx) => {
                    const sharedObsId = `shared-obs-torque-${rowIdx}`;
                    const sharedImgId = `shared-img-torque-${rowIdx}`;
                    const sharedFileId = `shared-file-torque-${rowIdx}`;
                    
                    let firstObs = '';
                    let firstFoto = '';

                    html += `<tr><td class="item-desc" style="white-space:normal; line-height:1.4; padding:6px;">
                        <span style="color:var(--elecnor-blue); font-weight:900; font-size:11px; display:block; margin-bottom:3px;">${esc(item.desc)}</span>
                        <span style="font-weight:normal; font-size:9px; color:#555;">
                            <b>Tipo:</b> ${esc(item.tipo)} | <b>M:</b> ${esc(item.metrica)}mm<br>
                            <b>Torque:</b> <span style="color:var(--danger-red); font-weight:bold;">${esc(item.torque)} N.m</span> | <b>Tol:</b> ${esc(item.tol)}
                        </span>
                    </td>`;
                    
                    if (item.perPile) {
                        for(let p=1; p<=numPostes; p++) {
                            const desc = `Poste ${p} - ${item.desc}`;
                            let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                            if(datosExistentes) {
                                const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                                if(f) {
                                    resp = f;
                                    if(!firstObs && f.obs) firstObs = f.obs;
                                    if(!firstFoto && f.foto) firstFoto = f.foto;
                                }
                            }

                            const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                            html += `<td style="padding: 2px;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0;">
                                    <select class="select-estado ${selColorClass}" onchange="this.className='select-estado '+this.value.toLowerCase(); actualizarProgreso();">
                                        <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                        <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                        <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                        <option value="na" ${resp.estado==='NA'?'selected':''}>N/A</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++; 
                        }
                    } else {
                        const desc = item.desc;
                        let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                        let isDefaultNA = item.defaultNA === true;

                        if(datosExistentes) {
                            const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                            if(f) {
                                resp = f;
                                if(!firstObs && f.obs) firstObs = f.obs;
                                if(!firstFoto && f.foto) firstFoto = f.foto;
                            }
                        } else if (isDefaultNA) {
                            resp.estado = 'NA';
                        }

                        const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                        if (isDefaultNA) {
                            html += `<td colspan="${numPostes}" style="padding: 10px; background: #eee; vertical-align: middle; border-bottom: 2px solid #ddd;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; justify-content: center; align-items: center;">
                                    <span style="font-size:11px; font-weight:bold; color:#999; margin-right: 15px; text-transform:uppercase;">Validación Global de este elemento:</span>
                                    <span style="font-size:12px; color:#999; font-weight:bold; border: 1px solid #ccc; padding: 6px 20px; border-radius: 4px; background: #f9f9f9;">N/A</span>
                                    <select id="sel-${contador}" class="select-estado" style="display:none;" data-auto="true">
                                        <option value="na" selected>N/A</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++;
                        } else {
                            html += `<td colspan="${numPostes}" style="padding: 10px; background: #fdfdfd; vertical-align: middle; border-bottom: 2px solid #ddd;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; justify-content: center; align-items: center;">
                                    <span style="font-size:11px; font-weight:bold; color:#666; margin-right: 15px; text-transform:uppercase;">Validación Global de este elemento:</span>
                                    <select id="sel-${contador}" class="select-estado ${selColorClass}" onchange="this.className='select-estado '+this.value.toLowerCase(); actualizarProgreso();" style="width: 140px; padding: 10px; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                        <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                        <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                        <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                        <option value="na" ${resp.estado==='NA'?'selected':''}>N/A</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++;
                        }
                    }
                    html += `</tr>`;
                    
                    html += `<tr class="row-obs">
                        <td colspan="${numPostes + 1}" style="text-align: left; padding: 6px;">
                            <div style="display:flex; gap: 8px; align-items:center;">
                                <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs. Global:</span>
                                <textarea id="${sharedObsId}" placeholder="Anotar observaciones de los pares de apriete para este elemento...">${esc(firstObs)}</textarea>
                                <div style="flex-shrink:0;">
                                    <input type="file" accept="image/*" style="display:none;" id="${sharedFileId}" onchange="procesarFotoParaAnotar(this, '${sharedImgId}')">
                                    <button type="button" onclick="document.getElementById('${sharedFileId}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                                </div>
                            </div>
                            <div id="status-${sharedImgId}" style="display:${firstFoto?'block':'none'}; color:var(--success-green); font-size:11px; font-weight:bold; margin-top:5px; background:#e9f7ef; padding:4px 8px; border-radius:4px; border:1px solid #c3e6cb; width:fit-content;">
                                ✅ Archivo incluido
                            </div>
                            <img src="${esc(firstFoto)}" class="foto-preview" id="${sharedImgId}" style="display:none;" onclick="verGrande(this.src)">
                        </td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;

            } else if (dataObj && dataObj.isVerificacionesTable) {
                const numPostes = dataObj.postes;
                const itemsVerif = dataObj.items;
                
                html += `<div class="table-responsive" style="margin: 0; padding: 0;"><table class="table-hincado">`;
                html += `<thead><tr><th class="item-desc" style="z-index: 3; width: 170px;">Referencia y Descripción</th>`;
                for(let p=1; p<=numPostes; p++) html += `<th>P ${p}</th>`;
                html += `</tr></thead><tbody>`;

                itemsVerif.forEach((item, rowIdx) => {
                    const sharedObsId = `shared-obs-verif-${rowIdx}`;
                    const sharedImgId = `shared-img-verif-${rowIdx}`;
                    const sharedFileId = `shared-file-verif-${rowIdx}`;
                    
                    let firstObs = '';
                    let firstFoto = '';

                    html += `<tr><td class="item-desc" style="white-space:normal; line-height:1.4; padding:6px;">
                        <span style="color:var(--elecnor-blue); font-weight:900; font-size:11px; display:block; margin-bottom:3px;">${esc(item.desc)}</span>
                        <span style="font-weight:normal; font-size:9px; color:#555;">
                            <b>Ref:</b> <span style="color:var(--danger-red); font-weight:bold;">${esc(item.ref)}</span><br>
                            <b>Tol:</b> ${esc(item.tol)} | <b>Rango:</b> ${esc(item.rango)}
                        </span>
                    </td>`;
                    
                    if (item.perPile !== false) {
                        for(let p=1; p<=numPostes; p++) {
                            const desc = `Poste ${p} - ${item.desc}`;
                            let resp = {estado: 'PENDIENTE', obs: '', foto: ''};

                            let isDefaultNA = false;
                            if (item.naPiles && item.naPiles.includes(p)) isDefaultNA = true;
                            if (item.activePiles && !item.activePiles.includes(p)) isDefaultNA = true;

                            if(datosExistentes) {
                                const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                                if(f) {
                                    resp = f;
                                    const rMatch = f.obs.match(/Valor: ([\d.-]+) \| (.*)/);
                                    if(rMatch) {
                                        if(!firstObs && rMatch[2]) firstObs = rMatch[2];
                                    } else {
                                        if(!firstObs && !f.obs.includes("Valor:")) firstObs = f.obs;
                                    }
                                }
                            } else if (isDefaultNA) {
                                resp.estado = 'NA';
                            }

                            if (isDefaultNA) {
                                html += `<td style="padding: 2px; background-color:#eee;">
                                    <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display:flex; justify-content:center; align-items:center; height:100%;">
                                        <span style="font-size:11px; color:#999; font-weight:bold;">N/A</span>
                                        <select class="select-estado" style="display:none;" data-auto="true">
                                            <option value="na" selected>N/A</option>
                                        </select>
                                    </div>
                                </td>`;
                                contador++;
                            } else {
                                let realVal = '';
                                if(resp.obs) {
                                    const rMatch = resp.obs.match(/Valor: ([\d.-]+)/);
                                    if(rMatch) realVal = rMatch[1];
                                }

                                const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';
                                
                                let inputStyleColor = "border-color: #ccc; color: #333;";
                                if (realVal !== '') {
                                    const valNum = parseFloat(realVal);
                                    if (valNum >= item.min && valNum <= item.max) inputStyleColor = "border-color: var(--success-green); color: var(--success-green);";
                                    else inputStyleColor = "border-color: var(--danger-red); color: var(--danger-red);";
                                }

                                html += `<td style="padding: 2px; vertical-align:middle;">
                                    <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; flex-direction: column; align-items: center;">
                                        <input type="number" id="real-verif-${contador}" value="${realVal}" oninput="evaluarVerifNum(${contador}, ${item.min}, ${item.max})" placeholder="..." style="width: 100%; max-width: 55px; padding: 4px; font-size: 11px; font-weight: bold; text-align: center; border: 2px solid; border-radius: 4px; box-sizing: border-box; ${inputStyleColor}" step="any">
                                        <select id="sel-${contador}" data-auto="true" class="select-estado ${selColorClass}" style="pointer-events:none; width: 100%; max-width: 55px; padding: 4px 0; margin-top:4px; font-size:8px; opacity:0.9;" tabindex="-1">
                                            <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                            <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                            <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                        </select>
                                    </div>
                                </td>`;
                                contador++; 
                            }
                        }
                    } else if (item.isNumeric) {
                        const desc = item.desc;
                        let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                        let isDefaultNA = item.defaultNA === true;
                        
                        if(datosExistentes) {
                            const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                            if(f) {
                                resp = f;
                                const rMatch = f.obs.match(/Valor: ([\d.-]+) \| (.*)/);
                                if(rMatch) {
                                    if(!firstObs && rMatch[2]) firstObs = rMatch[2];
                                } else {
                                    if(!firstObs && !f.obs.includes("Valor:")) firstObs = f.obs;
                                }
                            }
                        } else if (isDefaultNA) {
                            resp.estado = 'NA';
                        }

                        const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';
                        
                        if (isDefaultNA) {
                            html += `<td colspan="${numPostes}" style="padding: 4px; background: #eee; vertical-align: middle; border-bottom: 2px solid #ddd;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 10px;">
                                    <span style="font-size:11px; font-weight:bold; color:#999; text-transform:uppercase; margin: 0;">Valor Obtenido:</span>
                                    <span style="font-size:12px; color:#999; font-weight:bold; border: 1px solid #ccc; padding: 4px 20px; border-radius: 4px; background: #f9f9f9; height: 26px; box-sizing: border-box; display: flex; align-items: center;">N/A</span>
                                    <select id="sel-${contador}" data-auto="true" class="select-estado" style="display:none;" tabindex="-1">
                                        <option value="na" selected>N/A</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++;
                        } else {
                            let realVal = '';
                            if(resp.obs) {
                                const rMatch = resp.obs.match(/Valor: ([\d.-]+)/);
                                if(rMatch) realVal = rMatch[1];
                            }
                            
                            let inputStyleColor = "border-color: #ccc; color: #333;";
                            if (realVal !== '') {
                                const valNum = parseFloat(realVal);
                                if (valNum >= item.min && valNum <= item.max) inputStyleColor = "border-color: var(--success-green); color: var(--success-green);";
                                else inputStyleColor = "border-color: var(--danger-red); color: var(--danger-red);";
                            }

                            html += `<td colspan="${numPostes}" style="padding: 4px; background: #fdfdfd; vertical-align: middle; border-bottom: 2px solid #ddd;">
                                <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" data-shared-obs="${sharedObsId}" data-shared-img="${sharedImgId}" style="border:none; padding:0; display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 10px;">
                                    <span style="font-size:11px; font-weight:bold; color:#666; text-transform:uppercase; margin: 0;">Valor Obtenido:</span>
                                    <input type="number" id="real-verif-${contador}" value="${realVal}" oninput="evaluarVerifNum(${contador}, ${item.min}, ${item.max})" placeholder="..." style="width: 70px; padding: 4px; font-size: 12px; font-weight: bold; text-align: center; border: 2px solid; border-radius: 4px; margin: 0; box-sizing: border-box; ${inputStyleColor}" step="any">
                                    <select id="sel-${contador}" data-auto="true" class="select-estado ${selColorClass}" style="pointer-events:none; width: 65px; padding: 6px; margin: 0; opacity:0.9;" tabindex="-1">
                                        <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                        <option value="ok" ${resp.estado==='OK'?'selected':''}>OK</option>
                                        <option value="nok" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                    </select>
                                </div>
                            </td>`;
                            contador++;
                        }
                    }
                    html += `</tr>`;
                    
                    html += `<tr class="row-obs">
                        <td colspan="${numPostes + 1}" style="text-align: left; padding: 6px;">
                            <div style="display:flex; gap: 8px; align-items:center;">
                                <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs. Global:</span>
                                <textarea id="${sharedObsId}" placeholder="Anotar observaciones para estas verificaciones...">${esc(firstObs)}</textarea>
                                <div style="flex-shrink:0;">
                                    <input type="file" accept="image/*" style="display:none;" id="${sharedFileId}" onchange="procesarFotoParaAnotar(this, '${sharedImgId}')">
                                    <button type="button" onclick="document.getElementById('${sharedFileId}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                                </div>
                            </div>
                            <div id="status-${sharedImgId}" style="display:${firstFoto?'block':'none'}; color:var(--success-green); font-size:11px; font-weight:bold; margin-top:5px; background:#e9f7ef; padding:4px 8px; border-radius:4px; border:1px solid #c3e6cb; width:fit-content;">
                                ✅ Archivo incluido
                            </div>
                            <img src="${esc(firstFoto)}" class="foto-preview" id="${sharedImgId}" style="display:none;" onclick="verGrande(this.src)">
                        </td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;

            } else {
                const itemsList = Array.isArray(dataObj) ? dataObj : [];
                itemsList.forEach((desc) => {
                    let resp = {estado: 'PENDIENTE', obs: '', foto: ''};
                    if(datosExistentes) {
                        const f = datosExistentes.find(d => d.bloque === bloqueLogico && d.titulo === desc);
                        if(f) resp = f; else if(esSubsanacion) return;
                    }
                    
                    const selColorClass = resp.estado !== 'PENDIENTE' ? resp.estado.toLowerCase() : '';

                    html += `                        <div class="inspeccion-item" data-bloque="${bloqueLogico}" data-desc="${desc}" style="background: white; padding: 12px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; gap: 10px;">
                            <span style="font-weight:bold; color:var(--elecnor-blue); font-size:12px; flex-grow:1;">${esc(desc)}</span>
                            <select id="sel-${contador}" class="select-estado ${selColorClass}" onchange="this.className='select-estado '+this.value.toLowerCase(); actualizarProgreso();" style="width: 110px; padding: 8px; font-size: 11px; flex-shrink:0;">
                                <option value="PENDIENTE" ${resp.estado==='PENDIENTE'?'selected':''} hidden>-</option>
                                <option value="OK" ${resp.estado==='OK'?'selected':''}>OK</option>
                                <option value="NOK" ${resp.estado==='NOK'?'selected':''}>NOK</option>
                                <option value="na" ${resp.estado==='NA'?'selected':''}>N/A</option>
                            </select>
                        </div>
                        <div style="display:flex; gap: 8px; align-items:center;">
                            <span style="font-size:10px; font-weight:bold; color:#555; white-space:nowrap;">📋 Obs:</span>
                            <textarea id="obs-${contador}" placeholder="Anotar observaciones..." style="flex-grow:1; height:32px; padding:6px; font-size:11px; border:1px solid #ccc; border-radius:4px; resize:vertical; box-sizing:border-box;">${esc(resp.obs)}</textarea>
                            <div style="flex-shrink:0;">
                                <input type="file" accept="image/*" style="display:none;" id="file-${contador}" onchange="procesarFotoParaAnotar(this, 'prev-${contador}')">
                                <button type="button" onclick="document.getElementById('file-${contador}').click()" style="font-size: 14px; padding: 4px 10px; background: #e2eaf0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color:var(--elecnor-blue); font-weight:bold; display:flex; align-items:center; height:32px;">📸 FOTO</button>
                            </div>
                        </div>
                        <div id="status-prev-${contador}" style="display:${resp.foto?'block':'none'}; color:var(--success-green); font-size:11px; font-weight:bold; margin-top:8px; background:#e9f7ef; padding:4px 8px; border-radius:4px; border:1px solid #c3e6cb; width:fit-content;">
                            ✅ Archivo incluido
                        </div>
                        <img src="${esc(resp.foto)}" class="foto-preview" id="prev-${contador}" style="display:none;">
                    </div>`;
                    contador++;
                });
            }
            return html;
        };

        if (estructura[bloquePrincipal].subgrupos) {
            for (const subKey in estructura[bloquePrincipal].subgrupos) {
                itemsHTML += `<h4 style="margin:15px 0 5px 0; color:var(--elecnor-blue); font-size:13px; border-bottom:1px solid #ccc; padding-bottom:4px; text-transform:uppercase;">${subKey}</h4>`;
                itemsHTML += procesarSeccion(subKey, estructura[bloquePrincipal].subgrupos[subKey]);
            }
        } else {
            itemsHTML += procesarSeccion(bloquePrincipal, estructura[bloquePrincipal]);
        }

        if(itemsHTML) {
            const bDiv = document.createElement('div'); 
            bDiv.className = 'seccion-principal';
            const bId = 'bloque-' + bloquePrincipal.replace(/[.\s]+/g, '');
            const btnTodoOk = bloquePrincipal === "6. Verificaciones finales" ? "" : `<button class="btn-ok-all" onclick="marcarTodoOk('${bloquePrincipal}')">Todo OK</button>`;
            bDiv.innerHTML = `<div class="cabecera-seccion"><span onclick="toggleBloque('${bId}')" style="flex-grow:1; cursor:pointer;">${bloquePrincipal} ▼</span>${btnTodoOk}</div><div class="contenido-seccion" id="${bId}" style="display:none;">${itemsHTML}</div>`;
            contenedor.appendChild(bDiv);
        }
    }
    actualizarProgreso();
}

function extraerDatosActuales() {
    const tempList = [];
    document.querySelectorAll('.inspeccion-item').forEach((item) => { 
        const radio = item.querySelector('input[type="radio"]:checked'); 
        const select = item.querySelector('select.select-estado');
        let estadoStr = 'PENDIENTE';
        if (radio) estadoStr = radio.value.toUpperCase();
        else if (select && select.value && select.value !== 'PENDIENTE') estadoStr = select.value.toUpperCase();

        const sharedObsId = item.dataset.sharedObs;
        const sharedImgId = item.dataset.sharedImg;

        let obsVal = '';
        const localArea = item.querySelector('textarea');
        if (localArea) {
            obsVal = localArea.value;
        } else if (sharedObsId) {
             const shArea = document.getElementById(sharedObsId);
             if(shArea) obsVal = shArea.value;
        }

        const realInput = item.querySelector('input[type="number"]');
        if(realInput && realInput.value) {
            if (realInput.id.startsWith('real-verif-')) {
                obsVal = `Valor: ${realInput.value} | ` + obsVal;
            } else {
                obsVal = `Medida Real: ${realInput.value} mm | ` + obsVal;
            }
        }

        const imgEl = item.querySelector('img.foto-preview') || (sharedImgId ? document.getElementById(sharedImgId) : null);
        
        tempList.push({ 
            bloque: item.dataset.bloque, 
            titulo: item.dataset.desc, 
            estado: estadoStr, 
            obs: obsVal, 
            foto: imgEl && imgEl.src.startsWith('data') ? imgEl.src : '' 
        }); 
    });
    return tempList.length > 0 ? tempList : null;
}

let writeLock = false;

async function guardarDatosCore() { 
    const eq = document.getElementById('ins-equipo').value.trim();
    const sup = document.getElementById('ins-supervisor').value.trim(); 
    
    if (!eq || !sup) { 
        alert("⚠️ Completa Equipo y Supervisor antes de guardar."); 
        return false; 
    } 
    
    if (writeLock) {
        console.warn('Escritura bloqueada por otra operación en curso, reintentando...');
        return false;
    }
    writeLock = true;
    
    // Aquí empieza nuestro "Airbag" (try/catch)
    try {
        let data = await localforage.getItem('inspecciones_data') || {}; 
        const idI = document.getElementById('edit-id').value || Date.now().toString(); 
        const d = document.getElementById('ins-disciplina').value;
        let sub = d === 'CIV' ? document.getElementById('ins-sub-civil').value : (d === 'ELE' ? document.getElementById('ins-sub-ele').value : document.getElementById('ins-modelo-mec').value + " | " + document.getElementById('ins-fila-mec').value);
        
        const n = { 
            idInterno: idI, 
            id: actualizarID(), 
            revision: parseInt(document.getElementById('ins-revision').value)||0, 
            fecha: document.getElementById('ins-fecha').value, 
            zona: document.getElementById('ins-zona').value, 
            disciplina: d, 
            subDisciplina: sub, 
            equipo: eq, 
            supervisor: sup, 
            gps: document.getElementById('ins-gps').value, 
            numPostes: parseInt(document.getElementById('ins-num-postes').value), 
            checklist: extraerDatosActuales() || [], 
            firmaSup: padsTocados['pad-supervisor'] ? pads['pad-supervisor'].canvas.toDataURL() : "", 
            firmaProp: padsTocados['pad-propiedad'] ? pads['pad-propiedad'].canvas.toDataURL() : "" 
        }; 
        
        data[idI] = n; 
        await localforage.setItem('inspecciones_data', data); 
        return true; 
        
    } catch (error) {
        // Si algo falla al guardar, el código salta directamente aquí
        console.error("Error crítico al guardar en la base de datos:", error);
        alert("❌ Ocurrió un error al intentar guardar la inspección. Comprueba el almacenamiento de tu dispositivo e inténtalo de nuevo.");
        return false;
    } finally {
        writeLock = false;
    }
}

async function guardarInspeccion() { if (await guardarDatosCore()) irInicio(); }

async function guardarYContinuar() {
    if (await guardarDatosCore()) {
        document.getElementById('edit-id').value = "";
        document.getElementById('ins-equipo').value = "";
        cargarChecklist();
        clearSig('pad-supervisor');
        clearSig('pad-propiedad');
        window.scrollTo(0, 0);
    }
}

async function guardarYClonar() {
    // Capturar el estado completo del checklist ANTES de guardar
    const checklistClonado = extraerDatosActuales();
    if (!checklistClonado) { alert("Completa Equipo y Supervisor antes de clonar."); return; }

    const saved = await guardarDatosCore();
    if (!saved) return;

    // Capturar campos del formulario que queremos mantener
    const zona       = document.getElementById('ins-zona').value;
    const disciplina = document.getElementById('ins-disciplina').value;
    const supervisor = document.getElementById('ins-supervisor').value;
    const numPostes  = document.getElementById('ins-num-postes').value;
    const fecha      = document.getElementById('ins-fecha').value;

    // Subcampos de disciplina
    const modeloMec  = disciplina === 'MEC' ? document.getElementById('ins-modelo-mec').value : null;
    const filaMec    = disciplina === 'MEC' ? document.getElementById('ins-fila-mec').value   : null;
    const subCivil   = disciplina === 'CIV' ? document.getElementById('ins-sub-civil').value  : null;
    const subEle     = disciplina === 'ELE' ? document.getElementById('ins-sub-ele').value    : null;

    // Resetear solo el equipo, GPS y el ID interno (nueva inspección)
    document.getElementById('edit-id').value      = '';
    document.getElementById('ins-revision').value = '0';
    document.getElementById('ins-equipo').value   = '';
    document.getElementById('ins-gps').value      = '';

    // Restaurar todos los demás campos
    document.getElementById('ins-fecha').value      = fecha;
    document.getElementById('ins-zona').value       = zona;
    document.getElementById('ins-disciplina').value = disciplina;
    document.getElementById('ins-num-postes').value = numPostes;
    if (modeloMec) document.getElementById('ins-modelo-mec').value = modeloMec;
    if (filaMec)   document.getElementById('ins-fila-mec').value   = filaMec;
    if (subCivil)  document.getElementById('ins-sub-civil').value  = subCivil;
    if (subEle)    document.getElementById('ins-sub-ele').value    = subEle;

    // Recargar checklist con las respuestas clonadas
    cargarChecklist(checklistClonado);

    // Limpiar firmas y actualizar UI
    clearSig('pad-supervisor');
    clearSig('pad-propiedad');
    actualizarID();
    actualizarEtiquetasEquipo();

    // Mostrar notificación visual y enfocar el campo Equipo
    window.scrollTo(0, 0);
    setTimeout(() => {
        const equipoEl = document.getElementById('ins-equipo');
        if (equipoEl) {
            equipoEl.focus();
            equipoEl.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.4)';
            equipoEl.placeholder = '← Introduce el ID del siguiente tracker';
            setTimeout(() => {
                equipoEl.style.boxShadow = '';
                equipoEl.placeholder = '';
            }, 3000);
        }
        // Toast de confirmación
        const toast = document.createElement('div');
        toast.textContent = '✅ Guardado. Introduce el siguiente tracker para clonar.';
        toast.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#4f46e5;color:white;padding:12px 22px;border-radius:8px;font-weight:700;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(79,70,229,0.35);letter-spacing:0.2px;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }, 150);
}

async function renderListado() {
    const dataObj = await localforage.getItem('inspecciones_data') || {};

    const fId    = (document.getElementById('filtro-id')    || {}).value?.toLowerCase() || '';
    const fDesde = (document.getElementById('filtro-desde') || {}).value || '';
    const fHasta = (document.getElementById('filtro-hasta') || {}).value || '';
    const fDisc  = (document.getElementById('filtro-disc')  || {}).value || 'TODOS';
    const fEq    = (document.getElementById('filtro-equipo')|| {}).value?.toLowerCase() || '';
    const fSup   = (document.getElementById('filtro-sup')   || {}).value?.toLowerCase() || '';
    const fRes   = (document.getElementById('filtro-res')   || {}).value || 'TODOS';

    const getRes = (ins) => {
        if (!ins.checklist) return 'INCOMPLETO';
        const p  = ins.checklist.some(c => c.estado === 'PENDIENTE');
        const nc = ins.checklist.some(c => c.estado === 'NOK');
        return p ? 'INCOMPLETO' : nc ? 'FALLO' : 'OK';
    };

    let lista = Object.values(dataObj).filter(ins => {
        const resStr = getRes(ins);
        if (fId    && !ins.id.toLowerCase().includes(fId))                       return false;
        if (fDesde && ins.fecha < fDesde)                                        return false;
        if (fHasta && ins.fecha > fHasta)                                        return false;
        if (fDisc !== 'TODOS' && ins.disciplina !== fDisc)                       return false;
        if (fEq   && (!ins.equipo    || !ins.equipo.toLowerCase().includes(fEq)))    return false;
        if (fSup  && (!ins.supervisor|| !ins.supervisor.toLowerCase().includes(fSup)))return false;
        if (fRes !== 'TODOS' && resStr !== fRes)                                 return false;
        return true;
    });

// ── Ordenación ─────────────────────────────────────────────────────
    lista.sort((a, b) => {
        // Si ordenamos por resultado, calculamos el valor al vuelo
        let va = listSortCol === 'resultado' ? getRes(a) : (a[listSortCol] ?? '');
        let vb = listSortCol === 'resultado' ? getRes(b) : (b[listSortCol] ?? '');
        
        if (listSortCol === 'idInterno') { va = Number(va); vb = Number(vb); }
        else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
        
        return va < vb ? -listSortDir : va > vb ? listSortDir : 0;
    });

    listLastFiltered = lista;

    // ── Indicadores de orden en cabeceras ──────────────────────────────
    // Añadimos 'resultado' a la lista de flechitas
    ['id', 'fecha', 'disciplina', 'equipo', 'supervisor', 'resultado'].forEach(col => {
        const el = document.getElementById('sort-' + col);
        if (!el) return;
        const dbCol = col === 'id' ? 'idInterno' : col;
        if (dbCol === listSortCol) el.textContent = listSortDir === 1 ? '▲' : '▼';
        else el.textContent = '';
    });

    // ── Paginación ──────────────────────────────────────────────────────
    const total    = lista.length;
    const maxPage  = Math.max(1, Math.ceil(total / listPerPage));
    listPage       = Math.min(listPage, maxPage);
    const pageStart= (listPage - 1) * listPerPage;
    const pageEnd  = Math.min(pageStart + listPerPage, total);
    const pagSlice = lista.slice(pageStart, pageEnd);

    // Contador
    const counterEl = document.getElementById('hist-counter');
    if (counterEl) counterEl.textContent = total === 0
        ? 'Sin resultados para los filtros aplicados'
        : `Mostrando ${pageStart + 1}–${pageEnd} de ${total} registros`;

    // ── Renderizar filas ────────────────────────────────────────────────
    const tbody = document.querySelector('#tabla-listado tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (pagSlice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#bbb; padding:40px; font-size:13px;">No se encontraron inspecciones con los filtros aplicados.</td></tr>';
    } else {
        let filasHTML = ''; // 🛒 Creamos nuestra "carretilla" vacía
        
        pagSlice.forEach(ins => {
            const resStr = getRes(ins);
            const resMap = { OK: { txt: 'OK', badge: 'badge-ok' }, FALLO: { txt: 'FALLO', badge: 'badge-nok' }, INCOMPLETO: { txt: 'INC.', badge: 'badge-inc' } };
            const { txt, badge } = resMap[resStr] || { txt: resStr, badge: '' };
            
            // En lugar de += en el tbody, lo metemos en nuestra carretilla
            filasHTML += `<tr>
                <td><span class="link-id" onclick="editarInspeccion('${ins.idInterno}')">${ins.id}</span></td>
                <td>${ins.fecha}</td>
                <td><span class="disc-badge disc-${ins.disciplina}">${ins.disciplina}</span></td>
                <td>${ins.equipo || '—'}</td>
                <td>${ins.supervisor || '—'}</td>
                <td><span class="${badge}">${txt}</span></td>
                <td style="text-align:center;">
                    <div style="display:flex; gap:5px; justify-content:center;">
                        <button class="btn-act btn-act-orange" onclick="reinspeccionar('${ins.idInterno}')" title="Crear nueva revisi&#243;n">&#8635; Reinsp.</button>
                        <button class="btn-act btn-act-blue" onclick="generarPDF('${ins.idInterno}')">PDF</button>
                    </div>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = filasHTML; // 🧱 Volcamos todos los resultados de golpe en la pantalla
    }

    // ── Controles de paginación ─────────────────────────────────────────
    const prevBtn = document.getElementById('btn-pag-prev');
    const nextBtn = document.getElementById('btn-pag-next');
    const pagesDiv= document.getElementById('hist-pag-pages');
    if (prevBtn) prevBtn.disabled = listPage <= 1;
    if (nextBtn) nextBtn.disabled = listPage >= maxPage;

    if (pagesDiv) {
        pagesDiv.innerHTML = '';
        const range = 2;
        for (let p = 1; p <= maxPage; p++) {
            if (p === 1 || p === maxPage || (p >= listPage - range && p <= listPage + range)) {
                const btn = document.createElement('button');
                btn.textContent = p;
                btn.className = 'btn-pag-num' + (p === listPage ? ' btn-pag-num-active' : '');
                btn.onclick = ((pg) => () => { listPage = pg; renderListado(); })(p);
                pagesDiv.appendChild(btn);
            } else if (p === listPage - range - 1 || p === listPage + range + 1) {
                const dots = document.createElement('span');
                dots.textContent = '…';
                dots.style.cssText = 'padding:0 4px; color:#aaa; line-height:30px; font-size:13px;';
                pagesDiv.appendChild(dots);
            }
        }
    }
}

function sortListado(col) {
    const dbCol = col === 'id' ? 'idInterno' : col;
    if (listSortCol === dbCol) listSortDir *= -1;
    else { listSortCol = dbCol; listSortDir = 1; }
    listPage = 1;
    renderListado();
}

function setPerPage(n) {
    listPerPage = n;
    listPage = 1;
    [25, 50, 100].forEach(v => {
        const btn = document.getElementById('btn-pp-' + v);
        if (btn) btn.className = 'btn-perpage' + (v === n ? ' btn-perpage-active' : '');
    });
    renderListado();
}

function cambiarPagina(delta) {
    const maxPage = Math.max(1, Math.ceil(listLastFiltered.length / listPerPage));
    listPage = Math.max(1, Math.min(listPage + delta, maxPage));
    renderListado();
}

function limpiarFiltrosHistorial() {
    ['filtro-id','filtro-equipo','filtro-sup'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    ['filtro-desde','filtro-hasta'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    ['filtro-disc','filtro-res'].forEach(id => { const el = document.getElementById(id); if(el) el.selectedIndex=0; });
    listPage = 1;
    renderListado();
}


async function reinspeccionar(idOld) {
    const data = await localforage.getItem('inspecciones_data'); 
    const ins = data[idOld];
    
    document.getElementById('edit-id').value = ""; 
    document.getElementById('ins-revision').value = (parseInt(ins.revision) || 0) + 1;
    
    document.getElementById('portada').style.display='none'; 
    document.getElementById('listado').style.display='none'; 
    document.getElementById('dashboard-view').style.display='none'; 
    document.getElementById('checklist').style.display='block';
    
    document.getElementById('ins-fecha').value = new Date().toISOString().split('T')[0]; 
    document.getElementById('ins-zona').value = ins.zona; 
    document.getElementById('ins-disciplina').value = ins.disciplina;
    if (ins.disciplina === 'MEC' && ins.subDisciplina) {
        const parts = ins.subDisciplina.split(" | ");
        document.getElementById('ins-modelo-mec').value = parts[0]; 
        document.getElementById('ins-fila-mec').value = parts[1];
    }
    document.getElementById('ins-equipo').value = ins.equipo; 
    document.getElementById('ins-supervisor').value = ins.supervisor; 
    document.getElementById('ins-gps').value = ins.gps; 
    document.getElementById('ins-num-postes').value = ins.numPostes;
    
    actualizarEtiquetasEquipo(); 
    cargarChecklist(ins.checklist);
    actualizarID(); 
    
    setTimeout(() => { 
        initPads(); 
        clearSig('pad-supervisor');
        clearSig('pad-propiedad');
        window.scrollTo(0, 0);
    }, 200);
}

function nuevaInspeccion() { 
    document.getElementById('edit-id').value=""; 
    document.getElementById('ins-revision').value=0; 
    document.getElementById('portada').style.display='none'; 
    document.getElementById('listado').style.display='none'; 
    document.getElementById('dashboard-view').style.display='none'; 
    document.getElementById('checklist').style.display='block'; 
    document.getElementById('ins-fecha').value = new Date().toISOString().split('T')[0]; 
    cambioDisciplinaMecanica(); 
    setTimeout(initPads, 200); 
}

async function editarInspeccion(idI) { 
    const data = await localforage.getItem('inspecciones_data'); 
    const ins = data[idI];
    document.getElementById('edit-id').value=idI; 
    document.getElementById('ins-revision').value=ins.revision;
    document.getElementById('portada').style.display='none'; 
    document.getElementById('listado').style.display='none'; 
    document.getElementById('dashboard-view').style.display='none'; 
    document.getElementById('checklist').style.display='block';
    document.getElementById('ins-fecha').value=ins.fecha; 
    document.getElementById('ins-zona').value=ins.zona; 
    document.getElementById('ins-disciplina').value=ins.disciplina;
    if(ins.disciplina === 'MEC' && ins.subDisciplina) {
        const parts = ins.subDisciplina.split(" | ");
        document.getElementById('ins-modelo-mec').value = parts[0]; 
        document.getElementById('ins-fila-mec').value = parts[1];
    }
    document.getElementById('ins-equipo').value=ins.equipo; 
    document.getElementById('ins-supervisor').value=ins.supervisor; 
    document.getElementById('ins-gps').value=ins.gps; 
    document.getElementById('ins-num-postes').value=ins.numPostes;
    actualizarEtiquetasEquipo(); 
    cargarChecklist(ins.checklist);
    setTimeout(() => { 
        initPads(); 
        if(ins.firmaSup) { let i = new Image(); i.onload = () => pads['pad-supervisor'].ctx.drawImage(i,0,0); i.src = ins.firmaSup; padsTocados['pad-supervisor'] = true; }
        if(ins.firmaProp) { let i = new Image(); i.onload = () => pads['pad-propiedad'].ctx.drawImage(i,0,0); i.src = ins.firmaProp; padsTocados['pad-propiedad'] = true; }
    }, 200);
}

function verGrande(src) { document.getElementById('modalFoto').style.display='flex'; document.getElementById('imgModal').src=src; }

let idFotoActual, imgFotoActual, ctxAnotacion, dibujandoAnotacion;

function procesarFotoParaAnotar(input, id) { 
    if (input.files?.[0]) { 
        const r = new FileReader(); 
        r.onload = (e) => { 
            const imgOriginal = new Image(); 
            imgOriginal.onload = () => {
                // === INICIO MEJORA: COMPRESIÓN DE IMÁGENES ===
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1024; // Redimensionamos a un ancho máximo razonable
                let scaleSize = 1;
                
                // Si la foto es más grande que 1024px, calculamos la proporción para reducirla
                if (imgOriginal.width > MAX_WIDTH) {
                    scaleSize = MAX_WIDTH / imgOriginal.width;
                }
                
                canvas.width = imgOriginal.width * scaleSize;
                canvas.height = imgOriginal.height * scaleSize;
                
                // Dibujamos la imagen encogida en el canvas invisible
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgOriginal, 0, 0, canvas.width, canvas.height);
                
                // Convertimos el canvas a JPEG con un 70% de calidad (muy ligera, apenas pierde nitidez)
                const fotoComprimida = canvas.toDataURL('image/jpeg', 0.7);
                
                // Pasamos la foto ya comprimida al sistema de anotación
                imgFotoActual = new Image();
                imgFotoActual.onload = () => abrirModalAnotacion(id);
                imgFotoActual.src = fotoComprimida;
                // === FIN MEJORA: COMPRESIÓN DE IMÁGENES ===
            };
            imgOriginal.src = e.target.result; 
        }; 
        r.readAsDataURL(input.files[0]); 
    } 
}

function abrirModalAnotacion(id) { 
    idFotoActual = id; 
    document.getElementById('modalAnotacion').style.display = 'flex'; 
    const c = document.getElementById('canvas-anotacion'); 
    ctxAnotacion = c.getContext('2d'); 
    
    const maxW = 800; 
    const maxH = 600; 
    let finalW = imgFotoActual.width; 
    let finalH = imgFotoActual.height; 

    if (finalW > maxW || finalH > maxH) { 
        const ratio = Math.min(maxW / finalW, maxH / finalH); 
        finalW = finalW * ratio; 
        finalH = finalH * ratio; 
    } 

    c.width = finalW; 
    c.height = finalH; 
    
    ctxAnotacion.drawImage(imgFotoActual, 0, 0, finalW, finalH); 
    ctxAnotacion.strokeStyle = 'red'; 
    ctxAnotacion.lineWidth = 4; 
}

function cerrarModalAnotacion() { 
    document.getElementById('modalAnotacion').style.display = 'none'; 
}

function limpiarAnotacion() { 
    ctxAnotacion.drawImage(imgFotoActual, 0, 0, ctxAnotacion.canvas.width, ctxAnotacion.canvas.height); 
}

function guardarAnotacion() { 
    const c = document.getElementById('canvas-anotacion'); 
    const elementId = typeof idFotoActual === 'string' ? idFotoActual : 'prev-'+idFotoActual;
    const targetImg = document.getElementById(elementId);
    const statusEl = document.getElementById('status-' + elementId);

    targetImg.src = c.toDataURL('image/jpeg', 0.7); 
    targetImg.style.display = 'none'; 
    
    if (statusEl) {
        statusEl.style.display = 'block';
    }

    cerrarModalAnotacion(); 
    actualizarProgreso();
}

function initAnotacion() {
    const c = document.getElementById('canvas-anotacion');
    
    // Nueva función unificada para ratón y eventos táctiles
    const getPos = (e) => {
        const rect = c.getBoundingClientRect();
        const scaleX = c.width / rect.width;
        const scaleY = c.height / rect.height;
        // Detectar si es un toque o un clic de ratón
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };

    // Eventos de ratón
    c.addEventListener('mousedown', (e) => { 
        dibujandoAnotacion = true; 
        const pos = getPos(e); 
        ctxAnotacion.beginPath(); 
        ctxAnotacion.moveTo(pos.x, pos.y); 
    });
    c.addEventListener('mousemove', (e) => { 
        if(dibujandoAnotacion) { 
            const pos = getPos(e); 
            ctxAnotacion.lineTo(pos.x, pos.y); 
            ctxAnotacion.stroke(); 
        } 
    });
    window.addEventListener('mouseup', () => dibujandoAnotacion = false);

    // Eventos táctiles
    c.addEventListener('touchstart', (e) => { 
        e.preventDefault(); 
        dibujandoAnotacion = true; 
        const pos = getPos(e); 
        ctxAnotacion.beginPath(); 
        ctxAnotacion.moveTo(pos.x, pos.y); 
    }, { passive: false });
    c.addEventListener('touchmove', (e) => { 
        e.preventDefault(); 
        if(!dibujandoAnotacion) return; 
        const pos = getPos(e); 
        ctxAnotacion.lineTo(pos.x, pos.y); 
        ctxAnotacion.stroke(); 
    }, { passive: false });
    c.addEventListener('touchend', () => dibujandoAnotacion = false);
}
async function generarPDF(idI) {
    mostrarCarga('Generando PDF...');
    const data = await localforage.getItem('inspecciones_data');
    const ins  = data[idI];
    if (!ins) { ocultarCarga(); alert('No se encontró la inspección.'); return; }

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const PW  = doc.internal.pageSize.width;   // 297
    const PH  = doc.internal.pageSize.height;  // 210
    let pageNum = 1;

    // ── Cargar logo ───────────────────────────────────────────────────
    let logoB64 = configGeneral.logo;
    if (!logoB64) {
        try {
            const r = await fetch('logo.jpg');
            if (r.ok) {
                const blob = await r.blob();
                logoB64 = await new Promise(res => { const fr = new FileReader(); fr.onloadend = () => res(fr.result); fr.readAsDataURL(blob); });
            }
        } catch(e) {
            console.warn('No se pudo cargar el logo:', e);
        }
    }

    // ── Funciones helper ──────────────────────────────────────────────
    const addPageHeader = (titleExtra) => {
        // Banda azul superior
        doc.setFillColor(0, 61, 112);
        doc.rect(0, 0, PW, 16, 'F');
        // Degradado simulado (banda más clara)
        doc.setFillColor(0, 85, 150);
        doc.rect(0, 10, PW, 6, 'F');

        // Logo
        if (logoB64) {
            try {
                const fmt = logoB64.includes('image/png') ? 'PNG' : 'JPEG';
                doc.addImage(logoB64, fmt, PW - 44, 1.5, 40, 13);
            } catch(e) {
                doc.setFontSize(9); doc.setTextColor(255,255,255);
                doc.setFont(undefined,'bold'); doc.text('ELECNOR', PW - 20, 9);
            }
        } else {
            doc.setFontSize(11); doc.setTextColor(255,255,255);
            doc.setFont(undefined,'bold'); doc.text('ELECNOR', PW - 22, 9);
        }

        // Título principal
        doc.setFontSize(11); doc.setTextColor(255,255,255);
        doc.setFont(undefined, 'bold');
        doc.text('INFORME DE INSPECCIÓN TÉCNICA', 8, 7);
        doc.setFontSize(8); doc.setFont(undefined, 'normal');
        doc.text(titleExtra || ins.id, 8, 12.5);

        // Número de página
        doc.setFontSize(7); doc.setTextColor(200,220,240);
        doc.text('Pág. ' + pageNum, PW - 7, 14, { align: 'right' });
    };

    const addPageFooter = () => {
        doc.setFillColor(0, 61, 112);
        doc.rect(0, PH - 7, PW, 7, 'F');
        doc.setFontSize(6); doc.setTextColor(180,200,220);
        doc.setFont(undefined, 'normal');
        doc.text('ELECNOR — Delegación Renovables, Gas y Agua', 6, PH - 2.5);
        doc.text('Documento generado digitalmente. No requiere firma física adicional.', PW / 2, PH - 2.5, { align: 'center' });
        doc.text(new Date().toLocaleDateString('es-ES'), PW - 6, PH - 2.5, { align: 'right' });
    };

    // ── PÁGINA 1 ──────────────────────────────────────────────────────
    addPageHeader(ins.id);

    // Bloque de datos del proyecto
    const iY = 20;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(6, iY, PW - 12, 28, 2, 2, 'F');
    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(6, iY, PW - 12, 28, 2, 2, 'S');

    const fields = [
        ['PROYECTO',   configGeneral.proyecto || '—',         6,    iY + 6],
        ['CLIENTE',    configGeneral.cliente   || '—',         PW/2, iY + 6],
        ['EQUIPO',     (ins.equipo + (ins.subDisciplina ? ' · ' + ins.subDisciplina : '')), 6, iY + 14],
        ['DISCIPLINA', ins.disciplina,                         PW/2, iY + 14],
        ['SUPERVISOR', ins.supervisor || '—',                  6,    iY + 22],
        ['FECHA',      ins.fecha,                              PW/2 - 30, iY + 22],
        ['GPS',        ins.gps || 'N/D',                       PW/2 + 20, iY + 22],
    ];
    fields.forEach(([label, val, x, y]) => {
        doc.setFontSize(6.5); doc.setTextColor(120,140,160); doc.setFont(undefined,'bold');
        doc.text(label, x + 4, y - 2.5);
        doc.setFontSize(8.5); doc.setTextColor(20, 40, 70); doc.setFont(undefined,'normal');
        const maxW = label === 'GPS' ? 60 : (label === 'FECHA' ? 30 : (x >= PW/2 ? PW - x - 10 : PW/2 - x - 10));
        doc.text(String(val), x + 4, y, { maxWidth: maxW });
    });

    // Banda de resultado global
    const okCount   = ins.checklist.filter(c => c.estado === 'OK').length;
    const nokCount  = ins.checklist.filter(c => c.estado === 'NOK').length;
    const pendCount = ins.checklist.filter(c => c.estado === 'PENDIENTE').length;
    const totalPts  = ins.checklist.length;
    const isOK      = nokCount === 0 && pendCount === 0;
    const hasNOK    = nokCount > 0;

    const resColor  = isOK ? [40,167,69] : hasNOK ? [220,53,69] : [255,152,0];
    const resTxt    = isOK ? 'APROBADO — SIN DEFECTOS' : hasNOK ? 'CON DEFECTOS (NOK)' : 'INCOMPLETO — PENDIENTE DE REVISIÓN';

    const rY = iY + 31;
    doc.setFillColor(...resColor);
    doc.roundedRect(6, rY, PW - 12, 11, 2, 2, 'F');
    doc.setFontSize(9); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold');
    doc.text('RESULTADO: ' + resTxt, PW / 2, rY + 7, { align: 'center' });

    // KPI strip
    const kpiY = rY + 14;
    const kpis = [
        { label: 'TOTAL PUNTOS', val: totalPts,  color: [0,85,150] },
        { label: 'APROBADOS',    val: okCount,   color: [40,167,69] },
        { label: 'DEFECTOS',     val: nokCount,  color: [220,53,69] },
        { label: 'PENDIENTES',   val: pendCount, color: [255,152,0] },
        { label: '% ÉXITO',      val: totalPts > 0 ? Math.round(okCount/totalPts*100)+'%' : '—', color: isOK ? [40,167,69] : [220,53,69] },
    ];
    const kpiW = (PW - 12) / kpis.length;
    kpis.forEach((k, i) => {
        const kx = 6 + i * kpiW;
        doc.setFillColor(248, 250, 252);
        doc.rect(kx, kpiY, kpiW, 14, 'F');
        doc.setDrawColor(210,220,235); doc.setLineWidth(0.2);
        doc.rect(kx, kpiY, kpiW, 14, 'S');
        // Top color bar
        doc.setFillColor(...k.color);
        doc.rect(kx, kpiY, kpiW, 2, 'F');
        doc.setFontSize(14); doc.setFont(undefined,'bold'); doc.setTextColor(...k.color);
        doc.text(String(k.val), kx + kpiW/2, kpiY + 9.5, { align:'center' });
        doc.setFontSize(6); doc.setFont(undefined,'normal'); doc.setTextColor(120,140,160);
        doc.text(k.label, kx + kpiW/2, kpiY + 13, { align:'center' });
    });

    // ── TABLAS DE CHECKLIST ───────────────────────────────────────────
    let startY = kpiY + 18;
    const numPostes = ins.numPostes || 1;
    const bloques = {};
    ins.checklist.forEach(c => { if (!bloques[c.bloque]) bloques[c.bloque] = []; bloques[c.bloque].push(c); });

    for (const nombreBloque in bloques) {
        const itemsBloque = bloques[nombreBloque];
        const filasMap = {};

        itemsBloque.forEach(c => {
            let baseDesc = c.titulo; let pIndex = null;
            const mP = c.titulo.match(/^Poste (\d+) - (.*)$/);
            if (mP) { pIndex = parseInt(mP[1]); baseDesc = mP[2]; }
            const mV = c.titulo.match(/^Vano (\d+)-\d+: (.*)$/);
            if (mV) { pIndex = parseInt(mV[1]); baseDesc = mV[2]; }

            if (!filasMap[baseDesc]) filasMap[baseDesc] = { desc: baseDesc, postes: {}, globales: [], obsGlobal: '', fotoGlobal: '' };
            let displayVal = c.estado === 'PENDIENTE' ? 'PEND.' : c.estado;
            const valMatch = c.obs.match(/(?:Valor|Medida Real): ([\d.-]+)/);
            if (valMatch) displayVal = valMatch[1];
            let textObs = c.obs.replace(/(?:Valor|Medida Real): ([\d.-]+) (?:mm )?\|? ?/, '').trim();
            if (pIndex !== null) { filasMap[baseDesc].postes[pIndex] = displayVal; }
            else { filasMap[baseDesc].globales.push(displayVal); }
            if (textObs && !filasMap[baseDesc].obsGlobal.includes(textObs))
                filasMap[baseDesc].obsGlobal += (filasMap[baseDesc].obsGlobal ? ' | ' : '') + textObs;
            if (c.foto && c.foto.startsWith('data:image')) filasMap[baseDesc].fotoGlobal = c.foto;
        });

        let hasPostes = Object.values(filasMap).some(f => Object.keys(f.postes).length > 0);
        const head = [['ÍTEM DE INSPECCIÓN']];
        if (hasPostes) { for (let i = 1; i <= numPostes; i++) head[0].push('P' + i); }
        else { head[0].push('ESTADO'); }
        head[0].push('OBSERVACIONES');

        const body = [];
        for (const desc in filasMap) {
            const fData = filasMap[desc]; const row = [fData.desc];
            if (hasPostes) {
                if (fData.globales.length > 0 && Object.keys(fData.postes).length === 0)
                    row.push({ content: fData.globales[0], colSpan: numPostes, styles: { halign:'center', fontStyle:'bold' } });
                else for (let i = 1; i <= numPostes; i++) row.push(fData.postes[i] || '—');
            } else {
                row.push({ content: (fData.globales[0] || '—'), styles: { halign:'center', fontStyle:'bold' } });
            }
            let obsTxt = fData.obsGlobal.trim();
            if (fData.fotoGlobal) obsTxt += (obsTxt ? ' | ' : '') + '[FOTO EN ANEXO]';
            row.push(obsTxt || '—');
            body.push(row);
        }

        if (startY > PH - 30) { addPageFooter(); doc.addPage(); pageNum++; addPageHeader(ins.id); startY = 20; }

        // Block title bar
        doc.setFillColor(0, 61, 112);
        doc.rect(6, startY - 0.5, PW - 12, 7, 'F');
        doc.setFontSize(8); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold');
        doc.text(nombreBloque.toUpperCase(), 10, startY + 4.5);

        let colStyles = {
            0: { halign:'left', cellWidth: hasPostes ? 55 : 70, fontStyle:'bold' }
        };
        if (hasPostes) {
            for (let i = 1; i <= numPostes; i++) colStyles[i] = { halign:'center', cellWidth: Math.min(12, (PW - 80) / numPostes) };
            colStyles[numPostes + 1] = { halign:'left', cellWidth:'auto' };
        } else {
            colStyles[1] = { halign:'center', cellWidth: 22 };
            colStyles[2] = { halign:'left', cellWidth:'auto' };
        }

        doc.autoTable({
            startY: startY + 7,
            head: head,
            body: body,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 2, valign:'middle', textColor: [40,40,60] },
            headStyles: { fillColor: [230,236,245], textColor: [0,61,112], fontStyle:'bold', fontSize: 7 },
            alternateRowStyles: { fillColor: [248,250,252] },
            columnStyles: colStyles,
            margin: { left: 6, right: 6 },
            didParseCell(data) {
                if (data.section !== 'body' || data.column.index === 0) return;
                const isObs = hasPostes ? (data.column.index === numPostes + 1) : (data.column.index === 2);
                if (isObs) return;
                const raw = typeof data.cell.raw === 'object' && data.cell.raw !== null ? data.cell.raw.content : data.cell.raw;
                const v = String(raw);
                
                if (v === 'OK')    { data.cell.styles.textColor = [34,139,34]; data.cell.styles.fontStyle='bold'; }
                else if (v==='NOK'){ data.cell.styles.textColor = [180,30,30]; data.cell.styles.fontStyle='bold'; data.cell.styles.fillColor=[255,240,240]; }
                else if (v==='PEND.'){ data.cell.styles.textColor=[180,100,0]; }
                // NUEVO: Tratar el estado N/A para que quede sutil y gris
                else if (v === 'NA' || v === 'N/A') { data.cell.styles.textColor=[150,150,150]; data.cell.styles.fontStyle='italic'; }
                else if (v !== '—' && v !== '') { data.cell.styles.textColor=[0,85,150]; data.cell.styles.fontStyle='bold'; }
            }
        });

        startY = doc.lastAutoTable.finalY + 10;
    }

    // ── SECCIÓN DE FIRMAS ─────────────────────────────────────────────
    if (startY > PH - 65) { addPageFooter(); doc.addPage(); pageNum++; addPageHeader(ins.id); startY = 22; }
    else { startY += 5; }

    const sigW = 115; const sigH = 42;
    const sig1X = 20; const sig2X = PW - 20 - sigW;

    // Firma 1
    doc.setFillColor(0,61,112); doc.roundedRect(sig1X, startY, sigW, 8, 1, 1, 'F');
    doc.setFontSize(8); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold');
    doc.text('FIRMA SUPERVISOR ELECNOR', sig1X + sigW/2, startY + 5.5, { align:'center' });
    doc.setDrawColor(200,215,230); doc.setLineWidth(0.3);
    doc.roundedRect(sig1X, startY + 8, sigW, sigH, 1, 1, 'S');
    doc.setFillColor(250,252,255);
    doc.roundedRect(sig1X, startY + 8, sigW, sigH, 1, 1, 'F');
    if (ins.firmaSup && ins.firmaSup.length > 500) {
        doc.addImage(ins.firmaSup, 'PNG', sig1X + 5, startY + 10, sigW - 10, sigH - 6);
    } else {
        doc.setFontSize(7); doc.setTextColor(180,190,200); doc.setFont(undefined,'italic');
        doc.text('Sin firma registrada', sig1X + sigW/2, startY + 8 + sigH/2, { align:'center' });
    }
    doc.setDrawColor(0,85,150); doc.setLineWidth(0.5);
    doc.line(sig1X + 8, startY + 8 + sigH - 2, sig1X + sigW - 8, startY + 8 + sigH - 2);

    // Firma 2
    doc.setFillColor(0,61,112); doc.roundedRect(sig2X, startY, sigW, 8, 1, 1, 'F');
    doc.setFontSize(8); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold');
    doc.text('FIRMA PROPIEDAD / CLIENTE', sig2X + sigW/2, startY + 5.5, { align:'center' });
    doc.setDrawColor(200,215,230); doc.setLineWidth(0.3);
    doc.roundedRect(sig2X, startY + 8, sigW, sigH, 1, 1, 'S');
    doc.setFillColor(250,252,255);
    doc.roundedRect(sig2X, startY + 8, sigW, sigH, 1, 1, 'F');
    if (ins.firmaProp && ins.firmaProp.length > 500) {
        doc.addImage(ins.firmaProp, 'PNG', sig2X + 5, startY + 10, sigW - 10, sigH - 6);
    } else {
        doc.setFontSize(7); doc.setTextColor(180,190,200); doc.setFont(undefined,'italic');
        doc.text('Sin firma registrada', sig2X + sigW/2, startY + 8 + sigH/2, { align:'center' });
    }
    doc.setDrawColor(0,85,150); doc.setLineWidth(0.5);
    doc.line(sig2X + 8, startY + 8 + sigH - 2, sig2X + sigW - 8, startY + 8 + sigH - 2);

    addPageFooter();

    // ── ANEXO FOTOGRÁFICO ─────────────────────────────────────────────
    const fotosUnicas = [];
    const setFotos = new Set();
    ins.checklist.forEach(c => {
        if (c.foto && c.foto.startsWith('data:image') && !setFotos.has(c.foto)) {
            setFotos.add(c.foto); fotosUnicas.push(c);
        }
    });

    if (fotosUnicas.length > 0) {
        doc.addPage(); pageNum++;
        addPageHeader('ANEXO FOTOGRÁFICO — ' + ins.id);

        doc.setFillColor(230, 236, 245);
        doc.rect(6, 18, PW - 12, 8, 'F');
        doc.setFontSize(9); doc.setTextColor(0,61,112); doc.setFont(undefined,'bold');
        doc.text('REGISTRO FOTOGRÁFICO DE EVIDENCIAS (' + fotosUnicas.length + ' imagen' + (fotosUnicas.length > 1 ? 'es' : '') + ')', PW/2, 23.5, { align:'center' });

        // 2×2 grid: 4 fotos por página
        const imgW  = 132;   // ancho imagen
        const imgH  = 64;    // alto imagen
        const capH  = 13;    // alto caption
        const gapX  = 6;     // separación horizontal
        const gapY  = 4;     // separación vertical
        const rowH  = imgH + capH + gapY;

        const xPos  = [8, 8 + imgW + gapX];       // columna 0 y 1
        const yPos  = [29, 29 + rowH];             // fila 0 y 1
        const COLS  = 2;
        const ROWS  = 2;
        const PER_PAGE = COLS * ROWS;

        fotosUnicas.forEach((f, i) => {
            const posInPage = i % PER_PAGE;

            // Nueva página cada PER_PAGE fotos (excepto la primera que ya está creada)
            if (i > 0 && posInPage === 0) {
                addPageFooter(); doc.addPage(); pageNum++;
                addPageHeader('ANEXO FOTOGRÁFICO — ' + ins.id);
                doc.setFillColor(230, 236, 245);
                doc.rect(6, 18, PW - 12, 8, 'F');
                doc.setFontSize(9); doc.setTextColor(0,61,112); doc.setFont(undefined,'bold');
                doc.text('REGISTRO FOTOGRÁFICO (' + (i+1) + '–' + Math.min(i+PER_PAGE, fotosUnicas.length) + ' de ' + fotosUnicas.length + ')', PW/2, 23.5, { align:'center' });
            }

            const col = posInPage % COLS;
            const row = Math.floor(posInPage / COLS);
            const fX  = xPos[col];
            const fY  = yPos[row];

            // Marco exterior
            doc.setFillColor(248,250,252);
            doc.roundedRect(fX - 1, fY, imgW + 2, imgH + capH, 2, 2, 'F');
            doc.setDrawColor(200,215,230); doc.setLineWidth(0.3);
            doc.roundedRect(fX - 1, fY, imgW + 2, imgH + capH, 2, 2, 'S');

            // Número de foto
            doc.setFillColor(0,61,112);
            doc.roundedRect(fX + 1, fY + 1, 9, 6, 1, 1, 'F');
            doc.setFontSize(6); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold');
            doc.text('#' + (i+1), fX + 5.5, fY + 5.2, { align:'center' });

            // Imagen
            try { doc.addImage(f.foto, 'JPEG', fX, fY + 1, imgW, imgH - 1); }
            catch(e) {
                doc.setFontSize(7); doc.setTextColor(150,150,150);
                doc.text('[Imagen no disponible]', fX + imgW/2, fY + imgH/2, { align:'center' });
            }

            // Caption
            doc.setFillColor(0,61,112);
            doc.rect(fX - 1, fY + imgH, imgW + 2, capH, 'F');
            doc.setFontSize(6.5); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold');
            const titTxt = (f.bloque + ': ' + f.titulo.replace(/^Poste \d+ - |^Vano \d+-\d+: /, '')).substring(0, 50);
            doc.text(titTxt, fX + 2, fY + imgH + 5);
            doc.setFont(undefined,'normal'); doc.setFontSize(6);
            const estadoColor = f.estado === 'OK' ? [100,200,120] : f.estado === 'NOK' ? [255,140,140] : [255,210,100];
            doc.setTextColor(...estadoColor);
            doc.text('Estado: ' + f.estado, fX + 2, fY + imgH + 10);
            if (f.obs) {
                doc.setTextColor(200,220,240);
                const obsTxt = f.obs.replace(/^(Valor|Medida Real): [\d.-]+ mm \| /, '').substring(0, 45);
                doc.text(obsTxt, fX + 28, fY + imgH + 10);
            }
        });

        addPageFooter();
    }
    ocultarCarga();
    doc.save(ins.id + '.pdf');
}

async function exportarPunchlist() {
    mostrarCarga('Generando Excel...');
    try {
        const dataObj = await localforage.getItem('inspecciones_data') || {};
        const allReports = Object.values(dataObj);

        if (allReports.length === 0) {
            ocultarCarga();
            alert("No hay inspecciones registradas.");
            return;
        }

        // --- 1. LÓGICA DE DATOS GENERAL ---
        const uniqueList = calcularEquiposUnicos(allReports);

        // Datos del punchlist (NOK + PENDIENTE)
        const punchlistItems = [];
        uniqueList.forEach(ins => {
            if (!ins.checklist) return;
            ins.checklist.forEach(c => {
                if (c.estado === 'NOK' || c.estado === 'PENDIENTE') {
                    const obsLimpia = c.obs ? c.obs.replace(/^(Valor|Medida Real): [\d.-]+ (?:mm )?\| ?/, '').trim() : '';
                    punchlistItems.push({
                        id: ins.id, fecha: ins.fecha, zona: ins.zona, disciplina: ins.disciplina,
                        subDisciplina: ins.subDisciplina || '-', equipo: ins.equipo, supervisor: ins.supervisor || '-',
                        revision: ins.revision || 0, bloque: c.bloque, titulo: c.titulo, estado: c.estado,
                        obs: obsLimpia || '-', tieneFoto: c.foto && c.foto.startsWith('data:image') ? 'SÍ' : 'NO'
                    });
                }
            });
        });

        // KPIs globales
        const kpi = calcularKPIs(uniqueList);
        const stOk = kpi.stOk, stNok = kpi.stNok, stInc = kpi.stInc;
        const totalUnicos = kpi.total;
        const pctCalidad = totalUnicos > 0 ? Math.round((stOk / totalUnicos) * 100) : 0;
        const rework = totalUnicos > 0 ? (allReports.length / totalUnicos).toFixed(2) : '0.00';

        // Lógica Ritmo 7 días
        const { ritmoDiario } = calcularRitmo7Dias(uniqueList);

        // Resumen por zona
        const zonasLabels = ['ARCO1','ARCO2','ARCO3','ARCO4','ARCO5'];
        const resumenZona = zonasLabels.map(z => {
            const items = uniqueList.filter(i => i.zona === z);
            const ok  = items.filter(i => !i.checklist?.some(c => c.estado==='NOK'||c.estado==='PENDIENTE')).length;
            const nok = items.filter(i => !i.checklist?.some(c=>c.estado==='PENDIENTE') && i.checklist?.some(c=>c.estado==='NOK')).length;
            const inc = items.filter(i => i.checklist?.some(c=>c.estado==='PENDIENTE')).length;
            const total = items.length;
            return { zona: z, total, ok, nok, inc, pct: total > 0 ? Math.round((ok/total)*100) : 0 };
        });

        // Resumen por disciplina
        const discs = ['MEC','CIV','ELE'];
        const resumenDisc = discs.map(d => {
            const items = uniqueList.filter(i => i.disciplina === d);
            const ok  = items.filter(i => !i.checklist?.some(c => c.estado==='NOK'||c.estado==='PENDIENTE')).length;
            const nok = items.filter(i => !i.checklist?.some(c=>c.estado==='PENDIENTE') && i.checklist?.some(c=>c.estado==='NOK')).length;
            const inc = items.filter(i => i.checklist?.some(c=>c.estado==='PENDIENTE')).length;
            const total = items.length;
            const defectos = punchlistItems.filter(p => p.disciplina === d && p.estado === 'NOK').length;
            return { disc: d, total, ok, nok, inc, pct: total > 0 ? Math.round((ok/total)*100) : 0, defectos };
        });

        const defectMap = {};
        punchlistItems.filter(p => p.estado === 'NOK').forEach(p => {
            const key = `[${p.disciplina}] ${p.bloque} › ${p.titulo.replace(/^Poste \d+ - |^Vano \d+-\d+: /,'')}`;
            defectMap[key] = (defectMap[key] || 0) + 1;
        });
        const topDefectos = Object.entries(defectMap).sort((a,b)=>b[1]-a[1]).slice(0,20);

        // --- LÓGICA EXCLUSIVA PARA HITOS MECÁNICOS ---
        const mecHitosData = [];
        uniqueList.forEach(ins => {
            if (!ins.checklist || ins.disciplina !== 'MEC') return;

            let hasNok = ins.checklist.some(c => c.estado === 'NOK');
            const b1 = ins.checklist.filter(c => c.bloque.startsWith('1.'));
            const b2 = ins.checklist.filter(c => c.bloque.startsWith('2.'));
            const b3 = ins.checklist.filter(c => c.bloque.startsWith('3.'));
            const b4 = ins.checklist.filter(c => c.bloque.startsWith('4.'));
            const b5 = ins.checklist.filter(c => c.bloque.startsWith('5.'));

            const evalGroup = (arr) => arr.length > 0 && !arr.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE');

            const b5_h2 = b5.filter(c => !/módulos|d-box|sbc/i.test(c.titulo));
            const b5_h3 = b5.filter(c => /módulos/i.test(c.titulo));

            let h1_ok = evalGroup(b1);
            let h2_ok = evalGroup(b2) && (b3.length === 0 || evalGroup(b3)) && evalGroup(b5_h2);
            let h3_ok = evalGroup(b4) && evalGroup(b5_h3);

            const getStr = (okCond, arrList) => {
                if (okCond) return 'OK';
                let allItems = [].concat(...arrList);
                if (allItems.some(c => c.estado === 'NOK')) return 'NOK';
                return 'PENDIENTE';
            };

            let h1_str = getStr(h1_ok, [b1]);
            let h2_str = getStr(h2_ok, [b2, b3, b5_h2]);
            let h3_str = getStr(h3_ok, [b4, b5_h3]);

            let statusGlobal = 'EN PROGRESO / INCOMPLETO';
            let bgColorGlobal = 'FFFFF3CD'; // C_AMBER

            if (hasNok) {
                statusGlobal = 'BLOQUEADO (FALLO)';
                bgColorGlobal = 'FFDC3545'; // C_RED
            } else if (h1_ok && h2_ok && h3_ok) {
                statusGlobal = 'LIBERADO TOTAL';
                bgColorGlobal = 'FF28A745'; // C_GREEN
            } else if (h1_ok && h2_ok) {
                statusGlobal = 'APTO PARA PANELES';
                bgColorGlobal = 'FF00B0F0'; // C_LBLUE
            }

            mecHitosData.push({ ins, h1_str, h2_str, h3_str, statusGlobal, bgColorGlobal });
        });

        // ================================================================
        // CONFIGURACIÓN DEL EXCEL Y ESTILOS CORPORATIVOS UNIFICADOS
        // ================================================================
        const wb = new ExcelJS.Workbook();
        wb.creator = 'SIGMA App - Elecnor';
        wb.created = new Date();

        const C_BLUE    = '00005596';
        const C_WHITE   = 'FFFFFFFF';
        const C_LGRAY   = 'FFF4F7F6';

        const hdrFont   = (sz=11) => ({ name:'Arial', bold:true, color:{argb:C_WHITE}, size:sz });
        const hdrFill   = (argb=C_BLUE) => ({ type:'pattern', pattern:'solid', fgColor:{argb} });
        const boldFont  = (sz=11, argb='FF000000') => ({ name:'Arial', bold:true, size:sz, color:{argb} });
        const normFont  = (sz=10) => ({ name:'Arial', size:sz });
        const ctrAlign  = { horizontal:'center', vertical:'middle', wrapText:true };
        const lftAlign  = { horizontal:'left',   vertical:'middle', wrapText:true };
        const thinBorder = { style:'thin', color:{argb:'FFCCCCCC'} };
        const allBorders = { top:thinBorder, left:thinBorder, bottom:thinBorder, right:thinBorder };
        const fechaHoy = new Date().toLocaleDateString('es-ES', {year:'numeric',month:'long',day:'numeric'});

        // ================================================================
        // 1. PESTAÑA: RESUMEN EJECUTIVO
        // ================================================================
        const wsRes = wb.addWorksheet('📊 RESUMEN EJECUTIVO', { tabColor:{argb:C_BLUE} });
        wsRes.views = [{ showGridLines: false }];

        wsRes.mergeCells('A1:H1');
        const tCell = wsRes.getCell('A1');
        tCell.value = `SIGMA — INFORME EJECUTIVO DE INSPECCIONES`;
        tCell.font = { name:'Arial', bold:true, size:16, color:{argb:C_WHITE} };
        tCell.fill = hdrFill(C_BLUE); tCell.alignment = ctrAlign; wsRes.getRow(1).height = 40;

        wsRes.mergeCells('A2:H2');
        const subCell = wsRes.getCell('A2');
        subCell.value = `Proyecto: ${typeof configGeneral !== 'undefined' ? configGeneral.proyecto : 'N/D'}  |  Generado: ${fechaHoy}`;
        subCell.font = { name:'Arial', size:10, color:{argb:C_WHITE} };
        subCell.fill = hdrFill('FF003D6B'); subCell.alignment = ctrAlign; wsRes.getRow(2).height = 22;

        wsRes.getRow(3).height = 12;

        wsRes.mergeCells('A4:H4');
        const kpiTitle = wsRes.getCell('A4');
        kpiTitle.value = 'KPIs GLOBALES DEL PROYECTO';
        kpiTitle.font = boldFont(12, C_BLUE); kpiTitle.alignment = lftAlign; kpiTitle.fill = hdrFill('FFE2EAF0');
        kpiTitle.border = { left:{style:'thick',color:{argb:C_BLUE}} }; wsRes.getRow(4).height = 24;

        const kpiHeaders = ['Total Equipos\nInspeccionados', 'Aprobados\n(OK)', 'Con Fallos\n(NOK activo)', 'Incompletos', '% Calidad\n(sin fallos)', 'Total Informes\n(con repasos)', 'Informes\n/ Equipo', 'Defectos\nAbiertos'];
        const kpiValues  = [totalUnicos, stOk, stNok, stInc, pctCalidad+'%', allReports.length, rework, punchlistItems.filter(p=>p.estado==='NOK').length];
        const kpiHdrRow = wsRes.getRow(5);
        kpiHeaders.forEach((h,i) => {
            const cell = kpiHdrRow.getCell(i+1); cell.value = h; cell.font = { name:'Arial', bold:true, size:9, color:{argb:C_WHITE} };
            cell.fill = hdrFill('FF004070'); cell.alignment = ctrAlign; cell.border = allBorders;
        });
        kpiHdrRow.height = 36;

        const kpiValRow = wsRes.getRow(6);
        kpiValues.forEach((v,i) => {
            const cell = kpiValRow.getCell(i+1); cell.value = v;
            cell.font = { name:'Arial', bold:true, size:18, color:{argb:'FF' + (i===2||i===7?'DC3545': i===1||i===4?'28A745':'005596')} };
            cell.alignment = ctrAlign; cell.border = allBorders; cell.fill = hdrFill(C_LGRAY);
        });
        kpiValRow.height = 50;

        wsRes.getRow(7).height = 12;

        wsRes.mergeCells('A8:H8');
        const zTitle = wsRes.getCell('A8'); zTitle.value = 'AVANCE POR ZONA (ARCO)';
        zTitle.font = boldFont(12, C_BLUE); zTitle.fill = hdrFill('FFE2EAF0'); zTitle.alignment = lftAlign; zTitle.border = { left:{style:'thick',color:{argb:C_BLUE}} }; wsRes.getRow(8).height = 24;

        const zHdrRow = wsRes.getRow(9);
        ['Zona','Total Equipos','OK (sin fallos)','NOK (fallos activos)','Incompletos','% Avance','Estado'].forEach((h,i)=>{
            const c = zHdrRow.getCell(i+1); c.value = h; c.font = hdrFont(10); c.fill = hdrFill(); c.alignment = ctrAlign; c.border = allBorders;
        });
        zHdrRow.height = 28;

        resumenZona.forEach((z, idx) => {
            const r = wsRes.getRow(10+idx);
            const estado = z.pct >= 80 ? '✅ En objetivo' : z.pct >= 40 ? '⚠️ En progreso' : z.total===0 ? '—' : '🔴 Atención';
            [z.zona, z.total, z.ok, z.nok, z.inc, z.pct+'%', estado].forEach((v,i)=>{
                const c = r.getCell(i+1); c.value = v; c.border = allBorders; c.font = normFont(10); c.alignment = i===0 ? {...lftAlign} : ctrAlign;
                if (idx%2===0) c.fill = hdrFill(C_LGRAY);
                if (i===2) c.font = { name:'Arial', size:10, bold:true, color:{argb:'FF28A745'} };
                if (i===3 && z.nok>0) c.font = { name:'Arial', size:10, bold:true, color:{argb:'FFDC3545'} };
                if (i===4 && z.inc>0) c.font = { name:'Arial', size:10, bold:true, color:{argb:'FFFF9800'} };
            });
            r.height = 20;
        });

        wsRes.getRow(15).height = 12;

        wsRes.mergeCells('A16:H16');
        const dTitle = wsRes.getCell('A16'); dTitle.value = 'AVANCE POR DISCIPLINA';
        dTitle.font = boldFont(12, C_BLUE); dTitle.fill = hdrFill('FFE2EAF0'); dTitle.alignment = lftAlign; dTitle.border = { left:{style:'thick',color:{argb:C_BLUE}} }; wsRes.getRow(16).height = 24;

        const dHdrRow = wsRes.getRow(17);
        ['Disciplina','Total Equipos','OK','NOK','Incompletos','% Avance','Defectos NOK abiertos'].forEach((h,i)=>{
            const c = dHdrRow.getCell(i+1); c.value = h; c.font = hdrFont(10); c.fill = hdrFill(); c.alignment = ctrAlign; c.border = allBorders;
        });
        dHdrRow.height = 28;

        resumenDisc.forEach((d, idx) => {
            const r = wsRes.getRow(18+idx);
            [d.disc, d.total, d.ok, d.nok, d.inc, d.pct+'%', d.defectos].forEach((v,i)=>{
                const c = r.getCell(i+1); c.value = v; c.border = allBorders; c.font = normFont(10); c.alignment = i===0 ? {...lftAlign} : ctrAlign;
                if (idx%2===0) c.fill = hdrFill(C_LGRAY);
                if (i===2) c.font = { name:'Arial', size:10, bold:true, color:{argb:'FF28A745'} };
                if (i===3 && d.nok>0) c.font = { name:'Arial', size:10, bold:true, color:{argb:'FFDC3545'} };
                if (i===6 && d.defectos>0) c.font = { name:'Arial', size:10, bold:true, color:{argb:'FFDC3545'} };
            });
            r.height = 20;
        });
        [20,16,16,20,14,12,18,18].forEach((w,i)=> wsRes.getColumn(i+1).width = w);

        // ================================================================
        // 2. PESTAÑA: ANÁLISIS DE ALCANCE
        // ================================================================
        const wsAn = wb.addWorksheet('🎯 ANÁLISIS DE ALCANCE', { tabColor:{argb:C_BLUE} });
        wsAn.views = [{ showGridLines: false }];

        wsAn.mergeCells('A1:E1');
        const anTitle = wsAn.getCell('A1');
        anTitle.value = `SIGMA — ANÁLISIS DE RITMO Y ALCANCE DETALLADO`;
        anTitle.font = { name:'Arial', bold:true, size:16, color:{argb:C_WHITE} };
        anTitle.fill = hdrFill(C_BLUE); anTitle.alignment = ctrAlign; wsAn.getRow(1).height = 40;

        wsAn.mergeCells('A2:E2');
        wsAn.getCell('A2').value = `Proyección basada en el ritmo de los últimos 7 días.`;
        wsAn.getCell('A2').font = { name:'Arial', size:10, color:{argb:C_WHITE} };
        wsAn.getCell('A2').fill = hdrFill('FF003D6B'); wsAn.getCell('A2').alignment = ctrAlign; wsAn.getRow(2).height = 22;

        wsAn.getRow(3).height = 12;

        wsAn.mergeCells('A4:E4');
        wsAn.getCell('A4').value = 'RITMO DE PRODUCCIÓN (ÚLTIMA SEMANA)';
        wsAn.getCell('A4').font = boldFont(12, C_BLUE); wsAn.getCell('A4').alignment = lftAlign; wsAn.getCell('A4').fill = hdrFill('FFE2EAF0'); wsAn.getCell('A4').border = { left:{style:'thick',color:{argb:C_BLUE}} }; wsAn.getRow(4).height = 24;

        const rHdr = wsAn.addRow(['Métrica', 'Valor', '', '', '']);
        rHdr.getCell(1).font = hdrFont(10); rHdr.getCell(1).fill = hdrFill(); rHdr.getCell(1).alignment = ctrAlign; rHdr.getCell(1).border=allBorders;
        rHdr.getCell(2).font = hdrFont(10); rHdr.getCell(2).fill = hdrFill(); rHdr.getCell(2).alignment = ctrAlign; rHdr.getCell(2).border=allBorders;
        wsAn.mergeCells(`B${rHdr.number}:E${rHdr.number}`); rHdr.height = 24;

        const r1 = wsAn.addRow(['Velocidad Actual (Equipos OK / día)', ritmoDiario.toFixed(2)]);
        r1.getCell(1).font = normFont(10); r1.getCell(1).border = allBorders; r1.getCell(1).fill = hdrFill(C_LGRAY);
        r1.getCell(2).font = boldFont(14, C_BLUE); r1.getCell(2).border = allBorders; r1.getCell(2).alignment = ctrAlign;
        wsAn.mergeCells(`B${r1.number}:E${r1.number}`); r1.height = 30;

        wsAn.getRow(r1.number + 1).height = 12;

        const sdRowIdx = r1.number + 2;
        wsAn.mergeCells(`A${sdRowIdx}:E${sdRowIdx}`);
        wsAn.getCell(`A${sdRowIdx}`).value = 'AVANCE DETALLADO POR SUB-DISCIPLINA';
        wsAn.getCell(`A${sdRowIdx}`).font = boldFont(12, C_BLUE); wsAn.getCell(`A${sdRowIdx}`).alignment = lftAlign; wsAn.getCell(`A${sdRowIdx}`).fill = hdrFill('FFE2EAF0'); wsAn.getCell(`A${sdRowIdx}`).border = { left:{style:'thick',color:{argb:C_BLUE}} }; wsAn.getRow(sdRowIdx).height = 24;

        const sdHdr = wsAn.addRow(['Especialidad / Tarea', 'Meta Obra', 'Completados (OK)', 'Pendientes', '% Avance']);
        sdHdr.eachCell(c => { c.font = hdrFont(10); c.fill = hdrFill(); c.alignment = ctrAlign; c.border = allBorders; });
        sdHdr.height = 28;

        let sdCount = 0;
        if(typeof configGeneral !== 'undefined' && configGeneral.baselines) {
            Object.keys(configGeneral.baselines).forEach(bdKey => {
                let meta = configGeneral.baselines[bdKey].reduce((a, b) => a + b, 0);
                if (meta === 0) return;
                let hechos = uniqueList.filter(ins => {
                    const discPrefix = bdKey.split('-')[0];
                    const estaOk = !ins.checklist.some(c => c.estado === 'NOK' || c.estado === 'PENDIENTE');
                    return (ins.disciplina === discPrefix && estaOk);
                }).length;
                const pct = meta > 0 ? ((hechos / meta) * 100).toFixed(1) : 0;
                const r = wsAn.addRow([bdKey, meta, hechos, meta - hechos, pct + '%']);
                r.eachCell((c, i) => { 
                    c.border = allBorders; c.font = normFont(10); c.alignment = i===1 ? {...lftAlign} : ctrAlign;
                    if (sdCount % 2 === 0) c.fill = hdrFill(C_LGRAY);
                    if (i===3) c.font = boldFont(10, 'FF28A745');
                    if (i===5) c.font = boldFont(11, parseFloat(pct) >= 100 ? 'FF28A745' : parseFloat(pct) < 30 ? 'FFDC3545' : 'FF000000');
                });
                r.height = 20;
                sdCount++;
            });
        }
        [35, 18, 20, 18, 18].forEach((w,i)=> wsAn.getColumn(i+1).width = w);

        // ================================================================
        // 3. PESTAÑA: MAPA DE CALOR
        // ================================================================
        const wsHeat = wb.addWorksheet('🗺️ MAPA DE CALOR', { tabColor:{argb:C_BLUE} });
        wsHeat.views = [{ showGridLines: false }];

        wsHeat.mergeCells('A1:E1');
        const hTitle = wsHeat.getCell('A1');
        hTitle.value = `SIGMA — MAPA DE CALOR DE DEFECTOS POR DISCIPLINA`;
        hTitle.font = { name:'Arial', bold:true, size:16, color:{argb:C_WHITE} };
        hTitle.fill = hdrFill(C_BLUE); hTitle.alignment = ctrAlign; wsHeat.getRow(1).height = 40;

        wsHeat.mergeCells('A2:E2');
        wsHeat.getCell('A2').value = `Muestra la cantidad de equipos rechazados (NOK) agrupados por Zona, fecha y separados por especialidad.`;
        wsHeat.getCell('A2').font = { name:'Arial', size:10, color:{argb:C_WHITE} };
        wsHeat.getCell('A2').fill = hdrFill('FF003D6B'); wsHeat.getCell('A2').alignment = ctrAlign; wsHeat.getRow(2).height = 22;

        wsHeat.getRow(3).height = 12;

        const wLabels = [];
        for (let w = 0; w < 4; w++) {
            const dF = new Date(); dF.setDate(dF.getDate() - ((3 - w) * 7));
            const dI = new Date(); dI.setDate(dI.getDate() - ((3 - w) * 7) - 6);
            wLabels.push(`${dI.getDate()}/${dI.getMonth()+1} al ${dF.getDate()}/${dF.getMonth()+1}`);
        }

        const disciplinasHeat = ['MEC', 'CIV', 'ELE'];
        let startRow = 4;

        disciplinasHeat.forEach(disc => {
            wsHeat.mergeCells(`A${startRow}:E${startRow}`);
            const tDisc = wsHeat.getCell(`A${startRow}`);
            const nombreDisc = disc === 'MEC' ? '⚙️ MECÁNICA' : disc === 'CIV' ? '🏗️ CIVIL' : '⚡ ELÉCTRICA';
            tDisc.value = `DEFECTOS: ${nombreDisc}`;
            tDisc.font = boldFont(12, C_BLUE);
            tDisc.fill = hdrFill('FFE2EAF0');
            tDisc.alignment = lftAlign;
            tDisc.border = { left:{style:'thick',color:{argb:C_BLUE}}, top:thinBorder, bottom:thinBorder, right:thinBorder };
            wsHeat.getRow(startRow).height = 24;
            startRow++;

            const hHeatRow = wsHeat.addRow(['ZONA / ARCO', ...wLabels]);
            hHeatRow.eachCell(c => { c.font = hdrFont(10); c.fill = hdrFill('FF003D6B'); c.alignment = ctrAlign; c.border = allBorders; });
            hHeatRow.height = 26;
            startRow++;

            zonasLabels.forEach(z => {
                const counts = [0, 0, 0, 0];
                for (let w = 0; w < 4; w++) {
                    const dF = new Date(); dF.setDate(dF.getDate() - ((3 - w) * 7));
                    const dI = new Date(); dI.setDate(dI.getDate() - ((3 - w) * 7) - 6);
                    const sIni = dI.toISOString().split('T')[0];
                    const sFin = dF.toISOString().split('T')[0];
                    counts[w] = uniqueList.filter(ins => ins.disciplina === disc && ins.zona === z && fechaGte(ins.fecha, sIni) && fechaLte(ins.fecha, sFin) && ins.checklist.some(c => c.estado === 'NOK')).length;
                }
                const r = wsHeat.addRow([z, ...counts]);
                r.getCell(1).font = boldFont(10, C_BLUE); r.getCell(1).border = allBorders; r.getCell(1).alignment = ctrAlign; r.getCell(1).fill = hdrFill(C_LGRAY);
                
                for (let i = 2; i <= 5; i++) {
                    const val = r.getCell(i).value;
                    const cell = r.getCell(i);
                    cell.border = allBorders; cell.alignment = ctrAlign;
                    if (val > 5) { cell.fill = hdrFill('FFF8D7DA'); cell.font = boldFont(12, 'FF721C24'); }
                    else if (val > 0) { cell.fill = hdrFill('FFFFF3CD'); cell.font = boldFont(12, 'FF856404'); }
                    else { cell.fill = hdrFill('FFD4EDDA'); cell.font = boldFont(11, 'FF155724'); cell.value = '0 (OK)'; }
                }
                r.height = 26;
                startRow++;
            });
            wsHeat.addRow([]);
            startRow++;
        });
        [20, 22, 22, 22, 22].forEach((w,i)=> wsHeat.getColumn(i+1).width = w);

        // ================================================================
        // 4. PESTAÑA: RESUMEN HITOS MECÁNICA (NUEVO DASHBOARD)
        // ================================================================
        const wsHitosDash = wb.addWorksheet('📊 RESUMEN HITOS MEC.', { tabColor:{argb:C_BLUE} });
        wsHitosDash.views = [{ showGridLines: false }];

        // Calcular métricas para el dashboard de Mecánica
        const mecTotal = mecHitosData.length;
        const mecLiberados = mecHitosData.filter(d => d.statusGlobal === 'LIBERADO TOTAL').length;
        const mecAptos = mecHitosData.filter(d => d.statusGlobal === 'APTO PARA PANELES').length;
        const mecBloqueados = mecHitosData.filter(d => d.statusGlobal === 'BLOQUEADO (FALLO)').length;
        const mecProgreso = mecHitosData.filter(d => d.statusGlobal === 'EN PROGRESO / INCOMPLETO').length;

        wsHitosDash.mergeCells('A1:F1');
        const hdTitle = wsHitosDash.getCell('A1');
        hdTitle.value = `SIGMA — DASHBOARD DE LIBERACIÓN MECÁNICA`;
        hdTitle.font = { name:'Arial', bold:true, size:16, color:{argb:C_WHITE} };
        hdTitle.fill = hdrFill(C_BLUE); hdTitle.alignment = ctrAlign; wsHitosDash.getRow(1).height = 40;

        wsHitosDash.mergeCells('A2:F2');
        wsHitosDash.getCell('A2').value = `Resumen gerencial de liberación por fases. Exclusivo para seguidores solares (Trackers).`;
        wsHitosDash.getCell('A2').font = { name:'Arial', size:10, color:{argb:C_WHITE} };
        wsHitosDash.getCell('A2').fill = hdrFill('FF003D6B'); wsHitosDash.getCell('A2').alignment = ctrAlign; wsHitosDash.getRow(2).height = 22;

        wsHitosDash.getRow(3).height = 12;

        // KPIs de Hitos
        wsHitosDash.mergeCells('A4:F4');
        wsHitosDash.getCell('A4').value = 'INDICADORES GLOBALES DE LIBERACIÓN';
        wsHitosDash.getCell('A4').font = boldFont(12, C_BLUE); wsHitosDash.getCell('A4').alignment = lftAlign; wsHitosDash.getCell('A4').fill = hdrFill('FFE2EAF0'); wsHitosDash.getCell('A4').border = { left:{style:'thick',color:{argb:C_BLUE}} }; wsHitosDash.getRow(4).height = 24;

        const hkpiHeaders = ['Total Trackers\nInspeccionados', 'Liberado Total\n(H1+H2+H3)', 'Aptos para Paneles\n(H1+H2)', 'En Progreso /\nIncompletos', 'Bloqueados\n(Con Fallos NOK)', ''];
        const hkpiValues  = [mecTotal, mecLiberados, mecAptos, mecProgreso, mecBloqueados, ''];
        
        const hkHdrRow = wsHitosDash.getRow(5);
        hkpiHeaders.forEach((h,i) => {
            const cell = hkHdrRow.getCell(i+1); cell.value = h; cell.font = { name:'Arial', bold:true, size:9, color:{argb:C_WHITE} };
            if(i < 5) { cell.fill = hdrFill('FF004070'); cell.alignment = ctrAlign; cell.border = allBorders; }
        });
        hkHdrRow.height = 36;

        const hkValRow = wsHitosDash.getRow(6);
        hkpiValues.forEach((v,i) => {
            const cell = hkValRow.getCell(i+1); cell.value = v;
            cell.alignment = ctrAlign; cell.border = allBorders; cell.fill = hdrFill(C_LGRAY);
            if (i === 1) cell.font = boldFont(18, 'FF28A745'); // Liberados - Verde
            else if (i === 2) cell.font = boldFont(18, 'FF00B0F0'); // Aptos - Azul Claro
            else if (i === 4) cell.font = boldFont(18, 'FFDC3545'); // Bloqueados - Rojo
            else cell.font = boldFont(18, C_BLUE);
            if(i === 5) cell.border = {}; // Limpiar borde extra
        });
        hkValRow.height = 50;

        wsHitosDash.getRow(7).height = 12;

        // Tabla de Zonas para Mecánica
        wsHitosDash.mergeCells('A8:F8');
        wsHitosDash.getCell('A8').value = 'AVANCE DE LIBERACIÓN POR ZONA (ARCOS)';
        wsHitosDash.getCell('A8').font = boldFont(12, C_BLUE); wsHitosDash.getCell('A8').alignment = lftAlign; wsHitosDash.getCell('A8').fill = hdrFill('FFE2EAF0'); wsHitosDash.getCell('A8').border = { left:{style:'thick',color:{argb:C_BLUE}} }; wsHitosDash.getRow(8).height = 24;

        const hzHdrRow = wsHitosDash.getRow(9);
        ['Zona / Arco','Total Trackers','Liberados','Aptos para Paneles','Bloqueados (NOK)','En Progreso'].forEach((h,i)=>{
            const c = hzHdrRow.getCell(i+1); c.value = h; c.font = hdrFont(10); c.fill = hdrFill(); c.alignment = ctrAlign; c.border = allBorders;
        });
        hzHdrRow.height = 28;

        zonasLabels.forEach((z, idx) => {
            const zData = mecHitosData.filter(d => d.ins.zona === z);
            const zTot = zData.length;
            const zLib = zData.filter(d => d.statusGlobal === 'LIBERADO TOTAL').length;
            const zApt = zData.filter(d => d.statusGlobal === 'APTO PARA PANELES').length;
            const zBloq = zData.filter(d => d.statusGlobal === 'BLOQUEADO (FALLO)').length;
            const zProg = zData.filter(d => d.statusGlobal === 'EN PROGRESO / INCOMPLETO').length;

            const r = wsHitosDash.getRow(10+idx);
            [z, zTot, zLib, zApt, zBloq, zProg].forEach((v,i)=>{
                const c = r.getCell(i+1); c.value = v; c.border = allBorders; c.font = normFont(10); c.alignment = i===0 ? {...lftAlign} : ctrAlign;
                if (idx%2===0) c.fill = hdrFill(C_LGRAY);
                if (i===2 && zLib > 0) c.font = boldFont(10, 'FF28A745');
                if (i===3 && zApt > 0) c.font = boldFont(10, 'FF00B0F0');
                if (i===4 && zBloq > 0) c.font = boldFont(10, 'FFDC3545');
            });
            r.height = 20;
        });

        [20, 18, 18, 18, 18, 18].forEach((w,i)=> wsHitosDash.getColumn(i+1).width = w);

        // ================================================================
        // 5. PESTAÑA: DETALLE LIBERACIÓN DE HITOS
        // ================================================================
        const wsHitos = wb.addWorksheet('🏗️ DETALLE HITOS MEC.', { tabColor:{argb:C_BLUE} });
        wsHitos.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];

        wsHitos.mergeCells('A1:G1');
        const htDetTitle = wsHitos.getCell('A1');
        htDetTitle.value = `SIGMA — LISTADO DETALLADO DE HITOS (MECÁNICA)`;
        htDetTitle.font = { name:'Arial', bold:true, size:16, color:{argb:C_WHITE} };
        htDetTitle.fill = hdrFill(C_BLUE); htDetTitle.alignment = ctrAlign; wsHitos.getRow(1).height = 40;

        wsHitos.mergeCells('A2:G2');
        wsHitos.getCell('A2').value = `Seguimiento de liberación constructiva por equipo. Evaluado sobre la última inspección de cada tracker.`;
        wsHitos.getCell('A2').font = { name:'Arial', size:10, color:{argb:C_WHITE} };
        wsHitos.getCell('A2').fill = hdrFill('FF003D6B'); wsHitos.getCell('A2').alignment = ctrAlign; wsHitos.getRow(2).height = 22;

        wsHitos.getRow(3).height = 12;

        const hHdrRowDet = wsHitos.getRow(4);
        ['ID Inspección', 'Zona', 'Equipo', 'Hito 1: Hincado', 'Hito 2: Estructura', 'Hito 3: Módulos', 'ESTADO GLOBAL'].forEach((h,i)=>{
            const c = hHdrRowDet.getCell(i+1); c.value = h; c.font = hdrFont(10); c.fill = hdrFill(); c.alignment = ctrAlign; c.border = allBorders;
        });
        wsHitos.getRow(4).height = 28;

        let hitosRowIdx = 5;
        
        mecHitosData.forEach((d, idx) => {
            const r = wsHitos.getRow(hitosRowIdx++);
            const values = [d.ins.id, d.ins.zona, d.ins.equipo, d.h1_str, d.h2_str, d.h3_str, d.statusGlobal];
            
            values.forEach((v,i) => {
                const c = r.getCell(i+1);
                c.value = v;
                c.border = allBorders;
                c.alignment = ctrAlign;
                c.font = normFont(9);

                if (i < 6) {
                    if (idx % 2 === 0) c.fill = hdrFill(C_LGRAY);
                }
                
                // Colorear texto de sub-hitos
                if (v === 'OK') c.font = boldFont(9, 'FF28A745');
                if (v === 'NOK') c.font = boldFont(9, 'FFDC3545');
                if (v === 'PENDIENTE') c.font = { name:'Arial', size:9, color:{argb:'FF888888'} };

                // Colorear el fondo de la columna de Estado Global
                if (i === 6) {
                    c.fill = hdrFill(d.bgColorGlobal);
                    c.font = boldFont(9, (d.bgColorGlobal === 'FFFFF3CD' || d.bgColorGlobal === C_LGRAY) ? 'FF000000' : C_WHITE);
                }
            });
            r.height = 20;
        });

        [18, 12, 20, 18, 18, 18, 30].forEach((w,i)=> wsHitos.getColumn(i+1).width = w);
        wsHitos.autoFilter = { from:'A4', to:`G${hitosRowIdx > 5 ? hitosRowIdx-1 : 5}` };

        // ================================================================
        // 6. PESTAÑA: PUNCHLIST
        // ================================================================
        const wsPL = wb.addWorksheet('🔴 PUNCHLIST', { tabColor:{argb:C_BLUE} });
        wsPL.views = [{ state:'frozen', ySplit:3, showGridLines:false }];

        wsPL.mergeCells('A1:M1');
        const plTitle = wsPL.getCell('A1');
        plTitle.value = 'PUNCHLIST — DEFECTOS Y PENDIENTES ACTIVOS';
        plTitle.font = hdrFont(13); plTitle.fill = hdrFill(C_BLUE); plTitle.alignment = ctrAlign; wsPL.getRow(1).height = 36;

        wsPL.mergeCells('A2:M2');
        const plSub = wsPL.getCell('A2');
        plSub.value = `Generado: ${fechaHoy}  |  Total defectos: ${punchlistItems.filter(p=>p.estado==='NOK').length}  |  Total pendientes: ${punchlistItems.filter(p=>p.estado==='PENDIENTE').length}`;
        plSub.font = { name:'Arial', size:9, italic:true, color:{argb:'FF555555'} }; plSub.alignment = ctrAlign; wsPL.getRow(2).height = 18;

        const plHeaders = ['#','ID Inspección','Fecha','Zona','Disciplina','Sub-Disciplina','Equipo','Supervisor','Rev.','Bloque / Sección','Ítem Defectuoso','Estado','Observaciones','Foto'];
        const plHdrRow = wsPL.getRow(3);
        plHeaders.forEach((h,i)=>{
            const c = plHdrRow.getCell(i+1); c.value = h; c.font = hdrFont(10); c.fill = hdrFill(); c.alignment = ctrAlign; c.border = allBorders;
        });
        wsPL.getRow(3).height = 32;

        if (punchlistItems.length === 0) {
            wsPL.mergeCells('A4:N4');
            const noData = wsPL.getCell('A4');
            noData.value = '✅ ¡Sin defectos activos! Todos los equipos inspeccionados están aprobados.';
            noData.font = boldFont(11, 'FF28A745'); noData.alignment = ctrAlign;
        } else {
            punchlistItems.forEach((item, idx) => {
                const r = wsPL.getRow(4+idx);
                const isNok = item.estado === 'NOK';
                const values = [idx+1, item.id, item.fecha, item.zona, item.disciplina, item.subDisciplina, item.equipo, item.supervisor, item.revision, item.bloque, item.titulo, item.estado, item.obs, item.tieneFoto];
                values.forEach((v,i)=>{
                    const c = r.getCell(i+1); c.value = v; c.border = allBorders; c.font = normFont(9);
                    c.alignment = (i===10||i===12) ? {...lftAlign, wrapText:true} : ctrAlign;
                    if (idx%2===0) c.fill = hdrFill(C_LGRAY);
                    if (i===11) { c.font = { name:'Arial', bold:true, size:9, color:{argb: isNok?'FFDC3545':'FFFF9800'} }; c.fill = hdrFill(isNok?'FFFDE8EA':'FFFFF3CD'); }
                });
                r.height = 28;
            });
            wsPL.autoFilter = { from:'A3', to:`N${3+punchlistItems.length}` };
        }
        [5,18,11,9,11,22,14,14,5,28,40,10,35,6].forEach((w,i)=> wsPL.getColumn(i+1).width = w);

        // ================================================================
        // 7. PESTAÑA: TOP DEFECTOS
        // ================================================================
        const wsTop = wb.addWorksheet('📈 TOP DEFECTOS', { tabColor:{argb:C_BLUE} });
        wsTop.views = [{ showGridLines: false }];

        wsTop.mergeCells('A1:E1');
        const topTitle = wsTop.getCell('A1');
        topTitle.value = 'TOP DEFECTOS MÁS FRECUENTES';
        topTitle.font = hdrFont(13); topTitle.fill = hdrFill(C_BLUE); topTitle.alignment = ctrAlign; wsTop.getRow(1).height = 36;

        wsTop.mergeCells('A2:E2');
        wsTop.getCell('A2').value = `Solo defectos NOK activos (última revisión de cada equipo)  |  Total tipos de defecto: ${topDefectos.length}`;
        wsTop.getCell('A2').font = { name:'Arial', size:9, italic:true }; wsTop.getCell('A2').alignment = ctrAlign; wsTop.getRow(2).height = 16;

        ['#','Descripción del Defecto','Ocurrencias','% sobre total NOK','Frecuencia'].forEach((h,i)=>{
            const c = wsTop.getRow(3).getCell(i+1); c.value = h; c.font = hdrFont(10); c.fill = hdrFill(); c.alignment = ctrAlign; c.border = allBorders;
        });
        wsTop.getRow(3).height = 28;

        const totalNok = punchlistItems.filter(p=>p.estado==='NOK').length;
        topDefectos.forEach(([desc, cnt], idx) => {
            const r = wsTop.getRow(4+idx);
            const pct = totalNok > 0 ? Math.round((cnt/totalNok)*100) : 0;
            const bars = '█'.repeat(Math.round(pct/5));
            [idx+1, desc, cnt, pct+'%', bars].forEach((v,i)=>{
                const c = r.getCell(i+1); c.value = v; c.border = allBorders; c.font = normFont(9);
                c.alignment = (i===1) ? {...lftAlign,wrapText:true} : ctrAlign;
                if (idx%2===0) c.fill = hdrFill(C_LGRAY);
                if (i===2) c.font = boldFont(10,'FFDC3545');
                if (i===4) c.font = { name:'Arial', size:9, color:{argb:'FFDC3545'} };
            });
            r.height = 22;
        });
        [5,60,14,18,20].forEach((w,i)=> wsTop.getColumn(i+1).width = w);

        // ================================================================
        // 8. PESTAÑA: DATOS BRUTOS
        // ================================================================
        const wsDatos = wb.addWorksheet('📋 DATOS BRUTOS', { tabColor:{argb:C_BLUE} });
        wsDatos.views = [{ state:'frozen', ySplit:1, showGridLines:true }];

        const datosHeaders = ['ID_INSPECCION','FECHA','ZONA','DISCIPLINA','SUB_DISCIPLINA','EQUIPO','SUPERVISOR','REVISION','BLOQUE','ITEM','ESTADO','OBSERVACIONES','TIENE_FOTO','ES_DEFECTO'];
        const datosHdrRow = wsDatos.getRow(1);
        datosHeaders.forEach((h,i)=>{
            const c = datosHdrRow.getCell(i+1); c.value = h; c.font = hdrFont(10); c.fill = hdrFill(); c.alignment = ctrAlign; c.border = allBorders;
        });
        wsDatos.getRow(1).height = 28;

        let rowIdx = 2;
        uniqueList.forEach(ins => {
            if (!ins.checklist) return;
            ins.checklist.forEach(c => {
                const obsLimpia = c.obs ? c.obs.replace(/^(Valor|Medida Real): [\d.-]+ (?:mm )?\| ?/, '').trim() : '';
                const r = wsDatos.getRow(rowIdx++);
                const values = [ ins.id, ins.fecha, ins.zona, ins.disciplina, ins.subDisciplina||'-', ins.equipo, ins.supervisor||'-', ins.revision||0, c.bloque, c.titulo, c.estado, obsLimpia||'-', c.foto && c.foto.startsWith('data:image') ? 'SÍ':'NO', c.estado==='NOK' ? 'SÍ' : 'NO' ];
                values.forEach((v,i)=>{ const cell = r.getCell(i+1); cell.value = v; cell.font = normFont(9); cell.border = allBorders; });
                r.height = 16;
            });
        });

        wsDatos.autoFilter = { from:'A1', to:`N${rowIdx > 2 ? rowIdx-1 : 2}` };
        [18,11,9,11,22,14,14,5,28,40,12,35,8,8].forEach((w,i)=> wsDatos.getColumn(i+1).width = w);

        // ================================================================
        // DESCARGAR ARCHIVO
        // ================================================================
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fechaStr = new Date().toISOString().split('T')[0];
        
        let nombreProyectoSeguro = "PROYECTO";
        if(typeof configGeneral !== 'undefined' && configGeneral.proyecto) {
             nombreProyectoSeguro = configGeneral.proyecto.replace(/\s+/g,'_');
        }
        
        ocultarCarga();
        a.download = `SIGMA_INFORME_${nombreProyectoSeguro}_${fechaStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        ocultarCarga();
        console.error("Error generando el Excel:", error);
        alert("Hubo un error al exportar el Excel: " + error.message);
    }
}

async function abrirIndicePlanos() {
    try {
        const resp = await fetch('planos/indice.pdf', { method: 'HEAD' });
        if (resp.ok) window.open('planos/indice.pdf', '_blank');
        else alert('El índice de planos aún no está disponible.');
    } catch {
        alert('No se pudo cargar el índice de planos.');
    }
}
initApp();