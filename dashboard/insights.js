import { escapeHtml } from "../shared/record-utils.js";

// Insights charts keep their own chart state and data queries.
export const createInsights = ({
  supabase, Chart, currentYear, queueInsightsLayoutSync, syncSegmentedControl,
}) => {
  // === Travel Frequency Chart ===
  let travelFrequencyChart = null;

  const loadTravelFrequencyChart = async (year) => {
    const monthLabels = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const counts = new Array(12).fill(0);

    try {
      const { data, error } = await supabase
        .from("travel_authorities")
        .select("travel_date")
        .eq("is_demo", false)
        .gte("travel_date", `${year}-01-01`)
        .lte("travel_date", `${year}-12-31`);

      if (!error && data) {
        data.forEach((row) => {
          if (row.travel_date) {
            const month = parseInt(row.travel_date.substring(5, 7), 10) - 1;
            if (month >= 0 && month < 12) counts[month]++;
          }
        });
      }
    } catch (e) {
      console.error("Travel frequency chart error:", e);
    }

    const canvas = document.getElementById("tf-chart");
    if (!canvas) return;
    const displayCounts = counts.map((count) => (count === 0 ? null : count));
    const maxCount = Math.max(...counts, 0);
    const targetYAxisLevels = 8;
    const yStepSize =
      maxCount <= targetYAxisLevels - 1
        ? 1
        : Math.ceil(maxCount / (targetYAxisLevels - 1));
    const yAxisMax =
      maxCount === 0 ? 1 : yStepSize * Math.ceil(maxCount / yStepSize);

    if (travelFrequencyChart) {
      travelFrequencyChart.data.datasets[0].data = displayCounts;
      travelFrequencyChart.options.scales.y.max = yAxisMax;
      travelFrequencyChart.options.scales.y.ticks.stepSize = yStepSize;
      travelFrequencyChart.update();
      queueInsightsLayoutSync();
      return;
    }

    travelFrequencyChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: "TAs Filed",
            data: displayCounts,
            backgroundColor: "#2f6fe4",
            borderColor: "#2f6fe4",
            borderWidth: 0,
            borderRadius: 6,
            borderSkipped: false,
            minBarLength: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${ctx.parsed.y} TA${ctx.parsed.y !== 1 ? "s" : ""}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: "rgba(11,28,59,0.45)", font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            max: yAxisMax,
            grid: { color: "rgba(69,122,231,0.07)" },
            border: { display: false },
            ticks: {
              color: "rgba(11,28,59,0.45)",
              font: { size: 11 },
              precision: 0,
              stepSize: yStepSize,
            },
          },
        },
      },
    });

    queueInsightsLayoutSync();
  };

  const initTravelFrequencyYears = async () => {
    const select = document.getElementById("tf-year-select");
    if (!select) return;

    try {
      const { data, error } = await supabase
        .from("travel_authorities")
        .select("travel_date")
        .eq("is_demo", false);

      if (!error && data) {
        const years = [
          ...new Set(
            data
              .filter((r) => r.travel_date)
              .map((r) => r.travel_date.substring(0, 4)),
          ),
        ].sort((a, b) => b - a);

        select.innerHTML = years.length
          ? years
              .map(
                (y) =>
                  `<option value="${escapeHtml(y)}"${y === currentYear ? " selected" : ""}>${escapeHtml(y)}</option>`,
              )
              .join("")
          : '<option value="">No data</option>';

        const selectedYear = select.value || years[0];
        if (selectedYear) await loadTravelFrequencyChart(selectedYear);
      }
    } catch (e) {
      console.error("Failed to init travel frequency years:", e);
    }

    select.addEventListener("change", () => {
      if (select.value) loadTravelFrequencyChart(select.value);
    });
  };
  // === End Travel Frequency Chart ===

  // === Officials Summary List ===
  const initOfficialsSummaryChart = async () => {
    const list = document.getElementById("os-list");
    if (!list) return;

    try {
      const { data: employees, error: empError } = await supabase
        .from("employee_list")
        .select("name, position, office")
        .eq("is_active", true);

      if (empError) throw empError;

      const validEmployees = (employees || []).filter(
        (e) =>
          e.position &&
          e.position.trim().toLowerCase() !== "officials" &&
          String(e.office || "").trim().toLowerCase() === "ched",
      );

      if (!validEmployees.length) {
        list.innerHTML =
          '<div class="insight-chart-placeholder" style="height:120px"><span>No officials found</span></div>';
        queueInsightsLayoutSync();
        return;
      }

      const { data: tas, error: taError } = await supabase
        .from("travel_authorities")
        .select("employees")
        .eq("is_demo", false);

      if (taError) throw taError;

      const counts = {};
      validEmployees.forEach((e) => {
        counts[e.name] = 0;
      });
      (tas || []).forEach((ta) => {
        if (!ta.employees) return;
        // Split on commas but preserve suffixes like Jr., Sr., III
        // Match complete names: handles "A, Jr." as one unit
        const names = ta.employees.match(/[^,]+(?:,\s*(?:Jr\.|Sr\.|II|III|IV|V|Ph\.D\.|M\.D\.))?/g) || [];
        names
          .map((n) => n.trim())
          .forEach((name) => {
            if (name in counts) counts[name]++;
          });
      });

      const ranked = validEmployees
        .filter((e) => counts[e.name] >= 1)
        .sort((a, b) => counts[b.name] - counts[a.name]);

      if (!ranked.length) {
        list.innerHTML =
          '<div class="insight-chart-placeholder" style="height:120px"><span>No travel records yet</span></div>';
        queueInsightsLayoutSync();
        return;
      }

      list.innerHTML = ranked
        .map(
          (e) => `
              <div class="os-official-row">
                  <span class="os-official-name">${e.name}</span>
                  <span class="os-official-count">${counts[e.name]}</span>
              </div>
          `,
        )
        .join("");
      queueInsightsLayoutSync();
    } catch (e) {
      console.error("Officials summary error:", e);
    }
  };
  // === End Officials Summary List ===

  // === Destinations Chart ===
  const initDestinationsChart = async () => {
    const canvas = document.getElementById("dest-chart");
    const title = document.getElementById("dest-card-title");
    const subtitle = document.getElementById("dest-card-subtitle");
    if (!canvas) return;

    const DESTINATION_TITLES = {
      region: "Travel Destinations",
      calabarzon: "Travel Destinations",
    };
    const DESTINATION_SUBTITLES = {
      region: "Groups destination records by Philippine region.",
      calabarzon:
        "Groups CALABARZON trips by province based on each destination entry.",
    };

    // Fallback entries used when PSGC API is unavailable.
    // Ordered: more specific keywords before broader ones to avoid false matches.
    const FALLBACK_REGION_ENTRIES = [
      [
        "NCR",
        [
          "metro manila",
          "national capital",
          "quezon city",
          "makati",
          "pasig",
          "taguig",
          "marikina",
          "caloocan",
          "las piñas",
          "las pinas",
          "malabon",
          "mandaluyong",
          "muntinlupa",
          "navotas",
          "parañaque",
          "paranaque",
          "pasay",
          "pateros",
          "valenzuela",
          "manila",
        ],
      ],
      [
        "CAR",
        [
          "cordillera",
          "baguio",
          "benguet",
          "ifugao",
          "kalinga",
          "apayao",
          "abra",
          "mountain province",
          "tabuk",
        ],
      ],
      [
        "Region I",
        [
          "ilocos norte",
          "ilocos sur",
          "la union",
          "pangasinan",
          "vigan",
          "laoag",
          "dagupan",
          "urdaneta",
        ],
      ],
      [
        "Region II",
        [
          "cagayan valley",
          "batanes",
          "isabela",
          "nueva vizcaya",
          "quirino",
          "tuguegarao",
          "bayombong",
          "santiago city",
        ],
      ],
      [
        "Region III",
        [
          "bulacan",
          "pampanga",
          "tarlac",
          "nueva ecija",
          "zambales",
          "bataan",
          "malolos",
          "cabanatuan",
          "clark",
          "olongapo",
          "subic",
          "angeles",
        ],
      ],
      [
        "CALABARZON",
        [
          "cavite",
          "laguna",
          "batangas",
          "antipolo",
          "calamba",
          "santa rosa",
          "bacoor",
          "dasmariñas",
          "dasmarinas",
          "imus",
          "tagaytay",
          "lucena",
          "cainta",
          "taytay",
          "biñan",
          "binan",
          "san pablo",
          "cabuyao",
          "lipa",
        ],
      ],
      [
        "MIMAROPA",
        ["palawan", "mindoro", "romblon", "marinduque", "puerto princesa"],
      ],
      [
        "Region V",
        [
          "albay",
          "camarines",
          "catanduanes",
          "sorsogon",
          "naga",
          "legazpi",
          "bicol",
        ],
      ],
      [
        "Region VI",
        [
          "iloilo",
          "capiz",
          "aklan",
          "antique",
          "guimaras",
          "negros occidental",
          "bacolod",
          "kalibo",
          "western visayas",
        ],
      ],
      [
        "Region VII",
        [
          "cebu",
          "bohol",
          "negros oriental",
          "siquijor",
          "mandaue",
          "lapu-lapu",
          "tagbilaran",
          "dumaguete",
          "central visayas",
        ],
      ],
      [
        "Region VIII",
        [
          "leyte",
          "samar",
          "biliran",
          "tacloban",
          "ormoc",
          "catbalogan",
          "eastern visayas",
        ],
      ],
      ["Region IX", ["zamboanga", "dipolog", "pagadian"]],
      [
        "Region X",
        [
          "misamis oriental",
          "misamis occidental",
          "bukidnon",
          "camiguin",
          "lanao del norte",
          "cagayan de oro",
          "iligan",
          "malaybalay",
          "northern mindanao",
        ],
      ],
      ["Region XI", ["davao", "tagum", "digos", "compostela valley", "mati"]],
      [
        "Region XII",
        [
          "south cotabato",
          "north cotabato",
          "sultan kudarat",
          "sarangani",
          "general santos",
          "koronadal",
          "kidapawan",
        ],
      ],
      ["Region XIII", ["agusan", "surigao", "dinagat", "butuan", "caraga"]],
      [
        "BARMM",
        [
          "cotabato city",
          "maguindanao",
          "lanao del sur",
          "basilan",
          "sulu",
          "tawi-tawi",
          "marawi",
          "bangsamoro",
        ],
      ],
    ];

    const FALLBACK_CALABARZON_ENTRIES = [
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
        [
          "antipolo",
          "cainta",
          "taytay",
          "angono",
          "binangonan",
          "pililla",
          "cardona",
        ],
      ],
      [
        "Quezon",
        [
          "lucena",
          "tayabas",
          "quezon province",
          "sariaya",
          "tiaong",
          "gumaca",
          "infanta",
        ],
      ],
    ];

    // PSGC API: fetches official province and city/municipality names per region.
    // Results are merged with fallback keywords so existing matches are never lost.
    // Responses are cached in sessionStorage (refreshed daily).
    const PSGC_BASE = "https://psgc.rootscratch.com";
    // v3: dropped broken /province?id= city-fetch for CALABARZON drill-down
    const PSGC_CACHE_KEY = "psgc_geo_v3";
    const PSGC_CACHE_DATE_KEY = "psgc_geo_date_v3";

    const psgcFetch = (url) => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
    };

    const psgcDeriveLabel = (name) => {
      const u = name.toUpperCase();
      if (u.includes("NATIONAL CAPITAL")) return "NCR";
      if (u.includes("CORDILLERA")) return "CAR";
      if (u.includes("BANGSAMORO") || u.includes("BARMM")) return "BARMM";
      if (u.includes("CALABARZON")) return "CALABARZON";
      if (u.includes("MIMAROPA")) return "MIMAROPA";
      if (u.includes("NEGROS ISLAND")) return "NIR";
      const m = name.match(/Region\s+([\w\-]+)/i);
      if (m) return `Region ${m[1].toUpperCase()}`;
      return name;
    };

    const loadPsgcEntries = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        if (sessionStorage.getItem(PSGC_CACHE_DATE_KEY) === today) {
          const cached = sessionStorage.getItem(PSGC_CACHE_KEY);
          if (cached) return JSON.parse(cached);
        }
      } catch (_) {}

      // Fetch all regions and all provinces in parallel — 2 calls.
      // Avoids /region?id= which returns the region record itself, not its provinces.
      const [regRes, provRes] = await Promise.all([
        psgcFetch(`${PSGC_BASE}/region`),
        psgcFetch(`${PSGC_BASE}/province`),
      ]);
      if (!regRes.ok || !provRes.ok) throw new Error("PSGC fetch failed");
      const regions = await regRes.json();
      const allProvinces = await provRes.json();

      // PSGC IDs are hierarchical: the first 2 digits identify the region.
      // Province IDs share the same 2-digit prefix as their parent region.
      const regionPrefixMap = new Map(); // e.g. "04" → "CALABARZON"
      regions.forEach((r) => {
        regionPrefixMap.set(r.psgc_id.substring(0, 2), psgcDeriveLabel(r.name));
      });

      // Group province names under their region label
      const regionProvincesMap = new Map();
      allProvinces.forEach((p) => {
        const label = regionPrefixMap.get(p.psgc_id.substring(0, 2));
        if (!label) return;
        if (!regionProvincesMap.has(label)) regionProvincesMap.set(label, []);
        regionProvincesMap.get(label).push(p.name.toLowerCase().trim());
      });

      // Merge province names into fallback region entries
      const regionEntries = FALLBACK_REGION_ENTRIES.map(([label, fbKws]) => {
        const apiKws = regionProvincesMap.get(label) || [];
        return [label, [...new Set([...apiKws, ...fbKws])]];
      });
      for (const [label, kws] of regionProvincesMap) {
        if (!regionEntries.find(([l]) => l === label) && kws.length) {
          regionEntries.push([label, kws]);
        }
      }

      // CALABARZON drill-down: the PSGC API's /municipal-city endpoint is
      // currently non-functional (returns empty), so city/municipality-level
      // enrichment is not possible. Use the static fallback keywords which
      // already cover the main cities and municipalities per province.
      const calabarzonEntries = FALLBACK_CALABARZON_ENTRIES;

      const result = { regionEntries, calabarzonEntries };
      try {
        sessionStorage.setItem(PSGC_CACHE_KEY, JSON.stringify(result));
        sessionStorage.setItem(
          PSGC_CACHE_DATE_KEY,
          new Date().toISOString().slice(0, 10),
        );
      } catch (_) {}
      return result;
    };

    const classifyDest = (dest, entries) => {
      if (!dest) return "Others";
      const d = dest.toLowerCase();
      for (const [label, keywords] of entries) {
        for (const kw of keywords) {
          if (d.includes(kw)) return label;
        }
      }
      return "Others";
    };

    const REGION_PALETTE = [
      "#2563eb",
      "#0891b2",
      "#059669",
      "#d97706",
      "#dc2626",
      "#7c3aed",
      "#db2777",
      "#0284c7",
      "#16a34a",
      "#ca8a04",
      "#b91c1c",
      "#0d9488",
      "#4f46e5",
      "#be185d",
      "#15803d",
      "#b45309",
      "#6366f1",
      "#64748b",
    ];
    const CALABARZON_PALETTE = [
      "#2563eb",
      "#0891b2",
      "#059669",
      "#d97706",
      "#dc2626",
    ];

    try {
      const { data: provinceCounts, error: provinceCountsError } =
        await supabase.rpc("get_travel_authority_province_counts");
      if (provinceCountsError) throw provinceCountsError;

      let regionRows = null;
      let regionEntries = null;

      const loadRegionData = async () => {
        if (regionRows && regionEntries) {
          return;
        }

        const { data, error } = await supabase
          .from("travel_authorities")
          .select("destination")
          .eq("is_demo", false);

        if (error) throw error;
        regionRows = data || [];
        regionEntries = FALLBACK_REGION_ENTRIES;
      };

      const dataBadge = document.getElementById("dest-data-badge");
      const updateBadge = () => {
        if (!dataBadge) return;
        dataBadge.hidden = true;
      };

      let destChart = null;

      const centerLabelPlugin = {
        id: "destCenterLabel",
        afterDraw(chart) {
          const {
            ctx,
            chartArea: { top, bottom, left, right },
          } = chart;
          const cx = (left + right) / 2;
          const cy = (top + bottom) / 2;
          const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          ctx.save();
          ctx.font = "700 22px Inter, sans-serif";
          ctx.fillStyle = "#0b1c3b";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(total, cx, cy - 9);
          ctx.font = "500 10px Inter, sans-serif";
          ctx.fillStyle = "rgba(11,28,59,0.4)";
          ctx.fillText("travels", cx, cy + 10);
          ctx.restore();
        },
      };

      const renderLegend = (labels, data, colors) => {
        const legend = document.getElementById("dest-legend");
        if (!legend) return;
        const total = data.reduce((a, b) => a + b, 0);
        legend.innerHTML = labels
          .map((label, i) => {
            const pct = total > 0 ? ((data[i] / total) * 100).toFixed(1) : "0.0";
            return `<div class="dest-legend-item">
                      <span class="dest-legend-dot" style="background:${colors[i]}"></span>
                      <span class="dest-legend-label">${label}</span>
                      <span class="dest-legend-meta">
                          <span class="dest-legend-count">${data[i]}</span>
                          <span class="dest-legend-pct">${pct}%</span>
                      </span>
                  </div>`;
          })
          .join("");
      };

      const formatCounts = (counts, palette) => {
        const sorted = Object.entries(counts)
          .filter(([label]) => label !== "Others")
          .sort(([, firstCount], [, secondCount]) => secondCount - firstCount);
        if (counts.Others) sorted.push(["Others", counts.Others]);
        const labels = sorted.map(([label]) => label);
        const data = sorted.map(([, count]) => count);
        const colors = labels.map((label, index) =>
          label === "Others" ? "#94a3b8" : palette[index % palette.length],
        );
        return { labels, data, colors };
      };

      const buildProvinceData = () => {
        const counts = {};
        (provinceCounts || []).forEach(({ province, total }) => {
          const label = province || "Others";
          counts[label] = (counts[label] || 0) + Number(total);
        });
        return formatCounts(counts, CALABARZON_PALETTE);
      };

      const buildRegionData = async () => {
        try {
          const { data, error } = await supabase.rpc(
            "get_travel_authority_region_counts",
          );
          if (error) throw error;

          const counts = {};
          (data || []).forEach(({ region, total }) => {
            const label = region || "Others";
            counts[label] = Number(total);
          });
          return formatCounts(counts, REGION_PALETTE);
        } catch (error) {
          console.warn(
            "Falling back to client-side region classification:",
            error,
          );
          await loadRegionData();
          const counts = {};
          regionRows.forEach((ta) => {
            const label = classifyDest(ta.destination, regionEntries);
            counts[label] = (counts[label] || 0) + 1;
          });
          return formatCounts(counts, REGION_PALETTE);
        }
      };

      const renderChart = async (view) => {
        if (title) {
          title.textContent =
            DESTINATION_TITLES[view] || DESTINATION_TITLES.region;
        }
        if (subtitle) {
          subtitle.textContent =
            DESTINATION_SUBTITLES[view] || DESTINATION_SUBTITLES.region;
        }

        const { labels, data, colors } =
          view === "region" ? await buildRegionData() : buildProvinceData();
        updateBadge();

        if (!labels.length) {
          canvas.parentElement.innerHTML =
            '<div class="insight-chart-placeholder" style="height:220px"><span>No destination data yet</span></div>';
          queueInsightsLayoutSync();
          return;
        }

        renderLegend(labels, data, colors);

        if (destChart) {
          destChart.data.labels = labels;
          destChart.data.datasets[0].data = data;
          destChart.data.datasets[0].backgroundColor = colors;
          destChart.update();
        } else {
          destChart = new Chart(canvas, {
            type: "doughnut",
            data: {
              labels,
              datasets: [
                {
                  data,
                  backgroundColor: colors,
                  borderWidth: 2,
                  borderColor: "rgba(255,255,255,0.85)",
                  hoverOffset: 6,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: "60%",
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                      const pct = ((ctx.parsed / total) * 100).toFixed(1);
                      return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                    },
                  },
                },
              },
            },
            plugins: [centerLabelPlugin],
          });
        }

        queueInsightsLayoutSync();
      };

      await renderChart("calabarzon");
      syncSegmentedControl(
        document.querySelector(".dest-switcher[data-segmented-control]"),
      );

      document.querySelectorAll(".dest-switch-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document
            .querySelectorAll(".dest-switch-btn")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          syncSegmentedControl(btn.closest("[data-segmented-control]"));
          void renderChart(btn.dataset.view).catch((error) => {
            console.error("Destinations chart error:", error);
          });
        });
      });
    } catch (e) {
      console.error("Destinations chart error:", e);
    }
  };
  // === End Destinations Chart ===

  return { initTravelFrequencyYears, initOfficialsSummaryChart, initDestinationsChart };
};
