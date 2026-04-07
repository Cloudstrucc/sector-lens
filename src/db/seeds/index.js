'use strict';

const SIC_CODES = [
  // Division A — Agriculture
  { sic_code: '0100', division: 'A', major_group: '01', name: 'Crops', name_fr: 'Cultures', description: 'Establishments primarily engaged in growing crops.', entity_count: 0 },
  { sic_code: '0200', division: 'A', major_group: '02', name: 'Livestock', name_fr: 'Élevage', description: 'Establishments primarily engaged in raising livestock.', entity_count: 0 },
  { sic_code: '0700', division: 'A', major_group: '07', name: 'Agricultural Services', name_fr: 'Services agricoles', description: 'Establishments primarily engaged in supplying services to agriculture.', entity_count: 0 },
  { sic_code: '0800', division: 'A', major_group: '08', name: 'Forestry', name_fr: 'Foresterie', description: 'Establishments primarily engaged in timber tracts, tree farms, and forest nurseries.', entity_count: 0 },
  { sic_code: '0900', division: 'A', major_group: '09', name: 'Fishing, Hunting and Trapping', name_fr: 'Pêche, chasse et piégeage', description: 'Establishments primarily engaged in commercial fishing, hunting and trapping.', entity_count: 0 },
  // Division B — Mining
  { sic_code: '1000', division: 'B', major_group: '10', name: 'Metal Mining', name_fr: 'Extraction de métaux', description: 'Establishments primarily engaged in mining metallic minerals.', entity_count: 0 },
  { sic_code: '1200', division: 'B', major_group: '12', name: 'Coal Mining', name_fr: 'Extraction du charbon', description: 'Establishments primarily engaged in mining bituminous coal, lignite, and anthracite.', entity_count: 0 },
  { sic_code: '1311', division: 'B', major_group: '13', name: 'Crude Petroleum and Natural Gas', name_fr: 'Pétrole brut et gaz naturel', description: 'Establishments primarily engaged in crude petroleum and natural gas exploration and production.', entity_count: 0 },
  { sic_code: '1400', division: 'B', major_group: '14', name: 'Mining & Quarrying of Nonmetallic Minerals', name_fr: "Extraction de minéraux non métalliques", description: 'Establishments primarily engaged in mining or quarrying nonmetallic minerals.', entity_count: 0 },
  // Division C — Construction
  { sic_code: '1500', division: 'C', major_group: '15', name: 'Building Construction', name_fr: 'Construction de bâtiments', description: 'Establishments primarily engaged in the construction of residential buildings.', entity_count: 0 },
  { sic_code: '1600', division: 'C', major_group: '16', name: 'Heavy Construction', name_fr: 'Grands travaux', description: 'Establishments primarily engaged in heavy construction other than building construction.', entity_count: 0 },
  { sic_code: '1731', division: 'C', major_group: '17', name: 'Electrical Work', name_fr: 'Travaux électriques', description: 'Establishments primarily engaged in electrical work.', entity_count: 0 },
  { sic_code: '1740', division: 'C', major_group: '17', name: 'Masonry, Stonework, Tile Setting', name_fr: 'Maçonnerie et carrelage', description: 'Establishments primarily engaged in masonry, stonework, plastering, and related work.', entity_count: 0 },
  // Division D — Manufacturing
  { sic_code: '2000', division: 'D', major_group: '20', name: 'Food and Kindred Products', name_fr: 'Aliments et produits connexes', description: 'Establishments manufacturing or processing food and beverages.', entity_count: 0 },
  { sic_code: '2100', division: 'D', major_group: '21', name: 'Tobacco Products', name_fr: 'Produits du tabac', description: 'Establishments primarily engaged in manufacturing cigarettes, cigars, and other tobacco products.', entity_count: 0 },
  { sic_code: '2200', division: 'D', major_group: '22', name: 'Textile Mill Products', name_fr: 'Produits des moulins textiles', description: 'Establishments primarily engaged in manufacturing yarn, thread, and broad woven fabrics.', entity_count: 0 },
  { sic_code: '2300', division: 'D', major_group: '23', name: 'Apparel and Other Finished Products', name_fr: 'Vêtements et produits finis', description: 'Establishments primarily engaged in manufacturing apparel and accessories from purchased fabric.', entity_count: 0 },
  { sic_code: '2400', division: 'D', major_group: '24', name: 'Lumber and Wood Products', name_fr: 'Bois et produits du bois', description: 'Establishments primarily engaged in cutting timber and in manufacturing lumber and wood products.', entity_count: 0 },
  { sic_code: '2500', division: 'D', major_group: '25', name: 'Furniture and Fixtures', name_fr: 'Meubles et accessoires', description: 'Establishments primarily engaged in manufacturing household and office furniture.', entity_count: 0 },
  { sic_code: '2600', division: 'D', major_group: '26', name: 'Paper and Allied Products', name_fr: 'Papier et produits connexes', description: 'Establishments primarily engaged in the manufacture of pulp, paper, and converted paper products.', entity_count: 0 },
  { sic_code: '2700', division: 'D', major_group: '27', name: 'Printing, Publishing and Allied', name_fr: 'Imprimerie et édition', description: 'Establishments primarily engaged in printing, publishing, and allied industries.', entity_count: 0 },
  { sic_code: '2800', division: 'D', major_group: '28', name: 'Chemicals and Allied Products', name_fr: 'Produits chimiques et connexes', description: 'Establishments primarily engaged in manufacturing industrial chemicals and synthetics.', entity_count: 0 },
  { sic_code: '2900', division: 'D', major_group: '29', name: 'Petroleum Refining and Related', name_fr: 'Raffinage du pétrole', description: 'Establishments primarily engaged in petroleum refining and related industries.', entity_count: 0 },
  { sic_code: '3000', division: 'D', major_group: '30', name: 'Rubber and Miscellaneous Plastic Products', name_fr: 'Caoutchouc et plastiques', description: 'Establishments primarily engaged in manufacturing products from rubber and plastics.', entity_count: 0 },
  { sic_code: '3100', division: 'D', major_group: '31', name: 'Leather and Leather Products', name_fr: 'Cuir et produits en cuir', description: 'Establishments primarily engaged in manufacturing leather and leather products.', entity_count: 0 },
  { sic_code: '3200', division: 'D', major_group: '32', name: 'Stone, Clay, Glass Products', name_fr: 'Pierre, argile et verre', description: 'Establishments primarily engaged in manufacturing flat glass and other glass products.', entity_count: 0 },
  { sic_code: '3300', division: 'D', major_group: '33', name: 'Primary Metal Industries', name_fr: 'Industries métallurgiques de base', description: 'Establishments primarily engaged in smelting and refining ferrous and nonferrous metals.', entity_count: 0 },
  { sic_code: '3400', division: 'D', major_group: '34', name: 'Fabricated Metal Products', name_fr: 'Produits métalliques fabriqués', description: 'Establishments primarily engaged in manufacturing metal cans, hand tools, and hardware.', entity_count: 0 },
  { sic_code: '3500', division: 'D', major_group: '35', name: 'Industrial Machinery and Equipment', name_fr: 'Machines et équipements industriels', description: 'Establishments primarily engaged in manufacturing industrial and commercial machinery.', entity_count: 0 },
  { sic_code: '3559', division: 'D', major_group: '35', name: 'Special Industry Machinery', name_fr: 'Machines industrielles spécialisées', description: 'Establishments primarily engaged in manufacturing special industry machinery.', entity_count: 0 },
  { sic_code: '3600', division: 'D', major_group: '36', name: 'Electronic Equipment', name_fr: 'Équipements électroniques', description: 'Establishments primarily engaged in manufacturing electronic equipment and components.', entity_count: 0 },
  { sic_code: '3674', division: 'D', major_group: '36', name: 'Semiconductors', name_fr: 'Semi-conducteurs', description: 'Establishments primarily engaged in manufacturing semiconductors and related devices.', entity_count: 0 },
  { sic_code: '3700', division: 'D', major_group: '37', name: 'Transportation Equipment', name_fr: "Équipements de transport", description: 'Establishments primarily engaged in manufacturing motor vehicles and transportation equipment.', entity_count: 0 },
  { sic_code: '3711', division: 'D', major_group: '37', name: 'Motor Vehicles and Car Bodies', name_fr: 'Véhicules à moteur', description: 'Establishments primarily engaged in manufacturing motor vehicles and passenger car bodies.', entity_count: 0 },
  { sic_code: '3800', division: 'D', major_group: '38', name: 'Measuring and Controlling Instruments', name_fr: 'Instruments de mesure', description: 'Establishments primarily engaged in measuring and controlling instruments.', entity_count: 0 },
  { sic_code: '3900', division: 'D', major_group: '39', name: 'Miscellaneous Manufacturing', name_fr: 'Fabrication diverse', description: 'Establishments primarily engaged in manufacturing products not classified elsewhere.', entity_count: 0 },
  // Division E — Transportation & Utilities
  { sic_code: '4011', division: 'E', major_group: '40', name: 'Railroads', name_fr: 'Chemins de fer', description: 'Establishments furnishing transportation via rail.', entity_count: 0 },
  { sic_code: '4100', division: 'E', major_group: '41', name: 'Local and Suburban Transit', name_fr: 'Transport en commun local', description: 'Establishments primarily engaged in furnishing local and suburban mass transit.', entity_count: 0 },
  { sic_code: '4200', division: 'E', major_group: '42', name: 'Trucking and Warehousing', name_fr: 'Camionnage et entreposage', description: 'Establishments primarily engaged in furnishing trucking or transfer services.', entity_count: 0 },
  { sic_code: '4400', division: 'E', major_group: '44', name: 'Water Transportation', name_fr: 'Transport par eau', description: 'Establishments primarily engaged in water transportation.', entity_count: 0 },
  { sic_code: '4500', division: 'E', major_group: '45', name: 'Air Transportation', name_fr: 'Transport aérien', description: 'Establishments primarily engaged in furnishing air transportation.', entity_count: 0 },
  { sic_code: '4600', division: 'E', major_group: '46', name: 'Pipelines', name_fr: 'Pipelines', description: 'Establishments primarily engaged in pipeline transportation.', entity_count: 0 },
  { sic_code: '4800', division: 'E', major_group: '48', name: 'Communications', name_fr: 'Communications', description: 'Establishments primarily engaged in furnishing telephone, telegraph, and broadcasting services.', entity_count: 0 },
  { sic_code: '4813', division: 'E', major_group: '48', name: 'Telephone Communications', name_fr: 'Communications téléphoniques', description: 'Establishments primarily engaged in furnishing telephone communications services.', entity_count: 0 },
  { sic_code: '4833', division: 'E', major_group: '48', name: 'Television Broadcasting', name_fr: 'Télédiffusion', description: 'Establishments primarily engaged in broadcasting visual programs.', entity_count: 0 },
  { sic_code: '4899', division: 'E', major_group: '48', name: 'Communications Services, NEC', name_fr: 'Services de communication NCA', description: 'Establishments primarily engaged in furnishing communications services not elsewhere classified.', entity_count: 0 },
  { sic_code: '4911', division: 'E', major_group: '49', name: 'Electric Services', name_fr: 'Services électriques', description: 'Establishments primarily engaged in generating, transmitting, and/or distributing electricity.', entity_count: 29 },
  { sic_code: '4922', division: 'E', major_group: '49', name: 'Natural Gas Distribution', name_fr: 'Distribution de gaz naturel', description: 'Establishments primarily engaged in the distribution of natural gas to consumers.', entity_count: 0 },
  { sic_code: '4941', division: 'E', major_group: '49', name: 'Water Supply', name_fr: "Approvisionnement en eau", description: 'Establishments primarily engaged in distributing water for sale.', entity_count: 0 },
  { sic_code: '4953', division: 'E', major_group: '49', name: 'Refuse Systems', name_fr: 'Systèmes de déchets', description: 'Establishments primarily engaged in the collection and disposal of refuse.', entity_count: 0 },
  // Division F — Wholesale Trade
  { sic_code: '5000', division: 'F', major_group: '50', name: 'Durable Goods — Wholesale', name_fr: 'Biens durables — Gros', description: 'Establishments primarily engaged in the wholesale trade of durable goods.', entity_count: 0 },
  { sic_code: '5100', division: 'F', major_group: '51', name: 'Nondurable Goods — Wholesale', name_fr: 'Biens non durables — Gros', description: 'Establishments primarily engaged in the wholesale trade of nondurable goods.', entity_count: 0 },
  // Division G — Retail Trade
  { sic_code: '5200', division: 'G', major_group: '52', name: 'Building Materials and Garden Supplies', name_fr: 'Matériaux de construction', description: 'Establishments primarily engaged in the retail sale of building materials and garden supplies.', entity_count: 0 },
  { sic_code: '5311', division: 'G', major_group: '53', name: 'Department Stores', name_fr: 'Grands magasins', description: 'Establishments primarily engaged in retailing a wide variety of merchandise.', entity_count: 0 },
  { sic_code: '5411', division: 'G', major_group: '54', name: 'Grocery Stores', name_fr: 'Épiceries', description: 'Retail stores selling general lines of food products for home preparation.', entity_count: 38 },
  { sic_code: '5500', division: 'G', major_group: '55', name: 'Automotive Dealers and Service Stations', name_fr: 'Concessionnaires automobiles', description: 'Establishments primarily engaged in retailing automotive vehicles and parts.', entity_count: 0 },
  { sic_code: '5600', division: 'G', major_group: '56', name: 'Apparel and Accessory Stores', name_fr: 'Magasins de vêtements', description: 'Establishments primarily engaged in retailing new clothing and accessories.', entity_count: 0 },
  { sic_code: '5700', division: 'G', major_group: '57', name: 'Furniture and Home Furnishings Stores', name_fr: 'Magasins de meubles', description: 'Establishments primarily engaged in retailing home furniture and furnishings.', entity_count: 0 },
  { sic_code: '5800', division: 'G', major_group: '58', name: 'Eating and Drinking Places', name_fr: 'Restaurants et bars', description: 'Establishments primarily engaged in providing food and drink for immediate consumption.', entity_count: 0 },
  { sic_code: '5900', division: 'G', major_group: '59', name: 'Miscellaneous Retail', name_fr: 'Commerce de détail divers', description: 'Establishments primarily engaged in retail trade not elsewhere classified.', entity_count: 0 },
  // Division H — Finance, Insurance, Real Estate
  { sic_code: '6020', division: 'H', major_group: '60', name: 'Mutual Savings Banks', name_fr: "Caisses d'épargne mutuelles", description: 'Savings banks organized on a mutual basis accepting deposits and making loans.', entity_count: 0 },
  { sic_code: '6021', division: 'H', major_group: '60', name: 'National Commercial Banks', name_fr: 'Banques commerciales nationales', description: 'Commercial banks chartered by the federal government providing banking services.', entity_count: 0 },
  { sic_code: '6022', division: 'H', major_group: '60', name: 'State Commercial Banks', name_fr: "Banques commerciales d'État", description: 'Commercial banks chartered by state governments, providing retail and corporate banking services.', entity_count: 47 },
  { sic_code: '6035', division: 'H', major_group: '60', name: 'Savings Institutions, Federally Chartered', name_fr: "Institutions d'épargne", description: 'Savings institutions chartered by the federal government.', entity_count: 0 },
  { sic_code: '6099', division: 'H', major_group: '60', name: 'Functions Related to Depository Banking', name_fr: 'Fonctions bancaires connexes', description: 'Establishments primarily engaged in functions related to depository banking.', entity_count: 0 },
  { sic_code: '6141', division: 'H', major_group: '61', name: 'Personal Credit Institutions', name_fr: 'Institutions de crédit personnel', description: 'Establishments primarily engaged in making consumer loans.', entity_count: 0 },
  { sic_code: '6153', division: 'H', major_group: '61', name: 'Short-Term Business Credit Institutions', name_fr: 'Crédit commercial à court terme', description: 'Establishments primarily engaged in making commercial and industrial loans.', entity_count: 0 },
  { sic_code: '6159', division: 'H', major_group: '61', name: 'Federal-Sponsored Credit Agencies', name_fr: 'Agences de crédit fédérales', description: 'Federally sponsored credit agencies providing mortgage and agricultural loans.', entity_count: 0 },
  { sic_code: '6200', division: 'H', major_group: '62', name: 'Security and Commodity Brokers', name_fr: 'Courtiers en valeurs mobilières', description: 'Establishments primarily engaged in the purchase, sale, and brokerage of securities.', entity_count: 0 },
  { sic_code: '6211', division: 'H', major_group: '62', name: 'Security Brokers, Dealers, and Flotation', name_fr: 'Courtiers en valeurs mobilières', description: 'Establishments primarily engaged in dealing in securities.', entity_count: 0 },
  { sic_code: '6282', division: 'H', major_group: '62', name: 'Investment Advice', name_fr: 'Conseils en investissement', description: 'Establishments primarily engaged in furnishing investment advice.', entity_count: 0 },
  { sic_code: '6311', division: 'H', major_group: '63', name: 'Life Insurance', name_fr: "Assurance vie", description: 'Establishments primarily engaged in underwriting life insurance.', entity_count: 0 },
  { sic_code: '6321', division: 'H', major_group: '63', name: 'Accident and Health Insurance', name_fr: 'Assurance accidents et maladie', description: 'Establishments primarily engaged in underwriting accident and health insurance.', entity_count: 0 },
  { sic_code: '6331', division: 'H', major_group: '63', name: 'Fire, Marine and Casualty Insurance', name_fr: 'Assurance incendie et responsabilité', description: 'Establishments primarily engaged in underwriting fire, marine, and casualty insurance.', entity_count: 0 },
  { sic_code: '6411', division: 'H', major_group: '64', name: 'Insurance Agents, Brokers and Service', name_fr: 'Agents et courtiers en assurances', description: 'Establishments primarily engaged in acting as agents and brokers for insurance.', entity_count: 0 },
  { sic_code: '6500', division: 'H', major_group: '65', name: 'Real Estate', name_fr: 'Immobilier', description: 'Establishments primarily engaged in owning, leasing, renting real estate.', entity_count: 0 },
  { sic_code: '6512', division: 'H', major_group: '65', name: 'Operators of Nonresidential Buildings', name_fr: "Exploitants d'immeubles non résidentiels", description: 'Establishments primarily engaged in the operation of nonresidential buildings.', entity_count: 0 },
  { sic_code: '6552', division: 'H', major_group: '65', name: 'Land Subdividers and Developers', name_fr: 'Promoteurs immobiliers', description: 'Establishments primarily engaged in subdividing real property.', entity_count: 0 },
  { sic_code: '6726', division: 'H', major_group: '67', name: 'Investment Offices, NEC', name_fr: "Bureaux d'investissement NCA", description: 'Establishments primarily engaged in investment activities not elsewhere classified.', entity_count: 0 },
  // Division I — Services
  { sic_code: '7011', division: 'I', major_group: '70', name: 'Hotels and Motels', name_fr: 'Hôtels et motels', description: 'Establishments primarily engaged in providing lodging accommodations.', entity_count: 0 },
  { sic_code: '7200', division: 'I', major_group: '72', name: 'Personal Services', name_fr: 'Services personnels', description: 'Establishments primarily engaged in providing personal services.', entity_count: 0 },
  { sic_code: '7311', division: 'I', major_group: '73', name: 'Advertising Services', name_fr: 'Services publicitaires', description: 'Establishments primarily engaged in preparing advertising for others.', entity_count: 0 },
  { sic_code: '7361', division: 'I', major_group: '73', name: 'Help Supply Services', name_fr: 'Services de placement', description: 'Establishments primarily engaged in supplying temporary or permanent help.', entity_count: 0 },
  { sic_code: '7372', division: 'I', major_group: '73', name: 'Prepackaged Software', name_fr: 'Logiciels préemballés', description: 'Establishments primarily engaged in prepackaged software, SaaS, and cloud platform services.', entity_count: 112 },
  { sic_code: '7374', division: 'I', major_group: '73', name: 'Computer Processing and Data Preparation', name_fr: 'Traitement informatique', description: 'Establishments primarily engaged in providing computer processing and data preparation services.', entity_count: 0 },
  { sic_code: '7389', division: 'I', major_group: '73', name: 'Services to Buildings and Dwellings', name_fr: 'Services aux bâtiments', description: 'Establishments primarily engaged in furnishing services to buildings and dwellings.', entity_count: 0 },
  { sic_code: '7500', division: 'I', major_group: '75', name: 'Auto Repair, Services and Parking', name_fr: 'Réparation automobile', description: 'Establishments primarily engaged in auto repair, services, and parking.', entity_count: 0 },
  { sic_code: '7600', division: 'I', major_group: '76', name: 'Miscellaneous Repair Services', name_fr: 'Services de réparation divers', description: 'Establishments primarily engaged in miscellaneous repair services.', entity_count: 0 },
  { sic_code: '7812', division: 'I', major_group: '78', name: 'Motion Picture Production', name_fr: 'Production cinématographique', description: 'Establishments primarily engaged in the production of motion pictures.', entity_count: 0 },
  { sic_code: '7929', division: 'I', major_group: '79', name: 'Bands, Orchestras, Actors and Entertainers', name_fr: 'Artistes et spectacles', description: 'Establishments primarily engaged in providing entertainment.', entity_count: 0 },
  { sic_code: '7941', division: 'I', major_group: '79', name: 'Professional Sports Clubs', name_fr: 'Clubs sportifs professionnels', description: 'Establishments primarily engaged in operating professional sports clubs.', entity_count: 0 },
  { sic_code: '8000', division: 'I', major_group: '80', name: 'Health Services', name_fr: 'Services de santé', description: 'Establishments primarily engaged in furnishing medical, surgical, and health-related services.', entity_count: 0 },
  { sic_code: '8011', division: 'I', major_group: '80', name: 'Offices and Clinics of Medical Doctors', name_fr: 'Cabinets médicaux', description: 'Establishments of licensed practitioners of medicine.', entity_count: 0 },
  { sic_code: '8049', division: 'I', major_group: '80', name: 'Offices and Clinics of Other Health Practitioners', name_fr: 'Cliniques de santé', description: 'Establishments of health practitioners other than physicians and dentists.', entity_count: 0 },
  { sic_code: '8062', division: 'I', major_group: '80', name: 'Hospitals', name_fr: 'Hôpitaux', description: 'Establishments primarily engaged in providing medical, diagnostic, and treatment services.', entity_count: 84 },
  { sic_code: '8093', division: 'I', major_group: '80', name: 'Specialty Outpatient Facilities', name_fr: 'Établissements ambulatoires spécialisés', description: 'Establishments primarily engaged in providing outpatient care not elsewhere classified.', entity_count: 0 },
  { sic_code: '8099', division: 'I', major_group: '80', name: 'Health Services, NEC', name_fr: 'Services de santé NCA', description: 'Establishments primarily engaged in providing health services not elsewhere classified.', entity_count: 0 },
  { sic_code: '8111', division: 'I', major_group: '81', name: 'Legal Services', name_fr: 'Services juridiques', description: 'Offices and clinics of lawyers engaged in providing legal services.', entity_count: 0 },
  { sic_code: '8200', division: 'I', major_group: '82', name: 'Educational Services', name_fr: "Services d'éducation", description: 'Establishments primarily engaged in furnishing academic or vocational instruction.', entity_count: 0 },
  { sic_code: '8211', division: 'I', major_group: '82', name: 'Elementary and Secondary Schools', name_fr: 'Écoles primaires et secondaires', description: 'Establishments primarily engaged in furnishing academic instruction.', entity_count: 0 },
  { sic_code: '8221', division: 'I', major_group: '82', name: 'Colleges, Universities and Professional Schools', name_fr: 'Universités et écoles professionnelles', description: 'Establishments primarily engaged in furnishing academic courses leading to degrees.', entity_count: 0 },
  { sic_code: '8300', division: 'I', major_group: '83', name: 'Social Services', name_fr: 'Services sociaux', description: 'Establishments primarily engaged in providing social services.', entity_count: 0 },
  { sic_code: '8322', division: 'I', major_group: '83', name: 'Individual and Family Social Services', name_fr: 'Services sociaux individuels et familiaux', description: 'Establishments primarily engaged in providing individual and family social services.', entity_count: 0 },
  { sic_code: '8399', division: 'I', major_group: '83', name: 'Social Services, NEC', name_fr: 'Services sociaux NCA', description: 'Establishments primarily engaged in social services not elsewhere classified.', entity_count: 0 },
  { sic_code: '8600', division: 'I', major_group: '86', name: 'Membership Organizations', name_fr: "Organisations d'adhérents", description: 'Establishments primarily engaged in promoting the interests of their members.', entity_count: 0 },
  { sic_code: '8641', division: 'I', major_group: '86', name: 'Civic, Social and Fraternal Associations', name_fr: 'Associations civiques et fraternelles', description: 'Establishments primarily engaged in civic, social, and fraternal associations.', entity_count: 0 },
  { sic_code: '8661', division: 'I', major_group: '86', name: 'Religious Organizations', name_fr: 'Organisations religieuses', description: 'Establishments primarily engaged in operating religious organizations.', entity_count: 0 },
  { sic_code: '8700', division: 'I', major_group: '87', name: 'Engineering and Management Services', name_fr: 'Services techniques et de gestion', description: 'Establishments primarily engaged in providing engineering and management services.', entity_count: 0 },
  { sic_code: '8711', division: 'I', major_group: '87', name: 'Engineering Services', name_fr: 'Services techniques', description: 'Establishments primarily engaged in providing engineering services.', entity_count: 0 },
  { sic_code: '8721', division: 'I', major_group: '87', name: 'Accounting, Auditing and Bookkeeping', name_fr: 'Comptabilité et audit', description: 'Establishments primarily engaged in furnishing accounting, auditing, and bookkeeping services.', entity_count: 0 },
  { sic_code: '8731', division: 'I', major_group: '87', name: 'Commercial Physical and Biological Research', name_fr: 'Recherche commerciale', description: 'Establishments primarily engaged in commercial physical and biological research.', entity_count: 0 },
  { sic_code: '8742', division: 'I', major_group: '87', name: 'Management Consulting Services', name_fr: 'Services de conseil en gestion', description: 'Establishments primarily engaged in management consulting services.', entity_count: 0 },
  // Division J — Public Administration
  { sic_code: '9100', division: 'J', major_group: '91', name: 'Executive, Legislative and General Government', name_fr: 'Administration publique', description: 'Government establishments at the federal, state, and local level.', entity_count: 0 },
  { sic_code: '9199', division: 'J', major_group: '91', name: 'General Government, NEC', name_fr: 'Administration publique NCA', description: 'General government establishments not elsewhere classified.', entity_count: 0 },
  { sic_code: '9200', division: 'J', major_group: '92', name: 'Justice, Public Order and Safety', name_fr: 'Justice et sécurité publique', description: 'Establishments primarily engaged in providing justice, public order, and safety.', entity_count: 0 },
  { sic_code: '9223', division: 'J', major_group: '92', name: 'Correctional Institutions', name_fr: 'Établissements correctionnels', description: 'Establishments primarily engaged in operating correctional institutions.', entity_count: 0 },
  { sic_code: '9300', division: 'J', major_group: '93', name: 'Finance, Taxation and Monetary Policy', name_fr: 'Finances et politique monétaire', description: 'Government establishments engaged in finance, taxation, and monetary policy.', entity_count: 0 },
  { sic_code: '9400', division: 'J', major_group: '94', name: 'Administration of Human Resource Programs', name_fr: 'Administration des ressources humaines', description: 'Government establishments administering human resource programs.', entity_count: 0 },
  { sic_code: '9500', division: 'J', major_group: '95', name: 'Environmental Quality and Housing', name_fr: "Qualité de l'environnement", description: 'Government establishments administering environmental quality programs.', entity_count: 0 },
  { sic_code: '9600', division: 'J', major_group: '96', name: 'Administration of Economic Programs', name_fr: 'Administration des programmes économiques', description: 'Government establishments administering economic programs.', entity_count: 0 },
  { sic_code: '9700', division: 'J', major_group: '97', name: 'National Security and International Affairs', name_fr: 'Sécurité nationale', description: 'Government establishments engaged in national security and international affairs.', entity_count: 0 },
  { sic_code: '9999', division: 'Z', major_group: '99', name: 'Nonclassifiable Establishments', name_fr: 'Établissements non classifiés', description: 'Establishments not classifiable according to standard SIC codes.', entity_count: 0 },
];

