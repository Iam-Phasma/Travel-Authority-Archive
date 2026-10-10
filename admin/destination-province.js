(function () {
  const PROVINCE_KEYWORDS = [
    [
      "Cavite",
      [
        "cavite",
        "bacoor",
        "dasmariñas",
        "dasmarinas",
        "imus",
        "tagaytay",
        "general trias",
        "trece martires",
        "tanza",
        "silang",
      ],
    ],
    [
      "Laguna",
      [
        "laguna",
        "calamba",
        "santa rosa",
        "biñan",
        "binan",
        "los baños",
        "los banos",
        "san pedro",
        "cabuyao",
        "pagsanjan",
        "san pablo",
      ],
    ],
    ["Batangas", ["batangas", "lipa", "tanauan", "nasugbu", "lemery", "bauan"]],
    [
      "Rizal",
      ["antipolo", "cainta", "taytay", "angono", "binangonan", "pililla", "cardona"],
    ],
    [
      "Quezon",
      ["lucena", "tayabas", "quezon province", "sariaya", "tiaong", "gumaca", "infanta"],
    ],
  ];

  window.classifyDestinationProvince = (destination) => {
    const normalizedDestination = String(destination || "").toLowerCase();
    for (const [province, keywords] of PROVINCE_KEYWORDS) {
      if (keywords.some((keyword) => normalizedDestination.includes(keyword))) {
        return province;
      }
    }
    return "Others";
  };
})();