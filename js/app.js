const CONFIG = {
    apiKey: "71840624a558616a3a05aca496cced2b",
    ciudad: "Hermosillo,MX",
    coordenadas: { lat: 29.0892, lng: -110.9613 },
    zoomInicial: 12,
    intervaloClimaMs: 600000,
    colores: {
        critica: '#d90429',
        alta: '#f77f00',
        moderada: '#fcbf49'
    },
    especies: {
        critica: "Mezquite Dulce (Prosopis glandulosa) y Palo Verde Nativo (Parkinsonia aculeata)",
        alta: "Palo Brea (Cercidium praecox) y Tecoma/San Pedro (Tecoma stans)",
        moderada: "Olneya/Palo Fierro (Olneya tesota) y Huizache (Acacia farnesiana)"
    },
    fraccionPlantable: {
        critica: 0.20,
        alta: 0.14,
        moderada: 0.08
    },
    areaCopaArbolM2: 28.27,
    umbralCritica: 44,
    umbralAlta: 41
};

let mapa = null;
let capaColonias = null;
let sectorSeleccionado = null;
let temperaturaBase = 40.0;
let touchStartY = 0;
let touchMoveY = 0;

document.addEventListener('DOMContentLoaded', function () {
    inicializarMapa();
    configurarEventos();
    mostrarSpinner();
    cargarClimaReal();
    inicializarGestosMovil();
    setInterval(cargarClimaReal, CONFIG.intervaloClimaMs);
});

function inicializarMapa() {
    mapa = L.map('map', { tap: true }).setView(
        [CONFIG.coordenadas.lat, CONFIG.coordenadas.lng],
        CONFIG.zoomInicial
    );

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19
    }).addTo(mapa);
}

