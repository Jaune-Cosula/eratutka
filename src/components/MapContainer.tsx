import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

import {
  MapLayerType,
  Dog,
  TeamMember,
  MapAnnotation,
  SafetySector,
  UserLocation,
} from '../types';
import { calculateDistance, calculateBearing, formatDistance, wgs84ToEtrsTm35Fin, calculateDogTotalDistance, getCompassDirection, pruneExpiredTrackPoints, DOG_TRACK_MAX_AGE_MS } from '../utils/geoUtils';
import { Compass, Crosshair, MapPin, Eye, EyeOff, Layers, ChevronDown, Play, Pause } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/**
 * Adds a point to the bounds only if Leaflet can actually use it. A single NaN or
 * undefined coordinate — easy to get from an incomplete team member or a bad GPS fix —
 * poisons the whole bounds object, so fitBounds() either throws "Invalid LatLng" or
 * zooms somewhere meaningless. (0,0) is treated as absent: the map covers Finland, so a
 * null-island fix is always a device error rather than a real position.
 */
function extendBoundsSafely(bounds: L.LatLngBounds, lat: unknown, lng: unknown): void {
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  if (!isFinite(lat) || !isFinite(lng)) return;
  if (lat === 0 && lng === 0) return;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
  bounds.extend([lat, lng]);
}

/**
 * Colour of a track segment where the collar reported a bark. Deliberately not the dog's
 * own colour: a barking dog has to be findable at a glance on a trail that may otherwise
 * be the same hue (a red collar, for instance).
 */
const BARK_TRACK_COLOR = '#dc2626';

