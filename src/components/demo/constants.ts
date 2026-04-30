export const SECTORS = [
  "Food & Beverage",
  "Fashion & Apparel",
  "Beauty & Personal Care",
  "Health & Wellness",
  "Technology",
  "Education",
  "Real Estate",
  "Architecture & Interiors",
  "Hospitality",
  "Finance",
  "Retail",
  "Media & Entertainment",
  "Sustainability",
  "Consulting & Professional Services",
  "Automotive",
  "Art & Culture",
  "Sports & Fitness",
  "Nonprofit & Social Impact",
  "Luxury Goods",
  "Other",
] as const;

export const PROJECT_TYPES = [
  { value: "new", title: "New brand", subtitle: "Starting from scratch." },
  {
    value: "redesign",
    title: "Redesign",
    subtitle: "You have a brand and you're refreshing it.",
  },
  {
    value: "extension",
    title: "Brand extension",
    subtitle: "A line or sub-brand within something existing.",
  },
] as const;

export const FEEL_SCALES = [
  { key: "seriousPlayful", left: "Serious", right: "Playful" },
  { key: "warmClinical", left: "Warm", right: "Clinical" },
  { key: "traditionalAvantgarde", left: "Traditional", right: "Avant-garde" },
  { key: "understatedExpressive", left: "Understated", right: "Expressive" },
  { key: "refinedRaw", left: "Refined", right: "Raw" },
] as const;

export const ARCHETYPES = [
  { name: "The Innocent", examples: "Coca-Cola, Dove, Nintendo" },
  { name: "The Explorer", examples: "Patagonia, Jeep, National Geographic" },
  { name: "The Sage", examples: "Google, TED, The Economist" },
  { name: "The Hero", examples: "Nike, FedEx, BMW" },
  { name: "The Outlaw", examples: "Harley-Davidson, Diesel, Virgin" },
  { name: "The Magician", examples: "Apple, Disney, Tesla" },
  { name: "The Everyman", examples: "IKEA, Target, Levi's" },
  { name: "The Lover", examples: "Chanel, Victoria's Secret, Häagen-Dazs" },
  { name: "The Jester", examples: "Old Spice, M&M's, Dollar Shave Club" },
  { name: "The Caregiver", examples: "Johnson & Johnson, TOMS, Volvo" },
  { name: "The Creator", examples: "Adobe, Lego, Moleskine" },
  { name: "The Ruler", examples: "Rolex, Mercedes-Benz, American Express" },
] as const;

export const DRIVERS = [
  "Status & belonging",
  "Convenience & speed",
  "Self-expression",
  "Financial security",
  "Health & longevity",
  "Learning & growth",
  "Sustainability & ethics",
  "Community & connection",
  "Adventure & novelty",
  "Control & autonomy",
  "Aesthetics & beauty",
  "Tradition & legacy",
] as const;

export const TONES = [
  { name: "Formal & reverent", example: "We deeply appreciate the trust you place in us." },
  { name: "Technical & precise", example: "We reduced cycle time by 32% with three specific adjustments." },
  { name: "Warm & close", example: "We know what you're solving. We're on the same side." },
  { name: "Direct, no frills", example: "It's not for everyone. If you've made it this far, it probably is." },
  { name: "Dry humor", example: "We made this without taking ourselves too seriously. Neither should you." },
  {
    name: "Editorial & reflective",
    example:
      "There are decisions you don't notice until they're missing. Those are the ones we take care of.",
  },
  { name: "Aspirational, elevated", example: "For those who know that things done well take time." },
  { name: "Honest & conversational", example: "We won't promise you something we can't deliver. This is what we do." },
  { name: "Provocative, contrarian", example: "While everyone's looking the same direction, we're doing something else." },
  { name: "Minimal & serene", example: "Fewer things. Better made." },
] as const;

