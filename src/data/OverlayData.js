export const projectLocationCenter = [27.7308175, 85.321047];

const osmTileUrl = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
const osmAttribution = '&copy; OpenStreetMap contributors, &copy; CARTO';

export const mapStyles = {
  osm: {
    id: 'osm',
    name: 'OSM Original',
    url: osmTileUrl,
    attribution: osmAttribution,
    className: '',
  },
  dark: {
    id: 'dark',
    name: 'Inverted Nocturne',
    url: osmTileUrl,
    attribution: osmAttribution,
    className: 'tiles-dark',
  },
  canopy: {
    id: 'canopy',
    name: 'Canopy Signal',
    url: osmTileUrl,
    attribution: osmAttribution,
    className: 'tiles-canopy',
  },
  twilight: {
    id: 'twilight',
    name: 'Twilight Violet',
    url: osmTileUrl,
    attribution: osmAttribution,
    className: 'tiles-twilight',
  },
  infrared: {
    id: 'infrared',
    name: 'Infrared Forest',
    url: osmTileUrl,
    attribution: osmAttribution,
    className: 'tiles-infrared',
  },
  graphite: {
    id: 'graphite',
    name: 'Graphite Survey',
    url: osmTileUrl,
    attribution: osmAttribution,
    className: 'tiles-graphite',
  },
};

export const timeStates = {
  dawn: {
    label: 'Dawn',
    range: '05:00 - 09:00',
    accent: '#ffb86b',
    route: '#ff7a90',
    haze: 'rgba(255, 184, 107, 0.22)',
    overlayOpacity: 0.46,
    soundHint: 'birds',
  },
  day: {
    label: 'Day',
    range: '09:00 - 17:00',
    accent: '#63d6b5',
    route: '#23d7a5',
    haze: 'rgba(99, 214, 181, 0.16)',
    overlayOpacity: 0.34,
    soundHint: 'wind',
  },
  dusk: {
    label: 'Dusk',
    range: '17:00 - 21:00',
    accent: '#f472b6',
    route: '#e879f9',
    haze: 'rgba(244, 114, 182, 0.2)',
    overlayOpacity: 0.52,
    soundHint: 'water',
  },
  night: {
    label: 'Night',
    range: '21:00 - 05:00',
    accent: '#8ab4ff',
    route: '#7df9ff',
    haze: 'rgba(125, 249, 255, 0.16)',
    overlayOpacity: 0.62,
    soundHint: 'wind',
  },
};

export const highDetailOverlay = {
  bounds: [
    [27.72875, 85.31972],
    [27.73345, 85.32205],
  ],
  imageUrl: '/images/high-detail-overlay.svg',
};

export const routes = [
  {
    "id": "osm-way-465127559",
    "name": "OSM Main Pedestrian Loop",
    "dashArray": "8 10",
    "type": "pedestrian",
    "osmWayId": "465127559",
    "distance": "1.01 km",
    "coordinates": [
      [
        27.7301468,
        85.3213413
      ],
      [
        27.7305801,
        85.3214378
      ],
      [
        27.7306941,
        85.3212555
      ],
      [
        27.7303237,
        85.3210301
      ],
      [
        27.7298678,
        85.3208156
      ],
      [
        27.7297789,
        85.3205702
      ],
      [
        27.729285,
        85.3204092
      ],
      [
        27.729342,
        85.3202376
      ],
      [
        27.7297314,
        85.3203341
      ],
      [
        27.7302477,
        85.3205581
      ],
      [
        27.7306751,
        85.3204401
      ],
      [
        27.7311214,
        85.3203864
      ],
      [
        27.7316152,
        85.3204937
      ],
      [
        27.732109,
        85.3206654
      ],
      [
        27.7324604,
        85.3208907
      ],
      [
        27.7327833,
        85.3210731
      ],
      [
        27.7328687,
        85.3213306
      ],
      [
        27.7329162,
        85.3215773
      ],
      [
        27.7328782,
        85.3217919
      ],
      [
        27.7325839,
        85.3218133
      ],
      [
        27.7322895,
        85.3218241
      ],
      [
        27.7320805,
        85.3218026
      ],
      [
        27.7318241,
        85.3217812
      ],
      [
        27.7314918,
        85.3216953
      ],
      [
        27.7312354,
        85.3216202
      ],
      [
        27.7309884,
        85.3214808
      ],
      [
        27.7306941,
        85.3212555
      ]
    ]
  },
  {
    "id": "osm-way-465127560",
    "name": "OSM Inner Pedestrian Loop",
    "dashArray": "8 10",
    "type": "pedestrian",
    "osmWayId": "465127560",
    "distance": "0.32 km",
    "coordinates": [
      [
        27.7311119,
        85.321116
      ],
      [
        27.7313493,
        85.3208585
      ],
      [
        27.7317577,
        85.3209872
      ],
      [
        27.7321185,
        85.3211267
      ],
      [
        27.7322895,
        85.321234
      ],
      [
        27.7323749,
        85.3214378
      ],
      [
        27.7321755,
        85.3214808
      ],
      [
        27.7319571,
        85.3214378
      ],
      [
        27.7316912,
        85.3213842
      ],
      [
        27.7313588,
        85.3212876
      ],
      [
        27.7311119,
        85.321116
      ]
    ]
  },
  {
    "id": "osm-way-465127558",
    "name": "OSM South Entrance Path",
    "dashArray": "8 10",
    "type": "pedestrian",
    "osmWayId": "465127558",
    "distance": "0.15 km",
    "coordinates": [
      [
        27.728854,
        85.3211294
      ],
      [
        27.729082,
        85.321238
      ],
      [
        27.729697,
        85.3212327
      ],
      [
        27.7301468,
        85.3213413
      ]
    ]
  },
  {
    "id": "osm-way-1096913110",
    "name": "OSM Inner Connector",
    "dashArray": "8 10",
    "type": "pedestrian",
    "osmWayId": "1096913110",
    "distance": "0.05 km",
    "coordinates": [
      [
        27.7306941,
        85.3212555
      ],
      [
        27.7308555,
        85.3210838
      ],
      [
        27.7311119,
        85.321116
      ]
    ]
  }
];

