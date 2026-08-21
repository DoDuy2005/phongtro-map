export type Room = {
  id: string;
  source: string;
  source_id?: string | null;
  title: string;
  description: string;
  price: number;
  area?: number | null;
  region: string;
  district: string;
  ward: string;
  street: string;
  address: string;
  lat?: number | null;
  lon?: number | null;
  images: string[];
  amenities: string[];
  source_url?: string | null;
  phone: string;
  seller_name: string;
  status: string;
  available: boolean;
  landlord_id?: string | null;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
};

export type User = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: "user" | "landlord" | "admin";
  is_active: boolean;
};
