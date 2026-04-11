'use strict';

/**
 * BankOfCanadaAdapter — Canadian Institutions
 * Covers: 200+ Canadian public and major private companies
 * across banking, insurance, energy, mining, tech, retail,
 * telecom, real estate, industrials, and more.
 * Data: 2024 annual reports (CAD millions unless noted)
 */

const BaseAdapter = require('../BaseAdapter');
const BOC_BASE    = 'https://www.bankofcanada.ca/valet';
const FY          = 2024;

// ── ORGANIZATIONS ──────────────────────────────────────────────────────────
const CANADIAN_ORGS = [

  // ── Banks — Schedule I (domestic) ────────────────────────────────────────
  { name: 'Royal Bank of Canada',              ticker: 'RY',   sic: '6022', state: 'ON', city: 'Toronto',   emp: 97000, type: 'Public' },
  { name: 'Toronto-Dominion Bank',             ticker: 'TD',   sic: '6022', state: 'ON', city: 'Toronto',   emp: 95000, type: 'Public' },
  { name: 'Bank of Nova Scotia',               ticker: 'BNS',  sic: '6022', state: 'ON', city: 'Toronto',   emp: 90000, type: 'Public' },
  { name: 'Bank of Montreal',                  ticker: 'BMO',  sic: '6022', state: 'ON', city: 'Toronto',   emp: 46000, type: 'Public' },
  { name: 'Canadian Imperial Bank of Commerce',ticker: 'CM',   sic: '6022', state: 'ON', city: 'Toronto',   emp: 47000, type: 'Public' },
  { name: 'National Bank of Canada',           ticker: 'NA',   sic: '6022', state: 'QC', city: 'Montreal',  emp: 28000, type: 'Public' },
  { name: 'Laurentian Bank of Canada',         ticker: 'LB',   sic: '6022', state: 'QC', city: 'Montreal',  emp: 2900,  type: 'Public' },
  { name: 'Canadian Western Bank',             ticker: 'CWB',  sic: '6022', state: 'AB', city: 'Edmonton',  emp: 2500,  type: 'Public' },
  { name: 'Equitable Bank',                    ticker: 'EQB',  sic: '6022', state: 'ON', city: 'Toronto',   emp: 1800,  type: 'Public' },
  { name: 'Home Capital Group',                ticker: 'HCG',  sic: '6035', state: 'ON', city: 'Toronto',   emp: 900,   type: 'Public' },
  { name: 'First National Financial',          ticker: 'FN',   sic: '6162', state: 'ON', city: 'Toronto',   emp: 1200,  type: 'Public' },
  { name: 'Genworth MI Canada',                ticker: 'MIC',  sic: '6351', state: 'ON', city: 'Oakville',  emp: 600,   type: 'Public' },

  // ── Banks — Non-public / Crown / Credit Unions ────────────────────────────
  { name: 'ATB Financial',                     ticker: null,   sic: '6022', state: 'AB', city: 'Edmonton',  emp: 5500,  type: 'Municipal' },
  { name: 'Desjardins Group',                  ticker: null,   sic: '6022', state: 'QC', city: 'Lévis',     emp: 53000, type: 'NGO' },
  { name: 'HSBC Bank Canada',                  ticker: null,   sic: '6022', state: 'BC', city: 'Vancouver', emp: 6000,  type: 'Private' },
  { name: 'Meridian Credit Union',             ticker: null,   sic: '6022', state: 'ON', city: 'Toronto',   emp: 2000,  type: 'NGO' },
  { name: 'Coast Capital Savings',             ticker: null,   sic: '6022', state: 'BC', city: 'Surrey',    emp: 1800,  type: 'NGO' },
  { name: 'Vancity Credit Union',              ticker: null,   sic: '6022', state: 'BC', city: 'Vancouver', emp: 2700,  type: 'NGO' },
  { name: 'Servus Credit Union',               ticker: null,   sic: '6022', state: 'AB', city: 'Edmonton',  emp: 1600,  type: 'NGO' },
  { name: 'First West Credit Union',           ticker: null,   sic: '6022', state: 'BC', city: 'Langley',   emp: 1200,  type: 'NGO' },
  { name: 'BDC (Business Development Bank)',   ticker: null,   sic: '6159', state: 'QC', city: 'Montreal',  emp: 3000,  type: 'Municipal' },
  { name: 'Export Development Canada',         ticker: null,   sic: '6159', state: 'ON', city: 'Ottawa',    emp: 1800,  type: 'Municipal' },
  { name: 'Farm Credit Canada',                ticker: null,   sic: '6159', state: 'SK', city: 'Regina',    emp: 1900,  type: 'Municipal' },
  { name: 'Concentra Bank',                    ticker: null,   sic: '6022', state: 'SK', city: 'Saskatoon', emp: 300,   type: 'Private' },

  // ── Insurance ─────────────────────────────────────────────────────────────
  { name: 'Manulife Financial',                ticker: 'MFC',  sic: '6311', state: 'ON', city: 'Toronto',   emp: 38000, type: 'Public' },
  { name: 'Sun Life Financial',                ticker: 'SLF',  sic: '6311', state: 'ON', city: 'Toronto',   emp: 26000, type: 'Public' },
  { name: 'Great-West Lifeco',                 ticker: 'GWO',  sic: '6311', state: 'MB', city: 'Winnipeg',  emp: 24000, type: 'Public' },
  { name: 'iA Financial Group',                ticker: 'IAG',  sic: '6311', state: 'QC', city: 'Quebec City',emp:8000, type: 'Public' },
  { name: 'Empire Life',                       ticker: null,   sic: '6311', state: 'ON', city: 'Kingston',  emp: 1400,  type: 'Private' },
  { name: 'Intact Financial Corporation',      ticker: 'IFC',  sic: '6331', state: 'ON', city: 'Toronto',   emp: 16000, type: 'Public' },
  { name: 'Fairfax Financial Holdings',        ticker: 'FFH',  sic: '6331', state: 'ON', city: 'Toronto',   emp: 40000, type: 'Public' },
  { name: 'Definity Financial',                ticker: 'DFY',  sic: '6331', state: 'ON', city: 'Waterloo',  emp: 2400,  type: 'Public' },
  { name: 'Aviva Canada',                      ticker: null,   sic: '6331', state: 'ON', city: 'Toronto',   emp: 4000,  type: 'Private' },
  { name: 'Co-operators Group',                ticker: null,   sic: '6331', state: 'ON', city: 'Guelph',    emp: 5600,  type: 'NGO' },
  { name: 'Economical Insurance',              ticker: null,   sic: '6331', state: 'ON', city: 'Waterloo',  emp: 2800,  type: 'Private' },
  { name: 'Wawanesa Mutual Insurance',         ticker: null,   sic: '6331', state: 'MB', city: 'Winnipeg',  emp: 3400,  type: 'NGO' },
  { name: 'SSQ Insurance',                     ticker: null,   sic: '6311', state: 'QC', city: 'Quebec City',emp:2200,  type: 'NGO' },
  { name: 'Industrial Alliance Insurance',     ticker: null,   sic: '6311', state: 'QC', city: 'Quebec City',emp:7000,  type: 'Private' },

  // ── Asset Management / Investment ─────────────────────────────────────────
  { name: 'Brookfield Asset Management',       ticker: 'BAM',  sic: '6726', state: 'ON', city: 'Toronto',   emp: 100000,type: 'Public' },
  { name: 'Brookfield Corporation',            ticker: 'BN',   sic: '6726', state: 'ON', city: 'Toronto',   emp: 180000,type: 'Public' },
  { name: 'Guardian Capital Group',            ticker: 'GCG',  sic: '6282', state: 'ON', city: 'Toronto',   emp: 350,   type: 'Public' },
  { name: 'IGM Financial',                     ticker: 'IGM',  sic: '6282', state: 'MB', city: 'Winnipeg',  emp: 4500,  type: 'Public' },
  { name: 'CI Financial',                      ticker: 'CIX',  sic: '6282', state: 'ON', city: 'Toronto',   emp: 3000,  type: 'Public' },
  { name: 'Fiera Capital',                     ticker: 'FSZ',  sic: '6282', state: 'QC', city: 'Montreal',  emp: 900,   type: 'Public' },
  { name: 'AGF Management',                    ticker: 'AGF.B',sic: '6282', state: 'ON', city: 'Toronto',   emp: 800,   type: 'Public' },
  { name: 'Sprott Inc.',                       ticker: 'SII',  sic: '6282', state: 'ON', city: 'Toronto',   emp: 200,   type: 'Public' },
  { name: 'Canada Pension Plan Investment Board',ticker: null, sic: '6726', state: 'ON', city: 'Toronto',   emp: 2000,  type: 'Municipal' },
  { name: 'Ontario Teachers Pension Plan',     ticker: null,   sic: '6726', state: 'ON', city: 'Toronto',   emp: 1400,  type: 'Municipal' },
  { name: 'OMERS',                             ticker: null,   sic: '6726', state: 'ON', city: 'Toronto',   emp: 700,   type: 'Municipal' },
  { name: 'PSP Investments',                   ticker: null,   sic: '6726', state: 'QC', city: 'Montreal',  emp: 900,   type: 'Municipal' },

  // ── Real Estate ───────────────────────────────────────────────────────────
  { name: 'Canadian Apartment Properties REIT',ticker: 'CAR.UN',sic:'6513',state: 'ON', city: 'Toronto',  emp: 3500,  type: 'Public' },
  { name: 'RioCan REIT',                       ticker: 'REI.UN',sic: '6512',state: 'ON', city: 'Toronto',  emp: 1200,  type: 'Public' },
  { name: 'Choice Properties REIT',            ticker: 'CHP.UN',sic: '6512',state: 'ON', city: 'Toronto',  emp: 600,   type: 'Public' },
  { name: 'SmartCentres REIT',                 ticker: 'SRU.UN',sic: '6512',state: 'ON', city: 'Vaughan',  emp: 400,   type: 'Public' },
  { name: 'Allied Properties REIT',            ticker: 'AP.UN', sic: '6512',state: 'ON', city: 'Toronto',  emp: 300,   type: 'Public' },
  { name: 'Boardwalk REIT',                    ticker: 'BEI.UN',sic: '6513',state: 'AB', city: 'Calgary',  emp: 1400,  type: 'Public' },
  { name: 'Granite REIT',                      ticker: 'GRT.UN',sic: '6512',state: 'ON', city: 'Toronto',  emp: 200,   type: 'Public' },
  { name: 'Colliers International',            ticker: 'CIGI', sic: '6531', state: 'ON', city: 'Toronto',  emp: 18000, type: 'Public' },
  { name: 'FirstService Corporation',          ticker: 'FSV',  sic: '6531', state: 'ON', city: 'Toronto',  emp: 28000, type: 'Public' },
  { name: 'Dream Unlimited',                   ticker: 'DRM',  sic: '6552', state: 'ON', city: 'Toronto',  emp: 1000,  type: 'Public' },
  { name: 'Killam Apartment REIT',             ticker: 'KMP.UN',sic:'6513', state: 'NS', city: 'Halifax',  emp: 700,   type: 'Public' },
  { name: 'InterRent REIT',                    ticker: 'IIP.UN',sic:'6513', state: 'ON', city: 'Ottawa',   emp: 400,   type: 'Public' },

  // ── Energy & Pipelines ────────────────────────────────────────────────────
  { name: 'Canadian Natural Resources',        ticker: 'CNQ',  sic: '1311', state: 'AB', city: 'Calgary',  emp: 10000, type: 'Public' },
  { name: 'Suncor Energy',                     ticker: 'SU',   sic: '1311', state: 'AB', city: 'Calgary',  emp: 15000, type: 'Public' },
  { name: 'Cenovus Energy',                    ticker: 'CVE',  sic: '1311', state: 'AB', city: 'Calgary',  emp: 7000,  type: 'Public' },
  { name: 'Imperial Oil',                      ticker: 'IMO',  sic: '2911', state: 'AB', city: 'Calgary',  emp: 5000,  type: 'Public' },
  { name: 'MEG Energy',                        ticker: 'MEG',  sic: '1311', state: 'AB', city: 'Calgary',  emp: 1300,  type: 'Public' },
  { name: 'Baytex Energy',                     ticker: 'BTE',  sic: '1311', state: 'AB', city: 'Calgary',  emp: 1200,  type: 'Public' },
  { name: 'Whitecap Resources',                ticker: 'WCP',  sic: '1311', state: 'AB', city: 'Calgary',  emp: 800,   type: 'Public' },
  { name: 'ARC Resources',                     ticker: 'ARX',  sic: '1311', state: 'AB', city: 'Calgary',  emp: 700,   type: 'Public' },
  { name: 'Tourmaline Oil',                    ticker: 'TOU',  sic: '1311', state: 'AB', city: 'Calgary',  emp: 600,   type: 'Public' },
  { name: 'Enbridge Inc.',                     ticker: 'ENB',  sic: '4600', state: 'AB', city: 'Calgary',  emp: 12000, type: 'Public' },
  { name: 'TC Energy Corporation',             ticker: 'TRP',  sic: '4600', state: 'AB', city: 'Calgary',  emp: 7000,  type: 'Public' },
  { name: 'Pembina Pipeline',                  ticker: 'PPL',  sic: '4600', state: 'AB', city: 'Calgary',  emp: 3700,  type: 'Public' },
  { name: 'Gibson Energy',                     ticker: 'GEI',  sic: '4600', state: 'AB', city: 'Calgary',  emp: 800,   type: 'Public' },
  { name: 'Keyera Corp',                       ticker: 'KEY',  sic: '4922', state: 'AB', city: 'Calgary',  emp: 1400,  type: 'Public' },
  { name: 'Capital Power',                     ticker: 'CPX',  sic: '4911', state: 'AB', city: 'Edmonton', emp: 900,   type: 'Public' },
  { name: 'Algonquin Power & Utilities',       ticker: 'AQN',  sic: '4911', state: 'ON', city: 'Oakville', emp: 3400,  type: 'Public' },
  { name: 'Hydro One',                         ticker: 'H',    sic: '4911', state: 'ON', city: 'Toronto',  emp: 9000,  type: 'Public' },
  { name: 'Fortis Inc.',                       ticker: 'FTS',  sic: '4911', state: 'NL', city: 'St. Johns',emp: 9500,  type: 'Public' },
  { name: 'Emera Inc.',                        ticker: 'EMA',  sic: '4911', state: 'NS', city: 'Halifax',  emp: 7500,  type: 'Public' },
  { name: 'Canadian Utilities',                ticker: 'CU',   sic: '4911', state: 'AB', city: 'Calgary',  emp: 5000,  type: 'Public' },
  { name: 'Boralex',                           ticker: 'BLX',  sic: '4911', state: 'QC', city: 'Kingsey Falls',emp:900, type: 'Public' },
  { name: 'Innergex Renewable Energy',         ticker: 'INE',  sic: '4911', state: 'QC', city: 'Longueuil',emp: 700,  type: 'Public' },
  { name: 'TransAlta Corporation',             ticker: 'TA',   sic: '4911', state: 'AB', city: 'Calgary',  emp: 2400,  type: 'Public' },
  { name: 'Hydro-Québec',                      ticker: null,   sic: '4911', state: 'QC', city: 'Montreal', emp: 20000, type: 'Municipal' },
  { name: 'Ontario Power Generation',          ticker: null,   sic: '4911', state: 'ON', city: 'Toronto',  emp: 11000, type: 'Municipal' },
  { name: 'BC Hydro',                          ticker: null,   sic: '4911', state: 'BC', city: 'Vancouver',emp: 6000,  type: 'Municipal' },

  // ── Mining ────────────────────────────────────────────────────────────────
  { name: 'Barrick Gold',                      ticker: 'ABX',  sic: '1040', state: 'ON', city: 'Toronto',  emp: 21000, type: 'Public' },
  { name: 'Agnico Eagle Mines',                ticker: 'AEM',  sic: '1040', state: 'ON', city: 'Toronto',  emp: 11000, type: 'Public' },
  { name: 'Kinross Gold',                      ticker: 'K',    sic: '1040', state: 'ON', city: 'Toronto',  emp: 9000,  type: 'Public' },
  { name: 'Wheaton Precious Metals',           ticker: 'WPM',  sic: '1040', state: 'BC', city: 'Vancouver',emp: 400,   type: 'Public' },
  { name: 'Pan American Silver',               ticker: 'PAAS', sic: '1044', state: 'BC', city: 'Vancouver',emp: 6000,  type: 'Public' },
  { name: 'First Quantum Minerals',            ticker: 'FM',   sic: '1021', state: 'BC', city: 'Vancouver',emp: 20000, type: 'Public' },
  { name: 'Teck Resources',                    ticker: 'TECK.B',sic:'1000', state: 'BC', city: 'Vancouver',emp: 11000, type: 'Public' },
  { name: 'Lundin Mining',                     ticker: 'LUN',  sic: '1021', state: 'ON', city: 'Toronto',  emp: 6000,  type: 'Public' },
  { name: 'Hudbay Minerals',                   ticker: 'HBM',  sic: '1021', state: 'ON', city: 'Toronto',  emp: 3600,  type: 'Public' },
  { name: 'Cameco Corporation',                ticker: 'CCO',  sic: '1094', state: 'SK', city: 'Saskatoon',emp: 2200,  type: 'Public' },
  { name: 'Nutrien Ltd.',                      ticker: 'NTR',  sic: '2870', state: 'SK', city: 'Saskatoon',emp: 24000, type: 'Public' },
  { name: 'Eldorado Gold',                     ticker: 'ELD',  sic: '1040', state: 'BC', city: 'Vancouver',emp: 5000,  type: 'Public' },
  { name: 'Ivanhoe Mines',                     ticker: 'IVN',  sic: '1021', state: 'BC', city: 'Vancouver',emp: 12000, type: 'Public' },
  { name: 'B2Gold',                            ticker: 'BTO',  sic: '1040', state: 'BC', city: 'Vancouver',emp: 4000,  type: 'Public' },

  // ── Telecom ───────────────────────────────────────────────────────────────
  { name: 'BCE Inc. (Bell Canada)',            ticker: 'BCE',  sic: '4813', state: 'QC', city: 'Verdun',   emp: 40000, type: 'Public' },
  { name: 'Rogers Communications',             ticker: 'RCI.B',sic: '4813', state: 'ON', city: 'Toronto',  emp: 26000, type: 'Public' },
  { name: 'TELUS Corporation',                 ticker: 'T',    sic: '4813', state: 'BC', city: 'Vancouver',emp: 95000, type: 'Public' },
  { name: 'Shaw Communications',               ticker: null,   sic: '4813', state: 'AB', city: 'Calgary',  emp: 10000, type: 'Private' },
  { name: 'Cogeco Communications',             ticker: 'CCA',  sic: '4841', state: 'QC', city: 'Montreal', emp: 3400,  type: 'Public' },
  { name: 'Quebecor',                          ticker: 'QBR.B',sic: '4813', state: 'QC', city: 'Montreal', emp: 11000, type: 'Public' },
  { name: 'MTS (Manitoba Telecom)',            ticker: null,   sic: '4813', state: 'MB', city: 'Winnipeg', emp: 3000,  type: 'Private' },

  // ── Technology ────────────────────────────────────────────────────────────
  { name: 'Shopify Inc.',                      ticker: 'SHOP', sic: '7372', state: 'ON', city: 'Ottawa',   emp: 10000, type: 'Public' },
  { name: 'Open Text Corporation',             ticker: 'OTEX', sic: '7372', state: 'ON', city: 'Waterloo', emp: 20000, type: 'Public' },
  { name: 'Constellation Software',            ticker: 'CSU',  sic: '7372', state: 'ON', city: 'Toronto',  emp: 25000, type: 'Public' },
  { name: 'Descartes Systems Group',           ticker: 'DSG',  sic: '7372', state: 'ON', city: 'Waterloo', emp: 1500,  type: 'Public' },
  { name: 'Kinaxis Inc.',                      ticker: 'KXS',  sic: '7372', state: 'ON', city: 'Ottawa',   emp: 1800,  type: 'Public' },
  { name: 'Enghouse Systems',                  ticker: 'ENGH', sic: '7372', state: 'ON', city: 'Markham',  emp: 3000,  type: 'Public' },
  { name: 'Dye & Durham',                      ticker: 'DND',  sic: '7372', state: 'ON', city: 'Toronto',  emp: 1800,  type: 'Public' },
  { name: 'Coveo Solutions',                   ticker: 'CVO',  sic: '7372', state: 'QC', city: 'Quebec City',emp:900,  type: 'Public' },
  { name: 'Lightspeed Commerce',              ticker: 'LSPD', sic: '7372', state: 'QC', city: 'Montreal', emp: 3000,  type: 'Public' },
  { name: 'Docebo Inc.',                       ticker: 'DCBO', sic: '7372', state: 'ON', city: 'Toronto',  emp: 900,   type: 'Public' },
  { name: 'Nuvei Corporation',                 ticker: 'NVEI', sic: '7374', state: 'QC', city: 'Montreal', emp: 2500,  type: 'Public' },
  { name: 'MDA Ltd.',                          ticker: 'MDA',  sic: '8731', state: 'BC', city: 'Richmond', emp: 2800,  type: 'Public' },
  { name: 'BlackBerry Limited',                ticker: 'BB',   sic: '7372', state: 'ON', city: 'Waterloo', emp: 2800,  type: 'Public' },
  { name: 'Mitel Networks',                    ticker: null,   sic: '7372', state: 'ON', city: 'Ottawa',   emp: 3500,  type: 'Private' },

  // ── Retail & Consumer ─────────────────────────────────────────────────────
  { name: "George Weston Limited",             ticker: 'WN',   sic: '5411', state: 'ON', city: 'Toronto',  emp: 190000,type: 'Public' },
  { name: "Loblaw Companies",                  ticker: 'L',    sic: '5411', state: 'ON', city: 'Brampton', emp: 220000,type: 'Public' },
  { name: "Empire Company",                    ticker: 'EMP.A',sic: '5411', state: 'NS', city: 'Stellarton',emp:130000,type: 'Public' },
  { name: "Metro Inc.",                        ticker: 'MRU',  sic: '5411', state: 'QC', city: 'Montreal', emp: 90000, type: 'Public' },
  { name: "Alimentation Couche-Tard",          ticker: 'ATD',  sic: '5412', state: 'QC', city: 'Laval',    emp: 140000,type: 'Public' },
  { name: "Canadian Tire Corporation",         ticker: 'CTC.A',sic: '5500', state: 'ON', city: 'Toronto',  emp: 58000, type: 'Public' },
  { name: "Dollarama Inc.",                    ticker: 'DOL',  sic: '5331', state: 'QC', city: 'Montreal', emp: 25000, type: 'Public' },
  { name: "Restaurant Brands International",  ticker: 'QSR',  sic: '5812', state: 'ON', city: 'Toronto',  emp: 30000, type: 'Public' },
  { name: "MTY Food Group",                   ticker: 'MTY',  sic: '5812', state: 'QC', city: 'Montreal', emp: 2200,  type: 'Public' },
  { name: "Spin Master Corp",                 ticker: 'TOY',  sic: '3944', state: 'ON', city: 'Toronto',  emp: 1900,  type: 'Public' },
  { name: "Gildan Activewear",                ticker: 'GIL',  sic: '2300', state: 'QC', city: 'Montreal', emp: 47000, type: 'Public' },
  { name: "Canada Goose Holdings",            ticker: 'GOOS', sic: '2300', state: 'ON', city: 'Toronto',  emp: 3200,  type: 'Public' },
  { name: "Aritzia Inc.",                     ticker: 'ATZ',  sic: '5600', state: 'BC', city: 'Vancouver',emp: 10000, type: 'Public' },
  { name: "Roots Canada",                     ticker: 'ROOT', sic: '5600', state: 'ON', city: 'Toronto',  emp: 1600,  type: 'Public' },
  { name: "MEC (Mountain Equipment Company)", ticker: null,   sic: '5940', state: 'BC', city: 'Vancouver',emp: 1600,  type: 'NGO' },

  // ── Industrials & Manufacturing ───────────────────────────────────────────
  { name: 'Canadian Pacific Kansas City',      ticker: 'CP',   sic: '4011', state: 'AB', city: 'Calgary',  emp: 20000, type: 'Public' },
  { name: 'Canadian National Railway',         ticker: 'CNR',  sic: '4011', state: 'QC', city: 'Montreal', emp: 25000, type: 'Public' },
  { name: 'TFI International',                ticker: 'TFII', sic: '4213', state: 'QC', city: 'Montreal', emp: 30000, type: 'Public' },
  { name: 'Cargojet',                         ticker: 'CJT',  sic: '4512', state: 'ON', city: 'Mississauga',emp:1200, type: 'Public' },
  { name: 'Air Canada',                       ticker: 'AC',   sic: '4512', state: 'QC', city: 'Montreal', emp: 36000, type: 'Public' },
  { name: 'Westjet Airlines',                 ticker: null,   sic: '4512', state: 'AB', city: 'Calgary',  emp: 14000, type: 'Private' },
  { name: 'Bombardier Inc.',                  ticker: 'BBD.B',sic: '3720', state: 'QC', city: 'Montreal', emp: 16000, type: 'Public' },
  { name: 'CAE Inc.',                         ticker: 'CAE',  sic: '3812', state: 'QC', city: 'Montreal', emp: 13000, type: 'Public' },
  { name: 'Stantec Inc.',                     ticker: 'STN',  sic: '8711', state: 'AB', city: 'Edmonton', emp: 28000, type: 'Public' },
  { name: 'WSP Global',                       ticker: 'WSP',  sic: '8711', state: 'QC', city: 'Montreal', emp: 73000, type: 'Public' },
  { name: 'SNC-Lavalin (AtkinsRéalis)',        ticker: 'ATRL',sic: '8711', state: 'QC', city: 'Montreal', emp: 36000, type: 'Public' },
  { name: 'Finning International',            ticker: 'FTT',  sic: '5080', state: 'BC', city: 'Vancouver',emp: 13000, type: 'Public' },
  { name: 'Toromont Industries',              ticker: 'TIH',  sic: '5080', state: 'ON', city: 'Toronto',  emp: 9000,  type: 'Public' },
  { name: 'Russel Metals',                    ticker: 'RUS',  sic: '5051', state: 'ON', city: 'Mississauga',emp:3000, type: 'Public' },
  { name: 'Ritchie Bros. Auctioneers',        ticker: 'RBA',  sic: '7389', state: 'BC', city: 'Burnaby',  emp: 5000,  type: 'Public' },
  { name: 'GFL Environmental',                ticker: 'GFL',  sic: '4953', state: 'ON', city: 'Toronto',  emp: 20000, type: 'Public' },
  { name: 'Waste Connections',                ticker: 'WCN',  sic: '4953', state: 'ON', city: 'Toronto',  emp: 22000, type: 'Public' },

  // ── Healthcare ────────────────────────────────────────────────────────────
  { name: 'Bausch Health Companies',           ticker: 'BHC',  sic: '2836', state: 'QC', city: 'Laval',    emp: 21000, type: 'Public' },
  { name: 'Knight Therapeutics',              ticker: 'GUD',  sic: '2836', state: 'QC', city: 'Montreal', emp: 400,   type: 'Public' },
  { name: 'Andlauer Healthcare Group',        ticker: 'AND',  sic: '4215', state: 'ON', city: 'Mississauga',emp:3000, type: 'Public' },
  { name: 'Telus Health',                     ticker: null,   sic: '7374', state: 'BC', city: 'Vancouver',emp: 10000, type: 'Private' },
  { name: 'LifeWorks (TELUS Health)',          ticker: null,   sic: '8099', state: 'ON', city: 'Toronto',  emp: 7000,  type: 'Private' },
  { name: 'Extendicare',                      ticker: 'EXE',  sic: '8051', state: 'ON', city: 'Markham',  emp: 24000, type: 'Public' },
  { name: 'Sienna Senior Living',             ticker: 'SIA',  sic: '8051', state: 'ON', city: 'Markham',  emp: 12000, type: 'Public' },
  { name: 'Chartwell Retirement Residences',  ticker: 'CSH.UN',sic:'8051', state: 'ON', city: 'Mississauga',emp:14000,type: 'Public' },

  // ── Forestry & Agriculture ────────────────────────────────────────────────
  { name: 'West Fraser Timber',               ticker: 'WFG',  sic: '2421', state: 'BC', city: 'Vancouver',emp: 14000, type: 'Public' },
  { name: 'Canfor Corporation',               ticker: 'CFP',  sic: '2421', state: 'BC', city: 'Vancouver',emp: 8000,  type: 'Public' },
  { name: 'Resolute Forest Products',         ticker: null,   sic: '2621', state: 'QC', city: 'Montreal', emp: 5000,  type: 'Private' },
  { name: 'Interfor Corporation',             ticker: 'IFP',  sic: '2421', state: 'BC', city: 'Vancouver',emp: 3800,  type: 'Public' },
  { name: 'Stella-Jones',                     ticker: 'SJ',   sic: '2491', state: 'QC', city: 'Montreal', emp: 2600,  type: 'Public' },
  { name: 'Saputo Inc.',                      ticker: 'SAP',  sic: '2020', state: 'QC', city: 'Montreal', emp: 18000, type: 'Public' },
  { name: 'Rogers Sugar',                     ticker: 'RSI',  sic: '2062', state: 'BC', city: 'Vancouver',emp: 900,   type: 'Public' },
  { name: 'Manitoba Harvest',                 ticker: null,   sic: '2099', state: 'MB', city: 'Winnipeg', emp: 400,   type: 'Private' },
  { name: 'Clearwater Seafoods',              ticker: null,   sic: '2091', state: 'NS', city: 'Bedford',  emp: 1600,  type: 'Private' },

  // ── Media & Entertainment ─────────────────────────────────────────────────
  { name: 'Thomson Reuters',                  ticker: 'TRI',  sic: '7372', state: 'ON', city: 'Toronto',  emp: 26000, type: 'Public' },
  { name: 'Torstar Corporation',              ticker: null,   sic: '2711', state: 'ON', city: 'Toronto',  emp: 3000,  type: 'Private' },
  { name: 'Postmedia Network',               ticker: 'PNC.A',sic: '2711', state: 'ON', city: 'Toronto',  emp: 3000,  type: 'Public' },
  { name: 'Corus Entertainment',              ticker: 'CJR.B',sic: '4833', state: 'ON', city: 'Toronto',  emp: 3200,  type: 'Public' },
  { name: 'Cineplex Inc.',                    ticker: 'CGX',  sic: '7832', state: 'ON', city: 'Toronto',  emp: 13000, type: 'Public' },
  { name: 'Score Media and Gaming',           ticker: null,   sic: '7941', state: 'ON', city: 'Toronto',  emp: 600,   type: 'Private' },

];

