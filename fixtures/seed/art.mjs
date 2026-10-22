// Illustrations for the development seed command only.
const ART = {
  crew:(a,b)=>`<path d="M58 76C58 68 74 62 100 62s42 6 42 14l30 14-14 34-16-7v78H58v-78l-16 7-14-34z" fill="${a}"/>
    <path d="M76 65c5 12 12 18 24 18s19-6 24-18" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/>
    <rect x="58" y="185" width="84" height="12" rx="3" fill="${b}"/>`,
  tee:(a,b)=>`<path d="M62 78C62 70 78 64 100 64s38 6 38 14l30 14-12 26-18-7v75H62v-75l-18 7-12-26z" fill="${a}"/>
    <path d="M80 66c4 10 11 15 20 15s16-5 20-15" fill="none" stroke="${b}" stroke-width="4.5" stroke-linecap="round"/>
    <ellipse cx="100" cy="128" rx="26" ry="20" fill="${b}" opacity=".85"/>`,
  cardigan:(a,b)=>`<path d="M58 76C58 68 74 62 100 62s42 6 42 14l30 14-14 34-16-7v78H58v-78l-16 7-14-34z" fill="${a}"/>
    <path d="M100 64v132" stroke="${b}" stroke-width="4"/>
    <circle cx="92" cy="104" r="4" fill="${b}"/><circle cx="92" cy="130" r="4" fill="${b}"/><circle cx="92" cy="156" r="4" fill="${b}"/>`,
  blazer:(a,b)=>`<path d="M58 78C58 70 74 64 100 64s42 6 42 14l30 14-14 36-16-8v76H58v-76l-16 8-14-36z" fill="${a}"/>
    <path d="M100 66 78 196M100 66l22 130" stroke="${b}" stroke-width="3.5" opacity=".9"/>
    <path d="M100 66 84 116l16 22 16-22z" fill="${b}"/>`,
  puffer:(a,b)=>`<path d="M58 76C58 68 74 62 100 62s42 6 42 14l30 14-14 34-16-7v78H58v-78l-16 7-14-34z" fill="${a}"/>
    <path d="M58 100h84M58 124h84M58 148h84M58 172h84" stroke="${b}" stroke-width="3" opacity=".7"/>
    <path d="M100 64v132" stroke="${b}" stroke-width="3" opacity=".7"/>`,
  dress:(a,b)=>`<path d="M72 70c0-6 12-10 28-10s28 4 28 10l14 14-8 14-12-8 28 110H50l28-110-12 8-8-14z" fill="${a}"/>
    <path d="M82 66c4 11 10 16 18 16s14-5 18-16" fill="none" stroke="${b}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M74 124h52" stroke="${b}" stroke-width="6"/>`,
  skirt:(a,b)=>`<rect x="66" y="80" width="68" height="14" rx="4" fill="${b}"/>
    <path d="M68 94h64l22 106H46z" fill="${a}"/>
    <path d="M90 94l-8 106M110 94l8 106" stroke="${b}" stroke-width="2.5" opacity=".5"/>`,
  sneaker:(a,b)=>`<path d="M40 168c0-22 16-40 40-46l24-20c7-6 16-3 18 6l6 26 32 14c12 5 18 12 18 20v6H40z" fill="${a}"/>
    <rect x="36" y="168" width="128" height="16" rx="8" fill="${b}"/>
    <path d="M92 112l20 18M84 126l22 16" stroke="${b}" stroke-width="4" stroke-linecap="round"/>`,
  heel:(a,b)=>`<path d="M62 172c0-30 12-56 36-70l22-14 10 16-16 24c-8 14-10 28-10 44z" fill="${a}"/>
    <path d="M130 104l14 68h-14l-14-46z" fill="${a}"/>
    <rect x="56" y="172" width="92" height="10" rx="5" fill="${b}"/>`,
  bag:(a,b)=>`<rect x="56" y="98" width="88" height="94" rx="6" fill="${a}"/>
    <path d="M76 98V82a24 24 0 0 1 48 0v16" fill="none" stroke="${b}" stroke-width="7" stroke-linecap="round"/>
    <rect x="56" y="126" width="88" height="14" fill="${b}" opacity=".8"/>`,
  hoops:(a,b)=>`<circle cx="74" cy="132" r="30" fill="none" stroke="${a}" stroke-width="10"/>
    <circle cx="132" cy="132" r="30" fill="none" stroke="${a}" stroke-width="10"/>
    <circle cx="74" cy="98" r="5" fill="${b}"/><circle cx="132" cy="98" r="5" fill="${b}"/>`,
  stole:(a,b)=>`<path d="M78 62 60 200h26l14-108z" fill="${a}"/>
    <path d="M122 62l18 138h-26l-14-108z" fill="${a}"/>
    <path d="M60 176h26M114 176h26" stroke="${b}" stroke-width="8"/>`,
  lamp:(a,b)=>`<path d="M68 106l14-40h36l14 40z" fill="${a}"/>
    <rect x="96" y="106" width="8" height="74" fill="${b}"/>
    <ellipse cx="100" cy="186" rx="40" ry="10" fill="${b}"/>`,
  fridge:(a,b)=>`<rect x="62" y="52" width="76" height="146" rx="8" fill="${a}"/>
    <path d="M62 104h76" stroke="${b}" stroke-width="4"/>
    <rect x="122" y="70" width="6" height="24" rx="3" fill="${b}"/>
    <rect x="122" y="116" width="6" height="30" rx="3" fill="${b}"/>`,
  mirror:(a,b)=>`<rect x="62" y="44" width="76" height="162" rx="38" fill="${a}"/>
    <rect x="72" y="54" width="56" height="142" rx="28" fill="${b}"/>
    <path d="M84 84l32 56" stroke="${a}" stroke-width="5" opacity=".35"/>`,
  chair:(a,b)=>`<rect x="70" y="58" width="60" height="56" rx="10" fill="${a}"/>
    <rect x="58" y="122" width="84" height="18" rx="8" fill="${a}"/>
    <path d="M100 140v34M74 196l26-22 26 22" stroke="${b}" stroke-width="7" stroke-linecap="round"/>`,
  bin:(a,b)=>`<path d="M64 92h72l-10 100H74z" fill="${a}"/>
    <rect x="58" y="76" width="84" height="18" rx="5" fill="${b}"/>
    <path d="M86 112l-4 68M114 112l4 68" stroke="${b}" stroke-width="3" opacity=".5"/>`,
  bedding:(a,b)=>`<rect x="48" y="118" width="104" height="34" rx="7" fill="${a}"/>
    <rect x="56" y="86" width="88" height="32" rx="7" fill="${b}"/>
    <rect x="44" y="152" width="112" height="34" rx="7" fill="${a}" opacity=".8"/>`,
  board:(a,b)=>`<rect x="48" y="66" width="104" height="118" rx="6" fill="${a}"/>
    <rect x="58" y="76" width="84" height="98" rx="3" fill="${b}" opacity=".5"/>
    <circle cx="80" cy="102" r="6" fill="${b}"/><circle cx="124" cy="140" r="6" fill="${b}"/>`,
  lights:(a,b)=>`<path d="M34 86c22 34 44 34 66 0s44-34 66 0" fill="none" stroke="${b}" stroke-width="4"/>
    <circle cx="56" cy="110" r="9" fill="${a}"/><circle cx="100" cy="116" r="9" fill="${a}"/>
    <circle cx="144" cy="110" r="9" fill="${a}"/><circle cx="78" cy="96" r="9" fill="${a}"/><circle cx="122" cy="96" r="9" fill="${a}"/>`,
  camera:(a,b)=>`<rect x="44" y="92" width="112" height="76" rx="10" fill="${a}"/>
    <rect x="76" y="76" width="34" height="18" rx="5" fill="${a}"/>
    <circle cx="100" cy="130" r="26" fill="${b}"/><circle cx="100" cy="130" r="13" fill="${a}"/>
    <circle cx="134" cy="106" r="5" fill="${b}"/>`,
  stand:(a,b)=>`<path d="M52 176 96 72l16 6-40 102z" fill="${a}"/>
    <path d="M148 176 104 72l-16 6 40 102z" fill="${b}"/>
    <rect x="46" y="176" width="108" height="10" rx="5" fill="${b}"/>`,
  book:(a,b)=>`<rect x="48" y="62" width="104" height="128" rx="6" fill="${a}"/>
    <rect x="48" y="62" width="20" height="128" fill="${b}"/>
    <rect x="80" y="94" width="56" height="7" rx="3" fill="${b}"/>
    <rect x="80" y="112" width="42" height="7" rx="3" fill="${b}" opacity=".7"/>`,
  calc:(a,b)=>`<rect x="62" y="48" width="76" height="154" rx="10" fill="${a}"/>
    <rect x="74" y="60" width="52" height="30" rx="4" fill="${b}"/>
    ${[0,1,2,3].map(r=>[0,1,2].map(c=>`<rect x="${76+c*20}" y="${102+r*24}" width="14" height="14" rx="3" fill="${b}" opacity=".8"/>`).join("")).join("")}`,
  coat:(a,b)=>`<path d="M62 78C62 70 78 64 100 64s38 6 38 14l28 14-12 30-16-7v81H62v-81l-16 7-12-30z" fill="${a}"/>
    <path d="M100 66v130" stroke="${b}" stroke-width="3"/>
    <circle cx="112" cy="104" r="4" fill="${b}"/><circle cx="112" cy="132" r="4" fill="${b}"/>
    <ellipse cx="100" cy="72" rx="26" ry="9" fill="${b}" opacity=".5"/>`,
  chain:(a,b)=>`<path d="M52 82c0 52 22 84 48 84s48-32 48-84" fill="none" stroke="${a}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="100" cy="172" r="13" fill="${a}"/><circle cx="100" cy="172" r="5" fill="${b}"/>`,
  ring:(a,b)=>`<circle cx="76" cy="130" r="30" fill="none" stroke="${a}" stroke-width="11"/>
    <circle cx="124" cy="112" r="26" fill="none" stroke="${a}" stroke-width="11"/>
    <circle cx="110" cy="158" r="22" fill="none" stroke="${b}" stroke-width="10"/>`,
  cart:(a,b)=>`<rect x="52" y="74" width="96" height="14" rx="5" fill="${a}"/>
    <rect x="52" y="118" width="96" height="14" rx="5" fill="${a}"/>
    <rect x="52" y="162" width="96" height="14" rx="5" fill="${a}"/>
    <path d="M62 74v102M138 74v102" stroke="${b}" stroke-width="6"/>
    <circle cx="66" cy="190" r="9" fill="${b}"/><circle cx="134" cy="190" r="9" fill="${b}"/>`
};
const PALETTES = {
  black:["#26241F","#5E5A50","#EFEAE0"], cream:["#EDE6D6","#C9BFA8","#F7F3EA"],
  orange:["#DF5A1E","#9E3E12","#FBEDE2"], navy:["#2C3D5C","#6B7D9E","#E9EDF4"],
  sage:["#7E8F72","#4F5C47","#EEF1EA"], denim:["#4A6C96","#2F4767","#E8EEF5"],
  white:["#F6F4EF","#CFC8B8","#EFECE4"], tan:["#B98A5E","#7D5A38","#F4EBE0"],
  red:["#A8392F","#6E231C","#F6E7E3"], plum:["#6B4463","#402739","#F0E8EE"],
  steel:["#8D9296","#5C6367","#EDEFF0"], gold:["#C79A3E","#8A6720","#F6EFDD"]
};
export function artSvg(art,pal){
  const p=PALETTES[pal]||PALETTES.cream;
  const draw=ART[art]||ART.crew;
  return `<svg class="art" viewBox="0 0 200 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="200" height="250" fill="${p[2]}"/>
    <ellipse cx="100" cy="206" rx="62" ry="10" fill="${p[1]}" opacity=".18"/>
    ${draw(p[0],p[1])}
  </svg>`;
}

