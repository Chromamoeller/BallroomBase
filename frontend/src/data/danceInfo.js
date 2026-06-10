// Statische Hintergrund-Infos pro Tanz. Werte sind übliche Richtwerte
// (Turnier-/Schulrichtwerte). Songs sind beispielhafte, gängige Klassiker.

export const DANCE_INFO = {
  "Langsamer Walzer": {
    category: "Standard",
    bpm: "84–90 BPM (28–30 Takte/min)",
    timeSignature: "3/4",
    basicRhythm: "1 – 2 – 3 (lang – kurz – kurz, mit Heben & Senken)",
    origin: "England, frühes 20. Jahrhundert",
    character:
      "Weich, getragen, mit ausgeprägtem Schwung und Rise & Fall.",
    songs: [
      { title: "Moon River", artist: "Andy Williams" },
      { title: "Fly Me to the Moon", artist: "Frank Sinatra" },
      { title: "Open Arms", artist: "Journey" },
      { title: "Kiss from a Rose", artist: "Seal" },
      { title: "Perfect", artist: "Ed Sheeran" },
    ],
  },
  Tango: {
    category: "Standard",
    bpm: "128–132 BPM (32–33 Takte/min)",
    timeSignature: "2/4",
    basicRhythm: "Slow – Slow – Quick – Quick – Slow",
    origin: "Argentinien, später europäisch adaptiert",
    character:
      "Stakkato, energisch, ohne Heben & Senken – scharfe Kopf- und Fußaktionen.",
    songs: [
      { title: "La Cumparsita", artist: "Gerardo Matos Rodríguez" },
      { title: "Por una Cabeza", artist: "Carlos Gardel" },
      { title: "Tango to Evora", artist: "Loreena McKennitt" },
      { title: "Assassin’s Tango", artist: "John Powell" },
      { title: "Roxanne (Tango)", artist: "Moulin Rouge OST" },
    ],
  },
  "Wiener Walzer": {
    category: "Standard",
    bpm: "174–180 BPM (58–60 Takte/min)",
    timeSignature: "3/4",
    basicRhythm: "1 – 2 – 3, schneller Rechts- bzw. Linksdreher",
    origin: "Österreich, 18./19. Jahrhundert",
    character:
      "Schnell, drehfreudig, fließend – getragen vom typischen Wiener Schwung.",
    songs: [
      { title: "An der schönen blauen Donau", artist: "Johann Strauss II" },
      { title: "Kaiserwalzer", artist: "Johann Strauss II" },
      { title: "Wiener Blut", artist: "Johann Strauss II" },
      { title: "Que Sera, Sera", artist: "Doris Day" },
      { title: "Could I Have This Dance", artist: "Anne Murray" },
    ],
  },
  "Cha Cha Cha": {
    category: "Latein",
    bpm: "120–128 BPM (30–32 Takte/min)",
    timeSignature: "4/4",
    basicRhythm: "2 – 3 – 4 – & – 1  (cha-cha-cha auf 4-&-1)",
    origin: "Kuba, 1950er Jahre",
    character:
      "Frech, lebhaft, mit kleinen scharfen Schritten und deutlicher Hüftaktion.",
    songs: [
      { title: "Sway", artist: "Michael Bublé" },
      { title: "Smooth", artist: "Santana feat. Rob Thomas" },
      { title: "Oye Como Va", artist: "Santana" },
      { title: "Cuban Pete", artist: "Jim Carrey / Tito Puente" },
      { title: "Magalenha", artist: "Sergio Mendes" },
    ],
  },
  Rumba: {
    category: "Latein",
    bpm: "100–108 BPM (25–27 Takte/min)",
    timeSignature: "4/4",
    basicRhythm: "2 – 3 – 4 – 1 (langsamer „Slow“ auf 1)",
    origin: "Kuba",
    character:
      "Langsam, gefühlvoll, sehr ausdrucksstark – „Tanz der Liebe“.",
    songs: [
      { title: "Hero", artist: "Enrique Iglesias" },
      { title: "Bailamos", artist: "Enrique Iglesias" },
      { title: "Quando, Quando, Quando", artist: "Engelbert Humperdinck" },
      { title: "Besame Mucho", artist: "Diana Krall" },
      { title: "Careless Whisper", artist: "George Michael" },
    ],
  },
  Samba: {
    category: "Latein",
    bpm: "100–104 BPM (50–52 Takte/min)",
    timeSignature: "2/4",
    basicRhythm: "1 – a – 2 (Bounce / Federn aus den Knien)",
    origin: "Brasilien",
    character:
      "Mitreißend, federnd, mit charakteristischem „Samba-Bounce“.",
    songs: [
      { title: "Mas Que Nada", artist: "Sergio Mendes" },
      { title: "Aquarela do Brasil", artist: "Ary Barroso" },
      { title: "Magalenha", artist: "Sergio Mendes" },
      { title: "Whenever, Wherever", artist: "Shakira" },
      { title: "Bamboleo", artist: "Gipsy Kings" },
    ],
  },
  Jive: {
    category: "Latein",
    bpm: "168–176 BPM (42–44 Takte/min)",
    timeSignature: "4/4",
    basicRhythm: "1 – 2 – 3 – a – 4 – 3 – a – 4 (Chassé rechts/links)",
    origin: "USA, Swing-Ära der 1940er",
    character:
      "Sehr schnell, sprunghaft, mit hohem Energielevel – wird oft als Finaltanz getanzt.",
    songs: [
      { title: "Jailhouse Rock", artist: "Elvis Presley" },
      { title: "Rock Around the Clock", artist: "Bill Haley" },
      { title: "Great Balls of Fire", artist: "Jerry Lee Lewis" },
      { title: "Footloose", artist: "Kenny Loggins" },
      { title: "Proud Mary", artist: "Tina Turner" },
    ],
  },
  "Paso Doble": {
    category: "Latein",
    bpm: "120–124 BPM (60–62 Takte/min)",
    timeSignature: "2/4",
    basicRhythm: "Marschartig 1 – 2, mit dramatischen Akzenten",
    origin: "Spanien / Frankreich",
    character:
      "Stolz, kraftvoll, dramatisch – der Herr stellt den Stierkämpfer dar, die Dame das Cape.",
    songs: [
      { title: "España Cañí", artist: "Pascual Marquina Narro" },
      { title: "Paso Doble (Espana Cani)", artist: "Ross Mitchell" },
      { title: "Y Viva España", artist: "Sylvia Vrethammar" },
    ],
  },
  Discofox: {
    category: "Gesellschaftstanz / Modetanz",
    bpm: "ca. 100–140 BPM",
    timeSignature: "4/4",
    basicRhythm: "Langsam – langsam – schnell – schnell (1, 2, 3-&-4)",
    origin: "Aus dem Disco-Sound der späten 1970er entstanden",
    character:
      "Unkomplizierter Paartanz für nahezu jeden 4/4-Pop-Song.",
    songs: [
      { title: "Atemlos durch die Nacht", artist: "Helene Fischer" },
      { title: "Marmor, Stein und Eisen bricht", artist: "Drafi Deutscher" },
      { title: "Verdammt, ich lieb' dich", artist: "Matthias Reim" },
      { title: "Ein Stern (der deinen Namen trägt)", artist: "DJ Ötzi & Nik P." },
      { title: "Final Countdown", artist: "Europe" },
    ],
  },
};

export function getDanceInfo(name) {
  return DANCE_INFO[name] ?? null;
}