function cargarClimaReal() {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${CONFIG.ciudad}&units=metric&appid=${CONFIG.apiKey}`;

    fetch(url)
        .then(respuesta => {
            if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
            return respuesta.json();
        })
        .then(datos => {
            if (datos.main && typeof datos.main.temp === 'number') {
                temperaturaBase = Math.round(datos.main.temp * 10) / 10;
                actualizarEstadoAPI('conectado', temperaturaBase);
            } else {
                throw new Error('Respuesta sin temperatura');
            }
            if (!capaColonias) cargarCapaColonias();
            else actualizarEstilosColonias();
        })
        .catch(() => {
            actualizarEstadoAPI('local', temperaturaBase);
            if (!capaColonias) cargarCapaColonias();
        });
}

function cargarCapaColonias() {
    if (typeof COLONIAS_HERMOSILLO === 'undefined') {
        actualizarEstadoAPI('error', temperaturaBase);
        ocultarSpinner();
        return;
    }

    capaColonias = L.geoJSON(COLONIAS_HERMOSILLO, {
        style: estiloColonia,
        onEachFeature: procesarColonia
    }).addTo(mapa);

    ocultarSpinner();
}

function actualizarEstilosColonias() {
    if (!capaColonias) return;
    capaColonias.eachLayer(layer => {
        if (layer === sectorSeleccionado) return;
        layer.setStyle(estiloColonia(layer.feature));
    });
}

function ajusteIslaCalor(densidad) {
    let ajuste = ((densidad - 5000) / 25000) * 3.0;
    if (ajuste > 3.5) ajuste = 3.5;
    if (ajuste < -1.0) ajuste = -1.0;
    return ajuste;
}

function calcularTemperaturaZona(props) {
    return temperaturaBase + ajusteIslaCalor(props.densidad_hab_km2);
}

function obtenerSeveridad(temp) {
    if (temp > CONFIG.umbralCritica) return 'critica';
    if (temp > CONFIG.umbralAlta) return 'alta';
    return 'moderada';
}

function obtenerColorTermico(temp) {
    return CONFIG.colores[obtenerSeveridad(temp)];
}

function estiloColonia(feature) {
    const temp = calcularTemperaturaZona(feature.properties);
    return {
        fillColor: obtenerColorTermico(temp),
        weight: 1,
        opacity: 0.4,
        color: '#ffffff',
        fillOpacity: 0.35
    };
}

function procesarColonia(feature, layer) {
    layer.bindTooltip(feature.properties.nombre, {
        permanent: false,
        direction: 'top',
        offset: [0, -10],
        className: 'colonia-tooltip',
        sticky: true
    });

    layer.on({
        click: evento => seleccionarColonia(evento.target, feature),
        mouseover: evento => resaltarAlHover(evento.target),
        mouseout: evento => deshighlightAlHover(evento.target)
    });
}

function calcularDiagnostico(props) {
    const temp = calcularTemperaturaZona(props);
    const severidad = obtenerSeveridad(temp);
    const fraccion = CONFIG.fraccionPlantable[severidad];
    const terrenoUtilizableM2 = props.terreno_utilizable_m2;

    const arboles = Math.round((terrenoUtilizableM2 * fraccion) / CONFIG.areaCopaArbolM2);

    let reduccion = (arboles / Math.max(props.area_ha, 0.01)) * 0.005;
    if (reduccion > 3.8) reduccion = 3.8;
    if (reduccion < 0.5) reduccion = 0.5;

    return { temp, severidad, arboles, reduccion };
}

function generarJustificacion(props, diagnostico) {
    const plantillas = {
        critica: `${props.nombre} presenta una isla de calor crítica (${diagnostico.temp.toFixed(1)}°C) con densidad de ${props.densidad_hab_km2.toLocaleString()} hab/km². De sus ${props.terreno_utilizable_ha} ha de terreno utilizable, se recomienda plantar ${diagnostico.arboles.toLocaleString()} árboles nativos para generar sombra y activar evapotranspiración.`,
        alta: `${props.nombre} registra estrés térmico elevado (${diagnostico.temp.toFixed(1)}°C). Con ${props.terreno_utilizable_ha} ha de terreno utilizable disponible, ${diagnostico.arboles.toLocaleString()} árboles adaptados ayudarían a mitigar la radiación absorbida en calles y banquetas.`,
        moderada: `${props.nombre} mantiene una temperatura moderada (${diagnostico.temp.toFixed(1)}°C). Se recomienda reforestación preventiva con ${diagnostico.arboles.toLocaleString()} árboles en su terreno utilizable (${props.terreno_utilizable_ha} ha) para fortalecer corredores verdes.`
    };
    return plantillas[diagnostico.severidad];
}

function seleccionarColonia(layer, feature) {
    const props = feature.properties;

    if (sectorSeleccionado) mapa.removeLayer(sectorSeleccionado);

    sectorSeleccionado = L.geoJSON(feature, {
        style: {
            fillColor: obtenerColorTermico(calcularTemperaturaZona(props)),
            weight: 2,
            opacity: 0.8,
            color: '#2a9d8f',
            fillOpacity: 0.55
        }
    }).addTo(mapa);

    const diagnostico = calcularDiagnostico(props);
    const especies = CONFIG.especies[diagnostico.severidad];
    const justificacion = generarJustificacion(props, diagnostico);

    document.getElementById('instruction').classList.add('hidden');
    document.getElementById('details').classList.remove('hidden');

    const sidebarElement = document.querySelector('.sidebar');
    if (sidebarElement) {
        sidebarElement.classList.remove('minimizado');
        sidebarElement.style.transform = 'translateY(0)';
        sidebarElement.scrollTop = 0; // Regresa el contenido arriba al abrir una nueva colonia
        
        const btnReabrir = document.getElementById('btn-reabrir-panel');
        if (btnReabrir) btnReabrir.style.transform = 'translateX(-50%) translateY(100px)';
    }

    document.getElementById('colonia-name').textContent = props.nombre;
    document.getElementById('colonia-temp').textContent = `${diagnostico.temp.toFixed(1)}°C`;
    document.getElementById('ageb-code').textContent = props.num_agebs;
    document.getElementById('area-total').textContent = `${props.area_ha.toLocaleString()} ha`;
    document.getElementById('poblacion-total').textContent = props.poblacion.toLocaleString();
    document.getElementById('densidad-total').textContent = `${props.densidad_hab_km2.toLocaleString()} hab/km²`;
    document.getElementById('terreno-utilizable').textContent = `${props.terreno_utilizable_ha} ha (${props.terreno_utilizable_pct}%)`;
    document.getElementById('tree-count').textContent = `${diagnostico.arboles.toLocaleString()} árboles`;
    document.getElementById('species-suggested').textContent = especies;
    document.getElementById('temp-reduction').textContent = `-${diagnostico.reduccion.toFixed(1)}°C`;

    const txtJustificacion = document.getElementById('justificacion-tecnica') || document.getElementById('ai-rationale');
    if (txtJustificacion) {
        txtJustificacion.textContent = justificacion;
    }

    window.diagnosticoActual = { props, diagnostico, justificacion, especies };

    mapa.fitBounds(L.geoJSON(feature).getBounds(), { padding: window.innerWidth > 768 ? [100, 350] : [40, 40] });
}

function resaltarAlHover(layer) {
    if (layer !== sectorSeleccionado) {
        layer.setStyle({
            weight: 1.5,
            color: '#2a9d8f',
            opacity: 0.7,
            fillOpacity: 0.45
        });
    }
}

function deshighlightAlHover(layer) {
    if (capaColonias && layer !== sectorSeleccionado) {
        capaColonias.resetStyle(layer);
    }
}

function actualizarEstadoAPI(estado, temperatura) {
    const statusText = document.getElementById('api-status-text');
    if (!statusText) return;

    if (estado === 'conectado') {
        statusText.textContent = `${temperatura}°C en vivo`;
        statusText.style.color = '#2a9d8f';
    } else if (estado === 'error') {
        statusText.textContent = 'Error al cargar datos';
        statusText.style.color = '#d90429';
    } else {
        statusText.textContent = `${temperatura}°C (sin conexión)`;
        statusText.style.color = '#f77f00';
    }
}

function inicializarGestosMovil() {
    if (window.innerWidth > 768) return;

    const sidebar = document.querySelector('.sidebar');
    const dragHandle = document.querySelector('.sidebar-header'); 
    if (!sidebar || !dragHandle) return;

    let btnReabrir = document.getElementById('btn-reabrir-panel');
    if (!btnReabrir) {
        btnReabrir = document.createElement('button');
        btnReabrir.id = 'btn-reabrir-panel';
        btnReabrir.innerHTML = 'Ver Diagnóstico';
        btnReabrir.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: #2a9d8f;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 30px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 9999;
            transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            cursor: pointer;
        `;
        document.body.appendChild(btnReabrir);

        btnReabrir.addEventListener('click', () => {
            sidebar.classList.remove('minimizado');
            sidebar.style.transform = 'translateY(0)';
            btnReabrir.style.transform = 'translateX(-50%) translateY(100px)';
        });
    }


    dragHandle.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        sidebar.style.transition = 'none';
    }, { passive: true });

    dragHandle.addEventListener('touchmove', (e) => {
        touchMoveY = e.touches[0].clientY;
        const deltaY = touchMoveY - touchStartY;

        if (deltaY > 0) {
            sidebar.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: true });

    dragHandle.addEventListener('touchend', (e) => {
        sidebar.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        const deltaY = touchMoveY - touchStartY;
        const alturaPanel = sidebar.offsetHeight;

        if (deltaY > alturaPanel * 0.15) { 
            sidebar.classList.add('minimizado');
            sidebar.style.transform = 'translateY(100%)';
            btnReabrir.style.transform = 'translateX(-50%) translateY(0)';
        } else {
            sidebar.classList.remove('minimizado');
            sidebar.style.transform = 'translateY(0)';
            btnReabrir.style.transform = 'translateX(-50%) translateY(100px)';
        }
        touchStartY = 0;
        touchMoveY = 0;
    });
}

