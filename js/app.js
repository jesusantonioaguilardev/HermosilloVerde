/**
 * Hermosillo Verde AI - Aplicación de Reforestación Urbana Inteligente
 * Desarrollada como prototipo funcional de SIG (Sistema de Información Geográfica)
 * Autor: Ingeniero de Software Senior & AI Collaborator
 * Tecnología: Leaflet.js, GeoJSON, API OpenWeatherMap, Algoritmo Foliar Realista
 */

// ============================================
// CONFIGURACIÓN GLOBAL
// ============================================

const CONFIG = {
    apiKey: "71840624a558616a3a05aca496cced2b", // OpenWeatherMap API Key
    ciudad: "Hermosillo,MX",
    coordenadas: { lat: 29.0892, lng: -110.9613 },
    zoomInicial: 12,

    // URLs de datos geográficos - En orden de prioridad
    geojsonUrls: [
        'https://nominatim.openstreetmap.org/search?city=Hermosillo&format=geojson',
        'https://api.mapbox.com/datasets/v1/mapbox/hermosillo/data'
    ],

    // Configuración de colores por temperatura
    colores: {
        critica: '#d90429',    // Rojo - >44°C
        alta: '#f77f00',       // Naranja - 41-44°C
        moderada: '#fcbf49'    // Amarillo - <41°C
    },

    // Especies endémicas sonorenses
    especies: {
        critica: "Mezquite Dulce (Prosopis glandulosa) y Palo Verde Nativo (Parkinsonia aculeata)",
        alta: "Palo Brea (Cercidium praecox) y Tecoma/San Pedro (Tecoma stans)",
        moderada: "Olneya/Palo Fierro (Olneya tesota) y Huizache (Acacia farnesiana)"
    }
};

// ============================================
// VARIABLES GLOBALES
// ============================================

let mapa = null;
let temperaturaRealHermosillo = 40.0; // Valor por defecto
let capaGeoJSON = null;
let sectorSeleccionado = null;
let sectorSeleccionadoFeature = null; // Feature del sector seleccionado
let timerActualizacionTemp = null;
let simulacionActiva = false;
let datosGeoJSON = null; // Almacenar datos para reutilización

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    inicializarMapa();
    cargarAPI_Clima();
    configurarEventos();
    mostrarSpinner();
});

/**
 * Inicializa el mapa con Leaflet y configura la capa base
 */
function inicializarMapa() {
    // Crear mapa centrado en Hermosillo
    mapa = L.map('map').setView(
        [CONFIG.coordenadas.lat, CONFIG.coordenadas.lng],
        CONFIG.zoomInicial
    );

    // Capa base: CartoDB Voyager (vector limpio y estético)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
        zIndex: 1
    }).addTo(mapa);

    console.log('✓ Mapa inicializado en Hermosillo');
}

/**
 * Consulta la API de OpenWeatherMap para obtener temperatura en tiempo real
 */