const ORGANIZATIONS = [
  // SIC 6022 – State Commercial Banks
  { sic_code: '6022', name: 'First National Bank Corp', type: 'Public', ticker: 'FNBC', state: 'IL', city: 'Chicago', credit_rating: 'BBB+', credit_outlook: 'Stable', credit_agency: 'S&P', description: 'A state-chartered commercial bank providing retail and corporate banking, wealth management, and treasury services across the Midwest.', employee_count: 8400 },
  { sic_code: '6022', name: 'State Heritage Financial', type: 'Public', ticker: 'SHFI', state: 'OH', city: 'Columbus', description: 'Full-service commercial bank serving business and consumer markets in Ohio and surrounding states.', employee_count: 5200 },
  { sic_code: '6022', name: 'Pacific Commerce Bank', type: 'Public', ticker: 'PCBK', state: 'CA', city: 'Los Angeles', description: 'Commercial bank focused on real estate and business lending across the Western United States.', employee_count: 3800 },
  { sic_code: '6022', name: 'Midwest Community Bank', type: 'Private', state: 'MO', city: 'Kansas City', description: 'Community-focused commercial bank serving small and mid-size businesses in the Midwest.', employee_count: 1200 },
  { sic_code: '6022', name: 'Lakeside Credit Union', type: 'NGO', state: 'WI', city: 'Milwaukee', description: 'Member-owned credit union providing financial services to community members in Wisconsin.', employee_count: 680 },
  { sic_code: '6022', name: 'Great Plains Savings', type: 'Private', state: 'NE', city: 'Omaha', description: 'Regional savings bank focused on residential mortgages and consumer lending.', employee_count: 540 },
  { sic_code: '6022', name: 'City of Chicago Treasury Division', type: 'Municipal', state: 'IL', city: 'Chicago', description: 'Municipal treasury operations managing city funds and bond issuances for the City of Chicago.', employee_count: 220 },
  { sic_code: '6022', name: 'Northeast Bancorp', type: 'Public', ticker: 'NEBC', state: 'NY', city: 'New York', description: 'Diversified financial services company with commercial banking, wealth management and insurance.', employee_count: 920 },
  // SIC 7372 – Prepackaged Software
  { sic_code: '7372', name: 'Apex Software Solutions', type: 'Public', ticker: 'APXS', state: 'CA', city: 'San Francisco', description: 'Enterprise cloud software provider for ERP, CRM, and analytics.', employee_count: 18000 },
  { sic_code: '7372', name: 'CloudStack Inc.', type: 'Public', ticker: 'CLSK', state: 'WA', city: 'Seattle', description: 'Cloud infrastructure and developer tooling platform.', employee_count: 9400 },
  { sic_code: '7372', name: 'DataPath Corp.', type: 'Public', ticker: 'DPC', state: 'TX', city: 'Austin', description: 'Data integration, pipeline and analytics SaaS platform.', employee_count: 5600 },
  { sic_code: '7372', name: 'Optima Dev Group', type: 'Private', state: 'NY', city: 'New York', description: 'Custom enterprise software development and managed services.', employee_count: 2200 },
  { sic_code: '7372', name: 'FinTech Systems Ltd', type: 'Private', state: 'IL', city: 'Chicago', description: 'Regulatory reporting and compliance automation software for banks and funds.', employee_count: 840 },
  { sic_code: '7372', name: 'Open Source Foundation', type: 'NGO', state: 'CA', city: 'San Francisco', description: 'Non-profit supporting open source software development and standards.', employee_count: 120 },
  // SIC 5411 – Grocery Stores
  { sic_code: '5411', name: 'FreshMart Corp.', type: 'Public', ticker: 'FMC', state: 'OR', city: 'Portland', description: 'National grocery retailer operating over 800 stores across the US.', employee_count: 92000 },
  { sic_code: '5411', name: 'National Grocer Inc.', type: 'Public', ticker: 'NGRC', state: 'MN', city: 'Minneapolis', description: 'Supermarket chain operating in Midwest and Northeast regions.', employee_count: 68000 },
  { sic_code: '5411', name: 'Summit Foods Co-op', type: 'NGO', state: 'VT', city: 'Burlington', description: 'Consumer-owned natural foods cooperative with locations across New England.', employee_count: 4200 },
  { sic_code: '5411', name: 'Cornucopia Markets', type: 'Private', state: 'NC', city: 'Charlotte', description: 'Regional upscale grocery chain serving the Carolinas and Virginia.', employee_count: 6800 },
  { sic_code: '5411', name: 'City of Toronto Food Services', type: 'Municipal', city: 'Toronto', description: 'Municipal food services division managing public cafeterias and community markets.', employee_count: 1100 },
  // SIC 4911 – Electric Services
  { sic_code: '4911', name: 'TriState Power Corp.', type: 'Public', ticker: 'TSPC', state: 'OH', city: 'Cincinnati', description: 'Regulated electric utility serving customers in Ohio, Indiana and Kentucky.', employee_count: 14200 },
  { sic_code: '4911', name: 'Pacific Grid Holdings', type: 'Public', ticker: 'PGH', state: 'CA', city: 'San Diego', description: 'Electric and natural gas utility serving Southern California.', employee_count: 9800 },
  { sic_code: '4911', name: 'Midwest Energy Authority', type: 'Municipal', state: 'IL', city: 'Springfield', description: 'Public power authority providing electricity to municipalities across the Midwest.', employee_count: 3200 },
  { sic_code: '4911', name: 'Sunbelt Electric Co.', type: 'Public', ticker: 'SBEC', state: 'TX', city: 'Dallas', description: 'Investor-owned electric utility operating in Texas deregulated market.', employee_count: 4600 },
  { sic_code: '4911', name: 'GreenGrid Cooperative', type: 'NGO', state: 'CO', city: 'Denver', description: 'Electric cooperative serving rural communities across the Rocky Mountain region.', employee_count: 1400 },
  // SIC 8062 – Hospitals
  { sic_code: '8062', name: 'Metro Health System', type: 'NGO', state: 'PA', city: 'Philadelphia', description: 'Non-profit health system operating 12 hospitals and 80+ outpatient facilities.', employee_count: 28000 },
  { sic_code: '8062', name: 'Sunrise Medical Center', type: 'Public', ticker: 'SRMC', state: 'FL', city: 'Miami', description: 'For-profit hospital network operating acute care facilities across Florida.', employee_count: 14200 },
  { sic_code: '8062', name: 'Providence Community Hospital', type: 'NGO', state: 'MA', city: 'Boston', description: 'Faith-based non-profit community hospital system serving Eastern Massachusetts.', employee_count: 8400 },
  { sic_code: '8062', name: 'Veterans Medical Group', type: 'Municipal', state: 'VA', city: 'Richmond', description: 'Government-operated medical facilities serving veterans across the Mid-Atlantic region.', employee_count: 6200 },
  { sic_code: '8062', name: 'Westside Clinic Network', type: 'Private', state: 'CA', city: 'Los Angeles', description: 'Privately held outpatient clinic network serving greater Los Angeles.', employee_count: 2100 },

  // ── Petroleum ─────────────────────────────────────────────────────────────
  { sic_code: '1311', name: 'Basin Exploration Corp.', type: 'Public', ticker: 'BEC', state: 'TX', city: 'Houston', description: 'Independent oil and gas exploration company focused on the Permian Basin.', employee_count: 4200 },
  { sic_code: '1311', name: 'Northern Energy Resources', type: 'Public', ticker: 'NER', state: 'ND', city: 'Bismarck', description: 'Oil and gas producer operating across the Bakken and Williston Basin formations.', employee_count: 1800 },
  { sic_code: '1311', name: 'Coastal Petroleum LLC', type: 'Private', state: 'LA', city: 'New Orleans', description: 'Privately held upstream oil and gas company with offshore Gulf Coast operations.', employee_count: 920 },
  // ── Semiconductors ────────────────────────────────────────────────────────
  { sic_code: '3674', name: 'Apex Semiconductor Corp.', type: 'Public', ticker: 'APXC', state: 'CA', city: 'Santa Clara', description: 'Designer and manufacturer of advanced logic and memory semiconductor devices.', employee_count: 24000 },
  { sic_code: '3674', name: 'NovaSilicon Inc.', type: 'Public', ticker: 'NVSI', state: 'CA', city: 'San Jose', description: 'Fabless semiconductor company specializing in AI accelerator chips.', employee_count: 8400 },
  { sic_code: '3674', name: 'MicroChip Dynamics', type: 'Private', state: 'MA', city: 'Boston', description: 'Developer of custom ASICs for defense and aerospace applications.', employee_count: 1600 },
  // ── Motor Vehicles ────────────────────────────────────────────────────────
  { sic_code: '3711', name: 'Heartland Auto Group', type: 'Public', ticker: 'HAG', state: 'MI', city: 'Detroit', description: 'Manufacturer of pickup trucks and commercial vehicles serving North American markets.', employee_count: 38000 },
  { sic_code: '3711', name: 'EV Dynamics Corp.', type: 'Public', ticker: 'EVDC', state: 'CA', city: 'Fremont', description: 'Electric vehicle manufacturer producing passenger cars and light commercial vehicles.', employee_count: 14000 },
  { sic_code: '3711', name: 'Lakewood Motor Works', type: 'Private', state: 'OH', city: 'Cleveland', description: 'Specialty vehicle manufacturer producing armored and custom fleet vehicles.', employee_count: 2200 },
  // ── Telecommunications ───────────────────────────────────────────────────
  { sic_code: '4813', name: 'Continental Telecom Corp.', type: 'Public', ticker: 'CTC', state: 'TX', city: 'Dallas', description: 'National telecommunications provider offering wireless, broadband, and enterprise services.', employee_count: 86000 },
  { sic_code: '4813', name: 'Regional Fiber Networks', type: 'Public', ticker: 'RFN', state: 'GA', city: 'Atlanta', description: 'Fiber-optic broadband provider serving residential and business customers in the Southeast.', employee_count: 9400 },
  { sic_code: '4813', name: 'Metro Wireless Inc.', type: 'Private', state: 'NY', city: 'New York', description: 'Regional wireless carrier providing mobile services in the Northeast corridor.', employee_count: 3200 },
  // ── Natural Gas ───────────────────────────────────────────────────────────
  { sic_code: '4922', name: 'Southern Gas Distribution', type: 'Public', ticker: 'SGD', state: 'GA', city: 'Atlanta', description: 'Natural gas distribution utility serving residential and commercial customers across the Southeast.', employee_count: 6400 },
  { sic_code: '4922', name: 'Great Lakes Gas Co.', type: 'Public', ticker: 'GLG', state: 'OH', city: 'Columbus', description: 'Regulated natural gas distribution company serving over 1.2 million customers in Ohio and Michigan.', employee_count: 4800 },
  { sic_code: '4922', name: 'Prairie Energy Corp.', type: 'Municipal', state: 'KS', city: 'Wichita', description: 'Municipal gas utility providing natural gas distribution to communities across Kansas.', employee_count: 1200 },
  // ── Life Insurance ────────────────────────────────────────────────────────
  { sic_code: '6311', name: 'Continental Life Group', type: 'Public', ticker: 'CLG', state: 'CT', city: 'Hartford', description: 'Life insurance and annuity products provider serving individual and group markets nationwide.', employee_count: 14200 },
  { sic_code: '6311', name: 'Mutual Assurance Corp.', type: 'NGO', state: 'MA', city: 'Boston', description: 'Mutual life insurance company providing whole life, term, and disability income products.', employee_count: 8600 },
  { sic_code: '6311', name: 'Pacific Life Partners', type: 'Public', ticker: 'PLP', state: 'CA', city: 'Los Angeles', description: 'Life insurance holding company with operations in life, health, and retirement segments.', employee_count: 6200 },
  // ── Property & Casualty Insurance ─────────────────────────────────────────
  { sic_code: '6331', name: 'National Property Group', type: 'Public', ticker: 'NPG', state: 'IL', city: 'Chicago', description: 'Leading provider of property and casualty insurance for personal and commercial lines.', employee_count: 22000 },
  { sic_code: '6331', name: 'Coastline Casualty Inc.', type: 'Public', ticker: 'CCI', state: 'FL', city: 'Tampa', description: 'Specialty insurer focused on coastal property, marine, and catastrophe risk.', employee_count: 4200 },
  { sic_code: '6331', name: 'Farmers Mutual Insurance', type: 'NGO', state: 'IA', city: 'Des Moines', description: 'Mutual insurer providing farm, rural property, and agri-business insurance products.', employee_count: 3100 },
  // ── Real Estate ───────────────────────────────────────────────────────────
  { sic_code: '6512', name: 'Meridian Commercial REIT', type: 'Public', ticker: 'MCR', state: 'NY', city: 'New York', description: 'Real estate investment trust owning and operating office, retail, and industrial properties.', employee_count: 1800 },
  { sic_code: '6512', name: 'Sunstone Properties LLC', type: 'Private', state: 'AZ', city: 'Phoenix', description: 'Owner and operator of Class A office and mixed-use commercial real estate in the Sun Belt.', employee_count: 620 },
  { sic_code: '6512', name: 'Urban Core Developments', type: 'Private', state: 'CA', city: 'San Francisco', description: 'Developer and manager of urban commercial and mixed-use real estate assets.', employee_count: 840 },
  // ── Security Brokers ──────────────────────────────────────────────────────
  { sic_code: '6211', name: 'Atlantic Capital Markets', type: 'Public', ticker: 'ACM', state: 'NY', city: 'New York', description: 'Full-service investment bank providing equity, debt, and M&A advisory services.', employee_count: 8400 },
  { sic_code: '6211', name: 'Westcoast Securities Group', type: 'Public', ticker: 'WSG', state: 'CA', city: 'San Francisco', description: 'Regional broker-dealer providing institutional and retail brokerage services.', employee_count: 3200 },
  { sic_code: '6211', name: 'Pinnacle Wealth Management', type: 'Private', state: 'IL', city: 'Chicago', description: 'Independent registered investment advisor managing private client portfolios.', employee_count: 420 },
  // ── Hotels ────────────────────────────────────────────────────────────────
  { sic_code: '7011', name: 'Summit Hospitality Group', type: 'Public', ticker: 'SHG', state: 'TN', city: 'Nashville', description: 'Owner and operator of full-service hotels and resorts across North America.', employee_count: 28000 },
  { sic_code: '7011', name: 'Coastal Inn Corp.', type: 'Public', ticker: 'CIC', state: 'FL', city: 'Miami', description: 'Hotel management company operating select-service and extended-stay properties.', employee_count: 12000 },
  { sic_code: '7011', name: 'Boutique Hotels Alliance', type: 'Private', state: 'NY', city: 'New York', description: 'Collection of independently owned boutique hotels in major urban destinations.', employee_count: 4200 },
  // ── Advertising ───────────────────────────────────────────────────────────
  { sic_code: '7311', name: 'Global Media Partners', type: 'Public', ticker: 'GMP', state: 'NY', city: 'New York', description: 'Integrated advertising and communications agency providing creative, media, and digital services.', employee_count: 14000 },
  { sic_code: '7311', name: 'Digital Reach Agency', type: 'Private', state: 'CA', city: 'Los Angeles', description: 'Performance-driven digital marketing agency specializing in programmatic and search advertising.', employee_count: 2400 },
  // ── Legal Services ────────────────────────────────────────────────────────
  { sic_code: '8111', name: 'Harrington & Associates LLP', type: 'Private', state: 'NY', city: 'New York', description: 'Full-service law firm providing corporate, litigation, and regulatory legal services.', employee_count: 1800 },
  { sic_code: '8111', name: 'Pacific Law Group', type: 'Private', state: 'CA', city: 'San Francisco', description: 'Regional law firm specializing in technology, IP, and venture capital transactions.', employee_count: 420 },
  { sic_code: '8111', name: 'Midstates Legal Foundation', type: 'NGO', state: 'IL', city: 'Chicago', description: 'Non-profit legal services organization providing pro bono representation.', employee_count: 280 },
  // ── Universities ──────────────────────────────────────────────────────────
  { sic_code: '8221', name: 'Lakewood University', type: 'NGO', state: 'OH', city: 'Cleveland', description: 'Private research university offering undergraduate, graduate, and professional programs.', employee_count: 8400 },
  { sic_code: '8221', name: 'State University of the Midwest', type: 'Municipal', state: 'IN', city: 'Indianapolis', description: 'Public research university serving over 42,000 students across multiple campuses.', employee_count: 12000 },
  // ── Engineering Services ──────────────────────────────────────────────────
  { sic_code: '8711', name: 'Apex Engineering Group', type: 'Public', ticker: 'AEG', state: 'TX', city: 'Houston', description: 'Engineering and construction services firm serving energy, infrastructure, and industrial sectors.', employee_count: 18000 },
  { sic_code: '8711', name: 'Pacific Infrastructure Partners', type: 'Private', state: 'CA', city: 'San Francisco', description: 'Civil and environmental engineering firm specializing in transportation infrastructure.', employee_count: 3400 },
  // ── Management Consulting ─────────────────────────────────────────────────
  { sic_code: '8742', name: 'Meridian Strategy Group', type: 'Private', state: 'NY', city: 'New York', description: 'Management consulting firm providing strategy, operations, and transformation services.', employee_count: 4200 },
  { sic_code: '8742', name: 'Pacific Advisory Partners', type: 'Private', state: 'CA', city: 'San Francisco', description: 'Technology and digital strategy consulting firm serving Fortune 500 clients.', employee_count: 1800 },
  // ── Airlines ──────────────────────────────────────────────────────────────
  { sic_code: '4500', name: 'Continental Airways Corp.', type: 'Public', ticker: 'CAC', state: 'TX', city: 'Dallas', description: 'Major US network carrier operating domestic and international passenger and cargo flights.', employee_count: 62000 },
  { sic_code: '4500', name: 'Sunbird Regional Airlines', type: 'Public', ticker: 'SRA', state: 'FL', city: 'Orlando', description: 'Regional airline providing passenger services across the Southeast and Caribbean.', employee_count: 8400 },
  // ── Research ──────────────────────────────────────────────────────────────
  { sic_code: '8731', name: 'BioNorth Research Corp.', type: 'Public', ticker: 'BNRC', state: 'MA', city: 'Cambridge', description: 'Commercial biopharmaceutical research organization focused on oncology and rare diseases.', employee_count: 6400 },
  { sic_code: '8731', name: 'National Science Institute', type: 'NGO', state: 'DC', city: 'Washington', description: 'Non-profit research institute conducting federally funded basic and applied science research.', employee_count: 3200 },
  // ── Trucking ──────────────────────────────────────────────────────────────
  { sic_code: '4200', name: 'TransAmerica Freight Corp.', type: 'Public', ticker: 'TAFC', state: 'TN', city: 'Memphis', description: 'National full-truckload and LTL carrier serving retail, manufacturing, and distribution clients.', employee_count: 28000 },
  { sic_code: '4200', name: 'Midwest Logistics Group', type: 'Private', state: 'OH', city: 'Columbus', description: 'Regional trucking and warehousing company serving the Great Lakes manufacturing corridor.', employee_count: 4800 },
  // ── Chemicals ─────────────────────────────────────────────────────────────
  { sic_code: '2800', name: 'National Chemical Corp.', type: 'Public', ticker: 'NCC', state: 'TX', city: 'Houston', description: 'Diversified chemical manufacturer producing industrial chemicals, polymers, and specialty materials.', employee_count: 24000 },
  { sic_code: '2800', name: 'Great Lakes Specialty Chemicals', type: 'Public', ticker: 'GLSC', state: 'OH', city: 'Akron', description: 'Producer of specialty chemicals and performance materials for automotive and industrial markets.', employee_count: 8400 },
  // ── Food Manufacturing ────────────────────────────────────────────────────
  { sic_code: '2000', name: 'Heartland Food Industries', type: 'Public', ticker: 'HFI', state: 'IL', city: 'Chicago', description: 'Diversified food manufacturer producing packaged goods across snack, beverage, and dairy categories.', employee_count: 32000 },
  { sic_code: '2000', name: 'Western Grain Processors', type: 'Public', ticker: 'WGP', state: 'KS', city: 'Wichita', description: 'Grain milling and processing company producing flour, corn products, and animal feed.', employee_count: 8400 },
  // ── Restaurants ───────────────────────────────────────────────────────────
  { sic_code: '5800', name: 'National Restaurant Holdings', type: 'Public', ticker: 'NRH2', state: 'OH', city: 'Columbus', description: 'Operator of quick-service and fast-casual restaurant chains across North America.', employee_count: 84000 },
  { sic_code: '5800', name: 'Coastal Dining Group', type: 'Private', state: 'CA', city: 'San Diego', description: 'Multi-concept casual dining operator with locations in coastal markets.', employee_count: 12000 },
  // ── Railroads ─────────────────────────────────────────────────────────────
  { sic_code: '4011', name: 'TransContinental Rail Corp.', type: 'Public', ticker: 'TCRC', state: 'NE', city: 'Omaha', description: 'Class I railroad operating a transcontinental freight network across the western United States.', employee_count: 42000 },
  { sic_code: '4011', name: 'Eastern Freight Lines', type: 'Public', ticker: 'EFL', state: 'OH', city: 'Cleveland', description: 'Regional freight railroad serving the Midwest and Appalachian manufacturing corridor.', employee_count: 14000 },
];

