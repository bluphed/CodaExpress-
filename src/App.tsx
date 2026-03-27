import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { 
  Menu, 
  X, 
  MapPin, 
  MessageCircle, 
  Navigation, 
  Calculator, 
  ChevronDown, 
  Sun, 
  Moon, 
  Info,
  ExternalLink,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Point {
  lat: number;
  lng: number;
}

interface PredefinedLocation extends Point {
  name: string;
}

interface CalculationResult {
  distancia: number;
  costo: number;
}

// --- Constants ---
const PREDEFINED_LOCATIONS: PredefinedLocation[] = [
  { name: 'La Cremita - Santo Domingo', lat: -0.245197, lng: -79.158230 },
];

const DEFAULT_CENTER: Point = { lat: -0.253, lng: -79.175 };

const LIBRARIES: ("geometry" | "places")[] = ["geometry", "places"];

export default function App() {
  // --- State ---
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [restaurante, setRestaurante] = useState<Point>(() => {
    const saved = localStorage.getItem('restaurante');
    return saved ? JSON.parse(saved) : PREDEFINED_LOCATIONS[0];
  });
  const [cliente, setCliente] = useState<Point | null>(null);
  const [locationLink, setLocationLink] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [direccionCliente, setDireccionCliente] = useState('');
  const [resultado, setResultado] = useState<CalculationResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: "AIzaSyDFR0mPU-jz-crPgioPus5UEdfeEZ90yk4",
    libraries: LIBRARIES,
  });

  // --- Effects ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (restaurante) {
      localStorage.setItem('restaurante', JSON.stringify(restaurante));
    }
  }, [restaurante]);

  // --- Handlers ---
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setCliente(point);
    
    if (window.google) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: e.latLng }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          setDireccionCliente(results[0].formatted_address);
        }
      });
    }
  };

  const processLocationLink = async (url: string) => {
    if (!url) {
      showToast('Pega un link de Google Maps', 'error');
      return;
    }

    let targetUrl = url;
    if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
      showToast('Resolviendo link corto...', 'info');
      try {
        const response = await fetch('/api/resolve-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        
        if (!response.ok) throw new Error('Error al resolver link');
        
        const data = await response.json();
        targetUrl = data.finalUrl;
        setLocationLink(targetUrl);
      } catch (error) {
        console.error('Error resolving link:', error);
        setIsHelpModalOpen(true);
        return;
      }
    } else {
      showToast('Procesando link...', 'info');
    }
    if (!targetUrl.startsWith('http')) {
      targetUrl = 'https://' + targetUrl;
    }

    // Regex to find coordinates in various formats
    const coordRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = targetUrl.match(coordRegex);
    
    const desktopRegex = /!3d([+-]?\d+\.\d+)!4d([+-]?\d+\.\d+)/;
    const desktopMatch = targetUrl.match(desktopRegex);

    // Matches q=lat,lng or query=lat,lng or ll=lat,lng
    const queryRegex = /[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/;
    const queryMatch = targetUrl.match(queryRegex);

    const finalMatch = match || desktopMatch || queryMatch;

    if (finalMatch) {
      const lat = parseFloat(finalMatch[1]);
      const lng = parseFloat(finalMatch[2]);
      const point = { lat, lng };
      
      setCliente(point);
      if (map) {
        map.panTo(point);
        map.setZoom(16);
      }
      showToast('Ubicación encontrada!', 'success');

      if (window.google) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: point }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            setDireccionCliente(results[0].formatted_address);
          }
        });
      }
    } else {
      showToast('No se pudo extraer la ubicación del link largo', 'error');
    }
  };

  const calcularCosto = () => {
    if (!restaurante || !cliente || !window.google) {
      showToast('Debes marcar local y cliente', 'error');
      return;
    }

    const dist = window.google.maps.geometry.spherical.computeDistanceBetween(
      new window.google.maps.LatLng(restaurante.lat, restaurante.lng),
      new window.google.maps.LatLng(cliente.lat, cliente.lng)
    );

    const distanciaKm = dist / 1000;
    let total = 0;

    if (distanciaKm <= 1.5) {
      total = 2.00;
    } else {
      const extraKm = distanciaKm - 1.5;
      const bloquesExtra = Math.floor(extraKm / 0.85);
      
      if (bloquesExtra <= 5) {
        total = 2.50 + (bloquesExtra * 0.25);
      } else {
        total = 4.50 + ((bloquesExtra - 6) * 0.25);
      }
    }

    total = Math.ceil(total * 4) / 4;

    setResultado({
      distancia: distanciaKm,
      costo: total,
    });
  };

  const enviarWhatsApp = () => {
    if (!resultado || !restaurante) {
      showToast('Primero debes calcular el costo', 'error');
      return;
    }

    const numeros = ["593959698463", "593997020710"];
    
    const localEncontrado = PREDEFINED_LOCATIONS.find(l => 
      Math.abs(l.lat - restaurante.lat) < 0.0001 && Math.abs(l.lng - restaurante.lng) < 0.0001
    );
    const nombreLocal = localEncontrado ? localEncontrado.name : 'Ubicación personalizada';

    const restaurantMapsLink = `https://maps.google.com/?q=${restaurante.lat},${restaurante.lng}`;
    const clientMapsLink = cliente ? `https://maps.google.com/?q=${cliente.lat},${cliente.lng}` : 'No marcada';
    
    const mensaje = `*Pedido Delivery*\n\n` +
      `🏪 *Local de retiro:* ${nombreLocal}\n` +
      `📍 *Ubicación Local:* ${restaurantMapsLink}\n\n` +
      `👤 *Cliente:* ${nombreCliente || 'No especificado'}\n` +
      `📞 *Teléfono:* ${telefonoCliente || 'No especificado'}\n` +
      `🏠 *Dirección Cliente:* ${direccionCliente || 'No especificada'}\n` +
      `🗺️ *Ubicación GPS Cliente:* ${clientMapsLink}\n\n` +
      `📏 *Distancia:* ${resultado.distancia.toFixed(2)} km\n` +
      `💰 *Costo de envío:* $${resultado.costo.toFixed(2)}`;

    numeros.forEach((num, index) => {
      const url = `https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(mensaje)}`;
      setTimeout(() => {
        window.open(url, '_blank');
      }, index * 500);
    });
  };

  // --- Render ---
  return (
    <div className="min-h-screen">
      {/* Splash Screen */}
      <AnimatePresence>
        {isSplashVisible && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white dark:bg-[#0f172a] flex flex-col items-center justify-center z-[9999]"
          >
            <div className="w-32 h-32 bg-coda rounded-[35px] flex items-center justify-center shadow-2xl shadow-coda/30 animate-pulse-slow overflow-hidden">
              <img 
                src="/icon.png" 
                alt="Coda Express Logo" 
                className="w-24 h-24 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-3xl font-bold text-coda tracking-wider mt-6">Coda Express</h1>
            <p className="text-stone-400 mt-2">Delivery Rápido y Seguro</p>
            <div className="w-10 h-10 border-4 border-stone-200 border-t-coda rounded-full animate-spin-slow mt-10" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className={`transition-opacity duration-500 flex flex-col min-h-screen ${isSplashVisible ? 'opacity-0' : 'opacity-100'}`}>
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="fixed top-5 right-5 z-50 bg-white dark:bg-[#1e293b] border border-stone-200 dark:border-stone-700 rounded-full px-4 py-2 flex items-center gap-2 shadow-sm"
        >
          {isDarkMode ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-stone-600" />}
          <span className="text-sm font-medium text-stone-700 dark:text-stone-200">
            {isDarkMode ? 'Modo claro' : 'Modo oscuro'}
          </span>
        </button>

        <div className="max-w-4xl mx-auto p-4 md:p-8 pt-20 overflow-x-hidden">
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-coda rounded-xl flex items-center justify-center overflow-hidden">
                <img 
                  src="/icon.png" 
                  alt="Logo" 
                  className="w-8 h-8 object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h1 className="text-2xl font-bold text-coda">Coda Express</h1>
            </div>
            <span className="text-xs font-semibold bg-coda/10 text-coda px-3 py-1 rounded-full border border-coda/20">
              En línea
            </span>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm">
                <h2 className="text-lg font-semibold mb-4 text-stone-800 dark:text-stone-100">Ubicación del Pedido</h2>
                
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Link de Google Maps</label>
                  <input 
                    type="text" 
                    value={locationLink}
                    onChange={(e) => setLocationLink(e.target.value)}
                    placeholder="https://maps.app.goo.gl/... o link largo"
                    className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 text-sm focus:ring-2 focus:ring-coda/20 focus:border-coda outline-none transition-all"
                  />
                  <div className="flex justify-center">
                    <button 
                      onClick={() => processLocationLink(locationLink)}
                      className="bg-coda text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-coda/90 active:scale-95 transition-all shadow-lg shadow-coda/20"
                    >
                      Buscar Ubicación
                    </button>
                  </div>
                </div>
                
                <div className="mt-4 aspect-video w-full rounded-xl border-2 border-coda overflow-hidden shadow-inner">
                  {isLoaded ? (
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={restaurante || DEFAULT_CENTER}
                      zoom={14}
                      onLoad={onLoad}
                      onUnmount={onUnmount}
                      onClick={handleMapClick}
                      options={{
                        disableDefaultUI: true,
                        zoomControl: true,
                        gestureHandling: 'greedy',
                        styles: isDarkMode ? [
                          { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                          { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                          {
                            featureType: "administrative.locality",
                            elementType: "labels.text.fill",
                            stylers: [{ color: "#d59563" }],
                          },
                          {
                            featureType: "poi",
                            elementType: "labels.text.fill",
                            stylers: [{ color: "#d59563" }],
                          },
                          {
                            featureType: "road",
                            elementType: "geometry",
                            stylers: [{ color: "#38414e" }],
                          },
                          {
                            featureType: "road",
                            elementType: "geometry.stroke",
                            stylers: [{ color: "#212a37" }],
                          },
                          {
                            featureType: "water",
                            elementType: "geometry",
                            stylers: [{ color: "#17263c" }],
                          },
                        ] : []
                      }}
                    >
                      <Marker 
                        position={restaurante} 
                        label={{ text: 'R', color: 'white', fontWeight: 'bold' }}
                      />
                      {cliente && (
                        <Marker 
                          position={cliente} 
                          label={{ text: 'C', color: 'white', fontWeight: 'bold' }}
                        />
                      )}
                    </GoogleMap>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-stone-100 dark:bg-stone-800 text-stone-400">
                      Cargando mapa...
                    </div>
                  )}
                </div>
                <p className="text-[10px] mt-2 text-stone-500 dark:text-stone-400 italic">
                  * Toca el mapa para marcar el punto exacto de entrega
                </p>
              </div>

              <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm">
                <h2 className="text-lg font-semibold mb-4 text-stone-800 dark:text-stone-100">Seleccionar Local</h2>
                <select 
                  value="cremita"
                  onChange={() => {}}
                  className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 outline-none focus:ring-2 focus:ring-coda/20"
                >
                  <option value="cremita">La Cremita - Santo Domingo</option>
                </select>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Datos del Cliente</h2>
                <div className="space-y-3">
                  <input 
                    type="text" 
                    placeholder="Nombre" 
                    value={nombreCliente}
                    onChange={(e) => setNombreCliente(e.target.value)}
                    className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 outline-none focus:ring-2 focus:ring-coda/20"
                  />
                  <input 
                    type="tel" 
                    placeholder="Teléfono" 
                    value={telefonoCliente}
                    onChange={(e) => setTelefonoCliente(e.target.value)}
                    className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 outline-none focus:ring-2 focus:ring-coda/20"
                  />
                  <div className="p-3 bg-stone-50 dark:bg-[#0f172a] rounded-xl border border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-400 min-h-[40px] flex items-center">
                    {direccionCliente || 'Esperando ubicación...'}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {resultado && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-coda p-6 rounded-2xl text-white shadow-xl shadow-coda/20"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-4xl font-black">${resultado.costo.toFixed(2)}</div>
                        <p className="text-sm opacity-80 font-medium mt-1">Distancia: {resultado.distancia.toFixed(2)} km</p>
                      </div>
                      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                        <CheckCircle2 size={24} />
                      </div>
                    </div>
                    <button 
                      onClick={enviarWhatsApp} 
                      className="w-full mt-6 bg-white text-coda font-bold py-4 rounded-xl hover:bg-stone-50 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <MessageCircle size={20} />
                      Enviar por WhatsApp
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <button 
                onClick={calcularCosto} 
                className="w-full bg-coda text-white font-bold py-5 rounded-2xl shadow-lg shadow-coda/20 hover:bg-coda/90 active:scale-95 transition-all flex items-center justify-center gap-3 text-lg"
              >
                <Calculator size={24} />
                Calcular Entrega
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      <AnimatePresence>
        {isHelpModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white dark:bg-[#1e293b] rounded-[28px] p-8 max-w-sm w-full border-2 border-coda shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-coda/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-coda" />
              </div>
              <h3 className="text-2xl font-bold text-coda mb-3">Link corto detectado</h3>
              <p className="text-stone-600 dark:text-stone-400 text-sm mb-6 leading-relaxed">
                Para usar este link en Coda Express, necesitas obtener la URL completa desde tu navegador.
              </p>
              
              <div className="bg-stone-50 dark:bg-[#0f172a] p-4 rounded-2xl text-left text-xs space-y-3 mb-6">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-coda text-white rounded-full flex items-center justify-center font-bold">1</span>
                  <p className="text-stone-700 dark:text-stone-300">Abre el link en el navegador web</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-coda text-white rounded-full flex items-center justify-center font-bold">2</span>
                  <p className="text-stone-700 dark:text-stone-300">Copia la URL larga de la barra de direcciones</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-coda text-white rounded-full flex items-center justify-center font-bold">3</span>
                  <p className="text-stone-700 dark:text-stone-300">Regresa y pégalo aquí</p>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => {
                    window.open(locationLink, '_blank');
                    setIsHelpModalOpen(false);
                    showToast('Abre el link, copia la URL larga y pégala aquí');
                  }}
                  className="w-full bg-coda text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 hover:bg-coda/90 transition-all"
                >
                  <ExternalLink size={18} />
                  Abrir en navegador
                </button>
                <button 
                  onClick={() => setIsHelpModalOpen(false)}
                  className="w-full bg-transparent text-stone-500 dark:text-stone-400 font-medium py-3 hover:text-stone-700 dark:hover:text-stone-200 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.8, x: '-50%', y: '-50%' }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-stone-900/95 dark:bg-stone-800/95 backdrop-blur-md text-white px-8 py-4 rounded-2xl shadow-2xl z-[10000] flex flex-col items-center gap-3 min-w-[240px] text-center border border-white/10"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-1">
              {toast.type === 'success' && <CheckCircle2 size={28} className="text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle size={28} className="text-rose-400" />}
              {toast.type === 'info' && <Info size={28} className="text-blue-400" />}
            </div>
            <span className="text-base font-semibold leading-tight">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
