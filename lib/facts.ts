// The verified fact bank.
//
// These are the "wow" facts behind hooks like "Japan is turning footsteps into
// electricity". They are hand-checked before they go in here, because the
// whole safety design of the FACTS lane is that **the fact is already true
// before Gemini ever sees it** — the writer may only rephrase one of these into
// a punchy hook, never invent its own (see buildFactPrompt in jokewriter.ts).
//
// Rules for adding one:
//   - It must be verifiable and uncontested. If it needs a "reportedly", skip it.
//   - No popular myths, however good they sound. Deliberately NOT in here:
//     the Great Wall being visible from space (false), goldfish having 3-second
//     memories (false), humans using 10% of their brain (false), lightning not
//     striking twice (false), Napoleon being short (he was average).
//   - Nothing political, tragic, medical-advice-shaped, or about a living
//     private person.
//   - `photo` is a literal stock-photo search term. Stock search is bad at
//     abstractions, so describe an object or a scene, not a concept.

export interface Fact {
  fact: string;
  photo: string;
}

export const FACTS: Fact[] = [
  // --- engineering + energy ------------------------------------------------
  { fact: "Some train stations in Japan have floor tiles that generate electricity from the pressure of commuters' footsteps", photo: "busy train station commuters" },
  { fact: "The Netherlands built a bike path surfaced with solar panels that feeds power into the grid", photo: "cycle path netherlands" },
  { fact: "Norway sells so much hydroelectric power that almost all of its own electricity comes from running water", photo: "hydroelectric dam water" },
  { fact: "The Eiffel Tower grows about 15 centimetres taller in summer because the iron expands in the heat", photo: "eiffel tower paris" },
  { fact: "The Hoover Dam contains so much concrete that it was cooled with embedded pipes carrying refrigerated water", photo: "hoover dam concrete" },
  { fact: "Iceland heats most of its buildings using hot water pumped straight from volcanic ground", photo: "iceland geothermal steam" },
  { fact: "The Channel Tunnel was dug from both ends at once and the two halves met with an error of only a few centimetres", photo: "tunnel underground railway" },
  { fact: "Singapore turns treated wastewater into drinking water and sells it under the name NEWater", photo: "water treatment plant" },
  { fact: "Denmark generates more than half its electricity from wind on a windy day", photo: "wind turbines field" },
  { fact: "The Burj Khalifa is so tall that you can watch the sun set from the base, take a lift up, and watch it set again", photo: "burj khalifa dubai sunset" },
  { fact: "Shanghai's maglev train floats on magnets and never touches the rails while moving", photo: "high speed train platform" },
  { fact: "Some skyscrapers contain a huge suspended weight that swings to cancel out the building's sway in high wind", photo: "skyscraper top floor city" },
  { fact: "Amsterdam's Schiphol Airport sits about four metres below sea level", photo: "airport runway plane" },
  { fact: "The Panama Canal lifts ships 26 metres uphill using nothing but gravity-fed fresh water", photo: "panama canal ship lock" },
  { fact: "Concrete used by the Romans got stronger over time because seawater reacted with the ash in it", photo: "roman ruins stone arch" },

  // --- space ---------------------------------------------------------------
  { fact: "Sunlight takes about eight minutes and twenty seconds to reach Earth", photo: "sun rays sky" },
  { fact: "A day on Venus is longer than a year on Venus", photo: "planet venus space" },
  { fact: "There is a giant storm on Jupiter that has been spinning for at least 190 years", photo: "planet jupiter space" },
  { fact: "Saturn's density is low enough that it would float if you had a bath big enough", photo: "planet saturn rings" },
  { fact: "Footprints left on the Moon will stay for millions of years because there is no wind to erase them", photo: "moon surface craters" },
  { fact: "Space is completely silent because there is no air for sound to travel through", photo: "astronaut in space" },
  { fact: "Neutron star material is so dense that a teaspoon of it would weigh billions of tonnes", photo: "stars deep space" },
  { fact: "The International Space Station orbits Earth roughly every 90 minutes, so its crew sees 16 sunrises a day", photo: "earth from space orbit" },
  { fact: "Olympus Mons on Mars is about two and a half times the height of Mount Everest", photo: "mars red planet surface" },
  { fact: "There are more stars in the observable universe than grains of sand on every beach on Earth", photo: "night sky milky way" },
  { fact: "Astronauts grow slightly taller in orbit because their spines decompress without gravity", photo: "astronaut floating space station" },
  { fact: "The Voyager 1 probe launched in 1977 and is now travelling through interstellar space", photo: "spacecraft stars" },
  { fact: "A year on Neptune lasts about 165 Earth years", photo: "planet neptune blue" },
  { fact: "The Moon is drifting away from Earth by about 3.8 centimetres every year", photo: "full moon night sky" },

  // --- animals -------------------------------------------------------------
  { fact: "Octopuses have three hearts and blue blood", photo: "octopus underwater" },
  { fact: "A group of flamingos is called a flamboyance", photo: "flamingos pink water" },
  { fact: "Wombats produce cube-shaped droppings", photo: "wombat australia" },
  { fact: "Sea otters hold hands while sleeping so they do not drift apart", photo: "sea otters floating water" },
  { fact: "A shrimp's heart is located in its head", photo: "shrimp underwater" },
  { fact: "Elephants are one of the few animals that cannot jump", photo: "elephant savanna" },
  { fact: "Cows have best friends and get stressed when they are separated", photo: "cows in a field" },
  { fact: "A snail can sleep for up to three years", photo: "snail on a leaf" },
  { fact: "Tardigrades can survive being frozen, boiled, dried out, and exposed to the vacuum of space", photo: "microscope science lab" },
  { fact: "Honeybees communicate the direction of flowers by dancing in a figure of eight", photo: "bees honeycomb" },
  { fact: "A blue whale's heart is roughly the size of a small car", photo: "blue whale ocean" },
  { fact: "Crows can recognise individual human faces and hold a grudge for years", photo: "crow on a branch" },
  { fact: "Sloths can hold their breath longer than dolphins can", photo: "sloth hanging tree" },
  { fact: "Penguins sometimes propose to their partners with a carefully chosen pebble", photo: "penguins on ice" },
  { fact: "Axolotls can regrow entire limbs, and even parts of their heart and brain", photo: "axolotl aquarium" },
  { fact: "A cat's nose print is as unique as a human fingerprint", photo: "close up cat nose" },
  { fact: "Dogs' sense of smell is tens of thousands of times more sensitive than ours", photo: "dog sniffing grass" },
  { fact: "Hummingbirds are the only birds that can fly backwards", photo: "hummingbird flower" },
  { fact: "Starfish have no brain and no blood", photo: "starfish beach sand" },
  { fact: "A woodpecker's tongue wraps around the inside of its skull and cushions its brain", photo: "woodpecker tree" },
  { fact: "Giraffes have the same number of neck bones as humans: seven", photo: "giraffe neck savanna" },
  { fact: "Parrots can outlive their owners, with some species reaching 80 years", photo: "colourful parrot" },
  { fact: "Ants never sleep the way we do, and some species have no eyes at all", photo: "ants close up" },
  { fact: "A group of ferrets is called a business, and a group of porcupines is called a prickle", photo: "ferret animal" },
  { fact: "Dolphins give each other names in the form of unique signature whistles", photo: "dolphins swimming ocean" },
  { fact: "Polar bear fur is not white but transparent, and their skin underneath is black", photo: "polar bear snow" },
  { fact: "Butterflies taste with their feet", photo: "butterfly on a flower" },
  { fact: "A rat will free another trapped rat even when there is no reward for doing so", photo: "rat close up" },
  { fact: "Pigeons can recognise themselves in a mirror", photo: "pigeon city street" },
  { fact: "Koalas sleep up to 20 hours a day because eucalyptus leaves give them so little energy", photo: "koala eucalyptus tree" },

  // --- the human body ------------------------------------------------------
  { fact: "Your body contains roughly the same number of bacterial cells as human cells", photo: "microscope laboratory" },
  { fact: "The human eye can distinguish millions of different colours", photo: "colourful paint palette" },
  { fact: "Your stomach lining replaces itself every few days so it does not digest itself", photo: "anatomy model medical" },
  { fact: "Bone is stronger than steel by weight", photo: "skeleton model anatomy" },
  { fact: "You are measurably taller in the morning than at night because your spine compresses during the day", photo: "person stretching morning" },
  { fact: "The strongest muscle in the human body for its size is the one that closes your jaw", photo: "person smiling teeth" },
  { fact: "Human fingerprints are so distinctive that even identical twins have different ones", photo: "fingerprint close up" },
  { fact: "Your brain uses about 20 percent of your body's energy despite being 2 percent of its weight", photo: "brain model science" },
  { fact: "The surface area of your lungs, spread flat, would roughly cover a tennis court", photo: "tennis court from above" },
  { fact: "You blink about 15 to 20 times a minute, which adds up to hours of closed eyes each year", photo: "close up human eye" },
  { fact: "Human babies are born with around 300 bones, and adults end up with 206 as some fuse together", photo: "baby feet hands" },
  { fact: "Your sense of smell is strongly linked to memory because it connects directly to the brain's memory regions", photo: "person smelling flowers" },
  { fact: "The acid in your stomach is strong enough to damage metal", photo: "laboratory beaker acid" },
  { fact: "Red blood cells have no nucleus, which leaves more room for carrying oxygen", photo: "blood cells microscope" },
  { fact: "Goosebumps are a leftover reflex from ancestors whose body hair puffed up to look bigger", photo: "close up skin arm" },

  // --- nature + earth ------------------------------------------------------
  { fact: "Honey found in ancient Egyptian tombs was still edible thousands of years later", photo: "honey jar golden" },
  { fact: "Bananas are botanically berries, while strawberries are not", photo: "bananas fruit" },
  { fact: "There is a forest of aspen in Utah that is one single organism connected underground", photo: "aspen forest trees" },
  { fact: "Lightning heats the air around it to roughly five times the surface temperature of the Sun", photo: "lightning storm sky" },
  { fact: "Antarctica is technically the world's largest desert because so little precipitation falls there", photo: "antarctica ice landscape" },
  { fact: "Trees in a forest share nutrients and warnings through underground fungal networks", photo: "forest floor roots moss" },
  { fact: "The Amazon rainforest produces its own rain by releasing moisture from its leaves", photo: "rainforest canopy mist" },
  { fact: "Mount Everest grows a few millimetres every year as tectonic plates push it upward", photo: "mount everest himalaya" },
  { fact: "Water can boil and freeze at the same time under the right pressure", photo: "boiling water pot" },
  { fact: "The Dead Sea is so salty that you float without trying", photo: "dead sea salt water" },
  { fact: "Some bamboo species can grow almost a metre in a single day", photo: "bamboo forest" },
  { fact: "There is a waterfall in Venezuela so tall that much of the water turns to mist before it lands", photo: "tall waterfall cliff" },
  { fact: "Sand from the Sahara regularly blows across the Atlantic and fertilises the Amazon", photo: "sahara desert dunes" },
  { fact: "Rain smells the way it does because of an oil plants release, combined with bacteria in the soil", photo: "rain on pavement" },
  { fact: "Iceland has almost no mosquitoes", photo: "iceland landscape waterfall" },
  { fact: "The deepest part of the ocean is deeper than Mount Everest is tall", photo: "deep ocean underwater blue" },
  { fact: "Diamonds are not actually rare compared with many other gemstones", photo: "diamond jewellery close up" },
  { fact: "A single lightning bolt contains enough energy to toast around 100,000 slices of bread", photo: "lightning night sky" },
  { fact: "Glass is made from sand heated until it melts", photo: "molten glass blowing" },
  { fact: "There are more trees on Earth than stars in the Milky Way", photo: "dense forest from above" },

  // --- history -------------------------------------------------------------
  { fact: "Oxford University was already teaching students before the Aztec Empire existed", photo: "old university library" },
  { fact: "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid", photo: "egyptian pyramids desert" },
  { fact: "The Eiffel Tower was meant to be temporary and was nearly dismantled after 20 years", photo: "eiffel tower structure" },
  { fact: "Ancient Romans used crushed volcanic ash to build harbours that still stand today", photo: "roman architecture columns" },
  { fact: "The first computer programmer wrote an algorithm a century before computers existed", photo: "old mechanical machine gears" },
  { fact: "Vikings used sunstones, a type of crystal, to navigate on cloudy days", photo: "viking ship sea" },
  { fact: "Woolly mammoths were still alive when the Great Pyramid of Giza was being built", photo: "mammoth tusk museum" },
  { fact: "Harvard University was founded before calculus was invented", photo: "old university building" },
  { fact: "Ketchup was once sold as medicine in the 1830s", photo: "tomato sauce bottle" },
  { fact: "The Statue of Liberty was originally a dull copper colour and turned green as it weathered", photo: "statue of liberty new york" },
  { fact: "Ancient Egyptians used mouldy bread on wounds long before antibiotics were understood", photo: "ancient egyptian artefact" },
  { fact: "Playing cards were used as currency in parts of Canada in the 1600s", photo: "playing cards deck" },
  { fact: "The Great Pyramid was the tallest structure made by humans for more than 3,000 years", photo: "great pyramid giza" },
  { fact: "Coca-Cola was first sold as a patent medicine at a pharmacy soda fountain", photo: "vintage soda fountain" },
  { fact: "Before erasers, people rubbed out pencil marks with bread", photo: "pencil and paper desk" },

  // --- technology + inventions --------------------------------------------
  { fact: "The first computer mouse was carved out of wood", photo: "vintage computer equipment" },
  { fact: "More computing power sits in a modern phone than in the machines that guided Apollo to the Moon", photo: "smartphone in hand" },
  { fact: "The first webcam was invented so researchers could check whether a coffee pot was full", photo: "coffee pot office" },
  { fact: "Bubble wrap was originally invented as textured wallpaper", photo: "bubble wrap packaging" },
  { fact: "The microwave oven was discovered when a chocolate bar melted in a researcher's pocket", photo: "microwave kitchen" },
  { fact: "Wi-Fi grew out of research into detecting exploding black holes", photo: "wifi router home" },
  { fact: "Post-it notes came from a glue that was considered a failure for being too weak", photo: "sticky notes desk" },
  { fact: "The QWERTY keyboard layout was designed for mechanical typewriters, not for typing speed", photo: "vintage typewriter" },
  { fact: "Velcro was inspired by burrs sticking to a dog's fur", photo: "velcro strap close up" },
  { fact: "The first item ever sold on eBay was a broken laser pointer", photo: "laser pointer desk" },
  { fact: "Nintendo was founded in 1889 and originally made playing cards", photo: "playing cards vintage" },
  { fact: "The inventor of the Pringles can had part of his ashes buried in one", photo: "stacked crisps tube" },
  { fact: "Early photographs needed such long exposures that people used hidden stands to keep still", photo: "antique camera" },
  { fact: "The @ symbol was used by merchants for centuries before email existed", photo: "keyboard at symbol" },

  // --- food ----------------------------------------------------------------
  { fact: "Carrots were originally purple, and orange ones were bred much later", photo: "purple carrots vegetables" },
  { fact: "Pineapples take about two years to grow a single fruit", photo: "pineapple plant field" },
  { fact: "Cashews grow attached to the bottom of a fruit, not inside a shell on a tree branch", photo: "cashew nuts fruit" },
  { fact: "Apples float because about a quarter of their volume is air", photo: "apples floating water" },
  { fact: "Vanilla is one of the most labour-intensive crops because each flower must be pollinated by hand", photo: "vanilla pods orchid" },
  { fact: "Peanuts are not nuts at all, they are legumes that grow underground", photo: "peanuts in shells" },
  { fact: "Chocolate was once served as a bitter drink with no sugar in it", photo: "hot chocolate cup cocoa" },
  { fact: "Saffron is worth more per gram than gold because each thread is picked by hand", photo: "saffron threads spice" },
  { fact: "Wasabi served in most restaurants is usually dyed horseradish, not real wasabi", photo: "sushi wasabi plate" },
  { fact: "Nutmeg was once so valuable that entire islands were traded for it", photo: "nutmeg spice wooden bowl" },
  { fact: "Potatoes were the first food crop grown in space", photo: "potatoes in soil" },
  { fact: "A strawberry is the only fruit with its seeds on the outside", photo: "strawberries close up" },
  { fact: "Bread was used as plates in the Middle Ages, and the soaked bottom was eaten last", photo: "rustic bread loaf" },

  // --- language + everyday oddities ---------------------------------------
  { fact: "The dot over a lowercase i or j has its own name: a tittle", photo: "printed text close up" },
  { fact: "There is no word in English that rhymes perfectly with month", photo: "open dictionary book" },
  { fact: "The word alphabet comes from the first two Greek letters, alpha and beta", photo: "greek letters stone" },
  { fact: "Shortest complete sentence in English is two letters long: Go.", photo: "open notebook pen" },
  { fact: "A jiffy is an actual unit of time used in physics", photo: "stopwatch timer" },
  { fact: "The plastic tips on shoelaces have a name: aglets", photo: "shoelaces sneakers" },
  { fact: "Zip codes, postcodes and barcodes all exist because sorting post by hand was too slow", photo: "post office parcels" },
  { fact: "The hashtag symbol is formally called an octothorpe", photo: "keyboard symbols" },
  { fact: "Scotland's national animal is the unicorn", photo: "scotland highlands landscape" },
  { fact: "The longest place name in the world is a hill in New Zealand with 85 letters", photo: "new zealand hill landscape" },
  { fact: "Bubbles are always spherical unless something pushes on them, because that shape uses the least surface", photo: "soap bubbles" },
  { fact: "Left-handed people were once retrained in schools to write with their right hand", photo: "person writing hand" },
];

/** Every fact as a one-line sanity target for the check script. */
export function factCount(): number {
  return FACTS.length;
}