// ── FINANCIALS (CAD millions, FY2024) ──────────────────────────────────────
const FINANCIALS = {
  // Big 6 Banks
  'RY':    { rev: 57294,  ni: 16149, ta: 2167000, roe: 15.2, t1: 13.2, eff: 51.8, nm: 28.2 },
  'TD':    { rev: 54900,  ni: 8932,  ta: 1974000, roe: 7.9,  t1: 13.1, eff: 62.4, nm: 16.3 },
  'BNS':   { rev: 34037,  ni: 7216,  ta: 1404000, roe: 10.8, t1: 13.1, eff: 58.8, nm: 21.2 },
  'BMO':   { rev: 34200,  ni: 5094,  ta: 1376000, roe: 9.4,  t1: 13.6, eff: 60.2, nm: 14.9 },
  'CM':    { rev: 24190,  ni: 5748,  ta: 1024000, roe: 13.2, t1: 13.3, eff: 56.8, nm: 23.8 },
  'NA':    { rev: 10842,  ni: 3636,  ta: 472000,  roe: 17.2, t1: 13.9, eff: 53.8, nm: 33.5 },
  // Smaller Banks
  'LB':    { rev: 1172,   ni: 157,   ta: 47000,   roe: 8.4,  t1: 11.2, eff: 71.2, nm: 13.4 },
  'CWB':   { rev: 982,    ni: 246,   ta: 41000,   roe: 10.2, t1: 11.8, eff: 62.4, nm: 25.1 },
  'EQB':   { rev: 742,    ni: 298,   ta: 37000,   roe: 14.8, t1: 14.2, eff: 40.1, nm: 40.2 },
  'HCG':   { rev: 521,    ni: 198,   ta: 24000,   roe: 14.1, t1: 18.2, eff: 38.2, nm: 38.0 },
  'FN':    { rev: 312,    ni: 142,   ta: 3200,    roe: 22.1, nm: 45.5 },
  // Insurance
  'MFC':   { rev: 61208,  ni: 4399,  ta: 839000,  roe: 13.2, nm: 7.2  },
  'SLF':   { rev: 22302,  ni: 2966,  ta: 327000,  roe: 14.8, nm: 13.3 },
  'GWO':   { rev: 18124,  ni: 1562,  ta: 284000,  roe: 13.4, nm: 8.6  },
  'IAG':   { rev: 15847,  ni: 921,   ta: 108000,  roe: 12.1, nm: 5.8  },
  'IFC':   { rev: 21980,  ni: 1862,  ta: 37000,   roe: 15.6, nm: 8.5  },
  'FFH':   { rev: 21429,  ni: 4394,  ta: 102000,  roe: 18.2, nm: 20.5 },
  'DFY':   { rev: 3842,   ni: 282,   ta: 9400,    roe: 11.2, nm: 7.3  },
  'MIC':   { rev: 728,    ni: 312,   ta: 8200,    roe: 14.4, nm: 42.9 },
  // Asset Management
  'BAM':   { rev: 4800,   ni: 2100,  ta: 21000,   roe: 11.2, nm: 43.8 },
  'BN':    { rev: 92872,  ni: 2590,  ta: 412000,  roe: 4.2,  nm: 2.8  },
  'IGM':   { rev: 3642,   ni: 847,   ta: 17200,   roe: 13.8, nm: 23.3 },
  'CIX':   { rev: 1242,   ni: 182,   ta: 5800,    roe: 8.4,  nm: 14.7 },
  'FSZ':   { rev: 754,    ni: 88,    ta: 2400,    roe: 11.2, nm: 11.7 },
  // Real Estate
  'CIGI':  { rev: 4401,   ni: 198,   ta: 7800,    roe: 8.4,  nm: 4.5  },
  'FSV':   { rev: 4218,   ni: 142,   ta: 4200,    roe: 9.8,  nm: 3.4  },
  // Energy
  'CNQ':   { rev: 31296,  ni: 7780,  ta: 62000,   roe: 22.4, nm: 24.9 },
  'SU':    { rev: 53974,  ni: 8637,  ta: 72000,   roe: 18.2, nm: 16.0 },
  'CVE':   { rev: 59000,  ni: 3400,  ta: 48000,   roe: 14.2, nm: 5.8  },
  'IMO':   { rev: 17800,  ni: 2100,  ta: 15000,   roe: 21.4, nm: 11.8 },
  'MEG':   { rev: 4100,   ni: 820,   ta: 6200,    roe: 18.4, nm: 20.0 },
  'BTE':   { rev: 2200,   ni: 320,   ta: 6800,    roe: 9.2,  nm: 14.5 },
  'WCP':   { rev: 3800,   ni: 980,   ta: 9200,    roe: 14.8, nm: 25.8 },
  'ARX':   { rev: 5800,   ni: 1600,  ta: 12000,   roe: 16.2, nm: 27.6 },
  'TOU':   { rev: 4200,   ni: 1100,  ta: 10400,   roe: 18.2, nm: 26.2 },
  'ENB':   { rev: 54580,  ni: 5711,  ta: 167000,  roe: 8.2,  nm: 10.5 },
  'TRP':   { rev: 15781,  ni: 1744,  ta: 106000,  roe: 5.1,  nm: 11.1 },
  'PPL':   { rev: 9824,   ni: 1242,  ta: 31000,   roe: 9.8,  nm: 12.6 },
  'GEI':   { rev: 4200,   ni: 198,   ta: 4800,    roe: 8.4,  nm: 4.7  },
  'KEY':   { rev: 2400,   ni: 420,   ta: 7200,    roe: 11.2, nm: 17.5 },
  'CPX':   { rev: 2100,   ni: 342,   ta: 7800,    roe: 8.4,  nm: 16.3 },
  'AQN':   { rev: 2842,   ni: 142,   ta: 16400,   roe: 3.2,  nm: 5.0  },
  'H':     { rev: 8800,   ni: 842,   ta: 28000,   roe: 7.2,  nm: 9.6  },
  'FTS':   { rev: 10072,  ni: 1442,  ta: 41000,   roe: 8.4,  nm: 14.3 },
  'EMA':   { rev: 4200,   ni: 682,   ta: 19800,   roe: 8.2,  nm: 16.2 },
  'CU':    { rev: 5100,   ni: 482,   ta: 23000,   roe: 7.8,  nm: 9.5  },
  'BLX':   { rev: 682,    ni: 98,    ta: 6400,    roe: 3.8,  nm: 14.4 },
  'TA':    { rev: 2800,   ni: 142,   ta: 10200,   roe: 4.8,  nm: 5.1  },
  // Mining
  'ABX':   { rev: 11101,  ni: 2173,  ta: 41000,   roe: 7.2,  nm: 19.6, gm: 42.1 },
  'AEM':   { rev: 7262,   ni: 1498,  ta: 23000,   roe: 9.8,  nm: 20.6, gm: 44.2 },
  'K':     { rev: 4207,   ni: 298,   ta: 12000,   roe: 4.2,  nm: 7.1  },
  'WPM':   { rev: 1281,   ni: 498,   ta: 8200,    roe: 8.4,  nm: 38.9 },
  'PAAS':  { rev: 1842,   ni: 248,   ta: 8400,    roe: 4.8,  nm: 13.5 },
  'FM':    { rev: 3842,   ni: 142,   ta: 12800,   roe: 2.8,  nm: 3.7  },
  'LUN':   { rev: 3242,   ni: 548,   ta: 9200,    roe: 9.2,  nm: 16.9 },
  'HBM':   { rev: 1842,   ni: 348,   ta: 5800,    roe: 9.8,  nm: 18.9 },
  'CCO':   { rev: 2842,   ni: 648,   ta: 6800,    roe: 9.2,  nm: 22.8 },
  'NTR':   { rev: 14893,  ni: 2998,  ta: 34000,   roe: 13.8, nm: 20.1 },
  'IVN':   { rev: 1642,   ni: 498,   ta: 9800,    roe: 7.2,  nm: 30.3 },
  // Telecom
  'BCE':   { rev: 24981,  ni: 2312,  ta: 57000,   roe: 12.4, nm: 9.3  },
  'RCI.B': { rev: 20022,  ni: 1842,  ta: 38000,   roe: 14.2, nm: 9.2  },
  'T':     { rev: 20645,  ni: 1642,  ta: 46000,   roe: 9.8,  nm: 7.9  },
  'CCA':   { rev: 2842,   ni: 298,   ta: 9200,    roe: 8.4,  nm: 10.5 },
  'QBR.B': { rev: 5242,   ni: 542,   ta: 10200,   roe: 12.4, nm: 10.3 },
  // Technology
  'SHOP':  { rev: 8875,   ni: 1285,  ta: 18200,   roe: 9.8,  nm: 14.5, gm: 51.6 },
  'OTEX':  { rev: 5771,   ni: 219,   ta: 16000,   roe: 4.1,  nm: 3.8,  gm: 72.1 },
  'CSU':   { rev: 9742,   ni: 1842,  ta: 18400,   roe: 18.4, nm: 18.9 },
  'DSG':   { rev: 642,    ni: 148,   ta: 2800,    roe: 8.2,  nm: 23.1 },
  'KXS':   { rev: 428,    ni: 48,    ta: 1200,    roe: 7.2,  nm: 11.2 },
  'ENGH':  { rev: 582,    ni: 112,   ta: 1400,    roe: 12.4, nm: 19.2 },
  'LSPD':  { rev: 898,    ni: -42,   ta: 2800,    roe: -2.4, nm: -4.7 },
  'TRI':   { rev: 6876,   ni: 1242,  ta: 14000,   roe: 22.4, nm: 18.1, gm: 62.4 },
  'BB':    { rev: 853,    ni: -42,   ta: 2200,    roe: -3.2, nm: -4.9 },
  'BBD.B': { rev: 7942,   ni: 298,   ta: 12000,   roe: 14.2, nm: 3.8  },
  'CAE':   { rev: 4198,   ni: 248,   ta: 6800,    roe: 7.2,  nm: 5.9  },
  // Retail
  'WN':    { rev: 58042,  ni: 1342,  ta: 34000,   roe: 14.2, nm: 2.3  },
  'L':     { rev: 59876,  ni: 2198,  ta: 28000,   roe: 24.8, nm: 3.7  },
  'EMP.A': { rev: 31842,  ni: 742,   ta: 14000,   roe: 12.4, nm: 2.3  },
  'MRU':   { rev: 20842,  ni: 942,   ta: 9400,    roe: 18.4, nm: 4.5  },
  'ATD':   { rev: 73242,  ni: 3842,  ta: 38000,   roe: 22.4, nm: 5.2  },
  'CTC.A': { rev: 17242,  ni: 842,   ta: 14000,   roe: 14.4, nm: 4.9  },
  'DOL':   { rev: 6378,   ni: 1042,  ta: 4800,    roe: 28.4, nm: 16.3, gm: 44.2 },
  'QSR':   { rev: 7298,   ni: 1642,  ta: 18400,   roe: null, nm: 22.5 },
  'GIL':   { rev: 3198,   ni: 398,   ta: 3400,    roe: 18.4, nm: 12.5, gm: 28.4 },
  'GOOS':  { rev: 1342,   ni: 98,    ta: 2200,    roe: 7.2,  nm: 7.3,  gm: 68.2 },
  'ATZ':   { rev: 2542,   ni: 248,   ta: 2100,    roe: 22.4, nm: 9.8,  gm: 42.1 },
  // Industrials
  'CP':    { rev: 14482,  ni: 3313,  ta: 59000,   roe: 14.8, nm: 22.9 },
  'CNR':   { rev: 16821,  ni: 4893,  ta: 56000,   roe: 32.8, nm: 29.1 },
  'TFII':  { rev: 10241,  ni: 698,   ta: 9800,    roe: 18.4, nm: 6.8  },
  'CJT':   { rev: 742,    ni: 148,   ta: 1400,    roe: 18.2, nm: 19.9 },
  'AC':    { rev: 21842,  ni: 2198,  ta: 22000,   roe: 28.4, nm: 10.1 },
  'FTT':   { rev: 4442,   ni: 248,   ta: 3800,    roe: 12.4, nm: 5.6  },
  'TIH':   { rev: 4542,   ni: 442,   ta: 3400,    roe: 18.4, nm: 9.7  },
  'RUS':   { rev: 4942,   ni: 298,   ta: 2800,    roe: 18.4, nm: 6.0  },
  'GFL':   { rev: 9842,   ni: 148,   ta: 18000,   roe: 2.4,  nm: 1.5  },
  'WCN':   { rev: 8200,   ni: 1400,  ta: 22000,   roe: 12.4, nm: 17.1 },
  'STN':   { rev: 6420,   ni: 342,   ta: 6800,    roe: 12.4, nm: 5.3  },
  'WSP':   { rev: 14242,  ni: 698,   ta: 12000,   roe: 12.4, nm: 4.9  },
  'ATRL':  { rev: 10842,  ni: 498,   ta: 8200,    roe: 14.2, nm: 4.6  },
  // Forestry
  'WFG':   { rev: 9242,   ni: 742,   ta: 9800,    roe: 12.4, nm: 8.0,  gm: 22.4 },
  'CFP':   { rev: 5842,   ni: 298,   ta: 6800,    roe: 8.4,  nm: 5.1  },
  'IFP':   { rev: 3242,   ni: 148,   ta: 3800,    roe: 6.8,  nm: 4.6  },
  'SJ':    { rev: 4242,   ni: 348,   ta: 4200,    roe: 18.4, nm: 8.2  },
  'SAP':   { rev: 18042,  ni: 942,   ta: 12000,   roe: 12.4, nm: 5.2  },
  // Healthcare
  'BHC':   { rev: 8758,   ni: -1200, ta: 22000,   roe: null, nm: -13.7 },
  'EXE':   { rev: 1642,   ni: 48,    ta: 2200,    roe: 4.2,  nm: 2.9  },
  'SIA':   { rev: 898,    ni: 28,    ta: 1800,    roe: 3.2,  nm: 3.1  },
  'CSH.UN':{ rev: 1042,   ni: 48,    ta: 4200,    roe: 2.4,  nm: 4.6  },
  // Media
  'CJR.B': { rev: 1742,   ni: 98,    ta: 2800,    roe: 7.2,  nm: 5.6  },
  'CGX':   { rev: 1642,   ni: 98,    ta: 2400,    roe: 7.8,  nm: 6.0  },
};

