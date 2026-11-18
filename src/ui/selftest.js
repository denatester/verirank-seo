(function (global) {
  "use strict";
  var VeriRank = (global.VeriRank = global.VeriRank || {});

  function runAll() {
    var checks = [];
    var assert = function (name, condition, detail) {
      checks.push({
        name: name,
        passed: !!condition,
        detail: detail || (condition ? "Passed" : "Assertion failed")
      });
    };

    var s1 = VeriRank.Samples[0].text;
    var s2 = VeriRank.Samples[1].text;
    var s3 = VeriRank.Samples[2].text;

    var r1 = VeriRank.Optimizer.optimize(s1);
    var r2 = VeriRank.Optimizer.optimize(s2);
    var r3 = VeriRank.Optimizer.optimize(s3);

    assert("Sample 1 subject extracted accurately",
      r1.analysis.subject.primaryKeyphrase.indexOf("zero trust") !== -1,
      "Detected: '" + r1.analysis.subject.primaryKeyphrase + "'");

    assert("Sample 2 subject & procedural intent detected",
      r2.analysis.subject.primaryKeyphrase.indexOf("heat pump") !== -1 && r2.analysis.intent.primary === "procedural",
      "Detected: '" + r2.analysis.subject.primaryKeyphrase + "', intent: " + r2.analysis.intent.primary);

    assert("Sample 3 subject extracted accurately",
      r3.analysis.subject.primaryKeyphrase.indexOf("billing compliance") !== -1,
      "Detected: '" + r3.analysis.subject.primaryKeyphrase + "'");

    assert("Sample 1 Google & Bing scores >= 85 and improved > +20",
      r1.afterScores.google.total >= 85 && r1.afterScores.bing.total >= 85 &&
      r1.afterScores.google.total - r1.beforeScores.google.total >= 20 &&
      r1.afterScores.bing.total - r1.beforeScores.bing.total >= 20,
      "Google: " + r1.beforeScores.google.total + "->" + r1.afterScores.google.total + ", Bing: " + r1.beforeScores.bing.total + "->" + r1.afterScores.bing.total);

    assert("Sample 2 Google & Bing scores >= 85 and numbered list created",
      r2.afterScores.google.total >= 85 && r2.afterScores.bing.total >= 85 && /\n1\.\s+/.test(r2.optimizedMarkdown),
      "Google: " + r2.afterScores.google.total + ", Bing: " + r2.afterScores.bing.total);

    assert("Sample 3 Google & Bing scores >= 85",
      r3.afterScores.google.total >= 85 && r3.afterScores.bing.total >= 85,
      "Google: " + r3.afterScores.google.total + ", Bing: " + r3.afterScores.bing.total);

    assert("No keyword stuffing across all 3 samples (density <= 2.4%)",
      r1.afterScores.metrics.exactDensityPct <= 2.4 && r2.afterScores.metrics.exactDensityPct <= 2.4 && r3.afterScores.metrics.exactDensityPct <= 2.4,
      "Densities: " + r1.afterScores.metrics.exactDensityPct + "%, " + r2.afterScores.metrics.exactDensityPct + "%, " + r3.afterScores.metrics.exactDensityPct + "%");

    assert("Fact-Lock passes with 0 issues on Sample 1",
      r1.factLock.passed && r1.factLock.issues.length === 0,
      "Status: " + r1.factLock.status + " (" + r1.factLock.issues.length + " issues)");

    assert("Fact-Lock passes with 0 issues on Sample 2",
      r2.factLock.passed && r2.factLock.issues.length === 0,
      "Status: " + r2.factLock.status + " (" + r2.factLock.issues.length + " issues)");

    assert("Fact-Lock passes with 0 issues on Sample 3",
      r3.factLock.passed && r3.factLock.issues.length === 0,
      "Status: " + r3.factLock.status + " (" + r3.factLock.issues.length + " issues)");

    // Anti-hallucination trap tests
    var fakeNumText = r1.optimizedMarkdown + "\n\nDeploying this solution improves annual ROI by 73% across Fortune 500 firms.";
    var numCheck = VeriRank.FactLock.verify(s1, fakeNumText, []);
    assert("Fact-Lock catches invented numeric claim (73%)",
      !numCheck.passed && numCheck.issues.some(function (i) { return i.type === "UNGROUNDED_NUMBER" && i.token.indexOf("73") !== -1; }),
      "Caught " + numCheck.issues.length + " issue(s)");

    var fakeEntText = r1.optimizedMarkdown + "\n\nThis approach is officially certified by Gartner Research and Forrester.";
    var entCheck = VeriRank.FactLock.verify(s1, fakeEntText, []);
    assert("Fact-Lock catches invented proper noun/entity (Gartner)",
      !entCheck.passed && entCheck.issues.some(function (i) { return i.type === "UNGROUNDED_ENTITY" && i.token === "Gartner"; }),
      "Caught " + entCheck.issues.length + " issue(s)");

    var flippedText = r3.optimizedMarkdown.replace(/does not replace/gi, "replaces").replace(/never alters/gi, "automatically alters");
    var polCheck = VeriRank.FactLock.verify(s3, flippedText, []);
    assert("Fact-Lock catches polarity flip on negated compliance rule",
      !polCheck.passed && polCheck.issues.some(function (i) { return i.type === "POLARITY_FLIP"; }),
      "Caught " + polCheck.issues.filter(function (i) { return i.type === "POLARITY_FLIP"; }).length + " polarity flip(s)");

    var aiMixed = r1.optimizedMarkdown.split("\n\n")[0] + "\n\n" +
      r1.optimizedMarkdown.split("\n\n")[1] + "\n\n" +
      "Gartner confirms this cuts costs by 88% in every deployment.";
    var sanitized = VeriRank.FactLock.sanitizeAiCandidate(s1, r1.optimizedMarkdown, aiMixed);
    assert("Fact-Lock AI sanitizer quarantines hallucinated paragraph",
      sanitized.quarantined.length === 1 && sanitized.audit.passed,
      "Quarantined " + sanitized.quarantined.length + " block(s), final audit passed: " + sanitized.audit.passed);

    var ungroundedOverride = VeriRank.Optimizer.optimize(s1, { overrideKeyword: "cryptocurrency mining" });
    assert("Ungrounded manual keyword override is blocked from polluting prose",
      ungroundedOverride.warnings.length > 0 && ungroundedOverride.optimizedMarkdown.toLowerCase().indexOf("cryptocurrency") === -1,
      ungroundedOverride.warnings[0] || "No warning");

    var schemaValid = r1.metadata.jsonLd && r1.metadata.jsonLd["@context"] === "https://schema.org" && Array.isArray(r1.metadata.jsonLd["@graph"]);
    assert("Valid Schema.org JSON-LD graph generated", schemaValid, "Types: " + r1.metadata.jsonLd["@graph"].map(function (g) { return g["@type"]; }).join(", "));

    var zipBytes = VeriRank.Exporter.createZipBytes(VeriRank.Exporter.buildDocumentPackageFiles(r1));
    var validZipSig = zipBytes.length > 200 && zipBytes[0] === 0x50 && zipBytes[1] === 0x4b && zipBytes[2] === 0x03 && zipBytes[3] === 0x04;
    assert("Pure-JS ZIP archive starts with valid PK\\x03\\x04 header", validZipSig, "Size: " + zipBytes.length + " bytes");

    assert("Sub-50ms deterministic optimization performance",
      typeof r1.durationMs === "number" && r1.durationMs < 50,
      "Completed in " + r1.durationMs + " ms");

    var normDash = VeriRank.Cloud && VeriRank.Cloud.normalizeSupabaseUrl("https://supabase.com/dashboard/project/abcdefghijklmnop/settings/api");
    assert("Supabase Dashboard URL auto-normalizes to API endpoint",
      normDash === "https://abcdefghijklmnop.supabase.co",
      "Normalized: " + normDash);

    var validHtmlDoc = r1.fullHtmlDocument.indexOf("<!DOCTYPE html>") === 0 && r1.fullHtmlDocument.indexOf("<" + "script type=\"application/ld+json\">") !== -1;
    assert("Exported full HTML document contains valid doctype & JSON-LD",
      validHtmlDoc,
      "HTML length: " + r1.fullHtmlDocument.length + " chars");

    var creativePreset = VeriRank.Profiles.CONTENT_PRESETS.creative;
    var creativeProf = VeriRank.Profiles.buildProfileForPreset(VeriRank.Profiles.FACTORY_PROFILE, "creative");
    var creativeOpts = Object.assign({ contentMode: "creative", profile: creativeProf }, creativePreset.options);
    var rCreative = VeriRank.Optimizer.optimize(VeriRank.CreativeSample.text, creativeOpts);
    var creativeSchemaType = rCreative.metadata.jsonLd["@graph"][0]["@type"];
    assert("Fiction / Creative Blurb preset preserves voice & scores >= 85",
      rCreative.optimizedMarkdown.indexOf("Key Takeaways") === -1 &&
      rCreative.optimizedMarkdown.indexOf("Frequently Asked Questions") === -1 &&
      rCreative.factLock.passed && rCreative.factLock.issues.length === 0 &&
      rCreative.afterScores.google.total >= 85 && rCreative.afterScores.bing.total >= 85 &&
      (creativeSchemaType === "Book" || creativeSchemaType === "CreativeWork"),
      "Google: " + rCreative.afterScores.google.total + ", Bing: " + rCreative.afterScores.bing.total + ", Schema: " + creativeSchemaType);

    var presetIds = ["corporate", "blog", "product", "creative"];
    var allPresetsOk = presetIds.every(function (pid) {
      var pr = VeriRank.Profiles.CONTENT_PRESETS[pid];
      var pf = VeriRank.Profiles.buildProfileForPreset(VeriRank.Profiles.FACTORY_PROFILE, pid);
      var txt = pid === "creative" ? VeriRank.CreativeSample.text : s1;
      var out = VeriRank.Optimizer.optimize(txt, Object.assign({ contentMode: pid, profile: pf }, pr.options));
      return out.factLock.passed && out.afterScores.google.total >= 85 && out.afterScores.bing.total >= 85;
    });
    assert("All 4 Content Type presets execute with 100% Fact-Lock accuracy",
      allPresetsOk,
      "Verified: " + presetIds.join(", "));

    var wordDocSrc = "Software validation doesn\u2019t replace clinical audits.";
    var wordDocFlipped = "Software validation replaces clinical audits.";
    var wordFl = VeriRank.FactLock.verify(wordDocSrc, wordDocFlipped, []);
    assert("Smart-quote normalization protects MS Word curly-apostrophe negations",
      !wordFl.passed && wordFl.issues.some(function (i) { return i.type === "POLARITY_FLIP"; }),
      "Caught " + wordFl.issues.length + " curly-apostrophe polarity flip(s)");

    var customSiteRes = VeriRank.Optimizer.optimize(s1, {
      siteSettings: { baseUrl: "https://acmecloud.io/guides", brandName: "AcmeCloud", indexNowKey: "idx9988" }
    });
    var editedMetaRes = VeriRank.Optimizer.updateResultMetadata(customSiteRes, {
      title: "Zero Trust Access Guide | AcmeCloud",
      slug: "custom-cloud-slug",
      siteSettings: { baseUrl: "https://acmecloud.io/guides", brandName: "AcmeCloud", indexNowKey: "idx9988" }
    });
    assert("Custom Website Domain, Brand Name & Live SERP Snippet Editor update tags cleanly",
      editedMetaRes.metadata.canonicalUrl === "https://acmecloud.io/guides/custom-cloud-slug" &&
      editedMetaRes.metadata.indexNowPayload.key === "idx9988" &&
      editedMetaRes.metadata.headTags.indexOf("example.com") === -1 &&
      editedMetaRes.metadata.headTags.indexOf("AcmeCloud") !== -1,
      "Canonical: " + editedMetaRes.metadata.canonicalUrl);

    assert("7-Point Keyword Placement Matrix & universal FAQ phrasing verified",
      Array.isArray(r1.afterScores.placementMatrix) &&
      r1.afterScores.placementMatrix.length === 7 &&
      r1.afterScores.placementMatrix.every(function (p) { return p.passed; }) &&
      r1.optimizedMarkdown.indexOf("Why do organizations use") === -1,
      "All 7 placement checks passed");

    var csvExport = VeriRank.Exporter.buildBatchCsv([{ fileName: "sample.txt", result: r1 }]);
    var histSaved = VeriRank.Profiles.addLocalHistoryEntry({
      title: r1.metadata.title,
      primaryKeyphrase: r1.analysis.subject.primaryKeyphrase,
      preset: "corporate",
      googleScore: r1.afterScores.google.total,
      bingScore: r1.afterScores.bing.total,
      sourceText: s1,
      overrideKeyword: ""
    });
    assert("Agency CSV export includes Excel UTF-8 BOM & Local History persists",
      csvExport.charCodeAt(0) === 0xFEFF && csvExport.indexOf("SEO Title,Meta Description,Canonical URL") !== -1 && histSaved.length >= 1,
      "CSV length: " + csvExport.length + " chars, history items: " + histSaved.length);

    var shortInput = "There are a lot of roofers who rush roof repair jobs. In addition to this, our team is able to inspect three critical areas on every visit: shingle flashing, attic ventilation, and gutter drainage. We make sure that homeowners receive clear photo reports on a daily basis before any work starts.";
    var shortRes = VeriRank.Optimizer.optimize(shortInput, VeriRank.Profiles.CONTENT_PRESETS.corporate.options);
    var shortPlainMd = shortRes.optimizedMarkdown.replace(/\*\*/g, "");
    assert("Short everyday paragraph (60w) receives real prose edits without unwanted bullets/FAQs",
      shortRes.optimizedMarkdown !== shortInput &&
      /Many roofers/i.test(shortPlainMd) &&
      /\bcan inspect\b/i.test(shortPlainMd) &&
      /\bensure homeowners\b/i.test(shortPlainMd) &&
      /\bdaily\b/i.test(shortPlainMd) &&
      shortRes.optimizedMarkdown.indexOf("# ") === 0 &&
      shortRes.optimizedMarkdown.indexOf("- Shingle flashing") !== -1 &&
      shortRes.optimizedMarkdown.indexOf("Key Takeaways") === -1 &&
      shortRes.optimizedMarkdown.indexOf("Frequently Asked Questions") === -1 &&
      shortRes.factLock.passed && shortRes.factLock.issues.length === 0,
      "Changes applied: " + shortRes.changesSummary.length + " (" + shortRes.changesSummary.slice(0, 3).join("; ") + ")");

    var optTakeawayRes = VeriRank.Optimizer.optimize(s1, { includeTakeaways: true, includeFaq: true });
    assert("Optional Key Takeaways distill clauses & bold emphasis renders cleanly",
      r1.optimizedMarkdown.indexOf("**") !== -1 &&
      r1.optimizedHtml.indexOf("<strong>") !== -1 &&
      optTakeawayRes.optimizedMarkdown.indexOf("Key Takeaways") !== -1 &&
      r1.factLock.passed && optTakeawayRes.factLock.passed,
      "Bold emphasis & optional takeaways verified with Fact-Lock 100% passed");

    var candListLow = shortRes.analysis.subject.candidateKeyphrases.map(function (c) { return c.phrase; });
    assert("Topic extractor isolates clean search keywords without cross-comma or verb noise",
      shortRes.analysis.subject.primaryKeyphrase === "roof repair" &&
      candListLow.indexOf("rush roof repair") === -1 &&
      candListLow.indexOf("shingle flashing attic") === -1 &&
      shortRes.analysis.purpose && shortRes.analysis.purpose.category.id === "service",
      "Detected topic: '" + shortRes.analysis.subject.primaryKeyphrase + "', purpose: " + shortRes.analysis.purpose.category.label);

    var wovenRes = VeriRank.Optimizer.weaveKeywordsIntoMarkdown(shortRes, ["residential roof repair", "roof leak inspection"]);
    assert("1-Click Keyword Weaver integrates selected search keywords & passes Fact-Lock",
      wovenRes.optimizedMarkdown.toLowerCase().indexOf("residential roof repair") !== -1 &&
      wovenRes.optimizedMarkdown.toLowerCase().indexOf("roof leak inspection") !== -1 &&
      wovenRes.factLock.passed && wovenRes.factLock.issues.length === 0,
      "Wove 2 keywords; Fact-Lock: " + wovenRes.factLock.status + ", Google: " + wovenRes.afterScores.google.total);

    var r1DiffHtml = VeriRank.Optimizer.renderBlocksDiffHtml(r1);
    var shortDiffHtml = VeriRank.Optimizer.renderBlocksDiffHtml(shortRes);
    var r1DiffPlain = r1DiffHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    var shortDiffPlain = shortDiffHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    var r1FirstSentCountMd = (r1.optimizedMarkdown.match(/Traditional perimeter firewalls/g) || []).length;
    var r1FirstSentCountDiff = (r1DiffPlain.match(/Traditional perimeter firewalls/g) || []).length;
    var idxVisitIntro = shortRes.optimizedMarkdown.indexOf("on every visit:");
    var idxBullet = shortRes.optimizedMarkdown.indexOf("- Shingle flashing");
    var idxDailyReport = shortRes.optimizedMarkdown.indexOf("clear photo reports daily");
    assert("Zero Sentence Duplication in Highlight Edits Diff & Preserved Paragraph/List Order",
      r1FirstSentCountMd === 1 &&
      r1FirstSentCountDiff === 1 &&
      shortDiffPlain.indexOf("Many") !== -1 &&
      shortDiffPlain.indexOf("roofers") !== -1 &&
      (shortDiffPlain.match(/daily/g) || []).length >= 1 &&
      idxVisitIntro !== -1 && idxBullet > idxVisitIntro && idxDailyReport > idxBullet,
      "Diff occurrences: " + r1FirstSentCountDiff + ", Bullet follows intro cleanly: " + (idxBullet > idxVisitIntro && idxDailyReport > idxBullet));

    var bizReadersText = "Readers of our homeowner guide can book an inspection online for roof repair and leak checks. Our team serves homeowners with clear photo reports on every visit.";
    var bizReadersRes = VeriRank.Optimizer.optimize(bizReadersText, VeriRank.Profiles.CONTENT_PRESETS.corporate.options);
    var geoFilteredOut = VeriRank.Lexicon.cleanSuggestedKeyword("roof repair florida", "local roof repair for homeowners");
    var stateCodeFiltered = VeriRank.Lexicon.cleanSuggestedKeyword("roof repair herndon va", "local roof repair for homeowners");
    var geoKeptWhenLocal = VeriRank.Lexicon.cleanSuggestedKeyword("roof repair florida", "serving tampa, florida homeowners");
    var nearMeNormalized = VeriRank.Lexicon.cleanSuggestedKeyword("roof repair near me", "local roof repair");
    assert("Smart Purpose Classifier Resists Ambiguous 'book'/'readers' & Filters Unrelated Geo Noise",
      bizReadersRes.analysis.purpose && bizReadersRes.analysis.purpose.category.id === "service" &&
      rCreative.analysis.purpose && rCreative.analysis.purpose.category.id === "creative" &&
      geoFilteredOut === "" &&
      stateCodeFiltered === "" &&
      geoKeptWhenLocal === "roof repair florida" &&
      nearMeNormalized === "local roof repair",
      "Biz purpose: " + bizReadersRes.analysis.purpose.category.id + ", Near-me -> '" + nearMeNormalized + "'");

    var multiBizWoven = shortRes;
    ["residential roof repair", "roof repair cost", "roof leak inspection", "roof repair checklist", "local roof repair"].forEach(function (kw) {
      multiBizWoven = VeriRank.Optimizer.weaveKeywordsIntoMarkdown(multiBizWoven, [kw]);
    });
    var multiCreativeWoven = rCreative;
    ["deep space salvage novel", "space opera", "interstellar mystery", "cosmic suspense"].forEach(function (kw) {
      multiCreativeWoven = VeriRank.Optimizer.weaveKeywordsIntoMarkdown(multiCreativeWoven, [kw], creativeProf);
    });
    var bizMdLow = multiBizWoven.optimizedMarkdown.toLowerCase();
    var creMdLow = multiCreativeWoven.optimizedMarkdown.toLowerCase();
    var boldMarkersEven = ((multiBizWoven.optimizedMarkdown.match(/\*\*/g) || []).length % 2) === 0;
    var hasUnbalancedBold = /\*\*[^*\n]+\*\*\s+[a-z]+\*\*/i.test(multiBizWoven.optimizedMarkdown);
    assert("Multi-Keyword Smart Weaver Uses In-Place Expansion, Clause Merging & Zero Repeated Templates",
      bizMdLow.indexOf("many roofers rush **residential roof repair** jobs") !== -1 &&
      bizMdLow.indexOf("**roof repair cost**") !== -1 &&
      !hasUnbalancedBold && boldMarkersEven &&
      bizMdLow.indexOf("**roof leak inspection** and **roof repair checklist**") !== -1 &&
      creMdLow.indexOf("deep space salvage novel") !== -1 &&
      creMdLow.indexOf("space opera") !== -1 &&
      creMdLow.indexOf("interstellar mystery") !== -1 &&
      creMdLow.indexOf("cosmic suspense") !== -1 &&
      creMdLow.indexOf("will feel right at home") === -1 &&
      (creMdLow.match(/readers who /g) || []).length === 1 &&
      multiBizWoven.factLock.passed && multiBizWoven.factLock.issues.length === 0 &&
      multiCreativeWoven.factLock.passed && multiCreativeWoven.factLock.issues.length === 0,
      "Biz Fact-Lock: " + multiBizWoven.factLock.status + ", Creative Fact-Lock: " + multiCreativeWoven.factLock.status);

    var passedCount = checks.filter(function (c) { return c.passed; }).length;
    var failedCount = checks.length - passedCount;
    var summary = {
      total: checks.length,
      passed: passedCount,
      failed: failedCount,
      allPassed: failedCount === 0,
      checks: checks
    };
    global.__SELFTEST_RESULTS__ = summary;
    return summary;
  }

  VeriRank.SelfTest = {
    runAll: runAll
  };
})(window);