// ── Financials remain unchanged ────────────────────────────────────────────────
const BASE_FINANCIALS = {
  '6022': { revenue: 1840000000, net_income: 312000000, net_margin: 16.9, roe: 12.4, total_assets: 24600000000, tier1_capital_ratio: 14.2, efficiency_ratio: 54.8, debt_to_equity: 8.9 },
  '7372': { revenue: 2940000000, net_income: 612000000, gross_margin: 72.4, net_margin: 20.8, operating_margin: 24.1, roe: 28.6, roa: 12.1, total_assets: 5060000000, debt_to_equity: 0.4 },
  '5411': { revenue: 28400000000, net_income: 680000000, gross_margin: 28.1, net_margin: 2.4, operating_margin: 3.8, roe: 22.1, roa: 4.8, total_assets: 14200000000, debt_to_equity: 1.8 },
  '4911': { revenue: 8600000000, net_income: 1290000000, gross_margin: 42.8, net_margin: 15.0, operating_margin: 22.4, roe: 10.8, roa: 3.2, total_assets: 40200000000, debt_to_equity: 2.1 },
  '8062': { revenue: 4200000000, net_income: 210000000, gross_margin: 38.2, net_margin: 5.0, operating_margin: 7.8, roe: 8.4, roa: 2.9, total_assets: 7240000000, debt_to_equity: 1.4 },
  '1311': { revenue: 3200000000, net_income: 640000000, gross_margin: 58.2, net_margin: 20.0, operating_margin: 28.4, roe: 16.8, roa: 8.2, total_assets: 7800000000, debt_to_equity: 0.8 },
  '3674': { revenue: 8400000000, net_income: 2100000000, gross_margin: 52.4, net_margin: 25.0, operating_margin: 30.2, roe: 32.4, roa: 18.6, total_assets: 11200000000, debt_to_equity: 0.2 },
  '3711': { revenue: 42000000000, net_income: 2100000000, gross_margin: 14.8, net_margin: 5.0, operating_margin: 6.4, roe: 18.2, roa: 4.8, total_assets: 43800000000, debt_to_equity: 2.4 },
  '4813': { revenue: 18400000000, net_income: 2760000000, gross_margin: 56.2, net_margin: 15.0, operating_margin: 22.8, roe: 22.4, roa: 8.6, total_assets: 32000000000, debt_to_equity: 1.8 },
  '4922': { revenue: 4200000000, net_income: 504000000, gross_margin: 38.4, net_margin: 12.0, operating_margin: 18.2, roe: 9.8, roa: 3.4, total_assets: 14800000000, debt_to_equity: 1.6 },
  '6311': { revenue: 28000000000, net_income: 1400000000, net_margin: 5.0, roe: 12.4, roa: 1.8, total_assets: 78000000000, debt_to_equity: 6.2 },
  '6331': { revenue: 18000000000, net_income: 1440000000, net_margin: 8.0, roe: 14.2, roa: 3.8, total_assets: 38000000000, debt_to_equity: 0.8 },
  '6512': { revenue: 1800000000, net_income: 360000000, gross_margin: 62.4, net_margin: 20.0, operating_margin: 28.4, roe: 8.4, roa: 3.2, total_assets: 11200000000, debt_to_equity: 1.2 },
  '6211': { revenue: 4200000000, net_income: 630000000, gross_margin: 62.4, net_margin: 15.0, operating_margin: 18.4, roe: 18.4, roa: 4.8, total_assets: 13200000000, debt_to_equity: 2.4 },
  '7011': { revenue: 2800000000, net_income: 196000000, gross_margin: 28.4, net_margin: 7.0, operating_margin: 12.4, roe: 14.8, roa: 4.2, total_assets: 4600000000, debt_to_equity: 1.6 },
  '7311': { revenue: 1200000000, net_income: 108000000, gross_margin: 42.4, net_margin: 9.0, operating_margin: 12.8, roe: 22.4, roa: 12.4, total_assets: 880000000, debt_to_equity: 0.4 },
  '8111': { revenue: 480000000, net_income: 86400000, gross_margin: 52.4, net_margin: 18.0, operating_margin: 22.4, roe: 42.4, roa: 18.4, total_assets: 204000000, debt_to_equity: 0.2 },
  '8221': { revenue: 1800000000, net_income: 54000000, gross_margin: 28.4, net_margin: 3.0, operating_margin: 4.8, roe: 4.2, roa: 1.8, total_assets: 3200000000, debt_to_equity: 0.8 },
  '8711': { revenue: 2400000000, net_income: 168000000, gross_margin: 38.4, net_margin: 7.0, operating_margin: 9.8, roe: 18.4, roa: 8.4, total_assets: 1800000000, debt_to_equity: 0.4 },
  '8742': { revenue: 840000000, net_income: 126000000, gross_margin: 48.4, net_margin: 15.0, operating_margin: 18.4, roe: 28.4, roa: 14.4, total_assets: 880000000, debt_to_equity: 0.2 },
  '4500': { revenue: 18000000000, net_income: 900000000, gross_margin: 38.4, net_margin: 5.0, operating_margin: 8.4, roe: 42.4, roa: 4.8, total_assets: 18800000000, debt_to_equity: 2.8 },
  '8731': { revenue: 680000000, net_income: 68000000, gross_margin: 58.4, net_margin: 10.0, operating_margin: 14.4, roe: 12.4, roa: 6.4, total_assets: 1060000000, debt_to_equity: 0.4 },
  '4200': { revenue: 8400000000, net_income: 420000000, gross_margin: 24.4, net_margin: 5.0, operating_margin: 7.8, roe: 14.4, roa: 6.4, total_assets: 6500000000, debt_to_equity: 1.2 },
  '2800': { revenue: 12000000000, net_income: 1080000000, gross_margin: 38.4, net_margin: 9.0, operating_margin: 12.4, roe: 18.4, roa: 8.4, total_assets: 13000000000, debt_to_equity: 0.6 },
  '2000': { revenue: 9800000000, net_income: 588000000, gross_margin: 32.4, net_margin: 6.0, operating_margin: 8.4, roe: 16.4, roa: 6.8, total_assets: 8600000000, debt_to_equity: 0.8 },
  '5800': { revenue: 4200000000, net_income: 168000000, gross_margin: 62.4, net_margin: 4.0, operating_margin: 6.4, roe: 28.4, roa: 8.4, total_assets: 2000000000, debt_to_equity: 1.2 },
  '4011': { revenue: 12000000000, net_income: 2400000000, gross_margin: 52.4, net_margin: 20.0, operating_margin: 28.4, roe: 18.4, roa: 8.4, total_assets: 28000000000, debt_to_equity: 1.2 },
};

