(function (global) {
  "use strict";
  var VeriRank = (global.VeriRank = global.VeriRank || {});
  var Lex = VeriRank.Lexicon;

  function capitalizeFirst(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatInlineMarkdown(escapedText) {
    return String(escapedText || "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function isNearNegationBoundary(leftStr, rightStr) {
    var negRe = /\b(?:not|never|no|without|neither|nor|cannot|can't|doesn't|don't|won't|didn't|isn't|aren't|only|unless|except)\b/i;
    var leftTail = leftStr.trim().split(/\s+/).slice(-4).join(" ");
    var rightHead = rightStr.trim().split(/\s+/).slice(0, 4).join(" ");
    return negRe.test(leftTail) || negRe.test(rightHead);
  }

  function tightenSentence(sentenceObj, provenanceOut, changesLog) {
    var txt = sentenceObj.text;
    var applied = [];

    for (var i = 0; i < Lex.FILLER_REPLACEMENTS.length; i++) {
      var rule = Lex.FILLER_REPLACEMENTS[i];
      var nextTxt = txt.replace(rule.pattern, rule.replacement);
      if (nextTxt !== txt) {
        txt = nextTxt;
        applied.push(rule.label);
      }
    }
    txt = txt.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
    txt = capitalizeFirst(txt);

    // Split overly long sentences (>= 26 words) at clean semicolon, ", which ", or compound ", and/so " boundaries
    var parts = [txt];
    var wordCount = VeriRank.Analyzer.countWords(txt);
    if (wordCount >= 26) {
      if (/;\s+(?:however|therefore|moreover|additionally),?\s+/i.test(txt)) {
        var semiSplit = txt.split(/;\s+(?=(?:however|therefore|moreover|additionally)\b)/i);
        if (semiSplit.length === 2 && VeriRank.Analyzer.countWords(semiSplit[0]) >= 8 && VeriRank.Analyzer.countWords(semiSplit[1]) >= 8) {
          parts = [
            semiSplit[0].replace(/[.;,\s]+$/, "") + ".",
            capitalizeFirst(semiSplit[1].trim())
          ];
          applied.push("Split long semicolon clause for readability");
        }
      } else if (/;\s+[a-z]{3,}/i.test(txt)) {
        var semiGen = txt.split(/;\s+/);
        if (semiGen.length === 2 && VeriRank.Analyzer.countWords(semiGen[0]) >= 9 && VeriRank.Analyzer.countWords(semiGen[1]) >= 9 && !isNearNegationBoundary(semiGen[0], semiGen[1])) {
          parts = [
            semiGen[0].replace(/[.;,\s]+$/, "") + ".",
            capitalizeFirst(semiGen[1].trim())
          ];
          applied.push("Split long compound sentence for easier reading");
        }
      } else if (/,\s+which\s+(?:means|meant|places|reduces|increases|prevents|allows|lets|creates|causes)\s+/i.test(txt)) {
        var idx = txt.search(/,\s+which\s+/i);
        if (idx > 32 && txt.length - idx > 28) {
          var left = txt.slice(0, idx).trim() + ".";
          var right = "This " + txt.slice(idx).replace(/^,\s+which\s+/i, "").trim();
          parts = [left, right];
          applied.push("Split long ', which' clause into two sentences");
        }
      } else {
        var compMatch = txt.match(/,\s+(?:and|so)\s+(?=(?:it|they|this|these|we|you|our|their|teams|organizations|companies|users|customers|patients|technicians|hospitals|facilities|readers)\b)/i);
        if (compMatch && compMatch.index > 35) {
          var cLeft = txt.slice(0, compMatch.index).trim();
          var cRight = txt.slice(compMatch.index + compMatch[0].length).trim();
          if (VeriRank.Analyzer.countWords(cLeft) >= 9 && VeriRank.Analyzer.countWords(cRight) >= 9 && !isNearNegationBoundary(cLeft, cRight)) {
            parts = [cLeft.replace(/[.;,\s]+$/, "") + ".", capitalizeFirst(cRight)];
            applied.push("Split long compound sentence for easier reading");
          }
        }
      }
    }

    for (var a = 0; a < applied.length; a++) {
      if (changesLog.indexOf(applied[a]) === -1) changesLog.push(applied[a]);
    }

    var result = [];
    for (var p = 0; p < parts.length; p++) {
      result.push(parts[p]);
      if (provenanceOut) {
        provenanceOut.push({
          outputSentence: parts[p],
          sourceIds: [sentenceObj.id],
          sourceTexts: [sentenceObj.text],
          editType: applied.length ? applied.join("; ") : "Preserved verbatim"
        });
      }
    }
    return result;
  }

  function tryExtractInlineSteps(sentenceObj) {
    var txt = sentenceObj.text.trim();
    var m = txt.match(/^(First|Second|Third|Fourth|Finally),\s+(.+)$/i);
    if (m) {
      return { marker: m[1].toLowerCase(), body: capitalizeFirst(m[2].trim()) };
    }
    return null;
  }

  function tryExtractColonList(sentenceText) {
    var m = String(sentenceText || "").trim().match(/^([^:]{12,90}):\s+([^.!?]{18,})[.!?]$/);
    if (!m) return null;
    var lead = m[1].trim() + ":";
    var rawItems = m[2].split(/,\s+(?:and\s+)?|\s+and\s+/i).map(function (s) { return s.trim(); }).filter(Boolean);
    if (rawItems.length < 3 || rawItems.length > 7) return null;
    var valid = rawItems.every(function (it) {
      var wc = VeriRank.Analyzer.countWords(it);
      return wc >= 1 && wc <= 12;
    });
    if (!valid) return null;
    return {
      lead: lead,
      items: rawItems.map(function (it) { return capitalizeFirst(it); })
    };
  }

  function distillTakeawayBullet(sentenceObj) {
    var tightened = tightenSentence(sentenceObj, null, []).join(" ");
    var stripped = tightened;
    var m = tightened.match(/^(?:In our \d{4} [^,]{4,45},\s+|When [^,]{8,55},\s+|With [^,]{4,35},\s+)/i);
    if (m && !/\b(?:not|never|no|without|unless|except|only)\b/i.test(m[0])) {
      var rest = tightened.slice(m[0].length).trim();
      if (VeriRank.Analyzer.countWords(rest) >= 10) {
        stripped = capitalizeFirst(rest);
      }
    }
    return trimToWordRange(stripped, 22);
  }

  function applyScannableBolding(blocks, primary, secondaries, contentMode) {
    var boldedCount = 0;
    var targets = [];
    if (primary) targets.push(primary);
    if (contentMode !== "creative" && Array.isArray(secondaries)) {
      for (var s = 0; s < secondaries.length && targets.length < 3; s++) {
        if (secondaries[s] && secondaries[s].phrase) targets.push(secondaries[s].phrase);
      }
    }
    var usedTargets = new Set();
    for (var bIdx = 0; bIdx < blocks.length; bIdx++) {
      var blk = blocks[bIdx];
      if (blk.type !== "p" || !blk.text) continue;
      for (var tIdx = 0; tIdx < targets.length; tIdx++) {
        var phrase = targets[tIdx];
        if (usedTargets.has(phrase)) continue;
        var esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
        var re = new RegExp("\\b(" + esc + ")\\b", "i");
        var match = blk.text.match(re);
        if (match) {
          var idx = match.index;
          var before = blk.text.slice(0, idx);
          if (before.slice(-2) === "**") continue;
          // Ensure we do not nest ** inside an already bolded phrase
          var openBold = (before.match(/\*\*/g) || []).length % 2 === 1;
          if (openBold) continue;
          blk.text = before + "**" + match[1] + "**" + blk.text.slice(idx + match[0].length);
          usedTargets.add(phrase);
          boldedCount++;
          break;
        }
      }
    }
    return boldedCount;
  }

  function trimToWordRange(text, maxWords) {
    var words = String(text || "").trim().split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(" ").replace(/[,;:\s]+$/, "") + ".";
  }

  function buildConstrainedTitle(primaryTitle, secondaryTitle, intentPrimary, maxChars, maxPixels, contentMode) {
    var candidates = [];
    if (contentMode === "creative") {
      if (secondaryTitle) {
        candidates.push(primaryTitle + " — " + secondaryTitle + " Synopsis");
        candidates.push(primaryTitle + ": " + secondaryTitle + " Story & Preview");
        candidates.push(primaryTitle + " — " + secondaryTitle);
      }
      candidates.push(primaryTitle + " — Official Synopsis & Preview");
      candidates.push(primaryTitle);
    } else if (contentMode === "product") {
      if (secondaryTitle) {
        candidates.push(primaryTitle + ": " + secondaryTitle + " Features & Specs");
        candidates.push(primaryTitle + " — Specifications & Overview");
        candidates.push(primaryTitle + " & " + secondaryTitle);
      }
      candidates.push(primaryTitle + " Features & Specifications");
      candidates.push(primaryTitle);
    } else {
      if (secondaryTitle) {
        if (intentPrimary === "procedural") {
          candidates.push(primaryTitle + ": " + secondaryTitle + " Checklist");
          candidates.push(primaryTitle + ": " + secondaryTitle + " Guide");
        } else {
          candidates.push(primaryTitle + ": " + secondaryTitle + " Overview");
          candidates.push(primaryTitle + " & " + secondaryTitle);
        }
      }
      candidates.push(primaryTitle + " Guide & Best Practices");
      candidates.push(primaryTitle);
    }

    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i].replace(/\s+/g, " ").trim();
      if (cand.length <= maxChars && Lex.estimatePixelWidth(cand) <= maxPixels) {
        if (cand.length >= 45 || i === candidates.length - 1) {
          return cand;
        }
      }
    }
    // Truncate cleanly at word boundary if primary itself is long
    var words = candidates[0].split(" ");
    var built = "";
    for (var w = 0; w < words.length; w++) {
      var next = built ? built + " " + words[w] : words[w];
      if (next.length > maxChars || Lex.estimatePixelWidth(next) > maxPixels) break;
      built = next;
    }
    return built || primaryTitle.slice(0, maxChars);
  }

  function buildTitleVariants(analysis, profile, contentMode, brandName) {
    var primary = analysis.subject.primaryKeyphrase;
    var primaryTitle = Lex.toTitleCase(primary);
    var sec1 = analysis.subject.secondaryKeyphrases[0] ? Lex.toTitleCase(analysis.subject.secondaryKeyphrases[0].phrase) : "";
    var sec2 = analysis.subject.secondaryKeyphrases[1] ? Lex.toTitleCase(analysis.subject.secondaryKeyphrases[1].phrase) : "";
    var ent1 = analysis.entities[0] ? analysis.entities[0].name : "";
    var maxC = profile.google.titleMaxChars || 60;
    var maxP = profile.google.titleMaxPixels || 580;

    var v1 = buildConstrainedTitle(primaryTitle, sec1, analysis.intent.primary, maxC, maxP, contentMode);
    var v2 = buildConstrainedTitle(primaryTitle, sec2 || ent1 || sec1, "informational", maxC, maxP, contentMode);
    var v3 = buildConstrainedTitle(primaryTitle, ent1 || sec1, "procedural", maxC, maxP, contentMode);

    var labels = contentMode === "creative"
      ? ["Balanced Book/Story Title (Recommended)", "Reader Discovery Title", "Exact Topic Match"]
      : ["Dual-Engine Balanced (Recommended)", "Google Semantic Intent", "Bing Exact-Lead Focus"];

    var candidatesList = [
      { label: labels[0], text: v1 },
      { label: labels[1], text: v2 },
      { label: labels[2], text: v3 }
    ];

    var cleanBrand = String(brandName || "").trim();
    if (cleanBrand) {
      var bCand1 = primaryTitle + (sec1 ? ": " + sec1 : "") + " | " + cleanBrand;
      var bCand2 = primaryTitle + " | " + cleanBrand;
      var chosenBrandTitle = (bCand1.length <= maxC && Lex.estimatePixelWidth(bCand1) <= maxP)
        ? bCand1
        : ((bCand2.length <= maxC && Lex.estimatePixelWidth(bCand2) <= maxP) ? bCand2 : "");
      if (chosenBrandTitle) {
        candidatesList.push({ label: "Branded SEO Title", text: chosenBrandTitle });
      }
    }

    var unique = [];
    var seen = new Set();
    candidatesList.forEach(function (item) {
      if (!seen.has(item.text)) {
        seen.add(item.text);
        item.chars = item.text.length;
        item.pixels = Lex.estimatePixelWidth(item.text);
        unique.push(item);
      }
    });
    return unique;
  }

  function buildGroundedMetaDescription(analysis, primaryKeyphrase, profile) {
    var minC = profile.google.metaMinChars || 135;
    var maxC = profile.google.metaMaxChars || 160;
    var sents = analysis.parsed.sentences;
    var primaryLow = primaryKeyphrase.toLowerCase();

    // Find best anchor sentence mentioning primaryKeyphrase or first sentence
    var leadSent = sents.find(function (s) { return s.text.toLowerCase().indexOf(primaryLow) !== -1; }) || sents[0];
    var metricSent = sents.find(function (s) { return s !== leadSent && /\d/.test(s.text); }) || sents[1];

    var base = leadSent ? leadSent.text : primaryKeyphrase;
    if (base.length < minC && metricSent) {
      base = base + " " + metricSent.text;
    }

    if (base.length > maxC) {
      var clipped = base.slice(0, maxC - 3);
      var lastSpace = clipped.lastIndexOf(" ");
      if (lastSpace > minC - 20) clipped = clipped.slice(0, lastSpace);
      base = clipped.replace(/[,;:\s]+$/, "") + "...";
    }
    return base;
  }

  function splitParagraphIntoBalancedChunks(sentences, maxWordsPerPara) {
    var chunks = [];
    var current = [];
    var curWords = 0;

    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      var w = VeriRank.Analyzer.countWords(s);
      if (current.length > 0 && curWords + w > maxWordsPerPara) {
        chunks.push(current.join(" "));
        current = [s];
        curWords = w;
      } else {
        current.push(s);
        curWords += w;
      }
    }
    if (current.length > 0) chunks.push(current.join(" "));
    return chunks;
  }

  function renderHtmlFromBlocks(blocks, title, metaDescription, canonicalOrSlug, jsonLdObj, ogTypeInput, brandName) {
    var esc = Lex.escapeHtml;
    var ogType = ogTypeInput || "article";
    var bodyParts = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === "h1") {
        bodyParts.push("  <h1>" + esc(b.text) + "</h1>");
      } else if (b.type === "h2") {
        bodyParts.push("  <h2>" + esc(b.text) + "</h2>");
      } else if (b.type === "h3") {
        bodyParts.push("  <h3>" + esc(b.text) + "</h3>");
      } else if (b.type === "p") {
        bodyParts.push("  <p>" + formatInlineMarkdown(esc(b.text)) + "</p>");
      } else if (b.type === "ul" || b.type === "ol") {
        var tag = b.type;
        var itemsHtml = b.items.map(function (it) { return "    <li>" + formatInlineMarkdown(esc(it)) + "</li>"; }).join("\n");
        bodyParts.push("  <" + tag + ">\n" + itemsHtml + "\n  </" + tag + ">");
      }
    }
    var articleHtml = "<article>\n" + bodyParts.join("\n") + "\n</article>";
    var jsonLdScript = "<" + "script type=\"application/ld+json\">\n" + JSON.stringify(jsonLdObj, null, 2) + "\n<" + "/script>";
    var canonical = /^https?:\/\//i.test(String(canonicalOrSlug || ""))
      ? String(canonicalOrSlug)
      : ("https://yoursite.com/" + String(canonicalOrSlug || "document").replace(/^\/+/, ""));

    var headList = [
      "<title>" + esc(title) + "</title>",
      "<meta name=\"description\" content=\"" + esc(metaDescription) + "\">",
      "<link rel=\"canonical\" href=\"" + esc(canonical) + "\">",
      "<meta property=\"og:type\" content=\"" + esc(ogType) + "\">",
      "<meta property=\"og:title\" content=\"" + esc(title) + "\">",
      "<meta property=\"og:description\" content=\"" + esc(metaDescription) + "\">",
      "<meta property=\"og:url\" content=\"" + esc(canonical) + "\">"
    ];
    if (brandName) {
      headList.push("<meta property=\"og:site_name\" content=\"" + esc(brandName) + "\">");
    }
    headList.push(
      "<meta name=\"twitter:card\" content=\"summary_large_image\">",
      "<meta name=\"twitter:title\" content=\"" + esc(title) + "\">",
      "<meta name=\"twitter:description\" content=\"" + esc(metaDescription) + "\">",
      jsonLdScript
    );
    var headTags = headList.join("\n");

    var fullHtmlDocument = [
      "<!DOCTYPE html>",
      "<html lang=\"en\">",
      "<" + "head>",
      "  <meta charset=\"utf-8\">",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
      "  " + headTags.split("\n").join("\n  "),
      "  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.65;max-width:780px;margin:2rem auto;padding:0 1.25rem;color:#0f172a}h1{font-size:2rem;line-height:1.2}h2{margin-top:1.75rem;font-size:1.35rem;border-bottom:1px solid #e2e8f0;padding-bottom:.3rem}h3{margin-top:1.25rem;font-size:1.1rem}ul,ol{padding-left:1.35rem}li{margin:.35rem 0}<" + "/style>",
      "<" + "/head>",
      "<" + "body>",
      articleHtml,
      "<" + "/body>",
      "<" + "/html>"
    ].join("\n");

    return {
      articleHtml: articleHtml,
      headTags: headTags,
      fullHtmlDocument: fullHtmlDocument
    };
  }

  function optimize(rawInput, options) {
    var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    var opts = options || {};
    var includeTakeaways = opts.includeTakeaways === true;
    var includeFaq = opts.includeFaq === true;
    var tightenReadability = opts.tightenReadability !== false;
    var convertLists = opts.convertLists !== false;
    var structureHeadings = opts.structureHeadings !== false;
    var profile = opts.profile || VeriRank.Profiles.getActiveProfile();
    var contentMode = opts.contentMode || (profile && profile.contentMode) || "corporate";
    var approvedKeywords = Array.isArray(opts.approvedKeywords) ? opts.approvedKeywords.slice() : [];
    var maxParaWords = contentMode === "creative" ? 62 : 80;

    var analysis = VeriRank.Analyzer.analyze(rawInput, { overrideKeyword: opts.overrideKeyword, contentMode: contentMode });
    var beforeScores = VeriRank.Scorer.score(rawInput, null, analysis, profile);

    var warnings = [];
    if (analysis.subject.requestedOverride && !analysis.subject.isGroundedInText) {
      warnings.push("Fact-Lock blocked ungrounded target keyphrase '" + analysis.subject.requestedOverride + "' because it does not appear in the source text. Optimized around verified subject '" + analysis.subject.primaryKeyphrase + "' instead.");
    }

    var primary = analysis.subject.primaryKeyphrase;
    var primaryTitle = Lex.toTitleCase(primary);
    var secondaries = analysis.subject.secondaryKeyphrases || [];
    var parsed = analysis.parsed;
    var provenance = [];
    var changesLog = [];

    // 1. Process paragraphs -> tightened sentences & inline step lists
    var processedBlocks = [];
    var stepBuffer = [];
    var flushSteps = function () {
      if (stepBuffer.length >= 2) {
        processedBlocks.push({
          type: "ol",
          items: stepBuffer.map(function (st) { return st.text; })
        });
        changesLog.push("Converted " + stepBuffer.length + " sequential inline steps into a numbered list");
      } else {
        for (var k = 0; k < stepBuffer.length; k++) {
          processedBlocks.push({ type: "p", text: stepBuffer[k].rawText });
        }
      }
      stepBuffer = [];
    };

    for (var pIdx = 0; pIdx < parsed.paragraphs.length; pIdx++) {
      var para = parsed.paragraphs[pIdx];
      var paraSentencesOut = [];

      for (var sIdx = 0; sIdx < para.sentences.length; sIdx++) {
        var sObj = para.sentences[sIdx];
        var stepMatch = convertLists ? tryExtractInlineSteps(sObj) : null;
        if (stepMatch) {
          // Flush any accumulated sentences before starting list
          if (paraSentencesOut.length > 0) {
            var preChunks = splitParagraphIntoBalancedChunks(paraSentencesOut, maxParaWords);
            for (var pc = 0; pc < preChunks.length; pc++) {
              processedBlocks.push({ type: "p", text: preChunks[pc] });
            }
            paraSentencesOut = [];
          }
          var tightenedStep = tightenReadability ? tightenSentence({ id: sObj.id, text: stepMatch.body }, provenance, changesLog) : [stepMatch.body];
          stepBuffer.push({ text: tightenedStep.join(" "), rawText: sObj.text });
        } else {
          flushSteps();
          var colonList = convertLists ? tryExtractColonList(sObj.text) : null;
          if (colonList) {
            if (paraSentencesOut.length > 0) {
              var preListChunks = splitParagraphIntoBalancedChunks(paraSentencesOut, maxParaWords);
              for (var plc = 0; plc < preListChunks.length; plc++) {
                processedBlocks.push({ type: "p", text: preListChunks[plc] });
              }
              paraSentencesOut = [];
            }
            var tightenedLead = tightenReadability
              ? tightenSentence({ id: sObj.id, text: colonList.lead }, null, changesLog).join(" ")
              : colonList.lead;
            var tightenedItems = tightenReadability
              ? colonList.items.map(function (it) { return tightenSentence({ id: sObj.id, text: it }, null, changesLog).join(" "); })
              : colonList.items;
            processedBlocks.push({ type: "p", text: tightenedLead });
            processedBlocks.push({ type: "ul", items: tightenedItems });
            provenance.push({
              outputSentence: tightenedLead + " " + tightenedItems.join("; "),
              sourceIds: [sObj.id],
              sourceTexts: [sObj.text],
              editType: "Formatted inline list into bullet points"
            });
            changesLog.push("Formatted inline comma list into scannable bullet points");
          } else if (tightenReadability) {
            var tParts = tightenSentence(sObj, provenance, changesLog);
            paraSentencesOut = paraSentencesOut.concat(tParts);
          } else {
            paraSentencesOut.push(sObj.text);
            provenance.push({
              outputSentence: sObj.text,
              sourceIds: [sObj.id],
              sourceTexts: [sObj.text],
              editType: "Preserved verbatim"
            });
          }
        }
      }

      if (paraSentencesOut.length > 0) {
        var chunks = splitParagraphIntoBalancedChunks(paraSentencesOut, maxParaWords);
        if (chunks.length > 1) {
          changesLog.push(contentMode === "creative"
            ? "Formatted blurb into reader-friendly story paragraphs"
            : "Split long paragraph (" + para.wordCount + "w) into scannable paragraphs");
        }
        for (var ch = 0; ch < chunks.length; ch++) {
          processedBlocks.push({ type: "p", text: chunks[ch] });
        }
      }
    }
    flushSteps();

    // Preserve any pre-existing lists from source markdown/html
    if (parsed.lists.length > 0) {
      for (var li = 0; li < parsed.lists.length; li++) {
        var existingList = parsed.lists[li];
        processedBlocks.push({
          type: existingList.ordered ? "ol" : "ul",
          items: existingList.items.slice()
        });
      }
    }

    // Preserve exact author paragraph & inline-list order (no paragraph unshift/scrambling)
    // 2. Assemble final structured document blocks (H1 -> Lead -> Concise Passage/Takeaways -> H2 Sections -> FAQ)
    var finalBlocks = [];
    var existingH1 = parsed.headings.find(function (h) { return h.level === 1; });
    var isServicePurpose = analysis.purpose && analysis.purpose.category && analysis.purpose.category.id === "service";
    var h1Text = "";
    if (existingH1 && existingH1.text.toLowerCase().indexOf(primary) !== -1) {
      h1Text = existingH1.text;
    } else if (contentMode === "blog") {
      h1Text = secondaries[0]
        ? primaryTitle + ": " + Lex.toTitleCase(secondaries[0].phrase) + " Insights"
        : primaryTitle + " Complete Guide";
    } else if (contentMode === "product") {
      h1Text = secondaries[0]
        ? primaryTitle + ": " + Lex.toTitleCase(secondaries[0].phrase) + " Features"
        : primaryTitle + " Features and Specifications";
    } else if (contentMode === "creative") {
      h1Text = secondaries[0]
        ? primaryTitle + ": " + Lex.toTitleCase(secondaries[0].phrase)
        : primaryTitle;
    } else if (isServicePurpose) {
      h1Text = secondaries[0]
        ? primaryTitle + " & " + Lex.toTitleCase(secondaries[0].phrase) + " Services"
        : primaryTitle + " Services";
    } else {
      h1Text = secondaries[0]
        ? primaryTitle + ": " + Lex.toTitleCase(secondaries[0].phrase) + " Guide"
        : primaryTitle + " Overview and Practical Guide";
    }

    if (existingH1 || contentMode !== "creative" || structureHeadings) {
      finalBlocks.push({ type: "h1", text: h1Text });
      if (!existingH1) changesLog.push("Generated grounded H1 heading with primary keyphrase");
    }

    // Keep sequential reading order so inline bullet/numbered lists stay directly beneath their intro sentence
    if (processedBlocks.length > 0 && processedBlocks[0].type === "p") {
      var leadText = processedBlocks[0].text;
      var leadWords = VeriRank.Analyzer.countWords(leadText);
      if (contentMode !== "creative" && leadWords > 62) {
        var leadSents = VeriRank.Analyzer.splitSentences(leadText);
        if (leadSents.length >= 2) {
          var firstChunk = [];
          var cw = 0;
          var splitAt = 0;
          for (var ls = 0; ls < leadSents.length; ls++) {
            var sw = VeriRank.Analyzer.countWords(leadSents[ls]);
            if (cw > 0 && cw + sw > 60) break;
            firstChunk.push(leadSents[ls]);
            cw += sw;
            splitAt = ls + 1;
          }
          if (splitAt > 0 && splitAt < leadSents.length && cw >= 35) {
            processedBlocks[0].text = firstChunk.join(" ");
            processedBlocks.splice(1, 0, { type: "p", text: leadSents.slice(splitAt).join(" ") });
            changesLog.push("Shaped 40-60 word featured-snippet lead passage");
          }
        }
      }
    }

    var leadEndIdx = processedBlocks.length > 0 ? 1 : 0;
    if (leadEndIdx === 1 && processedBlocks.length > 1 && processedBlocks[0].type === "p" && processedBlocks[0].text.trim().slice(-1) === ":" && (processedBlocks[1].type === "ul" || processedBlocks[1].type === "ol")) {
      leadEndIdx = 2;
    }
    for (var lb = 0; lb < leadEndIdx; lb++) {
      finalBlocks.push(processedBlocks[lb]);
    }

    // 3. Key Takeaways block (distilled concise summary bullets from non-lead sentences, working on 45+ word drafts)
    var totalInputWords = parsed.totalWords;
    var usedTakeawayIds = new Set();
    if (includeTakeaways && totalInputWords >= 45 && parsed.sentences.length >= 3) {
      var takeawayItems = [];
      var leadLow = processedBlocks.slice(0, leadEndIdx).map(function (b) {
        return b.text || (b.items ? b.items.join(" ") : "");
      }).join(" ").toLowerCase();
      var candidateSents = parsed.sentences.filter(function (s) {
        return leadLow.indexOf(s.text.toLowerCase()) === -1;
      });
      if (candidateSents.length === 0) candidateSents = parsed.sentences.slice(1);

      // Score candidate sentences by presence of numbers/entities/causal verbs, avoiding redundant exact-phrase repetition
      var baseExactCount = VeriRank.Scorer.countExactPhrase(parsed.plainText, primary);
      var rankedSents = candidateSents.map(function (s) {
        var sc = 1;
        if (/\d/.test(s.text)) sc += 3;
        if (/\b(?:not|never|requires|must|reduce|lowered|extend|contain|can|ensure|help)\b/i.test(s.text)) sc += 2;
        if (s.wordCount >= 10 && s.wordCount <= 34) sc += 2;
        if (baseExactCount >= 2 && s.text.toLowerCase().indexOf(primary) !== -1) sc -= 4;
        return { s: s, sc: sc };
      });
      rankedSents.sort(function (a, b) { return b.sc - a.sc; });

      for (var tk = 0; tk < rankedSents.length && takeawayItems.length < 3; tk++) {
        var srcS = rankedSents[tk].s;
        var concise = distillTakeawayBullet(srcS);
        takeawayItems.push(concise);
        usedTakeawayIds.add(srcS.id);
        provenance.push({
          outputSentence: concise,
          sourceIds: [srcS.id],
          sourceTexts: [srcS.text],
          editType: "Distilled Key Takeaway"
        });
      }

      if (takeawayItems.length >= 2) {
        finalBlocks.push({ type: "h2", text: "Key Takeaways" });
        finalBlocks.push({ type: "ul", items: takeawayItems });
        changesLog.push("Created distilled Key Takeaways bullet summary");
      }
    }

    // 4. Remaining body paragraphs & lists grouped cleanly in exact original order
    var remainingBody = processedBlocks.slice(leadEndIdx);
    var secIdx = 0;
    var usedHeadings = new Set(["key takeaways", "frequently asked questions", h1Text.toLowerCase()]);

    var nextSubheading = function (blockText) {
      var cand = "";
      if (contentMode === "creative") {
        cand = secondaries[secIdx] ? Lex.toTitleCase(secondaries[secIdx].phrase) : (primaryTitle + " Synopsis");
      } else if (contentMode === "product" && secIdx === 0) {
        cand = primaryTitle + " Features and Specifications";
      } else if (secondaries[secIdx]) {
        cand = Lex.toTitleCase(secondaries[secIdx].phrase);
      } else if (secIdx === 0) {
        cand = primaryTitle + " Overview";
      } else {
        cand = "Operational Implementation Steps";
      }
      if (contentMode !== "creative" && blockText && /\b(first|step|inspect|clean|calibrate|verify)\b/i.test(blockText) && analysis.intent.primary === "procedural") {
        cand = "Practical Step-by-Step Checklist";
      }
      secIdx++;
      if (usedHeadings.has(cand.toLowerCase())) {
        cand = "Core " + (secondaries[secIdx] ? Lex.toTitleCase(secondaries[secIdx].phrase) : "Technical") + " Standards";
      }
      usedHeadings.add(cand.toLowerCase());
      return cand;
    };

    if (structureHeadings && remainingBody.length > 0 && totalInputWords >= 150) {
      for (var rb = 0; rb < remainingBody.length; rb++) {
        var blk = remainingBody[rb];
        var prevIsHeading = finalBlocks.length > 0 && finalBlocks[finalBlocks.length - 1].type === "h2";
        if (rb === 0 || (blk.type === "ol" && !prevIsHeading) || (rb % 2 === 0 && secIdx < 3 && !prevIsHeading)) {
          var subH = nextSubheading(blk.text || (blk.items ? blk.items.join(" ") : ""));
          finalBlocks.push({ type: "h2", text: subH });
        }
        finalBlocks.push(blk);
      }
      changesLog.push("Organized body under clear H1 & H2 section headings");
    } else {
      finalBlocks = finalBlocks.concat(remainingBody);
    }

    // 5. Grounded FAQ Section (works on 55+ word drafts; prefers non-takeaway sentences when available)
    var faqPairs = [];
    if (includeFaq && analysis.groundedQuestions.length >= 1 && totalInputWords >= 55) {
      var runningText = finalBlocks.map(function (b) { return b.text || (b.items ? b.items.join(" ") : ""); }).join(" ");
      var runningExactCount = VeriRank.Scorer.countExactPhrase(runningText, primary);
      var runningWords = VeriRank.Analyzer.countWords(runningText);
      var faqAddedBlocks = [];
      var orderedQs = analysis.groundedQuestions.slice().sort(function (qa, qb) {
        var qaUsed = qa.sourceIds && usedTakeawayIds.has(qa.sourceIds[0]) ? 1 : 0;
        var qbUsed = qb.sourceIds && usedTakeawayIds.has(qb.sourceIds[0]) ? 1 : 0;
        return qaUsed - qbUsed;
      });

      for (var fq = 0; fq < Math.min(3, orderedQs.length); fq++) {
        var gq = orderedQs[fq];
        var ansSrc = gq.answerSourceSentences[0];
        var ansText = tightenSentence(ansSrc, null, []).join(" ");
        var qText = gq.question;
        var pairText = qText + " " + ansText;
        var pairExact = VeriRank.Scorer.countExactPhrase(pairText, primary);
        var pairWords = VeriRank.Analyzer.countWords(pairText);
        var projectedDensity = ((runningExactCount + pairExact) / Math.max(250, runningWords + pairWords)) * 100;

        if (faqPairs.length >= 2 && pairExact > 0 && projectedDensity > 2.0) {
          continue;
        }
        if (pairExact > 0 && projectedDensity > 2.1 && qText.toLowerCase().indexOf(primary) !== -1 && secondaries[0]) {
          qText = qText.replace(new RegExp(primary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), secondaries[0].phrase);
          pairExact = VeriRank.Scorer.countExactPhrase(qText + " " + ansText, primary);
        }

        runningExactCount += pairExact;
        runningWords += pairWords;
        faqAddedBlocks.push({ type: "h3", text: qText });
        faqAddedBlocks.push({ type: "p", text: ansText });
        faqPairs.push({ question: qText, answer: ansText, sourceIds: gq.sourceIds });
        provenance.push({
          outputSentence: ansText,
          sourceIds: gq.sourceIds,
          sourceTexts: [ansSrc.text],
          editType: "Grounded FAQ answer"
        });
      }

      if (faqPairs.length > 0) {
        finalBlocks.push({ type: "h2", text: "Frequently Asked Questions" });
        finalBlocks = finalBlocks.concat(faqAddedBlocks);
        changesLog.push("Added " + faqPairs.length + " Frequently Asked Question(s) from your facts");
      }
    }

    // 5b. Bold focus keyword & key concepts once in prose for reader skimmability
    var boldedTermsCount = applyScannableBolding(finalBlocks, primary, secondaries, contentMode);
    if (boldedTermsCount > 0) {
      changesLog.push("Highlighted focus keyword and key concepts in bold for skimmers");
    }

    // 6. Render Markdown
    var mdLines = [];
    for (var fb = 0; fb < finalBlocks.length; fb++) {
      var b = finalBlocks[fb];
      if (b.type === "h1") mdLines.push("# " + b.text);
      else if (b.type === "h2") mdLines.push("## " + b.text);
      else if (b.type === "h3") mdLines.push("### " + b.text);
      else if (b.type === "p") mdLines.push(b.text);
      else if (b.type === "ul") mdLines.push(b.items.map(function (it) { return "- " + it; }).join("\n"));
      else if (b.type === "ol") mdLines.push(b.items.map(function (it, idx) { return (idx + 1) + ". " + it; }).join("\n"));
    }
    var optimizedMarkdown = mdLines.join("\n\n");

    // 7. Build Metadata, JSON-LD, IndexNow, Internal Link Anchors & HTML
    var siteSettings = opts.siteSettings || (VeriRank.Profiles.getSiteSettings ? VeriRank.Profiles.getSiteSettings() : { baseUrl: "https://yoursite.com", brandName: "", indexNowKey: "" });
    var baseUrl = VeriRank.Profiles.normalizeBaseUrl ? VeriRank.Profiles.normalizeBaseUrl(siteSettings.baseUrl) : "https://yoursite.com";
    var brandName = String(siteSettings.brandName || "").trim();
    var indexNowKey = String(siteSettings.indexNowKey || "").trim() || "YOUR_BING_INDEXNOW_KEY";
    var hostMatch = baseUrl.replace(/^https?:\/\//i, "").split("/")[0] || "yoursite.com";

    var titleVariants = buildTitleVariants(analysis, profile, contentMode, brandName);
    var selectedTitle = opts.customTitle ? String(opts.customTitle).trim() : titleVariants[0].text;
    var metaDescription = opts.customMetaDescription ? String(opts.customMetaDescription).trim() : buildGroundedMetaDescription(analysis, primary, profile);
    var slug = opts.customSlug ? Lex.slugify(opts.customSlug) : Lex.slugify(primary);
    var canonicalUrl = baseUrl + "/" + slug;

    var schemaType = analysis.intent.recommendedSchemaType || "Article";
    var ogType = "article";
    if (contentMode === "blog") {
      schemaType = analysis.intent.primary === "procedural" ? "HowTo" : "BlogPosting";
    } else if (contentMode === "product") {
      schemaType = "Product";
      ogType = "product";
    } else if (contentMode === "creative") {
      schemaType = /\b(novel|book|chapter|trilogy|author|series|thriller|thrillers|fantasy|mystery|romance|memoir)\b/i.test(rawInput) ? "Book" : "CreativeWork";
      ogType = "book";
    }

    var articleSchema = {
      "@type": schemaType,
      "headline": selectedTitle,
      "description": metaDescription,
      "keywords": [primary].concat(secondaries.slice(0, 4).map(function (s) { return s.phrase; })).join(", "),
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": canonicalUrl
      }
    };
    if (schemaType === "Product" || schemaType === "Book" || schemaType === "CreativeWork") {
      articleSchema.name = selectedTitle;
    }
    var graph = [articleSchema];
    if (faqPairs.length > 0) {
      graph.push({
        "@type": "FAQPage",
        "mainEntity": faqPairs.map(function (fp) {
          return {
            "@type": "Question",
            "name": fp.question,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": fp.answer
            }
          };
        })
      });
    }
    var jsonLd = {
      "@context": "https://schema.org",
      "@graph": graph
    };

    var indexNowPayload = {
      host: hostMatch,
      key: indexNowKey,
      keyLocation: "https://" + hostMatch + "/" + indexNowKey + ".txt",
      urlList: [canonicalUrl]
    };

    var internalLinkSuggestions = secondaries.slice(0, 4).map(function (sec) {
      var tSlug = Lex.slugify(sec.phrase);
      return {
        anchorText: sec.phrase,
        suggestedTargetUrl: "/" + tSlug,
        occurrencesInSource: sec.occurrences
      };
    });

    var renderedHtml = renderHtmlFromBlocks(finalBlocks, selectedTitle, metaDescription, canonicalUrl, jsonLd, ogType, brandName);

    var openGraphObj = {
      "og:type": ogType,
      "og:title": selectedTitle,
      "og:description": metaDescription,
      "og:url": canonicalUrl
    };
    if (brandName) {
      openGraphObj["og:site_name"] = brandName;
    }

    var metadata = {
      title: selectedTitle,
      titleVariants: titleVariants,
      metaDescription: metaDescription,
      slug: slug,
      canonicalUrl: canonicalUrl,
      ogType: ogType,
      baseUrl: baseUrl,
      brandName: brandName,
      indexNowKey: indexNowKey,
      openGraph: openGraphObj,
      jsonLd: jsonLd,
      indexNowPayload: indexNowPayload,
      internalLinkSuggestions: internalLinkSuggestions,
      headTags: renderedHtml.headTags,
      metaFactLock: { passed: true, issues: [] }
    };

    // 8. Fact-Lock Verification & Post-Optimization Scoring
    var factLock = VeriRank.FactLock.verify(rawInput, optimizedMarkdown, provenance, approvedKeywords);
    var afterAnalysis = VeriRank.Analyzer.analyze(optimizedMarkdown, { overrideKeyword: primary });
    var afterScores = VeriRank.Scorer.score(optimizedMarkdown, metadata, afterAnalysis, profile);

    var t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    var durationMs = Math.max(0.1, Math.round((t1 - t0) * 10) / 10);

    return {
      sourceText: rawInput,
      contentMode: contentMode,
      approvedKeywords: approvedKeywords,
      optimizedMarkdown: optimizedMarkdown,
      optimizedHtml: renderedHtml.articleHtml,
      fullHtmlDocument: renderedHtml.fullHtmlDocument,
      blocks: finalBlocks,
      metadata: metadata,
      analysis: analysis,
      afterAnalysis: afterAnalysis,
      beforeScores: beforeScores,
      afterScores: afterScores,
      factLock: factLock,
      warnings: warnings,
      changesSummary: changesLog,
      writingEditsCount: changesLog.length,
      durationMs: durationMs
    };
  }

  function markdownToBlocks(mdText) {
    var lines = String(mdText || "").replace(/\r\n/g, "\n").split("\n");
    var blocks = [];
    var curList = null;
    var flushList = function () {
      if (curList && curList.items.length > 0) blocks.push(curList);
      curList = null;
    };
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) {
        flushList();
        continue;
      }
      var h1 = line.match(/^#\s+(.+)$/);
      var h2 = line.match(/^##\s+(.+)$/);
      var h3 = line.match(/^###\s+(.+)$/);
      var ul = line.match(/^[-*+]\s+(.+)$/);
      var ol = line.match(/^\d+[.)]\s+(.+)$/);
      if (h1) { flushList(); blocks.push({ type: "h1", text: h1[1] }); }
      else if (h2) { flushList(); blocks.push({ type: "h2", text: h2[1] }); }
      else if (h3) { flushList(); blocks.push({ type: "h3", text: h3[1] }); }
      else if (ul) {
        if (!curList || curList.type !== "ul") { flushList(); curList = { type: "ul", items: [] }; }
        curList.items.push(ul[1]);
      } else if (ol) {
        if (!curList || curList.type !== "ol") { flushList(); curList = { type: "ol", items: [] }; }
        curList.items.push(ol[1]);
      } else {
        flushList();
        blocks.push({ type: "p", text: line });
      }
    }
    flushList();
    return blocks;
  }

  function rescoreEditedMarkdown(sourceText, editedMarkdown, currentResult, profileInput) {
    var profile = profileInput || VeriRank.Profiles.getActiveProfile();
    var primary = currentResult.analysis.subject.primaryKeyphrase;
    var approved = currentResult.approvedKeywords || [];
    var afterAnalysis = VeriRank.Analyzer.analyze(editedMarkdown, { overrideKeyword: primary });
    var factLock = VeriRank.FactLock.verify(sourceText, editedMarkdown, currentResult.factLock.sentenceProvenance, approved);
    var afterScores = VeriRank.Scorer.score(editedMarkdown, currentResult.metadata, afterAnalysis, profile);
    var newBlocks = markdownToBlocks(editedMarkdown);
    var m = currentResult.metadata || {};
    var renderedHtml = renderHtmlFromBlocks(newBlocks, m.title, m.metaDescription, m.canonicalUrl || m.slug, m.jsonLd, m.ogType, m.brandName);

    return Object.assign({}, currentResult, {
      contentMode: currentResult.contentMode || (profile && profile.contentMode) || "corporate",
      approvedKeywords: approved,
      blocks: newBlocks,
      optimizedMarkdown: editedMarkdown,
      optimizedHtml: renderedHtml.articleHtml,
      fullHtmlDocument: renderedHtml.fullHtmlDocument,
      afterAnalysis: afterAnalysis,
      afterScores: afterScores,
      factLock: factLock
    });
  }

  function buildWordDiffHtml(oldText, newText) {
    var oldWords = String(oldText || "").trim().split(/\s+/).filter(Boolean);
    var newWords = String(newText || "").replace(/\*\*([^*]+)\*\*/g, "$1").trim().split(/\s+/).filter(Boolean);
    var m = oldWords.length;
    var n = newWords.length;
    if (m === 0) return "<ins class='diff-ins'>" + Lex.escapeHtml(newWords.join(" ")) + "</ins>";
    if (m > 80 || n > 80) {
      return "<del class='diff-del'>" + Lex.escapeHtml(oldText) + "</del> <ins class='diff-ins'>" + Lex.escapeHtml(newWords.join(" ")) + "</ins>";
    }

    var dp = [];
    for (var i = 0; i <= m; i++) {
      dp[i] = new Array(n + 1);
      for (var j = 0; j <= n; j++) dp[i][j] = 0;
    }
    for (var r = m - 1; r >= 0; r--) {
      for (var c = n - 1; c >= 0; c--) {
        if (oldWords[r] === newWords[c]) {
          dp[r][c] = 1 + dp[r + 1][c + 1];
        } else {
          dp[r][c] = Math.max(dp[r + 1][c], dp[r][c + 1]);
        }
      }
    }

    var ops = [];
    var x = 0;
    var y = 0;
    while (x < m && y < n) {
      if (oldWords[x] === newWords[y]) {
        ops.push({ type: "eq", text: newWords[y] });
        x++;
        y++;
      } else if (dp[x + 1][y] >= dp[x][y + 1]) {
        ops.push({ type: "del", text: oldWords[x] });
        x++;
      } else {
        ops.push({ type: "ins", text: newWords[y] });
        y++;
      }
    }
    while (x < m) ops.push({ type: "del", text: oldWords[x++] });
    while (y < n) ops.push({ type: "ins", text: newWords[y++] });

    var out = [];
    for (var k = 0; k < ops.length; k++) {
      var cur = ops[k];
      var grp = [cur.text];
      while (k + 1 < ops.length && ops[k + 1].type === cur.type) {
        grp.push(ops[++k].text);
      }
      var joined = Lex.escapeHtml(grp.join(" "));
      if (cur.type === "eq") out.push(joined);
      else if (cur.type === "del") out.push("<del class='diff-del'>" + joined + "</del>");
      else out.push("<ins class='diff-ins'>" + joined + "</ins>");
    }
    return out.join(" ");
  }

  function highlightInlineBoldInDiffHtml(diffHtml, rawSent) {
    if (!rawSent || rawSent.indexOf("**") === -1) return diffHtml;
    var boldMatches = [];
    var bmRe = /\*\*([^*]+)\*\*/g;
    var bm;
    while ((bm = bmRe.exec(rawSent)) !== null) {
      boldMatches.push(Lex.escapeHtml(bm[1]));
    }
    if (boldMatches.length === 0) return diffHtml;

    var parts = String(diffHtml || "").split(/(<del\b[^>]*>.*?<\/del>|<[^>]+>)/g);
    for (var bi = 0; bi < boldMatches.length; bi++) {
      var targetEsc = boldMatches[bi];
      var wrapped = false;
      for (var pi = 0; pi < parts.length; pi++) {
        if (!parts[pi] || parts[pi][0] === "<") continue;
        var idx = parts[pi].indexOf(targetEsc);
        if (idx !== -1) {
          parts[pi] = parts[pi].slice(0, idx) + "<strong>" + targetEsc + "</strong>" + parts[pi].slice(idx + targetEsc.length);
          wrapped = true;
          break;
        }
      }
    }
    return parts.join("");
  }

  function extractSentenceStems(text) {
    var toks = String(text || "").replace(/\*\*([^*]+)\*\*/g, "$1").toLowerCase().match(/[a-z0-9]+/g) || [];
    var set = new Set();
    for (var i = 0; i < toks.length; i++) {
      if (!Lex.STOPWORDS.has(toks[i]) && toks[i].length >= 3) {
        set.add(Lex.stemWord(toks[i]));
      }
    }
    return set;
  }

  function renderBlocksDiffHtml(res) {
    if (!res) return "";
    var prov = (res.factLock && res.factLock.sentenceProvenance) || [];
    var blocks = res.blocks || [];

    var bodyByOutSentence = {};
    var groupedBySrc = {};
    for (var pi = 0; pi < prov.length; pi++) {
      var pr = prov[pi];
      if (!pr || !pr.sourceIds || !pr.sourceIds.length) continue;
      if (pr.editType === "Distilled Key Takeaway" || pr.editType === "Grounded FAQ answer") continue;
      var sid = pr.sourceIds[0];
      if (!groupedBySrc[sid]) {
        groupedBySrc[sid] = {
          sourceText: (pr.sourceTexts && pr.sourceTexts[0]) || "",
          outParts: [],
          editType: pr.editType
        };
      }
      groupedBySrc[sid].outParts.push(pr.outputSentence);
    }

    var plainAllBlocks = blocks.map(function (b) {
      return (b.text || (b.items ? b.items.join(" ") : "")).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ");
    }).join(" ");

    Object.keys(groupedBySrc).forEach(function (sid) {
      var g = groupedBySrc[sid];
      var combinedOut = g.outParts.join(" ");
      var combinedClean = combinedOut.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
      var allIntact = g.outParts.length === 1 || plainAllBlocks.indexOf(combinedClean) !== -1;
      g.outParts.forEach(function (part, idx) {
        bodyByOutSentence[part.trim()] = {
          isFirst: idx === 0,
          combinedIntact: allIntact,
          outPartCount: g.outParts.length,
          sourceText: g.sourceText,
          combinedOut: combinedOut,
          editType: g.editType
        };
      });
    });

    var srcParsed = VeriRank.Analyzer.parseDocument(res.sourceText || "");
    var srcSentences = (srcParsed.sentences || []).map(function (s) { return Lex.normalizeTypography(s.text); });
    var srcStemCache = srcSentences.map(extractSentenceStems);
    var usedSrcIdx = new Set();

    var markSourceUsedByText = function (srcTxt) {
      var normTarget = String(Lex.normalizeTypography(srcTxt || "")).replace(/\s+/g, " ").trim();
      for (var si = 0; si < srcSentences.length; si++) {
        if (!usedSrcIdx.has(si) && srcSentences[si].replace(/\s+/g, " ").trim() === normTarget) {
          usedSrcIdx.add(si);
          return;
        }
      }
    };

    // Pass 1: mark every provenance-matched sentence as claimed so modified/woven sentences only diff unused source sentences
    for (var b0 = 0; b0 < blocks.length; b0++) {
      var blk0 = blocks[b0];
      if (blk0.type !== "p") continue;
      var sList0 = VeriRank.Analyzer.splitSentences(blk0.text);
      if (sList0.length === 0) sList0 = [blk0.text];
      for (var j0 = 0; j0 < sList0.length; j0++) {
        var clean0 = sList0[j0].replace(/\*\*([^*]+)\*\*/g, "$1").trim();
        var inf0 = bodyByOutSentence[clean0];
        if (inf0 && inf0.combinedIntact) {
          markSourceUsedByText(inf0.sourceText);
        }
      }
    }

    var diffLegend = "<div style='margin-bottom:12px;font-size:12px;color:var(--text-muted);display:flex;gap:12px;flex-wrap:wrap;align-items:center;'>" +
      "<span><del class='diff-del'>Removed wording</del></span>" +
      "<span><ins class='diff-ins'>Tightened / Added text</ins></span>" +
      "<span><span class='diff-tag'>Added Section</span> New SEO headings, bullets, or Q&amp;As</span>" +
      "</div>";

    var htmlParts = [diffLegend];
    var inFaq = false;

    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.type === "h1") {
        htmlParts.push("<h1><span class='diff-tag'>Added Page Title</span>" + Lex.escapeHtml(b.text) + "</h1>");
      } else if (b.type === "h2") {
        inFaq = /frequently asked questions/i.test(b.text);
        var hTag = /key takeaways/i.test(b.text) ? "Added Summary" : (inFaq ? "Added FAQ Section" : "Added Heading");
        htmlParts.push("<h2><span class='diff-tag'>" + hTag + "</span>" + Lex.escapeHtml(b.text) + "</h2>");
      } else if (b.type === "h3") {
        htmlParts.push("<h3><span class='diff-tag'>Added Question</span>" + Lex.escapeHtml(b.text) + "</h3>");
      } else if (b.type === "ul" || b.type === "ol") {
        var listTag = b.type;
        htmlParts.push("<" + listTag + ">");
        for (var li = 0; li < b.items.length; li++) {
          htmlParts.push("<li><ins class='diff-ins'>" + formatInlineMarkdown(Lex.escapeHtml(b.items[li])) + "</ins></li>");
        }
        htmlParts.push("</" + listTag + ">");
      } else if (b.type === "p") {
        if (inFaq) {
          htmlParts.push("<p><span class='diff-tag'>Fact-Checked Answer</span>" + formatInlineMarkdown(Lex.escapeHtml(b.text)) + "</p>");
          continue;
        }
        var sents = VeriRank.Analyzer.splitSentences(b.text);
        if (sents.length === 0) sents = [b.text];
        var sentHtml = [];

        for (var si = 0; si < sents.length; si++) {
          var rawSent = sents[si].trim();
          var stClean = rawSent.replace(/\*\*([^*]+)\*\*/g, "$1").trim();
          var info = bodyByOutSentence[stClean];

          if (info && (info.outPartCount === 1 || info.combinedIntact)) {
            if (!info.isFirst) continue;
            var srcNorm = Lex.normalizeTypography(info.sourceText);
            var outClean = info.combinedOut.replace(/\*\*([^*]+)\*\*/g, "$1");
            if (srcNorm.trim() !== outClean.trim()) {
              var wd = buildWordDiffHtml(srcNorm, outClean);
              sentHtml.push(highlightInlineBoldInDiffHtml(wd, rawSent));
            } else {
              sentHtml.push(Lex.escapeHtml(rawSent).replace(/\*\*([^*]+)\*\*/g, "<ins class='diff-ins'><strong>$1</strong></ins>"));
            }
          } else {
            // Check unused source sentences for an edited sentence match (e.g. live manual edit or in-place keyword upgrade)
            var candStems = extractSentenceStems(stClean);
            var bestSrcIdx = -1;
            var bestRatio = 0;
            for (var ui = 0; ui < srcSentences.length; ui++) {
              if (usedSrcIdx.has(ui)) continue;
              var uStems = srcStemCache[ui];
              var overlap = 0;
              candStems.forEach(function (st) {
                if (uStems.has(st)) overlap++;
              });
              var denom = Math.max(1, Math.min(candStems.size, uStems.size));
              var ratio = overlap / denom;
              if (((overlap >= 3 && ratio >= 0.5) || (overlap >= 2 && denom <= 4 && ratio >= 0.5)) && ratio > bestRatio) {
                bestRatio = ratio;
                bestSrcIdx = ui;
              }
            }

            if (bestSrcIdx !== -1) {
              usedSrcIdx.add(bestSrcIdx);
              var matchedSrc = srcSentences[bestSrcIdx];
              if (matchedSrc.trim() !== stClean.trim()) {
                var wdm = buildWordDiffHtml(matchedSrc, stClean);
                sentHtml.push(highlightInlineBoldInDiffHtml(wdm, rawSent));
              } else {
                sentHtml.push(Lex.escapeHtml(rawSent).replace(/\*\*([^*]+)\*\*/g, "<ins class='diff-ins'><strong>$1</strong></ins>"));
              }
            } else {
              sentHtml.push("<ins class='diff-ins'>" + formatInlineMarkdown(Lex.escapeHtml(rawSent)) + "</ins>");
            }
          }
        }
        htmlParts.push("<p>" + sentHtml.join(" ") + "</p>");
      }
    }

    return htmlParts.join("\n");
  }

  function classifyWeaveKeyword(wovenKw, catId) {
    var low = String(wovenKw || "").toLowerCase().trim();
    if (/^(?:how|what|why|when|where|who|can|should|does|do|is|are)\b/i.test(low)) {
      return "question";
    }
    if (/\b(?:cost|costs|price|pricing|estimate|estimates|quote|quotes|vs|versus|comparison|compare|rates|budget)\b/i.test(low)) {
      return "cost_compare";
    }
    if (catId === "creative") {
      return /\b(?:novel|book|thriller|mystery|story|saga|trilogy|series|adventure|tale|romance|memoir)\s*$/i.test(low)
        ? "creative_singular"
        : "creative_plural";
    }
    return "topic_noun";
  }

  function tryExpandPhraseInPlace(blocks, faqBoundaryIdx, wovenKw, kwType) {
    if (kwType === "question") return false;
    var kwTokens = wovenKw.trim().split(/\s+/);
    if (kwTokens.length < 2) return false;

    for (var tailLen = kwTokens.length - 1; tailLen >= 2; tailLen--) {
      var tailPhrase = kwTokens.slice(kwTokens.length - tailLen).join(" ");
      var prefixStr = kwTokens.slice(0, kwTokens.length - tailLen).join(" ").toLowerCase();
      var escTail = tailPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      var re = new RegExp("(?:\\*\\*)?\\b(" + escTail + ")\\b(?:\\*\\*)?", "gi");

      for (var bi = 0; bi < faqBoundaryIdx; bi++) {
        if (blocks[bi].type !== "p") continue;
        var pText = blocks[bi].text;
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(pText)) !== null) {
          var before = pText.slice(0, m.index);
          var after = pText.slice(m.index + m[0].length);

          // Skip if match lies inside an already longer **...** bold span
          if (((before.match(/\*\*/g) || []).length % 2) === 1) continue;

          var beforeClean = before.replace(/\*\*/g, "").trim();
          var prevWord = beforeClean ? (beforeClean.split(/\s+/).pop() || "").toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "") : "";
          if (prevWord) {
            if (wovenKw.toLowerCase().indexOf(prevWord) !== -1 && prevWord.length >= 4) continue;
            if (/^(?:commercial|industrial|residential|emergency|local|dark|character-driven|high-stakes|scheduled|preventive|routine)$/i.test(prevWord)) continue;
            if (/^(?:local|licensed|best|top)\b/i.test(prefixStr) && /^(?:rush|rushing|avoid|delay|prevent|risk)$/i.test(prevWord)) continue;
          }

          var isStart = beforeClean === "" || /[.!?]\s*$/.test(beforeClean);
          var casedKw = isStart ? capitalizeFirst(wovenKw) : wovenKw;

          // Adjust indefinite article a/an right before insertion if needed
          var adjustedBefore = before;
          if (/\ba\s+$/i.test(adjustedBefore) && /^[aeiou]/i.test(casedKw)) {
            adjustedBefore = adjustedBefore.replace(/\b(a)(\s+)$/i, "$1n$2");
          } else if (/\ban\s+$/i.test(adjustedBefore) && /^[^aeiou]/i.test(casedKw)) {
            adjustedBefore = adjustedBefore.replace(/\b(a)n(\s+)$/i, "$1$2");
          }

          blocks[bi].text = adjustedBefore + "**" + casedKw + "**" + after;
          return true;
        }
      }
    }
    return false;
  }

  var WEAVE_TEMPLATE_POOLS = {
    "service:topic_noun": [
      {
        sig: /every stage keeps /i,
        prefixRe: "Every stage keeps ",
        suffixRe: " straightforward from start to finish\\.",
        build: function (kw) { return " Every stage keeps **" + kw + "** straightforward from start to finish."; }
      },
      {
        sig: /thorough planning around /i,
        prefixRe: "Thorough planning around ",
        suffixRe: " supports reliable results once work begins\\.",
        build: function (kw) { return " Thorough planning around **" + kw + "** supports reliable results once work begins."; }
      },
      {
        sig: /projects prioritize /i,
        prefixRe: "Projects prioritize ",
        suffixRe: " alongside clear documentation throughout completion\\.",
        build: function (kw) { return " Projects prioritize **" + kw + "** alongside clear documentation throughout completion."; }
      }
    ],
    "service:cost_compare": [
      {
        sig: /clear guidance on /i,
        prefixRe: "Clear guidance on ",
        suffixRe: " helps teams compare options with confidence\\.",
        build: function (kw) { return " Clear guidance on **" + kw + "** helps teams compare options with confidence."; }
      },
      {
        sig: /reviewing .* upfront aligns/i,
        prefixRe: "Reviewing ",
        suffixRe: " upfront aligns expectations before work begins\\.",
        build: function (kw) { return " Reviewing **" + kw + "** upfront aligns expectations before work begins."; }
      }
    ],
    "service:question": [
      {
        sig: /knowing .* clarifies/i,
        build: function (kw) { return " Knowing **" + kw + "** clarifies key requirements before work begins."; }
      },
      {
        sig: /understanding .* helps/i,
        build: function (kw) { return " Understanding **" + kw + "** helps teams plan each stage with clear direction."; }
      }
    ],
    "product:topic_noun": [
      {
        sig: /key details around /i,
        prefixRe: "Key details around ",
        suffixRe: " help buyers evaluate overall fit\\.",
        build: function (kw) { return " Key details around **" + kw + "** help buyers evaluate overall fit."; }
      },
      {
        sig: /comparing .* highlights/i,
        prefixRe: "Comparing ",
        suffixRe: " highlights practical benefits for everyday use\\.",
        build: function (kw) { return " Comparing **" + kw + "** highlights practical benefits for everyday use."; }
      },
      {
        sig: /clear notes on /i,
        prefixRe: "Clear notes on ",
        suffixRe: " support informed decisions\\.",
        build: function (kw) { return " Clear notes on **" + kw + "** support informed decisions."; }
      }
    ],
    "product:cost_compare": [
      {
        sig: /reviewing .* upfront helps buyers/i,
        prefixRe: "Reviewing ",
        suffixRe: " upfront helps buyers compare options cleanly\\.",
        build: function (kw) { return " Reviewing **" + kw + "** upfront helps buyers compare options cleanly."; }
      }
    ],
    "creative:creative_singular": [
      {
        sig: /at the heart of this /i,
        build: function (kw) { return " At the heart of this **" + kw + "**, every discovery raises the stakes from start to finish."; }
      },
      {
        sig: /shaped as a suspenseful /i,
        build: function (kw) { return " Shaped as a suspenseful **" + kw + "**, every choice carries lasting consequences."; }
      },
      {
        sig: /driven by momentum from the opening chapter/i,
        build: function (kw) { return " Driven by momentum from the opening chapter, this **" + kw + "** builds high stakes throughout."; }
      }
    ],
    "creative:creative_plural": [
      {
        sig: /blending .* with relentless momentum/i,
        prefixRe: "Blending ",
        suffixRe: " with relentless momentum, each chapter raises the tension\\.",
        build: function (kw) { return " Blending **" + kw + "** with relentless momentum, each chapter raises the tension."; }
      },
      {
        sig: /built around .* central narrative/i,
        prefixRe: "Built around ",
        suffixRe: ", every turn deepens the central narrative\\.",
        build: function (kw) { return " Built around **" + kw + "**, every turn deepens the central narrative."; }
      },
      {
        sig: /rich in .* high tension/i,
        prefixRe: "Rich in ",
        suffixRe: ", the story carries high tension throughout every chapter\\.",
        build: function (kw) { return " Rich in **" + kw + "**, the story carries high tension throughout every chapter."; }
      }
    ],
    "general:topic_noun": [
      {
        sig: /focusing on .* consistent standards/i,
        prefixRe: "Focusing on ",
        suffixRe: " helps teams maintain consistent standards throughout the process\\.",
        build: function (kw) { return " Focusing on **" + kw + "** helps teams maintain consistent standards throughout the process."; }
      },
      {
        sig: /practical attention to /i,
        prefixRe: "Practical attention to ",
        suffixRe: " supports reliable day-to-day results\\.",
        build: function (kw) { return " Practical attention to **" + kw + "** supports reliable day-to-day results."; }
      },
      {
        sig: /prioritizing .* operational clarity/i,
        prefixRe: "Prioritizing ",
        suffixRe: " strengthens long-term outcomes and operational clarity\\.",
        build: function (kw) { return " Prioritizing **" + kw + "** strengthens long-term outcomes and operational clarity."; }
      }
    ],
    "general:cost_compare": [
      {
        sig: /evaluating .* upfront/i,
        prefixRe: "Evaluating ",
        suffixRe: " upfront helps teams weigh practical options and plan ahead\\.",
        build: function (kw) { return " Evaluating **" + kw + "** upfront helps teams weigh practical options and plan ahead."; }
      },
      {
        sig: /reviewing .* early aligns/i,
        prefixRe: "Reviewing ",
        suffixRe: " early aligns expectations before implementation begins\\.",
        build: function (kw) { return " Reviewing **" + kw + "** early aligns expectations before implementation begins."; }
      }
    ],
    "general:question": [
      {
        sig: /understanding .* clarifies key/i,
        build: function (kw) { return " Understanding **" + kw + "** clarifies key requirements at every stage."; }
      },
      {
        sig: /knowing .* clear direction/i,
        build: function (kw) { return " Knowing **" + kw + "** gives teams clear direction at every stage."; }
      }
    ]
  };

  function getPoolForKey(catKey, kwType) {
    var k1 = catKey + ":" + kwType;
    if (WEAVE_TEMPLATE_POOLS[k1]) return WEAVE_TEMPLATE_POOLS[k1];
    var k2 = catKey + ":topic_noun";
    if (WEAVE_TEMPLATE_POOLS[k2]) return WEAVE_TEMPLATE_POOLS[k2];
    var k3 = "general:" + kwType;
    if (WEAVE_TEMPLATE_POOLS[k3]) return WEAVE_TEMPLATE_POOLS[k3];
    return WEAVE_TEMPLATE_POOLS["general:topic_noun"];
  }

  function tryMergeIntoExistingClause(blocks, faqBoundaryIdx, wovenKw, catKey, kwType) {
    if (kwType === "question" || kwType === "creative_singular") return false;
    var pool = getPoolForKey(catKey, kwType);
    var slotCore = "(\\*\\*[^*\\n]+\\*\\*(?:\\s+and\\s+\\*\\*[^*\\n]+\\*\\*)?)";

    for (var pi = 0; pi < pool.length; pi++) {
      var tpl = pool[pi];
      if (!tpl.prefixRe || !tpl.suffixRe) continue;
      var fullRe = new RegExp("(" + tpl.prefixRe + ")" + slotCore + "(" + tpl.suffixRe + ")");
      for (var bi = 0; bi < faqBoundaryIdx; bi++) {
        if (blocks[bi].type !== "p") continue;
        var m = blocks[bi].text.match(fullRe);
        if (m) {
          var existingBold = m[2].match(/\*\*[^*]+\*\*/g) || [];
          if (existingBold.length >= 1 && existingBold.length < 3) {
            existingBold.push("**" + wovenKw + "**");
            var mergedSlot = existingBold.length === 2
              ? (existingBold[0] + " and " + existingBold[1])
              : (existingBold[0] + ", " + existingBold[1] + ", and " + existingBold[2]);
            blocks[bi].text = blocks[bi].text.replace(m[0], m[1] + mergedSlot + m[3]);
            return true;
          }
        }
      }
    }
    return false;
  }

  function countWovenSignaturesInText(txt) {
    var hits = 0;
    Object.keys(WEAVE_TEMPLATE_POOLS).forEach(function (k) {
      WEAVE_TEMPLATE_POOLS[k].forEach(function (t) {
        if (t.sig.test(txt)) hits++;
      });
    });
    return hits;
  }

  function appendContextualKeywordSentence(blocks, faqBoundaryIdx, wovenKw, catKey, kwType, fullMd) {
    var kwWords = wovenKw.toLowerCase().split(/\s+/).filter(function (w) { return w.length >= 3 && !Lex.STOPWORDS.has(w); });
    var bestParaIdx = -1;
    var bestScore = -9999;

    for (var bi = 0; bi < faqBoundaryIdx; bi++) {
      var blk = blocks[bi];
      if (blk.type !== "p") continue;
      var trimmed = blk.text.trim();
      if (!trimmed || trimmed.slice(-1) === ":") continue; // Never break an intro line ending in ':' above a list

      var pLow = trimmed.toLowerCase();
      var overlap = 0;
      kwWords.forEach(function (w) { if (pLow.indexOf(w) !== -1) overlap++; });
      var wovenPenalty = countWovenSignaturesInText(trimmed);
      var sc = (overlap * 3) - (wovenPenalty * 4);
      if (sc > bestScore) {
        bestScore = sc;
        bestParaIdx = bi;
      }
    }

    if (bestParaIdx === -1) {
      for (var fb = faqBoundaryIdx - 1; fb >= 0; fb--) {
        if (blocks[fb].type === "p" && blocks[fb].text.trim().slice(-1) !== ":") {
          bestParaIdx = fb;
          break;
        }
      }
    }
    if (bestParaIdx === -1) {
      bestParaIdx = blocks.findIndex(function (b) { return b.type === "p"; });
    }
    if (bestParaIdx === -1) return false;

    var pool = getPoolForKey(catKey, kwType);
    var chosen = null;
    for (var pi = 0; pi < pool.length; pi++) {
      if (!pool[pi].sig.test(fullMd)) {
        chosen = pool[pi];
        break;
      }
    }
    if (!chosen) {
      chosen = {
        build: function (kw) { return " Careful focus on **" + kw + "** also supports clear direction from start to finish."; }
      };
    }

    blocks[bestParaIdx].text = blocks[bestParaIdx].text.replace(/\s+$/, "") + chosen.build(wovenKw);
    return true;
  }

  function serializeBlocksToMarkdown(blocks) {
    return blocks.map(function (b) {
      if (b.type === "h1") return "# " + b.text;
      if (b.type === "h2") return "## " + b.text;
      if (b.type === "h3") return "### " + b.text;
      if (b.type === "ul") return b.items.map(function (it) { return "- " + it; }).join("\n");
      if (b.type === "ol") return b.items.map(function (it, idx) { return (idx + 1) + ". " + it; }).join("\n");
      return b.text;
    }).join("\n\n");
  }

  function weaveKeywordsIntoMarkdown(currentResult, keywordsToWeave, profileInput) {
    if (!currentResult || !Array.isArray(keywordsToWeave) || keywordsToWeave.length === 0) return currentResult;
    var approved = (currentResult.approvedKeywords || []).slice();
    var md = currentResult.optimizedMarkdown || "";
    var blocks = markdownToBlocks(md);
    var srcLow = (currentResult.sourceText || "").toLowerCase();
    var rawCat = currentResult.analysis && currentResult.analysis.purpose && currentResult.analysis.purpose.category
      ? currentResult.analysis.purpose.category.id
      : (currentResult.contentMode || "corporate");
    var catKey = (rawCat === "service" || rawCat === "product" || rawCat === "creative") ? rawCat : "general";
    var changesLog = (currentResult.changesSummary || []).slice();
    var wovenCount = 0;
    var lastWeaveAction = "";

    for (var k = 0; k < keywordsToWeave.length; k++) {
      var rawKw = String(keywordsToWeave[k] || "").trim();
      if (!rawKw) continue;
      var wovenKw = (Lex.cleanSuggestedKeyword && Lex.cleanSuggestedKeyword(rawKw, srcLow)) || rawKw;
      if (approved.indexOf(rawKw) === -1) approved.push(rawKw);
      if (approved.indexOf(wovenKw) === -1) approved.push(wovenKw);

      var plainCheck = md.replace(/\*\*/g, "").toLowerCase();
      if (plainCheck.indexOf(wovenKw.toLowerCase()) !== -1) continue;

      var faqIdx = blocks.length;
      for (var fb = 0; fb < blocks.length; fb++) {
        if (blocks[fb].type === "h2" && /frequently asked questions/i.test(blocks[fb].text)) {
          faqIdx = fb;
          break;
        }
      }

      var kwType = classifyWeaveKeyword(wovenKw, catKey);
      var didWeave = false;

      if (tryExpandPhraseInPlace(blocks, faqIdx, wovenKw, kwType)) {
        didWeave = true;
        lastWeaveAction = "Upgraded an existing sentence directly with '" + wovenKw + "'";
        changesLog.push("Upgraded existing sentence with '" + wovenKw + "'");
      } else if (tryMergeIntoExistingClause(blocks, faqIdx, wovenKw, catKey, kwType)) {
        didWeave = true;
        lastWeaveAction = "Merged '" + wovenKw + "' smoothly into an existing sentence";
        changesLog.push("Merged search keyword '" + wovenKw + "' into existing clause");
      } else if (appendContextualKeywordSentence(blocks, faqIdx, wovenKw, catKey, kwType, md)) {
        didWeave = true;
        lastWeaveAction = "Wove '" + wovenKw + "' naturally into the best-matching paragraph";
        changesLog.push("Wove search keyword '" + wovenKw + "' naturally into matching section");
      }

      if (didWeave) {
        wovenCount++;
        md = serializeBlocksToMarkdown(blocks);
      }
    }

    var withApproved = Object.assign({}, currentResult, {
      approvedKeywords: approved,
      changesSummary: changesLog,
      writingEditsCount: changesLog.length,
      lastWeaveAction: lastWeaveAction
    });
    if (wovenCount === 0 && approved.length === (currentResult.approvedKeywords || []).length) {
      return currentResult;
    }
    var rescored = rescoreEditedMarkdown(currentResult.sourceText, md, withApproved, profileInput);
    rescored.lastWeaveAction = lastWeaveAction;
    return rescored;
  }

  function updateResultMetadata(currentResult, metaOverrides, profileInput) {
    if (!currentResult) return null;
    var ov = metaOverrides || {};
    var profile = profileInput || VeriRank.Profiles.getActiveProfile();
    var prevMeta = currentResult.metadata;
    var siteSettings = ov.siteSettings || (VeriRank.Profiles.getSiteSettings ? VeriRank.Profiles.getSiteSettings() : { baseUrl: prevMeta.baseUrl || "https://yoursite.com", brandName: prevMeta.brandName || "", indexNowKey: prevMeta.indexNowKey || "" });
    var baseUrl = VeriRank.Profiles.normalizeBaseUrl ? VeriRank.Profiles.normalizeBaseUrl(siteSettings.baseUrl) : (prevMeta.baseUrl || "https://yoursite.com");
    var brandName = String(siteSettings.brandName || "").trim();
    var indexNowKey = String(siteSettings.indexNowKey || "").trim() || "YOUR_BING_INDEXNOW_KEY";
    var hostMatch = baseUrl.replace(/^https?:\/\//i, "").split("/")[0] || "yoursite.com";

    var title = ov.title !== undefined ? String(ov.title).trim() : prevMeta.title;
    var metaDesc = ov.metaDescription !== undefined ? String(ov.metaDescription).trim() : prevMeta.metaDescription;
    var rawSlug = ov.slug !== undefined ? String(ov.slug).trim() : prevMeta.slug;
    var slug = Lex.slugify(rawSlug || prevMeta.slug);
    var canonicalUrl = baseUrl + "/" + slug;
    var ogType = prevMeta.ogType || (prevMeta.openGraph && prevMeta.openGraph["og:type"]) || "article";

    var jsonLd = JSON.parse(JSON.stringify(prevMeta.jsonLd));
    if (jsonLd && Array.isArray(jsonLd["@graph"]) && jsonLd["@graph"][0]) {
      var rootNode = jsonLd["@graph"][0];
      rootNode.headline = title;
      if (Object.prototype.hasOwnProperty.call(rootNode, "name")) {
        rootNode.name = title;
      }
      rootNode.description = metaDesc;
      if (rootNode.mainEntityOfPage) {
        rootNode.mainEntityOfPage["@id"] = canonicalUrl;
      }
    }

    var indexNowPayload = {
      host: hostMatch,
      key: indexNowKey,
      keyLocation: "https://" + hostMatch + "/" + indexNowKey + ".txt",
      urlList: [canonicalUrl]
    };

    var renderedHtml = renderHtmlFromBlocks(currentResult.blocks, title, metaDesc, canonicalUrl, jsonLd, ogType, brandName);
    var openGraphObj = {
      "og:type": ogType,
      "og:title": title,
      "og:description": metaDesc,
      "og:url": canonicalUrl
    };
    if (brandName) {
      openGraphObj["og:site_name"] = brandName;
    }

    var metaFactLock = { passed: true, issues: [] };
    if (metaDesc && VeriRank.FactLock) {
      var flCheck = VeriRank.FactLock.verify(currentResult.sourceText, metaDesc, []);
      metaFactLock = { passed: flCheck.passed, issues: flCheck.issues };
    }

    var titleVariants = buildTitleVariants(currentResult.analysis, profile, currentResult.contentMode, brandName);
    var newMetadata = Object.assign({}, prevMeta, {
      title: title,
      titleVariants: titleVariants,
      metaDescription: metaDesc,
      slug: slug,
      canonicalUrl: canonicalUrl,
      ogType: ogType,
      baseUrl: baseUrl,
      brandName: brandName,
      indexNowKey: indexNowKey,
      openGraph: openGraphObj,
      jsonLd: jsonLd,
      indexNowPayload: indexNowPayload,
      headTags: renderedHtml.headTags,
      metaFactLock: metaFactLock
    });

    var afterScores = VeriRank.Scorer.score(currentResult.optimizedMarkdown, newMetadata, currentResult.afterAnalysis, profile);
    return Object.assign({}, currentResult, {
      metadata: newMetadata,
      fullHtmlDocument: renderedHtml.fullHtmlDocument,
      afterScores: afterScores
    });
  }

  VeriRank.Optimizer = {
    optimize: optimize,
    rescoreEditedMarkdown: rescoreEditedMarkdown,
    updateResultMetadata: updateResultMetadata,
    weaveKeywordsIntoMarkdown: weaveKeywordsIntoMarkdown,
    renderBlocksDiffHtml: renderBlocksDiffHtml,
    renderHtmlFromBlocks: renderHtmlFromBlocks
  };
})(window);
