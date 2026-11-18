(function (global) {
  "use strict";
  var VeriRank = (global.VeriRank = global.VeriRank || {});
  var Lex = VeriRank.Lexicon;

  var INTENT_REGEX_MAP = {};
  Object.keys(Lex.INTENT_SIGNALS).forEach(function (intent) {
    INTENT_REGEX_MAP[intent] = Lex.INTENT_SIGNALS[intent].map(function (term) {
      return new RegExp("\\b" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    });
  });

  function decodeHtmlEntities(str) {
    return String(str || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'");
  }

  function stripTags(html) {
    return decodeHtmlEntities(String(html || "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitSentences(text) {
    var clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return [];

    // Protect common abbreviations and decimal numbers from splitting
    var protectedText = clean
      .replace(/\b(e\.g|i\.e|vs|Dr|Mr|Ms|Mrs|Inc|Ltd|Corp|Co|Fig|No|St|U\.S|U\.K)\./gi, "$1<<DOT>>")
      .replace(/(\d)\.(\d)/g, "$1<<DOT>>$2");

    var rawParts = protectedText.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[*])/);
    var out = [];
    for (var i = 0; i < rawParts.length; i++) {
      var restored = rawParts[i].replace(/<<DOT>>/g, ".").trim();
      if (restored) out.push(restored);
    }
    return out;
  }

  function countWords(text) {
    var matches = String(text || "").match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g);
    return matches ? matches.length : 0;
  }

  function detectFormat(rawInput) {
    var txt = String(rawInput || "");
    if (/<(?:h[1-6]|p|article|section|div|ul|ol|li|title|meta)\b[^>]*>/i.test(txt)) {
      return "html";
    }
    if (/^#{1,6}\s+\S/m.test(txt) || /^\s*[-*+]\s+\S/m.test(txt) || /^\s*\d+\.\s+\S/m.test(txt) || /\[[^\]]+\]\([^)]+\)/.test(txt)) {
      return "markdown";
    }
    return "plain";
  }

  function parseDocument(rawInput) {
    var raw = Lex.normalizeTypography(rawInput).replace(/\r\n/g, "\n").trim();
    var format = detectFormat(raw);
    var title = "";
    var metaDescription = "";
    var headings = [];
    var paragraphs = [];
    var lists = [];
    var links = [];
    var images = [];
    var hasJsonLd = new RegExp("<" + "script[^>]*type=[\"']application\\/ld\\+json[\"'][^>]*>", "i").test(raw);
    var hasOpenGraph = /<meta[^>]*property=["']og:title["']/i.test(raw);

    if (format === "html") {
      var titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) title = stripTags(titleMatch[1]);

      var metaMatch = raw.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
        raw.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
      if (metaMatch) metaDescription = decodeHtmlEntities(metaMatch[1]).trim();

      var linkRegex = /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var lm;
      while ((lm = linkRegex.exec(raw)) !== null) {
        links.push({ href: lm[1], anchor: stripTags(lm[2]) });
      }

      var imgRegex = /<img\b[^>]*>/gi;
      var im;
      while ((im = imgRegex.exec(raw)) !== null) {
        var tag = im[0];
        var srcM = tag.match(/src=["']([^"']*)["']/i);
        var altM = tag.match(/alt=["']([^"']*)["']/i);
        images.push({ src: srcM ? srcM[1] : "", alt: altM ? altM[1] : "" });
      }

      var bodyHtml = raw
        .replace(new RegExp("<" + "script[\\s\\S]*?<\\/script>", "gi"), " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
      var blockRegex = /<(h[1-6]|p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
      var bm;
      var runningWords = 0;
      while ((bm = blockRegex.exec(bodyHtml)) !== null) {
        var tagName = bm[1].toLowerCase();
        var inner = bm[2];
        if (tagName[0] === "h") {
          var lvl = parseInt(tagName.slice(1), 10);
          var hText = stripTags(inner);
          if (hText) {
            headings.push({ level: lvl, text: hText, wordOffset: runningWords });
            if (lvl === 1 && !title) title = hText;
            runningWords += countWords(hText);
          }
        } else if (tagName === "p") {
          var pText = stripTags(inner);
          if (pText) {
            paragraphs.push({ index: paragraphs.length, text: pText, wordCount: countWords(pText), wordOffset: runningWords });
            runningWords += countWords(pText);
          }
        } else if (tagName === "ul" || tagName === "ol") {
          var items = [];
          var liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
          var lim;
          while ((lim = liRe.exec(inner)) !== null) {
            var liTxt = stripTags(lim[1]);
            if (liTxt) {
              items.push(liTxt);
              runningWords += countWords(liTxt);
            }
          }
          if (items.length) lists.push({ ordered: tagName === "ol", items: items });
        }
      }

      if (paragraphs.length === 0 && lists.length === 0) {
        var fallbackPlain = stripTags(bodyHtml);
        if (fallbackPlain) {
          paragraphs.push({ index: 0, text: fallbackPlain, wordCount: countWords(fallbackPlain), wordOffset: 0 });
        }
      }
    } else {
      var lines = raw.split("\n");
      var buf = [];
      var curList = null;
      var curWords = 0;

      var flushParagraph = function () {
        if (buf.length > 0) {
          var text = buf.join(" ").replace(/\s+/g, " ").trim();
          if (text) {
            paragraphs.push({ index: paragraphs.length, text: text, wordCount: countWords(text), wordOffset: curWords });
            curWords += countWords(text);
          }
          buf = [];
        }
      };

      var flushList = function () {
        if (curList && curList.items.length > 0) {
          lists.push(curList);
        }
        curList = null;
      };

      // Extract markdown links & images
      var mdImgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
      var mim;
      while ((mim = mdImgRe.exec(raw)) !== null) {
        images.push({ alt: mim[1], src: mim[2] });
      }
      var mdLinkRe = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
      var mlm;
      while ((mlm = mdLinkRe.exec(raw)) !== null) {
        links.push({ anchor: mlm[1], href: mlm[2] });
      }

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) {
          flushParagraph();
          flushList();
          continue;
        }
        var hMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (hMatch) {
          flushParagraph();
          flushList();
          var hLvl = hMatch[1].length;
          var hTxt = hMatch[2].replace(/\*+|`+/g, "").trim();
          headings.push({ level: hLvl, text: hTxt, wordOffset: curWords });
          if (hLvl === 1 && !title) title = hTxt;
          curWords += countWords(hTxt);
          continue;
        }
        var ulMatch = line.match(/^[-*+]\s+(.+)$/);
        var olMatch = line.match(/^\d+[.)]\s+(.+)$/);
        if (ulMatch || olMatch) {
          flushParagraph();
          var isOrdered = !!olMatch;
          var itemTxt = (ulMatch ? ulMatch[1] : olMatch[1]).replace(/\*\*([^*]+)\*\*/g, "$1").trim();
          if (!curList || curList.ordered !== isOrdered) {
            flushList();
            curList = { ordered: isOrdered, items: [] };
          }
          curList.items.push(itemTxt);
          curWords += countWords(itemTxt);
          continue;
        }
        flushList();
        buf.push(line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1"));
      }
      flushParagraph();
      flushList();
    }

    // Assign sentence IDs across paragraphs and lists
    var allSentences = [];
    var sCounter = 1;
    for (var p = 0; p < paragraphs.length; p++) {
      var pSents = splitSentences(paragraphs[p].text);
      paragraphs[p].sentences = [];
      for (var s = 0; s < pSents.length; s++) {
        var sObj = {
          id: "S" + sCounter++,
          text: pSents[s],
          wordCount: countWords(pSents[s]),
          paragraphIndex: p
        };
        paragraphs[p].sentences.push(sObj);
        allSentences.push(sObj);
      }
    }

    // Include list items as sentences if paragraphs are sparse or for provenance
    for (var l = 0; l < lists.length; l++) {
      for (var li = 0; li < lists[l].items.length; li++) {
        var itemText = lists[l].items[li];
        var itemObj = {
          id: "S" + sCounter++,
          text: itemText,
          wordCount: countWords(itemText),
          paragraphIndex: -1,
          isListItem: true
        };
        allSentences.push(itemObj);
      }
    }

    var plainBodyParts = [];
    for (var hi = 0; hi < headings.length; hi++) plainBodyParts.push(headings[hi].text);
    for (var pi = 0; pi < paragraphs.length; pi++) plainBodyParts.push(paragraphs[pi].text);
    for (var li2 = 0; li2 < lists.length; li2++) {
      plainBodyParts = plainBodyParts.concat(lists[li2].items);
    }
    var plainText = plainBodyParts.join("\n\n");

    return {
      format: format,
      raw: raw,
      title: title,
      metaDescription: metaDescription,
      headings: headings,
      paragraphs: paragraphs,
      lists: lists,
      links: links,
      images: images,
      hasJsonLd: hasJsonLd,
      hasOpenGraph: hasOpenGraph,
      sentences: allSentences,
      plainText: plainText,
      totalWords: countWords(plainText)
    };
  }

  function tokenizeLowerWords(text) {
    var m = String(text || "").toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g);
    return m || [];
  }

  function extractEntities(plainText, sentences) {
    var entityCounts = {};
    var addEntity = function (name) {
      var cleaned = name.replace(/[.,;:!?)'"]+$/, "").trim();
      if (!cleaned || cleaned.length < 2) return;
      if (Lex.STOPWORDS.has(cleaned.toLowerCase())) return;
      entityCounts[cleaned] = (entityCounts[cleaned] || 0) + 1;
    };

    // Acronyms (2+ uppercase letters with optional digits/hyphen)
    var acrMatches = String(plainText || "").match(/\b[A-Z]{2,}(?:-\d+)?(?:\s+[A-Z0-9]{1,5})?\b/g) || [];
    for (var i = 0; i < acrMatches.length; i++) {
      var acr = acrMatches[i].trim();
      if (acr.length >= 2 && acr !== "SEO" && acr !== "FAQ" && acr !== "HTML" && acr !== "JSON") {
        addEntity(acr);
      }
    }

    // Standards / codes like SOC 2 Type II, ISO 27001, ICD-10-CM, R-513A
    var codeMatches = String(plainText || "").match(/\b(?:[A-Z]{2,}-\d+(?:-[A-Z0-9]+)?|(?:SOC|ISO|NIST|PCI|HIPAA|CMS)\s+[A-Z0-9]+(?:\s+[A-Z0-9]+)?)\b/g) || [];
    for (var c = 0; c < codeMatches.length; c++) {
      addEntity(codeMatches[c]);
    }

    // Mid-sentence multi-word Proper Nouns or capitalized technical brands
    for (var s = 0; s < sentences.length; s++) {
      var st = sentences[s].text;
      // Skip very first word of sentence unless followed by another capitalized word
      var multiCap = st.match(/\b[A-Z][a-zA-Z0-9-]+(?:\s+(?:of|for|and|&)?\s*[A-Z][a-zA-Z0-9-]+){1,3}\b/g) || [];
      for (var m = 0; m < multiCap.length; m++) {
        var span = multiCap[m].trim();
        var words = span.split(/\s+/);
        if (words.length >= 2 && !Lex.STOPWORDS.has(words[0].toLowerCase())) {
          addEntity(span);
        }
      }
      // Single mid-sentence capitalized tokens
      var wordsInSent = st.split(/\s+/);
      for (var w = 1; w < wordsInSent.length; w++) {
        var tok = wordsInSent[w].replace(/[^A-Za-z0-9-]/g, "");
        if (/^[A-Z][a-z]{2,}$/.test(tok) && !Lex.STOPWORDS.has(tok.toLowerCase())) {
          addEntity(tok);
        }
      }
    }

    var list = Object.keys(entityCounts).map(function (name) {
      return { name: name, count: entityCounts[name] };
    });
    list.sort(function (a, b) {
      return b.count - a.count || b.name.length - a.name.length;
    });
    return list.slice(0, 15);
  }

  function extractNumbers(plainText) {
    var matches = String(plainText || "").match(/(?:[$€£]\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?(?:\s*(?:%|x|ms|s|kg|lb|psi|kw|gb|mb|tb|hrs?|hours?|days?|weeks?|months?|years?|yrs?|minutes?|quarters?))?)/gi) || [];
    var seen = new Set();
    var out = [];
    for (var i = 0; i < matches.length; i++) {
      var val = matches[i].trim();
      if (!val || seen.has(val.toLowerCase())) continue;
      seen.add(val.toLowerCase());
      out.push(val);
    }
    return out.slice(0, 20);
  }

  function extractSubjectModel(parsedDoc, overrideKeyword) {
    var wordFreq = {};
    var wordDegree = {};
    var candidates = [];

    var processSegment = function (text, zoneWeight, sentIdx) {
      var clauses = String(text || "").split(/[,;:!?()\[\]"“”—–\/]+/);
      for (var clIdx = 0; clIdx < clauses.length; clIdx++) {
        var tokens = clauses[clIdx].toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
        var currentPhrase = [];
        var flush = function () {
          if (currentPhrase.length > 0 && currentPhrase.length <= 4) {
            candidates.push({ words: currentPhrase.slice(), zoneWeight: zoneWeight, sentIdx: sentIdx });
          }
          // Generate sliding 2-word, 3-word, and 4-word windows even on longer noun spans
          if (currentPhrase.length >= 3) {
            for (var k = 0; k <= currentPhrase.length - 2; k++) {
              candidates.push({ words: currentPhrase.slice(k, k + 2), zoneWeight: zoneWeight, sentIdx: sentIdx });
            }
          }
          if (currentPhrase.length >= 4) {
            for (var k3 = 0; k3 <= currentPhrase.length - 3; k3++) {
              candidates.push({ words: currentPhrase.slice(k3, k3 + 3), zoneWeight: zoneWeight, sentIdx: sentIdx });
            }
          }
          if (currentPhrase.length >= 5) {
            for (var k4 = 0; k4 <= currentPhrase.length - 4; k4++) {
              candidates.push({ words: currentPhrase.slice(k4, k4 + 4), zoneWeight: zoneWeight, sentIdx: sentIdx });
            }
          }
          currentPhrase = [];
        };

        for (var i = 0; i < tokens.length; i++) {
          var tok = tokens[i];
          var isStop = Lex.STOPWORDS.has(tok) || (Lex.PHRASE_BOUNDARY_WORDS && Lex.PHRASE_BOUNDARY_WORDS.has(tok)) || /^\d+$/.test(tok) || tok.length < 2;
          if (isStop) {
            flush();
          } else {
            currentPhrase.push(tok);
            wordFreq[tok] = (wordFreq[tok] || 0) + 1;
          }
        }
        flush();
      }
    };

    for (var h = 0; h < parsedDoc.headings.length; h++) {
      processSegment(parsedDoc.headings[h].text, parsedDoc.headings[h].level === 1 ? 1.5 : 1.25, -1);
    }
    for (var s = 0; s < parsedDoc.sentences.length; s++) {
      var posWeight = s < Math.max(2, Math.ceil(parsedDoc.sentences.length * 0.2)) ? 1.35 : 1.0;
      processSegment(parsedDoc.sentences[s].text, posWeight, s);
    }

    // Compute word degree for RAKE
    for (var c = 0; c < candidates.length; c++) {
      var cw = candidates[c].words;
      for (var j = 0; j < cw.length; j++) {
        wordDegree[cw[j]] = (wordDegree[cw[j]] || 0) + cw.length;
      }
    }

    // Aggregate by stem signature
    var clusters = {};
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      var phraseStr = cand.words.join(" ");
      var nonWeakCount = 0;
      for (var wi = 0; wi < cand.words.length; wi++) {
        if (!Lex.GENERIC_SEO_WEAK_WORDS.has(cand.words[wi])) nonWeakCount++;
      }
      if (nonWeakCount === 0) continue;
      if (cand.words.length === 1 && Lex.GENERIC_SEO_WEAK_WORDS.has(cand.words[0])) continue;

      var sig = cand.words.map(Lex.stemWord).join(" ");
      if (!clusters[sig]) {
        clusters[sig] = {
          sig: sig,
          wordCount: cand.words.length,
          variants: {},
          sentences: new Set(),
          zoneScoreSum: 0,
          occurrences: 0,
          rakeBase: 0
        };
      }
      var cl = clusters[sig];
      cl.variants[phraseStr] = (cl.variants[phraseStr] || 0) + 1;
      cl.sentences.add(cand.sentIdx);
      cl.zoneScoreSum += cand.zoneWeight;
      cl.occurrences += 1;

      var rake = 0;
      for (var rk = 0; rk < cand.words.length; rk++) {
        var wTok = cand.words[rk];
        rake += (wordDegree[wTok] || 1) / (wordFreq[wTok] || 1);
      }
      cl.rakeBase = Math.max(cl.rakeBase, rake);
    }

    var scored = Object.keys(clusters).map(function (sig) {
      var cl = clusters[sig];
      var bestVariant = "";
      var bestVarCount = -1;
      Object.keys(cl.variants).forEach(function (v) {
        if (cl.variants[v] > bestVarCount) {
          bestVarCount = cl.variants[v];
          bestVariant = v;
        }
      });

      var lenBonus = cl.wordCount === 3 ? 1.85 : cl.wordCount === 2 ? 1.80 : cl.wordCount === 4 ? 1.65 : 0.45;
      var docBreadth = Math.pow(Math.max(1, cl.sentences.size), 1.45);
      var freqBonus = Math.pow(Math.max(1, cl.occurrences), 0.75);
      var avgZone = cl.zoneScoreSum / Math.max(1, cl.occurrences);
      // Lightly reward cohesive RAKE score but cap its influence so 1-off phrases never beat repeated domain subjects
      var cappedRake = Math.min(2.2, 0.8 + cl.rakeBase * 0.25);

      // Penalize phrases starting/ending with weak verbs/adjectives
      var bestTokens = bestVariant.split(" ");
      var weakEdgePenalty = (Lex.GENERIC_SEO_WEAK_WORDS.has(bestTokens[0]) || Lex.GENERIC_SEO_WEAK_WORDS.has(bestTokens[bestTokens.length - 1])) ? 0.5 : 1.0;

      var score = cappedRake * lenBonus * docBreadth * freqBonus * avgZone * weakEdgePenalty;
      return {
        phrase: bestVariant,
        sig: sig,
        wordCount: cl.wordCount,
        occurrences: cl.occurrences,
        sentenceSpread: cl.sentences.size,
        score: Math.round(score * 100) / 100
      };
    });

    scored.sort(function (a, b) {
      return b.score - a.score || b.occurrences - a.occurrences || b.wordCount - a.wordCount;
    });

    // Deduplicate overlapping substring phrases so candidates & secondaries are diverse
    var diverse = [];
    for (var di = 0; di < scored.length; di++) {
      var item = scored[di];
      var overlaps = false;
      for (var dj = 0; dj < diverse.length; dj++) {
        var existing = diverse[dj];
        if (existing.phrase === item.phrase) {
          overlaps = true;
          break;
        }
        // Only suppress a shorter sub-phrase if the longer parent already scored higher AND covers almost all occurrences
        if (existing.phrase.indexOf(item.phrase) !== -1 && item.occurrences <= existing.occurrences + 1) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) diverse.push(item);
      if (diverse.length >= 15) break;
    }

    var detectedPrimary = diverse.length > 0 ? diverse[0].phrase : "document overview";
    var manual = String(overrideKeyword || "").trim();
    var isGroundedInText = true;
    var activePrimary = detectedPrimary;

    if (manual) {
      var lowPlain = parsedDoc.plainText.toLowerCase();
      var manualTokens = tokenizeLowerWords(manual).filter(function (t) { return !Lex.STOPWORDS.has(t); });
      var matchedTokens = 0;
      for (var mt = 0; mt < manualTokens.length; mt++) {
        var stem = Lex.stemWord(manualTokens[mt]);
        if (lowPlain.indexOf(manualTokens[mt]) !== -1 || (stem.length >= 3 && lowPlain.indexOf(stem) !== -1)) {
          matchedTokens++;
        }
      }
      isGroundedInText = manualTokens.length > 0 && matchedTokens / manualTokens.length >= 0.6;
      if (isGroundedInText) {
        activePrimary = manual.toLowerCase();
      }
    }

    // Secondary keyphrases distinct from activePrimary
    var primaryTokens = new Set(tokenizeLowerWords(activePrimary).map(Lex.stemWord));
    var secondaries = [];
    for (var si = 0; si < diverse.length; si++) {
      var candP = diverse[si].phrase;
      if (candP === activePrimary) continue;
      if (candP.indexOf(activePrimary) !== -1 || activePrimary.indexOf(candP) !== -1) continue;
      var cStems = tokenizeLowerWords(candP).map(Lex.stemWord);
      var shared = 0;
      for (var cs = 0; cs < cStems.length; cs++) {
        if (primaryTokens.has(cStems[cs])) shared++;
      }
      if (shared >= cStems.length && cStems.length > 0) continue;
      secondaries.push(diverse[si]);
      if (secondaries.length >= 6) break;
    }

    return {
      primaryKeyphrase: activePrimary,
      detectedPrimaryKeyphrase: detectedPrimary,
      requestedOverride: manual,
      isGroundedInText: isGroundedInText,
      candidateKeyphrases: diverse.slice(0, 8),
      secondaryKeyphrases: secondaries
    };
  }

  function classifySearchIntent(plainText, parsedDoc) {
    var low = String(plainText || "").toLowerCase();
    var counts = { procedural: 0, informational: 0, commercial: 0, transactional: 0 };

    Object.keys(INTENT_REGEX_MAP).forEach(function (intent) {
      var regexes = INTENT_REGEX_MAP[intent];
      for (var i = 0; i < regexes.length; i++) {
        var m = low.match(regexes[i]);
        if (m) counts[intent] += m.length;
      }
    });

    if (/\b(?:first|second|third)\s*,/i.test(plainText) || parsedDoc.lists.some(function (l) { return l.ordered; })) {
      counts.procedural += 4;
    }

    var total = counts.procedural + counts.informational + counts.commercial + counts.transactional;
    if (total === 0) counts.informational = 1;

    var best = "informational";
    var bestScore = -1;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestScore) {
        bestScore = counts[k];
        best = k;
      }
    });

    var confidence = Math.min(96, Math.max(55, Math.round((bestScore / Math.max(1, total)) * 100)));
    var schemaType = best === "procedural" ? "HowTo" : (/\b(?:api|psi|ssl|tls|protocol|architecture|icd-10|iso|soc 2|compressor|refrigerant|cloud)\b/i.test(plainText) ? "TechArticle" : "Article");

    return {
      primary: best,
      confidence: confidence,
      breakdown: counts,
      recommendedSchemaType: schemaType
    };
  }

  function computeReadability(parsedDoc) {
    var words = String(parsedDoc.plainText || "").match(/[A-Za-z]+/g) || [];
    var totalWords = Math.max(1, parsedDoc.totalWords);
    var totalSentences = Math.max(1, parsedDoc.sentences.length);
    var totalSyllables = 0;
    for (var i = 0; i < words.length; i++) {
      totalSyllables += Lex.countSyllables(words[i]);
    }
    var avgSentWords = totalWords / totalSentences;
    var avgSyllPerWord = totalSyllables / Math.max(1, words.length);
    var flesch = Math.round((206.835 - 1.015 * avgSentWords - 84.6 * avgSyllPerWord) * 10) / 10;
    var grade = Math.round((0.39 * avgSentWords + 11.8 * avgSyllPerWord - 15.59) * 10) / 10;

    var longParagraphCount = parsedDoc.paragraphs.filter(function (p) { return p.wordCount > 110; }).length;
    var longSentenceCount = parsedDoc.sentences.filter(function (s) { return s.wordCount > 30; }).length;
    var fillerCount = 0;
    for (var f = 0; f < Lex.FILLER_REPLACEMENTS.length; f++) {
      var m = parsedDoc.plainText.match(Lex.FILLER_REPLACEMENTS[f].pattern);
      if (m) fillerCount += m.length;
    }

    return {
      wordCount: parsedDoc.totalWords,
      sentenceCount: parsedDoc.sentences.length,
      avgSentenceWords: Math.round(avgSentWords * 10) / 10,
      fleschReadingEase: Math.max(0, Math.min(100, flesch)),
      gradeLevel: Math.max(1, grade),
      longParagraphCount: longParagraphCount,
      longSentenceCount: longSentenceCount,
      fillerCount: fillerCount
    };
  }

  function extractGroundedQuestions(parsedDoc, subject) {
    var primary = subject.primaryKeyphrase;
    var primaryTitle = Lex.toTitleCase(primary);
    var secondaries = subject.secondaryKeyphrases;
    var questions = [];
    var usedSentenceIds = new Set();

    var addQuestion = function (qText, sentList, kind) {
      if (!sentList || sentList.length === 0) return;
      var ids = sentList.map(function (s) { return s.id; });
      if (usedSentenceIds.has(ids[0])) return;
      usedSentenceIds.add(ids[0]);
      questions.push({
        question: qText,
        answerSourceSentences: sentList,
        sourceIds: ids,
        kind: kind
      });
    };

    // 1. Definition / Purpose question
    var defSents = parsedDoc.sentences.filter(function (s) {
      var low = s.text.toLowerCase();
      return low.indexOf(primary) !== -1 && /\b(is|are|refers|depend|rely|adopt|designed|protect|reduce|preserve|validate)\b/.test(low);
    });
    if (defSents.length > 0) {
      addQuestion("How does " + primary + " work in practice?", [defSents[0]], "purpose");
    }

    // 2. Requirements / Negation / Boundary question
    var reqSents = parsedDoc.sentences.filter(function (s) {
      return !usedSentenceIds.has(s.id) && /\b(requires|must|does not|never|without|strict|audit|compliance|controls|standards)\b/i.test(s.text);
    });
    if (reqSents.length > 0) {
      var topicHint = secondaries[0] ? secondaries[0].phrase : primary;
      addQuestion("What controls and limits apply to " + topicHint + "?", [reqSents[0]], "requirements");
    }

    // 3. Process / Risk / Impact question
    var procSents = parsedDoc.sentences.filter(function (s) {
      return !usedSentenceIds.has(s.id) && /\b(first|second|third|when|delayed|reduce|lowered|extend|contain|minute|hours|%|psi|\$)\b/i.test(s.text);
    });
    if (procSents.length > 0) {
      var hint1 = secondaries[0] ? secondaries[0].phrase : primary;
      var hint2 = secondaries[1] ? secondaries[1].phrase : "operational performance";
      addQuestion("How does " + hint1 + " affect " + hint2.toLowerCase() + "?", [procSents[0]], "impact");
    }

    // 4. Fallback high-salience factual question
    if (questions.length < 3 && parsedDoc.sentences.length >= 3) {
      for (var i = 0; i < parsedDoc.sentences.length && questions.length < 3; i++) {
        var cand = parsedDoc.sentences[i];
        if (!usedSentenceIds.has(cand.id) && cand.wordCount >= 10) {
          var sHint = secondaries[questions.length] ? secondaries[questions.length].phrase : primary;
          addQuestion("What key factors govern " + sHint + "?", [cand], "detail");
        }
      }
    }

    return questions.slice(0, 4);
  }

  function analyzeWritingPurpose(plainText, parsedDoc, subject, intent, contentMode) {
    var txt = String(plainText || "");
    var p = subject.primaryKeyphrase || "your topic";
    var secondaries = subject.secondaryKeyphrases || [];

    var category = { id: "article", label: "Industry Article / Informational Page" };
    if (contentMode === "creative") {
      category = { id: "creative", label: "Book Blurb / Creative Story" };
    } else if (contentMode === "product") {
      category = { id: "product", label: "Product / Store Listing" };
    } else if (contentMode === "blog") {
      category = intent.primary === "procedural"
        ? { id: "guide", label: "Step-by-Step How-To Guide" }
        : { id: "article", label: "Blog Post / Industry Article" };
    } else {
      var fictionMatches = txt.match(/\b(novel|novels|trilogy|protagonist|sci-fi|thriller|thrillers|fantasy|romance|mystery|memoir|fiction|starship|interstellar|sorcerer|detective|armada|chapter)\b/gi) || [];
      var fictionSet = new Set(fictionMatches.map(function (m) { return m.toLowerCase(); }));
      var businessMatches = txt.match(/\b(our team|homeowners|clients|customers|contractor|repair|installation|inspection|estimate|compliance|audit|enterprise|workflow|facility|technicians|patients|hospitals|warranty|pricing)\b/gi) || [];

      if (fictionSet.size >= 2 && businessMatches.length === 0) {
        category = { id: "creative", label: "Book Blurb / Creative Story" };
      } else if (/\b(our team|we |homeowners|clients|customers|service|services|contractor|repair|installation|inspection|estimate|visit)\b/i.test(txt)) {
        category = { id: "service", label: "Business / Local Service Page" };
      } else if (/\b(cart|shipping|warranty|specifications|specs|features|product|store)\b/i.test(txt)) {
        category = { id: "product", label: "Product / Store Listing" };
      } else if (intent.primary === "procedural") {
        category = { id: "guide", label: "Step-by-Step How-To Guide" };
      }
    }

    var audience = "Readers searching for " + p;
    var audMatch = txt.match(/\b(homeowners|enterprise cloud teams|cloud security teams|commercial facility managers|facility managers|field technicians|healthcare revenue cycle leaders|medical groups|hospitals|small businesses|readers|customers|clients|patients|teams)\b/i);
    if (audMatch && audMatch[1]) {
      audience = Lex.toTitleCase(audMatch[1]);
    }

    var seedSet = new Set([p]);
    if (category.id === "service") seedSet.add(p + " services");
    else if (category.id === "product") seedSet.add("best " + p);
    else if (category.id === "creative") seedSet.add(p + " thriller");
    else seedSet.add("how " + p + " works");

    for (var i = 0; i < secondaries.length && seedSet.size < 4; i++) {
      if (secondaries[i] && secondaries[i].phrase) seedSet.add(secondaries[i].phrase);
    }

    var seedQueries = Array.from(seedSet);
    var goalSummary = "Written as a " + category.label + " for " + audience + ", targeting searches around '" + p + "'.";
    return {
      category: category,
      audience: audience,
      seedQueries: seedQueries,
      goalSummary: goalSummary
    };
  }

  function generateFallbackKeywords(subject, purpose) {
    var p = subject.primaryKeyphrase || "topic";
    var sec0 = subject.secondaryKeyphrases[0] ? subject.secondaryKeyphrases[0].phrase : "";
    var catId = purpose && purpose.category ? purpose.category.id : "article";
    var list = [];
    if (catId === "service") {
      list = [p + " cost", p + " inspection", "local " + p, "residential " + p, "emergency " + p, p + " contractor", p + " estimate", sec0 ? (sec0 + " inspection") : (p + " checklist")];
    } else if (catId === "product") {
      list = [p + " specifications", p + " features", "best " + p, p + " reviews", p + " comparison", p + " pricing", sec0 || (p + " setup")];
    } else if (catId === "creative") {
      list = [p + " novel", p + " series", p + " thriller", "character-driven " + p, p + " adventure", sec0 || (p + " mystery")];
    } else {
      list = [p + " best practices", p + " guide", p + " checklist", p + " requirements", "how " + p + " works", p + " examples", sec0 ? (sec0 + " standards") : (p + " benefits")];
    }
    var seen = {};
    return list.filter(function (k) {
      var low = String(k || "").toLowerCase().trim();
      if (!low || low === p || seen[low]) return false;
      seen[low] = true;
      return true;
    }).map(function (k) {
      return { phrase: k, source: "Topic Match" };
    });
  }

  function analyze(rawInput, options) {
    var opts = options || {};
    var parsed = parseDocument(rawInput);
    var subject = extractSubjectModel(parsed, opts.overrideKeyword);
    var intent = classifySearchIntent(parsed.plainText, parsed);
    var entities = extractEntities(parsed.plainText, parsed.sentences);
    var numbers = extractNumbers(parsed.plainText);
    var readability = computeReadability(parsed);
    var groundedQuestions = extractGroundedQuestions(parsed, subject);
    var purpose = analyzeWritingPurpose(parsed.plainText, parsed, subject, intent, opts.contentMode);
    var fallbackKeywords = generateFallbackKeywords(subject, purpose);

    return {
      parsed: parsed,
      subject: subject,
      intent: intent,
      purpose: purpose,
      fallbackKeywords: fallbackKeywords,
      entities: entities,
      numbers: numbers,
      readability: readability,
      groundedQuestions: groundedQuestions
    };
  }

  VeriRank.Analyzer = {
    analyze: analyze,
    parseDocument: parseDocument,
    splitSentences: splitSentences,
    countWords: countWords,
    extractEntities: extractEntities,
    extractNumbers: extractNumbers
  };
})(window);
