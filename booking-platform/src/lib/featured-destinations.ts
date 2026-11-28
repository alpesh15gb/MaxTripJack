export const destinationThemes = ["All", "Beaches & islands", "City breaks", "Culture & history", "Nature & adventure", "Family holidays", "Honeymoons & romance"] as const;

export const destinations = [
  { name: "The Maldives", city: "Maldives", slug: "maldives", airports: "MLE", airport: "MLE", themes: ["Beaches & islands", "Honeymoons & romance"], location: "Indian Ocean" },
  { name: "Bali", city: "Bali", slug: "bali", airports: "DPS", airport: "DPS", themes: ["Beaches & islands", "Culture & history", "Nature & adventure"], location: "Indonesia" },
  { name: "Dubai", city: "Dubai", slug: "dubai", airports: "DXB", airport: "DXB", themes: ["City breaks", "Family holidays"], location: "United Arab Emirates" },
  { name: "Paris", city: "Paris", slug: "paris", airports: "CDG", airport: "CDG", themes: ["City breaks", "Culture & history", "Honeymoons & romance"], location: "France" },
  { name: "Goa", city: "Goa", slug: "goa", airports: "GOI/GOX", airport: "GOI", themes: ["Beaches & islands", "Culture & history", "Family holidays"], location: "India" },
];
