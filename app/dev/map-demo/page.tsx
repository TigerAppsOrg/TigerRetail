import { notFound } from "next/navigation";
import MapDemo from "./MapDemo";

/* Patrick's stress-test map with generated sellers. Development only: fixture
   data never ships. The real map is /map. */
export default function MapDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MapDemo />;
}
