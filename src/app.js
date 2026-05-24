(function () {
  const COLUMNS = [
    "TC ID",
    "USER STORY ID",
    "MODULE",
    "Scenario",
    "Test Case",
    "Expected Result",
    "Type",
    "Status",
  ];

  const SAMPLE_INPUT = [
    "SP-13539\tInventory Tree View\tQuick Move option visibility\tVerify user can see Quick Move from eligible device overflow menu\tQuick Move option should be visible for user with CAN_MOVE_PXW_INVENTORY\tPositive\tReady",
    "SP-13540\tLocation Management\tAdd child location\tAdd child location should open from parent location action menu\tAdd Child popup should open with selected parent location\tPositive\tReady",
    "SP-13543\tLocation Management\tDelete empty location\tDelete action should be blocked when location has child locations\tSystem should not allow delete and should display proper validation\tNegative\tReady",
  ].join("\n");

  const elements = {
    inputText: document.getElementById("inputText"),
    inputCounter: document.getElementById("inputCounter"),
    styleSelect: document.getElementById("styleSelect"),
    storyId: document.getElementById("storyId"),
    moduleName: document.getElementById("moduleName"),
    strictMode: document.getElementById("strictMode"),
    addMissing: document.getElementById("addMissing"),
    dedupeRows: document.getElementById("dedupeRows"),
    generateButton: document.getElementById("generateButton"),
    sampleButton: document.getElementById("sampleButton"),
    copyButton: document.getElementById("copyButton"),
    downloadButton: document.getElementById("downloadButton"),
    resultBody: document.getElementById("resultBody"),
    outputSubtitle: document.getElementById("outputSubtitle"),
    summaryList: document.getElementById("summaryList"),
  };

  let currentRows = [];

  elements.inputText.addEventListener("input", updateCounter);
  elements.generateButton.addEventListener("click", generate);
  elements.sampleButton.addEventListener("click", loadSample);
  elements.copyButton.addEventListener("click", copyTsv);
  elements.downloadButton.addEventListener("click", downloadCsv);

  updateCounter();

  function updateCounter() {
    const lines = getLines(elements.inputText.value).length;
    elements.inputCounter.textContent = `${lines} ${lines === 1 ? "line" : "lines"}`;
  }

  function loadSample() {
    elements.inputText.value = SAMPLE_INPUT;
    elements.storyId.value = "SP-13539";
    elements.moduleName.value = "Inventory Tree View";
    updateCounter();
    generate();
  }

  function generate() {
    const input = elements.inputText.value.trim();
    if (!input) {
      currentRows = [];
      renderRows([]);
      renderSummary(["No input provided. Paste testcases or rough scenarios before generating."]);
      return;
    }

    const options = getOptions();
    const parsed = parseInput(input, options);
    const normalized = parsed.map((row, index) => normalizeRow(row, index, options));
    const coverageRows = options.addMissing ? buildMissingCoverage(normalized, input, options) : [];
    const combined = normalized.concat(coverageRows);
    const finalRows = options.dedupeRows ? dedupe(combined) : combined;

    currentRows = finalRows.map((row, index) => ({
      ...row,
      id: formatId(index + 1),
    }));

    renderRows(currentRows);
    renderSummary(buildSummary(parsed, normalized, coverageRows, finalRows, options));
  }

  function getOptions() {
    return {
      style: elements.styleSelect.value,
      storyId: elements.storyId.value.trim(),
      moduleName: elements.moduleName.value.trim(),
      strictMode: elements.strictMode.checked,
      addMissing: elements.addMissing.checked,
      dedupeRows: elements.dedupeRows.checked,
    };
  }

  function getLines(value) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function parseInput(input, options) {
    const lines = getLines(input);
    const rows = [];
    const headerMap = detectHeader(lines[0]);
    const dataLines = headerMap ? lines.slice(1) : lines;

    dataLines.forEach((line) => {
      const cells = splitRow(line);
      if (cells.length >= 4) {
        rows.push(parseStructuredRow(cells, headerMap, options));
      } else {
        rows.push(parseFreeTextLine(line, options));
      }
    });

    return rows;
  }

  function splitRow(line) {
    if (line.includes("\t")) return line.split("\t").map(cleanCell);
    if (line.includes("|")) return line.split("|").map(cleanCell).filter(Boolean);
    return [line.trim()];
  }

  function cleanCell(value) {
    return value.replace(/^"+|"+$/g, "").trim();
  }

  function detectHeader(line) {
    const cells = splitRow(line).map((cell) => normalizeKey(cell));
    const hasHeader =
      cells.includes("testcase") ||
      cells.includes("testcaseid") ||
      cells.includes("expectedresult") ||
      cells.includes("scenario");

    if (!hasHeader) return null;

    return cells.reduce((map, key, index) => {
      map[key] = index;
      return map;
    }, {});
  }

  function parseStructuredRow(cells, headerMap, options) {
    if (headerMap) {
      return {
        storyId: readByHeader(cells, headerMap, ["userstoryid", "storyid", "requirementid"]) || options.storyId,
        module: readByHeader(cells, headerMap, ["module"]) || options.moduleName,
        scenario: readByHeader(cells, headerMap, ["scenario", "coveragearea"]) || "",
        testCase: readByHeader(cells, headerMap, ["testcase", "testcasename", "title"]) || "",
        expectedResult: readByHeader(cells, headerMap, ["expectedresult", "expected"]) || "",
        type: readByHeader(cells, headerMap, ["type"]) || "",
        status: readByHeader(cells, headerMap, ["status"]) || "Ready",
      };
    }

    return {
      storyId: cells[0] || options.storyId,
      module: cells[1] || options.moduleName,
      scenario: cells[2] || "",
      testCase: cells[3] || cells[2] || "",
      expectedResult: cells[4] || "",
      type: cells[5] || "",
      status: cells[6] || "Ready",
    };
  }

  function parseFreeTextLine(line, options) {
    const cleaned = line.replace(/^[-*]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
    return {
      storyId: options.storyId,
      module: options.moduleName,
      scenario: inferScenario(cleaned),
      testCase: cleaned,
      expectedResult: "",
      type: "",
      status: "Ready",
    };
  }

  function readByHeader(cells, headerMap, keys) {
    for (const key of keys) {
      if (Number.isInteger(headerMap[key])) return cells[headerMap[key]] || "";
    }
    return "";
  }

  function normalizeKey(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function normalizeRow(row, index, options) {
    const sourceText = [row.scenario, row.testCase, row.expectedResult].join(" ");
    const type = normalizeType(row.type || inferType(sourceText));
    const module = row.module || inferModule(sourceText) || options.moduleName || "QA Validation";
    const scenario = styleScenario(row.scenario || inferScenario(sourceText), options.style);
    const testCase = styleTestCase(row.testCase || row.scenario || sourceText, type, options.style);
    const expectedResult = styleExpectedResult(row.expectedResult, testCase, type, options.style);

    return {
      id: formatId(index + 1),
      storyId: row.storyId || options.storyId || "REQ-001",
      module,
      scenario,
      testCase,
      expectedResult,
      type,
      status: row.status || "Ready",
      source: "rewritten",
    };
  }

  function buildMissingCoverage(rows, input, options) {
    const text = `${input} ${rows.map((row) => `${row.scenario} ${row.testCase}`).join(" ")}`.toLowerCase();
    const additions = [];
    const add = (scenario, testCase, expectedResult, type, moduleHint) => {
      additions.push({
        id: "",
        storyId: options.storyId || rows[0]?.storyId || "REQ-001",
        module: options.moduleName || moduleHint || rows[0]?.module || inferModule(testCase) || "QA Validation",
        scenario: styleScenario(scenario, options.style),
        testCase: styleTestCase(testCase, type, options.style),
        expectedResult: styleExpectedResult(expectedResult, testCase, type, options.style),
        type: normalizeType(type),
        status: "Ready",
        source: "added",
      });
    };

    const hasPositive = rows.some((row) => row.type === "Positive");
    const hasNegative = rows.some((row) => row.type === "Negative");
    const hasUi = rows.some((row) => row.type === "UI");
    const hasPermission = rows.some((row) => row.type === "Permission");

    if (!hasPositive) {
      add(
        "Primary successful flow",
        "User can complete the main stated action successfully",
        "The action is completed successfully and the correct result is displayed.",
        "Positive"
      );
    }

    if (!hasNegative) {
      add(
        "Blocked or invalid flow",
        "User cannot complete the stated action when required conditions are not met",
        "The system prevents the action and displays the appropriate validation or blocked state.",
        "Negative"
      );
    }

    if (!hasUi && containsAny(text, ["popup", "modal", "button", "menu", "dropdown", "screen", "page", "visible", "display"])) {
      add(
        "UI visibility and labels",
        "User can view the correct labels, controls, and action states for the stated screen",
        "Only the expected UI controls are displayed with the correct enabled, disabled, visible, or hidden state.",
        "UI"
      );
    }

    if (
      !hasPermission &&
      containsAny(text, ["permission", "authority", "role", "unauthorized", "can_manage", "can_move", "access"])
    ) {
      add(
        "Permission restricted access",
        "User without the required permission cannot access or execute the restricted action",
        "The restricted action is hidden or blocked, and no unauthorized update is performed.",
        "Permission"
      );
    }

    if (containsAny(text, ["quick move", "quickmove"])) {
      add(
        "Quick Move eligible source",
        "User can open Quick Move from an eligible department, location, group, or device action menu",
        "The Quick Move flow opens with the selected source context retained.",
        "Positive",
        "Inventory Tree View"
      );
      add(
        "Quick Move restricted source",
        "User cannot quick move inventory from an ineligible source or invalid target",
        "The move action is unavailable or blocked, and inventory remains unchanged.",
        "Negative",
        "Inventory Tree View"
      );
    }

    if (containsAny(text, ["add child", "child location", "addchild"])) {
      add(
        "Add Child location",
        "User can add a child location from an eligible parent location",
        "The Add Child flow opens with the selected parent location context.",
        "Positive",
        "Location Management"
      );
      add(
        "Add Child restricted parent",
        "User cannot add a child location from an ineligible parent location",
        "The Add Child action is hidden or blocked for the ineligible parent.",
        "Negative",
        "Location Management"
      );
    }

    if (containsAny(text, ["delete", "remove"])) {
      add(
        "Delete allowed record",
        "User can delete the stated record only when all delete conditions are satisfied",
        "The record is deleted and removed from the relevant list or tree without affecting unrelated records.",
        "Positive"
      );
      add(
        "Delete blocked record",
        "User cannot delete the stated record when dependent child records or linked data exist",
        "The system blocks deletion and keeps the original record unchanged.",
        "Negative"
      );
    }

    if (!options.strictMode && containsAny(text, ["form", "field", "save", "create", "edit"])) {
      add(
        "Required field validation",
        "User cannot save the form when mandatory fields are blank",
        "The form remains open and displays validation for each missing mandatory field.",
        "Negative"
      );
    }

    return additions;
  }

  function styleScenario(value, style) {
    const clean = sentenceCase(value || "Functional validation");
    if (style === "professional") return clean.replace(/\.$/, "");
    if (style === "yuv") return clean.replace(/\.$/, "");
    if (style === "compact") return clean.replace(/\.$/, "");
    return clean.replace(/\.$/, "");
  }

  function styleTestCase(value, type, style) {
    const clean = stripStarter(value);
    const action = clean.charAt(0).toLowerCase() + clean.slice(1);

    if (style === "professional") {
      if (type === "Negative") return `Verify that the system prevents the user from ${removeCannot(action)}`;
      return `Verify that the system allows the user to ${removeCan(action)}`;
    }

    if (style === "yuv") {
      if (type === "UI") return `Verify that the page displays the correct UI state for ${action}`;
      if (type === "Negative") return `Verify that the user is blocked when ${action}`;
      return `Verify that the user can complete ${removeCan(action)}`;
    }

    if (style === "compact") {
      if (type === "Negative") return `Verify blocked behavior for ${action}`;
      return `Verify ${action}`;
    }

    if (type === "Negative") return `Verify that the user cannot ${removeCannot(action)}`;
    if (type === "Permission") return `Verify that the user has correct permission behavior for ${action}`;
    if (type === "UI") return `Verify that the user can view the correct UI state for ${action}`;
    return `Verify that the user can ${removeCan(action)}`;
  }

  function styleExpectedResult(value, testCase, type, style) {
    const clean = sentenceCase(value || inferExpected(testCase, type));
    if (style === "compact") return clean.replace(/^The system should /, "");
    if (style === "robert") return clean.replace(/^The system should /, "");
    return clean;
  }

  function stripStarter(value) {
    return sentenceCase(value || "complete the stated action")
      .replace(/^Verify that the user can\s+/i, "")
      .replace(/^Verify that the user cannot\s+/i, "")
      .replace(/^Verify user can\s+/i, "")
      .replace(/^Verify user cannot\s+/i, "")
      .replace(/^Verify that the system allows the user to\s+/i, "")
      .replace(/^Verify that\s+/i, "")
      .replace(/^User can\s+/i, "")
      .replace(/^User cannot\s+/i, "")
      .replace(/\.$/, "")
      .trim();
  }

  function removeCan(value) {
    return value
      .replace(/^user can\s+/i, "")
      .replace(/^can\s+/i, "")
      .replace(/^complete\s+complete\s+/i, "complete ")
      .trim();
  }

  function removeCannot(value) {
    return value
      .replace(/^user cannot\s+/i, "")
      .replace(/^cannot\s+/i, "")
      .replace(/^not\s+/i, "")
      .trim();
  }

  function inferExpected(testCase, type) {
    if (type === "Negative") {
      return "The system should prevent the action and keep the existing data unchanged.";
    }
    if (type === "Permission") {
      return "The system should allow only authorized behavior and prevent unauthorized updates.";
    }
    if (type === "UI") {
      return "The expected controls, labels, messages, and states should be displayed correctly.";
    }
    return "The system should complete the action successfully and display the correct result.";
  }

  function inferScenario(value) {
    const text = value.toLowerCase();
    if (containsAny(text, ["quick move", "quickmove"])) return "Quick Move action";
    if (containsAny(text, ["add child", "child location"])) return "Add Child location";
    if (containsAny(text, ["delete", "remove"])) return "Delete action";
    if (containsAny(text, ["permission", "authority", "role"])) return "Permission behavior";
    if (containsAny(text, ["popup", "modal", "visible", "display", "button", "menu"])) return "UI behavior";
    if (containsAny(text, ["invalid", "error", "blank", "required", "blocked"])) return "Validation behavior";
    return "Functional validation";
  }

  function inferModule(value) {
    const text = value.toLowerCase();
    if (containsAny(text, ["quick move", "inventory", "device", "group"])) return "Inventory Tree View";
    if (containsAny(text, ["location", "department", "add child", "delete"])) return "Location Management";
    if (containsAny(text, ["search", "filter", "list", "grid"])) return "List View";
    if (containsAny(text, ["login", "permission", "role", "authority"])) return "Access Control";
    return "";
  }

  function inferType(value) {
    const text = value.toLowerCase();
    if (containsAny(text, ["permission", "authority", "unauthorized", "without access", "role"])) return "Permission";
    if (containsAny(text, ["cannot", "invalid", "blocked", "error", "failed", "missing", "blank", "ineligible"])) {
      return "Negative";
    }
    if (containsAny(text, ["visible", "display", "button", "menu", "popup", "modal", "label", "ui"])) return "UI";
    return "Positive";
  }

  function normalizeType(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("negative")) return "Negative";
    if (text.includes("permission")) return "Permission";
    if (text === "ui" || text.includes("ui")) return "UI";
    if (text.includes("functional")) return "Functional";
    if (text.includes("positive")) return "Positive";
    return inferType(text);
  }

  function dedupe(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.module}|${row.scenario}|${row.testCase}`
        .toLowerCase()
        .replace(/[^a-z0-9|]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildSummary(parsed, normalized, added, finalRows, options) {
    const removed = normalized.length + added.length - finalRows.length;
    const addedTypes = added.reduce((acc, row) => {
      acc[row.type] = (acc[row.type] || 0) + 1;
      return acc;
    }, {});

    const summary = [
      `Parsed ${parsed.length} input row(s) and rewrote ${normalized.length} row(s) into ${labelForStyle(options.style)} style.`,
      "Standardized IDs, module naming, scenario wording, testcase titles, expected results, type, and status columns.",
    ];

    if (added.length > 0) {
      summary.push(
        `Added ${added.length} supported missing coverage row(s): ${Object.entries(addedTypes)
          .map(([type, count]) => `${count} ${type}`)
          .join(", ")}.`
      );
    } else {
      summary.push("No extra coverage rows were added.");
    }

    if (options.strictMode) {
      summary.push("Requirement-only guard was enabled, so unsupported generic scenario families were avoided.");
    }

    if (removed > 0) {
      summary.push(`Removed ${removed} duplicate or near-duplicate row(s).`);
    }

    summary.push(`Final output contains ${finalRows.length} testcase row(s).`);
    return summary;
  }

  function labelForStyle(style) {
    if (style === "professional") return "Professional Standard";
    if (style === "yuv") return "Yuv Broad Coverage";
    if (style === "compact") return "Compact Review";
    return "Robert";
  }

  function renderRows(rows) {
    elements.resultBody.innerHTML = "";

    if (rows.length === 0) {
      elements.resultBody.innerHTML =
        '<tr><td colspan="8" class="empty-state">Paste content and generate to see rewritten testcases.</td></tr>';
      elements.outputSubtitle.textContent = "No output yet.";
      return;
    }

    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      [
        row.id,
        row.storyId,
        row.module,
        row.scenario,
        row.testCase,
        row.expectedResult,
        row.type,
        row.status,
      ].forEach((value, index) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (index === 6) td.className = `type-${String(value).toLowerCase()}`;
        tr.appendChild(td);
      });
      fragment.appendChild(tr);
    });

    elements.resultBody.appendChild(fragment);
    elements.outputSubtitle.textContent = `${rows.length} row(s) generated in ${labelForStyle(elements.styleSelect.value)} style.`;
  }

  function renderSummary(items) {
    elements.summaryList.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      elements.summaryList.appendChild(li);
    });
  }

  function toTsv(rows) {
    return [COLUMNS.join("\t")]
      .concat(
        rows.map((row) =>
          [
            row.id,
            row.storyId,
            row.module,
            row.scenario,
            row.testCase,
            row.expectedResult,
            row.type,
            row.status,
          ].join("\t")
        )
      )
      .join("\n");
  }

  function toCsv(rows) {
    return [COLUMNS.map(csvEscape).join(",")]
      .concat(
        rows.map((row) =>
          [
            row.id,
            row.storyId,
            row.module,
            row.scenario,
            row.testCase,
            row.expectedResult,
            row.type,
            row.status,
          ]
            .map(csvEscape)
            .join(",")
        )
      )
      .join("\n");
  }

  async function copyTsv() {
    if (currentRows.length === 0) return;
    await navigator.clipboard.writeText(toTsv(currentRows));
    elements.copyButton.textContent = "Copied";
    setTimeout(() => {
      elements.copyButton.textContent = "Copy TSV";
    }, 1200);
  }

  function downloadCsv() {
    if (currentRows.length === 0) return;
    const blob = new Blob([toCsv(currentRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rewritten-testcases.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const text = String(value || "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function containsAny(value, terms) {
    return terms.some((term) => value.includes(term));
  }

  function sentenceCase(value) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function formatId(number) {
    return `TC_${String(number).padStart(3, "0")}`;
  }
})();
