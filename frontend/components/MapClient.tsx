"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { Room } from "@/types";

function ViewSync({ onBounds }: { onBounds?: (b: L.LatLngBounds) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onBounds?.(map.getBounds());
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); };
  }, [map, onBounds]);
  return null;
}

function FitRooms({ rooms }: { rooms: Room[] }) {
  const map = useMap();
  const pointsKey = Array.from(new Set(rooms
    .filter(room => Number.isFinite(room.lat) && Number.isFinite(room.lon))
    .map(room => `${room.lat},${room.lon}`))).sort().join("|");

  useEffect(() => {
    if (!pointsKey) return;
    const points = pointsKey.split("|").map(point => {
      const [lat, lon] = point.split(",").map(Number);
      return [lat, lon] as [number, number];
    });
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 14, animate: false });
  }, [map, pointsKey]);

  return null;
}

const MARKER_WIDTH = 58;
const MARKER_HEIGHT = 24;

type RoomGroup = { key: string; rooms: Room[]; representative: Room };

function markerIcon(room: Room, count: number, isSaved = room.is_favorite) {
  const saved = isSaved ? "saved" : "";
  const priceLabel = room.price > 0 ? `${(room.price / 1_000_000).toFixed(1)}tr` : "Liên hệ";
  const countBadge = count > 1 ? `<span class="price-marker-count">${count}</span>` : "";

  return L.divIcon({
    className: "",
    html: `<span class="price-marker-wrap"><span class="price-marker ${saved}">${priceLabel}</span>${countBadge}</span>`,
    iconSize: [MARKER_WIDTH, MARKER_HEIGHT],
    iconAnchor: [MARKER_WIDTH / 2, MARKER_HEIGHT / 2]
  });
}

function groupRoomsByLocation(rooms: Room[]) {
  const groups = new Map<string, Room[]>();
  for (const room of rooms) {
    const key = `${room.lat!.toFixed(5)},${room.lon!.toFixed(5)}`;
    const group = groups.get(key) || [];
    group.push(room);
    groups.set(key, group);
  }

  return Array.from(groups, ([key, items]): RoomGroup => {
    const ordered = [...items].sort((a, b) => {
      const priceA = a.price > 0 ? a.price : Number.POSITIVE_INFINITY;
      const priceB = b.price > 0 ? b.price : Number.POSITIVE_INFINITY;
      return priceA - priceB || a.id.localeCompare(b.id);
    });
    return { key, rooms: ordered, representative: ordered[0] };
  });
}

function RoomMarkers({ groups, onSelect }: { groups: RoomGroup[]; onSelect: (room: Room) => void }) {
  const map = useMap();

  return <>
    {groups.map(group => {
      const { representative, rooms: groupedRooms } = group;
      const isDuplicate = groupedRooms.length > 1;

      return <Marker
        key={group.key}
        position={[representative.lat!, representative.lon!]}
        icon={markerIcon(representative, groupedRooms.length, groupedRooms.some(room => room.is_favorite))}
        eventHandlers={isDuplicate ? undefined : { click: () => onSelect(representative) }}
      >
        <Popup>
          {isDuplicate ? <div className="min-w-[220px]">
            <p className="mb-2 text-sm font-bold text-slate-900">{groupedRooms.length} phòng cùng vị trí</p>
            <ul className="space-y-1">
              {groupedRooms.map(room => <li key={room.id}>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    map.closePopup();
                    onSelect(room);
                  }}
                  className="w-full rounded-lg px-2 py-2 text-left hover:bg-emerald-50"
                >
                  <span className="block text-sm font-semibold text-slate-800">{room.title}</span>
                  <span className="text-xs font-bold text-emerald-700">{room.price > 0 ? `${(room.price / 1_000_000).toFixed(1)} triệu/tháng` : "Liên hệ giá"}</span>
                </button>
              </li>)}
            </ul>
          </div> : <div className="min-w-[190px]">
            <b>{representative.title}</b>
            <div className="mt-1 font-bold text-emerald-600">{(representative.price / 1_000_000).toFixed(1)} triệu/tháng</div>
            <div className="text-xs">{representative.area ? `${representative.area} m² · ` : ""}{representative.district}</div>
          </div>}
        </Popup>
      </Marker>;
    })}
  </>;
}

export default function MapClient({
  rooms, onSelect, onBounds
}: { rooms: Room[]; onSelect: (r: Room) => void; onBounds?: (b: L.LatLngBounds) => void }) {
  const valid = useMemo(() => rooms.filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon)), [rooms]);
  const groups = useMemo(() => groupRoomsByLocation(valid), [valid]);

  return (
    <MapContainer center={[21.0285, 105.8542]} zoom={12} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ViewSync onBounds={onBounds} />
      <FitRooms rooms={valid} />
      <RoomMarkers groups={groups} onSelect={onSelect} />
    </MapContainer>
  );
}