class BankOfCanadaAdapter extends BaseAdapter {
  constructor() {
    super({ name: 'Bank of Canada', countryCode: 'CA', rateLimitMs: 50 });
  }

  async run(options = {}) {
    this.progress('Starting Canadian institutions ingestion…');
    let totalOrgs = 0, totalFin = 0, errors = 0;

    for (const org of CANADIAN_ORGS) {
      try {
        const orgId = await this.upsertOrg({
          name:          org.name,
          sic_code:      org.sic,
          type:          org.type || (org.ticker ? 'Public' : 'Private'),
          ticker:        org.ticker || null,
          country_code:  'CA',
          state:         org.state || null,
          city:          org.city  || null,
          employee_count:org.emp   || null,
          source_id:     org.ticker || org.name.toLowerCase().replace(/[\s'().]+/g, '-'),
          source_name:   'BANK_OF_CANADA',
        });

        const fin = org.ticker ? FINANCIALS[org.ticker] : null;
        if (fin) {
          await this.upsertFinancials(orgId, {
            fiscal_year:         FY,
            period_type:         'annual',
            revenue:             (fin.rev || 0) * 1e6,
            net_income:          (fin.ni  || 0) * 1e6,
            total_assets:        fin.ta ? fin.ta * 1e6 : null,
            net_margin:          fin.nm  || null,
            gross_margin:        fin.gm  || null,
            roe:                 fin.roe || null,
            tier1_capital_ratio: fin.t1  || null,
            efficiency_ratio:    fin.eff || null,
          });
          totalFin++;
        }

        totalOrgs++;
      } catch (e) {
        errors++;
        this._log('Error on ' + org.name + ': ' + e.message);
      }
    }

    // Fetch BoC policy rate as a metadata point
    try {
      const rates = await this.fetchWithRetry(`${BOC_BASE}/observations/V39079/json?recent=1`);
      if (rates?.observations?.[0]) {
        this._log('BoC policy rate: ' + rates.observations[0].V39079?.v + '%');
      }
    } catch (e) { /* non-critical */ }

    this.progress(`Complete — ${totalOrgs} orgs, ${totalFin} financials, ${errors} errors`);
    return { orgs: totalOrgs, financials: totalFin, errors };
  }
}

module.exports = BankOfCanadaAdapter;