export const AESTHETICS = [
  { name: "Swiss Editorial", micro: "Dominant typography, clean grid, plenty of breathing room." },
  { name: "Bauhaus", micro: "Primary shapes, rigorous geometry, functional color." },
  { name: "Japanese Contemporary", micro: "Negative space, subtle type, almost monastic restraint." },
  { name: "Digital Brutalism", micro: "Raw, unpolished. Structure on display." },
  { name: "Mid-Century", micro: "1950s optimism: earthy palettes, humanist sans-serifs." },
  { name: "Art Deco", micro: "Ornamental geometry, symmetry, golds." },
  { name: "Memphis", micro: "Colliding shapes, saturated color, intentional play." },
  { name: "Organic-Natural", micro: "Real textures, earth palettes, soft forms." },
  { name: "New York Editorial", micro: "Like a cultural magazine: classic serif, weighty photography." },
  { name: "Decorative Maximalism", micro: "Layers, patterns, fearless color. More is more." },
] as const;

export const PALETTES = [
  {
    name: "Warm Neutrals",
    micro: "Paper, bone, sand. For brands that breathe.",
    swatches: ["#F5F0EB", "#E8DDD3", "#C9B99A", "#8C7B6B", "#4A3F35"],
  },
  {
    name: "Saturated Earths",
    micro: "Ochre, terracotta, olive. Body and memory.",
    swatches: ["#C2703E", "#A4512B", "#6B7C3F", "#D4A652", "#3D2B1F"],
  },
  {
    name: "Editorial Contrast",
    micro: "Black, white, one accent. Typography carries the hierarchy.",
    swatches: ["#1A1A1A", "#FFFFFF", "#E63946", "#F1F1F1", "#333333"],
  },
  {
    name: "Sustained Pastels",
    micro: "Soft but with body. Not childish.",
    swatches: ["#C8D5BB", "#F2D0A4", "#D4A5A5", "#A7C7E7", "#F5ECD7"],
  },
  {
    name: "Deep Jewels",
    micro: "Bottle green, wine, mustard. Brands with weight.",
    swatches: ["#1B4332", "#722F37", "#C49B2A", "#2C3E50", "#8B6914"],
  },
  {
    name: "Cold Monochrome",
    micro: "Grays working with one precise blue.",
    swatches: ["#F0F0F0", "#B0B0B0", "#6B6B6B", "#2D5F8A", "#1A1A1A"],
  },
  {
    name: "Contained Tropical",
    micro: "Saturated color, but curated — not carnival.",
    swatches: ["#E07A5F", "#3D9B8F", "#F2CC8F", "#264653", "#E9C46A"],
  },
  {
    name: "Off-Blacks & Raws",
    micro: "Blacks that aren't black, whites that aren't white.",
    swatches: ["#2B2B2B", "#1E1E1E", "#F7F3EF", "#3A3A3A", "#E8E4DF"],
  },
] as const;

export const TYPOGRAPHY = [
  { name: "DM Serif Display + DM Sans", micro: "Classic editorial" },
  { name: "Playfair Display + Source Sans 3", micro: "Elegant contrast" },
  { name: "Space Grotesk + Inter", micro: "Tech-forward" },
  { name: "Fraunces + Work Sans", micro: "Warm personality" },
  { name: "Instrument Serif + Instrument Sans", micro: "Contemporary harmony" },
  { name: "Libre Baskerville + Karla", micro: "Bookish warmth" },
  { name: "Syne + Outfit", micro: "Bold geometric" },
  { name: "Cormorant Garamond + Montserrat", micro: "Luxury meets clean" },
] as const;

export const CLICHES = [
  "Generic gradient blobs",
  "Handwritten script logos",
  "Overused geometric monograms",
  "Stock photo lifestyle",
  "Neon on dark",
  "Excessive drop shadows",
  "Clipart-style icons",
  "Rainbow color schemes",
  "Grunge textures",
  "Cookie-cutter minimalism",
  "Glossy 3D effects",
  "Watercolor splashes",
] as const;
