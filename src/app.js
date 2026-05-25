(function () {
  const SETTINGS_KEY = "testcase-style-studio-settings";
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

  const SAMPLE_REQUIREMENT = [
    "User Story: SP-13539",
    "Module: Inventory Tree View",
    "",
    "Requirement:",
    "As an authorized PXW inventory user, I need to use Quick Move from the inventory tree so that inventory can be moved to another valid location without opening a separate details page.",
    "",
    "Acceptance Criteria:",
    "1. User with CAN_MOVE_PXW_INVENTORY can view Quick Move from eligible department, location, group, or device overflow menus.",
    "2. User without CAN_MOVE_PXW_INVENTORY cannot view or execute Quick Move.",
    "3. Quick Move opens a modal with selected source context, destination tree, search, Move, and Cancel controls.",
    "4. User can search and select a valid destination location.",
    "5. Move is blocked when the destination is invalid, same as source, or not eligible.",
    "6. Successful move refreshes the tree and shows the inventory under the new destination.",
  ].join("\n");

  const AI_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["testCases", "summary"],
    properties: {
      testCases: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "sourceReference",
            "userStoryId",
            "module",
            "scenario",
            "testCase",
            "expectedResult",
            "type",
            "status",
          ],
          properties: {
            sourceReference: { type: "string" },
            userStoryId: { type: "string" },
            module: { type: "string" },
            scenario: { type: "string" },
            testCase: { type: "string" },
            expectedResult: { type: "string" },
            type: {
              type: "string",
              enum: ["Positive", "Negative", "UI", "Functional", "Permission", "Edge"],
            },
            status: { type: "string" },
          },
        },
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: ["requirementPointsCovered", "coverageAdded", "guardrailsApplied", "notes"],
        properties: {
          requirementPointsCovered: { type: "integer" },
          coverageAdded: { type: "array", items: { type: "string" } },
          guardrailsApplied: { type: "array", items: { type: "string" } },
          notes: { type: "array", items: { type: "string" } },
        },
      },
    },
  };

  const elements = {
    inputText: document.getElementById("inputText"),
    inputCounter: document.getElementById("inputCounter"),
    inputMode: document.getElementById("inputMode"),
    styleSelect: document.getElementById("styleSelect"),
    engineSelect: document.getElementById("engineSelect"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    modelSelect: document.getElementById("modelSelect"),
    rememberKey: document.getElementById("rememberKey"),
    aiSettingsPanel: document.getElementById("aiSettingsPanel"),
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
    statusBanner: document.getElementById("statusBanner"),
    summaryList: document.getElementById("summaryList"),
  };

  let currentRows = [];
  let lastRunMeta = null;

  restoreSettings();
  elements.inputText.addEventListener("input", updateCounter);
  elements.inputMode.addEventListener("change", updateInputModeCopy);
  elements.engineSelect.addEventListener("change", persistSettings);
  elements.styleSelect.addEventListener("change", persistSettings);
  elements.modelSelect.addEventListener("change", persistSettings);
  elements.rememberKey.addEventListener("change", persistSettings);
  elements.apiKeyInput.addEventListener("change", persistSettings);
  elements.generateButton.addEventListener("click", generate);
  elements.sampleButton.addEventListener("click", loadSample);
  elements.copyButton.addEventListener("click", copyTsv);
  elements.downloadButton.addEventListener("click", downloadCsv);

  updateCounter();
  updateInputModeCopy();
  updateEngineState();

  function updateCounter() {
    const lines = getLines(elements.inputText.value).length;
    elements.inputCounter.textContent = `${lines} ${lines === 1 ? "line" : "lines"}`;
  }

  function updateInputModeCopy() {
    const requirementMode = elements.inputMode.value === "requirement";
    elements.inputText.placeholder = requirementMode
      ? "Paste requirement here. Include user story, ACs, permissions, UI behavior, validations, and expected outcomes."
      : "Paste existing testcases here. Excel tab-separated rows are supported.";
  }

  function updateEngineState() {
    const aiEnabled = elements.engineSelect.value === "ai";
    elements.aiSettingsPanel.style.display = aiEnabled ? "block" : "none";
  }

  function restoreSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (saved.inputMode) elements.inputMode.value = saved.inputMode;
      if (saved.style) elements.styleSelect.value = saved.style;
      if (saved.engine) elements.engineSelect.value = saved.engine;
      if (saved.model) elements.modelSelect.value = saved.model;
      if (saved.rememberKey) elements.rememberKey.checked = true;
      if (saved.apiKey && saved.rememberKey) elements.apiKeyInput.value = saved.apiKey;
    } catch {
      localStorage.removeItem(SETTINGS_KEY);
    }
  }

  function persistSettings() {
    updateEngineState();
    const settings = {
      inputMode: elements.inputMode.value,
      style: elements.styleSelect.value,
      engine: elements.engineSelect.value,
      model: elements.modelSelect.value,
      rememberKey: elements.rememberKey.checked,
      apiKey: elements.rememberKey.checked ? elements.apiKeyInput.value.trim() : "",
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadSample() {
    elements.inputMode.value = "requirement";
    elements.inputText.value = SAMPLE_REQUIREMENT;
    elements.storyId.value = "SP-13539";
    elements.moduleName.value = "Inventory Tree View";
    updateCounter();
    updateInputModeCopy();
    generate();
  }

  async function generate() {
    const input = elements.inputText.value.trim();
    if (!input) {
      currentRows = [];
      lastRunMeta = null;
      renderRows([]);
      setStatus("No requirement provided. Paste the requirement or acceptance criteria before generating.", "error");
      renderSummary(["No requirement provided. Paste the requirement or acceptance criteria before generating."]);
      return;
    }

    const options = getOptions();
    persistSettings();
    setBusy(true);
    setStatus(
      options.engine === "ai"
        ? "Generating with OpenAI. Reading requirement line by line..."
        : "Generating locally from requirement rules...",
      "working"
    );

    try {
      const result =
        options.inputMode === "requirement"
          ? await generateRequirementSuite(input, options)
          : await generateRewriteSuite(input, options);

      const rows = options.dedupeRows ? dedupe(result.rows) : result.rows;
      currentRows = rows.map((row, index) => ({ ...row, id: formatId(index + 1) }));
      lastRunMeta = { ...result, finalCount: currentRows.length, duplicateCount: result.rows.length - rows.length };

      renderRows(currentRows);
      renderSummary(buildSummary(lastRunMeta, currentRows, options));
      setStatus(
        `${currentRows.length} testcase row(s) generated using ${result.engineLabel}.`,
        result.engine === "ai" ? "success" : "working"
      );
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Generation failed.", "error");
      renderSummary([error.message || "Generation failed."]);
    } finally {
      setBusy(false);
    }
  }

  async function generateRequirementSuite(input, options) {
    const analysis = analyzeRequirement(input, options);

    if (options.engine === "ai" && options.apiKey) {
      try {
        const aiResult = await generateWithOpenAi(input, analysis, options);
        return aiResult;
      } catch (error) {
        console.warn("[AI generation failed; using local fallback]", error);
        const local = generateFromRequirementLocal(input, options, analysis);
        local.summaryNotes.unshift(`OpenAI generation failed, so local fallback was used: ${error.message}`);
        local.engineLabel = "Local fallback";
        return local;
      }
    }

    const local = generateFromRequirementLocal(input, options, analysis);
    if (options.engine === "ai" && !options.apiKey) {
      local.summaryNotes.unshift("OpenAI API key was not provided, so local fallback was used.");
      local.engineLabel = "Local fallback";
    }
    return local;
  }

  async function generateRewriteSuite(input, options) {
    if (options.engine === "ai" && options.apiKey) {
      try {
        const analysis = analyzeRequirement(input, options);
        return await generateWithOpenAi(input, analysis, { ...options, inputMode: "testcase" });
      } catch (error) {
        console.warn("[AI rewrite failed; using local fallback]", error);
      }
    }
    return rewriteExistingTestcasesLocal(input, options);
  }

  function getOptions() {
    return {
      inputMode: elements.inputMode.value,
      style: elements.styleSelect.value,
      engine: elements.engineSelect.value,
      apiKey: elements.apiKeyInput.value.trim(),
      model: elements.modelSelect.value,
      storyId: elements.storyId.value.trim(),
      moduleName: elements.moduleName.value.trim(),
      strictMode: elements.strictMode.checked,
      addMissing: elements.addMissing.checked,
      dedupeRows: elements.dedupeRows.checked,
    };
  }

  async function generateWithOpenAi(input, analysis, options) {
    const payload = {
      model: options.model || "gpt-5.4-mini",
      instructions: buildAiInstructions(options),
      input: buildAiUserPrompt(input, analysis, options),
      text: {
        format: {
          type: "json_schema",
          name: "testcase_suite",
          strict: true,
          schema: AI_SCHEMA,
        },
      },
      max_output_tokens: 12000,
      store: false,
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `OpenAI request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }

    const outputText = extractResponseText(data);
    if (!outputText) {
      throw new Error("OpenAI returned an empty response.");
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error("OpenAI response was not valid JSON.");
    }

    const rows = normalizeAiRows(parsed.testCases || [], analysis, options);
    if (rows.length === 0) {
      throw new Error("OpenAI did not return any testcase rows.");
    }

    const guardedRows = applyStrictGuard(rows, input, options);
    const completedRows = options.addMissing ? ensureCoreCoverage(guardedRows, analysis, input, options) : guardedRows;

    return {
      mode: options.inputMode,
      engine: "ai",
      engineLabel: `OpenAI ${options.model}`,
      analysis,
      rows: completedRows,
      generatedCount: rows.length,
      addedCount: Math.max(0, completedRows.length - guardedRows.length),
      summaryNotes: [
        `OpenAI returned ${rows.length} structured testcase row(s).`,
        ...(parsed.summary?.coverageAdded || []),
        ...(parsed.summary?.guardrailsApplied || []),
        ...(parsed.summary?.notes || []),
      ],
    };
  }

  function buildAiInstructions(options) {
    const styleLabel = labelForStyle(options.style);
    return [
      "You are a senior QA test designer creating enterprise manual testcases.",
      `Write in ${styleLabel} style.`,
      "Output must be structured JSON that matches the provided schema.",
      "Read the full requirement line by line before generating.",
      "Every testcase must map to explicit requirement wording, an AC point, a stated permission or role, a stated UI action/state, a stated validation or blocked path, or a directly stated user-visible side effect.",
      "Do not invent unrelated features, roles, screens, settings, APIs, databases, browsers, responsive behavior, performance behavior, accessibility obligations, or security cases unless stated in the requirement.",
      "Use these columns conceptually: TC ID, USER STORY ID, MODULE, Scenario, Test Case, Expected Result, Type, Status.",
      "Do not include TC IDs in JSON; the app assigns IDs.",
      "Use exact permission names, labels, popup/modal names, config keys, statuses, and fixed values from the requirement.",
      "Include positive, negative, UI, functional, permission, and edge coverage when supported by the requirement.",
      "Expected results must be direct, observable, and execution-ready.",
      "Robert style means actor-based titles like 'Verify that the user can...' and crisp expected results.",
      "Professional Standard style means formal, audit-ready, requirement-traceable wording.",
      "Yuv Broad Coverage style means wider module/page/UI/navigation coverage, but still requirement-grounded.",
      "Compact Review style means concise but not incomplete wording.",
      options.strictMode
        ? "Strict requirement-only guard is enabled: unsupported generic scenario families are not allowed."
        : "Strict requirement-only guard is disabled: practical derived QA coverage may be added when it is clearly relevant.",
    ].join("\n");
  }

  function buildAiUserPrompt(input, analysis, options) {
    return [
      `Input mode: ${options.inputMode === "requirement" ? "Generate testcases from requirement" : "Rewrite existing testcases"}`,
      `Selected style: ${labelForStyle(options.style)}`,
      `User story ID: ${analysis.storyId}`,
      `Module: ${analysis.module}`,
      "",
      "Requirement points detected by the app:",
      ...analysis.points.map((point) => `${point.id}: ${point.text}`),
      "",
      "Generate a complete professional testcase suite. Use exact terms from the requirement. Return JSON only.",
      "",
      "Input:",
      input,
    ].join("\n");
  }

  function extractResponseText(data) {
    if (typeof data.output_text === "string") return data.output_text;
    const pieces = [];
    for (const output of data.output || []) {
      if (output.type !== "message") continue;
      for (const content of output.content || []) {
        if (content.type === "output_text" && typeof content.text === "string") pieces.push(content.text);
        if (content.type === "text" && typeof content.text === "string") pieces.push(content.text);
      }
    }
    return pieces.join("\n").trim();
  }

  function normalizeAiRows(aiRows, analysis, options) {
    return aiRows.map((item, index) =>
      buildRow({
        storyId: cleanText(item.userStoryId) || analysis.storyId,
        module: cleanText(item.module) || analysis.module,
        scenario: cleanText(item.scenario) || `Requirement behavior ${String(index + 1).padStart(2, "0")}`,
        action: cleanText(item.testCase),
        expected: cleanText(item.expectedResult),
        type: normalizeType(item.type),
        style: options.style,
        status: cleanText(item.status) || "Ready",
        sourceRef: cleanText(item.sourceReference) || `AI-${index + 1}`,
        preserveTitle: true,
      })
    );
  }

  function applyStrictGuard(rows, input, options) {
    if (!options.strictMode) return rows;
    const lowerInput = input.toLowerCase();
    const unsupportedTopics = [
      ["cross-browser", "browser compatibility"],
      ["responsive", "mobile layout", "tablet", "touch behavior"],
      ["performance", "load time", "large data", "slow response"],
      ["concurrency", "multi-user", "stale data"],
      ["accessibility", "aria", "screen reader", "keyboard navigation"],
      ["api response", "database", "db verification", "rollback"],
    ];

    return rows.filter((row) => {
      const rowText = `${row.scenario} ${row.testCase} ${row.expectedResult}`.toLowerCase();
      return !unsupportedTopics.some((topic) => {
        const generated = topic.some((term) => rowText.includes(term));
        const supported = topic.some((term) => lowerInput.includes(term));
        return generated && !supported;
      });
    });
  }

  function ensureCoreCoverage(rows, analysis, input, options) {
    const additions = [];
    const text = input.toLowerCase();
    const typeSet = new Set(rows.map((row) => row.type));
    const add = (scenario, action, expected, type, moduleHint, sourceRef) => {
      additions.push(
        buildRow({
          storyId: analysis.storyId,
          module: moduleHint || analysis.module,
          scenario,
          action,
          expected,
          type,
          style: options.style,
          sourceRef,
        })
      );
    };

    if (!typeSet.has("Negative") && containsAny(text, ["cannot", "invalid", "blocked", "without", "not eligible"])) {
      add(
        "Negative condition handling",
        "the stated action is blocked when the required condition is not satisfied",
        "The system prevents the action and keeps existing data unchanged.",
        "Negative",
        analysis.module,
        "AUTO-NEG"
      );
    }

    if (!typeSet.has("Permission") && hasPermissionSignal(text)) {
      add(
        "Permission based behavior",
        "a user without the required permission cannot access or execute restricted actions",
        "Restricted actions are hidden or blocked and no unauthorized update is performed.",
        "Permission",
        "Access Control",
        "AUTO-PERM"
      );
    }

    if (!typeSet.has("UI") && hasUiSignal(text)) {
      add(
        "UI visibility and state",
        "the stated screen displays the correct controls, labels, messages, and action states",
        "The UI matches the requirement and only supported controls are visible or enabled.",
        "UI",
        analysis.module,
        "AUTO-UI"
      );
    }

    return rows.concat(additions);
  }

  function generateFromRequirementLocal(input, options, existingAnalysis) {
    const analysis = existingAnalysis || analyzeRequirement(input, options);
    const rows = [];

    analysis.points.forEach((point, index) => {
      const scenario = scenarioFromPoint(point.text, index);
      const primaryType = shouldAddNegative(point.text) ? "Negative" : "Positive";
      const action = primaryType === "Negative" ? negativeActionFromPoint(point.text) : actionFromPoint(point.text);
      const module = moduleFromPoint(point.text, analysis.module);
      const sourceRef = point.id;

      rows.push(
        buildRow({
          storyId: analysis.storyId,
          module,
          scenario: primaryType === "Negative" ? `${scenario} - restricted behavior` : scenario,
          action,
          expected: expectedFromPoint(point.text, primaryType),
          type: primaryType,
          style: options.style,
          sourceRef,
        })
      );

      if (hasPermissionSignal(point.text)) {
        rows.push(
          buildRow({
            storyId: analysis.storyId,
            module,
            scenario: "Permission based behavior",
            action: permissionActionFromPoint(point.text),
            expected: "The action is available only for users with the required permission and blocked for unauthorized users.",
            type: "Permission",
            style: options.style,
            sourceRef,
          })
        );
      }

      if (hasUiSignal(point.text)) {
        rows.push(
          buildRow({
            storyId: analysis.storyId,
            module,
            scenario: "UI visibility and state",
            action: uiActionFromPoint(point.text),
            expected: "The stated labels, controls, modal content, and enabled or disabled states are displayed correctly.",
            type: "UI",
            style: options.style,
            sourceRef,
          })
        );
      }
    });

    const addedRows = options.addMissing ? buildRequirementCoverage(analysis, input, options) : [];
    return {
      mode: "requirement",
      engine: "rules",
      engineLabel: "Local rule engine",
      analysis,
      rows: rows.concat(addedRows),
      generatedCount: rows.length,
      addedCount: addedRows.length,
      summaryNotes: [],
    };
  }

  function rewriteExistingTestcasesLocal(input, options) {
    const parsed = parseExistingRows(input, options);
    const rows = parsed.map((row, index) =>
      buildRow({
        storyId: row.storyId,
        module: row.module,
        scenario: row.scenario,
        action: row.testCase,
        expected: row.expectedResult,
        type: row.type || inferType(row.testCase + " " + row.expectedResult),
        style: options.style,
        status: row.status,
        sourceRef: `ROW-${String(index + 1).padStart(2, "0")}`,
      })
    );

    return {
      mode: "testcase",
      engine: "rules",
      engineLabel: "Local rule engine",
      analysis: {
        storyId: options.storyId || "REQ-001",
        module: options.moduleName || "QA Validation",
        points: parsed.map((row, index) => ({ id: `ROW-${index + 1}`, text: row.testCase })),
      },
      rows,
      generatedCount: rows.length,
      addedCount: 0,
      summaryNotes: [],
    };
  }

  function analyzeRequirement(input, options) {
    const storyId = options.storyId || extractStoryId(input) || "REQ-001";
    const module = options.moduleName || extractNamedValue(input, "module") || inferModule(input) || "Requirement Validation";
    const points = extractRequirementPoints(input);

    return {
      storyId,
      module,
      points: points.length > 0 ? points : [{ id: "REQ-01", text: summarizeRequirement(input) }],
    };
  }

  function extractRequirementPoints(input) {
    const lines = getLines(input);
    const points = [];

    lines.forEach((line) => {
      const cleaned = cleanRequirementLine(line);
      if (!cleaned || isHeadingOnly(cleaned)) return;

      const acMatch = cleaned.match(/^(AC[-\s]?\d+|Acceptance Criteria\s*\d*|Scenario\s*\d*|Rule\s*\d*)[:.)-]\s*(.+)$/i);
      const numberedMatch = cleaned.match(/^(\d+)[.)]\s+(.+)$/);
      const bulletMatch = cleaned.match(/^[-*]\s+(.+)$/);

      if (acMatch) {
        points.push({ id: normalizePointId(acMatch[1], points.length + 1), text: acMatch[2].trim() });
      } else if (numberedMatch) {
        points.push({ id: `AC-${numberedMatch[1].padStart(2, "0")}`, text: numberedMatch[2].trim() });
      } else if (bulletMatch) {
        points.push({ id: `REQ-${String(points.length + 1).padStart(2, "0")}`, text: bulletMatch[1].trim() });
      } else if (looksLikeRequirementPoint(cleaned)) {
        points.push({ id: `REQ-${String(points.length + 1).padStart(2, "0")}`, text: cleaned });
      }
    });

    if (points.length === 0) {
      splitSentences(input).forEach((sentence, index) => {
        if (looksLikeRequirementPoint(sentence)) {
          points.push({ id: `REQ-${String(index + 1).padStart(2, "0")}`, text: sentence });
        }
      });
    }

    return points.slice(0, 50);
  }

  function buildRequirementCoverage(analysis, input, options) {
    const text = input.toLowerCase();
    const rows = [];
    const add = (scenario, action, expected, type, moduleHint, sourceRef) => {
      rows.push(
        buildRow({
          storyId: analysis.storyId,
          module: moduleHint || analysis.module,
          scenario,
          action,
          expected,
          type,
          style: options.style,
          sourceRef,
        })
      );
    };

    if (!hasAnyType(analysis.points, ["cannot", "blocked", "invalid", "without", "unauthorized", "error", "fail"])) {
      add(
        "Negative condition handling",
        "the stated action is blocked when the required condition is not satisfied",
        "The system prevents the action and keeps existing data unchanged.",
        "Negative",
        analysis.module,
        "NEG-01"
      );
    }

    if (hasUiSignal(text)) {
      add(
        "UI state validation",
        "the stated screen displays the correct controls, labels, messages, and action states",
        "The UI matches the requirement and only supported controls are visible or enabled.",
        "UI",
        analysis.module,
        "UI-01"
      );
    }

    if (hasPermissionSignal(text)) {
      add(
        "Unauthorized access prevention",
        "a user without the required permission cannot view or execute restricted actions",
        "Restricted actions are hidden or blocked and no unauthorized update is performed.",
        "Permission",
        "Access Control",
        "PERM-01"
      );
    }

    if (containsAny(text, ["quick move", "quickmove"])) {
      add(
        "Quick Move source action",
        "Quick Move can be opened from each eligible department, location, group, or device overflow menu",
        "The Quick Move modal opens with the selected source context retained.",
        "Positive",
        "Inventory Tree View",
        "QM-01"
      );
      add(
        "Quick Move destination validation",
        "Quick Move cannot be completed for same source, invalid, or ineligible destination selections",
        "The move is blocked and the inventory remains under the original source.",
        "Negative",
        "Inventory Tree View",
        "QM-02"
      );
      add(
        "Quick Move completion reflection",
        "inventory is reflected under the selected destination after a successful Quick Move",
        "The tree refreshes and displays the inventory in the new valid location.",
        "Functional",
        "Inventory Tree View",
        "QM-03"
      );
    }

    if (containsAny(text, ["add child", "child location", "addchild"])) {
      add(
        "Add Child eligible parent",
        "Add Child can be opened from an eligible parent department or location",
        "The Add Child flow opens with the selected parent context.",
        "Positive",
        "Location Management",
        "CHILD-01"
      );
      add(
        "Add Child restricted parent",
        "Add Child is blocked for an ineligible parent or unauthorized user",
        "The action is hidden or blocked and no child location is created.",
        "Negative",
        "Location Management",
        "CHILD-02"
      );
    }

    if (containsAny(text, ["delete", "remove"])) {
      add(
        "Delete eligible record",
        "the user can delete the record only when all delete conditions are satisfied",
        "The record is removed from the list or tree and unrelated records remain unchanged.",
        "Positive",
        analysis.module,
        "DEL-01"
      );
      add(
        "Delete blocked record",
        "the user cannot delete the record when child records, devices, inventory, or dependencies exist",
        "The delete action is blocked and the original record remains available.",
        "Negative",
        analysis.module,
        "DEL-02"
      );
    }

    if (!options.strictMode && containsAny(text, ["form", "field", "save", "create", "edit"])) {
      add(
        "Required field validation",
        "the user cannot save the form when mandatory fields are blank",
        "The form remains open and displays validation for missing mandatory fields.",
        "Negative",
        analysis.module,
        "FORM-01"
      );
    }

    return rows;
  }

  function buildRow({
    storyId,
    module,
    scenario,
    action,
    expected,
    type,
    style,
    status = "Ready",
    sourceRef,
    preserveTitle = false,
  }) {
    const normalizedType = normalizeType(type);
    return {
      id: "",
      storyId: cleanText(storyId) || "REQ-001",
      module: cleanText(module) || inferModule(action) || "Requirement Validation",
      scenario: styleScenario(scenario || inferScenario(action), style),
      testCase: preserveTitle
        ? enforceStyleTitle(cleanText(action), normalizedType, style)
        : styleTestCase(action, normalizedType, style),
      expectedResult: styleExpectedResult(expected, normalizedType, style),
      type: normalizedType,
      status: cleanText(status) || "Ready",
      sourceRef,
    };
  }

  function enforceStyleTitle(value, type, style) {
    if (!value) return styleTestCase("complete the stated action", type, style);
    if (/^Verify\b/i.test(value)) return value;
    return styleTestCase(value, type, style);
  }

  function parseExistingRows(input, options) {
    const lines = getLines(input);
    const headerMap = detectHeader(lines[0]);
    const dataLines = headerMap ? lines.slice(1) : lines;

    return dataLines.map((line) => {
      const cells = splitRow(line);
      if (cells.length >= 4) {
        return parseStructuredRow(cells, headerMap, options);
      }
      return {
        storyId: options.storyId || extractStoryId(line) || "REQ-001",
        module: options.moduleName || inferModule(line) || "QA Validation",
        scenario: inferScenario(line),
        testCase: line,
        expectedResult: "",
        type: inferType(line),
        status: "Ready",
      };
    });
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
    if (!line) return null;
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
        storyId: readByHeader(cells, headerMap, ["userstoryid", "storyid", "requirementid"]) || options.storyId || "REQ-001",
        module: readByHeader(cells, headerMap, ["module"]) || options.moduleName || "QA Validation",
        scenario: readByHeader(cells, headerMap, ["scenario", "coveragearea"]) || "",
        testCase: readByHeader(cells, headerMap, ["testcase", "testcasename", "title"]) || "",
        expectedResult: readByHeader(cells, headerMap, ["expectedresult", "expected"]) || "",
        type: readByHeader(cells, headerMap, ["type"]) || "",
        status: readByHeader(cells, headerMap, ["status"]) || "Ready",
      };
    }

    return {
      storyId: cells[0] || options.storyId || "REQ-001",
      module: cells[1] || options.moduleName || "QA Validation",
      scenario: cells[2] || "",
      testCase: cells[3] || cells[2] || "",
      expectedResult: cells[4] || "",
      type: cells[5] || "",
      status: cells[6] || "Ready",
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

  function getLines(value) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function cleanRequirementLine(line) {
    return line
      .replace(/\u2022/g, "-")
      .replace(/^#+\s*/, "")
      .replace(/^(Given|When|Then|And)\s+/i, "")
      .trim();
  }

  function isHeadingOnly(line) {
    return /^(requirement|acceptance criteria|business rules?|scope|notes?|description|user story|module)\s*:?\s*$/i.test(line);
  }

  function looksLikeRequirementPoint(line) {
    if (line.length < 14) return false;
    return /\b(can|cannot|should|shall|must|need|needs|display|show|hide|allow|prevent|block|open|create|update|delete|move|search|select|validate|refresh|save|cancel)\b/i.test(line);
  }

  function splitSentences(input) {
    return input
      .replace(/\r?\n/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }

  function summarizeRequirement(input) {
    return splitSentences(input)[0] || input.slice(0, 220);
  }

  function normalizePointId(value, fallback) {
    const digits = String(value).match(/\d+/)?.[0];
    return digits ? `AC-${digits.padStart(2, "0")}` : `AC-${String(fallback).padStart(2, "0")}`;
  }

  function extractStoryId(input) {
    return (
      input.match(/\b[A-Z]{1,8}-\d{2,8}\b/)?.[0] ||
      input.match(/\b(?:story|requirement|user story)\s*[:#-]\s*([A-Z0-9-]{3,})/i)?.[1] ||
      ""
    );
  }

  function extractNamedValue(input, label) {
    const regex = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "im");
    return input.match(regex)?.[1]?.trim() || "";
  }

  function scenarioFromPoint(point, index) {
    const lower = point.toLowerCase();
    if (containsAny(lower, ["quick move", "quickmove"])) return "Quick Move behavior";
    if (containsAny(lower, ["add child", "child location"])) return "Add Child behavior";
    if (containsAny(lower, ["delete", "remove"])) return "Delete behavior";
    if (hasPermissionSignal(point)) return "Permission behavior";
    if (hasUiSignal(point)) return "UI behavior";
    if (shouldAddNegative(point)) return "Validation and blocked behavior";
    return `Requirement behavior ${String(index + 1).padStart(2, "0")}`;
  }

  function actionFromPoint(point) {
    const text = stripRequirementPrefix(point);
    const lower = text.toLowerCase();
    if (lower.includes("cannot ")) return removeCannot(text);
    if (lower.includes(" can ")) return text.replace(/^.*?\bcan\s+/i, "");
    if (lower.includes(" should ")) return text.replace(/^.*?\bshould\s+/i, "");
    if (lower.includes(" must ")) return text.replace(/^.*?\bmust\s+/i, "");
    if (lower.includes(" shall ")) return text.replace(/^.*?\bshall\s+/i, "");
    return text;
  }

  function negativeActionFromPoint(point) {
    const action = actionFromPoint(point);
    if (/^(be |is |are )/i.test(action)) return action;
    return action.replace(/^not\s+/i, "");
  }

  function permissionActionFromPoint(point) {
    const authority = point.match(/\bCAN_[A-Z0-9_]+\b/)?.[0] || "the required permission";
    return `access the stated action only when assigned ${authority}`;
  }

  function uiActionFromPoint(point) {
    const lower = point.toLowerCase();
    if (containsAny(lower, ["modal", "popup"])) return "view the correct modal content and available actions";
    if (containsAny(lower, ["button", "menu", "dropdown"])) return "view the correct action controls and states";
    return "view the correct requirement-driven UI behavior";
  }

  function expectedFromPoint(point, type) {
    const lower = point.toLowerCase();
    if (type === "Negative") {
      if (containsAny(lower, ["same", "invalid", "ineligible"])) {
        return "The system blocks the action and keeps the original data unchanged.";
      }
      return "The system prevents the restricted or invalid action and displays the correct blocked state.";
    }
    if (hasPermissionSignal(point)) {
      return "Only users with the required permission can access or execute the stated behavior.";
    }
    if (hasUiSignal(point)) {
      return "The stated UI element, modal, control, label, or message is displayed with the correct state.";
    }
    if (containsAny(lower, ["refresh", "updated", "display", "shown", "reflect"])) {
      return "The updated information is displayed correctly in the relevant screen.";
    }
    return "The stated behavior is completed successfully and the expected result is displayed.";
  }

  function styleScenario(value, style) {
    const clean = sentenceCase(value || "Functional validation").replace(/\.$/, "");
    if (style === "professional") return clean;
    if (style === "yuv") return clean;
    if (style === "compact") return clean;
    return clean;
  }

  function styleTestCase(value, type, style) {
    const clean = stripStarter(value);
    const action = clean.charAt(0).toLowerCase() + clean.slice(1);

    if (style === "professional") {
      if (type === "Negative") return `Verify that the system prevents the user from ${removeCannot(action)}`;
      if (type === "Permission") return `Verify that the system enforces permission rules for ${removeCan(action)}`;
      return `Verify that the system allows the user to ${removeCan(action)}`;
    }

    if (style === "yuv") {
      if (type === "UI") return `Verify that the page displays the correct UI state for ${removeCan(action)}`;
      if (type === "Negative") return `Verify that the user is blocked when trying to ${removeCannot(action)}`;
      if (type === "Permission") return `Verify that permission-based access is handled correctly for ${removeCan(action)}`;
      return `Verify that the user can complete ${removeCan(action)}`;
    }

    if (style === "compact") {
      if (type === "Negative") return `Verify blocked behavior for ${removeCannot(action)}`;
      return `Verify ${removeCan(action)}`;
    }

    if (type === "Negative") return `Verify that the user cannot ${removeCannot(action)}`;
    if (type === "Permission") return `Verify that the user has correct permission behavior for ${removeCan(action)}`;
    if (type === "UI") return `Verify that the user can view the correct UI state for ${removeCan(action)}`;
    return `Verify that the user can ${removeCan(action)}`;
  }

  function styleExpectedResult(value, type, style) {
    const clean = sentenceCase(value || inferExpected(type));
    if (style === "compact" || style === "robert") {
      return clean.replace(/^The system should /, "").replace(/^System should /, "");
    }
    return clean;
  }

  function stripRequirementPrefix(value) {
    return cleanText(value)
      .replace(/^(As an?|I want|So that)\b.*?,?\s*/i, "")
      .replace(/^User\s+/i, "")
      .replace(/^The user\s+/i, "")
      .replace(/^System\s+/i, "")
      .replace(/^The system\s+/i, "")
      .trim();
  }

  function stripStarter(value) {
    return sentenceCase(value || "complete the stated action")
      .replace(/^Verify that the user can\s+/i, "")
      .replace(/^Verify that the user cannot\s+/i, "")
      .replace(/^Verify user can\s+/i, "")
      .replace(/^Verify user cannot\s+/i, "")
      .replace(/^Verify that the system allows the user to\s+/i, "")
      .replace(/^Verify that the system prevents the user from\s+/i, "")
      .replace(/^Verify that\s+/i, "")
      .replace(/^User can\s+/i, "")
      .replace(/^User cannot\s+/i, "")
      .replace(/\.$/, "")
      .trim();
  }

  function removeCan(value) {
    return cleanText(value)
      .replace(/^user can\s+/i, "")
      .replace(/^can\s+/i, "")
      .replace(/^complete\s+complete\s+/i, "complete ")
      .replace(/^to\s+/i, "")
      .trim();
  }

  function removeCannot(value) {
    return cleanText(value)
      .replace(/^user cannot\s+/i, "")
      .replace(/^cannot\s+/i, "")
      .replace(/^not\s+/i, "")
      .replace(/^to\s+/i, "")
      .trim();
  }

  function inferExpected(type) {
    if (type === "Negative") return "The system should prevent the action and keep the existing data unchanged.";
    if (type === "Permission") return "The system should allow only authorized behavior and prevent unauthorized updates.";
    if (type === "UI") return "The expected controls, labels, messages, and states should be displayed correctly.";
    return "The system should complete the action successfully and display the correct result.";
  }

  function inferScenario(value) {
    const text = cleanText(value).toLowerCase();
    if (containsAny(text, ["quick move", "quickmove"])) return "Quick Move action";
    if (containsAny(text, ["add child", "child location"])) return "Add Child location";
    if (containsAny(text, ["delete", "remove"])) return "Delete action";
    if (hasPermissionSignal(text)) return "Permission behavior";
    if (hasUiSignal(text)) return "UI behavior";
    if (shouldAddNegative(text)) return "Validation behavior";
    return "Functional validation";
  }

  function inferModule(value) {
    const text = cleanText(value).toLowerCase();
    if (containsAny(text, ["quick move", "inventory", "device", "group", "tree"])) return "Inventory Tree View";
    if (containsAny(text, ["location", "department", "add child", "delete"])) return "Location Management";
    if (containsAny(text, ["search", "filter", "list", "grid", "table"])) return "List View";
    if (containsAny(text, ["login", "permission", "role", "authority", "unauthorized"])) return "Access Control";
    return "";
  }

  function moduleFromPoint(point, fallback) {
    return inferModule(point) || fallback || "Requirement Validation";
  }

  function inferType(value) {
    const text = cleanText(value).toLowerCase();
    if (hasPermissionSignal(text)) return "Permission";
    if (shouldAddNegative(text)) return "Negative";
    if (hasUiSignal(text)) return "UI";
    return "Positive";
  }

  function normalizeType(value) {
    const text = cleanText(value).toLowerCase();
    if (text.includes("negative")) return "Negative";
    if (text.includes("permission")) return "Permission";
    if (text.includes("edge")) return "Edge";
    if (text === "ui" || text.includes("ui")) return "UI";
    if (text.includes("functional")) return "Functional";
    if (text.includes("positive")) return "Positive";
    return inferType(text);
  }

  function shouldAddNegative(value) {
    return containsAny(cleanText(value).toLowerCase(), [
      "cannot",
      "should not",
      "must not",
      "shall not",
      "blocked",
      "invalid",
      "ineligible",
      "without",
      "unauthorized",
      "error",
      "fail",
      "missing",
      "blank",
      "same as",
      "not eligible",
      "no devices",
      "has devices",
      "has children",
      "dependent",
    ]);
  }

  function hasPermissionSignal(value) {
    return /\bCAN_[A-Z0-9_]+\b/.test(String(value)) || containsAny(cleanText(value).toLowerCase(), [
      "permission",
      "authority",
      "role",
      "unauthorized",
      "access",
      "with permission",
      "without permission",
    ]);
  }

  function hasUiSignal(value) {
    return containsAny(cleanText(value).toLowerCase(), [
      "ui",
      "visible",
      "display",
      "show",
      "hide",
      "button",
      "menu",
      "dropdown",
      "modal",
      "popup",
      "screen",
      "page",
      "label",
      "message",
      "toast",
      "enabled",
      "disabled",
      "tree",
      "search",
      "cancel",
    ]);
  }

  function hasAnyType(points, terms) {
    const text = points.map((point) => point.text).join(" ").toLowerCase();
    return containsAny(text, terms);
  }

  function dedupe(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.module}|${row.scenario}|${row.testCase}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildSummary(result, finalRows, options) {
    const duplicateCount = result.duplicateCount || result.rows.length - finalRows.length;
    const sourceCount = result.analysis.points.length;
    const summary = [];

    if (result.mode === "requirement") {
      summary.push(
        `Read ${sourceCount} requirement point(s) and generated ${finalRows.length} testcase row(s) in ${labelForStyle(options.style)} style.`
      );
      summary.push(`Generation engine: ${result.engineLabel}.`);
      summary.push(`Mapped output to story ${result.analysis.storyId} and module ${result.analysis.module}.`);
      summary.push("Generated requirement-traceable positive, negative, UI, permission, functional, and edge rows where supported by the requirement.");
    } else {
      summary.push(`Rewrote ${finalRows.length} existing testcase row(s) in ${labelForStyle(options.style)} style.`);
      summary.push(`Generation engine: ${result.engineLabel}.`);
    }

    if (result.addedCount > 0) {
      summary.push(`Added ${result.addedCount} supported coverage row(s) from requirement signals.`);
    }

    for (const note of result.summaryNotes || []) {
      if (note) summary.push(note);
    }

    if (options.strictMode) {
      summary.push("Requirement-only guard was enabled, so unsupported random scenario families were avoided.");
    }

    if (duplicateCount > 0) {
      summary.push(`Removed ${duplicateCount} duplicate or near-duplicate row(s).`);
    }

    summary.push("Output is ready to copy as TSV or export as CSV for Excel.");
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
        '<tr><td colspan="8" class="empty-state">Paste a requirement and generate to see testcases.</td></tr>';
      elements.outputSubtitle.textContent = "No output yet.";
      return;
    }

    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      [row.id, row.storyId, row.module, row.scenario, row.testCase, row.expectedResult, row.type, row.status].forEach(
        (value, index) => {
          const td = document.createElement("td");
          td.textContent = value;
          if (index === 6) td.className = `type-${String(value).toLowerCase()}`;
          tr.appendChild(td);
        }
      );
      fragment.appendChild(tr);
    });

    elements.resultBody.appendChild(fragment);
    elements.outputSubtitle.textContent = `${rows.length} testcase row(s) generated in ${labelForStyle(elements.styleSelect.value)} style.`;
  }

  function renderSummary(items) {
    elements.summaryList.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      elements.summaryList.appendChild(li);
    });
  }

  function setBusy(isBusy) {
    elements.generateButton.disabled = isBusy;
    elements.generateButton.textContent = isBusy ? "Generating..." : "Generate Testcases";
  }

  function setStatus(message, state) {
    elements.statusBanner.textContent = message;
    elements.statusBanner.className = "status-banner";
    if (state === "working") elements.statusBanner.classList.add("is-working");
    if (state === "error") elements.statusBanner.classList.add("is-error");
    if (state === "success") elements.statusBanner.classList.add("is-success");
  }

  function toTsv(rows) {
    return [COLUMNS.join("\t")]
      .concat(
        rows.map((row) =>
          [row.id, row.storyId, row.module, row.scenario, row.testCase, row.expectedResult, row.type, row.status].join(
            "\t"
          )
        )
      )
      .join("\n");
  }

  function toCsv(rows) {
    return [COLUMNS.map(csvEscape).join(",")]
      .concat(
        rows.map((row) =>
          [row.id, row.storyId, row.module, row.scenario, row.testCase, row.expectedResult, row.type, row.status]
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
    link.download = "generated-testcases.csv";
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
    const text = cleanText(value).toLowerCase();
    return terms.some((term) => text.includes(term));
  }

  function sentenceCase(value) {
    const text = cleanText(value);
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function formatId(number) {
    return `TC_${String(number).padStart(3, "0")}`;
  }
})();
