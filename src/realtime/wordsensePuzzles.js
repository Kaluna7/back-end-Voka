const { normalizeAnyAnswer, acceptedForms } = require('../services/aiGamePuzzleService');
const pickAi = items => items[Math.floor(Math.random() * items.length)];
const { randomBotName } = require('./sudowordPuzzles');

const QUESTION_BANK = [
  [
    "A feeling of intense happiness",
    "Joy",
    [
      "Sadness",
      "Anger",
      "Fear"
    ]
  ],
  [
    "A strong feeling of displeasure",
    "Anger",
    [
      "Joy",
      "Calm",
      "Hope"
    ]
  ],
  [
    "A feeling of fear or worry",
    "Anxiety",
    [
      "Confidence",
      "Joy",
      "Calm"
    ]
  ],
  [
    "A feeling of deep sorrow",
    "Grief",
    [
      "Joy",
      "Pride",
      "Excitement"
    ]
  ],
  [
    "A feeling of great pride in achievement",
    "Triumph",
    [
      "Shame",
      "Fear",
      "Boredom"
    ]
  ],
  [
    "A feeling of shame or embarrassment",
    "Humiliation",
    [
      "Pride",
      "Joy",
      "Relief"
    ]
  ],
  [
    "A feeling of calm and peace",
    "Serenity",
    [
      "Chaos",
      "Rage",
      "Panic"
    ]
  ],
  [
    "A feeling of eager excitement",
    "Anticipation",
    [
      "Apathy",
      "Boredom",
      "Dread"
    ]
  ],
  [
    "A feeling of disgust or strong dislike",
    "Revulsion",
    [
      "Admiration",
      "Love",
      "Joy"
    ]
  ],
  [
    "A feeling of sympathy for someone suffering",
    "Compassion",
    [
      "Cruelty",
      "Indifference",
      "Spite"
    ]
  ],
  [
    "To move quickly on foot",
    "Run",
    [
      "Sit",
      "Sleep",
      "Stand"
    ]
  ],
  [
    "To take something into the mouth and swallow",
    "Eat",
    [
      "Speak",
      "Write",
      "Throw"
    ]
  ],
  [
    "To produce words with the voice",
    "Speak",
    [
      "Listen",
      "Sleep",
      "Hide"
    ]
  ],
  [
    "To rest with eyes closed",
    "Sleep",
    [
      "Run",
      "Shout",
      "Build"
    ]
  ],
  [
    "To construct or put together",
    "Build",
    [
      "Destroy",
      "Erase",
      "Forget"
    ]
  ],
  [
    "To break into pieces",
    "Shatter",
    [
      "Repair",
      "Join",
      "Heal"
    ]
  ],
  [
    "To discover something not known before",
    "Discover",
    [
      "Hide",
      "Lose",
      "Forget"
    ]
  ],
  [
    "To teach or train someone",
    "Instruct",
    [
      "Ignore",
      "Confuse",
      "Abandon"
    ]
  ],
  [
    "To travel through the air",
    "Fly",
    [
      "Sink",
      "Crawl",
      "Burrow"
    ]
  ],
  [
    "To cut with a sharp tool",
    "Slice",
    [
      "Glue",
      "Fold",
      "Paint"
    ]
  ],
  [
    "A large body of salt water",
    "Ocean",
    [
      "Desert",
      "Mountain",
      "Forest"
    ]
  ],
  [
    "A very high natural elevation",
    "Mountain",
    [
      "Valley",
      "Pond",
      "Plain"
    ]
  ],
  [
    "A dry area with little rainfall",
    "Desert",
    [
      "Rainforest",
      "Swamp",
      "Lake"
    ]
  ],
  [
    "A place where many trees grow",
    "Forest",
    [
      "Desert",
      "Beach",
      "Canyon"
    ]
  ],
  [
    "Frozen water falling from clouds",
    "Snow",
    [
      "Rain",
      "Fog",
      "Wind"
    ]
  ],
  [
    "A sudden bright flash in a storm",
    "Lightning",
    [
      "Thunder",
      "Hail",
      "Mist"
    ]
  ],
  [
    "The star that gives Earth light and heat",
    "Sun",
    [
      "Moon",
      "Star",
      "Cloud"
    ]
  ],
  [
    "A natural satellite that orbits Earth",
    "Moon",
    [
      "Sun",
      "Comet",
      "Planet"
    ]
  ],
  [
    "A building where students learn",
    "School",
    [
      "Hospital",
      "Factory",
      "Prison"
    ]
  ],
  [
    "A person who teaches students",
    "Teacher",
    [
      "Student",
      "Driver",
      "Chef"
    ]
  ],
  [
    "A written examination of knowledge",
    "Test",
    [
      "Party",
      "Gift",
      "Song"
    ]
  ],
  [
    "A book used for study in a subject",
    "Textbook",
    [
      "Novel",
      "Menu",
      "Map"
    ]
  ],
  [
    "A room in a school for classes",
    "Classroom",
    [
      "Kitchen",
      "Garage",
      "Barn"
    ]
  ],
  [
    "The organ used for thinking",
    "Brain",
    [
      "Heart",
      "Liver",
      "Skin"
    ]
  ],
  [
    "The organ that pumps blood",
    "Heart",
    [
      "Lung",
      "Bone",
      "Muscle"
    ]
  ],
  [
    "The part of the body used for seeing",
    "Eye",
    [
      "Ear",
      "Nose",
      "Hand"
    ]
  ],
  [
    "The part of the body used for hearing",
    "Ear",
    [
      "Eye",
      "Tooth",
      "Knee"
    ]
  ],
  [
    "The joint connecting the leg and foot",
    "Ankle",
    [
      "Wrist",
      "Elbow",
      "Hip"
    ]
  ],
  [
    "The hard structure protecting the brain",
    "Skull",
    [
      "Rib",
      "Spine",
      "Tendon"
    ]
  ],
  [
    "Unable to be seen",
    "Invisible",
    [
      "Visible",
      "Bright",
      "Clear"
    ]
  ],
  [
    "Extremely large in size",
    "Enormous",
    [
      "Tiny",
      "Minor",
      "Slight"
    ]
  ],
  [
    "Very small in size",
    "Minuscule",
    [
      "Huge",
      "Vast",
      "Giant"
    ]
  ],
  [
    "Having great skill or knowledge",
    "Expert",
    [
      "Novice",
      "Amateur",
      "Clumsy"
    ]
  ],
  [
    "Lacking skill or experience",
    "Inexperienced",
    [
      "Skilled",
      "Expert",
      "Masterful"
    ]
  ],
  [
    "Full of energy and life",
    "Vibrant",
    [
      "Dull",
      "Lifeless",
      "Stale"
    ]
  ],
  [
    "Lacking color or brightness",
    "Drab",
    [
      "Vivid",
      "Bright",
      "Colorful"
    ]
  ],
  [
    "Able to bend without breaking",
    "Flexible",
    [
      "Rigid",
      "Brittle",
      "Stiff"
    ]
  ],
  [
    "Hard and unwilling to change",
    "Stubborn",
    [
      "Yielding",
      "Open",
      "Adaptable"
    ]
  ],
  [
    "Showing care and concern for others",
    "Considerate",
    [
      "Selfish",
      "Rude",
      "Harsh"
    ]
  ],
  [
    "Willing to tell the truth",
    "Honest",
    [
      "Deceitful",
      "False",
      "Crooked"
    ]
  ],
  [
    "Not telling the truth",
    "Dishonest",
    [
      "Truthful",
      "Frank",
      "Sincere"
    ]
  ],
  [
    "Having no fear",
    "Fearless",
    [
      "Timid",
      "Afraid",
      "Nervous"
    ]
  ],
  [
    "Easily frightened",
    "Timid",
    [
      "Bold",
      "Brave",
      "Daring"
    ]
  ],
  [
    "A plan or suggestion for action",
    "Proposal",
    [
      "Refusal",
      "Silence",
      "Accident"
    ]
  ],
  [
    "A lack of something needed",
    "Shortage",
    [
      "Surplus",
      "Abundance",
      "Plenty"
    ]
  ],
  [
    "Something that is difficult to understand",
    "Mystery",
    [
      "Fact",
      "Proof",
      "Answer"
    ]
  ],
  [
    "A strong belief or opinion",
    "Conviction",
    [
      "Doubt",
      "Uncertainty",
      "Hesitation"
    ]
  ],
  [
    "A state of being free from work",
    "Leisure",
    [
      "Labor",
      "Toil",
      "Duty"
    ]
  ],
  [
    "The ability to wait without complaining",
    "Patience",
    [
      "Impatience",
      "Haste",
      "Rush"
    ]
  ],
  [
    "A sudden strong desire to do something",
    "Impulse",
    [
      "Plan",
      "Habit",
      "Routine"
    ]
  ],
  [
    "A formal agreement between parties",
    "Treaty",
    [
      "Quarrel",
      "Fight",
      "Dispute"
    ]
  ],
  [
    "A person who leads a group",
    "Leader",
    [
      "Follower",
      "Spectator",
      "Outcast"
    ]
  ],
  [
    "A person who copies another",
    "Imitator",
    [
      "Pioneer",
      "Inventor",
      "Creator"
    ]
  ],
  [
    "Something handed down from the past",
    "Heritage",
    [
      "Novelty",
      "Trend",
      "Fad"
    ]
  ],
  [
    "A long story about heroic deeds",
    "Epic",
    [
      "Note",
      "Memo",
      "List"
    ]
  ],
  [
    "A short amusing story",
    "Anecdote",
    [
      "Textbook",
      "Manual",
      "Treatise"
    ]
  ],
  [
    "A person who writes books",
    "Author",
    [
      "Reader",
      "Printer",
      "Binder"
    ]
  ],
  [
    "A place where books are kept",
    "Library",
    [
      "Kitchen",
      "Garage",
      "Mine"
    ]
  ],
  [
    "A picture made with a camera",
    "Photograph",
    [
      "Sculpture",
      "Song",
      "Recipe"
    ]
  ],
  [
    "A musical piece for one voice",
    "Solo",
    [
      "Chorus",
      "Orchestra",
      "Band"
    ]
  ],
  [
    "A group of musicians playing together",
    "Orchestra",
    [
      "Solo",
      "Whisper",
      "Silence"
    ]
  ],
  [
    "A curved line in the sky after rain",
    "Rainbow",
    [
      "Tunnel",
      "Bridge",
      "Wall"
    ]
  ],
  [
    "A violent rotating windstorm",
    "Tornado",
    [
      "Breeze",
      "Calm",
      "Drizzle"
    ]
  ],
  [
    "A shaking of the ground",
    "Earthquake",
    [
      "Rain",
      "Snow",
      "Fog"
    ]
  ],
  [
    "A flow of water in a channel",
    "Stream",
    [
      "Mountain",
      "Cloud",
      "Rock"
    ]
  ],
  [
    "A sheltered area of coastal water",
    "Harbor",
    [
      "Peak",
      "Cliff",
      "Plateau"
    ]
  ],
  [
    "An animal that hunts other animals",
    "Predator",
    [
      "Prey",
      "Herbivore",
      "Plant"
    ]
  ],
  [
    "An animal hunted by others",
    "Prey",
    [
      "Predator",
      "Hunter",
      "Stalker"
    ]
  ],
  [
    "A young dog",
    "Puppy",
    [
      "Kitten",
      "Calf",
      "Foal"
    ]
  ],
  [
    "A young cat",
    "Kitten",
    [
      "Puppy",
      "Chick",
      "Cub"
    ]
  ],
  [
    "An insect that makes honey",
    "Bee",
    [
      "Ant",
      "Spider",
      "Worm"
    ]
  ],
  [
    "A large gray mammal with a trunk",
    "Elephant",
    [
      "Eagle",
      "Shark",
      "Frog"
    ]
  ],
  [
    "A bird that cannot fly and lives in cold regions",
    "Penguin",
    [
      "Eagle",
      "Hawk",
      "Sparrow"
    ]
  ],
  [
    "A reptile with a hard shell",
    "Turtle",
    [
      "Rabbit",
      "Deer",
      "Horse"
    ]
  ],
  [
    "A tool used for cutting paper",
    "Scissors",
    [
      "Hammer",
      "Ruler",
      "Brush"
    ]
  ],
  [
    "A device for telling time",
    "Clock",
    [
      "Lamp",
      "Chair",
      "Spoon"
    ]
  ],
  [
    "A vehicle with two wheels",
    "Bicycle",
    [
      "Train",
      "Ship",
      "Plane"
    ]
  ],
  [
    "A machine that flies in the sky",
    "Airplane",
    [
      "Boat",
      "Car",
      "Bus"
    ]
  ],
  [
    "A room for preparing food",
    "Kitchen",
    [
      "Bedroom",
      "Office",
      "Hall"
    ]
  ],
  [
    "A piece of furniture for sleeping",
    "Bed",
    [
      "Table",
      "Shelf",
      "Lamp"
    ]
  ],
  [
    "A covering for the head",
    "Hat",
    [
      "Shoe",
      "Glove",
      "Belt"
    ]
  ],
  [
    "Clothing worn on the feet",
    "Shoes",
    [
      "Hat",
      "Scarf",
      "Tie"
    ]
  ],
  [
    "A sweet baked dessert",
    "Cake",
    [
      "Soup",
      "Salad",
      "Stew"
    ]
  ],
  [
    "A yellow citrus fruit",
    "Lemon",
    [
      "Apple",
      "Grape",
      "Peach"
    ]
  ],
  [
    "A grain used to make bread",
    "Wheat",
    [
      "Rice",
      "Corn",
      "Oats"
    ]
  ],
  [
    "A hot drink made from beans",
    "Coffee",
    [
      "Juice",
      "Milk",
      "Water"
    ]
  ],
  [
    "A white liquid from cows",
    "Milk",
    [
      "Oil",
      "Vinegar",
      "Syrup"
    ]
  ],
  [
    "A game played with a round ball",
    "Soccer",
    [
      "Chess",
      "Swimming",
      "Running"
    ]
  ],
  [
    "A sport on ice with sticks and a puck",
    "Hockey",
    [
      "Tennis",
      "Golf",
      "Boxing"
    ]
  ],
  [
    "A competition of speed",
    "Race",
    [
      "Sleep",
      "Study",
      "Paint"
    ]
  ],
  [
    "A medal for first place",
    "Gold",
    [
      "Silver",
      "Bronze",
      "Wood"
    ]
  ],
  [
    "A person who fixes teeth",
    "Dentist",
    [
      "Pilot",
      "Farmer",
      "Poet"
    ]
  ],
  [
    "A person who treats sick people",
    "Doctor",
    [
      "Chef",
      "Artist",
      "Clerk"
    ]
  ],
  [
    "A person who defends clients in court",
    "Lawyer",
    [
      "Baker",
      "Sailor",
      "Miner"
    ]
  ],
  [
    "A person who grows crops",
    "Farmer",
    [
      "Judge",
      "Actor",
      "Tailor"
    ]
  ],
  [
    "A place where sick people are treated",
    "Hospital",
    [
      "Museum",
      "Theater",
      "Mall"
    ]
  ],
  [
    "A vehicle that carries patients",
    "Ambulance",
    [
      "Taxi",
      "Truck",
      "Bus"
    ]
  ],
  [
    "Medicine that kills bacteria",
    "Antibiotic",
    [
      "Vitamin",
      "Sugar",
      "Salt"
    ]
  ],
  [
    "A high body temperature from illness",
    "Fever",
    [
      "Chill",
      "Calm",
      "Rest"
    ]
  ],
  [
    "A break in a bone",
    "Fracture",
    [
      "Bruise",
      "Scratch",
      "Rash"
    ]
  ],
  [
    "A substance that relieves pain",
    "Analgesic",
    [
      "Poison",
      "Acid",
      "Toxin"
    ]
  ],
  [
    "The study of numbers and shapes",
    "Mathematics",
    [
      "History",
      "Art",
      "Music"
    ]
  ],
  [
    "The study of past events",
    "History",
    [
      "Chemistry",
      "Biology",
      "Physics"
    ]
  ],
  [
    "The study of living things",
    "Biology",
    [
      "Geology",
      "Astronomy",
      "Logic"
    ]
  ],
  [
    "The study of matter and energy",
    "Physics",
    [
      "Grammar",
      "Ethics",
      "Poetry"
    ]
  ],
  [
    "A symbol for a sound in language",
    "Letter",
    [
      "Number",
      "Color",
      "Shape"
    ]
  ],
  [
    "A word with the opposite meaning",
    "Antonym",
    [
      "Synonym",
      "Rhyme",
      "Prefix"
    ]
  ],
  [
    "A word with a similar meaning",
    "Synonym",
    [
      "Antonym",
      "Homonym",
      "Suffix"
    ]
  ],
  [
    "A sentence that asks something",
    "Question",
    [
      "Answer",
      "Command",
      "Name"
    ]
  ],
  [
    "A mark at the end of a sentence",
    "Punctuation",
    [
      "Vowel",
      "Verb",
      "Noun"
    ]
  ],
  [
    "A person, place, or thing",
    "Noun",
    [
      "Verb",
      "Adverb",
      "Conjunction"
    ]
  ],
  [
    "A word that shows action",
    "Verb",
    [
      "Noun",
      "Adjective",
      "Preposition"
    ]
  ],
  [
    "A word that describes a noun",
    "Adjective",
    [
      "Verb",
      "Pronoun",
      "Interjection"
    ]
  ],
  [
    "A word that modifies a verb",
    "Adverb",
    [
      "Noun",
      "Article",
      "Clause"
    ]
  ],
  [
    "A story that is not true",
    "Fiction",
    [
      "Fact",
      "Report",
      "Record"
    ]
  ],
  [
    "A statement that can be proven true",
    "Fact",
    [
      "Myth",
      "Rumor",
      "Guess"
    ]
  ],
  [
    "An opinion widely held but not proven",
    "Belief",
    [
      "Proof",
      "Data",
      "Evidence"
    ]
  ],
  [
    "Careful thought before deciding",
    "Deliberation",
    [
      "Impulse",
      "Haste",
      "Rush"
    ]
  ],
  [
    "A choice between two or more options",
    "Decision",
    [
      "Accident",
      "Chance",
      "Luck"
    ]
  ],
  [
    "A problem that is hard to solve",
    "Dilemma",
    [
      "Solution",
      "Ease",
      "Gift"
    ]
  ],
  [
    "A rule made by a government",
    "Law",
    [
      "Joke",
      "Song",
      "Game"
    ]
  ],
  [
    "A person who makes laws",
    "Legislator",
    [
      "Criminal",
      "Witness",
      "Suspect"
    ]
  ],
  [
    "A serious crime",
    "Felony",
    [
      "Mistake",
      "Joke",
      "Habit"
    ]
  ],
  [
    "A minor crime",
    "Misdemeanor",
    [
      "Virtue",
      "Honor",
      "Praise"
    ]
  ],
  [
    "Money paid to release a prisoner",
    "Bail",
    [
      "Fine",
      "Tax",
      "Rent"
    ]
  ],
  [
    "A group of people in a trial",
    "Jury",
    [
      "Audience",
      "Crowd",
      "Team"
    ]
  ],
  [
    "A formal promise",
    "Oath",
    [
      "Lie",
      "Joke",
      "Guess"
    ]
  ],
  [
    "A lack of fairness",
    "Injustice",
    [
      "Equity",
      "Balance",
      "Fairness"
    ]
  ],
  [
    "Treating everyone the same",
    "Equality",
    [
      "Bias",
      "Favor",
      "Privilege"
    ]
  ],
  [
    "A strong desire to succeed",
    "Ambition",
    [
      "Laziness",
      "Apathy",
      "Indifference"
    ]
  ],
  [
    "Hard work over a long time",
    "Perseverance",
    [
      "Quitting",
      "Surrender",
      "Delay"
    ]
  ],
  [
    "Giving up completely",
    "Surrender",
    [
      "Victory",
      "Advance",
      "Attack"
    ]
  ],
  [
    "A sudden attack",
    "Assault",
    [
      "Retreat",
      "Peace",
      "Truce"
    ]
  ],
  [
    "A period without fighting",
    "Ceasefire",
    [
      "Battle",
      "War",
      "Raid"
    ]
  ],
  [
    "A soldier of high rank",
    "General",
    [
      "Private",
      "Civilian",
      "Child"
    ]
  ],
  [
    "A weapon that shoots bullets",
    "Gun",
    [
      "Shield",
      "Flag",
      "Drum"
    ]
  ],
  [
    "A protective covering in battle",
    "Armor",
    [
      "Rope",
      "Paper",
      "Feather"
    ]
  ],
  [
    "A ship that travels underwater",
    "Submarine",
    [
      "Canoe",
      "Raft",
      "Kayak"
    ]
  ],
  [
    "A tower for guiding ships",
    "Lighthouse",
    [
      "Barn",
      "Shed",
      "Cabin"
    ]
  ],
  [
    "A map of the stars",
    "Chart",
    [
      "Recipe",
      "Poem",
      "Joke"
    ]
  ],
  [
    "The path of a planet around the sun",
    "Orbit",
    [
      "Crash",
      "Fall",
      "Stop"
    ]
  ],
  [
    "A huge explosion of a star",
    "Supernova",
    [
      "Rain",
      "Wind",
      "Fog"
    ]
  ],
  [
    "A rock from outer space",
    "Meteor",
    [
      "Leaf",
      "Shell",
      "Feather"
    ]
  ],
  [
    "The force that pulls objects down",
    "Gravity",
    [
      "Levity",
      "Lift",
      "Float"
    ]
  ],
  [
    "Energy from the sun",
    "Solar",
    [
      "Lunar",
      "Tidal",
      "Wind"
    ]
  ],
  [
    "A machine that does work",
    "Engine",
    [
      "Pillow",
      "Candle",
      "Brush"
    ]
  ],
  [
    "A flow of electricity",
    "Current",
    [
      "Silence",
      "Dark",
      "Still"
    ]
  ],
  [
    "A material that does not conduct electricity",
    "Insulator",
    [
      "Conductor",
      "Wire",
      "Metal"
    ]
  ],
  [
    "A tiny unit of life",
    "Cell",
    [
      "Atom",
      "Star",
      "Rock"
    ]
  ],
  [
    "The center of an atom",
    "Nucleus",
    [
      "Shell",
      "Edge",
      "Ring"
    ]
  ],
  [
    "A gas humans need to breathe",
    "Oxygen",
    [
      "Helium",
      "Neon",
      "Argon"
    ]
  ],
  [
    "Water in gas form",
    "Steam",
    [
      "Ice",
      "Snow",
      "Frost"
    ]
  ],
  [
    "A mixture of two or more substances",
    "Solution",
    [
      "Element",
      "Pure",
      "Solid"
    ]
  ],
  [
    "A substance that cannot be broken down simply",
    "Element",
    [
      "Mixture",
      "Blend",
      "Compound"
    ]
  ],
  [
    "A plant that lives in dry places",
    "Cactus",
    [
      "Moss",
      "Fern",
      "Algae"
    ]
  ],
  [
    "A plant that climbs walls",
    "Ivy",
    [
      "Pine",
      "Oak",
      "Palm"
    ]
  ],
  [
    "A tree that stays green all year",
    "Evergreen",
    [
      "Deciduous",
      "Dead",
      "Bare"
    ]
  ],
  [
    "A tree that loses leaves in fall",
    "Deciduous",
    [
      "Evergreen",
      "Palm",
      "Pine"
    ]
  ],
  [
    "A small flowered plant",
    "Daisy",
    [
      "Oak",
      "Maple",
      "Redwood"
    ]
  ],
  [
    "An area where plants are grown",
    "Garden",
    [
      "Factory",
      "Prison",
      "Arena"
    ]
  ],
  [
    "Rich soil for growing plants",
    "Humus",
    [
      "Sand",
      "Rock",
      "Clay"
    ]
  ],
  [
    "A lack of water in an area",
    "Drought",
    [
      "Flood",
      "Storm",
      "Rain"
    ]
  ],
  [
    "A very large wave from the sea",
    "Tsunami",
    [
      "Breeze",
      "Mist",
      "Dew"
    ]
  ],
  [
    "Rain that freezes on contact",
    "Sleet",
    [
      "Sunshine",
      "Heat",
      "Warmth"
    ]
  ],
  [
    "Soft white ice crystals",
    "Snowflake",
    [
      "Raindrop",
      "Hailstone",
      "Pebble"
    ]
  ],
  [
    "A tool for measuring temperature",
    "Thermometer",
    [
      "Ruler",
      "Scale",
      "Compass"
    ]
  ],
  [
    "A tool for finding direction",
    "Compass",
    [
      "Eraser",
      "Stapler",
      "Pen"
    ]
  ],
  [
    "A flat surface for writing",
    "Desk",
    [
      "Ceiling",
      "Roof",
      "Floor"
    ]
  ],
  [
    "A bag carried on the back",
    "Backpack",
    [
      "Hat",
      "Sock",
      "Ring"
    ]
  ],
  [
    "A pointed writing tool",
    "Pencil",
    [
      "Eraser",
      "Glue",
      "Tape"
    ]
  ],
  [
    "Liquid used for writing",
    "Ink",
    [
      "Paint",
      "Oil",
      "Mud"
    ]
  ],
  [
    "A page in a book",
    "Leaf",
    [
      "Cover",
      "Spine",
      "Shelf"
    ]
  ],
  [
    "A list of chapters in a book",
    "Contents",
    [
      "Index",
      "Glossary",
      "Appendix"
    ]
  ],
  [
    "A word at the top of a dictionary page",
    "Guide",
    [
      "Footer",
      "Margin",
      "Border"
    ]
  ],
  [
    "Speaking two languages well",
    "Bilingual",
    [
      "Mute",
      "Silent",
      "Deaf"
    ]
  ],
  [
    "Unable to speak",
    "Mute",
    [
      "Loud",
      "Noisy",
      "Vocal"
    ]
  ],
  [
    "Unable to hear",
    "Deaf",
    [
      "Blind",
      "Lame",
      "Weak"
    ]
  ],
  [
    "Unable to see",
    "Blind",
    [
      "Deaf",
      "Tall",
      "Fast"
    ]
  ],
  [
    "A person who travels to new places",
    "Explorer",
    [
      "Resident",
      "Hermit",
      "Recluse"
    ]
  ],
  [
    "A person who stays in one place",
    "Settler",
    [
      "Nomad",
      "Wanderer",
      "Drifter"
    ]
  ],
  [
    "A person who wanders without home",
    "Nomad",
    [
      "Mayor",
      "Judge",
      "Clerk"
    ]
  ],
  [
    "A person elected to lead a city",
    "Mayor",
    [
      "Pilot",
      "Sailor",
      "Miner"
    ]
  ],
  [
    "A person who votes in elections",
    "Voter",
    [
      "Candidate",
      "Observer",
      "Referee"
    ]
  ],
  [
    "A person running for office",
    "Candidate",
    [
      "Voter",
      "Spectator",
      "Fan"
    ]
  ],
  [
    "A meeting of leaders to discuss issues",
    "Summit",
    [
      "Party",
      "Picnic",
      "Game"
    ]
  ],
  [
    "A tax on imported goods",
    "Tariff",
    [
      "Gift",
      "Refund",
      "Grant"
    ]
  ],
  [
    "A rise in prices over time",
    "Inflation",
    [
      "Deflation",
      "Stability",
      "Balance"
    ]
  ],
  [
    "A fall in prices over time",
    "Deflation",
    [
      "Inflation",
      "Boom",
      "Surge"
    ]
  ],
  [
    "Money borrowed that must be repaid",
    "Debt",
    [
      "Profit",
      "Gain",
      "Credit"
    ]
  ],
  [
    "Money earned after costs",
    "Profit",
    [
      "Loss",
      "Debt",
      "Expense"
    ]
  ],
  [
    "A person who starts a business",
    "Entrepreneur",
    [
      "Employee",
      "Retiree",
      "Student"
    ]
  ],
  [
    "A person who works for a company",
    "Employee",
    [
      "Owner",
      "Founder",
      "Boss"
    ]
  ],
  [
    "A written request for a job",
    "Application",
    [
      "Resignation",
      "Dismissal",
      "Retirement"
    ]
  ],
  [
    "A meeting to discuss a job",
    "Interview",
    [
      "Vacation",
      "Holiday",
      "Fiesta"
    ]
  ],
  [
    "A period away from work for rest",
    "Vacation",
    [
      "Shift",
      "Overtime",
      "Duty"
    ]
  ],
  [
    "Extra hours worked beyond normal",
    "Overtime",
    [
      "Break",
      "Leave",
      "Rest"
    ]
  ],
  [
    "A sudden idea or invention",
    "Innovation",
    [
      "Tradition",
      "Habit",
      "Routine"
    ]
  ],
  [
    "A custom passed through generations",
    "Tradition",
    [
      "Trend",
      "Fad",
      "Novelty"
    ]
  ],
  [
    "Something new and original",
    "Novelty",
    [
      "Antique",
      "Relic",
      "Fossil"
    ]
  ],
  [
    "An object from ancient times",
    "Artifact",
    [
      "Toy",
      "Snack",
      "Joke"
    ]
  ],
  [
    "The study of ancient cultures",
    "Archaeology",
    [
      "Astronomy",
      "Cooking",
      "Dancing"
    ]
  ],
  [
    "A person who studies ancient remains",
    "Archaeologist",
    [
      "Astronaut",
      "Athlete",
      "Actor"
    ]
  ],
  [
    "A person who travels in space",
    "Astronaut",
    [
      "Sailor",
      "Driver",
      "Chef"
    ]
  ],
  [
    "The science of space and celestial bodies",
    "Astronomy",
    [
      "Botany",
      "Zoology",
      "Geology"
    ]
  ],
  [
    "The study of animals",
    "Zoology",
    [
      "Botany",
      "Chemistry",
      "Ethics"
    ]
  ],
  [
    "The study of plants",
    "Botany",
    [
      "Physics",
      "Logic",
      "Grammar"
    ]
  ],
  [
    "The study of the earth and rocks",
    "Geology",
    [
      "Poetry",
      "Music",
      "Art"
    ]
  ],
  [
    "A person who treats animals",
    "Veterinarian",
    [
      "Dentist",
      "Barber",
      "Tailor"
    ]
  ],
  [
    "A place where animals are kept",
    "Zoo",
    [
      "Bank",
      "Court",
      "Office"
    ]
  ],
  [
    "A home for bees",
    "Hive",
    [
      "Nest",
      "Den",
      "Burrow"
    ]
  ],
  [
    "A home for birds",
    "Nest",
    [
      "Hive",
      "Cave",
      "Hole"
    ]
  ],
  [
    "A home for lions",
    "Den",
    [
      "Nest",
      "Pond",
      "Web"
    ]
  ],
  [
    "A web made by a spider",
    "Web",
    [
      "Nest",
      "Hive",
      "Burrow"
    ]
  ],
  [
    "A small crawling insect",
    "Ant",
    [
      "Eagle",
      "Whale",
      "Bear"
    ]
  ],
  [
    "A large sea mammal",
    "Whale",
    [
      "Ant",
      "Bee",
      "Fly"
    ]
  ],
  [
    "A fast running African cat",
    "Cheetah",
    [
      "Sloth",
      "Snail",
      "Turtle"
    ]
  ],
  [
    "A slow-moving tree animal",
    "Sloth",
    [
      "Cheetah",
      "Hawk",
      "Falcon"
    ]
  ],
  [
    "A bird that hunts at night",
    "Owl",
    [
      "Robin",
      "Duck",
      "Goose"
    ]
  ],
  [
    "A farm bird that lays eggs",
    "Hen",
    [
      "Bull",
      "Ram",
      "Stallion"
    ]
  ],
  [
    "A male sheep",
    "Ram",
    [
      "Hen",
      "Doe",
      "Mare"
    ]
  ],
  [
    "A baby sheep",
    "Lamb",
    [
      "Calf",
      "Foal",
      "Cub"
    ]
  ],
  [
    "A baby cow",
    "Calf",
    [
      "Lamb",
      "Pup",
      "Kit"
    ]
  ],
  [
    "Milk-producing cattle",
    "Dairy",
    [
      "Poultry",
      "Timber",
      "Mining"
    ]
  ],
  [
    "A building for storing grain",
    "Silo",
    [
      "Tower",
      "Bridge",
      "Dock"
    ]
  ],
  [
    "A tool for digging soil",
    "Shovel",
    [
      "Brush",
      "Comb",
      "Pen"
    ]
  ],
  [
    "A tool for cutting wood",
    "Axe",
    [
      "Needle",
      "Thread",
      "Pin"
    ]
  ],
  [
    "A container for liquids",
    "Bottle",
    [
      "Brick",
      "Stone",
      "Log"
    ]
  ],
  [
    "A flat dish for serving food",
    "Plate",
    [
      "Spoon",
      "Fork",
      "Knife"
    ]
  ],
  [
    "A utensil with prongs for eating",
    "Fork",
    [
      "Cup",
      "Bowl",
      "Pan"
    ]
  ],
  [
    "A deep container for soup",
    "Bowl",
    [
      "Plate",
      "Tray",
      "Lid"
    ]
  ],
  [
    "A sweet treat on a stick",
    "Lollipop",
    [
      "Steak",
      "Soup",
      "Salad"
    ]
  ],
  [
    "A frozen sweet dessert",
    "Icecream",
    [
      "Bread",
      "Rice",
      "Pasta"
    ]
  ],
  [
    "A Italian noodle dish",
    "Pasta",
    [
      "Sushi",
      "Taco",
      "Curry"
    ]
  ],
  [
    "A Japanese rice dish with fish",
    "Sushi",
    [
      "Pasta",
      "Pizza",
      "Stew"
    ]
  ],
  [
    "A round flat bread with toppings",
    "Pizza",
    [
      "Soup",
      "Salad",
      "Broth"
    ]
  ],
  [
    "A hot seasoned Indian dish",
    "Curry",
    [
      "Toast",
      "Cereal",
      "Jam"
    ]
  ],
  [
    "A yellow spread for bread",
    "Butter",
    [
      "Sand",
      "Glue",
      "Wax"
    ]
  ],
  [
    "A sweet sticky substance from bees",
    "Honey",
    [
      "Salt",
      "Pepper",
      "Vinegar"
    ]
  ],
  [
    "A sour liquid used in cooking",
    "Vinegar",
    [
      "Honey",
      "Syrup",
      "Cream"
    ]
  ],
  [
    "A white grain eaten worldwide",
    "Rice",
    [
      "Wheat",
      "Barley",
      "Rye"
    ]
  ],
  [
    "A yellow vegetable on a cob",
    "Corn",
    [
      "Apple",
      "Pear",
      "Plum"
    ]
  ],
  [
    "A red vegetable used in salads",
    "Tomato",
    [
      "Potato",
      "Carrot",
      "Onion"
    ]
  ],
  [
    "An orange root vegetable",
    "Carrot",
    [
      "Lettuce",
      "Celery",
      "Spinach"
    ]
  ],
  [
    "Green leaves eaten in salads",
    "Lettuce",
    [
      "Beef",
      "Pork",
      "Ham"
    ]
  ],
  [
    "Meat from cattle",
    "Beef",
    [
      "Fish",
      "Tofu",
      "Rice"
    ]
  ],
  [
    "Meat from pigs",
    "Pork",
    [
      "Fruit",
      "Candy",
      "Cake"
    ]
  ],
  [
    "A person who cooks food professionally",
    "Chef",
    [
      "Driver",
      "Pilot",
      "Clerk"
    ]
  ],
  [
    "A place where meals are served",
    "Restaurant",
    [
      "Garage",
      "School",
      "Prison"
    ]
  ],
  [
    "A person who serves food in a restaurant",
    "Waiter",
    [
      "Guest",
      "Host",
      "Cook"
    ]
  ],
  [
    "Money left for good service",
    "Tip",
    [
      "Tax",
      "Fine",
      "Fee"
    ]
  ],
  [
    "A printed notice advertising something",
    "Poster",
    [
      "Novel",
      "Diary",
      "Letter"
    ]
  ],
  [
    "A daily record of personal events",
    "Journal",
    [
      "Manual",
      "Atlas",
      "Code"
    ]
  ],
  [
    "A book of maps",
    "Atlas",
    [
      "Cookbook",
      "Novel",
      "Comic"
    ]
  ],
  [
    "A book of instructions",
    "Manual",
    [
      "Poem",
      "Song",
      "Joke"
    ]
  ],
  [
    "A long fictional story",
    "Novel",
    [
      "Recipe",
      "Bill",
      "Receipt"
    ]
  ],
  [
    "A short amusing play",
    "Comedy",
    [
      "Tragedy",
      "Horror",
      "Mystery"
    ]
  ],
  [
    "A sad serious play",
    "Tragedy",
    [
      "Comedy",
      "Farce",
      "Satire"
    ]
  ],
  [
    "A person who acts in plays",
    "Actor",
    [
      "Director",
      "Critic",
      "Usher"
    ]
  ],
  [
    "A person who directs a film",
    "Director",
    [
      "Actor",
      "Fan",
      "Extra"
    ]
  ],
  [
    "A building where films are shown",
    "Cinema",
    [
      "Bank",
      "Farm",
      "Mine"
    ]
  ],
  [
    "A live performance on stage",
    "Play",
    [
      "Film",
      "Book",
      "Game"
    ]
  ],
  [
    "A group of actors in a play",
    "Cast",
    [
      "Audience",
      "Crew",
      "Staff"
    ]
  ],
  [
    "People watching a performance",
    "Audience",
    [
      "Cast",
      "Stage",
      "Set"
    ]
  ],
  [
    "A raised platform for performers",
    "Stage",
    [
      "Seat",
      "Aisle",
      "Lobby"
    ]
  ],
  [
    "A painted cloth behind actors",
    "Backdrop",
    [
      "Costume",
      "Prop",
      "Script"
    ]
  ],
  [
    "Clothing worn by an actor",
    "Costume",
    [
      "Script",
      "Cue",
      "Line"
    ]
  ],
  [
    "The words spoken by actors",
    "Dialogue",
    [
      "Music",
      "Dance",
      "Silence"
    ]
  ],
  [
    "A single line spoken by an actor",
    "Line",
    [
      "Scene",
      "Act",
      "Plot"
    ]
  ],
  [
    "The main story of a play or book",
    "Plot",
    [
      "Cover",
      "Title",
      "Page"
    ]
  ],
  [
    "The time and place of a story",
    "Setting",
    [
      "Theme",
      "Mood",
      "Tone"
    ]
  ],
  [
    "The main message of a story",
    "Theme",
    [
      "Plot",
      "Scene",
      "Cast"
    ]
  ],
  [
    "A struggle between opposing forces",
    "Conflict",
    [
      "Peace",
      "Harmony",
      "Calm"
    ]
  ],
  [
    "The final part of a story",
    "Ending",
    [
      "Opening",
      "Middle",
      "Start"
    ]
  ],
  [
    "A hint about future events in a story",
    "Foreshadowing",
    [
      "Flashback",
      "Summary",
      "Title"
    ]
  ],
  [
    "A scene from the past in a story",
    "Flashback",
    [
      "Preview",
      "Sequel",
      "Intro"
    ]
  ],
  [
    "A comparison using like or as",
    "Simile",
    [
      "Metaphor",
      "Rhyme",
      "Meter"
    ]
  ],
  [
    "A comparison without like or as",
    "Metaphor",
    [
      "Simile",
      "Pun",
      "Haiku"
    ]
  ],
  [
    "The repetition of beginning sounds",
    "Alliteration",
    [
      "Rhyme",
      "Meter",
      "Stanza"
    ]
  ],
  [
    "A group of lines in a poem",
    "Stanza",
    [
      "Chapter",
      "Verse",
      "Scene"
    ]
  ],
  [
    "A Japanese poem of three lines",
    "Haiku",
    [
      "Sonnet",
      "Epic",
      "Ode"
    ]
  ],
  [
    "A fourteen-line poem",
    "Sonnet",
    [
      "Haiku",
      "Limerick",
      "Joke"
    ]
  ],
  [
    "A humorous five-line poem",
    "Limerick",
    [
      "Epic",
      "Ode",
      "Hymn"
    ]
  ],
  [
    "A song of praise",
    "Hymn",
    [
      "Curse",
      "Insult",
      "Taunt"
    ]
  ],
  [
    "A rhythmic unit in music",
    "Beat",
    [
      "Note",
      "Rest",
      "Chord"
    ]
  ],
  [
    "A combination of musical notes",
    "Chord",
    [
      "Beat",
      "Rest",
      "Solo"
    ]
  ],
  [
    "A symbol for musical silence",
    "Rest",
    [
      "Note",
      "Chord",
      "Beat"
    ]
  ],
  [
    "A person who writes music",
    "Composer",
    [
      "Dancer",
      "Painter",
      "Sculptor"
    ]
  ],
  [
    "A person who plays an instrument",
    "Musician",
    [
      "Sculptor",
      "Poet",
      "Baker"
    ]
  ],
  [
    "A large keyboard instrument",
    "Piano",
    [
      "Drum",
      "Flute",
      "Harp"
    ]
  ],
  [
    "A stringed instrument played with a bow",
    "Violin",
    [
      "Trumpet",
      "Drum",
      "Flute"
    ]
  ],
  [
    "A brass instrument with valves",
    "Trumpet",
    [
      "Violin",
      "Harp",
      "Piano"
    ]
  ],
  [
    "A percussion instrument struck with sticks",
    "Drum",
    [
      "Flute",
      "Harp",
      "Lute"
    ]
  ],
  [
    "A woodwind instrument held sideways",
    "Flute",
    [
      "Guitar",
      "Cello",
      "Banjo"
    ]
  ],
  [
    "A stringed instrument with six strings",
    "Guitar",
    [
      "Oboe",
      "Tuba",
      "Horn"
    ]
  ],
  [
    "A person who sings",
    "Singer",
    [
      "Dancer",
      "Painter",
      "Writer"
    ]
  ],
  [
    "A person who creates art with paint",
    "Painter",
    [
      "Singer",
      "Driver",
      "Chef"
    ]
  ],
  [
    "A three-dimensional artwork",
    "Sculpture",
    [
      "Poem",
      "Song",
      "Recipe"
    ]
  ],
  [
    "A picture drawn with pencil",
    "Sketch",
    [
      "Sculpture",
      "Song",
      "Dance"
    ]
  ],
  [
    "Brightness or darkness in art",
    "Value",
    [
      "Rhyme",
      "Beat",
      "Line"
    ]
  ],
  [
    "Red, blue, or yellow in art",
    "Primary",
    [
      "Secondary",
      "Neutral",
      "Pastel"
    ]
  ],
  [
    "Green, orange, or purple in art",
    "Secondary",
    [
      "Primary",
      "Neutral",
      "Tint"
    ]
  ],
  [
    "A tool for applying paint",
    "Brush",
    [
      "Hammer",
      "Saw",
      "Nail"
    ]
  ],
  [
    "A surface for mixing paints",
    "Palette",
    [
      "Canvas",
      "Frame",
      "Easel"
    ]
  ],
  [
    "Cloth stretched for painting",
    "Canvas",
    [
      "Palette",
      "Brush",
      "Ink"
    ]
  ],
  [
    "A stand for holding a canvas",
    "Easel",
    [
      "Stool",
      "Lamp",
      "Rug"
    ]
  ],
  [
    "A building that displays art",
    "Museum",
    [
      "Factory",
      "Prison",
      "Barn"
    ]
  ],
  [
    "An object made long ago",
    "Antique",
    [
      "Toy",
      "Snack",
      "Gadget"
    ]
  ],
  [
    "A very old preserved bone or plant",
    "Fossil",
    [
      "Toy",
      "Coin",
      "Badge"
    ]
  ],
  [
    "The study of fossils",
    "Paleontology",
    [
      "Cooking",
      "Sewing",
      "Fishing"
    ]
  ],
  [
    "A huge extinct reptile",
    "Dinosaur",
    [
      "Rabbit",
      "Mouse",
      "Frog"
    ]
  ],
  [
    "A period of ice and cold",
    "Iceage",
    [
      "Summer",
      "Spring",
      "Harvest"
    ]
  ],
  [
    "The gradual change of species over time",
    "Evolution",
    [
      "Creation",
      "Stasis",
      "Decay"
    ]
  ],
  [
    "An inherited unit of traits",
    "Gene",
    [
      "Cell",
      "Atom",
      "Star"
    ]
  ],
  [
    "The passing of traits from parents",
    "Heredity",
    [
      "Choice",
      "Luck",
      "Chance"
    ]
  ],
  [
    "A difference within a species",
    "Variation",
    [
      "Uniform",
      "Same",
      "Equal"
    ]
  ],
  [
    "The surroundings of an organism",
    "Environment",
    [
      "Genome",
      "Nucleus",
      "Atom"
    ]
  ],
  [
    "Living and nonliving things in an area",
    "Ecosystem",
    [
      "Planet",
      "Galaxy",
      "Universe"
    ]
  ],
  [
    "An animal at risk of extinction",
    "Endangered",
    [
      "Common",
      "Plentiful",
      "Abundant"
    ]
  ],
  [
    "To protect nature and resources",
    "Conserve",
    [
      "Waste",
      "Pollute",
      "Destroy"
    ]
  ],
  [
    "Harmful substances in air or water",
    "Pollution",
    [
      "Purity",
      "Clean",
      "Fresh"
    ]
  ],
  [
    "Able to be broken down naturally",
    "Biodegradable",
    [
      "Plastic",
      "Permanent",
      "Toxic"
    ]
  ],
  [
    "Energy from wind turbines",
    "Windpower",
    [
      "Coal",
      "Oil",
      "Gas"
    ]
  ],
  [
    "A reusable bag for shopping",
    "Tote",
    [
      "Bottle",
      "Straw",
      "Wrapper"
    ]
  ],
  [
    "A community of people in one place",
    "Society",
    [
      "Island",
      "Rock",
      "Cloud"
    ]
  ],
  [
    "Shared customs of a group",
    "Culture",
    [
      "Chaos",
      "Noise",
      "Void"
    ]
  ],
  [
    "Respect for parents and elders",
    "Filial",
    [
      "Rebel",
      "Rude",
      "Harsh"
    ]
  ],
  [
    "Politeness and good manners",
    "Courtesy",
    [
      "Rudeness",
      "Spite",
      "Cruelty"
    ]
  ],
  [
    "A lack of respect",
    "Disrespect",
    [
      "Honor",
      "Praise",
      "Esteem"
    ]
  ],
  [
    "Deep admiration for someone",
    "Reverence",
    [
      "Scorn",
      "Mockery",
      "Disdain"
    ]
  ],
  [
    "A feeling of wanting what others have",
    "Envy",
    [
      "Content",
      "Joy",
      "Pride"
    ]
  ],
  [
    "Satisfaction with what one has",
    "Contentment",
    [
      "Greed",
      "Envy",
      "Craving"
    ]
  ],
  [
    "An intense desire for more",
    "Greed",
    [
      "Charity",
      "Sharing",
      "Giving"
    ]
  ],
  [
    "Willingness to give to others",
    "Generosity",
    [
      "Selfishness",
      "Stinginess",
      "Greed"
    ]
  ],
  [
    "Concern for the suffering of others",
    "Empathy",
    [
      "Apathy",
      "Cruelty",
      "Spite"
    ]
  ],
  [
    "Lack of interest or concern",
    "Apathy",
    [
      "Passion",
      "Zeal",
      "Fervor"
    ]
  ],
  [
    "Great enthusiasm or energy",
    "Zeal",
    [
      "Apathy",
      "Boredom",
      "Lethargy"
    ]
  ],
  [
    "Extreme tiredness",
    "Exhaustion",
    [
      "Energy",
      "Vigor",
      "Strength"
    ]
  ],
  [
    "Physical or mental effort",
    "Exertion",
    [
      "Rest",
      "Ease",
      "Relax"
    ]
  ],
  [
    "Freedom from stress or worry",
    "Relaxation",
    [
      "Tension",
      "Stress",
      "Strain"
    ]
  ],
  [
    "Mental pressure from problems",
    "Stress",
    [
      "Calm",
      "Peace",
      "Ease"
    ]
  ],
  [
    "A state of being unsure",
    "Uncertainty",
    [
      "Certainty",
      "Confidence",
      "Clarity"
    ]
  ],
  [
    "Complete trust in oneself",
    "Confidence",
    [
      "Doubt",
      "Fear",
      "Shame"
    ]
  ],
  [
    "Belief in one's own worth",
    "Selfesteem",
    [
      "Shame",
      "Guilt",
      "Doubt"
    ]
  ],
  [
    "A feeling of regret for wrongdoing",
    "Guilt",
    [
      "Pride",
      "Joy",
      "Relief"
    ]
  ],
  [
    "Freedom from guilt or worry",
    "Innocence",
    [
      "Guilt",
      "Shame",
      "Blame"
    ]
  ],
  [
    "To forgive someone",
    "Pardon",
    [
      "Blame",
      "Punish",
      "Condemn"
    ]
  ],
  [
    "To say something is wrong",
    "Criticize",
    [
      "Praise",
      "Admire",
      "Honor"
    ]
  ],
  [
    "To express strong approval",
    "Praise",
    [
      "Insult",
      "Mock",
      "Scorn"
    ]
  ],
  [
    "To make something better",
    "Improve",
    [
      "Worsen",
      "Ruin",
      "Harm"
    ]
  ],
  [
    "To make something worse",
    "Worsen",
    [
      "Improve",
      "Fix",
      "Heal"
    ]
  ],
  [
    "To fix something broken",
    "Repair",
    [
      "Break",
      "Smash",
      "Ruin"
    ]
  ],
  [
    "To keep something safe",
    "Protect",
    [
      "Expose",
      "Harm",
      "Risk"
    ]
  ],
  [
    "To put someone in danger",
    "Endanger",
    [
      "Protect",
      "Shield",
      "Guard"
    ]
  ],
  [
    "To move from one place to another",
    "Relocate",
    [
      "Stay",
      "Remain",
      "Settle"
    ]
  ],
  [
    "To come back to a place",
    "Return",
    [
      "Leave",
      "Depart",
      "Flee"
    ]
  ],
  [
    "To go away from a place",
    "Depart",
    [
      "Arrive",
      "Enter",
      "Stay"
    ]
  ],
  [
    "To reach a destination",
    "Arrive",
    [
      "Leave",
      "Miss",
      "Fail"
    ]
  ],
  [
    "To fail to hit a target",
    "Miss",
    [
      "Hit",
      "Strike",
      "Reach"
    ]
  ],
  [
    "To hit a target accurately",
    "Strike",
    [
      "Miss",
      "Avoid",
      "Dodge"
    ]
  ],
  [
    "To avoid something skillfully",
    "Dodge",
    [
      "Hit",
      "Meet",
      "Face"
    ]
  ],
  [
    "To face a problem directly",
    "Confront",
    [
      "Avoid",
      "Flee",
      "Hide"
    ]
  ],
  [
    "To escape from danger",
    "Flee",
    [
      "Stay",
      "Face",
      "Meet"
    ]
  ],
  [
    "To meet someone by chance",
    "Encounter",
    [
      "Avoid",
      "Miss",
      "Skip"
    ]
  ],
  [
    "To skip over something",
    "Omit",
    [
      "Include",
      "Add",
      "Insert"
    ]
  ],
  [
    "To add something extra",
    "Include",
    [
      "Remove",
      "Delete",
      "Omit"
    ]
  ],
  [
    "To remove completely",
    "Eliminate",
    [
      "Add",
      "Keep",
      "Retain"
    ]
  ],
  [
    "To keep or continue to have",
    "Retain",
    [
      "Lose",
      "Drop",
      "Release"
    ]
  ],
  [
    "To let go of something",
    "Release",
    [
      "Hold",
      "Grip",
      "Clutch"
    ]
  ],
  [
    "To hold tightly",
    "Grip",
    [
      "Release",
      "Drop",
      "Loosen"
    ]
  ],
  [
    "To make something loose",
    "Loosen",
    [
      "Tighten",
      "Grip",
      "Clamp"
    ]
  ],
  [
    "To make something tight",
    "Tighten",
    [
      "Loosen",
      "Relax",
      "Slack"
    ]
  ],
  [
    "To fold paper neatly",
    "Crease",
    [
      "Tear",
      "Rip",
      "Shred"
    ]
  ],
  [
    "To tear into small pieces",
    "Shred",
    [
      "Tape",
      "Glue",
      "Bind"
    ]
  ],
  [
    "To stick things together",
    "Adhere",
    [
      "Separate",
      "Split",
      "Divide"
    ]
  ],
  [
    "To split into parts",
    "Divide",
    [
      "Unite",
      "Join",
      "Merge"
    ]
  ],
  [
    "To join into one",
    "Unite",
    [
      "Split",
      "Divide",
      "Separate"
    ]
  ],
  [
    "To combine into a whole",
    "Integrate",
    [
      "Isolate",
      "Split",
      "Detach"
    ]
  ],
  [
    "To set apart from others",
    "Isolate",
    [
      "Unite",
      "Join",
      "Blend"
    ]
  ],
  [
    "To mix thoroughly",
    "Blend",
    [
      "Separate",
      "Split",
      "Sort"
    ]
  ],
  [
    "To arrange in order",
    "Sort",
    [
      "Mix",
      "Scatter",
      "Shuffle"
    ]
  ],
  [
    "To mix randomly",
    "Shuffle",
    [
      "Sort",
      "Order",
      "Align"
    ]
  ],
  [
    "To line up in a row",
    "Align",
    [
      "Scatter",
      "Tangle",
      "Twist"
    ]
  ],
  [
    "To twist into knots",
    "Tangle",
    [
      "Straighten",
      "Align",
      "Order"
    ]
  ],
  [
    "To make straight",
    "Straighten",
    [
      "Bend",
      "Curve",
      "Twist"
    ]
  ],
  [
    "To bend into a curve",
    "Curve",
    [
      "Straighten",
      "Flatten",
      "Level"
    ]
  ],
  [
    "To make flat and even",
    "Level",
    [
      "Slope",
      "Tilt",
      "Tip"
    ]
  ],
  [
    "To lean to one side",
    "Tilt",
    [
      "Level",
      "Balance",
      "Center"
    ]
  ],
  [
    "To keep steady and balanced",
    "Balance",
    [
      "Tilt",
      "Tip",
      "Fall"
    ]
  ],
  [
    "To fall suddenly",
    "Collapse",
    [
      "Rise",
      "Stand",
      "Grow"
    ]
  ],
  [
    "To grow larger",
    "Expand",
    [
      "Shrink",
      "Contract",
      "Reduce"
    ]
  ],
  [
    "To become smaller",
    "Shrink",
    [
      "Expand",
      "Grow",
      "Stretch"
    ]
  ],
  [
    "To stretch to full length",
    "Extend",
    [
      "Shrink",
      "Fold",
      "Curl"
    ]
  ],
  [
    "To curl into a ball",
    "Curl",
    [
      "Stretch",
      "Extend",
      "Spread"
    ]
  ],
  [
    "To spread over an area",
    "Spread",
    [
      "Gather",
      "Collect",
      "Heap"
    ]
  ],
  [
    "To bring things together",
    "Gather",
    [
      "Scatter",
      "Spread",
      "Disperse"
    ]
  ],
  [
    "To scatter in different directions",
    "Disperse",
    [
      "Gather",
      "Collect",
      "Unite"
    ]
  ],
  [
    "To collect over time",
    "Accumulate",
    [
      "Lose",
      "Spend",
      "Waste"
    ]
  ],
  [
    "To use up completely",
    "Exhaust",
    [
      "Save",
      "Store",
      "Keep"
    ]
  ],
  [
    "To save for later use",
    "Store",
    [
      "Waste",
      "Spend",
      "Lose"
    ]
  ],
  [
    "To throw away as useless",
    "Discard",
    [
      "Keep",
      "Save",
      "Cherish"
    ]
  ],
  [
    "To value greatly",
    "Cherish",
    [
      "Discard",
      "Ignore",
      "Neglect"
    ]
  ],
  [
    "To pay no attention to",
    "Neglect",
    [
      "Cherish",
      "Care",
      "Tend"
    ]
  ],
  [
    "To take care of",
    "Tend",
    [
      "Neglect",
      "Ignore",
      "Abandon"
    ]
  ],
  [
    "To leave behind forever",
    "Abandon",
    [
      "Keep",
      "Stay",
      "Remain"
    ]
  ],
  [
    "To stay in a place",
    "Remain",
    [
      "Leave",
      "Depart",
      "Flee"
    ]
  ],
  [
    "To continue without stopping",
    "Persist",
    [
      "Quit",
      "Stop",
      "Cease"
    ]
  ],
  [
    "To stop doing something",
    "Cease",
    [
      "Continue",
      "Persist",
      "Proceed"
    ]
  ],
  [
    "To go forward",
    "Proceed",
    [
      "Retreat",
      "Stop",
      "Halt"
    ]
  ],
  [
    "To move backward",
    "Retreat",
    [
      "Advance",
      "Proceed",
      "Charge"
    ]
  ],
  [
    "To move forward boldly",
    "Advance",
    [
      "Retreat",
      "Flee",
      "Withdraw"
    ]
  ],
  [
    "To take back a statement",
    "Retract",
    [
      "Affirm",
      "State",
      "Claim"
    ]
  ],
  [
    "To state something firmly",
    "Assert",
    [
      "Deny",
      "Retract",
      "Doubt"
    ]
  ],
  [
    "To say something is not true",
    "Deny",
    [
      "Admit",
      "Confess",
      "Affirm"
    ]
  ],
  [
    "To admit the truth",
    "Admit",
    [
      "Deny",
      "Hide",
      "Conceal"
    ]
  ],
  [
    "To hide from view",
    "Conceal",
    [
      "Reveal",
      "Show",
      "Expose"
    ]
  ],
  [
    "To make known",
    "Reveal",
    [
      "Conceal",
      "Hide",
      "Mask"
    ]
  ],
  [
    "To cover the face",
    "Mask",
    [
      "Reveal",
      "Expose",
      "Bare"
    ]
  ],
  [
    "To remove clothing",
    "Undress",
    [
      "Dress",
      "Wear",
      "Clothe"
    ]
  ],
  [
    "To put on clothing",
    "Dress",
    [
      "Undress",
      "Strip",
      "Bare"
    ]
  ],
  [
    "To wear something",
    "Don",
    [
      "Remove",
      "Shed",
      "Strip"
    ]
  ],
  [
    "To take off clothing",
    "Shed",
    [
      "Don",
      "Wear",
      "Clothe"
    ]
  ],
  [
    "To clean with water",
    "Wash",
    [
      "Soil",
      "Stain",
      "Dirty"
    ]
  ],
  [
    "To make dirty",
    "Soil",
    [
      "Wash",
      "Clean",
      "Rinse"
    ]
  ],
  [
    "To dry with a cloth",
    "Wipe",
    [
      "Soak",
      "Flood",
      "Drench"
    ]
  ],
  [
    "To cover completely with liquid",
    "Drench",
    [
      "Dry",
      "Wipe",
      "Dust"
    ]
  ],
  [
    "To remove dust",
    "Dust",
    [
      "Soil",
      "Stain",
      "Spill"
    ]
  ],
  [
    "To spill liquid accidentally",
    "Spill",
    [
      "Pour",
      "Fill",
      "Load"
    ]
  ],
  [
    "To fill a container",
    "Fill",
    [
      "Empty",
      "Drain",
      "Pour"
    ]
  ],
  [
    "To remove all contents",
    "Empty",
    [
      "Fill",
      "Load",
      "Pack"
    ]
  ],
  [
    "To pack tightly",
    "Stuff",
    [
      "Empty",
      "Clear",
      "Drain"
    ]
  ],
  [
    "To make a hole in something",
    "Pierce",
    [
      "Seal",
      "Close",
      "Block"
    ]
  ],
  [
    "To close an opening",
    "Seal",
    [
      "Open",
      "Pierce",
      "Break"
    ]
  ],
  [
    "To open a locked door",
    "Unlock",
    [
      "Lock",
      "Seal",
      "Shut"
    ]
  ],
  [
    "To fasten with a lock",
    "Lock",
    [
      "Unlock",
      "Open",
      "Free"
    ]
  ],
  [
    "To set free",
    "Liberate",
    [
      "Capture",
      "Trap",
      "Bind"
    ]
  ],
  [
    "To catch and hold",
    "Capture",
    [
      "Release",
      "Free",
      "Liberate"
    ]
  ],
  [
    "To trick someone",
    "Deceive",
    [
      "Inform",
      "Guide",
      "Help"
    ]
  ],
  [
    "To tell the truth openly",
    "Confess",
    [
      "Deny",
      "Hide",
      "Lie"
    ]
  ],
  [
    "To say something untrue",
    "Lie",
    [
      "Confess",
      "Admit",
      "Reveal"
    ]
  ],
  [
    "To guess without certainty",
    "Speculate",
    [
      "Know",
      "Prove",
      "Verify"
    ]
  ],
  [
    "To prove something true",
    "Verify",
    [
      "Guess",
      "Doubt",
      "Deny"
    ]
  ],
  [
    "To doubt something",
    "Doubt",
    [
      "Trust",
      "Believe",
      "Accept"
    ]
  ],
  [
    "To accept as true",
    "Believe",
    [
      "Doubt",
      "Reject",
      "Deny"
    ]
  ],
  [
    "To refuse to accept",
    "Reject",
    [
      "Accept",
      "Welcome",
      "Embrace"
    ]
  ],
  [
    "To welcome warmly",
    "Embrace",
    [
      "Reject",
      "Shun",
      "Spurn"
    ]
  ],
  [
    "To avoid deliberately",
    "Shun",
    [
      "Embrace",
      "Seek",
      "Pursue"
    ]
  ],
  [
    "To chase after",
    "Pursue",
    [
      "Flee",
      "Avoid",
      "Shun"
    ]
  ],
  [
    "To search carefully",
    "Scour",
    [
      "Ignore",
      "Skip",
      "Miss"
    ]
  ],
  [
    "To find by searching",
    "Locate",
    [
      "Lose",
      "Hide",
      "Miss"
    ]
  ],
  [
    "To lose track of",
    "Misplace",
    [
      "Find",
      "Locate",
      "Keep"
    ]
  ],
  [
    "To remember clearly",
    "Recall",
    [
      "Forget",
      "Ignore",
      "Miss"
    ]
  ],
  [
    "To forget completely",
    "Forget",
    [
      "Recall",
      "Remember",
      "Know"
    ]
  ],
  [
    "To learn by heart",
    "Memorize",
    [
      "Forget",
      "Ignore",
      "Skip"
    ]
  ],
  [
    "To understand fully",
    "Comprehend",
    [
      "Confuse",
      "Mislead",
      "Baffle"
    ]
  ],
  [
    "To confuse someone",
    "Baffle",
    [
      "Explain",
      "Clarify",
      "Guide"
    ]
  ],
  [
    "To make clear",
    "Clarify",
    [
      "Confuse",
      "Obscure",
      "Blur"
    ]
  ],
  [
    "To make unclear",
    "Obscure",
    [
      "Clarify",
      "Explain",
      "Reveal"
    ]
  ],
  [
    "To explain in detail",
    "Elaborate",
    [
      "Simplify",
      "Shorten",
      "Trim"
    ]
  ],
  [
    "To make simpler",
    "Simplify",
    [
      "Complicate",
      "Expand",
      "Elaborate"
    ]
  ],
  [
    "To make more complex",
    "Complicate",
    [
      "Simplify",
      "Ease",
      "Clarify"
    ]
  ],
  [
    "To solve a problem",
    "Solve",
    [
      "Create",
      "Cause",
      "Pose"
    ]
  ],
  [
    "To cause a problem",
    "Cause",
    [
      "Solve",
      "Fix",
      "Cure"
    ]
  ],
  [
    "To cure an illness",
    "Cure",
    [
      "Cause",
      "Spread",
      "Infect"
    ]
  ],
  [
    "To spread disease",
    "Infect",
    [
      "Cure",
      "Heal",
      "Treat"
    ]
  ],
  [
    "To heal a wound",
    "Heal",
    [
      "Harm",
      "Hurt",
      "Wound"
    ]
  ],
  [
    "To injure the body",
    "Injure",
    [
      "Heal",
      "Fix",
      "Cure"
    ]
  ],
  [
    "To feel physical pain",
    "Ache",
    [
      "Enjoy",
      "Relax",
      "Rest"
    ]
  ],
  [
    "To rest the body",
    "Rest",
    [
      "Work",
      "Run",
      "Labor"
    ]
  ],
  [
    "To work hard physically",
    "Labor",
    [
      "Rest",
      "Idle",
      "Relax"
    ]
  ],
  [
    "To sit and do nothing",
    "Idle",
    [
      "Work",
      "Strive",
      "Toil"
    ]
  ],
  [
    "To strive with effort",
    "Strive",
    [
      "Quit",
      "Idle",
      "Rest"
    ]
  ],
  [
    "To quit trying",
    "Quit",
    [
      "Strive",
      "Persist",
      "Continue"
    ]
  ],
  [
    "To win a contest",
    "Win",
    [
      "Lose",
      "Fail",
      "Forfeit"
    ]
  ],
  [
    "To lose a contest",
    "Lose",
    [
      "Win",
      "Triumph",
      "Prevail"
    ]
  ],
  [
    "To compete against others",
    "Compete",
    [
      "Cooperate",
      "Share",
      "Unite"
    ]
  ],
  [
    "To work together",
    "Cooperate",
    [
      "Compete",
      "Fight",
      "Oppose"
    ]
  ],
  [
    "To fight against",
    "Oppose",
    [
      "Support",
      "Aid",
      "Back"
    ]
  ],
  [
    "To support someone",
    "Support",
    [
      "Oppose",
      "Block",
      "Hinder"
    ]
  ],
  [
    "To block progress",
    "Hinder",
    [
      "Help",
      "Aid",
      "Assist"
    ]
  ],
  [
    "To help someone",
    "Assist",
    [
      "Hinder",
      "Block",
      "Harm"
    ]
  ],
  [
    "To harm someone",
    "Harm",
    [
      "Help",
      "Heal",
      "Aid"
    ]
  ],
  [
    "To benefit someone",
    "Benefit",
    [
      "Harm",
      "Hurt",
      "Damage"
    ]
  ],
  [
    "To damage property",
    "Damage",
    [
      "Repair",
      "Fix",
      "Mend"
    ]
  ],
  [
    "To fix a small flaw",
    "Mend",
    [
      "Break",
      "Ruin",
      "Smash"
    ]
  ],
  [
    "To destroy completely",
    "Ruin",
    [
      "Build",
      "Create",
      "Mend"
    ]
  ],
  [
    "To create something new",
    "Create",
    [
      "Destroy",
      "Ruin",
      "Erase"
    ]
  ],
  [
    "To erase writing",
    "Erase",
    [
      "Write",
      "Draw",
      "Paint"
    ]
  ],
  [
    "To draw a picture",
    "Draw",
    [
      "Erase",
      "Delete",
      "Remove"
    ]
  ],
  [
    "To color with crayons",
    "Color",
    [
      "Erase",
      "Fade",
      "Bleach"
    ]
  ],
  [
    "To fade in brightness",
    "Fade",
    [
      "Brighten",
      "Glow",
      "Shine"
    ]
  ],
  [
    "To shine brightly",
    "Shine",
    [
      "Fade",
      "Dim",
      "Darken"
    ]
  ],
  [
    "To become dark",
    "Darken",
    [
      "Brighten",
      "Lighten",
      "Glow"
    ]
  ],
  [
    "To make lighter in color",
    "Lighten",
    [
      "Darken",
      "Deepen",
      "Shade"
    ]
  ],
  [
    "To add shadow",
    "Shade",
    [
      "Brighten",
      "Lighten",
      "Glow"
    ]
  ],
  [
    "To glow softly",
    "Glimmer",
    [
      "Fade",
      "Dim",
      "Darken"
    ]
  ],
  [
    "A brief flash of light",
    "Gleam",
    [
      "Shadow",
      "Dark",
      "Gloom"
    ]
  ],
  [
    "Complete darkness",
    "Gloom",
    [
      "Light",
      "Glow",
      "Gleam"
    ]
  ],
  [
    "A pale soft light",
    "Twilight",
    [
      "Noon",
      "Dawn",
      "Blaze"
    ]
  ],
  [
    "The first light of day",
    "Dawn",
    [
      "Dusk",
      "Night",
      "Dark"
    ]
  ],
  [
    "The last light of day",
    "Dusk",
    [
      "Dawn",
      "Noon",
      "Day"
    ]
  ],
  [
    "The middle of the day",
    "Noon",
    [
      "Midnight",
      "Dawn",
      "Dusk"
    ]
  ],
  [
    "The middle of the night",
    "Midnight",
    [
      "Noon",
      "Dawn",
      "Day"
    ]
  ],
  [
    "A period of seven days",
    "Week",
    [
      "Hour",
      "Minute",
      "Second"
    ]
  ],
  [
    "A period of twelve months",
    "Year",
    [
      "Day",
      "Hour",
      "Week"
    ]
  ],
  [
    "Sixty minutes",
    "Hour",
    [
      "Second",
      "Day",
      "Year"
    ]
  ],
  [
    "Sixty seconds",
    "Minute",
    [
      "Year",
      "Month",
      "Week"
    ]
  ],
  [
    "A very short time",
    "Moment",
    [
      "Era",
      "Age",
      "Epoch"
    ]
  ],
  [
    "A long period of history",
    "Era",
    [
      "Moment",
      "Second",
      "Instant"
    ]
  ],
  [
    "A yearly celebration of birth",
    "Birthday",
    [
      "Funeral",
      "Trial",
      "Exam"
    ]
  ],
  [
    "A ceremony for the dead",
    "Funeral",
    [
      "Wedding",
      "Party",
      "Feast"
    ]
  ],
  [
    "A marriage ceremony",
    "Wedding",
    [
      "Funeral",
      "Trial",
      "Exam"
    ]
  ],
  [
    "A formal promise in marriage",
    "Vow",
    [
      "Joke",
      "Lie",
      "Guess"
    ]
  ],
  [
    "A person about to be married",
    "Bride",
    [
      "Groom",
      "Judge",
      "Clerk"
    ]
  ],
  [
    "A person marrying a bride",
    "Groom",
    [
      "Bride",
      "Guest",
      "Usher"
    ]
  ],
  [
    "A child of parents",
    "Offspring",
    [
      "Parent",
      "Ancestor",
      "Elder"
    ]
  ],
  [
    "A father or mother",
    "Parent",
    [
      "Child",
      "Sibling",
      "Cousin"
    ]
  ],
  [
    "A brother or sister",
    "Sibling",
    [
      "Parent",
      "Uncle",
      "Aunt"
    ]
  ],
  [
    "A child of an aunt or uncle",
    "Cousin",
    [
      "Sibling",
      "Parent",
      "Spouse"
    ]
  ],
  [
    "A husband or wife",
    "Spouse",
    [
      "Sibling",
      "Cousin",
      "Neighbor"
    ]
  ],
  [
    "A person living nearby",
    "Neighbor",
    [
      "Stranger",
      "Foreigner",
      "Alien"
    ]
  ],
  [
    "A person from another country",
    "Foreigner",
    [
      "Native",
      "Local",
      "Citizen"
    ]
  ],
  [
    "A person born in a place",
    "Native",
    [
      "Foreigner",
      "Tourist",
      "Guest"
    ]
  ],
  [
    "A person visiting for pleasure",
    "Tourist",
    [
      "Resident",
      "Native",
      "Local"
    ]
  ],
  [
    "A ticket for travel",
    "Passport",
    [
      "Recipe",
      "Poem",
      "Map"
    ]
  ],
  [
    "Official permission to enter a country",
    "Visa",
    [
      "Ticket",
      "Badge",
      "Pin"
    ]
  ],
  [
    "Bags taken on a trip",
    "Luggage",
    [
      "Furniture",
      "Food",
      "Fuel"
    ]
  ],
  [
    "A place to stay when traveling",
    "Hotel",
    [
      "Farm",
      "Mine",
      "Dock"
    ]
  ],
  [
    "A small paid ride in a city",
    "Taxi",
    [
      "Train",
      "Plane",
      "Ship"
    ]
  ],
  [
    "A track vehicle for passengers",
    "Train",
    [
      "Bicycle",
      "Skate",
      "Walk"
    ]
  ],
  [
    "A large ship for passengers",
    "Cruise",
    [
      "Canoe",
      "Raft",
      "Kayak"
    ]
  ],
  [
    "A small boat moved by paddles",
    "Canoe",
    [
      "Cruise",
      "Tanker",
      "Ferry"
    ]
  ],
  [
    "A boat that carries cars across water",
    "Ferry",
    [
      "Canoe",
      "Yacht",
      "Skiff"
    ]
  ],
  [
    "A luxury boat for pleasure",
    "Yacht",
    [
      "Raft",
      "Canoe",
      "Skiff"
    ]
  ],
  [
    "A floating platform of logs",
    "Raft",
    [
      "Yacht",
      "Cruise",
      "Tanker"
    ]
  ],
  [
    "A road above ground level",
    "Overpass",
    [
      "Tunnel",
      "Bridge",
      "Path"
    ]
  ],
  [
    "A passage under ground",
    "Tunnel",
    [
      "Bridge",
      "Tower",
      "Dam"
    ]
  ],
  [
    "A wall built to hold water",
    "Dam",
    [
      "Fence",
      "Gate",
      "Door"
    ]
  ],
  [
    "A barrier around a yard",
    "Fence",
    [
      "River",
      "Cloud",
      "Star"
    ]
  ],
  [
    "An entrance barrier that swings open",
    "Gate",
    [
      "Roof",
      "Wall",
      "Floor"
    ]
  ],
  [
    "The top covering of a building",
    "Roof",
    [
      "Floor",
      "Wall",
      "Door"
    ]
  ],
  [
    "The bottom surface of a room",
    "Floor",
    [
      "Ceiling",
      "Roof",
      "Wall"
    ]
  ],
  [
    "The upper inner surface of a room",
    "Ceiling",
    [
      "Floor",
      "Yard",
      "Path"
    ]
  ],
  [
    "An open area beside a house",
    "Yard",
    [
      "Attic",
      "Cellar",
      "Hall"
    ]
  ],
  [
    "A room at the top of a house",
    "Attic",
    [
      "Cellar",
      "Porch",
      "Deck"
    ]
  ],
  [
    "A room below ground level",
    "Cellar",
    [
      "Attic",
      "Roof",
      "Tower"
    ]
  ],
  [
    "A covered entrance to a house",
    "Porch",
    [
      "Attic",
      "Cellar",
      "Chimney"
    ]
  ],
  [
    "A pipe that carries smoke out",
    "Chimney",
    [
      "Window",
      "Door",
      "Rug"
    ]
  ],
  [
    "An opening in a wall for light",
    "Window",
    [
      "Door",
      "Wall",
      "Floor"
    ]
  ],
  [
    "An opening for entering a room",
    "Door",
    [
      "Window",
      "Roof",
      "Wall"
    ]
  ],
  [
    "A soft floor covering",
    "Carpet",
    [
      "Tile",
      "Brick",
      "Stone"
    ]
  ],
  [
    "A square ceramic floor piece",
    "Tile",
    [
      "Carpet",
      "Rug",
      "Mat"
    ]
  ],
  [
    "A small floor mat",
    "Mat",
    [
      "Carpet",
      "Curtain",
      "Blind"
    ]
  ],
  [
    "A cloth hanging over a window",
    "Curtain",
    [
      "Blind",
      "Rug",
      "Mat"
    ]
  ],
  [
    "A covering that blocks light",
    "Blind",
    [
      "Curtain",
      "Lamp",
      "Bulb"
    ]
  ],
  [
    "A device that gives light",
    "Lamp",
    [
      "Rug",
      "Mat",
      "Bin"
    ]
  ],
  [
    "A glass part that produces light",
    "Bulb",
    [
      "Switch",
      "Wire",
      "Plug"
    ]
  ],
  [
    "A device that controls electricity flow",
    "Switch",
    [
      "Bulb",
      "Cord",
      "Fuse"
    ]
  ],
  [
    "A cord that carries electricity",
    "Cord",
    [
      "Rope",
      "Chain",
      "Belt"
    ]
  ],
  [
    "Metal that conducts electricity",
    "Copper",
    [
      "Wood",
      "Plastic",
      "Rubber"
    ]
  ],
  [
    "A hard shiny yellow metal",
    "Gold",
    [
      "Lead",
      "Tin",
      "Zinc"
    ]
  ],
  [
    "A strong gray metal",
    "Steel",
    [
      "Wool",
      "Cotton",
      "Silk"
    ]
  ],
  [
    "A soft white metal",
    "Silver",
    [
      "Iron",
      "Coal",
      "Salt"
    ]
  ],
  [
    "Fuel from underground",
    "Coal",
    [
      "Ice",
      "Snow",
      "Rain"
    ]
  ],
  [
    "Liquid fuel from the ground",
    "Oil",
    [
      "Water",
      "Juice",
      "Milk"
    ]
  ],
  [
    "Gas used for heating",
    "Propane",
    [
      "Oxygen",
      "Nitrogen",
      "Helium"
    ]
  ],
  [
    "Power from falling water",
    "Hydro",
    [
      "Solar",
      "Wind",
      "Tidal"
    ]
  ],
  [
    "Energy from ocean tides",
    "Tidal",
    [
      "Solar",
      "Wind",
      "Coal"
    ]
  ],
  [
    "A reusable energy source",
    "Renewable",
    [
      "Fossil",
      "Coal",
      "Oil"
    ]
  ],
  [
    "Fuel from ancient plants",
    "Fossil",
    [
      "Renewable",
      "Solar",
      "Wind"
    ]
  ],
  [
    "A chart showing weather",
    "Forecast",
    [
      "Recipe",
      "Poem",
      "Song"
    ]
  ],
  [
    "Moisture in the air on a cool night",
    "Dew",
    [
      "Hail",
      "Sleet",
      "Snow"
    ]
  ],
  [
    "Thick cloud near the ground",
    "Fog",
    [
      "Sun",
      "Wind",
      "Heat"
    ]
  ],
  [
    "A gentle wind",
    "Breeze",
    [
      "Gale",
      "Storm",
      "Hurricane"
    ]
  ],
  [
    "A very strong wind",
    "Gale",
    [
      "Breeze",
      "Calm",
      "Still"
    ]
  ],
  [
    "A storm with heavy rain and wind",
    "Hurricane",
    [
      "Breeze",
      "Calm",
      "Drizzle"
    ]
  ],
  [
    "Light rain",
    "Drizzle",
    [
      "Flood",
      "Storm",
      "Gale"
    ]
  ],
  [
    "Too much water covering land",
    "Flood",
    [
      "Drought",
      "Dry",
      "Arid"
    ]
  ],
  [
    "Extremely dry land",
    "Arid",
    [
      "Wet",
      "Damp",
      "Humid"
    ]
  ],
  [
    "Air with much moisture",
    "Humid",
    [
      "Dry",
      "Arid",
      "Parched"
    ]
  ],
  [
    "Very thirsty or dry",
    "Parched",
    [
      "Wet",
      "Damp",
      "Moist"
    ]
  ],
  [
    "Slightly wet",
    "Damp",
    [
      "Dry",
      "Arid",
      "Parched"
    ]
  ],
  [
    "Completely wet",
    "Soaked",
    [
      "Dry",
      "Arid",
      "Bare"
    ]
  ],
  [
    "Without covering or clothing",
    "Bare",
    [
      "Covered",
      "Clad",
      "Dressed"
    ]
  ],
  [
    "Protected from weather",
    "Sheltered",
    [
      "Exposed",
      "Open",
      "Bare"
    ]
  ],
  [
    "Open to weather or danger",
    "Exposed",
    [
      "Sheltered",
      "Safe",
      "Guarded"
    ]
  ],
  [
    "Free from danger",
    "Safe",
    [
      "Risky",
      "Unsafe",
      "Hazardous"
    ]
  ],
  [
    "Full of risk",
    "Hazardous",
    [
      "Safe",
      "Secure",
      "Sound"
    ]
  ],
  [
    "Protected from harm",
    "Secure",
    [
      "Risky",
      "Unsafe",
      "Loose"
    ]
  ],
  [
    "Likely to cause harm",
    "Harmful",
    [
      "Helpful",
      "Safe",
      "Benign"
    ]
  ],
  [
    "Not causing harm",
    "Benign",
    [
      "Harmful",
      "Toxic",
      "Deadly"
    ]
  ],
  [
    "Able to cause death",
    "Deadly",
    [
      "Harmless",
      "Safe",
      "Mild"
    ]
  ],
  [
    "Gentle and not harsh",
    "Mild",
    [
      "Severe",
      "Harsh",
      "Extreme"
    ]
  ],
  [
    "Very serious or harsh",
    "Severe",
    [
      "Mild",
      "Gentle",
      "Soft"
    ]
  ],
  [
    "At the highest degree",
    "Extreme",
    [
      "Mild",
      "Moderate",
      "Slight"
    ]
  ],
  [
    "In the middle amount",
    "Moderate",
    [
      "Extreme",
      "Excess",
      "Radical"
    ]
  ],
  [
    "More than enough",
    "Excess",
    [
      "Lack",
      "Need",
      "Want"
    ]
  ],
  [
    "A strong need for something",
    "Craving",
    [
      "Disgust",
      "Aversion",
      "Refusal"
    ]
  ],
  [
    "A strong dislike",
    "Aversion",
    [
      "Love",
      "Liking",
      "Desire"
    ]
  ],
  [
    "A strong liking",
    "Fondness",
    [
      "Hatred",
      "Dislike",
      "Scorn"
    ]
  ],
  [
    "Deep intense dislike",
    "Hatred",
    [
      "Love",
      "Admiration",
      "Affection"
    ]
  ],
  [
    "Deep caring affection",
    "Affection",
    [
      "Hatred",
      "Scorn",
      "Spite"
    ]
  ],
  [
    "High regard for someone",
    "Respect",
    [
      "Disrespect",
      "Scorn",
      "Mockery"
    ]
  ],
  [
    "To look up to someone",
    "Admire",
    [
      "Despise",
      "Scorn",
      "Mock"
    ]
  ],
  [
    "To look down on someone",
    "Despise",
    [
      "Admire",
      "Praise",
      "Honor"
    ]
  ],
  [
    "To make fun of someone",
    "Mock",
    [
      "Praise",
      "Honor",
      "Respect"
    ]
  ],
  [
    "To copy in a funny way",
    "Parody",
    [
      "Praise",
      "Honor",
      "Hymn"
    ]
  ],
  [
    "An amusing imitation",
    "Satire",
    [
      "Hymn",
      "Ode",
      "Elegy"
    ]
  ],
  [
    "A sad poem for the dead",
    "Elegy",
    [
      "Joke",
      "Comedy",
      "Farce"
    ]
  ],
  [
    "A long serious poem",
    "Epic",
    [
      "Limerick",
      "Joke",
      "Pun"
    ]
  ],
  [
    "A play on words",
    "Pun",
    [
      "Fact",
      "Law",
      "Rule"
    ]
  ],
  [
    "A secret plan",
    "Scheme",
    [
      "Truth",
      "Fact",
      "Open"
    ]
  ],
  [
    "An open honest act",
    "Frankness",
    [
      "Scheme",
      "Trick",
      "Plot"
    ]
  ],
  [
    "A clever trick",
    "Ruse",
    [
      "Truth",
      "Fact",
      "Gift"
    ]
  ],
  [
    "A gift or special right",
    "Privilege",
    [
      "Duty",
      "Burden",
      "Debt"
    ]
  ],
  [
    "A duty or responsibility",
    "Obligation",
    [
      "Privilege",
      "Right",
      "Freedom"
    ]
  ],
  [
    "Freedom to act",
    "Liberty",
    [
      "Bondage",
      "Chains",
      "Prison"
    ]
  ],
  [
    "State of being chained",
    "Bondage",
    [
      "Liberty",
      "Freedom",
      "Release"
    ]
  ],
  [
    "A place where prisoners are kept",
    "Prison",
    [
      "School",
      "Park",
      "Mall"
    ]
  ],
  [
    "A person who breaks the law",
    "Criminal",
    [
      "Judge",
      "Juror",
      "Witness"
    ]
  ],
  [
    "A person who sees a crime",
    "Witness",
    [
      "Criminal",
      "Thief",
      "Robber"
    ]
  ],
  [
    "A person who steals",
    "Thief",
    [
      "Guard",
      "Judge",
      "Clerk"
    ]
  ],
  [
    "To steal by force",
    "Rob",
    [
      "Give",
      "Donate",
      "Share"
    ]
  ],
  [
    "To give freely",
    "Donate",
    [
      "Steal",
      "Rob",
      "Take"
    ]
  ],
  [
    "To take without permission",
    "Steal",
    [
      "Give",
      "Donate",
      "Offer"
    ]
  ],
  [
    "To offer something",
    "Offer",
    [
      "Refuse",
      "Deny",
      "Reject"
    ]
  ],
  [
    "To say no firmly",
    "Refuse",
    [
      "Accept",
      "Agree",
      "Consent"
    ]
  ],
  [
    "To agree willingly",
    "Consent",
    [
      "Refuse",
      "Deny",
      "Reject"
    ]
  ],
  [
    "To reach an agreement",
    "Negotiate",
    [
      "Fight",
      "Argue",
      "Quarrel"
    ]
  ],
  [
    "To argue angrily",
    "Quarrel",
    [
      "Agree",
      "Unite",
      "Harmonize"
    ]
  ],
  [
    "To live in harmony",
    "Harmonize",
    [
      "Quarrel",
      "Fight",
      "Clash"
    ]
  ],
  [
    "To crash together",
    "Collide",
    [
      "Separate",
      "Avoid",
      "Miss"
    ]
  ],
  [
    "To avoid a crash",
    "Avoid",
    [
      "Meet",
      "Hit",
      "Strike"
    ]
  ],
  [
    "To meet at a point",
    "Intersect",
    [
      "Separate",
      "Split",
      "Diverge"
    ]
  ],
  [
    "To go in different directions",
    "Diverge",
    [
      "Meet",
      "Join",
      "Unite"
    ]
  ],
  [
    "To come together at one point",
    "Converge",
    [
      "Split",
      "Separate",
      "Scatter"
    ]
  ],
  [
    "To scatter widely",
    "Disseminate",
    [
      "Gather",
      "Collect",
      "Hoard"
    ]
  ],
  [
    "To keep a large supply",
    "Hoard",
    [
      "Share",
      "Give",
      "Spend"
    ]
  ],
  [
    "To spend money",
    "Spend",
    [
      "Save",
      "Hoard",
      "Keep"
    ]
  ],
  [
    "To keep money for later",
    "Save",
    [
      "Spend",
      "Waste",
      "Lose"
    ]
  ],
  [
    "To use carelessly",
    "Waste",
    [
      "Save",
      "Conserve",
      "Keep"
    ]
  ],
  [
    "To use wisely",
    "Utilize",
    [
      "Waste",
      "Discard",
      "Ignore"
    ]
  ],
  [
    "To ignore completely",
    "Ignore",
    [
      "Notice",
      "Heed",
      "Observe"
    ]
  ],
  [
    "To watch carefully",
    "Observe",
    [
      "Ignore",
      "Miss",
      "Overlook"
    ]
  ],
  [
    "To fail to notice",
    "Overlook",
    [
      "Notice",
      "See",
      "Spot"
    ]
  ],
  [
    "To see briefly",
    "Glimpse",
    [
      "Stare",
      "Gaze",
      "Study"
    ]
  ],
  [
    "To look steadily",
    "Gaze",
    [
      "Glance",
      "Peek",
      "Blink"
    ]
  ],
  [
    "To look quickly",
    "Glance",
    [
      "Stare",
      "Gaze",
      "Study"
    ]
  ],
  [
    "To close and open eyes quickly",
    "Blink",
    [
      "Stare",
      "Gaze",
      "Glare"
    ]
  ],
  [
    "To stare angrily",
    "Glare",
    [
      "Smile",
      "Laugh",
      "Grin"
    ]
  ],
  [
    "To smile broadly",
    "Grin",
    [
      "Frown",
      "Scowl",
      "Glare"
    ]
  ],
  [
    "To show displeasure with the face",
    "Frown",
    [
      "Smile",
      "Grin",
      "Laugh"
    ]
  ],
  [
    "To laugh quietly",
    "Chuckle",
    [
      "Weep",
      "Sob",
      "Wail"
    ]
  ],
  [
    "To cry loudly",
    "Wail",
    [
      "Laugh",
      "Chuckle",
      "Grin"
    ]
  ],
  [
    "To shed tears",
    "Weep",
    [
      "Laugh",
      "Cheer",
      "Rejoice"
    ]
  ],
  [
    "To feel great joy",
    "Rejoice",
    [
      "Mourn",
      "Grieve",
      "Weep"
    ]
  ],
  [
    "To feel deep sadness",
    "Mourn",
    [
      "Rejoice",
      "Celebrate",
      "Cheer"
    ]
  ],
  [
    "To honor with a ceremony",
    "Celebrate",
    [
      "Mourn",
      "Grieve",
      "Lament"
    ]
  ],
  [
    "To express sorrow",
    "Lament",
    [
      "Celebrate",
      "Cheer",
      "Praise"
    ]
  ],
  [
    "To shout for joy",
    "Cheer",
    [
      "Boo",
      "Hiss",
      "Jeer"
    ]
  ],
  [
    "To shout disapproval",
    "Boo",
    [
      "Cheer",
      "Praise",
      "Applaud"
    ]
  ],
  [
    "To clap hands in praise",
    "Applaud",
    [
      "Boo",
      "Hiss",
      "Jeer"
    ]
  ],
  [
    "A feeling of sudden wonder",
    "Awe",
    [
      "Boredom",
      "Apathy",
      "Disdain"
    ]
  ],
  [
    "A feeling of great respect mixed with wonder",
    "Reverence",
    [
      "Scorn",
      "Mockery",
      "Disdain"
    ]
  ],
  [
    "A feeling of looking down on someone",
    "Contempt",
    [
      "Respect",
      "Admiration",
      "Esteem"
    ]
  ],
  [
    "A feeling of being better than others",
    "Arrogance",
    [
      "Humility",
      "Modesty",
      "Meekness"
    ]
  ],
  [
    "A modest view of oneself",
    "Humility",
    [
      "Pride",
      "Arrogance",
      "Vanity"
    ]
  ],
  [
    "Excessive pride in appearance",
    "Vanity",
    [
      "Humility",
      "Modesty",
      "Shame"
    ]
  ],
  [
    "A feeling of unease about the future",
    "Apprehension",
    [
      "Confidence",
      "Calm",
      "Trust"
    ]
  ],
  [
    "A feeling of sureness",
    "Certainty",
    [
      "Doubt",
      "Fear",
      "Worry"
    ]
  ],
  [
    "A feeling of worry",
    "Concern",
    [
      "Indifference",
      "Apathy",
      "Calm"
    ]
  ],
  [
    "A feeling of relief after stress",
    "Relief",
    [
      "Stress",
      "Worry",
      "Anxiety"
    ]
  ],
  [
    "A feeling of shock",
    "Astonishment",
    [
      "Boredom",
      "Calm",
      "Ease"
    ]
  ],
  [
    "A feeling of confusion",
    "Bewilderment",
    [
      "Clarity",
      "Certainty",
      "Confidence"
    ]
  ],
  [
    "A feeling of embarrassment",
    "Awkwardness",
    [
      "Confidence",
      "Ease",
      "Grace"
    ]
  ],
  [
    "A feeling of fitting in",
    "Belonging",
    [
      "Isolation",
      "Alienation",
      "Exile"
    ]
  ],
  [
    "A feeling of being left out",
    "Alienation",
    [
      "Belonging",
      "Welcome",
      "Inclusion"
    ]
  ],
  [
    "A feeling of welcome",
    "Hospitality",
    [
      "Hostility",
      "Rejection",
      "Spite"
    ]
  ],
  [
    "Unfriendly behavior",
    "Hostility",
    [
      "Kindness",
      "Warmth",
      "Welcome"
    ]
  ],
  [
    "Warm friendly behavior",
    "Cordiality",
    [
      "Hostility",
      "Coldness",
      "Spite"
    ]
  ],
  [
    "Cold unfriendly manner",
    "Aloofness",
    [
      "Warmth",
      "Friendliness",
      "Openness"
    ]
  ],
  [
    "Open and friendly manner",
    "Candor",
    [
      "Secrecy",
      "Deceit",
      "Cunning"
    ]
  ],
  [
    "Secretive clever behavior",
    "Cunning",
    [
      "Honesty",
      "Candor",
      "Frankness"
    ]
  ],
  [
    "Brave facing of pain",
    "Fortitude",
    [
      "Cowardice",
      "Fear",
      "Timidity"
    ]
  ],
  [
    "Cowardly behavior",
    "Cowardice",
    [
      "Bravery",
      "Courage",
      "Valor"
    ]
  ],
  [
    "Brave behavior",
    "Courage",
    [
      "Fear",
      "Timidity",
      "Cowardice"
    ]
  ],
  [
    "Loyalty to a cause",
    "Allegiance",
    [
      "Betrayal",
      "Treason",
      "Desertion"
    ]
  ],
  [
    "Betrayal of trust",
    "Betrayal",
    [
      "Loyalty",
      "Faith",
      "Trust"
    ]
  ],
  [
    "Strong belief in someone",
    "Trust",
    [
      "Doubt",
      "Suspicion",
      "Mistrust"
    ]
  ],
  [
    "Lack of trust",
    "Mistrust",
    [
      "Trust",
      "Faith",
      "Belief"
    ]
  ],
  [
    "A promise kept over time",
    "Fidelity",
    [
      "Betrayal",
      "Cheating",
      "Desertion"
    ]
  ],
  [
    "Unfaithfulness in marriage",
    "Adultery",
    [
      "Fidelity",
      "Loyalty",
      "Devotion"
    ]
  ],
  [
    "Deep loyalty and love",
    "Devotion",
    [
      "Neglect",
      "Apathy",
      "Indifference"
    ]
  ],
  [
    "Lack of concern",
    "Negligence",
    [
      "Care",
      "Attention",
      "Diligence"
    ]
  ],
  [
    "Careful attention to detail",
    "Diligence",
    [
      "Laziness",
      "Neglect",
      "Sloth"
    ]
  ],
  [
    "Habitual laziness",
    "Sloth",
    [
      "Energy",
      "Zeal",
      "Vigor"
    ]
  ],
  [
    "Great physical strength",
    "Might",
    [
      "Weakness",
      "Frailty",
      "Feebleness"
    ]
  ],
  [
    "Physical weakness",
    "Frailty",
    [
      "Strength",
      "Might",
      "Power"
    ]
  ],
  [
    "Mental sharpness",
    "Acuity",
    [
      "Dullness",
      "Confusion",
      "Fog"
    ]
  ],
  [
    "Mental dullness",
    "Dullness",
    [
      "Acuity",
      "Sharpness",
      "Wit"
    ]
  ],
  [
    "Quick clever humor",
    "Wit",
    [
      "Dullness",
      "Silence",
      "Boredom"
    ]
  ],
  [
    "A lack of interesting things",
    "Monotony",
    [
      "Variety",
      "Excitement",
      "Thrill"
    ]
  ],
  [
    "Many different kinds",
    "Variety",
    [
      "Monotony",
      "Sameness",
      "Uniformity"
    ]
  ],
  [
    "Being the same throughout",
    "Uniformity",
    [
      "Variety",
      "Diversity",
      "Change"
    ]
  ],
  [
    "Many different types together",
    "Diversity",
    [
      "Uniformity",
      "Sameness",
      "Monotony"
    ]
  ],
  [
    "A change from the usual",
    "Novelty",
    [
      "Routine",
      "Habit",
      "Custom"
    ]
  ],
  [
    "A usual way of doing things",
    "Routine",
    [
      "Novelty",
      "Surprise",
      "Change"
    ]
  ],
  [
    "Something unexpected",
    "Surprise",
    [
      "Routine",
      "Habit",
      "Plan"
    ]
  ],
  [
    "A fixed way of acting",
    "Habit",
    [
      "Surprise",
      "Novelty",
      "Change"
    ]
  ],
  [
    "A skill learned by practice",
    "Skill",
    [
      "Luck",
      "Chance",
      "Fluke"
    ]
  ],
  [
    "Something that happens by chance",
    "Accident",
    [
      "Plan",
      "Design",
      "Intent"
    ]
  ],
  [
    "A planned purpose",
    "Intent",
    [
      "Accident",
      "Chance",
      "Luck"
    ]
  ],
  [
    "Good fortune",
    "Luck",
    [
      "Misfortune",
      "Disaster",
      "Calamity"
    ]
  ],
  [
    "Very bad luck",
    "Misfortune",
    [
      "Luck",
      "Fortune",
      "Blessing"
    ]
  ],
  [
    "A sudden terrible event",
    "Calamity",
    [
      "Blessing",
      "Gift",
      "Boon"
    ]
  ],
  [
    "A helpful gift",
    "Boon",
    [
      "Curse",
      "Bane",
      "Disaster"
    ]
  ],
  [
    "Something that causes harm",
    "Bane",
    [
      "Boon",
      "Gift",
      "Blessing"
    ]
  ],
  [
    "A spoken curse",
    "Curse",
    [
      "Blessing",
      "Praise",
      "Boon"
    ]
  ],
  [
    "A spoken blessing",
    "Blessing",
    [
      "Curse",
      "Insult",
      "Slur"
    ]
  ],
  [
    "An insulting remark",
    "Slur",
    [
      "Praise",
      "Compliment",
      "Honor"
    ]
  ],
  [
    "A polite flattering remark",
    "Compliment",
    [
      "Insult",
      "Slur",
      "Taunt"
    ]
  ],
  [
    "To speak very softly",
    "Whisper",
    [
      "Shout",
      "Yell",
      "Roar"
    ]
  ],
  [
    "To speak very loudly",
    "Yell",
    [
      "Whisper",
      "Murmur",
      "Mumble"
    ]
  ],
  [
    "To speak unclearly",
    "Mumble",
    [
      "Shout",
      "Declare",
      "Proclaim"
    ]
  ],
  [
    "To announce publicly",
    "Proclaim",
    [
      "Whisper",
      "Mumble",
      "Murmur"
    ]
  ],
  [
    "To declare war or peace",
    "Declare",
    [
      "Hide",
      "Conceal",
      "Deny"
    ]
  ],
  [
    "To cancel officially",
    "Revoke",
    [
      "Grant",
      "Issue",
      "Allow"
    ]
  ],
  [
    "To give official permission",
    "Permit",
    [
      "Forbid",
      "Ban",
      "Block"
    ]
  ],
  [
    "To forbid by law",
    "Prohibit",
    [
      "Allow",
      "Permit",
      "Enable"
    ]
  ],
  [
    "To make able",
    "Enable",
    [
      "Disable",
      "Block",
      "Hinder"
    ]
  ],
  [
    "To make unable",
    "Disable",
    [
      "Enable",
      "Allow",
      "Empower"
    ]
  ],
  [
    "To give power to someone",
    "Empower",
    [
      "Weaken",
      "Disable",
      "Limit"
    ]
  ],
  [
    "To limit freedom",
    "Restrict",
    [
      "Free",
      "Release",
      "Expand"
    ]
  ],
  [
    "To set rules for behavior",
    "Regulate",
    [
      "Ignore",
      "Neglect",
      "Chaos"
    ]
  ],
  [
    "Complete disorder",
    "Chaos",
    [
      "Order",
      "Peace",
      "Calm"
    ]
  ],
  [
    "A neat organized state",
    "Order",
    [
      "Chaos",
      "Mess",
      "Clutter"
    ]
  ],
  [
    "A messy state",
    "Clutter",
    [
      "Order",
      "Neatness",
      "Tidiness"
    ]
  ],
  [
    "A neat tidy state",
    "Tidiness",
    [
      "Mess",
      "Clutter",
      "Chaos"
    ]
  ],
  [
    "A set of moral rules",
    "Ethics",
    [
      "Chaos",
      "Noise",
      "Luck"
    ]
  ],
  [
    "Right and wrong behavior",
    "Morality",
    [
      "Immorality",
      "Crime",
      "Vice"
    ]
  ],
  [
    "Wrong or evil behavior",
    "Immorality",
    [
      "Virtue",
      "Good",
      "Right"
    ]
  ],
  [
    "Good moral quality",
    "Virtue",
    [
      "Vice",
      "Sin",
      "Evil"
    ]
  ],
  [
    "A bad habit or moral fault",
    "Vice",
    [
      "Virtue",
      "Good",
      "Merit"
    ]
  ],
  [
    "Deserving praise",
    "Merit",
    [
      "Fault",
      "Flaw",
      "Sin"
    ]
  ],
  [
    "A defect or weakness",
    "Flaw",
    [
      "Merit",
      "Strength",
      "Asset"
    ]
  ],
  [
    "A useful quality",
    "Asset",
    [
      "Liability",
      "Debt",
      "Burden"
    ]
  ],
  [
    "A responsibility or debt",
    "Liability",
    [
      "Asset",
      "Gain",
      "Profit"
    ]
  ],
  [
    "A heavy load to carry",
    "Burden",
    [
      "Relief",
      "Ease",
      "Gift"
    ]
  ],
  [
    "Freedom from burden",
    "Relief",
    [
      "Burden",
      "Stress",
      "Load"
    ]
  ],
  [
    "A difficult responsibility",
    "Duty",
    [
      "Privilege",
      "Right",
      "Freedom"
    ]
  ],
  [
    "A right to do something",
    "Right",
    [
      "Wrong",
      "Crime",
      "Sin"
    ]
  ],
  [
    "Something morally wrong",
    "Wrong",
    [
      "Right",
      "Good",
      "Just"
    ]
  ],
  [
    "Fair and morally right",
    "Just",
    [
      "Unjust",
      "Wrong",
      "Biased"
    ]
  ],
  [
    "Not fair",
    "Unjust",
    [
      "Just",
      "Fair",
      "Equal"
    ]
  ],
  [
    "Treating people fairly",
    "Fairness",
    [
      "Bias",
      "Injustice",
      "Favor"
    ]
  ],
  [
    "Favoring one side unfairly",
    "Bias",
    [
      "Fairness",
      "Balance",
      "Equity"
    ]
  ],
  [
    "A balanced fair state",
    "Equity",
    [
      "Bias",
      "Injustice",
      "Privilege"
    ]
  ]
];

