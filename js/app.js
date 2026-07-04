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
    if (!sidebar) return;

    sidebar.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        sidebar.style.transition = 'none';
    }, { passive: true });

    sidebar.addEventListener('touchmove', (e) => {
        touchMoveY = e.touches[0].clientY;
        const deltaY = touchMoveY - touchStartY;

        if (deltaY > 0) {
            sidebar.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: true });

    sidebar.addEventListener('touchend', (e) => {
        sidebar.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        const deltaY = touchMoveY - touchStartY;
        const alturaPanel = sidebar.offsetHeight;

        if (deltaY > alturaPanel * 0.20) {
            sidebar.classList.add('minimizado');
            sidebar.style.transform = '';
        } else {
            sidebar.classList.remove('minimizado');
            sidebar.style.transform = 'translateY(0)';
        }
        touchStartY = 0;
        touchMoveY = 0;
    });

    sidebar.addEventListener('click', (e) => {
        const topHeaderArea = e.clientY - sidebar.getBoundingClientRect().top;
        if (topHeaderArea < 60 && sidebar.classList.contains('minimizado')) {
            sidebar.classList.remove('minimizado');
            sidebar.style.transform = 'translateY(0)';
        }
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
}

function mostrarSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.add('active');
}

function ocultarSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.remove('active');
}
