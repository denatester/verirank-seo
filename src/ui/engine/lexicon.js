(function (global) {
  "use strict";
  var VeriRank = (global.VeriRank = global.VeriRank || {});

  var STOPWORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
    "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down",
    "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
    "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her",
    "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
    "however", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't",
    "it", "it's", "its", "itself", "just", "let's", "many", "may", "me", "might",
    "more", "most", "much", "must", "mustn't", "my", "myself", "neither", "never",
    "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other",
    "ought", "our", "ours", "ourselves", "out", "over", "own", "per", "rather",
    "really", "same", "shall", "shan't", "she", "she'd", "she'll", "she's",
    "should", "shouldn't", "since", "so", "some", "such", "than", "that", "that's",
    "the", "their", "theirs", "them", "themselves", "then", "there", "there's",
    "therefore", "these", "they", "they'd", "they'll", "they're", "they've",
    "this", "those", "through", "thus", "to", "too", "under", "unless", "until",
    "up", "upon", "us", "very", "was", "wasn't", "we", "we'd", "we'll", "we're",
    "we've", "were", "weren't", "what", "what's", "when", "when's", "where",
    "where's", "whether", "which", "while", "who", "who's", "whom", "whose",
    "why", "why's", "will", "with", "within", "without", "won't", "would",
    "wouldn't", "yet", "you", "you'd", "you'll", "you're", "you've", "your",
    "yours", "yourself", "yourselves", "also", "often", "still", "even", "well",
    "usually", "typically", "generally", "especially", "nearly", "almost", "around",
    "across", "among", "along", "every", "several", "various", "another", "either",
    "increasingly", "rely", "relies", "relied", "depend", "depends", "depended",
    "meant", "mean", "means", "built", "build", "submitting", "submit", "submits",
    "adopting", "adopt", "adopts", "using", "use", "used", "follow", "follows",
    "following", "occur", "occurs", "occurred", "spend", "spends", "face", "faces",
    "facing", "combine", "combines", "combining", "protect", "protects", "preserve",
    "preserves", "reduce", "reduces", "reduced", "maintain", "maintains", "require",
    "requires", "required", "satisfy", "satisfies", "prevent", "prevents", "lower",
    "lowered", "extend", "extends", "simplify", "simplifies", "eliminate", "eliminates",
    "validate", "validates", "conduct", "monitor", "retain", "place", "places"
  ]);

  var GENERIC_SEO_WEAK_WORDS = new Set([
    "thing", "things", "way", "ways", "system", "systems", "use", "used", "using",
    "make", "makes", "making", "good", "better", "best", "important", "company",
    "companies", "organization", "organizations", "information", "process",
    "approach", "result", "results", "issue", "issues", "problem", "problems",
    "team", "teams", "work", "working", "help", "helps", "need", "needs", "ensure",
    "ensures", "provide", "provides", "include", "includes", "including", "allows",
    "allow", "based", "related", "effective", "efficient", "modern", "standard",
    "daily", "basis", "sure", "lot", "lots", "able", "addition", "prior", "currently"
  ]);

  var PHRASE_BOUNDARY_WORDS = new Set([
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "twenty", "thirty", "forty", "fifty", "hundred", "thousand",
    "rush", "rushing", "rushed", "inspect", "inspects", "inspecting", "inspected",
    "visit", "visits", "visiting", "visited", "receive", "receives", "receiving", "received",
    "start", "starts", "starting", "started", "worked", "working", "strip", "strips", "stripping",
    "swallow", "swallows", "broadcast", "broadcasts", "expect", "expects", "find", "finds",
    "holding", "hunted", "know", "knows", "pull", "pulls", "reignite", "love", "loves", "hooked",
    "implementing", "reduced", "shortened", "maintaining", "expose", "exposes", "compromise",
    "scan", "triggering", "enforce", "enforces", "log", "logs", "rotate", "rotates",
    "standardize", "delay", "delayed", "force", "forces", "increase", "increases",
    "isolate", "isolates", "clean", "cleans", "calibrate", "documenting", "cut", "cuts",
    "reworking", "chasing", "delaying", "leave", "leaves", "replace", "replaces", "alters", "lowered",
    "critical", "area", "areas", "job", "jobs", "clear", "routine", "sealed", "darkest",
    "frozen", "deeper", "final", "traditional", "distributed", "sensitive", "unauthorized",
    "ephemeral", "unscheduled", "elevated", "variable", "fouled", "preventable", "targeted", "recommended",
    "daily", "basis", "sure", "lot", "lots", "able", "addition", "prior", "currently"
  ]);

  var UNRELATED_GEO_AND_NOISE_TERMS = new Set([
    "florida", "texas", "california", "ohio", "michigan", "arizona", "georgia", "illinois",
    "pennsylvania", "virginia", "maryland", "colorado", "washington", "oregon", "nevada",
    "tennessee", "indiana", "missouri", "wisconsin", "minnesota", "alabama", "louisiana",
    "kentucky", "oklahoma", "connecticut", "utah", "iowa", "arkansas", "kansas",
    "nyc", "chicago", "houston", "dallas", "austin", "phoenix", "miami", "orlando",
    "tampa", "atlanta", "seattle", "denver", "boston", "portland", "vegas", "angeles",
    "diego", "antonio", "charlotte", "jacksonville", "columbus", "indianapolis",
    "philadelphia", "detroit", "memphis", "nashville", "baltimore", "toronto", "london",
    "sydney", "melbourne", "dubai", "uk", "canada", "australia", "india", "ireland", "nz",
    "reddit", "youtube", "quora", "wikipedia", "yelp", "angi", "thumbtack", "craigslist",
    "lowes", "walmart", "amazon", "tiktok", "meme", "lyrics", "pdf", "login", "salary", "hiring"
  ]);

  var MULTIWORD_GEO_NOISE = [
    "home depot", "las vegas", "los angeles", "san diego", "san antonio", "sign in", "pdf download"
  ];

  function cleanSuggestedKeyword(rawPhrase, sourceTextLower) {
    var cleaned = String(rawPhrase || "").replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length < 3 || /^https?:\/\//i.test(cleaned)) return "";

    if (/^(?:near|around)\s+me$/i.test(cleaned)) return "";
    if (/\s+(?:near|around)\s+me$/i.test(cleaned)) {
      var stripped = cleaned.replace(/\s+(?:near|around)\s+me$/i, "").trim();
      if (!stripped) return "";
      cleaned = /\blocal\b/i.test(stripped) ? stripped : ("local " + stripped);
    }

    var low = cleaned.toLowerCase();
    var srcLow = String(sourceTextLower || "").toLowerCase();

    for (var m = 0; m < MULTIWORD_GEO_NOISE.length; m++) {
      var mw = MULTIWORD_GEO_NOISE[m];
      if (low.indexOf(mw) !== -1 && srcLow.indexOf(mw) === -1) return "";
    }

    var toks = low.match(/[a-z0-9]+/g) || [];
    var hasMeaningful = false;
    for (var i = 0; i < toks.length; i++) {
      var tok = toks[i];
      if (UNRELATED_GEO_AND_NOISE_TERMS.has(tok)) {
        var inSrcRe = new RegExp("\\b" + tok + "\\b", "i");
        if (!inSrcRe.test(srcLow)) return "";
      }
      if (!STOPWORDS.has(tok) && !GENERIC_SEO_WEAK_WORDS.has(tok) && tok.length >= 2) {
        hasMeaningful = true;
      }
    }

    return hasMeaningful ? cleaned : "";
  }

  function stemWord(word) {
    if (!word) return "";
    var w = String(word).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (w.length <= 3) return w;
    if (/^\d+$/.test(w)) return w;

    if (w.length > 5 && w.slice(-3) === "ies") {
      w = w.slice(0, -3) + "y";
    } else if (w.length > 5 && w.slice(-4) === "sses") {
      w = w.slice(0, -2);
    } else if (w.length > 4 && (w.slice(-3) === "xes" || w.slice(-3) === "zes" || w.slice(-4) === "ches" || w.slice(-4) === "shes")) {
      w = w.slice(0, -2);
    } else if (w.length > 4 && w.slice(-1) === "s" && w.slice(-2) !== "ss" && w.slice(-2) !== "us" && w.slice(-2) !== "is") {
      w = w.slice(0, -1);
    }

    if (w.length > 6 && w.slice(-5) === "ation") {
      w = w.slice(0, -5);
    } else if (w.length > 6 && (w.slice(-4) === "tion" || w.slice(-4) === "sion")) {
      w = w.slice(0, -3);
    } else if (w.length > 6 && w.slice(-4) === "ment") {
      w = w.slice(0, -4);
    } else if (w.length > 6 && w.slice(-4) === "ness") {
      w = w.slice(0, -4);
    } else if (w.length > 5 && w.slice(-3) === "ing") {
      var baseIng = w.slice(0, -3);
      if (baseIng.length >= 3) {
        if (baseIng.length > 3 && baseIng[baseIng.length - 1] === baseIng[baseIng.length - 2]) {
          baseIng = baseIng.slice(0, -1);
        }
        w = baseIng;
      }
    } else if (w.length > 5 && w.slice(-2) === "ed") {
      var baseEd = w.slice(0, -2);
      if (baseEd.length >= 3) {
        if (baseEd.length > 3 && baseEd[baseEd.length - 1] === baseEd[baseEd.length - 2]) {
          baseEd = baseEd.slice(0, -1);
        }
        w = baseEd;
      }
    } else if (w.length > 5 && w.slice(-2) === "ly") {
      var baseLy = w.slice(0, -2);
      if (baseLy.length >= 3) w = baseLy;
    }

    return w;
  }

  function countSyllables(word) {
    if (!word) return 0;
    var w = String(word).toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
    w = w.replace(/^y/, "");
    var groups = w.match(/[aeiouy]{1,2}/g);
    return groups ? Math.max(1, groups.length) : 1;
  }

  var PIXEL_WIDTHS = {
    " ": 5, "!": 5, "\"": 7, "#": 11, "$": 11, "%": 16, "&": 13, "'": 4,
    "(": 6, ")": 6, "*": 8, "+": 11, ",": 5, "-": 6, ".": 5, "/": 6,
    ":": 5, ";": 5, "<": 11, "=": 11, ">": 11, "?": 10, "@": 18,
    "0": 11, "1": 11, "2": 11, "3": 11, "4": 11, "5": 11, "6": 11, "7": 11, "8": 11, "9": 11,
    "A": 13, "B": 13, "C": 14, "D": 14, "E": 12, "F": 11, "G": 15, "H": 14, "I": 5,
    "J": 10, "K": 13, "L": 11, "M": 16, "N": 14, "O": 15, "P": 12, "Q": 15, "R": 13,
    "S": 12, "T": 12, "U": 14, "V": 13, "W": 18, "X": 13, "Y": 13, "Z": 12,
    "a": 10, "b": 10, "c": 9, "d": 10, "e": 10, "f": 5, "g": 10, "h": 10, "i": 5,
    "j": 5, "k": 9, "l": 5, "m": 15, "n": 10, "o": 10, "p": 10, "q": 10, "r": 7,
    "s": 9, "t": 6, "u": 10, "v": 9, "w": 14, "x": 9, "y": 9, "z": 9, "|": 5
  };

  function estimatePixelWidth(text) {
    if (!text) return 0;
    var s = String(text);
    var total = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      total += Object.prototype.hasOwnProperty.call(PIXEL_WIDTHS, ch) ? PIXEL_WIDTHS[ch] : 10;
    }
    return total;
  }

  var FILLER_REPLACEMENTS = [
    { pattern: /\bthere are a lot of ([a-z]+)\s+(?:who|that)\s+/gi, replacement: function (_, n) { return "many " + n + " "; }, label: "tightened 'there are a lot of...'" },
    { pattern: /\bthere are many ([a-z]+)\s+(?:who|that)\s+/gi, replacement: function (_, n) { return "many " + n + " "; }, label: "tightened 'there are many...'" },
    { pattern: /\bin order to\b/gi, replacement: "to", label: "in order to -> to" },
    { pattern: /\bdue to the fact that\b/gi, replacement: "because", label: "due to the fact that -> because" },
    { pattern: /\bin light of the fact that\b/gi, replacement: "because", label: "in light of the fact that -> because" },
    { pattern: /\bgiven the fact that\b/gi, replacement: "because", label: "given the fact that -> because" },
    { pattern: /\bfor the simple reason that\b/gi, replacement: "because", label: "for the simple reason that -> because" },
    { pattern: /\bin the event that\b/gi, replacement: "if", label: "in the event that -> if" },
    { pattern: /\bin a situation where\b/gi, replacement: "when", label: "in a situation where -> when" },
    { pattern: /\bat this point in time\b/gi, replacement: "now", label: "at this point in time -> now" },
    { pattern: /\bat the present time\b/gi, replacement: "now", label: "at the present time -> now" },
    { pattern: /\bin the near future\b/gi, replacement: "soon", label: "in the near future -> soon" },
    { pattern: /\bon a daily basis\b/gi, replacement: "daily", label: "on a daily basis -> daily" },
    { pattern: /\bon a regular basis\b/gi, replacement: "regularly", label: "on a regular basis -> regularly" },
    { pattern: /\bin close proximity to\b/gi, replacement: "near", label: "in close proximity to -> near" },
    { pattern: /\bfor the purpose of\b/gi, replacement: "for", label: "for the purpose of -> for" },
    { pattern: /\bwith regard to\b/gi, replacement: "regarding", label: "with regard to -> regarding" },
    { pattern: /\bin terms of\b/gi, replacement: "for", label: "in terms of -> for" },
    { pattern: /\bwhen it comes to\b/gi, replacement: "for", label: "when it comes to -> for" },
    { pattern: /\bas a matter of fact,?\s*/gi, replacement: "", label: "removed 'as a matter of fact'" },
    { pattern: /\bit is important to note that\s+/gi, replacement: "", label: "removed 'it is important to note that'" },
    { pattern: /\bit should be noted that\s+/gi, replacement: "", label: "removed 'it should be noted that'" },
    { pattern: /\bit is worth noting that\s+/gi, replacement: "", label: "removed 'it is worth noting that'" },
    { pattern: /\bneedless to say,?\s*/gi, replacement: "", label: "removed 'needless to say'" },
    { pattern: /\bin addition to this,\s*/gi, replacement: "Additionally, ", label: "in addition to this -> Additionally" },
    { pattern: /\bfirst and foremost,\s*/gi, replacement: "First, ", label: "first and foremost -> First" },
    { pattern: /\ba large number of\b/gi, replacement: "many", label: "a large number of -> many" },
    { pattern: /\ba lot of\b/gi, replacement: "many", label: "a lot of -> many" },
    { pattern: /\blots of\b/gi, replacement: "many", label: "lots of -> many" },
    { pattern: /\ba majority of\b/gi, replacement: "most", label: "a majority of -> most" },
    { pattern: /\beach and every\b/gi, replacement: "every", label: "each and every -> every" },
    { pattern: /\bvarious different\b/gi, replacement: "various", label: "various different -> various" },
    { pattern: /\bcompletely eliminate\b/gi, replacement: "eliminate", label: "completely eliminate -> eliminate" },
    { pattern: /\bfuture plans\b/gi, replacement: "plans", label: "future plans -> plans" },
    { pattern: /\bpast history\b/gi, replacement: "history", label: "past history -> history" },
    { pattern: /\bend result\b/gi, replacement: "result", label: "end result -> result" },
    { pattern: /\bvery unique\b/gi, replacement: "unique", label: "very unique -> unique" },
    { pattern: /\breally important\b/gi, replacement: "essential", label: "really important -> essential" },
    { pattern: /\bvery important\b/gi, replacement: "essential", label: "very important -> essential" },
    { pattern: /\bhas the ability to\b/gi, replacement: "can", label: "has the ability to -> can" },
    { pattern: /\bhave the ability to\b/gi, replacement: "can", label: "have the ability to -> can" },
    { pattern: /\bgives you the ability to\b/gi, replacement: "lets you", label: "gives you the ability to -> lets you" },
    { pattern: /\ballows you to\b/gi, replacement: "lets you", label: "allows you to -> lets you" },
    { pattern: /\bis able to\b/gi, replacement: "can", label: "is able to -> can" },
    { pattern: /\bare able to\b/gi, replacement: "can", label: "are able to -> can" },
    { pattern: /\bis going to\b/gi, replacement: "will", label: "is going to -> will" },
    { pattern: /\bare going to\b/gi, replacement: "will", label: "are going to -> will" },
    { pattern: /\bmake sure that\b/gi, replacement: "ensure", label: "make sure that -> ensure" },
    { pattern: /\bmake a decision\b/gi, replacement: "decide", label: "make a decision -> decide" },
    { pattern: /\btake into consideration\b/gi, replacement: "consider", label: "take into consideration -> consider" },
    { pattern: /\bprovide assistance to\b/gi, replacement: "help", label: "provide assistance to -> help" },
    { pattern: /\bmake use of\b/gi, replacement: "use", label: "make use of -> use" },
    { pattern: /\bconduct an inspection of\b/gi, replacement: "inspect", label: "conduct an inspection of -> inspect" },
    { pattern: /\bperform an inspection of\b/gi, replacement: "inspect", label: "perform an inspection of -> inspect" },
    { pattern: /\bperform an evaluation of\b/gi, replacement: "evaluate", label: "perform an evaluation of -> evaluate" },
    { pattern: /\bmake an improvement to\b/gi, replacement: "improve", label: "make an improvement to -> improve" },
    { pattern: /\bprovide protection for\b/gi, replacement: "protect", label: "provide protection for -> protect" },
    { pattern: /\bis designed to help\b/gi, replacement: "helps", label: "is designed to help -> helps" },
    { pattern: /\bare designed to help\b/gi, replacement: "help", label: "are designed to help -> help" },
    { pattern: /\bcan be used to\b/gi, replacement: "can", label: "can be used to -> can" },
    { pattern: /\bhave the option to\b/gi, replacement: "can", label: "have the option to -> can" },
    { pattern: /\bhas the option to\b/gi, replacement: "can", label: "has the option to -> can" },
    { pattern: /\bprior to\b/gi, replacement: "before", label: "prior to -> before" },
    { pattern: /\bsubsequent to\b/gi, replacement: "after", label: "subsequent to -> after" },
    { pattern: /\butilizes\b/gi, replacement: "uses", label: "utilizes -> uses" },
    { pattern: /\butilizing\b/gi, replacement: "using", label: "utilizing -> using" },
    { pattern: /\butilize\b/gi, replacement: "use", label: "utilize -> use" },
    { pattern: /\bat all times\b/gi, replacement: "always", label: "at all times -> always" },
    { pattern: /\bin most cases,?\s*/gi, replacement: "usually ", label: "in most cases -> usually" },
    { pattern: /\bfor the most part,?\s*/gi, replacement: "mostly ", label: "for the most part -> mostly" },
    { pattern: /\bas a result of\b/gi, replacement: "because of", label: "as a result of -> because of" },
    { pattern: /\bwith the exception of\b/gi, replacement: "except for", label: "with the exception of -> except for" },
    { pattern: /\bon a monthly basis\b/gi, replacement: "monthly", label: "on a monthly basis -> monthly" },
    { pattern: /\bon a weekly basis\b/gi, replacement: "weekly", label: "on a weekly basis -> weekly" },
    { pattern: /\bon an annual basis\b/gi, replacement: "annually", label: "on an annual basis -> annually" },
    { pattern: /\bare currently\b/gi, replacement: "are", label: "removed 'currently'" },
    { pattern: /\bis currently\b/gi, replacement: "is", label: "removed 'currently'" },
    { pattern: /\bwhether or not\b/gi, replacement: "whether", label: "whether or not -> whether" },
    { pattern: /\bin the process of ([a-z]+ing)\b/gi, replacement: "$1", label: "tightened 'in the process of...'" }
  ];

  var INTENT_SIGNALS = {
    procedural: [
      "step", "steps", "first", "second", "third", "finally", "configure", "install",
      "inspect", "verify", "check", "measure", "implement", "deploy", "follow", "guide",
      "maintenance", "checklist", "procedure", "how to", "setup", "troubleshoot"
    ],
    informational: [
      "what", "why", "overview", "definition", "means", "refers", "architecture", "framework",
      "compliance", "regulation", "standard", "audit", "analysis", "report", "impact",
      "evidence", "causes", "reduces", "prevents", "requires", "principle"
    ],
    commercial: [
      "compare", "comparison", "versus", "vs", "pricing", "cost", "roi", "benchmark",
      "enterprise", "platform", "vendor", "evaluation", "benefits", "advantages", "review",
      "alternatives", "sla", "uptime"
    ],
    transactional: [
      "buy", "purchase", "order", "quote", "subscribe", "trial", "demo", "download",
      "book", "schedule", "contact sales", "license", "get started"
    ]
  };

  var POLARITY_MARKERS = new Set([
    "not", "never", "no", "without", "neither", "nor", "cannot", "cant", "wont",
    "doesnt", "dont", "didnt", "isnt", "arent", "wasnt", "werent", "shouldnt",
    "wouldnt", "couldnt", "mustnt", "except", "unless", "rarely", "seldom", "only",
    "exclude", "excludes", "excluding", "prohibit", "prohibits", "prohibited",
    "prevent", "prevents", "fail", "fails", "lack", "lacks", "none", "nothing",
    "unable", "avoid", "avoids", "restricted"
  ]);

  function toTitleCase(str) {
    var minor = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with"]);
    var words = String(str || "").trim().split(/\s+/);
    return words
      .map(function (w, idx) {
        if (!w) return "";
        if (/^[A-Z0-9-]{2,}$/.test(w)) return w;
        var low = w.toLowerCase();
        if (idx > 0 && idx < words.length - 1 && minor.has(low)) return low;
        return low.charAt(0).toUpperCase() + low.slice(1);
      })
      .join(" ");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function slugify(str) {
    return String(str || "document")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "document";
  }

  function normalizeTypography(str) {
    return String(str || "")
      .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201F\u2033]/g, "\"")
      .replace(/\u00A0/g, " ");
  }

  function describeReadingGrade(grade) {
    var g = Number(grade) || 8;
    if (g <= 7.5) return "Easy (General Public)";
    if (g <= 10.5) return "Clear (Standard Web & Business)";
    if (g <= 13.5) return "Moderate (Professional / Technical)";
    return "Advanced (Academic / Specialist)";
  }

  VeriRank.Lexicon = {
    STOPWORDS: STOPWORDS,
    GENERIC_SEO_WEAK_WORDS: GENERIC_SEO_WEAK_WORDS,
    PHRASE_BOUNDARY_WORDS: PHRASE_BOUNDARY_WORDS,
    UNRELATED_GEO_AND_NOISE_TERMS: UNRELATED_GEO_AND_NOISE_TERMS,
    cleanSuggestedKeyword: cleanSuggestedKeyword,
    stemWord: stemWord,
    countSyllables: countSyllables,
    estimatePixelWidth: estimatePixelWidth,
    FILLER_REPLACEMENTS: FILLER_REPLACEMENTS,
    INTENT_SIGNALS: INTENT_SIGNALS,
    POLARITY_MARKERS: POLARITY_MARKERS,
    toTitleCase: toTitleCase,
    escapeHtml: escapeHtml,
    slugify: slugify,
    normalizeTypography: normalizeTypography,
    describeReadingGrade: describeReadingGrade
  };
})(window);
