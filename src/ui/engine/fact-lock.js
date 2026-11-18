(function (global) {
  "use strict";
  var VeriRank = (global.VeriRank = global.VeriRank || {});
  var Lex = VeriRank.Lexicon;

  // Purely structural/editorial connector words permitted in generated headings & FAQ scaffolding
  var RAW_CONNECTOR_WORDS = [
    "overview", "key", "takeaway", "takeaways", "summary", "frequent", "frequently", "ask", "asked",
    "question", "questions", "faq", "guid", "guide", "step", "steps", "checklist", "factor", "factors",
    "point", "what", "how", "why", "when", "where", "which", "does", "do", "did", "can", "is",
    "are", "and", "or", "for", "with", "from", "into", "under", "about", "requir", "require", "requires",
    "control", "controls", "limit", "limits", "apply", "impact", "govern", "practic", "practical",
    "essenti", "essential", "core", "standard", "standards", "detail", "details", "perform", "performance",
    "benefit", "benefits", "process", "action", "implement", "implementation", "use", "using",
    "organiz", "organization", "organizations", "team", "work", "explain", "explains", "highlight", "note",
    "focus", "focusing", "section", "best", "inspect", "inspection", "feature", "features",
    "specific", "specification", "specifications", "insight", "insights", "synopsis", "complete",
    "soon", "daili", "daily", "regular", "regularly", "near", "regard", "regarding", "addit", "addition",
    "additional", "additionally", "mani", "many", "most", "let", "lets", "ensur", "ensure", "decid", "decide",
    "consid", "consider", "help", "helps", "first", "various", "unique", "before", "befor", "after",
    "alway", "always", "usual", "usually", "mostli", "mostly", "month", "monthly", "week", "weekly",
    "annual", "annually", "whether", "evaluat", "evaluate", "evaluating", "improv", "improve", "protect",
    "support", "supports", "cover", "covers", "alongsid", "alongside", "depend", "dependable",
    "understand", "understanding", "fan", "fans", "feel", "home", "servic", "service", "services", "built",
    "clear", "guidance", "informed", "decision", "decisions", "every", "consultation", "clarify", "clarifies",
    "begin", "begins", "know", "knowing", "keep", "keeps", "stage", "straightforward", "review", "reviewing",
    "upfront", "option", "options", "move", "moving", "forward", "plan", "planning", "early", "expectation",
    "expectations", "align", "aligned", "heart", "raise", "raises", "stake", "stakes", "discovery", "shape",
    "shaped", "story", "tension", "high", "start", "finish", "throughout", "choice", "carry", "carries",
    "lasting", "consequence", "consequences", "blend", "blending", "chapter", "drawn", "straight", "narrative",
    "pair", "pairs", "relentless", "momentum", "build", "builds", "opening", "page", "project", "thorough",
    "attention", "completion", "reliable", "long", "term", "result", "results", "priority", "priorities",
    "include", "includes", "mind", "comparing", "compare", "select", "selecting", "right", "fit", "day",
    "operation", "operations", "operational", "strengthen", "strengthens", "consistency", "consistent",
    "local", "residential", "emergency", "licensed", "estimate",
    "prioritize", "prioritizes", "prioritizing", "documentation", "confidence", "buyer", "buyers",
    "overall", "everyday", "cleanly", "suspense", "suspenseful", "driven", "turn", "turns",
    "deepen", "deepens", "central", "outcome", "outcomes", "clarity", "weigh", "ahead", "direction", "rich"
  ];
  var ALLOWED_CONNECTOR_STEMS = new Set();
  RAW_CONNECTOR_WORDS.forEach(function (w) {
    ALLOWED_CONNECTOR_STEMS.add(w);
    ALLOWED_CONNECTOR_STEMS.add(Lex.stemWord(w));
  });

  var ALLOWED_STRUCTURAL_ACRONYMS = new Set(["FAQ", "SEO", "HTML", "JSON", "URL", "API", "AI"]);

  var COMMON_HEADING_CAPITALIZED = new Set([
    "Key", "Takeaways", "Executive", "Summary", "Frequently", "Asked", "Questions",
    "Overview", "Core", "Controls", "Practical", "Steps", "Requirements", "Limits",
    "Impact", "Performance", "Implementation", "Guide", "Checklist", "How", "Why",
    "What", "When", "Where", "Which", "Does", "Organizations", "Apply", "Govern",
    "Factors", "Details", "Standards", "And", "For", "With", "The", "This", "These",
    "First", "Second", "Third", "Finally", "However", "Therefore", "Because",
    "Inspection", "Procedure", "Features", "Specifications", "Highlights", "Insights", "Synopsis", "Complete", "Practice",
    "Additionally", "Many", "Most", "Ensure", "Essential", "Usually", "Mostly", "Always", "Understanding", "Built", "Services", "Fans",
    "Clear", "Every", "Knowing", "Reviewing", "Evaluating", "Shaped", "Throughout", "Blending", "Dependable", "Focusing", "Comparing", "Consistent",
    "At", "Driven", "Prioritizing", "Projects", "Thorough", "Shoppers", "Buyers"
  ]);

  function normalizeNumberToken(tok) {
    return String(tok || "")
      .toLowerCase()
      .replace(/,/g, "")
      .replace(/\s+/g, "")
      .replace(/hours?$/, "hr")
      .replace(/hrs?$/, "hr")
      .replace(/minutes?$/, "min")
      .replace(/years?$/, "yr")
      .replace(/yrs?$/, "yr")
      .replace(/days?$/, "d");
  }

  function stripNonProseMarkup(text, stripStructuralBanners) {
    var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      // Strip HTML tags
      line = line.replace(/<[^>]+>/g, " ");
      // Strip markdown heading hashes and list bullets / ordered list numbers
      var isHeading = /^#{1,6}\s+/.test(line);
      line = line.replace(/^#{1,6}\s+/, "");
      line = line.replace(/^[-*+]\s+/, "");
      line = line.replace(/^\d+[.)]\s+/, "");
      line = line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").trim();
      if (!line) continue;

      if (stripStructuralBanners && isHeading) {
        var low = line.toLowerCase();
        if (low === "key takeaways" || low === "executive summary" || low === "frequently asked questions" || low === "overview") {
          continue;
        }
      }
      kept.push({ text: line, isHeading: isHeading });
    }
    return kept;
  }

  function extractNumbersFromProse(text) {
    var lines = stripNonProseMarkup(text, true);
    var prose = lines.map(function (l) { return l.text; }).join(" ");
    var matches = prose.match(/(?:[$€£]\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?(?:\s*(?:%|x|ms|s|kg|lb|psi|kw|gb|mb|tb|hrs?|hours?|days?|weeks?|months?|years?|yrs?|minutes?|quarters?))?)/gi) || [];
    var normSet = new Set();
    var rawList = [];
    for (var i = 0; i < matches.length; i++) {
      var raw = matches[i].trim();
      var norm = normalizeNumberToken(raw);
      if (norm && !normSet.has(norm)) {
        normSet.add(norm);
        rawList.push({ raw: raw, norm: norm });
      }
    }
    return { normSet: normSet, rawList: rawList };
  }

  function extractEntitiesFromProse(text, isCandidate) {
    var lines = stripNonProseMarkup(text, true);
    var acronyms = new Set();
    var properNouns = new Set();

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].text;
      var acrMatches = line.match(/\b[A-Z]{2,}(?:-\d+)?\b/g) || [];
      for (var a = 0; a < acrMatches.length; a++) {
        var ac = acrMatches[a];
        if (!ALLOWED_STRUCTURAL_ACRONYMS.has(ac)) {
          acronyms.add(ac);
        }
      }

      // Skip Title-Case heading capitalization noise when scanning headings in candidate mode;
      // only check acronyms & non-common capitalized entities inside body sentences
      if (!lines[i].isHeading) {
        var words = line.split(/\s+/);
        for (var w = 1; w < words.length; w++) {
          var cleaned = words[w].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9-]+$/g, "");
          if (/^[A-Z][a-z]{2,}$/.test(cleaned)) {
            if (!Lex.STOPWORDS.has(cleaned.toLowerCase()) && !COMMON_HEADING_CAPITALIZED.has(cleaned)) {
              properNouns.add(cleaned);
            }
          }
        }
      } else if (!isCandidate) {
        // In source text, headings may also introduce proper nouns
        var hWords = line.split(/\s+/);
        for (var hw = 0; hw < hWords.length; hw++) {
          var hClean = hWords[hw].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9-]+$/g, "");
          if (/^[A-Z][a-z]{2,}$/.test(hClean) && !Lex.STOPWORDS.has(hClean.toLowerCase()) && !COMMON_HEADING_CAPITALIZED.has(hClean)) {
            properNouns.add(hClean);
          }
        }
      }
    }
    return { acronyms: acronyms, properNouns: properNouns };
  }

  function extractNegationWindows(sentence) {
    var tokens = String(sentence || "").toLowerCase().replace(/'/g, "").match(/[a-z0-9]+/g) || [];
    var windows = [];
    for (var i = 0; i < tokens.length; i++) {
      if (Lex.POLARITY_MARKERS.has(tokens[i])) {
        var anchorStems = new Set();
        var start = Math.max(0, i - 3);
        var end = Math.min(tokens.length - 1, i + 4);
        for (var j = start; j <= end; j++) {
          if (j === i) continue;
          var t = tokens[j];
          if (!Lex.STOPWORDS.has(t) && !Lex.POLARITY_MARKERS.has(t) && t.length >= 3 && !/^\d+$/.test(t)) {
            anchorStems.add(Lex.stemWord(t));
          }
        }
        if (anchorStems.size >= 2) {
          windows.push({ marker: tokens[i], anchorStems: anchorStems });
        }
      }
    }
    return windows;
  }

  function hasLocalNegationNearStems(sentence, anchorStems) {
    var tokens = String(sentence || "").toLowerCase().replace(/'/g, "").match(/[a-z0-9]+/g) || [];
    var hitIndices = [];
    for (var i = 0; i < tokens.length; i++) {
      var st = Lex.stemWord(tokens[i]);
      if (anchorStems.has(st)) {
        hitIndices.push(i);
      }
    }
    if (hitIndices.length === 0) return false;
    var minIdx = Math.max(0, hitIndices[0] - 4);
    var maxIdx = Math.min(tokens.length - 1, hitIndices[hitIndices.length - 1] + 4);
    for (var k = minIdx; k <= maxIdx; k++) {
      if (Lex.POLARITY_MARKERS.has(tokens[k])) return true;
    }
    return false;
  }

  function getContentStems(text) {
    var tokens = String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
    var stems = new Set();
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (Lex.STOPWORDS.has(t) || /^\d+$/.test(t) || t.length < 3) continue;
      stems.add(Lex.stemWord(t));
    }
    return stems;
  }

  function extractFingerprint(sourceText, approvedKeywords) {
    sourceText = Lex.normalizeTypography(sourceText);
    var approvedSuffix = (Array.isArray(approvedKeywords) && approvedKeywords.length)
      ? (" " + Lex.normalizeTypography(approvedKeywords.join(" ")))
      : "";
    var fpText = sourceText + approvedSuffix;
    var nums = extractNumbersFromProse(fpText);
    var ents = extractEntitiesFromProse(fpText, false);
    var stems = getContentStems(fpText);
    var lines = stripNonProseMarkup(sourceText, false);
    var plainProse = lines.map(function (l) { return l.text; }).join(" ");
    var sentences = VeriRank.Analyzer.splitSentences(plainProse);

    var negatedClaims = [];
    for (var i = 0; i < sentences.length; i++) {
      var wins = extractNegationWindows(sentences[i]);
      for (var w = 0; w < wins.length; w++) {
        negatedClaims.push({
          id: "S" + (i + 1),
          text: sentences[i],
          marker: wins[w].marker,
          stems: wins[w].anchorStems
        });
      }
    }

    // Also include every capitalized word stem in source text + approved keywords
    var sourceLower = String(fpText || "").toLowerCase();

    return {
      numbers: nums,
      entities: ents,
      stems: stems,
      negatedClaims: negatedClaims,
      sourceLower: sourceLower
    };
  }

  function verify(sourceText, candidateBodyText, provenanceRecords, approvedKeywords) {
    sourceText = Lex.normalizeTypography(sourceText);
    candidateBodyText = Lex.normalizeTypography(candidateBodyText);
    var fp = extractFingerprint(sourceText, approvedKeywords);
    var issues = [];

    var candLines = stripNonProseMarkup(candidateBodyText, true);
    var candTextJoined = candLines.map(function (l) { return l.text; }).join(" ");
    var candSentences = [];
    for (var li = 0; li < candLines.length; li++) {
      if (candLines[li].isHeading) {
        candSentences.push({ text: candLines[li].text, isHeading: true });
      } else {
        var split = VeriRank.Analyzer.splitSentences(candLines[li].text);
        for (var si = 0; si < split.length; si++) {
          candSentences.push({ text: split[si], isHeading: false });
        }
      }
    }

    // 1. Check for invented numbers
    var candNums = extractNumbersFromProse(candidateBodyText);
    var matchedNumbers = [];
    candNums.rawList.forEach(function (item) {
      // Allow bare number if source has the number with/without unit, e.g., source has "14 minutes" and candidate has "14 minutes" or "14"
      var bareNorm = item.norm.replace(/[a-z%$€£]+$/i, "");
      var found = fp.numbers.normSet.has(item.norm);
      if (!found && bareNorm) {
        fp.numbers.normSet.forEach(function (srcNorm) {
          if (srcNorm === bareNorm || srcNorm.replace(/[a-z%$€£]+$/i, "") === item.norm) {
            found = true;
          }
        });
      }
      if (found) {
        matchedNumbers.push(item.raw);
      } else {
        var offendingSent = candSentences.find(function (cs) { return cs.text.indexOf(item.raw) !== -1; });
        issues.push({
          severity: "critical",
          type: "UNGROUNDED_NUMBER",
          token: item.raw,
          sentence: offendingSent ? offendingSent.text : candidateBodyText.slice(0, 140),
          explanation: "Numeric claim '" + item.raw + "' does not appear in the original source text."
        });
      }
    });

    // 2. Check for invented acronyms / proper nouns
    var candEnts = extractEntitiesFromProse(candidateBodyText, true);
    candEnts.acronyms.forEach(function (ac) {
      if (!fp.entities.acronyms.has(ac) && fp.sourceLower.indexOf(ac.toLowerCase()) === -1) {
        var offending = candSentences.find(function (cs) { return cs.text.indexOf(ac) !== -1; });
        issues.push({
          severity: "critical",
          type: "UNGROUNDED_ENTITY",
          token: ac,
          sentence: offending ? offending.text : "",
          explanation: "Acronym/entity '" + ac + "' is absent from the source text."
        });
      }
    });
    candEnts.properNouns.forEach(function (pn) {
      var pnStem = Lex.stemWord(pn);
      if (!fp.entities.properNouns.has(pn) && fp.sourceLower.indexOf(pn.toLowerCase()) === -1 && !fp.stems.has(pnStem)) {
        var offendingPn = candSentences.find(function (cs) { return cs.text.indexOf(pn) !== -1; });
        issues.push({
          severity: "critical",
          type: "UNGROUNDED_ENTITY",
          token: pn,
          sentence: offendingPn ? offendingPn.text : "",
          explanation: "Proper noun/brand '" + pn + "' was not present in the source text."
        });
      }
    });

    // 3. Polarity Flip Detection on negated source claims (local window check)
    for (var nc = 0; nc < fp.negatedClaims.length; nc++) {
      var claim = fp.negatedClaims[nc];
      if (claim.stems.size < 2) continue;
      for (var csIdx = 0; csIdx < candSentences.length; csIdx++) {
        var candSent = candSentences[csIdx];
        if (candSent.isHeading) continue;
        var candStems = getContentStems(candSent.text);
        var overlap = 0;
        claim.stems.forEach(function (st) {
          if (candStems.has(st)) overlap++;
        });
        var overlapRatio = overlap / Math.max(1, claim.stems.size);
        if (overlap >= 2 && overlapRatio >= 0.65 && !hasLocalNegationNearStems(candSent.text, claim.stems)) {
          issues.push({
            severity: "critical",
            type: "POLARITY_FLIP",
            token: claim.id + " ('" + claim.marker + "')",
            sentence: candSent.text,
            explanation: "Source claim (" + claim.id + ") contained a local negation/restriction ('" + claim.marker + "') that is missing near the same terms in the output sentence."
          });
        }
      }
    }

    // 4. Vocabulary Drift Check (novel stems per prose sentence)
    var totalCandStems = 0;
    var totalNovelStems = 0;
    for (var vs = 0; vs < candSentences.length; vs++) {
      var sObj = candSentences[vs];
      if (sObj.isHeading) continue;
      var sStems = getContentStems(sObj.text);
      if (sStems.size < 4) continue;
      var novel = [];
      sStems.forEach(function (st) {
        totalCandStems++;
        if (!fp.stems.has(st) && !ALLOWED_CONNECTOR_STEMS.has(st)) {
          novel.push(st);
          totalNovelStems++;
        }
      });
      var novelRatio = novel.length / Math.max(1, sStems.size);
      if (novel.length >= 3 && novelRatio > 0.38) {
        issues.push({
          severity: "critical",
          type: "UNGROUNDED_CLAIM",
          token: novel.slice(0, 4).join(", "),
          sentence: sObj.text,
          explanation: "Sentence introduces " + Math.round(novelRatio * 100) + "% ungrounded terminology not found in source text."
        });
      }
    }

    var droppedNumbers = [];
    fp.numbers.rawList.forEach(function (item) {
      if (!candNums.normSet.has(item.norm)) {
        droppedNumbers.push(item.raw);
      }
    });

    var novelStemsPct = totalCandStems > 0 ? Math.round((totalNovelStems / totalCandStems) * 1000) / 10 : 0;
    var passed = issues.length === 0;
    var groundingScore = passed
      ? Math.max(95, Math.round(100 - Math.min(5, novelStemsPct)))
      : Math.max(0, 100 - issues.length * 25);

    return {
      passed: passed,
      status: passed ? "VERIFIED_GROUNDED" : "HALLUCINATION_BLOCKED",
      groundingScore: groundingScore,
      sourceStats: {
        numbers: fp.numbers.rawList.map(function (n) { return n.raw; }),
        entities: Array.from(fp.entities.acronyms).concat(Array.from(fp.entities.properNouns)),
        polarityProtectedCount: fp.negatedClaims.length
      },
      verifiedStats: {
        matchedNumbers: matchedNumbers,
        droppedNumbers: droppedNumbers,
        novelStemsPct: novelStemsPct
      },
      issues: issues,
      sentenceProvenance: provenanceRecords || []
    };
  }

  function sanitizeAiCandidate(sourceText, deterministicMarkdown, aiMarkdown, approvedKeywords) {
    var aiBlocks = String(aiMarkdown || "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
    var detBlocks = String(deterministicMarkdown || "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
    var sanitizedBlocks = [];
    var quarantined = [];

    for (var i = 0; i < aiBlocks.length; i++) {
      var blk = aiBlocks[i].trim();
      if (!blk) continue;
      var check = verify(sourceText, blk, [], approvedKeywords);
      if (check.passed) {
        sanitizedBlocks.push(blk);
      } else {
        var fallback = detBlocks[Math.min(i, Math.max(0, detBlocks.length - 1))] || "";
        quarantined.push({
          blockIndex: i,
          rejectedText: blk,
          issues: check.issues,
          restoredText: fallback
        });
        if (fallback) sanitizedBlocks.push(fallback);
      }
    }

    var finalText = sanitizedBlocks.join("\n\n").trim() || deterministicMarkdown;
    var finalAudit = verify(sourceText, finalText, [], approvedKeywords);
    return {
      text: finalText,
      quarantined: quarantined,
      audit: finalAudit
    };
  }

  VeriRank.FactLock = {
    extractFingerprint: extractFingerprint,
    verify: verify,
    sanitizeAiCandidate: sanitizeAiCandidate
  };
})(window);
