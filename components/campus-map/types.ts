/* Public data contract of the campus map. The main TigerRetail app passes
   these in as props; nothing in this folder fetches listings itself. */

export type Section =
  | "clothing"
  | "accessories"
  | "special occasions"
  | "dorm"
  | "school supplies"
  | "everything else";

/* Apparel listings carry a department. Everything else is "misc", which is
   also the fourth colour on the map. */
export type Dept = "women's" | "men's" | "unisex" | "misc";

export interface Listing {
  id: string;
  sellerId: string;
  title: string;
  price: number;
  section: Section;
  sub: string;
  dept: Dept;
  imageUrl: string;
  postedAt: string; // ISO 8601
}

export interface Seller {
  id: string; // netid
  name: string;
  /* Must match a NAME in Princeton's Buildings layer, e.g. "1976 Hall".
     The pin is placed on that building. */
  building: string;
  /* "2nd floor, two lefts". Only shown once the viewer's offer is accepted. */
  roomDirections: string;
}

/* A residential building from Princeton's Buildings layer. */
export interface Building {
  name: string;
  college: string;
  lon: number;
  lat: number;
}

export type Recency = "any" | "1d" | "7d" | "14d" | "30d";

export interface Filters {
  sections: Section[];
  subs: string[];
  depts: Dept[];
  colleges: string[];
  buildings: string[];
  recency: Recency;
}

/* One dot on the map: a seller, with the listings that survive the filters. */
export interface SellerPin {
  seller: Seller;
  building: Building;
  lon: number;
  lat: number;
  listings: Listing[];
  dept: Dept; // dominant department among `listings`
}

export type ViewMode = "heat" | "dots" | "photos";
