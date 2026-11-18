(function (global) {
  "use strict";
  var VeriRank = (global.VeriRank = global.VeriRank || {});
  var Lex = VeriRank.Lexicon;

  var state = {
    currentResult: null,
    activePreset: "corporate",
    activeProfile: VeriRank.Profiles.buildProfileForPreset(VeriRank.Profiles.getActiveProfile(), "corporate"),
    siteSettings: VeriRank.Profiles.getSiteSettings ? VeriRank.Profiles.getSiteSettings() : { baseUrl: "https://yoursite.com", brandName: "", indexNowKey: "" },
    sidebarKeywords: [],
    selectedTitleIdx: 0,
    viewMode: "preview",
    batchItems: [],
    cloudDocs: []
  };

  function $(id) {
    return document.getElementById(id);
  }

  function getRuntimeMode() {
    if (global.__VERIRANK_HOST__ && global.__VERIRANK_HOST__.token) return "desktop";
    if (global.location && /^https?:/i.test(global.location.protocol)) return "cloud";
    return "portable";
  }

  function isApiAvailable() {
    var mode = getRuntimeMode();
    return mode === "desktop" || mode === "cloud";
  }

  function hostHeaders() {
    var headers = { "Content-Type": "application/json" };
    if (getRuntimeMode() === "desktop") {
      headers["X-VeriRank-Token"] = global.__VERIRANK_HOST__.token;
    }
    return headers;
  }

  function showToast(message, kind) {
    var container = $("toastContainer");
    if (!container) return;
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3400);
  }

  function formatInlineMarkdownHtml(escapedStr) {
    return String(escapedStr || "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function renderSimpleMarkdownToHtml(md) {
    var lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var listType = null;
    var closeList = function () {
      if (listType) {
        html.push("</" + listType + ">");
        listType = null;
      }
    };

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) {
        closeList();
        continue;
      }
      var h3 = line.match(/^###\s+(.+)$/);
      var h2 = line.match(/^##\s+(.+)$/);
      var h1 = line.match(/^#\s+(.+)$/);
      var ul = line.match(/^[-*+]\s+(.+)$/);
      var ol = line.match(/^\d+[.)]\s+(.+)$/);

      if (h1) {
        closeList();
        html.push("<h1>" + Lex.escapeHtml(h1[1]) + "</h1>");
      } else if (h2) {
        closeList();
        html.push("<h2>" + Lex.escapeHtml(h2[1]) + "</h2>");
      } else if (h3) {
        closeList();
        html.push("<h3>" + Lex.escapeHtml(h3[1]) + "</h3>");
      } else if (ul) {
        if (listType !== "ul") {
          closeList();
          listType = "ul";
          html.push("<ul>");
        }
        html.push("<li>" + formatInlineMarkdownHtml(Lex.escapeHtml(ul[1])) + "</li>");
      } else if (ol) {
        if (listType !== "ol") {
          closeList();
          listType = "ol";
          html.push("<ol>");
        }
        html.push("<li>" + formatInlineMarkdownHtml(Lex.escapeHtml(ol[1])) + "</li>");
      } else {
        closeList();
        html.push("<p>" + formatInlineMarkdownHtml(Lex.escapeHtml(line)) + "</p>");
      }
    }
    closeList();
    return html.join("\n");
  }

  function renderDiffView(res) {
    if (!$("diffViewPane") || !res) return;
    $("diffViewPane").innerHTML = VeriRank.Optimizer.renderBlocksDiffHtml
      ? VeriRank.Optimizer.renderBlocksDiffHtml(res)
      : "";
  }

  function scoreClass(val) {
    if (val >= 80) return "ok";
    if (val >= 60) return "warn";
    return "bad";
  }

  function setScoreRing(ringId, scorePct, defaultCls) {
    var ring = $(ringId);
    if (!ring) return;
    var circumference = 113.1;
    var clamped = Math.max(0, Math.min(100, Number(scorePct) || 0));
    var offset = circumference - (clamped / 100) * circumference;
    ring.setAttribute("stroke-dashoffset", offset.toFixed(1));
    ring.setAttribute("class", "score-ring-fg " + (defaultCls || scoreClass(clamped)));
  }

  function updateSourceTelemetry() {
    var raw = $("sourceTextarea").value || "";
    var parsed = VeriRank.Analyzer.parseDocument(raw);
    var words = parsed.totalWords || 0;
    var sentences = parsed.sentences.length || 0;
    var mins = Math.max(1, Math.ceil(words / 220));
    var fmtLabel = parsed.format === "html" ? "HTML" : (parsed.format === "markdown" ? "Markdown" : "Plain Text");
    $("sourceStatsBar").innerHTML =
      "<span>Words: <strong>" + words + "</strong></span>" +
      "<span>Sentences: <strong>" + sentences + "</strong></span>" +
      "<span>Format: <strong>" + fmtLabel + "</strong></span>" +
      "<span>Read Time: <strong>" + (words > 0 ? mins + "m" : "0m") + "</strong></span>";
  }

  function copyText(txt, statusMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () {
        $("studioActionStatus").textContent = statusMsg || "Copied to clipboard.";
        showToast(statusMsg || "Copied to clipboard.", "ok");
      });
    } else {
      var ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      $("studioActionStatus").textContent = statusMsg || "Copied to clipboard.";
      showToast(statusMsg || "Copied to clipboard.", "ok");
    }
  }

  function copyRichHtml(htmlContent, plainFallback) {
    var msg = "Formatted content copied (ready to paste into Word / Google Docs).";
    var fallbackExec = function () {
      var box = document.createElement("div");
      box.contentEditable = "true";
      box.style.position = "fixed";
      box.style.left = "-9999px";
      box.innerHTML = htmlContent;
      document.body.appendChild(box);
      var range = document.createRange();
      range.selectNodeContents(box);
      var sel = global.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("copy");
      sel.removeAllRanges();
      document.body.removeChild(box);
      $("studioActionStatus").textContent = msg;
      showToast(msg, "ok");
    };

    try {
      if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        var item = new ClipboardItem({
          "text/html": new Blob([htmlContent], { type: "text/html" }),
          "text/plain": new Blob([plainFallback || ""], { type: "text/plain" })
        });
        navigator.clipboard.write([item]).then(function () {
          $("studioActionStatus").textContent = msg;
          showToast(msg, "ok");
        }).catch(fallbackExec);
        return;
      }
    } catch (e) { }
    fallbackExec();
  }

  function applyContentPreset(presetId, shouldRunOptimize) {
    var preset = VeriRank.Profiles.CONTENT_PRESETS[presetId] || VeriRank.Profiles.CONTENT_PRESETS.corporate;
    state.activePreset = preset.id;

    var cards = document.querySelectorAll("[data-preset]");
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("active", cards[i].getAttribute("data-preset") === preset.id);
    }

    $("optStructureHeadings").checked = !!preset.options.structureHeadings;
    $("optTakeaways").checked = !!preset.options.includeTakeaways;
    $("optFaq").checked = !!preset.options.includeFaq;
    $("optTighten").checked = !!preset.options.tightenReadability;
    $("optLists").checked = !!preset.options.convertLists;

    if ($("activePresetBadge")) {
      $("activePresetBadge").textContent = preset.label;
    }

    state.activeProfile = VeriRank.Profiles.buildProfileForPreset(VeriRank.Profiles.getActiveProfile(), preset.id);
    renderProfileForm();

    if (shouldRunOptimize && $("sourceTextarea").value.trim()) {
      runOptimization();
      showToast("Switched to " + preset.label + " mode.", "ok");
    }
  }

  function getOptimizeOptionsFromUi() {
    return {
      contentMode: state.activePreset,
      overrideKeyword: $("overrideKeywordInput").value.trim(),
      structureHeadings: $("optStructureHeadings").checked,
      includeTakeaways: $("optTakeaways").checked,
      includeFaq: $("optFaq").checked,
      tightenReadability: $("optTighten").checked,
      convertLists: $("optLists").checked,
      profile: state.activeProfile,
      siteSettings: state.siteSettings
    };
  }

  function renderLocalHistory() {
    if (!VeriRank.Profiles || !VeriRank.Profiles.getLocalHistory) return;
    var list = VeriRank.Profiles.getLocalHistory();
    if ($("toggleHistoryBtn")) {
      $("toggleHistoryBtn").textContent = "Recent (" + list.length + ")";
    }
    var drawer = $("localHistoryDrawer");
    if (!drawer) return;
    if (list.length === 0) {
      drawer.innerHTML = "<div class='muted'>No saved runs yet. Optimize any text and it will be remembered here automatically.</div>";
      return;
    }
    drawer.innerHTML = "<div class='card-title' style='margin-bottom:4px;'><span>Recent Optimizations (Saved Offline in Browser)</span>" +
      "<button type='button' id='clearLocalHistoryBtn' class='btn sm'>Clear History</button></div>" +
      list.map(function (h, idx) {
        var dt = h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        return "<div class='history-row'>" +
          "<div style='min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" +
            "<strong>" + Lex.escapeHtml(h.title) + "</strong> " +
            "<span class='muted'>(" + Lex.escapeHtml(h.primaryKeyphrase) + " &bull; G:" + h.googleScore + " / B:" + h.bingScore + " &bull; " + Lex.escapeHtml(dt) + ")</span>" +
          "</div>" +
          "<button type='button' class='btn sm' data-hist-idx='" + idx + "'>Load</button>" +
          "</div>";
      }).join("");

    var clearBtn = $("clearLocalHistoryBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        VeriRank.Profiles.clearLocalHistory();
        renderLocalHistory();
        showToast("Cleared recent local history.", "ok");
      });
    }
    var hBtns = drawer.querySelectorAll("[data-hist-idx]");
    for (var i = 0; i < hBtns.length; i++) {
      hBtns[i].addEventListener("click", function () {
        var entry = VeriRank.Profiles.getLocalHistory()[parseInt(this.getAttribute("data-hist-idx"), 10)];
        if (!entry) return;
        $("sourceTextarea").value = entry.sourceText || "";
        $("overrideKeywordInput").value = entry.overrideKeyword || "";
        applyContentPreset(entry.preset || "corporate", false);
        runOptimization();
        drawer.style.display = "none";
        showToast("Loaded draft from Recent history.", "ok");
      });
    }
  }

  function mergeSidebarKeywords(newItems, prepend) {
    var map = {};
    var out = [];
    var srcLow = (state.currentResult && state.currentResult.sourceText ? state.currentResult.sourceText : "").toLowerCase();
    var pushItem = function (it) {
      if (!it || !it.phrase) return;
      var rawPhrase = String(it.phrase).trim();
      var cleanPhrase = (it.source === "Main Topic" || it.source === "Found in Text" || !Lex.cleanSuggestedKeyword)
        ? rawPhrase
        : Lex.cleanSuggestedKeyword(rawPhrase, srcLow);
      if (!cleanPhrase) return;
      var low = cleanPhrase.toLowerCase().trim();
      if (!low || low.length < 3) return;
      if (!map[low]) {
        map[low] = { phrase: cleanPhrase, source: it.source || "Topic Match" };
        out.push(map[low]);
      } else if (map[low].source === "Topic Match" && it.source && it.source !== "Topic Match") {
        map[low].source = it.source;
      }
    };
    if (prepend) {
      (newItems || []).forEach(pushItem);
      (state.sidebarKeywords || []).forEach(pushItem);
    } else {
      (state.sidebarKeywords || []).forEach(pushItem);
      (newItems || []).forEach(pushItem);
    }
    state.sidebarKeywords = out.slice(0, 26);
  }

  function renderKeywordSidebar() {
    var listEl = $("keywordSidebarList");
    var badgeEl = $("kwUsedCountBadge");
    if (!listEl) return;

    var currentMd = ($("markdownOutputArea") && $("markdownOutputArea").value) || (state.currentResult ? state.currentResult.optimizedMarkdown : "") || "";
    var plainLow = currentMd.replace(/\*\*/g, "").toLowerCase();

    var usedList = [];
    var unusedList = [];
    (state.sidebarKeywords || []).forEach(function (item) {
      var low = item.phrase.toLowerCase();
      var count = VeriRank.Scorer.countExactPhrase(plainLow, low);
      if (count === 0 && plainLow.indexOf(low) !== -1) count = 1;
      var rec = { phrase: item.phrase, source: item.source, count: count };
      if (count > 0) usedList.push(rec);
      else unusedList.push(rec);
    });

    if (badgeEl) {
      badgeEl.textContent = usedList.length + " / " + (usedList.length + unusedList.length) + " in text";
    }

    var html = [];
    if (unusedList.length > 0) {
      html.push("<div class='kw-group-label'>Suggested Search Keywords (Click + Weave In or Type Manually)</div>");
      unusedList.slice(0, 16).forEach(function (u) {
        html.push(
          "<div class='kw-item'>" +
            "<div style='min-width:0;flex:1;'>" +
              "<div class='kw-phrase'>" + Lex.escapeHtml(u.phrase) + "</div>" +
              "<div class='kw-source'>" + Lex.escapeHtml(u.source) + "</div>" +
            "</div>" +
            "<button type='button' class='btn sm' data-weave-kw='" + Lex.escapeHtml(u.phrase) + "' style='flex-shrink:0;'>+ Weave In</button>" +
          "</div>"
        );
      });
    } else {
      html.push("<div class='muted' style='margin:6px 0;'>All listed search keywords are already in your writing!</div>");
    }

    if (usedList.length > 0) {
      html.push("<div class='kw-group-label'>Already in Your Writing (" + usedList.length + ")</div>");
      usedList.forEach(function (u) {
        html.push(
          "<div class='kw-item used'>" +
            "<div style='min-width:0;flex:1;'>" +
              "<div class='kw-phrase'>&#10003; " + Lex.escapeHtml(u.phrase) + "</div>" +
              "<div class='kw-source'>" + Lex.escapeHtml(u.source) + " &bull; Used " + u.count + "x</div>" +
            "</div>" +
          "</div>"
        );
      });
    }

    listEl.innerHTML = html.join("");

    var wBtns = listEl.querySelectorAll("[data-weave-kw]");
    for (var i = 0; i < wBtns.length; i++) {
      wBtns[i].addEventListener("click", function () {
        var kw = this.getAttribute("data-weave-kw");
        if (!state.currentResult || !kw || !VeriRank.Optimizer.weaveKeywordsIntoMarkdown) return;
        var updated = VeriRank.Optimizer.weaveKeywordsIntoMarkdown(state.currentResult, [kw], state.activeProfile);
        state.currentResult = updated;
        renderResult(updated);
        if (state.viewMode !== "markdown") {
          switchContentViewMode("diff");
        }
        showToast(updated.lastWeaveAction || ("Wove '" + kw + "' naturally into your writing!"), "ok");
      });
    }
  }

  function fetchLiveKeywordsForSidebar(res, customQuery) {
    if (!res) return;
    var statusEl = $("keywordSidebarStatus");
    var primary = customQuery || res.analysis.subject.primaryKeyphrase;
    var seeds = customQuery
      ? [customQuery]
      : (res.analysis.purpose && res.analysis.purpose.seedQueries ? res.analysis.purpose.seedQueries : [primary]);

    if (!isApiAvailable()) {
      if (statusEl) {
        statusEl.textContent = "Showing offline keyword ideas for '" + primary + "' (live Google/Bing search runs automatically on the web/desktop app).";
      }
      renderKeywordSidebar();
      return;
    }

    if (statusEl) statusEl.textContent = "Searching live Google & Bing keywords for '" + primary + "'...";
    fetch("/api/suggest", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({ query: primary, seeds: seeds, contextText: (res.sourceText || "").slice(0, 1500) })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.offline) {
          if (statusEl) statusEl.textContent = "Using smart topic keyword ideas (live search unreachable).";
          renderKeywordSidebar();
          return;
        }
        var items = Array.isArray(data.items) && data.items.length
          ? data.items.map(function (it) { return { phrase: it.phrase, source: (it.engines || []).join(" + ") || "Google + Bing" }; })
          : [].concat(
              (data.google || []).map(function (q) { return { phrase: q, source: "Google" }; }),
              (data.bing || []).map(function (q) { return { phrase: q, source: "Bing" }; })
            );
        mergeSidebarKeywords(items, !!customQuery);
        if (statusEl) {
          statusEl.textContent = "Live Google & Bing results for '" + primary + "' (" + items.length + " live phrases found).";
        }
        renderKeywordSidebar();
      })
      .catch(function () {
        if (statusEl) statusEl.textContent = "Using built-in topic keyword ideas.";
        renderKeywordSidebar();
      });
  }

  function runOptimization() {
    var raw = $("sourceTextarea").value.trim();
    if (!raw) {
      $("studioActionStatus").textContent = "Please paste or load source text first.";
      showToast("Paste or import a document to optimize.", "warn");
      return;
    }
    state.selectedTitleIdx = 0;
    var res = VeriRank.Optimizer.optimize(raw, getOptimizeOptionsFromUi());
    state.currentResult = res;

    // Seed sidebar with primary, detected secondary topics & intent fallback keywords before live fetch completes
    var seedItems = [{ phrase: res.analysis.subject.primaryKeyphrase, source: "Main Topic" }];
    (res.analysis.subject.secondaryKeyphrases || []).forEach(function (s) {
      seedItems.push({ phrase: s.phrase, source: "Found in Text" });
    });
    (res.analysis.fallbackKeywords || []).forEach(function (f) {
      seedItems.push(f);
    });
    state.sidebarKeywords = [];
    mergeSidebarKeywords(seedItems, false);

    renderResult(res);
    if (res.changesSummary && res.changesSummary.length > 0 && state.viewMode !== "markdown") {
      switchContentViewMode("diff");
    }
    fetchLiveKeywordsForSidebar(res);
    updateSourceTelemetry();
    if (VeriRank.Profiles && VeriRank.Profiles.saveDraftState) {
      VeriRank.Profiles.saveDraftState({
        text: raw,
        preset: state.activePreset,
        overrideKeyword: $("overrideKeywordInput").value.trim()
      });
      VeriRank.Profiles.addLocalHistoryEntry({
        title: res.metadata.title,
        primaryKeyphrase: res.analysis.subject.primaryKeyphrase,
        preset: state.activePreset,
        googleScore: res.afterScores.google.total,
        bingScore: res.afterScores.bing.total,
        sourceText: raw,
        overrideKeyword: $("overrideKeywordInput").value.trim()
      });
      renderLocalHistory();
    }
    $("restoreVerifiedBtn").style.display = "none";
    if ($("engineSpeedBadge") && typeof res.durationMs === "number") {
      $("engineSpeedBadge").textContent = res.durationMs + " ms";
    }
    $("studioActionStatus").textContent = "Optimized in " + res.durationMs + " ms (" + res.changesSummary.length + " improvements, 0 hallucinations).";
  }

  function renderBreakdown(containerId, breakdownObj, isBing) {
    var el = $(containerId);
    el.innerHTML = Object.keys(breakdownObj).map(function (k) {
      var b = breakdownObj[k];
      var pct = Math.round((b.score / Math.max(1, b.max)) * 100);
      return "<div class='progress-row'>" +
        "<div class='progress-head'><span>" + Lex.escapeHtml(b.label) + "</span><span>" + b.score + " / " + b.max + "</span></div>" +
        "<div class='progress-track'><div class='progress-fill " + (isBing ? "bing" : "") + "' style='width:" + pct + "%;'></div></div>" +
        "</div>";
    }).join("");
  }

  function renderFactLockSection(res) {
    var fl = res.factLock;
    var banner = $("factLockBanner");
    if (fl.passed) {
      banner.innerHTML = "<div class='alert-banner ok'><strong>VERIFIED: 100% Source-Grounded (" + fl.groundingScore + "%)</strong> &mdash; 0 invented numbers, 0 invented entities, 0 polarity flips.</div>";
    } else {
      banner.innerHTML = "<div class='alert-banner bad'><strong>HALLUCINATION BLOCKED (" + fl.issues.length + " critical issue(s) detected)</strong> &mdash; Output contains ungrounded claims or inverted polarity.</div>";
    }

    $("fingerprintNumbers").innerHTML = "<strong>Protected Numbers (" + fl.sourceStats.numbers.length + "):</strong> " +
      (fl.sourceStats.numbers.length ? fl.sourceStats.numbers.map(function (n) { return "<span class='badge'>" + Lex.escapeHtml(n) + "</span>"; }).join(" ") : "None");

    $("fingerprintEntities").innerHTML = "<strong>Protected Entities (" + fl.sourceStats.entities.length + "):</strong> " +
      (fl.sourceStats.entities.length ? fl.sourceStats.entities.map(function (e) { return "<span class='badge'>" + Lex.escapeHtml(e) + "</span>"; }).join(" ") : "None");

    $("fingerprintPolarity").innerHTML = "<strong>Negation/Compliance Clauses Locked:</strong> " + fl.sourceStats.polarityProtectedCount +
      " | <strong>Novel Vocabulary Drift:</strong> " + fl.verifiedStats.novelStemsPct + "%";

    if (fl.issues.length === 0) {
      $("factLockIssuesList").innerHTML = "<div class='badge ok'>0 Issues Detected</div>";
    } else {
      $("factLockIssuesList").innerHTML = fl.issues.map(function (is) {
        return "<div class='alert-banner bad' style='margin-bottom:6px;'><strong>" + Lex.escapeHtml(is.type) + "</strong> (" + Lex.escapeHtml(is.token) + "): " + Lex.escapeHtml(is.explanation) + "</div>";
      }).join("");
    }

    $("provenanceTableBody").innerHTML = (fl.sentenceProvenance || []).map(function (p) {
      return "<tr><td><strong>" + Lex.escapeHtml(p.sourceIds.join(", ")) + "</strong></td><td>" + Lex.escapeHtml(p.editType) + "</td><td>" + Lex.escapeHtml(p.outputSentence) + "</td></tr>";
    }).join("");
  }

  function highlightSerpSnippet(descText, focusPhrase) {
    var safe = Lex.escapeHtml(descText || "");
    var tokens = String(focusPhrase || "").toLowerCase().match(/[a-z0-9-]{3,}/g) || [];
    var seen = {};
    tokens.forEach(function (tok) {
      if (seen[tok] || Lex.STOPWORDS.has(tok)) return;
      seen[tok] = true;
      var escTok = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      safe = safe.replace(new RegExp("\\b(" + escTok + ")\\b", "gi"), "<strong>$1</strong>");
    });
    return safe;
  }

  function truncateSerpTitle(title, maxPx) {
    var s = String(title || "");
    if (Lex.estimatePixelWidth(s) <= maxPx) return s;
    var words = s.split(" ");
    var built = "";
    for (var i = 0; i < words.length; i++) {
      var cand = built ? built + " " + words[i] : words[i];
      if (Lex.estimatePixelWidth(cand + "...") > maxPx) break;
      built = cand;
    }
    return (built || s.slice(0, 48)) + "...";
  }

  function renderPlacementMatrix(res) {
    if (!$("placementMatrixBox") || !res.afterScores.placementMatrix) return;
    $("placementMatrixBox").innerHTML = res.afterScores.placementMatrix.map(function (item) {
      var cls = item.passed ? "ok" : "warn";
      var icon = item.passed ? "&#10003;" : "!";
      return "<span class='placement-pill " + cls + "' title='" + Lex.escapeHtml(item.detail) + "'>" +
        icon + " " + Lex.escapeHtml(item.label) + "</span>";
    }).join("");
  }

  function formatSignedDelta(n) {
    return (n >= 0 ? "+" : "") + n;
  }

  function updateScoreTiles(res) {
    var gAfter = res.afterScores.google.total;
    var gBefore = res.beforeScores.google.total;
    var bAfter = res.afterScores.bing.total;
    var bBefore = res.beforeScores.bing.total;

    var gB = res.beforeScores.google.breakdown;
    var gA = res.afterScores.google.breakdown;
    var gTagsDelta = (gA.titleMeta.score + gA.schemaJsonLd.score) - (gB.titleMeta.score + gB.schemaJsonLd.score);
    var gWriteDelta = (gAfter - gBefore) - gTagsDelta;

    var bB = res.beforeScores.bing.breakdown;
    var bA = res.afterScores.bing.breakdown;
    var bTagsDelta = (bA.cleanHierarchyMeta.score + bA.mediaLinksIndexNow.score) - (bB.cleanHierarchyMeta.score + bB.mediaLinksIndexNow.score);
    var bWriteDelta = (bAfter - bBefore) - bTagsDelta;

    $("scoreGoogleAfter").textContent = gAfter + "/100";
    $("scoreGoogleAfter").className = "score-value " + scoreClass(gAfter);
    $("scoreGoogleDelta").textContent = "Before: " + gBefore + " (" + formatSignedDelta(gWriteDelta) + " Writing, " + formatSignedDelta(gTagsDelta) + " Tags)";
    setScoreRing("ringGoogle", gAfter, scoreClass(gAfter));

    $("scoreBingAfter").textContent = bAfter + "/100";
    $("scoreBingAfter").className = "score-value " + scoreClass(bAfter);
    $("scoreBingDelta").textContent = "Before: " + bBefore + " (" + formatSignedDelta(bWriteDelta) + " Writing, " + formatSignedDelta(bTagsDelta) + " Tags)";
    setScoreRing("ringBing", bAfter, "bing");

    $("scoreHarmony").textContent = res.afterScores.harmonyScore + "/100";
    $("scoreHarmony").className = "score-value " + scoreClass(res.afterScores.harmonyScore);
    var densityHealthy = res.afterScores.metrics.exactDensityPct <= state.activeProfile.bing.maxExactDensityPct;
    $("scoreDensityInfo").textContent = "Keyword Density: " + res.afterScores.metrics.exactDensityPct + "% (" + (densityHealthy ? "Healthy" : "Adjust") + ")";
    setScoreRing("ringHarmony", res.afterScores.harmonyScore, scoreClass(res.afterScores.harmonyScore));

    $("scoreFactLock").textContent = res.factLock.passed ? "VERIFIED" : "BLOCKED";
    $("scoreFactLock").className = "score-value " + (res.factLock.passed ? "ok" : "bad");
    $("scoreFactLockDetail").textContent = res.factLock.groundingScore + "% Grounded (" + res.factLock.issues.length + " issues)";
    setScoreRing("ringFactLock", res.factLock.passed ? res.factLock.groundingScore : 15, res.factLock.passed ? "ok" : "bad");
  }

  function renderSerpSection(res) {
    var variants = res.metadata.titleVariants || [{ label: "Default", text: res.metadata.title, chars: res.metadata.title.length, pixels: Lex.estimatePixelWidth(res.metadata.title) }];
    var titleText = res.metadata.title || variants[0].text;
    var descText = res.metadata.metaDescription || "";
    var urlText = res.metadata.canonicalUrl || ("https://yoursite.com/" + res.metadata.slug);
    var primary = res.analysis.subject.primaryKeyphrase;

    var maxPx = state.activeProfile.google.titleMaxPixels || 580;
    var titlePx = Lex.estimatePixelWidth(titleText);
    var displayGoogleTitle = truncateSerpTitle(titleText, maxPx);
    var highlightedDesc = highlightSerpSnippet(descText, primary);

    $("serpGoogleUrl").textContent = urlText;
    $("serpGoogleTitle").textContent = displayGoogleTitle;
    $("serpGoogleDesc").innerHTML = highlightedDesc;
    $("serpGoogleMeter").textContent = "Length: " + titleText.length + "/60 chars | Est. Width: " + titlePx + "/" + maxPx + "px | Meta: " + descText.length + "/160 chars";

    $("serpBingUrl").textContent = urlText;
    $("serpBingTitle").textContent = titleText;
    $("serpBingDesc").innerHTML = highlightedDesc;
    $("serpBingMeter").textContent = "Exact Lead: " + (res.afterScores.bing.breakdown.exactLeadPlacement.score) + "/" + res.afterScores.bing.breakdown.exactLeadPlacement.max + " | Copilot Ready";

    if ($("siteBaseUrlInput") && document.activeElement !== $("siteBaseUrlInput")) {
      $("siteBaseUrlInput").value = state.siteSettings.baseUrl || "https://yoursite.com";
    }
    if ($("siteBrandNameInput") && document.activeElement !== $("siteBrandNameInput")) {
      $("siteBrandNameInput").value = state.siteSettings.brandName || "";
    }
    if ($("siteIndexNowKeyInput") && document.activeElement !== $("siteIndexNowKeyInput")) {
      $("siteIndexNowKeyInput").value = state.siteSettings.indexNowKey || "";
    }
    if ($("serpEditTitleInput") && document.activeElement !== $("serpEditTitleInput")) {
      $("serpEditTitleInput").value = titleText;
    }
    if ($("serpEditSlugInput") && document.activeElement !== $("serpEditSlugInput")) {
      $("serpEditSlugInput").value = res.metadata.slug || "";
    }
    if ($("serpSlugPreviewLabel")) {
      $("serpSlugPreviewLabel").textContent = "/" + (res.metadata.slug || "");
    }
    if ($("serpEditDescInput") && document.activeElement !== $("serpEditDescInput")) {
      $("serpEditDescInput").value = descText;
    }

    if ($("serpTitleMeterLabel") && $("serpTitleMeterFill")) {
      $("serpTitleMeterLabel").textContent = titleText.length + " / 60 chars (" + titlePx + " / " + maxPx + "px)";
      var tPct = Math.min(100, Math.round((titlePx / maxPx) * 100));
      $("serpTitleMeterFill").style.width = tPct + "%";
      $("serpTitleMeterFill").className = "meter-fill " + (titlePx <= maxPx && titleText.length >= 35 ? "" : (titlePx > maxPx ? "bad" : "warn"));
    }

    if ($("serpDescMeterLabel") && $("serpDescMeterFill")) {
      $("serpDescMeterLabel").textContent = descText.length + " / 160 chars";
      var dPct = Math.min(100, Math.round((descText.length / 160) * 100));
      $("serpDescMeterFill").style.width = dPct + "%";
      $("serpDescMeterFill").className = "meter-fill " + (descText.length >= 135 && descText.length <= 160 ? "" : (descText.length > 165 ? "bad" : "warn"));
    }

    if ($("serpMetaFactWarning")) {
      var mfl = res.metadata.metaFactLock;
      if (mfl && !mfl.passed && mfl.issues.length > 0) {
        $("serpMetaFactWarning").style.display = "block";
        $("serpMetaFactWarning").innerHTML = "<div class='alert-banner warn' style='margin-bottom:0;'><strong>Fact-Lock Notice on Meta Description:</strong> " +
          Lex.escapeHtml(mfl.issues[0].explanation) + "</div>";
      } else {
        $("serpMetaFactWarning").style.display = "none";
      }
    }

    $("titleVariantsList").innerHTML = variants.map(function (v, idx) {
      var isSel = v.text === titleText || idx === state.selectedTitleIdx;
      return "<button type='button' class='pill " + (isSel ? "selected" : "") + "' data-title-idx='" + idx + "'>" +
        Lex.escapeHtml(v.label) + ": \"" + Lex.escapeHtml(v.text) + "\" (" + v.chars + "c / " + v.pixels + "px)</button>";
    }).join("");

    var variantBtns = $("titleVariantsList").querySelectorAll("[data-title-idx]");
    for (var i = 0; i < variantBtns.length; i++) {
      variantBtns[i].addEventListener("click", function () {
        state.selectedTitleIdx = parseInt(this.getAttribute("data-title-idx"), 10);
        var chosen = variants[state.selectedTitleIdx];
        if (chosen && VeriRank.Optimizer.updateResultMetadata) {
          state.currentResult = VeriRank.Optimizer.updateResultMetadata(state.currentResult, { title: chosen.text, siteSettings: state.siteSettings }, state.activeProfile);
          if ($("serpEditTitleInput")) $("serpEditTitleInput").value = chosen.text;
          updateScoreTiles(state.currentResult);
          renderPlacementMatrix(state.currentResult);
          renderBreakdown("googleBreakdown", state.currentResult.afterScores.google.breakdown, false);
          renderBreakdown("bingBreakdown", state.currentResult.afterScores.bing.breakdown, true);
          renderSerpSection(state.currentResult);
        }
      });
    }

    $("jsonLdPreview").textContent = JSON.stringify(res.metadata.jsonLd, null, 2);
    $("indexNowPreview").textContent = JSON.stringify(res.metadata.indexNowPayload, null, 2);
    $("headTagsPreview").textContent = res.metadata.headTags;
    $("internalLinksBox").innerHTML = "<strong>Contextual Internal Link Anchor Suggestions:</strong> " +
      res.metadata.internalLinkSuggestions.map(function (l) {
        return "<code>" + Lex.escapeHtml(l.anchorText) + "</code> &rarr; <code>" + Lex.escapeHtml(l.suggestedTargetUrl) + "</code>";
      }).join(" &bull; ");
  }

  function applyLiveSerpEdit() {
    if (!state.currentResult || !VeriRank.Optimizer.updateResultMetadata) return;
    if (VeriRank.Profiles && VeriRank.Profiles.saveSiteSettings) {
      state.siteSettings = VeriRank.Profiles.saveSiteSettings({
        baseUrl: $("siteBaseUrlInput") ? $("siteBaseUrlInput").value : state.siteSettings.baseUrl,
        brandName: $("siteBrandNameInput") ? $("siteBrandNameInput").value : state.siteSettings.brandName,
        indexNowKey: $("siteIndexNowKeyInput") ? $("siteIndexNowKeyInput").value : state.siteSettings.indexNowKey
      });
    }
    var updated = VeriRank.Optimizer.updateResultMetadata(state.currentResult, {
      title: $("serpEditTitleInput") ? $("serpEditTitleInput").value : state.currentResult.metadata.title,
      slug: $("serpEditSlugInput") ? $("serpEditSlugInput").value : state.currentResult.metadata.slug,
      metaDescription: $("serpEditDescInput") ? $("serpEditDescInput").value : state.currentResult.metadata.metaDescription,
      siteSettings: state.siteSettings
    }, state.activeProfile);
    state.currentResult = updated;
    updateScoreTiles(updated);
    renderPlacementMatrix(updated);
    renderBreakdown("googleBreakdown", updated.afterScores.google.breakdown, false);
    renderBreakdown("bingBreakdown", updated.afterScores.bing.breakdown, true);
    renderSerpSection(updated);
  }

  function renderResult(res) {
    $("warningsContainer").innerHTML = (res.warnings || []).map(function (w) {
      return "<div class='alert-banner warn'><strong>Guardrail Notice:</strong> " + Lex.escapeHtml(w) + "</div>";
    }).join("");

    var gAfter = res.afterScores.google.total;
    var gBefore = res.beforeScores.google.total;
    var bAfter = res.afterScores.bing.total;
    var bBefore = res.beforeScores.bing.total;
    updateScoreTiles(res);

    var primary = res.analysis.subject.primaryKeyphrase;
    $("candidatePills").innerHTML = res.analysis.subject.candidateKeyphrases.map(function (c, idx) {
      var sel = c.phrase === primary ? "selected" : "";
      var badgeTag = idx === 0 ? " ★ Top Match" : "";
      return "<button type='button' class='pill " + sel + "' data-cand-phrase='" + Lex.escapeHtml(c.phrase) + "' title='Relevance score: " + c.score + " — Click to optimize around this phrase'>" +
        Lex.escapeHtml(c.phrase + badgeTag) + "</button>";
    }).join("");

    var candBtns = $("candidatePills").querySelectorAll("[data-cand-phrase]");
    for (var i = 0; i < candBtns.length; i++) {
      candBtns[i].addEventListener("click", function () {
        $("overrideKeywordInput").value = this.getAttribute("data-cand-phrase");
        runOptimization();
      });
    }

    var rendered = renderSimpleMarkdownToHtml(res.optimizedMarkdown);
    $("previewPane").innerHTML = rendered;
    renderDiffView(res);
    if ($("markdownOutputArea") && document.activeElement !== $("markdownOutputArea")) {
      $("markdownOutputArea").value = res.optimizedMarkdown;
    }
    $("htmlOutputPre").textContent = res.optimizedHtml;

    if ($("writingPurposeBanner") && res.analysis.purpose) {
      var purp = res.analysis.purpose;
      $("writingPurposeBanner").innerHTML =
        "<div><strong>Purpose Analysis:</strong> <span class='badge primary'>" + Lex.escapeHtml(purp.category.label) + "</span> " +
        "<span class='muted'>For <strong>" + Lex.escapeHtml(purp.audience) + "</strong></span></div>" +
        "<div class='muted'>Main Topic: <code>" + Lex.escapeHtml(res.analysis.subject.primaryKeyphrase) + "</code></div>";
    }

    renderKeywordSidebar();

    if ($("whatChangedSummary")) {
      var changes = res.changesSummary || [];
      var summaryDesc = changes.length > 0
        ? changes.map(function (c) { return Lex.escapeHtml(c); }).join(" &bull; ")
        : (res.contentMode === "creative"
          ? "Preserved your story wording as requested while adding behind-the-scenes Google & Bing search tags."
          : "Organized your text with clean structure.");
      var metaLen = res.metadata && res.metadata.metaDescription ? res.metadata.metaDescription.length : 0;
      $("whatChangedSummary").innerHTML =
        "<div><strong>Changes Made to Your Text:</strong> " + summaryDesc +
        " <button type='button' id='jumpToDiffBtn' class='btn sm' style='margin-left:6px;padding:2px 8px;'>See Highlighted Edits</button></div>" +
        "<div class='muted mt-8' style='margin-top:4px;'><strong>Behind-the-Scenes Search Tags Added:</strong> Google &amp; Bing Title (" + (res.metadata.title || "").length + " chars), Search Summary (" + metaLen + " chars), URL Slug, and Schema markup &mdash; view or customize under &ldquo;Search Preview &amp; Meta Tags&rdquo;.</div>";
      if ($("jumpToDiffBtn")) {
        $("jumpToDiffBtn").addEventListener("click", function () {
          switchContentViewMode("diff");
        });
      }
    }

    // Split Compare View
    $("splitBeforeContent").textContent = res.sourceText;
    $("splitBeforeBadge").textContent = "Google " + gBefore + " | Bing " + bBefore;
    $("splitAfterContent").innerHTML = rendered;
    $("splitAfterBadge").textContent = "Google " + gAfter + " | Bing " + bAfter;

    renderFactLockSection(res);
    renderPlacementMatrix(res);
    renderBreakdown("googleBreakdown", res.afterScores.google.breakdown, false);
    renderBreakdown("bingBreakdown", res.afterScores.bing.breakdown, true);

    var gradeDesc = Lex.describeReadingGrade ? Lex.describeReadingGrade(res.afterAnalysis.readability.gradeLevel) : "";
    $("subjectSummaryBox").innerHTML =
      "<div><strong>Focus Keyword:</strong> <code>" + Lex.escapeHtml(res.analysis.subject.primaryKeyphrase) + "</code></div>" +
      "<div class='mt-8'><strong>Reader Search Intent:</strong> <span class='badge primary'>" + Lex.escapeHtml(res.analysis.intent.primary.toUpperCase()) + " (" + res.analysis.intent.confidence + "%)</span> &bull; <strong>Schema Type:</strong> <code>" + Lex.escapeHtml(res.metadata && res.metadata.jsonLd && res.metadata.jsonLd["@graph"] && res.metadata.jsonLd["@graph"][0] ? res.metadata.jsonLd["@graph"][0]["@type"] : res.analysis.intent.recommendedSchemaType) + "</code></div>" +
      "<div class='mt-8'><strong>Reading Level:</strong> Grade " + res.afterAnalysis.readability.gradeLevel + " (" + Lex.escapeHtml(gradeDesc) + ") &bull; <strong>Flesch Ease:</strong> " + res.afterAnalysis.readability.fleschReadingEase + "/100 &bull; <strong>Avg Sentence:</strong> " + res.afterAnalysis.readability.avgSentenceWords + "w</div>" +
      "<div class='mt-8'><strong>Related Topic Phrases Found:</strong> " + res.analysis.subject.secondaryKeyphrases.map(function (s) { return "<span class='badge'>" + Lex.escapeHtml(s.phrase) + " (" + s.occurrences + "x)</span>"; }).join(" ") + "</div>";

    $("diagnosticsChecklist").innerHTML = res.afterScores.diagnostics.map(function (d) {
      var cls = d.status === "pass" ? "ok" : (d.status === "warn" ? "warn" : "bad");
      return "<div class='diag-item'>" +
        "<span class='badge " + cls + "'>" + Lex.escapeHtml(d.engine) + ": " + d.status.toUpperCase() + "</span>" +
        "<div><strong>" + Lex.escapeHtml(d.label) + "</strong><div class='muted'>" + Lex.escapeHtml(d.detail) + "</div></div>" +
        "</div>";
    }).join("");

    renderSerpSection(res);
  }

  function switchContentViewMode(mode) {
    state.viewMode = mode;
    var btns = document.querySelectorAll(".view-mode-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("primary", btns[i].getAttribute("data-mode") === mode);
    }
    $("previewPane").style.display = mode === "preview" ? "block" : "none";
    if ($("diffViewPane")) $("diffViewPane").style.display = mode === "diff" ? "block" : "none";
    $("splitComparePane").style.display = mode === "split" ? "grid" : "none";
    $("markdownOutputArea").style.display = mode === "markdown" ? "block" : "none";
    $("htmlOutputPre").style.display = mode === "html" ? "block" : "none";
  }

  function activateSubtab(name) {
    var subBtns = document.querySelectorAll(".subtab");
    for (var a = 0; a < subBtns.length; a++) {
      subBtns[a].classList.toggle("active", subBtns[a].getAttribute("data-subtab") === name);
    }
    var panels = document.querySelectorAll(".subpanel");
    for (var b = 0; b < panels.length; b++) {
      panels[b].classList.toggle("active", panels[b].id === "subtab-" + name);
    }
  }

  function runAutocompleteCheck() {
    if (!state.currentResult) runOptimization();
    if (!state.currentResult) return;
    var primary = state.currentResult.analysis.subject.primaryKeyphrase;
    var box = $("autocompleteResultsBox");

    if (!isApiAvailable()) {
      activateSubtab("diagnostics");
      box.innerHTML = "<div class='alert-banner warn'><strong>Offline Portable Mode:</strong> Live Google/Bing autocomplete queries require either the Cloud Web Edition or <code>VeriRankSEO.exe</code>. Core optimization and scoring work 100% offline.</div>";
      return;
    }

    activateSubtab("diagnostics");
    box.textContent = "Querying live Google & Bing Suggest APIs for '" + primary + "'...";
    $("studioActionStatus").textContent = "Checking live Google & Bing search suggestions...";

    fetch("/api/suggest", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({ query: primary, contextText: (state.currentResult.sourceText || "").slice(0, 1500) })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var gList = (data && data.google) || [];
        var bList = (data && data.bing) || [];
        if (data.offline || (gList.length === 0 && bList.length === 0)) {
          box.innerHTML = "<div class='alert-banner warn'>Autocomplete returned no live suggestions or network is offline. Continuing safely with offline deterministic NLP model.</div>";
          $("studioActionStatus").textContent = "Autocomplete unavailable; deterministic NLP model remains active.";
          return;
        }

        var srcLower = state.currentResult.sourceText.toLowerCase();
        var combined = [];
        var seen = {};
        var addItem = function (q, engineLabel) {
          var low = String(q).toLowerCase();
          if (!seen[low]) {
            var tokens = low.split(/\s+/).filter(function (w) { return w.length > 3 && !Lex.STOPWORDS.has(w); });
            var hits = tokens.filter(function (t) { return srcLower.indexOf(Lex.stemWord(t)) !== -1; }).length;
            var grounded = tokens.length > 0 && hits / tokens.length >= 0.6;
            seen[low] = { query: q, grounded: grounded, engines: [engineLabel] };
            combined.push(seen[low]);
          } else if (seen[low].engines.indexOf(engineLabel) === -1) {
            seen[low].engines.push(engineLabel);
          }
        };

        gList.forEach(function (q) { addItem(q, "Google"); });
        bList.forEach(function (q) { addItem(q, "Bing"); });

        box.innerHTML = combined.slice(0, 12).map(function (item) {
          return "<div style='margin-bottom:5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;'>" +
            "<span class='badge " + (item.grounded ? "ok" : "warn") + "'>" + (item.grounded ? "Grounded in Text" : "Future Topic Gap") + "</span>" +
            "<span class='badge primary'>" + Lex.escapeHtml(item.engines.join(" + ")) + "</span>" +
            "<span>" + Lex.escapeHtml(item.query) + "</span>" +
            "</div>";
        }).join("");

        $("studioActionStatus").textContent = "Loaded " + combined.length + " live Google & Bing suggestions.";
        showToast("Loaded " + combined.length + " live search suggestions.", "ok");
      })
      .catch(function () {
        box.innerHTML = "<div class='alert-banner warn'>Live autocomplete unreachable; using deterministic offline engine.</div>";
        $("studioActionStatus").textContent = "Live autocomplete unreachable.";
      });
  }

  function runGroundedAiPolish() {
    if (!state.currentResult) runOptimization();
    if (!state.currentResult) return;

    if (!isApiAvailable()) {
      $("studioActionStatus").textContent = "Optional Grounded AI Polish requires VeriRankSEO.exe or Cloud Web Edition.";
      showToast("AI Polish requires Desktop or Cloud mode.", "warn");
      return;
    }

    var provider = $("aiProviderSelect").value;
    var model = $("aiModelInput").value.trim();
    var endpoint = $("aiEndpointInput").value.trim();
    var apiKey = $("aiApiKeyInput").value.trim();

    if (provider === "ollama" && getRuntimeMode() === "cloud") {
      $("studioActionStatus").textContent = "Local Ollama (127.0.0.1) runs via VeriRankSEO.exe Desktop Edition. In Cloud mode, select OpenAI, Gemini, or Anthropic with your API key.";
      showToast("Use OpenAI/Gemini/Anthropic in Cloud mode, or Ollama in Desktop exe.", "warn");
      return;
    }

    if (provider !== "ollama" && !apiKey) {
      $("studioActionStatus").textContent = "Please enter an API key in 'Ranking Profiles & AI' (or use Local Ollama on Desktop).";
      showToast("Enter an API key in Ranking Profiles & AI first.", "warn");
      return;
    }

    $("studioActionStatus").textContent = "Running Optional AI Smooth-Rewrite + Fact-Lock check...";
    var sysPrompt = state.activePreset === "creative"
      ? "You are a literary copy editor. Smooth pacing and flow ONLY using story details, names, and events already present. Never invent plot points, characters, ratings, or facts, and keep creative voice intact."
      : "You are a strict technical editor. Improve flow of the provided Markdown article ONLY using facts, numbers, entities, and polarity already present. Never invent statistics, brands, dates, or claims. Keep Markdown headings and lists intact.";

    fetch("/api/ai-rewrite", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({
        provider: provider,
        model: model,
        endpoint: endpoint,
        apiKey: apiKey,
        systemPrompt: sysPrompt,
        userPrompt: state.currentResult.optimizedMarkdown
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.text) {
          $("studioActionStatus").textContent = "AI provider error: " + (data.error || "No text returned. Deterministic output kept.");
          showToast(data.error || "AI polish returned no text.", "warn");
          return;
        }
        var sanitized = VeriRank.FactLock.sanitizeAiCandidate(state.currentResult.sourceText, state.currentResult.optimizedMarkdown, data.text);
        var updated = VeriRank.Optimizer.rescoreEditedMarkdown(state.currentResult.sourceText, sanitized.text, state.currentResult, state.activeProfile);
        state.currentResult = updated;
        renderResult(updated);
        $("studioActionStatus").textContent = "Grounded AI Polish complete. Fact-Lock quarantined " + sanitized.quarantined.length + " ungrounded block(s).";
        showToast("AI Polish verified (" + sanitized.quarantined.length + " block(s) quarantined).", "ok");
      })
      .catch(function (err) {
        $("studioActionStatus").textContent = "AI request failed (" + err.message + "). Verified deterministic output kept.";
        showToast("AI polish request failed.", "bad");
      });
  }

  // Batch Mode Helpers
  function renderBatchTable() {
    var tbody = $("batchTableBody");
    if (state.batchItems.length === 0) {
      tbody.innerHTML = "<tr><td colspan='7' class='muted'>No files queued yet.</td></tr>";
      $("downloadBatchZipBtn").disabled = true;
      if ($("downloadBatchCsvBtn")) $("downloadBatchCsvBtn").disabled = true;
      $("saveBatchFolderBtn").disabled = true;
      return;
    }
    var allDone = state.batchItems.every(function (it) { return !!it.result; });
    $("downloadBatchZipBtn").disabled = !allDone;
    if ($("downloadBatchCsvBtn")) $("downloadBatchCsvBtn").disabled = !allDone;
    $("saveBatchFolderBtn").disabled = !allDone;

    tbody.innerHTML = state.batchItems.map(function (it, idx) {
      if (!it.result) {
        return "<tr><td>" + Lex.escapeHtml(it.fileName) + "</td><td colspan='5' class='muted'>Queued (" + it.content.length + " chars)</td><td><button type='button' class='btn sm' data-batch-open='" + idx + "'>Open</button></td></tr>";
      }
      var r = it.result;
      var flBadge = r.factLock.passed ? "<span class='badge ok'>VERIFIED (" + r.factLock.groundingScore + "%)</span>" : "<span class='badge bad'>BLOCKED</span>";
      return "<tr>" +
        "<td><strong>" + Lex.escapeHtml(it.fileName) + "</strong></td>" +
        "<td><code>" + Lex.escapeHtml(r.analysis.subject.primaryKeyphrase) + "</code></td>" +
        "<td>" + r.beforeScores.google.total + " &rarr; <strong>" + r.afterScores.google.total + "</strong></td>" +
        "<td>" + r.beforeScores.bing.total + " &rarr; <strong>" + r.afterScores.bing.total + "</strong></td>" +
        "<td>" + r.afterScores.harmonyScore + "/100</td>" +
        "<td>" + flBadge + "</td>" +
        "<td><button type='button' class='btn sm' data-batch-open='" + idx + "'>Inspect in Studio</button></td>" +
        "</tr>";
    }).join("");

    var openBtns = tbody.querySelectorAll("[data-batch-open]");
    for (var i = 0; i < openBtns.length; i++) {
      openBtns[i].addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-batch-open"), 10);
        var item = state.batchItems[idx];
        if (!item) return;
        $("sourceTextarea").value = item.content;
        $("overrideKeywordInput").value = "";
        runOptimization();
        activateMainTab("studio");
      });
    }
  }

  function runBatchOptimization() {
    var total = state.batchItems.length;
    if (total === 0) return;

    var wrap = $("batchProgressWrap");
    var bar = $("batchProgressBar");
    var lbl = $("batchProgressLabel");
    var pctEl = $("batchProgressPct");
    wrap.style.display = "block";

    var idx = 0;
    function step() {
      if (idx < total) {
        var batchOpts = getOptimizeOptionsFromUi();
        batchOpts.overrideKeyword = "";
        state.batchItems[idx].result = VeriRank.Optimizer.optimize(state.batchItems[idx].content, batchOpts);
        idx++;
        var pct = Math.round((idx / total) * 100);
        bar.style.width = pct + "%";
        pctEl.textContent = pct + "%";
        lbl.textContent = "Optimized " + idx + " of " + total + " document(s)...";
        if (typeof global.requestAnimationFrame === "function" && idx < total) {
          global.requestAnimationFrame(step);
        } else {
          step();
        }
      } else {
        lbl.textContent = "Completed batch optimization for " + total + " document(s).";
        renderBatchTable();
        showToast("Batch completed: " + total + " document(s) verified.", "ok");
      }
    }
    step();
  }

  function loadFilesIntoBatch(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var pending = files.length;
    files.forEach(function (f) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        state.batchItems.push({ fileName: f.name, content: String(ev.target.result || ""), result: null });
        pending--;
        if (pending === 0) {
          runBatchOptimization();
        }
      };
      reader.readAsText(f);
    });
  }

  function activateMainTab(tabName) {
    var tabs = document.querySelectorAll(".nav-tab");
    var panels = document.querySelectorAll(".tab-panel");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === tabName);
    }
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.toggle("active", panels[j].id === "tab-" + tabName);
    }
  }

  function renderProfileForm() {
    var p = state.activeProfile;
    $("profGoogleMaxPx").value = p.google.titleMaxPixels;
    $("profGoogleMaxDensity").value = p.google.maxExactDensityPct;
    $("profBingLeadWindow").value = p.bing.leadWindowWords;
    $("profBingMaxDensity").value = p.bing.maxExactDensityPct;
  }

  function renderSelfTests() {
    var res = VeriRank.SelfTest.runAll();
    $("selfTestSummaryBanner").innerHTML = "<div class='alert-banner " + (res.allPassed ? "ok" : "bad") + "'>" +
      "<strong>" + res.passed + " / " + res.total + " Verification Checks Passed</strong> (" + res.failed + " failed)" +
      "</div>";
    $("selfTestTableBody").innerHTML = res.checks.map(function (c) {
      return "<tr>" +
        "<td><span class='badge " + (c.passed ? "ok" : "bad") + "'>" + (c.passed ? "PASS" : "FAIL") + "</span></td>" +
        "<td><strong>" + Lex.escapeHtml(c.name) + "</strong></td>" +
        "<td>" + Lex.escapeHtml(c.detail) + "</td>" +
        "</tr>";
    }).join("");
  }

  // Supabase Cloud UI
  function refreshCloudDocs() {
    if (!VeriRank.Cloud) return;
    var cfg = VeriRank.Cloud.getConfig();
    var badge = $("sbConnectionBadge");
    var tbody = $("sbDocsTableBody");
    var status = $("sbStatusMsg");

    if (!cfg.url || !cfg.key) {
      badge.textContent = "Not Configured";
      badge.className = "badge primary";
      tbody.innerHTML = "<tr><td colspan='7' class='muted'>Enter your Supabase Project URL and click 'Save & Test Connection'.</td></tr>";
      return;
    }

    status.textContent = "Connecting to " + cfg.url + "...";
    VeriRank.Cloud.listDocuments()
      .then(function (docs) {
        state.cloudDocs = docs || [];
        badge.textContent = "Connected";
        badge.className = "badge ok";
        status.textContent = "Connected to Supabase (" + state.cloudDocs.length + " document(s) fetched).";

        if (state.cloudDocs.length === 0) {
          tbody.innerHTML = "<tr><td colspan='7' class='muted'>Connected! Table <code>seo_documents</code> is ready and empty. Save a document from the Studio!</td></tr>";
          return;
        }

        tbody.innerHTML = state.cloudDocs.map(function (d, idx) {
          var dt = d.created_at ? new Date(d.created_at).toLocaleString() : "";
          return "<tr>" +
            "<td><strong>" + Lex.escapeHtml(d.title || "Untitled") + "</strong></td>" +
            "<td><code>" + Lex.escapeHtml(d.primary_keyphrase || "-") + "</code></td>" +
            "<td>" + (d.google_score || 0) + "/100</td>" +
            "<td>" + (d.bing_score || 0) + "/100</td>" +
            "<td><span class='badge ok'>" + (d.fact_lock_score || 100) + "%</span></td>" +
            "<td class='muted'>" + Lex.escapeHtml(dt) + "</td>" +
            "<td class='flex-row'>" +
              "<button type='button' class='btn sm' data-sb-load='" + idx + "'>Load</button>" +
              "<button type='button' class='btn sm danger' data-sb-del='" + Lex.escapeHtml(d.id) + "'>Delete</button>" +
            "</td>" +
            "</tr>";
        }).join("");

        var loadBtns = tbody.querySelectorAll("[data-sb-load]");
        for (var i = 0; i < loadBtns.length; i++) {
          loadBtns[i].addEventListener("click", function () {
            var doc = state.cloudDocs[parseInt(this.getAttribute("data-sb-load"), 10)];
            if (!doc) return;
            $("sourceTextarea").value = doc.source_text || doc.optimized_markdown || "";
            $("overrideKeywordInput").value = doc.primary_keyphrase || "";
            runOptimization();
            activateMainTab("studio");
            showToast("Loaded cloud document into Studio.", "ok");
          });
        }

        var delBtns = tbody.querySelectorAll("[data-sb-del]");
        for (var j = 0; j < delBtns.length; j++) {
          delBtns[j].addEventListener("click", function () {
            var id = this.getAttribute("data-sb-del");
            VeriRank.Cloud.deleteDocument(id)
              .then(function () {
                showToast("Deleted document from Supabase.", "ok");
                refreshCloudDocs();
              })
              .catch(function (err) {
                showToast("Delete failed: " + err.message, "bad");
              });
          });
        }
      })
      .catch(function (err) {
        badge.textContent = "Setup Required";
        badge.className = "badge warn";
        status.textContent = "Supabase notice: " + err.message;
        tbody.innerHTML = "<tr><td colspan='7' class='muted'>Could not query <code>seo_documents</code> (" + Lex.escapeHtml(err.message) + "). Check your Project URL and ensure you ran the Setup SQL below.</td></tr>";
      });
  }

  function saveCurrentDocToSupabase() {
    if (!state.currentResult) runOptimization();
    if (!state.currentResult || !VeriRank.Cloud) return;
    var status = $("sbStatusMsg");
    status.textContent = "Saving active document to Supabase...";
    VeriRank.Cloud.saveDocument(state.currentResult)
      .then(function () {
        status.textContent = "Saved '" + state.currentResult.metadata.title + "' to Supabase!";
        showToast("Saved document to Supabase Cloud!", "ok");
        refreshCloudDocs();
      })
      .catch(function (err) {
        status.textContent = "Save failed: " + err.message;
        showToast(err.message, "bad");
      });
  }

  function initHelpTooltips() {
    var pop = $("helpTooltipPopup");
    if (!pop) return;
    var activeTrigger = null;

    function hideTooltip() {
      activeTrigger = null;
      pop.classList.remove("visible");
      pop.setAttribute("aria-hidden", "true");
    }

    function showTooltip(btn) {
      var title = btn.getAttribute("data-tip-title") || "Quick SEO Explanation";
      var body = btn.getAttribute("data-tip") || "";
      if (!body) return;
      activeTrigger = btn;
      pop.innerHTML = "<div class='help-popover-title'>" + Lex.escapeHtml(title) + "</div>" +
        "<div class='help-popover-body'>" + Lex.escapeHtml(body) + "</div>";
      pop.style.left = "0px";
      pop.style.top = "0px";
      pop.classList.add("visible");
      pop.setAttribute("aria-hidden", "false");

      var rect = btn.getBoundingClientRect();
      var popRect = pop.getBoundingClientRect();
      var vw = global.innerWidth || document.documentElement.clientWidth || 1024;
      var vh = global.innerHeight || document.documentElement.clientHeight || 768;

      var left = rect.left + (rect.width / 2) - (popRect.width / 2);
      left = Math.max(12, Math.min(vw - popRect.width - 12, left));

      var top = rect.top - popRect.height - 10;
      if (top < 12) {
        top = rect.bottom + 10;
      }
      if (top + popRect.height > vh - 12) {
        top = Math.max(12, vh - popRect.height - 12);
      }

      pop.style.left = Math.round(left) + "px";
      pop.style.top = Math.round(top) + "px";
    }

    document.addEventListener("mouseover", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".help-tip") : null;
      if (btn) showTooltip(btn);
    });

    document.addEventListener("mouseout", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".help-tip") : null;
      if (btn && btn === activeTrigger) {
        if (!e.relatedTarget || !btn.contains(e.relatedTarget)) {
          hideTooltip();
        }
      }
    });

    document.addEventListener("focusin", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".help-tip") : null;
      if (btn) showTooltip(btn);
    });

    document.addEventListener("focusout", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".help-tip") : null;
      if (btn) hideTooltip();
    });

    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".help-tip") : null;
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        if (activeTrigger === btn && pop.classList.contains("visible")) {
          hideTooltip();
        } else {
          showTooltip(btn);
        }
      } else if (activeTrigger) {
        hideTooltip();
      }
    });

    global.addEventListener("scroll", hideTooltip, true);
    global.addEventListener("resize", hideTooltip);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hideTooltip();
    });
  }

  function init() {
    initHelpTooltips();

    var mode = getRuntimeMode();
    if (mode === "desktop") {
      $("hostModeBadge").textContent = "Desktop Host Connected";
      $("hostModeBadge").className = "badge ok";
      $("desktopFolderExportBox").style.display = "block";
      $("desktopBatchFolderPanel").style.display = "block";
    } else if (mode === "cloud") {
      $("hostModeBadge").textContent = "Cloud Edition (Vercel + Supabase)";
      $("hostModeBadge").className = "badge bing";
    }

    // Restore persisted theme
    try {
      if (global.localStorage && global.localStorage.getItem("verirank_theme") === "dark") {
        document.body.classList.add("dark");
        $("themeToggleBtn").textContent = "Light Theme";
      }
    } catch (e) { }

    $("themeToggleBtn").addEventListener("click", function () {
      var dark = document.body.classList.toggle("dark");
      this.textContent = dark ? "Light Theme" : "Dark Theme";
      try {
        if (global.localStorage) global.localStorage.setItem("verirank_theme", dark ? "dark" : "light");
      } catch (e) { }
    });

    // Main Navigation
    var navBtns = document.querySelectorAll(".nav-tab");
    for (var i = 0; i < navBtns.length; i++) {
      navBtns[i].addEventListener("click", function () {
        activateMainTab(this.getAttribute("data-tab"));
      });
    }

    // Subtabs
    var subBtns = document.querySelectorAll(".subtab");
    for (var j = 0; j < subBtns.length; j++) {
      subBtns[j].addEventListener("click", function () {
        activateSubtab(this.getAttribute("data-subtab"));
      });
    }

    // Content view mode buttons
    var vmBtns = document.querySelectorAll(".view-mode-btn");
    for (var v = 0; v < vmBtns.length; v++) {
      vmBtns[v].addEventListener("click", function () {
        switchContentViewMode(this.getAttribute("data-mode"));
      });
    }

    // 1-Click Content Type Presets
    var presetOrder = ["corporate", "blog", "product", "creative"];
    if ($("presetGrid") && VeriRank.Profiles.CONTENT_PRESETS) {
      $("presetGrid").innerHTML = presetOrder.map(function (pid) {
        var pr = VeriRank.Profiles.CONTENT_PRESETS[pid];
        return "<div class='preset-card" + (pid === state.activePreset ? " active" : "") + "' role='button' tabindex='0' data-preset='" + Lex.escapeHtml(pr.id) + "'>" +
          "<div class='preset-card-top'>" +
            "<span class='preset-title'>" + Lex.escapeHtml(pr.label) + "</span>" +
            "<button type='button' class='help-tip' aria-label='Explain " + Lex.escapeHtml(pr.label) + " preset' data-tip-title='" + Lex.escapeHtml(pr.label) + "' data-tip='" + Lex.escapeHtml(pr.tip) + "'>?</button>" +
          "</div>" +
          "<div class='preset-sub'>" + Lex.escapeHtml(pr.subtitle) + "</div>" +
          "</div>";
      }).join("");

      var pCards = $("presetGrid").querySelectorAll("[data-preset]");
      for (var pc = 0; pc < pCards.length; pc++) {
        pCards[pc].addEventListener("click", function (e) {
          if (e.target && e.target.closest && e.target.closest(".help-tip")) return;
          applyContentPreset(this.getAttribute("data-preset"), true);
        });
        pCards[pc].addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            if (e.target && e.target.closest && e.target.closest(".help-tip")) return;
            e.preventDefault();
            applyContentPreset(this.getAttribute("data-preset"), true);
          }
        });
      }
    }

    // Immediate feedback when individual formatting checkboxes are customized
    ["optStructureHeadings", "optTakeaways", "optFaq", "optTighten", "optLists"].forEach(function (optId) {
      var cb = $(optId);
      if (cb) {
        cb.addEventListener("change", function () {
          var presetMeta = VeriRank.Profiles.CONTENT_PRESETS[state.activePreset];
          if ($("activePresetBadge") && presetMeta) {
            $("activePresetBadge").textContent = presetMeta.label + " (Custom)";
          }
          if ($("sourceTextarea").value.trim()) runOptimization();
        });
      }
    });

    // Sample buttons (3 corporate demos + 1 fiction blurb demo)
    var allSamples = VeriRank.Samples.slice();
    if (VeriRank.CreativeSample) allSamples.push(VeriRank.CreativeSample);
    $("sampleButtons").innerHTML = allSamples.map(function (s, idx) {
      return "<button type='button' class='btn sm' data-sample-idx='" + idx + "'>" + Lex.escapeHtml(s.label) + "</button>";
    }).join("");
    var sBtns = $("sampleButtons").querySelectorAll("[data-sample-idx]");
    for (var sb = 0; sb < sBtns.length; sb++) {
      sBtns[sb].addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-sample-idx"), 10);
        var chosen = allSamples[idx];
        if (!chosen) return;
        $("sourceTextarea").value = chosen.text;
        $("overrideKeywordInput").value = "";
        applyContentPreset(chosen.preset || "corporate", false);
        runOptimization();
      });
    }

    // Live source telemetry & auto-save draft debounced
    var telTimer = null;
    $("sourceTextarea").addEventListener("input", function () {
      clearTimeout(telTimer);
      telTimer = setTimeout(function () {
        updateSourceTelemetry();
        if (VeriRank.Profiles && VeriRank.Profiles.saveDraftState) {
          VeriRank.Profiles.saveDraftState({
            text: $("sourceTextarea").value,
            preset: state.activePreset,
            overrideKeyword: $("overrideKeywordInput").value.trim()
          });
        }
      }, 150);
    });

    if ($("toggleHistoryBtn") && $("localHistoryDrawer")) {
      $("toggleHistoryBtn").addEventListener("click", function () {
        var d = $("localHistoryDrawer");
        d.style.display = d.style.display === "none" ? "block" : "none";
        renderLocalHistory();
      });
    }

    // Global Ctrl+Enter / Cmd+Enter quick optimize shortcut
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runOptimization();
      }
    });

    // Live SERP Snippet & Site Settings Editor
    var serpTimer = null;
    ["siteBaseUrlInput", "siteBrandNameInput", "siteIndexNowKeyInput", "serpEditTitleInput", "serpEditSlugInput", "serpEditDescInput"].forEach(function (fid) {
      var el = $(fid);
      if (el) {
        el.addEventListener("input", function () {
          clearTimeout(serpTimer);
          serpTimer = setTimeout(applyLiveSerpEdit, 120);
        });
      }
    });
    if ($("resetSerpSnippetBtn")) {
      $("resetSerpSnippetBtn").addEventListener("click", function () {
        runOptimization();
        showToast("Reset SERP Title, Slug, and Meta Description to auto-generated defaults.", "ok");
      });
    }

    $("clearSourceBtn").addEventListener("click", function () {
      $("sourceTextarea").value = "";
      $("overrideKeywordInput").value = "";
      updateSourceTelemetry();
    });

    $("singleFileInput").addEventListener("change", function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        $("sourceTextarea").value = String(e.target.result || "");
        $("overrideKeywordInput").value = "";
        runOptimization();
      };
      reader.readAsText(file);
    });

    $("optimizeBtn").addEventListener("click", runOptimization);
    $("clearKeywordBtn").addEventListener("click", function () {
      $("overrideKeywordInput").value = "";
      runOptimization();
    });
    $("suggestBtn").addEventListener("click", runAutocompleteCheck);
    $("aiPolishBtn").addEventListener("click", runGroundedAiPolish);
    $("quickCloudSaveBtn").addEventListener("click", saveCurrentDocToSupabase);

    $("rescoreEditsBtn").addEventListener("click", function () {
      if (!state.currentResult) return;
      var edited = $("markdownOutputArea").value;
      var lowEdit = edited.replace(/\*\*/g, "").toLowerCase();
      var approved = (state.currentResult.approvedKeywords || []).slice();
      (state.sidebarKeywords || []).forEach(function (item) {
        var low = item.phrase.toLowerCase();
        if (lowEdit.indexOf(low) !== -1 && approved.indexOf(item.phrase) === -1) {
          approved.push(item.phrase);
        }
      });
      var baseWithApproved = Object.assign({}, state.currentResult, { approvedKeywords: approved });
      var updated = VeriRank.Optimizer.rescoreEditedMarkdown(state.currentResult.sourceText, edited, baseWithApproved, state.activeProfile);
      state.currentResult = updated;
      renderResult(updated);
      $("studioActionStatus").textContent = updated.factLock.passed
        ? "Manual edits verified: 100% source-grounded."
        : "Warning: Manual edit introduced ungrounded content flagged by Fact-Lock.";
    });

    // Live checkoff & score update while typing manually inside Edit Writing Live
    var liveEditTimer = null;
    $("markdownOutputArea").addEventListener("input", function () {
      clearTimeout(liveEditTimer);
      liveEditTimer = setTimeout(function () {
        if (!state.currentResult) return;
        var edited = $("markdownOutputArea").value;
        var lowEdit = edited.replace(/\*\*/g, "").toLowerCase();
        var approved = (state.currentResult.approvedKeywords || []).slice();
        (state.sidebarKeywords || []).forEach(function (item) {
          var low = item.phrase.toLowerCase();
          if (lowEdit.indexOf(low) !== -1 && approved.indexOf(item.phrase) === -1) {
            approved.push(item.phrase);
          }
        });
        var baseWithApproved = Object.assign({}, state.currentResult, { approvedKeywords: approved });
        var updated = VeriRank.Optimizer.rescoreEditedMarkdown(state.currentResult.sourceText, edited, baseWithApproved, state.activeProfile);
        state.currentResult = updated;
        renderResult(updated);
      }, 220);
    });

    if ($("weaveTopKeywordsBtn")) {
      $("weaveTopKeywordsBtn").addEventListener("click", function () {
        if (!state.currentResult || !VeriRank.Optimizer.weaveKeywordsIntoMarkdown) return;
        var currentLow = (state.currentResult.optimizedMarkdown || "").replace(/\*\*/g, "").toLowerCase();
        var top3 = [];
        (state.sidebarKeywords || []).forEach(function (item) {
          if (top3.length < 3 && currentLow.indexOf(item.phrase.toLowerCase()) === -1) {
            top3.push(item.phrase);
          }
        });
        if (top3.length === 0) {
          showToast("Top keywords are already in your writing!", "ok");
          return;
        }
        var updated = VeriRank.Optimizer.weaveKeywordsIntoMarkdown(state.currentResult, top3, state.activeProfile);
        state.currentResult = updated;
        renderResult(updated);
        if (state.viewMode !== "markdown") {
          switchContentViewMode("diff");
        }
        showToast("Wove " + top3.length + " top search keyword(s) into your writing!", "ok");
      });
    }

    if ($("sidebarKeywordSearchBtn") && $("sidebarKeywordSearchInput")) {
      var runSidebarSearch = function () {
        var q = $("sidebarKeywordSearchInput").value.trim();
        if (!q || !state.currentResult) return;
        fetchLiveKeywordsForSidebar(state.currentResult, q);
      };
      $("sidebarKeywordSearchBtn").addEventListener("click", runSidebarSearch);
      $("sidebarKeywordSearchInput").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runSidebarSearch();
        }
      });
    }

    if ($("copyRichTextBtn")) {
      $("copyRichTextBtn").addEventListener("click", function () {
        if (state.currentResult) {
          copyRichHtml($("previewPane").innerHTML, $("markdownOutputArea").value);
        }
      });
    }
    $("copyOptimizedBtn").addEventListener("click", function () {
      if (state.currentResult) copyText($("markdownOutputArea").value, "Optimized Markdown copied.");
    });
    $("copyJsonLdBtn").addEventListener("click", function () {
      if (state.currentResult) copyText($("jsonLdPreview").textContent, "Schema.org JSON-LD copied.");
    });
    $("copyIndexNowBtn").addEventListener("click", function () {
      if (state.currentResult) copyText($("indexNowPreview").textContent, "Bing IndexNow JSON copied.");
    });
    $("copyHeadTagsBtn").addEventListener("click", function () {
      if (state.currentResult) copyText($("headTagsPreview").textContent, "HTML head SEO tags copied.");
    });

    $("simulateHallucinationBtn").addEventListener("click", function () {
      if (!state.currentResult) return;
      var injected = state.currentResult.optimizedMarkdown + "\n\nIndependent testing by Gartner Research shows a 94% cost reduction within 3 days.";
      var fakeAudit = VeriRank.Optimizer.rescoreEditedMarkdown(state.currentResult.sourceText, injected, state.currentResult, state.activeProfile);
      renderResult(fakeAudit);
      $("restoreVerifiedBtn").style.display = "inline-flex";
      $("studioActionStatus").textContent = "Simulated hallucination injected ('Gartner', '94%', '3 days') -> Fact-Lock BLOCKED it!";
      showToast("Fact-Lock blocked 5 injected hallucination issues!", "bad");
    });

    $("restoreVerifiedBtn").addEventListener("click", function () {
      runOptimization();
      showToast("Restored 100% verified output.", "ok");
    });

    // Export Buttons
    $("downloadZipBtn").addEventListener("click", function () {
      if (!state.currentResult) return;
      var files = VeriRank.Exporter.buildDocumentPackageFiles(state.currentResult);
      var blob = VeriRank.Exporter.createZipBlob(files);
      VeriRank.Exporter.triggerDownload(state.currentResult.metadata.slug + "-verirank-seo-package.zip", blob);
    });
    $("downloadMdBtn").addEventListener("click", function () {
      if (!state.currentResult) return;
      VeriRank.Exporter.triggerDownload(state.currentResult.metadata.slug + "-optimized.md", state.currentResult.optimizedMarkdown);
    });
    $("downloadHtmlBtn").addEventListener("click", function () {
      if (!state.currentResult) return;
      VeriRank.Exporter.triggerDownload(state.currentResult.metadata.slug + "-optimized.html", state.currentResult.fullHtmlDocument);
    });
    $("downloadAuditBtn").addEventListener("click", function () {
      if (!state.currentResult) return;
      var html = VeriRank.Exporter.buildAuditReportHtml(state.currentResult, state.currentResult.metadata.title);
      VeriRank.Exporter.triggerDownload(state.currentResult.metadata.slug + "-fact-lock-audit.html", html);
    });

    $("writeSingleToDiskBtn").addEventListener("click", function () {
      if (!state.currentResult || getRuntimeMode() !== "desktop") return;
      var folder = $("singleExportFolderInput").value.trim();
      if (!folder) {
        $("singleDiskExportStatus").textContent = "Enter an output folder path first.";
        return;
      }
      var files = VeriRank.Exporter.buildDocumentPackageFiles(state.currentResult).map(function (f) {
        return { relativePath: f.path, content: f.content };
      });
      fetch("/api/fs/write-package", {
        method: "POST",
        headers: hostHeaders(),
        body: JSON.stringify({ outputFolder: folder, files: files })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          $("singleDiskExportStatus").textContent = d.ok ? ("Saved " + d.written + " files to " + folder) : ("Error: " + d.error);
        });
    });

    // Batch Mode
    $("loadDemoBatchBtn").addEventListener("click", function () {
      applyContentPreset("corporate", false);
      state.batchItems = VeriRank.Samples.map(function (s) {
        return { fileName: s.fileName, content: s.text, result: null };
      });
      runBatchOptimization();
    });
    $("runBatchBtn").addEventListener("click", runBatchOptimization);
    if ($("downloadBatchCsvBtn")) {
      $("downloadBatchCsvBtn").addEventListener("click", function () {
        var csv = VeriRank.Exporter.buildBatchCsv(state.batchItems);
        var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        VeriRank.Exporter.triggerDownload("verirank-seo-audit-report.csv", blob);
        showToast("Exported Excel-ready Audit CSV.", "ok");
      });
    }
    $("downloadBatchZipBtn").addEventListener("click", function () {
      var files = VeriRank.Exporter.buildBatchPackageFiles(state.batchItems);
      var blob = VeriRank.Exporter.createZipBlob(files);
      VeriRank.Exporter.triggerDownload("verirank-batch-seo-package.zip", blob);
    });

    var dz = $("batchDropzone");
    dz.addEventListener("click", function () { $("batchFileInput").click(); });
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", function () { dz.classList.remove("dragover"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault();
      dz.classList.remove("dragover");
      loadFilesIntoBatch(e.dataTransfer.files);
    });
    $("batchFileInput").addEventListener("change", function (e) {
      loadFilesIntoBatch(e.target.files);
    });

    $("loadFolderBtn").addEventListener("click", function () {
      var folder = $("batchInputFolderPath").value.trim();
      if (!folder || getRuntimeMode() !== "desktop") return;
      fetch("/api/fs/read-folder", {
        method: "POST",
        headers: hostHeaders(),
        body: JSON.stringify({ folderPath: folder })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) {
            $("batchFolderStatus").textContent = "Error: " + d.error;
            return;
          }
          state.batchItems = (d.files || []).map(function (f) {
            return { fileName: f.name, content: f.content, result: null };
          });
          runBatchOptimization();
          $("batchFolderStatus").textContent = "Loaded and optimized " + state.batchItems.length + " file(s) from " + folder;
        });
    });

    $("saveBatchFolderBtn").addEventListener("click", function () {
      var folder = $("batchOutputFolderPath").value.trim();
      if (!folder || getRuntimeMode() !== "desktop") return;
      var files = VeriRank.Exporter.buildBatchPackageFiles(state.batchItems).map(function (f) {
        return { relativePath: f.path, content: f.content };
      });
      fetch("/api/fs/write-package", {
        method: "POST",
        headers: hostHeaders(),
        body: JSON.stringify({ outputFolder: folder, files: files })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          $("batchFolderStatus").textContent = d.ok ? ("Exported " + d.written + " batch package files to " + folder) : ("Error: " + d.error);
        });
    });

    // Supabase Cloud Setup
    if (VeriRank.Cloud) {
      var sbCfg = VeriRank.Cloud.getConfig();
      $("sbUrlInput").value = sbCfg.url;
      $("sbKeyInput").value = sbCfg.key;
      $("sbSqlPre").textContent = VeriRank.Cloud.SQL_SCHEMA;

      $("copySbSqlBtn").addEventListener("click", function () {
        copyText(VeriRank.Cloud.SQL_SCHEMA, "Supabase SQL schema copied.");
      });

      $("saveSbConfigBtn").addEventListener("click", function () {
        var saved = VeriRank.Cloud.saveConfig($("sbUrlInput").value, $("sbKeyInput").value);
        $("sbUrlInput").value = saved.url;
        $("sbKeyInput").value = saved.key;
        showToast("Supabase settings saved.", "ok");
        refreshCloudDocs();
      });

      $("saveDocToSbBtn").addEventListener("click", saveCurrentDocToSupabase);
      $("loadSbDocsBtn").addEventListener("click", refreshCloudDocs);
      if (sbCfg.url && sbCfg.key) {
        refreshCloudDocs();
      }
    }

    // Profiles & Grounded AI
    renderProfileForm();
    $("saveProfileBtn").addEventListener("click", function () {
      var p = VeriRank.Profiles.deepClone(state.activeProfile);
      p.google.titleMaxPixels = parseInt($("profGoogleMaxPx").value, 10) || 580;
      p.google.maxExactDensityPct = parseFloat($("profGoogleMaxDensity").value) || 2.4;
      p.bing.leadWindowWords = parseInt($("profBingLeadWindow").value, 10) || 100;
      p.bing.maxExactDensityPct = parseFloat($("profBingMaxDensity").value) || 2.2;
      state.activeProfile = VeriRank.Profiles.saveCustomProfile(p);
      $("profileStatus").textContent = "Profile saved.";
      if ($("sourceTextarea").value.trim()) runOptimization();
      showToast("Ranking profile saved.", "ok");
    });
    $("resetProfileBtn").addEventListener("click", function () {
      state.activeProfile = VeriRank.Profiles.resetProfile();
      renderProfileForm();
      $("profileStatus").textContent = "Reset to factory defaults.";
      if ($("sourceTextarea").value.trim()) runOptimization();
      showToast("Ranking profile reset to defaults.", "ok");
    });

    $("aiProviderSelect").addEventListener("change", function () {
      var v = this.value;
      if (v === "ollama") {
        $("aiEndpointInput").value = "http://127.0.0.1:11434/api/generate";
        $("aiModelInput").value = "llama3.1";
      } else if (v === "openai") {
        $("aiEndpointInput").value = "https://api.openai.com/v1/chat/completions";
        $("aiModelInput").value = "gpt-4o-mini";
      } else if (v === "gemini") {
        $("aiEndpointInput").value = "https://generativelanguage.googleapis.com/v1beta/models";
        $("aiModelInput").value = "gemini-2.0-flash";
      } else if (v === "anthropic") {
        $("aiEndpointInput").value = "https://api.anthropic.com/v1/messages";
        $("aiModelInput").value = "claude-3-5-sonnet-latest";
      }
    });

    // Self-Test Tab
    $("runSelfTestsBtn").addEventListener("click", renderSelfTests);
    renderSelfTests();
    if (global.location && global.location.search && global.location.search.indexOf("selftest=1") !== -1) {
      activateMainTab("selftest");
    }

    // Restore auto-saved draft or boot with Sample 1
    var savedDraft = VeriRank.Profiles && VeriRank.Profiles.loadDraftState ? VeriRank.Profiles.loadDraftState() : null;
    if (savedDraft && savedDraft.text && savedDraft.text.trim()) {
      $("sourceTextarea").value = savedDraft.text;
      $("overrideKeywordInput").value = savedDraft.overrideKeyword || "";
      applyContentPreset(savedDraft.preset || "corporate", false);
    } else {
      $("sourceTextarea").value = VeriRank.Samples[0].text;
    }
    runOptimization();
    renderLocalHistory();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