interface MapContainerProps {
  mapLayer: MapLayerType;
  setMapLayer: (layer: MapLayerType) => void;
  dogs: Dog[];
  selectedDogId: string | null;
  setSelectedDogId: (id: string | null) => void;
  team: TeamMember[];
  selectedHunterId?: string | null;
  setSelectedHunterId?: (id: string | null) => void;
  annotations: MapAnnotation[];
  safetySectors?: SafetySector[];
  userLocation: UserLocation | null;
  isDarkMode: boolean;
  onMapClick: (lat: number, lng: number) => void;
  activeRulerPoint: { lat: number; lng: number; title: string } | null;
  showSafetySectors?: boolean;
  setShowSafetySectors?: (val: boolean) => void;
  showDogTracks: boolean;
  setShowDogTracks: (val: boolean) => void;
  showHunterNames: boolean;
  setShowHunterNames: (val: boolean) => void;
  toggleGps?: () => void;
  isGpsTracking?: boolean;
  mapFocusTarget?: { lat: number; lng: number } | null;
  /** The local hunter's nickname, so their own team entry is not drawn on their own map. */
  myNickname?: string;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  mapLayer,
  setMapLayer,
  dogs,
  selectedDogId,
  setSelectedDogId,
  team,
  selectedHunterId,
  setSelectedHunterId,
  annotations,
  safetySectors,
  userLocation,
  isDarkMode,
  onMapClick,
  activeRulerPoint,
  showSafetySectors,
  setShowSafetySectors,
  showDogTracks,
  setShowDogTracks,
  showHunterNames,
  setShowHunterNames,
  toggleGps,
  isGpsTracking = false,
  mapFocusTarget,
  myNickname,
}) => {
  const { language } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const propertyLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Persistent overlay references to avoid clearLayers() teardown during animations/ticks
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userCircleRef = useRef<L.Circle | null>(null);
  const dogMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const dogTracksRef = useRef<Map<string, L.FeatureGroup>>(new Map());
  const hunterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const hunterPolylineRef = useRef<L.Polyline | null>(null);
  const dogBearingArrowRef = useRef<L.Marker | null>(null);
  const sectorPolygonsRef = useRef<Map<string, L.Polygon>>(new Map());
  const annoMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const geofenceCirclesRef = useRef<Map<string, L.Circle>>(new Map());
  const zonePolygonsRef = useRef<Map<string, L.Polygon>>(new Map());
  const rulerPolylineRef = useRef<L.Polyline | null>(null);
  const rulerBadgeRef = useRef<L.Marker | null>(null);

  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [isFollowingTarget, setIsFollowingTarget] = useState<boolean>(false);
  const isFollowingTargetRef = useRef<boolean>(false);
  isFollowingTargetRef.current = isFollowingTarget;

  const prevSelectedDogIdRef = useRef<string | null>(selectedDogId);
  const prevSelectedHunterIdRef = useRef<string | null>(selectedHunterId);

  // Leaflet binds its click handler once on mount, so it must not capture the
  // first render's callback (which would freeze e.g. "pick location on map" state).
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // MML (Maanmittauslaitos) & Kiinteistörajat state
  const [showKiinteistorajat, setShowKiinteistorajat] = useState<boolean>(() => {
    const saved = localStorage.getItem('eratutka_show_kiinteistorajat');
    return saved !== null ? saved === 'true' : true;
  });
  const [mmlApiKey, setMmlApiKey] = useState<string>(() => {
    return localStorage.getItem('eratutka_mml_key') || '';
  });
  const [mmlSource, setMmlSource] = useState<'kapsi' | 'custom'>(() => {
    const saved = localStorage.getItem('eratutka_mml_source');
    if (saved === 'kapsi' || saved === 'custom') return saved;
    return localStorage.getItem('eratutka_mml_key') ? 'custom' : 'kapsi';
  });
  const [showMmlKeyModal, setShowMmlKeyModal] = useState<boolean>(false);
  const [mmlTileError, setMmlTileError] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('eratutka_mml_source', mmlSource);
  }, [mmlSource]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Default center: Ilomantsi / Kuhmo wilderness or user location
    const initialLat = userLocation ? userLocation.lat : 63.854;
    const initialLng = userLocation ? userLocation.lng : 29.812;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 13,
      minZoom: 4,
      maxZoom: 22,
      zoomControl: false, // We render custom clean controls
      bounceAtZoomLimits: false,
      inertia: true,
      inertiaDeceleration: 3000,
      inertiaMaxSpeed: 1500,
      touchZoom: true,
      scrollWheelZoom: true,
      ...({ tap: false } as any), // Prevents mobile touch/pan delay and snapping glitches in mobile browsers
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    // Disable auto-follow when user manually drags or touches the map to pan
    map.on('dragstart', () => {
      setIsFollowingTarget(false);
      isFollowingTargetRef.current = false;
    });

    map.on('touchstart', () => {
      setIsFollowingTarget(false);
      isFollowingTargetRef.current = false;
    });

    mapRef.current = map;

    // Observe container resize to ensure tiles re-render properly without grey gaps
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        requestAnimationFrame(() => {
          if (mapRef.current) {
            try {
              mapRef.current.invalidateSize({ animate: false });
            } catch {
              // ignore unmount edge cases
            }
          }
        });
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    // Force map container layout updates after mount
    setTimeout(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    }, 150);
    setTimeout(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    }, 500);

    // Initial fit bounds to include active dogs if available
    setTimeout(() => {
      if (dogs && dogs.length > 0 && mapRef.current) {
        const bounds = L.latLngBounds([]);
        dogs.forEach((d) => {
          if (d.isActive) extendBoundsSafely(bounds, d.lat, d.lng);
        });
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        }
      }
    }, 300);

    return () => {
      resizeObserver.disconnect();
      dogMarkersRef.current.clear();
      dogTracksRef.current.clear();
      hunterMarkersRef.current.clear();
      sectorPolygonsRef.current.clear();
      annoMarkersRef.current.clear();
      userMarkerRef.current = null;
      userCircleRef.current = null;
      rulerPolylineRef.current = null;
      rulerBadgeRef.current = null;
      hunterPolylineRef.current = null;
      dogBearingArrowRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Center & zoom to target coordinates when mapFocusTarget changes
  useEffect(() => {
    if (!mapRef.current || !mapFocusTarget) return;
    mapRef.current.setView([mapFocusTarget.lat, mapFocusTarget.lng], 15, { animate: true });
  }, [mapFocusTarget]);

  // Save Kiinteistörajat toggle state
  useEffect(() => {
    localStorage.setItem('eratutka_show_kiinteistorajat', showKiinteistorajat.toString());
  }, [showKiinteistorajat]);

  // Handle MML Kiinteistörajat (Property Boundaries Overlay)
  useEffect(() => {
    if (!mapRef.current) return;

    if (propertyLayerRef.current) {
      mapRef.current.removeLayer(propertyLayerRef.current);
      propertyLayerRef.current = null;
    }

    if (showKiinteistorajat) {
      const useCustomKey = mmlSource === 'custom' && Boolean(mmlApiKey.trim());

      if (useCustomKey) {
        const propUrl = `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/kiinteistojaotus/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${mmlApiKey.trim()}`;

        const propLayer = L.tileLayer(propUrl, {
          attribution: '&copy; Maanmittauslaitos MML (Kiinteistörajat)',
          minZoom: 10,
          maxNativeZoom: 18,
          maxZoom: 22,
          opacity: 0.85,
        });

        propLayer.on('tileerror', () => {
          if (mmlSource === 'custom') {
            setMmlTileError(true);
          }
        });

        propLayer.addTo(mapRef.current);
        propertyLayerRef.current = propLayer;
      } else {
        // Default: Kapsi Kiinteistörajat WMS transparent layer (no key required!)
        const propLayer = L.tileLayer.wms('/api/map/kapsi/kiinteistorajat?', {
          layers: 'kiinteistorajat',
          format: 'image/png',
          transparent: true,
          version: '1.1.1',
          attribution: '&copy; MML Kiinteistörajat (Kapsi.fi)',
          minZoom: 10,
          maxNativeZoom: 18,
          maxZoom: 22,
          opacity: 0.85,
        });

        propLayer.addTo(mapRef.current);
        propertyLayerRef.current = propLayer;
      }
    }
  }, [showKiinteistorajat, mmlApiKey, mmlSource]);

  // Handle Tile Layer Switching
  useEffect(() => {
    if (!mapRef.current) return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    let tileLayer: L.Layer;

    if (mapLayer === 'mml_maasto' || mapLayer === 'mml_tausta') {
      const useCustomKey = mmlSource === 'custom' && Boolean(mmlApiKey.trim());

      if (useCustomKey) {
        setMmlTileError(false);
        const subType = mapLayer === 'mml_maasto' ? 'maastokartta' : 'taustakartta';
        const url = `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/${subType}/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${mmlApiKey.trim()}`;
        const attribution = '&copy; Maanmittauslaitos (MML) Avoin maastokartta (Oma avain)';

        const layer = L.tileLayer(url, {
          attribution,
          minZoom: 4,
          maxNativeZoom: 18,
          maxZoom: 22,
        });

        layer.on('tileerror', () => {
          if (mmlSource === 'custom') {
            setMmlTileError(true);
          }
        });

        tileLayer = layer;
      } else {
        // DEFAULT: Kapsi MML WMS Map service (no key needed!)
        setMmlTileError(false);
        const layerName = mapLayer === 'mml_maasto' ? 'peruskartta' : 'taustakartta';
        const attribution = mapLayer === 'mml_maasto'
          ? '🌲 Maanmittauslaitos Peruskartta (Kapsi.fi)'
          : '🗺️ Maanmittauslaitos Taustakartta (Kapsi.fi)';

        const layer = L.tileLayer.wms(`/api/map/kapsi/${layerName}?`, {
          layers: layerName,
          format: 'image/jpeg',
          transparent: false,
          version: '1.1.1',
          attribution,
          minZoom: 4,
          maxNativeZoom: 18,
          maxZoom: 22,
        });

        tileLayer = layer;
      }
    } else {
      setMmlTileError(false);
      let url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
      let attribution = '&copy; Esri, USGS, OpenTopoMap';
      let maxZoom = 22;
      let maxNativeZoom = 18;
      let minZoom = 4;

      if (mapLayer === 'opentopo') {
        url = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
        attribution = '&copy; OpenTopoMap (CC-BY-SA)';
        maxNativeZoom = 17;
      } else if (mapLayer === 'topo') {
        url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
        attribution = '&copy; Esri Topo / USGS';
        maxNativeZoom = 18;
      } else if (mapLayer === 'osm') {
        url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        attribution = '&copy; OpenStreetMap contributors';
        maxNativeZoom = 19;
      } else if (mapLayer === 'satellite') {
        url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        attribution = '&copy; Esri World Imagery';
        maxNativeZoom = 18;
      } else if (mapLayer === 'dark') {
        url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; CartoDB Dark';
        maxNativeZoom = 19;
      }

      tileLayer = L.tileLayer(url, {
        attribution,
        minZoom,
        maxNativeZoom,
        maxZoom,
        subdomains: 'abc',
      });
    }

    tileLayer.addTo(mapRef.current);
    tileLayerRef.current = tileLayer;

    // Trigger immediate resize recalculation
    mapRef.current.invalidateSize();
  }, [mapLayer, mmlApiKey, mmlSource]);

  // Center on selected dog ONLY when selectedDogId actually changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedDogId && prevSelectedDogIdRef.current !== selectedDogId) {
      prevSelectedDogIdRef.current = selectedDogId;
      const dog = dogs.find((d) => d.id === selectedDogId);
      if (dog) {
        mapRef.current.panTo([dog.lat, dog.lng], { animate: true });
      }
    } else {
      prevSelectedDogIdRef.current = selectedDogId;
    }
  }, [selectedDogId]);

  // Center on selected hunter ONLY when selectedHunterId actually changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedHunterId && prevSelectedHunterIdRef.current !== selectedHunterId) {
      prevSelectedHunterIdRef.current = selectedHunterId;
      const hunter = team.find((h) => h.id === selectedHunterId);
      if (hunter) {
        mapRef.current.panTo([hunter.lat, hunter.lng], { animate: true });
      }
    } else {
      prevSelectedHunterIdRef.current = selectedHunterId;
    }
  }, [selectedHunterId]);

  // Render Map Overlays incrementally using persistent marker refs
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;
    const layerGroup = layerGroupRef.current;

    // 1. User GPS Position & Accuracy Circle
    if (userLocation) {
      const userLatLng: [number, number] = [userLocation.lat, userLocation.lng];

      // Accuracy circle
      if (userLocation.accuracy > 0) {
        if (userCircleRef.current) {
          userCircleRef.current.setLatLng(userLatLng);
          userCircleRef.current.setRadius(userLocation.accuracy);
        } else {
          userCircleRef.current = L.circle(userLatLng, {
            radius: userLocation.accuracy,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            weight: 1,
          }).addTo(layerGroup);
        }
      } else if (userCircleRef.current) {
        layerGroup.removeLayer(userCircleRef.current);
        userCircleRef.current = null;
      }

      // User Marker
      const userIconHtml = `
        <div class="relative flex items-center justify-center w-8 h-8">
          <span class="absolute w-full h-full rounded-full bg-sky-500 opacity-40 animate-ping"></span>
          <div class="w-6 h-6 rounded-full bg-sky-600 border-2 border-white shadow-lg flex items-center justify-center text-white font-bold text-[10px]">
            SINÄ
          </div>
        </div>
      `;
      const userMarkerIcon = L.divIcon({
        html: userIconHtml,
        className: 'user-marker-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      // The popup content is rebuilt on every tick too: binding it only at creation left
      // it showing the accuracy of the very first GPS fix for the rest of the session.
      const userPopupHtml = `<b>Sinun sijaintisi</b><br/>Tarkkuus: ${Math.round(userLocation.accuracy)}m`;

      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(userLatLng);
        userMarkerRef.current.setIcon(userMarkerIcon);
        userMarkerRef.current.setPopupContent(userPopupHtml);
      } else {
        userMarkerRef.current = L.marker(userLatLng, { icon: userMarkerIcon })
          .bindPopup(userPopupHtml)
          .addTo(layerGroup);
      }
    } else {
      if (userMarkerRef.current) {
        layerGroup.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (userCircleRef.current) {
        layerGroup.removeLayer(userCircleRef.current);
        userCircleRef.current = null;
      }
    }

    // 2. Dog Track History Polylines & Markers
    const currentDogIds = new Set<string>();

    dogs.forEach((dog) => {
      if (dog.isActive === false) return;
      if (
        typeof dog.lat !== 'number' ||
        typeof dog.lng !== 'number' ||
        isNaN(dog.lat) ||
        isNaN(dog.lng) ||
        (dog.lat === 0 && dog.lng === 0)
      ) {
        return;
      }
      currentDogIds.add(dog.id);

      const dogLatLng: [number, number] = [dog.lat, dog.lng];

      // Dog Track Line (with 12h aging, auto-pruning, and solid thicker line for "ajojälki" when moving & barking)
      const now = Date.now();
      const validTrackPoints = pruneExpiredTrackPoints(dog.trackHistory || [], DOG_TRACK_MAX_AGE_MS, now);

      if (showDogTracks && validTrackPoints.length > 1) {
        interface SegmentChunk {
          isBarking: boolean;
          coords: [number, number][];
          latestTimestamp: number;
        }

        const chunks: SegmentChunk[] = [];
        let currentChunk: SegmentChunk | null = null;

        for (let i = 1; i < validTrackPoints.length; i++) {
          const pPrev = validTrackPoints[i - 1];
          const pCurr = validTrackPoints[i];

          // A segment is highlighted purely on barking; movement is deliberately not
          // required. A dog barking at a tree while standing still is the moment a hunter
          // most wants to find on the map, and it used to blend into the ordinary trail.
          const isBarking = Math.max(pCurr.barkRate || 0, pPrev.barkRate || 0) > 0;

          if (!currentChunk) {
            currentChunk = {
              isBarking,
              coords: [[pPrev.lat, pPrev.lng], [pCurr.lat, pCurr.lng]],
              latestTimestamp: pCurr.timestamp,
            };
          } else if (currentChunk.isBarking === isBarking) {
            currentChunk.coords.push([pCurr.lat, pCurr.lng]);
            currentChunk.latestTimestamp = pCurr.timestamp;
          } else {
            chunks.push(currentChunk);
            currentChunk = {
              isBarking,
              coords: [[pPrev.lat, pPrev.lng], [pCurr.lat, pCurr.lng]],
              latestTimestamp: pCurr.timestamp,
            };
          }
        }

        if (currentChunk) {
          chunks.push(currentChunk);
        }

        let trackGroup = dogTracksRef.current.get(dog.id);
        if (!trackGroup) {
          trackGroup = L.featureGroup().addTo(layerGroup);
          dogTracksRef.current.set(dog.id, trackGroup);
        } else {
          trackGroup.clearLayers();
        }

        chunks.forEach((chunk) => {
          // Calculate track age within the 12-hour window (fades older portions gradually)
          const ageHours = Math.max(0, (now - chunk.latestTimestamp) / (3600 * 1000));
          const ageFraction = Math.min(1, Math.max(0, ageHours / 12));
          const opacity = chunk.isBarking
            ? Math.max(0.65, 0.95 - ageFraction * 0.3)
            : Math.max(0.5, 0.85 - ageFraction * 0.4);

          const polyline = L.polyline(chunk.coords, {
            // Solid rather than dashed: the dashes turned into visual noise when zoomed in
            // close to a dog circling inside a small area.
            color: chunk.isBarking ? BARK_TRACK_COLOR : dog.color,
            weight: chunk.isBarking ? 4 : 2,
            opacity,
            lineCap: 'round',
            lineJoin: 'round',
          });

          const ageMinutes = Math.max(0, Math.round((now - chunk.latestTimestamp) / 60000));
          const ageText =
            ageMinutes < 60
              ? `${ageMinutes} min sitten`
              : `${(ageMinutes / 60).toFixed(1)} h sitten`;

          const tooltipHtml = chunk.isBarking
            ? `🐕 <strong>${dog.name}</strong>: <strong>Haukku</strong> (${ageText})`
            : `🐕 <strong>${dog.name}</strong>: Jälki (${ageText})`;

          polyline.bindTooltip(tooltipHtml, {
            sticky: true,
            className: 'leaflet-tooltip-dark',
          });

          polyline.addTo(trackGroup!);
        });
      } else if (dogTracksRef.current.has(dog.id)) {
        layerGroup.removeLayer(dogTracksRef.current.get(dog.id)!);
        dogTracksRef.current.delete(dog.id);
      }

      // Dog Marker
      const isSelected = selectedDogId === dog.id;

      const isCat = Boolean(
        dog.breed?.toLowerCase().includes('kissa') ||
        dog.name?.toLowerCase().includes('kissa') ||
        dog.trackerModel?.toLowerCase().includes('kissa') ||
        dog.trackerModel?.toLowerCase().includes('tractive') ||
        dog.collarId?.toLowerCase().includes('cat') ||
        dog.notes?.toLowerCase().includes('kissa')
      );
      const petEmoji = isCat ? '🐱' : '🐕';

      let statusBadge = '';
      if (dog.status === 'haukkuu') {
        const holdTag = dog.barkHoldRemainingFixes && dog.barkHoldRemainingFixes > 0
          ? ` <span class="text-[8px] text-amber-200 font-normal">(${dog.barkHoldRemainingFixes}/3)</span>`
          : '';
        statusBadge = `<span class="bg-red-600 text-white font-black px-1.5 py-0.2 text-[9px] rounded-full animate-pulse ml-0.5 shadow">🔊 ${dog.barkRate}${holdTag}</span>`;
      } else if (dog.status === 'seisoo') {
        statusBadge = `<span class="bg-amber-500 text-stone-950 font-black px-1 py-0.2 text-[9px] rounded ml-0.5 shadow">🛑</span>`;
      }

      const dogIconHtml = `
        <div class="relative flex flex-col items-center cursor-pointer group">
          <div class="flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-stone-900/95 text-white text-[11px] font-bold border ${
            isSelected ? 'border-amber-400 ring-2 ring-amber-400' : 'border-stone-700'
          } shadow-lg whitespace-nowrap">
            <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${dog.color}"></span>
            <span class="font-extrabold">${dog.name}</span>
            ${statusBadge}
          </div>
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-xl mt-0.5 border-2 border-white text-base" style="background-color: ${dog.color}">
            ${petEmoji}
          </div>
        </div>
      `;

      const dogMarkerIcon = L.divIcon({
        html: dogIconHtml,
        className: 'dog-marker-icon',
        iconSize: [120, 50],
        iconAnchor: [60, 48],
      });

      const timeAgoSec = dog.lastUpdated ? Math.max(0, Math.floor((Date.now() - dog.lastUpdated) / 1000)) : null;
      const timeAgoText = timeAgoSec !== null ? (timeAgoSec < 5 ? 'Juuri nyt' : `${timeAgoSec} s sitten`) : 'Ei tietoa';
      
      let distToUserText = '';
      if (userLocation) {
        const dM = calculateDistance(userLocation.lat, userLocation.lng, dog.lat, dog.lng);
        const bD = calculateBearing(userLocation.lat, userLocation.lng, dog.lat, dog.lng);
        const cD = getCompassDirection(bD);
        distToUserText = `<div style="font-size:12px; font-weight:800; color:#d97706; margin-top:4px;">📍 Etäisyys sinuun: ${formatDistance(dM)} (${cD} ${bD}°)</div>`;
      }

      const totalDistMeters = calculateDogTotalDistance(dog);
      const totalDistText = `<div style="font-size:11px; font-weight:700; color:#0284c7; margin-top:2px;">📏 Kulkema matka: ${formatDistance(totalDistMeters)}</div>`;

      const addedByText = dog.addedBy ? `<div style="font-size:11px; color:#444; margin-top:2px;">👤 Lisännyt: <b style="color:#d97706;">${dog.addedBy}</b></div>` : '';

      const popupHtml = `
        <div style="min-width: 180px;" class="p-1 font-sans text-stone-900">
          <div style="color:${dog.color}; font-weight:800; font-size:14px;">${petEmoji} ${dog.name}</div>
          <div style="font-size:11px; color:#555;">${dog.breed} • ${dog.trackerModel || dog.collarId}</div>
          ${addedByText}
          ${distToUserText}
          ${totalDistText}
          <div style="font-size:12px; margin-top:4px;">Tila: <b>${
            dog.status === 'haukkuu'
              ? `🔊 Haukkuu (${dog.barkRate} HKM${dog.barkHoldRemainingFixes && dog.barkHoldRemainingFixes > 0 ? `, tauon pito ${dog.barkHoldRemainingFixes}/3 pk` : ''})`
              : dog.status === 'seisoo'
              ? '🛑 Seisoo'
              : (dog.status === 'juoksee' || dog.status === 'liikkeessä')
              ? `🏃 Juoksee (${dog.speed} km/h)`
              : '⏸️ Paikallaan'
          }</b></div>
          <div style="font-size:11px; color:#059669; font-weight:700; margin-top:3px;">⏱️ Päivitetty: ${timeAgoText}</div>
          <div style="font-size:11px; color:#666; margin-top:2px;">🔋 Akku: ${dog.battery}% • 📶 ${dog.signal}%</div>
        </div>
      `;

      if (dogMarkersRef.current.has(dog.id)) {
        const marker = dogMarkersRef.current.get(dog.id)!;
        marker.setLatLng(dogLatLng);
        marker.setIcon(dogMarkerIcon);
        marker.setPopupContent(popupHtml);
        marker.off('click').on('click', () => {
          setSelectedDogId(dog.id);
          if (setSelectedHunterId) setSelectedHunterId(null);
          setIsFollowingTarget(true);
          if (mapRef.current) {
            mapRef.current.panTo([dog.lat, dog.lng], { animate: true });
          }
        });
      } else {
        const dogMarker = L.marker(dogLatLng, { icon: dogMarkerIcon })
          .bindPopup(popupHtml)
          .addTo(layerGroup);
        dogMarker.on('click', () => {
          setSelectedDogId(dog.id);
          if (setSelectedHunterId) setSelectedHunterId(null);
          setIsFollowingTarget(true);
          if (mapRef.current) {
            mapRef.current.panTo([dog.lat, dog.lng], { animate: true });
          }
        });
        dogMarkersRef.current.set(dog.id, dogMarker);
      }
    });

    // Remove obsolete dogs/tracks
    dogMarkersRef.current.forEach((marker, id) => {
      if (!currentDogIds.has(id)) {
        layerGroup.removeLayer(marker);
        dogMarkersRef.current.delete(id);
      }
    });
    dogTracksRef.current.forEach((track, id) => {
      if (!currentDogIds.has(id) || !showDogTracks) {
        layerGroup.removeLayer(track);
        dogTracksRef.current.delete(id);
      }
    });

    // 3. Hunters / Team Members
    const currentHunterIds = new Set<string>();
    const selfName = String(myNickname || '').trim().toLowerCase();

    team.forEach((member) => {
      // The local hunter's own position is already drawn as the sky-blue "SINÄ" marker from
      // the GPS fix. Drawing their team entry as well put them on their own map twice, in
      // two markers that looked identical (both a blue circle with a white border).
      if (selfName && String(member.name || '').trim().toLowerCase() === selfName) return;

      currentHunterIds.add(member.id);
      const hunterLatLng: [number, number] = [member.lat, member.lng];

      const isTrackedHunter = selectedHunterId === member.id;

      // Amber rather than sky-blue: the same hue as the "SINÄ" marker made a hunter
      // indistinguishable from oneself on the map, and made one hunter look like another's
      // "you are here" dot.
      const hunterIconHtml = `
        <div class="flex flex-col items-center cursor-pointer relative">
          ${
            showHunterNames
              ? `<div class="bg-amber-950/90 text-amber-200 border border-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-md mb-0.5 whitespace-nowrap">
                  ${member.name} ${isTrackedHunter ? '🎯 (SEURANNASSA)' : ''}
                </div>`
              : ''
          }
          <div class="w-8 h-8 rounded-full bg-amber-600 text-white border-2 ${
            isTrackedHunter ? 'border-white ring-4 ring-amber-300/70 animate-bounce' : 'border-amber-100'
          } flex items-center justify-center shadow-lg font-bold text-xs">
            🎯
          </div>
        </div>
      `;

      const hunterIcon = L.divIcon({
        html: hunterIconHtml,
        className: 'hunter-marker-icon',
        iconSize: [100, 40],
        iconAnchor: [50, 35],
      });

      const timeAgoSec = member.lastUpdated ? Math.max(0, Math.floor((Date.now() - member.lastUpdated) / 1000)) : null;
      const timeAgoText = timeAgoSec !== null
        ? (timeAgoSec < 5 ? 'Juuri nyt' : timeAgoSec < 60 ? `${timeAgoSec} s sitten` : `${Math.floor(timeAgoSec / 60)} min sitten`)
        : 'Ei tietoa';

      const hunterRoleTitle =
        member.role === 'koiramies'
          ? '🐕 Koiramies'
          : member.role === 'päällikkö'
          ? '👑 Jahtipäällikkö'
          : member.role === 'passimies'
          ? '🎯 Passimies'
          : 'Ajomies';

      const hunterStatusTitle =
        member.status === 'passissa'
          ? '🎯 Passissa'
          : member.status === 'liikkeella'
          ? '🚶 Liikkeellä'
          : member.status === 'kaato'
          ? '💥 Kaato tehty'
          : '☕ Tauolla';

      const hunterPopupHtml = `
        <div style="min-width: 185px;" class="p-1 font-sans text-stone-900">
          <div style="font-weight:800; font-size:14px; color:#0284c7;" class="flex items-center space-x-1">
            🎯 <b>${member.name}</b>
          </div>
          <div style="font-size:11px; color:#555; margin-top:2px;">
            ${hunterRoleTitle} ${member.standName ? `• ${member.standName}` : ''}
          </div>
          <div style="font-size:12px; margin-top:4px;">Tila: <b>${hunterStatusTitle}</b></div>
          <div style="font-size:11px; color:#059669; font-weight:700; margin-top:4px; background-color:#ecfdf5; padding:3px 6px; border-radius:6px; border:1px solid #a7f3d0; display:inline-block;">
            ⏱️ Paikannus: ${timeAgoText}
          </div>
          <div style="font-size:11px; color:#666; margin-top:4px;">
            🔋 Akku: ${member.battery || 100}%
          </div>
        </div>
      `;

      if (hunterMarkersRef.current.has(member.id)) {
        const marker = hunterMarkersRef.current.get(member.id)!;
        marker.setLatLng(hunterLatLng);
        marker.setIcon(hunterIcon);
        marker.setPopupContent(hunterPopupHtml);
      } else {
        const marker = L.marker(hunterLatLng, { icon: hunterIcon })
          .bindPopup(hunterPopupHtml)
          .addTo(layerGroup);
        hunterMarkersRef.current.set(member.id, marker);
      }
    });

    hunterMarkersRef.current.forEach((marker, id) => {
      if (!currentHunterIds.has(id)) {
        layerGroup.removeLayer(marker);
        hunterMarkersRef.current.delete(id);
      }
    });

    // Draw vector line to tracked hunter if selectedHunterId is set
    const trackedHunter = selectedHunterId ? team.find((h) => h.id === selectedHunterId) : null;
    if (trackedHunter && userLocation) {
      const userLatLng: [number, number] = [userLocation.lat, userLocation.lng];
      const hunterLatLng: [number, number] = [trackedHunter.lat, trackedHunter.lng];
      const lineCoords = [userLatLng, hunterLatLng];

      const dist = calculateDistance(userLocation.lat, userLocation.lng, trackedHunter.lat, trackedHunter.lng);
      const bearing = calculateBearing(userLocation.lat, userLocation.lng, trackedHunter.lat, trackedHunter.lng);

      if (hunterPolylineRef.current) {
        hunterPolylineRef.current.setLatLngs(lineCoords);
      } else {
        hunterPolylineRef.current = L.polyline(lineCoords, {
          color: '#38bdf8',
          weight: 3,
          dashArray: '8, 8',
          opacity: 0.9,
        }).addTo(layerGroup);
      }
    } else {
      if (hunterPolylineRef.current) {
        layerGroup.removeLayer(hunterPolylineRef.current);
        hunterPolylineRef.current = null;
      }
    }

    // Draw vector line to tracked dog if selectedDogId (or first active dog) is set
    const trackedDog = selectedDogId
      ? dogs.find((d) => d.id === selectedDogId && d.isActive)
      : dogs.find((d) => d.isActive) || dogs[0];

    // Direction to the tracked dog: a short arrow at the hunter's own position, rotated to
    // point at the dog. It replaces the straight line that used to connect the two, which
    // spanned the whole map and was easy to mistake for the dog's own track. Pixel-sized,
    // so it reads the same at every zoom level, and interactive:false so it never blocks a
    // tap on the markers beneath it.
    if (trackedDog && userLocation && !selectedHunterId) {
      const bearing = calculateBearing(userLocation.lat, userLocation.lng, trackedDog.lat, trackedDog.lng);
      const arrowColor = trackedDog.color || '#f59e0b';
      const arrowHtml = `
        <div style="width:72px; height:72px; position:relative; pointer-events:none; background:transparent; border:none; transform:rotate(${bearing}deg); transform-origin:50% 50%;">
          <div style="position:absolute; left:50%; top:2px; margin-left:-8px; width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent; border-bottom:16px solid ${arrowColor}; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.55));"></div>
        </div>
      `;
      const arrowIcon = L.divIcon({
        html: arrowHtml,
        className: 'dog-bearing-arrow',
        iconSize: [72, 72],
        iconAnchor: [36, 36],
      });
      const userLatLng: [number, number] = [userLocation.lat, userLocation.lng];

      if (dogBearingArrowRef.current) {
        dogBearingArrowRef.current.setLatLng(userLatLng);
        dogBearingArrowRef.current.setIcon(arrowIcon);
      } else {
        dogBearingArrowRef.current = L.marker(userLatLng, {
          icon: arrowIcon,
          interactive: false,
          zIndexOffset: -200,
        }).addTo(layerGroup);
      }
    } else if (dogBearingArrowRef.current) {
      layerGroup.removeLayer(dogBearingArrowRef.current);
      dogBearingArrowRef.current = null;
    }

    // 4. Safety Sectors (Removed per user request)
    sectorPolygonsRef.current.forEach((poly) => layerGroup.removeLayer(poly));
    sectorPolygonsRef.current.clear();

    // 5. Annotations & Sightings
    const currentAnnoIds = new Set<string>();

    if (showAnnotations) {
      annotations.forEach((anno) => {
        currentAnnoIds.add(anno.id);

        let iconSymbol = '📍';
        let bgColor = 'bg-amber-500';

        if (anno.subType === 'geofence' || anno.subType === 'turva_alue' || anno.category === 'raja') {
          iconSymbol = '🛡️';
          bgColor = 'bg-emerald-600';

          // 1. If annotation has explicit polygon geometry (e.g. from Oma riista or GeoJSON)
          if ((anno.polygon && anno.polygon.length >= 3) || (anno.multiPolygon && anno.multiPolygon.length > 0)) {
            const polygonCoords = (anno.multiPolygon && anno.multiPolygon.length > 0)
              ? (anno.multiPolygon as any)
              : (anno.polygon as any);
            const strokeColor = anno.color || '#16a34a';
            const areaText = anno.areaHectares ? `${anno.areaHectares} ha` : '';

            if (zonePolygonsRef.current.has(anno.id)) {
              const poly = zonePolygonsRef.current.get(anno.id)!;
              poly.setLatLngs(polygonCoords as any);
            } else {
              const poly = L.polygon(polygonCoords as any, {
                color: strokeColor,
                fillColor: strokeColor,
                fillOpacity: 0.22,
                weight: 3,
                dashArray: '5, 5',
              })
                .bindTooltip(
                  `<b>🌲 ${anno.title}</b>${areaText ? ` (${areaText})` : ''}`,
                  { permanent: false, direction: 'top', className: 'font-sans text-xs font-bold' }
                )
                .bindPopup(
                  `<div class="p-1.5 font-sans">
                    <div class="flex items-center space-x-1.5 mb-1">
                      <span class="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">🌲 METSÄSTYSALUE</span>
                      ${areaText ? `<span class="text-xs font-mono font-bold text-stone-700">${areaText}</span>` : ''}
                    </div>
                    <h4 class="font-extrabold text-stone-900 text-sm leading-tight">${anno.title}</h4>
                    <p class="text-xs text-stone-600 mt-1">${anno.description || ''}</p>
                    <div class="mt-2 pt-1 border-t border-stone-200 text-[10px] text-stone-400">Lähde: ${anno.createdBy}</div>
                  </div>`
                )
                .addTo(layerGroup);
              zonePolygonsRef.current.set(anno.id, poly);
            }
          } else {
            // 2. Draw standard Geofence radius circle overlay if no polygon coordinates
            const radius = anno.radiusMeters || 500;
            if (geofenceCirclesRef.current.has(anno.id)) {
              const circle = geofenceCirclesRef.current.get(anno.id)!;
              circle.setLatLng([anno.lat, anno.lng]);
              circle.setRadius(radius);
            } else {
              const circle = L.circle([anno.lat, anno.lng], {
                radius,
                color: '#f59e0b',
                fillColor: '#f59e0b',
                fillOpacity: 0.18,
                weight: 2.5,
                dashArray: '6, 8',
              })
                .bindPopup(
                  `<div class="p-1 font-sans">
                    <h4 class="font-black text-amber-600 text-sm">🛡️ ${anno.title} (Geofence)</h4>
                    <p class="text-xs text-stone-700 font-bold mt-1">Säde: ${radius} metriä</p>
                    <p class="text-[11px] text-stone-500 mt-0.5">${anno.description || ''}</p>
                  </div>`
                )
                .addTo(layerGroup);
              geofenceCirclesRef.current.set(anno.id, circle);
            }
          }
        } else if (anno.subType === 'passi') {
          iconSymbol = '🎯';
          bgColor = 'bg-amber-600';
        } else if (anno.subType === 'hirvi') {
          iconSymbol = '🫎';
          bgColor = 'bg-red-600';
        } else if (anno.subType === 'karhu') {
          iconSymbol = '🐻';
          bgColor = 'bg-purple-600';
        } else if (anno.subType === 'nuotio' || anno.subType === 'laavu') {
          iconSymbol = '🔥';
          bgColor = 'bg-orange-500';
        }

        const annoIconHtml = `
          <div class="flex flex-col items-center cursor-pointer group">
            <div class="hidden group-hover:block bg-stone-900/95 text-stone-100 text-[10px] font-semibold px-2 py-0.5 rounded shadow-lg border border-stone-700 whitespace-nowrap mb-0.5">
              ${anno.title}
            </div>
            <div class="w-6 h-6 rounded-lg ${bgColor} text-white border border-white flex items-center justify-center shadow-md text-xs font-bold">
              ${iconSymbol}
            </div>
          </div>
        `;

        const annoMarkerIcon = L.divIcon({
          html: annoIconHtml,
          className: 'anno-marker-icon',
          iconSize: [80, 35],
          iconAnchor: [40, 30],
        });

        if (annoMarkersRef.current.has(anno.id)) {
          const marker = annoMarkersRef.current.get(anno.id)!;
          marker.setLatLng([anno.lat, anno.lng]);
          marker.setIcon(annoMarkerIcon);
        } else {
          const marker = L.marker([anno.lat, anno.lng], { icon: annoMarkerIcon })
            .bindPopup(
              `<div class="p-1">
                <h4 class="font-bold text-sm text-stone-900">${anno.title}</h4>
                <p class="text-xs text-stone-600 mt-0.5">${anno.description || ''}</p>
                <div class="mt-1 text-[10px] text-stone-500">Lisännyt: ${anno.createdBy}</div>
              </div>`
            )
            .addTo(layerGroup);
          annoMarkersRef.current.set(anno.id, marker);
        }
      });
    }

    annoMarkersRef.current.forEach((marker, id) => {
      if (!currentAnnoIds.has(id)) {
        layerGroup.removeLayer(marker);
        annoMarkersRef.current.delete(id);
      }
    });

    geofenceCirclesRef.current.forEach((circle, id) => {
      if (!currentAnnoIds.has(id)) {
        layerGroup.removeLayer(circle);
        geofenceCirclesRef.current.delete(id);
      }
    });

    zonePolygonsRef.current.forEach((poly, id) => {
      if (!currentAnnoIds.has(id)) {
        layerGroup.removeLayer(poly);
        zonePolygonsRef.current.delete(id);
      }
    });

    // 6. Active Distance Ruler Line
    if (activeRulerPoint && userLocation) {
      const userLatLng: [number, number] = [userLocation.lat, userLocation.lng];
      const targetLatLng: [number, number] = [activeRulerPoint.lat, activeRulerPoint.lng];

      const distMeters = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        activeRulerPoint.lat,
        activeRulerPoint.lng
      );
      const bearing = calculateBearing(
        userLocation.lat,
        userLocation.lng,
        activeRulerPoint.lat,
        activeRulerPoint.lng
      );

      if (rulerPolylineRef.current) {
        rulerPolylineRef.current.setLatLngs([userLatLng, targetLatLng]);
      } else {
        rulerPolylineRef.current = L.polyline([userLatLng, targetLatLng], {
          color: '#a855f7',
          weight: 3,
          dashArray: '8, 8',
        }).addTo(layerGroup);
      }

      const midLat = (userLocation.lat + activeRulerPoint.lat) / 2;
      const midLng = (userLocation.lng + activeRulerPoint.lng) / 2;

      const badgeHtml = `
        <div class="bg-purple-900 text-purple-100 font-mono text-[11px] font-bold px-2 py-1 rounded-md border border-purple-400 shadow-xl whitespace-nowrap">
          📏 ${formatDistance(distMeters)} • ${bearing}°
        </div>
      `;

      const badgeIcon = L.divIcon({
        html: badgeHtml,
        className: 'ruler-badge-icon',
        iconSize: [120, 26],
        iconAnchor: [60, 13],
      });

      if (rulerBadgeRef.current) {
        rulerBadgeRef.current.setLatLng([midLat, midLng]);
        rulerBadgeRef.current.setIcon(badgeIcon);
      } else {
        rulerBadgeRef.current = L.marker([midLat, midLng], { icon: badgeIcon }).addTo(layerGroup);
      }
    } else {
      if (rulerPolylineRef.current) {
        layerGroup.removeLayer(rulerPolylineRef.current);
        rulerPolylineRef.current = null;
      }
      if (rulerBadgeRef.current) {
        layerGroup.removeLayer(rulerBadgeRef.current);
        rulerBadgeRef.current = null;
      }
    }

    // Auto-follow active target if follow mode is active
    if (isFollowingTargetRef.current && mapRef.current) {
      if (trackedHunter) {
        mapRef.current.panTo([trackedHunter.lat, trackedHunter.lng], { animate: true, duration: 0.8 });
      } else if (trackedDog) {
        mapRef.current.panTo([trackedDog.lat, trackedDog.lng], { animate: true, duration: 0.8 });
      }
    }
  }, [
    userLocation,
    dogs,
    selectedDogId,
    team,
    selectedHunterId,
    annotations,
    safetySectors,
    activeRulerPoint,
    showSafetySectors,
    showDogTracks,
    showHunterNames,
    showAnnotations,
  ]);

  // Quick Center on User GPS
  const handleCenterUser = () => {
    if (!mapRef.current) return;
    if (userLocation) {
      mapRef.current.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
    } else {
      if (toggleGps && !isGpsTracking) {
        toggleGps();
      }
      mapRef.current.setView([63.854, 29.812], 13, { animate: true });
    }
  };

  // Toggle Center on Target / Follow Target (1st press = center & follow, 2nd press = pause follow for free browsing)
  const handleToggleTargetFollow = () => {
    if (!mapRef.current) return;

    const trackedHunter = selectedHunterId ? team.find((h) => h.id === selectedHunterId) : null;
    const trackedDog = selectedDogId
      ? dogs.find((d) => d.id === selectedDogId && d.isActive)
      : dogs.find((d) => d.isActive) || dogs[0];

    const target = trackedHunter
      ? { lat: trackedHunter.lat, lng: trackedHunter.lng, name: trackedHunter.name }
      : trackedDog
      ? { lat: trackedDog.lat, lng: trackedDog.lng, name: trackedDog.name }
      : userLocation
      ? { lat: userLocation.lat, lng: userLocation.lng, name: 'Oma sijainti' }
      : null;

    if (!target) return;

    if (isFollowingTarget) {
      // Pause follow mode to allow free panning
      setIsFollowingTarget(false);
    } else {
      // Enable follow mode and focus
      setIsFollowingTarget(true);
      mapRef.current.setView([target.lat, target.lng], 15, { animate: true });
    }
  };

  // Zoom map to fit all active dogs and team members
  const handleFitAll = () => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds([]);

    // Dogs
    dogs.forEach((d) => {
      if (d.isActive) extendBoundsSafely(bounds, d.lat, d.lng);
    });

    // Team
    team.forEach((m) => extendBoundsSafely(bounds, m.lat, m.lng));

    // User location
    if (userLocation) {
      extendBoundsSafely(bounds, userLocation.lat, userLocation.lng);
    }

    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else {
      mapRef.current.setView([63.854, 29.812], 13);
    }
  };

  const mouseEtrs = mouseCoords ? wgs84ToEtrsTm35Fin(mouseCoords.lat, mouseCoords.lng) : null;

  return (
    <div className="relative w-full h-full overflow-hidden select-none touch-none">
      {/* The Leaflet Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0 bg-stone-900 select-none touch-none" />

      {/* Unified Karttavalikko Button & Dropdown Drawer */}
      <div className="absolute top-3 left-3 z-20">
        <button
          id="btn-layer-selector"
          onClick={() => setShowLayerMenu((prev) => !prev)}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl shadow-xl border text-xs font-extrabold transition-all active:scale-95 cursor-pointer ${
            isDarkMode
              ? 'bg-stone-900/95 text-amber-400 border-stone-700 hover:bg-stone-800'
              : 'bg-white/95 text-stone-900 border-stone-300 hover:bg-stone-100'
          }`}
        >
          <Layers className="w-4 h-4 text-amber-500" />
          <span>{language === 'fi' ? 'Karttavalikko' : 'Map Menu'}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${showLayerMenu ? 'rotate-180' : ''}`} />
        </button>

        {showLayerMenu && (
          <div
            className={`absolute top-11 left-0 w-64 rounded-2xl shadow-2xl border p-3 z-30 transition-all ${
              isDarkMode
                ? 'bg-stone-900/98 border-stone-800 text-stone-100'
                : 'bg-white/98 border-stone-200 text-stone-800'
            } backdrop-blur-md animate-fadeIn`}
          >
            {/* Pohjakartat */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider">
                {language === 'fi' ? 'Pohjakartta (MML / Maasto)' : 'Base Map (NLS / Topo)'}
              </div>
              <button
                type="button"
                onClick={() => setShowMmlKeyModal(true)}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition cursor-pointer"
                title={language === 'fi' ? 'Vaihda Kapsin ja oman koodin välillä' : 'Switch between Kapsi and custom key'}
              >
                {mmlSource === 'custom' && mmlApiKey.trim() ? '🔑 Oma avain' : '🟢 Kapsi.fi'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <button
                onClick={() => setMapLayer('mml_maasto')}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition ${
                  mapLayer === 'mml_maasto'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : isDarkMode
                    ? 'bg-stone-800/60 hover:bg-stone-800 text-stone-200'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <span>{language === 'fi' ? '🌲 MML Maasto' : '🌲 NLS Topo'}</span>
                {mapLayer === 'mml_maasto' && <span className="text-stone-950 font-black">✓</span>}
              </button>

              <button
                onClick={() => setMapLayer('mml_tausta')}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition ${
                  mapLayer === 'mml_tausta'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : isDarkMode
                    ? 'bg-stone-800/60 hover:bg-stone-800 text-stone-200'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <span>{language === 'fi' ? '🗺️ MML Tausta' : '🗺️ NLS Background'}</span>
                {mapLayer === 'mml_tausta' && <span className="text-stone-950 font-black">✓</span>}
              </button>

              <button
                onClick={() => setMapLayer('opentopo')}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition ${
                  mapLayer === 'opentopo'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : isDarkMode
                    ? 'bg-stone-800/60 hover:bg-stone-800 text-stone-200'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <span>🏔️ OpenTopo</span>
                {mapLayer === 'opentopo' && <span className="text-stone-950 font-black">✓</span>}
              </button>

              <button
                onClick={() => setMapLayer('topo')}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition ${
                  mapLayer === 'topo'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : isDarkMode
                    ? 'bg-stone-800/60 hover:bg-stone-800 text-stone-200'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <span>{language === 'fi' ? '⛰️ Esri Maasto' : '⛰️ Esri Topo'}</span>
                {mapLayer === 'topo' && <span className="text-stone-950 font-black">✓</span>}
              </button>

              <button
                onClick={() => setMapLayer('satellite')}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition ${
                  mapLayer === 'satellite'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : isDarkMode
                    ? 'bg-stone-800/60 hover:bg-stone-800 text-stone-200'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <span>{language === 'fi' ? '🛰️ Satelliitti' : '🛰️ Satellite'}</span>
                {mapLayer === 'satellite' && <span className="text-stone-950 font-black">✓</span>}
              </button>

              <button
                onClick={() => setMapLayer('osm')}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition ${
                  mapLayer === 'osm'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : isDarkMode
                    ? 'bg-stone-800/60 hover:bg-stone-800 text-stone-200'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <span>{language === 'fi' ? '🗺️ Perus' : '🗺️ Standard'}</span>
                {mapLayer === 'osm' && <span className="text-stone-950 font-black">✓</span>}
              </button>

              <button
                onClick={() => setMapLayer('dark')}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition ${
                  mapLayer === 'dark'
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : isDarkMode
                    ? 'bg-stone-800/60 hover:bg-stone-800 text-stone-200'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                }`}
              >
                <span>{language === 'fi' ? '🌙 Yömaasto' : '🌙 Night Map'}</span>
                {mapLayer === 'dark' && <span className="text-stone-950 font-black">✓</span>}
              </button>
            </div>

            {/* Overlays / Checkboxes */}
            <div className={`border-t pt-2.5 space-y-1 ${isDarkMode ? 'border-stone-800' : 'border-stone-200'}`}>
              <div className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider mb-1.5">
                {language === 'fi' ? 'Näytä kartalla' : 'Show on Map'}
              </div>

              <label className="flex items-center space-x-2.5 cursor-pointer py-1.5 px-2 rounded-lg hover:bg-emerald-500/10 transition text-xs font-bold text-emerald-400">
                <input
                  type="checkbox"
                  checked={showKiinteistorajat}
                  onChange={(e) => setShowKiinteistorajat(e.target.checked)}
                  className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
                />
                <span>{language === 'fi' ? '🏁 Kiinteistörajat (MML)' : '🏁 Property Boundaries (NLS)'}</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer py-1.5 px-2 rounded-lg hover:bg-amber-500/10 transition text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={showAnnotations}
                  onChange={(e) => setShowAnnotations(e.target.checked)}
                  className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                />
                <span>{language === 'fi' ? '🎯 Passit & Merkinnät' : '🎯 Stands & Markers'}</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer py-1.5 px-2 rounded-lg hover:bg-amber-500/10 transition text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={showDogTracks}
                  onChange={(e) => setShowDogTracks(e.target.checked)}
                  className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                />
                <span>{language === 'fi' ? '🐕 Koirien reitit' : '🐕 Dog Tracks'}</span>
              </label>

              {showDogTracks && (
                <div className="pl-6 pb-1 text-[10px] text-stone-400 space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="inline-block w-4 h-0 border-t-2 border-dashed border-amber-400"></span>
                    <span>{language === 'fi' ? 'Katkoviiva: Haku (max 12h)' : 'Dashed: Search trail (max 12h)'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="inline-block w-4 h-1.5 bg-amber-400 rounded-full"></span>
                    <span className="font-semibold text-amber-300">{language === 'fi' ? 'Paksu yhtenäinen: Ajojälki (haukku + liike)' : 'Solid bold: Chase track (bark + run)'}</span>
                  </div>
                </div>
              )}

              <label className="flex items-center space-x-2.5 cursor-pointer py-1.5 px-2 rounded-lg hover:bg-amber-500/10 transition text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={showHunterNames}
                  onChange={(e) => setShowHunterNames(e.target.checked)}
                  className="accent-sky-500 w-4 h-4 rounded cursor-pointer"
                />
                <span>{language === 'fi' ? '🏷️ Passimiesten nimet' : '🏷️ Hunter Names'}</span>
              </label>

              {setShowSafetySectors && (
                <label className="flex items-center space-x-2.5 cursor-pointer py-1.5 px-2 rounded-lg hover:bg-amber-500/10 transition text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={showSafetySectors}
                    onChange={(e) => setShowSafetySectors(e.target.checked)}
                    className="accent-red-500 w-4 h-4 rounded cursor-pointer"
                  />
                  <span>{language === 'fi' ? '⚠️ Turvasektorit' : '⚠️ Safety Sectors'}</span>
                </label>
              )}

              <div className="pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowMmlKeyModal(true)}
                  className="w-full py-1.5 px-2 text-[11px] rounded-lg hover:bg-stone-800/70 text-stone-300 hover:text-amber-300 text-left transition flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>🌲</span>
                    <span className="font-semibold">{language === 'fi' ? 'MML Lähde & API-avain' : 'NLS Source & API Key'}</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {mmlSource === 'custom' && mmlApiKey.trim() ? 'Oma koodi' : 'Kapsi.fi'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Unified Bottom Coordinate & Dog Info Bar */}
      {(() => {
        const trackedHunter = selectedHunterId ? team.find((h) => h.id === selectedHunterId) : null;
        const trackedDog = selectedDogId
          ? dogs.find((d) => d.id === selectedDogId && d.isActive)
          : dogs.find((d) => d.isActive) || dogs[0];

        // Calculate telemetry for bottom bar
        let dist: number | null = null;
        let bearing: number | null = null;
        let compass = '';

        if (userLocation) {
          if (trackedHunter) {
            dist = calculateDistance(userLocation.lat, userLocation.lng, trackedHunter.lat, trackedHunter.lng);
            bearing = calculateBearing(userLocation.lat, userLocation.lng, trackedHunter.lat, trackedHunter.lng);
            compass = getCompassDirection(bearing);
          } else if (trackedDog) {
            dist = calculateDistance(userLocation.lat, userLocation.lng, trackedDog.lat, trackedDog.lng);
            bearing = calculateBearing(userLocation.lat, userLocation.lng, trackedDog.lat, trackedDog.lng);
            compass = getCompassDirection(bearing);
          }
        }

        return (
          <>
            {/* Floating Action Buttons (Right-aligned vertical stack, aligned with Leaflet zoom controls) */}
            <div className="absolute bottom-[124px] right-[10px] z-[1000] flex flex-col items-center space-y-2">
              <button
                id="btn-fit-all"
                onClick={handleFitAll}
                title={language === 'fi' ? 'Näytä kaikki koirat, passi & oma sijainti' : 'Show all dogs, stands & my location'}
                className="w-10 h-10 rounded-xl bg-stone-900/90 hover:bg-stone-800 text-amber-400 font-bold shadow-xl border border-stone-700 transition-all transform active:scale-95 flex items-center justify-center backdrop-blur-md cursor-pointer"
              >
                <Compass className="w-4 h-4" />
              </button>

              <button
                id="btn-toggle-follow-target"
                onClick={handleToggleTargetFollow}
                title={
                  isFollowingTarget
                    ? (language === 'fi' ? 'Seuranta päällä: klikkaa keskeyttääksesi seurannan' : 'Auto-follow active: click to pause')
                    : (language === 'fi' ? 'Keskitä ja lukitse seuranta kohteeseen' : 'Focus and lock follow onto target')
                }
                className={`w-10 h-10 rounded-xl font-black shadow-xl border transition-all transform active:scale-95 flex items-center justify-center backdrop-blur-md cursor-pointer ${
                  isFollowingTarget
                    ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 border-amber-600 ring-2 ring-amber-400/50'
                    : isDarkMode
                    ? 'bg-stone-900/90 hover:bg-stone-800 text-amber-400 border-stone-700'
                    : 'bg-white/95 hover:bg-stone-100 text-amber-600 border-stone-300'
                }`}
              >
                <Crosshair className={`w-4 h-4 ${isFollowingTarget ? 'animate-pulse text-stone-950' : 'text-amber-500'}`} />
              </button>

              <button
                id="btn-center-user"
                onClick={handleCenterUser}
                title={language === 'fi' ? 'Keskitä omaan GPS-sijaintiin' : 'Center on my GPS location'}
                className={`w-10 h-10 rounded-xl font-black shadow-xl border transition-all transform active:scale-95 flex items-center justify-center cursor-pointer ${
                  userLocation
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 ring-2 ring-emerald-500/20'
                    : 'bg-stone-900/90 hover:bg-stone-800 text-stone-400 border-stone-700'
                }`}
              >
                <Crosshair className={`w-4 h-4 ${userLocation ? 'animate-pulse text-white' : 'text-stone-400'}`} />
              </button>
            </div>

            {/* Bottom Bar: Coordinates on the left, Active Dog/Target Telemetry on the right */}
            <div className="absolute bottom-2 left-2 right-2 z-20 flex items-center justify-between gap-1.5 pointer-events-none">
              {/* Coordinates */}
              <div
                className={`pointer-events-auto px-2 py-0.5 rounded-lg border shadow-lg text-[10px] sm:text-[11px] font-mono flex items-center space-x-1.5 backdrop-blur-md shrink-0 ${
                  isDarkMode
                    ? 'bg-stone-900/90 border-stone-800/80 text-stone-300'
                    : 'bg-stone-100/90 border-stone-300/80 text-stone-700'
                }`}
              >
                <div>
                  <span className="text-amber-500 font-bold">WGS84: </span>
                  {mouseCoords
                    ? `${mouseCoords.lat.toFixed(5)}°, ${mouseCoords.lng.toFixed(5)}°`
                    : (language === 'fi' ? 'Kartta aktiivinen' : 'Map active')}
                </div>
                {mouseEtrs && (
                  <div className="hidden md:block text-stone-400 border-l border-stone-700 pl-1.5">
                    <span>{mouseEtrs.text}</span>
                  </div>
                )}
              </div>

              {/* Active Dog / Hunter Telemetry attached directly to the bottom right */}
              {(trackedDog || trackedHunter) && (
                <div
                  onClick={() => {
                    if (mapRef.current) {
                      if (trackedHunter) {
                        mapRef.current.panTo([trackedHunter.lat, trackedHunter.lng], { animate: true });
                      } else if (trackedDog) {
                        mapRef.current.panTo([trackedDog.lat, trackedDog.lng], { animate: true });
                      }
                      setIsFollowingTarget(true);
                    }
                  }}
                  title={language === 'fi' ? 'Klikkaa kohdistaaksesi kartta' : 'Click to center map'}
                  className={`pointer-events-auto cursor-pointer px-2.5 py-0.5 rounded-lg border shadow-lg text-[10px] sm:text-[11px] font-mono flex items-center space-x-1.5 sm:space-x-2 backdrop-blur-md transition hover:scale-[1.01] whitespace-nowrap overflow-hidden ${
                    isDarkMode
                      ? 'bg-stone-900/90 border-amber-500/50 text-stone-200'
                      : 'bg-white/95 border-amber-500/60 text-stone-900'
                  }`}
                >
                  {trackedHunter ? (
                    <>
                      <span className="font-bold text-sky-400 flex items-center space-x-1">
                        <span>🎯</span>
                        <span className="font-black">{trackedHunter.name}</span>
                      </span>
                      <span className="text-stone-400">•</span>
                      <span className="text-amber-400 font-black">
                        📍 {dist !== null ? formatDistance(dist) : '---'}
                      </span>
                      <span className="text-stone-400 hidden sm:inline">•</span>
                      <span className="text-emerald-400 hidden sm:inline">🔋 {trackedHunter.battery || 100}%</span>
                    </>
                  ) : trackedDog ? (
                    <>
                      {/* Dog Color Indicator */}
                      <div className="flex items-center space-x-1" title={trackedDog.name}>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/50 shadow-sm inline-block"
                          style={{ backgroundColor: trackedDog.color }}
                        />
                      </div>

                      <span className="text-stone-400">•</span>

                      {/* Speed / Barking / Standing Status */}
                      {trackedDog.status === 'haukkuu' ? (
                        <span className="text-red-400 font-black animate-pulse">
                          🔊 {trackedDog.barkRate || 0} /min
                        </span>
                      ) : trackedDog.status === 'seisoo' ? (
                        <span className="text-amber-400 font-black">🛑 Seisoo</span>
                      ) : (
                        <span className="text-sky-300 font-bold">🏃 {trackedDog.speed} km/h</span>
                      )}

                      <span className="text-stone-400">•</span>

                      {/* Distance */}
                      <span className="text-amber-400 font-black">
                        📏 {dist !== null ? formatDistance(dist) : '---'}
                      </span>

                      <span className="text-stone-400">•</span>

                      {/* Battery (Always visible on mobile) */}
                      <span className="text-emerald-400 font-bold">🔋 {trackedDog.battery}%</span>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* MML API Key Error / Fallback Banner (Only if user has selected custom key and it fails) */}
      {mmlTileError && mmlSource === 'custom' && (mapLayer === 'mml_maasto' || mapLayer === 'mml_tausta' || showKiinteistorajat) && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] max-w-lg w-[92%] bg-stone-900/95 border border-amber-500/60 text-amber-200 px-3.5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between text-xs space-x-2 animate-fadeIn">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <span className="text-lg shrink-0">⚠️</span>
            <div className="leading-tight">
              <div className="font-extrabold text-amber-300">
                {language === 'fi' ? 'Oma MML API-avain ei vastaa tai puuttuu' : 'Custom NLS API Key Not Responding or Missing'}
              </div>
              <div className="text-[11px] text-stone-300 truncate">
                {language === 'fi'
                  ? 'Voit siirtyä käyttämään maksutonta Kapsin MML-palvelinta yhdellä klikkauksella.'
                  : 'You can switch to the free Kapsi NLS server with one click.'}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={() => {
                setMmlSource('kapsi');
                setMmlTileError(false);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-[11px] transition shadow flex items-center space-x-1 cursor-pointer"
            >
              <span>{language === 'fi' ? 'Käytä Kapsia 🌲' : 'Use Kapsi 🌲'}</span>
            </button>
            <button
              onClick={() => setShowMmlKeyModal(true)}
              className="px-2 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-[11px] transition cursor-pointer"
            >
              <span>{language === 'fi' ? 'Asetukset ⚙️' : 'Settings ⚙️'}</span>
            </button>
            <button
              onClick={() => setMmlTileError(false)}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-200 text-xs cursor-pointer"
              title={language === 'fi' ? 'Sulje ilmoitus' : 'Dismiss notice'}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* MML Karttalähde & API-avain modal */}
      {showMmlKeyModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-stone-950/85 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 md:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-base font-extrabold text-amber-400 flex items-center space-x-2">
                <span>🌲 {language === 'fi' ? 'Maanmittauslaitos (MML) Karttalähde' : 'National Land Survey (NLS) Map Source'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowMmlKeyModal(false)}
                className="text-stone-400 hover:text-stone-100 font-bold text-lg px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              {language === 'fi'
                ? 'Erätutka tukee Maanmittauslaitoksen (MML) maastokarttoja, peruskarttoja ja kiinteistörajoja. Valitse haluamasi lähde:'
                : 'Erätutka supports Finnish Land Survey topographic maps, base maps, and property boundaries. Select your preferred source:'}
            </p>

            {/* Option 1: Kapsi.fi (Default) */}
            <div
              onClick={() => {
                setMmlSource('kapsi');
                setMmlTileError(false);
              }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                mmlSource === 'kapsi'
                  ? 'bg-emerald-950/30 border-emerald-500/80 ring-1 ring-emerald-500/50'
                  : 'bg-stone-950/40 border-stone-800 hover:border-stone-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    mmlSource === 'kapsi' ? 'border-emerald-400 bg-emerald-500' : 'border-stone-600'
                  }`}>
                    {mmlSource === 'kapsi' && <div className="w-1.5 h-1.5 rounded-full bg-stone-950" />}
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-stone-100 flex items-center space-x-2">
                      <span>🟢 {language === 'fi' ? 'Kapsi.fi Palvelin' : 'Kapsi.fi Server'}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {language === 'fi' ? 'Oletus / Suositeltu' : 'Default / Recommended'}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      {language === 'fi' ? 'Toimii heti ilman tunnuksia tai koodia' : 'Works instantly with no account or key'}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-stone-300 mt-2.5 leading-relaxed">
                {language === 'fi'
                  ? 'Käyttää Kapsi Internet-käyttäjät ry:n suomalaista karttapalvelinta (kartat.kapsi.fi). MML peruskartat, maastokartat ja kiinteistörajat ovat heti käytettävissä täydellä laadulla.'
                  : 'Uses Kapsi association map server (kartat.kapsi.fi). Topographic maps, basic maps, and property boundaries load immediately in full quality.'}
              </p>
            </div>

            {/* Option 2: Custom MML API Key */}
            <div
              onClick={() => setMmlSource('custom')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                mmlSource === 'custom'
                  ? 'bg-amber-950/30 border-amber-500/80 ring-1 ring-amber-500/50'
                  : 'bg-stone-950/40 border-stone-800 hover:border-stone-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    mmlSource === 'custom' ? 'border-amber-400 bg-amber-500' : 'border-stone-600'
                  }`}>
                    {mmlSource === 'custom' && <div className="w-1.5 h-1.5 rounded-full bg-stone-950" />}
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-stone-100 flex items-center space-x-2">
                      <span>🔑 {language === 'fi' ? 'Oma MML API-koodi / avain' : 'Custom NLS API Key'}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {language === 'fi' ? 'Valinnainen' : 'Optional'}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      {language === 'fi' ? 'MML:n virallinen WMTS-karttakuvapalvelu' : 'Official NLS WMTS service'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={mmlApiKey}
                  onChange={(e) => {
                    setMmlApiKey(e.target.value);
                    localStorage.setItem('eratutka_mml_key', e.target.value);
                    if (e.target.value.trim()) {
                      setMmlSource('custom');
                      setMmlTileError(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={language === 'fi' ? 'Liitä tähän oma MML API-avain (esim. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)' : 'Paste your NLS API Key here'}
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-amber-300 font-mono text-xs outline-none"
                />

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <a
                    href="https://asiointi.maanmittauslaitos.fi/karttakuva-api/"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-amber-400 hover:text-amber-300 underline font-semibold flex items-center space-x-1"
                  >
                    <span>{language === 'fi' ? 'Hanki ilmainen MML API-avain ↗' : 'Get free NLS API Key ↗'}</span>
                  </a>

                  {mmlApiKey.trim() && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMmlApiKey('');
                        localStorage.removeItem('eratutka_mml_key');
                        setMmlSource('kapsi');
                        setMmlTileError(false);
                      }}
                      className="text-stone-400 hover:text-red-400 text-[10px] underline cursor-pointer"
                    >
                      {language === 'fi' ? 'Tyhjennä ja palaa Kapsiin' : 'Clear and return to Kapsi'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Map Switch & Close */}
            <div className="pt-3 border-t border-stone-800 flex flex-col space-y-2">
              {mapLayer !== 'mml_maasto' && (
                <button
                  type="button"
                  onClick={() => {
                    setMapLayer('mml_maasto');
                    setShowMmlKeyModal(false);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs transition text-center cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <span>🌲</span>
                  <span>{language === 'fi' ? 'Kytke MML Maastokartta heti päälle' : 'Switch to NLS Topo Map now'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowMmlKeyModal(false)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition text-center shadow cursor-pointer"
              >
                {language === 'fi' ? 'Valmis & Sulje' : 'Done & Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