async function run(db) {
  // SIC codes — upsert all
  for (const sic of SIC_CODES) {
    const exists = await db('sic_codes').where('sic_code', sic.sic_code).first();
    if (!exists) {
      await db('sic_codes').insert(sic);
    } else {
      await db('sic_codes').where('sic_code', sic.sic_code).update(sic);
    }
  }
  console.log(`  ✓ SIC codes seeded (${SIC_CODES.length} codes)`);

  // Organizations + financials
  const currentYear = new Date().getFullYear() - 1;
  for (const org of ORGANIZATIONS) {
    const normalized = org.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    let existing = await db('organizations').where({ name_normalized: normalized, sic_code: org.sic_code }).first();
    const orgRow = {
      name: org.name, name_normalized: normalized, sic_code: org.sic_code,
      type: org.type, ticker: org.ticker || null, state: org.state || null,
      city: org.city || null, description: org.description || null,
      employee_count: org.employee_count || null,
      credit_rating: org.credit_rating || null, credit_outlook: org.credit_outlook || null,
      credit_agency: org.credit_agency || null, country: org.country || 'US',
      updated_at: new Date().toISOString(),
    };
    let orgId;
    if (!existing) {
      orgRow.created_at = new Date().toISOString();
      const [id] = await db('organizations').insert(orgRow);
      orgId = id;
    } else {
      await db('organizations').where('id', existing.id).update(orgRow);
      orgId = existing.id;
    }

    // Financials with variance
    const base = BASE_FINANCIALS[org.sic_code];
    if (!base) continue;
    const variance = () => 0.7 + Math.random() * 0.6;
    const rev = Math.round(base.revenue * variance());
    const ni  = Math.round(base.net_income * variance());
    const ta  = Math.round((base.total_assets || rev * 2) * variance());
    const eq  = Math.round(ta * 0.1);

    const finRow = {
      org_id: orgId, fiscal_year: currentYear, period_type: 'annual', data_source: 'seed',
      revenue: rev, net_income: ni, total_assets: ta, shareholders_equity: eq,
      gross_margin: base.gross_margin || null,
      net_margin: base.net_margin ? +(base.net_margin * variance()).toFixed(2) : ni && rev ? +((ni/rev)*100).toFixed(2) : null,
      operating_margin: base.operating_margin || null,
      roe: base.roe ? +(base.roe * variance()).toFixed(2) : null,
      roa: base.roa ? +(base.roa * variance()).toFixed(2) : null,
      debt_to_equity: base.debt_to_equity ? +(base.debt_to_equity * variance()).toFixed(2) : null,
      tier1_capital_ratio: base.tier1_capital_ratio ? +(base.tier1_capital_ratio * variance()).toFixed(2) : null,
      efficiency_ratio: base.efficiency_ratio ? +(base.efficiency_ratio * variance()).toFixed(2) : null,
    };

    const existingFin = await db('financials').where({ org_id: orgId, fiscal_year: currentYear, period_type: 'annual' }).first();
    if (!existingFin) {
      await db('financials').insert(finRow);
    } else {
      await db('financials').where('id', existingFin.id).update(finRow);
    }
  }
  console.log(`  ✓ Organizations seeded (${ORGANIZATIONS.length} orgs)`);
  console.log('  ✓ Financials seeded');

  // Benchmarks — simple direct calculation, no onConflict
  const metrics = ['revenue','net_income','net_margin','roe','roa','total_assets','debt_to_equity','tier1_capital_ratio','efficiency_ratio','gross_margin','operating_margin'];
  const seededSics = [...new Set(ORGANIZATIONS.map(o => o.sic_code))];

  for (const sic_code of seededSics) {
    const orgs = await db('organizations').where('sic_code', sic_code).select('id');
    const orgIds = orgs.map(o => o.id);
    if (!orgIds.length) continue;

    for (const metric of metrics) {
      const rows = await db('financials').whereIn('org_id', orgIds).whereNotNull(metric).pluck(metric);
      if (!rows.length) continue;
      const vals = rows.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
      if (!vals.length) continue;
      const n = vals.length;
      const median = n % 2 === 0 ? (vals[n/2-1] + vals[n/2]) / 2 : vals[Math.floor(n/2)];
      const mean_val = vals.reduce((a, b) => a + b, 0) / n;

      await db('sector_benchmarks').delete().where({ sic_code, fiscal_year: currentYear, metric_name: metric });
      await db('sector_benchmarks').insert({
        sic_code, fiscal_year: currentYear, metric_name: metric,
        p25: vals[Math.floor(n*0.25)] || vals[0], median, p75: vals[Math.floor(n*0.75)] || vals[n-1],
        mean_val, min_val: vals[0], max_val: vals[n-1], entity_count: n,
      });
    }
  }
  console.log('  ✓ Sector benchmarks calculated');
  console.log('Seed complete.');
}

module.exports = { run };