export const sensoryZones = [
  {
    id: 'dawn-threshold',
    label: 'Dawn Threshold Field',
    center: [27.7308175, 85.321047],
    radius: 85,
    color: '#facc15',
    mood: 'dawn',
    audio: '/audio/birds.wav',
    description: 'A soft morning field for Ranibari bird calls, canopy movement, and early trail arrivals.',
  },
  {
    id: 'water-memory',
    label: 'Cafe / Tea Pause',
    center: [27.73025, 85.32118],
    radius: 65,
    color: '#38bdf8',
    mood: 'dusk',
    audio: '/audio/water.wav',
    description: 'A quieter social node inspired by the small cafe and tea-stop reports from visitor guides.',
  },
  {
    id: 'wind-corridor',
    label: 'Upper Trail Wind Corridor',
    center: [27.73228, 85.32086],
    radius: 75,
    color: '#a7f3d0',
    mood: 'day',
    audio: '/audio/wind.wav',
    description: 'A directional ambient layer for the hill trail and temple approach.',
  },
];

export const pointsOfInterest = [
  {
    id: 'project-origin',
    title: 'Ranibari Community Forest',
    category: 'photo',
    position: [27.7308175, 85.321047],
    thumbnail: '/images/poi-bethesda.svg',
    gallery: ['/images/poi-bethesda.svg', '/images/gallery-water.svg'],
    description: 'The Google Maps place coordinate for Ranibari Community Forest, an urban green oasis in Kathmandu.',
    timeNote: 'Use this point as the calibration marker for real photos, recordings, trail notes, and surveyed coordinates.',
    tags: ['forest', 'coordinate', 'media'],
  },
  {
    id: 'rest-node',
    title: 'Cafe / Rest Node',
    category: 'food',
    position: [27.73025, 85.32118],
    thumbnail: '/images/poi-met.svg',
    gallery: ['/images/poi-met.svg', '/images/gallery-texture.svg'],
    description: 'A placeholder for the reported small cafe or tea stop inside the forest. Replace with a surveyed coordinate when available.',
    timeNote: 'Day mode keeps this point crisp and practical for wayfinding.',
    tags: ['food', 'rest', 'day'],
  },
  {
    id: 'northern-study',
    title: 'Ranidevi Temple Study',
    category: 'photo',
    position: [27.73125, 85.32088],
    thumbnail: '/images/poi-belvedere.svg',
    gallery: ['/images/poi-belvedere.svg', '/images/gallery-night.svg'],
    description: 'A placeholder for the upper temple area and hill-trail media annotations. Replace with the exact temple coordinate when surveyed.',
    timeNote: 'Night mode adds a sharper cyan halo around this marker for exhibition-style navigation.',
    tags: ['temple', 'birds', 'study'],
  },
];

// Replace placeholder media by dropping files into public/images or public/audio
// and updating the `thumbnail`, `gallery`, or `audio` paths above. Files in
// public are referenced from the site root, for example /audio/birds.wav.

export const parkCropPolygon = [
  [
    27.72898410337638,
    85.31997978687288
  ],
  [
    27.728808413933823,
    85.32030701637268
  ],
  [
    27.72858998882656,
    85.32109022140504
  ],
  [
    27.728993600094963,
    85.3212833404541
  ],
  [
    27.729677361656623,
    85.32133162021638
  ],
  [
    27.730513064406843,
    85.32156765460968
  ],
  [
    27.73111134766727,
    85.32183051109315
  ],
  [
    27.7316953829203,
    85.32203972339632
  ],
  [
    27.73234114183312,
    85.32211482524873
  ],
  [
    27.733058119672833,
    85.32202899456026
  ],
  [
    27.73313409055826,
    85.32195389270784
  ],
  [
    27.733186320511273,
    85.32174468040466
  ],
  [
    27.733153083271354,
    85.3213369846344
  ],
  [
    27.733091356941706,
    85.32109558582307
  ],
  [
    27.733010637842533,
    85.32094538211824
  ],
  [
    27.73292042230797,
    85.32077908515932
  ],
  [
    27.73264977525623,
    85.32059669494629
  ],
  [
    27.73239812037702,
    85.32044649124147
  ],
  [
    27.732151213138295,
    85.32034993171692
  ],
  [
    27.731757110040583,
    85.32021045684816
  ],
  [
    27.73124904731783,
    85.32010316848756
  ],
  [
    27.730807458167646,
    85.32010316848756
  ],
  [
    27.73057479219677,
    85.32019436359407
  ],
  [
    27.730270901201088,
    85.32026946544649
  ],
  [
    27.729990750938875,
    85.32030701637268
  ],
  [
    27.72956815002837,
    85.32015681266786
  ],
  [
    27.729254759531045,
    85.3200548887253
  ]
]