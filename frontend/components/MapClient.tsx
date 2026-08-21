"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { Room } from "@/types";

function ViewSync({ rooms, onBounds }: { rooms: Room[]; onBounds?: (b: L.LatLngBounds) => void }) {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 100);
    const handler = () => onBounds?.(map.getBounds());
    map.on("moveend", handler);
    return () => { window.clearTimeout(timer); map.off("moveend", handler); };
  }, [map, onBounds]);
  return null;
}

function markerIcon(room: Room) {
  const saved = room.is_favorite ? "saved" : "";
  return L.divIcon({
    className: "",
    html: `<div class="price-marker ${saved}">${room.price ? (room.price / 1000000).toFixed(1) + "tr" : "Liên hệ"}</div>`,
    iconSize: [70, 28],
    iconAnchor: [35, 14]
  });
}

export default function MapClient({
  rooms, selected, onSelect, onBounds
}: { rooms: Room[]; selected: Room | null; onSelect: (r: Room) => void; onBounds?: (b: L.LatLngBounds) => void }) {
  const valid = useMemo(() => rooms.filter(r => r.lat && r.lon), [rooms]);
  return (
    <MapContainer center={[21.0285, 105.8542]} zoom={12} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ViewSync rooms={valid} onBounds={onBounds} />
      {valid.map(room => (
        <Marker key={room.id} position={[room.lat!, room.lon!]} icon={markerIcon(room)} eventHandlers={{ click: () => onSelect(room) }}>
          <Popup>
            <div className="min-w-[190px]">
              <b>{room.title}</b>
              <div className="mt-1 font-bold text-emerald-600">{(room.price / 1000000).toFixed(1)} triệu/tháng</div>
              <div className="text-xs">{room.area ? `${room.area} m² · ` : ""}{room.district}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
