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
  AlertCircle,
  History,
  Trash2,
  RefreshCw,
  LayoutDashboard,
  Download,
  Navigation as NavIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc 
} from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

import { 
  PREDEFINED_LOCATIONS, 
  DEFAULT_CENTER, 
  LIBRARIES, 
  WHATSAPP_NUMBERS, 
  ADMIN_EMAIL, 
  ADMIN_PASSWORD 
} from './constants';
import { Toast } from './components/Toast';

// --- Types ---
interface Point {
  lat: number;
  lng: number;
}

interface Order {
  id: string;
  nombre: string;
  telefono: string;
  direccion: string;
  costo: number;
  lat: number;
  lng: number;
  timestamp: number;
  uid?: string;
  tiempoEntrega?: string;
}

interface PredefinedLocation extends Point {
  name: string;
}

interface CalculationResult {
  distancia: number;
  costo: number;
  nombre: string;
  telefono: string;
  direccion: string;
  clientePoint: Point | null;
  tiempoEntrega: string;
}

// --- Redundant constants removed (now in constants.ts) ---

export default function App() {
  // --- State ---
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [restaurante, setRestaurante] = useState<Point>(() => {
    try {
      const saved = localStorage.getItem('restaurante');
      return saved ? JSON.parse(saved) : PREDEFINED_LOCATIONS[0];
    } catch (e) {
      console.error('Error parsing restaurante from localStorage:', e);
      return PREDEFINED_LOCATIONS[0];
    }
  });
  const [cliente, setCliente] = useState<Point | null>(null);
  const [locationLink, setLocationLink] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [direccionCliente, setDireccionCliente] = useState('');
  const [resultado, setResultado] = useState<CalculationResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminClickCount, setAdminClickCount] = useState(0);
  const adminTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [tiempoEntrega, setTiempoEntrega] = useState('Lo antes posible');
  const [user, setUser] = useState<User | null>(null);
  const [guestId, setGuestId] = useState<string>('');
  const [history, setHistory] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [dashboardFilter, setDashboardFilter] = useState<'today' | 'all'>('today');
  const [isParsing, setIsParsing] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Custom added states for dynamic Store/Local and Client location management
  const [mapMode, setMapMode] = useState<'cliente' | 'local'>('cliente');
  const [locales, setLocales] = useState<PredefinedLocation[]>(() => {
    try {
      const saved = localStorage.getItem('predefined_locales');
      return saved ? JSON.parse(saved) : PREDEFINED_LOCATIONS;
    } catch (e) {
      console.error('Error parsing predefined_locales from localStorage:', e);
      return PREDEFINED_LOCATIONS;
    }
  });
  const [savedClients, setSavedClients] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('saved_clients');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error parsing saved_clients from localStorage:', e);
      return [];
    }
  });
  const [isAddLocalOpen, setIsAddLocalOpen] = useState(false);
  const [nuevoLocalName, setNuevoLocalName] = useState('');

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyDFR0mPU-jz-crPgioPus5UEdfeEZ90yk4",
    libraries: LIBRARIES,
  });

  // --- Effects ---
  const calcularCosto = useCallback((silent = false) => {
    if (!restaurante || !cliente || !window.google) {
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

    const res = {
      distancia: distanciaKm,
      costo: total,
      nombre: nombreCliente,
      telefono: telefonoCliente,
      direccion: direccionCliente,
      clientePoint: cliente,
      tiempoEntrega: tiempoEntrega
    };

    setResultado(res);
    
    if (!silent) {
      showToast('Costo actualizado', 'success');
      saveOrder(res);
    }
  }, [restaurante, cliente, nombreCliente, telefonoCliente, direccionCliente, tiempoEntrega]);

  useEffect(() => {
    if (restaurante && cliente && isLoaded) {
      calcularCosto(true);
    }
  }, [restaurante, cliente, nombreCliente, telefonoCliente, direccionCliente, isLoaded, calcularCosto]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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
    if (user?.email === ADMIN_EMAIL) {
      setIsAdminAuthenticated(true);
    }
  }, [user]);

  useEffect(() => {
    if (restaurante) {
      localStorage.setItem('restaurante', JSON.stringify(restaurante));
    }
  }, [restaurante]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let gid = localStorage.getItem('guestId');
    if (!gid) {
      gid = 'guest_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('guestId', gid);
    }
    setGuestId(gid);
  }, []);

  // Fetch History (User's own orders)
  useEffect(() => {
    const currentId = user?.uid || guestId;
    if (!currentId) {
      setHistory([]);
      return;
    }
    const q = query(
      collection(db, 'orders'),
      where('uid', '==', currentId),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setHistory(orders);
    }, (error) => {
      console.error('Firestore Error (History):', error);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch All Orders (Admin only)
  useEffect(() => {
    if (!isAdminAuthenticated) {
      setAllOrders([]);
      return;
    }
    const q = query(
      collection(db, 'orders'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setAllOrders(orders);
    }, (error) => {
      console.error('Firestore Error (Dashboard):', error);
    });
    return () => unsubscribe();
  }, [isAdminAuthenticated]);

  const saveOrder = async (res: CalculationResult) => {
    try {
      await addDoc(collection(db, 'orders'), {
        nombre: res.nombre,
        telefono: res.telefono,
        direccion: res.direccion,
        lat: res.clientePoint?.lat,
        lng: res.clientePoint?.lng,
        costo: res.costo,
        timestamp: Date.now(),
        uid: user?.uid || guestId || 'anonymous',
        tiempoEntrega: res.tiempoEntrega
      });
      showToast('Pedido guardado en la nube', 'success');
    } catch (error) {
      console.error('Error saving order:', error);
      showToast('Error al guardar pedido', 'error');
    }
  };

  const deleteOrder = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'orders', id));
      showToast('Pedido eliminado', 'success');
    } catch (error) {
      console.error('Error deleting order:', error);
      showToast('No tienes permiso para eliminar', 'error');
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocalización no soportada', 'error');
      return;
    }

    showToast('Obteniendo ubicación...', 'info');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setCliente(point);
        if (map) {
          map.panTo(point);
          map.setZoom(16);
        }
        showToast('Ubicación obtenida!', 'success');

        if (window.google) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: point }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              setDireccionCliente(results[0].formatted_address);
            }
          });
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        showToast('Error al obtener ubicación', 'error');
      }
    );
  };

  const parseWithGemini = async (text: string) => {
    if (!text) return;
    setIsParsing(true);
    showToast('IA analizando dirección...', 'info');

    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analiza el siguiente texto y extrae el nombre del cliente, teléfono y dirección si están presentes. Devuelve un JSON con los campos: nombre, telefono, direccion. Si no encuentras alguno, deja el campo vacío. Texto: "${text}"`,
        config: { responseMimeType: "application/json" }
      });

      const response = await model;
      const data = JSON.parse(response.text);
      
      if (data.nombre) setNombreCliente(data.nombre);
      if (data.telefono) setTelefonoCliente(data.telefono);
      if (data.direccion) setDireccionCliente(data.direccion);
      
      showToast('Datos extraídos con éxito', 'success');
    } catch (error) {
      console.error('Error parsing with Gemini:', error);
      showToast('Error al analizar con IA', 'error');
    } finally {
      setIsParsing(false);
    }
  };

  // --- Handlers ---
  const handleAdminClick = () => {
    if (adminTimeoutRef.current) {
      clearTimeout(adminTimeoutRef.current);
    }
    
    const newCount = adminClickCount + 1;
    setAdminClickCount(newCount);
    
    if (newCount === 3) {
      setIsDashboardOpen(true);
      setAdminClickCount(0);
      showToast('Acceso administrativo', 'info');
      return;
    }
    
    adminTimeoutRef.current = setTimeout(() => {
      setAdminClickCount(0);
    }, 2000);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    // Optionally, send analytics event with outcome of user choice
    console.log(`User response to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const applyResolvedPoint = (point: Point, address: string) => {
    if (mapMode === 'local') {
      setRestaurante(point);
      localStorage.setItem('restaurante', JSON.stringify(point));
      showToast('Ubicación del local actualizada en mapa. ¡Guárdala si lo deseas!', 'info');
    } else {
      setCliente(point);
      setDireccionCliente(address);
    }
    if (map) {
      map.panTo(point);
      map.setZoom(16);
    }
  };

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    
    if (mapMode === 'local') {
      setRestaurante(point);
      localStorage.setItem('restaurante', JSON.stringify(point));
      showToast('Marcador del local movido. Haz clic en "+ Agregar Nuevo Local" para guardarlo con su nombre.', 'info');
    } else {
      setCliente(point);
      if (window.google) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: e.latLng }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            setDireccionCliente(results[0].formatted_address);
          }
        });
      }
    }
  };

  const processLocationLink = async (url: string) => {
    if (!url) {
      showToast('Ingresa una dirección o link de Google Maps', 'error');
      return;
    }

    const isUrl = url.startsWith('http') || url.includes('goo.gl') || url.includes('maps.app.goo.gl') || url.includes('google.com/maps');
    
    if (!isUrl) {
      // It's likely a text address
      if (window.google) {
        showToast('Buscando dirección...', 'info');
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: url }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const point = {
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng()
            };
            applyResolvedPoint(point, results[0].formatted_address);
            showToast('Ubicación encontrada!', 'success');
            setLocationLink(''); // Clear input
          } else {
            showToast('No se encontró la dirección', 'error');
          }
        });
      }
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
      } catch (error) {
        console.error('Error resolving link:', error);
        // Fallback: try to geocode the URL string itself if it contains address info
        if (window.google) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ address: url }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              const point = {
                lat: results[0].geometry.location.lat(),
                lng: results[0].geometry.location.lng()
              };
              applyResolvedPoint(point, results[0].formatted_address);
              showToast('Ubicación encontrada vía Geocoding!', 'success');
              setLocationLink('');
            } else {
              showToast('Error al resolver link corto', 'error');
              setIsHelpModalOpen(true);
            }
          });
        }
        return;
      }
    }

    // Regex to find coordinates in various formats
    const coordRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = targetUrl.match(coordRegex);
    
    const desktopRegex = /!3d([+-]?\d+\.\d+)!4d([+-]?\d+\.\d+)/;
    const desktopMatch = targetUrl.match(desktopRegex);

    const queryRegex = /[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/;
    const queryMatch = targetUrl.match(queryRegex);

    const searchRegex = /(?:search|place|dir)\/(-?\d+\.\d+),(-?\d+\.\d+)/;
    const searchMatch = targetUrl.match(searchRegex);

    const genericRegex = /(-?\d+\.\d+),(-?\d+\.\d+)/;
    const genericMatch = targetUrl.match(genericRegex);

    const finalMatch = match || desktopMatch || queryMatch || searchMatch || genericMatch;

    if (finalMatch) {
      const lat = parseFloat(finalMatch[1]);
      const lng = parseFloat(finalMatch[2]);
      const point = { lat, lng };
      
      if (window.google) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: point }, (results, status) => {
          const address = (status === 'OK' && results && results[0]) ? results[0].formatted_address : 'Ubicación identificada';
          applyResolvedPoint(point, address);
          showToast('Ubicación encontrada!', 'success');
          setLocationLink('');
        });
      } else {
        applyResolvedPoint(point, 'Ubicación identificada');
        showToast('Ubicación encontrada!', 'success');
        setLocationLink('');
      }
    } else {
      // If regex fails, try geocoding the URL as a last resort
      if (window.google) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: targetUrl }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const point = {
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng()
            };
            applyResolvedPoint(point, results[0].formatted_address);
            showToast('Ubicación encontrada!', 'success');
            setLocationLink('');
          } else {
            showToast('No se pudo extraer la ubicación del link', 'error');
          }
        });
      } else {
        showToast('No se pudo extraer la ubicación del link', 'error');
      }
    }
  };

  const resetForm = () => {
    setCliente(null);
    setLocationLink('');
    setNombreCliente('');
    setTelefonoCliente('');
    setDireccionCliente('');
    setResultado(null);
    if (map) {
      map.panTo(restaurante || DEFAULT_CENTER);
      map.setZoom(14);
    }
  };

  const handleSaveClient = () => {
    if (!nombreCliente.trim() || !direccionCliente.trim() || !cliente) {
      showToast('Por favor completa Nombre, Dirección y Ubicación en el mapa del cliente.', 'error');
      return;
    }

    const duplicate = savedClients.find(c => c.nombre.toLowerCase().trim() === nombreCliente.toLowerCase().trim());
    if (duplicate) {
      showToast('Ya existe un cliente con ese nombre guardado', 'error');
      return;
    }

    const newClient = {
      nombre: nombreCliente.trim(),
      telefono: telefonoCliente.trim(),
      direccion: direccionCliente.trim(),
      lat: cliente.lat,
      lng: cliente.lng
    };

    const updated = [newClient, ...savedClients];
    setSavedClients(updated);
    localStorage.setItem('saved_clients', JSON.stringify(updated));
    showToast('¡Cliente guardado con éxito!', 'success');
  };

  const handleDeleteSavedClient = (index: number) => {
    const updated = savedClients.filter((_, i) => i !== index);
    setSavedClients(updated);
    localStorage.setItem('saved_clients', JSON.stringify(updated));
    showToast('Cliente guardado eliminado.', 'info');
  };

  const handleSaveLocal = () => {
    if (!nuevoLocalName.trim()) {
      showToast('Ingresa un nombre para el local', 'error');
      return;
    }

    const duplicate = locales.find(l => l.name.toLowerCase().trim() === nuevoLocalName.toLowerCase().trim());
    if (duplicate) {
      showToast('Ya existe un local con ese nombre', 'error');
      return;
    }

    const newLocal = {
      name: nuevoLocalName.trim(),
      lat: restaurante.lat,
      lng: restaurante.lng
    };

    const updated = [...locales, newLocal];
    setLocales(updated);
    localStorage.setItem('predefined_locales', JSON.stringify(updated));
    setRestaurante({ lat: newLocal.lat, lng: newLocal.lng });
    localStorage.setItem('restaurante', JSON.stringify({ lat: newLocal.lat, lng: newLocal.lng }));
    setIsAddLocalOpen(false);
    setNuevoLocalName('');
    showToast('¡Nuevo local registrado con éxito!', 'success');
  };

  const handleCalcularManual = () => {
    if (!restaurante || !cliente) {
      showToast('Debes marcar local y cliente', 'error');
      return;
    }
    calcularCosto();
  };

  const copiarResumen = () => {
    if (!resultado || !restaurante) return;

    const localEncontrado = locales.find(l => 
      Math.abs(l.lat - restaurante.lat) < 0.0001 && Math.abs(l.lng - restaurante.lng) < 0.0001
    );
    const nombreLocal = localEncontrado ? localEncontrado.name : 'Ubicación personalizada';
    const restaurantMapsLink = `https://maps.google.com/?q=${restaurante.lat},${restaurante.lng}`;
    const clientMapsLink = resultado.clientePoint ? `https://maps.google.com/?q=${resultado.clientePoint.lat},${resultado.clientePoint.lng}` : 'No marcada';
    
    const mensaje = `*Pedido Delivery*\n\n` +
      `🏪 *Local de retiro:* ${nombreLocal}\n` +
      `📍 *Ubicación Local:* ${restaurantMapsLink}\n\n` +
      `👤 *Cliente:* ${resultado.nombre || 'No especificado'}\n` +
      `📞 *Teléfono:* ${resultado.telefono || 'No especificado'}\n` +
      `🏠 *Dirección Cliente:* ${resultado.direccion || 'No especificada'}\n` +
      `🗺️ *Ubicación GPS Cliente:* ${clientMapsLink}\n\n` +
      `🕒 *Motorizado debe ir en:* ${resultado.tiempoEntrega}\n` +
      `📏 *Distancia:* ${resultado.distancia.toFixed(2)} km\n` +
      `💰 *Costo de envío:* $${resultado.costo.toFixed(2)}`;

    navigator.clipboard.writeText(mensaje).then(() => {
      showToast('Resumen copiado al portapapeles', 'success');
    }).catch(err => {
      console.error('Error al copiar:', err);
      showToast('Error al copiar resumen', 'error');
    });
  };

  const enviarWhatsApp = () => {
    if (!resultado || !restaurante) {
      showToast('Primero debes calcular el costo', 'error');
      return;
    }

    const numeros = WHATSAPP_NUMBERS;
    
    const localEncontrado = locales.find(l => 
      Math.abs(l.lat - restaurante.lat) < 0.0001 && Math.abs(l.lng - restaurante.lng) < 0.0001
    );
    const nombreLocal = localEncontrado ? localEncontrado.name : 'Ubicación personalizada';

    const restaurantMapsLink = `https://maps.google.com/?q=${restaurante.lat},${restaurante.lng}`;
    const clientMapsLink = resultado.clientePoint ? `https://maps.google.com/?q=${resultado.clientePoint.lat},${resultado.clientePoint.lng}` : 'No marcada';
    
    const mensaje = `*Pedido Delivery*\n\n` +
      `🏪 *Local de retiro:* ${nombreLocal}\n` +
      `📍 *Ubicación Local:* ${restaurantMapsLink}\n\n` +
      `👤 *Cliente:* ${resultado.nombre || 'No especificado'}\n` +
      `📞 *Teléfono:* ${resultado.telefono || 'No especificado'}\n` +
      `🏠 *Dirección Cliente:* ${resultado.direccion || 'No especificada'}\n` +
      `🗺️ *Ubicación GPS Cliente:* ${clientMapsLink}\n\n` +
      `🕒 *Motorizado debe ir en:* ${resultado.tiempoEntrega}\n` +
      `📏 *Distancia:* ${resultado.distancia.toFixed(2)} km\n` +
      `💰 *Costo de envío:* $${resultado.costo.toFixed(2)}`;

    numeros.forEach((num, index) => {
      const url = `https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(mensaje)}`;
      setTimeout(() => {
        window.open(url, '_blank');
      }, index * 500);
    });

    // Reset everything after sending
    setTimeout(() => {
      resetForm();
      showToast('Formulario reiniciado para nuevo pedido', 'info');
    }, 2000);
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
            <div className="w-40 h-40 bg-white dark:bg-stone-800 rounded-[45px] flex items-center justify-center shadow-2xl shadow-coda/30 overflow-hidden border-4 border-coda">
              <img 
                src="/Gabriel_CodaExpress/android-chrome-512x512.png" 
                alt="Coda Express Logo" 
                className="w-32 h-32 object-cover rounded-[35px]"
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
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white dark:bg-stone-800 rounded-full flex items-center justify-center overflow-hidden border-2 border-coda shadow-md shadow-coda/20">
                {logoError ? (
                  <NavIcon size={32} className="text-coda" />
                ) : (
                  <img 
                    src="/Gabriel_CodaExpress/android-chrome-512x512.png" 
                    alt="Logo" 
                    className="w-full h-full object-cover rounded-full"
                    referrerPolicy="no-referrer"
                    onError={() => setLogoError(true)}
                  />
                )}
              </div>
              <div>
                <h1 className="text-3xl font-black text-coda tracking-tight">Coda Express</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-30">Versión 1.9</span>
                  <button 
                    onClick={() => (window as any).forceUpdate?.()}
                    className="text-[8px] font-bold uppercase tracking-widest bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors text-stone-500"
                  >
                    Actualizar
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-stone-800 p-2 rounded-[22px] border border-stone-100 dark:border-stone-700 shadow-sm self-end sm:self-auto">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsHistoryOpen(true)}
                  className="p-2.5 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700/50 rounded-xl transition-all"
                  title="Historial de pedidos"
                >
                  <History size={20} />
                </button>

                {user?.email === ADMIN_EMAIL && (
                  <button 
                    onClick={() => setIsDashboardOpen(true)}
                    className="p-2.5 text-coda hover:bg-coda/5 rounded-xl transition-all"
                    title="Panel de Control"
                  >
                    <LayoutDashboard size={20} />
                  </button>
                )}
                
                {isInstallable && (
                  <button 
                    onClick={handleInstallClick}
                    className="hidden md:flex items-center gap-2 bg-coda text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-coda/90 transition-all shadow-sm shadow-coda/20"
                  >
                    <Navigation size={14} className="rotate-90" />
                    Instalar
                  </button>
                )}

                <span 
                  onClick={handleAdminClick}
                  className="px-3 py-2 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-100 dark:border-stone-800 flex items-center gap-2 cursor-default select-none transition-all active:scale-95"
                >
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-500">En línea</span>
                </span>
              </div>

              <div className="w-px h-6 bg-stone-100 dark:bg-stone-700 mx-1" />

              {user ? (
                <div className="flex items-center gap-3 pl-1 pr-2">
                  <img 
                    src={user.photoURL || ''} 
                    alt={user.displayName || ''} 
                    className="w-8 h-8 rounded-full border-2 border-coda/20"
                  />
                  <button 
                    onClick={logout}
                    className="text-[10px] font-black uppercase tracking-wider text-stone-400 hover:text-rose-500 transition-colors"
                  >
                    Salir
                  </button>
                </div>
              ) : (
                <button 
                  onClick={signInWithGoogle}
                  className="px-4 py-2 text-xs font-black uppercase tracking-wider text-coda hover:bg-coda/5 rounded-xl transition-all"
                >
                  Entrar
                </button>
              )}
            </div>
          </header>

          {isInstallable && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:hidden mb-6 bg-coda/5 border border-coda/20 p-4 rounded-2xl flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white dark:bg-stone-800 rounded-xl flex items-center justify-center shrink-0 border-2 border-coda shadow-sm overflow-hidden">
                  <img src="/Gabriel_CodaExpress/android-chrome-192x192.png" alt="App Icon" className="w-10 h-10 object-contain" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stone-800 dark:text-stone-100">Instalar Coda Express</h4>
                  <p className="text-[10px] text-stone-500 dark:text-stone-400">Acceso rápido desde tu pantalla de inicio</p>
                </div>
              </div>
              <button 
                onClick={handleInstallClick}
                className="bg-coda text-white px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shadow-md shadow-coda/20"
              >
                Instalar
              </button>
            </motion.div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm">
                <h2 className="text-lg font-semibold mb-4 text-stone-800 dark:text-stone-100">Ubicación del Pedido</h2>
                
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-stone-600 dark:text-stone-400">Dirección o Link de Google Maps</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={locationLink}
                      onChange={(e) => setLocationLink(e.target.value)}
                      placeholder="Pega un link o escribe una dirección (ej: Calle 123)"
                      className="flex-1 p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 text-sm focus:ring-2 focus:ring-coda/20 focus:border-coda outline-none transition-all"
                    />
                    <button 
                      onClick={handleUseMyLocation}
                      className="p-3 bg-stone-100 dark:bg-stone-800 text-coda rounded-xl hover:bg-stone-200 dark:hover:bg-stone-700 transition-all"
                      title="Usar mi ubicación actual"
                    >
                      <Navigation size={20} />
                    </button>
                  </div>
                  <div className="flex justify-center gap-2">
                    <button 
                      onClick={() => processLocationLink(locationLink)}
                      className="bg-coda text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-coda/90 active:scale-95 transition-all shadow-lg shadow-coda/20"
                    >
                      Buscar Ubicación
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Modo de marcado en mapa:</span>
                    <div className="flex bg-stone-100 dark:bg-stone-800 p-0.5 rounded-xl border border-stone-200/50 dark:border-stone-700/50">
                      <button
                        onClick={() => setMapMode('cliente')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mapMode === 'cliente' ? 'bg-coda text-white shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}
                      >
                        📍 Cliente (C)
                      </button>
                      <button
                        onClick={() => setMapMode('local')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mapMode === 'local' ? 'bg-coda text-white shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}
                      >
                        🏪 Local (R)
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="aspect-video w-full rounded-xl border-2 border-coda overflow-hidden shadow-inner">
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
                  * Toca el mapa para marcar el punto exacto (se marcará según el modo seleccionado: Cliente o Local)
                </p>
              </div>

              <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Seleccionar Local</h2>
                  <span className="text-[10px] font-bold text-coda bg-coda/10 px-2.5 py-1 rounded-full uppercase">
                    {locales.length} {locales.length === 1 ? 'Disponible' : 'Disponibles'}
                  </span>
                </div>
                
                <div className="space-y-3">
                  <select 
                    value={JSON.stringify(restaurante)}
                    onChange={(e) => {
                      try {
                        const selectedValue = JSON.parse(e.target.value);
                        setRestaurante(selectedValue);
                        localStorage.setItem('restaurante', JSON.stringify(selectedValue));
                        if (map) {
                          map.panTo(selectedValue);
                          map.setZoom(15);
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 outline-none focus:ring-2 focus:ring-coda/20 text-sm"
                  >
                    {locales.map((loc, idx) => (
                      <option key={idx} value={JSON.stringify({ lat: loc.lat, lng: loc.lng })}>
                        {loc.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setNuevoLocalName('');
                        setIsAddLocalOpen(true);
                      }}
                      className="flex-1 py-2.5 px-4 bg-coda text-white text-xs font-bold rounded-xl hover:bg-coda/90 active:scale-95 transition-all text-center shadow-md shadow-coda/10"
                    >
                      + Registrar Ubicación Actual como Local
                    </button>
                    
                    {locales.length > 1 && (
                      <button
                        onClick={() => {
                          const updated = locales.filter(loc => !(Math.abs(loc.lat - restaurante.lat) < 0.0001 && Math.abs(loc.lng - restaurante.lng) < 0.0001));
                          setLocales(updated);
                          localStorage.setItem('predefined_locales', JSON.stringify(updated));
                          const fallbackLocal = updated[0];
                          setRestaurante({ lat: fallbackLocal.lat, lng: fallbackLocal.lng });
                          localStorage.setItem('restaurante', JSON.stringify({ lat: fallbackLocal.lat, lng: fallbackLocal.lng }));
                          showToast('Local eliminado de la lista', 'success');
                        }}
                        className="py-2.5 px-4 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl hover:bg-rose-100 active:scale-95 transition-all text-center"
                        title="Eliminar este local"
                      >
                        Eliminar Local
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Datos del Cliente</h2>
                  {nombreCliente.trim() && (
                    <button
                      onClick={handleSaveClient}
                      className="text-xs font-bold text-coda hover:bg-coda/5 px-2.5 py-1.5 rounded-xl border border-coda/20 transition-all flex items-center gap-1.5"
                      title="Guardar como cliente frecuente"
                    >
                      💾 Guardar Cliente
                    </button>
                  )}
                </div>

                {savedClients.length > 0 && (
                  <div className="pb-3 border-b border-stone-100 dark:border-stone-800 mb-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1.5">Clientes Frecuentes</label>
                    <div className="flex gap-2">
                      <select
                        id="saved-clients-dropdown"
                        value=""
                        onChange={(e) => {
                          const idx = e.target.value;
                          if (idx !== '') {
                            const selected = savedClients[parseInt(idx)];
                            setNombreCliente(selected.nombre);
                            setTelefonoCliente(selected.telefono);
                            setDireccionCliente(selected.direccion);
                            if (selected.lat && selected.lng) {
                              const pt = { lat: selected.lat, lng: selected.lng };
                              setCliente(pt);
                              if (map) {
                                map.panTo(pt);
                                map.setZoom(16);
                              }
                            }
                            showToast('Cliente cargado correctamente', 'success');
                          }
                        }}
                        className="flex-1 p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 text-xs outline-none focus:ring-2 focus:ring-coda/20 cursor-pointer"
                      >
                        <option value="">-- Seleccionar cliente guardado --</option>
                        {savedClients.map((client, idx) => (
                          <option key={idx} value={idx}>
                            👤 {client.nombre} {client.telefono ? `(${client.telefono})` : ''} - {client.direccion.substring(0, 35)}...
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const dropdown = document.getElementById('saved-clients-dropdown') as HTMLSelectElement;
                          if (dropdown && dropdown.value !== '') {
                            handleDeleteSavedClient(parseInt(dropdown.value));
                            dropdown.value = '';
                          } else {
                            showToast('Selecciona un cliente de la lista para eliminarlo', 'info');
                          }
                        }}
                        className="px-3 bg-stone-150 dark:bg-stone-800 text-rose-500 text-xs font-semibold rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/25 active:scale-95 transition-all text-center shrink-0 border border-transparent hover:border-rose-100/50"
                        title="Eliminar de favoritos"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Nombre" 
                      value={nombreCliente}
                      onChange={(e) => setNombreCliente(e.target.value)}
                      className="w-full p-3 pr-20 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 outline-none focus:ring-2 focus:ring-coda/20"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {nombreCliente && (
                        <button 
                          onClick={() => setNombreCliente('')}
                          className="p-2 text-stone-400 hover:text-rose-500 rounded-lg transition-colors"
                        >
                          <X size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => parseWithGemini(nombreCliente + " " + direccionCliente)}
                        disabled={isParsing}
                        className="p-2 text-coda hover:bg-coda/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Autocompletar con IA"
                      >
                        <RefreshCw size={18} className={isParsing ? "animate-spin" : ""} />
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="tel" 
                      placeholder="Teléfono" 
                      value={telefonoCliente}
                      onChange={(e) => setTelefonoCliente(e.target.value)}
                      className="w-full p-3 pr-10 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 outline-none focus:ring-2 focus:ring-coda/20"
                    />
                    {telefonoCliente && (
                      <button 
                        onClick={() => setTelefonoCliente('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-stone-400 hover:text-rose-500 rounded-lg transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="p-3 bg-stone-50 dark:bg-[#0f172a] rounded-xl border border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-400 min-h-[40px] flex items-center">
                    {direccionCliente || 'Esperando ubicación...'}
                  </div>

                  <div className="pt-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1 block">¿En cuánto tiempo debe ir el motorizado?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Lo antes posible', '15-20 min', '30 min', '45 min'].map((time) => (
                        <button
                          key={time}
                          onClick={() => setTiempoEntrega(time)}
                          className={`py-2 px-3 rounded-xl text-[10px] font-bold transition-all border ${
                            tiempoEntrega === time 
                              ? 'bg-coda text-white border-coda shadow-md shadow-coda/20' 
                              : 'bg-stone-50 dark:bg-[#0f172a] text-stone-500 border-stone-200 dark:border-stone-700 hover:border-coda/30'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                      <button 
                        onClick={enviarWhatsApp} 
                        className="w-full bg-white text-coda font-bold py-4 rounded-xl hover:bg-stone-50 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <MessageCircle size={20} />
                        WhatsApp
                      </button>
                      <button 
                        onClick={copiarResumen} 
                        className="w-full bg-white/10 text-white border border-white/20 font-bold py-4 rounded-xl hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <Download size={20} className="rotate-180" />
                        Copiar
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button 
                onClick={handleCalcularManual} 
                className="w-full bg-coda text-white font-bold py-5 rounded-2xl shadow-lg shadow-coda/20 hover:bg-coda/90 active:scale-95 transition-all flex items-center justify-center gap-3 text-lg"
              >
                <Calculator size={24} />
                Calcular Entrega
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-8 text-center border-t border-stone-100 dark:border-stone-800 mt-auto">
          <div className="flex items-center justify-center gap-2 text-stone-300 dark:text-stone-600 text-[10px] font-bold uppercase tracking-[0.2em]">
            <CheckCircle2 size={12} />
            © 2024 Coda Express - Santo Domingo
          </div>
        </footer>
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

      {/* Admin Dashboard Drawer (Glassmorphism) */}
      <AnimatePresence>
        {isDashboardOpen && (
          <div className="fixed inset-0 z-[10000] flex justify-end">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDashboardOpen(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            
            {/* Drawer */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xl h-full bg-white/80 dark:bg-stone-900/80 backdrop-blur-2xl border-l border-white/20 dark:border-white/5 shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-stone-200/50 dark:border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-stone-800 dark:text-white flex items-center gap-2">
                    <LayoutDashboard size={20} className="text-coda" />
                    Gestión de Flota
                  </h3>
                  <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold mt-1">Panel de Control Administrativo</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      const filtered = allOrders.filter(o => {
                        if (dashboardFilter === 'all') return true;
                        const today = new Date();
                        const orderDate = new Date(o.timestamp);
                        return today.toDateString() === orderDate.toDateString();
                      });
                      
                      const csvContent = [
                        ['Fecha', 'Cliente', 'Teléfono', 'Dirección', 'Costo'].join(','),
                        ...filtered.map(o => [
                          new Date(o.timestamp).toLocaleString(),
                          `"${o.nombre || ''}"`,
                          `"${o.telefono || ''}"`,
                          `"${o.direccion}"`,
                          o.costo
                        ].join(','))
                      ].join('\n');
                      
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.setAttribute('href', url);
                      link.setAttribute('download', `reporte_coda_${dashboardFilter}_${new Date().toISOString().split('T')[0]}.csv`);
                      link.style.visibility = 'hidden';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      showToast('Reporte descargado', 'success');
                    }}
                    className="p-2 text-stone-500 hover:text-coda hover:bg-coda/5 rounded-full transition-all"
                    title="Descargar Reporte CSV"
                  >
                    <Download size={20} />
                  </button>
                  <button 
                    onClick={() => setIsDashboardOpen(false)}
                    className="p-2 hover:bg-stone-100 dark:hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {!isAdminAuthenticated ? (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="w-full max-w-xs space-y-8 text-center">
                    <div className="space-y-2">
                      <div className="w-16 h-16 bg-coda/10 rounded-3xl flex items-center justify-center mx-auto mb-4 rotate-12">
                        <LayoutDashboard size={32} className="text-coda" />
                      </div>
                      <h4 className="text-lg font-bold text-stone-800 dark:text-white">Acceso Restringido</h4>
                      <p className="text-xs text-stone-500">Ingrese la clave maestra para visualizar la actividad en tiempo real.</p>
                    </div>
                    
                    <div className="space-y-4">
                      <input 
                        type="password" 
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (passwordInput === ADMIN_PASSWORD) {
                              setIsAdminAuthenticated(true);
                              setPasswordInput('');
                            } else {
                              showToast('Clave incorrecta', 'error');
                            }
                          }
                        }}
                        placeholder="••••••••"
                        className="w-full bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 p-4 rounded-2xl text-center text-2xl tracking-[0.3em] outline-none focus:ring-2 focus:ring-coda/20 transition-all"
                        autoFocus
                      />
                      <button 
                        onClick={() => {
                          if (passwordInput === ADMIN_PASSWORD) {
                            setIsAdminAuthenticated(true);
                            setPasswordInput('');
                          } else {
                            showToast('Clave incorrecta', 'error');
                          }
                        }}
                        className="w-full bg-coda text-white py-4 rounded-2xl font-bold shadow-lg shadow-coda/20 hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        Desbloquear Panel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 p-6">
                    <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-stone-200/50 dark:border-white/10 shadow-sm">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Pedidos Hoy</div>
                      <div className="text-2xl font-black text-stone-800 dark:text-white">
                        {allOrders.filter(o => {
                          const today = new Date();
                          const orderDate = new Date(o.timestamp);
                          return today.toDateString() === orderDate.toDateString();
                        }).length}
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-stone-200/50 dark:border-white/10 shadow-sm">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Total Hoy</div>
                      <div className="text-2xl font-black text-coda">
                        ${allOrders.filter(o => {
                          const today = new Date();
                          const orderDate = new Date(o.timestamp);
                          return today.toDateString() === orderDate.toDateString();
                        }).reduce((acc, curr) => acc + curr.costo, 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Global Stats */}
                  <div className="px-6 pb-4">
                    <div className="p-3 rounded-xl bg-stone-50 dark:bg-white/5 border border-stone-100 dark:border-white/5 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Histórico Total</span>
                      <span className="text-sm font-black text-stone-600 dark:text-stone-300">
                        {allOrders.length} pedidos | ${allOrders.reduce((acc, curr) => acc + curr.costo, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-4 custom-scrollbar">
                    <div className="flex items-center justify-between mb-2 sticky top-0 bg-white/80 dark:bg-stone-900/80 backdrop-blur-md py-2 z-10">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setDashboardFilter('today')}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all ${dashboardFilter === 'today' ? 'bg-coda text-white' : 'text-stone-400 hover:text-stone-600'}`}
                        >
                          Hoy
                        </button>
                        <button 
                          onClick={() => setDashboardFilter('all')}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all ${dashboardFilter === 'all' ? 'bg-coda text-white' : 'text-stone-400 hover:text-stone-600'}`}
                        >
                          Todo
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-500">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        ACTUALIZADO
                      </div>
                    </div>
                    
                    {allOrders
                      .filter(o => {
                        if (dashboardFilter === 'all') return true;
                        const today = new Date();
                        const orderDate = new Date(o.timestamp);
                        return today.toDateString() === orderDate.toDateString();
                      })
                      .map((order) => (
                      <div 
                        key={order.id} 
                        className="p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-stone-200/50 dark:border-white/10 hover:border-coda/30 transition-all group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-bold text-stone-800 dark:text-white text-sm">{order.nombre || 'Cliente Anónimo'}</div>
                            <div className="text-[10px] text-stone-500">{new Date(order.timestamp).toLocaleString()}</div>
                          </div>
                          <div className="text-lg font-black text-coda">${order.costo.toFixed(2)}</div>
                        </div>
                        <div className="text-xs text-stone-600 dark:text-stone-400 line-clamp-1 mb-3">
                          {order.direccion}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold px-2 py-1 bg-coda/10 text-coda rounded-lg">
                            {order.tiempoEntrega || 'Inmediato'}
                          </span>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                const url = `https://maps.google.com/?q=${order.lat},${order.lng}`;
                                window.open(url, '_blank');
                              }}
                              className="p-2 bg-stone-100 dark:bg-white/10 text-stone-600 dark:text-stone-400 rounded-lg hover:text-coda transition-all"
                            >
                              <MapPin size={14} />
                            </button>
                            <button 
                              onClick={() => deleteOrder(order.id)}
                              className="p-2 bg-stone-100 dark:bg-white/10 text-stone-400 hover:text-rose-500 rounded-lg transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {allOrders.length === 0 && (
                      <div className="text-center py-20 text-stone-400 italic text-sm">
                        No hay pedidos registrados en el sistema.
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-6 border-t border-stone-200/50 dark:border-white/10 bg-stone-50/50 dark:bg-black/20">
                    <button 
                      onClick={() => setIsAdminAuthenticated(false)}
                      className="w-full py-3 text-xs font-bold text-stone-400 hover:text-rose-500 transition-colors uppercase tracking-widest"
                    >
                      Cerrar Sesión Administrativa
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-[#1e293b] rounded-[28px] p-6 max-w-lg w-full max-h-[80vh] flex flex-col border border-stone-200 dark:border-stone-700 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6 border-b border-stone-100 dark:border-stone-800 pb-4">
                <h3 className="text-xl font-bold text-stone-800 dark:text-stone-100 flex items-center gap-2">
                  <History size={24} className="text-coda" />
                  Historial de Pedidos
                </h3>
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-2 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:text-rose-500 rounded-xl transition-all shadow-sm"
                  title="Cerrar historial"
                >
                  <X size={24} strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                {!user ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center mb-4">
                      <History size={32} className="text-stone-400" />
                    </div>
                    <p className="text-stone-500 dark:text-stone-400 mb-6">Inicia sesión para ver tu historial de pedidos en la nube</p>
                    <button 
                      onClick={signInWithGoogle}
                      className="bg-coda text-white px-6 py-2 rounded-xl font-bold shadow-md shadow-coda/20 hover:scale-105 transition-all"
                    >
                      Entrar con Google
                    </button>
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-12 text-stone-500 dark:text-stone-400">
                    No hay pedidos registrados aún.
                  </div>
                ) : (
                  history.map((order) => (
                    <div 
                      key={order.id}
                      className="p-4 rounded-2xl bg-stone-50 dark:bg-[#0f172a] border border-stone-100 dark:border-stone-800 hover:border-coda/30 transition-all group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-stone-800 dark:text-stone-100">{order.nombre || 'Sin nombre'}</div>
                          <div className="text-xs text-stone-500">{new Date(order.timestamp).toLocaleString()}</div>
                        </div>
                        <div className="text-lg font-black text-coda">${order.costo.toFixed(2)}</div>
                      </div>
                      <div className="text-sm text-stone-600 dark:text-stone-400 line-clamp-1 mb-3">
                        {order.direccion}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setNombreCliente(order.nombre);
                            setTelefonoCliente(order.telefono);
                            setDireccionCliente(order.direccion);
                            setCliente({ lat: order.lat, lng: order.lng });
                            if (map) {
                              map.panTo({ lat: order.lat, lng: order.lng });
                              map.setZoom(16);
                            }
                            setIsHistoryOpen(false);
                            showToast('Pedido cargado', 'success');
                          }}
                          className="flex-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 text-xs font-bold py-2 rounded-lg hover:bg-stone-50 transition-all"
                        >
                          Reutilizar
                        </button>
                        <button 
                          onClick={() => {
                            const url = `https://maps.google.com/?q=${order.lat},${order.lng}`;
                            window.open(url, '_blank');
                          }}
                          className="px-3 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 rounded-lg hover:text-coda transition-all"
                        >
                          <MapPin size={16} />
                        </button>
                        <button 
                          onClick={() => deleteOrder(order.id)}
                          className="px-3 bg-stone-100 dark:bg-stone-800 text-stone-400 hover:text-rose-500 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800">
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="w-full py-3 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold rounded-2xl hover:bg-stone-200 transition-all"
                >
                  Cerrar Historial
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal - Agregar Nuevo Local */}
      <AnimatePresence>
        {isAddLocalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1e293b] rounded-[28px] p-6 max-w-sm w-full border border-stone-200 dark:border-stone-700 shadow-2xl"
            >
              <div className="w-12 h-12 bg-coda/10 rounded-full flex items-center justify-center mb-4">
                <MapPin size={24} className="text-coda" />
              </div>
              
              <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-1">Registrar Nuevo Local</h3>
              <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">
                Asigna un nombre descriptivo para identificar estas coordenadas en tu lista de sucursales.
              </p>

              <div className="bg-stone-50 dark:bg-[#0f172a] p-3 rounded-xl text-[10px] font-mono mb-4 text-stone-500 flex justify-between">
                <span>LAT: {restaurante?.lat?.toFixed(6) || '0'}</span>
                <span>LNG: {restaurante?.lng?.toFixed(6) || '0'}</span>
              </div>

              <div className="mb-6">
                <input 
                  type="text"
                  placeholder="Ej: Sucursal Centro, Bodega Norte"
                  value={nuevoLocalName}
                  onChange={(e) => setNuevoLocalName(e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-[#0f172a] text-stone-800 dark:text-stone-100 text-sm outline-none focus:ring-2 focus:ring-coda/20"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveLocal();
                    }
                  }}
                />
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setIsAddLocalOpen(false)}
                  className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold text-xs rounded-xl hover:bg-stone-200 transition-all text-center"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveLocal}
                  className="flex-1 py-3 bg-coda text-white font-bold text-xs rounded-xl hover:bg-coda/90 transition-all text-center shadow-md shadow-coda/20"
                >
                  Guardar Local
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <Toast toast={toast} />
    </div>
  );
}