function configurarEventos() {
    const btnCerrar = document.getElementById('close-details');
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarDetalles);

    const btnExportar = document.getElementById('export-btn');
    if (btnExportar) btnExportar.addEventListener('click', exportarDiagnostico);

    window.addEventListener('resize', () => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && window.innerWidth > 768) {
            sidebar.classList.remove('minimizado');
            sidebar.style.transform = '';
            const btnReabrir = document.getElementById('btn-reabrir-panel');
            if (btnReabrir) btnReabrir.style.transform = 'translateX(-50%) translateY(100px)';
        }
    });
}

function cerrarDetalles() {
    document.getElementById('instruction').classList.remove('hidden');
    document.getElementById('details').classList.add('hidden');
    if (sectorSeleccionado) {
        mapa.removeLayer(sectorSeleccionado);
        sectorSeleccionado = null;
    }
    const btnReabrir = document.getElementById('btn-reabrir-panel');
    if (btnReabrir) btnReabrir.style.transform = 'translateX(-50%) translateY(100px)';
}

function exportarDiagnostico() {
    if (!window.diagnosticoActual) return;
    const { props, diagnostico, justificacion, especies } = window.diagnosticoActual;

    const fechaHoy = new Date().toLocaleDateString('es-MX', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

   
    const contenidoHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="utf-8">
            <title>Reporte de Diagnóstico Urbano - Hermosillo Verde</title>
            <style>
                body { font-family: 'Arial', sans-serif; color: #333333; line-height: 1.6; }
                h1 { color: #2a9d8f; font-size: 22pt; margin-bottom: 5pt; border-bottom: 2px solid #2a9d8f; padding-bottom: 5pt; }
                h2 { color: #264653; font-size: 14pt; margin-top: 20pt; margin-bottom: 8pt; }
                p { font-size: 11pt; margin-bottom: 10pt; }
                .meta-table { width: 100%; border-collapse: collapse; margin-top: 15pt; margin-bottom: 15pt; }
                .meta-table th, .meta-table td { border: 1px solid #cccccc; padding: 8px; font-size: 10.5pt; text-align: left; }
                .meta-table th { background-color: #f4f4f4; color: #264653; font-weight: bold; width: 40%; }
                .badge { font-weight: bold; padding: 3px 8px; border-radius: 3px; color: white; text-transform: uppercase; display: inline-block; }
                .critica { background-color: #d90429; }
                .alta { background-color: #f77f00; }
                .moderada { background-color: #fcbf49; color: #333333; }
                .destacado { background-color: #e8f5f3; border-left: 4px solid #2a9d8f; padding: 12px; margin-top: 15pt; margin-bottom: 15pt; }
                .footer { font-size: 9pt; color: #777777; margin-top: 40pt; border-top: 1px solid #dddddd; padding-top: 5pt; text-align: center; }
            </style>
        </head>
        <body>
            <h1>Reporte de Diagnóstico Urbano</h1>
            <p><strong>Plataforma:</strong> Hermosillo Verde &bull; Simulador de Reforestación</p>
            <p><strong>Fecha de Generación:</strong> ${fechaHoy}</p>
            
            <h2>1. Información General del Sector</h2>
            <table class="meta-table">
                <tr>
                    <th>Colonia / Sector</th>
                    <td><strong>${props.nombre}</strong></td>
                </tr>
                <tr>
                    <th>Código AGEB</th>
                    <td>${props.num_agebs || 'N/A'}</td>
                </tr>
                <tr>
                    <th>Superficie Total</th>
                    <td>${props.area_ha.toLocaleString()} ha</td>
                </tr>
                <tr>
                    <th>Población Absoluta</th>
                    <td>${props.poblacion.toLocaleString()} habitantes</td>
                </tr>
                <tr>
                    <th>Densidad de Población</th>
                    <td>${props.densidad_hab_km2.toLocaleString()} hab/km²</td>
                </tr>
            </table>

            <h2>2. Diagnóstico Térmico e Isla de Calor</h2>
            <table class="meta-table">
                <tr>
                    <th>Temperatura Estimada en Zona</th>
                    <td><strong>${diagnostico.temp.toFixed(1)}°C</strong></td>
                </tr>
                <tr>
                    <th>Nivel de Severidad Térmica</th>
                    <td><span class="badge ${diagnostico.severidad}">${diagnostico.severidad}</span></td>
                </tr>
            </table>

            <h2>3. Plan de Intervención Forestal Propuesto</h2>
            <table class="meta-table">
                <tr>
                    <th>Terreno Utilizable para Plantación</th>
                    <td>${props.terreno_utilizable_ha} ha (${props.terreno_utilizable_pct}%)</td>
                </tr>
                <tr>
                    <th>Cuota de Árboles Recomendada</th>
                    <td><strong>${diagnostico.arboles.toLocaleString()} árboles</strong></td>
                </tr>
                <tr>
                    <th>Especies Nativas Sugeridas</th>
                    <td>${especies}</td>
                </tr>
                <tr>
                    <th>Mitigación Térmica Estimada</th>
                    <td><strong>-${diagnostico.reduccion.toFixed(1)}°C de reducción</strong></td>
                </tr>
            </table>

            <h2>4. Justificación Técnica</h2>
            <div class="destacado">
                <p style="margin: 0; font-style: italic;">"${justificacion}"</p>
            </div>

            <div class="footer">
                <p>Documento generado de forma automatizada por Hermosillo Verde &copy; 2026. Diseñado para la resiliencia climática urbana.</p>
            </div>
        </body>
        </html>
    `;


    const blob = new Blob(['\ufeff' + contenidoHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
  
    link.download = `Diagnostico_Urbano_${props.nombre.replace(/\s+/g, '_')}.doc`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function mostrarSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.add('active');
}

function ocultarSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.remove('active');
}