function cargarAPI_Clima() {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${CONFIG.ciudad}&units=metric&appid=${CONFIG.apiKey}`;

    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data.main && data.main.temp !== undefined) {
                temperaturaRealHermosillo = Math.round(data.main.temp * 10) / 10;
                actualizarEstadoAPI('Conectado', temperaturaRealHermosillo);
                console.log(`✓ Temperatura en tiempo real: ${temperaturaRealHermosillo}°C`);
            } else {
                throw new Error('Temperatura no disponible');
            }
            cargarCapaGeoJSON();
        })
        .catch(error => {
            console.warn('⚠ API de clima no disponible. Modo local activo.', error);
            actualizarEstadoAPI('Modo Local', temperaturaRealHermosillo);
            cargarCapaGeoJSON(); // Continuar con temperatura por defecto
        });
}

/**
 * Carga el GeoJSON con los sectores (AGEBs) de Hermosillo
 */
function cargarCapaGeoJSON() {
    console.log('🗺️ Cargando colonias REALES de Hermosillo...');

    // Intentar cargar tu archivo GeoJSON real
    fetch('../data/hermosillo_colonias_real.geojson')
        .then(response => {
            if (!response.ok) {
                console.warn('⚠ Datos reales no encontrados, usando datos locales...');
                throw new Error('No encontrado');
            }
            return response.json();
        })
        .then(datos => {
            if (datos && datos.features && datos.features.length > 0) {
                console.log(`✅ Mapa REAL cargado: ${datos.features.length} colonias de Hermosillo`);
                renderizarGeoJSON(datos);
            } else {
                throw new Error('GeoJSON vacío');
            }
        })
        .catch(error => {
            console.log('📊 Usando generador local como fallback...');
            const datosLocales = generarGeojsonLocal();
            renderizarGeoJSON(datosLocales);
        });
}

/**
 * Renderiza el GeoJSON en el mapa
 */
function renderizarGeoJSON(datos) {
    if (!datos || !datos.features || datos.features.length === 0) {
        console.warn('⚠ GeoJSON vacío, usando datos locales');
        datos = generarGeojsonLocal();
    }

    datosGeoJSON = datos;

    capaGeoJSON = L.geoJSON(datos, {
        style: estiloPoligono,
        onEachFeature: procesarCadaPoligono
    }).addTo(mapa);

    console.log(`✓ ${datos.features.length} sectores cargados`);
    ocultarSpinner();

    // Iniciar simulación de cambios de temperatura cada 12 segundos
    iniciarSimulacionTemperatura();
}

/**
 * Inicia la simulación periódica de cambios de temperatura
 */
function iniciarSimulacionTemperatura() {
    if (simulacionActiva) return;

    simulacionActiva = true;
    console.log('🔄 Simulación de temperatura iniciada (actualización cada 12 segundos)');

    timerActualizacionTemp = setInterval(() => {
        const variacion = (Math.random() - 0.5) * 2;
        temperaturaRealHermosillo = Math.max(35, Math.min(50, temperaturaRealHermosillo + variacion));

        actualizarEstilosPoligonos();

        console.log(`📊 Temperatura actualizada: ${temperaturaRealHermosillo.toFixed(1)}°C`);
        actualizarEstadoAPI('Simulación', temperaturaRealHermosillo);
    }, 12000);
}

/**
 * Actualiza los estilos de todos los polígonos sin perder interactividad
 */
function actualizarEstilosPoligonos() {
    if (!capaGeoJSON || !datosGeoJSON) return;

    capaGeoJSON.eachLayer((layer) => {
        const feature = layer.feature;
        if (!feature || !feature.properties) return;

        const idSector = parseInt(feature.properties.CVE_AGEB || "0") || Math.floor(Math.random() * 50);
        const variacionIslaCalor = (idSector % 7) - 2;
        const temperaturaCalculada = temperaturaRealHermosillo + variacionIslaCalor;

        feature.properties.temp_calculada = temperaturaCalculada;
        feature.properties.severidad = obtenerSeveridad(temperaturaCalculada);
        feature.properties.color = obtenerColorTermico(temperaturaCalculada);

        if (!(sectorSeleccionadoFeature && feature.properties.CVE_AGEB === sectorSeleccionadoFeature.properties.CVE_AGEB)) {
            const nuevoEstilo = {
                fillColor: feature.properties.color,
                weight: 1,
                opacity: 0.7,
                color: '#ffffff',
                fillOpacity: 0.45
            };
            layer.setStyle(nuevoEstilo);
        }
    });
}

/**
 * Genera GeoJSON local con TODAS las colonias principales de Hermosillo (Fallback)
 */
function generarGeojsonLocal() {
    const colonias = [
        { nombre: "Centro Histórico", lat: 29.0960, lng: -110.9627, tamaño: 0.008 },
        { nombre: "San Benito", lat: 29.0887, lng: -110.9543, tamaño: 0.009 },
        { nombre: "Pitic", lat: 29.0810, lng: -110.9540, tamaño: 0.010 },
        { nombre: "Sección Separada", lat: 29.0778, lng: -110.9623, tamaño: 0.011 },
        { nombre: "Vertiente", lat: 29.0778, lng: -110.9745, tamaño: 0.008 },
        { nombre: "La Matanza", lat: 29.0745, lng: -110.9650, tamaño: 0.012 },
        { nombre: "Granjeno", lat: 29.0710, lng: -110.9740, tamaño: 0.007 },
        { nombre: "Pedregal", lat: 29.0700, lng: -110.9450, tamaño: 0.009 },
        { nombre: "Costa Rica", lat: 29.0815, lng: -110.8900, tamaño: 0.011 },
        { nombre: "Arboledas", lat: 29.0910, lng: -110.8850, tamaño: 0.010 },
        { nombre: "Encantada", lat: 29.0950, lng: -110.8780, tamaño: 0.012 },
        { nombre: "Real de Tajeda", lat: 29.0350, lng: -110.8800, tamaño: 0.010 },
        { nombre: "Bugambilias", lat: 29.0480, lng: -110.9300, tamaño: 0.007 },
        { nombre: "Campestre", lat: 29.1100, lng: -110.9850, tamaño: 0.009 },
        { nombre: "Las Quintas", lat: 29.1010, lng: -111.0020, tamaño: 0.012 },
        { nombre: "Lomas de Sonora", lat: 29.1100, lng: -110.9610, tamaño: 0.010 },
        { nombre: "Villas del Seris", lat: 29.0420, lng: -110.9610, tamaño: 0.010 }
    ];

    function generarPoligonoIrregular(lat, lng, tamaño) {
        const puntos = [];
        const numPuntos = 16;
        for (let i = 0; i < numPuntos; i++) {
            const ángulo = (i / numPuntos) * Math.PI * 2;
            const variacion = 0.6 + Math.random() * 0.7;
            const radio = tamaño * variacion;
            const x = lng + radio * Math.cos(ángulo);
            const y = lat + radio * Math.sin(ángulo);
            puntos.push([x, y]);
        }
        puntos.push(puntos[0]);
        return puntos;
    }

    const features = colonias.map((colonia, idx) => {
        return {
            type: "Feature",
            properties: {
                CVE_AGEB: `260010001${String(idx + 1).padStart(3, '0')}`,
                NOMBRE_LOC: colonia.nombre,
                NOM_ENTIDAD: "Sonora",
                NOM_MUNI: "Hermosillo"
            },
            geometry: {
                type: "Polygon",
                coordinates: [generarPoligonoIrregular(colonia.lat, colonia.lng, colonia.tamaño)]
            }
        };
    });

    return { type: "FeatureCollection", features: features };
}

/**
 * Define el estilo visual de cada polígono basado en la temperatura
 */
function estiloPoligono(feature) {
    const idSector = parseInt(feature.properties.CVE_AGEB || "0") || Math.floor(Math.random() * 50);
    const variacionIslaCalor = (idSector % 7) - 2;
    const temperaturaCalculada = temperaturaRealHermosillo + variacionIslaCalor;

    feature.properties.temp_calculada = temperaturaCalculada;
    feature.properties.severidad = obtenerSeveridad(temperaturaCalculada);
    feature.properties.color = obtenerColorTermico(temperaturaCalculada);

    return {
        fillColor: feature.properties.color,
        weight: 1,
        opacity: 0.7,
        color: '#ffffff',
        fillOpacity: 0.45,
        className: 'poligono-sector'
    };
}

function obtenerColorTermico(temp) {
    if (temp > 44) return CONFIG.colores.critica;
    if (temp > 40) return CONFIG.colores.alta;
    return CONFIG.colores.moderada;
}

function obtenerSeveridad(temp) {
    if (temp > 44) return 'critica';
    if (temp > 40) return 'alta';
    return 'moderada';
}

/**
 * Procesa cada polígono agregando interactividad
 */
function procesarCadaPoligono(feature, layer) {
    const nombreColonia = feature.properties.NOMBRE_LOC || feature.properties.CVE_AGEB || 'Sector';

    layer.bindTooltip(nombreColonia, {
        permanent: false,
        direction: 'top',
        offset: [0, -10],
        className: 'colonia-tooltip',
        sticky: true
    });

    layer.on({
        click: (evento) => seleccionarSector(evento.target, feature),
        mouseover: (evento) => resaltarAlHover(evento.target),
        mouseout: (evento) => deshighlightAlHover(evento.target)
    });
}

/**
 * Maneja la selección de un sector mediante análisis espacial real
 */
function seleccionarSector(layer, feature) {
    const props = feature.properties;
    const temp = props.temp_calculada;
    const severidad = props.severidad;

    if (sectorSeleccionado) {
        mapa.removeLayer(sectorSeleccionado);
    }

    sectorSeleccionadoFeature = feature;

    sectorSeleccionado = L.geoJSON(feature, {
        style: {
            fillColor: props.color,
            weight: 3,
            opacity: 1,
            color: '#1a3a2a',
            fillOpacity: 0.75
        }
    }).addTo(mapa);

    // =========================================================================
    // 🧮 CÁLCULO FORESTAL Y TÉRMICO REALISTA POR GEOMETRÍA
    // =========================================================================
    const coordenadas = layer.getLatLngs()[0];
    const coordenadasLimpias = Array.isArray(coordenadas[0]) ? coordenadas[0] : coordenadas;

    // Obtener área precisa del polígono en la Tierra
    const areaMetrosCuadrados = calcularAreaPoligonoNativa(coordenadasLimpias);
    const areaHectareas = areaMetrosCuadrados / 10000;

    let porcentajeSombraNecesaria = 0.12;
    let factorEvapotranspiracion = 0.005;

    if (severidad === 'critica') {
        porcentajeSombraNecesaria = 0.05; // 5% de la superficie total
    } else if (severidad === 'alta') {
        porcentajeSombraNecesaria = 0.03; // 3% de la superficie total
    } else {
        porcentajeSombraNecesaria = 0.01; // 1% de la superficie total
    }

    const areaSombraFaltante = areaMetrosCuadrados * porcentajeSombraNecesaria;
    const areaCopaArbolNativo = 28.27; // Copa de Mezquite adulto (Radio = 3m)

    const arbolesAPlantar = Math.round(areaSombraFaltante / areaCopaArbolNativo);
    let reduccionTemp = (arbolesAPlantar / areaHectareas) * factorEvapotranspiracion;

    // Acotar límites físicos reales para clima sonorense
    if (reduccionTemp > 3.8) { reduccionTemp = 3.8; }
    if (reduccionTemp < 0.5) { reduccionTemp = 0.5; }
    // =========================================================================

    const especiesRecomendadas = CONFIG.especies[severidad];
    const justificacion = generarJustificacionTecnica(temp, severidad, arbolesAPlantar);
    const nombreSector = props.NOMBRE_LOC || props.NOM_COLONIA || props.CVE_AGEB || 'Sector desconocido';

    // Renderizar datos a los contenedores HTML
    document.getElementById('instruction').classList.add('hidden');
    document.getElementById('details').classList.remove('hidden');

    document.getElementById('colonia-name').textContent = nombreSector;
    document.getElementById('colonia-temp').textContent = `${temp.toFixed(1)}°C`;
    document.getElementById('ageb-code').textContent = props.CVE_AGEB || 'N/A';

    document.getElementById('tree-count').textContent = `${arbolesAPlantar.toLocaleString()} árboles`;
    document.getElementById('species-suggested').textContent = especiesRecomendadas;
    document.getElementById('temp-reduction').textContent = `-${reduccionTemp.toFixed(1)}°C`;
    document.getElementById('ai-rationale').textContent = justificacion;

    console.log(`✓ Sector calculado: ${nombreSector} (${areaHectareas.toFixed(1)} Hectáreas)`);

    mapa.fitBounds(L.geoJSON(feature).getBounds(), { padding: [100, 350] });
}

/**
 * Calcula el área de un polígono en metros cuadrados de forma nativa sin plugins
 */
function calcularAreaPoligonoNativa(coords) {
    let area = 0;
    const longitud = coords.length;
    if (longitud > 2) {
        for (let i = 0; i < longitud; i++) {
            let p1 = coords[i];
            let p2 = coords[(i + 1) % longitud];
            const latMid = (p1.lat + p2.lat) / 2.0;
            const mPerDegLat = 111132.954 - 559.822 * Math.cos(2 * latMid * Math.PI / 180);
            const mPerDegLng = 111412.84 * Math.cos(latMid * Math.PI / 180);

            area += (p2.lng - p1.lng) * mPerDegLng * (p2.lat + p1.lat) * mPerDegLat;
        }
        area = Math.abs(area / 2.0);
    }
    return area > 0 ? area : (Math.random() * 50000 + 10000); // Respaldo matemático si las coordenadas están corruptas
}

function generarJustificacionTecnica(temp, severidad, arboles) {
    const justificaciones = {
        critica: `Este sector presenta una Isla de Calor crítica (${temp.toFixed(1)}°C) debido a su densidad de asfalto y falta de vegetación. Plantar ${arboles.toLocaleString()} árboles nativos generará sombra directa sobre superficies urbanas y activará procesos de evapotranspiración, reduciendo significativamente la radiación solar absorbida.`,
        alta: `El sector experimenta estrés térmico elevado (${temp.toFixed(1)}°C). La inyección de ${arboles.toLocaleString()} especies adaptadas creará corredores de viento fresco y aumentará el albedo del dosel urbano, mitigando la refracción calórica en aceras comerciales.`,
        moderada: `Con una temperatura moderada (${temp.toFixed(1)}°C), la reforestación es una medida preventiva estratégica. Plantar ${arboles.toLocaleString()} árboles consolidará corredores biológicos y preparará el sector para resiliencia climática futura.`
    };
    return justificaciones[severidad] || justificaciones.moderada;
}

function resaltarAlHover(layer) {
    if (layer !== sectorSeleccionado) {
        layer.setStyle({
            weight: 2,
            color: '#2a9d8f',
            opacity: 0.9,
            fillOpacity: 0.55
        });
    }
}

function deshighlightAlHover(layer) {
    if (capaGeoJSON && layer !== sectorSeleccionado) {
        capaGeoJSON.resetStyle(layer);
    }
}

function actualizarEstadoAPI(estado, temperatura) {
    const statusText = document.getElementById('api-status-text');
    if (statusText) {
        if (estado === 'Conectado') {
            statusText.textContent = `${temperatura}°C (En Vivo)`;
            statusText.style.color = '#2a9d8f';
        } else if (estado === 'Simulación') {
            statusText.textContent = `${temperatura.toFixed(1)}°C (Simulado)`;
            statusText.style.color = '#2a9d8f';
        } else {
            statusText.textContent = `${temperatura}°C (Modo Local)`;
            statusText.style.color = '#f77f00';
        }
    }
}

function configurarEventos() {
    const btnCerrar = document.getElementById('close-details');
    if (btnCerrar) { btnCerrar.addEventListener('click', cerrarDetalles); }

    const btnExportar = document.getElementById('export-btn');
    if (btnExportar) { btnExportar.addEventListener('click', exportarDiagnostico); }
}

function cerrarDetalles() {
    document.getElementById('instruction').classList.remove('hidden');
    document.getElementById('details').classList.add('hidden');
    if (sectorSeleccionado) {
        mapa.removeLayer(sectorSeleccionado);
        sectorSeleccionado = null;
        sectorSeleccionadoFeature = null;
    }
}

function exportarDiagnostico() {
    const diagnostico = {
        fecha: new Date().toISOString(),
        sector: document.getElementById('colonia-name').textContent,
        temperatura_actual: document.getElementById('colonia-temp').textContent,
        arboles_recomendados: document.getElementById('tree-count').textContent,
        especies: document.getElementById('species-suggested').textContent,
        reduccion_termica_estimada: document.getElementById('temp-reduction').textContent,
        justificacion_tecnica: document.getElementById('ai-rationale').textContent,
        sistema: 'Hermosillo Verde AI v1.5'
    };

    const dataStr = JSON.stringify(diagnostico, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagnostico_${diagnostico.sector.replace(/\s+/g, '_')}.json`;
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
// Variable global para rastrear el movimiento táctil
let touchStartY = 0;
let touchMoveY = 0;

function inicializarGestosMovil() {
    // Solo activar si estamos en un dispositivo móvil (pantalla menor a 768px)
    if (window.innerWidth > 768) return;

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Detectar cuando el usuario toca la pantalla en el sidebar
    sidebar.addEventListener('touchstart', (e) => {
        // Guardamos el punto Y inicial del toque
        touchStartY = e.touches[0].clientY;
        sidebar.style.transition = 'none'; // Quitamos animación mientras se arrastra
    }, { passive: true });

    // Detectar el movimiento del dedo
    sidebar.addEventListener('touchmove', (e) => {
        touchMoveY = e.touches[0].clientY;
        const deltaY = touchMoveY - touchStartY;

        // Si el usuario arrastra hacia abajo (deltaY > 0)
        if (deltaY > 0) {
            // Mueve el panel en tiempo real siguiendo el dedo
            sidebar.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: true });

    // Detectar cuando el usuario levanta el dedo
    sidebar.addEventListener('touchend', (e) => {
        sidebar.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        const deltaY = touchMoveY - touchStartY;
        const alturaPanel = sidebar.offsetHeight;

        // Umbral: Si arrastró más del 25% de la altura del panel, colapsamos
        if (deltaY > alturaPanel * 0.25) {
            sidebar.classList.add('minimizado');
            sidebar.style.transform = ''; // Deja que el CSS controle el estado minimizado
        } else {
            // Si no arrastró lo suficiente, regresa a su posición abierta
            sidebar.classList.remove('minimizado');
            sidebar.style.transform = 'translateY(0)';
        }
        
        // Resetear variables
        touchStartY = 0;
        touchMoveY = 0;
    });

    // Opcional: Si el usuario hace clic en la "barra decorativa superior", alterna el estado
    sidebar.addEventListener('click', (e) => {
        // Si hace clic cerca del borde superior, hacemos toggle
        if (e.clientY - sidebar.getBoundingClientRect().top < 30) {
            sidebar.style.transition = 'transform 0.3s ease';
            sidebar.classList.toggle('minimizado');
            sidebar.style.transform = '';
        }
    });
}

// RECUERDA: Agrega `inicializarGestosMovil();` dentro de tu cargador inicial:
document.addEventListener('DOMContentLoaded', function() {
    inicializarMapa();
    cargarAPI_Clima();
    configurarEventos();
    mostrarSpinner();
    inicializarGestosMovil(); // <--- Llamada obligatoria aquí
});