const normalizeAnswer = value =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

const shuffleArray = items => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const titleCaseWord = word => {
  const raw = String(word || '').trim();
  if (!raw) {
    return '';
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

const pickQuestion = () => QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];

const buildChallenge = (_learningLanguage = 'English', aiItems = null) => {
  if (Array.isArray(aiItems) && aiItems.length) {
    const item = pickAi(aiItems);
    const choices = shuffleArray([item.correct, ...item.wrong]);
    const readings = {};
    choices.forEach(choice => {
      if (choice.roman) {
        readings[choice.text] = choice.roman;
      }
    });
    return {
      id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ai: true,
      definition: item.definition.text,
      definitionRoman: item.definition.roman || '',
      options: choices.map(choice => choice.text),
      readings,
      correct: normalizeAnyAnswer(item.correct.text),
    };
  }
  const [definition, correctWord, wrongWords] = pickQuestion();
  const displayOptions = shuffleArray([
    titleCaseWord(correctWord),
    ...wrongWords.map(titleCaseWord),
  ]);
  return {
    id: `ws_${Date.now()}_random`,
    definition,
    options: displayOptions,
    correct: normalizeAnswer(correctWord),
  };
};

const serializeChallenge = challenge => ({
  id: challenge.id,
  definition: challenge.definition,
  definitionRoman: challenge.definitionRoman || '',
  readings: challenge.readings || {},
  options: challenge.options,
});

const isCorrectAnswer = (challenge, answer) => {
  if (challenge.ai) {
    const normalized = normalizeAnyAnswer(answer);
    return Boolean(normalized) && normalized === challenge.correct;
  }
  const normalized = normalizeAnswer(answer);
  if (!normalized || normalized.length < 2) {
    return false;
  }
  return normalized === challenge.correct;
};

const pickBotAnswer = (challenge, shouldBeCorrect = true) => {
  if (challenge.ai) {
    const wrong = challenge.options.filter(opt => normalizeAnyAnswer(opt) !== challenge.correct);
    return shouldBeCorrect || wrong.length === 0
      ? challenge.correct
      : wrong[Math.floor(Math.random() * wrong.length)];
  }
  if (shouldBeCorrect) {
    return challenge.correct;
  }
  const wrong = challenge.options
    .map(opt => normalizeAnswer(opt))
    .filter(opt => opt && opt !== challenge.correct);
  if (wrong.length === 0) {
    return challenge.correct;
  }
  return wrong[Math.floor(Math.random() * wrong.length)];
};

const calcWordsenseExp = (finalScore, rank = 5) => {
  const safeScore = Math.max(0, Number(finalScore) || 0);
  const base = Math.floor(safeScore / 10);
  const winBonus = rank === 1 ? 3 : rank === 2 ? 1 : 0;
  return Math.max(safeScore > 0 ? 1 : 0, base + winBonus);
};

module.exports = {
  QUESTION_COUNT: QUESTION_BANK.length,
  MATCH_DURATION_MS: 5 * 60 * 1000,
  POINTS_CORRECT: 15,
  POINTS_WRONG: 5,
  buildChallenge,
  serializeChallenge,
  isCorrectAnswer,
  normalizeAnswer,
  shuffleArray,
  titleCaseWord,
  pickBotAnswer,
  randomBotName,
  calcWordsenseExp,
};
