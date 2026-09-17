// Massive Multiple-Choice Word Bank (150 Wörter in 15 Kategorien)
// Das Mind-Game: Die 'options' sind visuell ähnlich. Die Artists müssen 
// so zeichnen, dass sie die falschen Optionen gezielt ausschließen!

const WORD_BANK = [
  // --- TIERE ---
  { category: 'Tiere', word: 'Pinguin', options: ['Schneemann', 'Eisbär', 'Pinguin', 'Iglu'] },
  { category: 'Tiere', word: 'Giraffe', options: ['Kamel', 'Giraffe', 'Lama', 'Strauß'] },
  { category: 'Tiere', word: 'Fledermaus', options: ['Vampir', 'Eule', 'Fledermaus', 'Drache'] },
  { category: 'Tiere', word: 'Chamäleon', options: ['Leguan', 'Frosch', 'Chamäleon', 'Schlange'] },
  { category: 'Tiere', word: 'Elefant', options: ['Nashorn', 'Nilpferd', 'Elefant', 'Mammut'] },
  { category: 'Tiere', word: 'Känguru', options: ['Hase', 'Känguru', 'Frosch', 'T-Rex'] },
  { category: 'Tiere', word: 'Schnecke', options: ['Schlange', 'Schnecke', 'Wurm', 'Muschel'] },
  { category: 'Tiere', word: 'Oktopus', options: ['Spinne', 'Oktopus', 'Qualle', 'Seestern'] },
  { category: 'Tiere', word: 'Fuchs', options: ['Hund', 'Katze', 'Fuchs', 'Wolf'] },
  { category: 'Tiere', word: 'Igel', options: ['Stachelschwein', 'Kaktus', 'Igel', 'Kastanie'] },

  // --- FAHRZEUGE ---
  { category: 'Fahrzeuge', word: 'Bagger', options: ['Traktor', 'Panzer', 'Bagger', 'Kran'] },
  { category: 'Fahrzeuge', word: 'Heißluftballon', options: ['Zeppelin', 'Fallschirm', 'Heißluftballon', 'Glühbirne'] },
  { category: 'Fahrzeuge', word: 'U-Boot', options: ['Wal', 'U-Boot', 'Torpedo', 'Haifisch'] },
  { category: 'Fahrzeuge', word: 'Hubschrauber', options: ['Drohne', 'Flugzeug', 'Hubschrauber', 'Windmühle'] },
  { category: 'Fahrzeuge', word: 'Motorrad', options: ['Fahrrad', 'Motorrad', 'Roller', 'Quad'] },
  { category: 'Fahrzeuge', word: 'Segelschiff', options: ['Piratenschiff', 'Segelschiff', 'Surfbrett', 'Floss'] },
  { category: 'Fahrzeuge', word: 'Rakete', options: ['Flugzeug', 'Rakete', 'Komet', 'Turm'] },
  { category: 'Fahrzeuge', word: 'Feuerwehrauto', options: ['Krankenwagen', 'Polizeiauto', 'Feuerwehrauto', 'Bus'] },
  { category: 'Fahrzeuge', word: 'Schlitten', options: ['Ski', 'Schlitten', 'Snowboard', 'Kutsche'] },
  { category: 'Fahrzeuge', word: 'Rollstuhl', options: ['Kinderwagen', 'Fahrrad', 'Rollstuhl', 'Bürostuhl'] },

  // --- ESSEN & TRINKEN ---
  { category: 'Essen', word: 'Pizza', options: ['Kuchen', 'Pizza', 'Käse', 'Pfannkuchen'] },
  { category: 'Essen', word: 'Sushi', options: ['Pizza', 'Sushi', 'Burrito', 'Baguette'] },
  { category: 'Essen', word: 'Brezel', options: ['Croissant', 'Donut', 'Brezel', 'Knoten'] },
  { category: 'Essen', word: 'Wassermelone', options: ['Apfel', 'Kürbis', 'Wassermelone', 'Erdbeere'] },
  { category: 'Essen', word: 'Eiscreme', options: ['Lolli', 'Eiscreme', 'Fackel', 'Mikrofon'] },
  { category: 'Essen', word: 'Burger', options: ['Sandwich', 'Burger', 'Macaron', 'Döner'] },
  { category: 'Essen', word: 'Spaghetti', options: ['Würmer', 'Spaghetti', 'Wolle', 'Schlangen'] },
  { category: 'Essen', word: 'Kaffee', options: ['Tee', 'Suppe', 'Kaffee', 'Kakao'] },
  { category: 'Essen', word: 'Ananas', options: ['Kaktus', 'Ananas', 'Palme', 'Tannenzapfen'] },
  { category: 'Essen', word: 'Ei', options: ['Kartoffel', 'Stein', 'Ei', 'Avocado'] },

  // --- BERUFE ---
  { category: 'Berufe', word: 'Astronaut', options: ['Taucher', 'Astronaut', 'Pilot', 'Roboter'] },
  { category: 'Berufe', word: 'Zauberer', options: ['Clown', 'König', 'Zauberer', 'Priester'] },
  { category: 'Berufe', word: 'Feuerwehrmann', options: ['Polizist', 'Maler', 'Feuerwehrmann', 'Soldat'] },
  { category: 'Berufe', word: 'Koch', options: ['Bäcker', 'Metzger', 'Koch', 'Kellner'] },
  { category: 'Berufe', word: 'Detektiv', options: ['Spion', 'Polizist', 'Detektiv', 'Fotograf'] },
  { category: 'Berufe', word: 'Arzt', options: ['Apotheker', 'Zahnarzt', 'Arzt', 'Wissenschaftler'] },
  { category: 'Berufe', word: 'Pirat', options: ['Kapitän', 'Ninja', 'Pirat', 'Ritter'] },
  { category: 'Berufe', word: 'Lehrer', options: ['Schüler', 'Professor', 'Lehrer', 'Richter'] },
  { category: 'Berufe', word: 'Maler', options: ['Handwerker', 'Maler', 'Bildhauer', 'Schreiner'] },
  { category: 'Berufe', word: 'Gärtner', options: ['Bauer', 'Gärtner', 'Förster', 'Florist'] },

  // --- ORTE & GEBÄUDE ---
  { category: 'Orte', word: 'Leuchtturm', options: ['Windmühle', 'Kirchturm', 'Leuchtturm', 'Wasserturm'] },
  { category: 'Orte', word: 'Vulkan', options: ['Berg', 'Pyramide', 'Vulkan', 'Zelt'] },
  { category: 'Orte', word: 'Burg', options: ['Schloss', 'Festung', 'Burg', 'Gefängnis'] },
  { category: 'Orte', word: 'Krankenhaus', options: ['Schule', 'Rathaus', 'Krankenhaus', 'Feuerwache'] },
  { category: 'Orte', word: 'Friedhof', options: ['Park', 'Friedhof', 'Kirche', 'Ruine'] },
  { category: 'Orte', word: 'Strand', options: ['Wüste', 'Insel', 'Strand', 'Sandkasten'] },
  { category: 'Orte', word: 'Zelt', options: ['Pyramide', 'Haus', 'Zelt', 'Höhle'] },
  { category: 'Orte', word: 'Aquarium', options: ['Fernseher', 'Aquarium', 'U-Boot', 'Fenster'] },
  { category: 'Orte', word: 'Stadion', options: ['Kolosseum', 'Schwimmbad', 'Stadion', 'Konzert'] },
  { category: 'Orte', word: 'Brücke', options: ['Mauer', 'Zaun', 'Brücke', 'Damm'] },

  // --- OBJEKTE & WERKZEUGE ---
  { category: 'Objekte', word: 'Regenschirm', options: ['Pilz', 'Satellitenschüssel', 'Regenschirm', 'Baum'] },
  { category: 'Objekte', word: 'Kompass', options: ['Uhr', 'Lenkrad', 'Kompass', 'Münze'] },
  { category: 'Objekte', word: 'Schlüssel', options: ['Schwert', 'Schlüssel', 'Gabel', 'Zauberstab'] },
  { category: 'Objekte', word: 'Schere', options: ['Zange', 'Messer', 'Schere', 'Pinzette'] },
  { category: 'Objekte', word: 'Hammer', options: ['Axt', 'Schaufel', 'Hammer', 'Keule'] },
  { category: 'Objekte', word: 'Buch', options: ['Laptop', 'Heft', 'Buch', 'Zeitung'] },
  { category: 'Objekte', word: 'Taschenlampe', options: ['Laserschwert', 'Taschenlampe', 'Mikrofon', 'Stift'] },
  { category: 'Objekte', word: 'Brille', options: ['Fernglas', 'Maske', 'Brille', 'Fahrrad'] },
  { category: 'Objekte', word: 'Kerze', options: ['Fackel', 'Rakete', 'Kerze', 'Lippenstift'] },
  { category: 'Objekte', word: 'Zahnbürste', options: ['Kamm', 'Pinsel', 'Zahnbürste', 'Feile'] },

  // --- SPORT & HOBBY ---
  { category: 'Sport', word: 'Surfbrett', options: ['Skateboard', 'Snowboard', 'Surfbrett', 'Bügelbrett'] },
  { category: 'Sport', word: 'Fußball', options: ['Basketball', 'Tennisball', 'Fußball', 'Volleyball'] },
  { category: 'Sport', word: 'Boxhandschuh', options: ['Fäustling', 'Boxhandschuh', 'Kirsche', 'Herz'] },
  { category: 'Sport', word: 'Schach', options: ['Dame', 'Schach', 'Mensch-ärgere-dich-nicht', 'Puzzle'] },
  { category: 'Sport', word: 'Bogenschießen', options: ['Harfe', 'Bogenschießen', 'Armbrust', 'Angeln'] },
  { category: 'Sport', word: 'Hantel', options: ['Knochen', 'Hantel', 'Schleife', 'Brille'] },
  { category: 'Sport', word: 'Schlittschuhe', options: ['Rollschuhe', 'Schlittschuhe', 'Socken', 'Stiefel'] },
  { category: 'Sport', word: 'Bowling', options: ['Billard', 'Golf', 'Bowling', 'Murmeln'] },
  { category: 'Sport', word: 'Angeln', options: ['Peitsche', 'Angeln', 'Stock', 'Seil'] },
  { category: 'Sport', word: 'Zelt', options: ['Schlafsack', 'Rucksack', 'Zelt', 'Lagerfeuer'] },

  // --- FANTASY & MYTHOLOGIE ---
  { category: 'Fantasy', word: 'Einhorn', options: ['Pferd', 'Drache', 'Einhorn', 'Pegasus'] },
  { category: 'Fantasy', word: 'Geist', options: ['Wolke', 'Tuch', 'Geist', 'Qualle'] },
  { category: 'Fantasy', word: 'Meerjungfrau', options: ['Fisch', 'Meerjungfrau', 'Sirene', 'Delfin'] },
  { category: 'Fantasy', word: 'Werwolf', options: ['Hund', 'Bär', 'Werwolf', 'Vampir'] },
  { category: 'Fantasy', word: 'Zombie', options: ['Mumie', 'Frankenstein', 'Zombie', 'Vampir'] },
  { category: 'Fantasy', word: 'Hexe', options: ['Zauberer', 'Hexe', 'Fee', 'Kobold'] },
  { category: 'Fantasy', word: 'Drache', options: ['Dinosaurier', 'Drache', 'Echse', 'Krokodil'] },
  { category: 'Fantasy', word: 'Troll', options: ['Riese', 'Troll', 'Ork', 'Goblin'] },
  { category: 'Fantasy', word: 'Pegasus', options: ['Engel', 'Vogel', 'Pegasus', 'Fledermaus'] },
  { category: 'Fantasy', word: 'Schatz', options: ['Kiste', 'Schatz', 'Sarg', 'Geschenk'] },

  // --- NATUR & WETTER ---
  { category: 'Natur', word: 'Tornado', options: ['Strudel', 'Tornado', 'Spirale', 'Schlange'] },
  { category: 'Natur', word: 'Blitz', options: ['Zickzack', 'Riss', 'Blitz', 'Kratzer'] },
  { category: 'Natur', word: 'Wolke', options: ['Schaf', 'Baumkrone', 'Wolke', 'Watte'] },
  { category: 'Natur', word: 'Baum', options: ['Blume', 'Brokkoli', 'Baum', 'Pilz'] },
  { category: 'Natur', word: 'Pilz', options: ['Schirm', 'Lampe', 'Pilz', 'Hut'] },
  { category: 'Natur', word: 'Berg', options: ['Pyramide', 'Zelt', 'Berg', 'Dreieck'] },
  { category: 'Natur', word: 'Stern', options: ['Sonne', 'Stern', 'Kreuz', 'Seestern'] },
  { category: 'Natur', word: 'Sonne', options: ['Mond', 'Sonne', 'Rad', 'Uhr'] },
  { category: 'Natur', word: 'Blume', options: ['Propeller', 'Blume', 'Sonne', 'Windmühle'] },
  { category: 'Natur', word: 'Tropfen', options: ['Träne', 'Tropfen', 'Samen', 'Blatt'] },

  // --- KLEIDUNG & ACCESSOIRES ---
  { category: 'Kleidung', word: 'Krawatte', options: ['Schal', 'Krawatte', 'Gürtel', 'Schlange'] },
  { category: 'Kleidung', word: 'Hut', options: ['Krone', 'Helm', 'Hut', 'Mütze'] },
  { category: 'Kleidung', word: 'Schuh', options: ['Socke', 'Stiefel', 'Schuh', 'Fuß'] },
  { category: 'Kleidung', word: 'Krone', options: ['Zähne', 'Krone', 'Burg', 'Kamm'] },
  { category: 'Kleidung', word: 'Handschuh', options: ['Hand', 'Socke', 'Handschuh', 'Kaktus'] },
  { category: 'Kleidung', word: 'Gürtel', options: ['Seil', 'Gürtel', 'Peitsche', 'Armband'] },
  { category: 'Kleidung', word: 'Schal', options: ['Handtuch', 'Decke', 'Schal', 'Teppich'] },
  { category: 'Kleidung', word: 'Rucksack', options: ['Tasche', 'Koffer', 'Rucksack', 'Beutel'] },
  { category: 'Kleidung', word: 'Ring', options: ['Armband', 'Reifen', 'Ring', 'Münze'] },
  { category: 'Kleidung', word: 'Hose', options: ['Shorts', 'Hose', 'Pullover', 'Kleid'] },

  // --- TECHNOLOGIE & ELEKTRONIK ---
  { category: 'Technologie', word: 'Kopfhörer', options: ['Stethoskop', 'Kopfhörer', 'Ohrenschützer', 'Brille'] },
  { category: 'Technologie', word: 'Laptop', options: ['Buch', 'Koffer', 'Laptop', 'Klavier'] },
  { category: 'Technologie', word: 'Fernseher', options: ['Mikrowelle', 'Bilderrahmen', 'Fernseher', 'Aquarium'] },
  { category: 'Technologie', word: 'Smartphone', options: ['Taschenrechner', 'Fernbedienung', 'Smartphone', 'Tablet'] },
  { category: 'Technologie', word: 'Roboter', options: ['Ritter', 'Alien', 'Roboter', 'Mensch'] },
  { category: 'Technologie', word: 'Maus', options: ['Computerspiel', 'Maus', 'Käfer', 'Stein'] },
  { category: 'Technologie', word: 'Kamera', options: ['Auge', 'Kamera', 'Webcam', 'Projektor'] },
  { category: 'Technologie', word: 'Gameboy', options: ['Smartphone', 'Controller', 'Gameboy', 'Taschenrechner'] },
  { category: 'Technologie', word: 'Drohne', options: ['Spinne', 'UFO', 'Drohne', 'Hubschrauber'] },
  { category: 'Technologie', word: 'Batterie', options: ['Dose', 'Fass', 'Batterie', 'Pille'] },

  // --- KÖRPER & ANATOMIE ---
  { category: 'Körper', word: 'Auge', options: ['Mund', 'Auge', 'Planet', 'Kamera'] },
  { category: 'Körper', word: 'Hand', options: ['Fuß', 'Pfote', 'Hand', 'Handschuh'] },
  { category: 'Körper', word: 'Herz', options: ['Apfel', 'Erdbeere', 'Herz', 'Luftballon'] },
  { category: 'Körper', word: 'Gehirn', options: ['Wolke', 'Nuss', 'Gehirn', 'Brokkoli'] },
  { category: 'Körper', word: 'Zahn', options: ['Knochen', 'Zelt', 'Zahn', 'Berg'] },
  { category: 'Körper', word: 'Ohr', options: ['Nase', 'Muschel', 'Ohr', 'Mond'] },
  { category: 'Körper', word: 'Fuß', options: ['Schuh', 'Socke', 'Fuß', 'Hand'] },
  { category: 'Körper', word: 'Lippen', options: ['Auge', 'Herz', 'Lippen', 'Schleife'] },
  { category: 'Körper', word: 'Knochen', options: ['Hantel', 'Ast', 'Knochen', 'Stift'] },
  { category: 'Körper', word: 'Nase', options: ['Ohr', 'Berg', 'Nase', 'Haken'] },

  // --- MUSIK & INSTRUMENTE ---
  { category: 'Musik', word: 'Klavier', options: ['Schreibmaschine', 'Akkordeon', 'Klavier', 'Laptop'] },
  { category: 'Musik', word: 'Gitarre', options: ['Geige', 'Bass', 'Gitarre', 'Ukulele'] },
  { category: 'Musik', word: 'Schlagzeug', options: ['Töpfe', 'Schlagzeug', 'Fässer', 'Eimer'] },
  { category: 'Musik', word: 'Trompete', options: ['Flöte', 'Saxophon', 'Trompete', 'Posaune'] },
  { category: 'Musik', word: 'Mikrofon', options: ['Eiscreme', 'Fackel', 'Mikrofon', 'Pinsel'] },
  { category: 'Musik', word: 'Harfe', options: ['Bogen', 'Kamm', 'Harfe', 'Treppe'] },
  { category: 'Musik', word: 'Noten', options: ['Fahne', 'Buchstaben', 'Noten', 'Zahlen'] },
  { category: 'Musik', word: 'Akkordeon', options: ['Klavier', 'Heizung', 'Akkordeon', 'Buch'] },
  { category: 'Musik', word: 'Flöte', options: ['Stock', 'Zauberstab', 'Flöte', 'Schlange'] },
  { category: 'Musik', word: 'Kopfhörer', options: ['Stethoskop', 'Brille', 'Kopfhörer', 'Haarreif'] },

  // --- MÖBEL & EINRICHTUNG ---
  { category: 'Möbel', word: 'Bett', options: ['Sofa', 'Tisch', 'Bett', 'Badewanne'] },
  { category: 'Möbel', word: 'Stuhl', options: ['Hocker', 'Sessel', 'Stuhl', 'Tisch'] },
  { category: 'Möbel', word: 'Tisch', options: ['Bett', 'Stuhl', 'Tisch', 'Schrank'] },
  { category: 'Möbel', word: 'Lampe', options: ['Pilz', 'Baum', 'Lampe', 'Dusche'] },
  { category: 'Möbel', word: 'Schrank', options: ['Kühlschrank', 'Tresor', 'Schrank', 'Tür'] },
  { category: 'Möbel', word: 'Sofa', options: ['Bett', 'Sessel', 'Sofa', 'Bank'] },
  { category: 'Möbel', word: 'Spiegel', options: ['Fenster', 'Bild', 'Spiegel', 'Tür'] },
  { category: 'Möbel', word: 'Teppich', options: ['Handtuch', 'Matratze', 'Teppich', 'Papier'] },
  { category: 'Möbel', word: 'Dusche', options: ['Lampe', 'Wasserfall', 'Dusche', 'Brunnen'] },
  { category: 'Möbel', word: 'Toilette', options: ['Stuhl', 'Waschbecken', 'Toilette', 'Mülleimer'] },

  // --- ASTRONOMIE & WELTALL ---
  { category: 'Weltall', word: 'Saturn', options: ['UFO', 'Hut', 'Saturn', 'Auge'] },
  { category: 'Weltall', word: 'Alien', options: ['Mensch', 'Roboter', 'Alien', 'Geist'] },
  { category: 'Weltall', word: 'Erde', options: ['Mond', 'Sonne', 'Erde', 'Ball'] },
  { category: 'Weltall', word: 'Komet', options: ['Rakete', 'Stern', 'Komet', 'Feuerwerk'] },
  { category: 'Weltall', word: 'UFO', options: ['Hut', 'Teller', 'UFO', 'Saturn'] },
  { category: 'Weltall', word: 'Satellit', options: ['Drohne', 'Flugzeug', 'Satellit', 'Vogel'] },
  { category: 'Weltall', word: 'Teleskop', options: ['Mikroskop', 'Kanone', 'Teleskop', 'Rohr'] },
  { category: 'Weltall', word: 'Schwarzes Loch', options: ['Auge', 'Tornado', 'Schwarzes Loch', 'Mund'] },
  { category: 'Weltall', word: 'Raumstation', options: ['Satellit', 'Flugzeug', 'Raumstation', 'Stern'] },
  { category: 'Weltall', word: 'Astronaut', options: ['Taucher', 'Alien', 'Astronaut', 'Roboter'] }
];

module.exports = WORD_BANK;
