// data/teams.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
export const MLS_TEAMS = [
  {abbr:"ATL",name:"Atlanta United FC",conf:"Eastern",c1:"#80000A",c2:"#221F1F"},
  {abbr:"ATX",name:"Austin FC",conf:"Western",c1:"#00B140",c2:"#1a1a1a"},
  {abbr:"CLT",name:"Charlotte FC",conf:"Eastern",c1:"#1A85C8",c2:"#1a1a1a"},
  {abbr:"CHI",name:"Chicago Fire FC",conf:"Eastern",c1:"#FF0000",c2:"#0A174A"},
  {abbr:"CIN",name:"FC Cincinnati",conf:"Eastern",c1:"#F05323",c2:"#263B80"},
  {abbr:"CLB",name:"Columbus Crew",conf:"Eastern",c1:"#FEDD00",c2:"#1a1a1a"},
  {abbr:"COL",name:"Colorado Rapids",conf:"Western",c1:"#862633",c2:"#8BB8E8"},
  {abbr:"DAL",name:"FC Dallas",conf:"Western",c1:"#E81F3E",c2:"#2A4076"},
  {abbr:"DC",name:"D.C. United",conf:"Eastern",c1:"#EF3E42",c2:"#231F20"},
  {abbr:"HOU",name:"Houston Dynamo FC",conf:"Western",c1:"#F68712",c2:"#101820"},
  {abbr:"MIA",name:"Inter Miami CF",conf:"Eastern",c1:"#F7B5CD",c2:"#231F20"},
  {abbr:"LA",name:"LA Galaxy",conf:"Western",c1:"#00245D",c2:"#FFD200"},
  {abbr:"LAFC",name:"Los Angeles FC",conf:"Western",c1:"#C39E6D",c2:"#1a1a1a"},
  {abbr:"MIN",name:"Minnesota United FC",conf:"Western",c1:"#E4E5E6",c2:"#231F20"},
  {abbr:"MTL",name:"CF Montréal",conf:"Eastern",c1:"#0033A1",c2:"#1a1a1a"},
  {abbr:"NSH",name:"Nashville SC",conf:"Eastern",c1:"#ECE83A",c2:"#1F1646"},
  {abbr:"NE",name:"New England Revolution",conf:"Eastern",c1:"#0A2240",c2:"#CE0E2D"},
  {abbr:"RBNY",name:"New York Red Bulls",conf:"Eastern",c1:"#ED1E36",c2:"#23326A"},
  {abbr:"NYC",name:"New York City FC",conf:"Eastern",c1:"#6CACE4",c2:"#F15524"},
  {abbr:"ORL",name:"Orlando City SC",conf:"Eastern",c1:"#633492",c2:"#FDE192"},
  {abbr:"PHI",name:"Philadelphia Union",conf:"Eastern",c1:"#071B2C",c2:"#B18F55"},
  {abbr:"POR",name:"Portland Timbers",conf:"Western",c1:"#004812",c2:"#D69A00"},
  {abbr:"RSL",name:"Real Salt Lake",conf:"Western",c1:"#B30838",c2:"#013A81"},
  {abbr:"SJ",name:"San Jose Earthquakes",conf:"Western",c1:"#0067B1",c2:"#1a1a1a"},
  {abbr:"SEA",name:"Seattle Sounders FC",conf:"Western",c1:"#5D9741",c2:"#005695"},
  {abbr:"SKC",name:"Sporting Kansas City",conf:"Western",c1:"#002F65",c2:"#91B0D5"},
  {abbr:"STL",name:"St. Louis City SC",conf:"Western",c1:"#D22630",c2:"#0A1E3C"},
  {abbr:"TOR",name:"Toronto FC",conf:"Eastern",c1:"#B81137",c2:"#455560"},
  {abbr:"VAN",name:"Vancouver Whitecaps FC",conf:"Western",c1:"#00245E",c2:"#9DC2EA"},
  {abbr:"SD",name:"San Diego FC",conf:"Western",c1:"#7B2D8E",c2:"#1a1a1a"},
];

export const tcm={};

MLS_TEAMS.forEach(t=>{tcm[t.abbr]=t;});

